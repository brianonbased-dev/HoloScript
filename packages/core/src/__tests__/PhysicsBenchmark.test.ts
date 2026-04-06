import { describe, it, expect } from 'vitest';
import { PBDSolverCPU } from '@holoscript/engine/physics/PBDSolver';
import type { ISoftBodyConfig } from '@holoscript/engine/physics/PhysicsTypes';

describe('Physics Mass Benchmark', () => {
  const runBenchmark = (numParticles: number) => {
    // Generate a simple particle grid for distance constraints
    const positions = new Float32Array(numParticles * 3);
    const masses = new Float32Array(numParticles).fill(1).map((_, i) => (i === 0 ? 0 : 1)); // Pin first particle
    const indices = new Uint32Array(0);
    const edgesList: number[] = [];

    // Connect in a chain
    for (let i = 0; i < numParticles - 1; i++) {
      edgesList.push(i, i + 1);
    }
    const edges = new Uint32Array(edgesList);

    const config: ISoftBodyConfig = {
      id: `bench_${numParticles}`,
      positions,
      masses,
      indices,
      edges,
      compliance: 0.01,
      damping: 0.99,
      solverIterations: 10,
      gravity: { x: 0, y: -9.81, z: 0 },
    };

    const solver = new PBDSolverCPU(config);

    const start = performance.now();
    const iterations = 10;
    for (let i = 0; i < iterations; i++) {
      solver.step(0.016);
    }
    const end = performance.now();

    const avgTime = (end - start) / iterations;
    console.log(`[Benchmark] ${numParticles} particles: ${avgTime.toFixed(2)}ms per step`);

    return avgTime;
  };

  it('should handle 1,000 particles at > 60fps (< 16ms)', () => {
    const time = runBenchmark(1000);
    expect(time).toBeLessThan(16);
  });

  it('should measure 5,000 particles performance', () => {
    const time = runBenchmark(5000);
    expect(time).toBeDefined();
  });

  it('should measure 10,000 particles performance', () => {
    const time = runBenchmark(10000);
    expect(time).toBeDefined();
  });
});
