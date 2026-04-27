import { describe, it, expect } from 'vitest';
import {
  buildClothConstraints,
  stepClothVerlet,
  type ClothVerletConfig,
  type ClothVerletState,
} from '../cloth-verlet';

const baseConfig: ClothVerletConfig = {
  stiffness: 0.8,
  damping: 0.01,
  gravityScale: 1.0,
  windResponse: 0,
};

/** Build a flat NxN cloth grid in the XZ plane (y=0). */
function buildFlatGrid(resolution: number, size = 1): Float32Array {
  const positions = new Float32Array(resolution * resolution * 3);
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const idx = (i * resolution + j) * 3;
      positions[idx] = (j / (resolution - 1)) * size;
      positions[idx + 1] = 0;
      positions[idx + 2] = (i / (resolution - 1)) * size;
    }
  }
  return positions;
}

function makeState(resolution: number): ClothVerletState {
  const positions = buildFlatGrid(resolution);
  const prevPositions = new Float32Array(positions); // copy — verlet starts at rest
  return {
    positions,
    prevPositions,
    pinned: new Set<number>(),
    constraints: buildClothConstraints(resolution, positions),
    time: 0,
  };
}

describe('buildClothConstraints', () => {
  it('produces 2*N*(N-1) constraints for an NxN grid (right + bottom neighbors)', () => {
    const positions = buildFlatGrid(4);
    const constraints = buildClothConstraints(4, positions);
    // Right neighbors: 4 rows × 3 = 12; Bottom neighbors: 3 rows × 4 = 12 → 24 total
    expect(constraints.length).toBe(24);
  });

  it('rest length matches actual distance between connected vertices', () => {
    const positions = buildFlatGrid(3, 1); // unit grid → step = 0.5
    const constraints = buildClothConstraints(3, positions);
    for (const [, , restLen] of constraints) {
      expect(restLen).toBeCloseTo(0.5, 5);
    }
  });

  it('every constraint has a < b and indices in valid range', () => {
    const constraints = buildClothConstraints(4, buildFlatGrid(4));
    for (const [a, b] of constraints) {
      expect(a).toBeLessThan(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(16);
    }
  });
});

describe('stepClothVerlet — gravity', () => {
  it('unpinned vertices fall under gravity', () => {
    const state = makeState(3);
    const initialY = state.positions[1]; // first vertex y
    stepClothVerlet(state, baseConfig, 0.1);
    expect(state.positions[1]).toBeLessThan(initialY);
  });

  it('zero gravityScale → no fall', () => {
    const state = makeState(3);
    const config = { ...baseConfig, gravityScale: 0 };
    stepClothVerlet(state, config, 0.1);
    // First vertex y should be unchanged (no constraint forces yet, no wind)
    expect(state.positions[1]).toBeCloseTo(0, 6);
  });
});

describe('stepClothVerlet — pinning', () => {
  it('pinned vertices do NOT move under gravity', () => {
    const state = makeState(3);
    state.pinned.add(0); // pin first vertex
    const initialY = state.positions[1];
    stepClothVerlet(state, baseConfig, 0.1);
    expect(state.positions[1]).toBe(initialY); // exactly unchanged
  });

  it('unpinned siblings still fall when one corner is pinned', () => {
    const state = makeState(3);
    state.pinned.add(0);
    const otherCornerIdx = (3 * 3 - 1) * 3 + 1; // last vertex y
    const initialY = state.positions[otherCornerIdx];
    stepClothVerlet(state, baseConfig, 0.1);
    expect(state.positions[otherCornerIdx]).toBeLessThan(initialY);
  });
});

describe('stepClothVerlet — constraints', () => {
  it('constraint solve pulls vertices back toward rest length', () => {
    // Manually stretch one vertex far away — constraint should pull it back.
    const positions = buildFlatGrid(3);
    const prevPositions = new Float32Array(positions);
    const constraints = buildClothConstraints(3, positions);
    // Pull vertex 4 (center) up high
    positions[4 * 3 + 1] = 10;
    const state: ClothVerletState = {
      positions,
      prevPositions,
      pinned: new Set([0, 1, 2, 3, 5, 6, 7, 8]), // pin everything except center
      constraints,
      time: 0,
    };
    stepClothVerlet(state, { ...baseConfig, gravityScale: 0, stiffness: 1.0 }, 0.016);
    // Center vertex Y should have moved down toward rest length
    expect(state.positions[4 * 3 + 1]).toBeLessThan(10);
  });

  it('higher stiffness → more constraint iterations → faster convergence', () => {
    const positions1 = buildFlatGrid(3);
    positions1[4 * 3 + 1] = 10;
    const positions2 = new Float32Array(positions1);
    const prev1 = new Float32Array(buildFlatGrid(3));
    const prev2 = new Float32Array(buildFlatGrid(3));
    const constraints = buildClothConstraints(3, buildFlatGrid(3));
    const pinned = new Set([0, 1, 2, 3, 5, 6, 7, 8]);

    const stateLow: ClothVerletState = { positions: positions1, prevPositions: prev1, pinned, constraints, time: 0 };
    const stateHigh: ClothVerletState = { positions: positions2, prevPositions: prev2, pinned, constraints, time: 0 };
    const cfgLow = { ...baseConfig, gravityScale: 0, stiffness: 0.2 };
    const cfgHigh = { ...baseConfig, gravityScale: 0, stiffness: 1.0 };

    stepClothVerlet(stateLow, cfgLow, 0.016);
    stepClothVerlet(stateHigh, cfgHigh, 0.016);

    // High-stiffness pulls center closer to grid plane
    expect(stateHigh.positions[4 * 3 + 1]).toBeLessThan(stateLow.positions[4 * 3 + 1]);
  });
});

describe('stepClothVerlet — damping', () => {
  it('damping=1.0 zeroes velocity (vertex stops moving except for gravity)', () => {
    const state = makeState(3);
    // Give center vertex some initial velocity (prev is offset)
    state.prevPositions[4 * 3] = state.positions[4 * 3] - 1;
    stepClothVerlet(state, { ...baseConfig, damping: 1.0, gravityScale: 0, windResponse: 0 }, 0.016);
    // With damping=1, dampingFactor=0, so no velocity carry-over
    // Vertex shouldn't move horizontally despite the prev offset
    expect(state.positions[4 * 3]).toBeCloseTo(0.5, 5); // unchanged
  });
});

describe('stepClothVerlet — determinism', () => {
  it('same state + config + delta → same output across runs', () => {
    const stateA = makeState(4);
    const stateB = makeState(4);
    const config = { ...baseConfig, windResponse: 0.5 };

    for (let i = 0; i < 5; i++) {
      stateA.time += 0.016;
      stateB.time += 0.016;
      stepClothVerlet(stateA, config, 0.016);
      stepClothVerlet(stateB, config, 0.016);
    }

    for (let i = 0; i < stateA.positions.length; i++) {
      expect(stateA.positions[i]).toBe(stateB.positions[i]);
    }
  });
});

describe('stepClothVerlet — wind', () => {
  it('windResponse=0 + zero gravity = pure stationary cloth', () => {
    const state = makeState(3);
    const initialPositions = new Float32Array(state.positions);
    stepClothVerlet(state, { ...baseConfig, gravityScale: 0, windResponse: 0 }, 0.016);
    for (let i = 0; i < initialPositions.length; i++) {
      expect(state.positions[i]).toBe(initialPositions[i]);
    }
  });

  it('non-zero windResponse + zero gravity perturbs unpinned vertices on X+Z', () => {
    const state = makeState(3);
    state.time = 0.5; // non-trivial time so smoothNoise produces a nonzero value
    const initialX = state.positions[0];
    const initialZ = state.positions[2];
    stepClothVerlet(state, { ...baseConfig, gravityScale: 0, windResponse: 1.0 }, 0.1);
    expect(state.positions[0]).not.toBe(initialX);
    expect(state.positions[2]).not.toBe(initialZ);
  });

  it('wind is purely a function of state.time — same time + state → identical positions (RNG seed determinism, /critic Annoying #9)', () => {
    // Build two identical fresh states; pin time = 0.5; advance once with
    // wind=1.0 + gravity=0. Both must produce IDENTICAL positions. If
    // smoothNoise ever starts depending on Math.random / Date.now / a
    // hidden global, this assertion fails immediately.
    const stateA = makeState(3);
    const stateB = makeState(3);
    stateA.time = 0.5;
    stateB.time = 0.5;
    const config = { ...baseConfig, gravityScale: 0, windResponse: 1.0 };
    stepClothVerlet(stateA, config, 0.05);
    stepClothVerlet(stateB, config, 0.05);
    for (let i = 0; i < stateA.positions.length; i++) {
      expect(stateA.positions[i]).toBe(stateB.positions[i]);
    }
  });

  it('resetting state.time produces identical wind contribution (no hidden state leakage)', () => {
    // Step once with time=t1, capture positions, RESET to fresh state with
    // time=t1, step again with same delta — must yield same positions.
    // Catches the bug class where wind accidentally accumulates state in
    // a closure or module-level cache instead of being purely (t, seed)-driven.
    const stateA = makeState(3);
    stateA.time = 0.5;
    const config = { ...baseConfig, gravityScale: 0, windResponse: 1.0 };
    stepClothVerlet(stateA, config, 0.05);
    const positionsAfterFirstRun = new Float32Array(stateA.positions);

    // Fresh state — same starting conditions, same time.
    const stateB = makeState(3);
    stateB.time = 0.5;
    stepClothVerlet(stateB, config, 0.05);
    for (let i = 0; i < stateB.positions.length; i++) {
      expect(stateB.positions[i]).toBe(positionsAfterFirstRun[i]);
    }
  });
});

describe('stepClothVerlet — stiffness=0 edge', () => {
  it('stiffness=0 produces 0 constraint iterations — vertex with stretched current+prev does NOT pull back (/critic Annoying #15)', () => {
    // Math.ceil(0 * 5) = 0, so the constraint solve loop is skipped.
    // INTENTIONAL: stiffness=0 means "no spring forces" — models loose
    // particles, not cloth. Documented as the discontinuity at
    // stiffness=0 → 0.001 (1 iteration) so it's not surprising.
    //
    // Test setup: center vertex stretched up to y=10 in BOTH positions
    // and prevPositions. Velocity = current - prev = 0, so Verlet has
    // nothing to integrate. With stiffness=0 no constraint pulls it
    // toward rest length. With gravity=0 and wind=0 no external force.
    // Result: vertex stays at y=10 (no movement at all).
    const positions = buildFlatGrid(3);
    positions[4 * 3 + 1] = 10;
    const prevPositions = new Float32Array(positions); // prev = current, zero velocity
    const constraints = buildClothConstraints(3, buildFlatGrid(3));
    const state: ClothVerletState = {
      positions,
      prevPositions,
      pinned: new Set([0, 1, 2, 3, 5, 6, 7, 8]),
      constraints,
      time: 0,
    };
    stepClothVerlet(state, { ...baseConfig, gravityScale: 0, stiffness: 0, windResponse: 0 }, 0.016);
    // No constraint solve → vertex stays where it was (no spring force)
    expect(state.positions[4 * 3 + 1]).toBe(10);
  });

  it('stiffness=0.001 (just above 0) runs 1 iteration — discontinuity is real', () => {
    const positions = buildFlatGrid(3);
    positions[4 * 3 + 1] = 10;
    const prevPositions = new Float32Array(positions); // zero velocity
    const constraints = buildClothConstraints(3, buildFlatGrid(3));
    const state: ClothVerletState = {
      positions,
      prevPositions,
      pinned: new Set([0, 1, 2, 3, 5, 6, 7, 8]),
      constraints,
      time: 0,
    };
    stepClothVerlet(state, { ...baseConfig, gravityScale: 0, stiffness: 0.001, windResponse: 0 }, 0.016);
    // 1 iteration → some convergence happens, vertex pulls back toward rest
    expect(state.positions[4 * 3 + 1]).toBeLessThan(10);
  });
});
