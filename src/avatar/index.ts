export { TalkingHeadAvatar } from "./TalkingHeadAvatar";
export type { TalkingHeadAvatarProps } from "./TalkingHeadAvatar";
export { OriginalAvatar } from "./OriginalAvatar";
export type { OriginalAvatarProps } from "./OriginalAvatar";
export { CombinedAvatar, default } from "./CombinedAvatar";
export type { CombinedAvatarProps } from "./CombinedAvatar";
export type {
  AvatarEmotion,
  AvatarMouthShape,
  AvatarPalette,
  AvatarState,
} from "./types";
export { EXPRESSION_PRESETS } from "./expressions";
export type { ExpressionParams } from "./expressions";
export { DEFAULT_PALETTE, resolvePalette } from "./palette";
export { mapConversationToAvatarState, classifyMessage } from "./mapping";
export type { ConversationHint, MessageClassification } from "./mapping";
export { useSpeechSynthesis } from "./useSpeechSynthesis";
export type {
  SpeechSynthesisOptions,
  UseSpeechSynthesisResult,
} from "./useSpeechSynthesis";
