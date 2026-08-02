import { PARALLEL_IMAGE_COUNT } from "@/lib/constants";
import {
  failingIndices,
  JUDGE_THRESHOLD,
  runJudge,
  type JudgeScore,
} from "@/lib/judgeNode";
import { buildDeliveryEmailHtml, DELIVERY_EMAIL_SUBJECT } from "@/lib/deliveryEmail";
import { rebuildSlotsFromComposites } from "@/lib/repairComposites";
import { parseModelPromptOptions } from "@/lib/modelPromptOptions";
import { buildFluxBasePrompt, buildGeminiEditPrompt } from "@/lib/promptMapping";
import { Database, Json } from "@/types/supabase";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

/** models row; LoRA weights URL lives in `lora_url` (alias `weights_url` in docs). */
export type PipelineModel = Database["public"]["Tables"]["models"]["Row"];

export type PipelineStage = "base_generation" | "final_edit";

export type FalPipelineWebhookStage = "trainer" | PipelineStage;

type FalWebhookPayload = {
  request_id?: string;
  status?: string;
  payload?: Record<string, unknown>;
  error?: string;
};

export type OrchestratorContext = {
  userId: string;
  modelId: number;
  webhookSecret: string;
  stage: FalPipelineWebhookStage;
  incoming: FalWebhookPayload;
  index?: number;
};

const PARALLEL = PARALLEL_IMAGE_COUNT;

const env = {
  falKey: process.env.FAL_KEY,
  deploymentUrl: process.env.DEPLOYMENT_URL,
  webhookSecret: process.env.APP_WEBHOOK_SECRET,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? "orders@badgeshot.com",
  trainerModel: process.env.FAL_MODEL_PORTRAIT_TRAINER ?? "fal-ai/flux-lora-portrait-trainer",
  baseGenModel: process.env.FAL_MODEL_BASE_GENERATION ?? "fal-ai/flux-lora",
  geminiEditModel: process.env.FAL_MODEL_GEMINI_EDIT ?? "fal-ai/gemini-3-pro-image-preview/edit",
};

// A/B/C test knobs: FLUX.2 [dev] LoRA wants guidance ~2-4 vs FLUX.1's 3.5.
const baseGenGuidanceScale = Number(process.env.FAL_BASE_GUIDANCE_SCALE) || 3.5;
const baseGenSteps = Number(process.env.FAL_BASE_INFERENCE_STEPS) || 28;
const trainerSteps = Number(process.env.FAL_TRAINER_STEPS) || null;
const trainerLearningRate = Number(process.env.FAL_TRAINER_LEARNING_RATE) || null;
// Inference LoRA strength; raise toward 1.1-1.25 to pull outputs closer to
// the trained identity at some cost to prompt adherence.
const baseLoraScale = Number(process.env.FAL_BASE_LORA_SCALE) || 1.0;

function required(name: keyof typeof env): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function baseUrl(): string {
  const url = required("deploymentUrl");
  return url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
}

export function buildTriggerPhrase(userId: string, modelId: number): string {
  const compactUser = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18);
  return `uid${compactUser}m${modelId}`;
}

function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(required("supabaseUrl"), required("supabaseServiceRoleKey"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function toUrls(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null && "url" in item) {
          const url = (item as { url?: unknown }).url;
          return typeof url === "string" ? url : null;
        }
        return null;
      })
      .filter((u): u is string => Boolean(u));
  }
  if (typeof value === "object" && value !== null && "url" in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === "string" ? [url] : [];
  }
  return [];
}

function firstImageUrl(payload: Record<string, unknown> | undefined): string | null {
  if (!payload) return null;
  return toUrls(payload.images)[0] ?? toUrls(payload.image)[0] ?? null;
}

function pipelineWebhookUrl(userId: string, modelId: number, stage: FalPipelineWebhookStage, index?: number): string {
  const url = new URL(`${baseUrl()}/api/fal/pipeline-webhook`);
  url.searchParams.set("user_id", userId);
  url.searchParams.set("model_id", String(modelId));
  url.searchParams.set("stage", stage);
  url.searchParams.set("webhook_secret", required("webhookSecret"));
  if (typeof index === "number") {
    url.searchParams.set("index", String(index));
  }
  return url.toString();
}

