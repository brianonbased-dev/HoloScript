/**
 * Tests for touch gesture recognition logic
 *
 * Tests the gesture detection algorithms (swipe direction, pinch scale,
 * distance/angle calculations) without requiring a DOM environment.
 */
import { describe, it, expect } from 'vitest';

// ── Re-implement helpers for unit testing ────────────────────────────────────
// These mirror the internal helpers in useTouchGestures.ts so we can test
// the gesture recognition logic without mounting React components.

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

function distance(p1: TouchPoint, p2: TouchPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angle(p1: TouchPoint, p2: TouchPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

const SWIPE_ANGLE_TOLERANCE = 30;

type TouchGestureType =
  | 'swipe-left'
  | 'swipe-right'
  | 'swipe-up'
  | 'swipe-down'
  | 'pinch-in'
  | 'pinch-out'
  | 'long-press'
  | 'double-tap';

function getSwipeDirection(deg: number): TouchGestureType | null {
  const absDeg = Math.abs(deg);

  if (absDeg <= SWIPE_ANGLE_TOLERANCE) return 'swipe-right';
  if (absDeg >= 180 - SWIPE_ANGLE_TOLERANCE) return 'swipe-left';
  if (deg >= 90 - SWIPE_ANGLE_TOLERANCE && deg <= 90 + SWIPE_ANGLE_TOLERANCE) return 'swipe-down';
  if (deg >= -(90 + SWIPE_ANGLE_TOLERANCE) && deg <= -(90 - SWIPE_ANGLE_TOLERANCE)) return 'swipe-up';

  return null;
}

function getPinchScale(
  startTouches: [TouchPoint, TouchPoint],
  currentTouches: [TouchPoint, TouchPoint],
): number {
  const startDistance = distance(startTouches[0], startTouches[1]);
  const currentDistance = distance(currentTouches[0], currentTouches[1]);
  if (startDistance === 0) return 1;
  return currentDistance / startDistance;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('distance calculation', () => {
  it('should return 0 for same points', () => {
    const p = { x: 100, y: 200, timestamp: 0 };
    expect(distance(p, p)).toBe(0);
  });

  it('should calculate horizontal distance correctly', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 100, y: 0, timestamp: 0 };
    expect(distance(p1, p2)).toBe(100);
  });

  it('should calculate vertical distance correctly', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 0, y: 75, timestamp: 0 };
    expect(distance(p1, p2)).toBe(75);
  });

  it('should calculate diagonal distance correctly', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 3, y: 4, timestamp: 0 };
    expect(distance(p1, p2)).toBe(5); // 3-4-5 triangle
  });

  it('should be symmetric', () => {
    const p1 = { x: 10, y: 20, timestamp: 0 };
    const p2 = { x: 50, y: 80, timestamp: 0 };
    expect(distance(p1, p2)).toBe(distance(p2, p1));
  });
});

describe('angle calculation', () => {
  it('should return 0 for rightward movement', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 100, y: 0, timestamp: 0 };
    expect(angle(p1, p2)).toBe(0);
  });

  it('should return 90 for downward movement', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 0, y: 100, timestamp: 0 };
    expect(angle(p1, p2)).toBe(90);
  });

  it('should return -90 for upward movement', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 0, y: -100, timestamp: 0 };
    expect(angle(p1, p2)).toBe(-90);
  });

  it('should return 180 or -180 for leftward movement', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: -100, y: 0, timestamp: 0 };
    const a = angle(p1, p2);
    expect(Math.abs(a)).toBe(180);
  });

  it('should return ~45 for diagonal down-right', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 100, y: 100, timestamp: 0 };
    expect(angle(p1, p2)).toBeCloseTo(45, 0);
  });

  it('should return ~-45 for diagonal up-right', () => {
    const p1 = { x: 0, y: 0, timestamp: 0 };
    const p2 = { x: 100, y: -100, timestamp: 0 };
    expect(angle(p1, p2)).toBeCloseTo(-45, 0);
  });
});

