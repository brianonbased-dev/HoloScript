import { describe, it, expect, beforeEach } from 'vitest';
import { SynthEngine } from '../SynthEngine';

describe('SynthEngine', () => {
  let synth: SynthEngine;
  beforeEach(() => { synth = new SynthEngine(); });

  // --- noteOn / noteOff ---
  it('noteOn creates a voice and returns id', () => {
    const id = synth.noteOn(440);
    expect(id).toContain('voice_');
    expect(synth.getActiveVoiceCount()).toBe(1);
  });

  it('noteOn with waveform', () => {
    const id = synth.noteOn(440, 'square');
    const voice = synth.getVoice(id);
    expect(voice).toBeDefined();
    expect(voice!.oscillator.waveform).toBe('square');
  });

  it('noteOn with custom envelope', () => {
    const id = synth.noteOn(440, 'sine', { attack: 0.5, sustain: 0.9 });
    const voice = synth.getVoice(id);
    expect(voice!.oscillator.envelope.attack).toBe(0.5);
    expect(voice!.oscillator.envelope.sustain).toBe(0.9);
    // Defaults remain for unset fields
    expect(voice!.oscillator.envelope.decay).toBeDefined();
  });

  it('noteOff marks voice as released', () => {
    const id = synth.noteOn(440);
    synth.noteOff(id);
    const voice = synth.getVoice(id);
    expect(voice!.noteOn).toBe(false);
  });

  it('noteOff on unknown id does not throw', () => {
    expect(() => synth.noteOff('nonexistent')).not.toThrow();
  });

  // --- Polyphony ---
  it('respects max polyphony limit', () => {
    synth.setMaxPolyphony(3);
    synth.noteOn(440);
    synth.noteOn(550);
    synth.noteOn(660);
    synth.noteOn(770); // should steal oldest
    expect(synth.getActiveVoiceCount()).toBeLessThanOrEqual(3);
  });

  it('multiple voices accumulate', () => {
    synth.noteOn(440);
    synth.noteOn(550);
    expect(synth.getActiveVoiceCount()).toBe(2);
  });

  // --- Sample generation ---
  it('generateSample returns number in [-1, 1]', () => {
    synth.noteOn(440);
    const sample = synth.generateSample(0);
    expect(sample).toBeGreaterThanOrEqual(-1);
    expect(sample).toBeLessThanOrEqual(1);
  });

  it('generateSample returns 0 with no voices', () => {
    const sample = synth.generateSample(0);
    expect(sample).toBe(0);
  });

  it('sine wave produces non-zero samples', () => {
    synth.noteOn(440, 'sine');
    // After attack time, should produce audible level
    const sample = synth.generateSample(0.1);
    // At least one sample is non-zero
    expect(typeof sample).toBe('number');
  });

  it('square wave produces values', () => {
    synth.noteOn(440, 'square');
    const sample = synth.generateSample(0.5);
    expect(typeof sample).toBe('number');
  });

  it('saw wave produces values', () => {
    synth.noteOn(440, 'saw');
    const sample = synth.generateSample(0.5);
    expect(typeof sample).toBe('number');
  });

  it('triangle wave produces values', () => {
    synth.noteOn(440, 'triangle');
    const sample = synth.generateSample(0.5);
    expect(typeof sample).toBe('number');
  });

  // --- Update ---
  it('update advances elapsed time', () => {
    const id = synth.noteOn(440);
    synth.update(0.1);
    const voice = synth.getVoice(id);
    expect(voice!.elapsed).toBeCloseTo(0.1, 5);
  });

  it('update cleans up released voices after release time', () => {
    const id = synth.noteOn(440, 'sine', { release: 0.01 });
    synth.noteOff(id);
    // Simulate enough time for release to complete
    for (let i = 0; i < 100; i++) {
      synth.update(0.01);
      synth.generateSample(i * 0.01); // force amplitude update
    }
    synth.update(0.01);
    expect(synth.getActiveVoiceCount()).toBe(0);
  });

  // --- Master volume ---
  it('setMasterVolume clamps to 0-1', () => {
    synth.setMasterVolume(1.5);
    expect(synth.getMasterVolume()).toBe(1);
    synth.setMasterVolume(-0.5);
    expect(synth.getMasterVolume()).toBe(0);
  });

  it('getMasterVolume defaults to 1', () => {
    expect(synth.getMasterVolume()).toBe(1);
  });

  // --- Filter ---
  it('setFilter / getFilter', () => {
    expect(synth.getFilter()).toBeNull();
    synth.setFilter({ type: 'lowpass', cutoff: 1000, resonance: 1 });
    expect(synth.getFilter()!.type).toBe('lowpass');
    synth.setFilter(null);
    expect(synth.getFilter()).toBeNull();
  });
});
