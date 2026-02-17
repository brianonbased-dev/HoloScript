import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpatialAudioSource } from '../SpatialAudioSource';

describe('SpatialAudioSource', () => {
  let source: SpatialAudioSource;

  beforeEach(() => {
    source = new SpatialAudioSource();
  });

  // ---------- Defaults ----------
  it('defaults to inverse rolloff, not playing', () => {
    expect(source.isPlaying()).toBe(false);
    const cfg = source.getConfig();
    expect(cfg.rolloff).toBe('inverse');
    expect(cfg.volume).toBe(1);
    expect(cfg.spatialBlend).toBe(1);
  });

  // ---------- Playback ----------
  it('play → isPlaying true', () => {
    source.play(5);
    expect(source.isPlaying()).toBe(true);
  });

  it('stop → isPlaying false', () => {
    source.play();
    source.stop();
    expect(source.isPlaying()).toBe(false);
    expect(source.getTime()).toBe(0);
  });

  it('pause and resume', () => {
    source.play();
    source.pause();
    expect(source.isPlaying()).toBe(false);
    source.resume();
    expect(source.isPlaying()).toBe(true);
  });

  // ---------- Position ----------
  it('sets and gets position', () => {
    source.setPosition(1, 2, 3);
    const pos = source.getPosition();
    expect(pos).toEqual({ x: 1, y: 2, z: 3 });
  });

  // ---------- Volume ----------
  it('clamps volume to 0-1', () => {
    source.setVolume(2);
    expect(source.getVolume()).toBe(1);
    source.setVolume(-1);
    expect(source.getVolume()).toBe(0);
  });

  // ---------- Update & Attenuation ----------
  it('advances time on update', () => {
    source.play(10);
    source.update(0.5, { x: 0, y: 0, z: 0 });
    expect(source.getTime()).toBeCloseTo(0.5);
  });

  it('stops after clip duration (non-looping)', () => {
    source.play(1);
    source.update(2, { x: 0, y: 0, z: 0 });
    expect(source.isPlaying()).toBe(false);
  });

  it('loops when loop is enabled', () => {
    source.setLoop(true);
    source.play(1);
    source.update(1.5, { x: 0, y: 0, z: 0 });
    expect(source.isPlaying()).toBe(true);
    expect(source.getTime()).toBeCloseTo(0.5);
  });

  it('attenuates gain with distance (inverse)', () => {
    source.setPosition(10, 0, 0);
    source.play();
    source.update(0.1, { x: 0, y: 0, z: 0 });
    expect(source.getGain()).toBeLessThan(1);
    expect(source.getGain()).toBeGreaterThan(0);
  });

  it('full gain at minDistance', () => {
    source.setPosition(0, 0, 0);
    source.play();
    source.update(0.1, { x: 0, y: 0, z: 0 });
    // At distance 0 (< minDistance), gain should be ~volume
    expect(source.getGain()).toBeCloseTo(1, 0);
  });

  it('computes stereo pan', () => {
    source.setPosition(5, 0, 0); // right of listener
    source.play();
    source.update(0.1, { x: 0, y: 0, z: 0 });
    expect(source.getPan()).toBeGreaterThan(0); // positive = right
  });

  // ---------- Linear rolloff ----------
  it('linear rolloff at midpoint = ~0.5', () => {
    source.setRolloff('linear');
    source.setMinDistance(0);
    source.setMaxDistance(10);
    source.setPosition(5, 0, 0);
    source.play();
    source.update(0.1, { x: 0, y: 0, z: 0 });
    expect(source.getGain()).toBeCloseTo(0.5, 1);
  });

  // ---------- spatialBlend 0 = 2D ----------
  it('spatialBlend 0 produces zero pan', () => {
    source.setSpatialBlend(0);
    source.setPosition(10, 0, 0);
    source.play();
    source.update(0.1, { x: 0, y: 0, z: 0 });
    expect(source.getPan()).toBe(0);
  });
});
