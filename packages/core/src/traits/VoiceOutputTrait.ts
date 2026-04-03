/**
 * @holoscript/core Voice Output Trait
 *
 * Enables text-to-speech synthesis for NPCs, narration, and accessibility.
 *
 * @example
 * ```hsplus
 * object "Narrator" {
 *   @voice_output {
 *     voice: "en-US-Neural2-F",
 *     pitch: 1.0,
 *     rate: 1.0,
 *     volume: 0.8,
 *     ssml: true
 *   }
 * }
 * ```
 */

/**
 * Voice gender
 */
export type VoiceGender = 'male' | 'female' | 'neutral';

/**
 * Voice synthesis engine
 */
export type VoiceSynthEngine = 'browser' | 'azure' | 'google' | 'aws' | 'elevenlabs' | 'custom';

/**
 * Voice style for expressive speech
 */
export type VoiceStyle =
  | 'neutral'
  | 'cheerful'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'excited'
  | 'friendly'
  | 'hopeful'
  | 'shouting'
  | 'whispering'
  | 'terrified'
  | 'unfriendly';

/**
 * Audio format
 */
export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'webm';

/**
 * Voice definition
 */
export interface VoiceDefinition {
  /** Voice ID */
  id: string;

  /** Display name */
  name: string;

  /** Voice gender */
  gender?: VoiceGender;

  /** Language code (e.g., 'en-US') */
  language: string;

  /** Engine-specific voice name */
  engineVoice?: string;

  /** Base pitch (0.5 - 2.0) */
  pitch?: number;

  /** Base rate (0.5 - 2.0) */
  rate?: number;

  /** Synthesis engine */
  engine?: VoiceSynthEngine;

  /** Custom engine endpoint */
  endpoint?: string;
}

/**
 * Speech segment
 */
export interface SpeechSegment {
  /** Text to speak */
  text: string;

  /** Override voice */
  voice?: string;

  /** Override pitch */
  pitch?: number;

  /** Override rate */
  rate?: number;

  /** Pause before (ms) */
  pauseBefore?: number;

  /** Pause after (ms) */
  pauseAfter?: number;

  /** Emphasis level */
  emphasis?: 'strong' | 'moderate' | 'reduced' | 'none';

  /** Say-as type (for numbers, dates, etc) */
  sayAs?: 'cardinal' | 'ordinal' | 'characters' | 'date' | 'time' | 'telephone';
}

/**
 * Speech request
 */
export interface SpeechRequest {
  /** Request ID */
  id: string;

  /** Text or segments */
  content: string | SpeechSegment[];

  /** Voice to use */
  voice?: string;

  /** Speaking style */
  style?: VoiceStyle;

  /** Style intensity (0-2) */
  styleDegree?: number;

  /** Priority (higher = more urgent) */
  priority?: number;

  /** Callback when complete */
  onComplete?: () => void;

  /** Callback on error */
  onError?: (error: Error) => void;

  /** Custom data */
  data?: Record<string, unknown>;
}

/**
 * Queued speech item
 */
interface QueuedSpeech {
  request: SpeechRequest;
  addedAt: number;
}

/**
 * Voice output state
 */
export type VoiceOutputState = 'idle' | 'speaking' | 'paused' | 'loading';

/**
 * Voice output event types
 */
export type VoiceOutputEventType =
  | 'start'
  | 'end'
  | 'pause'
  | 'resume'
  | 'word'
  | 'sentence'
  | 'error'
  | 'queue-empty'
  | 'voice-changed';

/**
 * Voice output event
 */
export interface VoiceOutputEvent {
  /** Event type */
  type: VoiceOutputEventType;

  /** Speech request */
  request?: SpeechRequest;

  /** Current word (for word events) */
  word?: string;

  /** Word index */
  wordIndex?: number;

  /** Sentence index */
  sentenceIndex?: number;

  /** Error (for error events) */
  error?: Error;

  /** Timestamp */
  timestamp: number;
}

/**
 * Voice output configuration
 */
export interface VoiceOutputConfig {
  /** Synthesis engine */
  engine?: VoiceSynthEngine;

  /** Default voice */
  defaultVoice?: string;

  /** Default pitch (0.5 - 2.0) */
  pitch?: number;

  /** Default rate (0.5 - 2.0) */
  rate?: number;

  /** Default volume (0 - 1) */
  volume?: number;

  /** Enable SSML support */
  ssml?: boolean;

  /** Queue max size */
  maxQueueSize?: number;

