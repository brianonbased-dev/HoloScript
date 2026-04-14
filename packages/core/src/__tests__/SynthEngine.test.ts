import { describe, it, expect, beforeEach } from 'vitest';
import { Audio } from '@holoscript/engine';

const { SynthEngine } = Audio;

describe('SynthEngine', () => {
  let synth: any; // Using any for local type since SynthEngine might not be exported as type directly

  beforeEach(() => {
    synth = new SynthEngine();
  });

  it('noteOn creates a voice and returns id', () => {
    const id = synth.noteOn(440, 'sine');
    expect(id).toBeDefined();
    expect(synth.getActiveVoiceCount()).toBe(1);
  });

  it('noteOff marks voice as released', () => {
    const id = synth.noteOn(440);
    synth.noteOff(id);
    const v = synth.getVoice(id);
    expect(v?.noteOn).toBe(false);
  });

  it('generates sine sample at time', () => {
    synth.noteOn(440, 'sine', { attack: 0, decay: 0, sustain: 1, release: 0.1 });
    // After attack (0), envelope is at sustain (1)
    // At t=0, sin(0)=0. At t=1/(4*440) ≈ quarter period → sin(pi/2)=1
    const s = synth.generateSample(1 / (4 * 440));
    expect(s).toBeGreaterThan(0);
  });

  it('square wave returns +1 or -1', () => {
    synth.noteOn(440, 'square', { attack: 0, decay: 0, sustain: 1, release: 0.1 });
    const s = synth.generateSample(0.0001);
    expect(s === 1 || s === -1).toBe(true);
  });

  it('polyphony limit steals oldest voice', () => {
    synth.setMaxPolyphony(2);
    const id1 = synth.noteOn(220);
    // Advance time so id1 has highest elapsed → is "oldest"
    synth.update(1);
    const id2 = synth.noteOn(330);
    synth.noteOn(440); // should steal id1 (highest elapsed)
    expect(synth.getActiveVoiceCount()).toBe(2);
    expect(synth.getVoice(id1)).toBeUndefined();
    expect(synth.getVoice(id2)).toBeDefined();
  });

  it('master volume clamps to [0, 1]', () => {
    synth.setMasterVolume(2);
    expect(synth.getMasterVolume()).toBe(1);
    synth.setMasterVolume(-1);
    expect(synth.getMasterVolume()).toBe(0);
  });

  it('filter can be set and retrieved', () => {
    synth.setFilter({ type: 'lowpass', cutoff: 1000, resonance: 1 });
    expect(synth.getFilter()?.type).toBe('lowpass');
  });

  it('update removes dead voices', () => {
    const id = synth.noteOn(440, 'sine', { attack: 0, decay: 0, sustain: 1, release: 0.01 });
    synth.noteOff(id);
    // Advance time past release
    synth.update(1);
    expect(synth.getActiveVoiceCount()).toBe(0);
  });

  it('ADSR attack ramps up', () => {
    synth.noteOn(440, 'sine', { attack: 1, decay: 0, sustain: 1, release: 0 });
    // At t=0 envelope = 0, need to update elapsed
    const v = synth.getVoice([...synth['voices'].keys()][0])!;
    v.elapsed = 0.5;
    const s = synth.generateSample(0);
    // At 50% of attack, envelope = 0.5
    expect(Math.abs(s)).toBeLessThanOrEqual(0.5 + 0.01);
  });

  it('output is clamped to [-1, 1]', () => {
    // Create many loud voices
    for (let i = 0; i < 10; i++)
      synth.noteOn(440, 'sine', { attack: 0, decay: 0, sustain: 1, release: 0.1 });
    const s = synth.generateSample(1 / (4 * 440));
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThanOrEqual(-1);
  });

  it('saw wave ranges between -1 and 1', () => {
    synth.noteOn(440, 'saw', { attack: 0, decay: 0, sustain: 1, release: 0.1 });
    const s = synth.generateSample(0.001);
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
  });
});
