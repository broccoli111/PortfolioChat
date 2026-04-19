import type { AvatarPalette } from "./types";

/**
 * Default colors for the "toon-force glow" look.
 * Override any subset via the `palette` prop on <TalkingHeadAvatar />.
 */
export const DEFAULT_PALETTE: Required<AvatarPalette> = {
  outline: "#111111",
  face: "#F6F2EA",
  hairDark: "#2F2F33",
  hairLight: "#8C8A84",
  beard: "#8A8A8A",
  glasses: "#D97A00",
  glassesLens: "rgba(255, 200, 120, 0.18)",
  glow: "rgba(255, 165, 0, 0.35)",
  pupil: "#111111",
  eyeWhite: "#FBFAF6",
  mouth: "#2A1A14",
  background: "transparent",
};

export function resolvePalette(override?: AvatarPalette): Required<AvatarPalette> {
  if (!override) return DEFAULT_PALETTE;
  return { ...DEFAULT_PALETTE, ...override };
}
