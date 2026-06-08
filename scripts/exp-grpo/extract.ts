#!/usr/bin/env tsx
/**
 * extract.ts — CLI for generating GRPO + DPO training artifacts from the HoloScript monorepo.
 *
 * Calls GRPOPromptExtractor (4 extraction strategies) and FocusedDPOSplitter (parse-gate
 * degradation pairs) and writes two JSONL files:
 *   <outDir>/grpo-prompts.jsonl   — TRL GRPOTrainer prompt records
 *   <outDir>/dpo-pairs.jsonl      — TRL SFTTrainer DPO preference pairs
 *
 * Usage:
 *   npx tsx scripts/exp-grpo/extract.ts [--root <path>] [--out <path>] [--max <n>]
 *
 * All secrets via env; no hardcoded paths.
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import {
  GRPOPromptExtractor,
  type PromptExtractorFS,
} from '../packages/absorb-service/src/self-improvement/GRPOPromptExtractor.js';
import { FocusedDPOSplitter } from '../packages/absorb-service/src/self-improvement/FocusedDPOSplitter.js';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function argVal(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
function argFlag(flag: string): boolean {
  return args.includes(flag);
}

const ROOT_DIR = nodePath.resolve(argVal('--root', process.env.HOLOSCRIPT_ROOT ?? '.'));
const OUT_DIR = nodePath.resolve(
  argVal('--out', process.env.EXTRACT_OUT ?? nodePath.join(ROOT_DIR, 'datasets', 'exp-grpo'))
);
const MAX_PROMPTS = parseInt(argVal('--max', process.env.EXTRACT_MAX_PROMPTS ?? '2000'), 10);
const VERBOSE = argFlag('--verbose') || process.env.EXTRACT_VERBOSE === '1';

// ---------------------------------------------------------------------------
// Real FS implementation
// ---------------------------------------------------------------------------

const realFS: PromptExtractorFS = {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  },
  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(nodePath.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  },
  async listFiles(rootDir: string, extensions: string[], excludeDirs: string[]): Promise<string[]> {
    const results: string[] = [];
    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (!excludeDirs.some((x) => e.name === x || e.name.startsWith('.'))) {
            await walk(nodePath.join(dir, e.name));
          }
        } else if (extensions.some((ext) => e.name.endsWith(ext))) {
          results.push(nodePath.join(dir, e.name));
        }
      }
    }
    await walk(rootDir);
    return results;
  },
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  resolve: (...s) => nodePath.resolve(...s),
  relative: (from, to) => nodePath.relative(from, to),
  dirname: (p) => nodePath.dirname(p),
  basename: (p, ext?) => nodePath.basename(p, ext),
  join: (...s) => nodePath.join(...s),
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.error(`[extract] root=${ROOT_DIR} out=${OUT_DIR} max=${MAX_PROMPTS}`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  // ---- GRPO prompts ----
  console.error('[extract] running GRPOPromptExtractor...');
  const extractor = new GRPOPromptExtractor(
    { rootDir: ROOT_DIR, outputDir: OUT_DIR, maxPrompts: MAX_PROMPTS },
    realFS
  );

  const { records: grpoRecords, stats } = await extractor.extract();
  console.error(
    `[extract] GRPO: ${stats.totalAfterDedup} prompts ` +
      `(from ${stats.totalExtracted}, dedup removed ${stats.removedByDedup})`
  );
  if (VERBOSE) console.error('[extract] by source:', stats.bySource);

  const grpoPath = nodePath.join(OUT_DIR, 'grpo-prompts.jsonl');
  await writeJsonl(grpoPath, grpoRecords);
  console.error(`[extract] wrote ${grpoRecords.length} records → ${grpoPath}`);

  // ---- DPO pairs ----
  console.error('[extract] running FocusedDPOSplitter on .holo files...');
  const holoFiles = await realFS.listFiles(
    ROOT_DIR,
    ['.holo', '.hs', '.hsplus'],
    ['node_modules', 'dist', 'build', '.git', 'coverage']
  );
  const splitter = new FocusedDPOSplitter({ maxPairsPerSegment: 4 });
  const holoSources: Array<{ source: string; filename: string }> = [];

  for (const f of holoFiles.slice(0, 200)) {
    try {
      const src = await fs.readFile(f, 'utf-8');
      holoSources.push({ source: src, filename: nodePath.relative(ROOT_DIR, f) });
    } catch {
      /* skip */
    }
  }

  const { pairs: dpoPairs, stats: dpoStats } = splitter.processMultiple(holoSources);
  const validPairs = dpoPairs.filter((p) => p.metadata.qualityScore >= 0.5);
  console.error(
    `[extract] DPO: ${validPairs.length} valid pairs ` +
      `(${dpoStats.pairsGenerated} total, ${dpoStats.invalidPairs} invalid)`
  );

  const dpoPath = nodePath.join(OUT_DIR, 'dpo-pairs.jsonl');
  await writeJsonl(dpoPath, validPairs);
  console.error(`[extract] wrote ${validPairs.length} pairs → ${dpoPath}`);

  // ---- Manifest ----
  const manifest = {
    extractedAt: new Date().toISOString(),
    rootDir: ROOT_DIR,
    grpoPrompts: grpoRecords.length,
    dpoPairs: validPairs.length,
    grpoPath,
    dpoPath,
    stats,
  };
  const manifestPath = nodePath.join(OUT_DIR, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.error(`[extract] manifest → ${manifestPath}`);

  // stdout: machine-readable summary for driver.sh
  process.stdout.write(JSON.stringify(manifest) + '\n');
}

async function writeJsonl(filePath: string, records: unknown[]): Promise<void> {
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await fs.writeFile(filePath, lines, 'utf-8');
}

main().catch((e) => {
  console.error('[extract] FATAL:', e.message);
  process.exit(1);
});
