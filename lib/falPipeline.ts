import { PARALLEL_IMAGE_COUNT } from "@/lib/constants";
import {
  JUDGE_THRESHOLD,
  rankCandidatesWithRetry,
  runJudgeWithRetry,
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

export type PipelineStage = "base_generation" | "final_edit" | "base_regen";

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
// Candidate pool size (base generations per order) and how many of the
// top-ranked candidates get the full edit+composite treatment.
const numCandidates = Math.max(4, Number(process.env.FAL_BASE_NUM_CANDIDATES) || 8);
const editCandidates = Math.min(
  numCandidates,
  Math.max(4, Number(process.env.FAL_EDIT_CANDIDATES) || 6)
);

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

  // Candidate pool: the endpoint caps num_images at 4 per call, so N
  // candidates are generated in ceil(N/4) batched calls. Each webhook carries
  // its batch offset in metadata.index; results merge into
  // base_candidate_results slots via the atomic RPC.
  const batches: Array<{ offset: number; count: number }> = [];
  for (let offset = 0; offset < numCandidates; offset += 4) {
    batches.push({ offset, count: Math.min(4, numCandidates - offset) });
  }

  const requestIds = await Promise.all(
    batches.map((b) =>
      submitFal(
        env.baseGenModel,
        {
          prompt: fluxPrompt,
          num_images: b.count,
          image_size: { width: 832, height: 1248 },
          loras: [{ path: weightsUrl, scale: baseLoraScale }],
          guidance_scale: baseGenGuidanceScale,
          num_inference_steps: baseGenSteps,
        },
        pipelineWebhookUrl(userId, modelId, "base_generation", b.offset)
      )
    )
  );

  await supabase
    .from("models")
    .update({
      prompt_options: {
        ...prevPo,
        base_request_ids: requestIds,
        num_candidates: numCandidates,
        edit_count: editCandidates,
        base_candidate_results: [],
      } as Json,
      latest_request_id: requestIds[requestIds.length - 1] ?? null,
      status: "generating",
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "base_generation",
    eventType: "submit_success",
    requestId: requestIds[0] ?? null,
    message: `Base generation queued: ${numCandidates} candidates in ${batches.length} batch(es)`,
    payload: { modelId, stage: "base_generation", requestIds, numCandidates },
  });
  console.log("[falPipeline] submitBaseGeneration done", { modelId, requestIds });
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

  const candidateUrls = (Array.isArray(prev.base_candidate_results) ? prev.base_candidate_results : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""));
  const presentCandidates = candidateUrls.filter(Boolean);

  // Legacy fallback: orders trained before the candidate pool stored
  // base_image_urls (exactly 4) and skip ranking.
  const legacyBase = (Array.isArray(prev.base_image_urls) ? prev.base_image_urls : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);

  const pool = presentCandidates.length >= PARALLEL ? presentCandidates : legacyBase;
  if (pool.length < PARALLEL) {
    console.error("[falPipeline] submitFinalEditStage: not enough base portraits", {
      modelId,
      count: pool.length,
    });
    await failModel(supabase, modelId, userId, `Final edit: expected at least ${PARALLEL} base portraits, got ${pool.length}.`);
    return;
  }

  const badgeUrl = po.badge_url?.trim();
  const patchUrl = po.patch_url?.trim();
  const brassUrl = po.brass_url?.trim();
  if (!badgeUrl || !patchUrl || !brassUrl) {
    console.error("[falPipeline] submitFinalEditStage: missing reference URLs", { modelId });
    await failModel(supabase, modelId, userId, "Final edit: badge_url, patch_url, and brass_url are required.");
    return;
  }

  // Ranked selection: comparative identity judge over the candidate pool.
  // Fail-open: keep pool order if ranking is unavailable.
  const selfieUrls = (Array.isArray(prev.selfie_urls) ? prev.selfie_urls : [])
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, 4);

  const targetCount = Math.min(
    typeof prev.edit_count === "number" && prev.edit_count >= PARALLEL
      ? prev.edit_count
      : editCandidates,
    pool.length
  );

  let orderedPortraits: string[];
  if (pool.length > targetCount && selfieUrls.length > 0) {
    const { result: ranking, error: rankError } = await rankCandidatesWithRetry({
      candidateUrls: pool,
      selfieUrls,
    });
    if (ranking) {
      orderedPortraits = ranking.ranking.map((i) => pool[i]).filter(Boolean);
      // If discards leave fewer than needed, backfill with unranked survivors.
      if (orderedPortraits.length < targetCount) {
        const used = new Set(orderedPortraits);
        for (const u of pool) {
          if (orderedPortraits.length >= targetCount) break;
          if (!used.has(u)) orderedPortraits.push(u);
        }
      }
      await logEvent(supabase, {
        userId,
        modelId,
        stage: "judge",
        eventType: "candidates_ranked",
        message: `Ranked ${pool.length} candidates: ${ranking.discarded.length} discarded, editing top ${targetCount}`,
        payload: { ranking: ranking.ranking, discarded: ranking.discarded, targetCount } as unknown as Record<string, unknown>,
      });
    } else {
      orderedPortraits = pool;
      await logEvent(supabase, {
        userId,
        modelId,
        stage: "judge",
        eventType: "rank_skipped",
        message: `Candidate ranking unavailable — using generation order. Reason: ${rankError ?? "unknown"}`,
        payload: { error: rankError },
      });
    }
  } else {
    orderedPortraits = pool;
  }

  const editPortraits = orderedPortraits.slice(0, targetCount);
  const prompt = buildGeminiEditPrompt({ hasJacket: Boolean(po.jacket_url?.trim()) });
  const referenceUrls = editReferenceUrls(po);

  const requestIds = await Promise.all(
    editPortraits.map((portraitUrl, index) =>
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
        final_edit_results: Array(editPortraits.length).fill(""),
        edit_portrait_urls: editPortraits,
        edit_count: editPortraits.length,
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
    message: `Final edit (Gemini) batch queued: ${editPortraits.length} images`,
    payload: { modelId, stage: "final_edit", requestIds },
  });
  console.log("[falPipeline] submitFinalEditStage done", { modelId, requestIds });
}

