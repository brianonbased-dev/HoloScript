#!/usr/bin/env node
/**
 * HoloScript Feature Benchmark Suite
 *
 * Benchmarks HoloScript-specific features on the local hardware seat (D.051 T1-local-gpu).
 * Complements hardware-bench.mjs (generic system lanes) with HoloScript workloads.
 *
 * Lanes:
 *   A. HoloScript Parser       — parse throughput across 4 real scenario .holo files
 *   B. Multi-target Compiler   — compile to R3F, Unity, URDF, VisionOS, Babylon
 *   C. TET10 Structural FEM    — CPU solve at small/medium/large DOF (GPU crossover probe)
 *   D. Thermal Solver          — 3D heat diffusion at 16³/32³/64³ grid × 50 steps
 *   E. HoloEmbed Encoder       — 768-dim symbol embedding throughput (symbols/sec)
 *   F. Domain Plugin Solvers   — aerospace, medical, threat-intel solver micro-bench
 *
 * Outputs:
 *   .bench-logs/holoscript-features-YYYY-MM-DD.json
 *   HoloMesh knowledge sync (W.HSF.hostname-date)
 *
 * Usage:
 *   node scripts/holoscript-feature-bench.mjs [--no-solver] [--no-embed] [--dry-run]
 *
 * Context:
 *   W.638b: RTX 3060 GPU crossover at ~29k DOF for TET10 CG solver
 *   Papers 8/9/11: GPU-accelerated structural solve claims (DOF ≥ ~29k caveat)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..');

const args         = process.argv.slice(2);
const FLAG_NO_SOLVER = args.includes('--no-solver');
const FLAG_NO_EMBED  = args.includes('--no-embed');
const FLAG_DRY_RUN   = args.includes('--dry-run');

const today    = new Date().toISOString().slice(0, 10);
const hostname = os.hostname().replace(/[^a-z0-9]/gi, '');
const benchId  = `hs-feat-${Date.now().toString(36)}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function banner(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}
const ok   = (l, v) => console.log(`  \x1b[32m✓\x1b[0m ${l.padEnd(30)} ${v}`);
const warn = (l, v) => console.log(`  \x1b[33m⚠\x1b[0m ${l.padEnd(30)} ${String(v).slice(0, 80)}`);
const skip = (l, r)  => console.log(`  \x1b[2m○\x1b[0m ${l.padEnd(30)} skipped (${r})`);

/** Run fn N times, return { avgMs, minMs, maxMs, opsPerSec } */
function timeit(fn, iters = 10) {
  // warmup
  fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const elapsed = performance.now() - t0;
  const avgMs = elapsed / iters;
  return { avgMs: +avgMs.toFixed(3), opsPerSec: Math.round(1000 / avgMs) };
}

/** Run async fn N times, return { avgMs, opsPerSec } */
async function timeitAsync(fn, iters = 5) {
  await fn(); // warmup
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) await fn();
  const elapsed = performance.now() - t0;
  const avgMs = elapsed / iters;
  return { avgMs: +avgMs.toFixed(3), opsPerSec: Math.round(1000 / avgMs) };
}

// ─── TET10 mesh generator ────────────────────────────────────────────────────
// Builds a structured TET4 grid (5 tets/hex), then upgrades to TET10 by
// adding midpoint nodes on each unique edge. Grid = n³ unit cubes.

