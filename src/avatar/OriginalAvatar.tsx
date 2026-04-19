/**
 * OriginalAvatar — the exact Figma artwork rendered as React SVG.
 *
 * All paths are copied verbatim from `reference/avatar-original.svg` and
 * kept in `originalArtwork.ts`. Useful as a sanity check / static
 * reference render. Prefer <CombinedAvatar /> for anything interactive.
 */
import {
  ORIGINAL_BACKDROP,
  ORIGINAL_COLORS,
  ORIGINAL_FEATURES,
  ORIGINAL_VIEWBOX,
} from "./originalArtwork";

export type OriginalAvatarProps = {
  size?: number;
  className?: string;
  ariaLabel?: string;
};

export function OriginalAvatar({ size = 256, className, ariaLabel = "Avatar" }: OriginalAvatarProps) {
  const B = ORIGINAL_BACKDROP;
  const F = ORIGINAL_FEATURES;
  const C = ORIGINAL_COLORS;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ORIGINAL_VIEWBOX} ${ORIGINAL_VIEWBOX}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Glow filter removed — see originalArtwork.ts for the Figma
          drop-shadow definition if you want to restore it. */}
      <g>
        <path d={B.faceFill} fill={C.skin} />
        <path d={B.faceOutline} fill={C.skin} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
        <path d={B.hair} fill={C.ink} />
        <path d={B.beardMain} fill={C.ink} />
        <path d={B.beardAccent} fill={C.ink} />
        <path d={B.earFill} fill={C.skin} />
        <path d={B.earOutline} fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
        <path
          d={B.earInner}
          fill="none"
          stroke={C.black}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={F.pupilRight} fill={C.black} stroke={C.black} />
        <ellipse cx={F.catchRight.cx} cy={F.catchRight.cy} rx={F.catchRight.rx} ry={F.catchRight.ry} fill={C.skin} />
        <path d={F.pupilLeft} fill={C.black} stroke={C.black} />
        <ellipse cx={F.catchLeft.cx} cy={F.catchLeft.cy} rx={F.catchLeft.rx} ry={F.catchLeft.ry} fill={C.skin} />
        <path d={F.browRight} stroke={C.ink} strokeWidth={6} strokeLinecap="round" fill="none" />
        <path d={F.browLeft} stroke={C.ink} strokeWidth={6} strokeLinecap="round" fill="none" />
        <path d={B.glasses} fill={C.black} fillRule="evenodd" clipRule="evenodd" />
        <ellipse cx={B.hingeLeft.cx} cy={B.hingeLeft.cy} rx={B.hingeLeft.rx} ry={B.hingeLeft.ry} fill={C.hingeGray} />
        <ellipse cx={B.hingeRight.cx} cy={B.hingeRight.cy} rx={B.hingeRight.rx} ry={B.hingeRight.ry} fill={C.hingeGray} />
        <path d={B.noseFill} fill={C.skin} />
        <path d={B.noseOutline} fill="none" stroke={C.black} strokeWidth={4} strokeLinecap="round" />
        <path d={F.mouth} fill="none" stroke={C.black} strokeWidth={4} strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default OriginalAvatar;
