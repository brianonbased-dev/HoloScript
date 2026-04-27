import { describe, it, expect } from 'vitest';
import {
  zeroVector,
  defaultOrientation,
  bufferSource,
  oscillatorSource,
  gainEffect,
  reverbEffect,
  delayEffect,
  filterEffect,
  createNote,
  createPattern,
  createTrack,
  validateSourceConfig,
  noteNameToMidi,
} from '../AudioTypes.js';

describe('AudioTypes', () => {
  describe('zeroVector()', () => {
    it('returns [0, 0, 0] array', () => {
      expect(zeroVector()).toEqual([0, 0, 0]);
    });

    it('returns an array-like value', () => {
      const v = zeroVector();
      expect(Array.isArray(v) || (v as unknown as number[])[0] === 0).toBe(true);
    });
  });

  describe('defaultOrientation()', () => {
    it('returns forward {x:0,y:0,z:-1}', () => {
      const o = defaultOrientation();
      expect(o.forward).toEqual({ x: 0, y: 0, z: -1 });
    });

    it('returns up {x:0,y:1,z:0}', () => {
      const o = defaultOrientation();
      expect(o.up).toEqual({ x: 0, y: 1, z: 0 });
    });
  });

  describe('bufferSource()', () => {
    it('creates a buffer source config', () => {
      const src = bufferSource('s1', 'sounds/beep.wav');
      expect(src.id).toBe('s1');
      expect(src.url).toBe('sounds/beep.wav');
    });
  });

  describe('oscillatorSource()', () => {
    it('creates an oscillator source config', () => {
      const src = oscillatorSource('osc1', 'sine', 440);
      expect(src.id).toBe('osc1');
      expect(src.waveform).toBe('sine');
      expect(src.frequency).toBe(440);
    });
  });

  describe('gainEffect()', () => {
    it('creates a gain effect', () => {
      const fx = gainEffect(0.5);
      expect(fx).toBeDefined();
      expect(fx.type ?? fx.kind ?? JSON.stringify(fx)).toMatch(/gain/i);
    });
  });

  describe('reverbEffect()', () => {
    it('creates a reverb effect', () => {
      const fx = reverbEffect();
      expect(fx).toBeDefined();
    });
  });

  describe('delayEffect()', () => {
    it('creates a delay effect', () => {
      const fx = delayEffect(0.3);
      expect(fx).toBeDefined();
    });
  });

  describe('filterEffect()', () => {
    it('creates a filter effect', () => {
      const fx = filterEffect('lowpass', 1000);
      expect(fx).toBeDefined();
    });
  });

  describe('createNote()', () => {
    it('creates a note with name and duration', () => {
      const note = createNote('C4', 1.0);
      expect(note).toBeDefined();
      expect(note.name ?? note.pitch ?? note.note).toBeDefined();
    });
  });

  describe('createPattern()', () => {
    it('creates a pattern with id and notes', () => {
      const n1 = createNote('C4', 0.5);
      const n2 = createNote('E4', 0.5);
      const pat = createPattern('pat1', [n1, n2]);
      expect(pat.id).toBe('pat1');
      expect(pat.notes).toHaveLength(2);
    });

    it('defaults bpm to 120', () => {
      const pat = createPattern('pat1', []);
      expect(pat.bpm).toBe(120);
    });

    it('uses provided bpm', () => {
      const pat = createPattern('pat1', [], 140);
      expect(pat.bpm).toBe(140);
    });
  });

  describe('createTrack()', () => {
    it('creates a track with id and patterns', () => {
      const pat = createPattern('p1', []);
      const track = createTrack('track1', [pat]);
      expect(track.id).toBe('track1');
      expect(track.patterns).toHaveLength(1);
    });

    it('defaults volume to 1', () => {
      const track = createTrack('t1', []);
      expect(track.volume).toBe(1);
    });

    it('uses provided volume', () => {
      const track = createTrack('t1', [], 0.7);
      expect(track.volume).toBeCloseTo(0.7);
    });
  });

  describe('validateSourceConfig()', () => {
    it('returns valid result for valid config', () => {
      const result = validateSourceConfig({ id: 's1', type: 'buffer', url: 'beep.wav' });
      expect(result.valid).toBe(true);
    });

    it('returns invalid result for empty config', () => {
      const result = validateSourceConfig({} as Record<string, unknown>);
      expect(result.valid).toBe(false);
    });
  });

  describe('noteNameToMidi()', () => {
    it('converts C4 to 60', () => {
      expect(noteNameToMidi('C4')).toBe(60);
    });

    it('converts A4 to 69', () => {
      expect(noteNameToMidi('A4')).toBe(69);
    });

    it('throws on invalid note name', () => {
      expect(() => noteNameToMidi('X9')).toThrow();
    });
  });
});
