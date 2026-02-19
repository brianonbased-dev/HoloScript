/**
 * AudioFilter — Production Test Suite
 *
 * Covers: addBand/removeBand, setBandEnabled, setFrequency (clamp),
 * setQ (clamp), setGain (clamp), getResponse per filter type
 * (lowpass/highpass/bandpass/notch/peaking), disabled band exclusion,
 * cascaded bands, getBand, getBandCount, getEnabledBandCount.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioFilter, FilterConfig } from '../AudioFilter';

const lp = (freq = 1000, q = 1, gain = 0): FilterConfig => ({ type: 'lowpass', frequency: freq, q, gain });
const hp = (freq = 1000, q = 1, gain = 0): FilterConfig => ({ type: 'highpass', frequency: freq, q, gain });
const bp = (freq = 1000, q = 1, gain = 0): FilterConfig => ({ type: 'bandpass', frequency: freq, q, gain });
const notch = (freq = 1000, q = 1, gain = 12): FilterConfig => ({ type: 'notch', frequency: freq, q, gain });
const peak = (freq = 1000, q = 1, gain = 6): FilterConfig => ({ type: 'peaking', frequency: freq, q, gain });

describe('AudioFilter — Production', () => {
  let f: AudioFilter;

  beforeEach(() => {
    f = new AudioFilter();
  });

  // ─── Band CRUD ─────────────────────────────────────────────────────
  it('addBand adds a band', () => {
    f.addBand('lo', lp());
    expect(f.getBandCount()).toBe(1);
  });

  it('removeBand removes a band', () => {
    f.addBand('lo', lp());
    f.removeBand('lo');
    expect(f.getBandCount()).toBe(0);
  });

  it('getBand returns the band', () => {
    f.addBand('lo', lp(400));
    expect(f.getBand('lo')?.config.frequency).toBe(400);
  });

  it('getBand returns undefined for unknown band', () => {
    expect(f.getBand('ghost')).toBeUndefined();
  });

  it('getBandCount returns correct count', () => {
    f.addBand('a', lp()); f.addBand('b', hp());
    expect(f.getBandCount()).toBe(2);
  });

  // ─── setBandEnabled ────────────────────────────────────────────────
  it('setBandEnabled false disables band', () => {
    f.addBand('lo', lp());
    f.setBandEnabled('lo', false);
    expect(f.getBand('lo')?.enabled).toBe(false);
  });

  it('getEnabledBandCount reflects enabled bands', () => {
    f.addBand('a', lp()); f.addBand('b', hp());
    f.setBandEnabled('a', false);
    expect(f.getEnabledBandCount()).toBe(1);
  });

  it('disabled band excluded from getResponse', () => {
    f.addBand('pk', peak());
    const beforeDisable = f.getResponse(1000);
    f.setBandEnabled('pk', false);
    expect(f.getResponse(1000)).toBe(0);
    expect(beforeDisable).not.toBe(0);
  });

  // ─── setFrequency clamp ────────────────────────────────────────────
  it('setFrequency clamps below 20 Hz', () => {
    f.addBand('lo', lp(1000));
    f.setFrequency('lo', 5);
    expect(f.getBand('lo')!.config.frequency).toBe(20);
  });

  it('setFrequency clamps above 20000 Hz', () => {
    f.addBand('lo', lp(1000));
    f.setFrequency('lo', 99999);
    expect(f.getBand('lo')!.config.frequency).toBe(20000);
  });

  // ─── setQ clamp ────────────────────────────────────────────────────
  it('setQ clamps below 0.1', () => {
    f.addBand('lo', lp());
    f.setQ('lo', 0);
    expect(f.getBand('lo')!.config.q).toBe(0.1);
  });

  it('setQ clamps above 30', () => {
    f.addBand('lo', lp());
    f.setQ('lo', 999);
    expect(f.getBand('lo')!.config.q).toBe(30);
  });

  // ─── setGain clamp ─────────────────────────────────────────────────
  it('setGain clamps below -24 dB', () => {
    f.addBand('pk', peak());
    f.setGain('pk', -99);
    expect(f.getBand('pk')!.config.gain).toBe(-24);
  });

  it('setGain clamps above 24 dB', () => {
    f.addBand('pk', peak());
    f.setGain('pk', 99);
    expect(f.getBand('pk')!.config.gain).toBe(24);
  });

  // ─── getResponse — lowpass ─────────────────────────────────────────
  it('lowpass: 0 dB below cutoff', () => {
    f.addBand('lo', lp(1000, 1));
    expect(f.getResponse(500)).toBe(0);
  });

  it('lowpass: attenuates above cutoff', () => {
    f.addBand('lo', lp(1000, 1));
    expect(f.getResponse(2000)).toBeLessThan(0);
  });

  // ─── getResponse — highpass ────────────────────────────────────────
  it('highpass: 0 dB above cutoff', () => {
    f.addBand('hi', hp(1000, 1));
    expect(f.getResponse(2000)).toBe(0);
  });

  it('highpass: attenuates below cutoff', () => {
    f.addBand('hi', hp(1000, 1));
    expect(f.getResponse(500)).toBeLessThan(0);
  });

  // ─── getResponse — bandpass ────────────────────────────────────────
  it('bandpass: 0 dB at center frequency', () => {
    f.addBand('bp', bp(1000, 10));
    expect(f.getResponse(1000)).toBe(0);
  });

  it('bandpass: attenuates far from center', () => {
    f.addBand('bp', bp(1000, 10));
    expect(f.getResponse(5000)).toBeLessThan(0);
  });

  // ─── getResponse — notch ───────────────────────────────────────────
  it('notch: attenuates at center frequency', () => {
    f.addBand('n', notch(1000, 5, 12));
    expect(f.getResponse(1000)).toBeLessThan(0);
  });

  it('notch: 0 dB far from center', () => {
    f.addBand('n', notch(1000, 5, 12));
    expect(f.getResponse(10000)).toBe(0);
  });

  // ─── getResponse — peaking ─────────────────────────────────────────
  it('peaking: full gain at center frequency', () => {
    f.addBand('pk', peak(1000, 1, 6));
    expect(f.getResponse(1000)).toBeCloseTo(6, 1);
  });

  it('peaking: 0 dB far outside bandwidth', () => {
    f.addBand('pk', peak(1000, 1, 6));
    expect(f.getResponse(10000)).toBe(0);
  });

  // ─── Cascaded bands ────────────────────────────────────────────────
  it('cascaded bands sum their responses', () => {
    f.addBand('pk1', peak(1000, 1, 3));
    f.addBand('pk2', peak(1000, 1, 3));
    expect(f.getResponse(1000)).toBeCloseTo(6, 1); // 3+3
  });

  // ─── Empty filter ──────────────────────────────────────────────────
  it('empty filter returns 0 response', () => {
    expect(f.getResponse(1000)).toBe(0);
    expect(f.getBandCount()).toBe(0);
    expect(f.getEnabledBandCount()).toBe(0);
  });
});
