import JSZip from "jszip";

function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return ".jpg";
  const ct = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct === "image/png") return ".png";
  if (ct === "image/gif") return ".gif";
  if (ct === "image/webp") return ".webp";
  if (ct === "image/jpeg" || ct === "image/jpg") return ".jpg";
  return ".jpg";
}

/**
 * Downloads each image URL and builds a single ZIP in memory for Fal.ai `images_data_url`.
 */
export async function buildTrainingZipFromImageUrls(
  urls: string[]
): Promise<Buffer> {
  const zip = new JSZip();

  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    if (!res.ok) {
      throw new Error(`Failed to download training image ${i + 1}: ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extensionFromContentType(res.headers.get("content-type"));
    zip.file(`image_${String(i + 1).padStart(2, "0")}${ext}`, buf);
  }

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return out;
}
