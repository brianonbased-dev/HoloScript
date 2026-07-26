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
  const implementationRoot = resolve(packageRoot, '..', '..');
  const enginePath = resolve(packageRoot, 'dist/engine/index.js');
  const {
    CodebaseGraph,
    CodebaseScanner,
    EmbeddingIndex,
    GraphRAGEngine,
    GraphSelectionManager,
    HoloEmbedProvider,
    makeSymbolObjectId,
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

  const visualDisambiguation = await benchmarkVisualDisambiguation({
    graph,
    index,
    GraphRAGEngine,
    GraphSelectionManager,
    makeSymbolObjectId,
    topK: Math.max(options.topK, 20),
  });

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
  const status =
    checks.every((check) => check.pass) && visualDisambiguation.check.pass ? 'pass' : 'fail';
  const artifact = {
    schemaVersion: 'holoscript.holoabsorb.hybrid-recall.v2',
    productName: 'HoloAbsorb',
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    implementation: {
      root: implementationRoot,
      head: git(implementationRoot, ['rev-parse', 'HEAD']),
      dirty: Boolean(git(implementationRoot, ['status', '--porcelain'])),
    },
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
      visualDisambiguation,
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
  console.log(
    JSON.stringify(
      {
        status,
        outPath,
        corpus: artifact.corpus,
        checks,
        visualDisambiguation: visualDisambiguation.summary,
      },
      null,
      2
    )
  );
  process.exitCode = status === 'pass' ? 0 : 1;
}

async function benchmarkVisualDisambiguation({
  graph,
  index,
  GraphRAGEngine,
  GraphSelectionManager,
  makeSymbolObjectId,
  topK,
}) {
  const symbolsByName = new Map();
  for (const symbol of graph.getAllSymbols()) {
    if (!symbol.name || symbol.name.length < 3) continue;
    const symbols = symbolsByName.get(symbol.name) ?? [];
    symbols.push(symbol);
    symbolsByName.set(symbol.name, symbols);
  }

  const duplicateNames = Array.from(symbolsByName.entries())
    .filter(([, symbols]) => new Set(symbols.map((symbol) => symbol.filePath)).size > 1)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  const engine = new GraphRAGEngine(graph, index);
  const coldIndexStart = performance.now();
  new GraphSelectionManager(graph);
  const coldSelectionIndexMs = performance.now() - coldIndexStart;
  const warmIndexStart = performance.now();
  new GraphSelectionManager(graph);
  const warmSelectionIndexMs = performance.now() - warmIndexStart;
  const cases = [];

  for (const query of duplicateNames) {
    if (cases.length >= 20) break;
    const baseline = await engine.query(query, { topK });
    const sameName = baseline.results.filter((result) => result.symbol.name === query);
    if (sameName.length < 2) continue;

    // Deliberately choose the lowest-ranked same-name result. The benchmark
    // measures whether explicit visual intent can recover the selected overload,
    // not whether ambient retrieval happened to guess the user's target.
    const target = sameName[sameName.length - 1].symbol;
    const targetId = symbolIdentity(target);
    const manager = new GraphSelectionManager(graph);
    manager.select(makeSymbolObjectId(target));
    const visualFocus = manager.getVisualFocus();
    const focused = await engine.query(query, { topK, visualFocus });
    const baselineRank = rankOf(baseline.results, targetId);
    const focusedRank = rankOf(focused.results, targetId);
    if (baselineRank === 0 || focusedRank === 0) continue;

    cases.push({
      query,
      selectedNodeId: makeSymbolObjectId(target),
      selectedFile: target.filePath.replace(/\\/g, '/'),
      baselineRank,
      focusedRank,
      reciprocalRankBefore: round(1 / baselineRank),
      reciprocalRankAfter: round(1 / focusedRank),
      rankGain: baselineRank - focusedRank,
      resolutionRate: visualFocus.resolutionRate,
      focusedScoreReceipt: focused.results[focusedRank - 1]
        ? {
            score: focused.results[focusedRank - 1].score,
            semanticScore: focused.results[focusedRank - 1].semanticScore,
            connectionScore: focused.results[focusedRank - 1].connectionScore,
            impactScore: focused.results[focusedRank - 1].impactScore,
            visualScore: focused.results[focusedRank - 1].visualScore,
            visualReasons: focused.results[focusedRank - 1].visualReasons,
          }
        : null,
    });
  }

  const baselineMrr = mean(cases.map((item) => 1 / item.baselineRank));
  const focusedMrr = mean(cases.map((item) => 1 / item.focusedRank));
  const baselineTop1 = mean(cases.map((item) => (item.baselineRank === 1 ? 1 : 0)));
  const focusedTop1 = mean(cases.map((item) => (item.focusedRank === 1 ? 1 : 0)));
  const meanRankGain = mean(cases.map((item) => item.rankGain));
  const meanResolutionRate = mean(cases.map((item) => item.resolutionRate));
  const check = {
    minimumCases: 5,
    measuredCases: cases.length,
    focusedMrrImproves: focusedMrr > baselineMrr,
    focusedTop1AtLeast80Percent: focusedTop1 >= 0.8,
    fullSelectionResolution: meanResolutionRate === 1,
    pass:
      cases.length >= 5 &&
      focusedMrr > baselineMrr &&
      focusedTop1 >= 0.8 &&
      meanResolutionRate === 1,
  };

  return {
    methodology:
      'For each real-repository duplicate symbol name, select the lowest-ranked same-name candidate by its collision-safe graph.holo node ID, then compare GraphRAG rank before and after the explicit visual-focus receipt.',
    summary: {
      cases: cases.length,
      baselineMrr: round(baselineMrr),
      focusedMrr: round(focusedMrr),
      baselineTop1Rate: round(baselineTop1),
      focusedTop1Rate: round(focusedTop1),
      meanRankGain: round(meanRankGain),
      meanResolutionRate: round(meanResolutionRate),
      coldSelectionIndexMs: round(coldSelectionIndexMs),
      warmSelectionIndexMs: round(warmSelectionIndexMs),
      warmSelectionIndexSpeedup:
        warmSelectionIndexMs > 0 ? round(coldSelectionIndexMs / warmSelectionIndexMs) : null,
    },
    check,
    cases,
  };
}

function symbolIdentity(symbol) {
  return `${symbol.filePath}:${symbol.line}:${symbol.owner ?? ''}:${symbol.name}`;
}

function rankOf(results, identity) {
  const index = results.findIndex((result) => symbolIdentity(result.symbol) === identity);
  return index < 0 ? 0 : index + 1;
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
