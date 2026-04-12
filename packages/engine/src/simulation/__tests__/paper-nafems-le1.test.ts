/**
 * NAFEMS LE1 Convergence Study — Proper Symmetry BCs (Roller Constraints)
 *
 * For "Trust by Construction" TVCG paper.
 *
 * Now that roller constraints are available (type: 'roller', dofs: [0|1|2]),
 * we can apply proper symmetry BCs on the quarter-model elliptic membrane:
 *   - x=0 plane: fix U_x only (roller, dofs: [0])
 *   - y=0 plane: fix U_y only (roller, dofs: [1])
 *   - z=0 and z=top: fix U_z only (roller, dofs: [2]) — plane stress
 *
 * Reference: sigma_yy at point D (x=0, y=2) = 92.7 MPa
 *
 * Run: cd packages/engine && npx vitest run src/simulation/__tests__/paper-nafems-le1
 */

import { describe, it, expect } from 'vitest';
import { StructuralSolver, type StructuralConfig } from '../StructuralSolver';
import {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
} from '../StructuralSolverTET10';
import { runConvergenceStudy } from '../verification/ConvergenceAnalysis';

// ── Constants ───────────────────────────────────────────────────────────────

const INNER_AX = 2.0, INNER_AY = 1.0; // NAFEMS spec: wide inner, short outer
const OUTER_BX = 3.25, OUTER_BY = 2.75;
const THICKNESS = 0.1;
const E_MODULUS = 210_000; // MPa
const POISSON = 0.3;
const PRESSURE = 10.0; // MPa outward on outer boundary
const NAFEMS_REF = 92.7; // MPa — sigma_yy at point D

// ── Mesh Generation ─────────────────────────────────────────────────────────

function generateMesh(nr: number, nt: number) {
  const nz = 1;
  const pts: number[] = [];

  function idx(ir: number, it: number, iz: number) {
    return iz * (nr + 1) * (nt + 1) + it * (nr + 1) + ir;
  }

  for (let iz = 0; iz <= nz; iz++) {
    const z = (iz * THICKNESS) / nz;
    for (let jt = 0; jt <= nt; jt++) {
      const theta = (jt / nt) * (Math.PI / 2);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      for (let ir = 0; ir <= nr; ir++) {
        const s = ir / nr;
        const ax = INNER_AX + s * (OUTER_BX - INNER_AX);
        const ay = INNER_AY + s * (OUTER_BY - INNER_AY);
        pts.push(ax * cosT, ay * sinT, z);
      }
    }
  }

  const tets: number[] = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let jt = 0; jt < nt; jt++) {
      for (let ir = 0; ir < nr; ir++) {
        const v0 = idx(ir, jt, iz), v1 = idx(ir + 1, jt, iz);
        const v2 = idx(ir + 1, jt + 1, iz), v3 = idx(ir, jt + 1, iz);
        const v4 = idx(ir, jt, iz + 1), v5 = idx(ir + 1, jt, iz + 1);
        const v6 = idx(ir + 1, jt + 1, iz + 1), v7 = idx(ir, jt + 1, iz + 1);
        if ((ir + jt + iz) % 2 === 0) {
          tets.push(v0,v1,v3,v4, v1,v2,v3,v6, v4,v5,v6,v1, v4,v6,v7,v3, v1,v4,v6,v3);
        } else {
          tets.push(v1,v0,v5,v2, v3,v2,v0,v7, v4,v5,v7,v0, v6,v7,v5,v2, v0,v2,v5,v7);
        }
      }
    }
  }

  const vertices = new Float32Array(pts);
  const tetrahedra = new Uint32Array(tets);
  const nodeCount = (nr + 1) * (nt + 1) * (nz + 1);
  return { vertices, tetrahedra, nr, nt, nz, idx, nodeCount };
}

// ── Symmetry BC Helpers ─────────────────────────────────────────────────────

/** Find nodes on x=0 plane (theta = pi/2, i.e. jt = nt) */
function nodesOnX0(mesh: ReturnType<typeof generateMesh>) {
  const nodes: number[] = [];
  for (let iz = 0; iz <= mesh.nz; iz++) {
    for (let ir = 0; ir <= mesh.nr; ir++) {
      nodes.push(mesh.idx(ir, mesh.nt, iz));
    }
  }
  return nodes;
}

/** Find nodes on y=0 plane (theta = 0, i.e. jt = 0) */
function nodesOnY0(mesh: ReturnType<typeof generateMesh>) {
  const nodes: number[] = [];
  for (let iz = 0; iz <= mesh.nz; iz++) {
    for (let ir = 0; ir <= mesh.nr; ir++) {
      nodes.push(mesh.idx(ir, 0, iz));
    }
  }
  return nodes;
}

