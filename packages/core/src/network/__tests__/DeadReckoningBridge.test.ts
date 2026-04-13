/**
 * DeadReckoningBridge — Cross-domain physics + networking interop tests.
 *
 * Tests the dead-reckoning predictor, physics state extraction,
 * authority resolution, and bandwidth estimation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeadReckoningPredictor,
  PhysicsAuthorityResolver,
  extractPhysicsSnapshot,
  estimatePhysicsBandwidth,
  DEFAULT_DEAD_RECKONING_CONFIG,
  SNAPSHOT_BYTE_SIZE,
  type PhysicsSnapshot,
  type DeadReckoningConfig,
} from '../DeadReckoningBridge';

// =============================================================================
// Helpers
// =============================================================================

function makeSnapshot(overrides: Partial<PhysicsSnapshot> = {}): PhysicsSnapshot {
  return {
    entityId: 'entity-1',
    timestamp: 1000,
    sequence: 1,
    position: [0, 10, 0],
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 5, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    appliedForce: { x: 0, y: 0, z: 0 },
    mass: 1,
    linearDamping: 0,
    useGravity: true,
    isKinematic: false,
    ...overrides,
  };
}

// =============================================================================
// DeadReckoningPredictor
// =============================================================================

describe('DeadReckoningPredictor', () => {
  let predictor: DeadReckoningPredictor;

  beforeEach(() => {
    predictor = new DeadReckoningPredictor();
  });

  it('returns null when no snapshots exist', () => {
    expect(predictor.predict(1000)).toBeNull();
    expect(predictor.getInterpolatedPosition(1000)).toBeNull();
  });

  it('returns latest snapshot when dt is 0', () => {
    const snap = makeSnapshot({ timestamp: 1000 });
    predictor.pushSnapshot(snap);

    const result = predictor.predict(1000);
    expect(result).not.toBeNull();
    expect(result!.position.x).toBeCloseTo(0);
    expect(result!.position.y).toBeCloseTo(10);
  });

  it('linear extrapolation for kinematic bodies', () => {
    const snap = makeSnapshot({
      timestamp: 1000,
      position: [0, 5, 0],
      velocity: { x: 10, y: 0, z: 0 },
      isKinematic: true,
    });
    predictor.pushSnapshot(snap);

    // 100ms later: x should be 0 + 10 * 0.1 = 1
    const result = predictor.predict(1100);
    expect(result!.position.x).toBeCloseTo(1);
    expect(result!.position.y).toBeCloseTo(5); // no gravity for kinematic
  });

  it('applies gravity for non-kinematic bodies', () => {
    // Use longer maxExtrapolation for physics accuracy test
    predictor = new DeadReckoningPredictor({ maxExtrapolation: 2000 });
    const snap = makeSnapshot({
      timestamp: 1000,
      position: [0, 100, 0],
      velocity: { x: 0, y: 0, z: 0 },
      mass: 1,
      useGravity: true,
      linearDamping: 0,
    });
    predictor.pushSnapshot(snap);

    // 1 second later with gravity (-9.81 m/s²):
    // v' = 0 + (-9.81) * 1 = -9.81
    // p' = 100 + (-9.81) * 1 = 90.19
    const result = predictor.predict(2000);
    expect(result!.velocity.y).toBeCloseTo(-9.81, 1);
    expect(result!.position.y).toBeCloseTo(90.19, 1);
  });

  it('applies linear damping', () => {
    const snap = makeSnapshot({
      timestamp: 1000,
      position: [0, 0, 0],
      velocity: { x: 10, y: 0, z: 0 },
      mass: 1,
      useGravity: false,
      linearDamping: 0.5,
    });
    predictor = new DeadReckoningPredictor({ applyGravity: false, maxExtrapolation: 2000 });
    predictor.pushSnapshot(snap);

    // After 1 second: dampFactor = 1 - 0.5 * 1 = 0.5
    // v' = 10 * 0.5 = 5
    const result = predictor.predict(2000);
    expect(result!.velocity.x).toBeCloseTo(5);
  });

  it('includes applied forces in prediction', () => {
    const snap = makeSnapshot({
      timestamp: 1000,
      position: [0, 0, 0],
      velocity: { x: 0, y: 0, z: 0 },
      appliedForce: { x: 20, y: 0, z: 0 }, // 20N on 2kg mass = 10 m/s²
      mass: 2,
      useGravity: false,
      linearDamping: 0,
    });
    predictor = new DeadReckoningPredictor({ applyGravity: false, maxExtrapolation: 2000 });
    predictor.pushSnapshot(snap);

    // After 1s: a = 20/2 = 10 m/s², v = 10 m/s, p = 10m
    const result = predictor.predict(2000);
    expect(result!.velocity.x).toBeCloseTo(10);
    expect(result!.position.x).toBeCloseTo(10);
  });

  it('clamps extrapolation to maxExtrapolation', () => {
    predictor = new DeadReckoningPredictor({ maxExtrapolation: 100 });
    const snap = makeSnapshot({
      timestamp: 1000,
      position: [0, 0, 0],
      velocity: { x: 10, y: 0, z: 0 },
      useGravity: false,
      isKinematic: true,
    });
    predictor.pushSnapshot(snap);

    // 500ms later but clamped to 100ms: x = 10 * 0.1 = 1
    const result = predictor.predict(1500);
    expect(result!.position.x).toBeCloseTo(1);
  });

  it('returns latest snapshot for negative dt', () => {
    const snap = makeSnapshot({ timestamp: 1000 });
    predictor.pushSnapshot(snap);

    const result = predictor.predict(500); // before the snapshot
    expect(result!.position).toEqual(snap.position);
  });

  it('evicts old snapshots beyond buffer size', () => {
    predictor = new DeadReckoningPredictor({ snapshotBufferSize: 3 });
    for (let i = 0; i < 5; i++) {
      predictor.pushSnapshot(makeSnapshot({ timestamp: 1000 + i * 50, sequence: i }));
    }
    expect(predictor.snapshotCount).toBe(3);
  });

  it('reset() clears all state', () => {
    predictor.pushSnapshot(makeSnapshot());
    predictor.reset();
    expect(predictor.snapshotCount).toBe(0);
    expect(predictor.predict(2000)).toBeNull();
  });
});

// =============================================================================
// Correction
// =============================================================================

describe('DeadReckoningPredictor — Correction', () => {
  let predictor: DeadReckoningPredictor;

  beforeEach(() => {
    predictor = new DeadReckoningPredictor();
  });

  it('computeCorrection returns "none" for invisible errors', () => {
    const predicted = makeSnapshot({ position: [0, 0, 0] });
    const authoritative = makeSnapshot({ position: [0.005, 0, 0] });

    const result = predictor.computeCorrection(predicted, authoritative);
    expect(result.strategy).toBe('none');
    expect(result.error).toBeLessThan(0.01);
  });

  it('computeCorrection returns "exponential" for smooth-range errors', () => {
    const predicted = makeSnapshot({ position: [0, 0, 0] });
    const authoritative = makeSnapshot({ position: [0.3, 0, 0] });

    const result = predictor.computeCorrection(predicted, authoritative);
    expect(result.strategy).toBe('exponential');
    expect(result.error).toBeCloseTo(0.3);
    expect(result.offset.x).toBeCloseTo(0.3);
  });

  it('computeCorrection returns "snap" for large errors', () => {
    const predicted = makeSnapshot({ position: [0, 0, 0] });
    const authoritative = makeSnapshot({ position: [5, 0, 0] });

    const result = predictor.computeCorrection(predicted, authoritative);
    expect(result.strategy).toBe('snap');
    expect(result.error).toBeCloseTo(5);
  });

  it('correction offset decays over blend duration', () => {
    predictor.startCorrection({ x: 1, y: 0, z: 0 }, 1000, 200);

    // At start: full offset
    const start = predictor.getCorrectionOffset(1000);
    expect(start.x).toBeCloseTo(1);

    // At midpoint: partially decayed
    const mid = predictor.getCorrectionOffset(1100);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(1);

    // After duration: zero
    const end = predictor.getCorrectionOffset(1200);
    expect(end.x).toBe(0);
    expect(end.y).toBe(0);
  });

  it('getInterpolatedPosition combines prediction and correction', () => {
    const snap = makeSnapshot({
      timestamp: 1000,
      position: [0, 0, 0],
      velocity: { x: 10, y: 0, z: 0 },
      useGravity: false,
      isKinematic: true,
    });
    predictor.pushSnapshot(snap);
    predictor.startCorrection({ x: 2, y: 0, z: 0 }, 1000, 200);

    // At t=1100 (100ms later):
    // Predicted: x = 10 * 0.1 = 1
    // Correction blend: partially applied
    const pos = predictor.getInterpolatedPosition(1100);
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeGreaterThan(1); // prediction + remaining correction
  });
});

// =============================================================================
// extractPhysicsSnapshot
// =============================================================================

describe('extractPhysicsSnapshot', () => {
  it('creates a valid snapshot with all fields', () => {
    const snap = extractPhysicsSnapshot(
      'obj-1',
      42,
      5000,
      {
        position: [1, 2, 3],
        rotation: { x: 0, y: 0.707, z: 0, w: 0.707 },
      },
      {
        velocity: { x: 5, y: -1, z: 0 },
        angularVelocity: { x: 0, y: 1, z: 0 },
        mass: 10,
        linearDamping: 0.1,
        useGravity: true,
      }
    );

    expect(snap.entityId).toBe('obj-1');
    expect(snap.sequence).toBe(42);
    expect(snap.timestamp).toBe(5000);
    expect(snap.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(snap.velocity).toEqual({ x: 5, y: -1, z: 0 });
    expect(snap.mass).toBe(10);
    expect(snap.linearDamping).toBe(0.1);
    expect(snap.useGravity).toBe(true);
    expect(snap.isKinematic).toBe(false); // default
    expect(snap.appliedForce).toEqual({ x: 0, y: 0, z: 0 }); // default
  });

  it('defaults optional fields', () => {
    const snap = extractPhysicsSnapshot(
      'obj-2',
      1,
      0,
      { position: [0, 0, 0], rotation: { x: 0, y: 0, z: 0, w: 1 } },
      { velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1 }
    );

    expect(snap.linearDamping).toBe(0);
    expect(snap.useGravity).toBe(true);
    expect(snap.isKinematic).toBe(false);
  });
});

// =============================================================================
// PhysicsAuthorityResolver
// =============================================================================

describe('PhysicsAuthorityResolver', () => {
  let resolver: PhysicsAuthorityResolver;

  beforeEach(() => {
    resolver = new PhysicsAuthorityResolver();
  });

  it('setOwner and getOwner work correctly', () => {
    resolver.setOwner('ball', 'player-1');
    expect(resolver.getOwner('ball')).toBe('player-1');
    expect(resolver.isOwner('ball', 'player-1')).toBe(true);
    expect(resolver.isOwner('ball', 'player-2')).toBe(false);
  });

  it('returns undefined for unowned entities', () => {
    expect(resolver.getOwner('unknown')).toBeUndefined();
  });

  it('requestAuthority in "owner" mode grants immediately', () => {
    resolver.setOwner('ball', 'player-1');
    const granted = resolver.requestAuthority('ball', 'player-2', 'owner');
    expect(granted).toBe(true);
    expect(resolver.getOwner('ball')).toBe('player-2');
  });

  it('requestAuthority in "nearest" mode grants immediately', () => {
    const granted = resolver.requestAuthority('cube', 'player-3', 'nearest');
    expect(granted).toBe(true);
    expect(resolver.getOwner('cube')).toBe('player-3');
  });

  it('requestAuthority in "server" mode queues the request', () => {
    const granted = resolver.requestAuthority('ball', 'player-1', 'server');
    expect(granted).toBe(false);
    expect(resolver.getOwner('ball')).toBeUndefined();
  });

  it('processQueue resolves server-mode requests', () => {
    resolver.requestAuthority('ball', 'player-1', 'server');
    resolver.requestAuthority('cube', 'player-2', 'server');

    // Grant only ball
    const granted = resolver.processQueue((req) => req.entityId === 'ball');
    expect(granted).toHaveLength(1);
    expect(granted[0].entityId).toBe('ball');
    expect(resolver.getOwner('ball')).toBe('player-1');
    expect(resolver.getOwner('cube')).toBeUndefined();
  });

  it('releaseAuthority only works for current owner', () => {
    resolver.setOwner('ball', 'player-1');
    expect(resolver.releaseAuthority('ball', 'player-2')).toBe(false);
    expect(resolver.releaseAuthority('ball', 'player-1')).toBe(true);
    expect(resolver.getOwner('ball')).toBeUndefined();
  });

  it('getOwnedCount returns correct count', () => {
    resolver.setOwner('a', 'player-1');
    resolver.setOwner('b', 'player-1');
    resolver.setOwner('c', 'player-2');
    expect(resolver.getOwnedCount('player-1')).toBe(2);
    expect(resolver.getOwnedCount('player-2')).toBe(1);
    expect(resolver.getOwnedCount('player-3')).toBe(0);
  });

  it('reset clears all ownership', () => {
    resolver.setOwner('a', 'player-1');
    resolver.requestAuthority('b', 'player-2', 'server');
    resolver.reset();
    expect(resolver.getOwner('a')).toBeUndefined();
    expect(resolver.getOwnedCount('player-1')).toBe(0);
  });
});

// =============================================================================
// Bandwidth Estimation
// =============================================================================

describe('estimatePhysicsBandwidth', () => {
  it('estimates correctly for 10 entities at 20Hz', () => {
    const est = estimatePhysicsBandwidth(10, 20);
    expect(est.entityCount).toBe(10);
    expect(est.syncRate).toBe(20);
    expect(est.bytesPerSnapshot).toBe(SNAPSHOT_BYTE_SIZE);
    expect(est.bytesPerSecond).toBe(10 * SNAPSHOT_BYTE_SIZE * 20);
    expect(est.kbPerSecond).toBeCloseTo(est.bytesPerSecond / 1024, 1);
  });

  it('defaults to 20Hz sync rate', () => {
    const est = estimatePhysicsBandwidth(1);
    expect(est.syncRate).toBe(20);
  });

  it('100 entities at 20Hz stays under 200 KB/s', () => {
    const est = estimatePhysicsBandwidth(100, 20);
    expect(est.kbPerSecond).toBeLessThan(200);
  });
});

// =============================================================================
// Integration: Full Dead-Reckoning Pipeline
// =============================================================================

describe('Dead-Reckoning Pipeline (integration)', () => {
  it('projectile trajectory: throw → predict → correct → converge', () => {
    const predictor = new DeadReckoningPredictor({
      applyGravity: true,
      gravity: { x: 0, y: -10, z: 0 }, // simplified gravity
      maxExtrapolation: 2000,
    });

    // T=0: Ball thrown with velocity (10, 20, 0) from origin
    const t0 = makeSnapshot({
      timestamp: 0,
      position: [0, 0, 0],
      velocity: { x: 10, y: 20, z: 0 },
      mass: 1,
      useGravity: true,
      linearDamping: 0,
    });
    predictor.pushSnapshot(t0);

    // Predict at T=1000ms (1 second)
    const pred1 = predictor.predict(1000)!;
    // v_y = 20 + (-10) * 1 = 10
    // p_y = 0 + 10 * 1 = 10
    // p_x = 0 + 10 * 1 = 10
    expect(pred1.position.x).toBeCloseTo(10, 0);
    expect(pred1.position.y).toBeCloseTo(10, 0);
    expect(pred1.velocity.y).toBeCloseTo(10, 0);

    // Now authoritative state arrives (slightly different due to collision)
    const auth1 = makeSnapshot({
      timestamp: 1000,
      position: [10, 9.7, 0], // 0.3m lower than predicted
      velocity: { x: 10, y: 8, z: 0 },
      mass: 1,
      useGravity: true,
      linearDamping: 0,
    });

    // Compute correction
    const correction = predictor.computeCorrection(pred1, auth1);
    expect(correction.strategy).toBe('exponential'); // 0.3m is in smooth range (< 0.5)
    expect(correction.error).toBeCloseTo(0.3, 1);

    // Apply authoritative state and continue prediction
    predictor.pushSnapshot(auth1);
    predictor.startCorrection(correction.offset, 1000, 200);

    // At T=1050ms: correction still blending
    const pos = predictor.getInterpolatedPosition(1050);
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeGreaterThan(10); // moved forward
  });

  it('20Hz sync rate masks 50ms gaps smoothly', () => {
    const predictor = new DeadReckoningPredictor();
    const snapshots: PhysicsSnapshot[] = [];

    // Simulate 5 snapshots at 20Hz (50ms apart)
    for (let i = 0; i < 5; i++) {
      const t = i * 50;
      snapshots.push(
        makeSnapshot({
          timestamp: t,
          sequence: i,
          position: [i * 0.5, 0, 0],
          velocity: { x: 10, y: 0, z: 0 },
          useGravity: false,
          isKinematic: true,
        })
      );
    }

    // Feed snapshots and predict between them
    predictor.pushSnapshot(snapshots[0]);

    // At T=25ms (between snapshot 0 and 1)
    const mid = predictor.predict(25)!;
    expect(mid.position.x).toBeCloseTo(0.25, 1); // 10 m/s * 0.025s

    // Feed next snapshot, predict at T=75ms
    predictor.pushSnapshot(snapshots[1]);
    const afterSecond = predictor.predict(75)!;
    expect(afterSecond.position.x).toBeCloseTo(0.5 + 10 * 0.025, 1);
  });
});

// =============================================================================
// Config defaults
// =============================================================================

describe('DEFAULT_DEAD_RECKONING_CONFIG', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_DEAD_RECKONING_CONFIG.syncRate).toBe(20);
    expect(DEFAULT_DEAD_RECKONING_CONFIG.maxExtrapolation).toBe(250);
    expect(DEFAULT_DEAD_RECKONING_CONFIG.applyGravity).toBe(true);
    expect(DEFAULT_DEAD_RECKONING_CONFIG.gravity.y).toBeCloseTo(-9.81);
    expect(DEFAULT_DEAD_RECKONING_CONFIG.authority).toBe('owner');
    expect(DEFAULT_DEAD_RECKONING_CONFIG.thresholds.invisible).toBe(0.01);
    expect(DEFAULT_DEAD_RECKONING_CONFIG.thresholds.smooth).toBe(0.5);
  });
});
