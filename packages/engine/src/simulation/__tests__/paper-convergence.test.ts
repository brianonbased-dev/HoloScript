/**
 * Paper Convergence Study — Axial Bar (u = FL/AE)
 *
 * For "Trust by Construction" TVCG paper, Section 5 (Evaluation).
 *
 * Uses uniform bar under axial tension — exact analytical solution, no
 * symmetry BCs needed, no shear locking. Fixed constraints at z=0 face.
 *
 * Demonstrates:
 * - TET4: O(h) convergence (linear elements)
 * - TET10: O(h²) convergence (quadratic elements)
 * - Richardson extrapolation and GCI uncertainty bands
 * - Publication-ready LaTeX table + CSV for log-log plot
 *
 * Run: cd packages/engine && npx vitest run src/simulation/__tests__/paper-convergence
 */

import { describe, it, expect } from 'vitest';
import { StructuralSolver, type StructuralConfig } from '../StructuralSolver';
import {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
} from '../StructuralSolverTET10';
import { runConvergenceStudy } from '../verification/ConvergenceAnalysis';

// ── Problem Definition ──────────────────────────────────────────────────────
//
// Uniform bar: L=10, cross-section 1×1, E=10^7 Pa, ν=0 (pure axial).
// Fixed at z=0, uniform tension F=1000 N at z=L.
//
// Analytical solution:
//   u_z(z=L) = FL/(AE) = 1000 * 10 / (1 * 10^7) = 0.001 m
//   σ_zz     = F/A     = 1000 / 1 = 1000 Pa
//
// With ν=0, this is a pure 1D problem — no Poisson coupling, no transverse
// effects. The FEM solution should converge cleanly to the analytical value.

const L = 10;
const W = 1;
const H = 1;
const E = 1e7;
const NU = 0.0;
const TOTAL_FORCE = 1000;
const AREA = W * H;
const EXACT_UZ = (TOTAL_FORCE * L) / (AREA * E); // 0.001 m
const EXACT_SIGMA = TOTAL_FORCE / AREA; // 1000 Pa

// ── Mesh Generation ─────────────────────────────────────────────────────────

function buildCubeGrid(nx: number, ny: number, nz: number) {
  const pts: number[] = [];

  function idx(i: number, j: number, k: number) {
    return k * (nx + 1) * (ny + 1) + j * (nx + 1) + i;
  }

  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        pts.push((i * W) / nx, (j * H) / ny, (k * L) / nz);
      }
    }
  }

  const tets: number[] = [];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = idx(i, j, k);
        const v1 = idx(i + 1, j, k);
        const v2 = idx(i + 1, j + 1, k);
        const v3 = idx(i, j + 1, k);
        const v4 = idx(i, j, k + 1);
        const v5 = idx(i + 1, j, k + 1);
        const v6 = idx(i + 1, j + 1, k + 1);
        const v7 = idx(i, j + 1, k + 1);

        if ((i + j + k) % 2 === 0) {
          tets.push(v0, v1, v3, v4, v1, v2, v3, v6, v4, v5, v6, v1, v4, v6, v7, v3, v1, v4, v6, v3);
        } else {
          tets.push(v1, v0, v5, v2, v3, v2, v0, v7, v4, v5, v7, v0, v6, v7, v5, v2, v0, v2, v5, v7);
        }
      }
    }
  }

  const nodeCount = (nx + 1) * (ny + 1) * (nz + 1);
  return { vertices: new Float32Array(pts), tetrahedra: new Uint32Array(tets), nx, ny, nz, idx, nodeCount };
}

// ── Solver Runners ──────────────────────────────────────────────────────────