describe('getSwipeDirection', () => {
  it('should detect swipe-right for angles near 0', () => {
    expect(getSwipeDirection(0)).toBe('swipe-right');
    expect(getSwipeDirection(10)).toBe('swipe-right');
    expect(getSwipeDirection(-10)).toBe('swipe-right');
    expect(getSwipeDirection(29)).toBe('swipe-right');
    expect(getSwipeDirection(-29)).toBe('swipe-right');
  });

  it('should detect swipe-left for angles near 180/-180', () => {
    expect(getSwipeDirection(180)).toBe('swipe-left');
    expect(getSwipeDirection(-180)).toBe('swipe-left');
    expect(getSwipeDirection(170)).toBe('swipe-left');
    expect(getSwipeDirection(-170)).toBe('swipe-left');
    expect(getSwipeDirection(151)).toBe('swipe-left');
    expect(getSwipeDirection(-151)).toBe('swipe-left');
  });

  it('should detect swipe-down for angles near 90', () => {
    expect(getSwipeDirection(90)).toBe('swipe-down');
    expect(getSwipeDirection(80)).toBe('swipe-down');
    expect(getSwipeDirection(100)).toBe('swipe-down');
    expect(getSwipeDirection(61)).toBe('swipe-down');
    expect(getSwipeDirection(119)).toBe('swipe-down');
  });

  it('should detect swipe-up for angles near -90', () => {
    expect(getSwipeDirection(-90)).toBe('swipe-up');
    expect(getSwipeDirection(-80)).toBe('swipe-up');
    expect(getSwipeDirection(-100)).toBe('swipe-up');
    expect(getSwipeDirection(-61)).toBe('swipe-up');
    expect(getSwipeDirection(-119)).toBe('swipe-up');
  });

  it('should return null for ambiguous diagonal angles', () => {
    // 45 degrees is between right (0) and down (90) -- outside both zones
    expect(getSwipeDirection(45)).toBeNull();
    expect(getSwipeDirection(-45)).toBeNull();
    expect(getSwipeDirection(135)).toBeNull();
    expect(getSwipeDirection(-135)).toBeNull();
  });

  it('should handle boundary tolerance correctly', () => {
    // At exactly the tolerance boundary (30 degrees)
    expect(getSwipeDirection(30)).toBe('swipe-right');
    expect(getSwipeDirection(-30)).toBe('swipe-right');

    // Just outside tolerance
    expect(getSwipeDirection(31)).toBeNull();
    expect(getSwipeDirection(-31)).toBeNull();
  });
});

describe('getPinchScale', () => {
  it('should return 1 for no movement', () => {
    const touches: [TouchPoint, TouchPoint] = [
      { x: 100, y: 100, timestamp: 0 },
      { x: 200, y: 200, timestamp: 0 },
    ];
    expect(getPinchScale(touches, touches)).toBe(1);
  });

  it('should return > 1 for pinch-out (zoom in)', () => {
    const start: [TouchPoint, TouchPoint] = [
      { x: 100, y: 100, timestamp: 0 },
      { x: 200, y: 200, timestamp: 0 },
    ];
    const current: [TouchPoint, TouchPoint] = [
      { x: 50, y: 50, timestamp: 100 },
      { x: 250, y: 250, timestamp: 100 },
    ];
    const scale = getPinchScale(start, current);
    expect(scale).toBeGreaterThan(1);
  });

  it('should return < 1 for pinch-in (zoom out)', () => {
    const start: [TouchPoint, TouchPoint] = [
      { x: 50, y: 50, timestamp: 0 },
      { x: 250, y: 250, timestamp: 0 },
    ];
    const current: [TouchPoint, TouchPoint] = [
      { x: 100, y: 100, timestamp: 100 },
      { x: 200, y: 200, timestamp: 100 },
    ];
    const scale = getPinchScale(start, current);
    expect(scale).toBeLessThan(1);
  });

  it('should return 2 for doubling distance', () => {
    const start: [TouchPoint, TouchPoint] = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 0 },
    ];
    const current: [TouchPoint, TouchPoint] = [
      { x: 0, y: 0, timestamp: 100 },
      { x: 200, y: 0, timestamp: 100 },
    ];
    expect(getPinchScale(start, current)).toBe(2);
  });

  it('should return 0.5 for halving distance', () => {
    const start: [TouchPoint, TouchPoint] = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 200, y: 0, timestamp: 0 },
    ];
    const current: [TouchPoint, TouchPoint] = [
      { x: 0, y: 0, timestamp: 100 },
      { x: 100, y: 0, timestamp: 100 },
    ];
    expect(getPinchScale(start, current)).toBe(0.5);
  });

  it('should return 1 when start distance is 0', () => {
    const start: [TouchPoint, TouchPoint] = [
      { x: 100, y: 100, timestamp: 0 },
      { x: 100, y: 100, timestamp: 0 },
    ];
    const current: [TouchPoint, TouchPoint] = [
      { x: 50, y: 50, timestamp: 100 },
      { x: 150, y: 150, timestamp: 100 },
    ];
    expect(getPinchScale(start, current)).toBe(1);
  });
});

