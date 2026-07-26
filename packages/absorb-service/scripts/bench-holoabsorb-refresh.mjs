#!/usr/bin/env node
/**
 * HoloAbsorb changed-symbol refresh and MCP payload benchmark.
 *
 * Builds a deterministic Git corpus, changes at most 20 files, forces a fresh
 * graph scan, and proves that the persisted HoloEmbed index reuses unchanged
 * symbol texts. It also gates the direct MCP-shaped result to a compact receipt
 * while verifying that the complete graph remains available in the atomic
 * cache to fresh-process status and query consumers.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');

function positiveInt(value, flag) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    out: null,
    files: 120,
    symbolsPerFile: 24,
    changedFiles: 15,
    maxResponseBytes: 64 * 1024,
    maxPeakRssDeltaMb: 512,
    keepFixture: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--keep-fixture') {
      options.keepFixture = true;
      continue;
    }
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith('--')) index += 1;
    if (flag === '--out') options.out = value;
    if (flag === '--files') options.files = positiveInt(value, flag);
    if (flag === '--symbols-per-file') options.symbolsPerFile = positiveInt(value, flag);
    if (flag === '--changed-files') options.changedFiles = positiveInt(value, flag);
    if (flag === '--max-response-bytes') options.maxResponseBytes = positiveInt(value, flag);
    if (flag === '--max-peak-rss-delta-mb') {
      options.maxPeakRssDeltaMb = positiveInt(value, flag);
    }
  }
  if (options.changedFiles > 20) {
    throw new Error('--changed-files must be <=20 for the bounded-delta acceptance gate');
  }
  if (options.changedFiles > options.files) {
    throw new Error('--changed-files cannot exceed --files');
  }
  return options;
}

function git(rootDir, args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createFixture(rootDir, files, symbolsPerFile) {
  mkdirSync(resolve(rootDir, 'src'), { recursive: true });
  git(rootDir, ['init']);
  git(rootDir, ['config', 'user.email', 'holoabsorb-benchmark@example.test']);
  git(rootDir, ['config', 'user.name', 'HoloAbsorb Benchmark']);
  for (let fileIndex = 0; fileIndex < files; fileIndex += 1) {
    const source = Array.from(
      { length: symbolsPerFile },
      (_, symbolIndex) =>
        `export function module${fileIndex}Symbol${symbolIndex}(input: string): string { return input + "${fileIndex}:${symbolIndex}"; }`
    ).join('\n');
    writeFileSync(resolve(rootDir, 'src', `module-${fileIndex}.ts`), `${source}\n`, 'utf8');
  }
  git(rootDir, ['add', 'src']);
  git(rootDir, ['commit', '-m', 'initial benchmark corpus']);
}

function changeFixture(rootDir, changedFiles) {
  for (let fileIndex = 0; fileIndex < changedFiles; fileIndex += 1) {
    appendFileSync(
      resolve(rootDir, 'src', `module-${fileIndex}.ts`),
      `export function module${fileIndex}Delta(input: string): string { return input.trim(); }\n`,
      'utf8'
    );
  }
  git(rootDir, ['add', 'src']);
  git(rootDir, ['commit', '-m', `change ${changedFiles} benchmark files`]);
}

async function measure(operation) {
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 5);
  sampler.unref();
  const start = performance.now();
  try {
    const value = await operation();
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    return {
      value,
      durationMs: Math.round((performance.now() - start) * 1000) / 1000,
      baselineRssBytes: baselineRss,
      peakRssBytes: peakRss,
      peakRssDeltaBytes: Math.max(0, peakRss - baselineRss),
    };
  } finally {
    clearInterval(sampler);
  }
}

function responseBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function writeReceipt(outPath, receipt) {
  if (!outPath) return;
  const resolved = resolve(repoRoot, outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'holoabsorb-refresh-bench-'));
  const cacheRoot = mkdtempSync(resolve(tmpdir(), 'holoabsorb-refresh-cache-'));
  const priorEnvironment = {
    cacheDir: process.env.HOLOSCRIPT_CACHE_DIR,
    cacheLayout: process.env.HOLOSCRIPT_CACHE_LAYOUT,
    workspaceRoot: process.env.HOLOSCRIPT_WORKSPACE_ROOT,
    autoBackground: process.env.ABSORB_AUTO_BACKGROUND,
  };

  try {
    createFixture(fixtureRoot, options.files, options.symbolsPerFile);
    process.env.HOLOSCRIPT_CACHE_DIR = cacheRoot;
    process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = fixtureRoot;
    process.env.ABSORB_AUTO_BACKGROUND = '0';

    const {
      handleCodebaseTool,
      resetCodebaseToolStateForTests,
      simulateAbsorbProcessRestartForTests,
    } = await import('../dist/mcp/codebase-tools.js');
    resetCodebaseToolStateForTests();

    const initial = await measure(() =>
      handleCodebaseTool('holo_absorb_repo', {
        rootDir: fixtureRoot,
        outputFormat: 'graph',
        embeddingProvider: 'holoembed',
        force: true,
      })
    );
    const initialHead = git(fixtureRoot, ['rev-parse', 'HEAD']);
    changeFixture(fixtureRoot, options.changedFiles);
    const refreshedHead = git(fixtureRoot, ['rev-parse', 'HEAD']);
    const refreshed = await measure(() =>
      handleCodebaseTool('holo_absorb_repo', {
        rootDir: fixtureRoot,
        outputFormat: 'graph',
        embeddingProvider: 'holoembed',
        force: true,
      })
    );

    const graphCachePath = resolve(cacheRoot, 'graph-cache.json');
    const graphCacheBytes = existsSync(graphCachePath)
      ? Buffer.byteLength(readFileSync(graphCachePath))
      : 0;
    const initialResponseBytes = responseBytes(initial.value);
    const refreshedResponseBytes = responseBytes(refreshed.value);
    const embeddingRefresh = refreshed.value?.embeddingRefresh ?? null;

    simulateAbsorbProcessRestartForTests();
    const status = await handleCodebaseTool('holo_graph_status', { forceRefresh: true });
    const query = await handleCodebaseTool('holo_query_codebase', {
      query: 'stats',
      queryType: 'stats',
    });

    const checks = {
      boundedDelta: options.changedFiles <= 20,
      initialGraphNotInlined:
        initial.value?.graph === undefined && initial.value?.graphPayload?.inline === false,
      refreshedGraphNotInlined:
        refreshed.value?.graph === undefined && refreshed.value?.graphPayload?.inline === false,
      initialResponseBounded: initialResponseBytes < options.maxResponseBytes,
      refreshedResponseBounded: refreshedResponseBytes < options.maxResponseBytes,
      graphCacheLargerThanResponse: graphCacheBytes > refreshedResponseBytes,
      changedSymbolReuse:
        embeddingRefresh?.kind === 'EmbeddingRefreshReceipt' &&
        embeddingRefresh.reusedSymbols > 0 &&
        embeddingRefresh.embeddedSymbols > 0 &&
        embeddingRefresh.embeddedSymbols < embeddingRefresh.totalSymbols,
      peakRssBounded:
        refreshed.peakRssDeltaBytes <= options.maxPeakRssDeltaMb * 1024 * 1024,
      freshProcessStatus:
        status?.graphAuthoritative === true &&
        status?.diskCache?.freshForCurrentRepo === true &&
        status?.diskCache?.gitCommitMatchesHead === true,
      freshProcessQuery:
        query?.error === undefined &&
        query?.result?.totalFiles === options.files &&
        query?.result?.totalSymbols === embeddingRefresh?.totalSymbols,
    };
    const statusValue = Object.values(checks).every(Boolean) ? 'pass' : 'fail';
    const receipt = {
      schemaVersion: 'holoscript.holoabsorb.refresh-benchmark.v1',
      productName: 'HoloAbsorb',
      status: statusValue,
      completedAt: new Date().toISOString(),
      repositoryCommit: git(repoRoot, ['rev-parse', 'HEAD']),
      fixture: {
        files: options.files,
        symbolsPerFile: options.symbolsPerFile,
        changedFiles: options.changedFiles,
        initialHead,
        refreshedHead,
        retainedAt: options.keepFixture ? fixtureRoot : null,
      },
      thresholds: {
        maxChangedFiles: 20,
        maxResponseBytes: options.maxResponseBytes,
        maxPeakRssDeltaBytes: options.maxPeakRssDeltaMb * 1024 * 1024,
      },
      measurements: {
        initial: {
          durationMs: initial.durationMs,
          responseBytes: initialResponseBytes,
          peakRssDeltaBytes: initial.peakRssDeltaBytes,
          totalFiles: initial.value?.stats?.totalFiles ?? null,
          totalSymbols: initial.value?.stats?.totalSymbols ?? null,
        },
        refreshed: {
          durationMs: refreshed.durationMs,
          responseBytes: refreshedResponseBytes,
          peakRssDeltaBytes: refreshed.peakRssDeltaBytes,
          embeddingRefresh,
        },
        graphCacheBytes,
        freshProcessStatus: {
          graphAuthoritative: status?.graphAuthoritative ?? null,
          freshForCurrentRepo: status?.diskCache?.freshForCurrentRepo ?? null,
          gitCommitMatchesHead: status?.diskCache?.gitCommitMatchesHead ?? null,
        },
        freshProcessQuery: query?.result ?? null,
      },
      checks,
      claimBoundary:
        'This deterministic local corpus proves bounded-delta reuse and compact MCP-shaped results; it is not a production-monorepo throughput claim.',
    };
    writeReceipt(options.out, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    return statusValue === 'pass' ? 0 : 1;
  } finally {
    if (priorEnvironment.cacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
    else process.env.HOLOSCRIPT_CACHE_DIR = priorEnvironment.cacheDir;
    if (priorEnvironment.cacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
    else process.env.HOLOSCRIPT_CACHE_LAYOUT = priorEnvironment.cacheLayout;
    if (priorEnvironment.workspaceRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
    else process.env.HOLOSCRIPT_WORKSPACE_ROOT = priorEnvironment.workspaceRoot;
    if (priorEnvironment.autoBackground === undefined) delete process.env.ABSORB_AUTO_BACKGROUND;
    else process.env.ABSORB_AUTO_BACKGROUND = priorEnvironment.autoBackground;
    if (!options.keepFixture) rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(cacheRoot, { recursive: true, force: true });
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[bench-holoabsorb-refresh] ${error instanceof Error ? error.stack : error}`);
      process.exit(1);
    }
  );
}