async function logEvent(
  client: SupabaseClient<Database>,
  args: {
    userId: string;
    modelId: number;
    stage: string;
    eventType: string;
    requestId?: string | null;
    message?: string | null;
    payload?: Record<string, unknown> | null;
  }
) {
  const safePayload = (args.payload ?? null) as Json | null;
  const { error } = await client.from("pipeline_events").insert({
    user_id: args.userId,
    model_id: args.modelId,
    stage: args.stage,
    event_type: args.eventType,
    request_id: args.requestId ?? null,
    message: args.message ?? null,
    payload: safePayload,
  });
  if (error) {
    console.error("[falPipeline] Failed to write pipeline event", error);
  }
}

async function submitFal(model: string, input: Record<string, unknown>, webhookUrl: string): Promise<string> {
  const url = new URL(`https://queue.fal.run/${model}`);
  url.searchParams.set("fal_webhook", webhookUrl);
  console.log("[falPipeline] submitFal", { model, webhook: webhookUrl.split("?")[0] });
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Key ${required("falKey")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as { request_id?: string; detail?: string };
  if (!res.ok || !body.request_id) {
    throw new Error(`Fal submit failed (${model}): ${body.detail ?? res.statusText}`);
  }
  console.log("[falPipeline] submitFal OK", { model, request_id: body.request_id });
  return body.request_id;
}

function asPromptJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

function loraWeightsUrl(model: PipelineModel): string | null {
  const w = (model as PipelineModel & { weights_url?: string | null }).weights_url;
  return (typeof w === "string" && w.length > 0 ? w : null) ?? model.lora_url ?? null;
}

async function insertFinalImages(
  client: SupabaseClient<Database>,
  userId: string,
  modelId: number,
  urls: string[],
  requestId: string | null
): Promise<void> {
  if (urls.length === 0) return;
  const insertRows = urls.map((url) => ({
    user_id: userId,
    model_id: modelId,
    uri: url,
    metadata: {
      source: "fal-automated-pipeline",
      request_id: requestId ?? null,
    },
  }));
  await client.from("headshots").insert(insertRows);
  await client.from("images").insert(
    urls.map((uri) => ({
      model_id: modelId,
      uri,
    }))
  );
  console.log("[falPipeline] insertFinalImages", { modelId, count: urls.length });
}

async function failModel(client: SupabaseClient<Database>, modelId: number, userId: string, message: string) {
  console.error("[falPipeline] failModel", { modelId, message });
  await logEvent(client, {
    userId,
    modelId,
    stage: "system",
    eventType: "error",
    message,
  });
  await client
    .from("models")
    .update({ status: "failed" })
    .eq("id", modelId)
    .eq("user_id", userId);
}

type IndexedMergeKey = "final_edit_results";

async function mergePipelineIndexedResult(
  client: SupabaseClient<Database>,
  args: {
    modelId: number;
    userId: string;
    key: IndexedMergeKey;
    slot: number;
    url: string;
    expected?: number;
  }
): Promise<
  | { ok: true; filled: number; results: string[]; becameComplete: boolean }
  | { ok: false; message: string }
> {
  const expected = args.expected ?? PARALLEL;
  const { data, error } = await client.rpc("merge_pipeline_indexed_result", {
    p_model_id: args.modelId,
    p_user_id: args.userId,
    p_results_key: args.key,
    p_slot: args.slot,
    p_url: args.url,
    p_expected: expected,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  const row = data?.[0];
  if (!row) {
    return { ok: false, message: "merge_pipeline_indexed_result returned no row" };
  }
  const resultsJson = row.results as unknown;
  const results: string[] =
    Array.isArray(resultsJson) && resultsJson.length
      ? Array.from({ length: expected }, (_, i) => {
          const x = resultsJson[i];
          return typeof x === "string" && x.length > 0 ? x : "";
        })
      : [];
  return {
    ok: true,
    filled: row.filled_count,
    becameComplete: row.became_complete,
    results,
  };
}

/**
 * STAGE 2 — Flux LoRA base generation (4 portraits, blank uniform).
 * Expects `model.lora_url` (or `weights_url`) set. Persists `prompt_options.base_request_ids`.
 */
export async function submitBaseGeneration(model: PipelineModel): Promise<void> {
  const userId = model.user_id;
  if (!userId) {
    console.error("[falPipeline] submitBaseGeneration: missing user_id", { modelId: model.id });
    return;
  }
  const modelId = model.id;
  const weightsUrl = loraWeightsUrl(model);
  if (!weightsUrl) {
    console.error("[falPipeline] submitBaseGeneration: missing lora_url / weights_url", { modelId });
    await failModel(adminClient(), modelId, userId, "No LoRA weights URL for base generation.");
    return;
  }

  console.log("[falPipeline] submitBaseGeneration start", { modelId, userId });
  const supabase = adminClient();

  const prevPo = asPromptJson(model.prompt_options);
  const triggerPhrase =
    process.env.FAL_TRIGGER_PHRASE?.trim() || buildTriggerPhrase(userId, modelId);
  const envTemplate = process.env.FAL_ASSISTANT_CHIEF_PROMPT_TEMPLATE?.trim();
  const fluxPrompt = envTemplate
    ? envTemplate.replace(/\[TRIGGER_PHRASE\]/g, triggerPhrase)
    : `${triggerPhrase}, ${buildFluxBasePrompt({
        department:
          typeof prevPo.department === "string" ? prevPo.department : null,
        rank: typeof prevPo.rank === "string" ? prevPo.rank : null,
      })}`;

  const webhookUrl = pipelineWebhookUrl(userId, modelId, "base_generation");

  const requestId = await submitFal(
    env.baseGenModel,
    {
      prompt: fluxPrompt,
      num_images: PARALLEL,
      image_size: { width: 832, height: 1248 },
      loras: [{ path: weightsUrl, scale: baseLoraScale }],
      guidance_scale: baseGenGuidanceScale,
      num_inference_steps: baseGenSteps,
    },
    webhookUrl
  );

  await supabase
    .from("models")
    .update({
      prompt_options: {
        ...prevPo,
        base_request_ids: [requestId],
      } as Json,
      latest_request_id: requestId,
      status: "generating",
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "base_generation",
    eventType: "submit_success",
    requestId,
    message: "Base generation queued",
    payload: { modelId, stage: "base_generation" },
  });
  console.log("[falPipeline] submitBaseGeneration done", { modelId, requestId });
}

/**
 * STAGE 3 — Gemini edit: 4 parallel jobs (portrait + badge + patch + brass each).
 */
export async function submitFinalEditStage(model: PipelineModel): Promise<void> {
  const userId = model.user_id;
  if (!userId) {
    console.error("[falPipeline] submitFinalEditStage: missing user_id", { modelId: model.id });
    return;
  }
  const modelId = model.id;
  console.log("[falPipeline] submitFinalEditStage start", { modelId });

  const supabase = adminClient();
  const po = parseModelPromptOptions(model.prompt_options);
  const prev = asPromptJson(model.prompt_options);

  const rawBase = prev.base_image_urls;
  const portraitUrls = (Array.isArray(rawBase) ? rawBase : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);

  if (portraitUrls.length < PARALLEL) {
    console.error("[falPipeline] submitFinalEditStage: need 4 base portrait URLs", {
      modelId,
      count: portraitUrls.length,
    });
    await failModel(supabase, modelId, userId, `Final edit: expected ${PARALLEL} base_image_urls, got ${portraitUrls.length}.`);
    return;
  }

  const badgeUrl = po.badge_url?.trim();
  const patchUrl = po.patch_url?.trim();
  const brassUrl = po.brass_url?.trim();
  const jacketUrl = po.jacket_url?.trim();
  if (!badgeUrl || !patchUrl || !brassUrl) {
    console.error("[falPipeline] submitFinalEditStage: missing reference URLs", { modelId });
    await failModel(supabase, modelId, userId, "Final edit: badge_url, patch_url, and brass_url are required.");
    return;
  }

  const prompt = buildGeminiEditPrompt({ hasJacket: Boolean(jacketUrl) });
  const referenceUrls = [
    badgeUrl,
    patchUrl,
    brassUrl,
    ...(jacketUrl ? [jacketUrl] : []),
  ];
  const slice = portraitUrls.slice(0, PARALLEL);

  const requestIds = await Promise.all(
    slice.map((portraitUrl, index) =>
      submitFal(
        env.geminiEditModel,
        {
          prompt,
          image_urls: [portraitUrl, ...referenceUrls],
        },
        pipelineWebhookUrl(userId, modelId, "final_edit", index)
      )
    )
  );

  await supabase
    .from("models")
    .update({
      prompt_options: {
        ...prev,
        final_edit_request_ids: requestIds,
        final_edit_results: Array(PARALLEL).fill(""),
      } as Json,
      status: "processing_final_edit",
      latest_request_id: requestIds[requestIds.length - 1] ?? null,
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "final_edit",
    eventType: "submit_success",
    message: "Final edit (Gemini) batch queued",
    payload: { modelId, stage: "final_edit", requestIds },
  });
  console.log("[falPipeline] submitFinalEditStage done", { modelId, requestIds });
}

/**
 * STAGE 3.5 — Judge node: score the 4 finals before delivery.
 * Round 0: any metric < 7 triggers ONE re-edit of the failing images.
 * Round 1: still failing → flag the order for manual review, no auto-delivery.
 * Judge unavailable/error → fail open and deliver (never strand a paid order).
 */
export async function judgeAndDeliver(model: PipelineModel, finalUrls: string[]): Promise<void> {
  const userId = model.user_id;
  if (!userId) {
    console.error("[falPipeline] judgeAndDeliver: missing user_id", { modelId: model.id });
    return;
  }
  const modelId = model.id;
  const supabase = adminClient();
  const prev = asPromptJson(model.prompt_options);
  const po = parseModelPromptOptions(model.prompt_options);
  const round = typeof prev.judge_round === "number" ? prev.judge_round : 0;

  const selfieUrls = (Array.isArray(prev.selfie_urls) ? prev.selfie_urls : [])
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, 4);

  let scores: JudgeScore[] | null = null;
  let judgeError: string | null = null;
  try {
    const result = await runJudge({
      outputUrls: finalUrls,
      selfieUrls,
      badgeUrl: po.badge_url,
      brassUrl: po.brass_url,
    });
    scores = result.scores;
    judgeError = result.error;
  } catch (e) {
    judgeError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[falPipeline] judge threw", { modelId, e });
  }

  if (!scores) {
    await logEvent(supabase, {
      userId,
      modelId,
      stage: "judge",
      eventType: "judge_skipped",
      message: `Judge unavailable — delivering without QC scores. Reason: ${judgeError ?? "unknown"}`,
      payload: { round: round + 1, error: judgeError },
    });
    await deliverResults(model, finalUrls);
    return;
  }

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "judge",
    eventType: "scores",
    message: `Judge round ${round + 1}: scored ${finalUrls.length} outputs`,
    payload: { round: round + 1, threshold: JUDGE_THRESHOLD, scores } as unknown as Record<string, unknown>,
  });

  const failing = failingIndices(scores);
  if (failing.length === 0) {
    await deliverResults(model, finalUrls);
    return;
  }

  if (round >= 1) {
    await supabase
      .from("models")
      .update({
        status: "needs_review",
        prompt_options: {
          ...prev,
          judge_scores_final: scores,
        } as unknown as Json,
      })
      .eq("id", modelId)
      .eq("user_id", userId);
    await logEvent(supabase, {
      userId,
      modelId,
      stage: "judge",
      eventType: "needs_review",
      message: `Judge: ${failing.length} image(s) still below ${JUDGE_THRESHOLD} after re-edit — order flagged for manual review`,
      payload: { failing, scores } as unknown as Record<string, unknown>,
    });
    return;
  }

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "judge",
    eventType: "re_edit",
    message: `Judge: re-editing ${failing.length} image(s) below ${JUDGE_THRESHOLD} (indices ${failing.join(", ")})`,
    payload: { failing, scores } as unknown as Record<string, unknown>,
  });
  await resubmitFinalEditForIndices(model, failing, scores);
}

