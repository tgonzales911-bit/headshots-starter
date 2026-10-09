import sharp from "sharp";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { geminiGenerateJson, GeminiPart } from "@/lib/gemini";

/**
 * Identity preparation.
 *
 * Customer selfies arrive as whole phone photos: arm's-length wide-angle
 * shots and waist-up photos where the face is a small part of the frame.
 * Trained on as-is, with nothing but a trigger word for a caption, the
 * face model learns "a bald man" rather than THIS man — the first order run
 * on this pipeline lost the customer's goatee and came back as a stranger.
 *
 * This module looks at every selfie once (Gemini vision) and produces:
 *   - a head-and-shoulders crop of each photo, so the face fills the frame;
 *   - a caption per photo that names what is incidental (clothes, wall,
 *     angle), so training attributes those to the caption and the rest —
 *     the face — to the trigger word;
 *   - one short description of the person's lasting appearance (hair,
 *     facial hair, glasses, build, apparent age) for the portrait prompt;
 *   - the few sharpest, most frontal crops, used as identity references by
 *     the edit step and the quality judge.
 *
 * Everything here fails open: a photo Gemini cannot read is used whole, and
 * if Gemini is unavailable the order runs exactly as it did before.
 */

export type IdentityPhoto = {
  /** Original selfie URL. */
  source: string;
  /** Public URL of the head-and-shoulders crop (absent if no face was found). */
  face_url?: string;
  /** Caption for training (without the trigger word). */
  caption?: string;
  /** Share of the original frame the face box covers, 0–1. */
  face_area?: number;
  /** 1–10: how useful this photo is as an identity reference. */
  quality?: number;
  frontal?: boolean;
};

export type IdentityProfile = {
  version: 1;
  /** "man" | "woman" | "person" — the class noun used beside the trigger word. */
  noun: string;
  /** Lasting appearance, e.g. "bald man in his late 40s with a dark chin goatee". */
  descriptor: string;
  photos: IdentityPhoto[];
  /** Best identity reference crops, best first. */
  reference_urls: string[];
};

const BUCKET = "training-datasets";
const CROP_SIZE = 1024;
const MAX_REFERENCES = 4;
/** Time allowed for looking at the customer's photos before carrying on with what we have. */
const ANALYSIS_BUDGET_MS = 60_000;

async function geminiJson(parts: GeminiPart[]): Promise<unknown | null> {
  const { text } = await geminiGenerateJson(parts, { fast: true });
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
}

function photoInstructions(): string {
  return [
    "This is one of several photos a customer uploaded of themselves so a formal portrait can be made of them.",
    "Return ONLY JSON shaped:",
    '{"face_box":[ymin,xmin,ymax,xmax],"caption":"...","quality":7,"frontal":true}',
    "- face_box: the box around the main person's face, from the top of the forehead (or hairline) to the bottom of the chin and ear to ear, as integers 0-1000 normalised to the image height and width. Use null if no face is clearly visible.",
    "- caption: one plain sentence describing ONLY what is incidental in this photo: what they are wearing, the camera angle and distance, their expression, the lighting and the background. Do NOT describe the face, hair, facial hair, skin, age or body. Refer to the person as [SUBJECT]. Example: \"[SUBJECT] wearing a gray hoodie, close-up selfie from slightly below, slight smile, indoor light, white door behind\".",
    "- quality: integer 1-10 for how useful this photo is as a reference for the person's true face: sharp focus, even light, face large in frame, eyes open, neutral or lightly smiling expression, no heavy lens distortion from an arm's-length phone shot.",
    "- frontal: true if the face is turned no more than about 30 degrees from the camera.",
  ].join("\n");
}

function descriptorInstructions(count: number): string {
  return [
    `These ${count} photos are all of the same customer, who uploaded them so a formal portrait can be made of them.`,
    "Describe only the lasting, visible appearance that every portrait of this person must reproduce. Return ONLY JSON shaped:",
    '{"noun":"man","descriptor":"..."}',
    '- noun: "man", "woman" or "person".',
    "- descriptor: one phrase of at most 40 words, starting with the noun, covering: hair (or a bald or shaved head) and its colour, facial hair exactly as worn (style, where on the face, colour — or clean-shaven), glasses if worn in most photos, apparent age as a decade (\"in his late 40s\"), face shape and build (for example \"broad face, stocky build\"). Do not describe skin tone or complexion. Describe what is consistently there across the photos. Do not mention clothing, tattoos, expression or background. Do not guess at ethnicity or anything not visible.",
    'Example: "bald man in his late 40s with a dark chin goatee and light stubble, broad face with a strong jaw, stocky build".',
  ].join("\n");
}

