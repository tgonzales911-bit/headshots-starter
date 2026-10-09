import type { modelRow } from "@/types/utils";

/** What the customer-facing order screens are allowed to know about an order. */
export type OrderSummary = {
  id: number;
  status: string;
  createdAt: string;
  customerName: string;
  /** First finished portrait, only once the order is finished. */
  thumbUrl: string | null;
};

function optionsOf(model: Pick<modelRow, "prompt_options">): Record<string, unknown> {
  const po = model.prompt_options;
  return po && typeof po === "object" && !Array.isArray(po)
    ? (po as Record<string, unknown>)
    : {};
}

/** Shown when an order somehow has no name on it. */
export const ORDER_NAME_FALLBACK = "Your order";

/** The name the customer typed on the order form, falling back gracefully. */
export function orderCustomerName(
  model: Pick<modelRow, "prompt_options" | "name">
): string {
  const fromForm = optionsOf(model).name;
  if (typeof fromForm === "string" && fromForm.trim()) return fromForm.trim();
  if (model.name && model.name.trim()) return model.name.trim();
  return ORDER_NAME_FALLBACK;
}

function firstFinalUrl(model: Pick<modelRow, "prompt_options">): string | null {
  const fr = optionsOf(model).final_results;
  if (!Array.isArray(fr)) return null;
  const first = fr.find((u): u is string => typeof u === "string" && u.length > 0);
  return first ?? null;
}

export function toOrderSummary(
  model: Pick<modelRow, "id" | "status" | "created_at" | "prompt_options" | "name">,
  fallbackThumb?: string | null
): OrderSummary {
  const finished = model.status === "finished";
  return {
    id: model.id,
    status: model.status,
    createdAt: model.created_at,
    customerName: orderCustomerName(model),
    thumbUrl: finished ? firstFinalUrl(model) ?? fallbackThumb ?? null : null,
  };
}

/**
 * Dates read as "October 8, 2026" in the viewer's own time zone. Render inside
 * <time suppressHydrationWarning> because the server's zone may differ.
 */
export function formatOrderDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}
