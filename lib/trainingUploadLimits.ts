/** Training sample uploads — per-file and combined caps (TrainModelZone, API routes). */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/** One image per multipart request; large originals accepted then compressed server-side. */
export const MAX_TRAINING_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