describe('velocity calculation', () => {
  it('should calculate velocity as distance / duration', () => {
    const start = { x: 0, y: 0, timestamp: 0 };
    const end = { x: 100, y: 0, timestamp: 200 };

    const dist = distance(start, end);
    const duration = end.timestamp - start.timestamp;
    const velocity = duration > 0 ? dist / duration : 0;

    expect(velocity).toBe(0.5); // 100px / 200ms = 0.5 px/ms
  });

  it('should return 0 velocity for zero duration', () => {
    const start = { x: 0, y: 0, timestamp: 1000 };
    const end = { x: 100, y: 0, timestamp: 1000 };

    const dist = distance(start, end);
    const duration = end.timestamp - start.timestamp;
    const velocity = duration > 0 ? dist / duration : 0;

    expect(velocity).toBe(0);
  });

  it('should calculate fast swipe velocity correctly', () => {
    const start = { x: 100, y: 200, timestamp: 0 };
    const end = { x: 300, y: 200, timestamp: 100 }; // 200px in 100ms

    const dist = distance(start, end);
    const duration = end.timestamp - start.timestamp;
    const velocity = duration > 0 ? dist / duration : 0;

    expect(velocity).toBe(2); // 200px / 100ms = 2 px/ms (fast swipe)
  });
});

describe('swipe threshold validation', () => {
  const DEFAULT_SWIPE_THRESHOLD = 50;

  it('should classify as swipe when distance >= threshold', () => {
    const start = { x: 0, y: 0, timestamp: 0 };
    const end = { x: 60, y: 0, timestamp: 200 };

    const dist = distance(start, end);
    expect(dist).toBeGreaterThanOrEqual(DEFAULT_SWIPE_THRESHOLD);

    const direction = getSwipeDirection(angle(start, end));
    expect(direction).toBe('swipe-right');
  });

  it('should not classify as swipe when distance < threshold', () => {
    const start = { x: 0, y: 0, timestamp: 0 };
    const end = { x: 30, y: 0, timestamp: 200 };

    const dist = distance(start, end);
    expect(dist).toBeLessThan(DEFAULT_SWIPE_THRESHOLD);
    // In the hook, this would be treated as a tap, not a swipe
  });

  it('should support custom threshold', () => {
    const customThreshold = 100;
    const start = { x: 0, y: 0, timestamp: 0 };
    const end = { x: 80, y: 0, timestamp: 200 };

    const dist = distance(start, end);
    expect(dist).toBeLessThan(customThreshold);
    // Would NOT trigger a swipe with 100px threshold
    expect(dist).toBeGreaterThanOrEqual(DEFAULT_SWIPE_THRESHOLD);
    // WOULD trigger a swipe with default 50px threshold
  });
});

describe('double-tap detection logic', () => {
  const DOUBLE_TAP_INTERVAL = 300;
  const DOUBLE_TAP_DISTANCE = 30;

  it('should detect double-tap within time and distance thresholds', () => {
    const firstTap = { x: 100, y: 200, timestamp: 0 };
    const secondTap = { x: 105, y: 198, timestamp: 200 };

    const timeDelta = secondTap.timestamp - firstTap.timestamp;
    const dist = distance(firstTap, secondTap);

    const isDoubleTap = timeDelta < DOUBLE_TAP_INTERVAL && dist < DOUBLE_TAP_DISTANCE;
    expect(isDoubleTap).toBe(true);
  });

  it('should reject double-tap when time exceeds interval', () => {
    const firstTap = { x: 100, y: 200, timestamp: 0 };
    const secondTap = { x: 105, y: 198, timestamp: 400 };

    const timeDelta = secondTap.timestamp - firstTap.timestamp;
    const dist = distance(firstTap, secondTap);

    const isDoubleTap = timeDelta < DOUBLE_TAP_INTERVAL && dist < DOUBLE_TAP_DISTANCE;
    expect(isDoubleTap).toBe(false);
  });

  it('should reject double-tap when distance exceeds proximity', () => {
    const firstTap = { x: 100, y: 200, timestamp: 0 };
    const secondTap = { x: 150, y: 250, timestamp: 200 };

    const timeDelta = secondTap.timestamp - firstTap.timestamp;
    const dist = distance(firstTap, secondTap);

    const isDoubleTap = timeDelta < DOUBLE_TAP_INTERVAL && dist < DOUBLE_TAP_DISTANCE;
    expect(isDoubleTap).toBe(false);
  });
});

describe('long-press detection logic', () => {
  const LONG_PRESS_MOVE_TOLERANCE = 10;

  it('should cancel long press when finger moves beyond tolerance', () => {
    const start = { x: 100, y: 200, timestamp: 0 };
    const moved = { x: 112, y: 200, timestamp: 300 };

    const dist = distance(start, moved);
    expect(dist).toBeGreaterThan(LONG_PRESS_MOVE_TOLERANCE);
    // Long press would be cancelled
  });

  it('should maintain long press when finger stays within tolerance', () => {
    const start = { x: 100, y: 200, timestamp: 0 };
    const moved = { x: 103, y: 202, timestamp: 300 };

    const dist = distance(start, moved);
    expect(dist).toBeLessThanOrEqual(LONG_PRESS_MOVE_TOLERANCE);
    // Long press would continue
  });
});
