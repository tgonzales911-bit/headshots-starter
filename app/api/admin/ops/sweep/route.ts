import { sweepStuckJudges } from "@/lib/falPipeline";
import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Recovery sweep for orders stuck with 4/4 final results but no judge run.
 * Callable by the admin (session) or Vercel Cron. If CRON_SECRET is set in
 * the environment, cron calls must carry it as a Bearer token.
 */
export async function GET(request: Request) {
  try {
    let authorized = false;

    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      authorized = true;
    } else if (!cronSecret && request.headers.get("x-vercel-cron")) {
      authorized = true;
    }

    if (!authorized) {
      const supabaseAuth = createRouteHandlerClient<Database>({ cookies });
      const {
        data: { session },
      } = await supabaseAuth.auth.getSession();
      authorized =
        !!session?.user && session.user.email === process.env.ADMIN_EMAIL;
    }

    if (!authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const kicked = await sweepStuckJudges();
    return NextResponse.json({ success: true, kicked });
  } catch (e) {
    console.error("[admin/ops/sweep]", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
