import { describe, it, expect, beforeEach } from 'vitest';
import { MusicGenerator } from '../MusicGenerator';

describe('MusicGenerator', () => {
  let gen: MusicGenerator;

  beforeEach(() => { gen = new MusicGenerator(42); });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  it('defaults to major scale, root 60, 120 BPM', () => {
    expect(gen.getScale()).toBe('major');
    expect(gen.getBPM()).toBe(120);
  });

  it('setScale / setRoot / setBPM update config', () => {
    gen.setScale('minor');
    gen.setBPM(90);
    expect(gen.getScale()).toBe('minor');
    expect(gen.getBPM()).toBe(90);
  });

  // ---------------------------------------------------------------------------
  // Scale Helpers
  // ---------------------------------------------------------------------------

  it('getScaleNotes returns notes in scale over octaves', () => {
    const notes = gen.getScaleNotes(1);
    // C major: C D E F G A B = 7 notes in 1 octave
    expect(notes).toHaveLength(7);
    expect(notes[0]).toBe(60); // Middle C
  });

  it('getScaleNotes with 2 octaves doubles count', () => {
    expect(gen.getScaleNotes(2)).toHaveLength(14);
  });

  it('isInScale validates note membership', () => {
    expect(gen.isInScale(60)).toBe(true);  // C (root)
    expect(gen.isInScale(62)).toBe(true);  // D
    expect(gen.isInScale(61)).toBe(false); // C# not in C major
  });

  // ---------------------------------------------------------------------------
  // Chord Generation
  // ---------------------------------------------------------------------------

  it('generateChord produces valid chord with notes', () => {
    const chord = gen.generateChord(1, 'major');
    expect(chord.quality).toBe('major');
    expect(chord.notes).toHaveLength(3); // major = root + M3 + P5
    expect(chord.notes[0]).toBe(chord.root);
    expect(chord.duration).toBe(4);
  });

  it('generateChord seventh has 4 notes', () => {
    const chord = gen.generateChord(5, '7th');
    expect(chord.notes).toHaveLength(4);
  });

  it('generateProgression returns array of chords', () => {
    const prog = gen.generateProgression([1, 4, 5, 1]);
    expect(prog).toHaveLength(4);
    prog.forEach(chord => {
      expect(chord.notes.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('generateProgression uses custom qualities', () => {
    const prog = gen.generateProgression([1, 4], ['minor', 'dim']);
    expect(prog[0].quality).toBe('minor');
    expect(prog[1].quality).toBe('dim');
  });

  // ---------------------------------------------------------------------------
  // Rhythm Generation
  // ---------------------------------------------------------------------------

  it('generateRhythm returns pattern with correct length', () => {
    const rhythm = gen.generateRhythm(4, 0.5, 4);
    expect(rhythm.beats).toHaveLength(16); // 4 beats × 4 subdivision
    expect(rhythm.subdivision).toBe(4);
  });

  it('beat 1 is always a hit', () => {
    const rhythm = gen.generateRhythm(2, 0.1);
    expect(rhythm.beats[0]).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Melody Generation
  // ---------------------------------------------------------------------------

  it('generateMelody returns notes within time range', () => {
    const melody = gen.generateMelody(2, 0.8);
    expect(melody.length).toBeGreaterThan(0);
    melody.forEach(note => {
      expect(note.pitch).toBeGreaterThanOrEqual(0);
      expect(note.velocity).toBeGreaterThanOrEqual(0);
      expect(note.velocity).toBeLessThanOrEqual(1);
      expect(note.duration).toBeGreaterThan(0);
    });
  });

  it('melody notes are in the current scale', () => {
    const melody = gen.generateMelody(1);
    melody.forEach(note => {
      expect(gen.isInScale(note.pitch)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Seeded Determinism
  // ---------------------------------------------------------------------------

  it('same seed produces same melody', () => {
    const a = new MusicGenerator(123);
    const b = new MusicGenerator(123);
    expect(a.generateMelody(2)).toEqual(b.generateMelody(2));
  });

  it('reseed changes output', () => {
    const melody1 = gen.generateMelody(1);
    gen.reseed(999);
    const melody2 = gen.generateMelody(1);
    // Different seed → highly likely different melody
    expect(JSON.stringify(melody1)).not.toBe(JSON.stringify(melody2));
  });
});
