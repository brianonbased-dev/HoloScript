/**
 * @holoscript/core Lip Sync Trait
 *
 * Real-time lip synchronization for 3D avatars.
 * Supports multiple analysis methods: FFT audio analysis,
 * TTS-provided viseme timestamps, and external viseme data streams.
 *
 * @example
 * ```hsplus
 * object "AIAvatar" {
 *   @lip_sync {
 *     method: "fft",
 *     blendShapeSet: "arkit",
 *     smoothing: 0.15,
 *     sensitivity: 1.0
 *   }
 * }
 * ```
 *
 * @example
 * ```hsplus
 * object "NPC" {
 *   @lip_sync {
 *     method: "timestamps",
 *     blendShapeSet: "oculus",
 *     visemeMap: {
 *       sil: "viseme_sil",
 *       aa: "viseme_aa",
 *       E: "viseme_E",
 *       I: "viseme_I",
 *       O: "viseme_O",
 *       U: "viseme_U"
 *     }
 *   }
 * }
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Lip sync analysis method
 */
export type LipSyncMethod = 'fft' | 'timestamps' | 'external' | 'audio2face' | 'phoneme';

/**
 * Standard blend shape sets
 */
export type BlendShapeSet = 'arkit' | 'oculus' | 'custom';

/**
 * Viseme identifier (Oculus standard)
 */
export type OculusViseme =
  | 'sil'
  | 'PP'
  | 'FF'
  | 'TH'
  | 'DD'
  | 'kk'
  | 'CH'
  | 'SS'
  | 'nn'
  | 'RR'
  | 'aa'
  | 'E'
  | 'I'
  | 'O'
  | 'U';

/**
 * Viseme identifier (ARKit standard)
 */
export type ARKitViseme =
  | 'jawOpen'
  | 'jawForward'
  | 'jawLeft'
  | 'jawRight'
  | 'mouthClose'
  | 'mouthFunnel'
  | 'mouthPucker'
  | 'mouthLeft'
  | 'mouthRight'
  | 'mouthSmileLeft'
  | 'mouthSmileRight'
  | 'mouthFrownLeft'
  | 'mouthFrownRight'
  | 'mouthDimpleLeft'
  | 'mouthDimpleRight'
  | 'mouthStretchLeft'
  | 'mouthStretchRight'
  | 'mouthRollLower'
  | 'mouthRollUpper'
  | 'mouthShrugLower'
  | 'mouthShrugUpper'
  | 'mouthPressLeft'
  | 'mouthPressRight'
  | 'mouthLowerDownLeft'
  | 'mouthLowerDownRight'
  | 'mouthUpperUpLeft'
  | 'mouthUpperUpRight';

/**
 * Viseme data point with timing
 */
export interface VisemeTimestamp {
  /** Time in seconds from audio start */
  time: number;

  /** Viseme identifier */
  viseme: string;

  /** Intensity (0-1) */
  weight?: number;

  /** Duration of this viseme */
  duration?: number;
}

/**
 * Phoneme timestamp with duration
 */
export interface PhonemeTimestamp {
  /** Phoneme identifier (IPA or ARPAbet) */
  phoneme: string;

  /** Start time in seconds from audio start */
  time: number;

  /** Duration in seconds */
  duration: number;

  /** Intensity (0-1) */
  weight?: number;
}

/**
 * FFT frequency band configuration
 */
export interface FrequencyBand {
  /** Band name */
  name: string;

  /** Low frequency (Hz) */
  low: number;

  /** High frequency (Hz) */
  high: number;

  /** Target viseme/morph target */
  target: string;

  /** Sensitivity multiplier */
  sensitivity?: number;
}

/**
 * Active lip sync session
 */
export interface LipSyncSession {
  /** Session ID */
  id: string;

  /** Audio source reference */
  audioSource?: unknown;

  /** Viseme timestamp data (for timestamp method) */
  visemeData?: VisemeTimestamp[];

  /** Phoneme timestamp data (for phoneme method) */
  phonemeData?: PhonemeTimestamp[];

