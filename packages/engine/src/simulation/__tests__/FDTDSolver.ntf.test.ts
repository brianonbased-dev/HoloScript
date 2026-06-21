/**
 * FDTDSolver NTF / running-DFT tests.
 *
 * These tests pin the first antenna-output surface: a closed Huygens box,
 * per-frequency running DFT accumulators, and far-field projection.
 */

import { describe, expect, it } from 'vitest';
import { FDTDSolver, type FDTDConfig } from '../FDTDSolver';

const FREQ = 1e9;

function makeConfig(overrides: Partial<FDTDConfig> = {}): FDTDConfig {
  return {
    cellCount: [20, 20, 20],
    cellSize: [0.01, 0.01, 0.01],
    pmlThickness: 3,
    sources: [
      {
        id: 'z-dipole',
        type: 'sinusoidal',
        position: [10, 10, 10],
        polarization: 'z',
        amplitude: 1,
        frequency: FREQ,
      },
    ],
    ntfSurface: {
      min: [5, 5, 5],
      max: [15, 15, 15],
      frequencies: [FREQ],
    },
    ...overrides,
  };
}

describe('FDTDSolver NTF running DFT', () => {
  it('rejects NTF boxes that intersect the PML or domain wall', () => {
    expect(
      () =>
        new FDTDSolver(
          makeConfig({
            ntfSurface: {
              min: [2, 5, 5],
              max: [15, 15, 15],
              frequencies: [FREQ],
            },
          })
        )
    ).toThrow(/strictly inside/);
  });

  it('updates running DFT phasors on the closed Huygens surface', () => {
    const solver = new FDTDSolver(makeConfig());
    for (let i = 0; i < 80; i++) solver.step();

    const phasor = solver.getRunningDFTPhasor(FREQ);
    expect(phasor.samples).toBe(80);
    expect(phasor.surfaceSampleCount).toBeGreaterThan(0);
    expect(phasor.sourceMoment[2].re ** 2 + phasor.sourceMoment[2].im ** 2).toBeGreaterThan(0);
  });

  it('projects a z-directed dipole into a sin^2(theta) far-field pattern', () => {
    const solver = new FDTDSolver(makeConfig());
    for (let i = 0; i < 120; i++) solver.step();

    const broadside = solver.getFarField(Math.PI / 2, 0, FREQ);
    const theta60 = solver.getFarField(Math.PI / 3, 0, FREQ);
    const theta30 = solver.getFarField(Math.PI / 6, 0, FREQ);
    const axis = solver.getFarField(0, 0, FREQ);

    expect(broadside.power).toBeGreaterThan(0);
    expect(axis.power / broadside.power).toBeLessThan(1e-10);
    expect(theta60.power / broadside.power).toBeCloseTo(Math.sin(Math.PI / 3) ** 2, 5);
    expect(theta30.power / broadside.power).toBeCloseTo(Math.sin(Math.PI / 6) ** 2, 5);
    expect(broadside.directivity).toBeCloseTo(1.5, 5);
    expect(broadside.gain).toBeCloseTo(1.5, 5);
  });
});
