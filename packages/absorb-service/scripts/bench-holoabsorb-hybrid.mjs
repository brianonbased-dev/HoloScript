#!/usr/bin/env node
/**
 * Real-repository HoloAbsorb hybrid exact-name recall benchmark.
 *
 * This is intentionally separate from the small Paper 5 bootstrap: it proves
 * that parser-light tracked files are present in a real graph/index and that
 * exact-name fusion survives adversarial vector ranking.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const options = {
    repo: process.cwd(),
    out: '.bench-logs/holoabsorb-hybrid-recall.json',
    maxFiles: 10_000,
    topK: 5,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith('--')) index += 1;
    if (flag === '--repo') options.repo = value;
    if (flag === '--out') options.out = value;
    if (flag === '--max-files') options.maxFiles = positiveInt(value, flag);
    if (flag === '--top-k') options.topK = positiveInt(value, flag);
  }
  return options;
}

function positiveInt(value, flag) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be positive`);
  return parsed;
}

function git(rootDir, args) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const enginePath = resolve(packageRoot, 'dist/engine/index.js');
  const {
    CodebaseGraph,
    CodebaseScanner,
    EmbeddingIndex,
    HoloEmbedProvider,
  } = await import(pathToFileURL(enginePath).href);
  const repoRoot = resolve(options.repo);
  const outPath = resolve(options.out);
  const queries = [
    'safe-commit',
    'safe-commit atomic wrapper that uses git commit --only with explicit paths',
  ];
  const startedAt = new Date().toISOString();
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 10);
  sampler.unref();

  const scanner = new CodebaseScanner(undefined, true);
  const setupStart = performance.now();
  const scanResult = await scanner.scan({
    rootDir: repoRoot,
    maxFiles: options.maxFiles,
    respectGitIgnore: true,
    includeUntracked: false,
  });
  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);
  const index = new EmbeddingIndex({
    provider: new HoloEmbedProvider(),
    batchSize: 100,
    useWorkers: false,
  });
  await index.buildIndex(graph);
  const setupMs = performance.now() - setupStart;

  const queryResults = [];
  for (const query of queries) {
    const queryStart = performance.now();
    const results = await index.searchHybrid(query, options.topK);
    queryResults.push({
      query,
      durationMs: round(performance.now() - queryStart),
      results: results.map((result, rank) => ({
        rank: rank + 1,
        file: result.file.replace(/\\/g, '/'),
        type: result.type,
        score: result.score,
        vectorScore: result.vectorScore,
        lexicalScore: result.lexicalScore,
        exactMatch: result.exactMatch,
        matchKind: result.matchKind,
      })),
    });
  }

  clearInterval(sampler);
  await index.dispose();
  await scanner.dispose();
  const requiredFiles = ['scripts/safe-commit.ps1', 'scripts/safe-commit.sh'];
  const checks = queryResults.map((run) => {
    const top3 = run.results.slice(0, 3).map((result) => result.file);
    return {
      query: run.query,
      requiredFilesInTop3: requiredFiles.filter((file) => top3.includes(file)),
      pass: requiredFiles.every((file) => top3.includes(file)),
    };
  });
  const status = checks.every((check) => check.pass) ? 'pass' : 'fail';
  const artifact = {
    schemaVersion: 'holoscript.holoabsorb.hybrid-recall.v1',
    productName: 'HoloAbsorb',
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    repo: {
      root: repoRoot,
      head: git(repoRoot, ['rev-parse', 'HEAD']),
      dirty: Boolean(git(repoRoot, ['status', '--porcelain'])),
    },
    corpus: {
      maxFiles: options.maxFiles,
      files: scanResult.files.length,
      graphSymbols: graph.getAllSymbols().length,
      indexedEntries: index.size,
      parserLightFileEntries: index.size - graph.getAllSymbols().length,
    },
    measurements: {
      setupMs: round(setupMs),
      baselineRssBytes: baselineRss,
      peakRssBytes: peakRss,
      peakRssDeltaBytes: Math.max(0, peakRss - baselineRss),
      queries: queryResults,
    },
    checks,
    hardware: {
      os: `${platform()} ${release()}`,
      node: process.version,
      cpuCount: cpus().length,
      cpuModel: cpus()[0]?.model ?? null,
      totalMemoryBytes: totalmem(),
      embeddingExecution: 'cpu',
    },
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status, outPath, corpus: artifact.corpus, checks }, null, 2));
  process.exitCode = status === 'pass' ? 0 : 1;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
