/**
 * Only accept image URLs that point at our own storage bucket. The server
 * downloads these (training zip, judge) and hands them to third-party models,
 * so an arbitrary customer-supplied URL would let a caller make the server
 * fetch anything it likes.
 */

const bucket = process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

export function ownStoragePrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/`;
}

/** True when `url` is an https object URL inside the given user's upload folder. */
export function isOwnUploadUrl(url: unknown, userId: string): url is string {
  if (typeof url !== "string" || url.length === 0 || url.length > 2000) return false;
  const prefix = ownStoragePrefix();
  if (!prefix) return false;
  if (!url.startsWith(`${prefix}${userId}/uploads/`)) return false;
  // No traversal or query tricks: the remainder must be a plain object name.
  const rest = url.slice(`${prefix}${userId}/uploads/`.length);
  return rest.length > 0 && !rest.includes("..") && !rest.includes("?") && !rest.includes("#");
}