/** Find ALL nodes at z=0 or z=top (for plane stress z-constraint) */
function nodesOnZFaces(mesh: ReturnType<typeof generateMesh>) {
  const nodes: number[] = [];
  for (let jt = 0; jt <= mesh.nt; jt++) {
    for (let ir = 0; ir <= mesh.nr; ir++) {
      nodes.push(mesh.idx(ir, jt, 0));
      if (mesh.nz > 0) nodes.push(mesh.idx(ir, jt, mesh.nz));
    }
  }
  return [...new Set(nodes)];
}

/** Find all TET10 nodes at a given z-coordinate */
function tet10NodesAtZ(vertices: Float64Array, z: number, tol: number): number[] {
  const nodes: number[] = [];
  const nodeCount = vertices.length / 3;
  for (let n = 0; n < nodeCount; n++) {
    if (Math.abs(vertices[n * 3 + 2] - z) < tol) nodes.push(n);
  }
  return nodes;
}

/** Find all TET10 nodes where a coordinate is below a threshold */
function tet10NodesNearPlane(vertices: Float64Array, axis: 0|1|2, target: number, tol: number): number[] {
  const nodes: number[] = [];
  const nodeCount = vertices.length / 3;
  for (let n = 0; n < nodeCount; n++) {
    if (Math.abs(vertices[n * 3 + axis] - target) < tol) nodes.push(n);
  }
  return nodes;
}

// ── Outer Pressure Loads ────────────────────────────────────────────────────

function outerPressureLoads(mesh: ReturnType<typeof generateMesh>) {
  const loads: Array<{ id: string; type: 'point'; nodeIndex: number; force: [number, number, number] }> = [];
  for (let iz = 0; iz <= mesh.nz; iz++) {
    for (let jt = 0; jt <= mesh.nt; jt++) {
      const nodeIdx = mesh.idx(mesh.nr, jt, iz);
      const theta = (jt / mesh.nt) * (Math.PI / 2);
      const nxU = OUTER_BY * Math.cos(theta);
      const nyU = OUTER_BX * Math.sin(theta);
      const nmag = Math.sqrt(nxU * nxU + nyU * nyU);
      const nx = nxU / nmag, ny = nyU / nmag;
      const dsdtheta = Math.sqrt((OUTER_BX * Math.sin(theta)) ** 2 + (OUTER_BY * Math.cos(theta)) ** 2);
      const dtheta = (Math.PI / 2) / mesh.nt;
      const dz = THICKNESS / mesh.nz;
      let tw = dtheta; if (jt === 0 || jt === mesh.nt) tw *= 0.5;
      let zw = dz; if (iz === 0 || iz === mesh.nz) zw *= 0.5;
      const area = dsdtheta * tw * zw;
      const fmag = PRESSURE * area;
      loads.push({ id: `p_${iz}_${jt}`, type: 'point', nodeIndex: nodeIdx, force: [fmag * nx, fmag * ny, 0] });
    }
  }
  return loads;
}

// ── Stress Extraction ───────────────────────────────────────────────────────

/**
 * Extract a specific Cauchy stress component near a target point.
 * cauchyStress layout: [sxx,syy,szz,txy,tyz,txz] × elementCount
 * component: 0=sxx, 1=syy, 2=szz, 3=txy, 4=tyz, 5=txz
 */
function extractCauchyComponentNearPoint(
  vertices: Float32Array | Float64Array, tetrahedra: Uint32Array,
  cauchyStress: Float32Array | Float64Array, nodesPerTet: number,
  component: number, targetX: number, targetY: number, searchRadius: number,
): number {
  const elemCount = tetrahedra.length / nodesPerTet;
  let bestDist = Infinity, bestStress = 0, sumStress = 0, count = 0;
  for (let e = 0; e < elemCount; e++) {
    let cx = 0, cy = 0;
    for (let n = 0; n < 4; n++) {
      const ni = tetrahedra[e * nodesPerTet + n];
      cx += vertices[ni * 3] / 4;
      cy += vertices[ni * 3 + 1] / 4;
    }
    const dist = Math.sqrt((cx - targetX) ** 2 + (cy - targetY) ** 2);
    const sigma = cauchyStress[e * 6 + component];
    if (dist < searchRadius) { sumStress += sigma; count++; }
    if (dist < bestDist) { bestDist = dist; bestStress = sigma; }
  }
  return count > 0 ? sumStress / count : bestStress;
}

