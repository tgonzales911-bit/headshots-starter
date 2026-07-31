import { Database } from "@/types/supabase";
import { buildTrainingZipFromImageUrls } from "@/lib/buildTrainingZip";
import { deploymentOrigin } from "@/lib/stripePostPaymentTraining";
import {
  BACKGROUND_OPTION_KEYS,
  UNIFORM_OPTION_KEYS,
} from "@/lib/trainFieldOptions";
import { buildTriggerPhrase, kickoffPortraitTraining } from "@/lib/falPipeline";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const falKey = process.env.FAL_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const trainingBucket =
  process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

type CustomerProfile = {
  name: string;
  department: string;
  rank: string;
  rankDevice?: string;
  badgeNumber?: string;
  brassColor: string;
  stripeCount: number;
  yearsOfService: number;
  needsStripes: boolean;
  needsChevrons: boolean;
  notes?: string;
};

function profileFromFormData(formData: FormData): CustomerProfile {
  const name = formData.get("name") as string;
  const department = formData.get("department") as string;
  const rank = formData.get("rank") as string;
  const rankDevice = formData.get("rankDevice") as string;
  const badgeNumber = formData.get("badgeNumber") as string;
  const brassColor = formData.get("brassColor") as string;
  const stripeCount = parseInt(formData.get("stripeCount") as string, 10) || 1;
  const yearsOfService = parseInt(formData.get("yearsOfService") as string, 10) || 0;
  const needsStripes = formData.get("needsStripes") === "true";
  const needsChevrons = formData.get("needsChevrons") === "true";
  const notes = formData.get("notes") as string;

  return {
    name: (name ?? "").trim(),
    department: (department ?? "").trim(),
    rank: (rank ?? "").trim(),
    rankDevice: (rankDevice ?? "").trim() || undefined,
    badgeNumber: (badgeNumber ?? "").trim() || undefined,
    brassColor: (brassColor ?? "Gold / Polished Brass").trim() || "Gold / Polished Brass",
    stripeCount,
    yearsOfService,
    needsStripes,
    needsChevrons,
    notes: (notes ?? "").trim() || undefined,
  };
}

function profileFromJsonPayload(payload: Record<string, unknown>): CustomerProfile {
  const stripeRaw = payload.stripeCount;
  const yosRaw = payload.yearsOfService;
  const stripeCount =
    typeof stripeRaw === "number" && Number.isFinite(stripeRaw)
      ? stripeRaw
      : parseInt(String(stripeRaw ?? "1"), 10) || 1;
  const yearsOfService =
    typeof yosRaw === "number" && Number.isFinite(yosRaw)
      ? yosRaw
      : parseInt(String(yosRaw ?? "0"), 10) || 0;

  return {
    name: String(payload.customerName ?? "").trim(),
    department: String(payload.department ?? "").trim(),
    rank: String(payload.rank ?? "").trim(),
    rankDevice: String(payload.rankDevice ?? "").trim() || undefined,
    badgeNumber: String(payload.badgeNumber ?? "").trim() || undefined,
    brassColor:
      String(payload.brassColor ?? "Gold / Polished Brass").trim() ||
      "Gold / Polished Brass",
    stripeCount,
    yearsOfService,
    needsStripes: payload.needsStripes === true || payload.needsStripes === "true",
    needsChevrons: payload.needsChevrons === true || payload.needsChevrons === "true",
    notes: String(payload.notes ?? "").trim() || undefined,
  };
}