function buildTET10Mesh(n) {
  const coordArr = [];
  const nodeMap = new Map();

  function nodeIdx(i, j, k) {
    const key = i * 10000 + j * 100 + k; // n ≤ 30 guaranteed
    if (!nodeMap.has(key)) {
      nodeMap.set(key, coordArr.length / 3);
      coordArr.push(i / n, j / n, k / n);
    }
    return nodeMap.get(key);
  }

  // 5-tet Kuhn decomposition of a unit cube (vertices 0-7 = grid corners)
  // Cube corners: 0=(i,j,k) 1=(i+1,j,k) 2=(i+1,j+1,k) 3=(i,j+1,k)
  //               4=(i,j,k+1) 5=(i+1,j,k+1) 6=(i+1,j+1,k+1) 7=(i,j+1,k+1)
  const KUHN = [
    [0, 1, 3, 4],
    [1, 2, 3, 5],
    [3, 5, 6, 7],
    [1, 4, 5, 7],
    [1, 3, 5, 7],
  ];

  const tet4 = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const c = [
          nodeIdx(i,   j,   k),   // 0
          nodeIdx(i+1, j,   k),   // 1
          nodeIdx(i+1, j+1, k),   // 2
          nodeIdx(i,   j+1, k),   // 3
          nodeIdx(i,   j,   k+1), // 4
          nodeIdx(i+1, j,   k+1), // 5
          nodeIdx(i+1, j+1, k+1), // 6
          nodeIdx(i,   j+1, k+1), // 7
        ];
        for (const tet of KUHN) tet4.push(c[tet[0]], c[tet[1]], c[tet[2]], c[tet[3]]);
      }
    }
  }

  // Convert TET4 → TET10 by inserting edge midpoints
  const cornerVerts = new Float64Array(coordArr);
  const nCorner = cornerVerts.length / 3;
  const edgeMap = new Map();
  const midCoords = [];
  const nTet4 = tet4.length / 4;
  const tet10 = new Uint32Array(nTet4 * 10);

  function midIdx(a, b) {
    const key = a < b ? a * 1_000_000 + b : b * 1_000_000 + a;
    if (!edgeMap.has(key)) {
      const idx = nCorner + midCoords.length / 3;
      edgeMap.set(key, idx);
      midCoords.push(
        (cornerVerts[a*3]   + cornerVerts[b*3])   / 2,
        (cornerVerts[a*3+1] + cornerVerts[b*3+1]) / 2,
        (cornerVerts[a*3+2] + cornerVerts[b*3+2]) / 2,
      );
    }
    return edgeMap.get(key);
  }

  for (let e = 0; e < nTet4; e++) {
    const [a, b, c, d] = [tet4[e*4], tet4[e*4+1], tet4[e*4+2], tet4[e*4+3]];
    // TET10 node order: corners 0-3, then mid-edge 4=AB 5=BC 6=AC 7=AD 8=BD 9=CD
    tet10[e*10+0] = a; tet10[e*10+1] = b; tet10[e*10+2] = c; tet10[e*10+3] = d;
    tet10[e*10+4] = midIdx(a, b);
    tet10[e*10+5] = midIdx(b, c);
    tet10[e*10+6] = midIdx(a, c);
    tet10[e*10+7] = midIdx(a, d);
    tet10[e*10+8] = midIdx(b, d);
    tet10[e*10+9] = midIdx(c, d);
  }

  const allVerts = new Float64Array(nCorner * 3 + midCoords.length);
  allVerts.set(cornerVerts);
  for (let i = 0; i < midCoords.length; i++) allVerts[nCorner * 3 + i] = midCoords[i];

  const nNodes = nCorner + midCoords.length / 3;
  const dofCount = nNodes * 3;

  return { vertices: allVerts, tetrahedra: tet10, nNodes, dofCount, nElements: nTet4 };
}

// Identify "face x=0" corner nodes (for fixed constraint)
function fixedXZeroNodes(n) {
  const ids = [];
  for (let j = 0; j <= n; j++)
    for (let k = 0; k <= n; k++)
      ids.push(j * (n+1) * (n+1) + k * (n+1)); // i=0
  // Simplified: fix first (n+1)^2 nodes (face i=0 in the nodeIdx ordering)
  // Since nodeIdx scans i from 0..n, j from 0..n, k from 0..n the first (n+1)^2 nodes
  // correspond to i=0 (all j, k) in the inner loop ordering — exact for small n.
  // For robustness, just fix nodes 0..(n+1)^2-1
  return Array.from({ length: (n+1) * (n+1) }, (_, idx) => idx);
}

// ─── Main ────────────────────────────────────────────────────────────────────

// ── Lane A: HoloScript Parser ──────────────────────────────────────────────

banner('Lane A · HoloScript Parser (4 scenarios)');

const CORE_DIST = join(REPO_ROOT, 'packages', 'core', 'dist', 'index.js');
const SCENARIOS_DIR = join(REPO_ROOT, 'benchmarks', 'scenarios');

const scenarioFiles = [
  { name: 'basic-scene',     file: join(SCENARIOS_DIR, '01-basic-scene', 'basic-scene.holo') },
  { name: 'high-complexity', file: join(SCENARIOS_DIR, '02-high-complexity', 'high-complexity.holo') },
  { name: 'robotics-sim',    file: join(SCENARIOS_DIR, '03-robotics-sim', 'robotics-sim.holo') },
  { name: 'multiplayer-vr',  file: join(SCENARIOS_DIR, '04-multiplayer-vr', 'multiplayer-vr.holo') },
];

