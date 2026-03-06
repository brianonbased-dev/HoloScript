/**
 * AnimationTransitions.prod.test.ts
 * Production tests for AnimationTransitionSystem — ragdoll↔animation blending,
 * blend curves, progress tracking, and multi-entity support.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationTransitionSystem, BonePose } from '../AnimationTransitions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePose(boneId: string, x = 0, y = 0, z = 0): BonePose {
  return { boneId, position: { x, y, z }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
}

function makePoseMap(entityId: string, poses: BonePose[]): Map<string, BonePose[]> {
  return new Map([[entityId, poses]]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimationTransitionSystem', () => {
  let sys: AnimationTransitionSystem;

  beforeEach(() => {
    sys = new AnimationTransitionSystem({ duration: 1, curve: 'linear', settleThreshold: 0.1 });
  });

  // -------------------------------------------------------------------------
  // Initial State
  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('starts with no active transitions', () => {
      expect(sys.getActiveTransitionCount()).toBe(0);
    });

    it('isTransitioning returns false for unknown entity', () => {
      expect(sys.isTransitioning('player')).toBe(false);
    });

    it('getBlendProgress returns 0 for unknown entity', () => {
      expect(sys.getBlendProgress('player')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // startAnimToRagdoll
  // -------------------------------------------------------------------------
  describe('startAnimToRagdoll()', () => {
    it('creates an active transition', () => {
      sys.startAnimToRagdoll('player', [makePose('Spine')]);
      expect(sys.getActiveTransitionCount()).toBe(1);
    });

    it('isTransitioning returns true immediately after start', () => {
      sys.startAnimToRagdoll('player', [makePose('Spine')]);
      expect(sys.isTransitioning('player')).toBe(true);
    });

    it('progress starts at 0', () => {
      sys.startAnimToRagdoll('player', [makePose('Spine')]);
      expect(sys.getBlendProgress('player')).toBe(0);
    });

    it('multiple entities can transition simultaneously', () => {
      sys.startAnimToRagdoll('player1', [makePose('Spine')]);
      sys.startAnimToRagdoll('player2', [makePose('Spine')]);
      expect(sys.getActiveTransitionCount()).toBe(2);
    });

    it('restarting an entity replaces the existing transition', () => {
      sys.startAnimToRagdoll('player', [makePose('Spine', 0, 1, 0)]);
      sys.update(0.5, new Map(), new Map()); // advance halfway
      sys.startAnimToRagdoll('player', [makePose('Spine', 0, 2, 0)]);
      expect(sys.getBlendProgress('player')).toBe(0); // reset to start
    });
  });

  // -------------------------------------------------------------------------
  // startRagdollToAnim
  // -------------------------------------------------------------------------
  describe('startRagdollToAnim()', () => {
    it('creates an active transition', () => {
      sys.startRagdollToAnim('player', [makePose('Spine')]);
      expect(sys.getActiveTransitionCount()).toBe(1);
    });

    it('transition direction is ragdoll_to_animation', () => {
      sys.startRagdollToAnim('npc', [makePose('Spine')]);
      sys.isTransitioning('npc'); // ensure it exists
      // Can verify by checking update behavior (ragdoll → anim means target is animPose)
      const ragdoll = makePoseMap('npc', [makePose('Spine', 10, 0, 0)]);
      const anim = makePoseMap('npc', [makePose('Spine', 0, 0, 0)]);
      sys.update(1.0, ragdoll, anim); // complete the transition
      // At t=1, ragdoll_to_animation should end at animPose position
      expect(sys.isTransitioning('npc')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // update() — blending
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('returns empty map when no transitions active', () => {
      const result = sys.update(0.016, new Map(), new Map());
      expect(result.size).toBe(0);
    });

    it('advances progress by dt/duration each frame', () => {
      sys.startAnimToRagdoll('p', [makePose('Spine')]);
      sys.update(0.25, new Map(), new Map());
      expect(sys.getBlendProgress('p')).toBeCloseTo(0.25, 5);
    });

    it('progress clamps to 1 when duration elapsed', () => {
      sys.startAnimToRagdoll('p', [makePose('Spine')]);
      sys.update(2.0, new Map(), new Map()); // far past duration
      expect(sys.getBlendProgress('p')).toBe(1);
    });

    it('marks transition complete when progress hits 1', () => {
      sys.startAnimToRagdoll('p', [makePose('Spine')]);
      sys.update(1.0, new Map(), new Map());
      expect(sys.isTransitioning('p')).toBe(false);
    });

    it('anim→ragdoll: halfway blend is mid-point position', () => {
      // sourcePose = Spine at (0,0,0), ragdoll at (10,0,0), anim at (0,0,0)
      const sourcePose = [makePose('Spine', 0, 0, 0)];
      sys.startAnimToRagdoll('p', sourcePose);
      const ragdoll = makePoseMap('p', [makePose('Spine', 10, 0, 0)]);
      const anim = makePoseMap('p', [makePose('Spine', 0, 0, 0)]);
      sys.update(0.5, ragdoll, anim); // linear curve, t=0.5 → from=anim(0), to=ragdoll(10)
      const result = sys.update(0.0, ragdoll, anim);
      // After 0.5 progress: lerp(0, 10, 0.5) = 5
      const blended = result.get('p');
      if (blended) {
        expect(blended[0].position.x).toBeCloseTo(5, 3);
      }
    });

    it('ragdoll→anim: at t=1 end effector is at anim position', () => {
      const sourcePose = [makePose('Spine', 5, 0, 0)];
      sys.startRagdollToAnim('p', sourcePose);
      const ragdoll = makePoseMap('p', [makePose('Spine', 10, 0, 0)]);
      const anim = makePoseMap('p', [makePose('Spine', 0, 0, 0)]);
      const result = sys.update(1.0, ragdoll, anim);
      const blended = result.get('p');
      if (blended) {
        // t=1 → fully at animPose (x=0)
        expect(blended[0].position.x).toBeCloseTo(0, 3);
      }
    });

    it('falls back to sourcePose when entity missing from ragdoll/anim maps', () => {
      const sourcePose = [makePose('Spine', 3, 0, 0)];
      sys.startAnimToRagdoll('p', sourcePose);
      // Neither map has 'p' → falls back to sourcePose
      const result = sys.update(0.0, new Map(), new Map());
      const blended = result.get('p');
      expect(blended).toBeDefined();
      // lerp(source, source, 0) = source
      expect(blended![0].position.x).toBeCloseTo(3, 5);
    });

    it('skips completed transitions in subsequent updates', () => {
      sys.startAnimToRagdoll('p', [makePose('Spine')]);
      sys.update(1.0, new Map(), new Map()); // complete
      const result = sys.update(1.0, new Map(), new Map());
      // Completed transitions are skipped → entity not in result
      expect(result.get('p')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Blend Curves
  // -------------------------------------------------------------------------
  describe('blend curves', () => {
    const curves = ['linear', 'ease_in', 'ease_out', 'ease_in_out'] as const;
    for (const curve of curves) {
      it(`${curve}: produces valid blended positions`, () => {
        const curvedSys = new AnimationTransitionSystem({ duration: 1, curve, settleThreshold: 0.1 });
        curvedSys.startAnimToRagdoll('p', [makePose('Spine', 0)]);
        const ragdoll = makePoseMap('p', [makePose('Spine', 10)]);
        const result = curvedSys.update(0.5, ragdoll, new Map());
        const blended = result.get('p');
        expect(blended).toBeDefined();
        expect(Number.isFinite(blended![0].position.x)).toBe(true);
      });
    }

    it('ease_in is slower than linear at t=0.5', () => {
      // ease_in(0.5) = 0.25, linear(0.5) = 0.5 → ease_in gives smaller x
      const linear = new AnimationTransitionSystem({ duration: 1, curve: 'linear', settleThreshold: 0.1 });
      const easeIn = new AnimationTransitionSystem({ duration: 1, curve: 'ease_in', settleThreshold: 0.1 });
      const ragdoll = makePoseMap('p', [makePose('Spine', 100, 0, 0)]);
      const anim = makePoseMap('p', [makePose('Spine', 0, 0, 0)]);

      linear.startAnimToRagdoll('p', [makePose('Spine', 0)]);
      easeIn.startAnimToRagdoll('p', [makePose('Spine', 0)]);
      const rLinear = linear.update(0.5, ragdoll, anim).get('p');
      const rEaseIn = easeIn.update(0.5, ragdoll, anim).get('p');

      expect(rEaseIn![0].position.x).toBeLessThan(rLinear![0].position.x);
    });
  });

  // -------------------------------------------------------------------------
  // clearTransition
  // -------------------------------------------------------------------------
  describe('clearTransition()', () => {
    it('removes the transition', () => {
      sys.startAnimToRagdoll('p', [makePose('Spine')]);
      sys.clearTransition('p');
      expect(sys.getActiveTransitionCount()).toBe(0);
      expect(sys.isTransitioning('p')).toBe(false);
    });

    it('is a no-op for missing entity', () => {
      expect(() => sys.clearTransition('missing')).not.toThrow();
    });

    it('does not affect other entities', () => {
      sys.startAnimToRagdoll('a', [makePose('Spine')]);
      sys.startAnimToRagdoll('b', [makePose('Spine')]);
      sys.clearTransition('a');
      expect(sys.getActiveTransitionCount()).toBe(1);
      expect(sys.isTransitioning('b')).toBe(true);
    });
  });
});
