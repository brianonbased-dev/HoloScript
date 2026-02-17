import { describe, it, expect, beforeEach } from 'vitest';
import { HandTracker } from '../HandTracker';

describe('HandTracker', () => {
  let tracker: HandTracker;

  beforeEach(() => {
    tracker = new HandTracker();
  });

  // ---------- Initialization ----------
  it('initializes both hands untracked', () => {
    expect(tracker.isTracked('left')).toBe(false);
    expect(tracker.isTracked('right')).toBe(false);
  });

  it('defaults gesture to none', () => {
    expect(tracker.getGesture('left')).toBe('none');
    expect(tracker.getGesture('right')).toBe('none');
  });

  // ---------- Joint Updates ----------
  it('marks hand as tracked after joint update', () => {
    tracker.updateJoints('left', { wrist: { x: 0, y: 0, z: 0 } });
    expect(tracker.isTracked('left')).toBe(true);
  });

  it('stores joints retrievable by getJoint', () => {
    tracker.updateJoints('right', {
      wrist: { x: 1, y: 2, z: 3 },
      thumb_tip: { x: 0.1, y: 0.2, z: 0.3 },
    });
    const wrist = tracker.getJoint('right', 'wrist');
    expect(wrist).toBeDefined();
    expect(wrist!.x).toBe(1);
    expect(wrist!.y).toBe(2);
    expect(wrist!.z).toBe(3);
  });

  it('returns undefined for missing joint', () => {
    expect(tracker.getJoint('left', 'nonexistent')).toBeUndefined();
  });

  // ---------- Gesture Detection ----------
  it('detects pinch when pinchStrength > 0.8', () => {
    tracker.updateStrength('right', 0.9, 0);
    tracker.updateJoints('right', { wrist: { x: 0, y: 0, z: 0 } });
    expect(tracker.getGesture('right')).toBe('pinch');
  });

  it('detects grab when gripStrength > 0.8', () => {
    tracker.updateStrength('left', 0, 0.9);
    tracker.updateJoints('left', { wrist: { x: 0, y: 0, z: 0 } });
    expect(tracker.getGesture('left')).toBe('grab');
  });

  it('detects point when index far from thumb and grip low', () => {
    tracker.updateStrength('right', 0, 0.1);
    tracker.updateJoints('right', {
      thumb_tip: { x: 0, y: 0, z: 0 },
      index_tip: { x: 0.2, y: 0, z: 0 },  // far from thumb
      middle_tip: { x: 0, y: -0.1, z: 0 },
    });
    expect(tracker.getGesture('right')).toBe('point');
  });

  it('detects open hand when both strengths low', () => {
    tracker.updateStrength('left', 0.1, 0.1);
    tracker.updateJoints('left', { wrist: { x: 0, y: 0, z: 0 } });
    expect(tracker.getGesture('left')).toBe('open');
  });

  // ---------- Strength ----------
  it('updates pinch and grip strength', () => {
    tracker.updateStrength('right', 0.5, 0.7);
    const state = tracker.getHand('right');
    expect(state.pinchStrength).toBe(0.5);
    expect(state.gripStrength).toBe(0.7);
  });

  // ---------- Gesture History ----------
  it('records gesture history', () => {
    tracker.updateJoints('left', { wrist: { x: 0, y: 0, z: 0 } });
    tracker.updateJoints('left', { wrist: { x: 1, y: 0, z: 0 } });
    const history = tracker.getGestureHistory();
    expect(history.length).toBe(2);
    expect(history[0].side).toBe('left');
  });

  it('returns a copy of gesture history', () => {
    tracker.updateJoints('right', { wrist: { x: 0, y: 0, z: 0 } });
    const h1 = tracker.getGestureHistory();
    const h2 = tracker.getGestureHistory();
    expect(h1).not.toBe(h2); // Different array reference
    expect(h1).toEqual(h2);
  });
});
