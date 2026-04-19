/**
 * Geometry / path helpers for the TalkingHeadAvatar.
 *
 * All shapes are authored against a fixed 256x256 viewBox so the SVG scales
 * crisply at any rendered size. Nothing here uses raster assets, sprite
 * sheets, or external services — every silhouette is a hand-authored
 * cubic/quadratic SVG path or computed primitive.
 *
 * ART DIRECTION (from reference)
 * ------------------------------
 * Stylized sticker/badge portrait with:
 *   - thick amber "toon-force" outer contour (not black)
 *   - cream face fill
 *   - charcoal hair with a spiky/tufted top edge and a lighter side fade
 *   - medium-gray chin-strap style beard (clean mustache zone, soul patch)
 *   - oversized amber rectangular glasses with tiny hinge dots
 *   - huge round black pupils filling most of the lens, with amber catch-light
 *   - small upturned smirk at rest
 *   - soft warm orange halo behind everything
 *   - slight 3/4 turn (ear visible on viewer-right, features biased a hair
 *     left of center)
 *
 * Everything is a filled shape or a thick rounded stroke — no hairlines
 * that would disappear at small sizes.
 */

export const VIEWBOX = 256;

/**
 * Anchor points used by all features. The 3/4 turn is subtle here — the
 * reference pose is nearly front-on with just a slight lean. Features sit
 * close to symmetric; the ear lives on the viewer-right.
 */
export const GEOMETRY = {
  /** Head silhouette center (informational — path authored below). */
  head: { cx: 126, cy: 136 },

  /** Far-side ear (viewer-right). Small, with an inner whorl. */
  ear: { cx: 206, cy: 146, rx: 10, ry: 16 },

  /**
   * Eyes — centered inside the glass lenses. Their rx/ry cap the lens
   * interior so the pupils never clip.
   */
  eyeL: { cx: 91, cy: 134, rx: 18, ry: 17 },
  eyeR: { cx: 155, cy: 134, rx: 18, ry: 17 },

  /**
   * Glasses lenses — nearly symmetric rounded rectangles, sized so the
   * pair spans ~70% of the head width.
   */
  glassL: { x: 64, y: 110, w: 54, h: 48, r: 12 },
  glassR: { x: 128, y: 110, w: 54, h: 48, r: 12 },
  glassBridgeY: 128,

  /** Brows — thick rounded bars sitting clearly above the lenses. */
  browL: { cx: 91, cy: 100, w: 34 },
  browR: { cx: 155, cy: 100, w: 34 },

  /** Mouth anchor — sits in the skin window framed by the beard band. */
  mouth: { cx: 124, cy: 178, w: 24 },
} as const;

// ---------- Head silhouette ---------------------------------------------

/**
 * Head: a compact, slightly-squarish sticker shape. Wide at the temples,
 * rounded jawline, short chin. A touch asymmetric — near-side is a hair
 * fuller — but mostly reads as a friendly front-ish portrait.
 */
export function headSilhouettePath(): string {
  return [
    "M 126 40",
    // Top-right of skull -> far-side temple
    "C 162 38, 190 48, 202 72",
    // Far-side temple -> cheekbone bulge (the ear attaches here)
    "C 212 100, 214 136, 208 168",
    // Cheekbone -> far-side jaw (rounded, not angular)
    "C 202 196, 188 220, 160 232",
    // Far-side jaw -> chin
    "C 144 236, 110 236, 92 230",
    // Chin -> near-side jaw
    "C 68 222, 50 202, 44 174",
    // Near-side jaw -> near-side cheekbone
    "C 40 144, 42 108, 52 82",
    // Near-side cheekbone -> near-side temple
    "C 64 56, 92 42, 126 40",
    "Z",
  ].join(" ");
}

// ---------- Hair ---------------------------------------------------------

/**
 * Main hair mass. Covers the top of the skull with a textured top edge
 * (produced by hairSpikesPath, drawn on top) and wraps down the sides as
 * sideburns that meet the beard.
 */