  /** Current playback time */
  currentTime: number;

  /** Is actively syncing */
  active: boolean;

  /** Start timestamp */
  startedAt: number;
}

/**
 * Lip sync event types
 */
export type LipSyncEventType =
  | 'session-start'
  | 'session-end'
  | 'viseme-change'
  | 'silence-detected'
  | 'speech-detected'
  | 'error';

/**
 * Lip sync event
 */
export interface LipSyncEvent {
  /** Event type */
  type: LipSyncEventType;

  /** Current viseme */
  viseme?: string;

  /** Viseme weight */
  weight?: number;

  /** Session ID */
  sessionId?: string;

  /** Error details */
  error?: Error;

  /** Timestamp */
  timestamp: number;
}

/**
 * Current viseme state for a single morph target
 */
interface VisemeState {
  current: number;
  target: number;
}

/**
 * Lip sync configuration
 */
export interface LipSyncConfig {
  /** Analysis method */
  method?: LipSyncMethod;

  /** Blend shape standard to use */
  blendShapeSet?: BlendShapeSet;

  /** Custom viseme-to-morph-target mapping */
  visemeMap?: Record<string, string>;

  /** Smoothing factor (0-1, higher = smoother, more latency) */
  smoothing?: number;

  /** Sensitivity multiplier for FFT method */
  sensitivity?: number;

  /** Minimum amplitude threshold to register as speech */
  silenceThreshold?: number;

  /** FFT size for audio analysis (power of 2) */
  fftSize?: number;

  /** Custom frequency bands for FFT method */
  frequencyBands?: FrequencyBand[];

  /** Max morph target weight (0-1) */
  maxWeight?: number;

  /** Automatically reset to silence after N ms of no updates */
  autoResetMs?: number;

  /** Enable co-articulation (blend between consecutive visemes) */
  coArticulation?: boolean;

  /** Co-articulation lookahead time (seconds) */
  coArticulationLookahead?: number;
}

/**
 * Lip sync event callback
 */
type LipSyncEventCallback = (event: LipSyncEvent) => void;

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default FFT frequency bands mapping speech frequencies to visemes
 */
export const DEFAULT_FREQUENCY_BANDS: FrequencyBand[] = [
  { name: 'low_vowel', low: 85, high: 150, target: 'viseme_O', sensitivity: 1.2 },
  { name: 'mid_vowel', low: 150, high: 200, target: 'viseme_aa', sensitivity: 1.0 },
  { name: 'high_vowel', low: 200, high: 255, target: 'viseme_E', sensitivity: 1.1 },
  { name: 'sibilant', low: 4000, high: 8000, target: 'viseme_SS', sensitivity: 0.8 },
  { name: 'fricative', low: 2000, high: 4000, target: 'viseme_FF', sensitivity: 0.7 },
];

/**
 * Oculus viseme set → standard morph target names
 */
export const OCULUS_VISEME_MAP: Record<string, string> = {
  sil: 'viseme_sil',
  PP: 'viseme_PP',
  FF: 'viseme_FF',
  TH: 'viseme_TH',
  DD: 'viseme_DD',
  kk: 'viseme_kk',
  CH: 'viseme_CH',
  SS: 'viseme_SS',
  nn: 'viseme_nn',
  RR: 'viseme_RR',
  aa: 'viseme_aa',
  E: 'viseme_E',
  I: 'viseme_I',
  O: 'viseme_O',
  U: 'viseme_U',
};

/**
 * ARKit mouth-related blend shapes for lip sync
 */
