/**
 * NAFEMS LE1 — Distributed-Traction Reproducibility Test
 *
 * Companion to `paper-nafems-le1.test.ts`. The earlier test used corner-node
 * point loads and produced σ_yy ≈ 45 MPa at h=0.083 (TET10), which is ~52% off
 * the NAFEMS reference of 92.7 MPa.
 *
 * This test wires the proper distributed traction on the *outer curved boundary*
 * via TET10's `surfaceFaces` load mechanism. The purpose is to verify (or
 * refute) the σ_yy = 94.09 MPa (SPR) / 83.95 MPa (elem-avg) claims in
 * `research/trust-by-construction-paper.tex` §5.
 *
 * Identifying outer-boundary tet faces:
 *   - The structured Freudenthal mesh has corner nodes indexed by (ir, jt, iz).
 *   - Outer-boundary corners are those with ir == nr.
 *   - A tet face is on the outer boundary iff all 3 of its corner nodes have
 *     ir == nr in the original mesh. (Mid-edge nodes inherit position from
 *     tet4ToTet10 — they do not change which face is on the boundary.)
 *
 * Reference: NAFEMS, "The Standard NAFEMS Benchmarks", 1990, Test LE1.
 *
 * Filed under task_1776462169708_hw41 — the "update paper.tex evaluation when
 * benchmark matches reference" gate.
 */

import { describe, it, expect } from 'vitest';
import {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
} from '../StructuralSolverTET10';
import { recoverNodalStressSPR } from '../verification/StressRecovery';

// ── Constants ───────────────────────────────────────────────────────────────

const INNER_AX = 2.0;
const INNER_AY = 1.0;
const OUTER_BX = 3.25;
const OUTER_BY = 2.75;
const THICKNESS = 0.1;
const E_MODULUS = 210_000; // MPa
const POISSON = 0.3;
const PRESSURE = 10.0; // MPa applied as outward traction on outer boundary
const NAFEMS_REF = 92.7; // MPa σ_yy at point D

// ── Mesh ─────────────────────────────────────────────────────────────────────

function generateMesh(nr: number, nt: number) {
  const nz = 1;
  const pts: number[] = [];

  // Tag corner-node ir/jt/iz for outer-face identification.
  const cornerIR: number[] = [];

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
        cornerIR.push(ir);
      }
    }
  }

  const tets: number[] = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let jt = 0; jt < nt; jt++) {
      for (let ir = 0; ir < nr; ir++) {
        const v0 = idx(ir, jt, iz),     v1 = idx(ir + 1, jt, iz);
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

  return {
    vertices: new Float32Array(pts),
    tetrahedra: new Uint32Array(tets),
    cornerIR,   // ir-coord per node (parallel to corner pts)
    nr, nt, nz, idx,
    nodeCount: (nr + 1) * (nt + 1) * (nz + 1),
  };
}

// ── Outer-Face Identification ───────────────────────────────────────────────

/**
 * Walk every TET4 element's 4 faces. A face is on the outer ellipse boundary
 * iff all 3 of its corner nodes (in the original TET4 numbering) have
 * `cornerIR[node] === nr`. Returns surfaceFaces refs valid for TET10
 * (tet4ToTet10 preserves corner-node indices in the first 4 slots of each tet).
 */
function findOuterFaces(
  tet4: Uint32Array,
  cornerIR: number[],
  nr: number,
): Array<{ elementIndex: number; localFace: 0 | 1 | 2 | 3 }> {
  const faces: Array<{ elementIndex: number; localFace: 0 | 1 | 2 | 3 }> = [];
  const elemCount = tet4.length / 4;

  // TET4 local-face → corner indices (matches LOCAL_FACE_NODE_MAP first 3 entries):
  const FACE_CORNERS: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 2], // localFace 0 (opposite corner 3)
    [0, 1, 3], // localFace 1 (opposite corner 2)
    [0, 2, 3], // localFace 2 (opposite corner 1)
    [1, 2, 3], // localFace 3 (opposite corner 0)
  ];

  for (let e = 0; e < elemCount; e++) {
    const c0 = tet4[e * 4 + 0];
    const c1 = tet4[e * 4 + 1];
    const c2 = tet4[e * 4 + 2];
    const c3 = tet4[e * 4 + 3];
    const cs = [c0, c1, c2, c3];

    for (let lf = 0; lf < 4; lf++) {
      const [a, b, c] = FACE_CORNERS[lf];
      if (
        cornerIR[cs[a]] === nr &&
        cornerIR[cs[b]] === nr &&
        cornerIR[cs[c]] === nr
      ) {
        faces.push({ elementIndex: e, localFace: lf as 0 | 1 | 2 | 3 });
      }
    }
  }

  return faces;
}

// ── Stress Extraction Helpers ───────────────────────────────────────────────

