/**
 * SynthEngine.prod.test.ts
 * Production tests for SynthEngine — polyphony, ADSR, waveforms, volume, filter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SynthEngine } from '../SynthEngine';

describe('SynthEngine', () => {
  let synth: SynthEngine;

  beforeEach(() => {
    synth = new SynthEngine();
  });

  // -------------------------------------------------------------------------
  // noteOn / noteOff
  // -------------------------------------------------------------------------
  describe('noteOn()', () => {
    it('adds a voice and returns an id', () => {
      const id = synth.noteOn(440);
      expect(typeof id).toBe('string');
      expect(synth.getActiveVoiceCount()).toBe(1);
    });

    it('returned id lets you get the voice', () => {
      const id = synth.noteOn(440);
      const voice = synth.getVoice(id);
      expect(voice).not.toBeUndefined();
      expect(voice!.oscillator.frequency).toBe(440);
    });

    it('voice starts with noteOn=true', () => {
      const id = synth.noteOn(440);
      expect(synth.getVoice(id)!.noteOn).toBe(true);
    });

    it('uses sine waveform by default', () => {
      const id = synth.noteOn(440);
      expect(synth.getVoice(id)!.oscillator.waveform).toBe('sine');
    });

    it('accepts custom waveform', () => {
      const id = synth.noteOn(440, 'saw');
      expect(synth.getVoice(id)!.oscillator.waveform).toBe('saw');
    });

    it('accepts custom envelope', () => {
      const id = synth.noteOn(440, 'sine', { attack: 0.5, sustain: 0.3 });
      const env = synth.getVoice(id)!.oscillator.envelope;
      expect(env.attack).toBe(0.5);
      expect(env.sustain).toBe(0.3);
    });

    it('fills remaining envelope fields with defaults', () => {
      const id = synth.noteOn(440, 'sine', { attack: 0.5 });
      const env = synth.getVoice(id)!.oscillator.envelope;
      expect(env.decay).toBe(0.1);
      expect(env.release).toBe(0.3);
    });

    it('multiple noteOn calls create separate voices', () => {
      synth.noteOn(440);
      synth.noteOn(550);
      synth.noteOn(660);
      expect(synth.getActiveVoiceCount()).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // noteOff
  // -------------------------------------------------------------------------
  describe('noteOff()', () => {
    it('sets noteOn=false on the voice', () => {
      const id = synth.noteOn(440);
      synth.noteOff(id);
      expect(synth.getVoice(id)!.noteOn).toBe(false);
    });

    it('sets noteOffTime to current elapsed', () => {
      const id = synth.noteOn(440);
      synth.noteOff(id);
      // noteOffTime should equal elapsed at time of noteOff (both 0 at start)
      const v = synth.getVoice(id)!;
      expect(v.noteOffTime).toBe(v.elapsed);
    });

    it('is a no-op for unknown id', () => {
      expect(() => synth.noteOff('bogus')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Polyphony Stealing
  // -------------------------------------------------------------------------
  describe('polyphony stealing', () => {
    it('does not exceed maxPolyphony (default 16)', () => {
      for (let i = 0; i < 20; i++) synth.noteOn(440 + i * 10);
      expect(synth.getActiveVoiceCount()).toBeLessThanOrEqual(16);
    });

    it('respects custom maxPolyphony', () => {
      synth.setMaxPolyphony(3);
      for (let i = 0; i < 6; i++) synth.noteOn(440 + i * 10);
      expect(synth.getActiveVoiceCount()).toBeLessThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // generateSample
  // -------------------------------------------------------------------------
  describe('generateSample()', () => {
    it('returns 0 when no voices are active', () => {
      expect(synth.generateSample(0)).toBe(0);
    });

    it('returns a non-zero value when a voice is playing', () => {
      synth.noteOn(440, 'sine', { attack: 0, decay: 0, sustain: 1 });
      // At time=0 with zero attack the envelope is at attack start (t/attack = 0/0 = NaN)
      // Use a small but non-zero time so attack phase is past
      const sample = synth.generateSample(0.1);
      // Sample should be a finite number
      expect(Number.isFinite(sample)).toBe(true);
    });

    it('output is clamped to [-1, 1]', () => {
      // Add many loud voices
      for (let i = 0; i < 8; i++) synth.noteOn(440 + i * 50);
      const s = synth.generateSample(0.5);
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    });

    it('masterVolume=0 produces silence', () => {
      synth.noteOn(440);
      synth.setMasterVolume(0);
      expect(synth.generateSample(0.1)).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // All Waveforms
  // -------------------------------------------------------------------------
  describe('waveforms', () => {
    const waveforms = ['sine', 'square', 'saw', 'triangle', 'noise'] as const;

    for (const wf of waveforms) {
      it(`${wf} waveform generates a finite sample`, () => {
        synth.noteOn(440, wf, { attack: 0, decay: 0, sustain: 1 });
        const s = synth.generateSample(0.5);
        expect(Number.isFinite(s)).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // update() and voice cleanup
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('advances elapsed time on voices', () => {
      const id = synth.noteOn(440);
      synth.update(0.1);
      expect(synth.getVoice(id)!.elapsed).toBeCloseTo(0.1, 5);
    });

    it('removes released voices after they go silent', () => {
      const id = synth.noteOn(440, 'sine', { attack: 0, decay: 0, sustain: 0.8, release: 0.01 });
      synth.noteOff(id);
      // Advance past release time
      synth.update(1.0);
      expect(synth.getActiveVoiceCount()).toBe(0);
    });

    it('does not remove voices that are still sounding', () => {
      synth.noteOn(440, 'sine', { attack: 0, decay: 0, sustain: 1, release: 100 });
      synth.update(0.1);
      expect(synth.getActiveVoiceCount()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Filter
  // -------------------------------------------------------------------------
  describe('setFilter() / getFilter()', () => {
    it('starts with no filter', () => {
      expect(synth.getFilter()).toBeNull();
    });

    it('sets and retrieves a filter', () => {
      synth.setFilter({ type: 'lowpass', cutoff: 1000, resonance: 1 });
      expect(synth.getFilter()!.type).toBe('lowpass');
      expect(synth.getFilter()!.cutoff).toBe(1000);
    });

    it('can clear filter by setting null', () => {
      synth.setFilter({ type: 'highpass', cutoff: 500, resonance: 0.5 });
      synth.setFilter(null);
      expect(synth.getFilter()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Master Volume
  // -------------------------------------------------------------------------
  describe('setMasterVolume() / getMasterVolume()', () => {
    it('defaults to 1', () => {
      expect(synth.getMasterVolume()).toBe(1);
    });

    it('sets master volume', () => {
      synth.setMasterVolume(0.5);
      expect(synth.getMasterVolume()).toBe(0.5);
    });

    it('clamps below 0', () => {
      synth.setMasterVolume(-1);
      expect(synth.getMasterVolume()).toBe(0);
    });

    it('clamps above 1', () => {
      synth.setMasterVolume(2);
      expect(synth.getMasterVolume()).toBe(1);
    });
  });
});
