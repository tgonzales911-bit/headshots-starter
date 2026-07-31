const DEFAULT_BACKGROUND_KEY = "american_flag";
const DEFAULT_UNIFORM_KEY = "class_a";

export type ModelPromptOptions = {
  background: string;
  uniform: string;
  badge_url?: string;
  patch_url?: string;
  brass_url?: string;
  jacket_url?: string;
};

export function parseModelPromptOptions(raw: unknown): ModelPromptOptions {
  if (!raw || typeof raw !== "object") {
    return { background: DEFAULT_BACKGROUND_KEY, uniform: DEFAULT_UNIFORM_KEY };
  }
  const o = raw as Record<string, unknown>;
  const background =
    typeof o.background === "string" && o.background.trim()
      ? o.background.trim().toLowerCase()
      : DEFAULT_BACKGROUND_KEY;
  const uniform =
    typeof o.uniform === "string" && o.uniform.trim()
      ? o.uniform.trim().toLowerCase()
      : DEFAULT_UNIFORM_KEY;
  const badge_url =
    typeof o.badge_url === "string" && o.badge_url.trim()
      ? o.badge_url.trim()
      : undefined;
  const patch_url =
    typeof o.patch_url === "string" && o.patch_url.trim()
      ? o.patch_url.trim()
      : undefined;
  const brass_url =
    typeof o.brass_url === "string" && o.brass_url.trim()
      ? o.brass_url.trim()
      : undefined;
  const jacket_url =
    typeof o.jacket_url === "string" && o.jacket_url.trim()
      ? o.jacket_url.trim()
      : undefined;
  return { background, uniform, badge_url, patch_url, brass_url, jacket_url };
}

export function hasRefinementReferenceUrls(po: ModelPromptOptions): boolean {
  return Boolean(po.badge_url && po.patch_url && po.brass_url);
}
