/**
 * musicProduction.ts — Music Production & Mixing Engine
 *
 * MIDI track management, mixing console with channel strips,
 * EQ/compression/reverb processing, BPM/time signature, mastering chain.
 */

export type NoteValue = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
export type WaveShape = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
export type EffectType = 'eq' | 'compressor' | 'reverb' | 'delay' | 'chorus' | 'distortion' | 'limiter';

export interface MidiNote {
  note: NoteValue;
  octave: number;          // 0-8
  velocity: number;        // 0-127
  startBeat: number;
  durationBeats: number;
  channel: number;         // 0-15
}

export interface MidiTrack {
  id: string;
  name: string;
  instrument: string;
  notes: MidiNote[];
  muted: boolean;
  solo: boolean;
  volume: number;          // 0-1
  pan: number;             // -1 (L) to 1 (R)
}

export interface ChannelStrip {
  trackId: string;
  gain: number;            // dB (-inf to +12)
  pan: number;
  mute: boolean;
  solo: boolean;
  effects: EffectInstance[];
  peakLevel: number;       // 0-1, most recent peak
}

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export interface TimeSignature {
  beatsPerMeasure: number;
  beatValue: number;       // 4 = quarter, 8 = eighth
}

export interface Session {
  id: string;
  name: string;
  bpm: number;
  timeSignature: TimeSignature;
  tracks: MidiTrack[];
  durationBeats: number;
  sampleRate: number;
  bitDepth: number;
}

// ═══════════════════════════════════════════════════════════════════
// MIDI & Note Helpers
// ═══════════════════════════════════════════════════════════════════

const NOTE_ORDER: NoteValue[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteNumber(note: NoteValue, octave: number): number {
  return NOTE_ORDER.indexOf(note) + (octave + 1) * 12;
}

export function noteFromMidi(midiNum: number): { note: NoteValue; octave: number } {
  return { note: NOTE_ORDER[midiNum % 12], octave: Math.floor(midiNum / 12) - 1 };
}

export function noteFrequency(note: NoteValue, octave: number): number {
  const semitonesFromA4 = midiNoteNumber(note, octave) - 69;
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats / bpm) * 60;
}

export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

export function measureCount(durationBeats: number, timeSignature: TimeSignature): number {
  return Math.ceil(durationBeats / timeSignature.beatsPerMeasure);
}

// ═══════════════════════════════════════════════════════════════════
// Mixing & Levels
// ═══════════════════════════════════════════════════════════════════

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

export function panLaw(pan: number): { left: number; right: number } {
  // Constant-power pan law
  const angle = ((pan + 1) / 2) * (Math.PI / 2);
  return { left: Math.cos(angle), right: Math.sin(angle) };
}

export function isClipping(peakLevel: number): boolean {
  return peakLevel >= 1.0;
}

export function trackDuration(track: MidiTrack): number {
  if (track.notes.length === 0) return 0;
  return Math.max(...track.notes.map(n => n.startBeat + n.durationBeats));
}

export function soloedTracks(tracks: MidiTrack[]): MidiTrack[] {
  const soloed = tracks.filter(t => t.solo);
  return soloed.length > 0 ? soloed : tracks.filter(t => !t.muted);
}

// ═══════════════════════════════════════════════════════════════════
// VST Plugin Chain
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculates cumulative gain applied by a chain of insert effects.
 * Each effect may add/subtract gain (e.g. compressor reduces, limiter clips).
 */
export function vstChainGain(effects: EffectInstance[]): number {
  let gainDb = 0;
  for (const fx of effects) {
    if (!fx.enabled) continue;
    switch (fx.type) {
      case 'eq':
        gainDb += fx.params.gain ?? 0;
        break;
      case 'compressor':
        gainDb -= fx.params.reduction ?? 0;
        gainDb += fx.params.makeupGain ?? 0;
        break;
      case 'limiter':
        gainDb += fx.params.gain ?? 0;
        // Ceiling clamps
        break;
      case 'distortion':
        gainDb += fx.params.drive ?? 0;
        break;
      default:
        // reverb, delay, chorus are wet/dry — typically unity gain
        break;
    }
  }
  return gainDb;
}

/**
 * Computes RMS level from a sample buffer (useful for oscilloscope/metering).
 */
export function waveformRMS(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sumSquares = samples.reduce((s, v) => s + v * v, 0);
  return Math.sqrt(sumSquares / samples.length);
}
