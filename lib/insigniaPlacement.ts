import sharp from "sharp";

/**
 * Real-insignia placement.
 *
 * The edit model draws the badge and shoulder patch in the right place, at
 * the right size and under the right light, but it redraws them: lettering
 * comes out garbled ("AGAGTEESHIKR" for "ASSISTANT CHIEF"). This module keeps
 * the model's placement and swaps in the customer's actual insignia:
 *
 *   1. cut the real badge and patch out of the customer's photos (once);
 *   2. on each portrait, find what the model drew (a rough box from a vision
 *      model, refined to the pixel from the image itself);
 *   3. paint jacket over the drawn insignia, then lay the real one there,
 *      scaled to the same footprint, matched for brightness, with a soft
 *      contact shadow.
 *
 * Everything is pixels from the customer's own photo, so the lettering is
 * exactly theirs. Each insignia fails open: if it cannot be found cleanly
 * (cut off by the frame, wrong shape, too small) the model's version stays.
 */

export type Box = { x: number; y: number; w: number; h: number };

export type InsigniaKind = "badge" | "patch";

export type PreparedCutout = {
  /** Trimmed RGBA PNG of the real insignia. */
  png: Buffer;
  width: number;
  height: number;
  /** The brightly coloured body of the insignia inside the trimmed image. */
  core: Box;
  /** Mean luminance of the core, 0–255. */
  coreLuma: number;
};

export type PlacementReport = {
  kind: InsigniaKind;
  placed: boolean;
  reason?: string;
  target?: Box;
};

type Mask = { data: Uint8Array; w: number; h: number };

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const chroma = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ----------------------------- mask utilities ---------------------------- */

/** Box dilation: any set pixel within `r` (square neighbourhood) sets the output. */
function dilate(m: Mask, r: number): Mask {
  if (r <= 0) return { data: m.data.slice(), w: m.w, h: m.h };
  const { w, h } = m;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let count = 0;
    const row = y * w;
    for (let x = -r; x < w; x++) {
      const add = x + r;
      if (add < w && m.data[row + add]) count++;
      const drop = x - r - 1;
      if (drop >= 0 && m.data[row + drop]) count--;
      if (x >= 0) tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = -r; y < h; y++) {
      const add = y + r;
      if (add < h && tmp[add * w + x]) count++;
      const drop = y - r - 1;
      if (drop >= 0 && tmp[drop * w + x]) count--;
      if (y >= 0) out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return { data: out, w, h };
}

function invert(m: Mask): Mask {
  const out = new Uint8Array(m.data.length);
  for (let i = 0; i < out.length; i++) out[i] = m.data[i] ? 0 : 1;
  return { data: out, w: m.w, h: m.h };
}

const erode = (m: Mask, r: number): Mask => invert(dilate(invert(m), r));

/** Fill enclosed holes: anything the outside cannot reach is inside. */
function fillHoles(m: Mask): Mask {
  const { w, h } = m;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (!m.data[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return { data: out, w, h };
}

type Component = { mask: Mask; box: Box; area: number };

/** Connected components (8-neighbour); returns the one with the best score. */
function bestComponent(m: Mask, score: (c: { box: Box; area: number; pixels: number[] }) => number): Component | null {
  const { w, h } = m;
  const seen = new Uint8Array(w * h);
  let best: { pixels: number[]; box: Box; area: number; s: number } | null = null;
  for (let start = 0; start < w * h; start++) {
    if (!m.data[start] || seen[start]) continue;
    const pixels: number[] = [];
    const stack = [start];
    seen[start] = 1;
    let x0 = w,
      y0 = h,
      x1 = 0,
      y1 = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      pixels.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (m.data[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    const s = score({ box, area: pixels.length, pixels });
    if (!best || s > best.s) best = { pixels, box, area: pixels.length, s };
  }
  if (!best || best.s <= 0) return null;
  const data = new Uint8Array(w * h);
  for (const i of best.pixels) data[i] = 1;
  return { mask: { data, w, h }, box: best.box, area: best.area };
}

function maskBox(m: Mask): Box | null {
  let x0 = m.w,
    y0 = m.h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.data[y * m.w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Raw bytes of a greyscale pipeline as exactly one channel (sharp may hand back three). */
async function oneChannel(img: sharp.Sharp, width: number, height: number): Promise<Buffer> {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return data;
  const out = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) out[i] = data[i * info.channels];
  return out;
}

/** Mask (0/1 at small size) → smooth 0–255 alpha at full size. */
async function maskToAlpha(m: Mask, width: number, height: number, feather: number): Promise<Buffer> {
  const bytes = Buffer.alloc(m.w * m.h);
  for (let i = 0; i < bytes.length; i++) bytes[i] = m.data[i] ? 255 : 0;
  let img = sharp(bytes, { raw: { width: m.w, height: m.h, channels: 1 } }).resize(width, height, {
    fit: "fill",
    kernel: "cubic",
  });
  if (feather >= 0.3) img = img.blur(feather);
  return oneChannel(img, width, height);
}

/**
 * The coloured body of an insignia: bright or saturated pixels, the largest
 * connected group (as scored by the caller), with gaps closed and holes
 * filled so dark enamel and black embroidery inside it are included.
 */
function insigniaCore(
  rgba: Buffer,
  w: number,
  h: number,
  darkLuma: number,
  score: (c: { box: Box; area: number; pixels: number[] }) => number
): { core: Mask; box: Box; area: number } | null {
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 200) continue;
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    // Saturated colour (thread, enamel, gold) or near-white (lettering,
    // polished metal). Plain cloth is neither, even where light falls on it.
    if (chroma(r, g, b) > 60 || luma(r, g, b) > Math.max(darkLuma + 95, 150)) bright[i] = 1;
  }
  // Join the letters, borders and metal highlights into one body.
  const joined = dilate({ data: bright, w, h }, Math.max(1, Math.round(Math.max(w, h) * 0.02)));
  const comp = bestComponent(joined, score);
  if (!comp) return null;
  const r = Math.max(2, Math.round(Math.max(comp.box.w, comp.box.h) * 0.06));
  const closed = erode(fillHoles(dilate(comp.mask, r)), r + Math.max(1, Math.round(Math.max(w, h) * 0.02)));
  const box = maskBox(closed);
  if (!box) return null;
  let area = 0;
  for (let i = 0; i < closed.data.length; i++) area += closed.data[i];
  return { core: closed, box, area };
}

/** Luminance below which a pixel counts as plain dark cloth, from the pixels themselves. */
function darkLevel(rgba: Buffer, count: number): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < count; i++) {
    if (rgba[i * 4 + 3] < 200) continue;
    hist[Math.round(luma(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]))]++;
    n++;
  }
  if (n === 0) return 40;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * 0.3) return v;
  }
  return 40;
}

