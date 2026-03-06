#!/usr/bin/env npx tsx
/**
 * extract-grpo-prompts.ts
 *
 * Runner script for GRPOPromptExtractor.
 * Scans the HoloScript monorepo and outputs a GRPO training prompt dataset.
 *
 * Usage:
 *   npx tsx scripts/extract-grpo-prompts.ts
 *   npx tsx scripts/extract-grpo-prompts.ts --output datasets/custom-name.jsonl
 *   npx tsx scripts/extract-grpo-prompts.ts --verbose
 *
 * Output: datasets/grpo-prompts-YYYY-MM-DD.jsonl
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  GRPOPromptExtractor,
  createNodeFS,
} from '../packages/core/src/self-improvement/GRPOPromptExtractor';

// ─── Path Resolution ─────────────────────────────────────────────────────────

const __scriptDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT =
  process.env.HOLOSCRIPT_ROOT ?? path.resolve(__scriptDir, '..');

// ─── Configuration ───────────────────────────────────────────────────────────

interface RunnerConfig {
  rootDir: string;
  outputDir: string;
  verbose: boolean;
  outputFile?: string;
}

function parseArgs(): RunnerConfig {
  const args = process.argv.slice(2);
  const config: RunnerConfig = {
    rootDir: REPO_ROOT,
    outputDir: 'datasets',
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    config.outputFile = args[outputIdx + 1];
  }

  const rootIdx = args.indexOf('--root');
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    config.rootDir = path.resolve(args[rootIdx + 1]);
  }

  return config;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GRPO Prompt Extractor — HoloScript Monorepo               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Root:   ${config.rootDir}`);
  console.log(`  Output: ${config.outputDir}/`);
  console.log('');

  // Create the file system adapter
  const fs = createNodeFS();

  // Create the extractor
  const extractor = new GRPOPromptExtractor(
    {
      rootDir: config.rootDir,
      outputDir: config.outputDir,
    },
    fs,
  );

  console.log('Scanning monorepo...');
  const startTime = Date.now();

  const result = await extractor.extract();

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const { stats } = result;

  // ─── Report ──────────────────────────────────────────────────────────────

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  EXTRACTION COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Duration:        ${durationSec}s`);
  console.log(`  Total extracted: ${stats.totalExtracted}`);
  console.log(`  After dedup:     ${stats.totalAfterDedup}`);
  console.log(`  Removed by dedup: ${stats.removedByDedup}`);
  console.log(`  Output file:     ${stats.outputFile}`);
  console.log('');

  // By source
  console.log('  BY SOURCE:');
  for (const [source, count] of Object.entries(stats.bySource)) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`    ${source.padEnd(22)} ${String(count).padStart(4)}  ${bar}`);
  }
  console.log('');

  // By difficulty
  console.log('  BY DIFFICULTY:');
  for (const [diff, count] of Object.entries(stats.byDifficulty)) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`    ${diff.padEnd(22)} ${String(count).padStart(4)}  ${bar}`);
  }
  console.log('');

  // By domain
  console.log('  BY DOMAIN:');
  const sortedDomains = Object.entries(stats.byDomain).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [domain, count] of sortedDomains) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`    ${domain.padEnd(22)} ${String(count).padStart(4)}  ${bar}`);
  }
  console.log('');

  // By package
  console.log(`  PACKAGES COVERED (${stats.packagesCovered.length}):`);
  for (const pkg of stats.packagesCovered) {
    const count = result.prompts.filter((p) => p.packageName === pkg).length;
    console.log(`    ${pkg.padEnd(26)} ${String(count).padStart(4)} prompts`);
  }
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Verbose: print first 5 prompts
  if (config.verbose) {
    console.log('');
    console.log('  SAMPLE PROMPTS (first 5):');
    for (const prompt of result.prompts.slice(0, 5)) {
      console.log(`    [${prompt.source}] ${prompt.instruction}`);
      console.log(
        `      Package: ${prompt.packageName}, Difficulty: ${prompt.difficulty}, Domains: ${prompt.domainTags.join(', ')}`,
      );
      console.log('');
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
