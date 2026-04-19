/**
 * CombinedAvatar — the original Figma artwork composited with animated
 * eyes / pupils / brows / mouth.
 *
 * Rendering recipe:
 *   1. Paint the source artwork (face, hair, beard, ear, glasses, nose)
 *      verbatim — identical to what the artist drew.
 *   2. Paint face-colored ellipses over the pupil and mouth regions to
 *      wipe the baked-in features so the animated overlay can replace
 *      them cleanly.
 *   3. Draw animated eye whites, pupils, catch-lights, brows, and mouth
 *      at the exact anchor positions measured from the source SVG.
 *   4. Drive the parameter vector with an rAF loop (emotion easing,
 *      blink, speaking cycle, idle bob, pupil drift).
 *
 * Everything lives inside the Figma `feGaussianBlur` drop shadow from the
 * source so the amber glow renders identically to the original.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarEmotion, AvatarMouthShape, AvatarPalette, AvatarState } from "./types";
import {
  EXPRESSION_PRESETS,
  blendParams,
  clamp,
  clamp01,
  emotionMotion,
  lerp,
  neutralParams,
  type ExpressionParams,
} from "./expressions";
import { mouthPath } from "./geometry";
import {
  ORIGINAL_ANCHORS,
  ORIGINAL_BACKDROP,
  ORIGINAL_COLORS,
  ORIGINAL_ERASERS,
  ORIGINAL_VIEWBOX,
} from "./originalArtwork";
import { resolvePalette } from "./palette";

export type CombinedAvatarProps = AvatarState & {
  palette?: AvatarPalette;
  className?: string;
  ariaLabel?: string;
};

// ---------- Animation tuning --------------------------------------------

/** How fast the eased parameter vector chases the target. Higher = snappier. */
const EXPRESSION_EASE = 10;
/** Duration of the entry-pop overshoot after an emotion change (ms). */
const ENTRY_POP_MS = 260;
/** Amount by which the pop briefly pushes past the target preset. */
const ENTRY_POP_AMOUNT = 0.28;
const IDLE_BOB_AMPLITUDE = 1.2;
const IDLE_BOB_PERIOD_MS = 3800;
const BLINK_MIN_INTERVAL_MS = 2200;
const BLINK_MAX_INTERVAL_MS = 5200;
const BLINK_CLOSE_MS = 95;
const BLINK_OPEN_MS = 140;
const SPEAK_STEP_MIN_MS = 80;
const SPEAK_STEP_MAX_MS = 170;
const IDLE_DRIFT_AMPLITUDE = 0.6;
const IDLE_DRIFT_PERIOD_MS = 5400;

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function applyBlink(p: ExpressionParams, blink: number): ExpressionParams {
  if (blink <= 0) return p;
  const m = 1 - blink;
  return { ...p, lidOpenL: p.lidOpenL * m, lidOpenR: p.lidOpenR * m };
}

// ---------- Feature sizing (calibrated to the source artwork) -----------

// The source pupils are ~9x12 tall ovals. We use slightly smaller white
// caps and taller pupils so blinks compress them naturally.
// Sizes calibrated directly to the source pupil shapes:
// source left pupil: ~15 wide, 24 tall;  source right pupil: ~18 wide, 25 tall.
// catch-light: rx=4.5 ry=3.5 peach ellipse offset lower-left of pupil center.
const EYE_RX = 9;
const EYE_RY = 12;
const PUPIL_RX = 8;
const PUPIL_RY = 12;
const CATCH_RX = 4.5;
const CATCH_RY = 3.5;
const BROW_W = 26;

/** Filled chunky brow shape (matches the stroke style of the source). */
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
  return [
    `M ${innerX} ${innerY - t}`,
    `Q ${cx} ${ctrlY - t}, ${outerX} ${outerY - t}`,
    `Q ${outerX + (isLeft ? -2 : 2)} ${outerY}, ${outerX} ${outerY + t}`,
    `Q ${cx} ${ctrlY + t}, ${innerX} ${innerY + t}`,
    `Q ${innerX + (isLeft ? 2 : -2)} ${innerY}, ${innerX} ${innerY - t}`,
    "Z",
  ].join(" ");
}

