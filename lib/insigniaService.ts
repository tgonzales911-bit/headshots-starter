import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { geminiGenerateJson } from "@/lib/gemini";
import {
  Box,
  InsigniaKind,
  PlacementReport,
  PreparedCutout,
  guessInsigniaBoxes,
  placeInsignia,
  prepareCutout,
} from "@/lib/insigniaPlacement";

/**
 * Glue around lib/insigniaPlacement: getting the real cutouts for an order,
 * asking a vision model roughly where the drawn insignia are on a portrait,
 * and applying the swap. INSIGNIA_PLACEMENT=off disables all of it.
 */

const BUCKET = process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";
const bgRemovalModel = process.env.FAL_MODEL_BG_REMOVAL ?? "fal-ai/birefnet";

export function insigniaPlacementEnabled(): boolean {
  return process.env.INSIGNIA_PLACEMENT?.trim().toLowerCase() !== "off";
}

/** What is saved on the order for each real insignia. */
export type StoredCutout = {
  url: string;
  width: number;
  height: number;
  core: Box;
  coreLuma: number;
};

export type StoredCutouts = Partial<Record<InsigniaKind, StoredCutout>>;

function isBox(v: unknown): v is Box {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((k) => typeof b[k] === "number" && Number.isFinite(b[k] as number));
}

export function parseStoredCutouts(raw: unknown): StoredCutouts {
  const out: StoredCutouts = {};
  if (!raw || typeof raw !== "object") return out;
  for (const kind of ["badge", "patch"] as InsigniaKind[]) {
    const c = (raw as Record<string, unknown>)[kind] as Record<string, unknown> | undefined;
    if (
      c &&
      typeof c.url === "string" &&
      typeof c.width === "number" &&
      typeof c.height === "number" &&
      typeof c.coreLuma === "number" &&
      isBox(c.core)
    ) {
      out[kind] = { url: c.url, width: c.width, height: c.height, core: c.core, coreLuma: c.coreLuma };
    }
  }
  return out;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function removeBackground(imageUrl: string): Promise<Buffer | null> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) return null;
  try {
    const res = await fetch(`https://fal.run/${bgRemovalModel}`, {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      console.error("[insignia] background removal failed", { status: res.status });
      return null;
    }
    const body = (await res.json()) as Record<string, unknown>;
    const image = body.image as { url?: unknown } | undefined;
    const images = body.images as Array<{ url?: unknown }> | undefined;
    const url =
      typeof image?.url === "string" ? image.url : typeof images?.[0]?.url === "string" ? (images[0].url as string) : null;
    return url ? fetchBuffer(url) : null;
  } catch (e) {
    console.error("[insignia] background removal error", e);
    return null;
  }
}

/** Cut one real insignia out of the customer's photo of it. */
async function cutoutFromPhoto(photoUrl: string): Promise<PreparedCutout | null> {
  const removed = await removeBackground(photoUrl);
  if (!removed) return null;
  try {
    return await prepareCutout(removed);
  } catch (e) {
    console.error("[insignia] cutout preparation failed", e);
    return null;
  }
}

/**
 * Cut out the order's real badge and patch and save them, so every portrait
 * in the order uses the same pixels. Call before any edit is submitted.
 */
export async function prepareOrderCutouts(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  modelId: number;
  badgeUrl?: string;
  patchUrl?: string;
}): Promise<StoredCutouts> {
  const out: StoredCutouts = {};
  if (!insigniaPlacementEnabled()) return out;
  const jobs: Array<[InsigniaKind, string | undefined]> = [
    ["badge", args.badgeUrl],
    ["patch", args.patchUrl],
  ];
  await Promise.all(
    jobs.map(async ([kind, url]) => {
      if (!url) return;
      const cut = await cutoutFromPhoto(url);
      if (!cut) return;
      const path = `${args.userId}/${args.modelId}/insignia/${kind}_${Date.now()}.png`;
      const { error } = await args.supabase.storage
        .from(BUCKET)
        .upload(path, cut.png, { contentType: "image/png", upsert: true });
      if (error) {
        console.error("[insignia] cutout upload failed", { kind, error: error.message });
        return;
      }
      out[kind] = {
        url: args.supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
        width: cut.width,
        height: cut.height,
        core: cut.core,
        coreLuma: cut.coreLuma,
      };
    })
  );
  return out;
}

