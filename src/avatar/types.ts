/**
 * Public types for the TalkingHeadAvatar component.
 *
 * These are the parameters a consumer supplies. Internally the component
 * interpolates toward a richer set of numeric "parameter" values (see
 * `expressions.ts` -> ExpressionParams) so motion stays smooth.
 */

export type AvatarEmotion =
  | "neutral"
  | "skeptical"
  | "confused"
  | "happy"
  | "thinking"
  | "listening";

export type AvatarMouthShape = "closed" | "mid" | "open" | "smile" | "flat" | "small" | "uncertain";

export type AvatarState = {
  emotion: AvatarEmotion;
  speaking: boolean;
  /** 0..1 — how strongly to apply the expression. Defaults to 1. */
  intensity?: number;
  /** -1..1 — horizontal gaze offset (pupils only). */
  lookX?: number;
  /** -1..1 — vertical gaze offset (pupils only). */
  lookY?: number;
  /** Rendered pixel size. Defaults to 256. */
  size?: number;
};

/**
 * Overridable color palette. All fields optional — the component falls back
 * to the documented defaults for any value not supplied.
 */
export type AvatarPalette = {
  /** Thin dark inner stroke used on internal features (eyes, brows, mouth). */
  outline?: string;
  /** Thick amber sticker contour around the whole head (the dominant outline). */
  contour?: string;
  face?: string;
  hairDark?: string;
  hairLight?: string;
  beard?: string;
  glasses?: string;
  glassesLens?: string;
  glow?: string;
  pupil?: string;
  /** Warm catch-light spark inside each pupil. */
  catchLight?: string;
  eyeWhite?: string;
  mouth?: string;
  background?: string;
};
