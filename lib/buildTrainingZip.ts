import JSZip from "jszip";
import {
  IdentityProfile,
  trainingCaption,
  WHOLE_PHOTO_FACE_AREA,
} from "@/lib/identityPrep";

function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return ".jpg";
  const ct = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct === "image/png") return ".png";
  if (ct === "image/gif") return ".gif";
  if (ct === "image/webp") return ".webp";
  if (ct === "image/jpeg" || ct === "image/jpg") return ".jpg";
  return ".jpg";
}

async function download(url: string, label: string): Promise<{ buf: Buffer; ext: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download training image ${label}: ${res.status}`);
  }
  return {
    buf: Buffer.from(await res.arrayBuffer()),
    ext: extensionFromContentType(res.headers.get("content-type")),
  };
}

/**
 * Builds the training archive for the face model.
 *
 * With an identity profile, each photo goes in as a head-and-shoulders crop
 * (the face fills the frame) with a caption file beside it; photos where the
 * face was small also go in whole, so build and posture are learned too.
 * Without a profile (analysis unavailable) the photos go in as uploaded.
 */
export async function buildTrainingZipFromImageUrls(
  urls: string[],
  opts?: { profile?: IdentityProfile | null; trigger?: string }
): Promise<Buffer> {
  const zip = new JSZip();
  const profile = opts?.profile ?? null;
  const trigger = opts?.trigger ?? "";
  const bySource = new Map((profile?.photos ?? []).map((p) => [p.source, p]));

  let n = 0;
  const add = (buf: Buffer, ext: string, caption?: string) => {
    n += 1;
    const stem = `image_${String(n).padStart(2, "0")}`;
    zip.file(`${stem}${ext}`, buf);
    if (caption) zip.file(`${stem}.txt`, caption);
  };

  for (let i = 0; i < urls.length; i++) {
    const photo = bySource.get(urls[i]);
    const caption =
      profile && trigger ? trainingCaption(trigger, profile.noun, photo?.caption) : undefined;

    if (photo?.face_url) {
      let cropped = false;
      try {
        const crop = await download(photo.face_url, `${i + 1} (crop)`);
        add(crop.buf, ".jpg", caption);
        cropped = true;
      } catch (e) {
        console.error("[buildTrainingZip] crop unavailable, using the whole photo", { i, e });
      }
      if (cropped && (photo.face_area ?? 1) >= WHOLE_PHOTO_FACE_AREA) continue;
    }

    const whole = await download(urls[i], String(i + 1));
    add(whole.buf, whole.ext, caption);
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
