#!/usr/bin/env npx tsx
/**
 * Experiment Runner — Trial Orchestrator
 *
 * Orchestrates the A/B experiment between:
 *   Control (A): TypeScript daemon (scripts/self-improve.ts)
 *   Treatment (B): HoloScript bridge (scripts/self-improve-bridge.ts)
 *
 * Each trial:
 *   1. Creates a fresh git branch from HEAD
 *   2. Resets daemon/bridge state files
 *   3. Runs N cycles of the specified arm
 *   4. Archives results to .holoscript/experiment-results/
 *   5. Returns to the original branch
 *
 * Usage:
 *   npx tsx scripts/experiment-runner.ts --arm control --trial 1 --cycles 15 --commit
 *   npx tsx scripts/experiment-runner.ts --arm treatment --trial 1 --cycles 15 --commit
 *   npx tsx scripts/experiment-runner.ts --arm both --trials 3 --cycles 15 --commit
 *
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __scriptDir =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.HOLOSCRIPT_ROOT ?? path.resolve(__scriptDir, '..');
const STATE_DIR = path.join(REPO_ROOT, '.holoscript');
const RESULTS_DIR = path.join(STATE_DIR, 'experiment-results');

interface ExperimentConfig {
  arm: 'control' | 'treatment' | 'both';
  trials: number;
  cycles: number;
  commit: boolean;
  verbose: boolean;
}

function parseArgs(): ExperimentConfig {
  const args = process.argv.slice(2);
  const config: ExperimentConfig = {
    arm: 'both',
    trials: 3,
    cycles: 15,
    commit: args.includes('--commit'),
    verbose: args.includes('--verbose'),
  };

  const armIdx = args.indexOf('--arm');
  if (armIdx !== -1 && args[armIdx + 1]) {
    config.arm = args[armIdx + 1] as ExperimentConfig['arm'];
  }

  const trialsIdx = args.indexOf('--trials');
  if (trialsIdx !== -1 && args[trialsIdx + 1]) {
    config.trials = parseInt(args[trialsIdx + 1], 10) || 3;
  }

  const trialIdx = args.indexOf('--trial');
  if (trialIdx !== -1 && args[trialIdx + 1]) {
    config.trials = 1;
    // Single trial mode
  }

  const cyclesIdx = args.indexOf('--cycles');
  if (cyclesIdx !== -1 && args[cyclesIdx + 1]) {
    config.cycles = parseInt(args[cyclesIdx + 1], 10) || 15;
  }

  return config;
}

function ensureDirs(): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
}

function resetState(): void {
  const stateFile = path.join(STATE_DIR, 'daemon-state.json');
  const historyFile = path.join(STATE_DIR, 'quality-history.json');

  // Reset unified daemon state (shared by holoscript-runner.ts and self-improve.ts)
  fs.writeFileSync(stateFile, JSON.stringify({
    totalCycles: 0, lastCycleAt: '', lastQuality: 0, bestQuality: 0,
    focusRotation: ['typefix', 'coverage', 'typefix', 'docs', 'typefix', 'complexity', 'all'],
    currentFocusIndex: 0, convergenceStreak: 0, backoffMultiplier: 1,
    improvements: [], attemptedFiles: [], lastErrorCounts: {},
    focusIndex: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUSD: 0,
  }, null, 2), 'utf-8');

  // Reset quality history
  fs.writeFileSync(historyFile, '[]', 'utf-8');
}

function archiveResults(arm: string, trial: number): void {
  const historyFile = path.join(STATE_DIR, 'quality-history.json');
  const destFile = path.join(RESULTS_DIR, `${arm}-trial-${trial}-quality-history.json`);

  if (fs.existsSync(historyFile)) {
    fs.copyFileSync(historyFile, destFile);
    console.log(`  Archived: ${destFile}`);
  }

  // Also save the unified state file
  const stateFile = path.join(STATE_DIR, 'daemon-state.json');
  const stateDestFile = path.join(RESULTS_DIR, `${arm}-trial-${trial}-state.json`);
  if (fs.existsSync(stateFile)) {
    fs.copyFileSync(stateFile, stateDestFile);
  }
}

async function runTrial(arm: 'control' | 'treatment', trial: number, config: ExperimentConfig): Promise<void> {
  const branchName = `experiment/${arm}-trial-${trial}`;
  const originalBranch = git('rev-parse --abbrev-ref HEAD');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Trial ${trial} — ${arm.toUpperCase()} arm — ${config.cycles} cycles`);
  console.log(`${'═'.repeat(60)}`);

  // Create fresh branch from HEAD
  try {
    git(`checkout -b ${branchName}`);
  } catch {
    // Branch might already exist, delete and recreate
    try { git(`branch -D ${branchName}`); } catch { /* ignore */ }
    git(`checkout -b ${branchName}`);
  }

  // Reset state
  resetState();

  // Run the appropriate daemon
  // Both arms now use the same entry point (control arm archived)
  // Treatment arm uses .hsplus composition via --composition flag
  const script = 'scripts/self-improve.ts';

  const commitFlag = config.commit ? '--commit' : '';
  const verboseFlag = config.verbose ? '--verbose' : '';
  const trialFlag = arm === 'treatment' ? `--trial ${trial}` : '';

  const cmd = `npx tsx ${script} --cycles ${config.cycles} ${commitFlag} ${verboseFlag} ${trialFlag}`;

  console.log(`  Running: ${cmd}`);
  console.log('');

  try {
    execSync(cmd, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      timeout: config.cycles * 1_200_000, // 20 min per cycle max (calibration showed ~15 min avg)
    });
  } catch (err: any) {
    console.error(`  Trial ${trial} ${arm} failed: ${err.message}`);
  }

  // Archive results
  ensureDirs();
  archiveResults(arm, trial);

  // Clean working tree before switching branches (daemon may have left uncommitted changes)
  try {
    git('checkout -- .');
    // Remove untracked files the daemon may have created (tests, etc.)
    git('clean -fd --exclude=.holoscript/');
    console.log('  Cleaned working tree after trial');
  } catch (err: any) {
    console.error(`  Warning: cleanup failed: ${err.message}`);
  }

  // Return to original branch
  git(`checkout ${originalBranch}`);
  console.log(`  Returned to ${originalBranch}`);
}

async function main() {
  const config = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 HoloScript Self-Orchestration Experiment Runner        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Arm:      ${config.arm}`);
  console.log(`  Trials:   ${config.trials}`);
  console.log(`  Cycles:   ${config.cycles} per trial`);
  console.log(`  Commit:   ${config.commit ? 'YES' : 'NO (dry run)'}`);
  console.log('');

  const arms: Array<'control' | 'treatment'> =
    config.arm === 'both' ? ['control', 'treatment'] : [config.arm as 'control' | 'treatment'];

  for (const arm of arms) {
    for (let trial = 1; trial <= config.trials; trial++) {
      await runTrial(arm, trial, config);
    }
  }

  console.log('\n');
  console.log('Experiment complete.');
  console.log(`Results archived to: ${RESULTS_DIR}`);
  console.log('Run `npx tsx scripts/experiment-analysis.ts` to analyze results.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