type Box = { top: number; left: number; height: number; width: number };

/** Head-and-shoulders square around a face box, clamped to the image. */
function headAndShouldersCrop(
  box: [number, number, number, number],
  imgW: number,
  imgH: number
): Box {
  const [ymin, xmin, ymax, xmax] = box;
  const fx0 = (xmin / 1000) * imgW;
  const fx1 = (xmax / 1000) * imgW;
  const fy0 = (ymin / 1000) * imgH;
  const fy1 = (ymax / 1000) * imgH;
  const fw = Math.max(1, fx1 - fx0);
  const fh = Math.max(1, fy1 - fy0);
  const cx = (fx0 + fx1) / 2;
  // The face takes roughly the middle 45% of the crop: room for the whole
  // head above and the neck and shoulders below.
  let side = Math.max(fw, fh) * 2.2;
  side = Math.min(side, imgW, imgH);
  let left = cx - side / 2;
  let top = fy0 - side * 0.24;
  left = Math.max(0, Math.min(left, imgW - side));
  top = Math.max(0, Math.min(top, imgH - side));
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.floor(side),
    height: Math.floor(side),
  };
}

function validBox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const n = raw.map((v) => Number(v));
  if (n.some((v) => !Number.isFinite(v) || v < 0 || v > 1000)) return null;
  const [ymin, xmin, ymax, xmax] = n;
  if (ymax - ymin < 20 || xmax - xmin < 20) return null;
  return [ymin, xmin, ymax, xmax];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export function parseIdentityProfile(raw: unknown): IdentityProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.photos)) return null;
  return {
    version: 1,
    noun: typeof o.noun === "string" && o.noun ? o.noun : "person",
    descriptor: typeof o.descriptor === "string" ? o.descriptor : "",
    photos: o.photos as IdentityPhoto[],
    reference_urls: (Array.isArray(o.reference_urls) ? o.reference_urls : []).filter(
      (u): u is string => typeof u === "string" && u.length > 0
    ),
  };
}

/**
 * Analyse the customer's selfies. Returns null when nothing useful could be
 * learned (no Gemini key, or every call failed) so callers fall back to the
 * plain behaviour.
 */
function batchInstructions(count: number): string {
  return [
    `These ${count} photos (labelled PHOTO 0 to PHOTO ${count - 1}) are all of the same customer, who uploaded them so a formal portrait can be made of them.`,
    "Return ONLY JSON shaped:",
    '{"noun":"man","descriptor":"...","photos":[{"index":0,"face_box":[ymin,xmin,ymax,xmax],"caption":"...","quality":7,"frontal":true}]}',
    "with exactly one entry in photos for every photo, in order.",
    '- noun: "man", "woman" or "person".',
    "- descriptor: one phrase of at most 40 words, starting with the noun, covering what is consistently there across the photos: hair (or a bald or shaved head) and its colour, facial hair exactly as worn (style, where on the face, colour, or clean-shaven), glasses if worn in most photos, apparent age as a decade, face shape and build. Do not describe skin tone, clothing, tattoos, expression or background, and do not guess at ethnicity.",
    "For each photo:",
    "- face_box: the box around the main person's face, from the top of the forehead (or hairline) to the bottom of the chin and ear to ear, as integers 0-1000 normalised to that photo's height and width. Use null if no face is clearly visible.",
    "- caption: one plain sentence describing ONLY what is incidental: what they are wearing, the camera angle and distance, their expression, the lighting and the background. Refer to the person as [SUBJECT].",
    "- quality: integer 1-10 for how good this photo is as the starting point for a formal portrait of this person: sharp focus, even light on the face, eyes open and looking at the camera, head level and upright, neutral or lightly smiling expression, and taken from far enough that the face is not distorted. Score an arm's-length selfie from below, a tilted or turned head, a dim photo or a squint at 5 or lower.",
    "- frontal: true only if the face is turned no more than about 20 degrees from the camera and the head is not tilted.",
  ].join("\n");
}

/**
 * Analyse the customer's selfies. Returns null when nothing useful could be
 * learned (no Gemini key, or the call failed) so callers fall back to the
 * plain behaviour.
 *
 * One vision call covers every photo. The first version asked one question
 * per photo; an order of eighteen photos then cost nineteen requests and a
 * few orders used up the day's quota, which silently switched off photo
 * selection, insignia placement and the quality check together.
 */
