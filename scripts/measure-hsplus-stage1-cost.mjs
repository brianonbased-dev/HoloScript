#!/usr/bin/env node
/**
 * Cold and warm cost of .hsplus parsing.
 *
 * Cold is the first pass in a fresh process. After Stage 1 change 1, that
 * pass includes WASM instantiation the first time a typed function is seen.
 * Untyped functions do not load the checker. Warm is the second pass in the
 * same process.
 *
 *   node --import tsx scripts/measure-hsplus-stage1-cost.mjs
 *   node --import tsx scripts/measure-hsplus-stage1-cost.mjs --workload sweep
 *   node --import tsx scripts/measure-hsplus-stage1-cost.mjs --workload suite
 *
 * The parent process starts one fresh process per workload. `--worker` is the
 * in-process pass and is not a separate user entry.
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const workerMode = process.argv.includes('--worker');
const workloadArg = process.argv.find((arg) => arg.startsWith('--workload='));
const workload = workloadArg ? workloadArg.slice('--workload='.length) : 'both';

const SUITE_FILES = [
  'src/parser/HoloScriptPlusParser.test.ts',
  'src/parser/__tests__/HoloScriptPlusStructFields.test.ts',
  'src/parser/__tests__/HSPlusGeneralPurposeSystemsFixture.test.ts',
  'src/parser/Repro.test.ts',
  'src/parser/__tests__/holoscript-spec-v0.1.test.ts',
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.scratch',
  'target',
  'pkg',
  'pkg-node',
]);

function readStatus() {
  const status = readFileSync('/proc/self/status', 'utf8');
  const kb = (name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(status)?.[1] ?? 0);
  return { rssKb: kb('VmRSS'), hwmKb: kb('VmHWM') };
}

function tracker() {
  let heapPeak = process.memoryUsage().heapUsed;
  let rssPeakKb = readStatus().rssKb;
  const timer = setInterval(() => {
    const heap = process.memoryUsage().heapUsed;
    if (heap > heapPeak) heapPeak = heap;
    const rss = readStatus().rssKb;
    if (rss > rssPeakKb) rssPeakKb = rss;
  }, 10);
  return {
    stop() {
      clearInterval(timer);
      const heap = process.memoryUsage().heapUsed;
      if (heap > heapPeak) heapPeak = heap;
      const end = readStatus();
      if (end.rssKb > rssPeakKb) rssPeakKb = end.rssKb;
      return {
        rssPeakKb,
        rssEndKb: end.rssKb,
        hwmKb: end.hwmKb,
        heapPeak,
        heapUsed: heap,
      };
    },
  };
}

function walkHsplus(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkHsplus(full, acc);
    else if (entry.name.endsWith('.hsplus')) acc.push(full);
  }
}

function wasmInRequireCache() {
  const cache = globalThis.require?.cache;
  if (!cache) return false;
  return Object.keys(cache).some((key) => key.includes('holoscript_wasm'));
}

async function checkerLoaded() {
  try {
    const mod = await import('../packages/core/src/parser/hsplusRustTypeCheck.ts');
    return typeof mod.hsplusRustCheckerLoaded === 'function' ? mod.hsplusRustCheckerLoaded() : false;
  } catch {
    return false;
  }
}

async function runSweep() {
  const files = [];
  walkHsplus(repoRoot, files);
  files.sort();
  const sources = files.map((file) => readFileSync(file, 'utf8'));
  const { parse } = await import('../packages/core/src/parser/HoloScriptPlusParser.ts');
  const loadedBefore = await checkerLoaded();

  const measure = (label) => {
    const watch = tracker();
    const started = performance.now();
    let pass = 0;
    let fail = 0;
    let throws = 0;
    for (const source of sources) {
      try {
        const result = parse(source);
        if (result.success) pass += 1;
        else fail += 1;
      } catch {
        throws += 1;
      }
    }
    return {
      label,
      ms: Math.round(performance.now() - started),
      pass,
      fail,
      throws,
      files: files.length,
      ...watch.stop(),
    };
  };

  const cold = measure('cold');
  const loadedAfterCold = await checkerLoaded();
  const warm = measure('warm');
  return {
    workload: 'sweep',
    note: 'Direct parse() of every .hsplus file. WASM loads only if a typed function is parsed.',
    checkerLoadedBefore: loadedBefore,
    checkerLoadedAfterCold: loadedAfterCold,
    wasmRequireCache: wasmInRequireCache(),
    cold,
    warm,
  };
}

async function runSuite() {
  const { startVitest } = await import('vitest/node');
  const loadedBefore = await checkerLoaded();
  const measure = async (label) => {
    const watch = tracker();
    const started = performance.now();
    const vitest = await startVitest(
      'test',
      SUITE_FILES,
      {
        watch: false,
        run: true,
        reporters: ['dot'],
        fileParallelism: false,
        maxWorkers: 1,
        isolate: false,
      },
      { root: join(repoRoot, 'packages/core') }
    );
    const memory = watch.stop();
    await vitest?.close();
    return { label, ms: Math.round(performance.now() - started), ...memory };
  };
  const cold = await measure('cold');
  const loadedAfterCold = await checkerLoaded();
  const warm = await measure('warm');
  return {
    workload: 'suite',
    note: 'The parser test files, in one process, twice. Cold includes Vitest startup. WASM loads only when a typed function is parsed.',
    files: SUITE_FILES,
    checkerLoadedBefore: loadedBefore,
    checkerLoadedAfterCold: loadedAfterCold,
    cold,
    warm,
  };
}

function runWorker(name) {
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url), '--worker', `--workload=${name}`],
      {
        // Vitest discovers configs from the working directory. Stay inside
        // @holoscript/core so a sibling package's config is not loaded.
        cwd: join(repoRoot, 'packages/core'),
        stdio: ['ignore', 'pipe', 'inherit'],
      }
    );
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('error', rejectWorker);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectWorker(new Error(`${name} worker exited ${code}\n${stdout}`));
        return;
      }
      const line = stdout
        .trim()
        .split('\n')
        .filter((entry) => entry.startsWith('COST_JSON:'))
        .pop();
      if (!line) {
        rejectWorker(new Error(`${name} worker printed no JSON\n${stdout}`));
        return;
      }
      resolveWorker(JSON.parse(line.slice('COST_JSON:'.length)));
    });
  });
}

if (workerMode) {
  const result = workload === 'suite' ? await runSuite() : await runSweep();
  process.stdout.write(`COST_JSON:${JSON.stringify(result)}\n`);
} else {
  const names = workload === 'both' ? ['sweep', 'suite'] : [workload];
  const results = [];
  for (const name of names) {
    results.push(await runWorker(name));
  }
  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
}
