import { describe, it, expect, beforeEach } from 'vitest';
import { AudioFilter } from '../audio/AudioFilter';

// =============================================================================
// C259 — Audio Filter
// =============================================================================

describe('AudioFilter', () => {
  let filter: AudioFilter;
  beforeEach(() => {
    filter = new AudioFilter();
  });

  it('addBand creates a band', () => {
    filter.addBand('b1', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    expect(filter.getBandCount()).toBe(1);
  });

  it('removeBand deletes band', () => {
    filter.addBand('b1', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.removeBand('b1');
    expect(filter.getBandCount()).toBe(0);
  });

  it('setBandEnabled toggles band', () => {
    filter.addBand('b1', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.setBandEnabled('b1', false);
    expect(filter.getBand('b1')!.enabled).toBe(false);
    expect(filter.getEnabledBandCount()).toBe(0);
  });

  it('setFrequency clamps to 20-20000', () => {
    filter.addBand('b1', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.setFrequency('b1', 5);
    expect(filter.getBand('b1')!.config.frequency).toBe(20);
    filter.setFrequency('b1', 50000);
    expect(filter.getBand('b1')!.config.frequency).toBe(20000);
  });

  it('setQ clamps to 0.1-30', () => {
    filter.addBand('b1', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.setQ('b1', 0);
    expect(filter.getBand('b1')!.config.q).toBe(0.1);
    filter.setQ('b1', 100);
    expect(filter.getBand('b1')!.config.q).toBe(30);
  });

  it('setGain clamps to -24 to 24', () => {
    filter.addBand('b1', { type: 'peaking', frequency: 1000, q: 1, gain: 0 });
    filter.setGain('b1', -50);
    expect(filter.getBand('b1')!.config.gain).toBe(-24);
    filter.setGain('b1', 50);
    expect(filter.getBand('b1')!.config.gain).toBe(24);
  });

  it('lowpass response: 0 dB below cutoff, negative above', () => {
    filter.addBand('lp', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    expect(filter.getResponse(500)).toBe(0);
    expect(filter.getResponse(2000)).toBeLessThan(0);
  });

  it('highpass response: 0 dB above cutoff, negative below', () => {
    filter.addBand('hp', { type: 'highpass', frequency: 1000, q: 1, gain: 0 });
    expect(filter.getResponse(2000)).toBe(0);
    expect(filter.getResponse(500)).toBeLessThan(0);
  });

  it('peaking response: gain at center, 0 far away', () => {
    filter.addBand('pk', { type: 'peaking', frequency: 1000, q: 2, gain: 6 });
    expect(filter.getResponse(1000)).toBeCloseTo(6);
    expect(filter.getResponse(5000)).toBe(0);
  });

  it('notch response: negative at center, 0 far away', () => {
    filter.addBand('n', { type: 'notch', frequency: 1000, q: 2, gain: 12 });
    expect(filter.getResponse(1000)).toBe(-12);
    expect(filter.getResponse(5000)).toBe(0);
  });

  it('disabled band contributes 0', () => {
    filter.addBand('lp', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.setBandEnabled('lp', false);
    expect(filter.getResponse(5000)).toBe(0);
  });

  it('multiple bands sum gains', () => {
    filter.addBand('p1', { type: 'peaking', frequency: 1000, q: 2, gain: 3 });
    filter.addBand('p2', { type: 'peaking', frequency: 1000, q: 2, gain: 4 });
    expect(filter.getResponse(1000)).toBeCloseTo(7);
  });
});
