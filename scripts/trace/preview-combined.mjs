// Render the CombinedAvatar at rest + a speaking open-mouth variant + a
// blink, using the same geometry helpers the component uses. Used for
// visual QA of the traced + animated composition.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

async function loadModule(rel) {
  const res = await build({
    entryPoints: [path.join(root, rel)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  const code = res.outputFiles[0].text;
  const url = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  return import(url);
}

const pal = await loadModule("src/avatar/palette.ts");
const exp = await loadModule("src/avatar/expressions.ts");
const geo = await loadModule("src/avatar/geometry.ts");
const tg = await loadModule("src/avatar/tracedGeometry.ts");

const colors = pal.DEFAULT_PALETTE;
const { TRACED_ANCHORS: A, TRACED_ERASE_REGIONS: ER, TRACED_PAINT_ORDER, TRACE_TRANSFORM, TRACE_VIEWBOX } = tg;

const EYE_RX = 17;
const EYE_RY = 18;
const PUPIL_RX = 6.5;
const PUPIL_RY = 12;
const CATCH_R = 2.6;
const BROW_W = 26;

function browShapePath(anchor, angleDeg, yOffset, isLeft, thickness = 5.5) {
  const { cx, cy, w } = anchor;
  const y = cy + yOffset;
  const half = w / 2;
  const outerX = isLeft ? cx - half : cx + half;
  const innerX = isLeft ? cx + half : cx - half;
  const tilt = Math.tan((angleDeg * Math.PI) / 180) * half;
  const outerY = y - tilt;
  const innerY = y + tilt * 0.25;
  const ctrlY = (innerY + outerY) / 2 - 3;
  const t = thickness / 2;
  return [
    `M ${innerX} ${innerY - t}`,
    `Q ${cx} ${ctrlY - t}, ${outerX} ${outerY - t}`,
    `Q ${outerX + (isLeft ? -2 : 2)} ${outerY}, ${outerX} ${outerY + t}`,
    `Q ${cx} ${ctrlY + t}, ${innerX} ${innerY + t}`,
    `Q ${innerX + (isLeft ? 2 : -2)} ${innerY}, ${innerX} ${innerY - t}`,
    "Z",
  ].join(" ");
}

function render({ emotion = "neutral", speaking = false, speakShape = null, blink = 0, lookX = 0, lookY = 0 }) {
  const p = { ...exp.EXPRESSION_PRESETS[emotion] };
  // apply blink
  p.lidOpenL *= 1 - blink;
  p.lidOpenR *= 1 - blink;
  const gx = lookX * 3;
  const gy = lookY * 2.4;
  const pdx = p.pupilOffsetX + gx;
  const pdy = p.pupilOffsetY + gy;
  const mouthShape = speaking && speakShape ? speakShape : p.mouth;
  const mouthOpen = speaking && speakShape === "open" ? 0.8 : p.mouthOpen;
  const mouthD = geo.mouthPath(mouthShape, mouthOpen);
  const mouthFill =
    mouthShape === "open" || mouthShape === "mid"
      ? colors.mouth
      : mouthShape === "closed"
      ? colors.outline
      : "none";
  const MOUTH_ANCHOR = { cx: 124, cy: 178 };
  const msdx = A.mouth.cx - MOUTH_ANCHOR.cx;
  const msdy = A.mouth.cy - MOUTH_ANCHOR.cy;

  const browDL = browShapePath({ cx: A.browL.cx, cy: A.browL.cy, w: BROW_W }, p.browAngleL, p.browYL, true, 5.5);
  const browDR = browShapePath({ cx: A.browR.cx, cy: A.browR.cy, w: BROW_W }, p.browAngleR, p.browYR, false, 5.5);

  const ryL = EYE_RY * Math.max(0, Math.min(1, p.lidOpenL));
  const ryR = EYE_RY * Math.max(0, Math.min(1, p.lidOpenR));
  const pupRyL = PUPIL_RY * Math.max(0, Math.min(1, p.lidOpenL));
  const pupRyR = PUPIL_RY * Math.max(0, Math.min(1, p.lidOpenR));
  const pupVisL = p.lidOpenL > 0.08 ? 1 : 0;
  const pupVisR = p.lidOpenR > 0.08 ? 1 : 0;

  const traced = TRACED_PAINT_ORDER
    .map((pp) => `<path d="${pp.d}" fill="${pp.fill}"${pp.transform ? ` transform="${pp.transform}"` : ""}/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TRACE_VIEWBOX} ${TRACE_VIEWBOX}" width="512" height="512">
  <g transform="${TRACE_TRANSFORM}">${traced}</g>
  <ellipse cx="${ER.lensL.cx}" cy="${ER.lensL.cy}" rx="${ER.lensL.rx}" ry="${ER.lensL.ry}" fill="${colors.face}"/>
  <ellipse cx="${ER.lensR.cx}" cy="${ER.lensR.cy}" rx="${ER.lensR.rx}" ry="${ER.lensR.ry}" fill="${colors.face}"/>
  <ellipse cx="${ER.mouth.cx}" cy="${ER.mouth.cy}" rx="${ER.mouth.rx}" ry="${ER.mouth.ry}" fill="${colors.face}"/>

  <ellipse cx="${A.eyeL.cx}" cy="${A.eyeL.cy}" rx="${EYE_RX}" ry="${ryL}" fill="${colors.eyeWhite}" stroke="${colors.outline}" stroke-width="1.6" opacity="0.95"/>
  <ellipse cx="${A.eyeR.cx}" cy="${A.eyeR.cy}" rx="${EYE_RX}" ry="${ryR}" fill="${colors.eyeWhite}" stroke="${colors.outline}" stroke-width="1.6" opacity="0.95"/>

  <ellipse cx="${A.eyeL.cx + pdx}" cy="${A.eyeL.cy + pdy}" rx="${PUPIL_RX}" ry="${pupRyL}" fill="${colors.pupil}" opacity="${pupVisL}"/>
  <ellipse cx="${A.eyeR.cx + pdx}" cy="${A.eyeR.cy + pdy}" rx="${PUPIL_RX}" ry="${pupRyR}" fill="${colors.pupil}" opacity="${pupVisR}"/>
  <circle cx="${A.eyeL.cx + pdx + 1.8}" cy="${A.eyeL.cy + pdy - 2.2}" r="${CATCH_R * Math.max(0, Math.min(1, p.lidOpenL))}" fill="${colors.catchLight}" opacity="${pupVisL * 0.95}"/>
  <circle cx="${A.eyeR.cx + pdx + 1.8}" cy="${A.eyeR.cy + pdy - 2.2}" r="${CATCH_R * Math.max(0, Math.min(1, p.lidOpenR))}" fill="${colors.catchLight}" opacity="${pupVisR * 0.95}"/>

  <g fill="${colors.outline}" stroke="none">
    <path d="${browDL}"/><path d="${browDR}"/>
  </g>

  <g transform="translate(${msdx} ${msdy})">
    <path d="${mouthD}" fill="${mouthFill}" stroke="${colors.outline}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const variants = [
  { name: "neutral", args: { emotion: "neutral" } },
  { name: "skeptical", args: { emotion: "skeptical" } },
  { name: "happy", args: { emotion: "happy" } },
  { name: "thinking", args: { emotion: "thinking" } },
  { name: "speaking-open", args: { emotion: "neutral", speaking: true, speakShape: "open" } },
  { name: "blink", args: { emotion: "neutral", blink: 1 } },
  { name: "look-left", args: { emotion: "neutral", lookX: -1 } },
  { name: "look-right", args: { emotion: "neutral", lookX: 1 } },
];

const out = path.join(root, "reference");
const tileSize = 256;
const cols = 4;
const rows = Math.ceil(variants.length / cols);
const W = tileSize * cols;
const H = tileSize * rows + rows * 24;

const composites = [];
for (let i = 0; i < variants.length; i++) {
  const v = variants[i];
  const svg = render(v.args);
  const tile = await sharp(Buffer.from(svg)).resize(tileSize, tileSize).png().toBuffer();
  const r = Math.floor(i / cols);
  const c = i % cols;
  composites.push({ input: tile, left: c * tileSize, top: r * (tileSize + 24) + 24 });
  const label = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="22"><rect width="100%" height="100%" fill="rgba(0,0,0,0.7)"/><text x="8" y="15" font-family="sans-serif" font-size="13" fill="#ffd38a">${v.name}</text></svg>`,
  );
  composites.push({ input: label, left: c * tileSize, top: r * (tileSize + 24) });
}

await sharp({ create: { width: W, height: H, channels: 4, background: "#0b0805" } })
  .composite(composites)
  .png()
  .toFile(path.join(out, "combined-grid.png"));

console.log("wrote reference/combined-grid.png");
