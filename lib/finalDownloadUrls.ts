import type { Database } from "@/types/supabase";

type ModelRow = Database["public"]["Tables"]["models"]["Row"];
type HeadshotRow = Database["public"]["Tables"]["headshots"]["Row"];
type ImageRow = Database["public"]["Tables"]["images"]["Row"];

/** Up to four final headshot URLs for batch download (prompt_options, then headshots, then images). */
export function collectFinalDownloadUrls(
  model: ModelRow,
  headshots: HeadshotRow[],
  images: ImageRow[]
): string[] {
  const po = model.prompt_options;
  if (po && typeof po === "object" && !Array.isArray(po)) {
    const fr = (po as Record<string, unknown>).final_results;
    if (Array.isArray(fr)) {
      const urls = fr.filter((u): u is string => typeof u === "string" && u.length > 0);
      if (urls.length >= 4) return urls.slice(0, 4);
    }
  }
  if (headshots.length >= 4) return headshots.slice(0, 4).map((h) => h.uri);
  if (images.length >= 4) return images.slice(0, 4).map((i) => i.uri);
  return [];
}
