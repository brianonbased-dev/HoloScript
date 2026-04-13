/**
 * SkeletonTrait Tests
 *
 * Tests for bone-based skeletal animation with blend trees and layers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkeletonTrait, createSkeletonTrait } from './SkeletonTrait';

describe('SkeletonTrait', () => {
  let trait: SkeletonTrait;

  beforeEach(() => {
    trait = createSkeletonTrait();
  });

  describe('factory function', () => {
    it('should create skeleton trait with factory', () => {
      expect(trait).toBeInstanceOf(SkeletonTrait);
    });

    it('should create with custom config', () => {
      const custom = createSkeletonTrait({
        rigType: 'humanoid',
      });
      expect(custom.getConfig().rigType).toBe('humanoid');
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.rigType).toBeDefined();
    });

    it('should have default rig type as custom', () => {
      expect(trait.getConfig().rigType).toBe('custom');
    });
  });

  describe('rig types', () => {
    it('should support custom rig', () => {
      const custom = createSkeletonTrait({ rigType: 'custom' });
      expect(custom.getConfig().rigType).toBe('custom');
    });

    it('should support humanoid rig', () => {
      const humanoid = createSkeletonTrait({ rigType: 'humanoid' });
      expect(humanoid.getConfig().rigType).toBe('humanoid');
    });
  });

  describe('bone management', () => {
    it('should get bone count', () => {
      expect(typeof trait.getBoneCount()).toBe('number');
    });

    it('should get bone names', () => {
      const names = trait.getBoneNames();
      expect(Array.isArray(names)).toBe(true);
    });

    it('should get bone transform', () => {
      // With no bones set, should return undefined
      const transform = trait.getBoneTransform('Root');
      expect(transform).toBeUndefined();
    });

    it('should set bone transform', () => {
      trait.setBoneTransform('Root', {
        position: [0, 1, 0],
      });
      // Setting works even for non-existent bones (creates placeholder)
    });
  });

  describe('animation clips', () => {
    it('should add animation clip', () => {
      trait.addClip({
        name: 'Walk',
        duration: 1.0,
        loop: true,
        curves: new Map(),
      });
      const clip = trait.getClip('Walk');
      expect(clip).toBeDefined();
      expect(clip?.name).toBe('Walk');
    });

    it('should get animation clip by name', () => {
      trait.addClip({ name: 'Run', duration: 0.8, curves: new Map() });
      const clip = trait.getClip('Run');
      expect(clip).toBeDefined();
      expect(clip?.name).toBe('Run');
    });
  });

  describe('animation playback', () => {
    it('should play animation', () => {
      trait.addClip({ name: 'Idle', duration: 2.0, curves: new Map() });
      trait.play('Idle');
      expect(trait.getCurrentClip()).toBe('Idle');
    });

    it('should stop animation', () => {
      trait.addClip({ name: 'Dance', duration: 3.0, curves: new Map() });
      trait.play('Dance');
      trait.stop();
      expect(trait.isPlaying()).toBe(false);
    });

    it('should pause animation', () => {
      trait.addClip({ name: 'Walk', duration: 1.0, curves: new Map() });
      trait.play('Walk');
      trait.pause();
      // After pause, isPlaying is false
      expect(trait.isPlaying()).toBe(false);
    });

    it('should resume animation', () => {
      trait.addClip({ name: 'Test', duration: 1.0, curves: new Map() });
      trait.play('Test');
      trait.pause();
      trait.resume();
      // After resume, should still be playing
      expect(trait.isPlaying()).toBe(true);
    });

    it('should check if playing', () => {
      expect(typeof trait.isPlaying()).toBe('boolean');
    });
  });

  describe('animation state', () => {
    it('should get animation state', () => {
      const state = trait.getState();
      expect(state).toBeDefined();
      expect(state.currentTime).toBeDefined();
    });

    it('should set playback speed', () => {
      trait.setSpeed(2.0);
      const speed = trait.getSpeed();
      expect(speed).toBe(2.0);
    });

    it('should get normalized time', () => {
      trait.addClip({ name: 'Test', duration: 5.0, curves: new Map() });
      trait.play('Test');
      const state = trait.getState();
      expect(typeof state.normalizedTime).toBe('number');
    });
  });

  describe('parameters', () => {
    it('should set parameter', () => {
      trait.setParameter('speed', 0.5);
      expect(trait.getParameter('speed')).toBe(0.5);
    });

    it('should get parameter', () => {
      trait.setParameter('direction', 1.0);
      expect(trait.getParameter('direction')).toBe(1.0);
    });

    it('should handle missing parameters', () => {
      expect(trait.getParameter('nonexistent')).toBeUndefined();
    });
  });

  describe('blend weight', () => {
    it('should have layer weights in state', () => {
      const state = trait.getState();
      expect(Array.isArray(state.layerWeights)).toBe(true);
    });

    it('should get layer weights', () => {
      const state = trait.getState();
      expect(state.layerWeights.length).toBeGreaterThan(0);
    });
  });

  describe('crossfade', () => {
    it('should crossfade to animation using play options', () => {
      trait.addClip({ name: 'Walk', duration: 1.0, curves: new Map() });
      trait.addClip({ name: 'Run', duration: 0.8, curves: new Map() });
      trait.play('Walk');
      trait.play('Run', { crossfade: 0.3 });
      // During crossfade, crossfadeTarget is set to target clip
      const state = trait.getState();
      expect(state.crossfadeTarget).toBe('Run');
    });
  });

  describe('events', () => {
    it('should register event listener', () => {
      const listener = () => {};
      // Should not throw when registering
      expect(() => trait.on('clip-started', listener)).not.toThrow();
    });

    it('should unregister event listener', () => {
      const listener = () => {};
      trait.on('clip-ended', listener);
      trait.off('clip-ended', listener);
      // Just verify no errors
    });
  });
});
