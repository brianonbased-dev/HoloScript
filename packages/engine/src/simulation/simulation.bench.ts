import { bench, describe } from 'vitest';
import { ContractedSimulation } from './SimulationContract';
import type { SimSolver, FieldData } from './SimSolver';

function mockSolver(): SimSolver & { time: number } {
  return {
    mode: 'transient',
    fieldNames: ['temperature'],
    time: 0,
    step(dt: number) { this.time += dt; },
    solve() {},
    getField(): FieldData | null { return new Float32Array(10); },
    getStats() { return { currentTime: this.time, converged: true }; },
    dispose() {},
  };
}

describe('SimulationContract Overhead Benchmarks', () => {
  const solverA = mockSolver();
  const solverB = mockSolver();

  const config = {
    vertices: new Float32Array(3000), // simulate 1k node mesh
    tetrahedra: new Uint32Array(4000), // simulate 1k element mesh
    material: { youngs_modulus: 200e9, poisson_ratio: 0.3, density: 7850 }
  };

  const contracted = new ContractedSimulation(solverA, config, { fixedDt: 0.016 });

  bench('Base Solver Step (Raw Compute)', () => {
    solverB.step(0.016);
  });

  bench('Contracted Solver Step (With Overhead)', () => {
    contracted.step(0.016);
  });
});
