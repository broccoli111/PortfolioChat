import type { AvatarPalette } from "./types";

/**
 * Default colors matching the reference "toon-force glow" sticker portrait:
 * amber contour + cream face + charcoal hair + medium-gray beard + warm
 * orange halo.
 *
 * The contour is the defining sticker outline (amber), while `outline` is
 * reserved for thin dark internal strokes (pupils/brows/mouth/eye whites).
 *
 * Override any subset via the `palette` prop on <TalkingHeadAvatar />.
 */
export const DEFAULT_PALETTE: Required<AvatarPalette> = {
  outline: "#2A1E10",
  contour: "#F58A1F",
  face: "#FAF1E0",
  hairDark: "#2B2621",
  hairLight: "#6B6158",
  beard: "#6E645B",
  glasses: "#F58A1F",
  glassesLens: "rgba(255, 210, 140, 0.10)",
  glow: "#FFAE3B",
  pupil: "#1A1410",
  catchLight: "#FFC760",
  eyeWhite: "#FFFAF1",
  mouth: "#3A1F14",
  background: "transparent",
};

export function resolvePalette(override?: AvatarPalette): Required<AvatarPalette> {
  if (!override) return DEFAULT_PALETTE;
  return { ...DEFAULT_PALETTE, ...override };
}
