import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialAudioSource } from '../SpatialAudioSource.js';

describe('SpatialAudioSource', () => {
  let source: SpatialAudioSource;

  const defaultConfig = {
    position: [1, 2, 3] as [number, number, number],
    volume: 0.8,
    refDistance: 1,
    maxDistance: 100,
    rolloffFactor: 1,
    loop: false,
  };

  beforeEach(() => {
    source = new SpatialAudioSource(defaultConfig);
  });

  describe('constructor', () => {
    it('creates with provided config', () => {
      const cfg = source.getConfig();
      expect(cfg.position).toEqual([1, 2, 3]);
      expect(cfg.volume).toBe(0.8);
    });
  });

  describe('play() / isPlaying()', () => {
    it('starts not playing', () => {
      expect(source.isPlaying()).toBe(false);
    });

    it('is playing after play()', () => {
      source.play();
      expect(source.isPlaying()).toBe(true);
    });
  });

  describe('stop()', () => {
    it('stops playback', () => {
      source.play();
      source.stop();
      expect(source.isPlaying()).toBe(false);
    });

    it('does not throw when already stopped', () => {
      expect(() => source.stop()).not.toThrow();
    });
  });

  describe('pause() / resume()', () => {
    it('pause stops playback', () => {
      source.play();
      source.pause();
      expect(source.isPlaying()).toBe(false);
    });

    it('resume restores playback', () => {
      source.play();
      source.pause();
      source.resume();
      expect(source.isPlaying()).toBe(true);
    });
  });

  describe('volume', () => {
    it('getVolume returns initial volume', () => {
      expect(source.getVolume()).toBeCloseTo(0.8);
    });

    it('setVolume updates volume', () => {
      source.setVolume(0.5);
      expect(source.getVolume()).toBeCloseTo(0.5);
    });
  });

  describe('position', () => {
    it('getPosition returns initial position', () => {
      expect(source.getPosition()).toEqual([1, 2, 3]);
    });

    it('setPosition updates position', () => {
      source.setPosition(4, 5, 6);
      expect(source.getPosition()).toEqual([4, 5, 6]);
    });
  });

  describe('getConfig()', () => {
    it('returns a config object', () => {
      const cfg = source.getConfig();
      expect(cfg).toBeDefined();
      expect(cfg.position).toBeDefined();
    });
  });
});
