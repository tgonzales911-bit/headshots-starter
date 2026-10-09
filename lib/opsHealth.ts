/**
 * Scheduled health check, run from the cron route. It answers two questions
 * a solo operator can't watch for by hand:
 *   1. Is the database reachable? (A paused database takes the whole site down.)
 *   2. Is any order sitting in a stage far longer than that stage should take?
 * Anything found is emailed to the operator. The database query doubles as
 * regular activity against the project.
 */

import { alertOperator } from "@/lib/notify";
import { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";

/** How long an order may sit in each status before it is reported, in minutes. */
const STALE_AFTER_MINUTES: Record<string, number> = {
  queued: 20,
  training: 120,
  generating: 45,
  processing_final_edit: 60,
  // The delivery promise is 24 hours end to end; warn while there is still time.
  awaiting_selection: 8 * 60,
  manual_review: 12 * 60,
};

export type HealthReport = {
  databaseOk: boolean;
  staleOrders: Array<{ id: number; status: string; idleMinutes: number }>;
  alerted: boolean;
  error?: string;
};

export async function runHealthCheck(): Promise<HealthReport> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { databaseOk: false, staleOrders: [], alerted: false, error: "Supabase is not configured" };
  }
  const admin = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: open, error } = await admin
    .from("models")
    .select("id, status, created_at")
    .in("status", Object.keys(STALE_AFTER_MINUTES))
    .limit(200);

  if (error) {
    const alerted = await alertOperator({
      subject: "The database is not reachable — the site is down for customers",
      lines: [
        `Error: ${error.message}`,
        "If the Supabase project is paused, restore it from the Supabase dashboard.",
      ],
    });
    return { databaseOk: false, staleOrders: [], alerted, error: error.message };
  }

  const staleOrders: HealthReport["staleOrders"] = [];
  for (const order of open ?? []) {
    const { data: lastEvent } = await admin
      .from("pipeline_events")
      .select("created_at")
      .eq("model_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = lastEvent?.created_at ?? order.created_at;
    if (!last) continue;
    const idleMinutes = Math.round((Date.now() - new Date(last).getTime()) / 60000);
    const limit = STALE_AFTER_MINUTES[order.status ?? ""];
    if (limit && idleMinutes > limit) {
      staleOrders.push({ id: order.id, status: order.status ?? "", idleMinutes });
    }
  }

  let alerted = false;
  if (staleOrders.length > 0) {
    alerted = await alertOperator({
      subject: `${staleOrders.length} order${staleOrders.length === 1 ? "" : "s"} waiting too long`,
      lines: staleOrders.map((o) => {
        const hours = (o.idleMinutes / 60).toFixed(1);
        return o.status === "awaiting_selection" || o.status === "manual_review"
          ? `Order #${o.id} has been waiting for your review for ${hours} h.`
          : `Order #${o.id} has been stuck in "${o.status}" for ${hours} h with no activity.`;
      }),
    });
  }

  return { databaseOk: true, staleOrders, alerted };
}
