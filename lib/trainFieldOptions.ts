/** Train form / validation: background and uniform keys (UI + zod). */

export const BACKGROUND_PROMPTS: Record<string, string> = {
  american_flag:
    "American flag background, subtle depth of field, respectful patriotic studio backdrop, soft bokeh",
  state_flag:
    "STATE_FLAG_PLACEHOLDER background, crisp fabric texture, professional studio lighting on the flag, shallow depth of field",
  thin_red_line:
    "Thin Red Line flag softly blurred in background, black and white American flag with single red stripe, soft diffused studio portrait lighting on subject, neutral gray foreground, professional headshot lighting setup",
  neutral_studio:
    "neutral seamless light gray studio backdrop, soft gradient, professional headshot lighting, no distractions",
  fire_station_interior:
    "fire station interior background, fire engine red truck visible and slightly blurred, industrial garage bay, cinematic depth of field, warm ambient lighting",
};

export const UNIFORM_TOP_BY_STYLE: Record<string, string> = {
  class_a:
    "Class A dress uniform, dark navy well-tailored wool jacket, gold shield badge on left chest, white dress shirt with stiff spread collar, black silk tie, metallic gold pressed bugles on lapels",
  class_b:
    "Class B uniform, dark navy long-sleeve button-down shirt with structured collar and sharp press, gold shield badge on left chest, black silk tie, shoulder patch visible, no wool jacket",
};

export function formatPromptOptionLabel(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export const BACKGROUND_OPTION_KEYS = Object.keys(BACKGROUND_PROMPTS);
export const UNIFORM_OPTION_KEYS = Object.keys(UNIFORM_TOP_BY_STYLE);
