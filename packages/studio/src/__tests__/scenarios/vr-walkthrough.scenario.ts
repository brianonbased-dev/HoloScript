/**
 * vr-walkthrough.scenario.ts — LIVING-SPEC: VR Walkthrough
 *
 * Persona: Luna — architect conducting virtual building walkthroughs,
 * testing spatial navigation, teleportation, and accessibility features.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  teleportArc,
  validateTeleportTarget,
  isInBounds,
  roomArea,
  roomVolume,
  detectGesture,
  handReachDistance,
  applyComfortMovement,
  snapTurn,
  isComfortableFrameRate,
  walkthroughDuration,
  waypointAtTime,
  walkthroughPathLength,
  type RoomBounds,
  type HandPose,
  type ComfortSettings,
  type WalkthroughWaypoint,
} from '@/lib/vrWalkthrough';

// ═══════════════════════════════════════════════════════════════════
// 1. Teleportation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: VR Walkthrough — Teleportation', () => {
  it('teleportArc() generates parabolic trajectory', () => {
    const arc = teleportArc({ x: 0, y: 1.5, z: 0 }, { x: 2, y: 3, z: 0 }, 9.81);
    expect(arc.length).toBeGreaterThan(2);
    // First point is origin
    expect(arc[0].x).toBe(0);
    expect(arc[0].y).toBe(1.5);
    // Arc rises then falls
    const maxY = Math.max(...arc.map((p) => p.y));
    expect(maxY).toBeGreaterThan(1.5);
    // Last point is at or below ground
    expect(arc[arc.length - 1].y).toBeLessThanOrEqual(0.01);
  });

  it('teleportArc() stops at ground level', () => {
    const arc = teleportArc(
      { x: 0, y: 10, z: 0 },
      { x: 1, y: -2, z: 0 }, // Downward
      9.81,
      100
    );
    expect(arc[arc.length - 1].y).toBe(0);
  });

  it('validateTeleportTarget() — valid target within bounds', () => {
    const bounds: RoomBounds = {
      center: { x: 0, y: 0, z: 0 },
      widthM: 10,
      depthM: 10,
      heightM: 3,
      boundaryPoints: [],
    };
    const target = validateTeleportTarget({ x: 2, y: 0, z: 3 }, bounds);
    expect(target.isValid).toBe(true);
    expect(target.distance).toBeGreaterThan(0);
  });

  it('validateTeleportTarget() — rejects target outside bounds', () => {
    const bounds: RoomBounds = {
      center: { x: 0, y: 0, z: 0 },
      widthM: 4,
      depthM: 4,
      heightM: 3,
      boundaryPoints: [],
    };
    const target = validateTeleportTarget({ x: 10, y: 0, z: 0 }, bounds);
    expect(target.isValid).toBe(false);
  });

  it('validateTeleportTarget() — rejects elevated targets', () => {
    const bounds: RoomBounds = {
      center: { x: 0, y: 0, z: 0 },
      widthM: 10,
      depthM: 10,
      heightM: 3,
      boundaryPoints: [],
    };
    const target = validateTeleportTarget({ x: 0, y: 2, z: 0 }, bounds);
    expect(target.isValid).toBe(false); // Too high (not near floor)
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Room-Scale Bounds
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: VR Walkthrough — Room Bounds', () => {
  const bounds: RoomBounds = {
    center: { x: 0, y: 0, z: 0 },
    widthM: 6,
    depthM: 4,
    heightM: 2.5,
    boundaryPoints: [],
  };

  it('isInBounds() confirms center is in bounds', () => {
    const result = isInBounds({ x: 0, y: 0, z: 0 }, bounds);
    expect(result.inBounds).toBe(true);
    expect(result.nearBoundary).toBe(false);
  });

  it('isInBounds() warns near edge', () => {
    const result = isInBounds({ x: 2.5, y: 0, z: 0 }, bounds); // 0.2m from edge
    expect(result.nearBoundary).toBe(true);
  });

  it('isInBounds() rejects outside position', () => {
    const result = isInBounds({ x: 10, y: 0, z: 0 }, bounds);
    expect(result.inBounds).toBe(false);
  });

  it('roomArea() calculates floor area', () => {
    expect(roomArea(bounds)).toBe(24); // 6 × 4
  });

  it('roomVolume() calculates cubic meters', () => {
    expect(roomVolume(bounds)).toBe(60); // 6 × 4 × 2.5
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Hand Tracking
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: VR Walkthrough — Hand Tracking', () => {
  it('detectGesture() identifies pinch', () => {
    const hand: HandPose = {
      handedness: 'right',
      wristPosition: { x: 0.3, y: 1.2, z: -0.3 },
      fingerTips: [
        { x: 0.32, y: 1.25, z: -0.32 },
        { x: 0.32, y: 1.26, z: -0.32 },
      ],
      gripStrength: 0.3,
      pinchStrength: 0.9,
      gesture: 'unknown',
    };
    expect(detectGesture(hand)).toBe('pinch');
  });

  it('detectGesture() identifies fist', () => {
    const hand: HandPose = {
      handedness: 'left',
      wristPosition: { x: -0.3, y: 1.2, z: -0.3 },
      fingerTips: [],
      gripStrength: 0.95,
      pinchStrength: 0.1,
      gesture: 'unknown',
    };
    expect(detectGesture(hand)).toBe('fist');
  });

  it('detectGesture() identifies open hand', () => {
    const hand: HandPose = {
      handedness: 'right',
      wristPosition: { x: 0, y: 1.2, z: 0 },
      fingerTips: [],
      gripStrength: 0,
      pinchStrength: 0,
      gesture: 'unknown',
    };
    expect(detectGesture(hand)).toBe('open');
  });

  it('handReachDistance() calculates from shoulder', () => {
    const hand: HandPose = {
      handedness: 'right',
      wristPosition: { x: 0.5, y: 1.2, z: -0.6 },
      fingerTips: [],
      gripStrength: 0,
      pinchStrength: 0,
      gesture: 'open',
    };
    const reach = handReachDistance(hand);
    expect(reach).toBeGreaterThan(0.3);
    expect(reach).toBeLessThan(1.5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Comfort & Accessibility
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: VR Walkthrough — Comfort Settings', () => {
  const settings: ComfortSettings = {
    snapTurnDegrees: 45,
    vignetteOnMove: true,
    movementSpeed: 2.0,
    teleportOnly: false,
    seatedMode: false,
    heightOffsetM: 0,
  };

  it('applyComfortMovement() scales by speed', () => {
    const result = applyComfortMovement({ x: 1, y: 0, z: 0 }, settings);
    expect(result.x).toBe(2.0);
  });

  it('applyComfortMovement() blocks movement in teleport-only mode', () => {
    const result = applyComfortMovement({ x: 1, y: 0, z: 1 }, { ...settings, teleportOnly: true });
    expect(result.x).toBe(0);
    expect(result.z).toBe(0);
  });

  it('applyComfortMovement() blocks Y movement in seated mode', () => {
    const result = applyComfortMovement({ x: 0, y: 1, z: 0 }, { ...settings, seatedMode: true });
    expect(result.y).toBe(0);
  });

  it('snapTurn() rotates by snap degrees', () => {
    expect(snapTurn(0, 'right', 45)).toBe(45);
    expect(snapTurn(0, 'left', 45)).toBe(315);
    expect(snapTurn(350, 'right', 45)).toBe(35); // Wraps around
  });

  it('isComfortableFrameRate() classifies risk', () => {
    expect(isComfortableFrameRate(90).comfortable).toBe(true);
    expect(isComfortableFrameRate(90).risk).toBe('none');
    expect(isComfortableFrameRate(50).risk).toBe('mild');
    expect(isComfortableFrameRate(30).risk).toBe('severe');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Guided Walkthrough
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: VR Walkthrough — Guided Tour', () => {
  const waypoints: WalkthroughWaypoint[] = [
    {
      id: 'wp1',
      position: [0, 0, 0],
      lookAt: { x: 5, y: 1, z: 0 },
      durationSec: 10,
      label: 'Entrance',
    },
    {
      id: 'wp2',
      position: [5, 0, 0],
      lookAt: { x: 10, y: 1, z: 0 },
      durationSec: 15,
      label: 'Lobby',
    },
    {
      id: 'wp3',
      position: [10, 3, 5],
      lookAt: { x: 10, y: 3, z: 10 },
      durationSec: 20,
      label: 'Rooftop',
    },
  ];

  it('walkthroughDuration() sums all waypoint durations', () => {
    expect(walkthroughDuration(waypoints)).toBe(45);
  });

  it('waypointAtTime() returns correct waypoint', () => {
    const wp = waypointAtTime(waypoints, 5);
    expect(wp!.id).toBe('wp1'); // 0-10 sec
    const wp2 = waypointAtTime(waypoints, 12);
    expect(wp2!.id).toBe('wp2'); // 10-25 sec
    const wp3 = waypointAtTime(waypoints, 30);
    expect(wp3!.id).toBe('wp3'); // 25-45 sec
  });

  it('waypointAtTime() returns null past total duration', () => {
    expect(waypointAtTime(waypoints, 100)).toBeNull();
  });

  it('walkthroughPathLength() calculates total distance', () => {
    const length = walkthroughPathLength(waypoints);
    expect(length).toBeGreaterThan(10); // At least 10m across 3 waypoints
  });
});
