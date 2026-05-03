import { deploymentOrigin, runTrainingAfterPaidCheckout } from "@/lib/stripePostPaymentTraining";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const base = deploymentOrigin().replace(/\/$/, "");
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.redirect(
      new URL("/overview/models/train?error=missing_session", base)
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.redirect(new URL("/overview/models/train?error=config", base));
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2023-08-16",
    typescript: true,
  });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });
  } catch (e) {
    console.error("[verify-and-train] retrieve session", e);
    return NextResponse.redirect(
      new URL("/overview/models/train?error=invalid_session", base)
    );
  }

  const result = await runTrainingAfterPaidCheckout(session);
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(
        `/overview/models/train?error=${encodeURIComponent(result.message)}`,
        base
      )
    );
  }

  return NextResponse.redirect(new URL("/overview?payment=success", base));
}
