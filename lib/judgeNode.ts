/**
 * Judge node — Gemini text+vision QC scoring of the 4 final outputs before delivery.
 *
 * Scores each output 1-10 on face_match (vs training selfies), badge_match and
 * brass_match (vs the customer's reference photos), and background_consistency
 * (vs the other three outputs). Fail-open by design: any error returns null and
 * the caller delivers unjudged rather than stranding a paid order.
 */

export const JUDGE_THRESHOLD = 7;

export type JudgeMetric = {
  score: number;
  reason: string;
};

export type JudgeScore = {
  index: number;
  face_match: JudgeMetric;
  badge_match: JudgeMetric;
  brass_match: JudgeMetric;
  composite_quality: JudgeMetric;
};

const METRIC_KEYS = [
  "face_match",
  "badge_match",
  "brass_match",
  "composite_quality",
] as const;

export function failingIndices(scores: JudgeScore[]): number[] {
  return scores
    .filter((s) =>
      METRIC_KEYS.some((k) => s[k].score < JUDGE_THRESHOLD)
    )
    .map((s) => s.index);
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

async function fetchImagePart(url: string): Promise<GeminiPart | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { inline_data: { mime_type: mime, data: buf.toString("base64") } };
  } catch (e) {
    console.error("[judgeNode] failed to fetch image", { url: url.slice(0, 80), e });
    return null;
  }
}

function judgeInstructions(outputCount: number, selfieCount: number): string {
  return [
    `You are a strict photo QC judge for BadgeShot, a service producing official Class A fire service portraits.`,
    `You will be shown ${outputCount} OUTPUT images, ${selfieCount} TRAINING SELFIE images of the real customer (these are the ground-truth identity references — study the face shape, proportions, and skin texture in them before scoring), a BADGE REFERENCE photo of the customer's real badge, and a BRASS REFERENCE photo of the customer's real collar brass.`,
    `Score EVERY output image on these four metrics, each an integer 1-10 with a one-line reason:`,
    `- face_match: STRICT identity against the TRAINING SELFIE references only. The bar: would people who know this person recognize them INSTANTLY, with zero hesitation? Reserve 8-10 for true likeness. Penalize hard (7 or below) any near-miss composite: averaged or idealized features, a face that reads narrower or longer than the references, subtly different jaw/cheek/nose structure, or over-smoothed plastic AI skin missing the pores and texture visible in the selfies. IMPORTANT: consistency between the four outputs is NOT identity — an output set can match each other perfectly and all be the wrong person. Compare each output against the selfies, never against the other outputs.`,
    `- badge_match: does the chest badge in the output reproduce the badge reference (shape, text, finish)? Below 7 = wrong or invented badge.`,
    `- brass_match: does the collar brass in the output reproduce the brass reference (device, finish, both collar points, proportional size)? Below 7 = wrong, missing, or oversized brass.`,
    `- composite_quality: the background is a composited studio backdrop, identical across the set by construction. Judge the COMPOSITE itself: clean, crisp subject edges (hair, shoulders, cap), no halos or glow, no leftover gray fringe from the original background, natural-looking transition and shadowing between subject and backdrop. Below 7 = visible cutout artifacts.`,
    `Be strict: 7 is the delivery threshold.`,
    `Respond with ONLY a JSON array of exactly ${outputCount} objects, one per output in order, shaped:`,
    `[{"index":0,"face_match":{"score":9,"reason":"..."},"badge_match":{"score":8,"reason":"..."},"brass_match":{"score":7,"reason":"..."},"composite_quality":{"score":9,"reason":"..."}}, ...]`,
  ].join("\n");
}

function parseMetric(raw: unknown): JudgeMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const scoreRaw = o.score;
  const n =
    typeof scoreRaw === "number" ? scoreRaw : parseInt(String(scoreRaw ?? ""), 10);
  if (!Number.isFinite(n)) return null;
  const score = Math.max(1, Math.min(10, Math.round(n)));
  const reason = typeof o.reason === "string" ? o.reason.slice(0, 300) : "";
  return { score, reason };
}

function parseScores(text: string, expected: number): JudgeScore[] | null {
  let jsonText = text.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1].trim();
  const start = jsonText.indexOf("[");
  const end = jsonText.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < expected) return null;

  const out: JudgeScore[] = [];
  for (let i = 0; i < expected; i++) {
    const row = parsed[i];
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const face_match = parseMetric(r.face_match);
    const badge_match = parseMetric(r.badge_match);
    const brass_match = parseMetric(r.brass_match);
    const composite_quality = parseMetric(r.composite_quality);
    if (!face_match || !badge_match || !brass_match || !composite_quality) {
      return null;
    }
    out.push({ index: i, face_match, badge_match, brass_match, composite_quality });
  }
  return out;
}

export type JudgeResult = {
  scores: JudgeScore[] | null;
  /** Human-readable failure reason when scores is null. Never contains key material. */
  error: string | null;
};

