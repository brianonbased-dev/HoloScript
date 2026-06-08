/**
 * useBrittneyVoiceActions — N4 voice front-door for the proposed-action list.
 *
 * Two responsibilities:
 *  1. TTS read-out: Brittney speaks the top 3-4 proposed actions when triggered.
 *     "Here are your next three: 1. Fix the parser. 2. Add the inbox tile.
 *      3. Update the schema. — say the number or name to approve."
 *  2. ASR selection: listens after the read-out, maps the spoken utterance to a
 *     proposed action (by ordinal "one"/"1" or title prefix match), and calls
 *     the same `onApprove` callback as the tap path.
 *
 * Design constraints:
 *  - Reuses the same one-tap approve path (N3) — no new API. onApprove(action)
 *    fires; callers don't need to know whether it came from a tap or voice.
 *  - Safety gate is UNCHANGED: irreversible actions still require explicit review
 *    even when selected by voice (the same 403 path from POST /next-actions).
 *  - Browser Web Speech APIs only (SpeechSynthesis + SpeechRecognition). Falls
 *    back gracefully when either API is absent.
 *  - DOM lib is "dom" + "dom.iterable" so SpeechRecognition is a first-class
 *    global. Vendor-prefix webkit fallback uses `unknown` intermediate.
 *  - `isSpeaking` + `isListening` exposed so the UI can suppress tap affordances
 *    during voice flow (avoid double-approve races).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProposedAction } from '../app/api/quest-proof/next-actions/nextActions';
import { logger } from '@/lib/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseBrittneyVoiceActionsOptions {
  /** Called when the founder's spoken selection maps to a proposed action. */
  onApprove: (action: ProposedAction) => void;
}

export interface UseBrittneyVoiceActionsReturn {
  /** Whether TTS is currently speaking the action list. */
  isSpeaking: boolean;
  /** Whether ASR is actively listening for the founder's selection. */
  isListening: boolean;
  /** True if both SpeechSynthesis and SpeechRecognition are available. */
  isSupported: boolean;
  /**
   * Trigger the full voice flow: speak the list, then listen for a selection.
   * No-op when unsupported or already in a voice flow.
   */
  speakAndListen: (actions: ProposedAction[]) => void;
  /** Cancel any in-progress speech or ASR. */
  cancel: () => void;
  /** The last final ASR transcript — useful for debug display. */
  lastTranscript: string;
}

// ── Ordinal word → 1-based index ──────────────────────────────────────────────

const ORDINALS: Readonly<Record<string, number>> = {
  one: 1, first: 1, '1': 1,
  two: 2, second: 2, '2': 2,
  three: 3, third: 3, '3': 3,
  four: 4, fourth: 4, '4': 4,
};

/**
 * Match a transcript to one of the proposed actions.
 * Priority: ordinal match > label prefix / inclusion match (case-insensitive, ≥4 chars).
 * Returns the matching action or null.
 *
 * Exported for unit testing — the match logic must be testable without a DOM.
 */
export function matchTranscript(
  transcript: string,
  actions: ProposedAction[]
): ProposedAction | null {
  const t = transcript.trim().toLowerCase();
  if (!t || actions.length === 0) return null;

  // Ordinal match: "one", "1", "two", "2", etc.
  for (const [word, idx] of Object.entries(ORDINALS)) {
    const re = new RegExp(`^${word}\\b`);
    if (re.test(t)) {
      return actions[idx - 1] ?? null;
    }
  }

  // Label prefix / inclusion match (≥4 chars to avoid single-word false-positives)
  const MIN_CHARS = 4;
  if (t.length >= MIN_CHARS) {
    const prefix = t.slice(0, MIN_CHARS);
    for (const action of actions) {
      const label = action.label.toLowerCase();
      if (
        label.startsWith(prefix) ||
        label.includes(t) ||
        t.includes(label.slice(0, Math.min(label.length, 12)))
      ) {
        return action;
      }
    }
  }

  return null;
}

/**
 * Build the TTS script Brittney reads.
 * "Here are your next {count}: 1. {label}. 2. {label}. — say the number or name to approve."
 *
 * Exported for unit testing.
 */
export function buildVoiceScript(actions: ProposedAction[]): string {
  if (actions.length === 0) return 'No proposed actions right now.';
  const countWords = ['one', 'two', 'three', 'four'];
  const countWord = countWords[actions.length - 1] ?? String(actions.length);
  const items = actions.map((a, i) => `${i + 1}. ${a.label}`).join('. ');
  return `Here ${actions.length === 1 ? 'is' : 'are'} your next ${countWord}: ${items}. Say the number or name to approve.`;
}

// ── Vendor-prefix SpeechRecognition resolution ───────────────────────────────

/**
 * The window shape that may carry a webkit-prefixed SpeechRecognition
 * constructor (Chrome < 33, older Safari). Declared so we avoid casts to
 * imprecise types.
 */
interface WindowWithWebkitSpeech {
  webkitSpeechRecognition?: typeof SpeechRecognition;
}

function getSpeechRecognitionConstructor(): typeof SpeechRecognition | undefined {
  if (typeof window === 'undefined') return undefined;
  // Standard global — declared by lib.dom in tsconfig
  if (typeof SpeechRecognition !== 'undefined') return SpeechRecognition;
  // Webkit vendor prefix fallback
  return (window as unknown as WindowWithWebkitSpeech).webkitSpeechRecognition;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBrittneyVoiceActions({
  onApprove,
}: UseBrittneyVoiceActionsOptions): UseBrittneyVoiceActionsReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');

  useEffect(() => {
    const hasSpeech =
      typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
    const hasRecognition = !!getSpeechRecognitionConstructor();
    setIsSupported(hasSpeech && hasRecognition);
  }, []);

  // Mutable refs so callbacks don't close over stale values
  const actionsRef = useRef<ProposedAction[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  /** Start ASR, match transcript, fire onApprove. Called after TTS ends. */
  const startListening = useCallback(
    (currentActions: ProposedAction[]) => {
      const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
      if (!SpeechRecognitionCtor) return;

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          }
        }
        if (!finalText) return;
        setLastTranscript(finalText);
        logger.info('[BrittneyVoiceActions] heard:', finalText);
        const matched = matchTranscript(finalText, currentActions);
        if (matched) {
          stopListening();
          onApprove(matched);
        }
        // No match — recognition ends naturally (continuous=false)
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        logger.warn('[BrittneyVoiceActions] ASR error:', event.error);
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    },
    [stopListening, onApprove]
  );

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsSpeaking(false);
    setIsListening(false);
  }, []);

  const speakAndListen = useCallback(
    (actions: ProposedAction[]) => {
      if (!isSupported || isSpeaking || isListening || actions.length === 0) return;

      actionsRef.current = actions;
      const script = buildVoiceScript(actions);

      window.speechSynthesis.cancel(); // clear any residual speech
      const utterance = new SpeechSynthesisUtterance(script);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      utterance.lang = 'en-US';

      // Prefer a natural-sounding en-US voice when available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.toLowerCase().includes('female') ||
            v.name.toLowerCase().includes('zira') ||
            v.name.toLowerCase().includes('samantha') ||
            v.name.toLowerCase().includes('karen'))
      );
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        // Brief delay so the microphone doesn't pick up the last TTS syllable
        window.setTimeout(() => startListening(actionsRef.current), 320);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        logger.warn('[BrittneyVoiceActions] TTS utterance error');
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, isSpeaking, isListening, startListening]
  );

  return { isSpeaking, isListening, isSupported, speakAndListen, cancel, lastTranscript };
}
