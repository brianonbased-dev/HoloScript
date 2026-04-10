/**
 * Scenario-Based Benchmark Suite
 *
 * Parses and compiles 4 real-world .holo scenarios to measure
 * end-to-end pipeline performance (parse → AST → compile → output).
 *
 * Scenarios:
 *   01-basic-scene     — Low complexity (core overhead validation)
 *   02-high-complexity  — 10K objects, particles, networking stress
 *   03-robotics-sim     — 6-DOF robot arm, nested joints, URDF pipeline
 *   04-multiplayer-vr   — Networked avatars, spatial audio, interactables
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Bench } from 'tinybench';
import { HoloScriptParser, type HoloComposition } from '@holoscript/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load scenario .holo files ──────────────────────────────────────
const scenariosDir = resolve(__dirname, '.');
const scenarios = [
  { name: '01-basic-scene', file: '01-basic-scene/basic-scene.holo' },
  { name: '02-high-complexity', file: '02-high-complexity/high-complexity.holo' },
  { name: '03-robotics-sim', file: '03-robotics-sim/robotics-sim.holo' },
  { name: '04-multiplayer-vr', file: '04-multiplayer-vr/multiplayer-vr.holo' },
];

const sources = scenarios.map((s) => ({
  ...s,
  source: readFileSync(resolve(scenariosDir, s.file), 'utf-8'),
}));

// ── Parse benchmarks ───────────────────────────────────────────────
const parseBench = new Bench({ time: 2000 });

for (const { name, source } of sources) {
  parseBench.add(`Parse: ${name}`, () => {
    const parser = new HoloScriptParser();
    parser.parse(source);
  });
}

// ── Parse + AST metrics ────────────────────────────────────────────
const astBench = new Bench({ time: 2000 });

for (const { name, source } of sources) {
  astBench.add(`AST node count: ${name}`, () => {
    const parser = new HoloScriptParser();
    const result = parser.parse(source);
    const ast = result.ast as HoloComposition;
    // Walk AST to count nodes (measures allocator pressure)
    let nodeCount = 0;
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      nodeCount++;
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else {
        Object.values(node as Record<string, unknown>).forEach(walk);
      }
    };
    walk(ast);
  });
}

// ── Memory pressure benchmark ──────────────────────────────────────
const memBench = new Bench({ time: 2000 });

memBench.add('Parse all 4 scenarios sequentially', () => {
  const parser = new HoloScriptParser();
  for (const { source } of sources) {
    parser.parse(source);
  }
});

memBench.add('Parse all 4 scenarios (fresh parser each)', () => {
  for (const { source } of sources) {
    const parser = new HoloScriptParser();
    parser.parse(source);
  }
});

// ── Run all benchmarks ─────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  HoloScript Scenario Benchmark Suite');
  console.log('═══════════════════════════════════════════════════\n');

  // Report source sizes
  console.log('Scenario sizes:');
  for (const { name, source } of sources) {
    const lines = source.split('\n').length;
    const bytes = Buffer.byteLength(source, 'utf-8');
    console.log(`  ${name}: ${lines} lines, ${bytes} bytes`);
  }
  console.log('');

  console.log('── Parse Performance ──────────────────────────────');
  await parseBench.run();
  console.table(parseBench.table());

  console.log('\n── AST Traversal Performance ──────────────────────');
  await astBench.run();
  console.table(astBench.table());

  console.log('\n── Memory Pressure ───────────────────────────────');
  await memBench.run();
  console.table(memBench.table());

  // Summary table
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════');
  const parseResults = parseBench.tasks.map((t) => ({
    scenario: t.name.replace('Parse: ', ''),
    'ops/sec': Math.round(t.result!.hz),
    'avg ms': (t.result!.mean * 1000).toFixed(3),
    'p99 ms': (t.result!.p99 * 1000).toFixed(3),
  }));
  console.table(parseResults);

  // Validate against targets from PERFORMANCE.md
  console.log('\n── Target Validation ──────────────────────────────');
  for (const task of parseBench.tasks) {
    const avgMs = task.result!.mean * 1000;
    const name = task.name.replace('Parse: ', '');
    const isBasic = name.includes('basic');
    const target = isBasic ? 5 : 50; // <5ms for <100 lines, <50ms for 1000+
    const pass = avgMs < target;
    console.log(`  ${pass ? '✅' : '❌'} ${name}: ${avgMs.toFixed(2)}ms (target: <${target}ms)`);
  }
}

main().catch(console.error);
