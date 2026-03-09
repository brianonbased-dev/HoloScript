/**
 * HoloScript Performance Benchmark Runner
 *
 * Measures compilation performance across multiple targets
 * to validate the <10% overhead claim.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import HoloScript compiler functions
import { parseHoloScript } from '../../packages/core/src/parser/HoloScriptParser.js';
import { compileToUnity } from '../../packages/core/src/compiler/UnityCompiler.js';
import { compileToUnreal } from '../../packages/core/src/compiler/UnrealCompiler.js';
import { compileToGodot } from '../../packages/core/src/compiler/GodotCompiler.js';
import { compileToThreeJS } from '../../packages/core/src/compiler/ThreeJSCompiler.js';
import { compileToVRChat } from '../../packages/core/src/compiler/VRChatCompiler.js';

interface BenchmarkResult {
  scenario: string;
  platform: string;
  compileTimeMs: number;
  linesOfCode: number;
  outputSizeBytes: number;
  success: boolean;
  error?: string;
}

interface BenchmarkReport {
  timestamp: string;
  scenario: string;
  results: BenchmarkResult[];
  summary: {
    totalTargets: number;
    successfulCompilations: number;
    avgCompileTimeMs: number;
    fastestTarget: string;
    slowestTarget: string;
  };
}

/**
 * Run benchmark for a specific scenario
 */
export async function runBenchmark(scenarioName: string): Promise<BenchmarkReport> {
  const scenarioPath = join(__dirname, '../scenarios', scenarioName);
  const holoFile = join(scenarioPath, `${scenarioName}.holo`);

  if (!existsSync(holoFile)) {
    throw new Error(`Scenario file not found: ${holoFile}`);
  }

  console.log(`\n📊 Running benchmark: ${scenarioName}`);
  console.log(`   Source: ${holoFile}`);

  const holoSource = readFileSync(holoFile, 'utf-8');
  const results: BenchmarkResult[] = [];

  // Parse once, compile to multiple targets
  const parseStart = Date.now();
  const composition = parseHoloScript(holoSource);
  const parseTime = Date.now() - parseStart;
  console.log(`   ✓ Parsed in ${parseTime}ms`);

  // Compile to Unity
  results.push(await benchmarkTarget('Unity C#', () => compileToUnity(composition), scenarioName));

  // Compile to Unreal
  results.push(
    await benchmarkTarget(
      'Unreal C++',
      () => {
        const output = compileToUnreal(composition);
        // Combine header + source files for measurement
        return output.headerFile + '\n' + output.sourceFile;
      },
      scenarioName
    )
  );

  // Compile to Godot
  results.push(
    await benchmarkTarget('Godot GDScript', () => compileToGodot(composition), scenarioName)
  );

  // Compile to Three.js
  results.push(
    await benchmarkTarget('Three.js/WebXR', () => compileToThreeJS(composition), scenarioName)
  );

  // Compile to VRChat
  results.push(
    await benchmarkTarget(
      'VRChat Udon#',
      () => {
        const output = compileToVRChat(composition);
        return output.mainScript;
      },
      scenarioName
    )
  );

  // Calculate summary stats
  const successful = results.filter((r) => r.success);
  const avgCompileTime =
    successful.reduce((sum, r) => sum + r.compileTimeMs, 0) / successful.length;
  const fastest = successful.reduce((min, r) => (r.compileTimeMs < min.compileTimeMs ? r : min));
  const slowest = successful.reduce((max, r) => (r.compileTimeMs > max.compileTimeMs ? r : max));

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    scenario: scenarioName,
    results,
    summary: {
      totalTargets: results.length,
      successfulCompilations: successful.length,
      avgCompileTimeMs: Math.round(avgCompileTime),
      fastestTarget: fastest.platform,
      slowestTarget: slowest.platform,
    },
  };

  // Save results
  saveResults(report);
  printResults(report);

  return report;
}

/**
 * Benchmark a specific compilation target
 */
async function benchmarkTarget(
  platform: string,
  compileFn: () => string,
  scenario: string
): Promise<BenchmarkResult> {
  console.log(`   → Compiling to ${platform}...`);

  try {
    const start = Date.now();
    const output = compileFn();
    const compileTime = Date.now() - start;

    const linesOfCode = output.split('\n').length;
    const outputSizeBytes = Buffer.byteLength(output, 'utf-8');

    console.log(`     ✓ ${compileTime}ms (${linesOfCode} LOC, ${formatBytes(outputSizeBytes)})`);

    return {
      scenario,
      platform,
      compileTimeMs: compileTime,
      linesOfCode,
      outputSizeBytes,
      success: true,
    };
  } catch (error) {
    console.log(`     ✗ FAILED: ${error}`);
    return {
      scenario,
      platform,
      compileTimeMs: 0,
      linesOfCode: 0,
      outputSizeBytes: 0,
      success: false,
      error: String(error),
    };
  }
}

/**
 * Save results to JSON file
 */
function saveResults(report: BenchmarkReport): void {
  const resultsDir = join(__dirname, '../results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const dateDir = join(resultsDir, date);
  if (!existsSync(dateDir)) {
    mkdirSync(dateDir, { recursive: true });
  }

  const outputFile = join(dateDir, `${report.scenario}.json`);
  writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n   📄 Results saved: ${outputFile}`);
}

/**
 * Print formatted results table
 */
function printResults(report: BenchmarkReport): void {
  console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
  console.log(`│  Compilation Performance: ${report.scenario.padEnd(32)} │`);
  console.log(`├─────────────────────────────────────────────────────────────┤`);
  console.log(`│ Platform              │ Time   │ LOC   │ Size            │`);
  console.log(`├───────────────────────┼────────┼───────┼─────────────────┤`);

  for (const result of report.results.filter((r) => r.success)) {
    const platform = result.platform.padEnd(21);
    const time = `${result.compileTimeMs}ms`.padEnd(6);
    const loc = result.linesOfCode.toString().padEnd(5);
    const size = formatBytes(result.outputSizeBytes).padEnd(15);
    console.log(`│ ${platform} │ ${time} │ ${loc} │ ${size} │`);
  }

  console.log(`└───────────────────────┴────────┴───────┴─────────────────┘`);

  console.log(`\n📈 Summary:`);
  console.log(
    `   • Successful: ${report.summary.successfulCompilations}/${report.summary.totalTargets} targets`
  );
  console.log(`   • Average compile time: ${report.summary.avgCompileTimeMs}ms`);
  console.log(`   • Fastest: ${report.summary.fastestTarget}`);
  console.log(`   • Slowest: ${report.summary.slowestTarget}`);

  const allSuccess = report.summary.successfulCompilations === report.summary.totalTargets;
  console.log(`\n${allSuccess ? '✅ PASS' : '⚠️  PARTIAL'}: Benchmark complete\n`);
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Main entry point
 */
if (require.main === module) {
  const scenario = process.argv[2] || '01-basic-scene';
  runBenchmark(scenario).catch((error) => {
    console.error(`❌ Benchmark failed:`, error);
    process.exit(1);
  });
}