/** Reference image list for the edit call (badge, patch, brass, optional jacket). */
function editReferenceUrls(po: ReturnType<typeof parseModelPromptOptions>): string[] {
  const jacketUrl = po.jacket_url?.trim();
  return [
    po.badge_url!.trim(),
    po.patch_url!.trim(),
    po.brass_url!.trim(),
    ...(jacketUrl ? [jacketUrl] : []),
  ];
}

/** Submit one Gemini edit for a single slot (rerun and base-regen paths). */
export async function submitEditForSlot(
  model: PipelineModel,
  slot: number,
  portraitUrl: string
): Promise<string> {
  const userId = model.user_id!;
  const po = parseModelPromptOptions(model.prompt_options);
  const prompt = buildGeminiEditPrompt({ hasJacket: Boolean(po.jacket_url?.trim()) });
  return submitFal(
    env.geminiEditModel,
    {
      prompt,
      image_urls: [portraitUrl, ...editReferenceUrls(po)],
    },
    pipelineWebhookUrl(userId, model.id, "final_edit", slot)
  );
}

/**
 * STAGE 3.5 — Judge node: score the 4 finals before delivery.
 * Round 0: any metric < 7 triggers ONE re-edit of the failing images.
 * All edited+composited candidates get QC scores (with retry/backoff), then
 * the order parks in awaiting_selection for a human to pick the final 4.
 * Judge unavailable after retries → still awaiting_selection, just unscored.
 */
export async function judgeAndAwaitSelection(model: PipelineModel, finalUrls: string[]): Promise<void> {
  const userId = model.user_id;
  if (!userId) {
    console.error("[falPipeline] judgeAndAwaitSelection: missing user_id", { modelId: model.id });
    return;
  }
  const modelId = model.id;
  const supabase = adminClient();
  const prev = asPromptJson(model.prompt_options);
  const po = parseModelPromptOptions(model.prompt_options);

  const selfieUrls = (Array.isArray(prev.selfie_urls) ? prev.selfie_urls : [])
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, 4);

  const { scores, error: judgeError } = await runJudgeWithRetry({
    outputUrls: finalUrls,
    selfieUrls,
    badgeUrl: po.badge_url,
    brassUrl: po.brass_url,
  });

  if (scores) {
    await logEvent(supabase, {
      userId,
      modelId,
      stage: "judge",
      eventType: "scores",
      message: `Judge QC: scored ${finalUrls.length} candidates`,
      payload: { threshold: JUDGE_THRESHOLD, scores } as unknown as Record<string, unknown>,
    });
  } else {
    await logEvent(supabase, {
      userId,
      modelId,
      stage: "judge",
      eventType: "judge_skipped",
      message: `Judge unavailable after retries — candidates unscored. Reason: ${judgeError ?? "unknown"}`,
      payload: { error: judgeError },
    });
  }

  await supabase
    .from("models")
    .update({
      status: "awaiting_selection",
      prompt_options: {
        ...prev,
        ...(scores ? { judge_scores_final: scores } : {}),
      } as unknown as Json,
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "judge",
    eventType: "awaiting_selection",
    message: `${finalUrls.length} candidates ready — awaiting selection of the final 4 in /admin/ops`,
    payload: { count: finalUrls.length },
  });
}

/**
 * Re-run the Gemini edit for specific output indices only. Used by the judge
 * round-2 path and the admin review panel's "Re-run edits" action.
 * Clears the targeted result slots so the webhook completion logic waits for
 * every re-edit before judging again.
 */
