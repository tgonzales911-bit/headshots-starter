/**
 * Text prompts for Fal flux-lora base generation and Gemini 3 Pro image edit.
 */

export type FluxBasePromptContext = {
  department?: string | null;
  rank?: string | null;
  /** Lasting appearance read from the customer's photos, e.g. "bald man in his late 40s with a dark chin goatee". */
  descriptor?: string | null;
};

/** fal-ai/flux-lora — Class A fire service portrait base; insignia added in a later stage. */
export function buildFluxBasePrompt(ctx?: FluxBasePromptContext): string {
  // FLUX has no negative prompt: naming "badges", "patches" or "insignia" —
  // even to forbid them — makes the model draw them (base portraits were
  // coming back with invented patches and collar pins that the edit step then
  // had to erase). So the uniform is described only by what IS there: plain,
  // bare cloth. The real insignia are added afterwards from the customer's
  // own photos.
  const fireClassA =
    "Subject wearing a plain dark navy double-breasted wool dress jacket with gold buttons, white dress shirt, dark navy tie. The jacket is completely plain: smooth bare cloth on the chest, bare smooth lapels and collar, bare smooth sleeves and shoulders. Natural build and body proportions consistent with the training photos. Body turned slightly, face toward the camera, calm confident expression. Plain neutral gray seamless studio background. Professional department portrait framed from the lower chest up, with the whole chest, both shoulders and both upper sleeves in frame, 85mm lens at 6 feet, f/2.8, single soft key light from upper left with gentle fill, natural shadow under the jaw. Sharp focus on the eyes, fine film grain, visible pores and natural skin texture, true-to-life skin tone.";

  // The department name and rank are deliberately NOT put in the prompt:
  // given "Thornton Fire Department", the model writes a made-up "THORNT…"
  // patch on the sleeve. Rank and department reach the portrait only through
  // the customer's real insignia photos.
  //
  // What the person looks like IS put in the prompt. The face model alone
  // drifts toward a generic face (the first order came back clean-shaven for
  // a customer with a goatee in every photo); stating hair, facial hair, age
  // and build in words holds those in place.
  const descriptor = ctx?.descriptor?.replace(/\s+/g, " ").trim();
  const who = descriptor
    ? `The subject is a ${descriptor}. Hair, facial hair, apparent age, face shape and build exactly as described and as in the training photos, not idealized, not younger, not slimmer. `
    : "";

  return `${who}${fireClassA}`.replace(/\s+/g, " ").trim();
}

export type GeminiEditPromptOptions = {
  /** True when a Class A jacket reference photo is attached as Image 4. */
  hasJacket?: boolean;
  /**
   * Number of real photos of the customer's face attached AFTER the insignia
   * (and jacket) references. 0 keeps the older behaviour: the face in
   * Image 0 is preserved as generated.
   */
  identityCount?: number;
  /** Lasting appearance read from the customer's photos. */
  descriptor?: string | null;
};

/** Section 1 of the edit prompt when real photos of the customer are attached. */
function identitySection(first: number, count: number, descriptor?: string | null): string[] {
  const last = first + count - 1;
  const range = count === 1 ? `Image ${first} is a real photo` : `Images ${first} to ${last} are real photos`;
  const d = descriptor?.replace(/\s+/g, " ").trim();
  return [
    "1. IDENTITY (highest priority):",
    `${range} of the person this portrait is of. Image 0 was generated and its face is only an approximation of them. The finished portrait must show the REAL person from ${count === 1 ? "that photo" : "those photos"}, recognisable instantly by people who know them.`,
    `Correct the face and head in Image 0 to match the real photos exactly: the same face shape and width, forehead, brow, eyes, nose, mouth, jaw, chin and ears; the same apparent age with their real lines and skin texture; the same skin tone; the same hair or bald head and hairline; the same facial hair, worn exactly as in the photos (same style, position, length and colour), or clean-shaven if they are clean-shaven in the photos.`,
    d ? `For reference, they are a ${d}.` : "",
    "Do not beautify, slim, smooth, or make them look younger. Do not average their features toward a generic face.",
    "Keep the head position, camera angle, calm confident expression and studio lighting of Image 0. Take nothing else from the real photos: not their clothing, background, lighting, camera distortion or pose.",
  ].filter(Boolean);
}

