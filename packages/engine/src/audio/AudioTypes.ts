/**
 * AudioTypes.ts
 *
 * Core type definitions for the HoloScript audio system.
 * Provides interfaces for audio sources, listeners, effects,
 * spatial audio, and music sequencing.
 *
 * @module audio
 */

// ============================================================================
// Vector Types (for 3D audio positioning)
// ============================================================================

/**
 * 3D vector for audio positioning — tuple form avoids coupling to @holoscript/core object-style Vector3.
 */
export type IVector3 = [number, number, number];

/**
 * Orientation for audio listener (forward and up vectors)
 */
export interface IAudioOrientation {
  forward: IVector3;
  up: IVector3;
}

// ============================================================================
// Audio Source Types
// ============================================================================

/**
 * Audio source types
 */
export type AudioSourceType = 'buffer' | 'stream' | 'oscillator' | 'noise';

/**
 * Oscillator waveform types
 */
export type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom';

/**
 * Noise types for procedural audio
 */
export type NoiseType = 'white' | 'pink' | 'brown' | 'blue' | 'violet';

/**
 * Spatial audio model
 */
export type SpatialModel = 'HRTF' | 'panning' | 'equalpower';

/**
 * Distance rolloff types for spatial audio
 */
export type RolloffType = 'linear' | 'inverse' | 'exponential';

/**
 * Loop mode for sequencer
 */
export type LoopMode = 'none' | 'pattern' | 'sequence' | 'all';

/**
 * Sequencer state enum
 */
export type SequencerState = 'stopped' | 'playing' | 'paused' | 'recording';

/**
 * Playback state of an audio source
 */
export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'scheduled';

/**
 * Audio source configuration
 */
export interface IAudioSourceConfig {
  id: string;
  type: AudioSourceType;

  // Buffer source
  url?: string;
  buffer?: ArrayBuffer;

  // Oscillator source
  oscillatorType?: OscillatorType;
  frequency?: number;

  // Noise source
  noiseType?: NoiseType;

  // Common properties
  volume?: number;
  pitch?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;

  // Spatial audio
  spatial?: boolean;
  position?: IVector3;
  maxDistance?: number;
  refDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
  orientation?: IVector3;

  // Timing
  startTime?: number;
  duration?: number;
  fadeInTime?: number;
  fadeOutTime?: number;

  // Effects
  effects?: string[];

  // Groups
  group?: string;
}

/**
 * Audio source runtime state
 */
export interface IAudioSourceState {
  id: string;
  type: AudioSourceType;
  state: PlaybackState;
  volume: number;
  pitch: number;
  loop: boolean;
  position: IVector3;
  currentTime: number;
  duration: number;
  spatial: boolean;
}

// ============================================================================
// Audio Listener
// ============================================================================

/**
 * Audio listener configuration (usually follows camera)
 */
export interface IAudioListenerConfig {
  position: IVector3;
  orientation: IAudioOrientation;
  velocity?: IVector3;
}

// ============================================================================
// Audio Effects
// ============================================================================

/**
 * Effect types
 */
export type EffectType =
  | 'gain'
  | 'filter'
  | 'reverb'
  | 'delay'
  | 'distortion'
  | 'compressor'
  | 'eq'
  | 'equalizer'
  | 'spatial'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'tremolo'
  | 'pan';

/**
 * Filter types for EQ and filter effects
 */
export type FilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass';

/**
 * Base effect configuration
 */
export interface IEffectConfig {
  id: string;
  type: EffectType;
  bypass?: boolean;
  wet?: number; // 0-1, dry/wet mix
}

/**
 * Gain effect
 */
export interface IGainEffect extends IEffectConfig {
  type: 'gain';
  gain: number;
}

/**
 * Filter effect
 */
export interface IFilterEffect extends IEffectConfig {
  type: 'filter';
  filterType: FilterType;
  frequency: number;
  Q?: number;
  gain?: number;
}

/**
 * Reverb effect
 */
