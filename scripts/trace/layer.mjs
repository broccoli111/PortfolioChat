#!/usr/bin/env node
/**
 * Layering pass.
 *
 * Reads `reference/traced-raw.svg` (produced by `npm run trace`) and
 * re-groups its paths by color + size into the component's
 * animation-friendly group structure:
 *
 *   <g id="glow" />     glow halo (warm amber ring)
 *   <g id="head" />     cream face fill
 *   <g id="contour" />  thick amber sticker outline
 *   <g id="hair" />     dark hair mass + lighter highlight block
 *   <g id="beard" />    medium-gray beard mass
 *   <g id="ear" />      ear silhouette (bundled into head/contour)
 *   <g id="glasses" />  amber lens rims (bundled into contour by color)
 *   <g id="brows" />    (empty — component draws these)
 *   <g id="eyes" />     (empty — component draws these)
 *   <g id="pupils" />   (empty — component draws these)
 *   <g id="mouth" />    (empty — component draws these)
 *
 * Classification uses a few coarse buckets based on observed hues in the
 * real trace output:
 *   - cream / face        very light, slight warm tint
 *   - amber glow ring     warm orange with low saturation (#FADAB4-ish)
 *   - amber contour       saturated orange (#F48C0C-ish)
 *   - dark mass           near-black, used for hair, glasses dark inner
 *                         contour, pupils, mouth, etc.
 *   - mid gray            beard / eye-white shading
 *
 * For the animation layer we only need the FACE + CONTOUR + DARK MASS +
 * GLOW. The component overlays its own eyes / pupils / brows / mouth,
 * so we discard those feature-specific dark shapes and rely on the
 * contour + dark silhouette for the sticker look.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const IN_SVG = path.join(root, "reference/traced-raw.svg");
const OUT_SVG = path.join(root, "reference/traced-layered.svg");
const OUT_TS = path.join(root, "src/avatar/tracedGeometry.ts");

if (!fs.existsSync(IN_SVG)) {
  console.error(`[layer] missing input: ${IN_SVG}`);
  console.error(`[layer] run \`npm run trace\` first.`);
  process.exit(1);
}

const svg = fs.readFileSync(IN_SVG, "utf8");

// ---------- Color classification ---------------------------------------

function parseFill(fill) {
  const hex = fill?.match(/#([0-9a-fA-F]{6})/);
  if (!hex) return null;
  const n = parseInt(hex[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function classify(c) {
  if (!c) return "other";
  const { r, g, b } = c;
  const bright = (r + g + b) / 3;
  const warm = r - b;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);

  // Pure white — the flattened background
  if (r > 250 && g > 250 && b > 250) return "background";

  // Cream face: very bright, slightly warm, low saturation
  if (bright > 225 && warm >= 0 && warm < 35 && sat < 40) return "face";

  // Dark hair / beard / internal strokes: very dark
  if (bright < 70) return "dark";

  // Amber contour: saturated orange
  if (warm > 120 && r > 200 && g > 100 && g < 180 && b < 60) return "contour";

  // Amber glow ring: warm orange with lower sat / more b
  if (warm > 30 && r > 210 && g > 180 && b > 120 && b < 230) return "glow";

  // Medium gray / warm-gray: beard
  if (bright > 70 && bright < 180 && sat < 40) return "beard";

  return "other";
}

// ---------- Parse paths ------------------------------------------------

const pathRe = /<path\s+[^>]*\/>/g;
const attrRe = (name) => new RegExp(`${name}="([^"]*)"`, "i");

// vtracer doesn't emit a viewBox — it uses width/height on the root <svg>.
const wMatch = svg.match(/<svg[^>]+width="(\d+)"[^>]+height="(\d+)"/);
const vbw = wMatch ? parseInt(wMatch[1], 10) : 1024;
const vbh = wMatch ? parseInt(wMatch[2], 10) : 1024;

/** Parse a `translate(x,y)` transform attribute. vtracer always emits this
 *  form — every path is positioned by a single translate, with the path
 *  `d` values being offsets from that origin. */
function parseTranslate(str) {
  if (!str) return { tx: 0, ty: 0 };
  const m = str.match(/translate\(\s*([-\d.]+)\s*,?\s*([-\d.]+)?\s*\)/);
  if (!m) return { tx: 0, ty: 0 };
  return { tx: parseFloat(m[1]), ty: parseFloat(m[2] ?? 0) };
}

