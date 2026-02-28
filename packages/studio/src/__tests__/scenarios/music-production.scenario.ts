/**
 * music-production.scenario.ts — LIVING-SPEC: Music Production Studio
 *
 * Persona: Kai — producer who composes MIDI tracks, mixes with
 * channel strips, and masters for distribution.
 */

import { describe, it, expect } from 'vitest';
import {
  midiNoteNumber, noteFromMidi, noteFrequency,
  beatsToSeconds, secondsToBeats, measureCount,
  dbToLinear, linearToDb, panLaw, isClipping,
  trackDuration, soloedTracks,
  type MidiTrack, type TimeSignature,
} from '@/lib/musicProduction';

describe('Scenario: Music Production — MIDI Notes', () => {
  it('middle C (C4) = MIDI note 60', () => {
    expect(midiNoteNumber('C', 4)).toBe(60);
  });

  it('A4 = MIDI note 69', () => {
    expect(midiNoteNumber('A', 4)).toBe(69);
  });

  it('noteFromMidi(60) returns C4', () => {
    const { note, octave } = noteFromMidi(60);
    expect(note).toBe('C');
    expect(octave).toBe(4);
  });

  it('A4 = 440 Hz', () => {
    expect(noteFrequency('A', 4)).toBeCloseTo(440, 0);
  });

  it('A3 = 220 Hz (one octave down)', () => {
    expect(noteFrequency('A', 3)).toBeCloseTo(220, 0);
  });

  it('C4 ≈ 261.63 Hz', () => {
    expect(noteFrequency('C', 4)).toBeCloseTo(261.63, 0);
  });
});

describe('Scenario: Music Production — Timing', () => {
  it('beatsToSeconds(4, 120) = 2.0s', () => {
    expect(beatsToSeconds(4, 120)).toBe(2.0);
  });

  it('secondsToBeats(2, 120) = 4 beats', () => {
    expect(secondsToBeats(2, 120)).toBe(4);
  });

  it('measureCount for 16 beats at 4/4 = 4 measures', () => {
    const ts: TimeSignature = { beatsPerMeasure: 4, beatValue: 4 };
    expect(measureCount(16, ts)).toBe(4);
  });

  it('measureCount for 7 beats at 3/4 = 3 measures', () => {
    const ts: TimeSignature = { beatsPerMeasure: 3, beatValue: 4 };
    expect(measureCount(7, ts)).toBe(3);
  });
});

describe('Scenario: Music Production — Mixing', () => {
  it('0 dB = linear 1.0', () => {
    expect(dbToLinear(0)).toBeCloseTo(1.0, 4);
  });

  it('-6 dB ≈ 0.5 linear', () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.5012, 2);
  });

  it('linearToDb(1.0) = 0 dB', () => {
    expect(linearToDb(1.0)).toBeCloseTo(0, 4);
  });

  it('linearToDb(0) = -Infinity', () => {
    expect(linearToDb(0)).toBe(-Infinity);
  });

  it('panLaw center (0) gives equal L/R power', () => {
    const { left, right } = panLaw(0);
    expect(left).toBeCloseTo(right, 2);
  });

  it('panLaw hard left (-1) maximizes left', () => {
    const { left, right } = panLaw(-1);
    expect(left).toBeCloseTo(1, 2);
    expect(right).toBeCloseTo(0, 2);
  });

  it('isClipping detects peak ≥ 1.0', () => {
    expect(isClipping(0.95)).toBe(false);
    expect(isClipping(1.0)).toBe(true);
  });

  it('trackDuration returns last note end', () => {
    const track: MidiTrack = { id: 't', name: '', instrument: '', notes: [
      { note: 'C', octave: 4, velocity: 100, startBeat: 0, durationBeats: 4, channel: 0 },
      { note: 'E', octave: 4, velocity: 90, startBeat: 8, durationBeats: 2, channel: 0 },
    ], muted: false, solo: false, volume: 1, pan: 0 };
    expect(trackDuration(track)).toBe(10);
  });

  it('soloedTracks returns only soloed if any', () => {
    const tracks: MidiTrack[] = [
      { id: 'a', name: 'Bass', instrument: '', notes: [], muted: false, solo: false, volume: 1, pan: 0 },
      { id: 'b', name: 'Lead', instrument: '', notes: [], muted: false, solo: true, volume: 1, pan: 0 },
    ];
    expect(soloedTracks(tracks)).toHaveLength(1);
    expect(soloedTracks(tracks)[0].name).toBe('Lead');
  });

  it.todo('VST plugin chain — insert/send effects routing');
  it.todo('waveform visualization — real-time oscilloscope rendering');
});
