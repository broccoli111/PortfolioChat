# TalkingHeadAvatar

A reusable, self-contained **browser-rendered talking head** built as a single
React + TypeScript + SVG component. No image assets. No sprite sheets. No
canvas frame atlases. No external avatar services. No AI image generation.

Everything you see — hair, beard, glasses, eyes, pupils, brows, mouth, glow —
is an SVG path or shape generated in code and driven by a parameter-based
animation system.

---

## Run the demo

```bash
npm install
npm run dev
```

Open the URL printed by Vite. The demo page at `/` shows the avatar with
controls for emotion, speaking, intensity, gaze, and size, plus a panel that
shows the current state JSON and a sample AI-mapping input/output.

```bash
npm run build    # typecheck + production build
npm run preview  # preview the built site
```

---

## Usage

```tsx
import { TalkingHeadAvatar } from "./src/avatar";

<TalkingHeadAvatar
  emotion="skeptical"
  speaking
  intensity={0.7}
  lookX={0.1}
  lookY={-0.1}
  size={256}
/>;
```

### Props

| Prop        | Type                                                                                           | Default                | Description                                                   |
| ----------- | ---------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| `emotion`   | `"neutral" \| "skeptical" \| "confused" \| "happy" \| "thinking" \| "listening"`              | required               | The target expression preset.                                 |
| `speaking`  | `boolean`                                                                                      | required               | Enables the mouth cycle (cartoon-style, not true lip-sync).   |
| `intensity` | `number` (0..1)                                                                                | `1`                    | Blends from neutral toward the target expression.             |
| `lookX`     | `number` (-1..1)                                                                               | `0`                    | Horizontal gaze offset (pupils only; eyes stay put).          |
| `lookY`     | `number` (-1..1)                                                                               | `0`                    | Vertical gaze offset.                                         |
| `size`      | `number`                                                                                       | `256`                  | Rendered pixel size. SVG stays crisp at any scale.            |
| `palette`   | `AvatarPalette`                                                                                | see `DEFAULT_PALETTE`  | Partial color override.                                       |
| `className` | `string`                                                                                       | —                      | Passed through to the root `<svg>`.                           |
| `ariaLabel` | `string`                                                                                       | `"Talking head avatar"` | Accessible label.                                             |

The component is fully responsive — the SVG uses a fixed `0 0 256 256`
viewBox, so any `size` (or CSS width/height) remains crisp.

---

## How it works

### File layout

```
src/avatar/
  index.ts                barrel exports
  types.ts                AvatarEmotion, AvatarState, AvatarPalette
  palette.ts              DEFAULT_PALETTE + resolvePalette()
  expressions.ts          ExpressionParams, EXPRESSION_PRESETS, blend/lerp
  geometry.ts             SVG path generators + feature anchor points
  mapping.ts              mapConversationToAvatarState() (AI -> AvatarState)
  TalkingHeadAvatar.tsx   the component + RAF animation loop
```

### SVG layering

Rendered in this order so silhouette, glow, and features read cleanly:

1. glow (radial gradient halo)
2. ear (drawn first so the head outline crosses cleanly over its inner edge)
3. head silhouette (cream face fill + heavy black sticker outline)
4. hair (dark mass + one lighter side-highlight block)
5. beard (medium-gray mass + mustache)
6. glasses (amber rims + bridge + temples, with a fine dark inner contour)
7. eye whites (outlined ovals)
8. pupils (tall vertical black ovals)
9. eyebrows (thick rounded strokes above the lenses)
10. mouth (path that switches between presets)
11. optional subtle diagonal lens highlights

Hair, beard, and mustache are clipped to the head silhouette so their
confident shapes never poke past the outer contour.

### 3/4 turn

The slight 3/4 facing is baked into the geometry rather than produced by
rotating the SVG:

- facial mass biased a touch to the viewer's left (chin ~x=118)
- oversized ear on the viewer's right, sitting outside the silhouette
- jaw and beard taper inward on the far side
- near-side lens is slightly wider than the far-side lens
- near-side eye and brow are slightly larger
- glasses bridge slopes down a touch toward the far side

### Parametric animation

There are **no pre-baked frames**. The avatar is driven by an
`ExpressionParams` vector with values like `browAngleL`, `lidOpenR`,
`pupilOffsetX`, `mouthOpen`, `glowStrength`, etc.

Each "expression" is just a target preset of those numbers (see
`EXPRESSION_PRESETS` in `expressions.ts`). The component keeps a *live* copy
of the vector and eases it toward the target every frame:

