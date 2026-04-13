import { describe, it, expect } from 'vitest';
import { ClientPrediction, type PredictedState } from '@holoscript/mesh';
import { SnapshotInterpolation } from '@holoscript/mesh';
import { LagCompensation } from '@holoscript/mesh';

describe('Cycle 157: Multiplayer Prediction', () => {
  // -------------------------------------------------------------------------
  // ClientPrediction
  // -------------------------------------------------------------------------

  it('should predict movement and reconcile with server', () => {
    const predictor = (
      state: PredictedState,
      input: { actions: Record<string, number>; deltaTime: number }
    ) => ({
      ...state,
      x: state.x + (input.actions['moveX'] ?? 0) * input.deltaTime,
      y: state.y,
      z: state.z,
      vx: state.vx,
      vy: state.vy,
      vz: state.vz,
    });

    const cp = new ClientPrediction({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, predictor);

    cp.pushInput({ sequence: 1, deltaTime: 1, actions: { moveX: 5 } });
    cp.pushInput({ sequence: 2, deltaTime: 1, actions: { moveX: 3 } });

    expect(cp.getState().x).toBe(8); // 5 + 3
    expect(cp.getPendingCount()).toBe(2);

    // Server acks seq 1, server says x=5
    const reconciled = cp.reconcile({ x: 5, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 1);
    expect(reconciled.x).toBe(8); // 5 + re-predict seq 2 (3)
    expect(cp.getPendingCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // SnapshotInterpolation
  // -------------------------------------------------------------------------

  it('should interpolate between snapshots', () => {
    const si = new SnapshotInterpolation(10, 50);

    si.pushSnapshot({
      timestamp: 100,
      entities: new Map([['player', { x: 0, y: 0, z: 0 }]]),
    });
    si.pushSnapshot({
      timestamp: 200,
      entities: new Map([['player', { x: 10, y: 0, z: 0 }]]),
    });

    // Render at currentTime=200, renderDelay=50 → renderTime=150 → halfway
    const result = si.interpolate(200);
    const player = result.find((e) => e.id === 'player')!;
    expect(player.x).toBe(5); // lerp(0, 10, 0.5)
    expect(player.interpolated).toBe(true);
  });

  it('should extrapolate from latest when no bracket found', () => {
    const si = new SnapshotInterpolation(10, 0);

    si.pushSnapshot({
      timestamp: 100,
      entities: new Map([['obj', { x: 42, y: 0, z: 0 }]]),
    });

    // currentTime=500, no bracket
    const result = si.interpolate(500);
    const obj = result.find((e) => e.id === 'obj')!;
    expect(obj.x).toBe(42);
    expect(obj.interpolated).toBe(false);
  });

  // -------------------------------------------------------------------------
  // LagCompensation
  // -------------------------------------------------------------------------

  it('should verify hit against rewound state', () => {
    const lc = new LagCompensation();

    lc.pushState({
      timestamp: 100,
      entities: new Map([['enemy', { x: 10, y: 0, z: 0, radius: 2 }]]),
    });
    lc.pushState({
      timestamp: 200,
      entities: new Map([['enemy', { x: 20, y: 0, z: 0, radius: 2 }]]),
    });

    // Client fires at timestamp=200 with 100ms latency → rewind to 100
    const hit = lc.verifyHit({
      originX: 10,
      originY: 0,
      originZ: 0,
      targetId: 'enemy',
      clientTimestamp: 200,
      clientLatency: 100,
    });
    expect(hit.hit).toBe(true);
    expect(hit.distance).toBe(0); // Point blank at t=100
  });

  it('should estimate latency with EMA', () => {
    const lc = new LagCompensation();

    lc.updateLatency('p1', 100);
    lc.updateLatency('p1', 50);
    // EMA: 100 * 0.8 + 50 * 0.2 = 90
    expect(lc.getLatency('p1')).toBeCloseTo(90);
  });
});
