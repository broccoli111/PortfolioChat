/**
 * Geometry / path helpers for the TalkingHeadAvatar.
 *
 * Everything is authored against a fixed 256x256 viewBox so the SVG scales
 * crisply to any rendered pixel size. All shapes are computed in code — no
 * raster assets, no sprite sheets, no external avatar services.
 *
 * ART DIRECTION
 * -------------
 * Stylized sticker/badge portrait: thick black outer contour, cream face,
 * charcoal hair with a single lighter highlight block, medium-gray beard,
 * oversized amber rectangular glasses, big vertical pupils, thick rounded
 * brows, soft orange glow halo.
 *
 * 3/4 TURN
 * --------
 * The head is baked into a slight 3/4 pose rather than rotating the SVG:
 *   - facial mass biased a touch to the viewer's left
 *   - oversized ear on the viewer's right (the far side)
 *   - jaw and beard taper slightly toward the far side
 *   - near-side (left) glasses lens is a touch larger than the far-side lens
 *   - near-side eye is a touch larger than the far-side eye
 *
 * All shapes are expressed as a few large, confident cubic/quadratic paths.
 * No noisy detail lines — every internal feature is a filled silhouette or
 * a thick rounded stroke so the avatar stays readable at small sizes.
 */

export const VIEWBOX = 256;

/**
 * Anchor points used by all features. 3/4 facing is baked into these:
 * near-side features sit slightly left of center and are slightly larger;
 * the far-side ear sits off to the viewer-right.
 */
export const GEOMETRY = {
  /** Head silhouette bounds (purely informational — path is authored below). */
  head: { cx: 122, cy: 132 },

  /** Oversized far-side ear on viewer-right.
   *  Positioned well outside the head silhouette so the ear reads clearly
   *  at small sizes. The near-side of the ear "attaches" to the head at the
   *  cheekbone line. */
  ear: { cx: 220, cy: 144, rx: 16, ry: 24 },

  /** Eyes — near-side (L) slightly larger than far-side (R). */
  eyeL: { cx: 93, cy: 122, rx: 15, ry: 18 },
  eyeR: { cx: 152, cy: 120, rx: 12, ry: 16 },

  /** Glasses lenses — rounded rects with mild 3/4 scaling difference. */
  glassL: { x: 70, y: 100, w: 50, h: 44, r: 12 },
  glassR: { x: 132, y: 102, w: 44, h: 40, r: 11 },
  glassBridgeY: 120,

  /** Brows — near-side brow is wider. */
  browL: { cx: 93, cy: 92, w: 42 },
  browR: { cx: 152, cy: 90, w: 34 },

  /** Mouth anchor. */
  mouth: { cx: 120, cy: 200, w: 32 },
} as const;

// ---------- Primary silhouettes ------------------------------------------

/**
 * Head silhouette — a bold, asymmetric sticker shape.
 *
 * Key traits:
 *   - rounded skull dome up top
 *   - far-side (right) cheek bulges out to make room for the ear
 *   - near-side (left) jaw is a touch squarer than far-side
 *   - chin sits slightly left of geometric center (3/4 tilt)
 *
 * Authored as one continuous cubic bezier path going clockwise from the
 * top-center of the head.
 */
export function headSilhouettePath(): string {
  // Single continuous curve going clockwise from the top center. Control
  // points are chosen so tangents match between segments (smooth joins) —
  // no visible flats or corners on the silhouette.
  return [
    "M 120 40",
    // Top skull -> far-side temple
    "C 156 38, 184 50, 196 76",
    // Far-side temple -> cheekbone. Narrower bulge so the ear has clear
    // room to protrude past the silhouette.
    "C 204 100, 206 124, 202 144",
    // Cheekbone -> far-side jaw (taper inward because the face is turning away)
    "C 196 172, 184 196, 164 212",
    // Far-side jaw -> chin (chin slightly left of geometric center)
    "C 150 222, 134 226, 118 224",
    // Chin -> near-side jaw
    "C 100 222, 80 212, 64 194",
    // Near-side jaw -> near-side cheekbone (fuller on the near side)
    "C 50 176, 42 152, 42 126",
    // Near-side cheekbone -> near-side temple
    "C 44 94, 56 68, 80 52",
    // Near-side temple back across the top
    "C 94 44, 106 40, 120 40",
    "Z",
  ].join(" ");
}

