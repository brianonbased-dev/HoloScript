#!/usr/bin/env ts-node
/**
 * HoloScript GPU / WASM Benchmark Suite
 *
 * Extends benchmark evidence across compilation engines by exercising
 * WebGPUCompiler and WASMCompiler with valid HoloComposition ASTs.
 *
 * Scenarios:
 *   - WebGPU: minimal, gpu-particles, gpu-physics, compute-generic
 *   - WASM:   minimal, with-state
 *
 * Metrics:
 *   - compilationTimeMs
 *   - outputSizeBytes
 *   - validation pass/fail per engine
 *
 * Usage:
 *   ts-node gpu-wasm-benchmark.ts
 *   pnpm bench        (if wired in package.json)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

import { WebGPUCompiler, WASMCompiler, UnityCompiler, BabylonCompiler } from '@holoscript/core';
import type { HoloComposition } from '@holoscript/core';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkScenario {
  id: string;
  engine: 'webgpu' | 'wasm' | 'unity' | 'babylonjs';
  title: string;
  description: string;
  makeComposition: () => HoloComposition;
}

interface BenchmarkResult {
  scenarioId: string;
  engine: string;
  title: string;
  success: boolean;
  compilationTimeMs: number;
  outputSizeBytes: number;
  validation: ValidationResult;
  error?: string;
}

interface ValidationResult {
  passed: boolean;
  checks: Record<string, boolean>;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Scenarios — valid ASTs that exercise GPU / WASM compilers
// ---------------------------------------------------------------------------

function makeMinimalComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'MinimalBenchmark',
    objects: [],
  } as HoloComposition;
}

function makeGPUParticlesComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'GPUParticles',
    objects: [
      {
        name: 'particles',
        properties: [{ key: 'count', value: 1048576 }],
        traits: [{ name: 'gpu_particle', config: { count: 1048576 } }],
      } as any,
    ],
  } as HoloComposition;
}

function makeGPUPhysicsComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'GPUPhysics',
    objects: [
      {
        name: 'bodies',
        properties: [{ key: 'count', value: 10000 }],
        traits: [{ name: 'gpu_physics', config: { count: 10000 } }],
      } as any,
    ],
  } as HoloComposition;
}

function makeComputeGenericComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'ComputeGeneric',
    objects: [
      {
        name: 'sim',
        properties: [],
        traits: [
          {
            name: 'compute',
            config: { shader: 'cs_sim_step', workgroups: [16, 16, 1] },
          },
        ],
      } as any,
    ],
  } as HoloComposition;
}

function makeWASMWithStateComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'WASMWithState',
    state: {
      health: 100,
      score: 0,
      active: true,
      playerName: 'Player1',
    },
    objects: [
      {
        name: 'player',
        properties: [{ key: 'geometry', value: 'box' }],
        traits: [],
      } as any,
    ],
  } as HoloComposition;
}

const SCENARIOS: BenchmarkScenario[] = [
  {
    id: 'webgpu-minimal',
    engine: 'webgpu',
    title: 'WebGPU — Minimal Composition',
    description: 'Empty composition baseline',
    makeComposition: makeMinimalComposition,
  },
  {
    id: 'webgpu-particles',
    engine: 'webgpu',
    title: 'WebGPU — 1M GPU Particles',
    description: 'gpu_particle trait with 1,048,576 particles',
    makeComposition: makeGPUParticlesComposition,
  },
  {
    id: 'webgpu-physics',
    engine: 'webgpu',
    title: 'WebGPU — 10K Rigid Bodies',
    description: 'gpu_physics trait with 10,000 bodies',
    makeComposition: makeGPUPhysicsComposition,
  },
  {
    id: 'webgpu-compute',
    engine: 'webgpu',
    title: 'WebGPU — Generic Compute Shader',
    description: 'compute trait with custom entry point',
    makeComposition: makeComputeGenericComposition,
  },
  {
    id: 'wasm-minimal',
    engine: 'wasm',
    title: 'WASM — Minimal Composition',
    description: 'Empty composition baseline',
    makeComposition: makeMinimalComposition,
  },
  {
    id: 'wasm-state',
    engine: 'wasm',
    title: 'WASM — Composition with State',
    description: 'State variables mapped to linear memory',
    makeComposition: makeWASMWithStateComposition,
  },
  {
    id: 'unity-minimal',
    engine: 'unity',
    title: 'Unity — Minimal Composition',
    description: 'Empty composition baseline for Unity C#',
    makeComposition: makeMinimalComposition,
  },
  {
    id: 'babylonjs-minimal',
    engine: 'babylonjs',
    title: 'Babylon.js — Minimal Composition',
    description: 'Empty composition baseline for Babylon.js TypeScript',
    makeComposition: makeMinimalComposition,
  },
];

// ---------------------------------------------------------------------------
// Benchmark Runner
// ---------------------------------------------------------------------------

const RESULTS_DIR = path.resolve(__dirname, './results');
const BASELINE_PATH = path.resolve(__dirname, '../baseline.json');
const TOKEN = ''; // empty string bypasses RBAC validation in test/dev mode

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  HoloScript GPU / WASM Benchmark Suite                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const results: BenchmarkResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log('━'.repeat(80));
    console.log(`🧪 ${scenario.title}`);
    console.log(`   ${scenario.description}`);
    console.log('━'.repeat(80));

    const result = await runScenario(scenario);
    results.push(result);

    printResult(result);
    console.log('');
  }

  // Save raw results
  const resultsPath = path.join(RESULTS_DIR, 'gpu-wasm-benchmark-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`💾 Raw results saved: ${resultsPath}\n`);

  // Generate report
  await generateReport(results);

  // Update baseline
  updateBaseline(results);

  // Print summary
  printSummary(results);

  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Benchmark suite complete                                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
}

async function runScenario(scenario: BenchmarkScenario): Promise<BenchmarkResult> {
  const composition = scenario.makeComposition();
  const start = performance.now();

  try {
    let output: string | Record<string, unknown> = '';

    if (scenario.engine === 'webgpu') {
      const compiler = new WebGPUCompiler({ enableCompute: true });
      output = compiler.compile(composition, TOKEN);
    } else if (scenario.engine === 'wasm') {
      const compiler = new WASMCompiler();
      const wasmResult = compiler.compile(composition, TOKEN);
      output = (wasmResult as any).wat ?? '';
    } else if (scenario.engine === 'unity') {
      const compiler = new UnityCompiler();
      output = compiler.compile(composition, TOKEN);
    } else if (scenario.engine === 'babylonjs') {
      const compiler = new BabylonCompiler();
      output = compiler.compile(composition, TOKEN);
    }

    const compileTime = performance.now() - start;
    const outputSize =
      typeof output === 'string'
        ? Buffer.byteLength(output, 'utf-8')
        : JSON.stringify(output).length;

    let validation: ValidationResult;
    if (scenario.engine === 'webgpu') {
      validation = validateWebGPUOutput(output as string);
    } else if (scenario.engine === 'wasm') {
      validation = validateWASMOutput(output as string);
    } else if (scenario.engine === 'unity') {
      validation = validateUnityOutput(output as string);
    } else {
      validation = validateBabylonOutput(output as string);
    }

    return {
      scenarioId: scenario.id,
      engine: scenario.engine,
      title: scenario.title,
      success: true,
      compilationTimeMs: compileTime,
      outputSizeBytes: outputSize,
      validation,
    };
  } catch (error: any) {
    return {
      scenarioId: scenario.id,
      engine: scenario.engine,
      title: scenario.title,
      success: false,
      compilationTimeMs: performance.now() - start,
      outputSizeBytes: 0,
      validation: {
        passed: false,
        checks: {},
        errors: [error.message || String(error)],
        warnings: [],
      },
      error: error.message || String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateWebGPUOutput(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasGPU = output.includes('navigator.gpu');
  const hasVertex = output.includes('@vertex');
  const hasFragment = output.includes('@fragment');
  const hasCompute = output.includes('@compute');
  const hasWorkgroup = output.includes('@workgroup_size');
  const hasDevice = output.includes('requestDevice');

  if (!hasGPU) warnings.push('Missing navigator.gpu reference');
  if (!hasDevice) warnings.push('Missing requestDevice call');
  if (!hasVertex && !hasCompute) errors.push('No vertex or compute shaders found');
  if (!hasFragment && !hasCompute) errors.push('No fragment or compute shaders found');
  if (hasCompute && !hasWorkgroup) errors.push('Compute shader missing @workgroup_size');

  const passed = errors.length === 0;

  return {
    passed,
    checks: { hasGPU, hasVertex, hasFragment, hasCompute, hasWorkgroup, hasDevice },
    errors,
    warnings,
  };
}

function validateWASMOutput(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasModule = output.includes('(module');
  const hasMemory = output.includes('(memory');
  const hasExport = output.includes('(export');
  const hasFunc = output.includes('(func');

  if (!hasModule) errors.push('Missing (module) declaration');
  if (!hasMemory) errors.push('Missing (memory) declaration');
  if (!hasExport) warnings.push('No exports found');
  if (!hasFunc) warnings.push('No functions found');

  const passed = errors.length === 0;

  return {
    passed,
    checks: { hasModule, hasMemory, hasExport, hasFunc },
    errors,
    warnings,
  };
}

function validateUnityOutput(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasNamespace = output.includes('using UnityEngine');
  const hasClass = output.includes('class') || output.includes('MonoBehaviour');
  const hasMethod = output.includes('void') || output.includes('Start()');

  if (!hasNamespace) errors.push('Missing UnityEngine namespace');
  if (!hasClass) errors.push('No class declaration found');
  if (!hasMethod) warnings.push('No method declarations found');

  const passed = errors.length === 0;

  return {
    passed,
    checks: { hasNamespace, hasClass, hasMethod },
    errors,
    warnings,
  };
}

function validateBabylonOutput(output: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasBabylon = output.includes('BABYLON.');
  const hasEngine = output.includes('Engine');
  const hasScene = output.includes('Scene') || output.includes('createScene');

  if (!hasBabylon) errors.push('Missing BABYLON namespace reference');
  if (!hasEngine) warnings.push('No Engine instantiation found');
  if (!hasScene) warnings.push('No Scene creation found');

  const passed = errors.length === 0;

  return {
    passed,
    checks: { hasBabylon, hasEngine, hasScene },
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printResult(result: BenchmarkResult): void {
  if (result.success) {
    console.log(`✅ SUCCESS  ${result.compilationTimeMs.toFixed(2)}ms  ${formatBytes(result.outputSizeBytes)}`);
    console.log(`   Validation: ${result.validation.passed ? '✓ PASS' : '⚠ PARTIAL'} (${result.validation.errors.length} errors, ${result.validation.warnings.length} warnings)`);
  } else {
    console.log(`❌ FAILED   ${result.error}`);
  }
}

function printSummary(results: BenchmarkResult[]): void {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log('━'.repeat(80));
  console.log('📊 BENCHMARK SUMMARY');
  console.log('━'.repeat(80));
  console.log(`Total Scenarios:  ${results.length}`);
  console.log(`Successful:       ${successful.length} (${((successful.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Failed:           ${failed.length} (${((failed.length / results.length) * 100).toFixed(1)}%)`);

  if (successful.length > 0) {
    const avgTime = successful.reduce((s, r) => s + r.compilationTimeMs, 0) / successful.length;
    const avgSize = successful.reduce((s, r) => s + r.outputSizeBytes, 0) / successful.length;
    console.log(`Avg Compile Time: ${avgTime.toFixed(2)}ms`);
    console.log(`Avg Output Size:  ${formatBytes(avgSize)}`);
  }

  for (const result of failed) {
    console.log(`   ✗ ${result.scenarioId}: ${result.error}`);
  }
  console.log('');
}

async function generateReport(results: BenchmarkResult[]): Promise<void> {
  const reportPath = path.join(RESULTS_DIR, 'GPU_WASM_BENCHMARK_REPORT.md');
  const lines: string[] = [];

  lines.push('# HoloScript GPU / WASM Benchmark Report\n');
  lines.push(`**Generated:** ${new Date().toISOString()}\n`);
  lines.push(`**HoloScript Version:** v7.0.0\n`);
  lines.push(`**Scenarios:** ${SCENARIOS.length}\n`);
  lines.push(`**Success Rate:** ${((results.filter((r) => r.success).length / results.length) * 100).toFixed(1)}%\n`);
  lines.push('---\n');

  // Engine breakdown
  for (const engine of ['webgpu', 'wasm', 'unity', 'babylonjs'] as const) {
    const engineResults = results.filter((r) => r.engine === engine);
    const engineSuccess = engineResults.filter((r) => r.success);
    const engineLabel = engine.toUpperCase();

    lines.push(`## ${engineLabel} Results\n`);
    lines.push(`**Success:** ${engineSuccess.length}/${engineResults.length}\n`);
    lines.push('| Scenario | Compile (ms) | Size | Validation |');
    lines.push('|----------|-------------|------|------------|');

    for (const r of engineResults) {
      const status = r.success ? '✅' : '❌';
      const time = r.success ? r.compilationTimeMs.toFixed(2) : '-';
      const size = r.success ? formatBytes(r.outputSizeBytes) : '-';
      const val = r.success ? (r.validation.passed ? '✓' : '⚠') : '-';
      lines.push(`| ${r.title} | ${status} ${time} | ${size} | ${val} |`);
    }
    lines.push('');
  }

  lines.push('---\n');
  lines.push('## Validation Criteria\n');
  lines.push('### WebGPU');
  lines.push('- `navigator.gpu` reference present');
  lines.push('- `requestDevice` call present');
  lines.push('- Vertex/fragment or compute shaders emitted');
  lines.push('- Compute shaders include `@workgroup_size`');
  lines.push('');
  lines.push('### WASM');
  lines.push('- `(module)` declaration present');
  lines.push('- `(memory)` declaration present');
  lines.push('- `(export)` present (warning if missing)');
  lines.push('- `(func)` present (warning if missing)');
  lines.push('');
  lines.push('### Unity');
  lines.push('- `using UnityEngine;` namespace present');
  lines.push('- `class` or `MonoBehaviour` declaration present');
  lines.push('- Method declarations present (warning if missing)');
  lines.push('');
  lines.push('### Babylon.js');
  lines.push('- `BABYLON.` namespace reference present');
  lines.push('- `Engine` instantiation present');
  lines.push('- `Scene` creation present (warning if missing)');
  lines.push('');

  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`📊 Report generated: ${reportPath}\n`);
}

// ---------------------------------------------------------------------------
// Baseline Update
// ---------------------------------------------------------------------------

function updateBaseline(results: BenchmarkResult[]): void {
  let baseline: any = { version: 'v1', axes: {}, scenarios: {} };

  if (fs.existsSync(BASELINE_PATH)) {
    try {
      baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
    } catch {
      /* ignore corrupt baseline */
    }
  }

  // Ensure axes exist
  baseline.axes = baseline.axes || {};
  baseline.axes.compileTimeMs = baseline.axes.compileTimeMs || {
    regression_threshold_pct: 5,
    comparator: 'lower-is-better',
  };
  baseline.axes.outputSizeBytes = baseline.axes.outputSizeBytes || {
    regression_threshold_pct: 30,
    comparator: 'lower-is-better',
  };

  baseline.scenarios = baseline.scenarios || {};

  for (const r of results) {
    if (!r.success) continue;
    baseline.scenarios[r.scenarioId] = {
      engine: r.engine,
      title: r.title,
      compileTimeMs: Math.round(r.compilationTimeMs * 100) / 100,
      outputSizeBytes: r.outputSizeBytes,
      validationPassed: r.validation.passed,
      recordedAt: new Date().toISOString(),
    };
  }

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`📈 Baseline updated: ${BASELINE_PATH}\n`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

main().catch((error) => {
  console.error('\n❌ Benchmark suite failed:', error);
  console.error(error.stack);
  process.exit(1);
});
