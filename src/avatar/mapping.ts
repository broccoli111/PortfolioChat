import type { AvatarEmotion, AvatarState } from "./types";

/**
 * Shape of an AI-produced hint about what the avatar should express.
 * Intentionally loose — you can feed it whatever your LLM returns and the
 * mapper will do a best-effort classification.
 */
export type ConversationHint = {
  /** e.g. "positive", "negative", "neutral", "uncertain", "curious", ... */
  sentiment?: string;
  /** e.g. "analytical", "confident", "warm", "celebratory", "listening" */
  tone?: string;
  /** Whether the avatar should currently be speaking out loud. */
  isSpeaking?: boolean;
  /** Optional 0..1 expressiveness multiplier. */
  intensity?: number;
  /** Optional gaze hints. */
  lookX?: number;
  lookY?: number;
};

/**
 * Map a conversation hint to a concrete AvatarState. The mapping is
 * deliberately simple and readable so you can extend it for your app:
 * drop in additional sentiment/tone keywords or wire it to structured
 * output from a model.
 */
export function mapConversationToAvatarState(input: ConversationHint): AvatarState {
  const sentiment = (input.sentiment ?? "").toLowerCase();
  const tone = (input.tone ?? "").toLowerCase();

  let emotion: AvatarEmotion = "neutral";

  // Tone takes precedence — it describes how the avatar is speaking,
  // which is usually the most direct signal for expression choice.
  if (/celebrat|warm|friendly|joy|happy|excited/.test(tone + sentiment)) {
    emotion = "happy";
  } else if (/listen|attentive|receptive/.test(tone)) {
    emotion = "listening";
  } else if (/curious|thinking|ponder|analytic|analyz/.test(tone + sentiment)) {
    emotion = "thinking";
  } else if (/confident|assert|skeptic|critical|doubt/.test(tone + sentiment)) {
    emotion = "skeptical";
  } else if (/uncertain|confus|puzzled|surpris/.test(tone + sentiment)) {
    emotion = "confused";
  } else if (/neutral|calm|steady/.test(tone + sentiment)) {
    emotion = "neutral";
  }

  return {
    emotion,
    speaking: Boolean(input.isSpeaking),
    intensity: clampMaybe(input.intensity, 0, 1, 1),
    lookX: clampMaybe(input.lookX, -1, 1, 0),
    lookY: clampMaybe(input.lookY, -1, 1, 0),
  };
}

function clampMaybe(v: number | undefined, min: number, max: number, fallback: number) {
  if (typeof v !== "number" || Number.isNaN(v)) return fallback;
  return v < min ? min : v > max ? max : v;
}
