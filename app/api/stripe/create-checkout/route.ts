import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function deploymentOrigin(): string {
  const raw = process.env.DEPLOYMENT_URL?.trim();
  if (!raw) {
    throw new Error("DEPLOYMENT_URL is required for Stripe checkout URLs");
  }
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
}

export async function POST() {
  try {
    if (process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED !== "true") {
      return NextResponse.json({ message: "Stripe is not enabled" }, { status: 400 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID_ONE_CREDIT;
    if (!secretKey || !priceId) {
      return NextResponse.json({ message: "Stripe is not configured" }, { status: 500 });
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: "2023-08-16",
      typescript: true,
    });
    const base = deploymentOrigin().replace(/\/$/, "");

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/overview/models/train?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/overview`,
      metadata: {
        userId: user.id,
        userEmail: user.email ?? "",
      },
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ message: "Checkout URL missing" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    console.error("[stripe/create-checkout]", e);
    const message = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
