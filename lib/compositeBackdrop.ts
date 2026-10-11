/**
 * Deterministic backdrop compositing.
 *
 * The Gemini edit now renders subjects on a plain gray background; this module
 * removes that background (fal background-removal endpoint) and composites the
 * transparent subject onto the canonical backdrop PNG with sharp at fixed
 * scale/position, so every output in an order shares a pixel-identical
 * background. Fail-open per image: callers deliver the un-composited edit
 * result if anything here errors.
 */

import sharp from "sharp";
import { finishPassEnabled, pipelineFinishPreset, runFinishPass } from "@/lib/finishPass";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyRealInsignia, describeReports, StoredCutouts } from "@/lib/insigniaService";

const bgRemovalModel = process.env.FAL_MODEL_BG_REMOVAL ?? "fal-ai/birefnet";
const compositeBucket =
  process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

type CompositeResult =
  | { url: string; error: null; insignia?: string; finish?: string; rawUrl?: string }
  | { url: null; error: string; insignia?: string };

/**
 * Studio backdrops that need no asset: drawn as an SVG (soft radial falloff
 * plus low-frequency mottling, like a painted muslin) and rasterised at the
 * exact output size, so they are identical for every portrait in an order.
 */
const STUDIO_BACKDROPS: Record<string, { center: string; mid: string; edge: string; mottle: number }> = {
  formal_blue: { center: "#5b7fb4", mid: "#2f4b7c", edge: "#101c36", mottle: 0.5 },
  neutral_studio: { center: "#b9bcc1", mid: "#8a8d93", edge: "#4a4c51", mottle: 0.28 },
};

export function isStudioBackdrop(key: string): boolean {
  return key in STUDIO_BACKDROPS;
}

export async function renderStudioBackdrop(
  key: string,
  width: number,
  height: number
): Promise<Buffer | null> {
  const spec = STUDIO_BACKDROPS[key];
  if (!spec) return null;
  // Light pool sits behind the head and shoulders (upper-middle of frame).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="g" cx="50%" cy="38%" r="78%">
      <stop offset="0%" stop-color="${spec.center}"/>
      <stop offset="52%" stop-color="${spec.mid}"/>
      <stop offset="100%" stop-color="${spec.edge}"/>
    </radialGradient>
    <filter id="m" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${(2.2 / Math.max(width, height)).toFixed(5)}" numOctaves="3" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.25"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect width="100%" height="100%" filter="url(#m)" opacity="${spec.mottle * 0.22}"/>
</svg>`;
  return sharp(Buffer.from(svg)).resize(width, height, { fit: "fill" }).blur(1.2).png().toBuffer();
}

async function removeBackground(imageUrl: string): Promise<string | null> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error("[compositeBackdrop] FAL_KEY missing");
    return null;
  }
  const res = await fetch(`https://fal.run/${bgRemovalModel}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image_url: imageUrl }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[compositeBackdrop] bg removal failed", {
      status: res.status,
      errText: errText.slice(0, 300),
    });
    return null;
  }
  const body = (await res.json()) as Record<string, unknown>;
  const image = body.image;
  if (image && typeof image === "object" && "url" in image) {
    const u = (image as { url?: unknown }).url;
    if (typeof u === "string" && u.trim()) return u.trim();
  }
  const images = body.images;
  if (Array.isArray(images) && images[0] && typeof images[0] === "object" && "url" in (images[0] as object)) {
    const u = (images[0] as { url?: unknown }).url;
    if (typeof u === "string" && u.trim()) return u.trim();
  }
  console.error("[compositeBackdrop] unexpected bg removal response shape");
  return null;
}

/** Upload a JPEG to the composite bucket and return its public URL. */
export async function uploadJpeg(
  supabase: SupabaseClient<Database>,
  path: string,
  buf: Buffer
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(compositeBucket)
    .upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.error("[compositeBackdrop] upload failed", { path, error: error.message });
    return null;
  }
  const { data } = supabase.storage.from(compositeBucket).getPublicUrl(path);
  return data.publicUrl || null;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Composite one edited output onto the canonical backdrop.
 * Output keeps the edited image's exact dimensions.
 */
