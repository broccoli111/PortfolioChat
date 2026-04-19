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

// ---------- Message classification --------------------------------------

/**
 * Result of inspecting a raw message. Feed into `mapConversationToAvatarState`
 * or use directly with the component props.
 */
export type MessageClassification = {
  emotion: AvatarEmotion;
  intensity: number;
  /** The raw keywords / signals that matched. Useful for debugging/logs. */
  signals: string[];
};

/**
 * Classify an arbitrary text message into an `AvatarEmotion` + intensity.
 *
 * Heuristics — deliberately simple and transparent so they're easy to
 * extend:
 *   - exclamation marks / multiple ! / ALL CAPS      => higher intensity
 *   - question marks at the end                       => confused / thinking
 *   - keywords like "think" / "hmm" / "maybe"         => thinking
 *   - positive words ("yes", "great", "thanks", 😀)   => happy
 *   - skeptical words ("really?", "sure?", "doubt")   => skeptical
 *   - negative/unsure words ("idk", "hmm", "confus")  => confused / thinking
 *   - short, soft statements                          => listening
 *   - otherwise                                        => neutral
 *
 * The mapping is intentionally lightweight — it's meant to make short
 * user messages feel alive, not to be a full sentiment model.
 */
export function classifyMessage(raw: string): MessageClassification {
  const text = (raw ?? "").trim();
  if (!text) {
    return { emotion: "neutral", intensity: 1, signals: [] };
  }
  const lower = text.toLowerCase();
  const signals: string[] = [];

  // --- Intensity cues ---------------------------------------------------
  let intensity = 0.8;
  const bangs = (text.match(/!/g) || []).length;
  if (bangs > 0) {
    intensity = Math.min(1, 0.85 + bangs * 0.08);
    signals.push(`bangs:${bangs}`);
  }
  // ALL CAPS with 3+ letters => shouting
  const capsRatio =
    text.replace(/[^A-Za-z]/g, "").length > 3
      ? (text.match(/[A-Z]/g)?.length ?? 0) / Math.max(1, text.replace(/[^A-Za-z]/g, "").length)
      : 0;
  if (capsRatio > 0.6) {
    intensity = Math.min(1, intensity + 0.15);
    signals.push(`caps:${capsRatio.toFixed(2)}`);
  }

  // --- Emotion classification -------------------------------------------
  // Order matters: more specific cues first.
  const endsInQuestion = /\?\s*$/.test(text);
  const multiQuestion = (text.match(/\?/g) || []).length >= 2;

  // Happy cues — positive words, greetings, gratitude, celebratory
  // punctuation, emoji
  const happyRe =
    /\b(yay|yes+|great|awesome|amazing|love|thanks?|thank you|ty|ty!|perfect|excellent|fantastic|brilliant|nice|cool|sweet|woo+|lets? go|lfg|hooray|congrats|celebrate|excited|hi|hi there|hey|hello|howdy|welcome)\b|[😀😃😄😁😆😊🙂🥳🎉✨👍💯❤️]/i;
  // Sad / disappointed
  const sadRe = /\b(sad|sorry|bummer|unfortunate|regret|disappointed)\b|[😢😞😔]/i;
  // Skeptical cues
  const skepticalRe =
    /\b(really|seriously|sure(\?|,|$)|doubt|skeptic|unlikely|suspicious|prove|hmm really|come on|uh huh|right,|oh really)\b/i;
  // Confused cues. (Don't include generic "wait" — it's too often a
  // thinking / hold-on signal rather than confusion.)
  const confusedRe =
    /\b(what\??|huh|confus|lost|don'?t get|what do you mean|i don'?t understand|idk|no idea|puzzled|makes no sense|unsure)\b|\?\?+/i;
  // Thinking cues
  const thinkingRe =
    /\b(hmm+|uhh+|umm+|let me think|thinking|pondering|considering|probably|maybe|perhaps|analyze|calculate|interesting|i wonder|pondering|working on|loading)\b/i;
  // Listening cues — short, acknowledging statements
  const listeningRe =
    /\b(okay|ok|alright|got it|sure|mhm|uh huh|i see|listening|go on|go ahead|tell me|talk to me)\b/i;

  let emotion: AvatarEmotion = "neutral";

  if (happyRe.test(text)) {
    emotion = "happy";
    signals.push("happy");
  } else if (sadRe.test(text)) {
    // We don't have a dedicated sad preset — confused reads as
    // uncertain/uneasy which is closer than neutral.
    emotion = "confused";
    signals.push("sad->confused");
  } else if (skepticalRe.test(text)) {
    emotion = "skeptical";
    signals.push("skeptical");
  } else if (confusedRe.test(text) || multiQuestion) {
    emotion = "confused";
    signals.push(multiQuestion ? "multi-question" : "confused-keyword");
  } else if (thinkingRe.test(lower)) {
    emotion = "thinking";
    signals.push("thinking");
  } else if (endsInQuestion) {
    // A plain question usually means the speaker is posing a thought
    // — thinking reads better than neutral.
    emotion = "thinking";
    signals.push("question-mark");
  } else if (listeningRe.test(lower) && text.length <= 30) {
    emotion = "listening";
    signals.push("short-listening");
  }

  return { emotion, intensity, signals };
}
