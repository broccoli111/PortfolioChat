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

  // Skeptical — one brow cocked hard, eyes narrowed asymmetrically,
  // pupils slide off to the side. Reads as a full "oh really?" look.
  skeptical: {
    browAngleL: -14,
    browAngleR: 24,
    browYL: 2,
    browYR: -7,
    lidOpenL: 0.72,
    lidOpenR: 0.58,
    pupilOffsetX: -1.6,
    pupilOffsetY: 0.4,
    mouth: "flat",
    mouthOpen: 0,
    glowStrength: 0.95,
  },

  // Confused — strong mismatched brows (one way up, one way down),
  // pupils pulled to the side with a slight upward peek.
  confused: {
    browAngleL: 18,
    browAngleR: -12,
    browYL: -5,
    browYR: 3,
    lidOpenL: 1.05,
    lidOpenR: 0.85,
    pupilOffsetX: 1.6,
    pupilOffsetY: -0.9,
    mouth: "uncertain",
    mouthOpen: 0.5,
    glowStrength: 0.9,
  },

  // Happy — wide grin + strong squint, cheeks pushing lids up into
  // arcs. Overshoots intensity so it really "pops" when triggered.
  happy: {
    browAngleL: 8,
    browAngleR: -8,
    browYL: -4,
    browYR: -4,
    lidOpenL: 0.5,
    lidOpenR: 0.5,
    pupilOffsetX: 0,
    pupilOffsetY: 0.8,
    mouth: "smile",
    mouthOpen: 0.55,
    glowStrength: 1.25,
  },

  // Thinking — brows drawn inward and slightly down, eyes looking
  // up-and-away (classic "looking up at a thought bubble").
  thinking: {
    browAngleL: -10,
    browAngleR: -10,
    browYL: 3,
    browYR: 3,
    lidOpenL: 0.8,
    lidOpenR: 0.8,
    pupilOffsetX: 1.6,
    pupilOffsetY: -1.8,
    mouth: "small",
    mouthOpen: 0,
    glowStrength: 0.95,
  },

  // Listening — wide attentive eyes, brows lifted softly, leaning in.
  // Lids go above 1.0 to imply a little extra wideness.
  listening: {
    browAngleL: 6,
    browAngleR: -6,
    browYL: -3,
    browYR: -3,
    lidOpenL: 1.15,
    lidOpenR: 1.15,
    pupilOffsetX: 0,
    pupilOffsetY: 0,
    mouth: "closed",
    mouthOpen: 0,
    glowStrength: 1.1,
  },
};

/**
 * Per-emotion live motion overlay. Given a target emotion and a
 * monotonically-advancing time value (ms), returns small additive
 * offsets that get layered on top of the eased parameter vector so
 * each emotion has a subtle signature wiggle:
 *
 *   - happy: gentle vertical bob + slight squint breathing
 *   - skeptical: occasional brow twitches + slow lateral pupil scan
 *   - confused: pupil darts + tiny head wobble
 *   - thinking: slow pupil sweep up-and-to-the-side
 *   - listening: slight head tilt toward the speaker
 *
 * Values are clamped small on purpose — they're flavor, not pose.
 */
export type MotionOverlay = {
  browAngleL: number;
  browAngleR: number;
  browYL: number;
  browYR: number;
  lidOpenL: number;
  lidOpenR: number;
  pupilOffsetX: number;
  pupilOffsetY: number;
  /** Head-transform hints used by the renderer. */
  headTiltDeg: number;   // rotate the whole head around its center
  headSwayX: number;     // translate px
  headSwayY: number;     // translate px (on top of idle bob)
};

const ZERO_OVERLAY: MotionOverlay = {
  browAngleL: 0,
  browAngleR: 0,
  browYL: 0,
  browYR: 0,
  lidOpenL: 0,
  lidOpenR: 0,
  pupilOffsetX: 0,
  pupilOffsetY: 0,
  headTiltDeg: 0,
  headSwayX: 0,
  headSwayY: 0,
};

export function emotionMotion(emotion: AvatarEmotion, t: number): MotionOverlay {
  const s = t / 1000;
  const tau = Math.PI * 2;

  switch (emotion) {
    case "happy": {
      // Slight bounce + rhythmic breathing squint; the smile "pulses"
      // just a hair. 0.9 Hz bob, 1.3 Hz squint.
      return {
        ...ZERO_OVERLAY,
        lidOpenL: Math.sin(s * tau * 1.3) * 0.06,
        lidOpenR: Math.sin(s * tau * 1.3 + 0.15) * 0.06,
        browYL: Math.sin(s * tau * 1.3) * -0.6,
        browYR: Math.sin(s * tau * 1.3) * -0.6,
        headSwayY: -Math.abs(Math.sin(s * tau * 0.9)) * 1.4,
        headTiltDeg: Math.sin(s * tau * 0.9) * 1.2,
      };
    }
    case "skeptical": {
      // Twitch: brow flicks every ~1.8s; pupils scan slowly side-to-side.
      const twitch = Math.sin(s * tau * 0.55) > 0.92 ? 1 : 0;
      return {
        ...ZERO_OVERLAY,
        browAngleR: twitch * 4,
        browYR: twitch * -1.5,
        pupilOffsetX: Math.sin(s * tau * 0.35) * 0.8,
        headTiltDeg: -1.5 + Math.sin(s * tau * 0.3) * 0.4,
      };
    }
    case "confused": {
      // Darting pupils that land for a beat then jump. Tiny head wobble.
      const jumpPhase = Math.floor(s * 1.3) % 3;
      const dartX = [1, -0.6, 0.3][jumpPhase] * 1.2;
      const dartY = [-0.5, 0.4, -0.2][jumpPhase] * 1.0;
      return {
        ...ZERO_OVERLAY,
        pupilOffsetX: dartX,
        pupilOffsetY: dartY,
        browYL: Math.sin(s * tau * 0.9) * 0.8,
        headTiltDeg: Math.sin(s * tau * 0.6) * 2.2,
        headSwayX: Math.sin(s * tau * 0.6) * 0.8,
      };
    }
    case "thinking": {
      // Slow sweep of the gaze up-and-right, with a small brow dip.
      const sweep = (Math.sin(s * tau * 0.25) + 1) / 2; // 0..1
      return {
        ...ZERO_OVERLAY,
        pupilOffsetX: 0.6 + sweep * 1.4,
        pupilOffsetY: -0.6 - sweep * 0.8,
        browYL: Math.sin(s * tau * 0.8) * 0.5,
        browYR: Math.sin(s * tau * 0.8 + 0.2) * 0.5,
        headTiltDeg: 2 + Math.sin(s * tau * 0.2) * 0.6,
      };
    }
    case "listening": {
      // Gentle head tilt toward the speaker + slow breathing.
      return {
        ...ZERO_OVERLAY,
        headTiltDeg: 3 + Math.sin(s * tau * 0.45) * 0.6,
        headSwayX: 1.2,
        browYL: Math.sin(s * tau * 0.6) * -0.4,
        browYR: Math.sin(s * tau * 0.6) * -0.4,
      };
    }
    case "neutral":
    default: {
      // Neutral keeps a whisper of life: very slow head drift.
      return {
        ...ZERO_OVERLAY,
        headSwayX: Math.sin(s * tau * 0.12) * 0.4,
        headTiltDeg: Math.sin(s * tau * 0.1) * 0.5,
      };
    }
  }
}

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
