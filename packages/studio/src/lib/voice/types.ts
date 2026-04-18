/**
 * Voice-to-HoloScript types.
 *
 * See research/quest3-iphone-moment/b-voice-intent-grammar.md for the grammar
 * specification and LLM prompt.
 */

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'validating'
  | 'ready'
  | 'error';

export interface VoiceTurn {
  /** User's spoken utterance, as transcribed. */
  utterance: string;
  /** Emitted HoloScript source (post-validation). */
  holoSource: string;
  /** Time from utterance end to ready state, ms. */
  latencyMs: number;
  /** Whether we needed the retry-on-parse-failure path. */
  retried: boolean;
}

export interface VoiceError {
  kind:
    | 'no-speech-api'
    | 'permission-denied'
    | 'no-transcript'
    | 'llm-request-failed'
    | 'parse-failed-after-retry'
    | 'unknown-trait'
    | 'unknown-color'
    | 'empty-composition';
  message: string;
  details?: unknown;
}

/** Request body for POST /api/voice-to-holo */
export interface VoiceToHoloRequest {
  /** Current user utterance. */
  utterance: string;
  /** Previous composition source, for edit-mode. Omit on first turn. */
  previousComposition?: string;
  /** Optional override for model id (defaults to Haiku 4.5). */
  model?: string;
}

/** Response body from POST /api/voice-to-holo */
export interface VoiceToHoloResponse {
  /** Valid, parsed HoloScript source. */
  holoSource: string;
  /** Latency of the model call, ms. */
  modelLatencyMs: number;
  /** Whether we fell back to the parse-retry path. */
  retried: boolean;
}

export interface VoiceToHoloError {
  error: VoiceError;
}