/**
 * Photo-first portrait: Image 0 is a REAL photo of the customer (a
 * head-and-shoulders crop of one of their uploads). The model keeps the
 * person and changes what they are wearing and where they are standing.
 *
 * This replaced generating a face from a trained model. A generated face is
 * a fresh guess at the person every time, and across three generative steps
 * most guesses were strangers. Editing the real photo keeps the real face:
 * in a four-model test every output kept the customer's own features.
 */
export function buildRedressPrompt(): string {
  return [
    "This is a real photo of a person. Turn it into their official fire department Class A portrait WITHOUT changing them.",
    "Keep their head and face exactly as in the photo: every feature, their hair or bald head and hairline, their facial hair exactly as worn (or clean-shaven), glasses if worn, their age, lines, skin tone and skin texture, their expression and head angle, as if it were the same photograph. Do not beautify, slim, smooth, or make them look younger.",
    "Change only these things:",
    "Clothing: replace what they are wearing with a plain dark navy double-breasted wool dress jacket with gold buttons, a white dress shirt and a dark navy tie, fitted naturally to their real build. The jacket is completely plain: smooth bare cloth on the chest, lapels, collar, shoulders and sleeves, with no badge, patch, pin or lettering.",
    "Background: a solid, even, medium-gray seamless studio backdrop with no texture, gradient or objects, and a crisp clean edge around the subject.",
    "Lighting: even, soft studio portrait light on the face and jacket, natural colour, replacing any harsh or coloured room light.",
    "Framing: widen the frame to a 3:4 portrait from the lower chest up, with the head near the top third and the whole chest, both shoulders and both upper sleeves inside the frame, the outer face of the left upper sleeve clearly visible.",
    "Photorealistic photograph, not illustrated or stylized.",
  ].join(" ");
}

/**
 * Face-correction pass, run on its own BEFORE the insignia edit.
 * Image order: [0] generated portrait, [1..count] real photos of the customer.
 *
 * Kept separate on purpose: handed the insignia references and the face
 * photos in one call (eight images), the edit model stopped editing and drew
 * a new picture of a different man with invented patches in four of six
 * attempts. With only the portrait and the face photos it corrects the face
 * and leaves the rest alone.
 */
export function buildIdentityEditPrompt(count: number): string {
  const n = Math.max(1, Math.floor(count));
  const range = n === 1 ? "Image 1 is a real photo" : `Images 1 to ${n} are real photos`;
  const those = n === 1 ? "that photo" : "those photos";
  return [
    "This is an EDIT of Image 0, not a new picture. Change only the head and face; keep everything else in Image 0 exactly as it is.",
    `Image 0 is a generated formal portrait. Its face is only an approximation. ${range} of the person this portrait is of.`,
    `The finished portrait must show the REAL person from ${those}, recognisable instantly by people who know them.`,
    "Correct the face and head in Image 0 to match the real photos exactly: the same face shape and width, forehead, brow, eyes and eye colour, nose, mouth, jaw, chin and ears; the same apparent age with their real lines and skin texture; the same skin tone and complexion; the same hair colour, or the same bald head and hairline; the same facial hair, worn exactly as in the photos (same style, position, length and colour), or clean-shaven if they are clean-shaven in the photos.",
    "Do not beautify, slim, smooth, or make them look younger. Do not average their features toward a generic face.",
    "Keep the head position, camera angle, calm confident expression and studio lighting of Image 0.",
    "Take nothing else from the real photos: not their clothing, background, lighting, camera distortion or pose.",
    "Keep the jacket, shirt, tie, buttons, sleeves, body, framing and plain background of Image 0 unchanged. Do not add any badge, patch, pin, lettering or insignia.",
    "Output must be photorealistic, not illustrated or stylized.",
  ].join(" ");
}

/**
 * fal-ai/gemini-3-pro-image-preview/edit
 * Image order: [0] portrait, [1] badge, [2] shoulder patch, [3] collar brass,
 * [4] Class A jacket (optional — only when hasJacket is true).
 * The flag backdrop is NOT given to the edit model — it is composited
 * deterministically afterwards (lib/compositeBackdrop.ts), so the edit renders
 * a plain gray background that segments cleanly.
 */