/**
 * Re-run the Gemini edit for specific output indices only. Used by the judge
 * round-2 path and the admin review panel's "Re-run edits" action.
 * Clears the targeted result slots so the webhook completion logic waits for
 * every re-edit before judging again.
 */
export async function resubmitFinalEditForIndices(
  model: PipelineModel,
  indices: number[],
  round1Scores?: JudgeScore[] | null
): Promise<void> {
  const userId = model.user_id!;
  const modelId = model.id;
  const supabase = adminClient();
  const prev = asPromptJson(model.prompt_options);
  const po = parseModelPromptOptions(model.prompt_options);

  const rawBase = prev.base_image_urls;
  const portraitUrls = (Array.isArray(rawBase) ? rawBase : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);

  const badgeUrl = po.badge_url?.trim();
  const patchUrl = po.patch_url?.trim();
  const brassUrl = po.brass_url?.trim();
  const jacketUrl = po.jacket_url?.trim();
  if (!badgeUrl || !patchUrl || !brassUrl || portraitUrls.length < PARALLEL) {
    console.error("[falPipeline] resubmitFinalEditForIndices: missing inputs — delivering as-is", { modelId });
    const existing = Array.isArray(prev.final_edit_results)
      ? prev.final_edit_results.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];
    if (existing.length >= PARALLEL) await deliverResults(model, existing.slice(0, PARALLEL));
    return;
  }

  const prompt = buildGeminiEditPrompt({ hasJacket: Boolean(jacketUrl) });
  const referenceUrls = [
    badgeUrl,
    patchUrl,
    brassUrl,
    ...(jacketUrl ? [jacketUrl] : []),
  ];

  // Clear failing slots BEFORE resubmitting so the merge RPC's filled_count
  // drops below 4 and completion only fires after every re-edit lands.
  const currentResults = Array.isArray(prev.final_edit_results)
    ? [...prev.final_edit_results]
    : Array(PARALLEL).fill("");
  for (const i of indices) currentResults[i] = "";

  await supabase
    .from("models")
    .update({
      prompt_options: {
        ...prev,
        final_edit_results: currentResults,
        judge_round: 1,
        ...(round1Scores ? { judge_scores_round1: round1Scores } : {}),
      } as unknown as Json,
      status: "processing_final_edit",
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  const requestIds = await Promise.all(
    indices.map((index) =>
      submitFal(
        env.geminiEditModel,
        {
          prompt,
          image_urls: [portraitUrls[index], ...referenceUrls],
        },
        pipelineWebhookUrl(userId, modelId, "final_edit", index)
      )
    )
  );

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "final_edit",
    eventType: "submit_success",
    message: `Judge re-edit queued for ${indices.length} image(s)`,
    payload: { modelId, stage: "final_edit", requestIds, indices },
  });
}

