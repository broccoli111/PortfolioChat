#!/usr/bin/env node
/**
 * Preprocess the reference PNG before tracing.
 *
 * The source image has a light/white checkerboard baked into its background
 * pixels (not true transparency). vtracer happily traces every checker cell
 * as its own tiny region, producing hundreds of near-white paths that
 * pollute the result.
 *
 * This step walks each pixel and snaps anything in the "checker background"
 * zone to pure white, and anything close to near-black to pure black, so
 * vtracer sees a clean foreground silhouette against a flat background.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const IN = path.join(root, "reference/avatar.png");
const OUT = path.join(root, "reference/avatar-clean.png");

async function main() {
  const img = sharp(IN);
  const raw = await img.raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;

  // Detect the dominant color at the corners (presumed to be the background)
  const sampleCorners = [];
  for (const [sx, sy] of [
    [2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3],
  ]) {
    const idx = (sy * width + sx) * channels;
    sampleCorners.push([data[idx], data[idx + 1], data[idx + 2]]);
  }
  // Median-ish: just take the average
  const bg = [0, 1, 2].map((i) => Math.round(sampleCorners.reduce((s, c) => s + c[i], 0) / sampleCorners.length));
  console.log(`[preprocess] detected background ~ rgb(${bg.join(",")})`);

  // Walk every pixel. If it's close to the corner-sampled background OR
  // near-pure-white OR near-pure-light-gray, snap to pure white. This
  // consolidates the whole checker pattern into one clean background region.
  const out = Buffer.from(data);
  let bgPx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Distance from the sampled corner background
      const dCorner = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
      // Is it near-white? (checker "light" squares)
      const nearWhite = r > 230 && g > 230 && b > 230;
      // Is it near-light-gray checker pattern?
      const nearLightGray = Math.abs(r - g) < 6 && Math.abs(g - b) < 6 && r > 210 && r < 250;

      if (dCorner < 20 || nearWhite || nearLightGray) {
        out[idx] = 255;
        out[idx + 1] = 255;
        out[idx + 2] = 255;
        if (channels === 4) out[idx + 3] = 255;
        bgPx++;
      }
    }
  }
  console.log(`[preprocess] flattened ${bgPx} bg pixels (${((bgPx / (width * height)) * 100).toFixed(1)}% of image)`);

  await sharp(out, { raw: { width, height, channels } }).png().toFile(OUT);
  console.log(`[preprocess] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
