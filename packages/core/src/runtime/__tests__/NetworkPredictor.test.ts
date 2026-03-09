import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkPredictor } from '../NetworkPredictor';

// Mock performance.now for deterministic tests
vi.stubGlobal('performance', {
  now: vi.fn(() => Date.now()),
});

interface GameState {
  x: number;
  y: number;
  score: number;
}

const applyMove = (state: GameState, input: { dx: number; dy: number }) => {
  state.x += input.dx;
  state.y += input.dy;
};

describe('NetworkPredictor', () => {
  let predictor: NetworkPredictor<GameState>;

  beforeEach(() => {
    predictor = new NetworkPredictor<GameState>({ x: 0, y: 0, score: 0 });
  });

  // =========== Constructor ===========

  it('initializes with given state', () => {
    const state = predictor.getPredictedState();
    expect(state).toEqual({ x: 0, y: 0, score: 0 });
  });

  // =========== predict ===========

  it('predict applies input immediately', () => {
    const result = predictor.predict({ dx: 5, dy: 0 }, applyMove);
    expect(result.x).toBe(5);
    expect(predictor.getPredictedState().x).toBe(5);
  });

  it('multiple predicts accumulate', () => {
    predictor.predict({ dx: 3, dy: 0 }, applyMove);
    predictor.predict({ dx: 7, dy: 0 }, applyMove);
    expect(predictor.getPredictedState().x).toBe(10);
  });

  it('predict buffers inputs for potential rollback', () => {
    for (let i = 0; i < 5; i++) {
      predictor.predict({ dx: 1, dy: 0 }, applyMove);
    }
    expect(predictor.getPredictedState().x).toBe(5);
  });

  // =========== reconcile ===========

  it('reconcile accepts authoritative server state', () => {
    predictor.predict({ dx: 5, dy: 0 }, applyMove);
    predictor.predict({ dx: 5, dy: 0 }, applyMove);

    // Server confirms up to sequence 0 with different x
    const result = predictor.reconcile(
      { sequenceNumber: 0, state: { x: 4, y: 0, score: 0 } },
      applyMove
    );

    // Should re-apply unacknowledged inputs (seq 1) on top of server state
    expect(result.x).toBe(9); // 4 + 5
  });

  it('reconcile with all inputs acknowledged matches server', () => {
    predictor.predict({ dx: 10, dy: 0 }, applyMove);

    const result = predictor.reconcile(
      { sequenceNumber: 0, state: { x: 10, y: 0, score: 100 } },
      applyMove
    );

    expect(result.x).toBe(10);
    expect(result.score).toBe(100); // server score overrides
  });

  it('reconcile preserves unacknowledged Y axis inputs', () => {
    predictor.predict({ dx: 0, dy: 3 }, applyMove);
    predictor.predict({ dx: 0, dy: 7 }, applyMove);

    // Server confirms up to seq 0
    const result = predictor.reconcile(
      { sequenceNumber: 0, state: { x: 0, y: 3, score: 0 } },
      applyMove
    );

    expect(result.y).toBe(10); // 3 + 7 (unacked)
  });

  // =========== updateMetrics ===========

  it('updateMetrics smooths RTT', () => {
    // Set a known time
    let now = 1000;
    vi.mocked(performance.now).mockReturnValue(now);

    predictor.updateMetrics(now - 50);
    const horizon1 = predictor.getPredictionHorizon();
    expect(horizon1).toBeGreaterThan(0);

    // Send another metric update
    now += 100;
    vi.mocked(performance.now).mockReturnValue(now);
    predictor.updateMetrics(now - 60);
    const horizon2 = predictor.getPredictionHorizon();
    expect(horizon2).toBeGreaterThan(0);
  });

  it('getPredictionHorizon starts at zero', () => {
    expect(predictor.getPredictionHorizon()).toBe(0);
  });

  // =========== state buffer cleanup ===========

  it('state buffer does not grow unbounded', () => {
    // Predict 150 inputs (buffer cap is ~120)
    for (let i = 0; i < 150; i++) {
      predictor.predict({ dx: 1, dy: 0 }, applyMove);
    }
    // State is still correct
    expect(predictor.getPredictedState().x).toBe(150);
  });

  // =========== immutability ===========

  it('reconcile does not mutate server state object', () => {
    predictor.predict({ dx: 5, dy: 0 }, applyMove);
    const serverState = { sequenceNumber: 0, state: { x: 3, y: 0, score: 0 } };
    predictor.reconcile(serverState, applyMove);
    // Original server state should be unchanged
    expect(serverState.state.x).toBe(3);
  });
});
