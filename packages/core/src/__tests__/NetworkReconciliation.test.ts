import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkPredictor } from '@holoscript/engine/runtime/NetworkPredictor';

describe('NetworkPredictor', () => {
  let predictor: NetworkPredictor<any>;
  const initialState = { x: 0, y: 0 };
  const applyFn = (state: any, input: any) => {
    if (input.type === 'move') {
      state.x += input.dx;
      state.y += input.dy;
    }
  };

  beforeEach(() => {
    predictor = new NetworkPredictor(initialState);
  });

  it('should predict state locally', () => {
    predictor.predict({ type: 'move', dx: 10, dy: 5 }, applyFn);
    expect(predictor.getPredictedState()).toEqual({ x: 10, y: 5 });
  });

  it('should reconcile with server state (correct prediction)', () => {
    predictor.predict({ type: 'move', dx: 10, dy: 5 }, applyFn); // seq 0

    // Server confirms seq 0
    const serverState = {
      sequenceNumber: 0,
      state: { x: 10, y: 5 },
    };

    predictor.reconcile(serverState, applyFn);
    expect(predictor.getPredictedState()).toEqual({ x: 10, y: 5 });
  });

  it('should reconcile and replay inputs on misprediction', () => {
    predictor.predict({ type: 'move', dx: 10, dy: 5 }, applyFn); // seq 0
    predictor.predict({ type: 'move', dx: 5, dy: 2 }, applyFn); // seq 1

    expect(predictor.getPredictedState()).toEqual({ x: 15, y: 7 });

    // Server says seq 0 resulted in x=9 (maybe a collision)
    const serverState = {
      sequenceNumber: 0,
      state: { x: 9, y: 5 },
    };

    // Should result in: server(9,5) + local input seq 1(5,2) = (14, 7)
    predictor.reconcile(serverState, applyFn);
    expect(predictor.getPredictedState()).toEqual({ x: 14, y: 7 });
  });
});
