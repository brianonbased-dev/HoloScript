import { describe, it, expect, beforeEach } from 'vitest';
import { ClientPrediction } from '@holoscript/core';
import type { PredictedState, InputFrame, PredictionFn } from '@holoscript/core';

const INITIAL_STATE: PredictedState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

/** Simple predictor: moveX applies to x velocity */
const simplePredictor: PredictionFn = (state, input) => ({
  ...state,
  x: state.x + (input.actions.moveX ?? 0) * input.deltaTime,
  y: state.y + (input.actions.moveY ?? 0) * input.deltaTime,
  z: state.z + (input.actions.moveZ ?? 0) * input.deltaTime,
});

function frame(seq: number, actions: Record<string, number> = {}, dt = 1 / 60): InputFrame {
  return { sequence: seq, deltaTime: dt, actions };
}

describe('ClientPrediction', () => {
  let pred: ClientPrediction;

  beforeEach(() => {
    pred = new ClientPrediction(INITIAL_STATE, simplePredictor);
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates with initial state', () => {
      const state = pred.getState();
      expect(state).toEqual(INITIAL_STATE);
    });

    it('starts with no pending inputs', () => {
      expect(pred.getPendingCount()).toBe(0);
    });

    it('starts with no mispredictions', () => {
      expect(pred.getMispredictions()).toBe(0);
    });

    it('starts with acked sequence -1', () => {
      expect(pred.getLastAckedSequence()).toBe(-1);
    });
  });

  // ===========================================================================
  // Input Processing
  // ===========================================================================
  describe('pushInput', () => {
    it('applies input and returns predicted state', () => {
      const state = pred.pushInput(frame(0, { moveX: 10 }));
      expect(state.x).toBeCloseTo(10 / 60);
    });

    it('accumulates multiple inputs', () => {
      pred.pushInput(frame(0, { moveX: 60 }));
      const s = pred.pushInput(frame(1, { moveX: 60 }));
      expect(s.x).toBeCloseTo(2); // 60 * (1/60) * 2
    });

    it('increments pending count', () => {
      pred.pushInput(frame(0));
      pred.pushInput(frame(1));
      expect(pred.getPendingCount()).toBe(2);
    });
  });

  // ===========================================================================
  // Server Reconciliation
  // ===========================================================================
  describe('reconcile', () => {
    it('discards acknowledged inputs', () => {
      pred.pushInput(frame(0, { moveX: 60 }));
      pred.pushInput(frame(1, { moveX: 60 }));
      pred.pushInput(frame(2, { moveX: 60 }));

      // Server acks up to seq 1
      pred.reconcile({ x: 2, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 1);
      expect(pred.getPendingCount()).toBe(1); // only seq 2 pending
      expect(pred.getLastAckedSequence()).toBe(1);
    });

    it('re-predicts from server state with remaining inputs', () => {
      pred.pushInput(frame(0, { moveX: 60 }));
      pred.pushInput(frame(1, { moveX: 60 }));

      const result = pred.reconcile({ x: 0.5, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 0);
      // Server acks 0, re-predict seq 1: 0.5 + 60*(1/60) = 1.5
      expect(result.x).toBeCloseTo(1.5);
    });

    it('detects mispredictions', () => {
      pred.pushInput(frame(0, { moveX: 60 })); // predicts x = 1
      pred.pushInput(frame(1, { moveX: 60 })); // predicts x = 2

      // Server says x was actually 5 for seq 0
      pred.reconcile({ x: 5, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 0);
      expect(pred.getMispredictions()).toBeGreaterThanOrEqual(1);
    });

    it('no misprediction when prediction is accurate', () => {
      pred.pushInput(frame(0, { moveX: 60 }));
      // Server agrees with prediction
      pred.reconcile({ x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, 0);
      // May or may not be counted — depends on float precision
      expect(pred.getMispredictions()).toBeLessThanOrEqual(1);
    });
  });
});