/* ------------------------------ real cutouts ----------------------------- */

const MASK_SIDE = 320;

/**
 * Turn a background-removed photo of an insignia into a tight cutout.
 * Background removal isolates a metal badge well, but a black patch on a
 * black sleeve comes back as the whole sleeve; in that case the patch is
 * taken as its coloured body plus a rim for the stitched edge.
 */
export async function prepareCutout(bgRemoved: Buffer): Promise<PreparedCutout | null> {
  const base = sharp(bgRemoved).rotate().ensureAlpha();
  const meta = await base.metadata();
  const W0 = meta.width ?? 0;
  const H0 = meta.height ?? 0;
  if (!W0 || !H0) return null;
  const scale = Math.min(1, 1600 / Math.max(W0, H0));
  const W = Math.max(1, Math.round(W0 * scale));
  const H = Math.max(1, Math.round(H0 * scale));
  const full = await base.resize(W, H, { fit: "fill" }).raw().toBuffer();

  const k = Math.min(1, MASK_SIDE / Math.max(W, H));
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));
  const small = await sharp(full, { raw: { width: W, height: H, channels: 4 } })
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer();

  let opaque = 0;
  for (let i = 0; i < w * h; i++) if (small[i * 4 + 3] >= 200) opaque++;
  if (opaque < w * h * 0.004) return null;

  const dark = darkLevel(small, w * h);
  const found = insigniaCore(small, w, h, dark, (c) => c.area);
  if (!found) return null;

  // Did background removal isolate the insignia, or return its surroundings too?
  const isolated = opaque <= found.area * 1.45;
  let alphaSmall: Mask;
  if (isolated) {
    const data = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = small[i * 4 + 3] >= 128 ? 1 : 0;
    alphaSmall = { data, w, h };
  } else {
    // Coloured body plus the dark stitched rim around it.
    alphaSmall = dilate(found.core, Math.max(1, Math.round(Math.max(found.box.w, found.box.h) * 0.045)));
  }

  const alphaFull = await maskToAlpha(alphaSmall, W, H, isolated ? 0 : 1.2);
  const out = Buffer.from(full);
  for (let i = 0; i < W * H; i++) {
    out[i * 4 + 3] = isolated ? full[i * 4 + 3] : Math.min(full[i * 4 + 3], alphaFull[i]);
  }

  const trimBoxSmall = maskBox(alphaSmall);
  if (!trimBoxSmall) return null;
  const inv = 1 / k;
  const tx = clamp(Math.floor(trimBoxSmall.x * inv) - 2, 0, W - 1);
  const ty = clamp(Math.floor(trimBoxSmall.y * inv) - 2, 0, H - 1);
  const tw = clamp(Math.ceil(trimBoxSmall.w * inv) + 4, 1, W - tx);
  const th = clamp(Math.ceil(trimBoxSmall.h * inv) + 4, 1, H - ty);

  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: tx, top: ty, width: tw, height: th })
    .png()
    .toBuffer();

  const core: Box = {
    x: clamp(Math.round(found.box.x * inv) - tx, 0, tw - 1),
    y: clamp(Math.round(found.box.y * inv) - ty, 0, th - 1),
    w: clamp(Math.round(found.box.w * inv), 1, tw),
    h: clamp(Math.round(found.box.h * inv), 1, th),
  };

  let sum = 0;
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!found.core.data[i] || small[i * 4 + 3] < 200) continue;
    sum += luma(small[i * 4], small[i * 4 + 1], small[i * 4 + 2]);
    n++;
  }
  return { png, width: tw, height: th, core, coreLuma: n ? sum / n : 128 };
}

