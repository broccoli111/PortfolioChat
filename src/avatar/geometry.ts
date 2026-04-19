/**
 * Geometry / path helpers for the TalkingHeadAvatar.
 *
 * Everything is authored against a fixed 256x256 viewBox so the SVG scales
 * crisply to any rendered pixel size. All shapes are computed in code — no
 * raster assets, no sprite sheets, no external avatar services.
 *
 * The character faces slightly 3/4 — we shift features a hair to the viewer's
 * left (our right) and show one ear on the far side of the head (viewer-right).
 */

export const VIEWBOX = 256;

/** Anchor points used by all features. 3/4 facing is baked into these. */
export const GEOMETRY = {
  // Head center / radii (slight egg)
  head: { cx: 125, cy: 128, rx: 78, ry: 92 },
  // Ear on viewer-right (far side of the 3/4 turn)
  ear: { cx: 203, cy: 132, rx: 10, ry: 16 },
  // Eyes — sit behind the glasses lenses
  eyeL: { cx: 100, cy: 118, rx: 14, ry: 17 },
  eyeR: { cx: 150, cy: 116, rx: 14, ry: 17 },
  // Glasses lens rects (rounded). Slightly larger than the eyes.
  glassL: { x: 78, y: 98, w: 44, h: 40, r: 10 },
  glassR: { x: 128, y: 96, w: 44, h: 40, r: 10 },
  glassBridgeY: 116,
  // Brows — rendered as thick rounded strokes above the lenses.
  browL: { cx: 100, cy: 90, w: 36 },
  browR: { cx: 150, cy: 88, w: 36 },
  // Mouth anchor
  mouth: { cx: 124, cy: 185, w: 34, h: 10 },
} as const;

/**
 * Silhouette of the head + skull dome. A single rounded path shaped to read
 * as a friendly, slightly egg-shaped head in a 3/4 view.
 */
export function headSilhouettePath(): string {
  const { cx, cy, rx, ry } = GEOMETRY.head;
  // Approximate an ellipse with 4 cubic beziers, kappa = 0.5522847498.
  const k = 0.5522847498 * rx;
  const ky = 0.5522847498 * ry;
  return [
    `M ${cx} ${cy - ry}`,
    `C ${cx + k} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy + ky} ${cx + k} ${cy + ry} ${cx} ${cy + ry}`,
    `C ${cx - k} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - ky} ${cx - k} ${cy - ry} ${cx} ${cy - ry}`,
    `Z`,
  ].join(" ");
}

/**
 * Hair silhouette — a short, close-cropped cap that hugs the top of the head
 * and cuts cleanly across the forehead. Designed to read as "buzz / short"
 * hair without individual strands.
 */
export function hairMainPath(): string {
  // Top cap from ear line up and over, dipping slightly at the forehead.
  return [
    "M 52 118",
    "C 50 82, 70 44, 118 40",
    "C 170 36, 204 70, 206 116",
    "C 204 118, 198 118, 196 116",
    "C 188 92, 168 78, 140 78",
    "C 108 78, 84 92, 78 120",
    "C 70 120, 60 122, 52 118",
    "Z",
  ].join(" ");
}

/**
 * A single lighter highlight patch on the hair to sell volume without
 * doing full realistic shading.
 */
export function hairHighlightPath(): string {
  return [
    "M 94 58",
    "C 114 48, 148 48, 168 56",
    "C 164 64, 146 66, 132 66",
    "C 118 66, 104 64, 94 58",
    "Z",
  ].join(" ");
}

/**
 * Beard mass — a simplified lower-face shape wrapping jaw and chin with a
 * couple of subtle notches so it doesn't read as a flat slab.
 */
export function beardPath(): string {
  return [
    "M 60 150",
    "C 64 188, 92 222, 126 222",
    "C 162 222, 190 196, 198 156",
    "C 194 158, 188 158, 184 156",
    "C 176 172, 162 182, 146 186",
    "C 140 200, 132 206, 126 206",
    "C 118 206, 110 200, 104 186",
    "C 86 180, 72 166, 66 152",
    "C 64 152, 62 151, 60 150",
    "Z",
  ].join(" ");
}

/**
 * Mustache that sits above the mouth — ties the beard into the upper lip.
 */
export function mustachePath(): string {
  return [
    "M 98 172",
    "C 108 178, 118 180, 124 180",
    "C 132 180, 142 178, 152 172",
    "C 150 180, 138 186, 124 186",
    "C 112 186, 102 182, 98 172",
    "Z",
  ].join(" ");
}

