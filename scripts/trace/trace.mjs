#!/usr/bin/env node
/**
 * Tracing pipeline for the reference avatar.
 *
 * Reads `reference/avatar.png`, runs `vtracer` to produce a color-aware SVG
 * trace, then writes:
 *   - reference/traced-raw.svg       raw vtracer output
 *   - reference/compare.png          side-by-side (original | trace)
 *
 * The second-stage layering (splitting by color region into
 * `<g id="head" />`, `<g id="hair" />`, ...) runs separately once we've
 * visually confirmed the trace is clean. See `scripts/trace/layer.mjs`.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const IN_PNG = path.join(root, "reference/avatar.png");
const OUT_RAW = path.join(root, "reference/traced-raw.svg");
const OUT_COMPARE = path.join(root, "reference/compare.png");

if (!fs.existsSync(IN_PNG)) {
  console.error(`[trace] missing input: ${IN_PNG}`);
  console.error(`[trace] drop the reference PNG at that path and re-run.`);
  process.exit(1);
}

/** Resolve the vtracer binary. We first check the cargo bin and then PATH. */
function resolveVtracer() {
  const candidates = [
    path.join(process.env.HOME ?? "/home/ubuntu", ".cargo/bin/vtracer"),
    "/usr/local/cargo/bin/vtracer",
    "vtracer",
  ];
  for (const c of candidates) {
    try {
      if (c.startsWith("/") && fs.existsSync(c)) return c;
      // Otherwise let spawn resolve via PATH
    } catch { /* ignore */ }
  }
  return "vtracer";
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on("error", reject);
  });
}

async function main() {
  const vtracer = resolveVtracer();
  console.log(`[trace] using vtracer: ${vtracer}`);
  console.log(`[trace] input: ${IN_PNG}`);

  // vtracer tuning:
  //  - `color` mode keeps the amber rim / cream face / dark hair / gray beard
  //    as distinct regions we can later re-group by color.
  //  - `spline` (default) produces cubic beziers — animation-friendly paths.
  //  - higher `filter_speckle` removes anti-alias noise around the sticker edge.
  //  - `color_precision` of 6 gives us enough palette depth to catch the
  //    hair highlight and beard-vs-face distinction.
  //  - `corner_threshold` / `length_threshold` smoothed to avoid jaggy corners.
  await run(vtracer, [
    "--input", IN_PNG,
    "--output", OUT_RAW,
    "--colormode", "color",
    "--mode", "spline",
    "--filter_speckle", "6",
    "--color_precision", "6",
    "--layer_difference", "16",
    "--corner_threshold", "60",
    "--segment_length", "4",
    "--splice_threshold", "45",
    "--path_precision", "3",
  ]);

  const traced = fs.readFileSync(OUT_RAW, "utf8");
  console.log(`[trace] wrote ${OUT_RAW} (${(traced.length / 1024).toFixed(1)} KB)`);

  // Build a side-by-side comparison PNG: original | rasterized trace.
  const origMeta = await sharp(IN_PNG).metadata();
  const W = Math.min(origMeta.width ?? 1024, 768);
  const H = Math.round((origMeta.height ?? origMeta.width ?? 1024) * (W / (origMeta.width ?? 1024)));
  const leftPng = await sharp(IN_PNG).resize(W, H, { fit: "contain", background: "#ffffff" }).png().toBuffer();
  const rightPng = await sharp(Buffer.from(traced)).resize(W, H, { fit: "contain", background: "#ffffff" }).png().toBuffer();
  await sharp({
    create: { width: W * 2 + 20, height: H + 40, channels: 4, background: "#ffffff" },
  })
    .composite([
      { input: leftPng, left: 0, top: 30 },
      { input: rightPng, left: W + 20, top: 30 },
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2 + 20}" height="28"><text x="16" y="20" font-family="sans-serif" font-size="16" fill="#111">reference</text><text x="${W + 36}" y="20" font-family="sans-serif" font-size="16" fill="#111">vtracer output</text></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile(OUT_COMPARE);
  console.log(`[trace] wrote ${OUT_COMPARE}`);
  console.log(`[trace] open reference/compare.png to verify the trace.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
