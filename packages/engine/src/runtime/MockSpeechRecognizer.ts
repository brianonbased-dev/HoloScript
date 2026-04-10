/**
 * @holoscript/core Mock Speech Recognizer
 *
 * Implements the SpeechRecognizer interface for testing and simulation.
 * Returns dummy transcription segments with phoneme-level timestamps.
 */

import { SpeechRecognizer, SpeechRecognizerConfig, TranscriptionSegment } from './SpeechRecognizer';
import { PhonemeTimestamp } from '@holoscript/core';

export class MockSpeechRecognizer implements SpeechRecognizer {
  private config?: SpeechRecognizerConfig;

  constructor() {}

  async initialize(config: SpeechRecognizerConfig): Promise<void> {
    this.config = config;
  }

  async transcribe(
    audio: ArrayBuffer | Blob | unknown,
    options?: {
      phonemeMode?: boolean;
      timestamps?: boolean;
    }
  ): Promise<TranscriptionSegment[]> {
    // Mock transcription in progress

    // Simulate a 2-second sentence: "Hello HoloLand"
    const segments: TranscriptionSegment[] = [
      {
        text: 'Hello',
        start: 0,
        end: 0.8,
        phonemes: options?.phonemeMode ? this.generatePhonemes('hello', 0) : undefined,
      },
      {
        text: 'HoloLand',
        start: 1.0,
        end: 2.0,
        phonemes: options?.phonemeMode ? this.generatePhonemes('hololand', 1.0) : undefined,
      },
    ];

    // Artificial delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return segments;
  }

  stop(): void {
    // Mock recognizer stopped
  }

  dispose(): void {
    // Mock recognizer disposed
  }

  /**
   * Generates dummy phonemes for a word
   */
  private generatePhonemes(word: string, startTime: number): PhonemeTimestamp[] {
    const phonemes: Record<string, string[]> = {
      hello: ['hh', 'eh', 'l', 'ow'],
      hololand: ['hh', 'ow', 'l', 'ow', 'l', 'ae', 'n', 'd'],
    };

    const sequence = phonemes[word.toLowerCase()] || ['aa'];
    const durationPerPhoneme = 0.15;

    return sequence.map((p, i) => ({
      phoneme: p,
      time: startTime + i * durationPerPhoneme,
      duration: durationPerPhoneme,
      weight: 1.0,
    }));
  }
}
