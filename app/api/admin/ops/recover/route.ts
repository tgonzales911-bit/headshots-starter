import { restartStaleQueuedOrders } from "@/lib/stripePostPaymentTraining";
import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Operator-only: restart any order whose start was cut off before it began. */
export async function POST() {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!user?.email || !admin || user.email.toLowerCase() !== admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const restarted = await restartStaleQueuedOrders();
    return NextResponse.json({ success: true, restarted });
  } catch (e) {
    console.error("[admin/ops/recover]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
