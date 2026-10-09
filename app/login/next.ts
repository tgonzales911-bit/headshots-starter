/**
 * The page to land on after sign-in. Only same-site paths are accepted: the
 * value must start with exactly one "/" so it can never point at another host.
 */
export function safeNext(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return null;
  return raw;
}
