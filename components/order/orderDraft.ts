/** Where the unfinished order form is kept on this device. */
export const ORDER_DRAFT_KEY = "badgeshot:order-draft";

/** Drafts older than this are ignored: the uploaded photos may be gone. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftPhoto = {
  url: string;
  name: string;
  width: number;
  height: number;
};

export type DraftSelfie = {
  key: string;
  name: string;
  url: string;
  bytes: number;
};

export type OrderDraft = {
  v: 1;
  savedAt: number;
  fields: Record<string, unknown>;
  selfies: DraftSelfie[];
  insignia: Partial<Record<"badge" | "patch" | "brass" | "jacket", DraftPhoto>>;
};

export function loadOrderDraft(): OrderDraft | null {
  try {
    const raw = window.localStorage.getItem(ORDER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrderDraft> | null;
    if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return {
      v: 1,
      savedAt: parsed.savedAt,
      fields: parsed.fields && typeof parsed.fields === "object" ? parsed.fields : {},
      selfies: Array.isArray(parsed.selfies)
        ? parsed.selfies.filter(
            (s): s is DraftSelfie =>
              !!s && typeof s.url === "string" && typeof s.key === "string" && typeof s.name === "string"
          )
        : [],
      insignia: parsed.insignia && typeof parsed.insignia === "object" ? parsed.insignia : {},
    };
  } catch {
    return null;
  }
}

export function saveOrderDraft(draft: Omit<OrderDraft, "v" | "savedAt">): void {
  try {
    window.localStorage.setItem(
      ORDER_DRAFT_KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), ...draft })
    );
  } catch {
    // Private browsing or full storage: the form still works, it just is not remembered.
  }
}

export function clearOrderDraft(): void {
  try {
    window.localStorage.removeItem(ORDER_DRAFT_KEY);
  } catch {
    // nothing to clear
  }
}
