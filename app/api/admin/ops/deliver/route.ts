import { Database, Json } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  buildDeliveryEmailHtml,
  DELIVERY_EMAIL_SUBJECT,
} from "@/lib/deliveryEmail";

export const dynamic = "force-dynamic";

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

function asPromptJson(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;
    const modelIdRaw = raw.modelId;
    const imageUrlsRaw = raw.imageUrls;

    if (typeof modelIdRaw !== "string" || modelIdRaw.trim() === "") {
      return NextResponse.json(
        { error: "modelId must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!Array.isArray(imageUrlsRaw) || imageUrlsRaw.length !== 4) {
      return NextResponse.json(
        { error: "imageUrls must be an array of exactly 4 strings" },
        { status: 400 }
      );
    }

    const imageUrls: string[] = [];
    for (let i = 0; i < imageUrlsRaw.length; i++) {
      const u = imageUrlsRaw[i];
      if (typeof u !== "string" || u.trim() === "") {
        return NextResponse.json(
          { error: `imageUrls[${i}] must be a non-empty string` },
          { status: 400 }
        );
      }
      imageUrls.push(u.trim());
    }

    const modelIdNum = Number(modelIdRaw);
    if (!Number.isFinite(modelIdNum) || modelIdNum <= 0) {
      return NextResponse.json({ error: "Invalid modelId" }, { status: 400 });
    }

    const admin = serviceClient();

    const { data: model, error: fetchErr } = await admin
      .from("models")
      .select("*")
      .eq("id", modelIdNum)
      .maybeSingle();

    if (fetchErr) {
      console.error("[admin/ops/deliver] fetch model", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const userId = model.user_id;
    if (!userId) {
      return NextResponse.json(
        { error: "Model has no user_id" },
        { status: 400 }
      );
    }

    const headshotRows = imageUrls.map((uri) => ({
      user_id: userId,
      model_id: modelIdNum,
      uri,
      metadata: { source: "manual-delivery" } as Json,
    }));

    const { error: headErr } = await admin.from("headshots").insert(headshotRows);
    if (headErr) {
      console.error("[admin/ops/deliver] headshots", headErr);
      return NextResponse.json({ error: headErr.message }, { status: 500 });
    }

    const imageRows = imageUrls.map((uri) => ({
      modelId: modelIdNum,
      model_id: modelIdNum,
      uri,
    }));

    const { error: imgErr } = await admin.from("images").insert(imageRows);
    if (imgErr) {
      console.error("[admin/ops/deliver] images", imgErr);
      return NextResponse.json({ error: imgErr.message }, { status: 500 });
    }

    const prev = asPromptJson(model.prompt_options);
    const { error: updErr } = await admin
      .from("models")
      .update({
        prompt_options: {
          ...prev,
          final_results: imageUrls,
        } as Json,
        status: "finished",
        result_image_url: imageUrls[0] ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", modelIdNum);

    if (updErr) {
      console.error("[admin/ops/deliver] model update", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const { error: evErr } = await admin.from("pipeline_events").insert({
      user_id: userId,
      model_id: modelIdNum,
      stage: "manual_delivery",
      event_type: "completed",
      message: "Manual delivery by operator",
      payload: { imageUrls } as Json,
      request_id: null,
    });

    if (evErr) {
      console.error("[admin/ops/deliver] pipeline_events", evErr);
      return NextResponse.json({ error: evErr.message }, { status: 500 });
    }

    let emailSent = false;
    let toEmail: string | null =
      typeof model.user_email === "string" && model.user_email.trim()
        ? model.user_email.trim()
        : null;

    if (!toEmail) {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      toEmail = userData.user?.email ?? null;
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && toEmail) {
      const resend = new Resend(resendKey);
      const customerName =
        typeof prev.name === "string" ? (prev.name as string) : null;
      const originRaw = process.env.DEPLOYMENT_URL?.trim() || "badgeshot.vercel.app";
      const origin = (originRaw.startsWith("http") ? originRaw : `https://${originRaw}`).replace(/\/$/, "");
      const { error: sendErr } = await resend.emails.send({
        from: "orders@badgeshot.com",
        reply_to: "orders@badgeshot.com",
        to: toEmail,
        subject: DELIVERY_EMAIL_SUBJECT,
        html: buildDeliveryEmailHtml({
          finalUrls: imageUrls,
          customerName,
          downloadAllUrl: `${origin}/overview/models/${modelIdNum}`,
        }),
      });
      if (sendErr) {
        console.error("[admin/ops/deliver] Resend", sendErr);
      } else {
        emailSent = true;
      }
    } else {
      console.warn("[admin/ops/deliver] skip email: missing RESEND_API_KEY or recipient", {
        modelId: modelIdNum,
      });
    }

    return NextResponse.json({
      success: true,
      modelId: String(modelIdNum),
      emailSent,
    });
  } catch (e) {
    console.error("[admin/ops/deliver]", e);
    const message =
      e instanceof Error ? e.message : "Internal error";
    const status = message.includes("imageUrls") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
