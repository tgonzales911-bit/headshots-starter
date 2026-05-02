import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function toNumber(value: string): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function GET(
  _request: Request,
  { params }: { params: { modelId: string } }
) {
  const modelId = toNumber(params.modelId);
  if (!modelId) {
    return NextResponse.json({ message: "Invalid modelId" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data: model, error: modelError } = await supabase
    .from("models")
    .select("*")
    .eq("id", modelId)
    .eq("user_id", user.id)
    .single();

  if (modelError || !model) {
    return NextResponse.json({ message: "Model not found" }, { status: 404 });
  }

  const [samplesResult, imagesResult, headshotsResult, eventsResult] = await Promise.all([
    supabase.from("samples").select("*").eq("modelId", modelId),
    supabase.from("images").select("*").eq("modelId", modelId),
    supabase.from("headshots").select("*").eq("model_id", modelId),
    supabase
      .from("pipeline_events")
      .select("*")
      .eq("model_id", modelId)
      .order("id", { ascending: false })
      .limit(30),
  ]);

  if (samplesResult.error || imagesResult.error || headshotsResult.error || eventsResult.error) {
    return NextResponse.json(
      {
        message: "Failed to fetch pipeline status details",
        errors: {
          samples: samplesResult.error?.message ?? null,
          images: imagesResult.error?.message ?? null,
          headshots: headshotsResult.error?.message ?? null,
          events: eventsResult.error?.message ?? null,
        },
      },
      { status: 500 }
    );
  }

  const stageHint =
    model.status === "training"
      ? "portrait-trainer"
      : model.status === "generating"
      ? "base-generation"
      : model.status === "processing_final_edit"
      ? "gemini-final-edit"
      : model.status === "upscaling"
      ? "upscaler"
      : model.status === "refining"
      ? "gemini-refinement"
      : model.status === "finished"
      ? "completed"
      : model.status === "failed"
      ? "failed"
      : "unknown";

  return NextResponse.json(
    {
      model: {
        id: model.id,
        name: model.name,
        type: model.type,
        status: model.status,
        modelId: model.modelId,
        created_at: model.created_at,
      },
      pipeline: {
        stage_hint: stageHint,
        request_or_result_reference: model.modelId,
      },
      artifacts: {
        sample_count: samplesResult.data?.length ?? 0,
        generated_images_count: imagesResult.data?.length ?? 0,
        final_headshots_count: headshotsResult.data?.length ?? 0,
        latest_generated_images:
          imagesResult.data
            ?.slice()
            .sort((a, b) => b.id - a.id)
            .slice(0, 4)
            .map((row) => row.uri) ?? [],
        latest_final_headshots:
          headshotsResult.data
            ?.slice()
            .sort((a, b) => b.id - a.id)
            .slice(0, 4)
            .map((row) => row.uri) ?? [],
      },
      events:
        eventsResult.data?.map((event) => ({
          id: event.id,
          created_at: event.created_at,
          stage: event.stage,
          event_type: event.event_type,
          request_id: event.request_id,
          message: event.message,
          payload: event.payload,
        })) ?? [],
    },
    { status: 200 }
  );
}

