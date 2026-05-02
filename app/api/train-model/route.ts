import { Database } from "@/types/supabase";
import { buildTrainingZipFromImageUrls } from "@/lib/buildTrainingZip";
import {
  BACKGROUND_OPTION_KEYS,
  UNIFORM_OPTION_KEYS,
} from "@/lib/trainFieldOptions";
import { buildTriggerPhrase, kickoffPortraitTraining } from "@/lib/falPipeline";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const stripeIsConfigured = process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED === "true";
const falKey = process.env.FAL_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const trainingBucket =
  process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

export async function POST(request: Request) {
  const payload = await request.json();
  const images = payload.urls as string[];
  const name = payload.name as string;
  const type = payload.type as string;
  const backgroundRaw =
    typeof payload.background === "string" ? payload.background.trim().toLowerCase() : "";
  const uniformRaw =
    typeof payload.uniform === "string" ? payload.uniform.trim().toLowerCase() : "";
  const badge_url =
    typeof payload.badge_url === "string" ? payload.badge_url.trim() : "";
  const patch_url =
    typeof payload.patch_url === "string" ? payload.patch_url.trim() : "";
  const brass_url =
    typeof payload.brass_url === "string" ? payload.brass_url.trim() : "";

  function isHttpUrl(s: string): boolean {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  if (!badge_url || !patch_url || !brass_url) {
    return NextResponse.json(
      { message: "badge_url, patch_url, and brass_url are required" },
      { status: 400 }
    );
  }
  if (!isHttpUrl(badge_url) || !isHttpUrl(patch_url) || !isHttpUrl(brass_url)) {
    return NextResponse.json(
      { message: "Reference URLs must be valid http(s) URLs" },
      { status: 400 }
    );
  }

  if (!BACKGROUND_OPTION_KEYS.includes(backgroundRaw)) {
    return NextResponse.json(
      { message: "Invalid background selection" },
      { status: 400 }
    );
  }
  if (!UNIFORM_OPTION_KEYS.includes(uniformRaw)) {
    return NextResponse.json(
      { message: "Invalid uniform selection" },
      { status: 400 }
    );
  }

  if (!falKey) {
    return NextResponse.json(
      { message: "Missing FAL_KEY: configure Fal.ai to train models" },
      { status: 500 }
    );
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { message: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!images?.length || images.length < 4) {
    return NextResponse.json(
      { message: "Upload at least 4 sample images" },
      { status: 400 }
    );
  }

  let creditsRow: { credits: number }[] | null = null;

  if (stripeIsConfigured) {
    const { error: creditError, data: credits } = await supabase
      .from("credits")
      .select("credits")
      .eq("user_id", user.id);

    if (creditError) {
      console.error({ creditError });
      return NextResponse.json(
        { message: "Something went wrong!" },
        { status: 500 }
      );
    }

    if (credits.length === 0) {
      const { error: errorCreatingCredits } = await supabase
        .from("credits")
        .insert({ user_id: user.id, credits: 0 });

      if (errorCreatingCredits) {
        console.error({ errorCreatingCredits });
        return NextResponse.json(
          { message: "Something went wrong!" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          message:
            "Not enough credits, please purchase some credits and try again.",
        },
        { status: 500 }
      );
    }

    if (credits[0]?.credits < 1) {
      return NextResponse.json(
        {
          message:
            "Not enough credits, please purchase some credits and try again.",
        },
        { status: 500 }
      );
    }

    creditsRow = credits;
  }

  const { error: modelError, data } = await supabase
    .from("models")
    .insert({
      user_id: user.id,
      name,
      type,
      prompt_options: {
        background: backgroundRaw,
        uniform: uniformRaw,
        badge_url,
        patch_url,
        brass_url,
      },
    })
    .select("id")
    .single();

  if (modelError || !data?.id) {
    console.error("modelError: ", modelError);
    return NextResponse.json(
      { message: "Something went wrong!" },
      { status: 500 }
    );
  }

  const modelId = data.id;

  const admin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const zipBuffer = await buildTrainingZipFromImageUrls(images);

    const zipPath = `${user.id}/${modelId}/training_${Date.now()}.zip`;
    const { error: uploadError } = await admin.storage
      .from(trainingBucket)
      .upload(zipPath, zipBuffer, {
        contentType: "application/zip",
        upsert: false,
      });

    if (uploadError) {
      console.error({ uploadError });
      await supabase.from("models").delete().eq("id", modelId);
      return NextResponse.json(
        {
          message:
            "Could not upload training archive. Ensure the Storage bucket exists and SUPABASE_TRAINING_DATASETS_BUCKET is set if you use a custom name.",
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = admin.storage
      .from(trainingBucket)
      .getPublicUrl(zipPath);

    const imagesDataUrl = publicUrlData.publicUrl;

    const triggerPhrase =
      process.env.FAL_TRIGGER_PHRASE?.trim() ||
      buildTriggerPhrase(user.id, modelId);

    let requestId = "";
    try {
      requestId = await kickoffPortraitTraining({
        userId: user.id,
        modelId,
        imagesDataUrl,
        triggerPhrase,
      });
    } catch (error) {
      console.error(error);
      await admin.storage.from(trainingBucket).remove([zipPath]);
      await supabase.from("models").delete().eq("id", modelId);
      return NextResponse.json(
        {
          message: "Could not start training on Fal.ai. Check FAL_KEY and logs.",
        },
        { status: 502 }
      );
    }

    const { error: updateModelError } = await admin
      .from("models")
      .update({ modelId: requestId, status: "training" })
      .eq("id", modelId)
      .eq("user_id", user.id);

    if (updateModelError) {
      console.error({ updateModelError });
    }

    const { error: samplesError } = await supabase.from("samples").insert(
      images.map((sample: string) => ({
        modelId: modelId,
        uri: sample,
      }))
    );

    if (samplesError) {
      console.error("samplesError: ", samplesError);
      await supabase.from("models").delete().eq("id", modelId);
      await admin.storage.from(trainingBucket).remove([zipPath]);
      return NextResponse.json(
        { message: "Something went wrong!" },
        { status: 500 }
      );
    }

    if (stripeIsConfigured && creditsRow && creditsRow.length > 0) {
      const subtractedCredits = creditsRow[0].credits - 1;
      const { error: updateCreditError } = await supabase
        .from("credits")
        .update({ credits: subtractedCredits })
        .eq("user_id", user.id);

      if (updateCreditError) {
        console.error({ updateCreditError });
      }
    }
  } catch (e) {
    console.error(e);
    await supabase.from("models").delete().eq("id", modelId);
    return NextResponse.json(
      { message: "Something went wrong!" },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "success" }, { status: 200 });
}