/* ------------------------------- placement ------------------------------- */

type Rgba = { data: Buffer; width: number; height: number };

/**
 * Replace the drawn insignia inside `rough` (a loose box around it, in image
 * pixels) with the real cutout. Mutates `img.data`.
 */
async function placeOne(
  img: Rgba,
  kind: InsigniaKind,
  rough: Box,
  cut: PreparedCutout
): Promise<PlacementReport> {
  const { width: W, height: H } = img;

  // Work area: the rough box with a margin, so a slightly-off box still holds it.
  const mx = Math.round(rough.w * 0.22);
  const my = Math.round(rough.h * 0.22);
  const rx = clamp(Math.round(rough.x - mx), 0, W - 1);
  const ry = clamp(Math.round(rough.y - my), 0, H - 1);
  const rw = clamp(Math.round(rough.w + 2 * mx), 8, W - rx);
  const rh = clamp(Math.round(rough.h + 2 * my), 8, H - ry);

  const region = Buffer.alloc(rw * rh * 4);
  for (let y = 0; y < rh; y++) {
    img.data.copy(region, y * rw * 4, ((ry + y) * W + rx) * 4, ((ry + y) * W + rx + rw) * 4);
  }

  const k = Math.min(1, MASK_SIDE / Math.max(rw, rh));
  const w = Math.max(1, Math.round(rw * k));
  const h = Math.max(1, Math.round(rh * k));
  const small = await sharp(region, { raw: { width: rw, height: rh, channels: 4 } })
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer();

  const dark = darkLevel(small, w * h);
  // Prefer the group sitting inside the rough box itself, not in its margin.
  const ix0 = (mx * k) | 0;
  const iy0 = (my * k) | 0;
  const ix1 = w - ix0;
  const iy1 = h - iy0;
  const found = insigniaCore(small, w, h, dark, (c) => {
    let inside = 0;
    for (const i of c.pixels) {
      const x = i % w;
      const y = (i - x) / w;
      if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) inside++;
    }
    return inside;
  });
  if (!found) return { kind, placed: false, reason: "nothing found in the box" };

  const inv = 1 / k;
  const target: Box = {
    x: rx + found.box.x * inv,
    y: ry + found.box.y * inv,
    w: found.box.w * inv,
    h: found.box.h * inv,
  };

  // Sanity checks: keep the model's version rather than place something wrong.
  const roughArea = rough.w * rough.h;
  const targetArea = target.w * target.h;
  if (targetArea < roughArea * 0.18) return { kind, placed: false, reason: "found shape too small", target };
  if (targetArea > roughArea * 1.9) return { kind, placed: false, reason: "found shape too large", target };
  const edge = 4;
  if (target.x <= edge || target.y <= edge || target.x + target.w >= W - edge || target.y + target.h >= H - edge) {
    return { kind, placed: false, reason: "cut off by the frame", target };
  }
  // Touching the work-area border means we did not see the whole thing.
  if (
    found.box.x <= 0 ||
    found.box.y <= 0 ||
    found.box.x + found.box.w >= w ||
    found.box.y + found.box.h >= h
  ) {
    return { kind, placed: false, reason: "extends past the search area", target };
  }

  // Scale: map the real insignia's coloured body onto the drawn one's. A patch
  // on a turned sleeve is legitimately narrower; a badge is nearly flat-on.
  let sx = target.w / cut.core.w;
  let sy = target.h / cut.core.h;
  const [lo, hi] = kind === "patch" ? [0.5, 1.12] : [0.82, 1.18];
  const ratio = sx / sy;
  if (ratio < lo * 0.7 || ratio > hi * 1.45) {
    return { kind, placed: false, reason: "found shape does not match the real insignia", target };
  }
  if (ratio < lo) sx = sy * lo;
  else if (ratio > hi) sy = sx / hi;

  const pw = Math.max(4, Math.round(cut.width * sx));
  const ph = Math.max(4, Math.round(cut.height * sy));
  if (pw < 40 || ph < 40) return { kind, placed: false, reason: "too small to place", target };

  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const px = Math.round(cx - (cut.core.x + cut.core.w / 2) * sx);
  const py = Math.round(cy - (cut.core.y + cut.core.h / 2) * sy);

  // Brightness of what the model drew there, so the real one sits in the same light.
  let gsum = 0;
  let gn = 0;
  for (let i = 0; i < w * h; i++) {
    if (!found.core.data[i]) continue;
    gsum += luma(small[i * 4], small[i * 4 + 1], small[i * 4 + 2]);
    gn++;
  }
  const gain = clamp((gn ? gsum / gn : cut.coreLuma) / Math.max(1, cut.coreLuma), 0.85, 1.2);

  // 1. Paint jacket over the drawn insignia: each pixel becomes the average
  //    of nearby plain cloth, which keeps folds and the light falloff.
  const eraseSmall = dilate(found.core, Math.max(2, Math.round(Math.max(found.box.w, found.box.h) * 0.11)));
  // Weighted blur done by hand (colour and weight blurred separately, then
  // divided) so only plain cloth contributes to each filled pixel.
  const clothRgb = Buffer.alloc(w * h * 3);
  const clothWeight = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = small[i * 4];
    const g = small[i * 4 + 1];
    const b = small[i * 4 + 2];
    // Bright strays (a button, a shirt edge, the backdrop) would tint the fill.
    const plain =
      !eraseSmall.data[i] && small[i * 4 + 3] >= 200 && chroma(r, g, b) <= 60 && luma(r, g, b) <= dark + 45;
    if (!plain) continue;
    clothRgb[i * 3] = r;
    clothRgb[i * 3 + 1] = g;
    clothRgb[i * 3 + 2] = b;
    clothWeight[i] = 255;
  }
  const sigma = Math.max(3, Math.max(found.box.w, found.box.h) * 0.3);
  const blurredRgb = await sharp(clothRgb, { raw: { width: w, height: h, channels: 3 } })
    .blur(sigma)
    .raw()
    .toBuffer();
  const blurredWeight = await oneChannel(
    sharp(clothWeight, { raw: { width: w, height: h, channels: 1 } }).blur(sigma),
    w,
    h
  );
  const fillSmall = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const wgt = blurredWeight[i];
    const d = wgt > 3 ? 255 / wgt : 0;
    fillSmall[i * 3] = clamp(Math.round(blurredRgb[i * 3] * d), 0, 255);
    fillSmall[i * 3 + 1] = clamp(Math.round(blurredRgb[i * 3 + 1] * d), 0, 255);
    fillSmall[i * 3 + 2] = clamp(Math.round(blurredRgb[i * 3 + 2] * d), 0, 255);
  }
  const fill = await sharp(fillSmall, { raw: { width: w, height: h, channels: 3 } })
    .resize(rw, rh, { fit: "fill", kernel: "cubic" })
    .raw()
    .toBuffer();
  const eraseAlpha = await maskToAlpha(eraseSmall, rw, rh, Math.max(1.5, rw * 0.012));

  let seed = (rx * 73856093) ^ (ry * 19349663) ^ 0x9e3779b9;
  const noise = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967295 - 0.5) * 7;
  };
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      const a = eraseAlpha[i] / 255;
      if (a <= 0.004) continue;
      const o = ((ry + y) * W + rx + x) * 4;
      if (img.data[o + 3] < 8) continue;
      const n = noise();
      for (let c = 0; c < 3; c++) {
        const v = clamp(fill[i * 3 + c] + n, 0, 255);
        img.data[o + c] = Math.round(img.data[o + c] * (1 - a) + v * a);
      }
    }
  }

  // 2. The real insignia at the drawn one's footprint.
  const placed = await sharp(cut.png)
    .resize(pw, ph, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // 3. Contact shadow from its own silhouette.
  const alphaOnly = Buffer.alloc(pw * ph);
  for (let i = 0; i < pw * ph; i++) alphaOnly[i] = placed[i * 4 + 3];
  const pad = Math.max(4, Math.round(Math.max(pw, ph) * 0.06));
  const sw = pw + 2 * pad;
  const sh = ph + 2 * pad;
  const shadow = await oneChannel(
    sharp(alphaOnly, { raw: { width: pw, height: ph, channels: 1 } })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0 } })
      .blur(Math.max(1.2, Math.max(pw, ph) * 0.018)),
    sw,
    sh
  );
  const sdx = Math.round(pw * 0.008);
  const sdy = Math.round(ph * 0.022);
  for (let y = 0; y < sh; y++) {
    const Y = py - pad + sdy + y;
    if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < sw; x++) {
      const X = px - pad + sdx + x;
      if (X < 0 || X >= W) continue;
      const a = (shadow[y * sw + x] / 255) * 0.42;
      if (a <= 0.004) continue;
      const o = (Y * W + X) * 4;
      if (img.data[o + 3] < 8) continue;
      img.data[o] = Math.round(img.data[o] * (1 - a));
      img.data[o + 1] = Math.round(img.data[o + 1] * (1 - a));
      img.data[o + 2] = Math.round(img.data[o + 2] * (1 - a));
    }
  }

  for (let y = 0; y < ph; y++) {
    const Y = py + y;
    if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < pw; x++) {
      const X = px + x;
      if (X < 0 || X >= W) continue;
      const i = (y * pw + x) * 4;
      const o = (Y * W + X) * 4;
      // Never draw outside the person's silhouette.
      const a = (placed[i + 3] / 255) * (img.data[o + 3] / 255);
      if (a <= 0.004) continue;
      for (let c = 0; c < 3; c++) {
        const v = clamp(placed[i + c] * gain, 0, 255);
        img.data[o + c] = Math.round(img.data[o + c] * (1 - a) + v * a);
      }
    }
  }

  return { kind, placed: true, target };
}

/**
 * Place the real insignia on a portrait.
 * `image` is the portrait (RGBA; transparent outside the person is fine and
 * preferred, so nothing behind them is mistaken for insignia).
 * Returns a PNG of the same size.
 */
export async function placeInsignia(args: {
  image: Buffer;
  boxes: Partial<Record<InsigniaKind, Box | null>>;
  cutouts: Partial<Record<InsigniaKind, PreparedCutout | null>>;
}): Promise<{ image: Buffer; reports: PlacementReport[] }> {
  const base = sharp(args.image).ensureAlpha();
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const data = await base.raw().toBuffer();
  const img: Rgba = { data, width, height };
  const reports: PlacementReport[] = [];

  for (const kind of ["patch", "badge"] as InsigniaKind[]) {
    const box = args.boxes[kind];
    const cut = args.cutouts[kind];
    if (!box) {
      reports.push({ kind, placed: false, reason: "not located" });
      continue;
    }
    if (!cut) {
      reports.push({ kind, placed: false, reason: "no cutout of the real insignia" });
      continue;
    }
    try {
      reports.push(await placeOne(img, kind, box, cut));
    } catch (e) {
      reports.push({ kind, placed: false, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const image = await sharp(img.data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { image, reports };
}