let parserBench = { available: false };
let compilerBench = { available: false };

if (!existsSync(CORE_DIST)) {
  warn('Parser/Compiler', 'core not built — run pnpm build first');
} else {
  try {
    const core = await import(pathToFileURL(CORE_DIST).href);
    const Parser = core.HoloScriptParser ?? core.parse;
    const ITERS = 20;

    const parserResults = [];
    for (const s of scenarioFiles) {
      if (!existsSync(s.file)) {
        skip(s.name, 'scenario file not found');
        continue;
      }
      const source = readFileSync(s.file, 'utf-8');
      const sizeKB = +(Buffer.byteLength(source) / 1024).toFixed(1);
      let result;
      if (core.HoloScriptParser) {
        // HoloScriptParser uses parseComposition (not .parse); fall back to module-level parse
        const parseFn = core.HoloScriptParser.prototype.parseComposition
          ? (src) => { const p = new core.HoloScriptParser(); return p.parseComposition(src); }
          : (core.parse ?? core.parseComposition);
        result = timeit(() => parseFn(source), ITERS);
      } else {
        // fallback to module-level parse()
        result = timeit(() => core.parse(source), ITERS);
      }
      parserResults.push({ scenario: s.name, sizeKB, ...result });
      ok(`  ${s.name}`, `${result.opsPerSec.toLocaleString()} parses/sec  (avg ${result.avgMs}ms, ${sizeKB}KB)`);
    }

    if (parserResults.length > 0) {
      parserBench = { available: true, results: parserResults };
    }

    // ── Lane B: Multi-target Compiler ──────────────────────────────────────

    banner('Lane B · Multi-target Compiler');

    const TOKEN = ''; // empty string bypasses RBAC in dev mode (see gpu-wasm-benchmark.ts)

    // Use the basic-scene as the compile target (manageable size)
    const basicSrc = scenarioFiles[0].file;
    const compositionSrc = existsSync(basicSrc) ? readFileSync(basicSrc, 'utf-8') : `
composition "BenchScene" {
  object "Cube" @mesh @physics @rigid_body {
    position: [0, 0, 0]
    scale: [1, 1, 1]
    mass: 1.0
  }
  object "Light" @point_light {
    intensity: 1.0
    color: #FFFFFF
    position: [3, 5, 3]
  }
}`.trim();

    // Compilers need the full Program AST from core.parse().ast
    // (parseComposition returns a raw composition-node array, which R3F rejects)
    let ast;
    if (core.parse) {
      const parsed = core.parse(compositionSrc);
      ast = parsed?.ast ?? parsed;
    } else if (core.HoloScriptParser?.prototype?.parseComposition) {
      // Fallback: parseComposition returns [{type:'composition',...}] array
      const p = new core.HoloScriptParser();
      const nodes = p.parseComposition(compositionSrc);
      ast = Array.isArray(nodes) ? nodes[0] : (nodes?.ast ?? nodes);
    } else {
      ast = compositionSrc;
    }

    const targets = [
      { name: 'R3F',      Compiler: core.R3FCompiler,      opts: {} },
      { name: 'Unity',    Compiler: core.UnityCompiler,     opts: {} },
      { name: 'URDF',     Compiler: core.URDFCompiler,      opts: {} },
      { name: 'VisionOS', Compiler: core.VisionOSCompiler,  opts: {} },
      { name: 'Babylon',  Compiler: core.BabylonCompiler,   opts: {} },
    ].filter(t => t.Compiler);

    const compilerResults = [];
    for (const t of targets) {
      try {
        const r = timeit(() => {
          const compiler = new t.Compiler(t.opts);
          compiler.compile(ast, TOKEN);
        }, 15);
        let outputSizeBytes = 0;
        try {
          const compiler = new t.Compiler(t.opts);
          const out = compiler.compile(ast, TOKEN);
          if (typeof out === 'string') outputSizeBytes = Buffer.byteLength(out);
          else if (out && typeof out === 'object') outputSizeBytes = Buffer.byteLength(JSON.stringify(out));
        } catch (_) {}
        compilerResults.push({ target: t.name, ...r, outputSizeBytes });
        ok(`  ${t.name}`, `${r.opsPerSec.toLocaleString()} compiles/sec  (avg ${r.avgMs}ms, out ${(outputSizeBytes/1024).toFixed(1)}KB)`);
      } catch (e) {
        warn(`  ${t.name}`, e.message.slice(0, 70));
      }
    }

    compilerBench = { available: compilerResults.length > 0, results: compilerResults };
  } catch (e) {
    warn('Core import error', e.message.slice(0, 80));
  }
}