export interface IReverbEffect extends IEffectConfig {
  type: 'reverb';
  roomSize?: number;
  decay?: number;
  damping?: number;
  preDelay?: number;
  impulseUrl?: string;
}

/**
 * Delay effect
 */
export interface IDelayEffect extends IEffectConfig {
  type: 'delay';
  delayTime: number;
  /** Alias for delayTime */
  time?: number;
  feedback?: number;
  maxDelay?: number;
}

/**
 * Distortion effect
 */
export interface IDistortionEffect extends IEffectConfig {
  type: 'distortion';
  amount: number;
  oversample?: 'none' | '2x' | '4x';
}

/**
 * Compressor effect
 */
export interface ICompressorEffect extends IEffectConfig {
  type: 'compressor';
  threshold: number;
  knee?: number;
  ratio: number;
  attack?: number;
  release?: number;
  makeupGain?: number;
}

/**
 * EQ band
 */
export interface IEQBand {
  frequency: number;
  gain: number;
  Q?: number;
  type?: FilterType;
}

/**
 * Equalizer effect
 */
export interface IEQEffect extends IEffectConfig {
  type: 'eq';
  bands: IEQBand[];
}

/**
 * Panner effect
 */
export interface IPanEffect extends IEffectConfig {
  type: 'pan';
  pan: number; // -1 (left) to 1 (right)
}

/**
 * Union type for all effects
 */
export type AudioEffect =
  | IGainEffect
  | IFilterEffect
  | IReverbEffect
  | IDelayEffect
  | IDistortionEffect
  | ICompressorEffect
  | IEQEffect
  | IPanEffect
  | ISpatialEffect;

// ============================================================================
// Type Aliases for API Compatibility
// ============================================================================

/**
 * Alias for EQ band (API compatibility)
 */
export type IEqualizerBand = IEQBand;

/**
 * Equalizer effect interface (extends EQ with 'equalizer' type)
 */
export interface IEqualizerEffect extends IEffectConfig {
  type: 'equalizer';
  bands: IEQBand[];
}

/**
 * Spatial audio effect
 */
export interface ISpatialEffect extends IEffectConfig {
  type: 'spatial';
  model: SpatialModel;
  refDistance: number;
  maxDistance: number;
  rolloff: RolloffType;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
}

/**
 * Audio bus interface
 */
export interface IAudioBus {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  effects: string[];
  inputs: string[];
  output?: string;
}

/**
 * Sequencer configuration
 */
export interface ISequencerConfig {
  bpm: number;
  beatsPerBar: number;
  swingAmount?: number;
  lookAheadTime?: number;
  scheduleAheadTime?: number;
}

/**
 * Pattern reference in track
 */
export interface IPatternRef {
  patternId: string;
  startBeat: number;
  loop?: boolean;
  loopCount?: number;
}

// ============================================================================
// Audio Groups / Buses
// ============================================================================

/**
 * Audio group (bus) for managing multiple sources
 */
export interface IAudioGroup {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  effects: string[];
  parent?: string;
}

// ============================================================================
// Music / Sequencing
// ============================================================================

/**
 * Musical note
 */
export interface INote {
  pitch: number | string; // MIDI number or note name (e.g., 'C4')
  velocity: number; // 0-127
  duration: number; // in beats
  startBeat: number;
  /** Alias for startBeat (for compatibility) */
  start?: number;
}

/**
 * Pattern of notes
 */
export interface IPattern {
  id: string;
  name?: string;
  notes: INote[];
  lengthBeats?: number;
  /** Alias for lengthBeats */
  length?: number;
  loop?: boolean;
  /** Number of bars in pattern */
  bars?: number;
  /** Beats per bar */
  beatsPerBar?: number;
  /** Subdivision (notes per beat) */
  subdivision?: number;
}

/**
 * Track in a sequence
 */
export interface ITrack {
  id: string;
  name?: string;
  instrument?: string;
  patterns: IPatternRef[];
  volume?: number;
  pan?: number;
  muted?: boolean;
  solo?: boolean;
  /** Source ID for this track */
  sourceId?: string;
  /** Effect chain IDs */
  effects?: string[];
  /** Output source ID */
  outputSource?: string;
}

