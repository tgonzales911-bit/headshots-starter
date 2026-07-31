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

export type GeminiEditPromptOptions = {
  /** True when a Class A jacket reference photo is attached as Image 4. */
  hasJacket?: boolean;
  /** True when the canonical backdrop image is attached after the other references. */
  hasBackdropRef?: boolean;
};

/**
 * fal-ai/gemini-3-pro-image-preview/edit
 * Image order: [0] portrait, [1] badge, [2] shoulder patch, [3] collar brass,
 * [4] Class A jacket (optional — only when hasJacket is true),
 * then the canonical flag backdrop (optional — only when hasBackdropRef is true).
 */
export function buildGeminiEditPrompt(opts?: GeminiEditPromptOptions): string {
  const hasJacket = opts?.hasJacket === true;
  const hasBackdropRef = opts?.hasBackdropRef === true;
  const backdropIndex = hasJacket ? 5 : 4;
  return [
    "1. FACE AND HEAD PRESERVATION (highest priority):",
    "The subject's face, head, and scalp must be preserved exactly as they appear in Image 0 with zero alterations.",
    "Preserve the subject's hair (or lack of hair) exactly as it appears in Image 0. Do not add, remove, thicken, or restyle any hair, stubble, or shadow on the head. Do not alter the hairline or scalp in any way.",
    "The scalp and hair must be preserved with the same sacred priority as the face. Any change to hair makes this image unusable.",
    "Do not smooth, alter, or relight the skin on the face or head.",
    "The subject's exact likeness is sacred — any facial change makes this image unusable.",
    "2. BADGE:",
    "Image 1 is a photo of the customer's real department badge. Replace any badge on the uniform with THIS badge — reproduce its exact shape, text, engraving, and metal finish. Do not invent, redesign, or substitute a generic badge.",
    "Place it on the LEFT chest of the uniform, centered. Scale it to look like a real badge physically pinned to a uniform — approximately 3 inches diameter, prominent and clearly visible, not small or understated. Do not let the collar brass sizing language affect the badge — the badge should be large and prominent.",
    "3. SHOULDER PATCH:",
    "Image 2 is a photo of the customer's real shoulder patch. Reproduce THIS patch exactly — same artwork, text, and colors — placed on the LEFT sleeve, upper arm, as a sewn embroidered patch.",
    "4. COLLAR BRASS:",
    "Image 3 is a photo of the customer's real collar brass insignia. Reproduce THIS brass exactly — same shape, device, and metal finish — placed on BOTH collar points. The brass must be small and proportional, approximately 3/4 inch diameter as physically worn on a real Class A uniform collar. Do not scale it up or make it decorative. It should look like it is physically pinned to each collar tip. Each brass piece should be no larger than the width of the collar tip itself — approximately the size of a shirt button when viewed at portrait distance. If in doubt, make it smaller.",
    "5. JACKET:",
    hasJacket
      ? "Image 4 is a photo of the customer's real Class A jacket. Match the jacket in the output to THIS jacket — same cut, lapel style, button count, button finish, and breast configuration (e.g. double-breasted with gold buttons if that is what is shown). Keep the jacket fit natural on the subject's body from Image 0."
      : "Keep the Class A jacket exactly as it appears in Image 0 — navy double-breasted dress jacket with gold buttons, white shirt, and tie. Do not restyle it.",
    "6. BACKGROUND:",
    hasBackdropRef
      ? `Image ${backdropIndex} is the official studio flag backdrop. Replace the existing background with THIS exact backdrop — same flag, same drape, same colors, same framing. Do not invent a different flag or change how it hangs.`
      : "Replace the existing background with an American flag.",
    "The flag should be slightly out of focus, simulating 85mm f/2.8 portrait lens bokeh — it should read clearly as an American flag but not be tack-sharp.",
    "The flag should be evenly lit, NOT blown out, NOT overexposed.",
    "Exposure should match the subject — the flag brightness should feel like a professional portrait studio backdrop, not a window or light source.",
    "Flag colors: deep red, bright white stripes, navy blue canton with white stars.",
    "7. OVERALL:",
    "Final image must look like an official department Class A portrait photo.",
    "Maintain consistent professional studio lighting on the subject throughout.",
    "Do not alter the uniform in any way beyond adding the insignia" +
      (hasJacket ? " and matching the jacket to Image 4." : "."),
    hasJacket
      ? "Beyond the jacket match described above, do not alter pocket placement or any other structural detail of the uniform."
      : "Do not alter the uniform cut, lapels, buttons, pocket placement, or any structural detail. The uniform in the output must match the uniform in Image 0 exactly — the only additions are the three insignia items.",
    "Output must be photorealistic, not illustrated or stylized.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