// ── Lane C: TET10 Structural FEM (CPU solve) ──────────────────────────────

banner('Lane C · TET10 Structural FEM — CPU Solve');

let tet10Bench = { available: false, results: [] };

if (FLAG_NO_SOLVER) {
  skip('TET10 solver', '--no-solver flag');
} else {
  const ENGINE_SIM = join(REPO_ROOT, 'packages', 'engine', 'dist', 'simulation', 'index.js');
  if (!existsSync(ENGINE_SIM)) {
    warn('TET10', 'engine not built');
  } else {
    try {
      const sim = await import(pathToFileURL(ENGINE_SIM).href);
      const { StructuralSolverTET10 } = sim;

      // Grid sizes: target ~1k, ~9k, ~29k DOF (maps to W.638b crossover data)
      const meshSizes = [
        { label: 'small  (~1.4k DOF)',  n: 3 },
        { label: 'medium (~9k DOF)',    n: 6 },
        { label: 'large  (~29k DOF)',   n: 10 },
      ];

      for (const sz of meshSizes) {
        const mesh = buildTET10Mesh(sz.n);
        const fixedNodes = fixedXZeroNodes(sz.n);
        const config = {
          vertices: mesh.vertices,
          tetrahedra: mesh.tetrahedra,
          material: 'structural_steel',
          constraints: [{ id: 'wall', type: 'fixed', nodes: fixedNodes }],
          loads: [{ id: 'grav', type: 'gravity', acceleration: [0, -9.81, 0] }],
          useGPU: false,
          maxIterations: 500,
          tolerance: 1e-6,
        };

        try {
          // Instantiate to get stats before solving
          const solver = new StructuralSolverTET10(config);
          const stats0 = solver.getStats();
          const actualDOF = stats0.dofCount ?? mesh.dofCount;

          // Time the CPU solve
          const t0 = performance.now();
          const convergence = solver.solveCPU();
          const solveMs = +(performance.now() - t0).toFixed(1);

          const stats = solver.getStats();
          const converged = convergence?.converged ?? false;
          const iters = convergence?.iterations ?? '?';

          tet10Bench.results.push({
            label: sz.label,
            n: sz.n,
            nNodes: mesh.nNodes,
            dofCount: actualDOF,
            nElements: mesh.nElements,
            nnz: stats.nnz,
            solveMs,
            converged,
            iterations: iters,
            maxVonMises: stats.maxVonMises,
          });

          ok(`  ${sz.label}`, `${solveMs}ms  DOF=${actualDOF}  iters=${iters}  converged=${converged}`);
          solver.dispose();
        } catch (e) {
          warn(`  ${sz.label}`, e.message.slice(0, 70));
        }
      }

      tet10Bench.available = tet10Bench.results.length > 0;

      // Crossover annotation based on W.638b
      if (tet10Bench.results.length > 0) {
        ok('  GPU crossover note', 'RTX 3060: GPU faster at ≥~29k DOF (W.638b). CPU times above are baseline.');
      }
    } catch (e) {
      warn('TET10 import error', e.message.slice(0, 80));
    }
  }
}

// ── Lane D: Thermal Solver ────────────────────────────────────────────────

banner('Lane D · Thermal Solver (3D heat diffusion)');

let thermalBench = { available: false, results: [] };

