import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEngine } from '../AudioEngine.js';

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    engine = new AudioEngine();
  });

  describe('initial state', () => {
    it('has master volume 1 by default', () => {
      expect(engine.getMasterVolume()).toBe(1);
    });

    it('is not muted by default', () => {
      expect(engine.isMuted()).toBe(false);
    });

    it('has no active sources', () => {
      expect(engine.getActiveCount()).toBe(0);
      expect(engine.getActiveSources()).toHaveLength(0);
    });
  });

  describe('play()', () => {
    it('plays a sound and returns an id', () => {
      const id = engine.play('beep');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('auto-generates id with _src_ prefix when none given', () => {
      const id = engine.play('beep');
      expect(id).toMatch(/^_src_/);
    });

    it('uses provided id when given', () => {
      const id = engine.play('beep', { id: 'mySound' });
      expect(id).toBe('mySound');
    });

    it('increments active count', () => {
      engine.play('beep');
      expect(engine.getActiveCount()).toBe(1);
      engine.play('boop');
      expect(engine.getActiveCount()).toBe(2);
    });

    it('source is retrievable after play', () => {
      const id = engine.play('beep');
      const src = engine.getSource(id);
      expect(src).toBeDefined();
    });

    it('defaults spatialize to true when position given', () => {
      const id = engine.play('beep', { position: { x: 1, y: 0, z: 0 } });
      const src = engine.getSource(id);
      expect(src?.spatialize).toBe(true);
    });

    it('defaults spatialize to false when no position given', () => {
      const id = engine.play('beep');
      const src = engine.getSource(id);
      expect(src?.spatialize).toBe(false);
    });

    it('respects explicit spatialize option', () => {
      const id = engine.play('beep', { spatialize: false, position: { x: 1, y: 0, z: 0 } });
      const src = engine.getSource(id);
      expect(src?.spatialize).toBe(false);
    });
  });

  describe('stop()', () => {
    it('stops an active source', () => {
      const id = engine.play('beep');
      engine.stop(id);
      expect(engine.getActiveCount()).toBe(0);
    });

    it('stopping unknown id does not throw', () => {
      expect(() => engine.stop('nonexistent')).not.toThrow();
    });

    it('source is no longer retrievable after stop', () => {
      const id = engine.play('beep');
      engine.stop(id);
      expect(engine.getSource(id)).toBeUndefined();
    });
  });

  describe('stopAll()', () => {
    it('stops all active sources', () => {
      engine.play('a');
      engine.play('b');
      engine.play('c');
      engine.stopAll();
      expect(engine.getActiveCount()).toBe(0);
    });

    it('does not throw when no sources active', () => {
      expect(() => engine.stopAll()).not.toThrow();
    });
  });

  describe('getActiveSources()', () => {
    it('returns all active source configs', () => {
      engine.play('a', { id: 's1' });
      engine.play('b', { id: 's2' });
      const sources = engine.getActiveSources();
      expect(sources).toHaveLength(2);
      const ids = sources.map((s) => s.id);
      expect(ids).toContain('s1');
      expect(ids).toContain('s2');
    });
  });

  describe('master volume', () => {
    it('sets master volume', () => {
      engine.setMasterVolume(0.5);
      expect(engine.getMasterVolume()).toBe(0.5);
    });

    it('stores volume without clamping', () => {
      engine.setMasterVolume(2);
      expect(engine.getMasterVolume()).toBe(2);
      engine.setMasterVolume(-1);
      expect(engine.getMasterVolume()).toBe(-1);
    });
  });

  describe('mute', () => {
    it('mutes engine', () => {
      engine.setMuted(true);
      expect(engine.isMuted()).toBe(true);
    });

    it('unmutes engine', () => {
      engine.setMuted(true);
      engine.setMuted(false);
      expect(engine.isMuted()).toBe(false);
    });
  });

  describe('listener', () => {
    it('can set listener position', () => {
      expect(() => engine.setListenerPosition({ x: 1, y: 2, z: 3 })).not.toThrow();
    });

    it('can set listener orientation', () => {
      expect(() =>
        engine.setListenerOrientation(
          { x: 0, y: 0, z: -1 },
          { x: 0, y: 1, z: 0 },
        ),
      ).not.toThrow();
    });

    it('getListener returns listener config', () => {
      const listener = engine.getListener();
      expect(listener).toBeDefined();
    });
  });

  describe('update(dt)', () => {
    it('does not throw', () => {
      engine.play('beep', { id: 's1' });
      expect(() => engine.update(0.016)).not.toThrow();
    });
  });
});
