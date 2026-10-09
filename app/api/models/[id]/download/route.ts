import { collectFinalDownloadUrls } from "@/lib/finalDownloadUrls";
import { EXPORT_PRESETS, PORTRAITS_PER_ORDER } from "@/lib/site";
import { ownStoragePrefix } from "@/lib/storageUrls";
import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import JSZip from "jszip";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Download finished portraits as real files (no pop-ups, works on phones):
 *   ?index=0..3&preset=KEY   one portrait
 *   ?zip=1&preset=KEY        all of them in a zip
 * Presets come from lib/site EXPORT_PRESETS. "original" is the stored file
 * untouched; print presets are cropped to the print's shape (keeping the head,
 * which sits in the upper part of the frame) and resampled to 300 dpi.
 */

function fileSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50) || "portrait"
  );
}

/** Only fetch portraits from our own storage or the image host the pipeline uses. */
function isAllowedSource(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const own = ownStoragePrefix();
    if (own && url.startsWith(own)) return true;
    return u.hostname === "fal.media" || u.hostname.endsWith(".fal.media");
  } catch {
    return false;
  }
}

async function renderPreset(
  source: Buffer,
  presetKey: string
): Promise<{ data: Buffer; ext: string; contentType: string }> {
  const preset = EXPORT_PRESETS.find((p) => p.key === presetKey);
  if (!preset || preset.key === "original" || !preset.width || !preset.height) {
    const meta = await sharp(source).metadata();
    const isPng = meta.format === "png";
    return {
      data: source,
      ext: isPng ? "png" : "jpg",
      contentType: isPng ? "image/png" : "image/jpeg",
    };
  }

  const data = await sharp(source)
    .flatten({ background: "#ffffff" })
    // "north" keeps the top of the frame when the print is squarer than the
    // portrait, so a crop never cuts into the head.
    .resize(preset.width, preset.height, {
      fit: "cover",
      position: "north",
      kernel: "lanczos3",
    })
    .withMetadata({ density: 300 })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
  return { data, ext: "jpg", contentType: "image/jpeg" };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const modelId = Number(params.id);
  if (!Number.isFinite(modelId) || modelId <= 0) {
    return NextResponse.json({ message: "Order not found" }, { status: 404 });
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Please sign in to download." }, { status: 401 });
  }

  // RLS limits this to the signed-in customer's own orders.
  const { data: model } = await supabase
    .from("models")
    .select("*")
    .eq("id", modelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!model || model.status !== "finished") {
    return NextResponse.json({ message: "These portraits are not ready yet." }, { status: 404 });
  }

  const [{ data: headshots }, { data: images }] = await Promise.all([
    supabase.from("headshots").select("*").eq("model_id", modelId),
    supabase.from("images").select("*").eq("modelId", modelId),
  ]);
  const urls = collectFinalDownloadUrls(model, headshots ?? [], images ?? [])
    .slice(0, PORTRAITS_PER_ORDER)
    .filter(isAllowedSource);
  if (urls.length === 0) {
    return NextResponse.json({ message: "No portraits found for this order." }, { status: 404 });
  }

  const search = new URL(request.url).searchParams;
  const presetParam = search.get("preset") ?? "original";
  const presetKey = EXPORT_PRESETS.some((p) => p.key === presetParam) ? presetParam : "original";
  const po =
    model.prompt_options && typeof model.prompt_options === "object" && !Array.isArray(model.prompt_options)
      ? (model.prompt_options as Record<string, unknown>)
      : {};
  const base = `BadgeShot-${fileSlug(typeof po.name === "string" ? po.name : model.name ?? "")}`;
  const suffix = presetKey === "original" ? "" : `-${presetKey.replace("print_", "")}`;

  const fetchOne = async (url: string): Promise<Buffer> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not fetch portrait (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  };

  try {
    if (search.get("zip") === "1") {
      const zip = new JSZip();
      const rendered = await Promise.all(
        urls.map(async (url) => renderPreset(await fetchOne(url), presetKey))
      );
      rendered.forEach((r, i) => zip.file(`${base}-${i + 1}${suffix}.${r.ext}`, r.data));
      // Already-compressed images: STORE avoids wasting time re-deflating them.
      const out = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
      return new NextResponse(new Uint8Array(out), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${base}${suffix}.zip"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const index = Number(search.get("index") ?? "0");
    if (!Number.isInteger(index) || index < 0 || index >= urls.length) {
      return NextResponse.json({ message: "Portrait not found." }, { status: 404 });
    }
    const r = await renderPreset(await fetchOne(urls[index]), presetKey);
    return new NextResponse(new Uint8Array(r.data), {
      status: 200,
      headers: {
        "Content-Type": r.contentType,
        "Content-Disposition": `attachment; filename="${base}-${index + 1}${suffix}.${r.ext}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[models/download]", e);
    return NextResponse.json(
      { message: "We could not prepare that download. Please try again." },
      { status: 502 }
    );
  }
}