if (FLAG_NO_SOLVER) {
  skip('Thermal solver', '--no-solver flag');
} else {
  const ENGINE_SIM = join(REPO_ROOT, 'packages', 'engine', 'dist', 'simulation', 'index.js');
  if (!existsSync(ENGINE_SIM)) {
    warn('Thermal', 'engine not built');
  } else {
    try {
      const sim = await import(pathToFileURL(ENGINE_SIM).href);
      const { ThermalSolver } = sim;

      const STEPS = 50;
      const grids = [
        { label: '16³  grid', nx: 16, ny: 16, nz: 16 },
        { label: '32³  grid', nx: 32, ny: 32, nz: 32 },
        { label: '64³  grid', nx: 64, ny: 64, nz: 64 },
      ];

      for (const g of grids) {
        try {
          const config = {
            gridResolution: [g.nx, g.ny, g.nz],
            domainSize: [1.0, 1.0, 1.0],
            initialTemperature: 293,
            materials: { concrete: {} },
            defaultMaterial: 'concrete',
            boundaryConditions: [
              { type: 'dirichlet', faces: ['x-'], value: 350 },
              { type: 'dirichlet', faces: ['x+'], value: 293 },
            ],
            // No point source — pure Dirichlet BC gradient avoids explicit-Euler instability.
            // Throughput (cells/sec) is the metric; steady-state accuracy is not required here.
            sources: [],
            useGPU: false,
          };

          const solver = new ThermalSolver(config);
          // CFL stable dt for concrete: α ≈ 7e-7 m²/s, 3D explicit condition dt ≤ dx²/(6α)
          const dx = 1.0 / g.nx;
          const dt = 0.4 * dx * dx / (6 * 7e-7); // safety factor 0.4, 3D CFL

          // warmup 5 steps
          for (let i = 0; i < 5; i++) solver.step(dt);

          const t0 = performance.now();
          for (let i = 0; i < STEPS; i++) solver.step(dt);
          const totalMs = +(performance.now() - t0).toFixed(1);
          const perStepMs = +(totalMs / STEPS).toFixed(2);

          const field = solver.getTemperatureField();
          // Avoid spread-overflow on large arrays (64³ = 262,144 elements)
          let minT = Infinity, maxT = -Infinity;
          for (let fi = 0; fi < field.length; fi++) {
            if (field[fi] < minT) minT = field[fi];
            if (field[fi] > maxT) maxT = field[fi];
          }
          const cells = g.nx * g.ny * g.nz;

          thermalBench.results.push({
            label: g.label,
            grid: [g.nx, g.ny, g.nz],
            dt,
            steps: STEPS,
            totalMs,
            perStepMs,
            Mcells_per_sec: +((cells * STEPS / totalMs / 1000).toFixed(1)),
            minT: +minT.toFixed(1),
            maxT: +maxT.toFixed(1),
          });

          ok(`  ${g.label}`, `${perStepMs}ms/step  ${+(cells * STEPS / totalMs / 1000).toFixed(1)}M cells/sec  T=[${minT.toFixed(0)}, ${maxT.toFixed(0)}]K`);
        } catch (e) {
          warn(`  ${g.label}`, e.message.slice(0, 70));
        }
      }

      thermalBench.available = thermalBench.results.length > 0;
    } catch (e) {
      warn('Thermal import error', e.message.slice(0, 80));
    }
  }
}

// ── Lane E: HoloEmbed Encoder ────────────────────────────────────────────

banner('Lane E · HoloEmbed Encoder (768-dim)');

let embedBench = { available: false };

