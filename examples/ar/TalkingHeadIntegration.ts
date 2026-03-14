/**
 * TalkingHeadIntegration.ts
 *
 * Integrates the TalkingHead API with the Brittney avatar for real-time lip-sync.
 * Handles phoneme mapping, blend shape drivers, audio synchronization,
 * emotion expression blending, and WebAudio analysis.
 *
 * The system analyzes audio input (TTS output or microphone) in real-time,
 * extracts phoneme data, maps it to blend shape weights, and drives the
 * avatar's facial morph targets for natural-looking speech animation.
 *
 * @module TalkingHeadIntegration
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

/**
 * Standard viseme set based on the Microsoft Viseme ID mapping.
 * Each viseme represents a mouth shape corresponding to one or more phonemes.
 */
export type VisemeId =
  | 'sil'   // Silence
  | 'PP'    // p, b, m
  | 'FF'    // f, v
  | 'TH'    // th (voiced/unvoiced)
  | 'DD'    // t, d, n, l
  | 'kk'    // k, g, ng
  | 'CH'    // tS, dZ, S, Z
  | 'SS'    // s, z
  | 'nn'    // n (alveolar)
  | 'RR'    // r
  | 'aa'    // a (open)
  | 'E'     // e (mid front)
  | 'I'     // i (close front)
  | 'O'     // o (mid back)
  | 'U';    // u (close back)

/**
 * IPA phoneme symbols mapped to visemes.
 */
export type Phoneme = string;

/**
 * Blend shape channels supported by the avatar mesh.
 * Based on Apple ARKit blend shape set with extensions.
 */
export type BlendShapeName =
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
  | 'mouthUpperUpRight'
  | 'browDownLeft'
  | 'browDownRight'
  | 'browInnerUp'
  | 'browOuterUpLeft'
  | 'browOuterUpRight'
  | 'cheekPuff'
  | 'cheekSquintLeft'
  | 'cheekSquintRight'
  | 'eyeBlinkLeft'
  | 'eyeBlinkRight'
  | 'eyeSquintLeft'
  | 'eyeSquintRight'
  | 'eyeWideLeft'
  | 'eyeWideRight'
  | 'noseSneerLeft'
  | 'noseSneerRight'
  | 'tongueOut';

export interface BlendShapeWeights {
  [key: string]: number;
}

export interface VisemeBlendShapeMap {
  [viseme: string]: BlendShapeWeights;
}

export interface PhonemeEvent {
  phoneme: Phoneme;
  viseme: VisemeId;
  startTime: number;
  duration: number;
  intensity: number;
}

export interface EmotionState {
  name: EmotionType;
  intensity: number;        // 0..1
  blendDuration: number;    // transition time in ms
}

export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'disgusted'
  | 'fearful'
  | 'contempt'
  | 'thinking'
  | 'excited';

export interface EmotionBlendShapeMap {
  [emotion: string]: BlendShapeWeights;
}

export interface TalkingHeadConfig {
  /** Audio sample rate */
  sampleRate?: number;
  /** FFT size for audio analysis */
  fftSize?: number;
  /** Smoothing factor for audio analysis */
  smoothingTimeConstant?: number;
  /** Viseme transition time in ms */
  visemeTransitionTime?: number;
  /** Enable automatic blink */
  autoBlink?: boolean;
  /** Blink interval range [min, max] in ms */
  blinkInterval?: [number, number];
  /** Blink duration in ms */
  blinkDuration?: number;
  /** Enable head micro-movements during speech */
  headMovement?: boolean;
  /** Head movement amplitude */
  headMovementAmplitude?: number;
  /** Enable breathing animation */
  breathing?: boolean;
  /** Breathing rate (breaths per minute) */
  breathingRate?: number;
  /** Enable idle eye movements (saccades) */
  idleEyeMovement?: boolean;
  /** Phoneme lookahead buffer size */
  lookaheadBufferSize?: number;
  /** Coarticulation strength (0..1) — how much adjacent phonemes influence each other */
  coarticulationStrength?: number;
}

export interface AudioAnalysisResult {
  /** RMS volume level (0..1) */
  volume: number;
  /** Dominant frequency in Hz */
  dominantFrequency: number;
  /** Frequency spectrum data */
  spectrum: Float32Array;
  /** Whether speech is detected */
  isSpeaking: boolean;
  /** Estimated phoneme from spectrum shape */
  estimatedViseme: VisemeId;
}

