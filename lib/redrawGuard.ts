import sharp from "sharp";

/**
 * Did an edit keep the picture it was given, or draw a new one?
 *
 * The insignia edit is told to add a badge, patch and collar pins and leave
 * everything else alone. About one time in six it instead returns a fresh
 * portrait of a different person. Comparing the middle of the frame (face,
 * neck, upper chest) before and after catches that without asking another
 * model: a real edit leaves those pixels almost identical, a redraw does not.
 *
 * Returns a correlation from -1 to 1; in testing real edits scored 0.84 to 0.99 and redraws 0.16 to 0.44.
 */
export async function compositionSimilarity(before: Buffer, after: Buffer): Promise<number> {
  const W = 64;
  const H = 86;
  const load = (buf: Buffer) =>
    sharp(buf)
      .flatten({ background: "#808080" })
      .resize(W, H, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
  const [a, b] = await Promise.all([load(before), load(after)]);
  const ca = a.info.channels;
  const cb = b.info.channels;
  const x0 = Math.round(W * 0.28);
  const x1 = Math.round(W * 0.72);
  const y0 = Math.round(H * 0.06);
  const y1 = Math.round(H * 0.6);
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sa += a.data[(y * W + x) * ca];
      sb += b.data[(y * W + x) * cb];
      n++;
    }
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const va = a.data[(y * W + x) * ca] - ma;
      const vb = b.data[(y * W + x) * cb] - mb;
      num += va * vb;
      da += va * va;
      db += vb * vb;
    }
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/** Below this the edit is treated as a redraw and run again. */
export const REDRAW_THRESHOLD = 0.7;
