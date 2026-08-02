import { Database, Json } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PipelineEventRow = Database["public"]["Tables"]["pipeline_events"]["Row"];

type PromptOptionsResponse = {
  badge_url: string | null;
  patch_url: string | null;
  brass_url: string | null;
  name: string | null;
  department: string | null;
  rank: string | null;
  rankDevice: string | null;
  badgeNumber: string | null;
  brassColor: string | null;
  stripeCount: number | null;
  yearsOfService: string | null;
  needsStripes: boolean | null;
  needsChevrons: boolean | null;
  notes: string | null;
  base_image_urls: string[] | null;
  final_results: Json | null;
  jacket_url: string | null;
  final_edit_results: Json | null;
  judge_round: number | null;
  judge_scores_round1: Json | null;
  judge_scores_final: Json | null;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function asRecord(raw: Json | null): Record<string, unknown> {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function optString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function optNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function optBool(obj: Record<string, unknown>, key: string): boolean | null {
  const v = obj[key];
  return typeof v === "boolean" ? v : null;
}

function optStringArray(obj: Record<string, unknown>, key: string): string[] | null {
  const v = obj[key];
  if (!Array.isArray(v)) return null;
  const strings = v.filter((x): x is string => typeof x === "string");
  return strings;
}

function optJson(obj: Record<string, unknown>, key: string): Json | null {
  if (!(key in obj)) return null;
  const v = obj[key];
  if (v === null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  if (typeof v === "object") {
    return v as Json;
  }
  return null;
}

function pickPromptOptions(raw: Json | null): PromptOptionsResponse {
  const o = asRecord(raw);
  return {
    badge_url: optString(o, "badge_url"),
    patch_url: optString(o, "patch_url"),
    brass_url: optString(o, "brass_url"),
    name: optString(o, "name"),
    department: optString(o, "department"),
    rank: optString(o, "rank"),
    rankDevice: optString(o, "rankDevice"),
    badgeNumber: optString(o, "badgeNumber"),
    brassColor: optString(o, "brassColor"),
    stripeCount: optNumber(o, "stripeCount"),
    yearsOfService: optString(o, "yearsOfService"),
    needsStripes: optBool(o, "needsStripes"),
    needsChevrons: optBool(o, "needsChevrons"),
    notes: optString(o, "notes"),
    base_image_urls: optStringArray(o, "base_image_urls"),
    final_results: optJson(o, "final_results"),
    jacket_url: optString(o, "jacket_url"),
    final_edit_results: optJson(o, "final_edit_results"),
    judge_round: optNumber(o, "judge_round"),
    judge_scores_round1: optJson(o, "judge_scores_round1"),
    judge_scores_final: optJson(o, "judge_scores_final"),
  };
}

function mapRecentEvent(ev: PipelineEventRow) {
  return {
    id: ev.id,
    modelId: ev.model_id,
    userId: ev.user_id,
    createdAt: ev.created_at,
    eventType: ev.event_type,
    stage: ev.stage,
    message: ev.message,
    payload: ev.payload,
    requestId: ev.request_id,
  };
}

function groupRecentEvents(
  events: PipelineEventRow[],
  modelIds: number[]
): Map<number, PipelineEventRow[]> {
  const allowed = new Set(modelIds);
  const counts = new Map<number, number>();
  const grouped = new Map<number, PipelineEventRow[]>();

  for (const ev of events) {
    const mid = ev.model_id;
    if (mid == null || !allowed.has(mid)) continue;
    const n = counts.get(mid) ?? 0;
    if (n >= 30) continue;
    counts.set(mid, n + 1);
    const list = grouped.get(mid) ?? [];
    list.push(ev);
    grouped.set(mid, list);
  }

  return grouped;
}

export async function GET() {
  try {
    const supabaseAuth = createRouteHandlerClient<Database>({ cookies });
    const {
      data: { session },
    } = await supabaseAuth.auth.getSession();

    if (!session?.user || session.user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = serviceClient();

    const { data: models, error: modelsError } = await admin
      .from("models")
      .select("id, user_email, status, created_at, updated_at, prompt_options")
      .order("created_at", { ascending: false })
      .limit(50);

    if (modelsError) {
      throw modelsError;
    }

    const list = models ?? [];
    const ids = list.map((m) => m.id);

    let allEvents: PipelineEventRow[] = [];
    if (ids.length > 0) {
      const { data: evData, error: evError } = await admin
        .from("pipeline_events")
        .select("*")
        .in("model_id", ids)
        .order("created_at", { ascending: false });

      if (evError) {
        throw evError;
      }
      allEvents = evData ?? [];
    }

    const byModel = groupRecentEvents(allEvents, ids);

    const orders = list.map((m) => ({
      id: m.id,
      userEmail: m.user_email,
      status: m.status,
      createdAt: m.created_at,
      promptOptions: pickPromptOptions(m.prompt_options),
      recentEvents: (byModel.get(m.id) ?? []).map(mapRecentEvent),
    }));

    return NextResponse.json({ orders });
  } catch (e) {
    console.error("[api/admin/ops/orders]", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