export interface LipSyncFrame {
  timestamp: number;
  blendShapes: BlendShapeWeights;
  emotionBlend: BlendShapeWeights;
  combinedWeights: BlendShapeWeights;
  isSpeaking: boolean;
  volume: number;
  currentViseme: VisemeId;
}

export interface TalkingHeadState {
  isInitialized: boolean;
  isPlaying: boolean;
  isSpeaking: boolean;
  currentEmotion: EmotionState;
  currentViseme: VisemeId;
  volume: number;
  phonemeQueueLength: number;
}

// =============================================================================
// Event Types
// =============================================================================

export type TalkingHeadEventType =
  | 'initialized'
  | 'phoneme-start'
  | 'phoneme-end'
  | 'speech-start'
  | 'speech-end'
  | 'emotion-changed'
  | 'blink'
  | 'frame-update'
  | 'error';

export interface TalkingHeadEvent {
  type: TalkingHeadEventType;
  timestamp: number;
  data?: unknown;
}

type EventHandler = (event: TalkingHeadEvent) => void;

// =============================================================================
// Constants
// =============================================================================

/**
 * Phoneme-to-Viseme mapping table.
 * Maps IPA phonemes to the appropriate viseme shape.
 */
const PHONEME_TO_VISEME: Record<string, VisemeId> = {
  // Silence
  '': 'sil',
  ' ': 'sil',

  // Bilabial stops/nasals
  'p': 'PP', 'b': 'PP', 'm': 'PP',

  // Labiodental fricatives
  'f': 'FF', 'v': 'FF',

  // Dental fricatives
  'θ': 'TH', 'ð': 'TH', 'th': 'TH',

  // Alveolar stops/laterals
  't': 'DD', 'd': 'DD', 'n': 'DD', 'l': 'DD',

  // Velar stops
  'k': 'kk', 'g': 'kk', 'ŋ': 'kk', 'ng': 'kk',

  // Post-alveolar affricates/fricatives
  'tʃ': 'CH', 'dʒ': 'CH', 'ʃ': 'CH', 'ʒ': 'CH',
  'ch': 'CH', 'sh': 'CH', 'zh': 'CH',

  // Alveolar fricatives
  's': 'SS', 'z': 'SS',

  // Retroflex approximant
  'r': 'RR', 'ɹ': 'RR',

  // Vowels - open
  'a': 'aa', 'ɑ': 'aa', 'æ': 'aa', 'ʌ': 'aa',

  // Vowels - mid front
  'e': 'E', 'ɛ': 'E', 'eɪ': 'E',

  // Vowels - close front
  'i': 'I', 'ɪ': 'I', 'iː': 'I',

  // Vowels - mid back
  'o': 'O', 'ɔ': 'O', 'oʊ': 'O',

  // Vowels - close back
  'u': 'U', 'ʊ': 'U', 'uː': 'U',

  // Glides
  'w': 'U', 'j': 'I', 'y': 'I',
  'h': 'sil',
};

/**
 * Default viseme-to-blend-shape mapping.
 * Each viseme defines a set of blend shape weights that produce the corresponding mouth shape.
 */
