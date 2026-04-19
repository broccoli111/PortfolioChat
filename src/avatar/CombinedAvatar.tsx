/**
 * CombinedAvatar — traced reference portrait with animated features.
 *
 * Rendering recipe:
 *   1. Paint the full traced SVG as a pixel-accurate base plate. This
 *      gives us the exact silhouette, hair, beard, glasses, ear, and
 *      glow from the reference image.
 *   2. Paint face-colored erasers over the lens interiors and mouth
 *      region so the baked-in traced pupils / mouth / soul patch /
 *      mustache don't show through underneath our animated overlay.
 *   3. Re-stroke the amber glasses rims on top so the eraser can't
 *      nick the frame shapes.
 *   4. Draw animated eye whites, pupils, catch-lights, brows, and
 *      mouth at the anchor positions measured from the trace.
 *   5. Drive everything with the same requestAnimationFrame loop used
 *      by TalkingHeadAvatar (blink, speaking mouth cycle, idle bob,
 *      pupil drift, emotion easing).
 *
 * The API matches `AvatarState` so the component is a drop-in for the
 * existing demo controls and LLM mapper.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarEmotion, AvatarMouthShape, AvatarPalette, AvatarState } from "./types";
import {
  EXPRESSION_PRESETS,
  blendParams,
  clamp,
  clamp01,
  lerp,
  neutralParams,
  type ExpressionParams,
} from "./expressions";
import { mouthPath } from "./geometry";
import { resolvePalette } from "./palette";
import {
  TRACED_ANCHORS,
  TRACED_ERASE_REGIONS,
  TRACED_PAINT_ORDER,
  TRACE_TRANSFORM,
  TRACE_VIEWBOX,
} from "./tracedGeometry";

export type CombinedAvatarProps = AvatarState & {
  palette?: AvatarPalette;
  className?: string;
  ariaLabel?: string;
};

// ---------- Animation tuning (mirrors TalkingHeadAvatar) -----------------

const EXPRESSION_EASE = 6;
const IDLE_BOB_AMPLITUDE = 1.2;
const IDLE_BOB_PERIOD_MS = 3800;
const BLINK_MIN_INTERVAL_MS = 2200;
const BLINK_MAX_INTERVAL_MS = 5200;
const BLINK_CLOSE_MS = 95;
const BLINK_OPEN_MS = 140;
const SPEAK_STEP_MIN_MS = 80;
const SPEAK_STEP_MAX_MS = 170;
const IDLE_DRIFT_AMPLITUDE = 0.7;
const IDLE_DRIFT_PERIOD_MS = 5400;

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function applyBlink(p: ExpressionParams, blink: number): ExpressionParams {
  if (blink <= 0) return p;
  const m = 1 - blink;
  return { ...p, lidOpenL: p.lidOpenL * m, lidOpenR: p.lidOpenR * m };
}

// ---------- Feature geometry tuned to traced anchors ---------------------
//
// Sizes were chosen to match the reference portrait: eye whites fill the
// traced lens interior, pupils are tall vertical ovals that fill most of
// the white, catch-lights sit upper-inner, brows are thick rounded bars
// sitting just above the rim, and the mouth curve anchors below the
// beard's upper edge.
const EYE_RX = 17;
const EYE_RY = 18;
const PUPIL_RX = 6.5;
const PUPIL_RY = 12;
const CATCH_R = 2.6;
const BROW_W = 26;

/**
 * Build a filled brow SHAPE (not a stroke) — a chunky rounded bar with
 * top and bottom edges. This matches the reference illustration where
 * the brows are dark brown filled shapes, not line strokes.
 *
 * Angle convention: positive = outer edge UP.
 */
