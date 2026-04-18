import { describe, it, expect, beforeEach } from 'vitest';
import { MusicGenerator } from '@holoscript/engine/audio';

describe('MusicGenerator', () => {
  let mg: MusicGenerator;

  beforeEach(() => {
    mg = new MusicGenerator(42);
  });

  it('getScaleNotes returns correct major scale notes', () => {
    mg.setRoot(60); // C4
    mg.setScale('major');
    const notes = mg.getScaleNotes(1);
    // C major: C(60) D(62) E(64) F(65) G(67) A(69) B(71)
    expect(notes).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });

  it('isInScale checks note membership', () => {
    mg.setScale('major');
    mg.setRoot(60);
    expect(mg.isInScale(60)).toBe(true); // root
    expect(mg.isInScale(62)).toBe(true); // D
    expect(mg.isInScale(61)).toBe(false); // C#
  });

  it('generateChord builds triad from scale degree', () => {
    mg.setScale('major');
    mg.setRoot(60);
    const chord = mg.generateChord(1, 'major');
    expect(chord.notes).toEqual([60, 64, 67]); // C E G
    expect(chord.quality).toBe('major');
  });

  it('generateProgression returns array of chords', () => {
    const prog = mg.generateProgression([1, 4, 5], ['major', 'major', 'major']);
    expect(prog.length).toBe(3);
    expect(prog[0].duration).toBe(4);
  });

  it('generateRhythm always has a hit on beat 1', () => {
    const rhythm = mg.generateRhythm(4, 0.5, 4);
    expect(rhythm.beats[0]).toBe(true);
    expect(rhythm.beats.length).toBe(16); // 4 beats * 4 subdivision
  });

  it('generateMelody produces notes within scale', () => {
    mg.setScale('pentatonic');
    const melody = mg.generateMelody(2, 1.0);
    expect(melody.length).toBeGreaterThan(0);
    for (const note of melody) {
      expect(mg.isInScale(note.pitch)).toBe(true);
    }
  });

  it('generateMelody notes have valid velocity range', () => {
    const melody = mg.generateMelody(2, 0.8);
    for (const note of melody) {
      expect(note.velocity).toBeGreaterThanOrEqual(0.5);
      expect(note.velocity).toBeLessThanOrEqual(1);
    }
  });

  it('seed determinism: same seed produces same output', () => {
    const mg1 = new MusicGenerator(99);
    const mg2 = new MusicGenerator(99);
    const m1 = mg1.generateMelody(1, 1.0);
    const m2 = mg2.generateMelody(1, 1.0);
    expect(m1.map((n) => n.pitch)).toEqual(m2.map((n) => n.pitch));
  });

  it('reseed changes output', () => {
    const mel1 = mg.generateMelody(1, 1.0);
    mg.reseed(999);
    const mel2 = mg.generateMelody(1, 1.0);
    // Very unlikely to be identical with different seeds on enough notes
    const samePitches = mel1.every((n, i) => mel2[i] && n.pitch === mel2[i].pitch);
    if (mel1.length > 2 && mel2.length > 2) {
      expect(samePitches).toBe(false);
    }
  });

  it('setBPM and getBPM work correctly', () => {
    mg.setBPM(140);
    expect(mg.getBPM()).toBe(140);
  });

  it('minor scale uses correct intervals', () => {
    mg.setScale('minor');
    mg.setRoot(60);
    const notes = mg.getScaleNotes(1);
    // C minor: C(60) D(62) Eb(63) F(65) G(67) Ab(68) Bb(70)
    expect(notes).toEqual([60, 62, 63, 65, 67, 68, 70]);
  });
});