export async function buildIdentityProfile(args: {
  selfieUrls: string[];
  userId: string;
  modelId: number;
}): Promise<IdentityProfile | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const supabase = admin();
  const stamp = Date.now();

  type Loaded = { source: string; upright: Buffer; w: number; h: number; small: Buffer } | null;
  const loaded = await mapLimit<string, Loaded>(args.selfieUrls, 8, async (source) => {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      // Bake in the phone's rotation so box coordinates and pixels agree.
      const upright = await sharp(Buffer.from(await res.arrayBuffer())).rotate().jpeg({ quality: 92 }).toBuffer();
      const meta = await sharp(upright).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (!w || !h) return null;
      const small = await sharp(upright).resize({ width: 640, height: 640, fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
      return { source, upright, w, h, small };
    } catch {
      return null;
    }
  });
  const usable = loaded.filter((l): l is NonNullable<Loaded> => l !== null);
  if (usable.length === 0) return null;

  const parts: GeminiPart[] = [{ text: batchInstructions(usable.length) }];
  usable.forEach((l, i) => {
    parts.push({ text: `PHOTO ${i}:` }, { inline_data: { mime_type: "image/jpeg", data: l.small.toString("base64") } });
  });
  const answer = (await geminiJson(parts)) as Record<string, unknown> | null;
  if (!answer || !Array.isArray(answer.photos)) return null;

  type Analysed = IdentityPhoto & { cropBuf?: Buffer };
  const byIndex = new Map<number, Record<string, unknown>>();
  for (const p of answer.photos as Array<Record<string, unknown>>) {
    const idx = Number(p?.index);
    if (Number.isInteger(idx)) byIndex.set(idx, p);
  }

  const analysed = await mapLimit(usable, 6, async (l, i): Promise<Analysed> => {
    const photo: Analysed = { source: l.source };
    const json = byIndex.get(i);
    if (!json) return photo;
    try {
      if (typeof json.caption === "string" && json.caption.trim()) {
        photo.caption = json.caption.trim().slice(0, 300);
      }
      const q = Number(json.quality);
      if (Number.isFinite(q)) photo.quality = Math.max(1, Math.min(10, Math.round(q)));
      photo.frontal = json.frontal === true;

      const box = validBox(json.face_box);
      if (!box) return photo;
      photo.face_area = ((box[2] - box[0]) / 1000) * ((box[3] - box[1]) / 1000);

      const crop = headAndShouldersCrop(box, l.w, l.h);
      const cropBuf = await sharp(l.upright)
        .extract(crop)
        .resize({ width: CROP_SIZE, height: CROP_SIZE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 93, chromaSubsampling: "4:4:4" })
        .toBuffer();
      photo.cropBuf = cropBuf;

      const path = `${args.userId}/${args.modelId}/identity/face_${String(i + 1).padStart(2, "0")}_${stamp}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, cropBuf, { contentType: "image/jpeg", upsert: true });
      if (!error) {
        photo.face_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
    } catch (e) {
      console.error("[identityPrep] photo failed (not used as a reference)", { i, e });
    }
    return photo;
  });

  const withFace = analysed.filter((p) => p.face_url && p.cropBuf);
  if (withFace.length === 0) return null;

  // Portrait sources: frontal first, then by quality.
  const ranked = [...withFace].sort((a, b) => {
    const fa = a.frontal ? 1 : 0;
    const fb = b.frontal ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return (b.quality ?? 0) - (a.quality ?? 0);
  });

  const nounRaw = typeof answer.noun === "string" ? answer.noun.trim().toLowerCase() : "";
  const noun = ["man", "woman", "person"].includes(nounRaw) ? nounRaw : "person";
  const descriptor =
    typeof answer.descriptor === "string"
      ? answer.descriptor.replace(/\s+/g, " ").trim().replace(/[.]+$/, "").slice(0, 320)
      : "";

  return {
    version: 1,
    noun,
    descriptor,
    photos: analysed.map(({ cropBuf: _drop, ...rest }) => rest),
    reference_urls: ranked.slice(0, MAX_REFERENCES).map((p) => p.face_url as string),
  };
}

/** Caption written beside each training image. */
export function trainingCaption(trigger: string, noun: string, caption?: string): string {
  const subject = `${trigger} ${noun}`;
  if (!caption) return `photo of ${subject}`;
  const body = caption.includes("[SUBJECT]")
    ? caption.replace(/\[SUBJECT\]/g, subject)
    : `${subject}, ${caption}`;
  return `photo of ${body}`.replace(/\s+/g, " ").trim();
}

/** A face smaller than this share of the frame also contributes its whole photo (build and posture). */
export const WHOLE_PHOTO_FACE_AREA = 0.06;
