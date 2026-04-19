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
import {
  GEOMETRY,
  VIEWBOX,
  beardPath,
  browPath,
  earInnerPath,
  earPath,
  hairHighlightPath,
  hairMainPath,
  hairSpikesPath,
  headSilhouettePath,
  lensHighlightPath,
  mouthPath,
  soulPatchPath,
} from "./geometry";
import { resolvePalette } from "./palette";

export type TalkingHeadAvatarProps = AvatarState & {
  /** Optional palette overrides. Only the fields you supply are overridden. */
  palette?: AvatarPalette;
  /** Optional className on the root <svg>. */
  className?: string;
  /** Accessible label read by screen readers. */
  ariaLabel?: string;
};

// ---------- Animation tuning ----------------------------------------------

/** How fast the live parameter vector chases the target. Per-second factor. */
const EXPRESSION_EASE = 6;
/** Idle bob parameters. */
const IDLE_BOB_AMPLITUDE = 1.5;   // pixels
const IDLE_BOB_PERIOD_MS = 3600;
/** Blink timing. */
const BLINK_MIN_INTERVAL_MS = 2000;
const BLINK_MAX_INTERVAL_MS = 5000;
const BLINK_CLOSE_MS = 90;
const BLINK_OPEN_MS = 130;
/** Speaking mouth cycle (ms between shape changes). */
const SPEAK_STEP_MIN_MS = 70;
const SPEAK_STEP_MAX_MS = 160;
/** Idle pupil drift. */
const IDLE_DRIFT_AMPLITUDE = 0.8; // within eye, pixels
const IDLE_DRIFT_PERIOD_MS = 5200;

// ---------- Helpers -------------------------------------------------------

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Apply a blink overlay to a parameter vector. Blink multiplies the lid
 * openness so any current expression continues to show through underneath.
 */
function applyBlink(p: ExpressionParams, blink: number): ExpressionParams {
  if (blink <= 0) return p;
  const m = 1 - blink;
  return { ...p, lidOpenL: p.lidOpenL * m, lidOpenR: p.lidOpenR * m };
}

// ---------- Component -----------------------------------------------------