export function buildGeminiEditPrompt(opts?: GeminiEditPromptOptions): string {
  const hasJacket = opts?.hasJacket === true;
  const identityCount = Math.max(0, Math.floor(opts?.identityCount ?? 0));
  const firstIdentity = hasJacket ? 5 : 4;
  const section1 =
    identityCount > 0
      ? identitySection(firstIdentity, identityCount, opts?.descriptor)
      : [
          "1. FACE AND HEAD PRESERVATION (highest priority):",
          "The subject's face, head, and scalp must be preserved exactly as they appear in Image 0 with zero alterations.",
          "Preserve the subject's hair (or lack of hair) exactly as it appears in Image 0. Do not add, remove, thicken, or restyle any hair, stubble, or shadow on the head. Do not alter the hairline or scalp in any way.",
          "The scalp and hair must be preserved with the same sacred priority as the face. Any change to hair makes this image unusable.",
          "Do not smooth, alter, or relight the skin on the face or head.",
          "The subject's exact likeness is sacred — any facial change makes this image unusable.",
        ];
  return [
    ...section1,
    "2. BADGE:",
    "Image 1 is a photo of the customer's real department badge. Replace any badge on the uniform with THIS badge — reproduce its exact shape, text, engraving, and metal finish. Do not invent, redesign, or substitute a generic badge.",
    "Place it on the LEFT chest of the uniform, centered. Scale it to look like a real badge physically pinned to a uniform — approximately 3 inches diameter, prominent and clearly visible, not small or understated. Do not let the collar brass sizing language affect the badge — the badge should be large and prominent.",
    "3. SHOULDER PATCH:",
    "Image 2 is a photo of the customer's real shoulder patch. The input portrait may ALREADY have a patch rendered on the sleeve — if so, completely REMOVE and REPLACE the entire shoulder-patch area with the reference patch. Never layer, blend, or composite the reference over an existing patch: no doubled crests, no ghosted or duplicated text, no overlapping outlines.",
    "Render the reference patch as the ONLY patch on the uniform — exactly ONE instance, on the LEFT sleeve, upper arm, as a sewn embroidered patch, upright and correctly oriented, with the same artwork, text, and colors as the reference. The sleeve fabric around it must be clean uniform material with no remnants of any previous patch.",
    "4. COLLAR BRASS:",
    "Image 3 is a photo of the customer's real collar brass insignia. Reproduce THIS brass exactly — same shape, device, and metal finish — placed on BOTH collar points. The brass must be small and proportional, approximately 3/4 inch diameter as physically worn on a real Class A uniform collar. Do not scale it up or make it decorative. It should look like it is physically pinned to each collar tip. The reference photo may show the pins lying at any angle; on the uniform they are worn upright. If the insignia is crossed bugles (speaking trumpets), the wide flared bell ends point DOWN toward the collar point and the narrow mouthpiece ends point up, on both collars, with the same number of bugles as in Image 3. Each brass piece should be no larger than the width of the collar tip itself — approximately the size of a shirt button when viewed at portrait distance. If in doubt, make it smaller.",
    "5. JACKET:",
    hasJacket
      ? "Image 4 is a photo of the customer's real Class A jacket. Match the jacket in the output to THIS jacket — same cut, lapel style, button count, button finish, and breast configuration (e.g. double-breasted with gold buttons if that is what is shown). Keep the jacket fit natural on the subject's body from Image 0."
      : "Keep the Class A jacket exactly as it appears in Image 0 — navy double-breasted dress jacket with gold buttons, white shirt, and tie. Do not restyle it.",
    "6. BACKGROUND:",
    "Keep or replace the background with a SOLID, UNIFORM, medium-gray studio backdrop — perfectly even tone, no gradient, no texture, no vignette, no props, no flag, no scenery of any kind.",
    "The background must be a single flat gray so the subject can be cleanly separated from it in a later compositing step. Do not add any background elements.",
    "Keep a crisp, clean edge between the subject and the gray background — no glow, no halo, no soft blending of hair or shoulders into the backdrop beyond natural sharpness.",
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