async function loadCutout(
  stored: StoredCutout | undefined,
  photoUrl: string | undefined
): Promise<PreparedCutout | null> {
  if (stored) {
    const png = await fetchBuffer(stored.url);
    if (png) {
      return { png, width: stored.width, height: stored.height, core: stored.core, coreLuma: stored.coreLuma };
    }
  }
  // Orders started before cutouts were saved: make one for this image only.
  return photoUrl ? cutoutFromPhoto(photoUrl) : null;
}

function locateInstructions(): string {
  return [
    "This is a formal portrait of a firefighter in a dark dress uniform jacket.",
    "Find two things on the jacket and return ONLY JSON shaped:",
    '{"badge":[ymin,xmin,ymax,xmax],"patch":[ymin,xmin,ymax,xmax]}',
    "- badge: the metal badge pinned on the chest.",
    "- patch: the embroidered patch sewn on the upper sleeve, including its stitched border, as much of it as is visible.",
    "Each box is integers 0-1000 normalised to the image height and width, drawn tightly around the whole item. Use null for an item that is not there.",
    "Do not box the small pins on the collar, the buttons or the sleeve stripes.",
  ].join("\n");
}

function toBox(raw: unknown, width: number, height: number): Box | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const n = raw.map((v) => Number(v));
  if (n.some((v) => !Number.isFinite(v) || v < 0 || v > 1000)) return null;
  const [ymin, xmin, ymax, xmax] = n;
  if (ymax - ymin < 8 || xmax - xmin < 8) return null;
  return {
    x: (xmin / 1000) * width,
    y: (ymin / 1000) * height,
    w: ((xmax - xmin) / 1000) * width,
    h: ((ymax - ymin) / 1000) * height,
  };
}

/** Rough boxes for the drawn badge and patch, in pixels of the full image. */
export async function locateInsignia(
  image: Buffer
): Promise<Partial<Record<InsigniaKind, Box | null>>> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return {};
  const small = await sharp(image)
    .flatten({ background: "#808080" })
    .resize({ width: 1280, height: 1280, fit: "inside" })
    .jpeg({ quality: 88 })
    .toBuffer();
  const { text } = await geminiGenerateJson(
    [{ text: locateInstructions() }, { inline_data: { mime_type: "image/jpeg", data: small.toString("base64") } }],
    { fast: true }
  );
  if (!text) return {};
  try {
    const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
    return { badge: toBox(json.badge, width, height), patch: toBox(json.patch, width, height) };
  } catch {
    return {};
  }
}

/**
 * Swap the drawn badge and patch on one portrait for the real ones.
 * `subject` is the portrait with its background removed (RGBA, full size).
 * Returns the original buffer untouched if nothing could be placed.
 */
export async function applyRealInsignia(args: {
  subject: Buffer;
  stored: StoredCutouts;
  badgeUrl?: string;
  patchUrl?: string;
}): Promise<{ image: Buffer; reports: PlacementReport[] }> {
  if (!insigniaPlacementEnabled()) return { image: args.subject, reports: [] };
  const [guessed, badge, patch] = await Promise.all([
    guessInsigniaBoxes(args.subject),
    loadCutout(args.stored.badge, args.badgeUrl),
    loadCutout(args.stored.patch, args.patchUrl),
  ]);
  const cutouts = { badge, patch };

  // First from the image alone. This needs no outside service, so it keeps
  // working when the vision model is over quota or down.
  let result = await placeInsignia({ image: args.subject, boxes: guessed, cutouts });

  // Only what that missed is worth a vision-model call.
  const missed = result.reports.filter((r) => !r.placed && cutouts[r.kind]).map((r) => r.kind);
  if (missed.length > 0) {
    const located = await locateInsignia(args.subject).catch(() => ({} as Partial<Record<InsigniaKind, Box | null>>));
    const retryBoxes: Partial<Record<InsigniaKind, Box | null>> = {};
    for (const kind of missed) if (located[kind]) retryBoxes[kind] = located[kind];
    if (Object.keys(retryBoxes).length > 0) {
      const second = await placeInsignia({ image: result.image, boxes: retryBoxes, cutouts });
      const byKind = new Map(second.reports.map((r) => [r.kind, r]));
      result = {
        image: second.image,
        reports: result.reports.map((r) => (r.placed ? r : byKind.get(r.kind)?.placed ? byKind.get(r.kind)! : r)),
      };
    }
  }
  if (!result.reports.some((r) => r.placed)) return { image: args.subject, reports: result.reports };
  return result;
}

export function describeReports(reports: PlacementReport[]): string {
  if (reports.length === 0) return "Real-insignia placement is off";
  return reports
    .map((r) => (r.placed ? `real ${r.kind} placed` : `${r.kind} left as drawn (${r.reason ?? "unknown"})`))
    .join("; ");
}
