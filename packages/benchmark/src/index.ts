/**
 * HoloScript Benchmark Suite - Index
 *
 * Runs all benchmark suites and outputs results.
 * Supports JSON output for CI regression detection.
 */

import { Bench } from 'tinybench';
import { runParserBench } from './suites/parser.bench.js';
import { runCompilerBench } from './suites/compiler.bench.js';
import { runSyncBench } from './suites/sync.bench.js';
import { runLspBench } from './suites/lsp.bench.js';
import { runMcpBench } from './suites/mcp.bench.js';

// =============================================================================
// TYPES
// =============================================================================

interface BenchmarkResult {
  name: string;
  opsPerSecond: number;
  meanMs: number;
  samples: number;
  marginOfError: number;
}

interface SuiteResults {
  suite: string;
  timestamp: string;
  results: BenchmarkResult[];
}

interface AllResults {
  version: string;
  commit?: string;
  timestamp: string;
  suites: SuiteResults[];
}

// =============================================================================
// RESULT EXTRACTION
// =============================================================================

function extractResults(bench: Bench, suiteName: string): SuiteResults {
  const results: BenchmarkResult[] = [];

  for (const task of bench.tasks) {
    if (task.result) {
      results.push({
        name: task.name,
        opsPerSecond: task.result.hz,
        meanMs: task.result.mean * 1000, // Convert to ms
        samples: task.result.samples.length,
        marginOfError: task.result.moe * 100, // Convert to percentage
      });
    }
  }

  return {
    suite: suiteName,
    timestamp: new Date().toISOString(),
    results,
  };
}

// =============================================================================
// OUTPUT FORMATTERS
// =============================================================================

function printConsoleResults(allResults: AllResults): void {
  console.log('\n' + '='.repeat(70));
  console.log('  HoloScript Benchmark Results');
  console.log('  ' + new Date().toLocaleString());
  console.log('='.repeat(70) + '\n');

  for (const suite of allResults.suites) {
    console.log(`\n📊 ${suite.suite}`);
    console.log('-'.repeat(60));

    for (const result of suite.results) {
      const opsStr = result.opsPerSecond.toLocaleString('en-US', { maximumFractionDigits: 0 });
      const meanStr = result.meanMs.toFixed(3);
      console.log(
        `  ${result.name.padEnd(40)} ${opsStr.padStart(10)} ops/s  (${meanStr}ms ±${result.marginOfError.toFixed(1)}%)`
      );
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

function printJsonResults(allResults: AllResults): void {
  console.log(JSON.stringify(allResults, null, 2));
}

// =============================================================================
// REGRESSION DETECTION
// =============================================================================

interface RegressionReport {
  hasRegressions: boolean;
  regressions: Array<{
    suite: string;
    benchmark: string;
    baseline: number;
    current: number;
    changePercent: number;
  }>;
}

function detectRegressions(
  current: AllResults,
  baseline: AllResults,
  threshold: number = 5 // 5% regression threshold (perf1 quality gate)
): RegressionReport {
  const regressions: RegressionReport['regressions'] = [];

  for (const currentSuite of current.suites) {
    const baselineSuite = baseline.suites.find((s) => s.suite === currentSuite.suite);
    if (!baselineSuite) continue;

    for (const currentResult of currentSuite.results) {
      const baselineResult = baselineSuite.results.find((r) => r.name === currentResult.name);
      if (!baselineResult) continue;

      const changePercent =
        ((baselineResult.opsPerSecond - currentResult.opsPerSecond) / baselineResult.opsPerSecond) *
        100;

      if (changePercent > threshold) {
        regressions.push({
          suite: currentSuite.suite,
          benchmark: currentResult.name,
          baseline: baselineResult.opsPerSecond,
          current: currentResult.opsPerSecond,
          changePercent,
        });
      }
    }
  }

  return {
    hasRegressions: regressions.length > 0,
    regressions,
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json') || args.includes('--ci');
  const compareFile = args.find((a) => a.startsWith('--compare='))?.split('=')[1];

  const suites: SuiteResults[] = [];

  // Run parser benchmarks
  if (!isJson) console.log('Running parser benchmarks...');
  const parserBench = await runParserBench();
  suites.push(extractResults(parserBench, 'Parser'));

  // Run compiler benchmarks
  if (!isJson) console.log('Running compiler benchmarks...');
  const compilerBench = await runCompilerBench();
  suites.push(extractResults(compilerBench, 'Compiler'));

  // Run sync benchmarks (Sprint 2)
  if (!isJson) console.log('Running sync benchmarks...');
  const syncBench = await runSyncBench();
  suites.push(extractResults(syncBench, 'HighFrequencySync'));

  // Run LSP benchmarks (Sprint 2)
  if (!isJson) console.log('Running LSP benchmarks...');
  const lspBench = await runLspBench();
  suites.push(extractResults(lspBench, 'LSP'));

  // Run MCP throughput benchmarks
  if (!isJson) console.log('Running MCP throughput benchmarks...');
  const mcpBench = await runMcpBench();
  suites.push(extractResults(mcpBench, 'MCPThroughput'));

  const allResults: AllResults = {
    version: '2.1.0',
    commit: process.env.GITHUB_SHA || process.env.GIT_COMMIT,
    timestamp: new Date().toISOString(),
    suites,
  };

  // Output results
  if (isJson) {
    printJsonResults(allResults);
  } else {
    printConsoleResults(allResults);
  }

  // Compare against baseline if provided
  if (compareFile) {
    try {
      const { readFileSync } = await import('fs');
      const baselineJson = readFileSync(compareFile, 'utf-8');
      const baseline: AllResults = JSON.parse(baselineJson);

      const report = detectRegressions(allResults, baseline);

      if (report.hasRegressions) {
        console.error('\n❌ Performance regressions detected:\n');
        for (const reg of report.regressions) {
          console.error(
            `  ${reg.suite}/${reg.benchmark}: ${reg.baseline.toFixed(0)} → ${reg.current.toFixed(0)} ops/s (${reg.changePercent.toFixed(1)}% slower)`
          );
        }
        process.exit(1);
      } else {
        console.log('\n✅ No performance regressions detected.\n');
      }
    } catch (err) {
      console.error('Failed to compare against baseline:', err);
    }
  }
}

main().catch(console.error);

// Export for programmatic use
export {
  extractResults,
  detectRegressions,
  type AllResults,
  type BenchmarkResult,
  type SuiteResults,
};
