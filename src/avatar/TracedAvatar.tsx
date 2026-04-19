/**
 * TracedAvatar — renders the reference portrait using paths produced by
 * the tracing pipeline (`scripts/trace/*`), preserving vtracer's original
 * paint order so the sticker silhouette, amber glow, glasses, and beard
 * land pixel-accurate against the reference PNG.
 *
 * This component is intentionally static. The animated TalkingHeadAvatar
 * overlays its own eyes / pupils / brows / mouth on top via a separate
 * layer — the traced portrait provides the identity & silhouette base.
 */
import { TRACE_VIEWBOX, TRACE_TRANSFORM, TRACED_PAINT_ORDER } from "./tracedGeometry";

export type TracedAvatarProps = {
  size?: number;
  className?: string;
  ariaLabel?: string;
};

export function TracedAvatar({ size = 256, className, ariaLabel = "Traced avatar" }: TracedAvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${TRACE_VIEWBOX} ${TRACE_VIEWBOX}`}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ display: "block" }}
    >
      <g transform={TRACE_TRANSFORM}>
        {TRACED_PAINT_ORDER.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.fill}
            transform={p.transform || undefined}
            data-layer={p.layer}
          />
        ))}
      </g>
    </svg>
  );
}

export default TracedAvatar;
