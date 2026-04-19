import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin wrapper around the Web Speech API (`speechSynthesis`) that exposes
 * the speaking state as a React value and a `speak()` imperative.
 *
 * Works in all modern browsers (Chrome/Edge/Safari/Firefox). Gracefully
 * degrades to a no-op if `speechSynthesis` is unavailable.
 */

export type SpeechSynthesisOptions = {
  /** Preferred voice, matched by name substring. First match wins. */
  voiceName?: string;
  /** Preferred voice language tag, e.g. "en-US". */
  lang?: string;
  /** 0.1..10. Default 1. */
  rate?: number;
  /** 0..2. Default 1. */
  pitch?: number;
  /** 0..1. Default 1. */
  volume?: number;
};

export type UseSpeechSynthesisResult = {
  /** True while the browser is actively speaking. Wire into `speaking` prop. */
  speaking: boolean;
  /** True if the browser supports speechSynthesis at all. */
  supported: boolean;
  /** All voices the browser exposes (some browsers populate async). */
  voices: SpeechSynthesisVoice[];
  /** Start speaking a message; interrupts any in-flight utterance. */
  speak: (text: string, opts?: SpeechSynthesisOptions) => void;
  /** Cancel any in-flight utterance. */
  cancel: () => void;
};

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Populate voices — some browsers load them asynchronously and emit
  // `voiceschanged` once available.
  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, [supported]);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    utteranceRef.current = null;
  }, [supported]);

  const speak = useCallback(
    (text: string, opts: SpeechSynthesisOptions = {}) => {
      if (!supported) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      // Interrupt any in-flight utterance so a new message takes over.
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(trimmed);
      u.rate = opts.rate ?? 1;
      u.pitch = opts.pitch ?? 1;
      u.volume = opts.volume ?? 1;
      if (opts.lang) u.lang = opts.lang;

      // Best-effort voice pick
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices.length > 0) {
        let picked: SpeechSynthesisVoice | undefined;
        if (opts.voiceName) {
          picked = allVoices.find((v) => v.name.toLowerCase().includes(opts.voiceName!.toLowerCase()));
        }
        if (!picked && opts.lang) {
          picked = allVoices.find((v) => v.lang === opts.lang) ?? allVoices.find((v) => v.lang.startsWith(opts.lang!.split("-")[0]));
        }
        if (picked) u.voice = picked;
      }

      u.onstart = () => setSpeaking(true);
      u.onend = () => {
        setSpeaking(false);
        utteranceRef.current = null;
      };
      u.onerror = () => {
        setSpeaking(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = u;
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  // Stop speaking if the component unmounts mid-utterance.
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { speaking, supported, voices, speak, cancel };
}
