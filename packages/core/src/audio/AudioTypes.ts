/**
 * AudioTypes — MIDI/frequency utilities and audio factory helpers.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number }
export interface Orientation { forward: Vec3; up: Vec3 }

export interface SourceConfig {
  id: string;
  type: 'buffer' | 'oscillator' | 'stream';
  url?: string;
  frequency?: number;
  waveform?: OscillatorType | string;
}

export interface AudioEffect {
  id: string;
  type: 'gain' | 'reverb' | 'delay' | 'filter' | 'compressor';
  gain?: number;
  roomSize?: number;
  wetDry?: number;
  delayTime?: number;
  feedback?: number;
  filterType?: BiquadFilterType | string;
  frequency?: number;
}

export interface AudioNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

export interface AudioPattern {
  id: string;
  notes: AudioNote[];
  bpm?: number;
}

export interface AudioTrack {
  id: string;
  patterns: AudioPattern[];
  volume?: number;
  muted?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────

export const AUDIO_DEFAULTS = {
  sampleRate: 44100,
  maxSources: 64,
  masterVolume: 1.0,
  refDistance: 1,
  maxDistance: 10000,
  rolloffFactor: 1,
} as const;

// ── MIDI / Frequency Utilities ─────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

export function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) throw new Error(`Invalid note name: ${name}`);
  const noteIndex = NOTE_NAMES.indexOf(match[1]);
  if (noteIndex === -1) throw new Error(`Unknown note: ${match[1]}`);
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + noteIndex;
}

export function zeroVector(): Vec3 {
  return [0, 0, 0] as unknown as Vec3;
}

export function defaultOrientation(): Orientation {
  return {
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  };
}

// ── Factory Helpers ────────────────────────────────────────────────────────

export function bufferSource(id: string, url: string): SourceConfig {
  return { id, type: 'buffer', url };
}

export function oscillatorSource(
  id: string,
  waveform: string,
  frequency: number,
): SourceConfig {
  return { id, type: 'oscillator', waveform, frequency };
}

export function gainEffect(id: string, gain: number): AudioEffect {
  return { id, type: 'gain', gain };
}

export function reverbEffect(id: string, roomSize: number, wetDry: number): AudioEffect {
  return { id, type: 'reverb', roomSize, wetDry };
}

export function delayEffect(id: string, delayTime: number, feedback: number): AudioEffect {
  return { id, type: 'delay', delayTime, feedback };
}

export function filterEffect(
  id: string,
  filterType: string,
  frequency: number,
): AudioEffect {
  return { id, type: 'filter', filterType, frequency };
}

export function createNote(
  pitch: number,
  startTime: number,
  duration: number,
  velocity = 100,
): AudioNote {
  return { pitch, startTime, duration, velocity };
}

export function createPattern(id: string, notes: AudioNote[], bpm = 120): AudioPattern {
  return { id, notes, bpm };
}

export function createTrack(id: string, patterns: AudioPattern[], volume = 1.0): AudioTrack {
  return { id, patterns, volume, muted: false };
}

export function validateSourceConfig(cfg: SourceConfig): ValidationResult {
  const errors: string[] = [];
  if (!cfg || typeof cfg !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }
  if (!cfg.id) errors.push('id is required');
  if (!cfg.type) errors.push('type is required');
  if (cfg.type === 'buffer' && !cfg.url) errors.push('url is required for buffer sources');
  return { valid: errors.length === 0, errors };
}
