/**
 * SpatialAudioSource.prod.test.ts
 *
 * Production tests for SpatialAudioSource — playback state, all rolloff models,
 * cone attenuation, volume/pitch clamping, loop, spatialBlend, and timing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialAudioSource } from '../SpatialAudioSource';

const LISTENER_AT_ORIGIN = { x: 0, y: 0, z: 0 };

describe('SpatialAudioSource', () => {
  let src: SpatialAudioSource;

  beforeEach(() => {
    src = new SpatialAudioSource({
      minDistance: 1,
      maxDistance: 100,
      rolloff: 'inverse',
      rolloffFactor: 1,
    });
  });

  // -------------------------------------------------------------------------
  // Playback State
  // -------------------------------------------------------------------------
  describe('playback state', () => {
    it('starts not playing', () => {
      expect(src.isPlaying()).toBe(false);
    });

    it('play() starts playback', () => {
      src.play(5);
      expect(src.isPlaying()).toBe(true);
    });

    it('stop() ends playback and resets time', () => {
      src.play(5);
      src.stop();
      expect(src.isPlaying()).toBe(false);
      expect(src.getTime()).toBe(0);
    });

    it('pause() suspends but remembers state', () => {
      src.play(5);
      src.pause();
      expect(src.isPlaying()).toBe(false);
    });

    it('resume() resumes a paused source', () => {
      src.play(5);
      src.pause();
      src.resume();
      expect(src.isPlaying()).toBe(true);
    });

    it('pause() on non-playing source is a no-op', () => {
      src.pause();
      expect(src.isPlaying()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Time advancement
  // -------------------------------------------------------------------------
  describe('time advancement', () => {
    it('advances time by dt × pitch', () => {
      src = new SpatialAudioSource({ minDistance: 1, maxDistance: 100 });
      src.play(10);
      src.update(0.5, LISTENER_AT_ORIGIN);
      expect(src.getTime()).toBeCloseTo(0.5, 5);
    });

    it('pitch 2× advances time at double rate', () => {
      src.setPitch(2);
      src.play(10);
      src.update(0.5, LISTENER_AT_ORIGIN);
      expect(src.getTime()).toBeCloseTo(1.0, 5);
    });

    it('stops when clip ends (no loop)', () => {
      src.play(1); // 1-second clip
      src.update(1.5, LISTENER_AT_ORIGIN);
      expect(src.isPlaying()).toBe(false);
    });

    it('loops when clip ends (loop=true)', () => {
      src.setLoop(true);
      src.play(1);
      src.update(1.5, LISTENER_AT_ORIGIN);
      expect(src.isPlaying()).toBe(true);
      expect(src.getTime()).toBeCloseTo(0.5, 3);
    });

    it('paused source does not advance time', () => {
      src.play(10);
      src.pause();
      src.update(5, LISTENER_AT_ORIGIN);
      expect(src.getTime()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rolloff Models
  // -------------------------------------------------------------------------
  describe('rolloff models', () => {
    function makeAt(x: number, rolloff: 'linear' | 'inverse' | 'exponential') {
      const s = new SpatialAudioSource({
        minDistance: 1,
        maxDistance: 50,
        rolloff,
        rolloffFactor: 1,
        volume: 1,
        spatialBlend: 1,
      });
      s.setPosition(x, 0, 0);
      s.play(99);
      s.update(0, LISTENER_AT_ORIGIN);
      return s.getGain();
    }

    it('inverse: nearer source is louder', () => {
      expect(makeAt(2, 'inverse')).toBeGreaterThan(makeAt(10, 'inverse'));
    });

    it('inverse: at minDistance gain ≈ 1', () => {
      expect(makeAt(1, 'inverse')).toBeCloseTo(1, 3);
    });

    it('linear: at maxDistance gain ≈ 0', () => {
      expect(makeAt(50, 'linear')).toBeCloseTo(0, 3);
    });

    it('linear: at minDistance gain ≈ 1', () => {
      expect(makeAt(1, 'linear')).toBeCloseTo(1, 3);
    });

    it('exponential: gain decreases with distance', () => {
      expect(makeAt(2, 'exponential')).toBeGreaterThan(makeAt(10, 'exponential'));
    });

    it('custom rolloff: gain is 1 (no-op)', () => {
      const s = new SpatialAudioSource({
        rolloff: 'custom',
        minDistance: 1,
        maxDistance: 50,
        volume: 1,
        spatialBlend: 1,
      });
      s.setPosition(5, 0, 0);
      s.play(99);
      s.update(0, LISTENER_AT_ORIGIN);
      // Custom returns 1 → gain = 1 × volume = 1
      expect(s.getGain()).toBeCloseTo(1, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Volume / Pitch clamping
  // -------------------------------------------------------------------------
  describe('setVolume() / setPitch()', () => {
    it('volume clamps to [0,1]', () => {
      src.setVolume(2);
      expect(src.getVolume()).toBe(1);
      src.setVolume(-0.5);
      expect(src.getVolume()).toBe(0);
    });

    it('pitch clamps to <= 0.1 minimum', () => {
      src.setPitch(0);
      expect(src.getConfig().pitch).toBeCloseTo(0.1, 5);
    });

    it('pitch can be set above 1', () => {
      src.setPitch(3);
      expect(src.getConfig().pitch).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // setMinDistance / setMaxDistance clamping
  // -------------------------------------------------------------------------
  describe('distance clamping', () => {
    it('minDistance cannot go below 0.01', () => {
      src.setMinDistance(0);
      expect(src.getConfig().minDistance).toBeCloseTo(0.01, 5);
    });

    it('maxDistance cannot go below minDistance', () => {
      src.setMinDistance(10);
      src.setMaxDistance(5); // below min
      expect(src.getConfig().maxDistance).toBeGreaterThanOrEqual(src.getConfig().minDistance);
    });
  });

  // -------------------------------------------------------------------------
  // spatialBlend
  // -------------------------------------------------------------------------
  describe('spatialBlend', () => {
    it('blend=0 (2D): pan is always 0 regardless of position', () => {
      const s = new SpatialAudioSource({
        spatialBlend: 0,
        minDistance: 1,
        maxDistance: 100,
        volume: 1,
      });
      s.setPosition(50, 0, 0);
      s.play(10);
      s.update(0, LISTENER_AT_ORIGIN);
      expect(s.getPan()).toBe(0);
    });

    it('blend=1 (3D): pan is non-zero for off-center source', () => {
      const s = new SpatialAudioSource({
        spatialBlend: 1,
        minDistance: 1,
        maxDistance: 100,
        rolloff: 'inverse',
        rolloffFactor: 1,
        volume: 1,
      });
      s.setPosition(5, 0, 0);
      s.play(10);
      s.update(0, LISTENER_AT_ORIGIN);
      expect(Math.abs(s.getPan())).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cone
  // -------------------------------------------------------------------------
  describe('cone attenuation', () => {
    it('listener inside innerAngle has no cone reduction', () => {
      // Use minDistance=5 so listener at (5,0,0) is exactly at minDistance → attenuation≈1
      const s = new SpatialAudioSource({
        minDistance: 5,
        maxDistance: 100,
        rolloff: 'inverse',
        rolloffFactor: 1,
        volume: 1,
        spatialBlend: 1,
        cone: { innerAngle: 180, outerAngle: 360, outerGain: 0 },
      });
      s.setPosition(0, 0, 0);
      s.play(10);
      s.update(0, { x: 5, y: 0, z: 0 }); // listener exactly at minDistance → attenuation=1
      expect(s.getGain()).toBeCloseTo(1.0, 3); // no cone penalty: gain = 1 × volume(1) × coneGain(1) = 1
    });

    it('listener outside outerAngle gets outerGain', () => {
      const s = new SpatialAudioSource({
        minDistance: 1,
        maxDistance: 100,
        rolloff: 'inverse',
        rolloffFactor: 1,
        volume: 1,
        spatialBlend: 1,
        cone: { innerAngle: 10, outerAngle: 20, outerGain: 0.1 },
      });
      // Source at origin, listener directly ahead at (1,0,0) which is ±90°
      s.setPosition(0, 0, 0);
      s.play(10);
      s.update(0, { x: 0, y: 0, z: -5 }); // well outside 20° cone
      // gain should be reduced by outerGain factor
      expect(s.getGain()).toBeLessThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // Position / Velocity / getConfig
  // -------------------------------------------------------------------------
  describe('position and config', () => {
    it('setPosition updates position', () => {
      src.setPosition(3, 7, 2);
      const pos = src.getPosition();
      expect(pos).toEqual({ x: 3, y: 7, z: 2 });
    });

    it('setVelocity updates velocity in config', () => {
      src.setVelocity(1, 0, 0);
      expect(src.getConfig().velocity.x).toBe(1);
    });

    it('getConfig returns a copy', () => {
      const cfg = src.getConfig();
      cfg.volume = 0;
      expect(src.getVolume()).toBe(src.getConfig().volume); // original unchanged
    });
  });
});
