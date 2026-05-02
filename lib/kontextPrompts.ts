/**
 * Legacy Kontext (flux-pro/kontext) copy — used until pipeline migrates to Gemini edit.
 */

export function buildKontextPatchPrompt(): string {
  return "Image 0 is a portrait photo of a person in uniform. Image 1 is a photograph of a fabric shoulder patch/emblem. Task: Place Image 1 (the fabric patch) onto the LEFT SHOULDER SLEEVE of the uniform jacket in Image 0. The patch should appear as an embroidered emblem sewn onto the fabric of the sleeve. Do NOT place any face or person from Image 1 onto the portrait. Do NOT alter the face of the person in Image 0. Do NOT change the background. ONLY add the fabric patch emblem to the left shoulder sleeve.";
}

export function buildKontextBrassPrompt(): string {
  return "Image 0 is a portrait photo of a person in uniform. Image 1 is a photograph of metallic collar brass insignia. Task: Pin Image 1 (the metallic brass) onto BOTH collar points of the uniform jacket in Image 0. The brass should appear as small metal pins approximately 1 inch in size on each collar. Do NOT place any face from Image 1. Do NOT alter the face of the person in Image 0. Do NOT change the background or shoulder patch. ONLY add the metallic brass to both collar points.";
}

export function buildKontextBackgroundPrompt(backgroundKey: string): string {
  const descriptions: Record<string, string> = {
    american_flag:
      "Replace the neutral gray backdrop with the American flag shown in the reference image. The flag should appear softly draped and slightly out of focus behind the subject. Maintain all existing lighting on the subject's face. Do not change the person, uniform, patch, brass, or any foreground element. Only replace the background.",
    state_flag:
      "Replace the neutral gray backdrop with the Colorado state flag shown in the reference image. The flag should appear softly draped and slightly out of focus behind the subject. Maintain all existing lighting on the subject's face. Do not change the person, uniform, patch, brass, or any foreground element. Only replace the background.",
    thin_red_line:
      "Replace the neutral gray backdrop with the Thin Red Line flag shown in the reference image. The flag should appear softly draped and slightly out of focus behind the subject. Maintain all existing lighting on the subject's face. Do not change the person, uniform, patch, brass, or any foreground element. Only replace the background.",
    neutral_studio:
      "Enhance the neutral gray studio backdrop with professional soft gradient lighting. Do not change the subject, uniform, or any foreground elements.",
    fire_station_interior:
      "Replace the neutral gray backdrop with a blurred fire station interior — a red fire engine visible and softly out of focus in the background, warm industrial lighting. Do not change the person, uniform, patch, brass, or any foreground element. Only replace the background.",
  };
  return descriptions[backgroundKey] ?? descriptions["american_flag"];
}
