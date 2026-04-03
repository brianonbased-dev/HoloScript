/**
 * @holoscript/core VoiceInput Trait
 *
 * Enables voice-driven interactions for HoloScript+ objects
 * Integrates speech recognition with confidence-based command parsing
 */

export type VoiceInputMode = 'continuous' | 'push-to-talk' | 'always-listening';
export type ConfidenceThreshold = number; // 0.0 to 1.0

/**
 * Voice input configuration for HoloScript+ objects
 */
export interface VoiceInputConfig {
  /** Speech recognition mode */
  mode: VoiceInputMode;

  /** Minimum confidence level (0-1) to trigger command */
  confidenceThreshold: ConfidenceThreshold;

  /** Languages supported (BCP 47 codes) */
  languages?: string[];

  /** Commands this object responds to */
  commands?: VoiceCommand[];

  /** Enable speech-to-text display */
  showTranscript?: boolean;

  /** Audio feedback (beep on recognition) */
  audioFeedback?: boolean;

  /** Max command processing time (ms) */
  timeout?: number;
}

/**
 * Voice command definition
 */
export interface VoiceCommand {
  /** Primary trigger phrase */
  phrase: string;

  /** Alternative phrases (fuzzy matching) */
  aliases?: string[];

  /** Confidence threshold for this specific command */
  confidence?: number;

  /** Action to execute */
  action: string;

  /** Parameters extracted from command */
  params?: Record<string, string>;
}

/**
 * Voice recognition result
 */
export interface VoiceRecognitionResult {
  /** Transcribed text */
  transcript: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Is final result or interim? */
  isFinal: boolean;

  /** Language detected */
  language: string;

  /** Matched command if any */
  matchedCommand?: VoiceCommand;

  /** Timestamp */
  timestamp: number;
}

/**
 * Voice input event
 */
export interface VoiceInputEvent {
  type: 'start' | 'interim' | 'final' | 'error' | 'timeout';
  result: VoiceRecognitionResult;
  hologramId: string;
}

/**
 * VoiceInputTrait - Enables speech recognition on HoloScript+ objects
 */
export class VoiceInputTrait {
  private config: VoiceInputConfig;
  private recognition: any = null;
  private isListening: boolean = false;
  private listeners: Set<(event: VoiceInputEvent) => void> = new Set();
  private interimTranscript: string = '';
  private commandCache: Map<string, VoiceCommand> = new Map();

  constructor(config: VoiceInputConfig) {
    this.config = {
      showTranscript: false,
      audioFeedback: true,
      timeout: 10000,
      ...config,
    };

    this.initializeRecognition();
    this.buildCommandCache();
  }

  /**
   * Initialize Web Speech API
   */
  private initializeRecognition(): void {
    // Use native Web Speech API or polyfill
    const SpeechRecognition =
      (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('Web Speech API not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.setupRecognitionHandlers();
  }

  /**
   * Setup Web Speech API event handlers
   */
  private setupRecognitionHandlers(): void {
    if (!this.recognition) return;

    this.recognition.continuous = this.config.mode === 'continuous';
    this.recognition.interimResults = true;
    this.recognition.lang = this.config.languages?.[0] || 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.interimTranscript = '';
      if (this.config.audioFeedback) {
        this.playBeep('start');
      }
    };

    this.recognition.onresult = (event: TraitEvent) => {
      this.interimTranscript = '';

      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      for (let i = event.resultIndex; i < event.results.length; i++) {
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        const transcript = event.results[i][0].transcript;
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        const confidence = event.results[i][0].confidence;
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        const isFinal = event.results[i].isFinal;

        if (isFinal) {
          this.processVoiceCommand(transcript, confidence);
        } else {
          this.interimTranscript += transcript;
        }
      }

      if (this.config.showTranscript) {
        this.emitEvent({
          type: 'interim',
          result: {
            transcript: this.interimTranscript,
            confidence: 0,
            isFinal: false,
            language: this.recognition.lang,
            timestamp: Date.now(),
          },
          hologramId: '',
        });
      }
    };

    this.recognition.onerror = (_event: TraitEvent) => {
      this.emitEvent({
        type: 'error',
        result: {
          transcript: '',
          confidence: 0,
          isFinal: false,
          language: this.recognition.lang,
          timestamp: Date.now(),
        },
        hologramId: '',
      });
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.config.audioFeedback) {
        this.playBeep('end');
      }
    };
  }

