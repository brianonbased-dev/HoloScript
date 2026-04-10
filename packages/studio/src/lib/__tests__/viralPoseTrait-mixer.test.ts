/**
 * viralPoseTrait-mixer.test.ts
 *
 * Tests for VRM AnimationMixer integration in ViralPoseTrait
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../poseLibrary', () => ({
  getAllPoses: vi.fn(() => []),
  getPoseById: vi.fn(),
  getPosesByCategory: vi.fn(() => []),
  getTrendingPoses: vi.fn(() => []),
  interpolatePoses: vi.fn(() => []),
  applyEasing: vi.fn((t: number) => t),
}));

import { ViralPoseTrait } from '../traits/viralPoseTrait';
import { logger as mockLogger } from '@/lib/logger';
import { getPoseById } from '../poseLibrary';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockMixer(): THREE.AnimationMixer {
  const root = new THREE.Object3D();
  return new THREE.AnimationMixer(root);
}

function createMockClip(name: string, duration: number = 1.0): THREE.AnimationClip {
  const track = new THREE.NumberKeyframeTrack('.position[0]', [0, duration], [0, 1]);
  return new THREE.AnimationClip(name, duration, [track]);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ViralPoseTrait — VRM Mixer Integration', () => {
  let trait: ViralPoseTrait;

  beforeEach(() => {
    vi.clearAllMocks();
    trait = new ViralPoseTrait({ autoCycle: false });
  });

  describe('attachToMixer', () => {
    it('registers animation clips from the mixer', () => {
      const mixer = createMockMixer();
      const clips = [createMockClip('idle'), createMockClip('wave'), createMockClip('dance')];

      trait.attachToMixer(mixer, clips);

      expect(trait.getAvailableClips()).toEqual(['idle', 'wave', 'dance']);
    });

    it('clears previous clips on re-attach', () => {
      const mixer = createMockMixer();
      trait.attachToMixer(mixer, [createMockClip('old-clip')]);
      expect(trait.hasClip('old-clip')).toBe(true);

      trait.attachToMixer(mixer, [createMockClip('new-clip')]);
      expect(trait.hasClip('old-clip')).toBe(false);
      expect(trait.hasClip('new-clip')).toBe(true);
    });
  });

  describe('hasClip', () => {
    it('returns true for registered clips', () => {
      const mixer = createMockMixer();
      trait.attachToMixer(mixer, [createMockClip('walk')]);
      expect(trait.hasClip('walk')).toBe(true);
    });

    it('returns false for unregistered clips', () => {
      expect(trait.hasClip('nonexistent')).toBe(false);
    });
  });

  describe('playClip', () => {
    it('returns true and plays a registered clip', () => {
      const mixer = createMockMixer();
      trait.attachToMixer(mixer, [createMockClip('wave')]);

      const result = trait.playClip('wave');
      expect(result).toBe(true);
    });

    it('returns false when no mixer attached', () => {
      const result = trait.playClip('wave');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No mixer attached'),
        expect.anything()
      );
    });

    it('returns false for non-existent clip', () => {
      const mixer = createMockMixer();
      trait.attachToMixer(mixer, [createMockClip('idle')]);

      const result = trait.playClip('nonexistent');
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Clip not found'),
        expect.anything()
      );
    });

    it('respects speed option', () => {
      const mixer = createMockMixer();
      const clip = createMockClip('dance');
      trait.attachToMixer(mixer, [clip]);

      trait.playClip('dance', { speed: 2.0 });

      // The action should have timeScale set to 2.0
      // We verify by checking mixer internals
      const action = mixer.clipAction(clip);
      expect(action.timeScale).toBe(2.0);
    });

    it('respects loop option', () => {
      const mixer = createMockMixer();
      const clip = createMockClip('idle');
      trait.attachToMixer(mixer, [clip]);

      trait.playClip('idle', { loop: true });

      const action = mixer.clipAction(clip);
      expect(action.loop).toBe(THREE.LoopRepeat);
    });

    it('defaults to LoopOnce when loop is false', () => {
      const mixer = createMockMixer();
      const clip = createMockClip('wave');
      trait.attachToMixer(mixer, [clip]);

      trait.playClip('wave', { loop: false });

      const action = mixer.clipAction(clip);
      expect(action.loop).toBe(THREE.LoopOnce);
      expect(action.clampWhenFinished).toBe(true);
    });
  });

  describe('stopClip', () => {
    it('stops the active clip', () => {
      const mixer = createMockMixer();
      trait.attachToMixer(mixer, [createMockClip('dance')]);
      trait.playClip('dance');

      // Should not throw
      trait.stopClip();
    });

    it('is safe to call when no clip is playing', () => {
      // Should not throw
      trait.stopClip();
    });
  });

  describe('triggerPose with mixer', () => {
    it('plays clip when mixer has matching clip name', () => {
      const mixer = createMockMixer();
      const clip = createMockClip('dab');
      trait.attachToMixer(mixer, [clip]);

      trait.triggerPose('dab');

      // Should have played via clip, not via pose library
      const action = mixer.clipAction(clip);
      expect(action.isRunning()).toBe(true);
    });

    it('falls back to pose library when clip not found', () => {
      const mixer = createMockMixer();
      trait.attachToMixer(mixer, [createMockClip('idle')]);

      const mockGetPoseById = getPoseById as ReturnType<typeof vi.fn>;
      mockGetPoseById.mockReturnValueOnce(undefined);

      trait.triggerPose('nonexistent-pose');

      // Should have tried pose library (warn logged because pose not found either)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Pose not found'),
        expect.anything()
      );
    });
  });

  describe('update with mixer', () => {
    it('ticks the mixer on update', () => {
      const mixer = createMockMixer();
      const updateSpy = vi.spyOn(mixer, 'update');
      trait.attachToMixer(mixer, [createMockClip('idle')]);

      trait.update(16); // ~60fps frame time in ms

      // deltaTime is ms, mixer expects seconds
      expect(updateSpy).toHaveBeenCalledWith(0.016);
    });

    it('does not tick when no mixer attached', () => {
      // Should not throw
      trait.update(16);
    });
  });

  describe('dispose', () => {
    it('clears mixer state on dispose', () => {
      const mixer = createMockMixer();
      trait.attachToMixer(mixer, [createMockClip('idle'), createMockClip('wave')]);
      trait.playClip('idle');

      trait.dispose();

      expect(trait.getAvailableClips()).toEqual([]);
      expect(trait.hasClip('idle')).toBe(false);
    });
  });
});
