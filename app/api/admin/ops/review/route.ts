import {
  deliverResults,
  judgeAndDeliver,
  resubmitFinalEditForIndices,
  type PipelineModel,
} from "@/lib/falPipeline";
import { rebuildSlotsFromComposites } from "@/lib/repairComposites";
import { Database, Json } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PARALLEL = 4;

function serviceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function slotStrings(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: PARALLEL }, (_, i) => {
    const x = arr[i];
    return typeof x === "string" ? x : "";
  });
}

async function logReviewEvent(
  admin: SupabaseClient<Database>,
  args: { userId: string; modelId: number; eventType: string; message: string; payload?: Record<string, unknown> }
): Promise<void> {
  const { error } = await admin.from("pipeline_events").insert({
    user_id: args.userId,
    model_id: args.modelId,
    stage: "review",
    event_type: args.eventType,
    message: args.message,
    payload: (args.payload ?? null) as Json | null,
    request_id: null,
  });
  if (error) console.error("[admin/ops/review] event insert failed", error);
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient<Database>({ cookies });
    const {
      data: { session },
    } = await supabaseAuth.auth.getSession();
    if (!session?.user || session.user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      modelId?: unknown;
      action?: unknown;
      indices?: unknown;
    } | null;
    const modelId = Number(body?.modelId);
    const action = typeof body?.action === "string" ? body.action : "";
    if (!Number.isFinite(modelId) || modelId <= 0) {
      return NextResponse.json({ error: "Invalid modelId" }, { status: 400 });
    }
    if (!["approve", "rerun", "escalate", "repair", "judge"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const admin = serviceClient();
    const { data: model, error: fetchErr } = await admin
      .from("models")
      .select("*")
      .eq("id", modelId)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!model?.user_id) return NextResponse.json({ error: "Model not found" }, { status: 404 });

    const prev =
      model.prompt_options && typeof model.prompt_options === "object" && !Array.isArray(model.prompt_options)
        ? (model.prompt_options as Record<string, unknown>)
        : {};
    const slots = slotStrings(prev.final_edit_results);

    if (action === "repair") {
      const { slots: rebuilt, found } = await rebuildSlotsFromComposites(admin, {
        userId: model.user_id,
        modelId,
      });
      // Keep existing non-empty slots where the rebuild found nothing.
      const merged = slots.map((s, i) => rebuilt[i] || s);
      const { error: updErr } = await admin
        .from("models")
        .update({
          prompt_options: { ...prev, final_edit_results: merged } as Json,
        })
        .eq("id", modelId);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      await logReviewEvent(admin, {
        userId: model.user_id,
        modelId,
        eventType: "repaired",
        message: `Rebuilt final URL set from stored composites (${found} found)`,
        payload: { found, slots: merged },
      });
      return NextResponse.json({
        success: true,
        filled: merged.filter(Boolean).length,
        slots: merged,
      });
    }

    if (action === "judge") {
      const urls = slots.filter(Boolean);
      if (urls.length < PARALLEL) {
        return NextResponse.json(
          {
            error: `Cannot run judge: final URL set incomplete (${urls.length}/${PARALLEL}).`,
            incomplete: true,
          },
          { status: 400 }
        );
      }
      await logReviewEvent(admin, {
        userId: model.user_id,
        modelId,
        eventType: "judge_kicked",
        message: "Operator manually triggered the judge",
      });
      await judgeAndDeliver(model, slots);
      return NextResponse.json({ success: true, judged: true });
    }

    if (action === "approve") {
      const urls = slots.filter(Boolean);
      if (urls.length < PARALLEL) {
        return NextResponse.json(
          {
            error: `Final URL set incomplete (${urls.length}/${PARALLEL}). Run Repair from composites first.`,
            incomplete: true,
          },
          { status: 400 }
        );
      }
      await logReviewEvent(admin, {
        userId: model.user_id,
        modelId,
        eventType: "review_approved",
        message: "Operator approved needs_review order — delivering",
      });
      await deliverResults(model, slots);
      return NextResponse.json({ success: true, delivered: true });
    }

    if (action === "rerun") {
      const indicesRaw = Array.isArray(body?.indices) ? body!.indices : [];
      const indices = indicesRaw
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < PARALLEL);
      if (indices.length === 0) {
        return NextResponse.json({ error: "indices required for rerun" }, { status: 400 });
      }
      await logReviewEvent(admin, {
        userId: model.user_id,
        modelId,
        eventType: "review_rerun",
        message: `Operator requested re-edit of image(s) ${indices.join(", ")}`,
        payload: { indices },
      });
      await resubmitFinalEditForIndices(model, indices);
      return NextResponse.json({ success: true, resubmitted: indices });
    }

    // escalate
    const { error: updErr } = await admin
      .from("models")
      .update({ status: "manual_review" })
      .eq("id", modelId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    await logReviewEvent(admin, {
      userId: model.user_id,
      modelId,
      eventType: "escalated",
      message: "Operator escalated needs_review order to the manual workflow",
    });
    return NextResponse.json({ success: true, status: "manual_review" });
  } catch (e) {
    console.error("[admin/ops/review]", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
