/**
 * @holoscript/core Voice Synthesizer Interface
 *
 * Defines the @builtin runtime interface for neural text-to-speech.
 * Runtimes implement this to bridge with providers like ElevenLabs, Azure, or Coqui.
 */

/**
 * Voice synthesizer configuration
 */
export interface VoiceConfig {
  /** Backend provider (e.g., 'elevenlabs', 'azure', 'coqui') */
  backend: string;

  /** API Key or local model path */
  apiKey?: string;
  modelPath?: string;

  /** Default voice settings */
  defaultVoiceId?: string;
}

/**
 * Speech synthesis request
 */
export interface VoiceRequest {
  text: string;
  voiceId?: string;

  /** Emotion parameters (0-1 intensity) */
  emotion?: {
    type: 'angry' | 'sad' | 'excited' | 'friendly' | 'scared' | 'neutral';
    intensity: number;
  };

  /** Prosody settings */
  pitch?: number;
  rate?: number;
  volume?: number;
}

/**
 * Available voice information
 */
export interface VoiceInfo {
  id: string;
  name: string;
  gender?: 'male' | 'female' | 'non-binary';
  language: string;
  provider: string;
}

/**
 * VoiceSynthesizer @builtin Interface
 */
export interface VoiceSynthesizer {
  /** Initialize the synthesizer with config */
  initialize(config: VoiceConfig): Promise<void>;

  /**
   * Generate audio buffer from text.
   * Runtimes should handle the actual networking/synthesis.
   */
  generate(request: VoiceRequest): Promise<ArrayBuffer>;

  /** List available voices */
  getVoices(): Promise<VoiceInfo[]>;

  /** Dispose resources */
  dispose(): void;
}

/**
 * Global registry for builtin VoiceSynthesizers
 */
export const voiceSynthesizerRegistry = new Map<string, VoiceSynthesizer>();

/**
 * Register a voice synthesizer implementation
 */
export function registerVoiceSynthesizer(name: string, synthesizer: VoiceSynthesizer): void {
  voiceSynthesizerRegistry.set(name, synthesizer);
}

/**
 * Get a registered voice synthesizer
 */
export function getVoiceSynthesizer(name: string): VoiceSynthesizer | undefined {
  return voiceSynthesizerRegistry.get(name);
}