export function hairMainPath(): string {
  // Main hair mass. Textured top edge is baked directly into the path so
  // the whole hair silhouette is one shape (cleaner than a separate
  // spikes overlay and still faithful to the buzz-cut-with-texture look).
  return [
    "M 50 108",
    // Up the near-side temple, then across the top with tufted peaks
    "C 44 82, 54 58, 72 48",
    "L 78 44 L 86 50 L 94 42 L 104 50 L 114 42 L 124 50 L 134 42 L 146 50 L 156 42 L 166 50 L 176 44 L 184 52",
    // Down the far-side temple
    "C 204 62, 214 88, 210 114",
    // Back along the inner hairline
    "C 204 116, 196 118, 188 114",
    "C 182 96, 162 88, 140 88",
    "C 120 88, 102 92, 90 102",
    "C 80 108, 68 110, 60 108",
    "C 56 108, 52 108, 50 108",
    "Z",
  ].join(" ");
}

/**
 * Spiky top edge — a row of small triangular tufts along the skull dome
 * that sell the "buzz cut with slight texture" look. Drawn as a filled
 * path in the same dark color as the main hair, sitting on top of the
 * main hair shape so it protrudes past the smooth upper contour.
 */
export function hairSpikesPath(): string {
  // No longer used — the tufted top edge is now baked into hairMainPath.
  // Returned as an empty path so any callers still referencing it render
  // nothing instead of erroring.
  return "M 0 0 Z";
}

/**
 * Hair highlight / fade block — a lighter shape on the near-side of the
 * head that reads as a side fade / highlight. Matches the reference's
 * lighter gray band running down the viewer-left temple.
 */
export function hairHighlightPath(): string {
  return [
    // Compact lighter block on the upper viewer-left side of the skull,
    // tight to the scalp. Matches the reference's single highlight region.
    "M 58 66",
    "C 70 56, 86 52, 102 58",
    "C 100 70, 92 84, 78 92",
    "C 70 90, 62 82, 58 74",
    "C 58 70, 58 68, 58 66",
    "Z",
  ].join(" ");
}

// ---------- Beard --------------------------------------------------------

/**
 * Beard: chin-strap style.
 *
 * Follows the jaw line from sideburn to sideburn, staying relatively thin
 * along the cheek and thickening under the chin. The mustache region is
 * INTENTIONALLY empty — the reference shows a clean upper lip with just a
 * short soul-patch strip below the mouth.
 */
export function beardPath(): string {
  // Chin-strap style beard covering the jaw from sideburn to sideburn.
  // The inner edge is a smooth arch that rises high across the cheekbones
  // and dips just slightly around the mouth — leaving a clear skin
  // "window" framing the mouth and upper chin.
  return [
    // --- Outer edge: near-side sideburn down, under chin, up far side ---
    "M 48 146",
    "C 50 178, 64 208, 88 222",
    "C 108 230, 146 230, 164 222",
    "C 190 208, 204 178, 206 146",
    // Far-side sideburn meets inner edge
    "C 202 152, 198 156, 196 156",
    // --- Inner edge: smooth arc across the mid-face with a soft central
    //    dip so the mouth reads on skin, not on beard.
    "C 190 180, 168 198, 124 198",
    "C 88 198, 64 178, 58 156",
    "C 54 156, 50 152, 48 146",
    "Z",
  ].join(" ");
}

/**
 * Soul patch — a small dark strip just below the lower lip. Tiny, but an
 * important identity detail in the reference.
 */
export function soulPatchPath(): string {
  // Small darker patch of hair just below the lower lip.
  const { cx, cy } = GEOMETRY.mouth;
  const top = cy + 8;
  return [
    `M ${cx - 6} ${top}`,
    `C ${cx - 4} ${top + 8}, ${cx + 4} ${top + 8}, ${cx + 6} ${top}`,
    `C ${cx + 3} ${top + 1}, ${cx - 3} ${top + 1}, ${cx - 6} ${top}`,
    "Z",
  ].join(" ");
}

// ---------- Ear ----------------------------------------------------------

/**
 * Ear — small rounded shape attached to the far-side cheek, partly visible
 * past the head silhouette. The ear has its own inner whorl detail.
 */