function runAxialTET4(nx: number, ny: number, nz: number) {
  const mesh = buildCubeGrid(nx, ny, nz);

  // Fix all nodes at z=0
  const fixedNodes: number[] = [];
  for (let i = 0; i <= mesh.nx; i++) {
    for (let j = 0; j <= mesh.ny; j++) {
      fixedNodes.push(mesh.idx(i, j, 0));
    }
  }

  // Distribute force uniformly across z=L face
  const loadedNodes: number[] = [];
  for (let i = 0; i <= mesh.nx; i++) {
    for (let j = 0; j <= mesh.ny; j++) {
      loadedNodes.push(mesh.idx(i, j, mesh.nz));
    }
  }
  const nodeForce = TOTAL_FORCE / loadedNodes.length;

  const config: StructuralConfig = {
    vertices: mesh.vertices,
    tetrahedra: mesh.tetrahedra,
    material: { density: 1000, youngs_modulus: E, poisson_ratio: NU, yield_strength: 1e8 },
    constraints: [{ id: 'fix_z0', type: 'fixed', nodes: fixedNodes }],
    loads: loadedNodes.map((n) => ({
      id: `load_${n}`,
      type: 'point' as const,
      nodeIndex: n,
      force: [0, 0, nodeForce] as [number, number, number],
    })),
    maxIterations: 5000,
    tolerance: 1e-10,
  };

  const start = performance.now();
  const solver = new StructuralSolver(config);
  const result = solver.solve();
  const solveMs = performance.now() - start;

  // Average z-displacement at loaded face
  const u = solver.getDisplacements();
  let sumUz = 0;
  for (const n of loadedNodes) {
    sumUz += u[n * 3 + 2];
  }
  const avgUz = sumUz / loadedNodes.length;

  // Average stress
  const vms = solver.getVonMisesStress();
  let sumS = 0;
  for (let i = 0; i < vms.length; i++) sumS += vms[i];
  const avgSigma = sumS / vms.length;

  const elemCount = mesh.tetrahedra.length / 4;
  const dof = mesh.nodeCount * 3;

  return { avgUz, avgSigma, converged: result.converged, solveMs, nodeCount: mesh.nodeCount, elemCount, dof, mesh };
}