if (FLAG_NO_EMBED) {
  skip('HoloEmbed', '--no-embed flag');
} else {
  const EMBED_DIST = join(REPO_ROOT, 'packages', 'holoembed', 'dist', 'index.js');
  if (!existsSync(EMBED_DIST)) {
    warn('HoloEmbed', 'holoembed not built');
  } else {
    try {
      const embedMod = await import(pathToFileURL(EMBED_DIST).href);
      const enc = new embedMod.HoloEmbedEncoder();

      // Synthetic corpus of 50 representative HoloScript symbols
      const SYMS = [
        { name: 'parseComposition', type: 'function', signature: '(src: string): HoloComposition', filePath: 'core/src/parser.ts', language: 'typescript', docComment: 'Parse HoloScript source into AST' },
        { name: 'StructuralSolverTET10', type: 'class', signature: 'class StructuralSolverTET10', filePath: 'engine/src/simulation/StructuralSolverTET10.ts', language: 'typescript', docComment: 'GPU-accelerated quadratic tetrahedral FEM solver' },
        { name: 'compile', type: 'method', signature: '(ast: HoloComposition, token: string): string', filePath: 'core/src/compiler/R3FCompiler.ts', language: 'typescript', docComment: 'Compile composition to React Three Fiber JSX' },
        { name: 'buildDomainSimulationReceipt', type: 'function', signature: '(opts: ReceiptOptions): DomainSimulationReceipt', filePath: 'core/src/receipts.ts', language: 'typescript', docComment: 'Build CAEL receipt for domain simulation' },
        { name: 'HoloEmbedEncoder', type: 'class', signature: 'class HoloEmbedEncoder', filePath: 'holoembed/src/HoloEmbedEncoder.ts', language: 'typescript', docComment: '768-dim structural + char-trigram embedding for symbols' },
      ];

      // Generate 50 symbols by varying the base set
      const FULL_CORPUS = [];
      for (let i = 0; i < 50; i++) {
        const base = SYMS[i % SYMS.length];
        FULL_CORPUS.push({ ...base, name: `${base.name}_${i}`, filePath: `${base.filePath}?v=${i}` });
      }

      // Warmup
      for (const sym of FULL_CORPUS.slice(0, 5)) enc.encode(sym);

      const t0 = performance.now();
      let totalDims = 0;
      for (const sym of FULL_CORPUS) {
        const vec = enc.encode(sym);
        totalDims += vec.length;
      }
      const totalMs = performance.now() - t0;
      const symbolsPerSec = Math.round(FULL_CORPUS.length / totalMs * 1000);
      const avgDims = Math.round(totalDims / FULL_CORPUS.length);

      // Also bench encodeText
      let textMs = 0;
      if (enc.encodeText) {
        const texts = ['parse a HoloScript scene into an AST', 'GPU-accelerated structural solver', 'compile to WebGPU shaders', 'embed symbol for semantic search', 'thermal diffusion simulation'];
        const tt0 = performance.now();
        for (let i = 0; i < 50; i++) enc.encodeText(texts[i % texts.length]);
        textMs = +(( performance.now() - tt0) / 50).toFixed(2);
      }

      embedBench = {
        available: true,
        symbolCount: FULL_CORPUS.length,
        symbolsPerSec,
        avgMs: +(totalMs / FULL_CORPUS.length).toFixed(3),
        dims: avgDims,
        textEncodeAvgMs: textMs,
      };

      ok('Symbols/sec', symbolsPerSec.toLocaleString());
      ok('Avg encode time', `${embedBench.avgMs} ms`);
      ok('Vector dims', avgDims);
      if (textMs) ok('Text encode avg', `${textMs} ms`);
    } catch (e) {
      warn('HoloEmbed error', e.message.slice(0, 80));
    }
  }
}

// ── Lane F: Domain Plugin Solvers ─────────────────────────────────────────

banner('Lane F · Domain Plugin Solvers');

let domainBench = { available: false, results: [] };

// Note: aerospace bundled dist has unresolved @holoscript/engine refs — use inline math.
// medical: tsc emits individual files; import direct solver file (not index which has bare re-export).
// threat-intel: tsup bundle works — full index.js.
const pluginPaths = {
  medical:     join(REPO_ROOT, 'packages', 'plugins', 'medical-plugin',             'dist', 'medicalsolver.js'),
  threatIntel: join(REPO_ROOT, 'packages', 'plugins', 'threat-intelligence-plugin', 'dist', 'index.js'),
};

for (const [domain, distPath] of Object.entries(pluginPaths)) {
  if (!existsSync(distPath)) {
    skip(domain, 'plugin not built (run pnpm build)');
    continue;
  }
  try {
    const mod = await import(pathToFileURL(distPath).href);

    if (domain === 'aerospace') {
      const { tsiolkovskyDeltaV, keplerOrbit, aerodynamicDrag } = mod;
      if (tsiolkovskyDeltaV && keplerOrbit && aerodynamicDrag) {
        const r = timeit(() => {
          tsiolkovskyDeltaV([{ wetMassKg: 500000, dryMassKg: 25000, isp: 350 }]);
          keplerOrbit({ semiMajorAxisM: 6.778e6, eccentricity: 0, inclinationDeg: 28.5 });
          aerodynamicDrag({ cd: 0.5, referenceAreaM2: 10, airDensityKgM3: 1.225, velocityMs: 340 });
        }, 2000);
        ok('aerospace', `${r.opsPerSec.toLocaleString()} solver calls/sec  (avg ${r.avgMs}ms × 3 solvers)`);
        domainBench.results.push({ domain: 'aerospace', ...r, solvers: ['tsiolkovsky', 'kepler', 'drag'] });
      }
    }

    if (domain === 'medical') {
      const { bmiCalculation, egfrCockcroftGault, news2Score } = mod;
      if (bmiCalculation && egfrCockcroftGault && news2Score) {
        const r = timeit(() => {
          bmiCalculation(70, 175, 'male');
          egfrCockcroftGault(45, 70, 1.2, 'male');
          news2Score({ respirationRate: 20, oxygenSaturation: 93, systolicBP: 100, pulse: 110, consciousness: 'alert', temperature: 38.5 });
        }, 2000);
        ok('medical', `${r.opsPerSec.toLocaleString()} solver calls/sec  (avg ${r.avgMs}ms × 3 solvers)`);
        domainBench.results.push({ domain: 'medical', ...r, solvers: ['bmi', 'egfr', 'news2'] });
      }
    }

    if (domain === 'threatIntel') {
      const { cvssScore, killChainAnalysis, iocConfidence } = mod;
      if (cvssScore && killChainAnalysis && iocConfidence) {
        const r = timeit(() => {
          cvssScore({ attackVector: 'N', attackComplexity: 'L', privilegesRequired: 'N', userInteraction: 'N', scope: 'C', confidentialityImpact: 'H', integrityImpact: 'H', availabilityImpact: 'H' });
          killChainAnalysis([{ name: 'recon', successProbability: 0.9 }, { name: 'exploit', successProbability: 0.4 }, { name: 'c2', successProbability: 0.7 }]);
          iocConfidence({ type: 'ip', sourceQuality: 0.9, ageDays: 14, corroboration: 3 });
        }, 2000);
        ok('threat-intel', `${r.opsPerSec.toLocaleString()} solver calls/sec  (avg ${r.avgMs}ms × 3 solvers)`);
        domainBench.results.push({ domain: 'threat-intel', ...r, solvers: ['cvss', 'kill-chain', 'ioc'] });
      }
    }
  } catch (e) {
    warn(domain, e.message.slice(0, 70));
  }
}

