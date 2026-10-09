import { buildTrainingZipFromImageUrls } from "@/lib/buildTrainingZip";
import {
  buildTriggerPhrase,
  kickoffPortraitTraining,
  pipelineMode,
  startPipelineFromPhotos,
} from "@/lib/falPipeline";
import { buildIdentityProfile, IdentityProfile } from "@/lib/identityPrep";
import { alertOperator, sendOrderConfirmation } from "@/lib/notify";
import { SELFIE_MIN } from "@/lib/site";
import { Database, Json } from "@/types/supabase";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

const trainingBucket =
  process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

export function deploymentOrigin(): string {
  const raw = process.env.DEPLOYMENT_URL?.trim();
  if (!raw) {
    throw new Error("DEPLOYMENT_URL is required");
  }
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
}

function adminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export type StartOrderResult =
  | { ok: true; modelId: number; alreadyStarted: boolean }
  | { ok: false; message: string; modelId?: number };

/**
 * Start a `pending_payment` order: build the training archive and submit the
 * portrait trainer.
 *
 * Two callers can race here for the same order (the browser returning from
 * Stripe and Stripe's webhook), so the order is CLAIMED with a conditional
 * update first — only the caller that flips pending_payment → queued goes on
 * to spend money on training. If anything after the claim fails, the order is
 * marked failed and the operator is emailed, because by then the customer has
 * paid (or been comped) and must not be left waiting silently.
 */
