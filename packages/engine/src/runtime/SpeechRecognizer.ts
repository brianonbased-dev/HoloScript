/**
 * @holoscript/core Speech Recognizer Interface
 *
 * Defines the @builtin runtime interface for speech-to-text and phoneme recognition.
 * Runtimes (WASM/Node.js) implement this to bridge with whisper.cpp or other providers.
 */
import { PhonemeTimestamp } from '@holoscript/core';

/**
 * Speech recognition configuration
 */
export interface SpeechRecognizerConfig {
  /** Backend provider (e.g., 'whisper.cpp', 'web-speech') */
  backend: string;

  /** Model size/type (e.g., 'tiny', 'base', 'small') */
  model?: string;

  /** Enable phoneme-level timestamp output */
  outputPhonemes?: boolean;

  /** Recognition language (ISO code) */
  language?: string;

  /** Sampling rate (default 16000) */
  sampleRate?: number;
}

/**
 * Transcription result segment
 */
export interface TranscriptionSegment {
  text: string;
  start: number;
  end: number;
  phonemes?: PhonemeTimestamp[];
}

/**
 * SpeechRecognizer @builtin Interface
 */
export interface SpeechRecognizer {
  /** Initialize the recognizer with config */
  initialize(config: SpeechRecognizerConfig): Promise<void>;

  /**
   * Transcribe an audio stream or buffer.
   * Returns segments with optional phoneme-level timestamps.
   */
  transcribe(
    audio: ArrayBuffer | Blob | unknown,
    options?: {
      phonemeMode?: boolean;
      timestamps?: boolean;
    }
  ): Promise<TranscriptionSegment[]>;

  /** Stop any active recognition */
  stop(): void;

  /** Dispose resources */
  dispose(): void;
}

/**
 * Global registry for builtin SpeechRecognizers
 */
export const speechRecognizerRegistry = new Map<string, SpeechRecognizer>();

/**
 * Register a speech recognizer implementation
 */
export function registerSpeechRecognizer(name: string, recognizer: SpeechRecognizer): void {
  speechRecognizerRegistry.set(name, recognizer);
}

/**
 * Get a registered speech recognizer
 */
export function getSpeechRecognizer(name: string): SpeechRecognizer | undefined {
  return speechRecognizerRegistry.get(name);
}