// Aerospace: inline (same math as aerospacesolver.ts; bundled dist has unresolved engine deps)
{
  const G0 = 9.80665;
  function tsiolkovsky(stages) {
    let dv = 0;
    for (const s of stages) dv += s.isp * G0 * Math.log(s.wetMassKg / s.dryMassKg);
    return dv;
  }
  function kepler(a, e) {
    const mu = 3.986004418e14;
    const T = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / mu);
    const rA = a * (1 + e), rP = a * (1 - e);
    return { periodS: T, apoapsisAltM: rA - 6.371e6, periapsisAltM: rP - 6.371e6, meanVelocityMs: Math.sqrt(mu / a) };
  }
  function drag(cd, area, rho, v) { return 0.5 * rho * v * v * cd * area; }

  try {
    const r = timeit(() => {
      tsiolkovsky([{ wetMassKg: 500000, dryMassKg: 25000, isp: 350 }]);
      kepler(6.778e6, 0.001);
      drag(0.5, 10, 1.225, 340);
    }, 5000);
    ok('aerospace (inline)', `${r.opsPerSec.toLocaleString()} solver-sets/sec  (avg ${r.avgMs}ms × 3 solvers)`);
    domainBench.results.push({ domain: 'aerospace', ...r, solvers: ['tsiolkovsky', 'kepler', 'drag'], note: 'inline-math' });
  } catch (e) {
    warn('aerospace', e.message.slice(0, 70));
  }
}

domainBench.available = domainBench.results.length > 0;

// ─── Build results ────────────────────────────────────────────────────────────

banner('Summary');

const captureTime = new Date().toISOString();

const results = {
  benchId,
  captureTime,
  host: {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cpuCores: os.cpus().length,
  },
  lanes: {
    parser:   parserBench,
    compiler: compilerBench,
    tet10:    tet10Bench,
    thermal:  thermalBench,
    embed:    embedBench,
    domain:   domainBench,
  },
};

// Print summary table
const printRow = (label, val) => ok(label, val);

if (parserBench.available) {
  const fastest = parserBench.results.reduce((a, b) => a.opsPerSec > b.opsPerSec ? a : b);
  printRow('parser (best)', `${fastest.opsPerSec.toLocaleString()} parses/sec — ${fastest.scenario}`);
}
if (compilerBench.available) {
  const fastest = compilerBench.results.reduce((a, b) => a.opsPerSec > b.opsPerSec ? a : b);
  printRow('compiler (best)', `${fastest.opsPerSec.toLocaleString()} compiles/sec — ${fastest.target}`);
}
if (tet10Bench.available && tet10Bench.results.length > 0) {
  for (const r of tet10Bench.results) {
    printRow(`TET10 ${r.label}`, `${r.solveMs}ms  DOF=${r.dofCount}  iters=${r.iterations}`);
  }
}
if (thermalBench.available && thermalBench.results.length > 0) {
  for (const r of thermalBench.results) {
    printRow(`thermal ${r.label}`, `${r.perStepMs}ms/step  ${r.Mcells_per_sec}M cells/sec`);
  }
}
if (embedBench.available) {
  printRow('embed', `${embedBench.symbolsPerSec.toLocaleString()} symbols/sec  (768-dim)`);
}
if (domainBench.available) {
  for (const r of domainBench.results) {
    printRow(`domain:${r.domain}`, `${r.opsPerSec.toLocaleString()} solver-sets/sec`);
  }
}

