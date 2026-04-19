#!/usr/bin/env node
/**
 * Preprocess the reference PNG before tracing.
 *
 * The source image has a transparency checkerboard baked into its pixels
 * (alternating near-white and light-gray squares). The avatar glow also
 * falls off into those squares with a faint amber tint, so a pure
 * color-distance filter leaves orange specks behind on the dark checker
 * cells.
 *
 * This pass flood-fills from every edge pixel, snapping any pixel it can
 * reach through the "background set" to pure white. The background set is
 * defined as any pixel that is either:
 *   - near-white (>= 220 in all channels, low saturation), OR
 *   - low-saturation light-gray between ~210 and ~250 (checker cells), OR
 *   - warm but desaturated (the glow's falloff on the checker, e.g.
 *     r~240 g~220 b~200) — we treat these as background so the glow fades
 *     cleanly to white rather than leaving speckled tints.
 *
 * The flood-fill guarantees that the avatar's interior glow (which is
 * enclosed by the amber contour) is NOT reachable from the edges and
 * therefore stays intact. Only truly-background pixels get flattened.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");

const IN = path.join(root, "reference/avatar.png");
const OUT = path.join(root, "reference/avatar-clean.png");

function isBackgroundish(r, g, b) {
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const bright = (r + g + b) / 3;

  // Near-white
  if (r >= 235 && g >= 235 && b >= 235) return true;

  // Light-gray checker (low saturation, mid-high brightness)
  if (sat < 12 && bright >= 200 && bright <= 252) return true;

  // Warm/desaturated glow-on-checker. Catches pixels like rgb(240,220,200)
  // where the halo bled into a dark checker cell. Must be bright and have
  // only moderate warm tint; strong amber (the actual halo interior) is
  // NOT matched because it has much more red-dominance.
  const warm = r - b;
  if (bright >= 195 && sat < 60 && warm >= 0 && warm < 55) return true;

  return false;
}

async function main() {
  const raw = await sharp(IN).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const visited = new Uint8Array(width * height);

  function px(x, y) {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  }
  function setWhite(x, y) {
    const i = (y * width + x) * channels;
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    if (channels === 4) out[i + 3] = 255;
  }

  // BFS flood-fill from every edge pixel. Use a plain array as a queue;
  // 1024x1024 = 1M pixels max so this is cheap.
  const queue = [];
  const enqueueEdge = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const [r, g, b] = px(x, y);
    if (!isBackgroundish(r, g, b)) return;
    visited[idx] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    enqueueEdge(x, 0);
    enqueueEdge(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueueEdge(0, y);
    enqueueEdge(width - 1, y);
  }

  let flooded = 0;
  while (queue.length > 0) {
    const y = queue.pop();
    const x = queue.pop();
    setWhite(x, y);
    flooded++;
    // 4-connected neighbors
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nidx = ny * width + nx;
      if (visited[nidx]) continue;
      const [r, g, b] = px(nx, ny);
      if (!isBackgroundish(r, g, b)) continue;
      visited[nidx] = 1;
      queue.push(nx, ny);
    }
  }

  console.log(
    `[preprocess] flood-filled ${flooded} background pixels (${((flooded / (width * height)) * 100).toFixed(1)}% of image)`,
  );

  await sharp(out, { raw: { width, height, channels } }).png().toFile(OUT);
  console.log(`[preprocess] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
