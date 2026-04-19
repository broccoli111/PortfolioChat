import type { AvatarEmotion, AvatarMouthShape } from "./types";

/**
 * Low-level parameter vector that drives the SVG.
 *
 * Every expression is just a preset of these numbers. The renderer never
 * "snaps" to a preset: it always interpolates the current parameter vector
 * toward the target preset, which is what gives the avatar its smooth,
 * character-like motion.
 *
 * Ranges are expressive but clamped in the renderer for safety.
 *
 * Conventions:
 *  - positive `browAngle` = outer edge up (surprised / raised)
 *  - negative `browAngle` = outer edge down (angry / skeptical)
 *  - positive `browY`     = brows shifted DOWN
 *  - negative `browY`     = brows shifted UP
 *  - `lidOpen` 1 = fully open, 0 = fully closed
 *  - pupils and brows use per-side (L/R) offsets so we can do asymmetric
 *    expressions like skeptical / confused without hacks.
 */
export type ExpressionParams = {
  browAngleL: number;   // degrees, -25..25
  browAngleR: number;
  browYL: number;       // pixel offset, -6..6
  browYR: number;
  lidOpenL: number;     // 0..1
  lidOpenR: number;
  pupilOffsetX: number; // pixels within eye, -3..3
  pupilOffsetY: number;
  mouth: AvatarMouthShape;
  /** Mouth open-ness modifier (only meaningful for speaking cycle). 0..1 */
  mouthOpen: number;
  glowStrength: number; // 0..1, multiplied with base glow
};

/**
 * Expression presets. These are design targets — the renderer always
 * interpolates the live state toward one of these vectors using an easing
 * factor, so transitions are graceful rather than instant.
 *
 * To add a new expression:
 *   1. Add it to the `AvatarEmotion` union in `types.ts`.
 *   2. Add a preset here.
 *   3. (Optional) Map AI sentiment/tone to it in `mapConversationToAvatarState`.
 */
export const EXPRESSION_PRESETS: Record<AvatarEmotion, ExpressionParams> = {
  neutral: {
    browAngleL: 0,
    browAngleR: 0,
    browYL: 0,
    browYR: 0,
    lidOpenL: 1,
    lidOpenR: 1,
    pupilOffsetX: 0,
    pupilOffsetY: 0,
    mouth: "closed",
    mouthOpen: 0,
    glowStrength: 1,
  },

  skeptical: {
    browAngleL: -8,
    browAngleR: 14,
    browYL: 1,
    browYR: -4,
    lidOpenL: 0.85,
    lidOpenR: 0.7,
    pupilOffsetX: -0.6,
    pupilOffsetY: 0,
    mouth: "flat",
    mouthOpen: 0,
    glowStrength: 0.95,
  },

  confused: {
    browAngleL: 10,
    browAngleR: -6,
    browYL: -3,
    browYR: 2,
    lidOpenL: 1,
    lidOpenR: 0.9,
    pupilOffsetX: 0.8,
    pupilOffsetY: -0.4,
    mouth: "uncertain",
    mouthOpen: 0.3,
    glowStrength: 0.9,
  },

  happy: {
    browAngleL: 4,
    browAngleR: -4,
    browYL: -2,
    browYR: -2,
    lidOpenL: 0.75,
    lidOpenR: 0.75,
    pupilOffsetX: 0,
    pupilOffsetY: 0.3,
    mouth: "smile",
    mouthOpen: 0.2,
    glowStrength: 1.15,
  },

  thinking: {
    browAngleL: -6,
    browAngleR: -6,
    browYL: 1,
    browYR: 1,
    lidOpenL: 0.9,
    lidOpenR: 0.9,
    pupilOffsetX: 0.7,
    pupilOffsetY: -0.8,
    mouth: "small",
    mouthOpen: 0,
    glowStrength: 0.95,
  },

  listening: {
    browAngleL: 2,
    browAngleR: -2,
    browYL: -1,
    browYR: -1,
    lidOpenL: 1.05,
    lidOpenR: 1.05,
    pupilOffsetX: 0,
    pupilOffsetY: 0,
    mouth: "closed",
    mouthOpen: 0,
    glowStrength: 1.05,
  },
};

/**
 * Returns a fresh, deep-copyable neutral state suitable for seeding the
 * live parameter vector.
 */
export function neutralParams(): ExpressionParams {
  return { ...EXPRESSION_PRESETS.neutral };
}

/**
 * Blends two expression param vectors with an intensity 0..1.
 * intensity=0 => fully `from`, intensity=1 => fully `to`.
 *
 * The mouth shape is categorical so we switch at the halfway mark.
 */
export function blendParams(
  from: ExpressionParams,
  to: ExpressionParams,
  intensity: number,
): ExpressionParams {
  const t = clamp01(intensity);
  return {
    browAngleL: lerp(from.browAngleL, to.browAngleL, t),
    browAngleR: lerp(from.browAngleR, to.browAngleR, t),
    browYL: lerp(from.browYL, to.browYL, t),
    browYR: lerp(from.browYR, to.browYR, t),
    lidOpenL: lerp(from.lidOpenL, to.lidOpenL, t),
    lidOpenR: lerp(from.lidOpenR, to.lidOpenR, t),
    pupilOffsetX: lerp(from.pupilOffsetX, to.pupilOffsetX, t),
    pupilOffsetY: lerp(from.pupilOffsetY, to.pupilOffsetY, t),
    mouth: t >= 0.5 ? to.mouth : from.mouth,
    mouthOpen: lerp(from.mouthOpen, to.mouthOpen, t),
    glowStrength: lerp(from.glowStrength, to.glowStrength, t),
  };
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}
