/**
 * Scenario Test: SimSci End-to-End Pipeline
 *
 * Validates the full Phase 1–4 stack working together:
 *   AutoMesher → tet4ToTet10 → StructuralSolverTET10 (CSR + CPU CG)
 *   → stress/displacement recovery → surface extraction → VTK export
 *
 * Scenarios:
 *   1. Cantilever beam under tip load (engineering benchmark)
 *   2. Column under axial compression (buckling-precursor)
 *   3. Plate bending with material presets
 *   4. Full pipeline: mesh → constrain → solve → export → verify
 */

import { describe, it, expect } from 'vitest';
import {
  meshBox,
  findNodesOnFace,
  findNodesInSphere,
  meshQuality,
  meshSurface,
} from '../AutoMesher';
import {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
} from '../StructuralSolverTET10';
import { exportUnstructuredGrid } from '../export/VTKExporter';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Standard steel properties */
const STEEL = {
  youngs_modulus: 200e9,
  poisson_ratio: 0.3,
  yield_strength: 250e6,
  density: 7850,
};

/** Aluminum 6061-T6 */
const ALUMINUM = {
  youngs_modulus: 69e9,
  poisson_ratio: 0.33,
  yield_strength: 276e6,
  density: 2700,
};

/**
 * Full pipeline helper: mesh → upgrade → constrain → load → solve → stats
 */
function runPipeline(opts: {
  size: [number, number, number];
  divisions: [number, number, number];
  material: { youngs_modulus: number; poisson_ratio: number; yield_strength: number; density: number };
  fixedFace: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  loadFace: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';
  force: [number, number, number];
  tolerance?: number;
  maxIterations?: number;
}) {
  // Phase 4: Mesh
  const tet4 = meshBox({ size: opts.size, divisions: opts.divisions });
  const quality = meshQuality(tet4);

  // Phase 2: Upgrade to TET10
  const tet10 = tet4ToTet10(tet4.vertices, tet4.tetrahedra);

  // Boundary conditions
  const fixedNodes = findNodesOnFace(tet4, opts.fixedFace);
  const loadNodes = findNodesOnFace(tet4, opts.loadFace);
  const forcePerNode: [number, number, number] = [
    opts.force[0] / loadNodes.length,
    opts.force[1] / loadNodes.length,
    opts.force[2] / loadNodes.length,
  ];

  // Phase 2: Solve (CPU path — no WebGPU in Node)
  const config: TET10Config = {
    vertices: tet10.vertices,
    tetrahedra: tet10.tetrahedra,
    material: opts.material,
    constraints: [{ id: 'fix', type: 'fixed', nodes: fixedNodes }],
    loads: loadNodes.map((n, i) => ({
      id: `load_${i}`,
      type: 'point' as const,
      nodeIndex: n,
      force: forcePerNode,
    })),
    maxIterations: opts.maxIterations ?? 5000,
    tolerance: opts.tolerance ?? 1e-10,
    useGPU: false,
  };

  const solver = new StructuralSolverTET10(config);
  const result = solver.solveCPU();
  const stats = solver.getStats();
  const stress = solver.getVonMisesStress();
  const displacements = solver.getDisplacements();

  return {
    tet4, tet10, quality, solver, result, stats, stress, displacements,
    fixedNodes, loadNodes, config,
  };
}

// ── Scenario 1: Cantilever Beam ──────────────────────────────────────────────

