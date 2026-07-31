import { PARALLEL_IMAGE_COUNT } from "@/lib/constants";
import {
  handleFalPipeline,
  judgeAndDeliver,
  submitFinalEditStage,
  type OrchestratorContext,
} from "@/lib/falPipeline";
import type { Database, Json } from "@/types/supabase";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type FalWebhookBody = {
  request_id?: string;
  status?: string;
  payload?: Record<string, unknown>;
  error?: string | null;
  metadata?: {
    modelId?: number;
    stage?: string;
    index?: number;
  };
};

type PipelineStage = "base_generation" | "final_edit";

const PARALLEL = PARALLEL_IMAGE_COUNT;

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

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/** Prefer Fal queue URL query `webhook_secret`; optional headers for proxies. */
function getProvidedWebhookSecret(request: Request, url: URL): string | null {
  return (
    request.headers.get("x-app-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    url.searchParams.get("webhook_secret")
  );
}

function parseStageMetadata(body: FalWebhookBody, url: URL): {
  modelId: number;
  stage: string;
  index: number | undefined;
} {
  const meta = body.metadata;
  const modelRaw = meta?.modelId ?? url.searchParams.get("model_id");
  const stageRaw = meta?.stage ?? url.searchParams.get("stage");
  const indexRaw = meta?.index ?? url.searchParams.get("index");

  const modelId = typeof modelRaw === "number" ? modelRaw : Number(modelRaw);
  const stage = typeof stageRaw === "string" ? stageRaw.trim() : String(stageRaw ?? "").trim();

  let index: number | undefined;
  if (indexRaw !== null && indexRaw !== undefined && indexRaw !== "") {
    const n = typeof indexRaw === "number" ? indexRaw : Number(indexRaw);
    if (Number.isFinite(n)) index = n;
  }

  return { modelId, stage, index };
}

function extractAllImageUrls(payload: Record<string, unknown> | undefined): string[] {
  if (!payload) return [];
  const images = payload.images;
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item === "object" && item !== null && "url" in item) {
        const u = (item as { url?: unknown }).url;
        return typeof u === "string" ? u.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
}

function extractImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const out = p.output;
  const fromOutput =
    out && typeof out === "object" && !Array.isArray(out) && "images" in out
      ? (out as Record<string, unknown>).images
      : undefined;
  const images = (Array.isArray(fromOutput) ? fromOutput : undefined) ?? p.images;
  if (!images || !Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (typeof first === "string") {
    const s = first.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof first === "object" && first !== null && "url" in first) {
    const u = (first as { url?: unknown }).url;
    if (typeof u === "string") {
      const s = u.trim();
      return s.length > 0 ? s : null;
    }
  }
  return null;
}

function resultsJsonToStrings(results: unknown, expected: number): string[] {
  if (!Array.isArray(results)) return [];
  return Array.from({ length: expected }, (_, i) => {
    const x = results[i];
    return typeof x === "string" && x.length > 0 ? x : "";
  });
}

async function insertPipelineEvent(
  supabase: SupabaseClient<Database>,
  args: {
    userId: string;
    modelId: number;
    stage: string;
    eventType: string;
    message?: string | null;
    requestId?: string | null;
    payload?: Record<string, unknown> | null;
  }
): Promise<void> {
  const { error } = await supabase.from("pipeline_events").insert({
    user_id: args.userId,
    model_id: args.modelId,
    stage: args.stage,
    event_type: args.eventType,
    message: args.message ?? null,
    request_id: args.requestId ?? null,
    payload: (args.payload ?? null) as Json | null,
  });
  if (error) {
    console.error("[pipeline-webhook] insert pipeline_events failed", error);
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let modelIdForCatch: number | null = null;
  let userIdForCatch: string | null = null;

  try {
    const expectedSecret = process.env.APP_WEBHOOK_SECRET;
    const provided = getProvidedWebhookSecret(request, url);

    console.log("[pipeline-webhook] received", {
      path: url.pathname,
      hasSecret: Boolean(provided && expectedSecret),
    });

    if (!expectedSecret || !provided || !constantTimeEqual(provided, expectedSecret)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as FalWebhookBody;
    const { modelId, stage, index } = parseStageMetadata(body, url);

    if (!Number.isFinite(modelId) || modelId <= 0) {
      console.error("[pipeline-webhook] invalid modelId", { modelId, stage });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    modelIdForCatch = modelId;

    const supabase = adminClient();

    const userIdFromUrl = url.searchParams.get("user_id");
    const { data: modelRow } = await supabase
      .from("models")
      .select("user_id")
      .eq("id", modelId)
      .maybeSingle();

    const userId = modelRow?.user_id ?? userIdFromUrl ?? null;
    userIdForCatch = userId;

    if (!userId) {
      console.error("[pipeline-webhook] cannot resolve user_id", { modelId });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const ok = String(body.status ?? "").toUpperCase() === "OK";

    if (!ok) {
      const errMsg =
        typeof body.error === "string" && body.error.trim()
          ? body.error.trim()
          : "Fal webhook returned non-OK status";
      console.error("[pipeline-webhook] ERROR status", { modelId, stage, errMsg });
      await insertPipelineEvent(supabase, {
        userId,
        modelId,
        stage: stage || "unknown",
        eventType: "webhook_error",
        message: errMsg,
        requestId: body.request_id ?? null,
        payload: { details: errMsg, payload: body.payload ?? null },
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Portrait trainer completion (still uses this URL; not part of the two edit stages).
    if (stage === "trainer") {
      const ctx: OrchestratorContext = {
        userId,
        modelId,
        webhookSecret: expectedSecret,
        stage: "trainer",
        incoming: {
          request_id: body.request_id,
          status: body.status,
          payload: body.payload,
          error: body.error ?? undefined,
        },
      };
      console.log("[pipeline-webhook] delegating trainer", { modelId });
      await handleFalPipeline(ctx);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (stage !== "base_generation" && stage !== "final_edit") {
      console.log("[pipeline-webhook] ignored stage", { modelId, stage });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const pipelineStage = stage as PipelineStage;

    if (pipelineStage === "base_generation") {
      const urls = extractAllImageUrls(body.payload);
      console.log("[pipeline-webhook] base_generation", { modelId, imageCount: urls.length });

      if (urls.length < PARALLEL) {
        const msg = `base_generation: expected ${PARALLEL} image URLs, got ${urls.length}`;
        console.error("[pipeline-webhook]", msg);
        await insertPipelineEvent(supabase, {
          userId,
          modelId,
          stage: "base_generation",
          eventType: "webhook_error",
          message: msg,
          requestId: body.request_id ?? null,
          payload: { details: msg },
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      const { data: fullModel } = await supabase.from("models").select("*").eq("id", modelId).single();
      if (!fullModel) {
        console.error("[pipeline-webhook] model not found for base_generation", { modelId });
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      const prevPo =
        fullModel.prompt_options && typeof fullModel.prompt_options === "object" && !Array.isArray(fullModel.prompt_options)
          ? { ...(fullModel.prompt_options as Record<string, unknown>) }
          : {};

      const { error: updErr } = await supabase
        .from("models")
        .update({
          prompt_options: {
            ...prevPo,
            base_image_urls: urls.slice(0, PARALLEL),
          } as Json,
        })
        .eq("id", modelId)
        .eq("user_id", userId);

      if (updErr) {
        console.error("[pipeline-webhook] base_generation update failed", updErr);
        await insertPipelineEvent(supabase, {
          userId,
          modelId,
          stage: "base_generation",
          eventType: "webhook_error",
          message: updErr.message,
          requestId: body.request_id ?? null,
          payload: { details: updErr.message },
        });
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      await insertPipelineEvent(supabase, {
        userId,
        modelId,
        stage: "base_generation",
        eventType: "completed",
        message: "Base generation images stored",
        requestId: body.request_id ?? null,
        payload: { base_image_urls_count: PARALLEL },
      });

      const { data: after } = await supabase.from("models").select("*").eq("id", modelId).single();
      if (after) {
        console.log("[pipeline-webhook] base_generation → submitFinalEditStage", { modelId });
        await submitFinalEditStage(after);
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // final_edit
    if (typeof index !== "number" || index < 0 || index >= PARALLEL) {
      const msg = `final_edit: invalid metadata.index (need 0..${PARALLEL - 1})`;
      console.error("[pipeline-webhook]", msg, { modelId, index });
      await insertPipelineEvent(supabase, {
        userId,
        modelId,
        stage: "final_edit",
        eventType: "webhook_error",
        message: msg,
        requestId: body.request_id ?? null,
        payload: { details: msg, index },
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const imageUrl = extractImageUrl(body.payload);
    if (!imageUrl) {
      let payloadShape: string;
      try {
        payloadShape = JSON.stringify(body.payload);
      } catch {
        payloadShape = "[unserializable payload]";
      }
      console.warn("[pipeline-webhook] final_edit: could not extract image URL", {
        modelId,
        index,
        payloadShape,
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    console.log("[pipeline-webhook] final_edit merge", { modelId, index, imageUrl: imageUrl.slice(0, 64) + "…" });

    const { data: modelForMerge } = await supabase
      .from("models")
      .select("user_id, status")
      .eq("id", modelId)
      .single();
    if (!modelForMerge?.user_id) {
      console.error("[pipeline-webhook] final_edit: could not load models.user_id", { modelId });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const pipelineComplete =
      modelForMerge.status === "finished" ||
      modelForMerge.status === "complete" ||
      modelForMerge.status === "needs_review";
    if (pipelineComplete) {
      console.log(
        "[pipeline-webhook] final_edit webhook received after completion, ignoring",
        { modelId, index }
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const { data: mergeData, error: mergeErr } = await supabase.rpc("merge_pipeline_indexed_result", {
      p_model_id: modelId,
      p_results_key: "final_edit_results",
      p_slot: index,
      p_expected: 4,
      p_url: imageUrl,
      p_user_id: modelForMerge.user_id,
    });

    if (mergeErr || !mergeData?.[0]) {
      const msg = mergeErr?.message ?? "merge_pipeline_indexed_result returned no row";
      console.error("[pipeline-webhook] merge failed", msg);
      await insertPipelineEvent(supabase, {
        userId,
        modelId,
        stage: "final_edit",
        eventType: "webhook_error",
        message: msg,
        requestId: body.request_id ?? null,
        payload: { details: msg, index },
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const row = mergeData[0];
    const filled = row.filled_count;
    const becameComplete = row.became_complete;

    console.log("[pipeline-webhook] final_edit merged", { modelId, filled, becameComplete });

    if (filled >= PARALLEL || becameComplete) {
      const { data: modelForDelivery } = await supabase.from("models").select("*").eq("id", modelId).single();
      if (!modelForDelivery) {
        console.error("[pipeline-webhook] model missing before deliverResults", { modelId });
      } else {
        const po =
          modelForDelivery.prompt_options &&
          typeof modelForDelivery.prompt_options === "object" &&
          !Array.isArray(modelForDelivery.prompt_options)
            ? (modelForDelivery.prompt_options as Record<string, unknown>)
            : {};
        const fromSlots = po.final_edit_results;
        let finalUrls = resultsJsonToStrings(fromSlots, PARALLEL).filter((u) => u.length > 0);
        if (finalUrls.length < PARALLEL) {
          finalUrls = resultsJsonToStrings(row.results, PARALLEL).filter((u) => u.length > 0);
        }

        if (finalUrls.length >= PARALLEL) {
          console.log("[pipeline-webhook] judgeAndDeliver", { modelId, count: finalUrls.length });
          await judgeAndDeliver(modelForDelivery, finalUrls.slice(0, PARALLEL));
        } else {
          console.error("[pipeline-webhook] incomplete final URLs after merge", {
            modelId,
            count: finalUrls.length,
          });
        }
      }
    }

    await insertPipelineEvent(supabase, {
      userId,
      modelId,
      stage: "final_edit",
      eventType: "webhook_received",
      message: `Final edit result ${index + 1}/4`,
      requestId: body.request_id ?? null,
      payload: { index, filled, becameComplete },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pipeline-webhook] unhandled error", err);

    try {
      const supabase = adminClient();
      if (userIdForCatch && modelIdForCatch) {
        await insertPipelineEvent(supabase, {
          userId: userIdForCatch,
          modelId: modelIdForCatch,
          stage: "system",
          eventType: "webhook_error",
          message,
          payload: { details: message },
        });
      }
    } catch (logErr) {
      console.error("[pipeline-webhook] failed to log catch error", logErr);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