// ---------- Component ---------------------------------------------------

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

  const userPalette = useMemo(() => resolvePalette(palette), [palette]);
  // For the original-artwork composite we prefer the source palette for
  // anything that touches the portrait (so the animated features match
  // tone). `palette` prop can still override via DEFAULT_PALETTE.
  const colors = {
    skin: ORIGINAL_COLORS.skin,
    ink: ORIGINAL_COLORS.ink,
    black: ORIGINAL_COLORS.black,
    hingeGray: ORIGINAL_COLORS.hingeGray,
    eyeWhite: "#FFFFFF",
    pupil: ORIGINAL_COLORS.black,
    catchLight: ORIGINAL_COLORS.skin,
    mouth: userPalette.mouth,
    background: userPalette.background,
  };

  const liveRef = useRef<ExpressionParams>(neutralParams());
  const [render, setRender] = useState(() => ({
    params: neutralParams(),
    bob: 0,
    blink: 0,
    speakShape: null as AvatarMouthShape | null,
    speakOpen: 0,
    idleDriftX: 0,
    idleDriftY: 0,
    headTilt: 0,
    headSwayX: 0,
    headSwayY: 0,
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

  // Entry-pop: brief overshoot whenever the target emotion changes so a
  // newly-triggered expression has snap. We stamp a timestamp each time
  // the emotion prop flips and let the rAF loop turn that into a
  // short-lived multiplier on top of the eased value.
  const entryPopStartRef = useRef(performance.now() - ENTRY_POP_MS);
  useEffect(() => {
    entryPopStartRef.current = performance.now();
  }, [emotion]);

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

      // Blink
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

      // Speaking cycle
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

      // Idle bob / gaze drift
      const bobPhase = (now % IDLE_BOB_PERIOD_MS) / IDLE_BOB_PERIOD_MS;
      const bob = Math.sin(bobPhase * Math.PI * 2) * IDLE_BOB_AMPLITUDE;
      const driftPhase = (now % IDLE_DRIFT_PERIOD_MS) / IDLE_DRIFT_PERIOD_MS;
      const idleDriftX = Math.sin(driftPhase * Math.PI * 2) * IDLE_DRIFT_AMPLITUDE;
      const idleDriftY =
        Math.cos(driftPhase * Math.PI * 2 * 0.7) * IDLE_DRIFT_AMPLITUDE * 0.5;

      // Entry-pop multiplier: 1 + sin-ease bump during the first
      // ENTRY_POP_MS after an emotion change, then settles to 1.
      const popPhase = clamp01((now - entryPopStartRef.current) / ENTRY_POP_MS);
      const pop = popPhase < 1
        ? 1 + Math.sin(popPhase * Math.PI) * ENTRY_POP_AMOUNT
        : 1;

      // Apply entry-pop as an overshoot toward the target preset from
      // the neutral baseline. We scale the signed delta between live
      // and neutral by (pop - 1) so the peak intensity of a new
      // expression briefly exaggerates past the preset.
      const em: AvatarEmotion = emotionRef.current;
      const preset = EXPRESSION_PRESETS[em] ?? EXPRESSION_PRESETS.neutral;
      if (pop > 1) {
        const extra = pop - 1; // 0..ENTRY_POP_AMOUNT
        live.browAngleL += (preset.browAngleL - live.browAngleL) * extra;
        live.browAngleR += (preset.browAngleR - live.browAngleR) * extra;
        live.browYL += (preset.browYL - live.browYL) * extra;
        live.browYR += (preset.browYR - live.browYR) * extra;
        live.lidOpenL += (preset.lidOpenL - live.lidOpenL) * extra;
        live.lidOpenR += (preset.lidOpenR - live.lidOpenR) * extra;
        live.pupilOffsetX += (preset.pupilOffsetX - live.pupilOffsetX) * extra;
        live.pupilOffsetY += (preset.pupilOffsetY - live.pupilOffsetY) * extra;
      }

      // Per-emotion motion overlay (brow twitches, pupil darts, head
      // tilts — gives each emotion a live signature).
      const overlay = emotionMotion(em, now);
      const outParams: ExpressionParams = {
        ...live,
        browAngleL: live.browAngleL + overlay.browAngleL,
        browAngleR: live.browAngleR + overlay.browAngleR,
        browYL: live.browYL + overlay.browYL,
        browYR: live.browYR + overlay.browYR,
        lidOpenL: live.lidOpenL + overlay.lidOpenL,
        lidOpenR: live.lidOpenR + overlay.lidOpenR,
        pupilOffsetX: live.pupilOffsetX + overlay.pupilOffsetX,
        pupilOffsetY: live.pupilOffsetY + overlay.pupilOffsetY,
      };

      setRender({
        params: outParams,
        bob,
        blink: blinkAmount,
        speakShape: speakingRef.current ? s.shape : null,
        speakOpen: s.open,
        idleDriftX,
        idleDriftY,
        headTilt: overlay.headTiltDeg,
        headSwayX: overlay.headSwayX,
        headSwayY: overlay.headSwayY,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- Derive render values -------------------------------------
  const effective = applyBlink(render.params, render.blink);
  const gazeX = clamp(lookX, -1, 1) * 2 + render.idleDriftX;
  const gazeY = clamp(lookY, -1, 1) * 1.8 + render.idleDriftY;
  const pupilDX = clamp(effective.pupilOffsetX + gazeX, -2.5, 2.5);
  const pupilDY = clamp(effective.pupilOffsetY + gazeY, -2, 2);
  const mouthShape: string = render.speakShape ?? effective.mouth;
  const mouthOpen = render.speakShape ? render.speakOpen : effective.mouthOpen;

  const eL = ORIGINAL_ANCHORS.eyeL;
  const eR = ORIGINAL_ANCHORS.eyeR;
  const bL = ORIGINAL_ANCHORS.browL;
  const bR = ORIGINAL_ANCHORS.browR;
  const mAnchor = ORIGINAL_ANCHORS.mouth;

  const pupRyL = PUPIL_RY * clamp01(effective.lidOpenL);
  const pupRyR = PUPIL_RY * clamp01(effective.lidOpenR);
  const pupVisL = effective.lidOpenL > 0.08 ? 1 : 0;
  const pupVisR = effective.lidOpenR > 0.08 ? 1 : 0;

  const browDL = browShapePath({ cx: bL.cx, cy: bL.cy, w: BROW_W }, effective.browAngleL, effective.browYL, true, 5);
  const browDR = browShapePath({ cx: bR.cx, cy: bR.cy, w: BROW_W }, effective.browAngleR, effective.browYR, false, 5);

  const mouthD = mouthPath(mouthShape, mouthOpen);
  // Mouth interior is pure black whenever the mouth is "open" (which is
  // what the speaking cycle uses) so it reads cleanly while talking. For
  // the mid shape (slight parting mid-word) we also use black so the
  // transition through "closed -> mid -> open" stays consistent. Closed
  // mouths at rest stay as the dark-brown ink color.
  const isSpeakingOpen = render.speakShape !== null && (mouthShape === "open" || mouthShape === "mid");
  const mouthFillColor = isSpeakingOpen
    ? colors.black
    : mouthShape === "open" || mouthShape === "mid"
    ? colors.mouth
    : mouthShape === "closed"
    ? colors.ink
    : "none";

  // geometry.mouthPath anchors at (124, 178); our source mouth sits at
  // the anchor measured above. Translate the animated mouth onto it.
  const MOUTH_GEOMETRY_ANCHOR = { cx: 124, cy: 178 };
  const mouthShift = {
    dx: mAnchor.cx - MOUTH_GEOMETRY_ANCHOR.cx,
    dy: mAnchor.cy - MOUTH_GEOMETRY_ANCHOR.cy,
  };

  // ---------- Render ---------------------------------------------------
  const B = ORIGINAL_BACKDROP;
  const E = ORIGINAL_ERASERS;

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
      style={{ display: "block", background: colors.background, overflow: "visible" }}
    >
      {/*
        Explicit paint order requested:

          head → hair → ear → eye R → eye L → brow R → brow L →
          glasses → nose → mouth → beard → mustache

        In SVG, source order = paint order (earlier = drawn first,
        underneath). So we render from the bottom of the stack (head)
        to the top (mustache = beardAccent).

        NOTE: because `beard` and `mustache` render AFTER `mouth`, the
        animated mouth will be visually covered wherever the beard path
        overlaps the mouth region. If you want the mouth to read on top
        of the beard, swap the mouth and beard blocks.
      */}
      {/* Head transform: idle vertical bob + per-emotion sway/tilt.
           Rotation origin set at the head center (approx ~(128, 140)) so
           tilts pivot around the chin-up-face axis instead of the SVG
           corner. */}
      <g
        transform={
          `translate(${render.headSwayX.toFixed(3)} ${(render.bob + render.headSwayY).toFixed(3)}) ` +
          `rotate(${render.headTilt.toFixed(3)} 128 140)`
        }
      >
        {/* ---- head (face fill + outline) ---- */}
        <g id="head">
          <path d={B.faceFill} fill={colors.skin} />
          <path
            d={B.faceOutline}
            fill={colors.skin}
            stroke={colors.ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </g>

        {/* ---- hair ---- */}
        <g id="hair">
          <path d={B.hair} fill={colors.ink} />
        </g>

        {/* ---- ear ---- */}
        <g id="ear">
          <path d={B.earFill} fill={colors.skin} />
          <path
            d={B.earOutline}
            fill="none"
            stroke={colors.ink}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <path
            d={B.earInner}
            fill="none"
            stroke={colors.black}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Skin-colored erasers for the lens interiors so animated pupils
            sit on clean skin rather than any baked-in geometry. */}
        <ellipse cx={E.lensL.cx} cy={E.lensL.cy} rx={E.lensL.rx} ry={E.lensL.ry} fill={colors.skin} />
        <ellipse cx={E.lensR.cx} cy={E.lensR.cy} rx={E.lensR.rx} ry={E.lensR.ry} fill={colors.skin} />

        {/* ---- eye R (viewer-right / far-side) ---- */}
        <g id="eye-right">
          <ellipse
            cx={eR.cx + pupilDX}
            cy={eR.cy + pupilDY}
            rx={PUPIL_RX}
            ry={pupRyR}
            fill={colors.pupil}
            opacity={pupVisR}
          />
          <ellipse
            cx={eR.cx + pupilDX - 4}
            cy={eR.cy + pupilDY + 3}
            rx={CATCH_RX}
            ry={CATCH_RY}
            fill={colors.catchLight}
            opacity={pupVisR}
          />
          {effective.lidOpenR < 0.98 && (
            <ellipse
              cx={eR.cx}
              cy={eR.cy - EYE_RY + EYE_RY * (1 - clamp01(effective.lidOpenR))}
              rx={EYE_RX + 1.5}
              ry={EYE_RY * (1 - clamp01(effective.lidOpenR))}
              fill={colors.skin}
            />
          )}
        </g>

        {/* ---- eye L (viewer-left / near-side) ---- */}
        <g id="eye-left">
          <ellipse
            cx={eL.cx + pupilDX}
            cy={eL.cy + pupilDY}
            rx={PUPIL_RX}
            ry={pupRyL}
            fill={colors.pupil}
            opacity={pupVisL}
          />
          <ellipse
            cx={eL.cx + pupilDX - 4}
            cy={eL.cy + pupilDY + 3}
            rx={CATCH_RX}
            ry={CATCH_RY}
            fill={colors.catchLight}
            opacity={pupVisL}
          />
          {effective.lidOpenL < 0.98 && (
            <ellipse
              cx={eL.cx}
              cy={eL.cy - EYE_RY + EYE_RY * (1 - clamp01(effective.lidOpenL))}
              rx={EYE_RX + 1.5}
              ry={EYE_RY * (1 - clamp01(effective.lidOpenL))}
              fill={colors.skin}
            />
          )}
        </g>

        {/* ---- brow R ---- */}
        <g id="brow-right" fill={colors.ink} stroke="none">
          <path d={browDR} />
        </g>

        {/* ---- brow L ---- */}
        <g id="brow-left" fill={colors.ink} stroke="none">
          <path d={browDL} />
        </g>

        {/* ---- glasses (frame compound + hinge dots) ---- */}
        <g id="glasses">
          <path d={B.glasses} fill={colors.black} fillRule="evenodd" clipRule="evenodd" />
          <ellipse cx={B.hingeLeft.cx} cy={B.hingeLeft.cy} rx={B.hingeLeft.rx} ry={B.hingeLeft.ry} fill={colors.hingeGray} />
          <ellipse cx={B.hingeRight.cx} cy={B.hingeRight.cy} rx={B.hingeRight.rx} ry={B.hingeRight.ry} fill={colors.hingeGray} />
        </g>

        {/* ---- nose ---- */}
        <g id="nose">
          <path d={B.noseFill} fill={colors.skin} />
          <path
            d={B.noseOutline}
            fill="none"
            stroke={colors.black}
            strokeWidth={4}
            strokeLinecap="round"
          />
        </g>

        {/* Eraser for the mouth region so the animated mouth sits on
            clean skin (in case any source detail leaks through). */}
        <ellipse cx={E.mouth.cx} cy={E.mouth.cy} rx={E.mouth.rx} ry={E.mouth.ry} fill={colors.skin} />

        {/* ---- mouth ---- */}
        <g id="mouth" transform={`translate(${mouthShift.dx} ${mouthShift.dy})`}>
          <path
            d={mouthD}
            fill={mouthFillColor}
            stroke={colors.black}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* ---- beard ---- */}
        <g id="beard">
          <path d={B.beardMain} fill={colors.ink} />
        </g>

        {/* ---- mustache ---- */}
        <g id="mustache">
          <path d={B.beardAccent} fill={colors.ink} />
        </g>
      </g>
    </svg>
  );
}

export default CombinedAvatar;
