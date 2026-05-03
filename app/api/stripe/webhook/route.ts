import { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * App Router: use `request.text()` for the raw body (Pages API `bodyParser: false` equivalent).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

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
      const userId = session.metadata?.userId;
      if (!userId) {
        console.error("[stripe/webhook] checkout.session.completed missing metadata.userId");
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const admin = adminClient();

      const { data: existing } = await admin
        .from("credits")
        .select("id, credits")
        .eq("user_id", userId)
        .maybeSingle();

      const nextCredits = (existing?.credits ?? 0) + 1;

      if (existing) {
        const { error: updErr } = await admin
          .from("credits")
          .update({ credits: nextCredits })
          .eq("user_id", userId);
        if (updErr) console.error("[stripe/webhook] credits update", updErr);
      } else {
        const { error: insErr } = await admin
          .from("credits")
          .insert({ user_id: userId, credits: 1 });
        if (insErr) console.error("[stripe/webhook] credits insert", insErr);
      }

      const { error: evErr } = await admin.from("pipeline_events").insert({
        user_id: userId,
        model_id: null,
        stage: "payment",
        event_type: "completed",
        message: session.id,
        payload: { details: session.id },
        request_id: session.id,
      });
      if (evErr) console.error("[stripe/webhook] pipeline_events", evErr);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e) {
    console.error("[stripe/webhook]", e);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