/**
 * Recovery sweep: find orders stuck in processing_final_edit with all 4
 * results present but no judge run (e.g. the merge RPC never signaled
 * completion), and kick the judge for each. Skips orders whose last
 * final_edit webhook is fresher than `minQuietSeconds` to avoid racing an
 * in-flight completion.
 */
export async function sweepStuckJudges(minQuietSeconds = 180): Promise<number[]> {
  const supabase = adminClient();
  const { data: candidates, error } = await supabase
    .from("models")
    .select("*")
    .eq("status", "processing_final_edit")
    .limit(50);
  if (error) {
    console.error("[falPipeline] sweepStuckJudges query failed", error);
    return [];
  }

  const kicked: number[] = [];
  for (const model of candidates ?? []) {
    if (!model.user_id) continue;
    const prev = asPromptJson(model.prompt_options);
    const slots = Array.isArray(prev.final_edit_results) ? prev.final_edit_results : [];
    let urls = Array.from({ length: PARALLEL }, (_, i) => {
      const x = slots[i];
      return typeof x === "string" && x.length > 0 ? x : "";
    });

    const { data: lastEv } = await supabase
      .from("pipeline_events")
      .select("created_at")
      .eq("model_id", model.id)
      .eq("stage", "final_edit")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastEv?.created_at) {
      const ageMs = Date.now() - new Date(lastEv.created_at).getTime();
      if (ageMs < minQuietSeconds * 1000) continue;
    }

    // Incomplete slots with a quiet pipeline: the composites may have
    // uploaded fine while the merge RPC failed (e.g. the overload-ambiguity
    // outage). Rebuild from storage before judging.
    if (urls.some((u) => !u)) {
      try {
        const { slots: rebuilt, found } = await rebuildSlotsFromComposites(supabase, {
          userId: model.user_id,
          modelId: model.id,
        });
        if (found < PARALLEL) continue;
        urls = rebuilt;
        await supabase
          .from("models")
          .update({
            prompt_options: { ...prev, final_edit_results: rebuilt } as Json,
          })
          .eq("id", model.id)
          .eq("user_id", model.user_id);
        await logEvent(supabase, {
          userId: model.user_id,
          modelId: model.id,
          stage: "review",
          eventType: "repaired",
          message: "Recovery sweep: rebuilt final URL set from stored composites",
          payload: { found },
        });
      } catch (e) {
        console.error("[falPipeline] sweep repair failed", { modelId: model.id, e });
        continue;
      }
    }

    console.log("[falPipeline] sweepStuckJudges kicking judge", { modelId: model.id });
    await logEvent(supabase, {
      userId: model.user_id,
      modelId: model.id,
      stage: "judge",
      eventType: "sweep_kick",
      message: "Recovery sweep: 4/4 results present with no judge run — running judge now",
      payload: { urls_present: 4 },
    });
    const fresh = await loadModel(supabase, model.id, model.user_id);
    await judgeAndDeliver(fresh ?? model, urls);
    kicked.push(model.id);
  }
  return kicked;
}

