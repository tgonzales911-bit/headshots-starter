/**
 * Finishing pass: the last step before a portrait is stored.
 *
 * The re-dress edit re-renders every pixel of the customer's photo, which
 * leaves skin soft and waxy, and it works at 2K (1792×2400), which is only
 * 6×8 inches at print resolution. This pass upscales the finished composite
 * to 2× (3584×4800, a true 8×10 at 300 dpi and beyond) and restores skin and
 * eye detail with a photo-restoration model rather than a generative one, so
 * the real badge and patch that were just placed stay pixel-accurate.
 *
 * It never blocks delivery: on any failure the un-finished composite ships.
 *
 *   FINISH_PASS=off        skip the pass entirely
 *   FINISH_PRESET=<id>     which preset the pipeline uses (default below)
 */

export type FinishPreset = {
  id: string;
  label: string;
  /** fal endpoint id */
  model: string;
  input: Record<string, unknown>;
  /** Approximate cost per portrait at 2K→4K, for the operator's bake-off page. */
  approxCostUsd: number;
  /** Generative models can redraw lettering on the insignia; flagged so the operator knows. */
  generative: boolean;
};

const TOPAZ = "fal-ai/topaz/upscale/image";

export const FINISH_PRESETS: FinishPreset[] = [
  {
    id: "topaz-standard",
    label: "Topaz Standard V2, face enhance 0.6",
    model: TOPAZ,
    input: {
      model: "Standard V2",
      upscale_factor: 2,
      face_enhancement: true,
      face_enhancement_strength: 0.6,
      face_enhancement_creativity: 0,
      subject_detection: "Foreground",
      output_format: "jpeg",
    },
    approxCostUsd: 0.08,
    generative: false,
  },
  {
    id: "topaz-standard-strong",
    label: "Topaz Standard V2, face enhance 0.9",
    model: TOPAZ,
    input: {
      model: "Standard V2",
      upscale_factor: 2,
      face_enhancement: true,
      face_enhancement_strength: 0.9,
      face_enhancement_creativity: 0,
      subject_detection: "Foreground",
      output_format: "jpeg",
    },
    approxCostUsd: 0.08,
    generative: false,
  },
  {
    id: "topaz-hifi",
    label: "Topaz High Fidelity V2, face enhance 0.6",
    model: TOPAZ,
    input: {
      model: "High Fidelity V2",
      upscale_factor: 2,
      face_enhancement: true,
      face_enhancement_strength: 0.6,
      face_enhancement_creativity: 0,
      subject_detection: "Foreground",
      output_format: "jpeg",
    },
    approxCostUsd: 0.08,
    generative: false,
  },
  {
    id: "topaz-no-face",
    label: "Topaz Standard V2, upscale only (no face enhance)",
    model: TOPAZ,
    input: {
      model: "Standard V2",
      upscale_factor: 2,
      face_enhancement: false,
      output_format: "jpeg",
    },
    approxCostUsd: 0.08,
    generative: false,
  },
  {
    id: "clarity-soft",
    label: "Clarity upscaler, creativity 0.2 (generative)",
    model: "fal-ai/clarity-upscaler",
    input: {
      prompt:
        "professional studio portrait photograph, natural skin texture with fine pores, sharp eyes, dress uniform, photographic detail",
      negative_prompt: "(worst quality, low quality, normal quality:2), painting, smooth plastic skin, cartoon",
      creativity: 0.2,
      resemblance: 0.85,
      upscale_factor: 2,
      num_inference_steps: 18,
    },
    approxCostUsd: 0.52,
    generative: true,
  },
];

export const DEFAULT_FINISH_PRESET = "topaz-standard";

export function finishPassEnabled(): boolean {
  return (process.env.FINISH_PASS ?? "on").trim().toLowerCase() !== "off";
}

export function pipelineFinishPreset(): FinishPreset {
  const id = (process.env.FINISH_PRESET ?? DEFAULT_FINISH_PRESET).trim();
  return FINISH_PRESETS.find((p) => p.id === id) ?? FINISH_PRESETS[0];
}

export function findFinishPreset(id: string): FinishPreset | undefined {
  return FINISH_PRESETS.find((p) => p.id === id);
}

export type FinishResult =
  | { ok: true; buffer: Buffer; width?: number; height?: number; ms: number }
  | { ok: false; error: string; ms: number };

function pickImageUrl(body: Record<string, unknown>): string | null {
  const one = body.image;
  if (one && typeof one === "object" && typeof (one as { url?: unknown }).url === "string") {
    return (one as { url: string }).url;
  }
  const many = body.images;
  if (Array.isArray(many) && many[0] && typeof (many[0] as { url?: unknown }).url === "string") {
    return (many[0] as { url: string }).url;
  }
  return null;
}

/**
 * Run one preset on a publicly fetchable image. Synchronous fal call with a
 * hard timeout; the caller decides what to do when it fails.
 */
export async function runFinishPass(
  imageUrl: string,
  preset: FinishPreset,
  opts?: { timeoutMs?: number }
): Promise<FinishResult> {
  const started = Date.now();
  const falKey = process.env.FAL_KEY;
  if (!falKey) return { ok: false, error: "FAL_KEY missing", ms: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 170_000);
  try {
    const res = await fetch(`https://fal.run/${preset.model}`, {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, ...preset.input }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `${preset.model} ${res.status}: ${text.slice(0, 200)}`, ms: Date.now() - started };
    }
    const body = (await res.json()) as Record<string, unknown>;
    const outUrl = pickImageUrl(body);
    if (!outUrl) return { ok: false, error: "no image in response", ms: Date.now() - started };

    const img = await fetch(outUrl, { signal: controller.signal });
    if (!img.ok) return { ok: false, error: `fetch result ${img.status}`, ms: Date.now() - started };
    const buffer = Buffer.from(await img.arrayBuffer());
    const meta = (body.image ?? {}) as { width?: number; height?: number };
    return { ok: true, buffer, width: meta.width, height: meta.height, ms: Date.now() - started };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "timed out" : e instanceof Error ? e.message : String(e),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