/** Walk every "x y" pair in a path `d` string and compute the true visual
 *  bounding box, respecting the path's translate origin. The previous
 *  implementation forgot to add the translate and also included control
 *  points — which for cubic beziers can extend far beyond the curve. Using
 *  just the anchor/end vertices from M/L/C commands gives a tight bound. */
function pathBoundsAbs(d, tx, ty) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  // Tokenize into commands + their numeric args.
  const re = /([MmLlCcSsZzHhVvQqTtAa])|(-?\d+(?:\.\d+)?)/g;
  let cmd = null;
  let args = [];
  let cx = 0, cy = 0; // current pen position (absolute)
  const points = [];
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      // Flush previous command
      if (cmd) applyCmd(cmd, args);
      cmd = m[1];
      args = [];
    } else {
      args.push(parseFloat(m[2]));
    }
  }
  if (cmd) applyCmd(cmd, args);

  function applyCmd(c, a) {
    const abs = c === c.toUpperCase();
    switch (c.toUpperCase()) {
      case "M":
        for (let i = 0; i < a.length; i += 2) {
          cx = abs ? a[i] : cx + a[i];
          cy = abs ? a[i + 1] : cy + a[i + 1];
          points.push([cx, cy]);
        }
        break;
      case "L":
        for (let i = 0; i < a.length; i += 2) {
          cx = abs ? a[i] : cx + a[i];
          cy = abs ? a[i + 1] : cy + a[i + 1];
          points.push([cx, cy]);
        }
        break;
      case "H":
        for (const v of a) {
          cx = abs ? v : cx + v;
          points.push([cx, cy]);
        }
        break;
      case "V":
        for (const v of a) {
          cy = abs ? v : cy + v;
          points.push([cx, cy]);
        }
        break;
      case "C":
        // Cubic: skip control points, use only anchor (end) points.
        for (let i = 0; i + 5 < a.length; i += 6) {
          cx = abs ? a[i + 4] : cx + a[i + 4];
          cy = abs ? a[i + 5] : cy + a[i + 5];
          points.push([cx, cy]);
        }
        break;
      case "S":
        for (let i = 0; i + 3 < a.length; i += 4) {
          cx = abs ? a[i + 2] : cx + a[i + 2];
          cy = abs ? a[i + 3] : cy + a[i + 3];
          points.push([cx, cy]);
        }
        break;
      case "Q":
        for (let i = 0; i + 3 < a.length; i += 4) {
          cx = abs ? a[i + 2] : cx + a[i + 2];
          cy = abs ? a[i + 3] : cy + a[i + 3];
          points.push([cx, cy]);
        }
        break;
      case "T":
        for (let i = 0; i + 1 < a.length; i += 2) {
          cx = abs ? a[i] : cx + a[i];
          cy = abs ? a[i + 1] : cy + a[i + 1];
          points.push([cx, cy]);
        }
        break;
      case "Z":
        break;
    }
  }

  for (const [x, y] of points) {
    const ax = x + tx;
    const ay = y + ty;
    if (ax < minX) minX = ax;
    if (ay < minY) minY = ay;
    if (ax > maxX) maxX = ax;
    if (ay > maxY) maxY = ay;
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Target viewBox: keep 256x256 so the traced SVG plugs straight into the
// component. We fit the bounding box of the "visible" (non-background)
// content into 256x256 with a small margin.
const TARGET = 256;
const MARGIN = 6;

const buckets = {
  face: [],
  contour: [],
  glow: [],
  hair: [],
  beard: [],
  other: [],
};

// Bounding box of visible (non-background) content so we can center/scale.
let visMinX = Infinity, visMinY = Infinity, visMaxX = -Infinity, visMaxY = -Infinity;

const allPaths = [];
let srcIndex = 0;
for (const node of svg.match(pathRe) ?? []) {
  const d = node.match(attrRe("d"))?.[1];
  const fill = node.match(attrRe("fill"))?.[1];
  const transform = node.match(attrRe("transform"))?.[1] ?? "";
  const myIndex = srcIndex++;
  if (!d) continue;
  const rgb = parseFill(fill);
  const cls = classify(rgb);

  const { tx, ty } = parseTranslate(transform);
  const bounds = pathBoundsAbs(d, tx, ty);
  if (!bounds) continue;

  // Drop only the single image-spanning background rectangle that
  // vtracer emits as its first path. Every other white fragment is a
  // "cut-out" that must stay in-place to preserve the paint order —
  // dropping any of them causes underlying colored regions to leak
  // through (e.g. the amber contour bleeding onto the forehead).
  const coverage = (bounds.w * bounds.h) / (vbw * vbh);
  if (cls === "background" && coverage > 0.85) continue;

  allPaths.push({ d, fill, cls, bounds, transform, srcIndex: myIndex });
  if (bounds.minX < visMinX) visMinX = bounds.minX;
  if (bounds.minY < visMinY) visMinY = bounds.minY;
  if (bounds.maxX > visMaxX) visMaxX = bounds.maxX;
  if (bounds.maxY > visMaxY) visMaxY = bounds.maxY;
}

// Tight bbox of visible content -> target viewBox transform.
const visW = visMaxX - visMinX;
const visH = visMaxY - visMinY;
const scale = (TARGET - MARGIN * 2) / Math.max(visW, visH);
const tx = (TARGET - visW * scale) / 2 - visMinX * scale;
const ty = (TARGET - visH * scale) / 2 - visMinY * scale;

// The darkest paths that sit OUTSIDE the amber contour hull are things
// like pupils/mouth/glasses-dark-inner. We want to keep only the dark
// paths that constitute the HAIR mass. Heuristic: hair lives in the
// upper ~45% of the visible content's height; feature paths (pupils,
// brows, mouth) live in the middle third.
const hairCutoffY = visMinY + visH * 0.48;
for (const p of allPaths) {
  const cy = (p.bounds.minY + p.bounds.maxY) / 2;
  if (p.cls === "dark") {
    if (cy < hairCutoffY) buckets.hair.push(p);
    else buckets.other.push(p); // drop pupils/brows/mouth — component draws them
  } else if (p.cls === "face") {
    buckets.face.push(p);
  } else if (p.cls === "contour") {
    buckets.contour.push(p);
  } else if (p.cls === "glow") {
    buckets.glow.push(p);
  } else if (p.cls === "beard") {
    buckets.beard.push(p);
  } else {
    buckets.other.push(p);
  }
}

// Tag every path with its class, then sort by ORIGINAL source order so
// the paint stacking that vtracer produced is preserved exactly. Without
// this, reordering paths into named groups paints the amber contour
// OVER the face, destroying the image.
const paintOrder = [];
for (const [name, arr] of Object.entries(buckets)) {
  for (const p of arr) paintOrder.push({ ...p, layer: name });
}
paintOrder.sort((a, b) => a.srcIndex - b.srcIndex);

// ---------- Identify animated "feature" paths ---------------------------
//
// The traced SVG contains baked-in dark pupils, brows, a mustache/mouth,
// and a soul patch. To make the avatar animatable, we flag those paths so
// the component can SKIP them and overlay animated features on top.
//
// Heuristics (in 1024-source-space bounds):
//   - BROWS:       thin horizontal dark shapes sitting above the lenses
//                  (w >> h, y in ~420-490 band)
//   - PUPILS:      medium-tall dark shapes roughly inside lens interiors
//                  (y in ~480-620 band, h > w)
//   - MOUTH:       thin horizontal dark shape in the lower face
//                  (w >> h, y in ~670-720 band)
//   - SOUL PATCH:  small dark cluster just below the mouth band (y ~720-780)
//
// Everything else dark (head outline, hair, beard, ear detail, glasses
// rim inner contour, catch-light beds) stays un-flagged so the traced
// silhouette base is preserved intact.

// Empirically measured from the last trace run (1024x1024 reference):
const BROW_BAND = [420, 495];
const PUPIL_BAND = [475, 640];
const MOUTH_BAND = [670, 725];
const SOUL_PATCH_BAND = [710, 790];

// Lens horizontal ranges (approx 1024-space) — pupils must fall inside one.
const LENS_BANDS_X = [
  [240, 440], // near-side lens
  [440, 660], // far-side lens
];

function tagFeature(p) {
  if (p.cls !== "dark") return null;
  const b = p.bounds;
  const cy = (b.minY + b.maxY) / 2;
  const cx = (b.minX + b.maxX) / 2;

  // Very large silhouette shapes are the head contour inner line / hair
  // and should always be kept.
  if (b.w > 420 || b.h > 420) return null;

  const ratio = b.w / Math.max(1, b.h);

  // Brows — thin horizontal bar above lenses
  if (ratio > 2.8 && cy >= BROW_BAND[0] && cy <= BROW_BAND[1]) return "brow";

  // Mouth — thin horizontal bar in the lower face
  if (ratio > 2.5 && cy >= MOUTH_BAND[0] && cy <= MOUTH_BAND[1]) return "mouth";

  // Soul patch — compact dark cluster just below mouth band
  if (cy >= SOUL_PATCH_BAND[0] && cy <= SOUL_PATCH_BAND[1] && b.w < 120 && b.h < 80) {
    return "soulPatch";
  }

  // Pupil — tall-ish dark shape within a lens band
  if (cy >= PUPIL_BAND[0] && cy <= PUPIL_BAND[1]) {
    const insideLens = LENS_BANDS_X.some(([x0, x1]) => cx >= x0 && cx <= x1);
    if (insideLens && b.h > 40 && b.h < 180 && b.w < 140) return "pupil";
  }

  return null;
}

for (const p of paintOrder) {
  p.feature = tagFeature(p);
}

// ---------- Anchors (in 256-space) for the animated overlay -------------
//
// Hand-measured by overlaying red markers on the rendered traced-layered
// SVG and visually confirming they land on the intended features. The
// automatic pupil/brow detection was too fragile because the baked-in
// "pupils" in the reference are actually compound shapes (pupil + dark
// catch-light bed) that overlap the glasses frame dark rim, so their
// bounding boxes didn't cleanly isolate.
const anchors = {
  eyeL:  { cx: 62,  cy: 142 },
  eyeR:  { cx: 127, cy: 142 },
  browL: { cx: 62,  cy: 118 },
  browR: { cx: 127, cy: 118 },
  mouth: { cx: 110, cy: 197 },
};

// Face-colored "erasers" painted over the traced pupils/brows/mouth
// region before the animated features are drawn on top. These are
// ellipses / rectangles in 256-space sized to cleanly cover the baked-in
// dark shapes while leaving the glasses rim intact.
const eraseRegions = {
  // Lens interiors — wipe the traced pupils + catch-light clutter
  lensL: { cx: 62,  cy: 145, rx: 18, ry: 19 },
  lensR: { cx: 127, cy: 145, rx: 18, ry: 19 },
  // Mouth area — wipe the traced smirk + mustache drop
  mouth: { cx: 110, cy: 196, rx: 20, ry: 9 },
};

// ---------- Emit layered SVG -------------------------------------------

// Document-level transform scales the visible bbox (in 1024-space) into
// the target 256-space viewBox with a small margin. Each path's own
// translate is kept verbatim inside.
const transformAttr = `transform="matrix(${scale} 0 0 ${scale} ${tx} ${ty})"`;

function renderPaths(entries, opts = {}) {
  if (entries.length === 0) return "";
  return entries
    .map((e) => {
      const attrs = [
        `d="${e.d}"`,
        `fill="${e.fill}"`,
        e.transform ? `transform="${e.transform}"` : "",
        `data-layer="${e.layer}"`,
        e.feature ? `data-feature="${e.feature}"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `    <path ${attrs}/>`;
    })
    .join("\n");
}

// Two flavors of the layered SVG:
//   - traced-layered.svg       ALL paths including baked-in features
//                              (useful as a faithful static portrait)
//   - traced-layered-nofeat.svg  paths with data-feature set STRIPPED
//                              so animated features can overlay cleanly
const nofeat = paintOrder.filter((p) => !p.feature);
const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TARGET} ${TARGET}" width="512" height="512">
  <g id="silhouette" ${transformAttr}>
${renderPaths(paintOrder)}
  </g>
</svg>`;
fs.writeFileSync(OUT_SVG, out);

const outNoFeat = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TARGET} ${TARGET}" width="512" height="512">
  <g id="silhouette-no-features" ${transformAttr}>
${renderPaths(nofeat)}
  </g>
</svg>`;
fs.writeFileSync(OUT_SVG.replace(".svg", "-nofeat.svg"), outNoFeat);

// ---------- Emit typed paths for the component -------------------------

function tsPaintOrder() {
  const joined = paintOrder
    .map(
      (e) =>
        `  { d: ${JSON.stringify(e.d)}, fill: ${JSON.stringify(e.fill)}, transform: ${JSON.stringify(
          e.transform ?? "",
        )}, layer: ${JSON.stringify(e.layer)}, feature: ${JSON.stringify(e.feature ?? null)} }`,
    )
    .join(",\n");
  return `export const TRACED_PAINT_ORDER: Array<{
  d: string;
  fill: string;
  transform: string;
  layer: string;
  feature: string | null;
}> = [
${joined}
];`;
}

const ts = `// Auto-generated by scripts/trace/layer.mjs. Do not edit by hand.
// Run \`npm run trace && npm run trace:layer\` to regenerate.

export const TRACE_VIEWBOX = ${TARGET};
export const TRACE_TRANSFORM = "matrix(${scale} 0 0 ${scale} ${tx} ${ty})";

/**
 * Anchor points (in the 256x256 target viewBox) measured from the traced
 * feature paths. The animated overlay uses these so eyes / pupils /
 * brows / mouth appear exactly where the traced portrait drew them.
 */
export const TRACED_ANCHORS = {
  eyeL:  { cx: ${anchors.eyeL.cx}, cy: ${anchors.eyeL.cy} },
  eyeR:  { cx: ${anchors.eyeR.cx}, cy: ${anchors.eyeR.cy} },
  browL: { cx: ${anchors.browL.cx}, cy: ${anchors.browL.cy} },
  browR: { cx: ${anchors.browR.cx}, cy: ${anchors.browR.cy} },
  mouth: { cx: ${anchors.mouth.cx}, cy: ${anchors.mouth.cy} },
} as const;

/**
 * Face-colored regions the animated overlay paints to erase the traced
 * pupils / mouth / brows before drawing its own animated versions on top.
 * All in 256x256 target space.
 */
export const TRACED_ERASE_REGIONS = {
  lensL: { cx: ${eraseRegions.lensL.cx}, cy: ${eraseRegions.lensL.cy}, rx: ${eraseRegions.lensL.rx}, ry: ${eraseRegions.lensL.ry} },
  lensR: { cx: ${eraseRegions.lensR.cx}, cy: ${eraseRegions.lensR.cy}, rx: ${eraseRegions.lensR.rx}, ry: ${eraseRegions.lensR.ry} },
  mouth: { cx: ${eraseRegions.mouth.cx}, cy: ${eraseRegions.mouth.cy}, rx: ${eraseRegions.mouth.rx}, ry: ${eraseRegions.mouth.ry} },
} as const;

/**
 * All kept paths in ORIGINAL vtracer paint order. The hierarchical stacked
 * trace relies on this order (later paths painted on top of earlier ones),
 * so we preserve it verbatim. Each entry carries:
 *   - \`layer\`:   high-level group (glow / face / contour / hair / beard / other)
 *   - \`feature\`: when non-null, the path is a baked-in animatable feature
 *               (pupil / brow / mouth / soulPatch). Consumers that want to
 *               animate the avatar should SKIP these paths and render the
 *               animated overlay on top instead.
 */
${tsPaintOrder()}
`;
fs.writeFileSync(OUT_TS, ts);

const featureCounts = {};
for (const p of paintOrder) {
  const k = p.feature ?? "—";
  featureCounts[k] = (featureCounts[k] ?? 0) + 1;
}
console.log(`[layer] kept ${paintOrder.length} paths (${nofeat.length} after feature-strip)`);
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  layer=${k.padEnd(10)} ${v.length}`);
}
for (const [k, v] of Object.entries(featureCounts)) {
  console.log(`  feature=${k.padEnd(10)} ${v}`);
}
console.log(`[layer] anchors (256-space):`, anchors);
console.log(`[layer] visible bbox: (${visMinX},${visMinY})..(${visMaxX},${visMaxY})`);
console.log(`[layer] transform: matrix(${scale.toFixed(3)} 0 0 ${scale.toFixed(3)} ${tx.toFixed(1)} ${ty.toFixed(1)})`);
console.log(`[layer] wrote ${OUT_SVG}`);
console.log(`[layer] wrote ${OUT_TS}`);