/** Site origin for customer-facing links; never throws. */
function siteOrigin(): string {
  const raw = process.env.DEPLOYMENT_URL?.trim() || "badgeshot.vercel.app";
  const withProto =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

/**
 * STAGE 4 — Persist finals, update model, email customer.
 */
export async function deliverResults(model: PipelineModel, finalUrls: string[]): Promise<void> {
  const userId = model.user_id;
  if (!userId) {
    console.error("[falPipeline] deliverResults: missing user_id", { modelId: model.id });
    return;
  }
  const modelId = model.id;
  console.log("[falPipeline] deliverResults start", { modelId, count: finalUrls.length });

  const supabase = adminClient();
  const prev = asPromptJson(model.prompt_options);

  await insertFinalImages(supabase, userId, modelId, finalUrls, null);

  await supabase
    .from("models")
    .update({
      status: "finished",
      result_image_url: finalUrls[0] ?? null,
      prompt_options: {
        ...prev,
        final_results: finalUrls,
      } as Json,
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "complete",
    eventType: "completed",
    message: "Pipeline complete — 4 headshots delivered",
    payload: { final_urls: finalUrls },
  });

  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const email = userData.user?.email;
  if (env.resendApiKey && email) {
    const resend = new Resend(env.resendApiKey);
    const customerName = typeof prev.name === "string" ? prev.name : null;
    await resend.emails.send({
      from: "orders@badgeshot.com",
      reply_to: "orders@badgeshot.com",
      to: email,
      subject: DELIVERY_EMAIL_SUBJECT,
      html: buildDeliveryEmailHtml({
        finalUrls,
        customerName,
        downloadAllUrl: `${siteOrigin()}/overview/models/${modelId}`,
      }),
    });
    console.log("[falPipeline] deliverResults email sent", { modelId, to: email });
  } else {
    console.log("[falPipeline] deliverResults skip email (no Resend or email)", { modelId });
  }

  console.log("[falPipeline] deliverResults done", { modelId });
}

/** Entry point: queue base generation from a loaded model row (after LoRA is available). */
export async function startPipelineFromBase(model: PipelineModel): Promise<void> {
  console.log("[falPipeline] startPipelineFromBase → submitBaseGeneration", { modelId: model.id });
  await submitBaseGeneration(model);
}

export async function kickoffPortraitTraining(args: {
  userId: string;
  modelId: number;
  imagesDataUrl: string;
  triggerPhrase: string;
}): Promise<string> {
  const supabase = adminClient();
  console.log("[falPipeline] kickoffPortraitTraining", { modelId: args.modelId });
  await logEvent(supabase, {
    userId: args.userId,
    modelId: args.modelId,
    stage: "trainer",
    eventType: "submit_started",
    message: "Portrait trainer queued",
    payload: { images_data_url: args.imagesDataUrl },
  });

  // FLUX.2 trainer (fal-ai/flux-2-trainer) has a different input schema than
  // the FLUX.1 portrait trainer: image_data_url (singular), no trigger_phrase
  // param (the trigger goes in default_caption), and a lower default LR.
  const isFlux2Trainer = env.trainerModel.includes("flux-2");
  const trainerInput: Record<string, unknown> = isFlux2Trainer
    ? {
        image_data_url: args.imagesDataUrl,
        default_caption: args.triggerPhrase,
        steps: trainerSteps ?? 1000,
        learning_rate: trainerLearningRate ?? 0.00005,
      }
    : {
        images_data_url: args.imagesDataUrl,
        trigger_phrase: args.triggerPhrase,
        steps: trainerSteps ?? 1000,
        learning_rate: trainerLearningRate ?? 0.00009,
      };

  const requestId = await submitFal(
    env.trainerModel,
    trainerInput,
    pipelineWebhookUrl(args.userId, args.modelId, "trainer")
  );

  await logEvent(supabase, {
    userId: args.userId,
    modelId: args.modelId,
    stage: "trainer",
    eventType: "submit_success",
    requestId,
    message: "Portrait trainer submitted",
  });
  return requestId;
}

async function loadModel(
  supabase: SupabaseClient<Database>,
  modelId: number,
  userId: string
): Promise<PipelineModel | null> {
  const { data, error } = await supabase
    .from("models")
    .select("*")
    .eq("id", modelId)
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    console.error("[falPipeline] loadModel failed", { modelId, error });
    return null;
  }
  return data;
}

