import { useEffect, useRef, useState } from "react";
import {
  CombinedAvatar,
  classifyMessage,
  useSpeechSynthesis,
  type AvatarEmotion,
  type AvatarState,
} from "./avatar";
import "./App.css";

type LogEntry = {
  id: number;
  text: string;
  emotion: AvatarEmotion;
  intensity: number;
  signals: string[];
  at: number;
};

// Size of the avatar on the page. Fixed for the chat-style layout.
const AVATAR_SIZE = 340;

export default function App() {
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<AvatarEmotion>("neutral");
  const [currentIntensity, setCurrentIntensity] = useState(1);
  const [muted, setMuted] = useState(false);

  const { speaking, supported, speak, cancel } = useSpeechSynthesis();
  const logIdRef = useRef(0);

  // Ease the expression back to neutral a moment after speech ends so the
  // avatar doesn't stay locked in the last emotion forever.
  useEffect(() => {
    if (speaking) return;
    if (currentEmotion === "neutral") return;
    const t = window.setTimeout(() => setCurrentEmotion("neutral"), 900);
    return () => window.clearTimeout(t);
  }, [speaking, currentEmotion]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = message.trim();
    if (!text) return;

    const classification = classifyMessage(text);
    setCurrentEmotion(classification.emotion);
    setCurrentIntensity(classification.intensity);

    setLog((prev) => [
      ...prev,
      {
        id: ++logIdRef.current,
        text,
        emotion: classification.emotion,
        intensity: classification.intensity,
        signals: classification.signals,
        at: Date.now(),
      },
    ]);

    setMessage("");

    if (!muted) {
      // Fire-and-forget speech. The hook updates `speaking` so the
      // avatar's mouth animates in sync with real TTS start/stop.
      speak(text);
    } else {
      // In muted mode we still want the mouth to animate so the user can
      // test expression + mouth cycle. Drive a short synthetic window
      // proportional to the message length.
      simulateSpeak(text);
    }
  };

  // Muted "fake speaking" window: toggles the speakingOverride state for
  // a duration based on message length so the mouth still animates and
  // the expression eases back to neutral after.
  const [speakingOverride, setSpeakingOverride] = useState(false);
  const simulateRef = useRef<number | null>(null);
  const simulateSpeak = (text: string) => {
    if (simulateRef.current) window.clearTimeout(simulateRef.current);
    setSpeakingOverride(true);
    const ms = Math.min(7000, Math.max(900, text.length * 60));
    simulateRef.current = window.setTimeout(() => {
      setSpeakingOverride(false);
      simulateRef.current = null;
    }, ms);
  };
  useEffect(() => () => {
    if (simulateRef.current) window.clearTimeout(simulateRef.current);
  }, []);

  // Effective state fed into the avatar. Real TTS state wins; otherwise
  // use the simulated window (for muted mode).
  const avatarState: AvatarState = {
    emotion: currentEmotion,
    speaking: speaking || speakingOverride,
    intensity: currentIntensity,
    size: AVATAR_SIZE,
  };

  return (
    <div className="page">
      <header className="header">
        <h1>Talking Head</h1>
        <p className="tagline">Type a message — the avatar will repeat it with an expression that matches.</p>
      </header>

      <main className="stage-wrap">
        <div className="stage" style={{ width: AVATAR_SIZE + 48, height: AVATAR_SIZE + 48 }}>
          <CombinedAvatar {...avatarState} />
        </div>

        <section className="chat" aria-label="Message the avatar">
          <form className="composer" onSubmit={handleSubmit}>
            <input
              type="text"
              className="composer-input"
              placeholder={
                supported
                  ? "Say something for me to repeat…"
                  : "Say something (your browser doesn't support speech — avatar still animates)"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) handleSubmit();
              }}
              autoFocus
              aria-label="Message"
            />
            <button className="composer-submit" type="submit" disabled={!message.trim()}>
              {speaking ? "Stop" : "Send"}
            </button>
          </form>

          <div className="chat-toolbar">
            <label className="toggle">
              <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
              <span>Mute (animate only)</span>
            </label>
            {speaking && (
              <button className="stop-button" type="button" onClick={cancel}>
                Stop speaking
              </button>
            )}
          </div>

          <div className="log" aria-live="polite">
            {log.length === 0 ? (
              <p className="log-empty">Try: <em>"Hi there!"</em>, <em>"Really? I doubt that."</em>, or <em>"Hmm… let me think."</em></p>
            ) : (
              <ul>
                {log.slice().reverse().map((entry) => (
                  <li key={entry.id} className={`log-entry log-${entry.emotion}`}>
                    <span className={`log-badge log-badge-${entry.emotion}`}>{entry.emotion}</span>
                    <span className="log-text">{entry.text}</span>
                    {entry.signals.length > 0 && (
                      <span className="log-signals">{entry.signals.join(" · ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <small>
          Classifier + Web Speech API → animated SVG. No external services.
        </small>
      </footer>
    </div>
  );
}
