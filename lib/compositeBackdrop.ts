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
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const bgRemovalModel = process.env.FAL_MODEL_BG_REMOVAL ?? "fal-ai/birefnet";
const compositeBucket =
  process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

type CompositeResult = { url: string; error: null } | { url: null; error: string };

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
  backdropUrl: string;
}): Promise<CompositeResult> {
  try {
    const subjectUrl = await removeBackground(args.editedImageUrl);
    if (!subjectUrl) {
      return { url: null, error: "Background removal failed" };
    }

    const [subjectBuf, backdropBuf] = await Promise.all([
      fetchBuffer(subjectUrl),
      fetchBuffer(args.backdropUrl),
    ]);
    if (!subjectBuf) return { url: null, error: "Could not fetch subject cutout" };
    if (!backdropBuf) return { url: null, error: "Could not fetch backdrop asset" };

    const subjectMeta = await sharp(subjectBuf).metadata();
    const width = subjectMeta.width;
    const height = subjectMeta.height;
    if (!width || !height) {
      return { url: null, error: "Could not read subject dimensions" };
    }

    // Backdrop: deterministic cover-crop to the exact output size, subject
    // composited unscaled at origin — identical treatment for all 4 images.
    const backdropResized = await sharp(backdropBuf)
      .resize(width, height, { fit: "cover", position: "centre" })
      .toBuffer();

    const composited = await sharp(backdropResized)
      .composite([{ input: subjectBuf, left: 0, top: 0 }])
      .png()
      .toBuffer();

    const path = `composites/${args.userId}/${args.modelId}/final_${args.index}_${Date.now()}.png`;
    const { error: uploadErr } = await args.supabase.storage
      .from(compositeBucket)
      .upload(path, composited, { contentType: "image/png", upsert: true });
    if (uploadErr) {
      return { url: null, error: `Storage upload failed: ${uploadErr.message}` };
    }

    const { data: pub } = args.supabase.storage.from(compositeBucket).getPublicUrl(path);
    if (!pub.publicUrl) {
      return { url: null, error: "No public URL for composited image" };
    }
    return { url: pub.publicUrl, error: null };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[compositeBackdrop] composite failed", { modelId: args.modelId, index: args.index, msg });
    return { url: null, error: msg };
  }
}
