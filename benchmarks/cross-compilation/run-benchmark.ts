#!/usr/bin/env ts-node
/**
 * HoloScript Cross-Compilation Benchmark Suite
 *
 * Compiles 15 representative vertical compositions to all applicable targets
 * and measures:
 * - Output file size
 * - Compilation time
 * - Feature parity score (% of traits/features successfully compiled)
 * - Runtime performance metrics (where applicable)
 *
 * Usage:
 *   ts-node run-benchmark.ts
 *   ts-node run-benchmark.ts --vertical healthcare
 *   ts-node run-benchmark.ts --target unity
 */

import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import {
  HoloScriptPlusParser,
  UnityCompiler,
  UnrealCompiler,
  GodotCompiler,
  VRChatCompiler,
  OpenXRCompiler,
  VisionOSCompiler,
  ARCompiler,
  AndroidXRCompiler,
  AndroidCompiler,
  IOSCompiler,
  BabylonCompiler,
  WebGPUCompiler,
  R3FCompiler,
  PlayCanvasCompiler,
  WASMCompiler,
  URDFCompiler,
  SDFCompiler,
  DTDLCompiler,
  calculateAverage,
} from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  vertical: string;
  composition: string;
  target: string;
  success: boolean;
  compilationTimeMs: number;
  outputSizeBytes: number;
  featureParity: FeatureParityScore;
  error?: string;
}

interface FeatureParityScore {
  totalFeatures: number;
  supportedFeatures: number;
  percentage: number;
  missingFeatures: string[];
}

interface TargetMapping {
  [vertical: string]: {
    targets: string[];
    reasoning: string;
  };
}

interface CompilerRegistry {
  [target: string]: any;
}

// ─── Configuration ────────────────────────────────────────────────────────

const BENCHMARK_DIR = __dirname;
const COMPOSITIONS_DIR = path.join(BENCHMARK_DIR, 'compositions');
const RESULTS_DIR = path.join(BENCHMARK_DIR, 'results');
const TARGET_MAPPING_PATH = path.join(BENCHMARK_DIR, 'target-mapping.json');
const MOCK_AGENT_TOKEN = 'test-benchmark-token';

// ─── Compiler Registry ────────────────────────────────────────────────────

const COMPILERS: CompilerRegistry = {
  unity: UnityCompiler,
  unreal: UnrealCompiler,
  godot: GodotCompiler,
  vrchat: VRChatCompiler,
  openxr: OpenXRCompiler,
  visionos: VisionOSCompiler,
  ar: ARCompiler,
  androidxr: AndroidXRCompiler,
  android: AndroidCompiler,
  ios: IOSCompiler,
  babylonjs: BabylonCompiler,
  webgpu: WebGPUCompiler,
  r3f: R3FCompiler,
  playcanvas: PlayCanvasCompiler,
  wasm: WASMCompiler,
  urdf: URDFCompiler,
  sdf: SDFCompiler,
  dtdl: DTDLCompiler,
  webxr: R3FCompiler, // Use R3F as WebXR implementation
  aframe: BabylonCompiler, // Use Babylon as A-Frame fallback
};

// ─── Main Benchmark Runner ───────────────────────────────────────────────