export async function POST(request: Request) {
  const stripeIsConfigured = process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED === "true";
  const useStripeCheckoutFlow =
    !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID_ONE_CREDIT;

  const contentType = request.headers.get("content-type") ?? "";
  let images: string[];
  let modelName: string;
  let type: string;
  let backgroundRaw: string;
  let uniformRaw: string;
  let badge_url: string;
  let patch_url: string;
  let brass_url: string;
  let jacket_url: string;
  let customerProfile: CustomerProfile;
  let isMultipart = false;

  if (contentType.includes("multipart/form-data")) {
    isMultipart = true;
    const formData = await request.formData();
    const urlsRaw = formData.get("urls");
    try {
      const parsed =
        typeof urlsRaw === "string" ? JSON.parse(urlsRaw) : [];
      images = Array.isArray(parsed) ? parsed : [];
    } catch {
      images = [];
    }
    modelName = String(formData.get("modelName") ?? "").trim();
    type = String(formData.get("type") ?? "").trim();
    backgroundRaw = String(formData.get("background") ?? "")
      .trim()
      .toLowerCase();
    uniformRaw = String(formData.get("uniform") ?? "").trim().toLowerCase();
    badge_url = String(formData.get("badge_url") ?? "").trim();
    patch_url = String(formData.get("patch_url") ?? "").trim();
    brass_url = String(formData.get("brass_url") ?? "").trim();
    jacket_url = String(formData.get("jacket_url") ?? "").trim();
    customerProfile = profileFromFormData(formData);
  } else {
    const payload = (await request.json()) as Record<string, unknown>;
    images = (payload.urls as string[]) ?? [];
    modelName = String(payload.modelName ?? payload.name ?? "").trim();
    type = String(payload.type ?? "").trim();
    backgroundRaw =
      typeof payload.background === "string"
        ? payload.background.trim().toLowerCase()
        : "";
    uniformRaw =
      typeof payload.uniform === "string" ? payload.uniform.trim().toLowerCase() : "";
    badge_url =
      typeof payload.badge_url === "string" ? payload.badge_url.trim() : "";
    patch_url =
      typeof payload.patch_url === "string" ? payload.patch_url.trim() : "";
    brass_url =
      typeof payload.brass_url === "string" ? payload.brass_url.trim() : "";
    jacket_url =
      typeof payload.jacket_url === "string" ? payload.jacket_url.trim() : "";
    customerProfile = profileFromJsonPayload(payload);
  }

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
  if (jacket_url && !isHttpUrl(jacket_url)) {
    return NextResponse.json(
      { message: "jacket_url must be a valid http(s) URL" },
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

  if (isMultipart) {
    if (!modelName) {
      return NextResponse.json(
        { message: "Model name is required" },
        { status: 400 }
      );
    }
    if (!customerProfile.name || !customerProfile.department || !customerProfile.rank) {
      return NextResponse.json(
        { message: "Full name, department, and rank are required" },
        { status: 400 }
      );
    }
    if (
      customerProfile.brassColor !== "Gold / Polished Brass" &&
      customerProfile.brassColor !== "Silver / Nickel"
    ) {
      return NextResponse.json(
        { message: "Invalid collar brass color" },
        { status: 400 }
      );
    }
  }

  // --- Stripe checkout: create pending model, then send user to pay ---
  if (useStripeCheckoutFlow) {
    const priceId = process.env.STRIPE_PRICE_ID_ONE_CREDIT!;
    const secretKey = process.env.STRIPE_SECRET_KEY!;

    const { error: modelError, data } = await supabase
      .from("models")
      .insert({
        user_id: user.id,
        name: modelName,
        type,
        status: "pending_payment",
        prompt_options: {
          background: backgroundRaw,
          uniform: uniformRaw,
          badge_url,
          patch_url,
          brass_url,
          jacket_url: jacket_url || undefined,
          selfie_urls: images,
          name: customerProfile.name,
          department: customerProfile.department,
          rank: customerProfile.rank,
          rankDevice: customerProfile.rankDevice,
          badgeNumber: customerProfile.badgeNumber,
          brassColor: customerProfile.brassColor,
          stripeCount: customerProfile.stripeCount,
          yearsOfService: customerProfile.yearsOfService,
          needsStripes: customerProfile.needsStripes,
          needsChevrons: customerProfile.needsChevrons,
          notes: customerProfile.notes,
        },
      })
      .select("id")
      .single();

    if (modelError || !data?.id) {
      console.error("modelError (checkout path): ", modelError);
      return NextResponse.json(
        { message: "Something went wrong!" },
        { status: 500 }
      );
    }

    const modelId = data.id;
    const base = deploymentOrigin().replace(/\/$/, "");

    try {
      const stripe = new Stripe(secretKey, {
        apiVersion: "2023-08-16",
        typescript: true,
      });

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/api/stripe/verify-and-train?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/overview/models/train`,
        metadata: {
          modelId: String(modelId),
          userId: user.id,
        },
      });

      if (!checkoutSession.url) {
        await supabase.from("models").delete().eq("id", modelId);
        return NextResponse.json({ message: "Checkout URL missing" }, { status: 500 });
      }

      return NextResponse.json({ checkoutUrl: checkoutSession.url }, { status: 200 });
    } catch (e) {
      console.error("[train-model] Stripe checkout", e);
      await supabase.from("models").delete().eq("id", modelId);
      const message = e instanceof Error ? e.message : "Checkout failed";
      return NextResponse.json({ message }, { status: 500 });
    }
  }

  // --- Legacy: pay-with-credits or free path — train immediately ---
  if (!falKey) {
    return NextResponse.json(
      { message: "Missing FAL_KEY: configure Fal.ai to train models" },
      { status: 500 }
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
      name: modelName,
      type,
      prompt_options: {
        background: backgroundRaw,
        uniform: uniformRaw,
        badge_url,
        patch_url,
        brass_url,
        jacket_url: jacket_url || undefined,
        name: customerProfile.name,
        department: customerProfile.department,
        rank: customerProfile.rank,
        rankDevice: customerProfile.rankDevice,
        badgeNumber: customerProfile.badgeNumber,
        brassColor: customerProfile.brassColor,
        stripeCount: customerProfile.stripeCount,
        yearsOfService: customerProfile.yearsOfService,
        needsStripes: customerProfile.needsStripes,
        needsChevrons: customerProfile.needsChevrons,
        notes: customerProfile.notes,
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
