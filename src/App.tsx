import { useMemo, useState } from "react";
import {
  TalkingHeadAvatar,
  mapConversationToAvatarState,
  type AvatarEmotion,
  type AvatarState,
} from "./avatar";
import "./App.css";

const EMOTIONS: AvatarEmotion[] = [
  "neutral",
  "skeptical",
  "confused",
  "happy",
  "thinking",
  "listening",
];

export default function App() {
  const [emotion, setEmotion] = useState<AvatarEmotion>("neutral");
  const [speaking, setSpeaking] = useState(false);
  const [intensity, setIntensity] = useState(1);
  const [lookX, setLookX] = useState(0);
  const [lookY, setLookY] = useState(0);
  const [size, setSize] = useState(320);

  const state: AvatarState = { emotion, speaking, intensity, lookX, lookY, size };

  const sampleAi = {
    sentiment: "analytical",
    tone: "confident",
    isSpeaking: speaking,
    intensity,
    lookX,
    lookY,
  };
  const mapped = useMemo(() => mapConversationToAvatarState(sampleAi), [
    sampleAi.sentiment,
    sampleAi.tone,
    sampleAi.isSpeaking,
    sampleAi.intensity,
    sampleAi.lookX,
    sampleAi.lookY,
  ]);

  return (
    <div className="page">
      <header className="header">
        <h1>TalkingHeadAvatar</h1>
        <p className="tagline">
          Self-contained, SVG-driven, parametric talking head. No raster assets,
          no sprite sheets, no external services.
        </p>
      </header>

      <main className="stage-wrap">
        <div className="stage" style={{ width: size + 48, height: size + 48 }}>
          <TalkingHeadAvatar {...state} />
        </div>

        <section className="controls" aria-label="Avatar controls">
          <h2>Controls</h2>

          <label className="row">
            <span>Emotion</span>
            <select
              value={emotion}
              onChange={(e) => setEmotion(e.target.value as AvatarEmotion)}
            >
              {EMOTIONS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </label>

          <label className="row switch">
            <span>Speaking</span>
            <input
              type="checkbox"
              checked={speaking}
              onChange={(e) => setSpeaking(e.target.checked)}
            />
          </label>

          <Slider label="Intensity" min={0} max={1} step={0.01} value={intensity} onChange={setIntensity} />
          <Slider label="Look X" min={-1} max={1} step={0.01} value={lookX} onChange={setLookX} />
          <Slider label="Look Y" min={-1} max={1} step={0.01} value={lookY} onChange={setLookY} />
          <Slider label="Size (px)" min={96} max={512} step={1} value={size} onChange={setSize} />

          <div className="preset-row">
            <span>Quick presets:</span>
            {EMOTIONS.map((em) => (
              <button key={em} className="preset" onClick={() => setEmotion(em)} type="button">
                {em}
              </button>
            ))}
          </div>
        </section>
      </main>

      <section className="panels">
        <article className="panel">
          <h3>Current avatar state</h3>
          <pre>{JSON.stringify(state, null, 2)}</pre>
        </article>

        <article className="panel">
          <h3>Sample AI -&gt; avatar mapping</h3>
          <p className="panel-hint">
            Feed any LLM-produced <code>sentiment</code> / <code>tone</code> /{" "}
            <code>isSpeaking</code> into <code>mapConversationToAvatarState()</code>.
          </p>
          <div className="side-by-side">
            <div>
              <h4>Input</h4>
              <pre>{JSON.stringify(sampleAi, null, 2)}</pre>
            </div>
            <div>
              <h4>Mapped state</h4>
              <pre>{JSON.stringify(mapped, null, 2)}</pre>
            </div>
          </div>
        </article>
      </section>

      <footer className="footer">
        <small>
          Rendered with <code>&lt;svg&gt;</code> + React. No canvas frames, no
          sprite sheets, no image generation.
        </small>
      </footer>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="row">
      <span>
        {label} <em>{value.toFixed(step < 1 ? 2 : 0)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