async function main() {
  console.log('🚀 HoloScript Cross-Compilation Benchmark Suite\n');
  console.log('═'.repeat(80));

  // Create results directory
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  // Load target mapping
  const targetMapping: TargetMapping = JSON.parse(fs.readFileSync(TARGET_MAPPING_PATH, 'utf-8'));

  // Get all composition files
  const compositionFiles = fs
    .readdirSync(COMPOSITIONS_DIR)
    .filter((f) => f.endsWith('.holo'))
    .sort();

  console.log(`\n📊 Found ${compositionFiles.length} compositions\n`);

  const allResults: BenchmarkResult[] = [];
  const parser = new HoloScriptPlusParser();

  // Process each composition
  for (const file of compositionFiles) {
    const vertical = extractVertical(file);
    const compositionPath = path.join(COMPOSITIONS_DIR, file);

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🏭 Vertical: ${vertical.toUpperCase()}`);
    console.log(`📄 Composition: ${file}`);
    console.log(`${'─'.repeat(80)}\n`);

    // Read and parse composition
    const source = fs.readFileSync(compositionPath, 'utf-8');
    const parseStart = performance.now();
    const parseResult = parser.parse(source);
    const parseTime = performance.now() - parseStart;

    if (!parseResult.success || !parseResult.ast) {
      console.error(`❌ Parse failed: ${parseResult.errors?.[0]?.message}`);
      continue;
    }

    console.log(`✅ Parsed in ${parseTime.toFixed(2)}ms\n`);

    // Get applicable targets for this vertical
    const verticalTargets = targetMapping[vertical]?.targets || [];
    console.log(`🎯 Targets: ${verticalTargets.join(', ')}\n`);

    // Compile to each target
    for (const target of verticalTargets) {
      const result = await benchmarkCompilation(vertical, file, target, parseResult.ast!);
      allResults.push(result);

      if (result.success) {
        console.log(
          `  ✓ ${target.padEnd(15)} ${result.compilationTimeMs.toFixed(0)}ms  ` +
            `${formatBytes(result.outputSizeBytes).padEnd(10)}  ` +
            `Parity: ${result.featureParity.percentage.toFixed(0)}%`
        );
      } else {
        console.log(`  ✗ ${target.padEnd(15)} FAILED: ${result.error}`);
      }
    }
  }

  // Save raw results
  const resultsPath = path.join(RESULTS_DIR, 'benchmark-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
  console.log(`\n\n💾 Raw results saved to: ${resultsPath}\n`);

  // Generate markdown report
  await generateReport(allResults, targetMapping);

  console.log('═'.repeat(80));
  console.log('✅ Benchmark suite complete!\n');
}

// ─── Benchmark a Single Compilation ──────────────────────────────────────

async function benchmarkCompilation(
  vertical: string,
  composition: string,
  target: string,
  ast: any
): Promise<BenchmarkResult> {
  const CompilerClass = COMPILERS[target.toLowerCase()];

  if (!CompilerClass) {
    return {
      vertical,
      composition,
      target,
      success: false,
      compilationTimeMs: 0,
      outputSizeBytes: 0,
      featureParity: { totalFeatures: 0, supportedFeatures: 0, percentage: 0, missingFeatures: [] },
      error: `No compiler found for target: ${target}`,
    };
  }

  try {
    const compiler = new CompilerClass();
    const compileStart = performance.now();
    const output = compiler.compile(ast, MOCK_AGENT_TOKEN);
    const compileTime = performance.now() - compileStart;

    // Measure output size
    const outputSize =
      typeof output === 'string'
        ? Buffer.byteLength(output, 'utf-8')
        : JSON.stringify(output).length;

    // Calculate feature parity
    const featureParity = calculateFeatureParity(ast, output);

    return {
      vertical,
      composition,
      target,
      success: true,
      compilationTimeMs: compileTime,
      outputSizeBytes: outputSize,
      featureParity,
    };
  } catch (error: any) {
    return {
      vertical,
      composition,
      target,
      success: false,
      compilationTimeMs: 0,
      outputSizeBytes: 0,
      featureParity: { totalFeatures: 0, supportedFeatures: 0, percentage: 0, missingFeatures: [] },
      error: error.message || String(error),
    };
  }
}

// ─── Feature Parity Calculation ──────────────────────────────────────────

function calculateFeatureParity(ast: any, output: any): FeatureParityScore {
  const features = extractFeatures(ast);
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

  let supportedCount = 0;
  const missingFeatures: string[] = [];

  for (const feature of features) {
    // Check if feature is referenced in output
    // This is a simplified heuristic - could be made more sophisticated
    const featurePresent =
      outputStr.includes(feature) || outputStr.toLowerCase().includes(feature.toLowerCase());

    if (featurePresent) {
      supportedCount++;
    } else {
      missingFeatures.push(feature);
    }
  }

  return {
    totalFeatures: features.length,
    supportedFeatures: supportedCount,
    percentage: features.length > 0 ? (supportedCount / features.length) * 100 : 100,
    missingFeatures,
  };
}

function extractFeatures(ast: any): string[] {
  const features = new Set<string>();

  // Extract traits
  if (ast.objects) {
    for (const obj of ast.objects) {
      if (obj.traits) {
        for (const trait of obj.traits) {
          features.add(trait.name);
        }
      }
    }
  }

  if (ast.spatialGroups) {
    for (const group of ast.spatialGroups) {
      if (group.objects) {
        for (const obj of group.objects) {
          if (obj.traits) {
            for (const trait of obj.traits) {
              features.add(trait.name);
            }
          }
        }
      }
    }
  }

  // Extract environment features
  if (ast.environment) {
    Object.keys(ast.environment).forEach((key) => features.add(`env:${key}`));
  }

  // Extract state
  if (ast.states) {
    features.add('state_management');
  }

  // Extract audio
  if (ast.audio) {
    features.add('audio');
  }

  // Extract lights
  if (ast.lights) {
    features.add('lighting');
  }

  return Array.from(features);
}

// ─── Report Generation ───────────────────────────────────────────────────

async function generateReport(results: BenchmarkResult[], targetMapping: TargetMapping) {
  const reportPath = path.join(BENCHMARK_DIR, 'BENCHMARK_REPORT.md');
  const lines: string[] = [];

  lines.push('# HoloScript Cross-Compilation Benchmark Report\n');
  lines.push(`**Generated:** ${new Date().toISOString()}\n`);
  lines.push(`**HoloScript Version:** v3.43.0\n`);
  lines.push(`**Total Compilations:** ${results.length}\n`);
  lines.push(`**Success Rate:** ${calculateSuccessRate(results).toFixed(1)}%\n`);
  lines.push('\n---\n');

  // Executive Summary
  lines.push('## Executive Summary\n');
  lines.push(
    "This benchmark suite tests HoloScript's cross-compilation capabilities by compiling 15 representative compositions (one per vertical) to all applicable platform targets.\n"
  );

  const successfulCompilations = results.filter((r) => r.success).length;
  const failedCompilations = results.filter((r) => !r.success).length;

  lines.push(`- **Total Compilations:** ${results.length}`);
  lines.push(
    `- **Successful:** ${successfulCompilations} (${((successfulCompilations / results.length) * 100).toFixed(1)}%)`
  );
  lines.push(
    `- **Failed:** ${failedCompilations} (${((failedCompilations / results.length) * 100).toFixed(1)}%)`
  );
  lines.push(
    `- **Average Compilation Time:** ${calculateAverage(results.filter((r) => r.success).map((r) => r.compilationTimeMs)).toFixed(0)}ms`
  );
  lines.push(
    `- **Average Output Size:** ${formatBytes(calculateAverage(results.filter((r) => r.success).map((r) => r.outputSizeBytes)))}`
  );
  lines.push(
    `- **Average Feature Parity:** ${calculateAverage(results.filter((r) => r.success).map((r) => r.featureParity.percentage)).toFixed(1)}%\n`
  );

  // Per-Vertical Summary
  lines.push('\n---\n');
  lines.push('## Results by Vertical\n');

  const verticals = Array.from(new Set(results.map((r) => r.vertical))).sort();

  for (const vertical of verticals) {
    const verticalResults = results.filter((r) => r.vertical === vertical);
    const successCount = verticalResults.filter((r) => r.success).length;
    const totalTargets = verticalResults.length;

    lines.push(`### ${vertical.charAt(0).toUpperCase() + vertical.slice(1)}\n`);
    lines.push(
      `**Compilation Success:** ${successCount}/${totalTargets} targets (${((successCount / totalTargets) * 100).toFixed(0)}%)\n`
    );
    lines.push(`**Target Platforms:** ${targetMapping[vertical]?.targets.join(', ')}\n`);

    lines.push('\n| Target | Status | Time (ms) | Size | Parity % | Missing Features |');
    lines.push('|--------|--------|-----------|------|----------|------------------|');

    for (const result of verticalResults) {
      const status = result.success ? '✅' : '❌';
      const time = result.success ? result.compilationTimeMs.toFixed(0) : '-';
      const size = result.success ? formatBytes(result.outputSizeBytes) : '-';
      const parity = result.success ? result.featureParity.percentage.toFixed(0) + '%' : '-';
      const missing = result.success
        ? result.featureParity.missingFeatures.length > 0
          ? result.featureParity.missingFeatures.slice(0, 3).join(', ') +
            (result.featureParity.missingFeatures.length > 3 ? '...' : '')
          : 'None'
        : result.error || 'Unknown error';

      lines.push(`| ${result.target} | ${status} | ${time} | ${size} | ${parity} | ${missing} |`);
    }

    lines.push('\n');
  }

  // Per-Target Summary
  lines.push('\n---\n');
  lines.push('## Results by Target Platform\n');

  const targets = Array.from(new Set(results.map((r) => r.target))).sort();

  for (const target of targets) {
    const targetResults = results.filter((r) => r.target === target);
    const successCount = targetResults.filter((r) => r.success).length;
    const totalVerticals = targetResults.length;

    if (successCount === 0) continue; // Skip targets with zero successes

    lines.push(`### ${target.toUpperCase()}\n`);
    lines.push(
      `**Compilation Success:** ${successCount}/${totalVerticals} verticals (${((successCount / totalVerticals) * 100).toFixed(0)}%)\n`
    );

    const avgTime = calculateAverage(
      targetResults.filter((r) => r.success).map((r) => r.compilationTimeMs)
    );
    const avgSize = calculateAverage(
      targetResults.filter((r) => r.success).map((r) => r.outputSizeBytes)
    );
    const avgParity = calculateAverage(
      targetResults.filter((r) => r.success).map((r) => r.featureParity.percentage)
    );

    lines.push(`- **Average Compilation Time:** ${avgTime.toFixed(0)}ms`);
    lines.push(`- **Average Output Size:** ${formatBytes(avgSize)}`);
    lines.push(`- **Average Feature Parity:** ${avgParity.toFixed(1)}%\n`);

    lines.push('| Vertical | Status | Time (ms) | Size | Parity % |');
    lines.push('|----------|--------|-----------|------|----------|');

    for (const result of targetResults) {
      const status = result.success ? '✅' : '❌';
      const time = result.success ? result.compilationTimeMs.toFixed(0) : '-';
      const size = result.success ? formatBytes(result.outputSizeBytes) : '-';
      const parity = result.success ? result.featureParity.percentage.toFixed(0) + '%' : '-';

      lines.push(`| ${result.vertical} | ${status} | ${time} | ${size} | ${parity} |`);
    }

    lines.push('\n');
  }

  // Performance Rankings
  lines.push('\n---\n');
  lines.push('## Performance Rankings\n');

  lines.push('### Fastest Compilation Times\n');
  const fastestCompilations = results
    .filter((r) => r.success)
    .sort((a, b) => a.compilationTimeMs - b.compilationTimeMs)
    .slice(0, 10);

  lines.push('| Rank | Vertical | Target | Time (ms) |');
  lines.push('|------|----------|--------|-----------|');
  fastestCompilations.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.vertical} | ${r.target} | ${r.compilationTimeMs.toFixed(0)} |`);
  });

  lines.push('\n### Smallest Output Sizes\n');
  const smallestOutputs = results
    .filter((r) => r.success)
    .sort((a, b) => a.outputSizeBytes - b.outputSizeBytes)
    .slice(0, 10);

  lines.push('| Rank | Vertical | Target | Size |');
  lines.push('|------|----------|--------|------|');
  smallestOutputs.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.vertical} | ${r.target} | ${formatBytes(r.outputSizeBytes)} |`);
  });

  lines.push('\n### Highest Feature Parity\n');
  const highestParity = results
    .filter((r) => r.success)
    .sort((a, b) => b.featureParity.percentage - a.featureParity.percentage)
    .slice(0, 10);

  lines.push('| Rank | Vertical | Target | Parity % | Supported/Total |');
  lines.push('|------|----------|--------|----------|-----------------|');
  highestParity.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.vertical} | ${r.target} | ${r.featureParity.percentage.toFixed(1)}% | ${r.featureParity.supportedFeatures}/${r.featureParity.totalFeatures} |`
    );
  });

  // Failure Analysis
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    lines.push('\n---\n');
    lines.push('## Failure Analysis\n');
    lines.push(`**Total Failures:** ${failures.length}\n`);

    lines.push('| Vertical | Target | Error |');
    lines.push('|----------|--------|-------|');
    failures.forEach((r) => {
      lines.push(`| ${r.vertical} | ${r.target} | ${r.error || 'Unknown'} |`);
    });
    lines.push('\n');
  }

  // Methodology
  lines.push('\n---\n');
  lines.push('## Methodology\n');
  lines.push('### Benchmark Compositions\n');
  lines.push(
    'Each vertical is represented by a carefully designed composition that exercises representative features:\n'
  );

  for (const vertical of verticals) {
    lines.push(
      `- **${vertical}**: ${targetMapping[vertical]?.reasoning || 'Standard vertical composition'}`
    );
  }

  lines.push('\n### Metrics\n');
  lines.push(
    '- **Compilation Time**: Measured using `performance.now()` from parse to output generation'
  );
  lines.push('- **Output Size**: Total byte count of generated code/data');
  lines.push(
    '- **Feature Parity**: Percentage of HoloScript features (traits, environment settings, etc.) present in compiled output\n'
  );

  lines.push('### Platform Applicability\n');
  lines.push('Not all platforms are suitable for all verticals. The target mapping is based on:\n');
  lines.push('- Industry standard platform choices for each vertical');
  lines.push('- Platform capabilities (AR, VR, mobile, desktop, robotics)');
  lines.push('- Real-world deployment scenarios\n');

  // Write report
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`\n📊 Benchmark report generated: ${reportPath}\n`);
}

// ─── Utility Functions ────────────────────────────────────────────────────

function extractVertical(filename: string): string {
  // Extract from "01-healthcare.holo" -> "healthcare"
  const match = filename.match(/\d+-(.+)\.holo/);
  return match ? match[1] : filename.replace('.holo', '');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function calculateSuccessRate(results: BenchmarkResult[]): number {
  const successful = results.filter((r) => r.success).length;
  return results.length > 0 ? (successful / results.length) * 100 : 0;
}

// calculateAverage is now imported from @holoscript/core/utils/math

// ─── Entry Point ──────────────────────────────────────────────────────────

main().catch((error) => {
  console.error('\n❌ Benchmark suite failed:', error);
  process.exit(1);
});
