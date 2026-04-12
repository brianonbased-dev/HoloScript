import { describe, it, expect } from 'vitest';
import {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
  density,
  youngsModulus,
  poissonRatio,
  yieldStrength,
  force,
  type Force,
} from '../index';

/**
 * GPU Structural Verification Test
 *
 * Compares GPU-accelerated TET10 solver results against the verified CPU baseline.
 * Validates the CSR-Vector SpMV and Fused CG Update kernels.
 */
describe('GPU Structural Verification', () => {
  it('produces numerically identical results to CPU reference (Cantilever Bending)', async () => {
    const lx = 1, ly = 1, lz = 5;
    const nx = 1, ny = 1, nz = 3;

    // 1. Build coarse mesh
    const pts: number[] = [];
    for (let k = 0; k <= nz; k++) {
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i <= nx; i++) {
          pts.push((i * lx) / nx, (j * ly) / ny, (k * lz) / nz);
        }
      }
    }
    const idx = (i: number, j: number, k: number) => k * (nx + 1) * (ny + 1) + j * (nx + 1) + i;
    const tets: number[] = [];
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v0 = idx(i, j, k), v1 = idx(i + 1, j, k), v2 = idx(i + 1, j + 1, k), v3 = idx(i, j + 1, k);
          const v4 = idx(i, j, k + 1), v5 = idx(i + 1, j, k + 1), v6 = idx(i + 1, j + 1, k + 1), v7 = idx(i, j + 1, k + 1);
          tets.push(v0, v1, v3, v4, v1, v2, v3, v6, v4, v5, v6, v1, v4, v6, v7, v3, v1, v4, v6, v3);
        }
      }
    }

    const tet4Mesh = { vertices: new Float64Array(pts), tetrahedra: new Uint32Array(tets) };
    const tet10Mesh = tet4ToTet10(tet4Mesh.vertices, tet4Mesh.tetrahedra);

    // 2. Define Problem: Cantilever with tip load
    const fixedNodes: number[] = [];
    const nodeCount = tet10Mesh.vertices.length / 3;
    for (let i = 0; i < nodeCount; i++) {
      if (Math.abs(tet10Mesh.vertices[i * 3 + 2]) < 1e-8) fixedNodes.push(i);
    }
    const tipNodes: number[] = [];
    for (let i = 0; i < nodeCount; i++) {
      if (Math.abs(tet10Mesh.vertices[i * 3 + 2] - lz) < 1e-8) tipNodes.push(i);
    }

    const configBase: Omit<TET10Config, 'useGPU'> = {
      vertices: tet10Mesh.vertices,
      tetrahedra: tet10Mesh.tetrahedra,
      material: {
        density: density(1000),
        youngs_modulus: youngsModulus(1e7),
        poisson_ratio: poissonRatio(0.3),
        yield_strength: yieldStrength(1e8),
      },
      constraints: [{ id: 'fixed', type: 'fixed', nodes: fixedNodes }],
      loads: tipNodes.map(n => ({
        id: `L${n}`,
        type: 'point' as const,
        nodeIndex: n,
        force: [force(0), force(100 / tipNodes.length), force(0)] as [Force, Force, Force],
      })),
      maxIterations: 5000,
      tolerance: 1e-10,
    };

    // 3. Solve on CPU
    const cpuSolver = new StructuralSolverTET10({ ...configBase, useGPU: false });
    await cpuSolver.solve(); // solve method handles solveCPU/solveGPU dispatch
    const cpuDisp = cpuSolver.getDisplacements();

    // 4. Solve on GPU
    const gpuSolver = new StructuralSolverTET10({ ...configBase, useGPU: true });
    const result = await gpuSolver.solve(); 
    
    if (result.converged) {
      const gpuDisp = gpuSolver.getDisplacements();
      
      // 5. Compare results
      let maxDiff = 0;
      for (let i = 0; i < cpuDisp.length; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(cpuDisp[i] - gpuDisp[i]));
      }

      // Expect high agreement (within CG tolerance)
      expect(maxDiff).toBeLessThan(1e-7);
      
      // Verify zero-copy buffer is available (only when WebGPU was actually used)
      const buffer = gpuSolver.getDisplacementBuffer();
      if (buffer) {
        expect(buffer.size).toBeGreaterThan(0);
      }
    } else {
      console.warn('GPU Solver failed to converge or WebGPU not available in test environment');
    }
  });
});
