import { describe, expect, it } from 'vitest';
import { accumulatePlaneSensing, emptyPlaneSensing, type RoomPlaneSensing } from './room-plane-sensing';

function sample(floorConfidence: number, wallConfidence: number): RoomPlaneSensing {
  return {
    floorConfidence,
    wallConfidence,
    motion: 0.12,
    samples: 1,
  };
}

describe('room plane sensing', () => {
  it('accumulates floor and wall coverage independently', () => {
    let state = emptyPlaneSensing;

    for (let i = 0; i < 8; i += 1) {
      state = accumulatePlaneSensing(state, sample(0.65, 0.02));
    }
    const floorAfterFloorSweep = state.floorConfidence;

    for (let i = 0; i < 8; i += 1) {
      state = accumulatePlaneSensing(state, sample(0.02, 0.65));
    }

    expect(state.floorConfidence).toBeGreaterThanOrEqual(floorAfterFloorSweep);
    expect(state.floorConfidence).toBeGreaterThan(0.6);
    expect(state.wallConfidence).toBeGreaterThan(0.6);
  });

  it('caps accumulated coverage at 100 percent', () => {
    let state = emptyPlaneSensing;

    for (let i = 0; i < 40; i += 1) {
      state = accumulatePlaneSensing(state, sample(0.9, 0.9));
    }

    expect(state.floorConfidence).toBe(1);
    expect(state.wallConfidence).toBe(1);
  });
});