  /** Interrupt current speech on new request */
  interrupt?: boolean;

  /** Custom voices */
  voices?: VoiceDefinition[];

  /** API key (for cloud services) */
  apiKey?: string;

  /** API region (for cloud services) */
  region?: string;

  /** Custom endpoint */
  endpoint?: string;

  /** Audio format */
  format?: AudioFormat;

  /** Cache synthesized audio */
  cacheAudio?: boolean;
}

/**
 * Voice output event callback
 */
type VoiceOutputEventCallback = (event: VoiceOutputEvent) => void;

/**
 * Voice Output Trait - Text-to-Speech
 */
export class VoiceOutputTrait {
  private config: VoiceOutputConfig;
  private state: VoiceOutputState = 'idle';
  private voices: Map<string, VoiceDefinition> = new Map();
  private currentVoice: string | null = null;
  private queue: QueuedSpeech[] = [];
  private currentRequest: SpeechRequest | null = null;
  private synth: SpeechSynthesis | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private eventListeners: Map<VoiceOutputEventType, Set<VoiceOutputEventCallback>> = new Map();
  private audioCache: Map<string, AudioBuffer> = new Map();
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private requestIdCounter = 0;

  constructor(config: VoiceOutputConfig = {}) {
    this.config = {
      engine: 'browser',
      pitch: 1.0,
      rate: 1.0,
      volume: 1.0,
      ssml: false,
      maxQueueSize: 50,
      interrupt: false,
      cacheAudio: true,
      format: 'mp3',
      ...config,
    };

    // Initialize voices
    if (config.voices) {
      for (const voice of config.voices) {
        this.voices.set(voice.id, voice);
      }
    }

    // Set default voice
    if (config.defaultVoice) {
      this.currentVoice = config.defaultVoice;
    }

    // Initialize browser synth
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
    }
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): VoiceOutputConfig {
    return { ...this.config };
  }

  /**
   * Get current state
   */
  public getState(): VoiceOutputState {
    return this.state;
  }

  /**
   * Check if speaking
   */
  public isSpeaking(): boolean {
    return this.state === 'speaking';
  }

  /**
   * Check if paused
   */
  public isPaused(): boolean {
    return this.state === 'paused';
  }

  // ============================================================================
  // Voice Management
  // ============================================================================

  /**
   * Add a voice definition
   */
  public addVoice(voice: VoiceDefinition): void {
    this.voices.set(voice.id, voice);
  }

  /**
   * Remove a voice definition
   */
  public removeVoice(voiceId: string): void {
    this.voices.delete(voiceId);
  }

  /**
   * Get a voice definition
   */
  public getVoice(voiceId: string): VoiceDefinition | undefined {
    return this.voices.get(voiceId);
  }

  /**
   * Get all voice IDs
   */
  public getVoiceIds(): string[] {
    return Array.from(this.voices.keys());
  }

  /**
   * Set current voice
   */
  public setVoice(voiceId: string): void {
    if (this.voices.has(voiceId)) {
      this.currentVoice = voiceId;
      this.emit({
        type: 'voice-changed',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get current voice
   */
  public getCurrentVoice(): string | null {
    return this.currentVoice;
  }

  /**
   * Get available browser voices
   */
  public getBrowserVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    return this.synth.getVoices();
  }

  // ============================================================================
  // Speech
  // ============================================================================

  /**
   * Speak text
   */
  public speak(text: string, options?: Partial<SpeechRequest>): string {
    const id = `speech_${++this.requestIdCounter}`;

    const request: SpeechRequest = {
      id,
      content: text,
      voice: options?.voice ?? this.currentVoice ?? undefined,
      style: options?.style,
      styleDegree: options?.styleDegree,
      priority: options?.priority ?? 0,
      onComplete: options?.onComplete,
      onError: options?.onError,
      data: options?.data,
    };

    return this.enqueue(request);
  }

  /**
   * Speak segments
   */
  public speakSegments(segments: SpeechSegment[], options?: Partial<SpeechRequest>): string {
    const id = `speech_${++this.requestIdCounter}`;

    const request: SpeechRequest = {
      id,
      content: segments,
      voice: options?.voice ?? this.currentVoice ?? undefined,
      priority: options?.priority ?? 0,
      onComplete: options?.onComplete,
      onError: options?.onError,
      data: options?.data,
    };

    return this.enqueue(request);
  }

  /**
   * Enqueue speech request
   */
  private enqueue(request: SpeechRequest): string {
    if (this.config.interrupt && this.state === 'speaking') {
      this.stop();
    }

    // Check queue size
    if (this.queue.length >= (this.config.maxQueueSize ?? 50)) {
      console.warn('Voice output queue full');
      return request.id;
    }

    // Insert based on priority
    const item: QueuedSpeech = {
      request,
      addedAt: Date.now(),
    };

    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if ((request.priority ?? 0) > (this.queue[i].request.priority ?? 0)) {
        this.queue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.queue.push(item);
    }

    // Start processing if idle
    if (this.state === 'idle') {
      this.processQueue();
    }

    return request.id;
  }

  /**
   * Process the speech queue
   */
  private processQueue(): void {
    if (this.queue.length === 0) {
      this.state = 'idle';
      this.currentRequest = null;
      this.emit({
        type: 'queue-empty',
        timestamp: Date.now(),
      });
      return;
    }

    const item = this.queue.shift()!;
    this.currentRequest = item.request;
    this.state = 'speaking';

    this.emit({
      type: 'start',
      request: item.request,
      timestamp: Date.now(),
    });

    this.synthesize(item.request);
  }

  /**
   * Synthesize speech
   */
  private synthesize(request: SpeechRequest): void {
    const text =
      typeof request.content === 'string' ? request.content : this.segmentsToText(request.content);

    if (this.config.engine === 'browser') {
      this.synthesizeBrowser(request, text);
    } else {
      // Cloud synthesis would go here
      this.synthesizeBrowser(request, text);
    }
  }

  /**
   * Synthesize using browser Speech Synthesis
   */
  private synthesizeBrowser(request: SpeechRequest, text: string): void {
    if (!this.synth) {
      const error = new Error('Speech synthesis not available');
      this.handleError(request, error);
      return;
    }

    this.utterance = new SpeechSynthesisUtterance(text);

    // Apply settings
    this.utterance.pitch = this.config.pitch ?? 1.0;
    this.utterance.rate = this.config.rate ?? 1.0;
    this.utterance.volume = this.config.volume ?? 1.0;

    // Apply voice
    if (request.voice) {
      const voiceDef = this.voices.get(request.voice);
      if (voiceDef?.engineVoice) {
        const voices = this.synth.getVoices();
        const voice = voices.find((v) => v.name === voiceDef.engineVoice);
        if (voice) {
          this.utterance.voice = voice;
        }
      }

      // Apply voice-specific settings
      if (voiceDef?.pitch) this.utterance.pitch = voiceDef.pitch;
      if (voiceDef?.rate) this.utterance.rate = voiceDef.rate;
    }

    // Event handlers
    let wordIndex = 0;
    let sentenceIndex = 0;

    this.utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.emit({
          type: 'word',
          request,
          word: text.substring(event.charIndex, event.charIndex + (event.charLength ?? 0)),
          wordIndex: wordIndex++,
          timestamp: Date.now(),
        });
      } else if (event.name === 'sentence') {
        this.emit({
          type: 'sentence',
          request,
          sentenceIndex: sentenceIndex++,
          timestamp: Date.now(),
        });
      }
    };

    this.utterance.onend = () => {
      this.emit({
        type: 'end',
        request,
        timestamp: Date.now(),
      });

      request.onComplete?.();
      this.processQueue();
    };

    this.utterance.onerror = (event) => {
      const error = new Error(event.error || 'Speech synthesis error');
      this.handleError(request, error);
    };

    this.synth.speak(this.utterance);
  }

  /**
   * Convert segments to text
   */
  private segmentsToText(segments: SpeechSegment[]): string {
    if (this.config.ssml) {
      return this.segmentsToSSML(segments);
    }

    let text = '';
    for (const segment of segments) {
      if (segment.pauseBefore) {
        // Can't do pauses without SSML in plain text
      }
      text += segment.text;
      if (segment.pauseAfter) {
        text += ' ';
      }
    }
    return text;
  }

  /**
   * Convert segments to SSML
   */
  private segmentsToSSML(segments: SpeechSegment[]): string {
    let ssml = '<speak>\n';

    for (const segment of segments) {
      if (segment.pauseBefore) {
        ssml += `<break time="${segment.pauseBefore}ms"/>\n`;
      }

      let text = segment.text;

      if (segment.emphasis) {
        text = `<emphasis level="${segment.emphasis}">${text}</emphasis>`;
      }

      if (segment.sayAs) {
        text = `<say-as interpret-as="${segment.sayAs}">${text}</say-as>`;
      }

      if (segment.pitch || segment.rate) {
        const pitch = segment.pitch ? `pitch="${(segment.pitch - 1) * 100}%"` : '';
        const rate = segment.rate ? `rate="${segment.rate * 100}%"` : '';
        text = `<prosody ${pitch} ${rate}>${text}</prosody>`;
      }

      ssml += text + '\n';

      if (segment.pauseAfter) {
        ssml += `<break time="${segment.pauseAfter}ms"/>\n`;
      }
    }

    ssml += '</speak>';
    return ssml;
  }

  /**
   * Handle synthesis error
   */
  private handleError(request: SpeechRequest, error: Error): void {
    this.emit({
      type: 'error',
      request,
      error,
      timestamp: Date.now(),
    });

    request.onError?.(error);
    this.processQueue();
  }

  // ============================================================================
  // Control
  // ============================================================================

  /**
   * Pause speech
   */
  public pause(): void {
    if (this.state !== 'speaking' && this.state !== 'idle') return;

    if (this.synth) {
      this.synth.pause();
    }

    if (this.currentSource) {
      // Web Audio API doesn't support pause, would need to track position
    }

    this.state = 'paused';
    this.emit({
      type: 'pause',
      request: this.currentRequest ?? undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Resume speech
   */
  public resume(): void {
    if (this.state !== 'paused') return;

    if (this.synth) {
      this.synth.resume();
    }

    this.state = 'speaking';
    this.emit({
      type: 'resume',
      request: this.currentRequest ?? undefined,
      timestamp: Date.now(),
    });
  }

  /**
   * Stop current speech
   */
  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.utterance = null;
    this.currentRequest = null;
    this.state = 'idle';
  }

  /**
   * Stop and clear queue
   */
  public stopAll(): void {
    this.stop();
    this.queue = [];
  }

  /**
   * Skip current speech
   */
  public skip(): void {
    this.stop();
    this.processQueue();
  }

  // ============================================================================
  // Queue Management
  // ============================================================================

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear queue (doesn't stop current)
   */
  public clearQueue(): void {
    this.queue = [];
  }

  /**
   * Remove specific request from queue
   */
  public removeFromQueue(requestId: string): boolean {
    const index = this.queue.findIndex((item) => item.request.id === requestId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  // ============================================================================
  // Settings
  // ============================================================================

  /**
   * Set volume
   */
  public setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Get volume
   */
  public getVolume(): number {
    return this.config.volume ?? 1.0;
  }

  /**
   * Set pitch
   */
  public setPitch(pitch: number): void {
    this.config.pitch = Math.max(0.5, Math.min(2, pitch));
  }

  /**
   * Get pitch
   */
  public getPitch(): number {
    return this.config.pitch ?? 1.0;
  }

  /**
   * Set rate
   */
  public setRate(rate: number): void {
    this.config.rate = Math.max(0.5, Math.min(2, rate));
  }

  /**
   * Get rate
   */
  public getRate(): number {
    return this.config.rate ?? 1.0;
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event listener
   */
  public on(event: VoiceOutputEventType, callback: VoiceOutputEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  public off(event: VoiceOutputEventType, callback: VoiceOutputEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: VoiceOutputEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('Voice output event listener error:', e);
        }
      }
    }
  }

  // ============================================================================
  // Cache
  // ============================================================================

  /**
   * Clear audio cache
   */
  public clearCache(): void {
    this.audioCache.clear();
  }

  /**
   * Get cache size
   */
  public getCacheSize(): number {
    return this.audioCache.size;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.stopAll();
    this.clearCache();
    this.eventListeners.clear();
    this.voices.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Create a voice output trait
 */
export function createVoiceOutputTrait(config?: VoiceOutputConfig): VoiceOutputTrait {
  return new VoiceOutputTrait(config);
}

// ── Handler (delegates to VoiceOutputTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const voiceOutputHandler = {
  name: 'voice_output',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: any, ctx: TraitContext): void {
    const instance = new VoiceOutputTrait(config);
    node.__voice_output_instance = instance;
    ctx.emit('voice_output_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: any, ctx: TraitContext): void {
    const instance = node.__voice_output_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('voice_output_detached', { node });
    delete node.__voice_output_instance;
  },
  onEvent(node: HSPlusNode, _config: any, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__voice_output_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'voice_output_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('voice_output_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: any, ctx: TraitContext, dt: number): void {
    const instance = node.__voice_output_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
