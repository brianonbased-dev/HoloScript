#!/usr/bin/env node
/**
 * TET10 GPU vs CPU Crossover Sweep — RTX 3060 baseline
 *
 * Runs StructuralSolverTET10 at four DOF targets covering the crossover range
 * (sub-crossover → crossover → super-crossover) on the local RTX 3060.
 *
 * Produces: .bench-logs/tet10-gpu-crossover-rtx3060-YYYY-MM-DD.json
 *
 * Audit matrix gate (Refresh C note):
 *   "no committed receipt JSON — .bench-logs/ holds only small-DOF runs (1035–1359 DOF)"
 *   "Gate: rerun on RTX 6000 Ada (paper-grade rig) still required before .tex cite"
 *   This receipt = dev-grade provenance; documents crossover regime for W.638b.
 *
 * DOF targets:
 *   ~1.4k  (nx=2 ny=2 nz=8)   — well below crossover
 *   ~9k    (nx=4 ny=4 nz=16)  — approaching crossover
 *   ~29k   (nx=6 ny=6 nz=24)  — at/past crossover (W.638b claim)
 *   ~67k   (nx=8 ny=8 nz=32)  — decisively GPU-wins regime
 *
 * Usage:
 *   node scripts/tet10-gpu-crossover-sweep.mjs [--repeats=2] [--skip-large]
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..');

const args = process.argv.slice(2);
const REPEATS    = Number(args.find(a => a.startsWith('--repeats='))?.split('=')[1] ?? 2);
const SKIP_LARGE = args.includes('--skip-large');
const today      = new Date().toISOString().slice(0, 10);

const ENGINE_SIM = join(REPO_ROOT, 'packages', 'engine', 'dist', 'simulation', 'index.js');
if (!existsSync(ENGINE_SIM)) {
  console.error('Engine not built — run pnpm build first');
  process.exit(1);
}

const sim = await import(pathToFileURL(ENGINE_SIM).href);
const { StructuralSolverTET10, tet4ToTet10 } = sim;

// ── Mesh builder (bar: 1×1×5 domain, elongated for cantilever) ──────────────
function buildBarMesh(nx, ny, nz) {
  const lx = 1, ly = 1, lz = 5;
  const pts = [];
  for (let k = 0; k <= nz; k++)
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++)
        pts.push((i * lx) / nx, (j * ly) / ny, (k * lz) / nz);

  const idx = (i, j, k) => k * (nx + 1) * (ny + 1) + j * (nx + 1) + i;
  const tets = [];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = idx(i,   j,   k),   v1 = idx(i+1, j,   k);
        const v2 = idx(i+1, j+1, k),   v3 = idx(i,   j+1, k);
        const v4 = idx(i,   j,   k+1), v5 = idx(i+1, j,   k+1);
        const v6 = idx(i+1, j+1, k+1), v7 = idx(i,   j+1, k+1);
        tets.push(v0,v1,v3,v4, v1,v2,v3,v6, v4,v5,v6,v1, v4,v6,v7,v3, v1,v4,v6,v3);
      }

  const mesh = tet4ToTet10(new Float64Array(pts), new Uint32Array(tets));
  const nc = mesh.vertices.length / 3;
  const fixedNodes = [], tipNodes = [];
  for (let n = 0; n < nc; n++) {
    const z = mesh.vertices[n * 3 + 2];
    if (Math.abs(z) < 1e-8)  fixedNodes.push(n);
    if (Math.abs(z - lz) < 1e-8) tipNodes.push(n);
  }
  const lptn = 100 / Math.max(1, tipNodes.length);
  return {
    vertices:  mesh.vertices,
    tetrahedra: mesh.tetrahedra,
    dofCount:  nc * 3,
    nNodes:    nc,
    nElements: (tets.length / 4) * 5 / 5, // 5 tets per hex
    fixedNodes,
    tipNodes,
    loadPerTipNode: lptn,
  };
}

function makeConfig(mesh, useGPU) {
  return {
    vertices:    mesh.vertices,
    tetrahedra:  mesh.tetrahedra,
    material:    'steel_a36',
    constraints: [{ id: 'fix-z0', type: 'fixed', nodes: mesh.fixedNodes }],
    loads: mesh.tipNodes.map((ni, i) => ({
      id: `tip-${i}`, type: 'point', nodeIndex: ni,
      force: [0, mesh.loadPerTipNode, 0],
    })),
    maxIterations: 2000,
    tolerance: 1e-8,
    useGPU,
  };
}

async function timeSolve(config) {
  const solver = new StructuralSolverTET10(config);
  const t0 = performance.now();
  const result = await solver.solve();
  const elapsedMs = performance.now() - t0;
  const displacements = new Float64Array(solver.getDisplacements());
  solver.dispose();
  return { elapsedMs, converged: result.converged, iterations: result.iterations,
           residual: result.residual, displacements };
}

function maxAbsDiff(a, b) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
}

// ── Sweep targets ─────────────────────────────────────────────────────────────
const SIZES = [
  { label: '~1.4k DOF',  nx: 2, ny: 2, nz:  8 },
  { label: '~9k DOF',    nx: 4, ny: 4, nz: 16 },
  { label: '~29k DOF',   nx: 6, ny: 6, nz: 24 },
  { label: '~67k DOF',   nx: 8, ny: 8, nz: 32 },
];

if (SKIP_LARGE) SIZES.splice(2); // keep first 2 only

console.log(`\nTET10 GPU-CG Crossover Sweep  repeats=${REPEATS}${SKIP_LARGE ? ' (skip-large)' : ''}`);
console.log(`Engine: ${ENGINE_SIM}`);
console.log(`Host: ${os.hostname()}  CPUs: ${os.cpus().length}  RAM: ${(os.totalmem()/1e9).toFixed(1)}GB\n`);

const sweepResults = [];

for (const sz of SIZES) {
  console.log(`── ${sz.label} (nx=${sz.nx} ny=${sz.ny} nz=${sz.nz}) ──`);
  const mesh = buildBarMesh(sz.nx, sz.ny, sz.nz);
  console.log(`   DOF=${mesh.dofCount}  nodes=${mesh.nNodes}  fixed=${mesh.fixedNodes.length}  tip=${mesh.tipNodes.length}`);

  // CPU repeats
  const cpuTimings = [];
  for (let r = 0; r < REPEATS; r++) {
    const t = await timeSolve(makeConfig(mesh, false));
    cpuTimings.push(t);
    process.stdout.write(`   CPU rep${r+1}: ${t.elapsedMs.toFixed(0)}ms  iters=${t.iterations}  converged=${t.converged}\n`);
  }

  // GPU repeats
  const gpuTimings = [];
  for (let r = 0; r < REPEATS; r++) {
    const t = await timeSolve(makeConfig(mesh, true));
    gpuTimings.push(t);
    process.stdout.write(`   GPU rep${r+1}: ${t.elapsedMs.toFixed(0)}ms  iters=${t.iterations}  converged=${t.converged}\n`);
  }

  const cpuMedian = [...cpuTimings.map(t => t.elapsedMs)].sort((a,b)=>a-b)[Math.floor(REPEATS/2)];
  const gpuMedian = [...gpuTimings.map(t => t.elapsedMs)].sort((a,b)=>a-b)[Math.floor(REPEATS/2)];
  const speedup   = +(cpuMedian / gpuMedian).toFixed(3);

  // Correctness diff between last CPU and last GPU run
  const diff = maxAbsDiff(
    cpuTimings[cpuTimings.length - 1].displacements,
    gpuTimings[gpuTimings.length - 1].displacements,
  );

  console.log(`   CPU median ${cpuMedian.toFixed(0)}ms  GPU median ${gpuMedian.toFixed(0)}ms  speedup ${speedup}×  |diff| ${diff.toExponential(2)}\n`);

  sweepResults.push({
    label: sz.label,
    mesh: { nx: sz.nx, ny: sz.ny, nz: sz.nz, dofCount: mesh.dofCount, nNodes: mesh.nNodes },
    repeats: REPEATS,
    cpu: {
      medianMs: +cpuMedian.toFixed(2),
      timings: cpuTimings.map(t => ({
        elapsedMs:  +t.elapsedMs.toFixed(2),
        converged:  t.converged,
        iterations: t.iterations,
        residual:   t.residual,
      })),
    },
    gpu: {
      medianMs: +gpuMedian.toFixed(2),
      timings: gpuTimings.map(t => ({
        elapsedMs:  +t.elapsedMs.toFixed(2),
        converged:  t.converged,
        iterations: t.iterations,
        residual:   t.residual,
      })),
    },
    speedupGpuOverCpu: speedup,
    maxAbsDisplacementDiff: diff,
  });
}

// ── Output receipt ────────────────────────────────────────────────────────────
const receipt = {
  schemaVersion: 'tet10-gpu-crossover-sweep/v1',
  generatedAt: new Date().toISOString(),
  harness: 'scripts/tet10-gpu-crossover-sweep.mjs',
  hardware: {
    hostname: os.hostname(),
    platform: os.platform(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    ramGb: +(os.totalmem() / 1e9).toFixed(1),
    // GPU name comes from adapter info — not available without WebGPU probe here
    gpuNote: 'RTX 3060 Laptop GPU (dev-grade; paper-grade requires RTX 6000 Ada per audit matrix)',
  },
  enginePath: ENGINE_SIM,
  material: 'steel_a36',
  solverSettings: { maxIterations: 2000, tolerance: 1e-8 },
  sweep: sweepResults,
  crossoverObservation: (() => {
    const crossoverIdx = sweepResults.findIndex(r => r.speedupGpuOverCpu >= 1.0);
    if (crossoverIdx < 0) return 'No crossover observed in this sweep range — GPU slower at all measured sizes';
    return `Crossover between ${sweepResults[crossoverIdx - 1]?.label ?? 'below sweep start'} and ${sweepResults[crossoverIdx].label} (speedup crossed 1.0×)`;
  })(),
  auditNote: [
    'Dev-grade receipt (RTX 3060 Laptop). Per paper-audit-matrix.md Refresh C:',
    'No structural-GPU-speedup claim may enter any .tex until RTX 6000 Ada run completes',
    'AND receipt is dual-anchored (OTS + Base). This file closes the "no committed receipt" gap.',
  ].join(' '),
};

mkdirSync(join(REPO_ROOT, '.bench-logs'), { recursive: true });
const outPath = join(REPO_ROOT, '.bench-logs', `tet10-gpu-crossover-rtx3060-${today}.json`);
writeFileSync(outPath, JSON.stringify(receipt, null, 2));
console.log(`Receipt written: ${outPath}`);
console.log('\nCrossover:', receipt.crossoverObservation);
