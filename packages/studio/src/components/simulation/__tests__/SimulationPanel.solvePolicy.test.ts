// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { simulationInputHash, shouldAutoSolve, type SimulationInputConfig } from '../SimulationPanel';

const baseConfig: SimulationInputConfig = {
  sizeX: 1,
  sizeY: 1,
  sizeZ: 10,
  divisions: 4,
  youngsModulus: 200e9,
  poissonRatio: 0.3,
  yieldStrength: 250e6,
  density: 7850,
  fixedFace: 'z-',
  loadFace: 'z+',
  loadForceX: 0,
  loadForceY: -10000,
  loadForceZ: 0,
  useGpuBuffers: true,
};

describe('SimulationPanel solve policy', () => {
  it('produces stable hash for same simulation inputs', () => {
    const a = simulationInputHash(baseConfig);
    const b = simulationInputHash({ ...baseConfig });
    expect(a).toBe(b);
  });

  it('changes hash when undo-relevant geometry input changes', () => {
    const before = simulationInputHash(baseConfig);
    const after = simulationInputHash({ ...baseConfig, divisions: baseConfig.divisions + 1 });
    expect(after).not.toBe(before);
  });

  it('changes hash when load input changes', () => {
    const before = simulationInputHash(baseConfig);
    const after = simulationInputHash({ ...baseConfig, loadForceY: baseConfig.loadForceY - 5000 });
    expect(after).not.toBe(before);
  });

  it('keeps manual solve default behavior when auto-solve disabled', () => {
    expect(
      shouldAutoSolve({
        selectedNode: true,
        autoSolveOnPause: false,
        isDirty: true,
        status: 'idle',
      }),
    ).toBe(false);
  });

  it('allows auto-solve only when dirty + idle + enabled', () => {
    expect(
      shouldAutoSolve({
        selectedNode: true,
        autoSolveOnPause: true,
        isDirty: true,
        status: 'idle',
      }),
    ).toBe(true);

    expect(
      shouldAutoSolve({
        selectedNode: true,
        autoSolveOnPause: true,
        isDirty: true,
        status: 'solving',
      }),
    ).toBe(false);

    expect(
      shouldAutoSolve({
        selectedNode: false,
        autoSolveOnPause: true,
        isDirty: true,
        status: 'idle',
      }),
    ).toBe(false);
  });
});