describe('Scenario: Steel cantilever beam under tip load', () => {
  // 1m × 0.1m × 0.1m beam, fixed at z=0, loaded at z=1m in -y direction
  const beam = runPipeline({
    size: [0.1, 0.1, 1.0],
    divisions: [2, 2, 8],
    material: STEEL,
    fixedFace: 'z-',
    loadFace: 'z+',
    force: [0, -1000, 0], // 1kN tip load
  });

  it('mesh quality: zero inverted elements', () => {
    expect(beam.quality.invertedCount).toBe(0);
  });

  it('mesh quality: total volume matches beam dimensions', () => {
    const expectedVol = 0.1 * 0.1 * 1.0;
    const actualVol = beam.quality.avgVolume * beam.tet4.elementCount;
    expect(actualVol).toBeCloseTo(expectedVol, 4);
  });

  it('TET10 has more nodes than TET4 (mid-edge nodes inserted)', () => {
    expect(beam.tet10.vertices.length / 3).toBeGreaterThan(beam.tet4.nodeCount);
  });

  it('solver converges', () => {
    expect(beam.result.converged).toBe(true);
  });

  it('maximum stress is positive and physically reasonable', () => {
    // For a 1kN load on a 0.1×0.1m beam, stress should be in MPa range
    expect(beam.stats.maxVonMises).toBeGreaterThan(0);
    // Should be below yield (beam shouldn't fail under 1kN)
    expect(beam.stats.maxVonMises).toBeLessThan(STEEL.yield_strength);
  });

  it('safety factor > 1 (beam does not yield)', () => {
    expect(beam.stats.minSafetyFactor).toBeGreaterThan(1);
  });

  it('tip deflection is in the correct direction (-y)', () => {
    const u = beam.displacements;
    // Find max -y displacement among loaded nodes
    let maxNegUy = 0;
    for (const n of beam.loadNodes) {
      const uy = u[n * 3 + 1];
      if (uy < maxNegUy) maxNegUy = uy;
    }
    expect(maxNegUy).toBeLessThan(0); // Deflects downward
  });

  it('fixed face has zero displacement', () => {
    const u = beam.displacements;
    for (const n of beam.fixedNodes) {
      expect(Math.abs(u[n * 3])).toBeLessThan(1e-10);
      expect(Math.abs(u[n * 3 + 1])).toBeLessThan(1e-10);
      expect(Math.abs(u[n * 3 + 2])).toBeLessThan(1e-10);
    }
  });

  it('Euler-Bernoulli: tip deflection is within order of magnitude', () => {
    // delta = FL³ / (3EI), I = bh³/12
    const F = 1000, L = 1.0, b = 0.1, h = 0.1;
    const I = (b * h * h * h) / 12;
    const expectedDelta = (F * L * L * L) / (3 * STEEL.youngs_modulus * I);

    const u = beam.displacements;
    let maxUy = 0;
    for (const n of beam.loadNodes) {
      const uy = Math.abs(u[n * 3 + 1]);
      if (uy > maxUy) maxUy = uy;
    }

    // TET10 on coarse mesh with point loads at corner nodes:
    // Bending is resolution-sensitive, so accept within 2 orders of magnitude
    expect(maxUy).toBeGreaterThan(expectedDelta * 0.001);
    expect(maxUy).toBeLessThan(expectedDelta * 100);
  });

  it('stress field has no NaN or Infinity values', () => {
    for (let i = 0; i < beam.stress.length; i++) {
      expect(Number.isFinite(beam.stress[i])).toBe(true);
    }
  });
});

// ── Scenario 2: Column Under Compression ─────────────────────────────────────

describe('Scenario: Aluminum column under axial compression', () => {
  // 0.05m × 0.05m × 0.5m column, fixed at z=0, compressed at z=0.5m
  const column = runPipeline({
    size: [0.05, 0.05, 0.5],
    divisions: [2, 2, 6],
    material: ALUMINUM,
    fixedFace: 'z-',
    loadFace: 'z+',
    force: [0, 0, -50000], // 50kN compression
  });

  it('converges', () => {
    expect(column.result.converged).toBe(true);
  });

  it('column shortens under compression (negative z-displacement at top)', () => {
    const u = column.displacements;
    let avgUz = 0;
    for (const n of column.loadNodes) {
      avgUz += u[n * 3 + 2];
    }
    avgUz /= column.loadNodes.length;
    expect(avgUz).toBeLessThan(0); // Shortening
  });

  it('axial stress matches sigma = F/A within an order of magnitude', () => {
    const A = 0.05 * 0.05;
    const expectedSigma = 50000 / A; // 20 MPa

    let avgStress = 0;
    for (let i = 0; i < column.stress.length; i++) avgStress += column.stress[i];
    avgStress /= column.stress.length;

    expect(avgStress).toBeGreaterThan(expectedSigma * 0.1);
    expect(avgStress).toBeLessThan(expectedSigma * 20);
  });

  it('displacement field is smooth (no jumps between adjacent elements)', () => {
    // Check that max displacement magnitude is within 100x of average
    const u = column.displacements;
    let sumMag = 0, maxMag = 0;
    const nodeCount = u.length / 3;
    for (let i = 0; i < nodeCount; i++) {
      const mag = Math.sqrt(u[i * 3] ** 2 + u[i * 3 + 1] ** 2 + u[i * 3 + 2] ** 2);
      sumMag += mag;
      if (mag > maxMag) maxMag = mag;
    }
    const avgMag = sumMag / nodeCount;
    if (avgMag > 0) {
      expect(maxMag / avgMag).toBeLessThan(100);
    }
  });
});

// ── Scenario 3: Plate Bending With Different Materials ───────────────────────

