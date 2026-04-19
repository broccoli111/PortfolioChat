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
  head: { cx: 128, cy: 136 },

  /** Far-side ear (viewer-right). Small, with an inner whorl. */
  ear: { cx: 210, cy: 146, rx: 10, ry: 16 },

  /** Eyes — nearly symmetric, sized to fit inside the glasses lenses. */
  eyeL: { cx: 100, cy: 130, rx: 16, ry: 17 },
  eyeR: { cx: 156, cy: 130, rx: 16, ry: 17 },

  /**
   * Glasses lenses — rounded rectangles, nearly symmetric. Slightly taller
   * than they are wide for the rectangular amber look.
   */
  glassL: { x: 78, y: 108, w: 46, h: 46, r: 12 },
  glassR: { x: 132, y: 108, w: 46, h: 46, r: 12 },
  glassBridgeY: 128,

  /** Brows — kept mostly hidden behind the hair/glasses but available for
   *  expression. Small anchors just below the hairline. */
  browL: { cx: 100, cy: 100, w: 30 },
  browR: { cx: 156, cy: 100, w: 30 },

  /** Mouth anchor — sits in the skin window framed by the beard band. */
  mouth: { cx: 128, cy: 178, w: 26 },
} as const;

// ---------- Head silhouette ---------------------------------------------

/**
 * Head: a compact, slightly-squarish sticker shape. Wide at the temples,
 * rounded jawline, short chin. A touch asymmetric — near-side is a hair
 * fuller — but mostly reads as a friendly front-ish portrait.
 */
export function headSilhouettePath(): string {
  return [
    "M 128 44",
    // Top-right of skull -> far-side temple
    "C 160 42, 188 52, 200 78",
    // Far-side temple -> cheekbone bulge (the ear attaches here)
    "C 208 100, 210 124, 206 150",
    // Cheekbone -> far-side jaw (rounded, not angular)
    "C 202 180, 186 204, 160 216",
    // Far-side jaw -> chin
    "C 146 222, 134 224, 124 224",
    // Chin -> near-side jaw
    "C 112 224, 98 220, 82 212",
    // Near-side jaw -> near-side cheekbone
    "C 60 196, 48 172, 46 148",
    // Near-side cheekbone -> near-side temple
    "C 44 120, 52 92, 68 72",
    // Near-side temple back across the top
    "C 84 52, 106 44, 128 44",
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
  // Single continuous mass covering the top of the skull and wrapping down
  // both temples to the sideburn attach points. The forehead hairline is
  // GENTLE — a very shallow dip so there's no visible skin hole under the
  // spikes, and the hair meets the beard sideburns cleanly at y~140.
  return [
    // Near-side sideburn tip (meets the beard)
    "M 48 144",
    // Up the near-side temple
    "C 44 114, 52 82, 68 66",
    // Across the top of the skull
    "C 92 48, 164 48, 188 66",
    // Down the far-side temple
    "C 204 82, 212 114, 208 144",
    // Far-side sideburn tip (meets the beard)
    "C 204 146, 200 146, 196 144",
    // Hairline inside the forehead — a single smooth shallow arc from
    // far-side temple to near-side temple with just a whisper of a
    // widow's-peak at the center.
    "C 196 108, 178 94, 128 98",
    "C 78 94, 60 108, 60 144",
    // Close back to near-side sideburn
    "C 56 146, 52 146, 48 144",
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
  // Subtle row of small tufts across the top of the skull. Peaks rise only
  // 4-6 units above the smooth hairline to suggest "short textured cut"
  // rather than spiky anime hair.
  const peaks: Array<[number, number]> = [
    [74, 66],
    [80, 58],
    [88, 62],
    [96, 56],
    [106, 60],
    [116, 54],
    [126, 58],
    [136, 52],
    [146, 56],
    [156, 54],
    [166, 60],
    [176, 58],
    [186, 64],
  ];
  const left = "M 70 72";
  const right = "L 190 72";
  const line = peaks.map(([x, y]) => `L ${x} ${y}`).join(" ");
  return [left, line, right, "L 190 80", "L 70 80", "Z"].join(" ");
}

/**
 * Hair highlight / fade block — a lighter shape on the near-side of the
 * head that reads as a side fade / highlight. Matches the reference's
 * lighter gray band running down the viewer-left temple.
 */
export function hairHighlightPath(): string {
  return [
    // Top at the near-side temple
    "M 56 80",
    "C 52 104, 52 126, 58 140",
    // Bottom curves around the near-side sideburn
    "C 62 140, 66 138, 70 134",
    // Inner edge back up into the skull
    "C 68 114, 70 96, 78 80",
    "C 72 78, 62 78, 56 80",
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
    "M 48 142",
    "C 50 172, 66 206, 90 218",
    "C 110 226, 146 226, 166 218",
    "C 190 206, 206 172, 208 142",
    // Far-side sideburn meets inner edge
    "C 206 150, 202 154, 200 158",
    // --- Inner edge: a single smooth arc from far-side sideburn across
    //    to near-side sideburn. Dips down in the center to make the skin
    //    window for the mouth. ---
    "C 190 178, 160 196, 128 196",
    "C 96 196, 66 178, 56 158",
    "C 54 154, 50 150, 48 142",
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
