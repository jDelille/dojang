'use client';

import { useEffect, useRef, useState } from 'react';

/* The Web Speech API isn't in TypeScript's DOM lib; this is the slice we use. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Hold to talk: press starts the browser's speech recognition, release stops
 * it and hands the transcript to `onDone`. Speech goes through the same Ask
 * path as typed text — voice has no separate authority.
 */
export function useHoldToTalk(lang: string, onTranscript: (text: string) => void, onDone: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const transcript = useRef('');
  const callbacks = useRef({ onTranscript, onDone });
  callbacks.current = { onTranscript, onDone };

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  const start = () => {
    if (listening) return;
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = true;
    transcript.current = '';
    r.onresult = (event) => {
      transcript.current = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      callbacks.current.onTranscript(transcript.current);
    };
    r.onend = () => {
      setListening(false);
      recognition.current = null;
      if (transcript.current) callbacks.current.onDone(transcript.current);
    };
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  };

  const stop = () => recognition.current?.stop();

  return { supported, listening, start, stop };
}