export function TalkingHeadAvatar(props: TalkingHeadAvatarProps) {
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

  // Live (interpolated) parameter vector. We keep it in a ref so the RAF
  // loop can mutate it every frame without re-running the component.
  const liveRef = useRef<ExpressionParams>(neutralParams());

  // Renderable state — updated ~60fps via setState on each frame.
  const [render, setRender] = useState<{
    params: ExpressionParams;
    bob: number;
    glowPulse: number;
    blink: number;
    speakShape: AvatarMouthShape | null;
    speakOpen: number;
    idleDriftX: number;
    idleDriftY: number;
  }>(() => ({
    params: neutralParams(),
    bob: 0,
    glowPulse: 0,
    blink: 0,
    speakShape: null,
    speakOpen: 0,
    idleDriftX: 0,
    idleDriftY: 0,
  }));

  // Target preset — recomputed whenever the emotion or intensity changes.
  // We blend the neutral preset toward the target preset by `intensity` so
  // low-intensity expressions are visibly softer without needing separate presets.
  const target = useMemo<ExpressionParams>(() => {
    const t = clamp01(intensity);
    const targetPreset = EXPRESSION_PRESETS[emotion] ?? EXPRESSION_PRESETS.neutral;
    return blendParams(EXPRESSION_PRESETS.neutral, targetPreset, t);
  }, [emotion, intensity]);

  // Keep the target in a ref so the RAF loop always reads the latest without
  // forcing us to re-subscribe the loop on every prop change.
  const targetRef = useRef<ExpressionParams>(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  // Blink state (managed inside the loop via nextBlinkAt / blinkPhase)
  const blinkRef = useRef<{
    nextAt: number;
    // 0 = idle, 1 = closing, 2 = opening
    phase: 0 | 1 | 2;
    phaseStart: number;
  }>({
    nextAt: performance.now() + randomInRange(BLINK_MIN_INTERVAL_MS, BLINK_MAX_INTERVAL_MS),
    phase: 0,
    phaseStart: 0,
  });

  // Speaking state
  const speakRef = useRef<{
    speaking: boolean;
    shape: AvatarMouthShape;
    open: number;
    nextChangeAt: number;
  }>({
    speaking: false,
    shape: "closed",
    open: 0,
    nextChangeAt: 0,
  });

  // Keep ref up to date without restarting the loop.
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

  // Main animation loop.
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // --- Ease the live parameter vector toward the target ---
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
      // Mouth shape categorical: snap unless we're speaking (speak loop owns it).
      live.mouth = tgt.mouth;

      // --- Blink state machine ---
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

      // --- Speaking mouth cycle ---
      const s = speakRef.current;
      if (speakingRef.current) {
        if (now >= s.nextChangeAt) {
          // Pick a new shape with mild randomness and occasional closes.
          const r = Math.random();
          let nextShape: AvatarMouthShape;
          if (r < 0.15) nextShape = "closed";
          else if (r < 0.55) nextShape = "mid";
          else nextShape = "open";
          // Let current emotion tint the base mouth slightly.
          const em: AvatarEmotion = emotionRef.current;
          if (em === "happy" && nextShape !== "closed" && Math.random() < 0.5) {
            nextShape = "smile";
          }
          s.shape = nextShape;
          s.open = nextShape === "open" ? randomInRange(0.6, 1) : nextShape === "mid" ? randomInRange(0.3, 0.6) : 0;
          s.nextChangeAt = now + randomInRange(SPEAK_STEP_MIN_MS, SPEAK_STEP_MAX_MS);
        }
      } else {
        s.shape = "closed";
        s.open = 0;
      }

      // --- Idle bob / glow pulse ---
      const bobPhase = (now % IDLE_BOB_PERIOD_MS) / IDLE_BOB_PERIOD_MS;
      const bob = Math.sin(bobPhase * Math.PI * 2) * IDLE_BOB_AMPLITUDE;
      const glowPulse = (Math.sin(bobPhase * Math.PI * 2 + 0.8) + 1) / 2; // 0..1

      // --- Idle pupil drift (only if emotion doesn't demand strong gaze) ---
      const driftPhase = (now % IDLE_DRIFT_PERIOD_MS) / IDLE_DRIFT_PERIOD_MS;
      const idleDriftX = Math.sin(driftPhase * Math.PI * 2) * IDLE_DRIFT_AMPLITUDE;
      const idleDriftY = Math.cos(driftPhase * Math.PI * 2 * 0.7) * IDLE_DRIFT_AMPLITUDE * 0.5;

      setRender({
        params: { ...live },
        bob,
        glowPulse,
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

  // ---------- Derive render values ----------------------------------------

  const effective = applyBlink(render.params, render.blink);

  // Clamp user-provided look direction into safe eye-internal bounds.
  const gazeX = clamp(lookX, -1, 1) * 2.6 + render.idleDriftX;
  const gazeY = clamp(lookY, -1, 1) * 2.0 + render.idleDriftY;
  const pupilDX = clamp(effective.pupilOffsetX + gazeX, -3.5, 3.5);
  const pupilDY = clamp(effective.pupilOffsetY + gazeY, -3.0, 3.0);

  // Base mouth + live speak override
  const mouthShape: string = render.speakShape ?? effective.mouth;
  const mouthOpen = render.speakShape ? render.speakOpen : effective.mouthOpen;

  const glowOpacity = 0.35 * effective.glowStrength * (0.85 + 0.15 * render.glowPulse);

  // ---------- Render ------------------------------------------------------

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", background: colors.background }}
    >
      <defs>
        <radialGradient id="avatar-glow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor={colors.glow} stopOpacity={0.95} />
          <stop offset="45%" stopColor={colors.glow} stopOpacity={0.6} />
          <stop offset="100%" stopColor={colors.glow} stopOpacity={0} />
        </radialGradient>
        <clipPath id="avatar-face-clip">
          <path d={headSilhouettePath()} />
        </clipPath>
      </defs>

      {/* 1. glow — warm orange halo behind the whole head */}
      <g opacity={glowOpacity}>
        <circle cx={128} cy={134} r={122} fill="url(#avatar-glow)" />
      </g>

      {/* Whole-head transform for idle bob */}
      <g transform={`translate(0 ${render.bob.toFixed(3)})`}>
        {/* 6. ear — drawn FIRST so the head silhouette's amber contour
            crosses over its inner edge for a clean attached look. */}
        <g>
          <path
            d={earPath()}
            fill={colors.face}
            stroke={colors.contour}
            strokeWidth={5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={earInnerPath()}
            fill="none"
            stroke={colors.outline}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.75}
          />
        </g>

        {/* 2. head silhouette — the DOMINANT amber sticker contour + a fine
            dark inner stroke for sticker-edge crispness. */}
        <path
          d={headSilhouettePath()}
          fill={colors.face}
          stroke={colors.contour}
          strokeWidth={9}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={headSilhouettePath()}
          fill="none"
          stroke={colors.outline}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.6}
        />

        {/* Clip hair, beard, and soul patch to the head silhouette so their
            bold shapes never poke outside the amber contour (except spikes,
            which we deliberately let protrude a little). */}
        <g clipPath="url(#avatar-face-clip)">
          {/* 4. hair */}
          <g>
            <path d={hairMainPath()} fill={colors.hairDark} />
            {/* lighter side fade block on the near-side temple */}
            <path d={hairHighlightPath()} fill={colors.hairLight} opacity={0.9} />
            {/* spiky/tufted top edge — small triangular tufts in the same
                dark hair color */}
            <path d={hairSpikesPath()} fill={colors.hairDark} />
          </g>

          {/* 5. beard — chin-strap style (clean mustache zone) */}
          <g>
            <path d={beardPath()} fill={colors.beard} />
          </g>

          {/* Soul patch — small beard detail below the lower lip */}
          <path d={soulPatchPath()} fill={colors.beard} />
        </g>

        {/* 7. glasses — oversized amber rims, drawn above skin/beard */}
        <Glasses colors={colors} />

        {/* 9. eye whites — tucked inside the lenses */}
        <Eyes params={effective} colors={colors} />

        {/* 10. pupils — huge round pupils with a warm catch-light */}
        <Pupils
          dx={pupilDX}
          dy={pupilDY}
          lidOpenL={effective.lidOpenL}
          lidOpenR={effective.lidOpenR}
          colors={colors}
        />

        {/* 8. eyebrows — sit above the lenses, thick + rounded for readability */}
        <Brows params={effective} colors={colors} />

        {/* 11. mouth */}
        <Mouth shape={mouthShape} openAmount={mouthOpen} colors={colors} />

        {/* 12. subtle lens highlights — short diagonal glints on each lens */}
        <g stroke={colors.eyeWhite} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.5}>
          <path d={lensHighlightPath(GEOMETRY.glassL)} />
          <path d={lensHighlightPath(GEOMETRY.glassR)} />
        </g>
      </g>
    </svg>
  );
}

