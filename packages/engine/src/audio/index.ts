/**
 * Audio Subsystem — @holoscript/engine
 *
 * Extracted from @holoscript/core as part of A.011 architecture reorganization.
 * Full spatial audio engine, effects processing, analysis, synthesis,
 * and music sequencing capabilities.
 *
 * @module audio
 * @packageDocumentation
 */

// ── Types & Interfaces ──────────────────────────────────────────────────────
export {
  // Vector & Orientation
  type IAudioOrientation,

  // Source Types
  type AudioSourceType,
  type SpatialModel,
  type RolloffType,
  type IAudioSourceConfig,
  type IAudioSourceState,
  type PlaybackState,

  // Listener
  type IAudioListenerConfig,

  // Effects
  type FilterType as AudioFilterType,
  type OscillatorType,
  type NoiseType,
  type IGainEffect,
  type IFilterEffect,
  type IReverbEffect,
  type IDelayEffect,
  type IDistortionEffect,
  type ICompressorEffect,
  type IEqualizerBand,
  type IEqualizerEffect,
  type IPanEffect,
  type ISpatialEffect,
  type AudioEffect,

  // Groups & Buses
  type IAudioGroup,
  type IAudioBus,

  // Sequencing
  type INote,
  type IPattern,
  type ITrack,
  type ISequence,
  type SequencerState,
  type LoopMode,
  type ISequencerConfig,

  // Events
  type AudioEventType,
  type IAudioEvent,
  type AudioEventCallback,

  // System
  type IAudioSystemConfig,

  // Interfaces
  type IAudioContext,
  type ISequencer,

  // Defaults
  AUDIO_DEFAULTS,

  // Helper Functions
  zeroVector,
  defaultOrientation,
  bufferSource,
  oscillatorSource,
  streamSource,
  noiseSource,
  spatialSource,
  gainEffect,
  filterEffect,
  lowpassFilter,
  highpassFilter,
  bandpassFilter,
  reverbEffect,
  delayEffect,
  distortionEffect,
  compressorEffect,
  panEffect,
  eqBand,
  equalizerEffect,
  createNote,
  createPattern,
  createSequence,
  createTrack,

  // MIDI Utilities
  midiToFrequency,
  frequencyToMidi,
  noteNameToMidi,
  midiToNoteName,
} from './AudioTypes.js';

// ── Implementation ──────────────────────────────────────────────────────────
export { AudioContextImpl, createAudioContext } from './AudioContextImpl.js';
export { SequencerImpl, createSequencer } from './Sequencer.js';

// ── Engine (spatial audio core) ─────────────────────────────────────────────
export {
  AudioEngine,
  type DistanceModel,
  type AudioSourceConfig,
  type AudioSource as AudioEngineSource,
  type ListenerState,
} from './AudioEngine.js';

// ── Analysis ────────────────────────────────────────────────────────────────
export {
  AudioAnalyzer,
  DEFAULT_BANDS,
  type SpectrumData,
  type BeatDetectionConfig,
  type BeatEvent,
  type LoudnessMetrics,
  type AudioBand,
} from './AudioAnalyzer.js';

// ── Diffraction ─────────────────────────────────────────────────────────────
export {
  AudioDiffractionSystem,
  type DiffractionEdge,
  type DiffractionPath,
  type DiffractionResult,
  type DiffractionConfig,
  type EdgeDetectionProvider,
  type LineOfSightProvider,
} from './AudioDiffraction.js';

// ── Dynamics ────────────────────────────────────────────────────────────────
export {
  AudioDynamics,
  type CompressorConfig,
  type GateConfig,
} from './AudioDynamics.js';

// ── Envelope ────────────────────────────────────────────────────────────────
export {
  AudioEnvelope,
  type ADSRConfig,
  type EnvelopeStage,
  type CurveType,
} from './AudioEnvelope.js';

// ── Filter ──────────────────────────────────────────────────────────────────
export {
  AudioFilter,
  type FilterType,
  type FilterConfig,
  type EQBand,
} from './AudioFilter.js';

// ── Graph ───────────────────────────────────────────────────────────────────
export {
  AudioGraph,
  type AudioNodeType,
  type AudioGraphNode,
  type AudioConnection,
  type AutomationPoint,
  type ParameterAutomation,
} from './AudioGraph.js';

// ── Mixer ───────────────────────────────────────────────────────────────────
export {
  AudioMixer,
  type MixerChannel,
  type DuckingConfig,
  type SidechainConfig,
  type VoiceStealingStrategy,
  type AudioSource as MixerAudioSource,
  type MixingContext,
} from './AudioMixer.js';

// ── Occlusion ───────────────────────────────────────────────────────────────
export {
  AudioOcclusionSystem,
  OCCLUSION_MATERIALS,
  type FrequencyAbsorption,
  type OcclusionMaterial,
  type OcclusionResult,
  type OcclusionRay,
  type OcclusionHit,
  type RaycastProvider,
} from './AudioOcclusion.js';

// ── Presets ─────────────────────────────────────────────────────────────────
export { AudioPresets } from './AudioPresets.js';

// ── Trait ───────────────────────────────────────────────────────────────────
export {
  audioTraitHandler,
  setSharedAudioEngine,
  getSharedAudioEngine,
  type AudioTraitConfig,
} from './AudioTrait.js';

// ── Music Generator ─────────────────────────────────────────────────────────
export {
  MusicGenerator,
  type ScaleType,
  type ChordQuality,
  type ChordDef,
  type RhythmPattern,
  type MelodyNote,
} from './MusicGenerator.js';

// ── Sound Pool ──────────────────────────────────────────────────────────────
export { SoundPool, type SoundDefinition } from './SoundPool.js';

// ── Spatial Audio Source ────────────────────────────────────────────────────
export {
  SpatialAudioSource,
  type RolloffModel,
  type AudioCone,
  type SpatialAudioConfig,
} from './SpatialAudioSource.js';

// ── Spatial Audio Zones ─────────────────────────────────────────────────────
export {
  SpatialAudioZoneSystem,
  REVERB_PRESETS,
  type ReverbPreset,
  type AudioZoneConfig,
  type AudioPortal,
  type ZoneState,
} from './SpatialAudioZone.js';

// ── Synth Engine ────────────────────────────────────────────────────────────
export {
  SynthEngine,
  type WaveformType,
  type ADSREnvelope,
  type OscillatorDef,
  type SynthVoice,
  type FilterDef,
} from './SynthEngine.js';

// ── Voice Manager ───────────────────────────────────────────────────────────
export { VoiceManager } from './VoiceManager.js';

