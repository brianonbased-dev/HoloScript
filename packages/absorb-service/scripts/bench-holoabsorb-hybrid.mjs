#!/usr/bin/env node
/**
 * Real-repository HoloAbsorb hybrid recall and visual-focus benchmark.
 *
 * Full mode proves that parser-light tracked files are present in a real
 * graph/index and that exact-name fusion survives adversarial vector ranking.
 * Visual-focus-only mode keeps the same real graph/index pipeline but omits the
 * repository-specific safe-commit assertions so a bounded package corpus can
 * remeasure visual disambiguation without indexing an entire monorepo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const options = {
    repo: process.cwd(),
    out: '.bench-logs/holoabsorb-hybrid-recall.json',
    maxFiles: 10_000,
    topK: 5,
    visualFocusOnly: false,
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
    if (flag === '--visual-focus-only') options.visualFocusOnly = true;
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
  const queries = options.visualFocusOnly
    ? []
    : [
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
  const scanOptions = {
    rootDir: repoRoot,
    maxFiles: options.maxFiles,
    respectGitIgnore: true,
    includeUntracked: false,
  };
  const coverageInventoryLimit = 1_000_000;
  const coveragePlan = scanner.planScan({
    ...scanOptions,
    maxFiles: coverageInventoryLimit,
  });
  const scanResult = await scanner.scan(scanOptions);
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
  const checks = options.visualFocusOnly
    ? []
    : queryResults.map((run) => {
        const top3 = run.results.slice(0, 3).map((result) => result.file);
        return {
          query: run.query,
          requiredFilesInTop3: requiredFiles.filter((file) => top3.includes(file)),
          pass: requiredFiles.every((file) => top3.includes(file)),
        };
      });
  const cappedByMaxFiles = coveragePlan.totalFiles > options.maxFiles;
  checks.push({
    query: options.visualFocusOnly
      ? 'selected-root-corpus-coverage'
      : 'whole-repo-corpus-coverage',
    selectedCandidateFiles: coveragePlan.totalFiles,
    scannedFiles: scanResult.files.length,
    cappedByMaxFiles,
    pass:
      coveragePlan.totalFiles < coverageInventoryLimit &&
      !cappedByMaxFiles &&
      scanResult.files.length === coveragePlan.totalFiles,
  });
  const status =
    checks.every((check) => check.pass) && visualDisambiguation.check.pass ? 'pass' : 'fail';
  const artifact = {
    schemaVersion: 'holoscript.holoabsorb.hybrid-recall.v4',
    productName: 'HoloAbsorb',
    benchmarkProfile: options.visualFocusOnly
      ? 'real-code-visual-focus'
      : 'whole-repository-hybrid-recall',
    claimBoundary: options.visualFocusOnly
      ? 'Package-scoped real-code measurement of graph.holo structured selection over duplicate symbols. It does not claim whole-monorepo retrieval coverage or measure literal pixels, rendering, or human visual perception.'
      : 'Whole-selected-root hybrid exact-name recall plus graph.holo structured-selection disambiguation. Coverage is only claimed when the selected Git-tracked root is uncapped.',
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    implementation: {
      root: implementationRoot,
      head: git(implementationRoot, ['rev-parse', 'HEAD']),
      dirty: Boolean(git(implementationRoot, ['status', '--porcelain'])),
      benchmarkSourcePaths: [
        'packages/absorb-service/scripts/bench-holoabsorb-hybrid.mjs',
        'packages/absorb-service/src/engine/__tests__/VisualGraphAgentContext.test.ts',
      ],
      benchmarkSourceDirty: Boolean(
        git(implementationRoot, [
          'status',
          '--porcelain',
          '--',
          'packages/absorb-service/scripts/bench-holoabsorb-hybrid.mjs',
          'packages/absorb-service/src/engine/__tests__/VisualGraphAgentContext.test.ts',
        ])
      ),
    },
    repo: {
      root: repoRoot,
      head: git(repoRoot, ['rev-parse', 'HEAD']),
      dirty: Boolean(git(repoRoot, ['status', '--porcelain'])),
    },
    corpus: {
      maxFiles: options.maxFiles,
      selectedCandidateFiles: coveragePlan.totalFiles,
      files: scanResult.files.length,
      selectionMode: coveragePlan.selectionMode,
      coverageRatio: round(scanResult.files.length / Math.max(1, coveragePlan.totalFiles)),
      cappedByMaxFiles,
      coverageInventoryLimit,
      coverageInventoryCapped: coveragePlan.totalFiles >= coverageInventoryLimit,
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
    .filter(([name]) => /^[A-Za-z][A-Za-z0-9_]{2,}$/.test(name))
    .map(([name]) => name)
    .sort((a, b) => stableDigest(a).localeCompare(stableDigest(b)));
  const engine = new GraphRAGEngine(graph, index);
  const coldIndexStart = performance.now();
  new GraphSelectionManager(graph);
  const coldSelectionIndexMs = performance.now() - coldIndexStart;
  const warmIndexStart = performance.now();
  new GraphSelectionManager(graph);
  const warmSelectionIndexMs = performance.now() - warmIndexStart;
  const frozenCases = [];

  for (const query of duplicateNames) {
    if (frozenCases.length >= 20) break;
    const baselineStart = performance.now();
    const baseline = await engine.query(query, { topK });
    const baselineDurationMs = performance.now() - baselineStart;
    const sameName = baseline.results.filter((result) => result.symbol.name === query);
    if (sameName.length < 2) continue;

    // Freeze the target from the no-selection arm before any visual input is
    // applied. Every arm below reuses this exact target and adversarial choice.
    const target = sameName[sameName.length - 1].symbol;
    const wrongCandidate = sameName.find((result) => result.symbol.filePath !== target.filePath);
    if (!wrongCandidate) continue;
    const wrongTarget = wrongCandidate.symbol;
    const targetId = symbolIdentity(target);
    const wrongTargetId = symbolIdentity(wrongTarget);
    if (targetId === wrongTargetId) continue;
    const baselineRank = rankOf(baseline.results, targetId);
    const wrongBaselineRank = rankOf(baseline.results, wrongTargetId);
    if (baselineRank === 0 || wrongBaselineRank === 0) continue;

    frozenCases.push({
      query,
      target,
      targetId,
      wrongTarget,
      wrongTargetId,
      baseline,
      baselineDurationMs,
      baselineRank,
      wrongBaselineRank,
    });
  }

  const caseSetDigest = createHash('sha256')
    .update(
      JSON.stringify(
        frozenCases.map(({ query, targetId, wrongTargetId }) => ({
          query,
          targetId,
          wrongTargetId,
        }))
      )
    )
    .digest('hex');
  const cases = [];

  for (const frozen of frozenCases) {
    const {
      query,
      target,
      targetId,
      wrongTarget,
      wrongTargetId,
      baseline,
      baselineDurationMs,
      baselineRank,
      wrongBaselineRank,
    } = frozen;

    const correctManager = new GraphSelectionManager(graph);
    correctManager.select(makeSymbolObjectId(target));
    const correctFocus = correctManager.getVisualFocus();
    const correctStart = performance.now();
    const correct = await engine.query(query, { topK, visualFocus: correctFocus });
    const correctDurationMs = performance.now() - correctStart;

    const staleNodeId = `${makeSymbolObjectId(target)}:stale`;
    const staleManager = new GraphSelectionManager(graph);
    staleManager.select(staleNodeId);
    const staleFocus = staleManager.getVisualFocus();
    const staleStart = performance.now();
    const stale = await engine.query(query, { topK, visualFocus: staleFocus });
    const staleDurationMs = performance.now() - staleStart;

    const wrongManager = new GraphSelectionManager(graph);
    wrongManager.select(makeSymbolObjectId(wrongTarget));
    const wrongFocus = wrongManager.getVisualFocus();
    const wrongStart = performance.now();
    const wrong = await engine.query(query, { topK, visualFocus: wrongFocus });
    const wrongDurationMs = performance.now() - wrongStart;

    const correctRank = rankOf(correct.results, targetId);
    const staleRank = rankOf(stale.results, targetId);
    const wrongRank = rankOf(wrong.results, targetId);
    const wrongSelectedRank = rankOf(wrong.results, wrongTargetId);
    if (correctRank === 0 || staleRank === 0 || wrongRank === 0 || wrongSelectedRank === 0) {
      continue;
    }

    const baselineOrder = baseline.results.map((result) => symbolIdentity(result.symbol));
    const staleOrder = stale.results.map((result) => symbolIdentity(result.symbol));

    cases.push({
      query,
      fixedTarget: {
        nodeId: makeSymbolObjectId(target),
        file: target.filePath.replace(/\\/g, '/'),
      },
      suppliedWrongSelection: {
        nodeId: makeSymbolObjectId(wrongTarget),
        file: wrongTarget.filePath.replace(/\\/g, '/'),
      },
      staleNodeId,
      baselineRank,
      correctRank,
      staleRank,
      wrongRank,
      wrongSelectedBaselineRank: wrongBaselineRank,
      wrongSelectedRank,
      reciprocalRankBefore: round(1 / baselineRank),
      reciprocalRankAfterCorrectSelection: round(1 / correctRank),
      correctRankGain: baselineRank - correctRank,
      staleRankDelta: staleRank - baselineRank,
      wrongTargetRankDelta: wrongRank - baselineRank,
      staleExactRankingMatch: JSON.stringify(staleOrder) === JSON.stringify(baselineOrder),
      resolutionRates: {
        correct: correctFocus.resolutionRate,
        stale: staleFocus.resolutionRate,
        wrong: wrongFocus.resolutionRate,
      },
      latencyMs: {
        noSelection: round(baselineDurationMs),
        correctSelection: round(correctDurationMs),
        staleUnresolved: round(staleDurationMs),
        wrongResolved: round(wrongDurationMs),
      },
      correctScoreReceipt: correct.results[correctRank - 1]
        ? {
            score: correct.results[correctRank - 1].score,
            semanticScore: correct.results[correctRank - 1].semanticScore,
            connectionScore: correct.results[correctRank - 1].connectionScore,
            impactScore: correct.results[correctRank - 1].impactScore,
            visualScore: correct.results[correctRank - 1].visualScore,
            visualReasons: correct.results[correctRank - 1].visualReasons,
          }
        : null,
      wrongScoreReceipt: wrong.results[wrongSelectedRank - 1]
        ? {
            score: wrong.results[wrongSelectedRank - 1].score,
            visualScore: wrong.results[wrongSelectedRank - 1].visualScore,
            visualReasons: wrong.results[wrongSelectedRank - 1].visualReasons,
          }
        : null,
      wrongFixedTargetReceipt: wrong.results[wrongRank - 1]
        ? {
            score: wrong.results[wrongRank - 1].score,
            visualScore: wrong.results[wrongRank - 1].visualScore,
            visualReasons: wrong.results[wrongRank - 1].visualReasons,
          }
        : null,
    });
  }

  const baselineMrr = mean(cases.map((item) => 1 / item.baselineRank));
  const correctMrr = mean(cases.map((item) => 1 / item.correctRank));
  const staleMrr = mean(cases.map((item) => 1 / item.staleRank));
  const wrongMrr = mean(cases.map((item) => 1 / item.wrongRank));
  const baselineTop1 = mean(cases.map((item) => (item.baselineRank === 1 ? 1 : 0)));
  const correctTop1 = mean(cases.map((item) => (item.correctRank === 1 ? 1 : 0)));
  const staleTop1 = mean(cases.map((item) => (item.staleRank === 1 ? 1 : 0)));
  const wrongTop1 = mean(cases.map((item) => (item.wrongRank === 1 ? 1 : 0)));
  const meanCorrectRankGain = mean(cases.map((item) => item.correctRankGain));
  const correctResolutionRate = mean(cases.map((item) => item.resolutionRates.correct));
  const staleResolutionRate = mean(cases.map((item) => item.resolutionRates.stale));
  const wrongResolutionRate = mean(cases.map((item) => item.resolutionRates.wrong));
  const staleExactRankingMatchRate = mean(
    cases.map((item) => (item.staleExactRankingMatch ? 1 : 0))
  );
  const harmfulOverrideRate = mean(
    cases.map((item) => (item.wrongRank > item.baselineRank ? 1 : 0))
  );
  const wrongSelectionFollowRate = mean(
    cases.map((item) => (item.wrongSelectedRank === 1 ? 1 : 0))
  );
  const wrongFixedTargetBoostRate = mean(
    cases.map((item) => (item.wrongFixedTargetReceipt?.visualScore > 0 ? 1 : 0))
  );
  const wrongSelectionIsolationRate = 1 - wrongFixedTargetBoostRate;
  const meanWrongTargetRankDelta = mean(cases.map((item) => item.wrongTargetRankDelta));
  const arms = {
    noSelection: summarizeArm(cases, 'baselineRank', 'noSelection', null),
    correctSelection: summarizeArm(cases, 'correctRank', 'correctSelection', correctResolutionRate),
    staleUnresolved: summarizeArm(cases, 'staleRank', 'staleUnresolved', staleResolutionRate),
    wrongResolved: summarizeArm(cases, 'wrongRank', 'wrongResolved', wrongResolutionRate),
  };
  const check = {
    minimumCases: 5,
    measuredCases: cases.length,
    correctMrrImproves: correctMrr > baselineMrr,
    correctTop1AtLeast80Percent: correctTop1 >= 0.8,
    correctSelectionFullyResolved: correctResolutionRate === 1,
    staleSelectionFullyUnresolved: staleResolutionRate === 0,
    staleRankingBaselineEquivalent:
      staleExactRankingMatchRate === 1 && staleMrr === baselineMrr && staleTop1 === baselineTop1,
    wrongSelectionFullyResolved: wrongResolutionRate === 1,
    pass:
      cases.length >= 5 &&
      correctMrr > baselineMrr &&
      correctTop1 >= 0.8 &&
      correctResolutionRate === 1 &&
      staleResolutionRate === 0 &&
      staleExactRankingMatchRate === 1 &&
      staleMrr === baselineMrr &&
      staleTop1 === baselineTop1 &&
      wrongResolutionRate === 1,
  };

  return {
    methodology:
      'Freeze a real-repository duplicate-symbol case set from the no-selection ranking, hold the lowest-ranked same-name symbol as the target, and reuse it across four arms: no selection, the correct collision-safe graph.holo node ID, an unresolved stale ID, and a different resolved same-name node.',
    claimBoundary:
      'Correct selection measures whether visible graph intent can improve retrieval of a fixed target. Stale/unresolved selection must fail closed to the no-selection order. Wrong-but-resolved selection is valid caller-supplied intent: its steering and target-rank harm are reported diagnostically and are not mislabeled as model accuracy.',
    caseSet: {
      digestAlgorithm: 'sha256',
      digest: caseSetDigest,
      frozenBeforeVisualArms: true,
      reusedAcrossAllArms: true,
      targetRule: 'lowest-ranked same-name result in the no-selection arm',
      wrongSelectionRule:
        'highest-ranked different same-name result from a different file in the no-selection arm',
      samplingRule:
        'duplicate names matching a public-identifier shape, ordered by a stable SHA-256 digest instead of lexicographic prefix',
    },
    summary: {
      cases: cases.length,
      arms,
      baselineMrr: round(baselineMrr),
      focusedMrr: round(correctMrr),
      correctMrr: round(correctMrr),
      staleMrr: round(staleMrr),
      wrongMrr: round(wrongMrr),
      baselineTop1Rate: round(baselineTop1),
      focusedTop1Rate: round(correctTop1),
      correctTop1Rate: round(correctTop1),
      staleTop1Rate: round(staleTop1),
      wrongTop1Rate: round(wrongTop1),
      meanRankGain: round(meanCorrectRankGain),
      meanCorrectRankGain: round(meanCorrectRankGain),
      meanResolutionRate: round(correctResolutionRate),
      correctResolutionRate: round(correctResolutionRate),
      staleResolutionRate: round(staleResolutionRate),
      wrongResolutionRate: round(wrongResolutionRate),
      staleExactRankingMatchRate: round(staleExactRankingMatchRate),
      harmfulOverrideRate: round(harmfulOverrideRate),
      wrongSelectionFollowRate: round(wrongSelectionFollowRate),
      wrongFixedTargetBoostRate: round(wrongFixedTargetBoostRate),
      wrongSelectionIsolationRate: round(wrongSelectionIsolationRate),
      meanWrongTargetRankDelta: round(meanWrongTargetRankDelta),
      coldSelectionIndexMs: round(coldSelectionIndexMs),
      warmSelectionIndexMs: round(warmSelectionIndexMs),
      warmSelectionIndexSpeedup:
        warmSelectionIndexMs > 0 ? round(coldSelectionIndexMs / warmSelectionIndexMs) : null,
    },
    check,
    cases,
  };
}

function summarizeArm(cases, rankKey, latencyKey, resolutionRate) {
  const ranks = cases.map((item) => item[rankKey]);
  const latencies = cases.map((item) => item.latencyMs[latencyKey]);
  return {
    mrr: round(mean(ranks.map((rank) => 1 / rank))),
    top1Rate: round(mean(ranks.map((rank) => (rank === 1 ? 1 : 0)))),
    meanTargetRank: round(mean(ranks)),
    meanQueryMs: round(mean(latencies)),
    p95QueryMs: round(percentile(latencies, 0.95)),
    resolutionRate: resolutionRate === null ? null : round(resolutionRate),
  };
}

function symbolIdentity(symbol) {
  return `${symbol.filePath}:${symbol.line}:${symbol.owner ?? ''}:${symbol.name}`;
}

function stableDigest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rankOf(results, identity) {
  const index = results.findIndex((result) => symbolIdentity(result.symbol) === identity);
  return index < 0 ? 0 : index + 1;
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
