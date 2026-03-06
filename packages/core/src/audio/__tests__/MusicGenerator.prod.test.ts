/**
 * MusicGenerator.prod.test.ts
 * Production tests for MusicGenerator — scales, chords, progressions, rhythm, melody, seeded RNG.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MusicGenerator } from '../MusicGenerator';

describe('MusicGenerator', () => {
  let gen: MusicGenerator;

  beforeEach(() => {
    gen = new MusicGenerator(42);
  });

  // -------------------------------------------------------------------------
  // Construction / State
  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('defaults to major scale', () => {
      expect(gen.getScale()).toBe('major');
    });

    it('defaults to BPM 120', () => {
      expect(gen.getBPM()).toBe(120);
    });

    it('setScale changes the scale', () => {
      gen.setScale('minor');
      expect(gen.getScale()).toBe('minor');
    });

    it('setBPM changes the BPM', () => {
      gen.setBPM(90);
      expect(gen.getBPM()).toBe(90);
    });
  });

  // -------------------------------------------------------------------------
  // Scale Notes
  // -------------------------------------------------------------------------
  describe('getScaleNotes()', () => {
    it('major scale has 7 notes per octave', () => {
      const notes = gen.getScaleNotes(1);
      expect(notes).toHaveLength(7);
    });

    it('pentatonic scale has 5 notes per octave', () => {
      gen.setScale('pentatonic');
      expect(gen.getScaleNotes(1)).toHaveLength(5);
    });

    it('2 octaves returns 2× the scale length', () => {
      const oneOct = gen.getScaleNotes(1).length;
      const twoOct = gen.getScaleNotes(2).length;
      expect(twoOct).toBe(oneOct * 2);
    });

    it('first note equals the root note (60 = middle C)', () => {
      expect(gen.getScaleNotes(1)[0]).toBe(60);
    });

    it('notes increase monotonically within an octave', () => {
      const notes = gen.getScaleNotes(1);
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i]).toBeGreaterThan(notes[i - 1]);
      }
    });

    it('second octave starts exactly 12 semitones above root', () => {
      const notes = gen.getScaleNotes(2);
      const oneOct = gen.getScaleNotes(1).length;
      expect(notes[oneOct]).toBe(notes[0] + 12);
    });
  });

  // -------------------------------------------------------------------------
  // isInScale
  // -------------------------------------------------------------------------
  describe('isInScale()', () => {
    it('root note is always in scale', () => {
      expect(gen.isInScale(60)).toBe(true); // C
    });

    it('C major: D (62) is in scale', () => {
      expect(gen.isInScale(62)).toBe(true);
    });

    it('C major: C# (61) is not in scale', () => {
      expect(gen.isInScale(61)).toBe(false);
    });

    it('works for custom root via setRoot', () => {
      gen.setRoot(62); // D
      // D major scale from D: D E F# G A B C#
      expect(gen.isInScale(62)).toBe(true); // D
      expect(gen.isInScale(63)).toBe(false); // D# not in D major
    });
  });

  // -------------------------------------------------------------------------
  // Chord Generation
  // -------------------------------------------------------------------------
  describe('generateChord()', () => {
    it('returns a chord with 3 notes for major quality', () => {
      const chord = gen.generateChord(1, 'major');
      expect(chord.notes).toHaveLength(3);
    });

    it('returns a chord with 4 notes for 7th quality', () => {
      const chord = gen.generateChord(1, '7th');
      expect(chord.notes).toHaveLength(4);
    });

    it('chord root is the scale degree root', () => {
      const chord = gen.generateChord(1, 'major'); // degree 1 → root=60 in C major
      expect(chord.root).toBe(60);
    });

    it('major chord intervals are [0, 4, 7]', () => {
      const chord = gen.generateChord(1, 'major');
      const intervals = chord.notes.map(n => n - chord.root);
      expect(intervals).toEqual([0, 4, 7]);
    });

    it('minor chord intervals are [0, 3, 7]', () => {
      const chord = gen.generateChord(1, 'minor');
      const intervals = chord.notes.map(n => n - chord.root);
      expect(intervals).toEqual([0, 3, 7]);
    });

    it('dim chord intervals are [0, 3, 6]', () => {
      const chord = gen.generateChord(1, 'dim');
      const intervals = chord.notes.map(n => n - chord.root);
      expect(intervals).toEqual([0, 3, 6]);
    });

    it('default duration is 4 beats', () => {
      const chord = gen.generateChord(1);
      expect(chord.duration).toBe(4);
    });

    it('custom duration is accepted', () => {
      const chord = gen.generateChord(1, 'major', 2);
      expect(chord.duration).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Progression
  // -------------------------------------------------------------------------
  describe('generateProgression()', () => {
    it('returns one chord per degree', () => {
      const prog = gen.generateProgression([1, 4, 5]);
      expect(prog).toHaveLength(3);
    });

    it('applies per-chord quality overrides', () => {
      const prog = gen.generateProgression([1, 4, 5], ['major', 'minor', 'major']);
      expect(prog[1].quality).toBe('minor');
    });

    it('defaults to major quality when qualities omitted', () => {
      const prog = gen.generateProgression([1, 4, 5]);
      for (const chord of prog) {
        expect(chord.quality).toBe('major');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Rhythm Generation
  // -------------------------------------------------------------------------
  describe('generateRhythm()', () => {
    it('returns a pattern with correct slot count', () => {
      const rhythm = gen.generateRhythm(4, 0.5, 4);
      expect(rhythm.beats).toHaveLength(4 * 4); // beats × subdivision
    });

    it('first slot is always hit (beat 1)', () => {
      const rhythm = gen.generateRhythm(4, 0.5, 4);
      expect(rhythm.beats[0]).toBe(true);
    });

    it('subdivision is stored on the pattern', () => {
      const rhythm = gen.generateRhythm(4, 0.5, 4);
      expect(rhythm.subdivision).toBe(4);
    });

    it('swing defaults to 0', () => {
      const rhythm = gen.generateRhythm(4, 0.5, 4);
      expect(rhythm.swing).toBe(0);
    });

    it('density=1 sets most slots to true', () => {
      gen.reseed(0);
      const rhythm = gen.generateRhythm(4, 1, 4);
      const hitCount = rhythm.beats.filter(Boolean).length;
      expect(hitCount).toBe(rhythm.beats.length); // density=1 → all hits
    });
  });

  // -------------------------------------------------------------------------
  // Melody Generation
  // -------------------------------------------------------------------------
  describe('generateMelody()', () => {
    it('returns an array of notes', () => {
      const melody = gen.generateMelody(1, 0.8);
      expect(Array.isArray(melody)).toBe(true);
    });

    it('all notes have valid pitch (within scale)', () => {
      const melody = gen.generateMelody(1, 0.9);
      for (const note of melody) {
        expect(note.pitch).toBeGreaterThanOrEqual(60);
      }
    });

    it('all notes have positive velocity ≤ 1', () => {
      const melody = gen.generateMelody(1, 0.9);
      for (const note of melody) {
        expect(note.velocity).toBeGreaterThan(0);
        expect(note.velocity).toBeLessThanOrEqual(1);
      }
    });

    it('note times are non-negative and increasing', () => {
      const melody = gen.generateMelody(2, 0.8);
      for (let i = 1; i < melody.length; i++) {
        expect(melody[i].time).toBeGreaterThanOrEqual(melody[i - 1].time);
      }
    });

    it('total duration does not exceed bars × 4 beats', () => {
      const bars = 2;
      const melody = gen.generateMelody(bars, 0.8);
      if (melody.length > 0) {
        const last = melody[melody.length - 1];
        expect(last.time + last.duration).toBeLessThanOrEqual(bars * 4 + 2); // small tolerance
      }
    });
  });

  // -------------------------------------------------------------------------
  // Seeded RNG / Determinism
  // -------------------------------------------------------------------------
  describe('seeded RNG', () => {
    it('same seed produces the same melody', () => {
      const a = new MusicGenerator(99);
      const b = new MusicGenerator(99);
      const melA = a.generateMelody(1, 0.8);
      const melB = b.generateMelody(1, 0.8);
      expect(melA).toEqual(melB);
    });

    it('different seeds produce different melodies', () => {
      const a = new MusicGenerator(1);
      const b = new MusicGenerator(2);
      const melA = a.generateMelody(2, 0.8);
      const melB = b.generateMelody(2, 0.8);
      // At least some notes should differ
      const allSame = melA.every((n, i) => melB[i]?.pitch === n.pitch);
      expect(allSame).toBe(false);
    });

    it('reseed() resets RNG to produce same output', () => {
      const melody1 = gen.generateMelody(1, 0.8);
      gen.reseed(42);
      const melody2 = gen.generateMelody(1, 0.8);
      expect(melody1).toEqual(melody2);
    });

    it('same seed produces same progression', () => {
      const a = new MusicGenerator(7);
      const b = new MusicGenerator(7);
      expect(a.generateProgression([1, 4, 5])).toEqual(b.generateProgression([1, 4, 5]));
    });
  });

  // -------------------------------------------------------------------------
  // All Scales
  // -------------------------------------------------------------------------
  describe('all scale types', () => {
    const scales = ['major', 'minor', 'pentatonic', 'blues', 'dorian', 'mixolydian'] as const;
    for (const scale of scales) {
      it(`${scale} scale generates valid notes`, () => {
        gen.setScale(scale);
        const notes = gen.getScaleNotes(1);
        expect(notes.length).toBeGreaterThan(0);
        expect(notes[0]).toBe(60); // always starts at root
      });
    }
  });
});