/** Extract von Mises stress near a target point (backward compatible) */
function extractVonMisesNearPoint(
  vertices: Float32Array | Float64Array, tetrahedra: Uint32Array,
  vonMises: Float32Array | Float64Array, nodesPerTet: number,
  targetX: number, targetY: number, searchRadius: number,
): number {
  const elemCount = tetrahedra.length / nodesPerTet;
  let bestDist = Infinity, bestStress = 0, sumStress = 0, count = 0;
  for (let e = 0; e < elemCount; e++) {
    let cx = 0, cy = 0;
    for (let n = 0; n < 4; n++) {
      const ni = tetrahedra[e * nodesPerTet + n];
      cx += vertices[ni * 3] / 4;
      cy += vertices[ni * 3 + 1] / 4;
    }
    const dist = Math.sqrt((cx - targetX) ** 2 + (cy - targetY) ** 2);
    if (dist < searchRadius) { sumStress += vonMises[e]; count++; }
    if (dist < bestDist) { bestDist = dist; bestStress = vonMises[e]; }
  }
  return count > 0 ? sumStress / count : bestStress;
}

// ── Solver Runners ──────────────────────────────────────────────────────────

function runTET4WithRollers(nr: number, nt: number) {
  const mesh = generateMesh(nr, nt);
  const loads = outerPressureLoads(mesh);

  // Proper symmetry BCs using roller constraints:
  // x=0 plane (theta=pi/2): fix U_x only
  // y=0 plane (theta=0):    fix U_y only
  // z faces:                 fix U_z only (plane stress)
  // Plane stress: constrain z at ONE node only (prevent rigid body z-translation).
  // Constraining all z-face nodes creates plane strain (ε_zz=0), not plane stress (σ_zz=0).
  const oneZNode = [mesh.idx(0, 0, 0)];
  const constraints: StructuralConfig['constraints'] = [
    { id: 'sym_x0', type: 'roller', nodes: nodesOnX0(mesh), dofs: [0] },
    { id: 'sym_y0', type: 'roller', nodes: nodesOnY0(mesh), dofs: [1] },
    { id: 'sym_z',  type: 'roller', nodes: oneZNode, dofs: [2] },
  ];

  const config: StructuralConfig = {
    vertices: mesh.vertices,
    tetrahedra: mesh.tetrahedra,
    material: { density: 7850, youngs_modulus: E_MODULUS, poisson_ratio: POISSON, yield_strength: 400e6 },
    constraints,
    loads,
    maxIterations: 5000,
    tolerance: 1e-10,
  };

  const start = performance.now();
  const solver = new StructuralSolver(config);
  const result = solver.solve();
  const solveMs = performance.now() - start;

  // Extract σ_yy (component 1) directly — this is what NAFEMS LE1 references
  const cauchy = solver.getCauchyStress();
  const sigmaYY = extractCauchyComponentNearPoint(mesh.vertices, mesh.tetrahedra, cauchy, 4, 1, INNER_AX, 0, 0.5);

  // Also get von Mises for comparison
  const vms = solver.getVonMisesStress();
  const vonMisesAtD = extractVonMisesNearPoint(mesh.vertices, mesh.tetrahedra, vms, 4, INNER_AX, 0, 0.5);

  return { sigmaYY, vonMisesAtD, converged: result.converged, solveMs, nodeCount: mesh.nodeCount, dof: mesh.nodeCount * 3, mesh };
}

