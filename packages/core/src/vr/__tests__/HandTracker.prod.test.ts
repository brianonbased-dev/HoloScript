/**
 * HandTracker Production Tests
 * Sprint CLXVI — joint updates, strength updates, gesture detection, history
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HandTracker, type JointPosition } from '../HandTracker';

function makeJoints(overrides: Record<string, JointPosition> = {}): Record<string, JointPosition> {
  return {
    thumb_tip:  { x: 0.0, y: 0.0, z: 0.0 },
    index_tip:  { x: 0.05, y: 0.0, z: 0.0 },
    middle_tip: { x: 0.05, y: 0.0, z: 0.0 },
    ...overrides,
  };
}

describe('HandTracker', () => {
  let tracker: HandTracker;

  beforeEach(() => {
    tracker = new HandTracker();
  });

  describe('initial state', () => {
    it('initializes both hands untracked', () => {
      expect(tracker.isTracked('left')).toBe(false);
      expect(tracker.isTracked('right')).toBe(false);
    });

    it('initial gesture is none for both hands', () => {
      expect(tracker.getGesture('left')).toBe('none');
      expect(tracker.getGesture('right')).toBe('none');
    });

    it('initial gesture history is empty', () => {
      expect(tracker.getGestureHistory()).toHaveLength(0);
    });
  });

  describe('updateJoints', () => {
    it('marks hand as tracked', () => {
      tracker.updateJoints('right', makeJoints());
      expect(tracker.isTracked('right')).toBe(true);
    });

    it('stores joint positions', () => {
      tracker.updateJoints('right', { wrist: { x: 1, y: 2, z: 3 } });
      expect(tracker.getJoint('right', 'wrist')).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('clears previous joints on update', () => {
      tracker.updateJoints('right', { wrist: { x: 0, y: 0, z: 0 } });
      tracker.updateJoints('right', { elbow: { x: 1, y: 1, z: 1 } });
      expect(tracker.getJoint('right', 'wrist')).toBeUndefined();
      expect(tracker.getJoint('right', 'elbow')).toBeTruthy();
    });

    it('adds entry to gesture history on each update', () => {
      tracker.updateJoints('right', makeJoints());
      tracker.updateJoints('right', makeJoints());
      expect(tracker.getGestureHistory().length).toBe(2);
    });

    it('history entry has correct side', () => {
      tracker.updateJoints('left', makeJoints());
      expect(tracker.getGestureHistory()[0].side).toBe('left');
    });

    it('caps history at 100', () => {
      for (let i = 0; i < 110; i++) tracker.updateJoints('right', makeJoints());
      expect(tracker.getGestureHistory().length).toBe(100);
    });
  });

  describe('updateStrength', () => {
    it('updates pinch and grip strength', () => {
      tracker.updateStrength('right', 0.9, 0.3);
      const hand = tracker.getHand('right');
      expect(hand.pinchStrength).toBe(0.9);
      expect(hand.gripStrength).toBe(0.3);
    });
  });

  describe('gesture detection', () => {
    it('detects pinch (pinchStrength > 0.8)', () => {
      tracker.updateStrength('right', 0.85, 0);
      tracker.updateJoints('right', makeJoints());
      expect(tracker.getGesture('right')).toBe('pinch');
    });

    it('detects grab (gripStrength > 0.8)', () => {
      tracker.updateStrength('right', 0, 0.85);
      tracker.updateJoints('right', makeJoints());
      expect(tracker.getGesture('right')).toBe('grab');
    });

    it('detects point when index far from thumb and low grip', () => {
      // thumb_tip at origin, index_tip at (0.15, 0, 0) — dist=0.15 > 0.1
      // gripStrength < 0.3
      tracker.updateStrength('right', 0, 0.1);
      tracker.updateJoints('right', {
        thumb_tip:  { x: 0, y: 0, z: 0 },
        index_tip:  { x: 0.15, y: 0, z: 0 },
        middle_tip: { x: 0, y: 0, z: 0 },
      });
      expect(tracker.getGesture('right')).toBe('point');
    });

    it('detects fist (gripStrength 0.6-0.8)', () => {
      tracker.updateStrength('right', 0, 0.65);
      tracker.updateJoints('right', {
        // No joint tips → falls to grip check
      });
      expect(tracker.getGesture('right')).toBe('fist');
    });

    it('detects open (low pinch and grip)', () => {
      tracker.updateStrength('right', 0.1, 0.1);
      tracker.updateJoints('right', {});
      expect(tracker.getGesture('right')).toBe('open');
    });
  });

  describe('getHand', () => {
    it('returns hand state for left and right', () => {
      expect(tracker.getHand('left').side).toBe('left');
      expect(tracker.getHand('right').side).toBe('right');
    });
  });

  describe('getJoint', () => {
    it('returns undefined for unknown joint', () => {
      expect(tracker.getJoint('left', 'nonexistent')).toBeUndefined();
    });

    it('returns correct joint after update', () => {
      tracker.updateJoints('left', { thumb_tip: { x: 1, y: 2, z: 3 } });
      expect(tracker.getJoint('left', 'thumb_tip')).toEqual({ x: 1, y: 2, z: 3 });
    });
  });

  describe('getGestureHistory', () => {
    it('returns a copy of history', () => {
      tracker.updateJoints('right', makeJoints());
      const h1 = tracker.getGestureHistory();
      const h2 = tracker.getGestureHistory();
      expect(h1).not.toBe(h2);
    });

    it('history entries include timestamp', () => {
      tracker.updateJoints('right', makeJoints());
      expect(tracker.getGestureHistory()[0].timestamp).toBeGreaterThan(0);
    });
  });
});