// ---------- Feature subcomponents ----------------------------------------

function Glasses({ colors }: { colors: Required<AvatarPalette> }) {
  const gL = GEOMETRY.glassL;
  const gR = GEOMETRY.glassR;
  const bridgeY = GEOMETRY.glassBridgeY;
  return (
    <g>
      {/* Soft lens tint fill behind the eyes */}
      <rect x={gL.x} y={gL.y} width={gL.w} height={gL.h} rx={gL.r} ry={gL.r} fill={colors.glassesLens} />
      <rect x={gR.x} y={gR.y} width={gR.w} height={gR.h} rx={gR.r} ry={gR.r} fill={colors.glassesLens} />

      {/* Thick amber rims */}
      <rect
        x={gL.x}
        y={gL.y}
        width={gL.w}
        height={gL.h}
        rx={gL.r}
        ry={gL.r}
        fill="none"
        stroke={colors.glasses}
        strokeWidth={7}
      />
      <rect
        x={gR.x}
        y={gR.y}
        width={gR.w}
        height={gR.h}
        rx={gR.r}
        ry={gR.r}
        fill="none"
        stroke={colors.glasses}
        strokeWidth={7}
      />

      {/* Fine dark inner contour on each lens for the sticker-edge crispness */}
      <rect
        x={gL.x}
        y={gL.y}
        width={gL.w}
        height={gL.h}
        rx={gL.r}
        ry={gL.r}
        fill="none"
        stroke={colors.outline}
        strokeWidth={1.6}
        opacity={0.8}
      />
      <rect
        x={gR.x}
        y={gR.y}
        width={gR.w}
        height={gR.h}
        rx={gR.r}
        ry={gR.r}
        fill="none"
        stroke={colors.outline}
        strokeWidth={1.6}
        opacity={0.8}
      />

      {/* Bridge (nearly horizontal — pose is nearly front-on) */}
      <line
        x1={gL.x + gL.w}
        y1={bridgeY}
        x2={gR.x}
        y2={bridgeY}
        stroke={colors.glasses}
        strokeWidth={7}
        strokeLinecap="round"
      />

      {/* Short temples (arms of the glasses) — they disappear behind the
          hair/head, so we only draw a stub on each side. */}
      <line
        x1={gR.x + gR.w}
        y1={gR.y + gR.h * 0.38}
        x2={gR.x + gR.w + 10}
        y2={gR.y + gR.h * 0.34}
        stroke={colors.glasses}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line
        x1={gL.x}
        y1={gL.y + gL.h * 0.38}
        x2={gL.x - 10}
        y2={gL.y + gL.h * 0.34}
        stroke={colors.glasses}
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* Tiny hinge dots at the upper outer corners of each lens — a small
          identifying detail from the reference. */}
      <circle cx={gL.x + 6} cy={gL.y + 8} r={1.6} fill={colors.catchLight} />
      <circle cx={gR.x + gR.w - 6} cy={gR.y + 8} r={1.6} fill={colors.catchLight} />
    </g>
  );
}

