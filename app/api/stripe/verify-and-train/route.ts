import {
  checkoutIsSettled,
  deploymentOrigin,
  runTrainingAfterPaidCheckout,
} from "@/lib/stripePostPaymentTraining";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Stripe sends the customer's browser here after a successful checkout.
 * Success → their order page. A paid order that could not start → the order
 * list with a "we have it, don't pay again" banner (the operator is emailed
 * by startOrder). Never back to the empty order form.
 */
export async function GET(request: NextRequest) {
  const base = deploymentOrigin().replace(/\/$/, "");
  const problem = () => NextResponse.redirect(new URL("/overview?payment=problem", base));

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!sessionId || !secretKey) {
    return problem();
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2023-08-16", typescript: true });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error("[verify-and-train] retrieve session", e);
    return problem();
  }

  if (!checkoutIsSettled(session)) {
    // Not paid (e.g. an abandoned or delayed payment method): back to the form.
    return NextResponse.redirect(new URL("/overview/models/train?canceled=1", base));
  }

  const result = await runTrainingAfterPaidCheckout(session);
  if (!result.ok) {
    return problem();
  }

  return NextResponse.redirect(
    new URL(`/overview/models/${result.modelId}?payment=success`, base)
  );
}
