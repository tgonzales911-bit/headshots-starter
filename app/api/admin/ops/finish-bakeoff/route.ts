import { uploadJpeg } from "@/lib/compositeBackdrop";
import { FINISH_PRESETS, findFinishPreset, runFinishPass } from "@/lib/finishPass";
import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Operator-only. Runs the finishing presets on one portrait of an order so
 * they can be compared side by side, and optionally applies one of them to
 * the order's stored result.
 *
 *   GET /api/admin/ops/finish-bakeoff?model=42&slot=4
 *       runs every preset on image 4 (1-based) and shows a comparison page
 *   GET ...&presets=topaz-standard,topaz-hifi
 *       runs only those presets
 *   GET ...&apply=topaz-standard
 *       runs that one preset and makes it the order's stored image 4
 *
 * Outputs land in storage next to the order's composites, under bakeoff/,
 * with stable names so a re-run overwrites the previous attempt.
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!user?.email || !admin || user.email.toLowerCase() !== admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams;
  const modelId = Number(q.get("model"));
  const slot = Number(q.get("slot") ?? "1");
  const apply = q.get("apply")?.trim() || null;
  const presetFilter = (q.get("presets") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!Number.isFinite(modelId) || modelId <= 0 || !Number.isFinite(slot) || slot < 1) {
    return NextResponse.json({ error: "model and slot (1-based) are required" }, { status: 400 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: "Storage is not configured" }, { status: 500 });
  }
  const service = createClient<Database>(serviceUrl, serviceKey, { auth: { persistSession: false } });

  const { data: model } = await service
    .from("models")
    .select("id, user_id, prompt_options")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || !model.user_id) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const ownerId: string = model.user_id;

  const po =
    model.prompt_options && typeof model.prompt_options === "object" && !Array.isArray(model.prompt_options)
      ? (model.prompt_options as Record<string, unknown>)
      : {};
  const results = Array.isArray(po.final_edit_results) ? (po.final_edit_results as unknown[]) : [];
  const current = results[slot - 1];
  if (typeof current !== "string" || !current) {
    return NextResponse.json({ error: `Image ${slot} has no result yet` }, { status: 400 });
  }

  // Finish from the un-finished composite when one was kept, so a second pass
  // never stacks on a first.
  const { data: events } = await service
    .from("pipeline_events")
    .select("payload")
    .eq("model_id", modelId)
    .eq("stage", "composite")
    .eq("event_type", "completed")
    .order("id", { ascending: false })
    .limit(20);
  let source = current;
  for (const ev of events ?? []) {
    const p = ev.payload as Record<string, unknown> | null;
    if (p && p.index === slot - 1 && typeof p.rawUrl === "string" && p.rawUrl) {
      source = p.rawUrl;
      break;
    }
  }

  const presets = apply
    ? [findFinishPreset(apply)].filter((p): p is NonNullable<typeof p> => Boolean(p))
    : FINISH_PRESETS.filter((p) => presetFilter.length === 0 || presetFilter.includes(p.id));
  if (presets.length === 0) return NextResponse.json({ error: "No matching preset" }, { status: 400 });

  const srcMeta = await sharp(await (await fetch(source)).arrayBuffer()).metadata();

  const rows = await Promise.all(
    presets.map(async (preset) => {
      const r = await runFinishPass(source, preset, { timeoutMs: 240_000 });
      if (!r.ok) return { preset, ok: false as const, error: r.error, ms: r.ms };
      const path = `composites/${ownerId}/${modelId}/bakeoff/slot${slot}_${preset.id}.jpg`;
      const url = await uploadJpeg(service, path, r.buffer);
      if (!url) return { preset, ok: false as const, error: "upload failed", ms: r.ms };
      const meta = await sharp(r.buffer).metadata();
      return { preset, ok: true as const, url: `${url}?v=${Date.now()}`, ms: r.ms, width: meta.width, height: meta.height };
    })
  );

  let applied: string | null = null;
  if (apply) {
    const row = rows[0];
    if (row.ok) {
      const next = [...results];
      const finishedUrl: string = row.url.split("?")[0];
      next[slot - 1] = finishedUrl;
      await service
        .from("models")
        .update({ prompt_options: { ...po, final_edit_results: next } as never })
        .eq("id", modelId);
      await service.from("pipeline_events").insert({
        user_id: ownerId,
        model_id: modelId,
        stage: "composite",
        event_type: "finish_applied",
        message: `Image ${slot} re-finished with ${row.preset.id} by the operator`,
        payload: { index: slot - 1, preset: row.preset.id, url: finishedUrl, from: source },
      });
      applied = row.preset.id;
    }
  }

  if (q.get("format") === "json") {
    return NextResponse.json({ modelId, slot, source, applied, results: rows });
  }

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const card = (title: string, sub: string, url: string) => `
    <figure>
      <a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(title)}" loading="lazy"></a>
      <figcaption><strong>${esc(title)}</strong><br><span>${esc(sub)}</span></figcaption>
    </figure>`;
  const cards = [
    card("Before (as stored)", `${srcMeta.width ?? "?"}×${srcMeta.height ?? "?"}`, source),
    ...rows.map((r) =>
      r.ok
        ? card(
            r.preset.label,
            `${r.width}×${r.height} · ${Math.round(r.ms / 1000)}s · ~$${r.preset.approxCostUsd.toFixed(2)}${
              r.preset.generative ? " · generative: check the badge lettering" : ""
            }${applied === r.preset.id ? " · APPLIED to this order" : ""}`,
            r.url
          )
        : `<figure class="failed"><figcaption><strong>${esc(r.preset.label)}</strong><br><span>failed: ${esc(
            r.error
          )}</span></figcaption></figure>`
    ),
  ].join("");

  const applyLinks = FINISH_PRESETS.map(
    (p) =>
      `<a href="?model=${modelId}&slot=${slot}&apply=${p.id}">Apply ${esc(p.id)}</a>`
  ).join(" · ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Finish bake-off · order ${modelId} · image ${slot}</title>
<style>
  body{margin:0;padding:24px;background:#0b1020;color:#e6e9f2;font:15px/1.5 system-ui,sans-serif}
  h1{font-size:20px;margin:0 0 4px} p{margin:0 0 16px;color:#aab2c8} a{color:#d8b85a}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}
  figure{margin:0;background:#141a30;border:1px solid #2a3350;border-radius:8px;overflow:hidden}
  figure.failed{padding:16px;border-color:#7a2d2d}
  img{display:block;width:100%;height:auto;background:#000}
  figcaption{padding:10px 12px} figcaption span{color:#aab2c8;font-size:13px}
  .tip{font-size:13px;color:#aab2c8;margin-top:16px}
</style></head><body>
<h1>Finish bake-off — order ${modelId}, image ${slot}</h1>
<p>Click any image to open it full size, then zoom on the face, the badge and the patch. ${applyLinks}</p>
<div class="grid">${cards}</div>
<p class="tip">Topaz presets are restoration models: they sharpen and recover detail without inventing anything, so the real badge and patch stay exact. Clarity is generative and can redraw lettering.</p>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
