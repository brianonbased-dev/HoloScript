/**
 * runSelfImprove.ts
 *
 * Entry point for the `holoscript self-improve` CLI command.
 * Orchestrates the SelfImproveCommand with CLI-specific I/O,
 * real-time progress display, optional harvesting, and daemon mode.
 *
 * @module self-improve
 */

import type { CLIOptions } from '../args';
import type { SelfImproveIO } from './CliSelfImproveIO';
import { CliSelfImproveIO } from './CliSelfImproveIO';

// =============================================================================
// ANSI Helpers
// =============================================================================

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
} as const;

// =============================================================================
// Progress Display
// =============================================================================

function printBanner(options: CLIOptions, rootDir: string): void {
  console.log('');
  console.log(`${C.cyan}${C.bold}${'='.repeat(60)}${C.reset}`);
  console.log(`${C.cyan}${C.bold}  HoloScript Self-Improvement Pipeline${C.reset}`);
  console.log(`${C.cyan}${C.bold}${'='.repeat(60)}${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}Root:${C.reset}          ${rootDir}`);
  console.log(
    `  ${C.dim}Cycles:${C.reset}        ${options.daemonMode ? 'Continuous (daemon)' : (options.cycles ?? 5)}`
  );
  console.log(
    `  ${C.dim}Auto-commit:${C.reset}   ${options.autoCommit ? `${C.green}YES${C.reset}` : `${C.yellow}NO${C.reset}`}`
  );
  console.log(
    `  ${C.dim}Harvest:${C.reset}       ${options.harvest ? `${C.green}YES${C.reset}` : `${C.dim}NO${C.reset}`}`
  );
  console.log(`  ${C.dim}Max failures:${C.reset}  ${options.maxFailures ?? 3}`);
  console.log(`  ${C.dim}Verbose:${C.reset}       ${options.verbose ? 'YES' : 'NO'}`);
  console.log('');
}

function printIterationSummary(
  iteration: number,
  total: number,
  target: string | null,
  testPassed: boolean,
  committed: boolean,
  qualityPercent: number | null,
  convergenceSlope: number | null
): void {
  const status = testPassed ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
  const commitStr = committed ? `${C.green}committed${C.reset}` : `${C.dim}skipped${C.reset}`;
  const qualityStr = qualityPercent !== null ? `${qualityPercent.toFixed(1)}%` : 'N/A';
  const slopeStr = convergenceSlope !== null ? convergenceSlope.toFixed(4) : 'N/A';

  console.log(`  ${C.bold}[${iteration}/${total}]${C.reset} ${target ?? 'no target'}`);
  console.log(
    `    Test: ${status} | Commit: ${commitStr} | Quality: ${qualityStr} | Slope: ${slopeStr}`
  );
}

function printFinalSummary(
  totalTests: number,
  totalCommits: number,
  abortReason: string | null,
  qualityPercent: number | null,
  duration: number,
  harvestFile: string | null
): void {
  console.log('');
  console.log(`${C.cyan}${C.bold}${'='.repeat(60)}${C.reset}`);
  console.log(`${C.cyan}${C.bold}  Self-Improvement Complete${C.reset}`);
  console.log(`${C.cyan}${C.bold}${'='.repeat(60)}${C.reset}`);
  console.log('');
  console.log(`  ${C.dim}Tests added:${C.reset}     ${totalTests}`);
  console.log(`  ${C.dim}Commits:${C.reset}         ${totalCommits}`);
  console.log(`  ${C.dim}Stop reason:${C.reset}     ${abortReason ?? 'completed'}`);
  console.log(
    `  ${C.dim}Final quality:${C.reset}   ${qualityPercent !== null ? `${qualityPercent.toFixed(1)}%` : 'N/A'}`
  );
  console.log(`  ${C.dim}Duration:${C.reset}        ${(duration / 1000).toFixed(1)}s`);

  if (harvestFile) {
    console.log(`  ${C.dim}Training data:${C.reset}   ${harvestFile}`);
  }

  console.log('');
}

// =============================================================================
// Main Runner
// =============================================================================

/**
 * Execute the self-improve CLI command.
 *
 * @param options Parsed CLI options
 * @returns Exit code (0 = success, 1 = failure)
 */
