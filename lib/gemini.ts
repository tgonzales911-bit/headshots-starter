/**
 * One place for Gemini calls, with a fallback chain.
 *
 * A single Gemini model is regularly "experiencing high demand" (HTTP 503)
 * for minutes at a time. When that happened the quality judge was skipped
 * and the photo analysis that protects likeness silently did nothing. Each
 * call now walks a list of models and only gives up when all are down.
 */

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiResult = { text: string | null; error: string | null; model: string | null };

const FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];

export function geminiModelChain(): string[] {
  const preferred = [
    process.env.GEMINI_VISION_MODEL?.trim(),
    process.env.GEMINI_JUDGE_MODEL?.trim(),
  ].filter((m): m is string => Boolean(m));
  return Array.from(new Set([...preferred, ...FALLBACK_MODELS]));
}

function sanitize(text: string): string {
  return text.replace(/key=[A-Za-z0-9_-]+/g, "key=***").replace(/AIza[0-9A-Za-z_-]{20,}/g, "***");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ask Gemini for a JSON answer. Tries each model in the chain; a model that
 * is overloaded, rate-limited, missing or erroring is skipped. Two passes
 * over the chain with a pause between them.
 */
export async function geminiGenerateJson(parts: GeminiPart[]): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { text: null, error: "GEMINI_API_KEY is not set in this deployment's environment", model: null };
  }
  const chain = geminiModelChain();
  let lastError = "Gemini did not answer";

  for (let pass = 0; pass < 2; pass++) {
    for (const model of chain) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0, response_mime_type: "application/json" },
            }),
          }
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          lastError = `Gemini API HTTP ${res.status} (${model}): ${sanitize(errText).slice(0, 240)}`;
          // 400 = the request itself is wrong; another model will not help.
          if (res.status === 400) return { text: null, error: lastError, model };
          continue;
        }
        const body = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        };
        const text = (body.candidates?.[0]?.content?.parts ?? [])
          .filter((p) => p.thought !== true)
          .map((p) => p.text ?? "")
          .join("")
          .trim();
        if (text) return { text, error: null, model };
        lastError = `Gemini returned an empty response (${model})`;
      } catch (e) {
        lastError = `Gemini request failed (${model}): ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (pass === 0) await sleep(4000);
  }
  console.error("[gemini] every model failed", { lastError, chain });
  return { text: null, error: lastError, model: null };
}