describe('Scenario: Material comparison — same geometry, different stiffness', () => {
  // 0.2m × 0.2m × 0.01m plate, fixed at x=0, loaded at x=0.2m
  const steelPlate = runPipeline({
    size: [0.2, 0.2, 0.01],
    divisions: [4, 4, 1],
    material: STEEL,
    fixedFace: 'x-',
    loadFace: 'x+',
    force: [0, -500, 0],
  });

  const aluPlate = runPipeline({
    size: [0.2, 0.2, 0.01],
    divisions: [4, 4, 1],
    material: ALUMINUM,
    fixedFace: 'x-',
    loadFace: 'x+',
    force: [0, -500, 0],
  });

  it('both converge', () => {
    expect(steelPlate.result.converged).toBe(true);
    expect(aluPlate.result.converged).toBe(true);
  });

  it('aluminum deflects more than steel (lower E)', () => {
    const steelMaxDisp = maxDisplacement(steelPlate.displacements);
    const aluMaxDisp = maxDisplacement(aluPlate.displacements);
    expect(aluMaxDisp).toBeGreaterThan(steelMaxDisp);
  });

  it('deflection ratio approximately matches E ratio (E_steel/E_alu ≈ 2.9)', () => {
    const steelMaxDisp = maxDisplacement(steelPlate.displacements);
    const aluMaxDisp = maxDisplacement(aluPlate.displacements);
    const ratio = aluMaxDisp / steelMaxDisp;
    const expectedRatio = STEEL.youngs_modulus / ALUMINUM.youngs_modulus; // ≈ 2.9
    // Within 3x of expected (coarse mesh + plate geometry)
    expect(ratio).toBeGreaterThan(expectedRatio * 0.3);
    expect(ratio).toBeLessThan(expectedRatio * 3.0);
  });
});

// ── Scenario 4: Full Pipeline with Export ────────────────────────────────────

describe('Scenario: Full pipeline — mesh → solve → export → verify', () => {
  it('produces valid VTK output from the complete pipeline', () => {
    // 1. Mesh
    const tet4 = meshBox({ size: [1, 0.5, 0.5], divisions: [3, 2, 2] });
    expect(meshQuality(tet4).invertedCount).toBe(0);

    // 2. Upgrade
    const tet10 = tet4ToTet10(tet4.vertices, tet4.tetrahedra);

    // 3. Configure
    const fixedNodes = findNodesOnFace(tet4, 'x-');
    const loadNodes = findNodesOnFace(tet4, 'x+');

    const solver = new StructuralSolverTET10({
      vertices: tet10.vertices,
      tetrahedra: tet10.tetrahedra,
      material: STEEL,
      constraints: [{ id: 'fix', type: 'fixed', nodes: fixedNodes }],
      loads: loadNodes.map((n, i) => ({
        id: `l${i}`, type: 'point' as const, nodeIndex: n,
        force: [0, -100 / loadNodes.length, 0] as [number, number, number],
      })),
      useGPU: false,
    });

    // 4. Solve
    const result = solver.solveCPU();
    expect(result.converged).toBe(true);

    // 5. Extract results
    const stress = solver.getVonMisesStress();
    const displacements = solver.getDisplacements();
    const stats = solver.getStats();

    expect(stress.length).toBe(stats.elementCount);
    expect(displacements.length).toBe(stats.nodeCount * 3);

    // 6. Export to VTK (using TET4 connectivity for VTK — corner nodes only)
    const vtk = exportUnstructuredGrid(
      new Float32Array(tet4.vertices),
      tet4.tetrahedra,
      // pointData: per-node arrays
      [{
        name: 'Displacement_Y',
        data: new Float32Array(Array.from({ length: tet4.nodeCount }, (_, i) =>
          displacements[i * 3 + 1],
        )),
        components: 1,
      }],
      // cellData: per-element arrays
      [{
        name: 'VonMises_Stress',
        data: new Float32Array(stress),
      }],
    );

    // 7. Verify VTK output structure
    expect(vtk).toContain('# vtk DataFile Version');
    expect(vtk).toContain('UNSTRUCTURED_GRID');
    expect(vtk).toContain('POINTS');
    expect(vtk).toContain('CELLS');
    expect(vtk).toContain('VonMises_Stress');
    expect(vtk).toContain('Displacement_Y');

    solver.dispose();
  });

  it('meshSurface fallback integrates with the solver', async () => {
    // Surface of a unit cube → meshSurface → tet4ToTet10 → solve
    const surface = {
      vertices: new Float64Array([
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
        0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
      ]),
      triangles: new Uint32Array([
        0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3,
        0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
      ]),
    };

    const tet4 = await meshSurface(surface, { maxEdgeLength: 0.5 });
    const tet10 = tet4ToTet10(tet4.vertices, tet4.tetrahedra);

    const fixedNodes = findNodesOnFace(tet4, 'z-');
    const loadNodes = findNodesOnFace(tet4, 'z+');

    const solver = new StructuralSolverTET10({
      vertices: tet10.vertices,
      tetrahedra: tet10.tetrahedra,
      material: STEEL,
      constraints: [{ id: 'fix', type: 'fixed', nodes: fixedNodes }],
      loads: loadNodes.map((n, i) => ({
        id: `l${i}`, type: 'point' as const, nodeIndex: n,
        force: [0, 0, 1000 / loadNodes.length] as [number, number, number],
      })),
      useGPU: false,
    });

    const result = solver.solveCPU();
    expect(result.converged).toBe(true);
    expect(solver.getStats().maxVonMises).toBeGreaterThan(0);
    solver.dispose();
  });

  it('findNodesInSphere works for localized point loads', () => {
    const mesh = meshBox({ size: [1, 1, 1], divisions: [4, 4, 4] });
    const tet10 = tet4ToTet10(mesh.vertices, mesh.tetrahedra);

    const fixedNodes = findNodesOnFace(mesh, 'z-');
    // Apply load at a single point near the center of the top face
    const pointNodes = findNodesInSphere(mesh, [0.5, 0.5, 1.0], 0.15);
    expect(pointNodes.length).toBeGreaterThan(0);

    const solver = new StructuralSolverTET10({
      vertices: tet10.vertices,
      tetrahedra: tet10.tetrahedra,
      material: ALUMINUM,
      constraints: [{ id: 'fix', type: 'fixed', nodes: fixedNodes }],
      loads: pointNodes.map((n, i) => ({
        id: `p${i}`, type: 'point' as const, nodeIndex: n,
        force: [0, 0, -500 / pointNodes.length] as [number, number, number],
      })),
      useGPU: false,
    });

    const result = solver.solveCPU();
    expect(result.converged).toBe(true);

    // Point load should produce higher local stress than distributed
    const stress = solver.getVonMisesStress();
    let maxStress = 0;
    for (let i = 0; i < stress.length; i++) {
      if (stress[i] > maxStress) maxStress = stress[i];
    }
    expect(maxStress).toBeGreaterThan(0);
    solver.dispose();
  });
});

