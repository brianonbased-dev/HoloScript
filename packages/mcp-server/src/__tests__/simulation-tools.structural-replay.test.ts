import { describe, expect, it } from 'vitest';

import { handleSimulationTool } from '../simulation-tools';

const structuralConfig = {
  nodes: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.5, 0, 0],
    [0.5, 0.5, 0],
    [0, 0.5, 0],
    [0, 0, 0.5],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
  ],
  elements: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
  materials: { E: 1e6, nu: 0.3, yield_strength: 1e8, density: 1000 },
  forces: [{ nodeIndex: 1, fx: 10, fy: 0, fz: 0 }],
  constraints: Array.from({ length: 10 }, (_, nodeIndex) => ({ nodeIndex })),
};

describe('solve_structural CAEL replay with the real engine', () => {
  it('replays a structural trace after rehydrating canonical typed arrays', async () => {
    const solve = (await handleSimulationTool('solve_structural', {
      config: structuralConfig,
    })) as Record<string, unknown>;

    expect(solve.success).toBe(true);
    const traceJSONL = String(solve.traceJSONL);
    expect(traceJSONL).toContain('"__cael_typed_array":"Float64Array"');
    expect(traceJSONL).toContain('"__cael_typed_array":"Uint32Array"');

    const verify = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL,
    })) as Record<string, unknown>;

    expect(verify.success).toBe(true);
    expect(verify.hashChainValid).toBe(true);
    expect(verify.replayValid).toBe(true);
    expect(verify.solverType).toBe('solve_structural');
  });
});