```ts
const k = 1 - Math.exp(-EXPRESSION_EASE * dt); // framerate-independent ease
live.browAngleL = lerp(live.browAngleL, target.browAngleL, k);
// ...etc
```

That's why transitions between emotions feel smooth instead of snapping.

### Blink, idle, gaze, speaking

These run *on top* of whatever the current expression is:

- **Blink system** — randomized every 2-5s. A state machine drives a `0..1`
  blink value that *multiplies* the current `lidOpen` so blinks work from any
  expression, not just neutral.
- **Idle bob** — a gentle ±1.5px vertical sine wave on the whole head group.
- **Glow pulse** — a subtle brightness wobble on the halo.
- **Idle pupil drift** — a tiny slow Lissajous-ish motion added to the
  pupil offset when the user hasn't nailed gaze explicitly.
- **Speaking cycle** — when `speaking={true}`, a timer switches between
  `"closed" | "mid" | "open"` (with a touch of `"smile"` when the current
  emotion is `happy`) at randomized intervals (70-160ms). The emotion's
  baseline mouth still shows through between cycles.
- **Gaze clamping** — `lookX` / `lookY` only translate the pupils within
  safe bounds so they never clip the eye whites or disappear under lids.

All of this runs inside a single `requestAnimationFrame` loop so there's
only one animation clock — no dueling timers.

---

## Adding a new expression

1. Add the new name to `AvatarEmotion` in `src/avatar/types.ts`.
2. Add a preset to `EXPRESSION_PRESETS` in `src/avatar/expressions.ts`. For
   example:

   ```ts
   surprised: {
     browAngleL: 18,
     browAngleR: -18,   // both outer edges up
     browYL: -4,
     browYR: -4,
     lidOpenL: 1.15,
     lidOpenR: 1.15,
     pupilOffsetX: 0,
     pupilOffsetY: 0,
     mouth: "open",
     mouthOpen: 0.8,
     glowStrength: 1.1,
   },
   ```

3. (Optional) Teach the AI mapper about it in `mapConversationToAvatarState`
   by adding a regex branch.

That's it — the ease/blend/blink/speaking systems will pick it up automatically.

Tuning hints:

- `browAngle*`: positive = outer edge UP (friendly / surprised), negative =
  outer edge DOWN (angry / skeptical). Keep magnitudes in the 4-20 range.
- `browY*`: negative = brow raised overall. Keep in ±5.
- `lidOpen*`: 1.0 = fully open, 0.7 = lowered, 0.0 = closed. Values slightly
  above 1 look "wide-eyed".
- `mouth`: one of `"closed" | "mid" | "open" | "smile" | "flat" | "small" | "uncertain"`.

---

## Connecting to an LLM

The module exports a utility:

```ts
import { mapConversationToAvatarState } from "./src/avatar";

const state = mapConversationToAvatarState({
  sentiment: "uncertain",   // free-form string
  tone: "analytical",       // free-form string
  isSpeaking: true,
  intensity: 0.8,
  lookX: 0.15,
  lookY: -0.05,
});

// state => { emotion: "skeptical", speaking: true, intensity: 0.8, lookX: 0.15, lookY: -0.05 }
```

Typical integration patterns:

- **Stream of tokens from a chat model** — set `speaking={isStreaming}`.
  While tokens are arriving, the avatar will do its cartoon mouth cycle.
  When the stream finishes, flip `speaking` off.
- **Structured output** — ask your model to return a tiny JSON object like
  `{ "sentiment": "curious", "tone": "warm" }` and pipe it through the mapper.
- **Function calls / tool use** — `emotion: "thinking"` while a tool is
  running; `emotion: "listening"` while waiting for user input;
  `emotion: "happy"` when a task completes successfully.
- **TTS playback** — drive `speaking` from the TTS player's
  `play`/`pause`/`ended` events.

You can also freely mix an AI-chosen `emotion` with a UI-chosen gaze
(e.g. have pupils track the user's cursor or chat input position).

---

## Constraints honored

- Pure SVG + React + TypeScript — no raster assets, no sprite sheets, no
  canvas atlases, no external avatar services.
- No animation libraries — the tweening uses framerate-independent
  exponential smoothing in a single `requestAnimationFrame` loop.
- Deterministic geometry — all anchors, paths, and presets live in code.
- Responsive and crisp at any `size` because everything is vector.
- Fully typed public API.