function browShapePath(
  anchor: { cx: number; cy: number; w: number },
  angleDeg: number,
  yOffset: number,
  isLeft: boolean,
  thickness = 5,
): string {
  const { cx, cy, w } = anchor;
  const y = cy + yOffset;
  const half = w / 2;
  const outerX = isLeft ? cx - half : cx + half;
  const innerX = isLeft ? cx + half : cx - half;
  const tilt = Math.tan((angleDeg * Math.PI) / 180) * half;
  const outerY = y - tilt;
  const innerY = y + tilt * 0.25;
  const ctrlY = (innerY + outerY) / 2 - 3;
  const t = thickness / 2;
  // Build a closed shape with a top curve and a bottom curve, joined by
  // rounded ends.
  return [
    `M ${innerX} ${innerY - t}`,
    `Q ${cx} ${ctrlY - t}, ${outerX} ${outerY - t}`,
    `Q ${outerX + (isLeft ? -2 : 2)} ${outerY}, ${outerX} ${outerY + t}`,
    `Q ${cx} ${ctrlY + t}, ${innerX} ${innerY + t}`,
    `Q ${innerX + (isLeft ? 2 : -2)} ${innerY}, ${innerX} ${innerY - t}`,
    "Z",
  ].join(" ");
}

// ---------- Component ----------------------------------------------------

