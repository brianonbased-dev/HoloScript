import { describe, it, expect, beforeEach } from 'vitest';
import { AudioFilter } from '../AudioFilter';

describe('AudioFilter', () => {
  let filter: AudioFilter;

  beforeEach(() => {
    filter = new AudioFilter();
  });

  // ---------------------------------------------------------------------------
  // Band Management
  // ---------------------------------------------------------------------------

  it('addBand creates a filter band', () => {
    filter.addBand('lp1', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    expect(filter.getBandCount()).toBe(1);
    expect(filter.getBand('lp1')).toBeDefined();
  });

  it('removeBand deletes band', () => {
    filter.addBand('hp', { type: 'highpass', frequency: 200, q: 1, gain: 0 });
    filter.removeBand('hp');
    expect(filter.getBandCount()).toBe(0);
  });

  it('setBandEnabled toggles band', () => {
    filter.addBand('b', { type: 'lowpass', frequency: 500, q: 1, gain: 0 });
    filter.setBandEnabled('b', false);
    expect(filter.getBand('b')!.enabled).toBe(false);
    expect(filter.getEnabledBandCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Parameter Setting
  // ---------------------------------------------------------------------------

  it('setFrequency clamps to 20-20000', () => {
    filter.addBand('b', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.setFrequency('b', 5);
    expect(filter.getBand('b')!.config.frequency).toBe(20);
    filter.setFrequency('b', 50000);
    expect(filter.getBand('b')!.config.frequency).toBe(20000);
  });

  it('setQ clamps to 0.1-30', () => {
    filter.addBand('b', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.setQ('b', 0.01);
    expect(filter.getBand('b')!.config.q).toBeCloseTo(0.1);
    filter.setQ('b', 100);
    expect(filter.getBand('b')!.config.q).toBe(30);
  });

  it('setGain clamps to -24 to 24', () => {
    filter.addBand('b', { type: 'peaking', frequency: 1000, q: 1, gain: 0 });
    filter.setGain('b', -50);
    expect(filter.getBand('b')!.config.gain).toBe(-24);
    filter.setGain('b', 50);
    expect(filter.getBand('b')!.config.gain).toBe(24);
  });

  // ---------------------------------------------------------------------------
  // Frequency Response
  // ---------------------------------------------------------------------------

  it('lowpass: no attenuation below cutoff', () => {
    filter.addBand('lp', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    expect(filter.getResponse(500)).toBe(0);
  });

  it('lowpass: attenuates above cutoff', () => {
    filter.addBand('lp', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    expect(filter.getResponse(2000)).toBeLessThan(0);
  });

  it('highpass: no attenuation above cutoff', () => {
    filter.addBand('hp', { type: 'highpass', frequency: 200, q: 1, gain: 0 });
    expect(filter.getResponse(500)).toBe(0);
  });

  it('highpass: attenuates below cutoff', () => {
    filter.addBand('hp', { type: 'highpass', frequency: 200, q: 1, gain: 0 });
    expect(filter.getResponse(100)).toBeLessThan(0);
  });

  it('peaking boosts at center frequency', () => {
    filter.addBand('pk', { type: 'peaking', frequency: 1000, q: 2, gain: 6 });
    expect(filter.getResponse(1000)).toBeCloseTo(6);
  });

  it('disabled band does not contribute', () => {
    filter.addBand('lp', { type: 'lowpass', frequency: 500, q: 2, gain: 0 });
    filter.setBandEnabled('lp', false);
    expect(filter.getResponse(2000)).toBe(0);
  });

  it('multiple bands stack responses', () => {
    filter.addBand('pk1', { type: 'peaking', frequency: 1000, q: 2, gain: 3 });
    filter.addBand('pk2', { type: 'peaking', frequency: 1000, q: 2, gain: 3 });
    expect(filter.getResponse(1000)).toBeCloseTo(6);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getEnabledBandCount counts enabled bands', () => {
    filter.addBand('a', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });
    filter.addBand('b', { type: 'highpass', frequency: 200, q: 1, gain: 0 });
    filter.setBandEnabled('b', false);
    expect(filter.getEnabledBandCount()).toBe(1);
  });
});
