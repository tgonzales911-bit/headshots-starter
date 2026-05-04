/**
 * Text prompts for Fal flux-lora base generation and Gemini 3 Pro image edit.
 */

export type FluxBasePromptContext = {
  department?: string | null;
  rank?: string | null;
};

/** fal-ai/flux-lora — Class A fire service portrait base; insignia added in a later stage. */
export function buildFluxBasePrompt(ctx?: FluxBasePromptContext): string {
  const dept = ctx?.department?.trim();
  const rank = ctx?.rank?.trim();

  const fireClassA =
    "Subject in Class A navy fire department dress uniform — double-breasted jacket with gold buttons, white shirt, tie. No insignia, no patches, no badges, no collar brass. Neutral gray seamless studio background. Professional headshot composition, 85mm lens equivalent at 6 feet subject distance, f/2.8, single key light from upper left, no fill light, defined jaw and cheekbone shadow. ISO 800 film grain, visible pores, natural skin texture. Not plastic, not waxy, no digital smoothing.";

  const prefix: string[] = [];
  if (rank) {
    prefix.push(`Subject role: ${rank}.`);
  }
  if (dept) {
    prefix.push(`Organization / service: ${dept}.`);
  }

  return [...prefix, fireClassA]
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
    "Image 1 is the department badge — place it on the LEFT chest of the uniform, centered. Scale it to look like a real badge physically pinned to a uniform — approximately 3 inches diameter, prominent and clearly visible, not small or understated. Do not let the collar brass sizing language affect the badge — the badge should be large and prominent.",
    "Image 2 is the shoulder patch — place it on the LEFT sleeve, upper arm, as a sewn embroidered patch.",
    "Image 3 is the collar brass insignia — place it on BOTH collar points. The brass must be small and proportional, approximately 3/4 inch diameter as physically worn on a real Class A uniform collar. Do not scale it up or make it decorative. It should look like it is physically pinned to each collar tip. Each brass piece should be no larger than the width of the collar tip itself — approximately the size of a shirt button when viewed at portrait distance. If in doubt, make it smaller.",
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
