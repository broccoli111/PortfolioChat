#!/usr/bin/env node
/**
 * Layering pass.
 *
 * Reads `reference/traced-raw.svg` (produced by `npm run trace`) and
 * re-groups its paths by color into the component's animation-friendly
 * group structure:
 *
 *   <g id="glow" />     <-- left empty; injected at render time
 *   <g id="head" />     <-- cream face fill + amber contour
 *   <g id="hair" />     <-- dark hair mass + lighter highlight block
 *   <g id="beard" />    <-- medium-gray beard mass
 *   <g id="ear" />      <-- ear silhouette (if distinguishable)
 *   <g id="glasses" />  <-- amber rims
 *   <g id="brows" />    <-- (left empty; component draws its own)
 *   <g id="eyes" />     <-- (left empty; component draws its own)
 *   <g id="pupils" />   <-- (left empty; component draws its own)
 *   <g id="mouth" />    <-- (left empty; component draws its own)
 *
 * Classification is done by clustering each path's `fill` into named buckets
 * based on HSV distance to anchor colors. Anchors match the reference palette.
 *
 * Output:
 *   - reference/traced-layered.svg  — re-grouped SVG (viewBox 0 0 256 256)
 *   - src/avatar/tracedGeometry.ts  — exported paths per layer so the
 *     TalkingHeadAvatar can use them directly
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

// ---------- Color classification ----------------------------------------

/** Anchor colors for each layer bucket. Tuned against the reference palette. */
const ANCHORS = {
  glowOrange: { r: 0xff, g: 0xae, b: 0x3b },   // glow halo (discarded — layer)
  contourAmber: { r: 0xf5, g: 0x8a, b: 0x1f }, // sticker contour / glasses rim
  face: { r: 0xfa, g: 0xf1, b: 0xe0 },         // cream face
  hairDark: { r: 0x2b, g: 0x26, b: 0x21 },     // dark hair mass
  hairLight: { r: 0x6b, g: 0x61, b: 0x58 },    // lighter highlight block
  beard: { r: 0x6e, g: 0x64, b: 0x5b },        // medium gray beard
  outline: { r: 0x1a, g: 0x14, b: 0x10 },      // thin dark internal lines
  background: { r: 0xff, g: 0xff, b: 0xff },   // paper / transparent bg
};

function parseFill(fill) {
  if (!fill) return null;
  const hex = fill.match(/#([0-9a-fA-F]{6})/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const rgb = fill.match(/rgb[a]?\s*\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(",").map((s) => parseFloat(s.trim()));
    return { r: parts[0] | 0, g: parts[1] | 0, b: parts[2] | 0 };
  }
  return null;
}

function colorDist(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function classify(rgb) {
  let best = { name: "background", dist: Infinity };
  for (const [name, anchor] of Object.entries(ANCHORS)) {
    const d = colorDist(rgb, anchor);
    if (d < best.dist) best = { name, dist: d };
  }
  return best;
}

// ---------- Parse paths out of the raw trace ----------------------------

// vtracer emits `<path d="..." fill="#xxxxxx" transform="..."/>` elements.
// Grab each one with a small regex — trace output is flat, no nesting.
const pathRe = /<path\s+[^>]*\/>/g;
const attrRe = (name) => new RegExp(`${name}="([^"]*)"`, "i");

const rawMatch = svg.match(/viewBox="([^"]+)"/);
const rawViewBox = rawMatch ? rawMatch[1] : "0 0 256 256";
const [vbx, vby, vbw, vbh] = rawViewBox.split(/\s+/).map(Number);

// We want the final SVG to live in a 256x256 viewBox so it plugs into the
// existing component without other code changing. Compute a scale + translate
// that centers the original trace inside 0 0 256 256 with some breathing room.
const TARGET = 256;
const MARGIN = 4; // leave a few units at the edge so the contour isn't clipped
const scale = (TARGET - MARGIN * 2) / Math.max(vbw, vbh);
const tx = (TARGET - vbw * scale) / 2 - vbx * scale;
const ty = (TARGET - vbh * scale) / 2 - vby * scale;

const buckets = {
  head: [],
  hair: [],
  hairHighlight: [],
  beard: [],
  glasses: [],
  contour: [],
  other: [],
};

let index = 0;
for (const node of svg.match(pathRe) ?? []) {
  const d = node.match(attrRe("d"))?.[1];
  const fill = node.match(attrRe("fill"))?.[1];
  if (!d) continue;
  const rgb = parseFill(fill);
  if (!rgb) continue;
  const { name: cls } = classify(rgb);
  const entry = { d, fill, rgb, index: index++ };
  switch (cls) {
    case "face":
      buckets.head.push(entry);
      break;
    case "hairDark":
      buckets.hair.push(entry);
      break;
    case "hairLight":
      buckets.hairHighlight.push(entry);
      break;
    case "beard":
      buckets.beard.push(entry);
      break;
    case "contourAmber":
      buckets.contour.push(entry);
      break;
    case "outline":
      buckets.contour.push(entry);
      break;
    case "glowOrange":
      // Skip — the component renders its own glow.
      break;
    case "background":
      // Skip — paper / transparent backdrop.
      break;
    default:
      buckets.other.push(entry);
  }
}

function wrap(entries) {
  if (entries.length === 0) return "";
  return entries
    .map((e) => `    <path d="${e.d}" fill="${e.fill}"/>`)
    .join("\n");
}

const transform = `transform="matrix(${scale} 0 0 ${scale} ${tx} ${ty})"`;

const outSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TARGET} ${TARGET}" width="512" height="512">
  <g id="glow"></g>
  <g id="head" ${transform}>
${wrap(buckets.head)}
${wrap(buckets.contour)}
  </g>
  <g id="hair" ${transform}>
${wrap(buckets.hair)}
${wrap(buckets.hairHighlight)}
  </g>
  <g id="beard" ${transform}>
${wrap(buckets.beard)}
  </g>
  <g id="ear"></g>
  <g id="glasses" ${transform}>
  </g>
  <g id="brows"></g>
  <g id="eyes"></g>
  <g id="pupils"></g>
  <g id="mouth"></g>
  <g id="other" ${transform} opacity="0.0">
${wrap(buckets.other)}
  </g>
</svg>`;
fs.writeFileSync(OUT_SVG, outSvg);

// ---------- Emit typed paths for the component --------------------------

function tsBucket(name, entries) {
  const joined = entries.map((e) => `    { d: ${JSON.stringify(e.d)}, fill: ${JSON.stringify(e.fill)} }`).join(",\n");
  return `export const traced_${name}: Array<{ d: string; fill: string }> = [
${joined}
];`;
}

const ts = `// Auto-generated by scripts/trace/layer.mjs. Do not edit by hand.
// Run \`npm run trace && npm run trace:layer\` to regenerate.

export const TRACE_VIEWBOX = ${TARGET};
export const TRACE_TRANSFORM = "matrix(${scale} 0 0 ${scale} ${tx} ${ty})";

${tsBucket("head", buckets.head)}

${tsBucket("contour", buckets.contour)}

${tsBucket("hair", buckets.hair)}

${tsBucket("hairHighlight", buckets.hairHighlight)}

${tsBucket("beard", buckets.beard)}

${tsBucket("other", buckets.other)}
`;
fs.writeFileSync(OUT_TS, ts);

const n = Object.values(buckets).reduce((s, a) => s + a.length, 0);
console.log(`[layer] classified ${n} paths`);
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  ${k.padEnd(16)} ${v.length}`);
}
console.log(`[layer] wrote ${OUT_SVG}`);
console.log(`[layer] wrote ${OUT_TS}`);
