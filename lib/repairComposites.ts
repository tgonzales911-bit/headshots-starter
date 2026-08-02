/**
 * Rebuild an order's final_edit_results from the stored composite files:
 * composites/{userId}/{modelId}/final_{index}_{timestamp}.png — latest per
 * index. Used by the admin repair action and the recovery sweep (covers the
 * case where composites uploaded fine but the merge RPC failed).
 */

import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const compositeBucket =
  process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

export async function rebuildSlotsFromComposites(
  admin: SupabaseClient<Database>,
  args: { userId: string; modelId: number; expected?: number }
): Promise<{ slots: string[]; found: number }> {
  const expected = args.expected ?? 4;
  const prefix = `composites/${args.userId}/${args.modelId}`;
  const { data: files, error } = await admin.storage
    .from(compositeBucket)
    .list(prefix, { limit: 200 });
  if (error) throw new Error(`Storage list failed: ${error.message}`);

  const latestByIndex = new Map<number, { ts: number; name: string }>();
  for (const f of files ?? []) {
    const m = f.name.match(/^final_(\d)_(\d+)\.png$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const ts = Number(m[2]);
    if (idx < 0 || idx >= expected || !Number.isFinite(ts)) continue;
    const cur = latestByIndex.get(idx);
    if (!cur || ts > cur.ts) latestByIndex.set(idx, { ts, name: f.name });
  }

  const slots = Array.from({ length: expected }, (_, i) => {
    const hit = latestByIndex.get(i);
    if (!hit) return "";
    const { data } = admin.storage
      .from(compositeBucket)
      .getPublicUrl(`${prefix}/${hit.name}`);
    return data.publicUrl ?? "";
  });

  return { slots, found: slots.filter(Boolean).length };
}
