import { SUPPORT_EMAIL } from "@/lib/site";
import { MAX_TRAINING_IMAGE_UPLOAD_BYTES } from "@/lib/trainingUploadLimits";

export type PhotoKind = "selfie" | "reference";

/** Long-side pixel cap and JPEG quality per kind. Insignia keep more detail. */
const PREP: Record<PhotoKind, { maxLongSide: number; quality: number }> = {
  selfie: { maxLongSide: 1536, quality: 0.9 },
  reference: { maxLongSide: 2400, quality: 0.92 },
};

/** Largest original we will try to open in the browser before resizing. */
export const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/webp": [".webp"],
};

export const ACCEPTED_PHOTO_LABEL = "JPEG, PNG, HEIC or WebP";

/** An error whose message is already written for the customer. */
export class PhotoError extends Error {}

export const READ_FAILED = `We could not read this photo. Try a different one, or email ${SUPPORT_EMAIL}.`;
export const UPLOAD_FAILED = `This photo did not upload. Check your connection and try again. Still stuck? Email ${SUPPORT_EMAIL}.`;
export const SIGNED_OUT = `You have been signed out. Sign in again and your details will still be here. Need help? Email ${SUPPORT_EMAIL}.`;
export const TOO_LARGE = `This photo is too large to upload. Try a different one, or email ${SUPPORT_EMAIL}.`;

function isHeicLike(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

type Drawable = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(blob: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      } catch {
        bitmap = await createImageBitmap(blob);
      }
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // fall through to <img> decoding
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}

export type PreparedPhoto = {
  /** Resized JPEG, ready to upload. */
  file: File;
  /** Pixel size of the photo as the customer took it. */
  originalWidth: number;
  originalHeight: number;
};

/**
 * Convert HEIC/HEIF if needed (canvas cannot read it), resize so the long side
 * is within the cap for this kind of photo, and export as JPEG.
 */
export async function preparePhoto(file: File, kind: PhotoKind): Promise<PreparedPhoto> {
  const { maxLongSide, quality } = PREP[kind];
  try {
    let blob: Blob = file;
    if (isHeicLike(file)) {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
      blob = Array.isArray(converted) ? converted[0] : converted;
    }

    const drawable = await decode(blob);
    try {
      const { width: w, height: h } = drawable;
      if (!w || !h) throw new Error("empty image");
      const scale = Math.min(1, maxLongSide / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      // JPEG has no transparency; a transparent PNG would otherwise go black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tw, th);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(drawable.source, 0, 0, tw, th);

      const out = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("export failed"))),
          "image/jpeg",
          quality
        );
      });

      const baseName = file.name.replace(/\.[^.]+$/i, "").trim() || "photo";
      return {
        file: new File([out], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() }),
        originalWidth: w,
        originalHeight: h,
      };
    } finally {
      drawable.release();
    }
  } catch (e) {
    console.error("[order] could not prepare photo", e);
    throw new PhotoError(READ_FAILED);
  }
}

/**
 * Upload one prepared photo. XMLHttpRequest rather than fetch because it
 * reports upload progress. Resolves with the stored URL.
 */
export function uploadPhoto(
  file: File,
  kind: PhotoKind,
  onProgress?: (fraction: number) => void
): Promise<string> {
  if (file.size > MAX_TRAINING_IMAGE_UPLOAD_BYTES) {
    return Promise.reject(new PhotoError(TOO_LARGE));
  }
  return new Promise<string>((resolve, reject) => {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/train-model/upload-images");
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new PhotoError(UPLOAD_FAILED));
    xhr.onabort = () => reject(new PhotoError(UPLOAD_FAILED));
    xhr.ontimeout = () => reject(new PhotoError(UPLOAD_FAILED));
    xhr.onload = () => {
      if (xhr.status === 401 || xhr.status === 403) return reject(new PhotoError(SIGNED_OUT));
      if (xhr.status === 413) return reject(new PhotoError(TOO_LARGE));
      if (xhr.status < 200 || xhr.status >= 300) {
        console.error("[order] upload failed", xhr.status, xhr.responseText);
        return reject(new PhotoError(UPLOAD_FAILED));
      }
      try {
        const parsed = JSON.parse(xhr.responseText) as { url?: unknown };
        if (typeof parsed.url === "string" && parsed.url) return resolve(parsed.url);
      } catch {
        // handled below
      }
      reject(new PhotoError(UPLOAD_FAILED));
    };
    xhr.send(body);
  });
}

export function photoErrorMessage(e: unknown): string {
  return e instanceof PhotoError ? e.message : UPLOAD_FAILED;
}

/** Identity of a chosen file. Phone captures often share names, so name alone is not enough. */
export function fileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/** Plain-language reason for each file react-dropzone refused. */
export function describeRejections(
  rejections: readonly { file: File; errors: readonly { code: string }[] }[]
): string[] {
  return rejections.map(({ file, errors }) => {
    const codes = errors.map((e) => e.code);
    let why = "could not be added";
    if (codes.includes("file-invalid-type")) {
      why = `is not a photo type we can use (${ACCEPTED_PHOTO_LABEL} only)`;
    } else if (codes.includes("file-too-large")) {
      why = `is too large (over ${Math.round(MAX_ORIGINAL_BYTES / (1024 * 1024))} MB)`;
    } else if (codes.includes("too-many-files")) {
      why = "was left out because only one photo fits here";
    }
    return `${file.name} ${why}`;
  });
}
