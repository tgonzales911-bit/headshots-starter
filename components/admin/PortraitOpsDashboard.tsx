"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface Order {
  id: string;
  userEmail: string;
  status: string;
  createdAt: string;
  promptOptions: {
    name?: string;
    department?: string;
    rank?: string;
    rankDevice?: string;
    badgeNumber?: string;
    brassColor?: string;
    stripeCount?: number;
    yearsOfService?: number;
    needsStripes?: boolean;
    needsChevrons?: boolean;
    notes?: string;
    badge_url?: string;
    patch_url?: string;
    brass_url?: string;
    jacket_url?: string;
    base_image_urls?: string[];
    final_results?: string[];
  };
  recentEvents: Array<{
    stage: string;
    event_type: string;
    message?: string;
    created_at: string;
  }>;
}

export interface Props {
  initialOrders: Order[];
  initialMode: "manual" | "auto";
}

type StepStatus = "pending" | "active" | "done" | "skipped";

type OpsMode = "manual" | "auto";

const STEP_DEFS = [
  {
    num: 1,
    title: "Base Portrait Gen",
    tool: "FLUX LoRA — requires completed LoRA training first",
    url: "https://fal.ai/models/fal-ai/flux-lora",
  },
  {
    num: 2,
    title: "Badge (GPT Image 2)",
    tool: "GPT Image 2",
    url: "https://fal.ai/models/fal-ai/gpt-image-2",
  },
  {
    num: 3,
    title: "Patch (Kontext Pro)",
    tool: "FLUX Pro Kontext",
    url: "https://fal.ai/models/fal-ai/flux-pro/kontext",
  },
  {
    num: 4,
    title: "Collar Brass (FLUX Fill)",
    tool: "FLUX Pro Fill",
    url: "https://fal.ai/models/fal-ai/flux-pro/v1/fill",
  },
  {
    num: 5,
    title: "Sleeve Stripes (FLUX General)",
    tool: "FLUX General Inpainting",
    url: "https://fal.ai/models/fal-ai/flux-general/inpainting",
  },
  {
    num: 6,
    title: "Chevrons (Kontext Max)",
    tool: "FLUX Kontext Max",
    url: "https://fal.ai/models/fal-ai/flux-pro/kontext/max",
  },
  {
    num: 7,
    title: "Upscale Chain",
    tool: "FLUX Vision Upscaler",
    url: "https://fal.ai/models/fal-ai/flux-vision-upscaler",
  },
  {
    num: 8,
    title: "QC + Delivery",
    tool: "Internal QC",
    url: null as string | null,
  },
] as const;

const AUTONOMOUS_PIPELINE = [
  {
    id: "training",
    label: "Training",
    match: (stage: string) => stage === "trainer" || stage === "system",
  },
  {
    id: "base_gen",
    label: "Base Gen",
    match: (stage: string) => stage === "base_generation",
  },
  {
    id: "gemini",
    label: "Gemini Edit",
    match: (stage: string) => stage === "final_edit",
  },
  {
    id: "delivery",
    label: "Delivery",
    match: (stage: string) => stage === "complete",
  },
] as const;

const STEP_STORAGE_PREFIX = "portrait-ops-steps-";
const QC_STORAGE_PREFIX = "portrait-ops-qc-";

function ctxFromPrompt(po: Order["promptOptions"]) {
  const yos = po.yearsOfService;
  return {
    name: po.name ?? "Customer",
    department: po.department ?? "—",
    rank: po.rank ?? "—",
    rankDevice: po.rankDevice ?? "—",
    badgeNumber: po.badgeNumber ?? "—",
    brassColor: po.brassColor ?? "—",
    stripeCount: po.stripeCount ?? 0,
    yearsOfService: typeof yos === "number" ? String(yos) : yos ?? "—",
    needsStripes: po.needsStripes === true,
    needsChevrons: po.needsChevrons === true,
    notes: po.notes ?? "",
  };
}