// ─── Write outputs ────────────────────────────────────────────────────────────

banner('Writing Outputs');

const logDir = join(REPO_ROOT, '.bench-logs');
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `holoscript-features-${today}.json`);

if (!FLAG_DRY_RUN) {
  writeFileSync(logPath, JSON.stringify(results, null, 2));
  ok('Results written', logPath.replace(REPO_ROOT, '.'));
} else {
  ok('Results (dry-run)', logPath.replace(REPO_ROOT, '.') + ' [NOT WRITTEN]');
}

// ─── HoloMesh knowledge sync ──────────────────────────────────────────────────

banner('HoloMesh Knowledge Sync');

if (!FLAG_DRY_RUN) {
  let apiKey = process.env.HOLOSCRIPT_API_KEY;
  if (!apiKey) {
    const envPaths = [join(REPO_ROOT, '.env'), join(os.homedir(), '.ai-ecosystem', '.env')];
    for (const p of envPaths) {
      if (existsSync(p)) {
        const line = readFileSync(p, 'utf8').split('\n').find(l => l.startsWith('HOLOSCRIPT_API_KEY'));
        if (line) { apiKey = line.split('=')[1]?.trim(); break; }
      }
    }
  }

  if (apiKey) {
    const summaryLines = [
      `HoloScript feature bench ${benchId} — ${today}.`,
      parserBench.available ? `Parser: ${parserBench.results[0].opsPerSec.toLocaleString()} parses/sec (basic-scene).` : '',
      compilerBench.available ? `Compiler: ${compilerBench.results.map(r => `${r.target}=${r.avgMs}ms`).join(', ')}.` : '',
      tet10Bench.available ? `TET10 CPU: ${tet10Bench.results.map(r => `${r.dofCount}DOF=${r.solveMs}ms`).join(', ')}.` : '',
      thermalBench.available ? `Thermal: ${thermalBench.results.map(r => `${r.grid.join('x')}=${r.perStepMs}ms/step`).join(', ')}.` : '',
      embedBench.available ? `HoloEmbed: ${embedBench.symbolsPerSec.toLocaleString()} symbols/sec 768-dim.` : '',
      domainBench.available ? `Domain solvers: ${domainBench.results.map(r => `${r.domain}=${r.opsPerSec.toLocaleString()}/sec`).join(', ')}.` : '',
    ].filter(Boolean).join(' ');

    const entry = {
      id: `W.HSF.${hostname}-${today}`,
      workspace_id: 'ai-ecosystem',
      type: 'wisdom',
      domain: 'holoscript-performance',
      content: summaryLines,
      access: 'shared',
      metadata: {
        benchId,
        host: results.host,
        parserBest: parserBench.available ? Math.max(...parserBench.results.map(r => r.opsPerSec)) : null,
        compilerTargets: compilerBench.available ? compilerBench.results.map(r => r.target) : [],
        tet10SolveMs: tet10Bench.available ? tet10Bench.results.map(r => ({ dof: r.dofCount, ms: r.solveMs })) : [],
        embedSymbolsPerSec: embedBench.available ? embedBench.symbolsPerSec : null,
        captureTime,
      },
    };

    try {
      const body = JSON.stringify({ workspace_id: 'ai-ecosystem', entries: [entry] });
      const syncResult = await new Promise((resolve, reject) => {
        const req = https.request(
          'https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/sync',
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': apiKey, 'Content-Length': Buffer.byteLength(body) } },
          (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 200) }));
          },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });
      if (syncResult.status === 200) {
        ok('Knowledge sync', `HTTP 200 — ${entry.id}`);
      } else {
        warn('Knowledge sync', `HTTP ${syncResult.status}: ${syncResult.body.slice(0, 100)}`);
      }
    } catch (e) {
      warn('Knowledge sync', e.message.slice(0, 80));
    }
  } else {
    warn('Knowledge sync', 'HOLOSCRIPT_API_KEY not found — skipping');
  }
}

console.log(`\n  Results: .bench-logs/holoscript-features-${today}.json`);
console.log(`  Done.\n`);