/**
 * Hair silhouette — a short close-cropped cap hugging the skull.
 *
 * Finishes in a clean forehead line (slight dip in the middle) rather than
 * trying to render individual strands. Sides wrap down to the temples so
 * they read as sideburn transitions into the beard.
 */
export function hairMainPath(): string {
  return [
    "M 44 106",
    // near-side temple up over the skull dome
    "C 44 72 60 48 92 42",
    "C 120 38 156 40 180 54",
    "C 200 66 210 90 212 116",
    // forehead line: step in from the far-side temple...
    "C 206 114 200 112 196 112",
    // gentle forehead dip in the center
    "C 190 96 170 88 144 88",
    "C 124 88 108 94 96 104",
    // back across near-side temple to start
    "C 80 108 62 108 50 106",
    "C 48 106 46 106 44 106",
    "Z",
  ].join(" ");
}

/**
 * Hair highlight — a single lighter block on the upper near-side of the
 * skull (catches imaginary light from the left). Kept as one simple shape
 * so the "toon-force" feel reads clean at small sizes.
 */
export function hairHighlightPath(): string {
  // Lighter block sits on the upper-near-side of the skull dome (catches
  // imaginary light from the upper-left). Elongated shape that follows the
  // curve of the skull so it reads as a stylized highlight rather than a blob.
  return [
    "M 66 52",
    "C 82 44 100 44 114 48",
    // Inner edge curving down across the top of the skull
    "C 112 62 100 74 82 78",
    // Lower edge back toward temple
    "C 72 76 64 68 62 60",
    "C 62 56 64 54 66 52",
    "Z",
  ].join(" ");
}

/**
 * Beard silhouette — tidy trimmed beard covering cheek, jaw, and chin.
 *
 * Tapers slightly toward the far side (the face is turning away), and is
 * fuller on the near side. Subtle notches at the cheek transition keep it
 * from reading as a flat slab.
 */
export function beardPath(): string {
  // Beard: a single kidney-bean mass covering sideburns, cheeks, jaw, and
  // chin. The TOP edge is nearly horizontal (with a small cheekbone curve
  // and a gentle lift where it meets the mustache) so it never reads as a
  // smile. The mustache is drawn as its own shape on top. The mouth sits on
  // top of the beard-colored area.
  return [
    // Near-side sideburn (high on cheek, under the glasses)
    "M 48 160",
    // Top edge curving across the near cheek — gentle dip toward the
    // upper-lip area
    "C 58 172 76 178 92 180",
    // Small arch under the nose (where the mustache will overlap)
    "C 110 178 138 178 156 180",
    // Top edge across the far cheek, tapering up to far-side sideburn
    "C 172 178 188 172 200 158",
    // Far-side jaw line — tapered because the face is turning away
    "C 200 188 186 212 160 222",
    // Chin (slightly left of geometric center to sell the 3/4 tilt)
    "C 140 228 118 228 100 222",
    // Near-side jaw line back up to sideburn (fuller on the near side)
    "C 70 212 54 188 48 160",
    "Z",
  ].join(" ");
}

/**
 * Mustache — ties the beard into the upper lip. Sits as its own shape over
 * the beard mass so it reads as a defined feature, not a dark smudge.
 */
export function mustachePath(): string {
  // Thin, wide, slightly lopsided mustache sitting just below the nose and
  // above the mouth. Kept subtle — it's a tidy trimmed style.
  return [
    "M 92 178",
    "C 104 184 116 186 122 186",
    "C 132 186 144 184 154 178",
    "C 152 186 140 190 122 190",
    "C 106 190 94 186 92 178",
    "Z",
  ].join(" ");
}