export async function runSelfImprove(options: CLIOptions): Promise<number> {
  const path = await import('path');

  const rootDir = options.input ? path.resolve(options.input) : process.cwd();

  printBanner(options, rootDir);

  // Dynamic imports to avoid loading heavy modules at CLI startup
  // Use string concatenation to prevent bundler static analysis
  const absorbPkg = '@holoscript/absorb-service';
  const selfImproveMod = await import(absorbPkg + '/self-improvement');
  const { SelfImproveCommand, SelfImproveHarvester } = selfImproveMod;

  // Build IO
  const io = new CliSelfImproveIO({
    rootDir,
    verbose: options.verbose,
  });

  // Build config
  const cycles = options.cycles ?? 5;
  const maxIterations = options.daemonMode ? 1000 : cycles;

  const config = {
    rootDir,
    maxIterations,
    autoCommit: options.autoCommit ?? false,
    fullSuiteMetrics: true,
    maxConsecutiveFailures: options.maxFailures ?? 3,
  };

  // Optional harvester
  let harvester: InstanceType<typeof SelfImproveHarvester> | null = null;
  let harvestingIO: SelfImproveIO = io;

  if (options.harvest) {
    const datasetsDir = path.join(rootDir, 'datasets');
    harvester = new SelfImproveHarvester({
      enabled: true,
      outputDir: datasetsDir,
      minPassRate: 0.8,
      minInstructionLength: 20,
      maxRougeLSimilarity: 0.7,
      validateSyntax: true,
      flushInterval: 10,
    });

    harvestingIO = harvester.wrapIO(io);
    console.log(`  ${C.green}Harvester enabled${C.reset} -> ${datasetsDir}`);
    console.log('');
  }

  // Daemon mode: run in a loop until convergence
  if (options.daemonMode) {
    return await runDaemonMode(harvestingIO, config, options, harvester, rootDir);
  }

  // Single-shot mode
  const cmd = new SelfImproveCommand(harvestingIO, config);

  console.log(`${C.cyan}Starting self-improvement loop (${maxIterations} cycles max)...${C.reset}`);
  console.log('');

  const result = await cmd.execute();

  // Print per-iteration summaries
  for (const iter of result.iterations) {
    printIterationSummary(
      iter.iteration,
      maxIterations,
      iter.target?.symbolName ?? null,
      iter.testPassed,
      iter.committed,
      iter.qualityReport?.scorePercent ?? null,
      iter.convergenceStatus?.windowSlope ?? null
    );
  }

  // Flush harvester
  if (harvester) {
    await harvester.flush();
  }

  printFinalSummary(
    result.totalTestsAdded,
    result.totalCommits,
    result.abortReason,
    result.finalQuality?.scorePercent ?? null,
    result.totalDuration,
    harvester ? path.join(rootDir, 'datasets') : null
  );

  return 0;
}

// =============================================================================
// Daemon Mode
// =============================================================================

async function runDaemonMode(
  io: SelfImproveIO,
  baseConfig: Record<string, unknown>,
  options: CLIOptions,
  harvester: any | null,
  rootDir: string
): Promise<number> {
  const absorbPkg = '@holoscript/absorb-service';
  const { SelfImproveCommand } = await import(absorbPkg + '/self-improvement');

  let running = true;
  let cycleCount = 0;
  let lastQuality = 0;
  let convergenceStreak = 0;
  const CONVERGENCE_THRESHOLD = 0.01;
  const MAX_CONVERGENCE_STREAK = 5;
  const CYCLE_DELAY_MS = 60_000; // 1 minute between cycles

  // Handle graceful shutdown
  const shutdown = () => {
    console.log(`\n${C.yellow}Shutdown signal received, completing current cycle...${C.reset}`);
    running = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(
    `${C.magenta}${C.bold}Daemon mode activated${C.reset} - running until convergence or interrupt`
  );
  console.log(
    `  Convergence: ${MAX_CONVERGENCE_STREAK} consecutive cycles with < ${CONVERGENCE_THRESHOLD * 100}% quality change`
  );
  console.log('');

  while (running) {
    cycleCount++;
    console.log(`${C.cyan}${C.bold}--- Daemon Cycle ${cycleCount} ---${C.reset}`);

    const cycleConfig = {
      ...baseConfig,
      maxIterations: options.cycles ?? 5,
    };

    const cmd = new SelfImproveCommand(io, cycleConfig);
    const result = await cmd.execute();

    // Print iteration summaries
    for (const iter of result.iterations) {
      printIterationSummary(
        iter.iteration,
        cycleConfig.maxIterations as number,
        iter.target?.symbolName ?? null,
        iter.testPassed,
        iter.committed,
        iter.qualityReport?.scorePercent ?? null,
        iter.convergenceStatus?.windowSlope ?? null
      );
    }

    // Check convergence
    const currentQuality = result.finalQuality?.score ?? 0;
    const delta = Math.abs(currentQuality - lastQuality);

    if (delta < CONVERGENCE_THRESHOLD && cycleCount > 1) {
      convergenceStreak++;
      console.log(
        `  ${C.yellow}Quality plateau: streak ${convergenceStreak}/${MAX_CONVERGENCE_STREAK}${C.reset}`
      );
    } else {
      convergenceStreak = 0;
      if (currentQuality > lastQuality) {
        console.log(
          `  ${C.green}Quality improved: ${(lastQuality * 100).toFixed(1)}% -> ${(currentQuality * 100).toFixed(1)}%${C.reset}`
        );
      }
    }

    lastQuality = currentQuality;

    if (convergenceStreak >= MAX_CONVERGENCE_STREAK) {
      console.log(
        `\n${C.green}${C.bold}Convergence detected after ${cycleCount} daemon cycles.${C.reset}`
      );
      break;
    }

    if (running) {
      const delaySeconds = CYCLE_DELAY_MS / 1000;
      console.log(`  ${C.dim}Next cycle in ${delaySeconds}s...${C.reset}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, CYCLE_DELAY_MS);
        const check = setInterval(() => {
          if (!running) {
            clearTimeout(timer);
            clearInterval(check);
            resolve();
          }
        }, 1000);
      });
    }
  }

  // Flush harvester
  if (harvester) {
    await harvester.flush();
    const stats = harvester.getStats();
    console.log(
      `  ${C.dim}Harvest stats: ${stats.totalAccepted} accepted / ${stats.totalCaptured} captured${C.reset}`
    );
  }

  printFinalSummary(
    0,
    0,
    convergenceStreak >= MAX_CONVERGENCE_STREAK ? 'converged' : 'interrupted',
    lastQuality > 0 ? lastQuality * 100 : null,
    0,
    harvester ? path.join(rootDir, 'datasets') : null
  );

  return 0;
}
