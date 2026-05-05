import { describe, expect, it } from 'vitest';
import {
  accumulatePlaneSensing,
  constrainedPlaneCoverage,
  emptyPlaneSensing,
  emptyRoomSweepCoverage,
  observeRoomSweep,
  roomSweepProgress,
  roomSweepViewCount,
  type RoomPlaneSensing,
} from './room-plane-sensing';

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

  it('does not let one viewing direction claim full room coverage', () => {
    let sweep = emptyRoomSweepCoverage;

    for (let i = 0; i < 12; i += 1) {
      sweep = observeRoomSweep(sweep, 8, 0.3);
    }

    expect(roomSweepViewCount(sweep)).toBe(1);
    expect(roomSweepProgress(sweep)).toBeLessThan(0.5);
    expect(constrainedPlaneCoverage(1, roomSweepProgress(sweep))).toBeLessThan(0.7);
  });

  it('requires a full turn before floor and wall coverage can reach 100 percent', () => {
    let sweep = emptyRoomSweepCoverage;

    for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
      sweep = observeRoomSweep(sweep, heading, 0.2);
    }

    expect(roomSweepViewCount(sweep)).toBe(8);
    expect(roomSweepProgress(sweep)).toBe(1);
    expect(constrainedPlaneCoverage(1, roomSweepProgress(sweep))).toBe(1);
    expect(constrainedPlaneCoverage(0.5, roomSweepProgress(sweep))).toBeGreaterThan(0.95);
  });
});