function extractCauchyComponentNearPoint(
  vertices: Float32Array | Float64Array,
  tetrahedra: Uint32Array,
  cauchyStress: Float32Array | Float64Array,
  nodesPerTet: number,
  component: number,
  targetX: number,
  targetY: number,
  searchRadius: number,
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

// ── Test Harness ────────────────────────────────────────────────────────────

function runTET10WithDistributedTraction(nr: number, nt: number) {
  const mesh = generateMesh(nr, nt);
  const tet10 = tet4ToTet10(new Float64Array(mesh.vertices), mesh.tetrahedra);
  const tet10NodeCount = tet10.vertices.length / 3;
  const tol = 1e-4;

  // Roller symmetry BCs
  const x0Nodes: number[] = [];
  const y0Nodes: number[] = [];
  const z0NodesRaw: number[] = [];
  for (let n = 0; n < tet10NodeCount; n++) {
    if (Math.abs(tet10.vertices[n * 3]) < tol) x0Nodes.push(n);
    if (Math.abs(tet10.vertices[n * 3 + 1]) < tol) y0Nodes.push(n);
    if (Math.abs(tet10.vertices[n * 3 + 2]) < tol) z0NodesRaw.push(n);
  }

  // Identify outer-boundary tet faces and apply distributed pressure.
  // PRESSURE is applied as outward-facing traction (the surface integral picks
  // up the outward normal sign automatically — see TET10 distributed-load path).
  const outerFaces = findOuterFaces(mesh.tetrahedra, mesh.cornerIR, nr);

  const config: TET10Config = {
    vertices: tet10.vertices,
    tetrahedra: tet10.tetrahedra,
    material: {
      density: 7850,
      youngs_modulus: E_MODULUS,
      poisson_ratio: POISSON,
      yield_strength: 400e6,
    },
    constraints: [
      { id: 'sym_x0', type: 'roller', nodes: x0Nodes,         dofs: [0] },
      { id: 'sym_y0', type: 'roller', nodes: y0Nodes,         dofs: [1] },
      { id: 'sym_z',  type: 'roller', nodes: [z0NodesRaw[0]], dofs: [2] }, // 1 node → plane stress
    ],
    loads: [
      {
        id: 'outer_pressure',
        type: 'distributed',
        surfaceFaces: outerFaces,
        // Pressure sign convention: TET10 distributed-load path multiplies
        // by outward normal. NAFEMS LE1 specifies outward-facing pressure
        // (membrane in tension), so a positive pressure gives the right sign.
        pressure: PRESSURE,
      },
    ],
    maxIterations: 8000,
    tolerance: 1e-12,
    useGPU: false,
  };

  const t0 = performance.now();
  const solver = new StructuralSolverTET10(config);
  const result = solver.solveCPU();
  const solveMs = performance.now() - t0;

  // Element-averaged σ_yy near point D
  const cauchy = solver.getCauchyStress();
  const elemSigmaYY = extractCauchyComponentNearPoint(
    tet10.vertices, tet10.tetrahedra, cauchy, 10, 1, INNER_AX, 0, 0.5,
  );

  // SPR-recovered nodal σ_yy at point D
  const spr = recoverNodalStressSPR(
    tet10.tetrahedra, tet10.vertices,
    solver.getGaussPointStress(), solver.getGaussPointCoords(), tet10NodeCount,
  );
  let bestNode = -1, bestDist = Infinity;
  for (let n = 0; n < tet10NodeCount; n++) {
    const dx = tet10.vertices[n * 3] - INNER_AX;
    const dy = tet10.vertices[n * 3 + 1];
    const dz = tet10.vertices[n * 3 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < bestDist) { bestDist = dist; bestNode = n; }
  }
  const sprSigmaYY = spr.nodalStress[bestNode * 6 + 1];

  return {
    converged: result.converged,
    solveMs,
    elemSigmaYY,
    sprSigmaYY,
    outerFaceCount: outerFaces.length,
    nodeCount: tet10NodeCount,
    bestNode,
    bestDist,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('NAFEMS LE1 — Distributed-Traction Reproducibility', () => {

  it('reports σ_yy at point D with distributed traction on outer boundary (h=0.083)', () => {
    const r = runTET10WithDistributedTraction(12, 24);

    const elemErr = Math.abs(r.elemSigmaYY - NAFEMS_REF) / NAFEMS_REF;
    const sprErr  = Math.abs(r.sprSigmaYY  - NAFEMS_REF) / NAFEMS_REF;

    console.log('\n' + '='.repeat(70));
    console.log('NAFEMS LE1 — Distributed Traction (TET10, h=0.083)');
    console.log('='.repeat(70));
    console.log(`  Reference σ_yy at D:   ${NAFEMS_REF} MPa`);
    console.log(`  Outer faces loaded:    ${r.outerFaceCount}`);
    console.log(`  TET10 nodes:           ${r.nodeCount}`);
    console.log(`  Closest node to D:     #${r.bestNode} (dist=${r.bestDist.toExponential(2)})`);
    console.log(`  Elem-avg σ_yy:         ${r.elemSigmaYY.toFixed(2)} MPa (err: ${(elemErr*100).toFixed(2)}%)`);
    console.log(`  SPR nodal σ_yy:        ${r.sprSigmaYY.toFixed(2)} MPa (err: ${(sprErr*100).toFixed(2)}%)`);
    console.log(`  Solve time:            ${r.solveMs.toFixed(0)} ms`);
    console.log(`  Converged:             ${r.converged}`);
    console.log('='.repeat(70));

    // Diagnostic-only assertions — we want to OBSERVE the value, not predetermine
    // which range "passes". The paper-claim audit (94.09 SPR / 83.95 elem-avg
    // claimed in the .tex prior to this revision) is the editorial decision
    // that follows from this number; current observation is σ_yy ≈ 45 MPa
    // (elem-avg) and SPR at the point-D corner-node is NaN (no neighbouring
    // patch elements). Both are recorded in the paper §6.1 closure paragraph.
    expect(r.converged).toBe(true);
    expect(r.outerFaceCount).toBeGreaterThan(0);
    expect(Number.isFinite(r.elemSigmaYY)).toBe(true);
    // SPR may legitimately be NaN at boundary nodes whose patch is too small;
    // this is itself a finding, not a regression.
  }, 180000);
});