/**
 * Music sequence configuration
 */
export interface ISequence {
  id: string;
  name?: string;
  bpm?: number;
  beatsPerBar?: number;
  bars?: number;
  tracks: ITrack[];
  patterns?: IPattern[];
  /** Order of patterns to play */
  patternOrder?: string[];
  /** Time signature [beats, noteValue] */
  timeSignature?: [number, number];
  /** Loop the sequence */
  loop?: boolean;
}

/**
 * Sequencer state
 */
export interface ISequencerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentBeat: number;
  currentBar: number;
  bpm: number;
  looping: boolean;
  loopStart: number;
  loopEnd: number;
}

// ============================================================================
// Audio Events
// ============================================================================

/**
 * Audio event types
 */
export type AudioEventType =
  | 'sourceStarted'
  | 'sourceStopped'
  | 'sourceEnded'
  | 'sourcePaused'
  | 'sourceResumed'
  | 'sourceLooped'
  | 'bufferLoaded'
  | 'bufferError'
  | 'beatTick'
  | 'barTick'
  | 'beat'
  | 'bar'
  | 'sequenceEnd'
  | 'sequencerStarted'
  | 'sequencerStopped'
  | 'sequencerPaused'
  | 'sequencerSeeked'
  | 'sequenceLooped'
  | 'noteTriggered'
  | 'noteReleased'
  | 'metronomeClick'
  | 'bpmChanged';

/**
 * Audio event
 */
export interface IAudioEvent {
  type: AudioEventType;
  sourceId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Audio event callback
 */
export type AudioEventCallback = (event: IAudioEvent) => void;

// ============================================================================
// Audio System Configuration
// ============================================================================

/**
 * Audio system configuration
 */
export interface IAudioSystemConfig {
  sampleRate?: number;
  maxSources?: number;
  masterVolume?: number;
  spatialEnabled?: boolean;
  defaultRolloff?: 'linear' | 'inverse' | 'exponential';
  defaultRefDistance?: number;
  defaultMaxDistance?: number;
  doppler?: boolean;
  dopplerFactor?: number;
  speedOfSound?: number;
}

/**
 * Audio system defaults
 */
export const AUDIO_DEFAULTS: Required<IAudioSystemConfig> = {
  sampleRate: 44100,
  maxSources: 32,
  masterVolume: 1.0,
  spatialEnabled: true,
  defaultRolloff: 'inverse',
  defaultRefDistance: 1.0,
  defaultMaxDistance: 10000,
  doppler: true,
  dopplerFactor: 1.0,
  speedOfSound: 343.0,
};

// ============================================================================
// Audio Context Interface
// ============================================================================

/**
 * Main audio context interface
 */
export interface IAudioContext {
  // Lifecycle
  initialize(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  dispose(): void;
  readonly state: 'suspended' | 'running' | 'closed';
  readonly currentTime: number;
  readonly sampleRate: number;

  // Master controls
  setMasterVolume(volume: number): void;
  getMasterVolume(): number;
  mute(): void;
  unmute(): void;
  readonly isMuted: boolean;

  // Listener
  setListenerPosition(position: IVector3): void;
  setListenerOrientation(orientation: IAudioOrientation): void;
  setListenerVelocity(velocity: IVector3): void;
  getListenerConfig(): IAudioListenerConfig;

  // Source management
  createSource(config: IAudioSourceConfig): Promise<string>;
  getSource(id: string): IAudioSourceState | undefined;
  getAllSources(): IAudioSourceState[];
  removeSource(id: string): boolean;

  // Playback control
  play(sourceId: string, when?: number): void;
  stop(sourceId: string): void;
  pause(sourceId: string): void;
  resumeSource(sourceId: string): void;

  // Source properties
  setVolume(sourceId: string, volume: number): void;
  setPitch(sourceId: string, pitch: number): void;
  setLoop(sourceId: string, loop: boolean, start?: number, end?: number): void;
  setPosition(sourceId: string, position: IVector3): void;
  setOrientation(sourceId: string, orientation: IVector3): void;

  // Effects
  createEffect(config: AudioEffect): string;
  getEffect(id: string): AudioEffect | undefined;
  removeEffect(id: string): boolean;
  connectSourceToEffect(sourceId: string, effectId: string): void;
  disconnectSourceFromEffect(sourceId: string, effectId: string): void;

  // Groups
  createGroup(config: IAudioGroup): string;
  getGroup(id: string): IAudioGroup | undefined;
  setGroupVolume(groupId: string, volume: number): void;
  setGroupMuted(groupId: string, muted: boolean): void;
  setGroupSolo(groupId: string, solo: boolean): void;

  // Buffer management
  loadBuffer(url: string): Promise<ArrayBuffer>;
  decodeBuffer(buffer: ArrayBuffer): Promise<AudioBuffer>;
  getCachedBuffer(url: string): ArrayBuffer | undefined;
  clearBufferCache(): void;

  // Events
  on(event: AudioEventType, callback: AudioEventCallback): void;
  off(event: AudioEventType, callback: AudioEventCallback): void;
  emit(event: IAudioEvent): void;

  // Analysis
  getAnalyzerData(sourceId: string): Float32Array | undefined;
  getFrequencyData(sourceId: string): Uint8Array | undefined;
}

// ============================================================================
// Sequencer Interface
// ============================================================================

/**
 * Music sequencer interface
 */
export interface ISequencer {
  // Lifecycle
  load(sequence: ISequence): void;
  unload(): void;

