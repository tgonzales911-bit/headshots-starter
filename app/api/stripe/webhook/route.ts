import { runTrainingAfterPaidCheckout } from "@/lib/stripePostPaymentTraining";
import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * App Router: use `request.text()` for the raw body (Pages API `bodyParser: false` equivalent).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  try {
    if (!webhookSecret || !stripeKey) {
      console.error("[stripe/webhook] Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      console.warn("[stripe/webhook] No stripe-signature header");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-08-16",
      typescript: true,
    });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("[stripe/webhook] Signature verification failed", err);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.modelId) {
        // startOrder claims the order atomically, so this is safe to run
        // alongside the browser return (/api/stripe/verify-and-train) and on
        // Stripe's retries. Failures alert the operator from inside startOrder.
        const trainResult = await runTrainingAfterPaidCheckout(session);
        if (!trainResult.ok) {
          console.error("[stripe/webhook] post-payment start", trainResult.message);
        }
      } else {
        // Every checkout this app creates carries a modelId. Anything else
        // (an old payment link, a test event) is logged and ignored.
        console.warn("[stripe/webhook] checkout.session.completed without modelId", {
          session: session.id,
        });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e) {
    console.error("[stripe/webhook]", e);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