export const ARKIT_MOUTH_SHAPES: Record<string, Record<string, number>> = {
  sil: { jawOpen: 0, mouthClose: 1 },
  aa: { jawOpen: 0.7, mouthFunnel: 0.3 },
  E: { jawOpen: 0.3, mouthStretchLeft: 0.5, mouthStretchRight: 0.5 },
  I: { jawOpen: 0.15, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 },
  O: { jawOpen: 0.5, mouthFunnel: 0.6, mouthPucker: 0.3 },
  U: { jawOpen: 0.2, mouthFunnel: 0.5, mouthPucker: 0.6 },
  PP: { mouthClose: 0.8, mouthPressLeft: 0.6, mouthPressRight: 0.6 },
  FF: { mouthClose: 0.3, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3 },
  TH: { jawOpen: 0.15, mouthClose: 0.2 },
  DD: { jawOpen: 0.25, mouthClose: 0.1 },
  kk: { jawOpen: 0.2, mouthClose: 0.3 },
  CH: { jawOpen: 0.2, mouthFunnel: 0.2, mouthPucker: 0.2 },
  SS: { jawOpen: 0.1, mouthStretchLeft: 0.3, mouthStretchRight: 0.3 },
  nn: { jawOpen: 0.15, mouthClose: 0.4 },
  RR: { jawOpen: 0.25, mouthFunnel: 0.15 },
};

// =============================================================================
// LIP SYNC TRAIT
// =============================================================================

/**
 * LipSyncTrait — Manages real-time lip synchronization
 *
 * Bridges audio output to facial morph targets through multiple methods:
 * - FFT: Zero-dependency frequency analysis of audio stream
 * - Timestamps: Consumes viseme timing data from TTS providers (Azure, Google, ElevenLabs)
 * - External: Accepts viseme data from external sources (NVIDIA Audio2Face, custom ML)
 * - Audio2Face: Direct integration with NVIDIA Audio2Face SDK output
 */
export class LipSyncTrait {
  private config: LipSyncConfig;
  private visemeStates: Map<string, VisemeState> = new Map();
  private currentViseme: string = 'sil';
  private currentWeight: number = 0;
  private activeSession: LipSyncSession | null = null;
  private eventListeners: Map<LipSyncEventType, Set<LipSyncEventCallback>> = new Map();
  private lastUpdateTime: number = 0;
  private autoResetTimer: ReturnType<typeof setTimeout> | null = null;
  private isSpeaking: boolean = false;
  private sessionCounter: number = 0;

  // Phoneme tracking state
  private currentPhonemeIndex: number = -1;

  // FFT analysis state
  private analyserNode: AnalyserNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private audioContext: AudioContext | null = null;

  constructor(config: LipSyncConfig = {}) {
    this.config = {
      method: 'fft',
      blendShapeSet: 'oculus',
      smoothing: 0.15,
      sensitivity: 1.0,
      silenceThreshold: 0.05,
      fftSize: 256,
      maxWeight: 0.85,
      autoResetMs: 300,
      coArticulation: true,
      coArticulationLookahead: 0.05,
      ...config,
    };

    // Initialize viseme map based on blend shape set
    if (!config.visemeMap) {
      if (this.config.blendShapeSet === 'oculus') {
        this.config.visemeMap = { ...OCULUS_VISEME_MAP };
      }
    }

    // Initialize frequency bands
    if (!config.frequencyBands) {
      this.config.frequencyBands = [...DEFAULT_FREQUENCY_BANDS];
    }
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): LipSyncConfig {
    return { ...this.config };
  }

  /**
   * Get current viseme
   */
  public getCurrentViseme(): string {
    return this.currentViseme;
  }

  /**
   * Get current viseme weight
   */
  public getCurrentWeight(): number {
    return this.currentWeight;
  }

