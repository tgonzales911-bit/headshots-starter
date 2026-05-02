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
    "Edit this set of images into one professional Class A police or fire department portrait.",
    "THE FACE IS SACRED AND MUST NOT CHANGE: preserve the subject's face, skin tone, bone structure, expression, eyes, nose, mouth, ears, hair, and identity completely — zero alteration, zero beautification, zero replacement, zero blending from reference photos.",
    "Image 0 is the portrait: the face and head in the output must match Image 0 exactly; treat the face as untouchable.",
    "Image 1 is the department badge: place it on the LEFT CHEST of the uniform jacket at realistic scale and angle, matching studio lighting.",
    "Image 2 is the shoulder patch: place it on the LEFT SLEEVE of the uniform jacket as sewn-on fabric, correct perspective and light.",
    "Image 3 is the collar brass: place matching metallic insignia on BOTH collar points, about one inch each, with believable reflections.",
    "Replace the background entirely with an American flag, slightly blurred — 85mm f/2.8 style bokeh — as in a high-end portrait studio behind the subject.",
    "Keep consistent professional studio lighting on the subject throughout.",
    "Final result: a single photorealistic Class A uniform headshot suitable for police or fire department use.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
