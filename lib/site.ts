/**
 * Single source of truth for customer-facing facts: contact address, price,
 * what an order contains, and how internal pipeline statuses read to a
 * customer. Marketing copy, the order pages and emails all import from here so
 * the product never promises two different things.
 */

export const SITE_NAME = "BadgeShot";
export const SITE_TAGLINE = "The Portrait You Earned";

/** Public marketing site (Lovable). The app itself lives on the order domain. */
export const MARKETING_URL = "https://badgeshot.com";

/**
 * One working support address used everywhere (footer, login errors, failure
 * states, email reply-to). Inbound mail on badgeshot.com is not configured, so
 * the default is the monitored support inbox; override with
 * NEXT_PUBLIC_SUPPORT_EMAIL once a badgeshot.com inbox exists.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "thehalligansupport@gmail.com";

/** Display price for one order. Stripe remains the source of truth for the charge. */
export const ORDER_PRICE_LABEL =
  process.env.NEXT_PUBLIC_ORDER_PRICE_LABEL?.trim() || "$79";

/** Where an order starts. Signed-out visitors sign in first and land here. */
export const ORDER_START_PATH = "/overview/models/train";

export function orderStartHref(signedIn: boolean): string {
  return signedIn ? ORDER_START_PATH : `/login?next=${encodeURIComponent(ORDER_START_PATH)}`;
}

/** Portraits delivered per order. */
export const PORTRAITS_PER_ORDER = 4;

/** The one delivery promise. Every order is hand-checked before it ships. */
export const DELIVERY_PROMISE = "Hand-checked and delivered within 24 hours";

/**
 * Photos of the customer's face. Every portrait now starts from one of these
 * real photos (the best few are picked automatically), so a handful of good
 * ones beats a pile of selfies. The older trained-model pipeline
 * (PIPELINE_MODE=lora) needs at least 10; the order API enforces that itself.
 */
export const SELFIE_MIN = 4;
export const SELFIE_RECOMMENDED = "6–10";
export const SELFIE_MAX = 20;

export type CustomerStatusTone = "waiting" | "working" | "ready" | "problem";

export type CustomerStatus = {
  /** Short label for badges and tables. */
  label: string;
  /** One-sentence explanation shown on the order page. */
  detail: string;
  tone: CustomerStatusTone;
  /** 0-based position in ORDER_STEPS, or -1 when the order is off the happy path. */
  step: number;
};

/** The customer-visible stages of an order, in order. */
export const ORDER_STEPS = [
  "Order received",
  "Choosing your best photos",
  "Making your portraits",
  "Final quality check",
  "Ready",
] as const;

const STATUS_MAP: Record<string, CustomerStatus> = {
  pending_payment: {
    label: "Awaiting payment",
    detail: "This order has not been paid for yet. Finish checkout to start it.",
    tone: "waiting",
    step: -1,
  },
  queued: {
    label: "Choosing your best photos",
    detail: "Payment received. We are picking the best of your photos to start your portraits from.",
    tone: "working",
    step: 1,
  },
  training: {
    label: "Choosing your best photos",
    detail: "We are studying your photos so every portrait looks like you.",
    tone: "working",
    step: 1,
  },
  generating: {
    label: "Making your portraits",
    detail: "Your portraits are being made in Class A uniform. This takes a few minutes.",
    tone: "working",
    step: 2,
  },
  processing_final_edit: {
    label: "Making your portraits",
    detail:
      "Your portraits are being made in Class A uniform, with your own badge, shoulder patch and collar brass. This takes a few minutes.",
    tone: "working",
    step: 2,
  },
  awaiting_selection: {
    label: "Final quality check",
    detail:
      "A person is checking every portrait against your photos and insignia, and choosing the best four.",
    tone: "working",
    step: 3,
  },
  manual_review: {
    label: "Final quality check",
    detail:
      "We are taking extra care with this one. A person is correcting details by hand before it ships.",
    tone: "working",
    step: 3,
  },
  finished: {
    label: "Ready",
    detail: "Your portraits are ready to download.",
    tone: "ready",
    step: 4,
  },
  failed: {
    label: "We hit a problem",
    detail:
      "Something went wrong on our side. We have been alerted and will fix it or refund you. You do not need to do anything.",
    tone: "problem",
    step: -1,
  },
};

/** Statuses during which work is running and the order must not be deleted. */
export const IN_FLIGHT_STATUSES = [
  "queued",
  "training",
  "generating",
  "processing_final_edit",
  "awaiting_selection",
  "manual_review",
] as const;

export function isInFlight(status: string | null | undefined): boolean {
  return (IN_FLIGHT_STATUSES as readonly string[]).includes(status ?? "");
}

export function customerStatus(status: string | null | undefined): CustomerStatus {
  return (
    STATUS_MAP[status ?? ""] ?? {
      label: "In progress",
      detail: "Your order is being worked on.",
      tone: "working",
      step: 0,
    }
  );
}

/**
 * Backdrops the pipeline can really produce. Each is composited behind the
 * subject deterministically, so every portrait in an order shares it exactly.
 */
export const BACKDROP_OPTIONS = [
  {
    key: "american_flag",
    label: "American flag",
    description: "The traditional department portrait.",
  },
  {
    key: "formal_blue",
    label: "Formal blue studio",
    description: "Classic mottled blue. Suits awards, programs and press releases.",
  },
  {
    key: "neutral_studio",
    label: "Neutral gray studio",
    description: "Clean and plain. Works on any website or ID.",
  },
] as const;

export type BackdropKey = (typeof BACKDROP_OPTIONS)[number]["key"];

export const BACKDROP_KEYS: string[] = BACKDROP_OPTIONS.map((b) => b.key);

/**
 * Print and web export sizes offered on the results page. Pixel sizes are
 * 300 dpi for the print formats.
 */
export const EXPORT_PRESETS = [
  { key: "original", label: "Original", width: 0, height: 0, note: "Full resolution" },
  { key: "print_8x10", label: "8 × 10 print", width: 2400, height: 3000, note: "300 dpi JPEG" },
  { key: "print_5x7", label: "5 × 7 print", width: 1500, height: 2100, note: "300 dpi JPEG" },
  { key: "print_4x5", label: "4 × 5 program", width: 1200, height: 1500, note: "300 dpi JPEG" },
  { key: "square", label: "Square profile", width: 1200, height: 1200, note: "Web and social" },
] as const;

export type ExportPresetKey = (typeof EXPORT_PRESETS)[number]["key"];