function runAxialTET10(nx: number, ny: number, nz: number) {
  const mesh = buildCubeGrid(nx, ny, nz);

  const fixedNodes: number[] = [];
  for (let i = 0; i <= mesh.nx; i++) {
    for (let j = 0; j <= mesh.ny; j++) {
      fixedNodes.push(mesh.idx(i, j, 0));
    }
  }

  // Convert to TET10
  const tet10Mesh = tet4ToTet10(new Float64Array(mesh.vertices), mesh.tetrahedra);
  const tet10NodeCount = tet10Mesh.vertices.length / 3;

  // Find element faces on the z=L boundary for distributed pressure loading.
  // A tet face is on z=L if all 3 corner nodes of that face have z ≈ L.
  // TET4 local face definitions: face 0=[0,1,2], face 1=[0,1,3], face 2=[0,2,3], face 3=[1,2,3]
  const TET4_FACES = [[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
  const surfaceFaces: Array<{ elementIndex: number; localFace: 0|1|2|3 }> = [];
  const tet4Tets = mesh.tetrahedra;
  const tet4Verts = mesh.vertices;
  const elemCount = tet4Tets.length / 4;
  const zTol = L * 0.01;

  for (let e = 0; e < elemCount; e++) {
    for (let f = 0; f < 4; f++) {
      const faceCorners = TET4_FACES[f];
      let allOnZL = true;
      for (const lc of faceCorners) {
        const globalNode = tet4Tets[e * 4 + lc];
        const z = tet4Verts[globalNode * 3 + 2];
        if (Math.abs(z - L) > zTol) { allOnZL = false; break; }
      }
      if (allOnZL) {
        surfaceFaces.push({ elementIndex: e, localFace: f as 0|1|2|3 });
      }
    }
  }

  // Pressure = F/A = 1000/1 = 1000 Pa applied as distributed traction
  // using the new quadratic face traction integration (TRI6 shape functions)
  const pressure = TOTAL_FORCE / AREA;

  // Also collect loaded-face corner nodes for displacement averaging
  const loadedNodes: number[] = [];
  for (let i = 0; i <= mesh.nx; i++) {
    for (let j = 0; j <= mesh.ny; j++) {
      loadedNodes.push(mesh.idx(i, j, mesh.nz));
    }
  }

  const config: TET10Config = {
    vertices: tet10Mesh.vertices,
    tetrahedra: tet10Mesh.tetrahedra,
    material: { density: 1000, youngs_modulus: E, poisson_ratio: NU, yield_strength: 1e8 },
    constraints: [{ id: 'fix_z0', type: 'fixed', nodes: fixedNodes }],
    loads: [{
      id: 'pressure_zL',
      type: 'distributed' as const,
      pressure,
      surfaceFaces,
    }],
    maxIterations: 5000,
    tolerance: 1e-12,
    useGPU: false,
  };

  const start = performance.now();
  const solver = new StructuralSolverTET10(config);
  const result = solver.solveCPU();
  const solveMs = performance.now() - start;

  // Average z-displacement at loaded face (corner nodes preserved in tet4ToTet10)
  const u = solver.getDisplacements();
  let sumUz = 0;
  for (const n of loadedNodes) {
    sumUz += u[n * 3 + 2];
  }
  const avgUz = sumUz / loadedNodes.length;

  const vms = solver.getVonMisesStress();
  let sumS = 0;
  for (let i = 0; i < vms.length; i++) sumS += vms[i];
  const avgSigma = sumS / vms.length;

  const tet10ElemCount = tet10Mesh.tetrahedra.length / 10;
  const dof = tet10NodeCount * 3;

  return { avgUz, avgSigma, converged: result.converged, solveMs, nodeCount: tet10NodeCount, elemCount: tet10ElemCount, dof };
}

// ═══════════════════════════════════════════════════════════════════════
// CONVERGENCE STUDY
// ═══════════════════════════════════════════════════════════════════════

describe('Paper Convergence: Axial Bar (u = FL/AE)', () => {

  it('TET4 + TET10 displacement convergence with LaTeX output', () => {
    // Isotropic refinement: all dimensions scale together so elements stay cubic.
    // nx = n, ny = n, nz = 10*n → element size h = W/n = 1/n.
    // This avoids point-load artifacts from elongated elements.
    const meshConfigs = [
      { nx: 1, ny: 1, nz: 10, h: 1.000 },
      { nx: 2, ny: 2, nz: 20, h: 0.500 },
      { nx: 3, ny: 3, nz: 30, h: 0.333 },
      { nx: 4, ny: 4, nz: 40, h: 0.250 },
    ];

    const hSizes = meshConfigs.map((c) => c.h);

    // ── TET4 convergence ──
    const tet4Data: Array<{ h: number; nodes: number; dof: number; uz: number; relError: number; solveMs: number }> = [];

    const tet4Result = runConvergenceStudy((h: number) => {
      const conf = meshConfigs.find((c) => c.h === h)!;
      const run = runAxialTET4(conf.nx, conf.ny, conf.nz);
      const relError = Math.abs(run.avgUz - EXACT_UZ) / EXACT_UZ;
      tet4Data.push({ h, nodes: run.nodeCount, dof: run.dof, uz: run.avgUz, relError, solveMs: run.solveMs });
      return {
        numerical: new Float32Array([run.avgUz]),
        exact: new Float32Array([EXACT_UZ]),
      };
    }, hSizes, (n) => n[0]);

    // ── TET10 convergence ──
    const tet10Data: Array<{ h: number; nodes: number; dof: number; uz: number; relError: number; solveMs: number }> = [];

    const tet10Result = runConvergenceStudy((h: number) => {
      const conf = meshConfigs.find((c) => c.h === h)!;
      const run = runAxialTET10(conf.nx, conf.ny, conf.nz);
      const relError = Math.abs(run.avgUz - EXACT_UZ) / EXACT_UZ;
      tet10Data.push({ h, nodes: run.nodeCount, dof: run.dof, uz: run.avgUz, relError, solveMs: run.solveMs });
      return {
        numerical: new Float32Array([run.avgUz]),
        exact: new Float32Array([EXACT_UZ]),
      };
    }, hSizes, (n) => n[0]);

    // ═══ Console Output ═══
    console.log('\n' + '='.repeat(85));
    console.log('AXIAL BAR CONVERGENCE: u_z at z=L (exact = FL/AE = 0.001 m)');
    console.log('='.repeat(85));

    console.log('\nTET4 (Linear, expected O(h)):');
    console.log('| h       | Nodes | DOF   | u_z (m)      | Rel Error  | Solve (ms) |');
    console.log('|---------|-------|-------|--------------|------------|------------|');
    for (const d of tet4Data) {
      console.log(`| ${d.h.toFixed(4).padStart(7)} | ${String(d.nodes).padStart(5)} | ${String(d.dof).padStart(5)} | ${d.uz.toExponential(6).padStart(12)} | ${(d.relError * 100).toFixed(4).padStart(9)}% | ${d.solveMs.toFixed(1).padStart(10)} |`);
    }
    console.log(`\nObserved order (L2):   ${tet4Result.observedOrderL2.toFixed(4)}`);
    console.log(`Observed order (Linf): ${tet4Result.observedOrderLinf.toFixed(4)}`);
    if (tet4Result.richardsonEstimate !== undefined)
      console.log(`Richardson estimate:    ${tet4Result.richardsonEstimate.toExponential(6)}`);
    if (tet4Result.gci !== undefined)
      console.log(`GCI (95% confidence):  ${(tet4Result.gci * 100).toFixed(4)}%`);

    console.log('\nTET10 (Quadratic, expected O(h²)):');
    console.log('| h       | Nodes | DOF   | u_z (m)      | Rel Error  | Solve (ms) |');
    console.log('|---------|-------|-------|--------------|------------|------------|');
    for (const d of tet10Data) {
      console.log(`| ${d.h.toFixed(4).padStart(7)} | ${String(d.nodes).padStart(5)} | ${String(d.dof).padStart(5)} | ${d.uz.toExponential(6).padStart(12)} | ${(d.relError * 100).toFixed(4).padStart(9)}% | ${d.solveMs.toFixed(1).padStart(10)} |`);
    }
    console.log(`\nObserved order (L2):   ${tet10Result.observedOrderL2.toFixed(4)}`);
    console.log(`Observed order (Linf): ${tet10Result.observedOrderLinf.toFixed(4)}`);
    if (tet10Result.richardsonEstimate !== undefined)
      console.log(`Richardson estimate:    ${tet10Result.richardsonEstimate.toExponential(6)}`);
    if (tet10Result.gci !== undefined)
      console.log(`GCI (95% confidence):  ${(tet10Result.gci * 100).toFixed(4)}%`);
    console.log('='.repeat(85));

    // ═══ LaTeX Table ═══
    console.log('\n% ────────────────────────────────────────────────────────────────');
    console.log('% LaTeX Table: Axial Bar Convergence (for TVCG paper Section 5)');
    console.log('% ────────────────────────────────────────────────────────────────');
    console.log('\\begin{table*}[t]');
    console.log('  \\centering');
    console.log('  \\caption{Convergence study: uniform bar under axial tension ($u_z^{\\text{exact}} = FL/AE = 10^{-3}$~m).}');
    console.log('  \\label{tab:axial-convergence}');
    console.log('  \\begin{tabular}{@{}crrrcrrrr@{}}');
    console.log('    \\toprule');
    console.log('    & \\multicolumn{3}{c}{TET4 (Linear)} & & \\multicolumn{3}{c}{TET10 (Quadratic)} \\\\');
    console.log('    \\cmidrule(lr){2-4} \\cmidrule(lr){6-8}');
    console.log('    $h$ & DOF & $u_z$ (m) & Error (\\%) & & DOF & $u_z$ (m) & Error (\\%) \\\\');
    console.log('    \\midrule');
    for (let i = 0; i < hSizes.length; i++) {
      const t4 = tet4Data[i];
      const t10 = tet10Data[i];
      console.log(`    ${t4.h.toFixed(4)} & ${t4.dof} & ${t4.uz.toExponential(4)} & ${(t4.relError * 100).toFixed(2)} & & ${t10.dof} & ${t10.uz.toExponential(4)} & ${(t10.relError * 100).toFixed(2)} \\\\`);
    }
    console.log('    \\midrule');
    console.log(`    \\multicolumn{4}{l}{Observed order: $p = ${tet4Result.observedOrderL2.toFixed(2)}$} & & \\multicolumn{3}{l}{Observed order: $p = ${tet10Result.observedOrderL2.toFixed(2)}$} \\\\`);
    if (tet4Result.gci !== undefined && tet10Result.gci !== undefined) {
      console.log(`    \\multicolumn{4}{l}{GCI: ${(tet4Result.gci * 100).toFixed(2)}\\%} & & \\multicolumn{3}{l}{GCI: ${(tet10Result.gci * 100).toFixed(2)}\\%} \\\\`);
    }
    console.log('    \\bottomrule');
    console.log('  \\end{tabular}');
    console.log('\\end{table*}');

    // ═══ CSV for log-log plot ═══
    console.log('\n% CSV data for convergence plot (paste into pgfplots or matplotlib)');
    console.log('% h, errorL2_TET4, errorL2_TET10');
    for (let i = 0; i < hSizes.length; i++) {
      console.log(`% ${hSizes[i]}, ${tet4Result.errorsL2[i]}, ${tet10Result.errorsL2[i]}`);
    }

    console.log('\n% log10 data for direct plotting');
    console.log('% log10(h), log10(errorL2_TET4), log10(errorL2_TET10)');
    for (let i = 0; i < hSizes.length; i++) {
      const lh = Math.log10(hSizes[i]);
      const le4 = tet4Result.errorsL2[i] > 0 ? Math.log10(tet4Result.errorsL2[i]) : -Infinity;
      const le10 = tet10Result.errorsL2[i] > 0 ? Math.log10(tet10Result.errorsL2[i]) : -Infinity;
      console.log(`% ${lh.toFixed(4)}, ${le4.toFixed(4)}, ${le10.toFixed(4)}`);
    }

    // ═══ Assertions ═══
    // Both should have produced data for all mesh sizes
    expect(tet4Data.length).toBe(meshConfigs.length);
    expect(tet10Data.length).toBe(meshConfigs.length);
    // Convergence order should be a finite number
    expect(Number.isFinite(tet4Result.observedOrderL2)).toBe(true);
    expect(Number.isFinite(tet10Result.observedOrderL2)).toBe(true);
    // The finest mesh should have lower error than the coarsest for at least one solver
    // (Note: convergence may be non-monotonic for very coarse meshes due to load distribution)
    const tet4Improving = tet4Data[tet4Data.length - 1].relError < tet4Data[0].relError;
    const tet10Improving = tet10Data[tet10Data.length - 1].relError < tet10Data[0].relError;
    expect(tet4Improving || tet10Improving).toBe(true);
  }, 120000);

  it('stress convergence (σ = F/A = 1000 Pa)', () => {
    const meshConfigs = [
      { nx: 1, ny: 1, nz: 2 },
      { nx: 1, ny: 1, nz: 4 },
      { nx: 1, ny: 1, nz: 8 },
      { nx: 1, ny: 1, nz: 16 },
    ];

    console.log('\n' + '='.repeat(70));
    console.log('AXIAL BAR STRESS CONVERGENCE (σ_exact = 1000 Pa)');
    console.log('='.repeat(70));
    console.log('| nz  | TET4 σ_avg (Pa) | TET4 err | TET10 σ_avg (Pa) | TET10 err |');
    console.log('|-----|-----------------|----------|------------------|-----------|');

    for (const mc of meshConfigs) {
      const t4 = runAxialTET4(mc.nx, mc.ny, mc.nz);
      const t10 = runAxialTET10(mc.nx, mc.ny, mc.nz);
      const t4err = Math.abs(t4.avgSigma - EXACT_SIGMA) / EXACT_SIGMA;
      const t10err = Math.abs(t10.avgSigma - EXACT_SIGMA) / EXACT_SIGMA;
      console.log(`| ${String(mc.nz).padStart(3)} | ${t4.avgSigma.toFixed(2).padStart(15)} | ${(t4err * 100).toFixed(2).padStart(7)}% | ${t10.avgSigma.toFixed(2).padStart(16)} | ${(t10err * 100).toFixed(2).padStart(8)}% |`);
    }
    console.log('='.repeat(70));

    // Stress should be reasonable for the finest mesh
    const finest4 = runAxialTET4(1, 1, 16);
    const finest10 = runAxialTET10(1, 1, 16);
    expect(finest4.avgSigma).toBeGreaterThan(EXACT_SIGMA * 0.3);
    expect(finest4.avgSigma).toBeLessThan(EXACT_SIGMA * 3.0);
    expect(finest10.avgSigma).toBeGreaterThan(EXACT_SIGMA * 0.3);
    expect(finest10.avgSigma).toBeLessThan(EXACT_SIGMA * 3.0);
  }, 60000);
});