function runTET10WithRollers(nr: number, nt: number) {
  const mesh = generateMesh(nr, nt);
  const loads = outerPressureLoads(mesh);
  const tet10Mesh = tet4ToTet10(new Float64Array(mesh.vertices), mesh.tetrahedra);
  const tet10NodeCount = tet10Mesh.vertices.length / 3;
  const tol = 0.001;

  // Symmetry BCs on TET10 mesh — must include midside nodes
  const x0Nodes = tet10NodesNearPlane(tet10Mesh.vertices, 0, 0.0, tol); // nodes where x≈0
  const y0Nodes = tet10NodesNearPlane(tet10Mesh.vertices, 1, 0.0, tol); // nodes where y≈0
  const z0Nodes = tet10NodesAtZ(tet10Mesh.vertices, 0, tol);
  const zTopNodes = tet10NodesAtZ(tet10Mesh.vertices, THICKNESS, tol);
  const zAllNodes = [...new Set([...z0Nodes, ...zTopNodes])];

  // Plane stress: constrain z at ONE node only
  const oneZNodeIdx = z0Nodes[0];
  const constraints: TET10Config['constraints'] = [
    { id: 'sym_x0', type: 'roller', nodes: x0Nodes, dofs: [0] },
    { id: 'sym_y0', type: 'roller', nodes: y0Nodes, dofs: [1] },
    { id: 'sym_z',  type: 'roller', nodes: [oneZNodeIdx], dofs: [2] },
  ];

  // Use point loads (corner-node distributed) for TET10 since outer boundary
  // is curved and surfaceFaces requires identifying boundary tet faces.
  // The load distribution is reasonable because we're using tributary area weights.
  const config: TET10Config = {
    vertices: tet10Mesh.vertices,
    tetrahedra: tet10Mesh.tetrahedra,
    material: { density: 7850, youngs_modulus: E_MODULUS, poisson_ratio: POISSON, yield_strength: 400e6 },
    constraints,
    loads,
    maxIterations: 5000,
    tolerance: 1e-12,
    useGPU: false,
  };

  const start = performance.now();
  const solver = new StructuralSolverTET10(config);
  const result = solver.solveCPU();
  const solveMs = performance.now() - start;

  // Extract σ_yy (component 1)
  const cauchy = solver.getCauchyStress();
  const sigmaYY = extractCauchyComponentNearPoint(tet10Mesh.vertices, tet10Mesh.tetrahedra, cauchy, 10, 1, INNER_AX, 0, 0.5);

  const vms = solver.getVonMisesStress();
  const vonMisesAtD = extractVonMisesNearPoint(tet10Mesh.vertices, tet10Mesh.tetrahedra, vms, 10, INNER_AX, 0, 0.5);

  return { sigmaYY, vonMisesAtD, converged: result.converged, solveMs, nodeCount: tet10NodeCount, dof: tet10NodeCount * 3 };
}

// ═══════════════════════════════════════════════════════════════════════
// CONVERGENCE STUDY
// ═══════════════════════════════════════════════════════════════════════