/**
 * Ear — oversized so it reads clearly at small sizes. Contains one simple
 * inner-fold detail rendered separately (see earInnerPath).
 */
export function earPath(): string {
  const { cx, cy, rx, ry } = GEOMETRY.ear;
  // A rounded C-shape that bulges out to the right and tucks back to the
  // head on the left. The inner (left) edge overlaps the head silhouette a
  // few units so there's no visible seam.
  const attachTop = cx - rx + 2;
  const attachBottom = cx - rx + 2;
  return [
    `M ${attachTop} ${cy - ry + 2}`,
    // Outer arc: up-right around the top, then down-right around the bottom
    `C ${cx + rx + 2} ${cy - ry + 6}, ${cx + rx + 2} ${cy + ry - 6}, ${attachBottom} ${cy + ry - 2}`,
    // Inner edge tucking back
    `C ${cx - rx - 2} ${cy + ry - 10}, ${cx - rx - 2} ${cy - ry + 10}, ${attachTop} ${cy - ry + 2}`,
    "Z",
  ].join(" ");
}

/** Single inner-fold detail inside the ear — just enough shape to read. */
export function earInnerPath(): string {
  const { cx, cy, rx, ry } = GEOMETRY.ear;
  return [
    `M ${cx - rx * 0.2} ${cy - ry * 0.4}`,
    `C ${cx + rx * 0.35} ${cy - ry * 0.2}, ${cx + rx * 0.35} ${cy + ry * 0.3}, ${cx - rx * 0.1} ${cy + ry * 0.55}`,
  ].join(" ");
}

// ---------- Mouth --------------------------------------------------------

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
      // A short, slightly bowed line — but filled as a thin lozenge so it
      // reads clearly against the beard's gray tone.
      const half = w / 2;
      return [
        `M ${cx - half} ${cy}`,
        `Q ${cx} ${cy + 3}, ${cx + half} ${cy}`,
        `Q ${cx} ${cy - 1}, ${cx - half} ${cy}`,
        "Z",
      ].join(" ");
    }
    case "flat": {
      const half = w / 2 + 2;
      return `M ${cx - half} ${cy} L ${cx + half} ${cy}`;
    }
    case "small": {
      const half = 7;
      return `M ${cx - half} ${cy} Q ${cx} ${cy + 1.8}, ${cx + half} ${cy}`;
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

// ---------- Brows --------------------------------------------------------

/**
 * Compute a brow path (thick rounded stroke) from an anchor, angle in degrees,
 * and a vertical offset.
 *
 * Angle convention: positive = outer edge UP (surprised / raised).
 * Negative = outer edge DOWN (angry / skeptical).
 *
 * `isLeft` indicates the viewer-left (near-side) brow.
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

  const outerX = isLeft ? cx - half : cx + half;
  const innerX = isLeft ? cx + half : cx - half;

  const tilt = Math.tan((angleDeg * Math.PI) / 180) * half;
  const outerY = y - tilt;
  const innerY = y + tilt * 0.25;

  // Arched control point — keeps brows feeling like rounded shapes rather
  // than straight segments.
  const ctrlX = cx;
  const ctrlY = (innerY + outerY) / 2 - 3;

  return `M ${innerX} ${innerY} Q ${ctrlX} ${ctrlY}, ${outerX} ${outerY}`;
}

// ---------- Lens highlight -----------------------------------------------

/**
 * Subtle diagonal streak across a glasses lens — sells "lens" without adding
 * noise. Rendered as a thin semi-transparent path on top of the amber rim.
 */
export function lensHighlightPath(lens: { x: number; y: number; w: number; h: number }): string {
  const { x, y, w, h } = lens;
  // Short diagonal line inside the upper-left of the lens.
  const x1 = x + w * 0.18;
  const y1 = y + h * 0.2;
  const x2 = x + w * 0.38;
  const y2 = y + h * 0.55;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}
