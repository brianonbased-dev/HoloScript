/**
 * AudioEngine.prod.test.ts
 *
 * Production tests for AudioEngine — source lifecycle, distance attenuation
 * (all three models), pan computation, master volume, mute, and update loop.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEngine } from '../AudioEngine';

describe('AudioEngine', () => {
  let eng: AudioEngine;

  beforeEach(() => { eng = new AudioEngine(); });

  // -------------------------------------------------------------------------
  // play() / stop()
  // -------------------------------------------------------------------------
  describe('play() / stop()', () => {
    it('play() returns a source id', () => {
      expect(typeof eng.play('boom')).toBe('string');
    });

    it('play() with explicit id stores that id', () => {
      eng.play('boom', { id: 'my-src' });
      expect(eng.getSource('my-src')).toBeDefined();
    });

    it('source is playing after play()', () => {
      const id = eng.play('boom');
      expect(eng.getSource(id)!.isPlaying).toBe(true);
    });

    it('stop() removes the source', () => {
      const id = eng.play('boom');
      eng.stop(id);
      expect(eng.getSource(id)).toBeUndefined();
    });

    it('stop() on unknown id does not throw', () => {
      expect(() => eng.stop('nope')).not.toThrow();
    });

    it('stopAll() clears all sources', () => {
      eng.play('a'); eng.play('b'); eng.play('c');
      eng.stopAll();
      expect(eng.getActiveCount()).toBe(0);
    });

    it('getActiveSources() returns only playing sources', () => {
      const id = eng.play('a');
      eng.play('b');
      eng.getSource(id)!.isPlaying = false; // mark as inactive
      const active = eng.getActiveSources();
      expect(active.every(s => s.isPlaying)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // setSourcePosition
  // -------------------------------------------------------------------------
  describe('setSourcePosition()', () => {
    it('updates position on the source', () => {
      const id = eng.play('x', { position: { x: 0, y: 0, z: 0 } });
      eng.setSourcePosition(id, { x: 10, y: 5, z: 3 });
      expect(eng.getSource(id)!.config.position.x).toBe(10);
    });

    it('no-op on unknown source', () => {
      expect(() => eng.setSourcePosition('ghost', { x: 1, y: 1, z: 1 })).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Listener
  // -------------------------------------------------------------------------
  describe('listener', () => {
    it('default listener is at origin facing -z', () => {
      const l = eng.getListener();
      expect(l.position.x).toBe(0);
      expect(l.forward.z).toBe(-1);
    });

    it('setListenerPosition updates position', () => {
      eng.setListenerPosition({ x: 5, y: 2, z: 3 });
      expect(eng.getListener().position.x).toBe(5);
    });

    it('setListenerOrientation updates forward/up', () => {
      eng.setListenerOrientation({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      expect(eng.getListener().forward.x).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // update() — distance attenuation
  // -------------------------------------------------------------------------
  describe('update() — distance attenuation', () => {
    it('source at refDistance has volume ≈ config volume (inverse model)', () => {
      const id = eng.play('x', {
        id: 's1',
        position: { x: 1, y: 0, z: 0 }, // distance=1 = refDistance
        volume: 1,
        refDistance: 1,
        maxDistance: 50,
        rolloffFactor: 1,
        distanceModel: 'inverse',
        spatialize: true,
      });
      eng.update(0);
      expect(eng.getSource(id)!.computedVolume).toBeCloseTo(1, 3);
    });

    it('inverse: volume decreases as distance increases', () => {
      const near = eng.play('x', { id: 'near', position: { x: 2, y: 0, z: 0 }, distanceModel: 'inverse', refDistance: 1, maxDistance: 100, rolloffFactor: 1, spatialize: true, volume: 1 });
      const far  = eng.play('x', { id: 'far',  position: { x: 20, y: 0, z: 0 }, distanceModel: 'inverse', refDistance: 1, maxDistance: 100, rolloffFactor: 1, spatialize: true, volume: 1 });
      eng.setListenerPosition({ x: 0, y: 0, z: 0 });
      eng.update(0);
      expect(eng.getSource(near)!.computedVolume).toBeGreaterThan(eng.getSource(far)!.computedVolume);
    });

    it('linear: source at maxDistance has near-zero volume', () => {
      const id = eng.play('x', { id: 's', position: { x: 50, y: 0, z: 0 }, distanceModel: 'linear', refDistance: 1, maxDistance: 50, rolloffFactor: 1, spatialize: true, volume: 1 });
      eng.update(0);
      expect(eng.getSource(id)!.computedVolume).toBeCloseTo(0, 3);
    });

    it('exponential: volume is finite and positive at 5× refDistance', () => {
      const id = eng.play('x', { id: 'ex', position: { x: 5, y: 0, z: 0 }, distanceModel: 'exponential', refDistance: 1, maxDistance: 200, rolloffFactor: 1, spatialize: true, volume: 1 });
      eng.update(0);
      const vol = eng.getSource(id)!.computedVolume;
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(1);
    });

    it('non-spatialized source has computedPan=0 regardless of position', () => {
      const id = eng.play('x', { id: 'ns', position: { x: 100, y: 0, z: 0 }, spatialize: false, volume: 0.7 });
      eng.update(0);
      expect(eng.getSource(id)!.computedPan).toBe(0);
    });

    it('non-spatialized source volume = config.volume × masterVolume', () => {
      eng.setMasterVolume(0.5);
      const id = eng.play('x', { id: 'ns', spatialize: false, volume: 0.8 });
      eng.update(0);
      expect(eng.getSource(id)!.computedVolume).toBeCloseTo(0.4, 5);
    });

    it('advance currentTime by dt × pitch', () => {
      const id = eng.play('x', { pitch: 2 });
      eng.update(0.5);
      expect(eng.getSource(id)!.currentTime).toBeCloseTo(1.0, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Master Volume
  // -------------------------------------------------------------------------
  describe('masterVolume', () => {
    it('default is 1.0', () => { expect(eng.getMasterVolume()).toBe(1); });
    it('setMasterVolume clamps to [0,1]', () => {
      eng.setMasterVolume(5); expect(eng.getMasterVolume()).toBe(1);
      eng.setMasterVolume(-1); expect(eng.getMasterVolume()).toBe(0);
    });
    it('scales computed volume', () => {
      eng.setMasterVolume(0.5);
      const id = eng.play('x', { id: 's', spatialize: false, volume: 1 });
      eng.update(0);
      expect(eng.getSource(id)!.computedVolume).toBeCloseTo(0.5, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Mute
  // -------------------------------------------------------------------------
  describe('mute', () => {
    it('default is not muted', () => { expect(eng.isMuted()).toBe(false); });
    it('muted source has computedVolume=0', () => {
      eng.setMuted(true);
      const id = eng.play('x', { spatialize: false, volume: 1 });
      eng.update(0);
      expect(eng.getSource(id)!.computedVolume).toBe(0);
    });
    it('unmuting restores volume', () => {
      eng.setMuted(true);
      const id = eng.play('x', { spatialize: false, volume: 1 });
      eng.update(0);
      eng.setMuted(false);
      eng.update(0);
      expect(eng.getSource(id)!.computedVolume).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Pan
  // -------------------------------------------------------------------------
  describe('pan computation', () => {
    it('source directly to the right pans positive', () => {
      // Listener facing -z, source at +x → should be to the right
      eng.setListenerPosition({ x: 0, y: 0, z: 0 });
      eng.setListenerOrientation({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
      const id = eng.play('x', { position: { x: 5, y: 0, z: 0 }, refDistance: 1, maxDistance: 100, rolloffFactor: 1, distanceModel: 'inverse', spatialize: true, volume: 1 });
      eng.update(0);
      expect(eng.getSource(id)!.computedPan).toBeGreaterThan(0);
    });

    it('source directly behind listener (same X): pan ≈ 0', () => {
      eng.setListenerPosition({ x: 0, y: 0, z: 0 });
      const id = eng.play('x', { position: { x: 0, y: 0, z: -5 }, refDistance: 1, maxDistance: 100, rolloffFactor: 1, distanceModel: 'inverse', spatialize: true, volume: 1 });
      eng.update(0);
      expect(Math.abs(eng.getSource(id)!.computedPan)).toBeLessThan(0.01);
    });
  });

  // -------------------------------------------------------------------------
  // getActiveCount
  // -------------------------------------------------------------------------
  describe('getActiveCount()', () => {
    it('counts all stored sources', () => {
      eng.play('a'); eng.play('b');
      expect(eng.getActiveCount()).toBe(2);
    });
    it('decreases after stop', () => {
      const id = eng.play('a');
      eng.stop(id);
      expect(eng.getActiveCount()).toBe(0);
    });
  });
});