  // Playback
  play(): void;
  pause(): void;
  stop(): void;
  seek(beat: number): void;

  // State
  getState(): ISequencerState;
  readonly isPlaying: boolean;
  readonly currentBeat: number;

  // Tempo
  setBPM(bpm: number): void;
  getBPM(): number;

  // Looping
  setLoop(enabled: boolean, startBeat?: number, endBeat?: number): void;

  // Track control
  setTrackVolume(trackId: string, volume: number): void;
  setTrackMuted(trackId: string, muted: boolean): void;
  setTrackSolo(trackId: string, solo: boolean): void;

  // Events
  on(event: 'beatTick' | 'barTick' | 'sequenceEnd', callback: AudioEventCallback): void;
  off(event: 'beatTick' | 'barTick' | 'sequenceEnd', callback: AudioEventCallback): void;

  // Pattern management
  addPattern(pattern: IPattern): void;
  removePattern(patternId: string): boolean;
  getPattern(patternId: string): IPattern | undefined;

  // Real-time updates
  scheduleNote(trackId: string, note: INote): void;
  quantize(beat: number, grid: number): number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a zero vector
 */
export function zeroVector(): IVector3 {
  return [0, 0, 0 ];
}

/**
 * Create default listener orientation
 */
export function defaultOrientation(): IAudioOrientation {
  return {
    forward: [0, 0, -1 ],
    up: [0, 1, 0 ],
  };
}

/**
 * Create a buffer source config
 */
export function bufferSource(
  id: string,
  url: string,
  options: Partial<IAudioSourceConfig> = {}
): IAudioSourceConfig {
  return {
    id,
    type: 'buffer',
    url,
    volume: 1.0,
    pitch: 1.0,
    loop: false,
    spatial: false,
    position: zeroVector(),
    ...options,
  };
}

/**
 * Create an oscillator source config
 */
export function oscillatorSource(
  id: string,
  waveform: OscillatorType,
  frequency: number,
  options: Partial<IAudioSourceConfig> = {}
): IAudioSourceConfig {
  return {
    id,
    type: 'oscillator',
    oscillatorType: waveform,
    frequency,
    volume: 1.0,
    pitch: 1.0,
    loop: true,
    spatial: false,
    position: zeroVector(),
    ...options,
  };
}

/**
 * Create a stream source config
 */
export function streamSource(
  id: string,
  url: string,
  options: Partial<IAudioSourceConfig> = {}
): IAudioSourceConfig {
  return {
    id,
    type: 'stream',
    url,
    volume: 1.0,
    pitch: 1.0,
    loop: false,
    spatial: false,
    position: zeroVector(),
    ...options,
  };
}

/**
 * Create a noise source config
 */
export function noiseSource(
  id: string,
  noiseType: NoiseType,
  options: Partial<IAudioSourceConfig> = {}
): IAudioSourceConfig {
  return {
    id,
    type: 'noise',
    noiseType,
    volume: 1.0,
    pitch: 1.0,
    loop: true,
    spatial: false,
    position: zeroVector(),
    ...options,
  };
}

/**
 * Add spatial properties to an existing source config (decorator pattern)
 */
export function spatialSource(
  config: IAudioSourceConfig,
  position: IVector3,
  options: Partial<IAudioSourceConfig> = {}
): IAudioSourceConfig {
  return {
    ...config,
    spatial: true,
    position,
    maxDistance: AUDIO_DEFAULTS.defaultMaxDistance,
    refDistance: AUDIO_DEFAULTS.defaultRefDistance,
    rolloffFactor: 1.0,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 0,
    ...options,
  };
}

/**
 * Create a gain effect config
 */
export function gainEffect(id: string, gain: number = 1.0): IGainEffect {
  return {
    id,
    type: 'gain',
    gain,
    wet: 1.0,
    bypass: false,
  };
}

/**
 * Create a reverb effect config
 */
export function reverbEffect(
  id: string,
  decay: number = 2.0,
  wet: number = 0.5,
  options: Partial<IReverbEffect> = {}
): IReverbEffect {
  return {
    id,
    type: 'reverb',
    roomSize: 0.5,
    decay,
    damping: 0.5,
    preDelay: 0.01,
    wet,
    bypass: false,
    ...options,
  };
}

/**
 * Create a delay effect config
 */
export function delayEffect(
  id: string,
  time: number = 0.5,
  feedback: number = 0.3,
  options: Partial<IDelayEffect> = {}
): IDelayEffect {
  return {
    id,
    type: 'delay',
    time,
    delayTime: time,
    feedback,
    maxDelay: 5.0,
    wet: 0.5,
    bypass: false,
    ...options,
  };
}

/**
 * Create a filter effect config
 */
export function filterEffect(
  id: string,
  filterType: FilterType,
  frequency: number,
  options: Partial<IFilterEffect> = {}
): IFilterEffect {
  return {
    id,
    type: 'filter',
    filterType,
    frequency,
    Q: 1.0,
    gain: 0,
    wet: 1.0,
    bypass: false,
    ...options,
  };
}

/**
 * Create a compressor effect config
 */
export function compressorEffect(
  id: string,
  threshold: number = -24,
  ratio: number = 4,
  options: Partial<ICompressorEffect> = {}
): ICompressorEffect {
  return {
    id,
    type: 'compressor',
    threshold,
    ratio,
    knee: 10,
    attack: 0.003,
    release: 0.25,
    makeupGain: 0,
    wet: 1.0,
    bypass: false,
    ...options,
  };
}

/**
 * Convert MIDI note number to frequency
 */
export function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * Convert frequency to MIDI note number (rounded to nearest integer)
 */
export function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

/**
 * Convert note name to MIDI number
 * e.g., 'C4' -> 60, 'A4' -> 69
 */
export function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-Ga-g])([#b]?)(-?[0-9])$/);
  if (!match) return 60; // Default to middle C

  const notes: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  const noteName = match[1].toUpperCase();
  const accidental = match[2];
  const octave = parseInt(match[3], 10);

  let midi = notes[noteName] + (octave + 1) * 12;
  if (accidental === '#') midi += 1;
  if (accidental === 'b') midi -= 1;

  return midi;
}

/**
 * Convert MIDI number to note name
 */
export function midiToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}${octave}`;
}

/**
 * Validate audio source config
 */
export function validateSourceConfig(config: IAudioSourceConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.id || config.id.trim() === '') {
    errors.push('Source id is required');
  }

  if (!config.type) {
    errors.push('Source type is required');
  }

  if (config.type === 'buffer' && !config.url && !config.buffer) {
    errors.push('Buffer source requires url or buffer data');
  }

  if (config.type === 'oscillator' && config.frequency !== undefined && config.frequency <= 0) {
    errors.push('Oscillator frequency must be positive');
  }

  if (config.volume !== undefined && (config.volume < 0 || config.volume > 1)) {
    errors.push('Volume must be between 0 and 1');
  }

  if (config.pitch !== undefined && config.pitch <= 0) {
    errors.push('Pitch must be positive');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Convenience Filter Helpers
// ============================================================================

/**
 * Create a lowpass filter effect
 */
export function lowpassFilter(id: string, frequency: number, Q: number = 1.0): IFilterEffect {
  return filterEffect(id, 'lowpass', frequency, { Q });
}

/**
 * Create a highpass filter effect
 */
export function highpassFilter(id: string, frequency: number, Q: number = 1.0): IFilterEffect {
  return filterEffect(id, 'highpass', frequency, { Q });
}

/**
 * Create a bandpass filter effect
 */
export function bandpassFilter(id: string, frequency: number, Q: number = 1.0): IFilterEffect {
  return filterEffect(id, 'bandpass', frequency, { Q });
}

/**
 * Create a distortion effect config
 */
export function distortionEffect(
  id: string,
  amount: number = 0.5,
  options: Partial<IDistortionEffect> = {}
): IDistortionEffect {
  return {
    id,
    type: 'distortion',
    amount,
    oversample: '2x',
    wet: 1.0,
    bypass: false,
    ...options,
  };
}

/**
 * Create a pan effect config
 */
export function panEffect(id: string, pan: number = 0): IPanEffect {
  return {
    id,
    type: 'pan',
    pan,
    wet: 1.0,
    bypass: false,
  };
}

/**
 * Create an EQ band config
 */
export function eqBand(frequency: number, Q: number = 1.0, gain: number = 0): IEQBand {
  return { frequency, Q, gain };
}

/**
 * Create an equalizer effect config
 */
export function equalizerEffect(
  id: string,
  bands: IEQBand[],
  options: Partial<IEqualizerEffect> = {}
): IEqualizerEffect {
  return {
    id,
    type: 'equalizer',
    bands,
    wet: 1.0,
    bypass: false,
    ...options,
  };
}

// ============================================================================
// Sequencer Helpers
// ============================================================================

/**
 * Create a note config for sequencer
 */
export function createNote(
  pitch: number | string,
  start: number,
  duration: number,
  velocity: number = 100
): INote {
  return {
    pitch: typeof pitch === 'string' ? noteNameToMidi(pitch) : pitch,
    startBeat: start,
    start,
    duration,
    velocity,
  };
}

/**
 * Create a pattern config for sequencer
 */
export function createPattern(
  id: string,
  notes: INote[],
  options: Partial<IPattern> = {}
): IPattern {
  const maxEnd = notes.reduce(
    (max, n) => Math.max(max, (n.start ?? n.startBeat ?? 0) + n.duration),
    0
  );
  return {
    id,
    notes,
    length: options.length ?? Math.ceil(maxEnd),
    loop: options.loop ?? true,
    ...options,
  };
}

/**
 * Create a track config for sequencer
 */
export function createTrack(
  id: string,
  patterns: IPatternRef[],
  options: Partial<ITrack> = {}
): ITrack {
  return {
    id,
    patterns,
    sourceId: options.sourceId,
    volume: options.volume ?? 1.0,
    muted: options.muted ?? false,
    solo: options.solo ?? false,
    ...options,
  };
}

/**
 * Create a sequence config for sequencer
 */
export function createSequence(
  id: string,
  patternOrder: string[],
  tracks: ITrack[],
  options: Partial<ISequence> = {}
): ISequence {
  return {
    id,
    patternOrder,
    tracks,
    bpm: options.bpm ?? 120,
    timeSignature: options.timeSignature ?? [4, 4],
    loop: options.loop ?? false,
    ...options,
  };
}
