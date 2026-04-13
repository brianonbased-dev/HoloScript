/**
 * ClientPrediction — Production Test Suite
 *
 * Covers: input buffering, prediction function, server reconciliation,
 * misprediction tracking, pending input management, max pending cap.
 */
import { describe, it, expect } from 'vitest';
import { ClientPrediction, PredictedState, InputFrame } from '../ClientPrediction';

// ─── Helpers ────────────────────────────────────────────────────────
const zeroState: PredictedState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

// Simple predictor: moveX → x += dt * moveX, moveZ → z += dt * moveZ
function simplePredictor(state: PredictedState, input: InputFrame): PredictedState {
  return {
    ...state,
    x: state.x + (input.actions.moveX ?? 0) * input.deltaTime,
    y: state.y + (input.actions.moveY ?? 0) * input.deltaTime,
    z: state.z + (input.actions.moveZ ?? 0) * input.deltaTime,
    vx: input.actions.moveX ?? state.vx,
    vy: input.actions.moveY ?? state.vy,
    vz: input.actions.moveZ ?? state.vz,
  };
}

function makeInput(seq: number, dt: number, actions: Record<string, number>): InputFrame {
  return { sequence: seq, deltaTime: dt, actions };
}

describe('ClientPrediction — Production', () => {
  // ─── Construction ─────────────────────────────────────────────────
  it('starts with initial state', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    expect(cp.getState()).toEqual(zeroState);
    expect(cp.getPendingCount()).toBe(0);
    expect(cp.getMispredictions()).toBe(0);
    expect(cp.getLastAckedSequence()).toBe(-1);
  });

  // ─── Input Processing ─────────────────────────────────────────────
  it('pushInput advances predicted state', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    const result = cp.pushInput(makeInput(0, 1.0, { moveX: 5 }));
    expect(result.x).toBe(5);
    expect(cp.getPendingCount()).toBe(1);
  });

  it('multiple inputs accumulate', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    cp.pushInput(makeInput(0, 1.0, { moveX: 3 }));
    cp.pushInput(makeInput(1, 1.0, { moveX: 2 }));
    expect(cp.getState().x).toBe(5);
    expect(cp.getPendingCount()).toBe(2);
  });

  it('returns copy of state (not reference)', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    const s1 = cp.getState();
    s1.x = 999;
    expect(cp.getState().x).toBe(0); // unaffected
  });

  // ─── Server Reconciliation ────────────────────────────────────────
  it('reconcile discards acknowledged inputs', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    cp.pushInput(makeInput(0, 1.0, { moveX: 1 }));
    cp.pushInput(makeInput(1, 1.0, { moveX: 1 }));
    cp.pushInput(makeInput(2, 1.0, { moveX: 1 }));
    // Server acks up to seq 1 with state x=2
    cp.reconcile({ x: 2, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 1);
    expect(cp.getPendingCount()).toBe(1); // only seq 2 remains
    expect(cp.getLastAckedSequence()).toBe(1);
  });

  it('reconcile re-predicts from server state', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    cp.pushInput(makeInput(0, 1.0, { moveX: 1 })); // x = 1
    cp.pushInput(makeInput(1, 1.0, { moveX: 1 })); // x = 2
    // Server says x=1 after seq 0
    const result = cp.reconcile({ x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 0);
    // Re-predict seq 1 from server state: 1 + 1 = 2
    expect(result.x).toBe(2);
  });

  it('reconcile detects misprediction on positional divergence', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    cp.pushInput(makeInput(0, 1.0, { moveX: 1 }));
    // Server says client was actually at x=10 (huge divergence)
    cp.reconcile({ x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 0);
    expect(cp.getMispredictions()).toBe(1);
  });

  it('reconcile does not count misprediction when positions match', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    cp.pushInput(makeInput(0, 1.0, { moveX: 5 }));
    // Server agrees: x=5
    cp.reconcile({ x: 5, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 0);
    expect(cp.getMispredictions()).toBe(0);
  });

  // ─── Max Pending Cap ──────────────────────────────────────────────
  it('pending inputs cap at 120', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    for (let i = 0; i < 150; i++) cp.pushInput(makeInput(i, 0.016, { moveX: 1 }));
    expect(cp.getPendingCount()).toBe(120);
  });

  // ─── Multi-axis Movement ──────────────────────────────────────────
  it('handles Y and Z movement', () => {
    const cp = new ClientPrediction(zeroState, simplePredictor);
    cp.pushInput(makeInput(0, 1.0, { moveY: 9.8, moveZ: -3 }));
    const st = cp.getState();
    expect(st.y).toBeCloseTo(9.8);
    expect(st.z).toBeCloseTo(-3);
  });
});
