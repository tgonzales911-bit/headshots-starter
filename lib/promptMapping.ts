/**
 * Text prompts for Fal flux-lora base generation and Gemini 3 Pro image edit.
 */

/** fal-ai/flux-lora — blank Class A fire department dress uniform; insignia added in a later stage. */
export function buildFluxBasePrompt(): string {
  return [
    "Professional headshot photograph of a person in Class A navy fire department dress uniform:",
    "dark navy wool jacket, white dress shirt with stiff collar, black tie —",
    "no insignia, no patches, no badges, no collar brass, no shield, no pins;",
    "blank unadorned uniform only;",
    "neutral gray seamless studio backdrop (this background will be replaced later);",
    "professional portrait composition, 85mm lens, f/2.8, shallow depth of field;",
    "soft studio key and rim light;",
    "shot on ISO 800 color film: visible film grain, visible pores, natural skin texture, authentic tones — not plastic, not waxy, not airbrushed;",
    "subtle real skin imperfections, natural eye catchlights;",
    "unretouched analog photograph aesthetic, no digital smoothing.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * fal-ai/gemini-3-pro-image-preview/edit
 * Image order: [0] portrait, [1] badge, [2] shoulder patch, [3] collar brass.
 */
export function buildGeminiEditPrompt(): string {
  return [
    "FACE AND HEAD PRESERVATION (highest priority):",
    "The subject's face, head, and scalp must be preserved exactly as they appear in Image 0 with zero alterations.",
    "The subject's head is completely bald. Do not add any hair, stubble, skin texture changes, or shadow to the scalp that is not already present in Image 0.",
    "The scalp must be preserved with the same sacred priority as the face. Any added hair makes this image unusable.",
    "Do not smooth, alter, or relight the skin on the face or head.",
    "The subject's exact likeness is sacred — any facial change makes this image unusable.",
    "INSIGNIA PLACEMENT:",
    "Image 1 is the department badge — place it on the LEFT chest of the uniform, centered, properly scaled to look like it is physically pinned.",
    "Image 2 is the shoulder patch — place it on the LEFT sleeve, upper arm, as a sewn embroidered patch.",
    "Image 3 is the collar brass insignia — place it on BOTH collar points. The brass must be small and proportional, approximately 3/4 inch diameter as physically worn on a real Class A uniform collar. Do not scale it up or make it decorative. It should look like it is physically pinned to each collar tip.",
    "BACKGROUND:",
    "Replace the existing background with an American flag.",
    "The flag should be slightly out of focus, simulating 85mm f/2.8 portrait lens bokeh — it should read clearly as an American flag but not be tack-sharp.",
    "The flag should be evenly lit, NOT blown out, NOT overexposed.",
    "Exposure should match the subject — the flag brightness should feel like a professional portrait studio backdrop, not a window or light source.",
    "Flag colors: deep red, bright white stripes, navy blue canton with white stars.",
    "OVERALL:",
    "Final image must look like an official department Class A portrait photo.",
    "Maintain consistent professional studio lighting on the subject throughout.",
    "Do not alter the uniform in any way beyond adding the insignia.",
    "Do not alter the uniform cut, lapels, buttons, pocket placement, or any structural detail. The uniform in the output must match the uniform in Image 0 exactly — the only additions are the three insignia items.",
    "Output must be photorealistic, not illustrated or stylized.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
