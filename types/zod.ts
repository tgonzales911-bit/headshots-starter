import { BACKDROP_OPTIONS } from "@/lib/site";
import { z } from "zod";

export const BRASS_COLORS = ["Gold / Polished Brass", "Silver / Nickel"] as const;

const BACKDROP_KEYS = BACKDROP_OPTIONS.map((b) => b.key) as [
  (typeof BACKDROP_OPTIONS)[number]["key"],
  ...(typeof BACKDROP_OPTIONS)[number]["key"][],
];

/** Most years of service the form accepts. */
export const MAX_YEARS_OF_SERVICE = 60;

/**
 * The order form. Counts are kept as text so an empty box and "0" are both
 * representable; they are sent to the server as digits.
 */
export const fileUploadFormSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(1, "Enter your full name as it should appear on the order.")
    .max(120, "Please shorten this to 120 characters or fewer."),
  department: z
    .string()
    .trim()
    .min(1, "Enter your department.")
    .max(200, "Please shorten this to 200 characters or fewer."),
  rank: z
    .string()
    .trim()
    .min(1, "Enter your rank or title.")
    .max(120, "Please shorten this to 120 characters or fewer."),
  rankDevice: z.string().max(200, "Please shorten this to 200 characters or fewer."),
  badgeNumber: z.string().max(50, "Please shorten this to 50 characters or fewer."),
  brassColor: z.enum(BRASS_COLORS),
  needsStripes: z.boolean(),
  stripeCount: z.string().regex(/^[0-6]?$/, "Enter a number from 0 to 6."),
  yearsOfService: z
    .string()
    .regex(/^\d{0,2}$/, "Enter a whole number of years.")
    .refine((v) => v === "" || Number(v) <= MAX_YEARS_OF_SERVICE, {
      message: `Enter ${MAX_YEARS_OF_SERVICE} or fewer.`,
    }),
  needsChevrons: z.boolean(),
  notes: z.string().max(4000, "Please shorten this to 4,000 characters or fewer."),
  background: z.enum(BACKDROP_KEYS),
});

export type OrderFormValues = z.infer<typeof fileUploadFormSchema>;

/**
 * Internal order name derived from the customer's full name, so the customer
 * is never asked for one: letters and spaces only, at most 40 characters.
 */
export function orderNameFromCustomerName(fullName: string): string {
  const cleaned = fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return cleaned || "BadgeShot Order";
}
