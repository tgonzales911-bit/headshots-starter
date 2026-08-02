import PortraitOpsDashboard, {
  type Order,
} from "@/components/admin/PortraitOpsDashboard";
import { Database, Json } from "@/types/supabase";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BadgeShot Ops",
};

type PipelineEventRow = Database["public"]["Tables"]["pipeline_events"]["Row"];

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
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

function toPromptOptions(raw: Json | null): Order["promptOptions"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const str = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : undefined;
  const bool = (k: string) =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : undefined;
  const yos = o.yearsOfService;
  let yearsOfService: number | undefined;
  if (typeof yos === "number" && Number.isFinite(yos)) {
    yearsOfService = yos;
  } else if (typeof yos === "string" && yos.trim() !== "") {
    const n = Number(yos);
    if (Number.isFinite(n)) yearsOfService = n;
  }

  return {
    name: str("name"),
    department: str("department"),
    rank: str("rank"),
    rankDevice: str("rankDevice"),
    badgeNumber: str("badgeNumber"),
    brassColor: str("brassColor"),
    stripeCount:
      typeof o.stripeCount === "number" && Number.isFinite(o.stripeCount)
        ? o.stripeCount
        : undefined,
    yearsOfService,
    needsStripes: bool("needsStripes"),
    needsChevrons: bool("needsChevrons"),
    notes: str("notes"),
    badge_url: str("badge_url"),
    patch_url: str("patch_url"),
    brass_url: str("brass_url"),
    jacket_url: str("jacket_url"),
    base_image_urls: Array.isArray(o.base_image_urls)
      ? (o.base_image_urls as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : undefined,
    final_results: Array.isArray(o.final_results)
      ? (o.final_results as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : undefined,
    // Review-panel fields — must match the /api/admin/ops/orders shape or the
    // panel renders "0/4 incomplete" from the SSR payload until a client refresh.
    final_edit_results: Array.isArray(o.final_edit_results)
      ? (o.final_edit_results as unknown[]).map((x) =>
          typeof x === "string" ? x : ""
        )
      : undefined,
    judge_round:
      typeof o.judge_round === "number" && Number.isFinite(o.judge_round)
        ? o.judge_round
        : undefined,
    judge_scores_round1: Array.isArray(o.judge_scores_round1)
      ? (o.judge_scores_round1 as Order["promptOptions"]["judge_scores_round1"])
      : undefined,
    judge_scores_final: Array.isArray(o.judge_scores_final)
      ? (o.judge_scores_final as Order["promptOptions"]["judge_scores_final"])
      : undefined,
  };
}

function mapPipelineEvent(ev: PipelineEventRow): Order["recentEvents"][number] {
  return {
    stage: ev.stage,
    event_type: ev.event_type,
    message: ev.message ?? undefined,
    created_at: ev.created_at,
  };
}

function absoluteApiUrl(path: string): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}${path}`;
  }
  const deployment =
    process.env.DEPLOYMENT_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL;
  if (deployment) {
    const base = deployment.startsWith("http")
      ? deployment.replace(/\/$/, "")
      : `https://${deployment.replace(/\/$/, "")}`;
    return `${base}${path}`;
  }
  return `http://localhost:3000${path}`;
}

async function fetchInitialMode(): Promise<"manual" | "auto"> {
  try {
    const cookieStore = cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const res = await fetch(absoluteApiUrl("/api/admin/ops/mode"), {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return "manual";
    }

    const body = (await res.json().catch(() => null)) as unknown;
    if (
      body &&
      typeof body === "object" &&
      "mode" in body &&
      ((body as { mode: string }).mode === "manual" ||
        (body as { mode: string }).mode === "auto")
    ) {
      return (body as { mode: "manual" | "auto" }).mode;
    }
    return "manual";
  } catch {
    return "manual";
  }
}

export default async function AdminOpsPage() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.email !== process.env.ADMIN_EMAIL) {
    redirect("/overview");
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

    if (!evError) {
      allEvents = evData ?? [];
    }
  }

  const byModel = groupRecentEvents(allEvents, ids);

  const orders: Order[] = list.map((m) => ({
    id: String(m.id),
    userEmail: m.user_email ?? "",
    status: m.status ?? "pending",
    createdAt: m.created_at,
    promptOptions: toPromptOptions(m.prompt_options ?? null),
    recentEvents: (byModel.get(m.id) ?? []).map(mapPipelineEvent),
  }));

  const mode = await fetchInitialMode();

  return (
    <div className="h-screen min-h-0 w-full overflow-hidden p-0">
      <PortraitOpsDashboard initialOrders={orders} initialMode={mode} />
    </div>
  );
}