export async function compositeOntoBackdrop(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  modelId: number;
  index: number;
  editedImageUrl: string;
  /** Backdrop image URL (flag) — ignored when `backgroundKey` is a studio backdrop. */
  backdropUrl?: string;
  /** Order's backdrop choice; studio keys are rendered, others use `backdropUrl`. */
  backgroundKey?: string;
  /**
   * When given, the badge and patch the edit model drew are replaced with
   * the customer's real ones before the backdrop goes in.
   */
  insignia?: { stored: StoredCutouts; badgeUrl?: string; patchUrl?: string };
  /** Set false to skip the finishing pass (the operator's bake-off does its own). */
  finish?: boolean;
}): Promise<CompositeResult> {
  try {
    const subjectUrl = await removeBackground(args.editedImageUrl);
    if (!subjectUrl) {
      return { url: null, error: "Background removal failed" };
    }

    const studio = args.backgroundKey ? isStudioBackdrop(args.backgroundKey) : false;
    if (!studio && !args.backdropUrl) {
      return { url: null, error: "No backdrop available for this order" };
    }

    const [subjectFetched, fetchedBackdrop] = await Promise.all([
      fetchBuffer(subjectUrl),
      studio ? Promise.resolve(null) : fetchBuffer(args.backdropUrl!),
    ]);
    if (!subjectFetched) return { url: null, error: "Could not fetch subject cutout" };

    // Real insignia over the drawn ones. Never blocks delivery: on any
    // problem the portrait goes out with the model's insignia.
    let subjectBuf: Buffer = subjectFetched;
    let insigniaNote: string | undefined;
    if (args.insignia) {
      try {
        const placed = await applyRealInsignia({ subject: subjectFetched, ...args.insignia });
        subjectBuf = placed.image;
        insigniaNote = describeReports(placed.reports);
      } catch (e) {
        insigniaNote = `placement failed: ${e instanceof Error ? e.message : String(e)}`;
        console.error("[compositeBackdrop] insignia placement failed", { modelId: args.modelId, e });
      }
    }

    const subjectMeta = await sharp(subjectBuf).metadata();
    const width = subjectMeta.width;
    const height = subjectMeta.height;
    if (!width || !height) {
      return { url: null, error: "Could not read subject dimensions" };
    }

    // Backdrop at the exact output size, subject composited unscaled at the
    // origin — identical treatment for every portrait in the order.
    const backdropResized = studio
      ? await renderStudioBackdrop(args.backgroundKey!, width, height)
      : fetchedBackdrop
      ? await sharp(fetchedBackdrop).resize(width, height, { fit: "cover", position: "centre" }).toBuffer()
      : null;
    if (!backdropResized) return { url: null, error: "Could not prepare the backdrop" };

    // High-quality JPEG: a 2K portrait is ~1 MB instead of ~7 MB as PNG, which
    // matters for storage quota and for customers downloading on a phone.
    const composited = await sharp(backdropResized)
      .composite([{ input: subjectBuf, left: 0, top: 0 }])
      .flatten({ background: "#000000" })
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toBuffer();

    const stamp = Date.now();
    const rawPath = `composites/${args.userId}/${args.modelId}/raw_${args.index}_${stamp}.jpg`;
    const rawUrl = await uploadJpeg(args.supabase, rawPath, composited);
    if (!rawUrl) return { url: null, error: "Storage upload failed" };

    // Finishing pass (upscale + skin/eye detail). The un-finished composite
    // stays in storage as raw_*, so the operator can compare or fall back.
    let finishNote: string | undefined;
    let finalBuf = composited;
    if (args.finish !== false && finishPassEnabled()) {
      const preset = pipelineFinishPreset();
      const finished = await runFinishPass(rawUrl, preset);
      if (finished.ok) {
        finalBuf = finished.buffer;
        finishNote = `finished with ${preset.id} in ${Math.round(finished.ms / 1000)}s`;
      } else {
        finishNote = `finish skipped (${finished.error})`;
        console.error("[compositeBackdrop] finish pass failed, shipping the raw composite", {
          modelId: args.modelId,
          index: args.index,
          error: finished.error,
        });
      }
    }

    const path = `composites/${args.userId}/${args.modelId}/final_${args.index}_${stamp}.jpg`;
    const finalUrl = await uploadJpeg(args.supabase, path, finalBuf);
    if (!finalUrl) return { url: null, error: "Storage upload failed" };
    return { url: finalUrl, error: null, insignia: insigniaNote, finish: finishNote, rawUrl };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[compositeBackdrop] composite failed", { modelId: args.modelId, index: args.index, msg });
    return { url: null, error: msg };
  }
}