export async function runJudge(args: {
  outputUrls: string[];
  selfieUrls: string[];
  badgeUrl?: string;
  brassUrl?: string;
}): Promise<JudgeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[judgeNode] GEMINI_API_KEY not set — skipping judge");
    return { scores: null, error: "GEMINI_API_KEY is not set in this deployment's environment" };
  }
  const model = process.env.GEMINI_JUDGE_MODEL?.trim() || "gemini-3-flash";

  const outputParts: GeminiPart[] = [];
  for (let i = 0; i < args.outputUrls.length; i++) {
    const part = await fetchImagePart(args.outputUrls[i]);
    if (!part) {
      console.error("[judgeNode] could not fetch output image", { index: i });
      return { scores: null, error: `Could not fetch output image ${i} for judging` };
    }
    outputParts.push({ text: `OUTPUT ${i}:` }, part);
  }

  const selfieParts: GeminiPart[] = [];
  for (let i = 0; i < args.selfieUrls.length; i++) {
    const part = await fetchImagePart(args.selfieUrls[i]);
    if (part) selfieParts.push({ text: `TRAINING SELFIE ${i}:` }, part);
  }

  const refParts: GeminiPart[] = [];
  if (args.badgeUrl) {
    const part = await fetchImagePart(args.badgeUrl);
    if (part) refParts.push({ text: "BADGE REFERENCE:" }, part);
  }
  if (args.brassUrl) {
    const part = await fetchImagePart(args.brassUrl);
    if (part) refParts.push({ text: "BRASS REFERENCE:" }, part);
  }

  const selfieCount = selfieParts.length / 2;
  const parts: GeminiPart[] = [
    { text: judgeInstructions(args.outputUrls.length, selfieCount) },
    ...outputParts,
    ...selfieParts,
    ...refParts,
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          response_mime_type: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[judgeNode] Gemini API error", { status: res.status, errText: errText.slice(0, 500) });
    return {
      scores: null,
      error: `Gemini API HTTP ${res.status}: ${sanitizeError(errText).slice(0, 300)}`,
    };
  }

  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.thought !== true)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) {
    console.error("[judgeNode] empty judge response");
    return { scores: null, error: "Gemini returned an empty response" };
  }

  const scores = parseScores(text, args.outputUrls.length);
  if (!scores) {
    console.error("[judgeNode] could not parse judge response", { text: text.slice(0, 500) });
    return { scores: null, error: "Could not parse judge response as score JSON" };
  }
  return { scores, error: null };
}

/** Strip anything that looks like an API key from error text before logging to the timeline. */
function sanitizeError(text: string): string {
  return text.replace(/key=[\w-]+/gi, "key=[redacted]").replace(/AIza[\w-]{10,}/g, "[redacted]");
}