describe('NAFEMS LE1 — Roller BCs + σ_yy Extraction', () => {

  it('TET4 + TET10 σ_yy convergence with roller symmetry BCs', () => {
    // Finer meshes for stress convergence on curved geometry
    const meshConfigs = [
      { nr: 4,  nt: 8,  h: 0.250 },
      { nr: 8,  nt: 16, h: 0.125 },
      { nr: 12, nt: 24, h: 0.083 },
      { nr: 16, nt: 32, h: 0.0625 },
    ];
    const hSizes = meshConfigs.map((c) => c.h);

    // ── TET4 ──
    const tet4Data: Array<{ h: number; nodes: number; dof: number; sigmaYY: number; vonMises: number; error: number; solveMs: number }> = [];
    const tet4Result = runConvergenceStudy((h) => {
      const conf = meshConfigs.find((c) => c.h === h)!;
      const run = runTET4WithRollers(conf.nr, conf.nt);
      const error = Math.abs(run.sigmaYY - NAFEMS_REF) / NAFEMS_REF;
      tet4Data.push({ h, nodes: run.nodeCount, dof: run.dof, sigmaYY: run.sigmaYY, vonMises: run.vonMisesAtD, error, solveMs: run.solveMs });
      return { numerical: new Float32Array([run.sigmaYY]), exact: new Float32Array([NAFEMS_REF]) };
    }, hSizes, (n) => n[0]);

    // ── TET10 ──
    const tet10Data: Array<{ h: number; nodes: number; dof: number; sigmaYY: number; vonMises: number; error: number; solveMs: number }> = [];
    const tet10Result = runConvergenceStudy((h) => {
      const conf = meshConfigs.find((c) => c.h === h)!;
      const run = runTET10WithRollers(conf.nr, conf.nt);
      const error = Math.abs(run.sigmaYY - NAFEMS_REF) / NAFEMS_REF;
      tet10Data.push({ h, nodes: run.nodeCount, dof: run.dof, sigmaYY: run.sigmaYY, vonMises: run.vonMisesAtD, error, solveMs: run.solveMs });
      return { numerical: new Float32Array([run.sigmaYY]), exact: new Float32Array([NAFEMS_REF]) };
    }, hSizes, (n) => n[0]);

    // ═══ Output ═══
    console.log('\n' + '='.repeat(95));
    console.log('NAFEMS LE1 — σ_yy at D with ROLLER BCs (ref = 92.7 MPa)');
    console.log('='.repeat(95));

    console.log('\nTET4 (Linear):');
    console.log('| h      | Nodes | DOF    | σ_yy (MPa) | VonMises | Rel Error | Solve (ms) |');
    console.log('|--------|-------|--------|------------|----------|-----------|------------|');
    for (const d of tet4Data) {
      console.log(`| ${d.h.toFixed(4)} | ${String(d.nodes).padStart(5)} | ${String(d.dof).padStart(6)} | ${d.sigmaYY.toFixed(2).padStart(10)} | ${d.vonMises.toFixed(2).padStart(8)} | ${(d.error * 100).toFixed(2).padStart(8)}% | ${d.solveMs.toFixed(1).padStart(10)} |`);
    }
    console.log(`Observed order: ${tet4Result.observedOrderLinf.toFixed(3)}`);
    if (tet4Result.gci !== undefined) console.log(`GCI: ${(tet4Result.gci * 100).toFixed(2)}%`);
    if (tet4Result.richardsonEstimate !== undefined) console.log(`Richardson estimate: ${tet4Result.richardsonEstimate.toFixed(2)} MPa`);

    console.log('\nTET10 (Quadratic):');
    console.log('| h      | Nodes | DOF    | σ_yy (MPa) | VonMises | Rel Error | Solve (ms) |');
    console.log('|--------|-------|--------|------------|----------|-----------|------------|');
    for (const d of tet10Data) {
      console.log(`| ${d.h.toFixed(4)} | ${String(d.nodes).padStart(5)} | ${String(d.dof).padStart(6)} | ${d.sigmaYY.toFixed(2).padStart(10)} | ${d.vonMises.toFixed(2).padStart(8)} | ${(d.error * 100).toFixed(2).padStart(8)}% | ${d.solveMs.toFixed(1).padStart(10)} |`);
    }
    console.log(`Observed order: ${tet10Result.observedOrderLinf.toFixed(3)}`);
    if (tet10Result.gci !== undefined) console.log(`GCI: ${(tet10Result.gci * 100).toFixed(2)}%`);
    if (tet10Result.richardsonEstimate !== undefined) console.log(`Richardson estimate: ${tet10Result.richardsonEstimate.toFixed(2)} MPa`);

    // ═══ LaTeX ═══
    console.log('\n% ────────────────────────────────────────────────────────');
    console.log('% LaTeX: NAFEMS LE1 σ_yy with Roller BCs');
    console.log('% ────────────────────────────────────────────────────────');
    console.log('\\begin{table*}[t]');
    console.log('  \\centering');
    console.log('  \\caption{NAFEMS LE1: $\\sigma_{yy}$ at point~D ($\\sigma_{yy}^{\\text{ref}} = 92.7$~MPa). Roller symmetry BCs, Cauchy stress extraction.}');
    console.log('  \\label{tab:nafems}');
    console.log('  \\begin{tabular}{@{}crrrcrrrr@{}}');
    console.log('    \\toprule');
    console.log('    & \\multicolumn{3}{c}{TET4 (Linear)} & & \\multicolumn{3}{c}{TET10 (Quadratic)} \\\\');
    console.log('    \\cmidrule(lr){2-4} \\cmidrule(lr){6-8}');
    console.log('    $h$ & DOF & $\\sigma_{yy}$ (MPa) & Error (\\%) & & DOF & $\\sigma_{yy}$ (MPa) & Error (\\%) \\\\');
    console.log('    \\midrule');
    for (let i = 0; i < hSizes.length; i++) {
      const t4 = tet4Data[i], t10 = tet10Data[i];
      console.log(`    ${t4.h.toFixed(4)} & ${t4.dof} & ${t4.sigmaYY.toFixed(2)} & ${(t4.error * 100).toFixed(2)} & & ${t10.dof} & ${t10.sigmaYY.toFixed(2)} & ${(t10.error * 100).toFixed(2)} \\\\`);
    }
    console.log('    \\midrule');
    console.log(`    \\multicolumn{4}{l}{Observed order: $p = ${tet4Result.observedOrderLinf.toFixed(2)}$} & & \\multicolumn{3}{l}{Observed order: $p = ${tet10Result.observedOrderLinf.toFixed(2)}$} \\\\`);
    if (tet4Result.gci !== undefined && tet10Result.gci !== undefined) {
      console.log(`    \\multicolumn{4}{l}{GCI: ${(tet4Result.gci * 100).toFixed(2)}\\%} & & \\multicolumn{3}{l}{GCI: ${(tet10Result.gci * 100).toFixed(2)}\\%} \\\\`);
    }
    console.log('    \\bottomrule');
    console.log('  \\end{tabular}');
    console.log('\\end{table*}');
    console.log('='.repeat(95));

    // Assertions
    expect(tet4Data.length).toBe(4);
    expect(tet10Data.length).toBe(4);
    // TET10 finest mesh should be more accurate than TET4 finest mesh
    expect(tet10Data[3].error).toBeLessThan(tet4Data[3].error);
  }, 300000);
});