function Eyes({ params, colors }: { params: ExpressionParams; colors: Required<AvatarPalette> }) {
  const eL = GEOMETRY.eyeL;
  const eR = GEOMETRY.eyeR;
  const ryL = eL.ry * clamp01(params.lidOpenL);
  const ryR = eR.ry * clamp01(params.lidOpenR);
  return (
    <g>
      <ellipse cx={eL.cx} cy={eL.cy} rx={eL.rx} ry={ryL} fill={colors.eyeWhite} stroke={colors.outline} strokeWidth={2} />
      <ellipse cx={eR.cx} cy={eR.cy} rx={eR.rx} ry={ryR} fill={colors.eyeWhite} stroke={colors.outline} strokeWidth={2} />
    </g>
  );
}

function Pupils({
  dx,
  dy,
  lidOpenL,
  lidOpenR,
  colors,
}: {
  dx: number;
  dy: number;
  lidOpenL: number;
  lidOpenR: number;
  colors: Required<AvatarPalette>;
}) {
  const eL = GEOMETRY.eyeL;
  const eR = GEOMETRY.eyeR;
  // Huge round pupils to match the reference's cartoon "bead" eye look.
  // Radii are nearly the full eye-white radius so the white only shows as a
  // thin crescent around the top.
  const pR = 11;
  const rL = pR * clamp01(lidOpenL);
  const rR = pR * clamp01(lidOpenR);
  const visL = lidOpenL > 0.08 ? 1 : 0;
  const visR = lidOpenR > 0.08 ? 1 : 0;
  return (
    <g>
      {/* Pupils */}
      <circle cx={eL.cx + dx} cy={eL.cy + dy} r={rL} fill={colors.pupil} opacity={visL} />
      <circle cx={eR.cx + dx} cy={eR.cy + dy} r={rR} fill={colors.pupil} opacity={visR} />

      {/* Warm catch-light specks inside each pupil. Offset slightly
          upper-right of center so both eyes feel lit from the same
          direction (front-right). */}
      <circle
        cx={eL.cx + dx + 1.5}
        cy={eL.cy + dy - 2}
        r={2.2 * clamp01(lidOpenL)}
        fill={colors.catchLight}
        opacity={visL * 0.95}
      />
      <circle
        cx={eR.cx + dx + 1.5}
        cy={eR.cy + dy - 2}
        r={2.2 * clamp01(lidOpenR)}
        fill={colors.catchLight}
        opacity={visR * 0.95}
      />
    </g>
  );
}

function Brows({ params, colors }: { params: ExpressionParams; colors: Required<AvatarPalette> }) {
  const dL = browPath(GEOMETRY.browL, params.browAngleL, params.browYL, true);
  const dR = browPath(GEOMETRY.browR, params.browAngleR, params.browYR, false);
  return (
    <g fill="none" stroke={colors.outline} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.95}>
      <path d={dL} />
      <path d={dR} />
    </g>
  );
}

function Mouth({
  shape,
  openAmount,
  colors,
}: {
  shape: string;
  openAmount: number;
  colors: Required<AvatarPalette>;
}) {
  const d = mouthPath(shape, openAmount);
  // "closed" is a thin filled lozenge so it reads cleanly against the beard.
  // "open" / "mid" are filled pill shapes (the open mouth interior).
  // Everything else is a stroked line.
  const filledWithMouthColor = shape === "open" || shape === "mid";
  const filledWithOutline = shape === "closed";
  return (
    <path
      d={d}
      fill={filledWithMouthColor ? colors.mouth : filledWithOutline ? colors.outline : "none"}
      stroke={colors.outline}
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export default TalkingHeadAvatar;
