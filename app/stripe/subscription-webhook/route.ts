/**
 * Legacy webhook URL from the original template. Kept as an alias so that
 * whichever endpoint the Stripe dashboard is pointed at, a paid checkout
 * starts its order. The handler lives in app/api/stripe/webhook/route.ts.
 */
import { POST as handle } from "@/app/api/stripe/webhook/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handle;
