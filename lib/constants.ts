export const AMERICAN_FLAG_REFERENCE_URL =
  "https://pyznuzychqwpbymxaxcs.supabase.co/storage/v1/object/public/training-datasets/background-references/American%20Flag.png";

/**
 * Canonical backdrop reference images, keyed by the train-form background key.
 * Every output in an order composites against the same fixed asset so the
 * 4-image set shares an identical background treatment.
 * Future customer-choice options (e.g. plain tan studio) get added here.
 */
export const BACKDROP_REFERENCE_URLS: Record<string, string> = {
  american_flag: AMERICAN_FLAG_REFERENCE_URL,
};

/**
 * Image asset for a backdrop key, if it has one. Studio backdrops
 * (formal_blue, neutral_studio) have no asset — they are rendered in
 * lib/compositeBackdrop.ts — so this returns undefined for them. Unknown or
 * legacy keys fall back to the flag, which is what older orders received.
 */
export function backdropReferenceUrl(backgroundKey: string): string | undefined {
  if (backgroundKey === "formal_blue" || backgroundKey === "neutral_studio") return undefined;
  return (
    BACKDROP_REFERENCE_URLS[backgroundKey] ??
    BACKDROP_REFERENCE_URLS["american_flag"]
  );
}

export const PIPELINE_STAGES = {
  TRAINING: "TRAINING",
  BASE_GENERATION: "BASE_GENERATION",
  FINAL_EDIT: "FINAL_EDIT",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR",
} as const;

export type PipelineStageLabel = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

export const PARALLEL_IMAGE_COUNT = 4;