export async function startOrder(args: {
  modelId: number;
  userId: string;
  /** How the order was authorised, recorded on the order for the operator. */
  source: "stripe" | "comp";
  paymentReference?: string | null;
}): Promise<StartOrderResult> {
  const { modelId, userId } = args;
  const admin = adminClient();

  const { data: claimed, error: claimErr } = await admin
    .from("models")
    .update({ status: "queued" })
    .eq("id", modelId)
    .eq("user_id", userId)
    .eq("status", "pending_payment")
    .select("*");

  if (claimErr) {
    console.error("[startOrder] claim failed", { modelId, claimErr });
    return { ok: false, message: "Could not start the order", modelId };
  }

  const model = claimed?.[0];
  if (!model) {
    // Not pending: either the other caller already claimed it (fine) or it
    // does not exist / belongs to someone else.
    const { data: existing } = await admin
      .from("models")
      .select("id, status")
      .eq("id", modelId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      console.log("[startOrder] already started", { modelId, status: existing.status });
      return { ok: true, modelId, alreadyStarted: true };
    }
    return { ok: false, message: "Order not found" };
  }

  const po =
    model.prompt_options && typeof model.prompt_options === "object" && !Array.isArray(model.prompt_options)
      ? (model.prompt_options as Record<string, unknown>)
      : {};
  const customerName = typeof po.name === "string" ? po.name : null;

  const fail = async (message: string, detail?: unknown): Promise<StartOrderResult> => {
    console.error("[startOrder] failed after claim", { modelId, message, detail });
    await admin.from("models").update({ status: "failed" }).eq("id", modelId).eq("user_id", userId);
    await admin.from("pipeline_events").insert({
      user_id: userId,
      model_id: modelId,
      stage: "system",
      event_type: "error",
      message: `Order could not start: ${message}`,
      payload: { source: args.source, paymentReference: args.paymentReference ?? null } as Json,
      request_id: null,
    });
    await alertOperator({
      subject: `Order #${modelId} is ${args.source === "stripe" ? "PAID" : "authorised"} but did not start`,
      lines: [
        `Reason: ${message}`,
        args.source === "stripe"
          ? "The customer has been charged. Restart the order by hand or refund it."
          : "This was a comp order.",
        ...(args.paymentReference ? [`Stripe session: ${args.paymentReference}`] : []),
      ],
      modelId,
    });
    return { ok: false, message, modelId };
  };

  if (!process.env.FAL_KEY) {
    return fail("FAL_KEY is not configured");
  }

  const images = (Array.isArray(po.selfie_urls) ? po.selfie_urls : []).filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
  if (images.length < Math.min(SELFIE_MIN, 4)) {
    return fail("Stored photos are missing or incomplete");
  }

  try {
    const triggerPhrase =
      process.env.FAL_TRIGGER_PHRASE?.trim() || buildTriggerPhrase(userId, modelId);

    // Look at the photos once: face crops, captions and a description of the
    // person. Fails open — a null profile trains on the photos as uploaded.
    let identity: IdentityProfile | null = null;
    try {
      identity = await buildIdentityProfile({ selfieUrls: images, userId, modelId });
    } catch (e) {
      console.error("[startOrder] identity analysis failed (continuing without it)", e);
    }

    if (pipelineMode() === "photo") {
      // Photo-first: no training. Portraits start from the customer's real
      // photos, so the order is ready for review in minutes.
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const email = userData.user?.email ?? null;
      const nextPo = {
        ...po,
        ...(identity ? { identity } : {}),
        pipeline_mode: "photo",
        order_source: args.source,
        payment_reference: args.paymentReference ?? null,
        started_at: new Date().toISOString(),
      };
      await admin
        .from("models")
        .update({ user_email: email, prompt_options: nextPo as Json })
        .eq("id", modelId)
        .eq("user_id", userId);
      const { data: fresh } = await admin.from("models").select("*").eq("id", modelId).single();
      if (!fresh) return fail("Order could not be reloaded");
      await startPipelineFromPhotos(fresh);

      const { error: samplesError } = await admin
        .from("samples")
        .insert(images.map((uri: string) => ({ modelId, uri })));
      if (samplesError) {
        console.error("[startOrder] samples insert failed (non-fatal)", samplesError);
      }
      if (email) {
        await sendOrderConfirmation({ to: email, customerName, modelId });
      }
      return { ok: true, modelId, alreadyStarted: false };
    }

    const zipBuffer = await buildTrainingZipFromImageUrls(images, {
      profile: identity,
      trigger: triggerPhrase,
    });

    const zipPath = `${userId}/${modelId}/training_${Date.now()}.zip`;
    const { error: uploadError } = await admin.storage
      .from(trainingBucket)
      .upload(zipPath, zipBuffer, { contentType: "application/zip", upsert: false });
    if (uploadError) {
      return fail("Could not upload the training archive", uploadError.message);
    }

    const { data: publicUrlData } = admin.storage.from(trainingBucket).getPublicUrl(zipPath);

    let requestId = "";
    try {
      requestId = await kickoffPortraitTraining({
        userId,
        modelId,
        imagesDataUrl: publicUrlData.publicUrl,
        triggerPhrase,
      });
    } catch (e) {
      await admin.storage.from(trainingBucket).remove([zipPath]);
      return fail("Could not start training", e instanceof Error ? e.message : String(e));
    }

    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const email = userData.user?.email ?? null;

    await admin
      .from("models")
      .update({
        modelId: requestId,
        status: "training",
        user_email: email,
        prompt_options: {
          ...po,
          ...(identity ? { identity } : {}),
          order_source: args.source,
          payment_reference: args.paymentReference ?? null,
          started_at: new Date().toISOString(),
        } as Json,
      })
      .eq("id", modelId)
      .eq("user_id", userId);

    const { error: samplesError } = await admin
      .from("samples")
      .insert(images.map((uri: string) => ({ modelId, uri })));
    if (samplesError) {
      // Training is already running; the sample rows only feed the order page.
      console.error("[startOrder] samples insert failed (non-fatal)", samplesError);
    }

    if (email) {
      await sendOrderConfirmation({ to: email, customerName, modelId });
    }

    return { ok: true, modelId, alreadyStarted: false };
  } catch (e) {
    return fail("Order start failed", e instanceof Error ? e.message : String(e));
  }
}

/** After Stripe checkout succeeds: start the order named in the session metadata. */
export async function runTrainingAfterPaidCheckout(
  session: Stripe.Checkout.Session
): Promise<StartOrderResult> {
  if (session.payment_status !== "paid") {
    return { ok: false, message: "Payment not completed" };
  }

  const modelIdRaw = session.metadata?.modelId;
  const userId = session.metadata?.userId;
  if (!modelIdRaw || !userId) {
    return { ok: false, message: "Missing checkout metadata" };
  }

  const modelId = Number(modelIdRaw);
  if (!Number.isFinite(modelId) || modelId <= 0) {
    return { ok: false, message: "Invalid order id" };
  }

  return startOrder({ modelId, userId, source: "stripe", paymentReference: session.id });
}
