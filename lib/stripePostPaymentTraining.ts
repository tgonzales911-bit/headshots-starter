import { buildTrainingZipFromImageUrls } from "@/lib/buildTrainingZip";
import { buildTriggerPhrase, kickoffPortraitTraining } from "@/lib/falPipeline";
import { Database } from "@/types/supabase";
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

/**
 * After Stripe checkout succeeds: upload ZIP, kick off portrait trainer (same as pre-payment train-model flow).
 * Spec mentioned submitBaseGeneration; this app requires LoRA from the trainer first, so we call kickoffPortraitTraining.
 */
export async function runTrainingAfterPaidCheckout(
  session: Stripe.Checkout.Session
): Promise<{ ok: true } | { ok: false; message: string }> {
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
    return { ok: false, message: "Invalid model id" };
  }

  const admin = adminClient();

  const { data: model, error: modelErr } = await admin
    .from("models")
    .select("*")
    .eq("id", modelId)
    .eq("user_id", userId)
    .single();

  if (modelErr || !model) {
    return { ok: false, message: "Model not found" };
  }

  if (model.status !== "pending_payment") {
    console.log("[stripePostPaymentTraining] skip duplicate run", { modelId, status: model.status });
    return { ok: true };
  }

  const po =
    model.prompt_options && typeof model.prompt_options === "object" && !Array.isArray(model.prompt_options)
      ? (model.prompt_options as Record<string, unknown>)
      : {};

  if (!process.env.FAL_KEY) {
    return { ok: false, message: "FAL_KEY is not configured" };
  }

  const selfieUrls = po.selfie_urls;
  if (!Array.isArray(selfieUrls) || selfieUrls.length < 4) {
    return { ok: false, message: "Invalid stored training images" };
  }
  const images = selfieUrls.filter((u): u is string => typeof u === "string" && u.length > 0);
  if (images.length < 4) {
    return { ok: false, message: "Invalid stored training images" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { ok: false, message: "Server configuration error" };
  }

  try {
    const zipBuffer = await buildTrainingZipFromImageUrls(images);

    const zipPath = `${userId}/${modelId}/training_${Date.now()}.zip`;
    const { error: uploadError } = await admin.storage
      .from(trainingBucket)
      .upload(zipPath, zipBuffer, {
        contentType: "application/zip",
        upsert: false,
      });

    if (uploadError) {
      console.error("[stripePostPaymentTraining] upload", uploadError);
      return { ok: false, message: "Could not upload training archive" };
    }

    const { data: publicUrlData } = admin.storage.from(trainingBucket).getPublicUrl(zipPath);
    const imagesDataUrl = publicUrlData.publicUrl;

    const triggerPhrase =
      process.env.FAL_TRIGGER_PHRASE?.trim() || buildTriggerPhrase(userId, modelId);

    let requestId = "";
    try {
      requestId = await kickoffPortraitTraining({
        userId,
        modelId,
        imagesDataUrl,
        triggerPhrase,
      });
    } catch (e) {
      console.error("[stripePostPaymentTraining] kickoff", e);
      await admin.storage.from(trainingBucket).remove([zipPath]);
      return { ok: false, message: "Could not start training on Fal.ai" };
    }

    await admin
      .from("models")
      .update({ modelId: requestId, status: "training" })
      .eq("id", modelId)
      .eq("user_id", userId);

    const { error: samplesError } = await admin.from("samples").insert(
      images.map((uri: string) => ({
        modelId,
        uri,
      }))
    );

    if (samplesError) {
      console.error("[stripePostPaymentTraining] samples", samplesError);
      return { ok: false, message: "Could not save sample rows" };
    }

    return { ok: true };
  } catch (e) {
    console.error("[stripePostPaymentTraining]", e);
    return { ok: false, message: "Training start failed" };
  }
}