export function earPath(): string {
  const { cx, cy, rx, ry } = GEOMETRY.ear;
  return [
    // Start near the top of the attach point (inside the head outline)
    `M ${cx - rx + 2} ${cy - ry + 2}`,
    // Outer arc bulging right, then curving down
    `C ${cx + rx + 2} ${cy - ry + 4}, ${cx + rx + 2} ${cy + ry - 4}, ${cx - rx + 2} ${cy + ry - 2}`,
    // Inner edge tucking back to the head
    `C ${cx - rx - 2} ${cy + ry - 10}, ${cx - rx - 2} ${cy - ry + 10}, ${cx - rx + 2} ${cy - ry + 2}`,
    "Z",
  ].join(" ");
}

/** Inner whorl detail — a simple C-curve inside the ear. */
export function earInnerPath(): string {
  const { cx, cy, rx, ry } = GEOMETRY.ear;
  return [
    `M ${cx + rx * 0.2} ${cy - ry * 0.4}`,
    `C ${cx + rx * 0.6} ${cy - ry * 0.2}, ${cx + rx * 0.6} ${cy + ry * 0.3}, ${cx + rx * 0.1} ${cy + ry * 0.5}`,
  ].join(" ");
}

// ---------- Mouth --------------------------------------------------------

/**
 * Mouth path generator. `shape` controls the base silhouette; `openAmount`
 * (0..1) widens/opens variants when speaking. Every mouth respects the
 * same anchor so switching between presets doesn't pop.
 *
 * The default "closed" shape is a small upturned smirk to match the
 * reference pose.
 */
export function mouthPath(shape: string, openAmount: number): string {
  const { cx, cy, w } = GEOMETRY.mouth;
  const o = Math.max(0, Math.min(1, openAmount));

  switch (shape) {
    case "closed": {
      // Small upturned smirk — slightly lifted at the corners, dips through
      // the middle. Drawn as a thin filled lozenge so it reads clearly.
      const half = w / 2;
      return [
        `M ${cx - half} ${cy}`,
        `Q ${cx} ${cy + 3.5}, ${cx + half} ${cy}`,
        `Q ${cx} ${cy + 1.5}, ${cx - half} ${cy}`,
        "Z",
      ].join(" ");
    }
    case "flat": {
      const half = w / 2 + 2;
      return `M ${cx - half} ${cy} L ${cx + half} ${cy}`;
    }
    case "small": {
      const half = 6;
      return `M ${cx - half} ${cy} Q ${cx} ${cy + 1.8}, ${cx + half} ${cy}`;
    }
    case "smile": {
      const half = w / 2 + 3;
      const dip = 6 + o * 4;
      return `M ${cx - half} ${cy - 2} Q ${cx} ${cy + dip}, ${cx + half} ${cy - 2}`;
    }
    case "mid": {
      const half = w / 2 - 1;
      const h = 3 + o * 3;
      return `M ${cx - half} ${cy - h / 2} Q ${cx} ${cy + h}, ${cx + half} ${cy - h / 2} Q ${cx} ${cy - h / 2}, ${cx - half} ${cy - h / 2} Z`;
    }
    case "open": {
      const half = w / 2;
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
 * Compute a brow path (thick rounded stroke) from an anchor, angle in
 * degrees, and a vertical offset.
 *
 * Positive angle = outer edge UP (surprised / raised).
 * Negative angle = outer edge DOWN (angry / skeptical).
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

  const ctrlX = cx;
  const ctrlY = (innerY + outerY) / 2 - 3;

  return `M ${innerX} ${innerY} Q ${ctrlX} ${ctrlY}, ${outerX} ${outerY}`;
}

// ---------- Lens highlight ----------------------------------------------

/** Tiny diagonal glint across the upper-left of a lens. */
export function lensHighlightPath(lens: { x: number; y: number; w: number; h: number }): string {
  const { x, y, w, h } = lens;
  const x1 = x + w * 0.18;
  const y1 = y + h * 0.2;
  const x2 = x + w * 0.36;
  const y2 = y + h * 0.5;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}