const DEFAULT_VISEME_BLEND_SHAPES: VisemeBlendShapeMap = {
  sil: { jawOpen: 0, mouthClose: 0.1 },
  PP:  { jawOpen: 0, mouthClose: 0, mouthPucker: 0.1, mouthPressLeft: 0.4, mouthPressRight: 0.4 },
  FF:  { jawOpen: 0.05, mouthRollLower: 0.3, mouthUpperUpLeft: 0.15, mouthUpperUpRight: 0.15 },
  TH:  { jawOpen: 0.1, tongueOut: 0.3, mouthLowerDownLeft: 0.1, mouthLowerDownRight: 0.1 },
  DD:  { jawOpen: 0.15, tongueOut: 0.05, mouthLowerDownLeft: 0.1, mouthLowerDownRight: 0.1 },
  kk:  { jawOpen: 0.2, mouthShrugLower: 0.1, mouthShrugUpper: 0.1 },
  CH:  { jawOpen: 0.1, mouthFunnel: 0.3, mouthPucker: 0.2 },
  SS:  { jawOpen: 0.05, mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
  nn:  { jawOpen: 0.1, mouthClose: 0, tongueOut: 0.02 },
  RR:  { jawOpen: 0.15, mouthFunnel: 0.15, mouthPucker: 0.1 },
  aa:  { jawOpen: 0.55, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3 },
  E:   { jawOpen: 0.3, mouthStretchLeft: 0.15, mouthStretchRight: 0.15 },
  I:   { jawOpen: 0.15, mouthStretchLeft: 0.3, mouthStretchRight: 0.3, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
  O:   { jawOpen: 0.4, mouthFunnel: 0.35, mouthPucker: 0.15 },
  U:   { jawOpen: 0.2, mouthFunnel: 0.25, mouthPucker: 0.4 },
};

/**
 * Default emotion-to-blend-shape mapping.
 */
const DEFAULT_EMOTION_BLEND_SHAPES: EmotionBlendShapeMap = {
  neutral:   {},
  happy:     { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.3, cheekSquintRight: 0.3, browInnerUp: 0.1 },
  sad:       { mouthFrownLeft: 0.5, mouthFrownRight: 0.5, browInnerUp: 0.4, browDownLeft: 0.2, browDownRight: 0.2 },
  angry:     { browDownLeft: 0.6, browDownRight: 0.6, jawForward: 0.2, noseSneerLeft: 0.3, noseSneerRight: 0.3, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  surprised: { eyeWideLeft: 0.7, eyeWideRight: 0.7, browOuterUpLeft: 0.5, browOuterUpRight: 0.5, browInnerUp: 0.6, jawOpen: 0.3 },
  disgusted: { noseSneerLeft: 0.5, noseSneerRight: 0.5, mouthUpperUpLeft: 0.3, mouthUpperUpRight: 0.3, browDownLeft: 0.3, browDownRight: 0.3 },
  fearful:   { eyeWideLeft: 0.5, eyeWideRight: 0.5, browInnerUp: 0.6, mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
  contempt:  { mouthSmileRight: 0.3, mouthPressLeft: 0.2, browDownLeft: 0.1 },
  thinking:  { browInnerUp: 0.2, browDownRight: 0.3, eyeSquintLeft: 0.2, mouthLeft: 0.15, mouthPucker: 0.1 },
  excited:   { mouthSmileLeft: 0.8, mouthSmileRight: 0.8, eyeWideLeft: 0.4, eyeWideRight: 0.4, browOuterUpLeft: 0.3, browOuterUpRight: 0.3, cheekSquintLeft: 0.4, cheekSquintRight: 0.4 },
};

/**
 * Audio frequency ranges used for rough viseme estimation from spectrum.
 */
const FREQUENCY_BANDS = {
  low: { min: 100, max: 400 },      // Vowels, nasals
  mid: { min: 400, max: 2000 },     // Most consonants
  high: { min: 2000, max: 8000 },   // Sibilants, fricatives
};

// =============================================================================
// Utility Functions
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// =============================================================================
// TalkingHeadIntegration
// =============================================================================

/**
 * TalkingHeadIntegration drives avatar lip-sync and facial animation.
 *
 * It combines:
 * - Phoneme-driven lip sync (from TTS phoneme data or audio analysis)
 * - Emotion expression blending
 * - Automatic blink, breathing, and micro-movements
 * - Coarticulation for natural phoneme transitions
 */
export class TalkingHeadIntegration {
  // Configuration
  private config: Required<TalkingHeadConfig>;

  // Blend shape maps (customizable)
  private visemeMap: VisemeBlendShapeMap;
  private emotionMap: EmotionBlendShapeMap;

  // Audio analysis
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Float32Array | null = null;
  private timeDomainData: Float32Array | null = null;
  private sourceNode: MediaStreamAudioSourceNode | AudioBufferSourceNode | MediaElementAudioSourceNode | null = null;

  // State
  private isInitialized: boolean = false;
  private isPlaying: boolean = false;
  private isSpeaking: boolean = false;

  // Viseme state
  private currentViseme: VisemeId = 'sil';
  private targetViseme: VisemeId = 'sil';
  private visemeBlendProgress: number = 1;
  private currentVisemeWeights: BlendShapeWeights = {};
  private targetVisemeWeights: BlendShapeWeights = {};

  // Phoneme queue (from TTS or manual input)
  private phonemeQueue: PhonemeEvent[] = [];
  private currentPhonemeIndex: number = 0;
  private speechStartTime: number = 0;

  // Emotion state
  private currentEmotion: EmotionState = { name: 'neutral', intensity: 0.5, blendDuration: 300 };
  private targetEmotion: EmotionState = { name: 'neutral', intensity: 0.5, blendDuration: 300 };
  private emotionBlendProgress: number = 1;
  private currentEmotionWeights: BlendShapeWeights = {};
  private targetEmotionWeights: BlendShapeWeights = {};

  // Blink state
  private nextBlinkTime: number = 0;
  private isBlinking: boolean = false;
  private blinkProgress: number = 0;
  private blinkStartTime: number = 0;

  // Breathing state
  private breathPhase: number = 0;

  // Head movement state
  private headRotationX: number = 0;
  private headRotationY: number = 0;
  private headRotationZ: number = 0;

  // Volume tracking
  private currentVolume: number = 0;
  private volumeSmoothing: number = 0.8;

  // Coarticulation
  private previousViseme: VisemeId = 'sil';

  // Events
  private eventHandlers: Map<TalkingHeadEventType, Set<EventHandler>> = new Map();

  // Blend shape output callback
  private blendShapeCallback: ((weights: BlendShapeWeights) => void) | null = null;

  constructor(config: TalkingHeadConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate ?? 44100,
      fftSize: config.fftSize ?? 2048,
      smoothingTimeConstant: config.smoothingTimeConstant ?? 0.8,
      visemeTransitionTime: config.visemeTransitionTime ?? 80,
      autoBlink: config.autoBlink ?? true,
      blinkInterval: config.blinkInterval ?? [2000, 6000],
      blinkDuration: config.blinkDuration ?? 150,
      headMovement: config.headMovement ?? true,
      headMovementAmplitude: config.headMovementAmplitude ?? 0.02,
      breathing: config.breathing ?? true,
      breathingRate: config.breathingRate ?? 15,
      idleEyeMovement: config.idleEyeMovement ?? true,
      lookaheadBufferSize: config.lookaheadBufferSize ?? 3,
      coarticulationStrength: config.coarticulationStrength ?? 0.3,
    };

    this.visemeMap = { ...DEFAULT_VISEME_BLEND_SHAPES };
    this.emotionMap = { ...DEFAULT_EMOTION_BLEND_SHAPES };
    this.scheduleNextBlink();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the audio analysis pipeline.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.fftSize;
      this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;

      const bufferLength = this.analyser.frequencyBinCount;
      this.frequencyData = new Float32Array(bufferLength);
      this.timeDomainData = new Float32Array(bufferLength);

      this.isInitialized = true;
      this.emitEvent('initialized', {});
    } catch (err) {
      this.emitEvent('error', { message: 'Failed to initialize AudioContext', error: err });
      throw err;
    }
  }

  /**
   * Connect an audio source for analysis.
   */
  connectAudioSource(source: HTMLAudioElement | HTMLVideoElement | MediaStream): void {
    if (!this.audioContext || !this.analyser) {
      console.warn('[TalkingHead] Not initialized. Call initialize() first.');
      return;
    }

    // Disconnect previous source
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (source instanceof MediaStream) {
      this.sourceNode = this.audioContext.createMediaStreamSource(source);
    } else {
      this.sourceNode = this.audioContext.createMediaElementSource(source);
    }

    this.sourceNode.connect(this.analyser);
    // Also connect to destination for playback
    this.analyser.connect(this.audioContext.destination);
  }

  /**
   * Disconnect audio source.
   */
  disconnectAudioSource(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
  }

  // ===========================================================================
  // Phoneme Queue API
  // ===========================================================================

  /**
   * Enqueue phoneme events from TTS or speech recognition output.
   *
   * @param phonemes Array of phoneme events with timing data
   */
  enqueuePhonemes(phonemes: PhonemeEvent[]): void {
    this.phonemeQueue.push(...phonemes);
  }

  /**
   * Start playing enqueued phonemes.
   */
  startSpeech(): void {
    if (this.phonemeQueue.length === 0) {
      console.warn('[TalkingHead] No phonemes in queue.');
      return;
    }

    this.isPlaying = true;
    this.isSpeaking = true;
    this.currentPhonemeIndex = 0;
    this.speechStartTime = performance.now();
    this.emitEvent('speech-start', { phonemeCount: this.phonemeQueue.length });
  }

  /**
   * Stop speech playback and clear the queue.
   */
  stopSpeech(): void {
    this.isPlaying = false;
    this.isSpeaking = false;
    this.phonemeQueue = [];
    this.currentPhonemeIndex = 0;
    this.targetViseme = 'sil';
    this.emitEvent('speech-end', {});
  }

  /**
   * Convert raw text + timing data to phoneme events.
   * This is a simplified phoneme estimator; real applications should use
   * the TTS engine's phoneme output.
   */
  textToPhonemeEstimate(text: string, totalDuration: number): PhonemeEvent[] {
    const chars = text.toLowerCase().replace(/[^a-z ]/g, '').split('');
    const phonemeDuration = totalDuration / Math.max(chars.length, 1);
    const events: PhonemeEvent[] = [];

    let currentTime = 0;
    for (const char of chars) {
      const viseme = PHONEME_TO_VISEME[char] ?? 'sil';
      events.push({
        phoneme: char,
        viseme,
        startTime: currentTime,
        duration: phonemeDuration,
        intensity: char === ' ' ? 0 : 0.8 + Math.random() * 0.2,
      });
      currentTime += phonemeDuration;
    }

    return events;
  }

  // ===========================================================================
  // Emotion Control
  // ===========================================================================

  /**
   * Set the target emotion for blending.
   */
  setEmotion(emotion: EmotionType, intensity: number = 0.5, blendDuration: number = 300): void {
    this.targetEmotion = { name: emotion, intensity: clamp(intensity, 0, 1), blendDuration };
    this.emotionBlendProgress = 0;
    this.targetEmotionWeights = this.getEmotionWeights(emotion, intensity);
    this.emitEvent('emotion-changed', { emotion, intensity });
  }

  /**
   * Get blend shape weights for an emotion at a given intensity.
   */
  private getEmotionWeights(emotion: EmotionType, intensity: number): BlendShapeWeights {
    const baseWeights = this.emotionMap[emotion] ?? {};
    const weights: BlendShapeWeights = {};
    for (const [key, value] of Object.entries(baseWeights)) {
      weights[key] = value * intensity;
    }
    return weights;
  }

  // ===========================================================================
  // Customization
  // ===========================================================================

  /**
   * Override the viseme-to-blend-shape mapping.
   */
  setVisemeMap(map: Partial<VisemeBlendShapeMap>): void {
    Object.assign(this.visemeMap, map);
  }

  /**
   * Override the emotion-to-blend-shape mapping.
   */
  setEmotionMap(map: Partial<EmotionBlendShapeMap>): void {
    Object.assign(this.emotionMap, map);
  }

  /**
   * Set the callback that receives final blended blend shape weights each frame.
   */
  setBlendShapeCallback(callback: (weights: BlendShapeWeights) => void): void {
    this.blendShapeCallback = callback;
  }

  // ===========================================================================
  // Audio Analysis
  // ===========================================================================

  /**
   * Analyze the current audio frame.
   */
  private analyzeAudio(): AudioAnalysisResult {
    const defaultResult: AudioAnalysisResult = {
      volume: 0,
      dominantFrequency: 0,
      spectrum: new Float32Array(0),
      isSpeaking: false,
      estimatedViseme: 'sil',
    };

    if (!this.analyser || !this.frequencyData || !this.timeDomainData) {
      return defaultResult;
    }

    this.analyser.getFloatFrequencyData(this.frequencyData);
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    // Calculate RMS volume from time domain
    let rms = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      rms += this.timeDomainData[i] * this.timeDomainData[i];
    }
    rms = Math.sqrt(rms / this.timeDomainData.length);
    const volume = clamp(rms * 4, 0, 1); // Amplify for better range

    // Smooth volume
    this.currentVolume = lerp(this.currentVolume, volume, 1 - this.volumeSmoothing);

    // Find dominant frequency
    let maxMagnitude = -Infinity;
    let maxIndex = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      if (this.frequencyData[i] > maxMagnitude) {
        maxMagnitude = this.frequencyData[i];
        maxIndex = i;
      }
    }
    const dominantFrequency = (maxIndex * this.config.sampleRate) / (this.config.fftSize * 2);

    // Estimate viseme from frequency spectrum
    const isSpeaking = this.currentVolume > 0.05;
    const estimatedViseme = isSpeaking ? this.estimateVisemeFromSpectrum() : 'sil';

    return {
      volume: this.currentVolume,
      dominantFrequency,
      spectrum: new Float32Array(this.frequencyData),
      isSpeaking,
      estimatedViseme,
    };
  }

  /**
   * Estimate the most likely viseme from the current frequency spectrum.
   * This is a heuristic fallback when phoneme data is not available.
   */
  private estimateVisemeFromSpectrum(): VisemeId {
    if (!this.frequencyData || !this.audioContext) return 'sil';

    const nyquist = this.audioContext.sampleRate / 2;
    const binWidth = nyquist / this.frequencyData.length;

    // Calculate energy in each frequency band
    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    let totalBins = { low: 0, mid: 0, high: 0 };

    for (let i = 0; i < this.frequencyData.length; i++) {
      const freq = i * binWidth;
      const magnitude = Math.pow(10, this.frequencyData[i] / 20); // dB to linear

      if (freq >= FREQUENCY_BANDS.low.min && freq <= FREQUENCY_BANDS.low.max) {
        lowEnergy += magnitude;
        totalBins.low++;
      } else if (freq >= FREQUENCY_BANDS.mid.min && freq <= FREQUENCY_BANDS.mid.max) {
        midEnergy += magnitude;
        totalBins.mid++;
      } else if (freq >= FREQUENCY_BANDS.high.min && freq <= FREQUENCY_BANDS.high.max) {
        highEnergy += magnitude;
        totalBins.high++;
      }
    }

    // Normalize
    lowEnergy = totalBins.low > 0 ? lowEnergy / totalBins.low : 0;
    midEnergy = totalBins.mid > 0 ? midEnergy / totalBins.mid : 0;
    highEnergy = totalBins.high > 0 ? highEnergy / totalBins.high : 0;

    const total = lowEnergy + midEnergy + highEnergy;
    if (total === 0) return 'sil';

    const lowRatio = lowEnergy / total;
    const highRatio = highEnergy / total;

    // Heuristic viseme selection based on frequency distribution
    if (highRatio > 0.5) {
      return 'SS'; // Sibilants dominate high frequencies
    } else if (lowRatio > 0.6) {
      return 'aa'; // Open vowels have strong low-frequency energy
    } else if (lowRatio > 0.4) {
      return 'O';  // Mid-open vowels
    } else {
      return 'E';  // Default mid vowel
    }
  }

  // ===========================================================================
  // Frame Update
  // ===========================================================================

  /**
   * Update the talking head animation. Call once per frame.
   *
   * @param deltaTime Time since last frame in seconds
   * @returns The combined blend shape weights for the current frame
   */
  update(deltaTime: number): LipSyncFrame {
    const now = performance.now();

    // 1. Update phoneme-driven viseme
    this.updatePhonemePlayback(now);

    // 2. Audio-based analysis (if no phonemes queued)
    let audioResult: AudioAnalysisResult | null = null;
    if (!this.isPlaying && this.isInitialized) {
      audioResult = this.analyzeAudio();
      if (audioResult.isSpeaking) {
        this.targetViseme = audioResult.estimatedViseme;
        this.isSpeaking = true;
      } else {
        this.targetViseme = 'sil';
        this.isSpeaking = false;
      }
    }

    // 3. Transition viseme blend shapes
    this.updateVisemeTransition(deltaTime);

    // 4. Update emotion blend
    this.updateEmotionTransition(deltaTime);

    // 5. Auto-blink
    if (this.config.autoBlink) {
      this.updateBlink(now, deltaTime);
    }

    // 6. Breathing
    const breathingWeights: BlendShapeWeights = {};
    if (this.config.breathing) {
      this.updateBreathing(deltaTime, breathingWeights);
    }

    // 7. Combine all blend shape layers
    const combinedWeights = this.combineWeights(breathingWeights);

    // 8. Invoke callback
    if (this.blendShapeCallback) {
      this.blendShapeCallback(combinedWeights);
    }

    const frame: LipSyncFrame = {
      timestamp: now,
      blendShapes: { ...this.currentVisemeWeights },
      emotionBlend: { ...this.currentEmotionWeights },
      combinedWeights,
      isSpeaking: this.isSpeaking,
      volume: this.currentVolume,
      currentViseme: this.currentViseme,
    };

    this.emitEvent('frame-update', frame);
    return frame;
  }

  /**
   * Update phoneme playback from the queue.
   */
  private updatePhonemePlayback(now: number): void {
    if (!this.isPlaying || this.phonemeQueue.length === 0) return;

    const elapsed = now - this.speechStartTime;
    let foundActive = false;

    // Find the current phoneme based on elapsed time
    for (let i = this.currentPhonemeIndex; i < this.phonemeQueue.length; i++) {
      const phoneme = this.phonemeQueue[i];
      const phonemeEnd = phoneme.startTime + phoneme.duration;

      if (elapsed >= phoneme.startTime && elapsed < phonemeEnd) {
        if (i !== this.currentPhonemeIndex) {
          this.emitEvent('phoneme-end', { phoneme: this.phonemeQueue[this.currentPhonemeIndex] });
          this.currentPhonemeIndex = i;
          this.emitEvent('phoneme-start', { phoneme });
        }

        // Apply coarticulation
        this.previousViseme = this.currentViseme;
        this.targetViseme = phoneme.viseme;
        this.isSpeaking = true;
        foundActive = true;
        break;
      }
    }

    if (!foundActive) {
      // Check if speech has ended
      const lastPhoneme = this.phonemeQueue[this.phonemeQueue.length - 1];
      if (elapsed > lastPhoneme.startTime + lastPhoneme.duration) {
        this.isPlaying = false;
        this.isSpeaking = false;
        this.targetViseme = 'sil';
        this.phonemeQueue = [];
        this.currentPhonemeIndex = 0;
        this.emitEvent('speech-end', {});
      }
    }
  }

  /**
   * Smoothly transition between viseme blend shapes.
   */
  private updateVisemeTransition(deltaTime: number): void {
    if (this.targetViseme !== this.currentViseme) {
      this.currentViseme = this.targetViseme;
      this.targetVisemeWeights = { ...(this.visemeMap[this.targetViseme] ?? {}) };

      // Apply coarticulation: blend with previous viseme
      if (this.config.coarticulationStrength > 0 && this.previousViseme !== 'sil') {
        const prevWeights = this.visemeMap[this.previousViseme] ?? {};
        const strength = this.config.coarticulationStrength;
        for (const key of Object.keys(prevWeights)) {
          if (this.targetVisemeWeights[key] !== undefined) {
            this.targetVisemeWeights[key] = lerp(
              prevWeights[key],
              this.targetVisemeWeights[key],
              1 - strength,
            );
          }
        }
      }

      this.visemeBlendProgress = 0;
    }

    // Advance blend progress
    const transitionSpeed = 1000 / Math.max(this.config.visemeTransitionTime, 1);
    this.visemeBlendProgress = clamp(this.visemeBlendProgress + deltaTime * transitionSpeed, 0, 1);
    const t = smoothStep(0, 1, this.visemeBlendProgress);

    // Interpolate weights
    const allKeys = new Set([
      ...Object.keys(this.currentVisemeWeights),
      ...Object.keys(this.targetVisemeWeights),
    ]);

    const blended: BlendShapeWeights = {};
    for (const key of allKeys) {
      const current = this.currentVisemeWeights[key] ?? 0;
      const target = this.targetVisemeWeights[key] ?? 0;
      blended[key] = lerp(current, target, t);
    }

    this.currentVisemeWeights = blended;
  }

  /**
   * Smoothly transition between emotion blend shapes.
   */
  private updateEmotionTransition(deltaTime: number): void {
    if (this.emotionBlendProgress >= 1) return;

    const transitionSpeed = 1000 / Math.max(this.targetEmotion.blendDuration, 1);
    this.emotionBlendProgress = clamp(this.emotionBlendProgress + deltaTime * transitionSpeed, 0, 1);
    const t = smoothStep(0, 1, this.emotionBlendProgress);

    const allKeys = new Set([
      ...Object.keys(this.currentEmotionWeights),
      ...Object.keys(this.targetEmotionWeights),
    ]);

    const blended: BlendShapeWeights = {};
    for (const key of allKeys) {
      const current = this.currentEmotionWeights[key] ?? 0;
      const target = this.targetEmotionWeights[key] ?? 0;
      blended[key] = lerp(current, target, t);
    }

    this.currentEmotionWeights = blended;

    if (this.emotionBlendProgress >= 1) {
      this.currentEmotion = { ...this.targetEmotion };
    }
  }

  /**
   * Update automatic blink animation.
   */
  private updateBlink(now: number, deltaTime: number): void {
    if (!this.isBlinking && now >= this.nextBlinkTime) {
      this.isBlinking = true;
      this.blinkStartTime = now;
      this.blinkProgress = 0;
      this.emitEvent('blink', {});
    }

    if (this.isBlinking) {
      const elapsed = now - this.blinkStartTime;
      this.blinkProgress = clamp(elapsed / this.config.blinkDuration, 0, 1);

      if (this.blinkProgress >= 1) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.scheduleNextBlink();
      }
    }
  }

  /**
   * Schedule the next automatic blink.
   */
  private scheduleNextBlink(): void {
    const [min, max] = this.config.blinkInterval;
    this.nextBlinkTime = performance.now() + randomRange(min, max);
  }

  /**
   * Update breathing animation.
   */
  private updateBreathing(deltaTime: number, weights: BlendShapeWeights): void {
    const breathFreq = this.config.breathingRate / 60; // Hz
    this.breathPhase += deltaTime * breathFreq * Math.PI * 2;

    const breathAmount = (Math.sin(this.breathPhase) + 1) * 0.5; // 0..1
    weights.jawOpen = (weights.jawOpen ?? 0) + breathAmount * 0.02;
    weights.mouthClose = (weights.mouthClose ?? 0) + (1 - breathAmount) * 0.01;
  }

  /**
   * Combine all blend shape layers into final weights.
   */
  private combineWeights(breathingWeights: BlendShapeWeights): BlendShapeWeights {
    const combined: BlendShapeWeights = {};

    // Layer 1: Emotion (base layer)
    for (const [key, value] of Object.entries(this.currentEmotionWeights)) {
      combined[key] = (combined[key] ?? 0) + value;
    }

    // Layer 2: Viseme (additive, scaled by volume when audio-driven)
    const volumeScale = this.isPlaying ? 1 : clamp(this.currentVolume * 3, 0, 1);
    for (const [key, value] of Object.entries(this.currentVisemeWeights)) {
      combined[key] = (combined[key] ?? 0) + value * volumeScale;
    }

    // Layer 3: Blink (override)
    if (this.isBlinking) {
      // Blink curve: fast close, slow open
      let blinkWeight: number;
      if (this.blinkProgress < 0.4) {
        blinkWeight = smoothStep(0, 0.4, this.blinkProgress);
      } else {
        blinkWeight = 1 - smoothStep(0.4, 1, this.blinkProgress);
      }
      combined.eyeBlinkLeft = blinkWeight;
      combined.eyeBlinkRight = blinkWeight;
    }

    // Layer 4: Breathing (additive)
    for (const [key, value] of Object.entries(breathingWeights)) {
      combined[key] = (combined[key] ?? 0) + value;
    }

    // Clamp all weights to [0, 1]
    for (const key of Object.keys(combined)) {
      combined[key] = clamp(combined[key], 0, 1);
    }

    return combined;
  }

  // ===========================================================================
  // Head Movement
  // ===========================================================================

  /**
   * Get head micro-movement rotation for the current frame.
   *
   * Returns small rotation offsets (in radians) that can be applied to the
   * avatar's head bone for natural-looking speech movement.
   */
  getHeadMovement(deltaTime: number): { x: number; y: number; z: number } {
    if (!this.config.headMovement || !this.isSpeaking) {
      // Decay to zero when not speaking
      this.headRotationX = lerp(this.headRotationX, 0, deltaTime * 3);
      this.headRotationY = lerp(this.headRotationY, 0, deltaTime * 3);
      this.headRotationZ = lerp(this.headRotationZ, 0, deltaTime * 3);
      return { x: this.headRotationX, y: this.headRotationY, z: this.headRotationZ };
    }

    const amp = this.config.headMovementAmplitude;
    const vol = this.currentVolume;
    const time = performance.now() / 1000;

    // Perlin-like noise approximation using sine waves
    this.headRotationX = Math.sin(time * 2.3) * amp * vol + Math.sin(time * 5.7) * amp * 0.3 * vol;
    this.headRotationY = Math.sin(time * 1.7) * amp * vol * 0.5;
    this.headRotationZ = Math.sin(time * 3.1) * amp * vol * 0.2;

    return {
      x: this.headRotationX,
      y: this.headRotationY,
      z: this.headRotationZ,
    };
  }

  // ===========================================================================
  // State & Queries
  // ===========================================================================

  /**
   * Get the current state of the talking head system.
   */
  getState(): TalkingHeadState {
    return {
      isInitialized: this.isInitialized,
      isPlaying: this.isPlaying,
      isSpeaking: this.isSpeaking,
      currentEmotion: { ...this.currentEmotion },
      currentViseme: this.currentViseme,
      volume: this.currentVolume,
      phonemeQueueLength: this.phonemeQueue.length,
    };
  }

  /**
   * Get the phoneme-to-viseme mapping table.
   */
  getPhonemeMap(): Record<string, VisemeId> {
    return { ...PHONEME_TO_VISEME };
  }

  /**
   * Map a single phoneme to its viseme.
   */
  phonemeToViseme(phoneme: string): VisemeId {
    return PHONEME_TO_VISEME[phoneme.toLowerCase()] ?? 'sil';
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Register an event handler.
   */
  on(event: TalkingHeadEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove an event handler.
   */
  off(event: TalkingHeadEventType, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event.
   */
  private emitEvent(type: TalkingHeadEventType, data?: unknown): void {
    const event: TalkingHeadEvent = { type, timestamp: performance.now(), data };
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[TalkingHead] Error in event handler for "${type}":`, err);
        }
      }
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.stopSpeech();
    this.disconnectAudioSource();

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.analyser = null;
    this.frequencyData = null;
    this.timeDomainData = null;
    this.blendShapeCallback = null;
    this.eventHandlers.clear();
    this.isInitialized = false;
  }
}
