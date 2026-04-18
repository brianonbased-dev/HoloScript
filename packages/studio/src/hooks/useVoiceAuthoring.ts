'use client';

/**
 * useVoiceAuthoring — browser hook for the voice -> HoloScript loop.
 *
 * Wraps the Web Speech API and calls POST /api/voice-to-holo. Exposes a tiny
 * state machine (idle → listening → transcribing → thinking → ready | error)
 * so the in-headset UI can render clear feedback at every step.
 *
 * SpeechRecognition is not in the TS lib DOM yet; we declare minimal types
 * inline. On Meta Browser the constructor may be under `webkitSpeechRecognition`.
 *
 * See:
 *  - research/quest3-iphone-moment/b-voice-intent-grammar.md
 *  - packages/studio/src/lib/voice/types.ts
 *  - packages/studio/src/app/api/voice-to-holo/route.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VoiceState,
  VoiceTurn,
  VoiceError,
  VoiceToHoloRequest,
  VoiceToHoloResponse,
  VoiceToHoloError,
} from '../lib/voice/types';

// ---- minimal SpeechRecognition types ---------------------------------------
interface SpeechRecognitionResultLike {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorLike {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
// ---------------------------------------------------------------------------

export interface UseVoiceAuthoringOptions {
  /** Called with the final composition source when a turn succeeds. */
  onTurn?: (turn: VoiceTurn) => void;
  /** Called on any error. Mirrors the state change to 'error'. */
  onError?: (err: VoiceError) => void;
  /** Language code for SpeechRecognition. Default: 'en-US'. */
  lang?: string;
  /** Model override (rare). Default uses MODEL_CONFIG.model. */
  model?: string;
}

export interface UseVoiceAuthoringReturn {
  state: VoiceState;
  transcript: string;
  holoSource: string | null;
  lastError: VoiceError | null;
  history: VoiceTurn[];
  supported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useVoiceAuthoring(
  options: UseVoiceAuthoringOptions = {}
): UseVoiceAuthoringReturn {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [holoSource, setHoloSource] = useState<string | null>(null);
  const [lastError, setLastError] = useState<VoiceError | null>(null);
  const [history, setHistory] = useState<VoiceTurn[]>([]);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Track whether we've received a transcript so onend can tell silent-end
  // from result-received-end without reading stale closure state.
  const gotResultRef = useRef(false);
  const supported = typeof window !== 'undefined' && getRecognitionCtor() !== null;

  const fail = useCallback(
    (err: VoiceError) => {
      setLastError(err);
      setState('error');
      options.onError?.(err);
    },
    [options]
  );

  const submitUtterance = useCallback(
    async (utterance: string) => {
      if (!utterance.trim()) {
        fail({ kind: 'no-transcript', message: 'Empty transcript' });
        return;
      }
      setState('thinking');
      const t0 = Date.now();

      const body: VoiceToHoloRequest = {
        utterance,
        previousComposition: holoSource ?? undefined,
        model: options.model,
      };

      try {
        const res = await fetch('/api/voice-to-holo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as VoiceToHoloResponse | VoiceToHoloError;

        if (!res.ok || 'error' in data) {
          fail(
            'error' in data
              ? data.error
              : { kind: 'llm-request-failed', message: `HTTP ${res.status}` }
          );
          return;
        }

        setState('validating');
        // Parser round-trip goes here when compiler-wasm is wired into the
        // client. For now the server-side validator is our gate (plan b).
        // TODO: import { HoloCompositionParser } from '@holoscript/compiler-wasm'
        //       and re-parse here so the client never renders invalid input.

        setHoloSource(data.holoSource);
        setState('ready');
        const turn: VoiceTurn = {
          utterance,
          holoSource: data.holoSource,
          latencyMs: Date.now() - t0,
          retried: data.retried,
        };
        setHistory((h) => [...h, turn]);
        options.onTurn?.(turn);
      } catch (err) {
        fail({
          kind: 'llm-request-failed',
          message: err instanceof Error ? err.message : 'Unknown network error',
        });
      }
    },
    [fail, holoSource, options]
  );

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      fail({ kind: 'no-speech-api', message: 'SpeechRecognition not available' });
      return;
    }
    if (state === 'listening' || state === 'transcribing' || state === 'thinking') return;

    setLastError(null);
    setTranscript('');
    setState('listening');
    gotResultRef.current = false;

    const rec = new Ctor();
    rec.lang = options.lang ?? 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const result = e.results[e.resultIndex];
      if (!result) return;
      gotResultRef.current = true;
      const text = result[0].transcript.trim();
      setTranscript(text);
      setState('transcribing');
      // Fire the LLM call; SpeechRecognition onend will also fire, that's fine.
      void submitUtterance(text);
    };
    rec.onerror = (e) => {
      fail({
        kind: e.error === 'not-allowed' ? 'permission-denied' : 'no-speech-api',
        message: e.message ?? e.error,
      });
    };
    rec.onend = () => {
      // If no result came in, user was silent; return to idle.
      // Use ref (not state) to avoid stale-closure read.
      if (!gotResultRef.current) setState('idle');
    };
    try {
      rec.start();
      recRef.current = rec;
    } catch (err) {
      fail({
        kind: 'no-speech-api',
        message: err instanceof Error ? err.message : 'Failed to start recognition',
      });
    }
  }, [fail, options.lang, state, submitUtterance]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* no-op */
    }
    recRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    setState('idle');
    setTranscript('');
    setHoloSource(null);
    setLastError(null);
    setHistory([]);
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return {
    state,
    transcript,
    holoSource,
    lastError,
    history,
    supported,
    start,
    stop,
    reset,
  };
}