export async function resubmitFinalEditForIndices(
  model: PipelineModel,
  indices: number[]
): Promise<void> {
  const userId = model.user_id!;
  const modelId = model.id;
  const supabase = adminClient();
  const prev = asPromptJson(model.prompt_options);
  const po = parseModelPromptOptions(model.prompt_options);

  // Per-slot portrait mapping (candidate-pool orders); legacy orders fall
  // back to base_image_urls by slot index.
  const portraitBySlot = (Array.isArray(prev.edit_portrait_urls) ? prev.edit_portrait_urls : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""));
  const legacyBase = (Array.isArray(prev.base_image_urls) ? prev.base_image_urls : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""));
  const portraitFor = (slot: number): string =>
    portraitBySlot[slot] || legacyBase[slot] || "";

  if (!po.badge_url?.trim() || !po.patch_url?.trim() || !po.brass_url?.trim()) {
    console.error("[falPipeline] resubmitFinalEditForIndices: missing reference URLs", { modelId });
    return;
  }
  const valid = indices.filter((i) => portraitFor(i));
  if (valid.length === 0) {
    console.error("[falPipeline] resubmitFinalEditForIndices: no portraits for requested slots", { modelId, indices });
    return;
  }

  // Clear targeted slots BEFORE resubmitting so the merge RPC's filled_count
  // drops and completion only fires after every re-edit lands.
  const currentResults = Array.isArray(prev.final_edit_results)
    ? [...prev.final_edit_results]
    : [];
  for (const i of valid) currentResults[i] = "";

  await supabase
    .from("models")
    .update({
      prompt_options: {
        ...prev,
        final_edit_results: currentResults,
      } as unknown as Json,
      status: "processing_final_edit",
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  const requestIds = await Promise.all(
    valid.map((index) => submitEditForSlot(model, index, portraitFor(index)))
  );

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "final_edit",
    eventType: "submit_success",
    message: `Re-edit queued for ${valid.length} image(s)`,
    payload: { modelId, stage: "final_edit", requestIds, indices: valid },
  });
}

/**
 * Re-run BASE GENERATION for specific edit slots (edits can't fix a bad
 * face). Generates one fresh portrait per slot; the base_regen webhook
 * swaps it into edit_portrait_urls and resubmits that slot's edit.
 */
export async function resubmitBaseGenForSlots(
  model: PipelineModel,
  indices: number[]
): Promise<void> {
  const userId = model.user_id!;
  const modelId = model.id;
  const supabase = adminClient();
  const prev = asPromptJson(model.prompt_options);
  const weightsUrl = loraWeightsUrl(model);
  if (!weightsUrl) {
    console.error("[falPipeline] resubmitBaseGenForSlots: no LoRA weights", { modelId });
    return;
  }

  const triggerPhrase =
    process.env.FAL_TRIGGER_PHRASE?.trim() || buildTriggerPhrase(userId, modelId);
  const envTemplate = process.env.FAL_ASSISTANT_CHIEF_PROMPT_TEMPLATE?.trim();
  const fluxPrompt = envTemplate
    ? envTemplate.replace(/\[TRIGGER_PHRASE\]/g, triggerPhrase)
    : `${triggerPhrase}, ${buildFluxBasePrompt({
        department: typeof prev.department === "string" ? prev.department : null,
        rank: typeof prev.rank === "string" ? prev.rank : null,
      })}`;

  const currentResults = Array.isArray(prev.final_edit_results)
    ? [...prev.final_edit_results]
    : [];
  for (const i of indices) currentResults[i] = "";

  await supabase
    .from("models")
    .update({
      prompt_options: {
        ...prev,
        final_edit_results: currentResults,
      } as unknown as Json,
      status: "processing_final_edit",
    })
    .eq("id", modelId)
    .eq("user_id", userId);

  const requestIds = await Promise.all(
    indices.map((slot) =>
      submitFal(
        env.baseGenModel,
        {
          prompt: fluxPrompt,
          num_images: 1,
          image_size: { width: 832, height: 1248 },
          loras: [{ path: weightsUrl, scale: baseLoraScale }],
          guidance_scale: baseGenGuidanceScale,
          num_inference_steps: baseGenSteps,
        },
        pipelineWebhookUrl(userId, modelId, "base_regen", slot)
      )
    )
  );

  await logEvent(supabase, {
    userId,
    modelId,
    stage: "base_generation",
    eventType: "submit_success",
    message: `Base re-generation queued for slot(s) ${indices.join(", ")}`,
    payload: { modelId, stage: "base_regen", requestIds, indices },
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
    const expected =
      typeof prev.edit_count === "number" && prev.edit_count >= PARALLEL
        ? prev.edit_count
        : Math.max(slots.length, PARALLEL);
    let urls = Array.from({ length: expected }, (_, i) => {
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
          expected,
        });
        if (found < expected) continue;
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
      message: `Recovery sweep: ${expected}/${expected} results present with no judge run — running judge now`,
      payload: { urls_present: expected },
    });
    const fresh = await loadModel(supabase, model.id, model.user_id);
    await judgeAndAwaitSelection(fresh ?? model, urls);
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
      from: env.fromEmail,
      // Support decision 2026-08-02: inbound MX on badgeshot.com stays
      // unconfigured (protects the Resend send records); replies route to
      // the support Gmail instead.
      reply_to: "thehalligansupport@gmail.com",
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
