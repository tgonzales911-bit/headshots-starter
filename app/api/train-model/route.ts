import { pipelineMode } from "@/lib/falPipeline";
import { deploymentOrigin, startOrder } from "@/lib/stripePostPaymentTraining";
import { BACKDROP_KEYS, SELFIE_MAX, SELFIE_MIN, SUPPORT_EMAIL } from "@/lib/site";
import { isOwnUploadUrl } from "@/lib/storageUrls";
import { Database, Json } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Create an order.
 *
 * Every order is stored first as `pending_payment` with everything needed to
 * run it. Then one of:
 *  - the operator (ADMIN_EMAIL) placing an order → starts immediately, no charge;
 *  - everyone else → Stripe Checkout; the order starts when payment is confirmed
 *    (browser return via /api/stripe/verify-and-train, or the Stripe webhook).
 */

type CustomerProfile = {
  name: string;
  department: string;
  rank: string;
  rankDevice?: string;
  badgeNumber?: string;
  brassColor: string;
  stripeCount: number;
  yearsOfService: number;
  needsStripes: boolean;
  needsChevrons: boolean;
  notes?: string;
};

const BRASS_COLORS = ["Gold / Polished Brass", "Silver / Nickel"];

function text(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

/** Whole number in [min, max]; `fallback` when missing or not a number. Zero is a real value. */
function wholeNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function profileFrom(get: (key: string) => unknown): CustomerProfile {
  const brass = text(get("brassColor"), 60);
  const truthy = (v: unknown) => v === true || v === "true";
  return {
    name: text(get("name") ?? get("customerName"), 120),
    department: text(get("department"), 160),
    rank: text(get("rank"), 80),
    rankDevice: text(get("rankDevice"), 120) || undefined,
    badgeNumber: text(get("badgeNumber"), 40) || undefined,
    brassColor: BRASS_COLORS.includes(brass) ? brass : BRASS_COLORS[0],
    stripeCount: wholeNumber(get("stripeCount"), 0, 8, 0),
    yearsOfService: wholeNumber(get("yearsOfService"), 0, 70, 0),
    needsStripes: truthy(get("needsStripes")),
    needsChevrons: truthy(get("needsChevrons")),
    notes: text(get("notes"), 2000) || undefined,
  };
}

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  let get: (key: string) => unknown;
  let rawUrls: unknown;
  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      get = (key) => {
        const v = formData.get(key);
        return typeof v === "string" ? v : undefined;
      };
      const urlsField = formData.get("urls");
      try {
        rawUrls = typeof urlsField === "string" ? JSON.parse(urlsField) : [];
      } catch {
        rawUrls = [];
      }
    } else {
      const payload = (await request.json()) as Record<string, unknown>;
      get = (key) => payload[key];
      rawUrls = payload.urls;
    }
  } catch {
    return bad("We could not read your order. Please try again.");
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return bad("Please sign in again to place your order.", 401);
  }

  // --- Validate. Every message here is shown to the customer as written. ---
  const images = (Array.isArray(rawUrls) ? rawUrls : []).filter((u) =>
    isOwnUploadUrl(u, user.id)
  ) as string[];
  const selfies = Array.from(new Set(images)).slice(0, SELFIE_MAX);
  // The trained-model pipeline needs more photos than photo-first does.
  const minPhotos = pipelineMode() === "lora" ? Math.max(SELFIE_MIN, 10) : SELFIE_MIN;
  if (selfies.length < minPhotos) {
    return bad(`Please add at least ${minPhotos} photos of your face.`);
  }

  const badge_url = text(get("badge_url"), 2000);
  const patch_url = text(get("patch_url"), 2000);
  const brass_url = text(get("brass_url"), 2000);
  const jacket_url = text(get("jacket_url"), 2000);
  if (
    !isOwnUploadUrl(badge_url, user.id) ||
    !isOwnUploadUrl(patch_url, user.id) ||
    !isOwnUploadUrl(brass_url, user.id)
  ) {
    return bad("Please add a photo of your badge, your shoulder patch and your collar brass.");
  }
  if (jacket_url && !isOwnUploadUrl(jacket_url, user.id)) {
    return bad("Your jacket photo did not upload correctly. Please add it again.");
  }

  const background = text(get("background"), 40).toLowerCase();
  if (!BACKDROP_KEYS.includes(background)) {
    return bad("Please choose a backdrop.");
  }

  const profile = profileFrom(get);
  if (!profile.name || !profile.department || !profile.rank) {
    return bad("Please enter your full name, department and rank.");
  }

  const modelName =
    text(get("modelName"), 60) || profile.name.replace(/[^\p{L} ]/gu, "").trim().slice(0, 40) || "BadgeShot Order";

  // --- Store the order. ---
  const { error: modelError, data } = await supabase
    .from("models")
    .insert({
      user_id: user.id,
      name: modelName,
      type: "portrait",
      status: "pending_payment",
      prompt_options: {
        background,
        uniform: "class_a",
        badge_url,
        patch_url,
        brass_url,
        jacket_url: jacket_url || undefined,
        selfie_urls: selfies,
        ...profile,
      } as Json,
    })
    .select("id")
    .single();

  if (modelError || !data?.id) {
    console.error("[train-model] insert order", modelError);
    return bad(`We could not save your order. Please try again, or email ${SUPPORT_EMAIL}.`, 500);
  }
  const modelId = data.id;

  // --- Operator comp order: start now, no charge. ---
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail && user.email?.toLowerCase() === adminEmail) {
    const started = await startOrder({ modelId, userId: user.id, source: "comp" });
    if (!started.ok) {
      return bad(`The order was saved but could not start: ${started.message}`, 502);
    }
    return NextResponse.json({ message: "success", modelId }, { status: 200 });
  }

  // --- Everyone else: Stripe Checkout. ---
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID_ONE_CREDIT;
  if (!secretKey || !priceId) {
    await supabase.from("models").delete().eq("id", modelId);
    console.error("[train-model] Stripe is not configured");
    return bad(`Ordering is not available right now. Please email ${SUPPORT_EMAIL}.`, 503);
  }

  try {
    const base = deploymentOrigin().replace(/\/$/, "");
    const stripe = new Stripe(secretKey, { apiVersion: "2023-08-16", typescript: true });
    const metadata = { modelId: String(modelId), userId: user.id };

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      success_url: `${base}/api/stripe/verify-and-train?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/overview/models/train?canceled=1`,
      metadata,
      payment_intent_data: { metadata },
    });

    if (!checkoutSession.url) {
      throw new Error("Checkout URL missing");
    }
    return NextResponse.json({ checkoutUrl: checkoutSession.url, modelId }, { status: 200 });
  } catch (e) {
    console.error("[train-model] Stripe checkout", e);
    await supabase.from("models").delete().eq("id", modelId);
    return bad(
      `We could not open the payment page. You have not been charged. Please try again, or email ${SUPPORT_EMAIL}.`,
      502
    );
  }
}