function buildStepPrompt(
  stepNum: number,
  po: Order["promptOptions"]
): string {
  const c = ctxFromPrompt(po);
  switch (stepNum) {
    case 1:
      return [
        "LoRA training is handled automatically by TrainModelZone before this manual workflow begins.",
        "",
        "For manual orders where no LoRA exists yet, go to:",
        "New Manual Order → complete TrainModelZone upload first,",
        "then return here for the image generation steps.",
        "",
        "If LoRA weights already exist for this order, use the weights_url from the model record and submit to:",
        "fal-ai/flux-lora with the trained weights URL,",
        "num_images: 4, guidance_scale: 3.5,",
        "num_inference_steps: 28, image_size: portrait_4_3",
      ].join("\n");
    case 2:
      return [
        `Badge composite for ${c.name} (${c.department}).`,
        `Integrate badge ID ${c.badgeNumber} with correct brass tone ${c.brassColor}.`,
        `Rank context: ${c.rank} / ${c.rankDevice}.`,
        `Ensure legibility and alignment with the fire department Class A dress uniform collar.`,
        po.badge_url ? `Badge reference image (attach to the edit request): ${po.badge_url}` : "",
        c.notes ? `Notes: ${c.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case 3:
      return [
        `Department patch placement for ${c.name}.`,
        `Department: ${c.department}. Rank: ${c.rank}.`,
        `Patch should match supplied patch asset and sit flush on shoulder/sleeve per policy.`,
        po.patch_url ? `Patch reference image (attach to the edit request): ${po.patch_url}` : "",
        c.notes ? `Notes: ${c.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case 4:
      return [
        `Collar brass rendering for ${c.name}.`,
        `Brass color: ${c.brassColor}. Badge #: ${c.badgeNumber}.`,
        `Rank: ${c.rank}. Ensure collar brass matches reference metal finish.`,
        po.brass_url ? `Brass reference image (attach to the edit request): ${po.brass_url}` : "",
        po.jacket_url ? `Jacket reference image (match jacket cut/buttons): ${po.jacket_url}` : "",
        c.notes ? `Notes: ${c.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case 5:
      return [
        `Sleeve stripes for ${c.name}.`,
        `Stripe count target: ${c.stripeCount}. Years of service: ${c.yearsOfService}.`,
        `Needs stripes: ${c.needsStripes ? "yes" : "no"}.`,
        `Department: ${c.department}, rank device: ${c.rankDevice}.`,
        c.notes ? `Notes: ${c.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case 6:
      return [
        `Chevrons for ${c.name}.`,
        `Rank: ${c.rank}. Needs chevrons: ${c.needsChevrons ? "yes" : "no"}.`,
        `Sleeve layout must align with ${c.department} standards.`,
        c.notes ? `Notes: ${c.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case 7:
      return [
        `Upscale and sharpen final fire service portrait for ${c.name}.`,
        `Preserve badge ${c.badgeNumber} detail and collar brass (${c.brassColor}).`,
        `Output print-ready, minimal halos, faithful fire service rank insignia.`,
        c.notes ? `Notes: ${c.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case 8:
      return [
        `Final QC & delivery for ${c.name} (${c.department}) — fire service Class A portrait.`,
        `Verify badge ${c.badgeNumber}, brass ${c.brassColor}, stripes/chevrons per fire service brief.`,
        `Confirm customer notes addressed: ${c.notes || "(none)"}.`,
      ].join("\n");
    default:
      return "";
  }
}

function defaultStepMap(): Record<number, StepStatus> {
  const m: Record<number, StepStatus> = {};
  for (let i = 1; i <= 8; i++) {
    m[i] = i === 1 ? "active" : "pending";
  }
  return m;
}

function loadStepMap(orderId: string): Record<number, StepStatus> {
  if (typeof window === "undefined") return defaultStepMap();
  try {
    const raw = localStorage.getItem(`${STEP_STORAGE_PREFIX}${orderId}`);
    if (!raw) return defaultStepMap();
    const parsed = JSON.parse(raw) as Record<string, StepStatus>;
    const out: Record<number, StepStatus> = {};
    for (let i = 1; i <= 8; i++) {
      const v = parsed[String(i)];
      out[i] =
        v === "pending" ||
        v === "active" ||
        v === "done" ||
        v === "skipped"
          ? v
          : i === 1
            ? "active"
            : "pending";
    }
    return out;
  } catch {
    return defaultStepMap();
  }
}

function saveStepMap(orderId: string, map: Record<number, StepStatus>) {
  if (typeof window === "undefined") return;
  const serial: Record<string, StepStatus> = {};
  for (let i = 1; i <= 8; i++) {
    serial[String(i)] = map[i] ?? "pending";
  }
  localStorage.setItem(`${STEP_STORAGE_PREFIX}${orderId}`, JSON.stringify(serial));
}

function completedCount(map: Record<number, StepStatus>): number {
  let n = 0;
  for (let i = 1; i <= 8; i++) {
    if (map[i] === "done" || map[i] === "skipped") n++;
  }
  return n;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("complete") || s === "complete") {
    return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40";
  }
  if (s.includes("fail") || s.includes("error")) {
    return "bg-red-500/20 text-red-300 ring-1 ring-red-500/40";
  }
  if (s.includes("pending") || s.includes("payment")) {
    return "bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/40";
  }
  return "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40";
}

function stepStatusDotClass(st: StepStatus): string {
  switch (st) {
    case "done":
      return "bg-emerald-400";
    case "skipped":
      return "bg-zinc-500";
    case "active":
      return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]";
    default:
      return "bg-zinc-600";
  }
}

function normalizeOrdersFromApi(payload: unknown): Order[] {
  if (!payload || typeof payload !== "object") return [];
  const orders = (payload as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) return [];
  return orders.map((row) => {
    const r = row as Record<string, unknown>;
    const poRaw = (r.promptOptions ?? r.prompt_options) as Record<string, unknown> | undefined;
    const fr = poRaw?.final_results;
    let final_results: string[] | undefined;
    if (Array.isArray(fr)) {
      final_results = fr.filter((x): x is string => typeof x === "string");
    } else if (fr && typeof fr === "object") {
      final_results = undefined;
    }
    const yos = poRaw?.yearsOfService;
    const eventsRaw = (r.recentEvents ?? r.recent_events) as unknown[] | undefined;
    const recentEvents = (eventsRaw ?? []).map((ev) => {
      const e = ev as Record<string, unknown>;
      return {
        stage: String(e.stage ?? ""),
        event_type: String(e.eventType ?? e.event_type ?? ""),
        message: e.message != null ? String(e.message) : undefined,
        created_at: String(e.createdAt ?? e.created_at ?? ""),
      };
    });
    return {
      id: String(r.id ?? ""),
      userEmail: String(r.userEmail ?? r.user_email ?? ""),
      status: String(r.status ?? ""),
      createdAt: String(r.createdAt ?? r.created_at ?? ""),
      promptOptions: {
        name: typeof poRaw?.name === "string" ? poRaw.name : undefined,
        department:
          typeof poRaw?.department === "string" ? poRaw.department : undefined,
        rank: typeof poRaw?.rank === "string" ? poRaw.rank : undefined,
        rankDevice:
          typeof poRaw?.rankDevice === "string" ? poRaw.rankDevice : undefined,
        badgeNumber:
          typeof poRaw?.badgeNumber === "string" ? poRaw.badgeNumber : undefined,
        brassColor:
          typeof poRaw?.brassColor === "string" ? poRaw.brassColor : undefined,
        stripeCount:
          typeof poRaw?.stripeCount === "number" ? poRaw.stripeCount : undefined,
        yearsOfService:
          typeof yos === "number"
            ? yos
            : typeof yos === "string"
              ? Number(yos) || undefined
              : undefined,
        needsStripes:
          typeof poRaw?.needsStripes === "boolean"
            ? poRaw.needsStripes
            : undefined,
        needsChevrons:
          typeof poRaw?.needsChevrons === "boolean"
            ? poRaw.needsChevrons
            : undefined,
        notes: typeof poRaw?.notes === "string" ? poRaw.notes : undefined,
        badge_url:
          typeof poRaw?.badge_url === "string" ? poRaw.badge_url : undefined,
        patch_url:
          typeof poRaw?.patch_url === "string" ? poRaw.patch_url : undefined,
        brass_url:
          typeof poRaw?.brass_url === "string" ? poRaw.brass_url : undefined,
        jacket_url:
          typeof poRaw?.jacket_url === "string" ? poRaw.jacket_url : undefined,
        base_image_urls: Array.isArray(poRaw?.base_image_urls)
          ? (poRaw?.base_image_urls as unknown[]).filter(
              (x): x is string => typeof x === "string"
            )
          : undefined,
        final_results,
      },
      recentEvents,
    };
  });
}

function sortEventsDesc(events: Order["recentEvents"]) {
  return [...events].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export default function PortraitOpsDashboard({
  initialOrders,
  initialMode,
}: Props) {
  const [mode, setMode] = useState<OpsMode>(initialMode);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialOrders[0]?.id ?? null
  );
  const [stepMap, setStepMap] = useState<Record<number, StepStatus>>(() =>
    selectedId ? loadStepMap(selectedId) : defaultStepMap()
  );
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set([1])
  );
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [qcState, setQcState] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [deliverUrls, setDeliverUrls] = useState<[string, string, string, string]>([
    "",
    "",
    "",
    "",
  ]);
  const [deliverLoading, setDeliverLoading] = useState(false);
  const [deliverFeedback, setDeliverFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId]
  );

  useEffect(() => {
    if (!selectedId) return;
    setStepMap(loadStepMap(selectedId));
    try {
      const raw = localStorage.getItem(`${QC_STORAGE_PREFIX}${selectedId}`);
      if (raw) {
        const p = JSON.parse(raw) as Record<string, boolean>;
        setQcState(p);
      } else {
        setQcState({});
      }
    } catch {
      setQcState({});
    }
    setNotesDraft({});
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    const fr = selected.promptOptions.final_results;
    if (
      Array.isArray(fr) &&
      fr.length === 4 &&
      fr.every((u) => typeof u === "string" && u.trim().length > 0)
    ) {
      setDeliverUrls([
        fr[0].trim(),
        fr[1].trim(),
        fr[2].trim(),
        fr[3].trim(),
      ]);
    } else {
      setDeliverUrls(["", "", "", ""]);
    }
    setDeliverFeedback(null);
  }, [selected?.id, selected?.promptOptions.final_results]);

  const persistModeApi = useCallback(async (next: OpsMode) => {
    setModeSaving(true);
    try {
      await fetch("/api/admin/ops/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      setMode(next);
    } catch {
      setMode(next);
    } finally {
      setModeSaving(false);
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/ops/orders");
      const data = await res.json().catch(() => null);
      const next = normalizeOrdersFromApi(data);
      setOrders(next);
      setSelectedId((prev) => {
        if (prev && next.some((o) => o.id === prev)) return prev;
        return next[0]?.id ?? null;
      });
    } catch {
      /* keep existing */
    } finally {
      setRefreshing(false);
    }
  }, []);

  const sendManualDelivery = useCallback(async () => {
    if (!selected) return;
    setDeliverLoading(true);
    setDeliverFeedback(null);
    try {
      const res = await fetch("/api/admin/ops/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selected.id,
          imageUrls: [...deliverUrls],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        emailSent?: boolean;
      };
      if (!res.ok) {
        setDeliverFeedback({
          kind: "err",
          text:
            typeof data.error === "string" ? data.error : "Request failed",
        });
        return;
      }
      if (data.emailSent) {
        const to = selected.userEmail?.trim() || "customer";
        setDeliverFeedback({
          kind: "ok",
          text: `✓ Email sent to ${to}`,
        });
      } else {
        setDeliverFeedback({
          kind: "ok",
          text: "✓ Saved to Supabase. Email was not sent (add Resend and customer email).",
        });
      }
      await refreshOrders();
    } catch (e) {
      setDeliverFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setDeliverLoading(false);
    }
  }, [deliverUrls, refreshOrders, selected]);

  const updateStep = useCallback(
    (stepNum: number, action: "complete" | "skip" | "reopen") => {
      if (!selectedId) return;
      setStepMap((prev) => {
        const m = { ...prev };
        if (action === "complete") {
          m[stepNum] = "done";
        } else if (action === "skip") {
          m[stepNum] = "skipped";
        } else {
          for (let i = 1; i <= 8; i++) {
            if (m[i] === "active") m[i] = "pending";
          }
          m[stepNum] = "active";
          saveStepMap(selectedId, m);
          return m;
        }
        for (let i = 1; i <= 8; i++) {
          if (m[i] === "active") m[i] = "pending";
        }
        let placed = false;
        for (let i = 1; i <= 8; i++) {
          if (m[i] !== "done" && m[i] !== "skipped") {
            m[i] = "active";
            placed = true;
            break;
          }
        }
        if (!placed) {
          /* all terminal — leave none active */
        }
        saveStepMap(selectedId, m);
        return m;
      });
    },
    [selectedId]
  );

  const toggleExpanded = (n: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const copyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const pipelineByBucket = useMemo(() => {
    if (!selected) {
      return new Map<string, Order["recentEvents"][0]>();
    }
    const sorted = sortEventsDesc(selected.recentEvents);
    const map = new Map<string, Order["recentEvents"][0]>();
    for (const pipe of AUTONOMOUS_PIPELINE) {
      const hit = sorted.find((ev) => pipe.match(ev.stage));
      if (hit) map.set(pipe.id, hit);
    }
    return map;
  }, [selected]);

  const escalateToManual = async () => {
    await persistModeApi("manual");
  };

  const progressFraction = (orderId: string) => {
    const m = loadStepMap(orderId);
    return `${completedCount(m)}/8`;
  };

  const qcKey = (stepNum: number, i: number) => `${stepNum}-${i}`;

  const setQc = (key: string, v: boolean) => {
    setQcState((prev) => {
      const next = { ...prev, [key]: v };
      if (selectedId) {
        try {
          const filtered = Object.fromEntries(
            Object.entries(next).filter(([k]) =>
              /^\d+-\d+$/.test(k)
            )
          ) as Record<string, boolean>;
          localStorage.setItem(
            `${QC_STORAGE_PREFIX}${selectedId}`,
            JSON.stringify(filtered)
          );
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#090b0f] text-zinc-100">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#0c0f14] px-6 py-3">
        <div className="flex items-center gap-6">
          <h1 className="text-sm font-semibold tracking-[0.2em] text-[#c9a84c]">
            BADGESHOT OPS
          </h1>
          <div className="flex items-center gap-1 rounded-full bg-black/40 p-1 ring-1 ring-white/10">
            <button
              type="button"
              disabled={modeSaving}
              onClick={() => void persistModeApi("manual")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                mode === "manual"
                  ? "bg-[#c9a84c]/25 text-[#c9a84c] ring-1 ring-[#c9a84c]/50"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              ⚙ Manual
            </button>
            <button
              type="button"
              disabled={modeSaving}
              onClick={() => void persistModeApi("auto")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                mode === "auto"
                  ? "bg-[#4a82c9]/25 text-[#7eb4ff] ring-1 ring-[#4a82c9]/50"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              ⚡ Autonomous
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshOrders()}
          disabled={refreshing}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh orders"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-white/10 bg-[#0a0c10]">
          <div className="border-b border-white/10 p-3">
            <a
              href="/overview/models/train"
              className="block w-full rounded-lg bg-[#c9a84c]/20 py-2.5 text-center text-xs font-semibold text-[#c9a84c] ring-1 ring-[#c9a84c]/40 hover:bg-[#c9a84c]/30"
            >
              New Manual Order
            </a>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {orders.length === 0 ? (
              <p className="px-2 py-4 text-xs text-zinc-500">No orders yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {orders.map((o) => {
                  const label =
                    o.promptOptions.name?.trim() || o.userEmail || "Unknown";
                  const dept = o.promptOptions.department ?? "—";
                  const active = o.id === selectedId;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(o.id)}
                        className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                          active
                            ? "bg-[#c9a84c]/15 ring-1 ring-[#c9a84c]/40"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-medium text-zinc-100">
                            {label}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(o.status)}`}
                          >
                            {o.status}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {dept}
                        </div>
                        <div className="mt-1 text-[10px] text-zinc-500">
                          Steps {progressFraction(o.id)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto bg-[#090b0f] p-6">
          {!selected ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-zinc-500">
              <p className="text-sm">Select an order to view its workflow.</p>
            </div>
          ) : mode === "auto" ? (
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">
                    Autonomous pipeline
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {selected.promptOptions.name ?? selected.userEmail} ·{" "}
                    {selected.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void escalateToManual()}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
                >
                  Escalate to Manual
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {AUTONOMOUS_PIPELINE.map((pipe) => {
                  const ev = pipelineByBucket.get(pipe.id);
                  return (
                    <div
                      key={pipe.id}
                      className="rounded-xl border border-white/10 bg-[#0c0f14] p-4"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-[#4a82c9]">
                        {pipe.label}
                      </div>
                      {ev ? (
                        <>
                          <div className="mt-2 text-sm text-zinc-200">
                            {ev.event_type}
                          </div>
                          {ev.message ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              {ev.message}
                            </p>
                          ) : null}
                          <p className="mt-2 text-[11px] text-zinc-600">
                            {new Date(ev.created_at).toLocaleString()}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-600">
                          No events in this stage yet.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {selected.promptOptions.final_results &&
              selected.promptOptions.final_results.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Final results
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {selected.promptOptions.final_results.map((url, idx) => (
                      <a
                        key={`${url}-${idx}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg ring-1 ring-white/10"
                      >
                        <img
                          src={url}
                          alt=""
                          className="h-24 w-24 object-cover hover:opacity-90"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">
                  Manual workflow
                </h2>
                <p className="text-xs text-zinc-500">
                  {selected.promptOptions.name ?? selected.userEmail} ·{" "}
                  {selected.status}
                </p>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[#c9a84c] transition-[width]"
                  style={{
                    width: `${(completedCount(stepMap) / 8) * 100}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                {completedCount(stepMap)} of 8 steps completed
              </p>

              <div className="flex flex-col gap-2">
                {STEP_DEFS.map((def) => {
                  const st = stepMap[def.num] ?? "pending";
                  const open = expanded.has(def.num);
                  const prompt = buildStepPrompt(def.num, selected.promptOptions);
                  const chips = [
                    selected.promptOptions.department &&
                      `Dept: ${selected.promptOptions.department}`,
                    selected.promptOptions.rank &&
                      `Rank: ${selected.promptOptions.rank}`,
                    selected.promptOptions.badgeNumber &&
                      `Badge #: ${selected.promptOptions.badgeNumber}`,
                    selected.promptOptions.brassColor &&
                      `Brass: ${selected.promptOptions.brassColor}`,
                    selected.promptOptions.stripeCount != null &&
                      `Stripes: ${selected.promptOptions.stripeCount}`,
                    selected.promptOptions.yearsOfService != null &&
                      `YoS: ${selected.promptOptions.yearsOfService}`,
                  ].filter(Boolean) as string[];

                  const qcItems = [
                    "Inputs verified against brief",
                    "Output reviewed at full resolution",
                    "Customer notes addressed",
                  ];

                  return (
                    <div
                      key={def.num}
                      className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0f14]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpanded(def.num)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${stepStatusDotClass(st)}`}
                        />
                        <span className="text-xs font-medium text-zinc-500">
                          {def.num.toString().padStart(2, "0")}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                          <span className="text-sm font-medium text-zinc-100">
                            {def.title}
                          </span>
                          {def.num === 1 ? (
                            <span className="w-fit shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium leading-tight text-amber-200 ring-1 ring-amber-500/40">
                              {
                                "Training must be completed via TrainModelZone before this step"
                              }
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                          {st}
                        </span>
                      </button>

                      {open ? (
                        <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-2">
                          <div className="text-xs text-zinc-400">
                            <span className="text-zinc-500">Tool: </span>
                            {def.tool}
                          </div>
                          {def.url ? (
                            <a
                              href={def.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-xs text-[#4a82c9] underline-offset-2 hover:underline"
                            >
                              Open on fal.ai →
                            </a>
                          ) : (
                            <p className="text-xs text-zinc-500">
                              Final QC — no external model URL.
                            </p>
                          )}

                          <div className="relative rounded-lg bg-black/40 p-3 ring-1 ring-white/10">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-300">
                              {prompt}
                            </pre>
                            <button
                              type="button"
                              onClick={() => void copyPrompt(prompt)}
                              className="absolute right-2 top-2 rounded bg-white/10 px-2 py-1 text-[10px] text-zinc-200 hover:bg-white/20"
                            >
                              Copy
                            </button>
                          </div>

                          {chips.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {chips.map((c) => (
                                <span
                                  key={c}
                                  className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 ring-1 ring-white/10"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div>
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                              QC checklist
                            </div>
                            <ul className="space-y-2">
                              {qcItems.map((label, i) => {
                                const k = qcKey(def.num, i);
                                return (
                                  <li key={label} className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!!qcState[k]}
                                      onChange={(e) =>
                                        setQc(k, e.target.checked)
                                      }
                                      className="rounded border-zinc-600 bg-zinc-800 text-[#c9a84c]"
                                    />
                                    <span className="text-xs text-zinc-400">
                                      {label}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>

                          {def.num === 8 ? (
                            <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-950/10 p-3">
                              <div className="text-sm font-semibold text-[#c9a84c]">
                                Deliver to Customer
                              </div>
                              {[0, 1, 2, 3].map((i) => (
                                <label key={i} className="block">
                                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                    Portrait {i + 1} URL
                                  </span>
                                  <input
                                    type="url"
                                    value={deliverUrls[i]}
                                    onChange={(e) => {
                                      const next = [...deliverUrls] as [
                                        string,
                                        string,
                                        string,
                                        string,
                                      ];
                                      next[i] = e.target.value;
                                      setDeliverUrls(next);
                                    }}
                                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#c9a84c]/50 focus:outline-none"
                                    placeholder="https://fal.media/files/..."
                                    autoComplete="off"
                                  />
                                </label>
                              ))}
                              <button
                                type="button"
                                disabled={deliverLoading}
                                onClick={() => void sendManualDelivery()}
                                className="rounded-lg border border-amber-500/50 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
                              >
                                {deliverLoading
                                  ? "Sending…"
                                  : "Send Delivery Email"}
                              </button>
                              {deliverFeedback ? (
                                <p
                                  className={
                                    deliverFeedback.kind === "ok"
                                      ? "text-sm text-emerald-400"
                                      : "text-sm text-red-400"
                                  }
                                >
                                  {deliverFeedback.text}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <label className="block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                              Step notes
                            </span>
                            <textarea
                              value={notesDraft[def.num] ?? ""}
                              onChange={(e) =>
                                setNotesDraft((d) => ({
                                  ...d,
                                  [def.num]: e.target.value,
                                }))
                              }
                              rows={2}
                              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#c9a84c]/50 focus:outline-none"
                              placeholder="Operator notes for this step…"
                            />
                          </label>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => updateStep(def.num, "complete")}
                              className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
                            >
                              Complete
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStep(def.num, "skip")}
                              className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
                            >
                              Skip
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStep(def.num, "reopen")}
                              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
                            >
                              Re-open
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
