import { describe, it, expect, beforeEach } from 'vitest';
import { HandTracker } from '@holoscript/engine/vr';
import { VRLocomotion } from '@holoscript/engine/vr';
import { HapticFeedback } from '@holoscript/engine/vr';

describe('VR Interaction (Cycle 179)', () => {
  describe('HandTracker', () => {
    let tracker: HandTracker;

    beforeEach(() => {
      tracker = new HandTracker();
    });

    it('should initialize both hands', () => {
      expect(tracker.getHand('left')).toBeDefined();
      expect(tracker.getHand('right')).toBeDefined();
    });

    it('should update joint positions', () => {
      tracker.updateJoints('right', {
        thumb_tip: [0.1, 0.2, 0.3],
        index_tip: [0.15, 0.25, 0.35],
      });
      expect(tracker.isTracked('right')).toBe(true);
      expect(tracker.getJoint('right', 'thumb_tip')).toBeDefined();
    });

    it('should detect pinch gesture', () => {
      tracker.updateStrength('right', 0.9, 0.1);
      tracker.updateJoints('right', { thumb_tip: [0, 0, 0] });
      expect(tracker.getGesture('right')).toBe('pinch');
    });

    it('should detect grab gesture', () => {
      tracker.updateStrength('right', 0.1, 0.9);
      tracker.updateJoints('right', { thumb_tip: [0, 0, 0] });
      expect(tracker.getGesture('right')).toBe('grab');
    });

    it('should record gesture history', () => {
      tracker.updateJoints('right', { thumb_tip: [0, 0, 0] });
      expect(tracker.getGestureHistory().length).toBeGreaterThan(0);
    });
  });

  describe('VRLocomotion', () => {
    let loco: VRLocomotion;

    beforeEach(() => {
      loco = new VRLocomotion({ teleportRange: 10, snapAngle: 45, moveSpeed: 2 });
    });

    it('should teleport to valid targets', () => {
      const result = loco.teleport({ x: 5, y: 0, z: 3, valid: true, normal: [0, 1, 0] });
      expect(result).toBe(true);
      expect(loco.getPosition()[0]).toBe(5);
    });

    it('should reject teleport beyond range', () => {
      const result = loco.teleport({
        x: 99,
        y: 0,
        z: 99,
        valid: true,
        normal: [0, 1, 0],
      });
      expect(result).toBe(false);
    });

    it('should reject invalid targets', () => {
      const result = loco.teleport({
        x: 1,
        y: 0,
        z: 1,
        valid: false,
        normal: [0, 1, 0],
      });
      expect(result).toBe(false);
    });

    it('should snap turn', () => {
      loco.snapTurn('right');
      expect(loco.getRotation()).toBe(45);
      loco.snapTurn('left');
      expect(loco.getRotation()).toBe(0);
    });

    it('should smooth move', () => {
      loco.move(1, 0, 1);
      expect(loco.getPosition()[0]).toBeGreaterThan(0);
    });

    it('should compute boundary fade', () => {
      loco.updateBoundary(0.25);
      expect(loco.getBoundaryFade()).toBe(0.5);
    });
  });

  describe('HapticFeedback', () => {
    let haptics: HapticFeedback;

    beforeEach(() => {
      haptics = new HapticFeedback();
    });

    it('should have preset patterns', () => {
      expect(haptics.getPatternCount()).toBeGreaterThanOrEqual(4);
      expect(haptics.getPattern('tap')).toBeDefined();
      expect(haptics.getPattern('impact')).toBeDefined();
    });

    it('should play patterns', () => {
      expect(haptics.play('tap')).toBe(true);
      expect(haptics.getActivePulseCount()).toBeGreaterThan(0);
    });

    it('should fire custom pulses', () => {
      haptics.pulse('left', 0.5, 100);
      expect(haptics.getActivePulseCount()).toBe(1);
    });

    it('should stop all haptics', () => {
      haptics.play('impact');
      haptics.stopAll();
      expect(haptics.getActivePulseCount()).toBe(0);
    });

    it('should respect enabled flag', () => {
      haptics.setEnabled(false);
      expect(haptics.play('tap')).toBe(false);
    });

    it('should control global intensity', () => {
      haptics.setGlobalIntensity(0.5);
      expect(haptics.getGlobalIntensity()).toBe(0.5);
    });
  });
});
