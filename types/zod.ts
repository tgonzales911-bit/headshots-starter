import { BACKGROUND_PROMPTS, UNIFORM_TOP_BY_STYLE } from "@/lib/trainFieldOptions";
import { z } from "zod";

const brassColorEnum = z.enum(["Gold / Polished Brass", "Silver / Nickel"]);

export const fileUploadFormSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z ]+$/, "Only letters and spaces are allowed"),
  customerName: z.string().min(1, "Full name is required").max(120),
  department: z.string().min(1, "Department is required").max(200),
  rank: z.string().min(1, "Rank / title is required").max(120),
  rankDevice: z.string().max(200).optional(),
  badgeNumber: z.string().max(50).optional(),
  brassColor: brassColorEnum,
  stripeCount: z.coerce.number().int().min(0).max(6),
  needsStripes: z.boolean(),
  yearsOfService: z.coerce.number().int().min(0).max(40),
  needsChevrons: z.boolean(),
  notes: z.string().max(4000).optional(),
  type: z.string().min(1).max(50),
  background: z.enum(
    Object.keys(BACKGROUND_PROMPTS) as [string, ...string[]]
  ),
  uniform: z.enum(
    Object.keys(UNIFORM_TOP_BY_STYLE) as [string, ...string[]]
  ),
});