/** Simple ear arc on the far side of the 3/4 turn. */
export function earPath(): string {
  const { cx, cy, rx, ry } = GEOMETRY.ear;
  return [
    `M ${cx - rx} ${cy - ry}`,
    `C ${cx + rx} ${cy - ry * 0.6}, ${cx + rx} ${cy + ry * 0.6}, ${cx - rx} ${cy + ry}`,
    `C ${cx - rx + 2} ${cy + ry - 6}, ${cx - rx + 2} ${cy - ry + 6}, ${cx - rx} ${cy - ry}`,
    `Z`,
  ].join(" ");
}

/**
 * Mouth path generator. `shape` controls the base silhouette; `openAmount`
 * (0..1) widens/opens variants when speaking. All mouths respect the same
 * anchor so there's no positional pop when switching presets.
 */
export function mouthPath(shape: string, openAmount: number): string {
  const { cx, cy, w } = GEOMETRY.mouth;
  const o = Math.max(0, Math.min(1, openAmount));

  switch (shape) {
    case "closed": {
      const half = w / 2;
      return `M ${cx - half} ${cy} Q ${cx} ${cy + 2}, ${cx + half} ${cy}`;
    }
    case "flat": {
      const half = w / 2 + 2;
      return `M ${cx - half} ${cy} L ${cx + half} ${cy}`;
    }
    case "small": {
      const half = 6;
      return `M ${cx - half} ${cy} Q ${cx} ${cy + 1.5}, ${cx + half} ${cy}`;
    }
    case "smile": {
      const half = w / 2 + 3;
      const dip = 6 + o * 4;
      return `M ${cx - half} ${cy - 2} Q ${cx} ${cy + dip}, ${cx + half} ${cy - 2}`;
    }
    case "mid": {
      const half = w / 2 - 2;
      const h = 3 + o * 3;
      return `M ${cx - half} ${cy - h / 2} Q ${cx} ${cy + h}, ${cx + half} ${cy - h / 2} Q ${cx} ${cy - h / 2}, ${cx - half} ${cy - h / 2} Z`;
    }
    case "open": {
      const half = w / 2 - 1;
      const h = 6 + o * 8;
      return `M ${cx - half} ${cy - h / 2} Q ${cx} ${cy + h}, ${cx + half} ${cy - h / 2} Q ${cx} ${cy - h * 0.9}, ${cx - half} ${cy - h / 2} Z`;
    }
    case "uncertain": {
      // Lopsided, slightly open
      const half = w / 2;
      const h = 3 + o * 3;
      return `M ${cx - half} ${cy + 1} Q ${cx - 4} ${cy - 2}, ${cx + 2} ${cy + 1} Q ${cx + 10} ${cy + h}, ${cx + half} ${cy - 1}`;
    }
    default: {
      const half = w / 2;
      return `M ${cx - half} ${cy} Q ${cx} ${cy + 2}, ${cx + half} ${cy}`;
    }
  }
}

/**
 * Compute a brow path (thick rounded stroke) from an anchor, angle in degrees,
 * and a vertical offset.
 *
 * Angle convention: positive = outer edge UP (surprised / raised).
 * Negative = outer edge DOWN (angry / skeptical).
 *
 * `isLeft` indicates the viewer-left brow (smaller x).
 */
export function browPath(
  anchor: { cx: number; cy: number; w: number },
  angleDeg: number,
  yOffset: number,
  isLeft: boolean,
): string {
  const { cx, cy, w } = anchor;
  const y = cy + yOffset;
  const half = w / 2;

  // Outer x is the edge further from the face center line (128).
  const outerX = isLeft ? cx - half : cx + half;
  const innerX = isLeft ? cx + half : cx - half;

  // Tilt: raise outer edge for positive angle. Use a small gain so
  // presets stay in a readable range without needing huge degree values.
  const tilt = Math.tan((angleDeg * Math.PI) / 180) * half;
  const outerY = y - tilt;
  const innerY = y + tilt * 0.25;

  // Small arch lift through the control point so brows feel like
  // soft rounded shapes rather than straight lines.
  const ctrlX = cx;
  const ctrlY = (innerY + outerY) / 2 - 2.5;

  return `M ${innerX} ${innerY} Q ${ctrlX} ${ctrlY}, ${outerX} ${outerY}`;
}