  /**
   * Check if currently speaking
   */
  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Get all current morph target weights (for applying to mesh)
   */
  public getMorphWeights(): Record<string, number> {
    const weights: Record<string, number> = {};
    for (const [name, state] of this.visemeStates) {
      weights[name] = state.current;
    }
    return weights;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Start a lip sync session
   */
  public startSession(options?: {
    audioSource?: unknown;
    visemeData?: VisemeTimestamp[];
    phonemeData?: PhonemeTimestamp[];
  }): string {
    const id = `lipsync_${++this.sessionCounter}`;

    this.activeSession = {
      id,
      audioSource: options?.audioSource,
      visemeData: options?.visemeData,
      phonemeData: options?.phonemeData,
      currentTime: 0,
      active: true,
      startedAt: Date.now(),
    };

    this.isSpeaking = true;

    this.emit({
      type: 'session-start',
      sessionId: id,
      timestamp: Date.now(),
    });

    return id;
  }

  /**
   * End the current lip sync session
   */
  public endSession(): void {
    if (!this.activeSession) return;

    const sessionId = this.activeSession.id;
    this.activeSession.active = false;
    this.activeSession = null;
    this.isSpeaking = false;
    this.currentPhonemeIndex = -1;

    // Reset to silence
    this.transitionToSilence();

    this.emit({
      type: 'session-end',
      sessionId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get active session
   */
  public getActiveSession(): LipSyncSession | null {
    return this.activeSession;
  }

  // ============================================================================
  // FFT Audio Analysis
  // ============================================================================

  /**
   * Initialize FFT analysis from an AudioContext source
   * (Runtime implementation in @hololand/audio provides the actual AudioContext)
   */
  public initFFT(audioContext: AudioContext, sourceNode: AudioNode): void {
    this.audioContext = audioContext;
    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = this.config.fftSize ?? 256;
    this.analyserNode.smoothingTimeConstant = 0.3;
    this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);

    sourceNode.connect(this.analyserNode);
  }

  /**
   * Analyze current FFT data and return viseme weights
   * Call this each frame during FFT-based lip sync
   */
  public analyzeFFT(): Record<string, number> {
    if (!this.analyserNode || !this.frequencyData || !this.audioContext) {
      return {};
    }

    (this.analyserNode as any).getByteFrequencyData(this.frequencyData);

    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.analyserNode.frequencyBinCount;
    const binSize = sampleRate / (binCount * 2);
    const bands = this.config.frequencyBands ?? DEFAULT_FREQUENCY_BANDS;
    const sensitivity = this.config.sensitivity ?? 1.0;
    const weights: Record<string, number> = {};

    // Calculate average energy to detect speech
    let totalEnergy = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      totalEnergy += this.frequencyData[i];
    }
    const averageEnergy = totalEnergy / this.frequencyData.length / 255;

    if (averageEnergy < (this.config.silenceThreshold ?? 0.05)) {
      // Silence detected
      if (this.isSpeaking) {
        this.isSpeaking = false;
        this.emit({ type: 'silence-detected', timestamp: Date.now() });
      }
      return {};
    }

    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.emit({ type: 'speech-detected', timestamp: Date.now() });
    }

    // Analyze each frequency band
    for (const band of bands) {
      const lowBin = Math.floor(band.low / binSize);
      const highBin = Math.min(Math.ceil(band.high / binSize), binCount - 1);

      let bandEnergy = 0;
      let count = 0;

      for (let i = lowBin; i <= highBin; i++) {
        bandEnergy += this.frequencyData[i];
        count++;
      }

      if (count > 0) {
        const normalizedEnergy =
          (bandEnergy / count / 255) * sensitivity * (band.sensitivity ?? 1.0);
        const clampedWeight = Math.min(normalizedEnergy, this.config.maxWeight ?? 0.85);
        weights[band.target] = clampedWeight;
      }
    }

    return weights;
  }

  /**
   * Dispose FFT resources
   */
  public disposeFFT(): void {
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    this.frequencyData = null;
    this.audioContext = null;
  }

  // ============================================================================
  // Timestamp-Based Lip Sync
  // ============================================================================

  /**
   * Set viseme timestamp data (from TTS provider)
   */
  public setVisemeTimestamps(data: VisemeTimestamp[]): void {
    if (this.activeSession) {
      this.activeSession.visemeData = data;
    }
  }

  /**
   * Sample viseme at a given time from timestamp data
   */
  public sampleVisemeAtTime(
    time: number,
    data?: VisemeTimestamp[]
  ): {
    viseme: string;
    weight: number;
    nextViseme?: string;
  } {
    const visemeData = data ?? this.activeSession?.visemeData;
    if (!visemeData || visemeData.length === 0) {
      return { viseme: 'sil', weight: 0 };
    }

    // Find the current viseme
    let current: VisemeTimestamp | null = null;
    let next: VisemeTimestamp | null = null;

    for (let i = 0; i < visemeData.length; i++) {
      if (visemeData[i].time <= time) {
        current = visemeData[i];
        if (i + 1 < visemeData.length) {
          next = visemeData[i + 1];
        }
      } else {
        if (!next) next = visemeData[i];
        break;
      }
    }

    if (!current) {
      return { viseme: 'sil', weight: 0 };
    }

    let weight = current.weight ?? 1.0;

    // Co-articulation: blend toward next viseme near the transition
    if (this.config.coArticulation && next) {
      const transitionTime = next.time - (this.config.coArticulationLookahead ?? 0.05);
      if (time >= transitionTime) {
        const blendFactor = (time - transitionTime) / (next.time - transitionTime);
        weight *= 1 - blendFactor;
      }
    }

    return {
      viseme: current.viseme,
      weight: Math.min(weight, this.config.maxWeight ?? 0.85),
      nextViseme: next?.viseme,
    };
  }

  // ============================================================================
  // Phoneme-Based Lip Sync
  // ============================================================================

  /**
   * Set phoneme data (from SpeechRecognizer)
   */
  public setPhonemeData(data: PhonemeTimestamp[]): void {
    if (this.activeSession) {
      this.activeSession.phonemeData = data;
      this.currentPhonemeIndex = -1;
    }
  }

  /**
   * Sample phoneme at a given time and map it to a viseme
   */
  public samplePhonemeAtTime(
    time: number,
    data?: PhonemeTimestamp[]
  ): {
    viseme: string;
    weight: number;
  } {
    const phonemeData = data ?? this.activeSession?.phonemeData;
    if (!phonemeData || phonemeData.length === 0) {
      return { viseme: 'sil', weight: 0 };
    }

    // Binary search for the current phoneme
    let low = 0;
    let high = phonemeData.length - 1;
    let foundIndex = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const p = phonemeData[mid];

      if (time >= p.time && time < p.time + p.duration) {
        foundIndex = mid;
        break;
      } else if (time < p.time) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    if (foundIndex === -1) {
      return { viseme: 'sil', weight: 0 };
    }

    const current = phonemeData[foundIndex];
    this.currentPhonemeIndex = foundIndex;

    // Map phoneme to Oculus-compatible viseme using IPA/ARPAbet mapping
    const viseme = this.mapPhonemeToViseme(current.phoneme);

    // Smooth blending within the phoneme duration
    let weight = Math.min(current.weight ?? 1.0, this.config.maxWeight ?? 0.85);
    const progress = (time - current.time) / current.duration;

    // Fade in/out slightly at boundaries (co-articulation)
    if (progress < 0.1) {
      weight *= progress / 0.1;
    } else if (progress > 0.9) {
      weight *= (1.0 - progress) / 0.1;
    }

    return {
      viseme,
      weight,
    };
  }

  /**
   * Map IPA/ARPAbet phoneme to Oculus viseme
   */
  private mapPhonemeToViseme(phoneme: string): string {
    const p = phoneme.toLowerCase().replace(/[0-9]/g, ''); // Remove stress markers

    // Core vowels (ARPAbet & IPA)
    if (['aa', 'ah', 'ax', 'ɑ', 'ʌ', 'ə'].includes(p)) return 'aa';
    if (['ae', 'eh', 'ey', 'æ', 'ɛ', 'eɪ'].includes(p)) return 'E';
    if (['ih', 'iy', 'ɪ', 'i'].includes(p)) return 'I';
    if (['ao', 'ow', 'oy', 'ɔ', 'oʊ', 'ɔɪ'].includes(p)) return 'O';
    if (['uh', 'uw', 'ʊ', 'u'].includes(p)) return 'U';
    if (['aw', 'aʊ'].includes(p)) return 'aa'; // Dipthong start
    if (['ay', 'aɪ'].includes(p)) return 'aa'; // Dipthong start

    // Consonants (ARPAbet & IPA)
    if (['p', 'b', 'm', 'p', 'b', 'm'].includes(p)) return 'PP';
    if (['f', 'v', 'f', 'v'].includes(p)) return 'FF';
    if (['th', 'dh', 'θ', 'ð'].includes(p)) return 'TH';
    if (['t', 'd', 'n', 't', 'd', 'n'].includes(p)) return 'DD';
    if (['k', 'g', 'ng', 'h', 'hh', 'k', 'ɡ', 'ŋ', 'h'].includes(p)) return 'kk';
    if (['ch', 'jh', 'sh', 'zh', 'tʃ', 'dʒ', 'ʃ', 'ʒ'].includes(p)) return 'CH';
    if (['s', 'z', 's', 'z'].includes(p)) return 'SS';
    if (['r', 'er', 'ɹ', 'ɚ', 'ɝ'].includes(p)) return 'RR';
    if (['l', 'el', 'l', 'ɫ'].includes(p)) return 'nn';
    if (['w', 'w'].includes(p)) return 'U'; // "w" is close to "U" viseme
    if (['y', 'j'].includes(p)) return 'I'; // "y"/"j" is close to "I" viseme

    return 'sil';
  }

  // ============================================================================
  // External Viseme Input
  // ============================================================================

  /**
   * Set viseme directly from external source (NVIDIA Audio2Face, ML model, etc.)
   */
  public setViseme(viseme: string, weight: number = 1.0): void {
    const prevViseme = this.currentViseme;
    this.currentViseme = viseme;
    this.currentWeight = Math.min(weight, this.config.maxWeight ?? 0.85);

    this.lastUpdateTime = Date.now();
    this.resetAutoResetTimer();

    if (prevViseme !== viseme) {
      this.emit({
        type: 'viseme-change',
        viseme,
        weight: this.currentWeight,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Set multiple blend shape weights directly (for Audio2Face 72-blendshape output)
   */
  public setBlendShapeWeights(weights: Record<string, number>): void {
    const maxWeight = this.config.maxWeight ?? 0.85;

    for (const [name, weight] of Object.entries(weights)) {
      const state = this.visemeStates.get(name);
      if (state) {
        state.target = Math.min(weight, maxWeight);
      } else {
        this.visemeStates.set(name, {
          current: 0,
          target: Math.min(weight, maxWeight),
        });
      }
    }

    this.lastUpdateTime = Date.now();
    this.resetAutoResetTimer();
  }

  // ============================================================================
  // Frame Update
  // ============================================================================

  /**
   * Update lip sync state (call each frame)
   * Returns the morph target weights to apply to the mesh
   */
  public update(deltaTime: number): Record<string, number> {
    const smoothing = this.config.smoothing ?? 0.15;
    const lerpFactor = 1 - Math.pow(smoothing, deltaTime * 60);
    const result: Record<string, number> = {};

    // Update session time first (Phase 16 fix)
    if (this.activeSession?.active) {
      this.activeSession.currentTime += deltaTime;
    }

    if (this.config.method === 'fft' && this.activeSession?.active) {
      // FFT method: analyze audio and set targets
      const fftWeights = this.analyzeFFT();
      for (const [target, weight] of Object.entries(fftWeights)) {
        const state = this.visemeStates.get(target);
        if (state) {
          state.target = weight;
        } else {
          this.visemeStates.set(target, { current: 0, target: weight });
        }
      }

      // Reset targets not in current analysis
      for (const [name, state] of this.visemeStates) {
        if (!(name in fftWeights)) {
          state.target = 0;
        }
      }
    } else if (this.config.method === 'timestamps' && this.activeSession?.active) {
      // Timestamp method: sample viseme at current time
      const sample = this.sampleVisemeAtTime(this.activeSession.currentTime);
      this.applyVisemeToTargets(sample.viseme, sample.weight);
    } else if (this.config.method === 'phoneme' && this.activeSession?.active) {
      // Phoneme method (Phase 16): Sample phoneme and map to viseme
      const sample = this.samplePhonemeAtTime(this.activeSession.currentTime);
      this.applyVisemeToTargets(sample.viseme, sample.weight);
    }

    // Smooth interpolation for all morph targets
    for (const [name, state] of this.visemeStates) {
      state.current = state.current + (state.target - state.current) * lerpFactor;

      // Snap to zero when very close
      if (state.current < 0.001) {
        state.current = 0;
      }

      if (state.current > 0) {
        result[name] = state.current;
      }
    }

    return result;
  }

  // ============================================================================
  // Viseme → Morph Target Mapping
  // ============================================================================

  /**
   * Apply a viseme to the appropriate morph targets
   */
  private applyVisemeToTargets(viseme: string, weight: number): void {
    const maxWeight = this.config.maxWeight ?? 0.85;

    if (this.config.blendShapeSet === 'arkit') {
      // ARKit: Map viseme to multiple facial blend shapes
      const shapeWeights = ARKIT_MOUTH_SHAPES[viseme];
      if (shapeWeights) {
        // Reset all mouth targets
        for (const key of Object.keys(ARKIT_MOUTH_SHAPES.sil)) {
          const state = this.visemeStates.get(key);
          if (state) state.target = 0;
        }

        // Apply new weights
        for (const [shape, shapeWeight] of Object.entries(shapeWeights)) {
          const state = this.visemeStates.get(shape);
          const targetWeight = Math.min(shapeWeight * weight, maxWeight);
          if (state) {
            state.target = targetWeight;
          } else {
            this.visemeStates.set(shape, { current: 0, target: targetWeight });
          }
        }
      }
    } else {
      // Oculus/Custom: Map viseme to single morph target
      const visemeMap = this.config.visemeMap ?? OCULUS_VISEME_MAP;
      const targetName = visemeMap[viseme] ?? viseme;

      // Reset all viseme targets
      for (const [name, state] of this.visemeStates) {
        if (name.startsWith('viseme_')) {
          state.target = 0;
        }
      }

      // Set the active viseme target
      const state = this.visemeStates.get(targetName);
      if (state) {
        state.target = Math.min(weight, maxWeight);
      } else {
        this.visemeStates.set(targetName, {
          current: 0,
          target: Math.min(weight, maxWeight),
        });
      }
    }
  }

  /**
   * Transition to silence state
   */
  private transitionToSilence(): void {
    for (const state of this.visemeStates.values()) {
      state.target = 0;
    }
    this.currentViseme = 'sil';
    this.currentWeight = 0;
  }

  // ============================================================================
  // Auto-Reset Timer
  // ============================================================================

  /**
   * Reset the auto-reset timer
   */
  private resetAutoResetTimer(): void {
    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
    }

    if (this.config.autoResetMs) {
      this.autoResetTimer = setTimeout(() => {
        this.transitionToSilence();
        this.emit({
          type: 'silence-detected',
          timestamp: Date.now(),
        });
      }, this.config.autoResetMs);
    }
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event listener
   */
  public on(event: LipSyncEventType, callback: LipSyncEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  public off(event: LipSyncEventType, callback: LipSyncEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: LipSyncEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('LipSync event listener error:', e);
        }
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose all resources
   */
  public dispose(): void {
    this.endSession();
    this.disposeFFT();
    this.eventListeners.clear();
    this.visemeStates.clear();

    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
      this.autoResetTimer = null;
    }
  }
}

/**
 * Create a lip sync trait
 */
export function createLipSyncTrait(config?: LipSyncConfig): LipSyncTrait {
  return new LipSyncTrait(config);
}

// ── Handler (delegates to LipSyncTrait) ──
import type { TraitHandler } from './TraitTypes';

export const lipSyncHandler = {
  name: 'lip_sync',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new LipSyncTrait(config);
    node.__lip_sync_instance = instance;
    ctx.emit('lip_sync_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__lip_sync_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('lip_sync_detached', { node });
    delete node.__lip_sync_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__lip_sync_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'lip_sync_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('lip_sync_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__lip_sync_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
