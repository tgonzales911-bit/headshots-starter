import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const modelId = Number(params.id);
    if (!Number.isFinite(modelId) || modelId <= 0) {
      return NextResponse.json({ message: "Invalid model id" }, { status: 400 });
    }

    const supabaseAuth = createRouteHandlerClient<Database>({ cookies });
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const admin = serviceClient();

    const { data: model, error: fetchErr } = await admin
      .from("models")
      .select("id, user_id")
      .eq("id", modelId)
      .single();

    if (fetchErr || !model || model.user_id !== user.id) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const { error: headshotsErr } = await admin.from("headshots").delete().eq("model_id", modelId);
    if (headshotsErr) {
      console.error("[api/models] delete headshots", headshotsErr);
      return NextResponse.json({ message: headshotsErr.message }, { status: 500 });
    }

    const { error: imagesErr } = await admin.from("images").delete().eq("modelId", modelId);
    if (imagesErr) {
      console.error("[api/models] delete images", imagesErr);
      return NextResponse.json({ message: imagesErr.message }, { status: 500 });
    }

    const { error: modelsErr } = await admin
      .from("models")
      .delete()
      .eq("id", modelId)
      .eq("user_id", user.id);

    if (modelsErr) {
      console.error("[api/models] delete model", modelsErr);
      return NextResponse.json({ message: modelsErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.error("[api/models] DELETE", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