export async function handleFalPipeline(ctx: OrchestratorContext): Promise<void> {
  const supabase = adminClient();
  console.log("[falPipeline] handleFalPipeline", {
    stage: ctx.stage,
    modelId: ctx.modelId,
    index: ctx.index,
    status: ctx.incoming.status,
  });

  const userCheck = await supabase.auth.admin.getUserById(ctx.userId);
  if (userCheck.error || !userCheck.data.user) {
    throw new Error(`User validation failed for webhook (${ctx.userId})`);
  }

  if (ctx.incoming.status !== "OK") {
    console.error("[falPipeline] webhook NON-OK", JSON.stringify(ctx.incoming, null, 2));
    await logEvent(supabase, {
      userId: ctx.userId,
      modelId: ctx.modelId,
      stage: ctx.stage,
      eventType: "webhook_error",
      requestId: ctx.incoming.request_id ?? null,
      message: ctx.incoming.error ?? "Fal webhook returned non-OK",
      payload: ctx.incoming.payload ?? null,
    });
    await failModel(
      supabase,
      ctx.modelId,
      ctx.userId,
      `Fal webhook returned non-OK at stage ${ctx.stage}: ${ctx.incoming.error ?? "unknown"}`
    );
    return;
  }

  if (ctx.stage === "trainer") {
    await logEvent(supabase, {
      userId: ctx.userId,
      modelId: ctx.modelId,
      stage: "trainer",
      eventType: "webhook_received",
      requestId: ctx.incoming.request_id ?? null,
      message: "Trainer webhook received",
      payload: ctx.incoming.payload ?? null,
    });

    const loraUrl = toUrls(ctx.incoming.payload?.diffusers_lora_file)[0];
    if (!loraUrl) {
      await failModel(supabase, ctx.modelId, ctx.userId, "Trainer payload missing LoRA URL.");
      return;
    }

    await supabase
      .from("models")
      .update({ lora_url: loraUrl, status: "generating" })
      .eq("id", ctx.modelId)
      .eq("user_id", ctx.userId);

    const model = await loadModel(supabase, ctx.modelId, ctx.userId);
    if (!model) {
      await failModel(supabase, ctx.modelId, ctx.userId, "Could not load model after trainer.");
      return;
    }

    console.log("[falPipeline] trainer complete → submitBaseGeneration", { modelId: ctx.modelId });
    await submitBaseGeneration(model);
    return;
  }

  if (ctx.stage === "base_generation") {
    await logEvent(supabase, {
      userId: ctx.userId,
      modelId: ctx.modelId,
      stage: "base_generation",
      eventType: "webhook_received",
      requestId: ctx.incoming.request_id ?? null,
      message: "Base generation webhook received",
      payload: ctx.incoming.payload ?? null,
    });

    const baseImages = toUrls(ctx.incoming.payload?.images);
    console.log("[falPipeline] base_generation images", { count: baseImages.length });
    if (baseImages.length < PARALLEL) {
      await failModel(
        supabase,
        ctx.modelId,
        ctx.userId,
        `Base generation: expected ${PARALLEL} images, got ${baseImages.length}.`
      );
      return;
    }

    const modelRow = await loadModel(supabase, ctx.modelId, ctx.userId);
    if (!modelRow) return;

    const prevPo = asPromptJson(modelRow.prompt_options);
    await supabase
      .from("models")
      .update({
        prompt_options: {
          ...prevPo,
          base_image_urls: baseImages.slice(0, PARALLEL),
        } as Json,
      })
      .eq("id", ctx.modelId)
      .eq("user_id", ctx.userId);

    const updated = await loadModel(supabase, ctx.modelId, ctx.userId);
    if (!updated) return;

    console.log("[falPipeline] base_generation complete → submitFinalEditStage", { modelId: ctx.modelId });
    await submitFinalEditStage(updated);
    return;
  }

  if (ctx.stage === "final_edit") {
    const idx = ctx.index;
    if (typeof idx !== "number" || idx < 0 || idx >= PARALLEL) {
      await failModel(supabase, ctx.modelId, ctx.userId, "final_edit webhook missing valid index.");
      return;
    }

    const url = firstImageUrl(ctx.incoming.payload);
    if (!url) {
      await failModel(supabase, ctx.modelId, ctx.userId, "Final edit payload missing image URL.");
      return;
    }

    console.log("[falPipeline] final_edit webhook", { modelId: ctx.modelId, index: idx });
    await logEvent(supabase, {
      userId: ctx.userId,
      modelId: ctx.modelId,
      stage: "final_edit",
      eventType: "webhook_received",
      requestId: ctx.incoming.request_id ?? null,
      message: `Final edit result ${idx + 1}/${PARALLEL}`,
      payload: { index: idx },
    });

    const merged = await mergePipelineIndexedResult(supabase, {
      modelId: ctx.modelId,
      userId: ctx.userId,
      key: "final_edit_results",
      slot: idx,
      url,
    });

    if (!merged.ok) {
      await failModel(supabase, ctx.modelId, ctx.userId, `Final edit merge failed: ${merged.message}`);
      return;
    }

    const { filled, results, becameComplete } = merged;
    const shouldAdvance = becameComplete || filled >= PARALLEL;
    console.log("[falPipeline] final_edit merge", { filled, becameComplete, shouldAdvance });

    if (filled < PARALLEL) {
      await logEvent(supabase, {
        userId: ctx.userId,
        modelId: ctx.modelId,
        stage: "final_edit",
        eventType: "partial_complete",
        requestId: ctx.incoming.request_id ?? null,
        message: `Final edit ${filled}/${PARALLEL}`,
      });
      return;
    }

    if (!shouldAdvance) {
      return;
    }

    const modelRow = await loadModel(supabase, ctx.modelId, ctx.userId);
    if (!modelRow) return;

    const finals = results.filter((u) => u.length > 0);
    if (finals.length < PARALLEL) {
      await failModel(
        supabase,
        ctx.modelId,
        ctx.userId,
        `Final edit: expected ${PARALLEL} URLs after merge, got ${finals.length}.`
      );
      return;
    }
    await deliverResults(modelRow, finals.slice(0, PARALLEL));
    return;
  }
}
