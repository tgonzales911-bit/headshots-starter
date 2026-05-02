export const AMERICAN_FLAG_REFERENCE_URL =
  "https://pyznuzychqwpbymxaxcs.supabase.co/storage/v1/object/public/training-datasets/background-references/American%20Flag.png";

export const PIPELINE_STAGES = {
  TRAINING: "TRAINING",
  BASE_GENERATION: "BASE_GENERATION",
  FINAL_EDIT: "FINAL_EDIT",
  COMPLETE: "COMPLETE",
  ERROR: "ERROR",
} as const;

export type PipelineStageLabel = (typeof PIPELINE_STAGES)[keyof typeof PIPELINE_STAGES];

export const PARALLEL_IMAGE_COUNT = 4;