const RETRY_DELAYS_MS = [3000, 10000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry wrapper for judge calls: transient Gemini failures (503s, network
 * blips, empty responses) get up to two retries with backoff before the
 * caller falls open. A missing API key is permanent — no retry.
 */
export async function runJudgeWithRetry(
  args: Parameters<typeof runJudge>[0]
): Promise<JudgeResult> {
  let last: JudgeResult = { scores: null, error: "not attempted" };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      last = await runJudge(args);
    } catch (e) {
      last = {
        scores: null,
        error: sanitizeError(e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
      };
    }
    if (last.scores) return last;
    if (last.error?.includes("GEMINI_API_KEY")) return last;
    if (attempt < RETRY_DELAYS_MS.length) {
      console.warn("[judgeNode] judge attempt failed, retrying", {
        attempt: attempt + 1,
        error: last.error,
      });
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  return last;
}

// ---------------------------------------------------------------------------
// Candidate ranking — comparative identity selection over the base-gen pool.
// ---------------------------------------------------------------------------

export type CandidateRanking = {
  /** Candidate indices ordered best identity match first (discards excluded). */
  ranking: number[];
  discarded: Array<{ index: number; reason: string }>;
};

export type RankResult = {
  result: CandidateRanking | null;
  error: string | null;
};

function rankInstructions(candidateCount: number, selfieCount: number): string {
  return [
    `You are selecting the best base portraits for BadgeShot, a Class A fire service portrait service.`,
    `You will see ${candidateCount} CANDIDATE portrait images of the same generation run, then ${selfieCount} SELFIE reference images of the real customer (ground truth).`,
    `Step 1 — DISCARD any candidate with corruption or artifacts: warped or merged facial features, extra/missing limbs or fingers, garbled uniform geometry, duplicated collar, melted ears, or any obviously broken rendering.`,
    `Step 2 — RANK the remaining candidates by IDENTITY match to the selfies, best first. This is COMPARATIVE: judge which candidates look most like the real person relative to each other. Prioritize face shape and proportions (width, jaw, cheekbones), nose and eye structure, and realistic skin texture matching the selfies. Penalize averaged/idealized faces and plastic AI skin.`,
    `Respond with ONLY JSON shaped:`,
    `{"discarded":[{"index":2,"reason":"..."}],"ranking":[5,0,7,1,3,6]}`,
    `The ranking array must contain every candidate index 0..${candidateCount - 1} that you did NOT discard, exactly once, best first.`,
  ].join("\n");
}

function parseRanking(text: string, candidateCount: number): CandidateRanking | null {
  let jsonText = text.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1].trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  const discarded: Array<{ index: number; reason: string }> = [];
  if (Array.isArray(o.discarded)) {
    for (const d of o.discarded) {
      if (d && typeof d === "object") {
        const idx = Number((d as Record<string, unknown>).index);
        if (Number.isInteger(idx) && idx >= 0 && idx < candidateCount) {
          const reason = String((d as Record<string, unknown>).reason ?? "").slice(0, 200);
          discarded.push({ index: idx, reason });
        }
      }
    }
  }
  const discardedSet = new Set(discarded.map((d) => d.index));

  if (!Array.isArray(o.ranking)) return null;
  const seen = new Set<number>();
  const ranking: number[] = [];
  for (const r of o.ranking) {
    const idx = Number(r);
    if (!Number.isInteger(idx) || idx < 0 || idx >= candidateCount) return null;
    if (seen.has(idx) || discardedSet.has(idx)) continue;
    seen.add(idx);
    ranking.push(idx);
  }
  if (ranking.length === 0) return null;
  return { ranking, discarded };
}

export async function rankCandidates(args: {
  candidateUrls: string[];
  selfieUrls: string[];
}): Promise<RankResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { result: null, error: "GEMINI_API_KEY is not set in this deployment's environment" };
  }
  const model = process.env.GEMINI_JUDGE_MODEL?.trim() || "gemini-3-flash";

  const parts: GeminiPart[] = [
    { text: rankInstructions(args.candidateUrls.length, args.selfieUrls.length) },
  ];
  for (let i = 0; i < args.candidateUrls.length; i++) {
    const part = await fetchImagePart(args.candidateUrls[i]);
    if (!part) return { result: null, error: `Could not fetch candidate image ${i}` };
    parts.push({ text: `CANDIDATE ${i}:` }, part);
  }
  for (let i = 0; i < args.selfieUrls.length; i++) {
    const part = await fetchImagePart(args.selfieUrls[i]);
    if (part) parts.push({ text: `SELFIE ${i}:` }, part);
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0, response_mime_type: "application/json" },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      result: null,
      error: `Gemini API HTTP ${res.status}: ${sanitizeError(errText).slice(0, 300)}`,
    };
  }
  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.thought !== true)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) return { result: null, error: "Gemini returned an empty ranking response" };
  const result = parseRanking(text, args.candidateUrls.length);
  if (!result) return { result: null, error: "Could not parse ranking response" };
  return { result, error: null };
}

export async function rankCandidatesWithRetry(
  args: Parameters<typeof rankCandidates>[0]
): Promise<RankResult> {
  let last: RankResult = { result: null, error: "not attempted" };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      last = await rankCandidates(args);
    } catch (e) {
      last = {
        result: null,
        error: sanitizeError(e instanceof Error ? `${e.name}: ${e.message}` : String(e)),
      };
    }
    if (last.result) return last;
    if (last.error?.includes("GEMINI_API_KEY")) return last;
    if (attempt < RETRY_DELAYS_MS.length) {
      console.warn("[judgeNode] ranking attempt failed, retrying", {
        attempt: attempt + 1,
        error: last.error,
      });
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  return last;
}

/**
 * Minimal connectivity check for the admin diagnostic: verifies the key is
 * present in this deployment and that a tiny text-only Gemini call succeeds.
 */
export async function testJudgeConnection(): Promise<{
  ok: boolean;
  keyPresent: boolean;
  model: string;
  detail: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_JUDGE_MODEL?.trim() || "gemini-3-flash";
  if (!apiKey) {
    return {
      ok: false,
      keyPresent: false,
      model,
      detail:
        "GEMINI_API_KEY is not set in this deployment's environment. Add it in Vercel (Production environment) and redeploy.",
    };
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
          // Generous cap: Gemini 3.x spends output tokens on internal thinking
          // first — a tiny cap yields an empty text response.
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        keyPresent: true,
        model,
        detail: `Gemini API HTTP ${res.status}: ${sanitizeError(errText).slice(0, 400)}`,
      };
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    };
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.thought !== true)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return {
      ok: true,
      keyPresent: true,
      model,
      detail: `Key works. Model ${model} responded: "${text.slice(0, 40)}"`,
    };
  } catch (e) {
    return {
      ok: false,
      keyPresent: true,
      model,
      detail: `Request failed: ${sanitizeError(e instanceof Error ? e.message : String(e)).slice(0, 400)}`,
    };
  }
}