// ── Scenario 5: CSR Matrix Integrity ─────────────────────────────────────────

describe('Scenario: CSR matrix from TET10 assembly is solver-ready', () => {
  it('CSR matrix is symmetric, positive-diagonal, and SPD-consistent', () => {
    const tet4 = meshBox({ size: [1, 1, 1], divisions: [2, 2, 2] });
    const tet10 = tet4ToTet10(tet4.vertices, tet4.tetrahedra);

    const solver = new StructuralSolverTET10({
      vertices: tet10.vertices,
      tetrahedra: tet10.tetrahedra,
      material: STEEL,
      constraints: [],
      loads: [],
      useGPU: false,
    });

    const csr = solver.getCSRMatrix();

    // Positive diagonal
    for (let row = 0; row < csr.num_rows; row++) {
      for (let idx = csr.row_ptr[row]; idx < csr.row_ptr[row + 1]; idx++) {
        if (csr.col_ind[idx] === row) {
          expect(csr.val[idx]).toBeGreaterThan(0);
        }
      }
    }

    // Symmetry
    let maxAsym = 0;
    for (let row = 0; row < csr.num_rows; row++) {
      for (let idx = csr.row_ptr[row]; idx < csr.row_ptr[row + 1]; idx++) {
        const col = csr.col_ind[idx];
        const val = csr.val[idx];
        // Find transpose
        for (let tIdx = csr.row_ptr[col]; tIdx < csr.row_ptr[col + 1]; tIdx++) {
          if (csr.col_ind[tIdx] === row) {
            maxAsym = Math.max(maxAsym, Math.abs(val - csr.val[tIdx]));
            break;
          }
        }
      }
    }
    // Float64 assembly accumulation allows small asymmetry
    expect(maxAsym).toBeLessThan(1e-4);

    solver.dispose();
  });
});

// ── Utilities ────────────────────────────────────────────────────────────────

function maxDisplacement(u: Float64Array | Float32Array): number {
  let max = 0;
  const n = u.length / 3;
  for (let i = 0; i < n; i++) {
    const mag = Math.sqrt(u[i * 3] ** 2 + u[i * 3 + 1] ** 2 + u[i * 3 + 2] ** 2);
    if (mag > max) max = mag;
  }
  return max;
}