  /**
   * Process voice command with fuzzy matching
   */
  private processVoiceCommand(transcript: string, confidence: number): void {
    if (confidence < this.config.confidenceThreshold) {
      return;
    }

    const normalized = transcript.toLowerCase().trim();
    let bestMatch: VoiceCommand | null = null;
    let bestScore: number = 0;

    // Try to find matching command
    for (const command of this.config.commands || []) {
      const cmdConfidence = command.confidence || this.config.confidenceThreshold;

      // Exact match
      if (normalized === command.phrase.toLowerCase()) {
        if (confidence >= cmdConfidence) {
          bestMatch = command;
          bestScore = 1.0;
          break;
        }
      }

      // Fuzzy match with aliases
      const allPhrases = [command.phrase, ...(command.aliases || [])];
      for (const phrase of allPhrases) {
        const score = this.fuzzyMatch(normalized, phrase.toLowerCase());
        if (score > bestScore && score >= 0.7) {
          bestScore = score;
          bestMatch = command;
        }
      }
    }

    // Emit recognition result
    this.emitEvent({
      type: 'final',
      result: {
        transcript: normalized,
        confidence,
        isFinal: true,
        language: this.recognition.lang,
        matchedCommand: bestMatch || undefined,
        timestamp: Date.now(),
      },
      hologramId: '',
    });

    if (bestMatch) {
      if (this.config.audioFeedback) {
        this.playBeep('success');
      }
    }
  }

  /**
   * Fuzzy string matching (simple Levenshtein-like approach)
   */
  private fuzzyMatch(input: string, target: string): number {
    if (input === target) return 1.0;
    if (input.length === 0 || target.length === 0) return 0;

    // Check if input is substring of target
    if (target.includes(input)) {
      return Math.min(1.0, input.length / target.length);
    }

    // Simple edit distance estimation
    const distance = Math.abs(input.length - target.length);
    const maxLen = Math.max(input.length, target.length);
    return Math.max(0, 1.0 - distance / maxLen);
  }

  /**
   * Build command index for faster lookup
   */
  private buildCommandCache(): void {
    for (const command of this.config.commands || []) {
      this.commandCache.set(command.phrase.toLowerCase(), command);
      for (const alias of command.aliases || []) {
        this.commandCache.set(alias.toLowerCase(), command);
      }
    }
  }

  /**
   * Start listening for voice input
   */
  public startListening(): void {
    if (!this.recognition || this.isListening) return;

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
    }
  }

  /**
   * Stop listening for voice input
   */
  public stopListening(): void {
    if (!this.recognition || !this.isListening) return;

    try {
      this.recognition.stop();
    } catch (error) {
      console.error('Failed to stop speech recognition:', error);
    }
  }

  /**
   * Toggle listening state
   */
  public toggleListening(): void {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  /**
   * Add command listener
   */
  public on(listener: (event: VoiceInputEvent) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove command listener
   */
  public off(listener: (event: VoiceInputEvent) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Emit voice event to all listeners
   */
  private emitEvent(event: VoiceInputEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Play audio feedback beep
   */
  private playBeep(type: 'start' | 'end' | 'success'): void {
    // AudioContext beep generation
    try {
      const audioContext = new (globalThis as any).AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      const now = audioContext.currentTime;
      const duration = 0.1;

      // Vary beep frequency by type
      oscillator.frequency.value = type === 'start' ? 800 : type === 'success' ? 1000 : 600;
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch (_error) {
      // Silently fail if audio not available
    }
  }

  /**
   * Get current listening state
   */
  public isActive(): boolean {
    return this.isListening;
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    if (this.recognition) {
      this.recognition.abort();
    }
    this.listeners.clear();
    this.commandCache.clear();
  }
}

/**
 * HoloScript+ @voice_input trait factory
 */
export function createVoiceInputTrait(config: VoiceInputConfig): VoiceInputTrait {
  return new VoiceInputTrait(config);
}

// ── Handler (delegates to VoiceInputTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export const voiceInputHandler = {
  name: 'voice_input',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: any, ctx: TraitContext): void {
    const instance = new VoiceInputTrait(config);
    node.__voice_input_instance = instance;
    ctx.emit('voice_input_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: any, ctx: TraitContext): void {
    const instance = node.__voice_input_instance as any;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('voice_input_detached', { node });
    delete node.__voice_input_instance;
  },
  onEvent(node: HSPlusNode, _config: any, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__voice_input_instance as any;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'voice_input_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('voice_input_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: any, ctx: TraitContext, dt: number): void {
    const instance = node.__voice_input_instance as any;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