export function CombinedAvatar(props: CombinedAvatarProps) {
  const {
    emotion,
    speaking,
    intensity = 1,
    lookX = 0,
    lookY = 0,
    size = 256,
    palette,
    className,
    ariaLabel = "Talking head avatar",
  } = props;

  const colors = useMemo(() => resolvePalette(palette), [palette]);

  const liveRef = useRef<ExpressionParams>(neutralParams());
  const [render, setRender] = useState(() => ({
    params: neutralParams(),
    bob: 0,
    blink: 0,
    speakShape: null as AvatarMouthShape | null,
    speakOpen: 0,
    idleDriftX: 0,
    idleDriftY: 0,
  }));

  const target = useMemo<ExpressionParams>(() => {
    const t = clamp01(intensity);
    const preset = EXPRESSION_PRESETS[emotion] ?? EXPRESSION_PRESETS.neutral;
    return blendParams(EXPRESSION_PRESETS.neutral, preset, t);
  }, [emotion, intensity]);

  const targetRef = useRef<ExpressionParams>(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  const blinkRef = useRef<{ nextAt: number; phase: 0 | 1 | 2; phaseStart: number }>({
    nextAt: performance.now() + randomInRange(BLINK_MIN_INTERVAL_MS, BLINK_MAX_INTERVAL_MS),
    phase: 0,
    phaseStart: 0,
  });
  const speakRef = useRef<{ shape: AvatarMouthShape; open: number; nextChangeAt: number }>({
    shape: "closed",
    open: 0,
    nextChangeAt: 0,
  });
  const speakingRef = useRef(speaking);
  useEffect(() => {
    speakingRef.current = speaking;
    if (!speaking) {
      speakRef.current.shape = "closed";
      speakRef.current.open = 0;
    } else if (speakRef.current.nextChangeAt === 0) {
      speakRef.current.nextChangeAt = performance.now();
    }
  }, [speaking]);
  const emotionRef = useRef(emotion);
  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const k = 1 - Math.exp(-EXPRESSION_EASE * dt);
      const live = liveRef.current;
      const tgt = targetRef.current;
      live.browAngleL = lerp(live.browAngleL, tgt.browAngleL, k);
      live.browAngleR = lerp(live.browAngleR, tgt.browAngleR, k);
      live.browYL = lerp(live.browYL, tgt.browYL, k);
      live.browYR = lerp(live.browYR, tgt.browYR, k);
      live.lidOpenL = lerp(live.lidOpenL, tgt.lidOpenL, k);
      live.lidOpenR = lerp(live.lidOpenR, tgt.lidOpenR, k);
      live.pupilOffsetX = lerp(live.pupilOffsetX, tgt.pupilOffsetX, k);
      live.pupilOffsetY = lerp(live.pupilOffsetY, tgt.pupilOffsetY, k);
      live.mouthOpen = lerp(live.mouthOpen, tgt.mouthOpen, k);
      live.glowStrength = lerp(live.glowStrength, tgt.glowStrength, k);
      live.mouth = tgt.mouth;

      // Blink state machine
      const b = blinkRef.current;
      let blinkAmount = 0;
      if (b.phase === 0 && now >= b.nextAt) {
        b.phase = 1;
        b.phaseStart = now;
      }
      if (b.phase === 1) {
        const p = clamp01((now - b.phaseStart) / BLINK_CLOSE_MS);
        blinkAmount = p;
        if (p >= 1) {
          b.phase = 2;
          b.phaseStart = now;
        }
      } else if (b.phase === 2) {
        const p = clamp01((now - b.phaseStart) / BLINK_OPEN_MS);
        blinkAmount = 1 - p;
        if (p >= 1) {
          b.phase = 0;
          b.nextAt = now + randomInRange(BLINK_MIN_INTERVAL_MS, BLINK_MAX_INTERVAL_MS);
        }
      }

      // Speaking mouth cycle
      const s = speakRef.current;
      if (speakingRef.current) {
        if (now >= s.nextChangeAt) {
          const r = Math.random();
          let nextShape: AvatarMouthShape;
          if (r < 0.15) nextShape = "closed";
          else if (r < 0.55) nextShape = "mid";
          else nextShape = "open";
          const em: AvatarEmotion = emotionRef.current;
          if (em === "happy" && nextShape !== "closed" && Math.random() < 0.5) {
            nextShape = "smile";
          }
          s.shape = nextShape;
          s.open =
            nextShape === "open"
              ? randomInRange(0.6, 1)
              : nextShape === "mid"
              ? randomInRange(0.3, 0.6)
              : 0;
          s.nextChangeAt = now + randomInRange(SPEAK_STEP_MIN_MS, SPEAK_STEP_MAX_MS);
        }
      } else {
        s.shape = "closed";
        s.open = 0;
      }

      const bobPhase = (now % IDLE_BOB_PERIOD_MS) / IDLE_BOB_PERIOD_MS;
      const bob = Math.sin(bobPhase * Math.PI * 2) * IDLE_BOB_AMPLITUDE;

      const driftPhase = (now % IDLE_DRIFT_PERIOD_MS) / IDLE_DRIFT_PERIOD_MS;
      const idleDriftX = Math.sin(driftPhase * Math.PI * 2) * IDLE_DRIFT_AMPLITUDE;
      const idleDriftY =
        Math.cos(driftPhase * Math.PI * 2 * 0.7) * IDLE_DRIFT_AMPLITUDE * 0.5;

      setRender({
        params: { ...live },
        bob,
        blink: blinkAmount,
        speakShape: speakingRef.current ? s.shape : null,
        speakOpen: s.open,
        idleDriftX,
        idleDriftY,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- Derived render values ----------------------------------
  const effective = applyBlink(render.params, render.blink);
  const gazeX = clamp(lookX, -1, 1) * 3 + render.idleDriftX;
  const gazeY = clamp(lookY, -1, 1) * 2.4 + render.idleDriftY;
  const pupilDX = clamp(effective.pupilOffsetX + gazeX, -4, 4);
  const pupilDY = clamp(effective.pupilOffsetY + gazeY, -3.4, 3.4);
  const mouthShape: string = render.speakShape ?? effective.mouth;
  const mouthOpen = render.speakShape ? render.speakOpen : effective.mouthOpen;

  const eL = TRACED_ANCHORS.eyeL;
  const eR = TRACED_ANCHORS.eyeR;
  const bL = TRACED_ANCHORS.browL;
  const bR = TRACED_ANCHORS.browR;
  const lensL = TRACED_ERASE_REGIONS.lensL;
  const lensR = TRACED_ERASE_REGIONS.lensR;
  const mouthErase = TRACED_ERASE_REGIONS.mouth;

  const ryL = EYE_RY * clamp01(effective.lidOpenL);
  const ryR = EYE_RY * clamp01(effective.lidOpenR);
  const pupRyL = PUPIL_RY * clamp01(effective.lidOpenL);
  const pupRyR = PUPIL_RY * clamp01(effective.lidOpenR);
  const pupVisL = effective.lidOpenL > 0.08 ? 1 : 0;
  const pupVisR = effective.lidOpenR > 0.08 ? 1 : 0;

  const browDL = browShapePath({ cx: bL.cx, cy: bL.cy, w: BROW_W }, effective.browAngleL, effective.browYL, true, 5.5);
  const browDR = browShapePath({ cx: bR.cx, cy: bR.cy, w: BROW_W }, effective.browAngleR, effective.browYR, false, 5.5);

  const mouthD = mouthPath(mouthShape, mouthOpen);
  const mouthFillColor =
    mouthShape === "open" || mouthShape === "mid"
      ? colors.mouth
      : mouthShape === "closed"
      ? colors.outline
      : "none";

  // Mouth path generator is authored against an anchor at (cx=124, cy=178)
  // but our traced mouth lives at ~(110, 197). Translate the animated
  // mouth onto the traced anchor with a <g transform>.
  const MOUTH_GEOMETRY_ANCHOR = { cx: 124, cy: 178 };
  const mouthShift = {
    dx: TRACED_ANCHORS.mouth.cx - MOUTH_GEOMETRY_ANCHOR.cx,
    dy: TRACED_ANCHORS.mouth.cy - MOUTH_GEOMETRY_ANCHOR.cy,
  };

  // ---------- Render ------------------------------------------------
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${TRACE_VIEWBOX} ${TRACE_VIEWBOX}`}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ display: "block", background: colors.background }}
    >
      {/* Whole-avatar idle bob */}
      <g transform={`translate(0 ${render.bob.toFixed(3)})`}>
        {/* ---- 1. Traced base plate (full reference paint order) ---- */}
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

        {/* ---- 2. Face-colored erasers wiping traced features ---- */}
        <g>
          <ellipse cx={lensL.cx} cy={lensL.cy} rx={lensL.rx} ry={lensL.ry} fill={colors.face} />
          <ellipse cx={lensR.cx} cy={lensR.cy} rx={lensR.rx} ry={lensR.ry} fill={colors.face} />
          <ellipse cx={mouthErase.cx} cy={mouthErase.cy} rx={mouthErase.rx} ry={mouthErase.ry} fill={colors.face} />
        </g>

        {/* ---- 3. Animated eye whites (behind pupils) ---- */}
        <g>
          <ellipse
            cx={eL.cx}
            cy={eL.cy}
            rx={EYE_RX}
            ry={ryL}
            fill={colors.eyeWhite}
            stroke={colors.outline}
            strokeWidth={1.6}
            opacity={0.95}
          />
          <ellipse
            cx={eR.cx}
            cy={eR.cy}
            rx={EYE_RX}
            ry={ryR}
            fill={colors.eyeWhite}
            stroke={colors.outline}
            strokeWidth={1.6}
            opacity={0.95}
          />
        </g>

        {/* ---- 4. Animated pupils + catch-lights ---- */}
        <g>
          <ellipse
            cx={eL.cx + pupilDX}
            cy={eL.cy + pupilDY}
            rx={PUPIL_RX}
            ry={pupRyL}
            fill={colors.pupil}
            opacity={pupVisL}
          />
          <ellipse
            cx={eR.cx + pupilDX}
            cy={eR.cy + pupilDY}
            rx={PUPIL_RX}
            ry={pupRyR}
            fill={colors.pupil}
            opacity={pupVisR}
          />
          <circle
            cx={eL.cx + pupilDX + 1.8}
            cy={eL.cy + pupilDY - 2.2}
            r={CATCH_R * clamp01(effective.lidOpenL)}
            fill={colors.catchLight}
            opacity={pupVisL * 0.95}
          />
          <circle
            cx={eR.cx + pupilDX + 1.8}
            cy={eR.cy + pupilDY - 2.2}
            r={CATCH_R * clamp01(effective.lidOpenR)}
            fill={colors.catchLight}
            opacity={pupVisR * 0.95}
          />
        </g>

        {/* ---- 5. Animated brows (filled chunky bars, dark brown) ---- */}
        <g fill={colors.outline} stroke="none">
          <path d={browDL} />
          <path d={browDR} />
        </g>

        {/* ---- 6. Animated mouth (translated onto traced anchor) ---- */}
        <g transform={`translate(${mouthShift.dx} ${mouthShift.dy})`}>
          <path
            d={mouthD}
            fill={mouthFillColor}
            stroke={colors.outline}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

export default CombinedAvatar;
