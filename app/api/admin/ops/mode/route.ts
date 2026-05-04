import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type OpsMode = "manual" | "auto";

const OPS_MODE_KEY = "ops_mode";

/** In-memory fallback when `admin_settings` is missing or DB is unavailable. */
let currentMode: OpsMode = "manual";

/** Whether the `admin_settings` table is present; `unknown` until first successful probe. */
let adminSettingsTable: "unknown" | "missing" | "ok" = "unknown";

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

function isOpsMode(v: unknown): v is OpsMode {
  return v === "manual" || v === "auto";
}

function parseStoredMode(raw: string | null | undefined): OpsMode | null {
  if (raw === "manual" || raw === "auto") return raw;
  return null;
}

function relationMissing(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find a relationship")
  );
}

async function requireAdmin(): Promise<boolean> {
  const supabaseAuth = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabaseAuth.auth.getSession();
  return !!(session?.user && session.user.email === process.env.ADMIN_EMAIL);
}

async function readMode(admin: SupabaseClient<Database>): Promise<OpsMode> {
  if (adminSettingsTable === "missing") {
    return currentMode;
  }

  const { data, error } = await admin
    .from("admin_settings")
    .select("value")
    .eq("key", OPS_MODE_KEY)
    .maybeSingle();

  if (error) {
    if (relationMissing(error)) {
      adminSettingsTable = "missing";
      return currentMode;
    }
    return currentMode;
  }

  adminSettingsTable = "ok";

  if (data?.value === undefined || data?.value === null || data.value === "") {
    currentMode = "manual";
    return "manual";
  }

  const parsed = parseStoredMode(data.value);
  if (parsed) {
    currentMode = parsed;
    return parsed;
  }

  currentMode = "manual";
  return "manual";
}

async function persistMode(admin: SupabaseClient<Database>, mode: OpsMode): Promise<void> {
  currentMode = mode;

  if (adminSettingsTable === "missing") {
    return;
  }

  const { error } = await admin.from("admin_settings").upsert(
    { key: OPS_MODE_KEY, value: mode },
    { onConflict: "key" }
  );

  if (error) {
    if (relationMissing(error)) {
      adminSettingsTable = "missing";
      return;
    }
    return;
  }

  adminSettingsTable = "ok";
}

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let admin: SupabaseClient<Database>;
    try {
      admin = serviceClient();
    } catch {
      return NextResponse.json({ mode: currentMode });
    }

    const mode = await readMode(admin);
    return NextResponse.json({ mode });
  } catch {
    return NextResponse.json({ mode: currentMode });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as unknown;
    const modeRaw =
      body !== null && typeof body === "object" && body !== null && "mode" in body
        ? (body as { mode?: unknown }).mode
        : undefined;

    if (!isOpsMode(modeRaw)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    const mode = modeRaw;

    let admin: SupabaseClient<Database>;
    try {
      admin = serviceClient();
    } catch {
      currentMode = mode;
      return NextResponse.json({ mode, saved: true });
    }

    await persistMode(admin, mode);
    return NextResponse.json({ mode, saved: true });
  } catch {
    return NextResponse.json({ mode: currentMode, saved: true });
  }
}
