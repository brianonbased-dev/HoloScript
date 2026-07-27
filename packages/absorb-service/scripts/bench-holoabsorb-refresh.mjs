#!/usr/bin/env node
/**
 * HoloAbsorb refresh resilience, resource safety, and visual-topology benchmark.
 *
 * All workloads use deterministic temporary Git repositories and isolated cache
 * roots. The benchmark never publishes into the operator's canonical graph
 * cache. It measures:
 *
 * - changed-symbol embedding reuse and compact MCP-shaped results;
 * - automatic refresh recovery while HEAD advances repeatedly;
 * - actual HEAD-check count and time inside the production refresh path;
 * - preflight host-memory refusal without cache replacement; and
 * - graph-to-scene file and import-edge fidelity on a bounded visual fixture.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { freemem, tmpdir } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
const MIB = 1024 * 1024;

function positiveInt(value, flag) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function positiveNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    out: null,
    files: 120,
    symbolsPerFile: 24,
    changedFiles: 15,
    churnCommits: 3,
    churnTriggerBatches: 1,
    visualFiles: 40,
    visualSymbolsPerFile: 8,
    maxResponseBytes: 64 * 1024,
    maxPeakRssDeltaMb: 512,
    maxDefaultHeadCheckOverheadRatio: 0.05,
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
    if (flag === '--churn-commits') options.churnCommits = positiveInt(value, flag);
    if (flag === '--churn-trigger-batches') {
      options.churnTriggerBatches = positiveInt(value, flag);
    }
    if (flag === '--visual-files') options.visualFiles = positiveInt(value, flag);
    if (flag === '--visual-symbols-per-file') {
      options.visualSymbolsPerFile = positiveInt(value, flag);
    }
    if (flag === '--max-response-bytes') options.maxResponseBytes = positiveInt(value, flag);
    if (flag === '--max-peak-rss-delta-mb') {
      options.maxPeakRssDeltaMb = positiveInt(value, flag);
    }
    if (flag === '--max-default-head-check-overhead-percent') {
      options.maxDefaultHeadCheckOverheadRatio = positiveNumber(value, flag) / 100;
    }
  }
  if (options.changedFiles > 20) {
    throw new Error('--changed-files must be <=20 for the bounded-delta acceptance gate');
  }
  if (options.changedFiles > options.files) {
    throw new Error('--changed-files cannot exceed --files');
  }
  if (options.churnCommits > 5) {
    throw new Error('--churn-commits must be <=5 for the bounded retry soak');
  }
  if (options.visualFiles < 2 || options.visualFiles > 50) {
    throw new Error('--visual-files must be between 2 and 50 for full default-scene coverage');
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
    const lines = [];
    if (fileIndex > 0) {
      lines.push(`import { module${fileIndex - 1}Symbol0 } from "./module-${fileIndex - 1}";`);
    }
    for (let symbolIndex = 0; symbolIndex < symbolsPerFile; symbolIndex += 1) {
      const expression =
        fileIndex > 0 && symbolIndex === 0
          ? `module${fileIndex - 1}Symbol0(input) + "${fileIndex}:${symbolIndex}"`
          : `input + "${fileIndex}:${symbolIndex}"`;
      lines.push(
        `export function module${fileIndex}Symbol${symbolIndex}(input: string): string { return ${expression}; }`
      );
    }
    writeFileSync(resolve(rootDir, 'src', `module-${fileIndex}.ts`), `${lines.join('\n')}\n`);
  }
  git(rootDir, ['add', 'src']);
  git(rootDir, ['commit', '-m', 'initial benchmark corpus']);
}

function appendFixtureDelta(rootDir, fileIndex, revision, commitMessage) {
  const sourcePath = resolve(rootDir, 'src', `module-${fileIndex}.ts`);
  const safeRevision = String(revision).replace(/[^a-zA-Z0-9_]/gu, '_');
  appendFileSync(
    sourcePath,
    `export function module${fileIndex}Delta${safeRevision}(input: string): string { return input.trim(); }\n`,
    'utf8'
  );
  git(rootDir, ['add', relative(rootDir, sourcePath).replace(/\\/g, '/')]);
  git(rootDir, ['commit', '-m', commitMessage]);
}

function changeFixture(rootDir, changedFiles) {
  for (let fileIndex = 0; fileIndex < changedFiles; fileIndex += 1) {
    const sourcePath = resolve(rootDir, 'src', `module-${fileIndex}.ts`);
    appendFileSync(
      sourcePath,
      `export function module${fileIndex}DeltaBaseline(input: string): string { return input.trim(); }\n`,
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
      durationMs: round(performance.now() - start, 3),
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

function sha256File(filePath) {
  return existsSync(filePath)
    ? createHash('sha256').update(readFileSync(filePath)).digest('hex')
    : null;
}

function findNamedFiles(rootDir, fileName) {
  if (!existsSync(rootDir)) return [];
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.name === fileName) found.push(entryPath);
    }
  };
  visit(rootDir);
  return found;
}

function readRefreshReceipts(cacheRoot) {
  return findNamedFiles(cacheRoot, 'progress-receipt.json')
    .map((receiptFile) => {
      try {
        return {
          ...JSON.parse(readFileSync(receiptFile, 'utf8')),
          receiptFile,
          receiptMtimeMs: statSync(receiptFile).mtimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.receiptMtimeMs - right.receiptMtimeMs);
}

function startChurnController({
  cacheRoot,
  fixtureRoot,
  files,
  churnCommits,
  triggerCompletedBatches,
}) {
  const events = [];
  const errors = [];
  const triggeredTargets = new Set();
  let busy = false;
  const timer = setInterval(() => {
    if (busy || events.length >= churnCommits) return;
    busy = true;
    try {
      const currentHead = git(fixtureRoot, ['rev-parse', 'HEAD']);
      const activeReceipt = readRefreshReceipts(cacheRoot)
        .reverse()
        .find(
          (receipt) =>
            receipt.status === 'scanning' &&
            receipt.targetGitCommitHash === currentHead &&
            receipt.completedBatchCount >= triggerCompletedBatches &&
            !triggeredTargets.has(receipt.targetGitCommitHash)
        );
      if (!activeReceipt) return;
      triggeredTargets.add(activeReceipt.targetGitCommitHash);
      const eventIndex = events.length;
      const fileIndex = Math.max(0, files - eventIndex - 1);
      appendFixtureDelta(
        fixtureRoot,
        fileIndex,
        `Churn${eventIndex + 1}`,
        `advance during absorb ${eventIndex + 1}`
      );
      events.push({
        index: eventIndex + 1,
        file: `src/module-${fileIndex}.ts`,
        receiptResumeToken: activeReceipt.resumeToken,
        completedBatchCountAtCommit: activeReceipt.completedBatchCount,
        beforeHead: currentHead,
        afterHead: git(fixtureRoot, ['rev-parse', 'HEAD']),
        committedAt: new Date().toISOString(),
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
    }
  }, 5);
  return {
    events,
    errors,
    stop() {
      clearInterval(timer);
    },
  };
}

function summarizeHeadCheckTrial(label, intervalMs, measurement) {
  const telemetry = measurement.value?.sourceDriftRetry ?? {};
  const headCheckDurationMs = Number(telemetry.headCheckDurationMs ?? 0);
  return {
    label,
    intervalMs,
    durationMs: measurement.durationMs,
    totalBatches: measurement.value?.refreshProgressReceipt?.totalBatches ?? null,
    headCheckCount: Number(telemetry.headCheckCount ?? 0),
    headCheckDurationMs,
    maxHeadCheckDurationMs: Number(telemetry.maxHeadCheckDurationMs ?? 0),
    effectiveCheckIntervalMs: Number(telemetry.effectiveCheckIntervalMs ?? intervalMs),
    headCheckOverheadRatio:
      measurement.durationMs > 0 ? round(headCheckDurationMs / measurement.durationMs, 6) : null,
  };
}

function analyzeVisualTopology(scene, files) {
  const objects = Array.isArray(scene?.objects) ? scene.objects : [];
  const edges = Array.isArray(scene?.edges) ? scene.edges : [];
  const objectIds = new Set(objects.map((object) => object.name));
  const fileRepresentative = new Map();
  for (const object of objects) {
    const filePath = object?.properties?.file;
    if (typeof filePath !== 'string') continue;
    const fileName = basename(filePath.replace(/\\/g, '/'));
    if (!fileRepresentative.has(fileName)) fileRepresentative.set(fileName, object.name);
  }

  const expectedFiles = Array.from({ length: files }, (_, index) => `module-${index}.ts`);
  const visibleExpectedFiles = expectedFiles.filter((file) => fileRepresentative.has(file));
  const expectedVisibleEdges = [];
  for (let index = 1; index < files; index += 1) {
    const from = fileRepresentative.get(`module-${index}.ts`);
    const to = fileRepresentative.get(`module-${index - 1}.ts`);
    if (from && to) expectedVisibleEdges.push(`${from}\0${to}`);
  }
  const expectedEdgeSet = new Set(expectedVisibleEdges);
  const actualEdgeSet = new Set(edges.map((edge) => `${edge.from}\0${edge.to}`));
  const matchedEdges = [...actualEdgeSet].filter((edge) => expectedEdgeSet.has(edge)).length;
  const spuriousEdges = [...actualEdgeSet].filter((edge) => !expectedEdgeSet.has(edge)).length;
  const finitePositions = objects.filter(
    (object) =>
      Array.isArray(object.position) &&
      object.position.length === 3 &&
      object.position.every(Number.isFinite)
  ).length;
  const uniquePositions = new Set(
    objects.map((object) =>
      Array.isArray(object.position) ? object.position.join(',') : 'invalid'
    )
  ).size;

  return {
    expectedFiles: files,
    visibleExpectedFiles: visibleExpectedFiles.length,
    fileCoverage: round(visibleExpectedFiles.length / Math.max(files, 1), 6),
    sceneObjects: objects.length,
    sceneEdges: edges.length,
    expectedVisibleEdges: expectedEdgeSet.size,
    matchedEdges,
    spuriousEdges,
    edgeRecall: expectedEdgeSet.size > 0 ? round(matchedEdges / expectedEdgeSet.size, 6) : null,
    edgePrecision: actualEdgeSet.size > 0 ? round(matchedEdges / actualEdgeSet.size, 6) : null,
    endpointIntegrity: edges.every((edge) => objectIds.has(edge.from) && objectIds.has(edge.to)),
    finitePositionRatio: round(finitePositions / Math.max(objects.length, 1), 6),
    uniquePositionRatio: round(uniquePositions / Math.max(objects.length, 1), 6),
  };
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'holoabsorb-refresh-bench-'));
  const cacheRoot = mkdtempSync(resolve(tmpdir(), 'holoabsorb-refresh-cache-'));
  const visualFixtureRoot = mkdtempSync(resolve(tmpdir(), 'holoabsorb-visual-bench-'));
  const visualCacheRoot = mkdtempSync(resolve(tmpdir(), 'holoabsorb-visual-cache-'));
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
    const cacheHashBeforeMemoryGuard = sha256File(graphCachePath);
    const unavailableReserveMb = Math.round(freemem() / MIB) + 1024;
    const memoryGuard = await measure(() =>
      handleCodebaseTool('holo_absorb_repo', {
        rootDir: fixtureRoot,
        outputFormat: 'graph',
        embeddingProvider: 'holoembed',
        force: true,
        minSystemFreeMb: unavailableReserveMb,
      })
    );
    const cacheHashAfterMemoryGuard = sha256File(graphCachePath);

    const churnController = startChurnController({
      cacheRoot,
      fixtureRoot,
      files: options.files,
      churnCommits: options.churnCommits,
      triggerCompletedBatches: options.churnTriggerBatches,
    });
    let churn;
    try {
      churn = await measure(() =>
        handleCodebaseTool('holo_absorb_repo', {
          rootDir: fixtureRoot,
          outputFormat: 'graph',
          embeddingProvider: 'holoembed',
          force: true,
          scanBatchSize: 4,
          autoRetrySourceDrift: true,
          maxSourceDriftRetries: options.churnCommits + 1,
          sourceDriftDebounceMs: 25,
          sourceDriftCheckIntervalMs: 0,
          minSystemFreeMb: 0,
        })
      );
    } finally {
      churnController.stop();
    }
    const churnHead = git(fixtureRoot, ['rev-parse', 'HEAD']);
    const churnReceipts = readRefreshReceipts(cacheRoot).map((receipt) => ({
      resumeToken: receipt.resumeToken,
      status: receipt.status,
      targetGitCommitHash: receipt.targetGitCommitHash,
      completedBatchCount: receipt.completedBatchCount,
      totalBatches: receipt.totalBatches,
      resumeMode: receipt.resumeMode ?? null,
      reusedBatchCount: receipt.reusedBatchCount ?? 0,
      invalidatedBatchCount: receipt.invalidatedBatchCount ?? 0,
      priorAuthoritativeCachePreserved: receipt.priorAuthoritativeCachePreserved,
      cachePublished: receipt.cachePublished,
    }));

    const headCheckMeasurements = [];
    for (const trial of [
      { label: 'control-single-check', intervalMs: 1_000_000_000 },
      { label: 'production-default', intervalMs: 1000 },
      { label: 'eager-every-batch', intervalMs: 0 },
    ]) {
      const measurement = await measure(() =>
        handleCodebaseTool('holo_absorb_repo', {
          rootDir: fixtureRoot,
          outputFormat: 'graph',
          embeddingProvider: 'holoembed',
          force: true,
          scanBatchSize: 1,
          autoRetrySourceDrift: false,
          sourceDriftCheckIntervalMs: trial.intervalMs,
          minSystemFreeMb: 0,
        })
      );
      headCheckMeasurements.push(
        summarizeHeadCheckTrial(trial.label, trial.intervalMs, measurement)
      );
    }
    const defaultHeadChecks = headCheckMeasurements.find(
      (trial) => trial.label === 'production-default'
    );
    const eagerHeadChecks = headCheckMeasurements.find(
      (trial) => trial.label === 'eager-every-batch'
    );

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

    createFixture(visualFixtureRoot, options.visualFiles, options.visualSymbolsPerFile);
    process.env.HOLOSCRIPT_CACHE_DIR = visualCacheRoot;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = visualFixtureRoot;
    resetCodebaseToolStateForTests();
    const visual = await measure(() =>
      handleCodebaseTool('holo_absorb_repo', {
        rootDir: visualFixtureRoot,
        outputFormat: 'holo',
        layout: 'force',
        interactive: true,
        embeddingProvider: 'holoembed',
        force: true,
        minSystemFreeMb: 0,
      })
    );
    const visualTopology = analyzeVisualTopology(
      visual.value?.interactiveScene,
      options.visualFiles
    );

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
      peakRssBounded: refreshed.peakRssDeltaBytes <= options.maxPeakRssDeltaMb * MIB,
      memoryGuardRefusedBeforePlanning:
        memoryGuard.value?.cancelled === true &&
        memoryGuard.value?.reason === 'system_memory_reserve_exhausted' &&
        memoryGuard.value?.phaseAtRequest === 'Initializing' &&
        memoryGuard.value?.memoryBudget?.systemReserveExhausted === true &&
        memoryGuard.value?.memoryBudget?.systemReserveExhaustedAtPhase ===
          'preflight resource guard',
      memoryGuardPreservedCache:
        cacheHashBeforeMemoryGuard !== null &&
        cacheHashBeforeMemoryGuard === cacheHashAfterMemoryGuard &&
        memoryGuard.value?.cachePreserved === true,
      churnCommitsApplied:
        churnController.events.length === options.churnCommits &&
        churnController.errors.length === 0,
      churnRecoveredAtLatestHead:
        churn.value?.error === undefined &&
        churn.value?.gitCommitHash === churnHead &&
        churn.value?.sourceDriftRetry?.detectionCount === options.churnCommits &&
        churn.value?.sourceDriftRetry?.retryCount === options.churnCommits &&
        churn.value?.sourceDriftRetry?.exhausted === false,
      churnReusedCheckpointWork:
        churn.value?.refreshProgressReceipt?.resumeMode === 'content-addressed-overlay' &&
        churn.value?.refreshProgressReceipt?.reusedBatchCount > 0,
      headCheckTelemetryPresent: headCheckMeasurements.every(
        (trial) =>
          trial.headCheckCount > 0 &&
          trial.headCheckDurationMs >= 0 &&
          trial.maxHeadCheckDurationMs >= 0
      ),
      defaultHeadChecksRateLimited:
        defaultHeadChecks?.headCheckCount > 0 &&
        eagerHeadChecks?.headCheckCount > defaultHeadChecks.headCheckCount,
      defaultHeadCheckOverheadBounded:
        defaultHeadChecks?.headCheckOverheadRatio !== null &&
        defaultHeadChecks.headCheckOverheadRatio <= options.maxDefaultHeadCheckOverheadRatio,
      eagerHeadChecksCoverBatches:
        eagerHeadChecks?.totalBatches > 0 &&
        eagerHeadChecks.headCheckCount >= eagerHeadChecks.totalBatches,
      freshProcessStatus:
        status?.graphAuthoritative === true &&
        status?.diskCache?.freshForCurrentRepo === true &&
        status?.diskCache?.gitCommitMatchesHead === true,
      freshProcessQuery:
        query?.error === undefined &&
        query?.result?.totalFiles === options.files &&
        query?.result?.totalSymbols === churn.value?.stats?.totalSymbols,
      visualFileCoverage: visualTopology.fileCoverage === 1,
      visualEdgeRecall: visualTopology.edgeRecall === 1,
      visualEdgePrecision: visualTopology.edgePrecision === 1,
      visualEndpointIntegrity: visualTopology.endpointIntegrity === true,
      visualFinitePositions: visualTopology.finitePositionRatio === 1,
    };
    const statusValue = Object.values(checks).every(Boolean) ? 'pass' : 'fail';
    const receipt = {
      schemaVersion: 'holoscript.holoabsorb.refresh-benchmark.v2',
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
        churnHead,
        churnCommits: options.churnCommits,
        churnTriggerBatches: options.churnTriggerBatches,
        visualFiles: options.visualFiles,
        visualSymbolsPerFile: options.visualSymbolsPerFile,
        retainedAt: options.keepFixture
          ? { refresh: fixtureRoot, visual: visualFixtureRoot }
          : null,
      },
      thresholds: {
        maxChangedFiles: 20,
        maxResponseBytes: options.maxResponseBytes,
        maxPeakRssDeltaBytes: options.maxPeakRssDeltaMb * MIB,
        maxDefaultHeadCheckOverheadRatio: options.maxDefaultHeadCheckOverheadRatio,
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
        memoryGuard: {
          durationMs: memoryGuard.durationMs,
          requestedMinSystemFreeMb: unavailableReserveMb,
          reason: memoryGuard.value?.reason ?? null,
          phaseAtRequest: memoryGuard.value?.phaseAtRequest ?? null,
          guardPhase: memoryGuard.value?.memoryBudget?.systemReserveExhaustedAtPhase ?? null,
          cachePreserved: memoryGuard.value?.cachePreserved ?? null,
          cacheHashBefore: cacheHashBeforeMemoryGuard,
          cacheHashAfter: cacheHashAfterMemoryGuard,
        },
        churn: {
          durationMs: churn.durationMs,
          events: churnController.events,
          controllerErrors: churnController.errors,
          sourceDriftRetry: churn.value?.sourceDriftRetry ?? null,
          refreshProgressReceipt: churn.value?.refreshProgressReceipt ?? null,
          observedCheckpointReceipts: churnReceipts,
        },
        headChecks: headCheckMeasurements,
        visual: {
          durationMs: visual.durationMs,
          totalFiles: visual.value?.stats?.totalFiles ?? null,
          totalSymbols: visual.value?.stats?.totalSymbols ?? null,
          totalImports: visual.value?.stats?.totalImports ?? null,
          holoSourceBytes:
            typeof visual.value?.holoSource === 'string'
              ? Buffer.byteLength(visual.value.holoSource, 'utf8')
              : 0,
          topology: visualTopology,
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
      claimBoundaries: [
        'The refresh, churn, memory, and visual workloads use deterministic temporary repositories and isolated caches; they do not mutate or publish into the live canonical HoloScript graph cache.',
        'HEAD-check overhead is measured inside the production source-pin path and is local-host specific; it is not a network or fleet throughput claim.',
        'The visual lane proves file coverage, import-edge fidelity, endpoint integrity, and finite spatial positions on a bounded synthetic graph. It does not prove that literal pixels improve agent answer accuracy.',
        'Literal-pixel agent-accuracy claims remain governed by the separately preregistered Paper 5 visual protocol and its external annotation/model-family custody gates.',
        'This benchmark is not a production-monorepo throughput claim.',
      ],
      claimBoundary:
        'This deterministic local corpus proves bounded refresh resilience and graph-to-scene topology fidelity; it is not a production-monorepo or visual-agent-superiority claim.',
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
    if (!options.keepFixture) {
      rmSync(fixtureRoot, { recursive: true, force: true });
      rmSync(visualFixtureRoot, { recursive: true, force: true });
    }
    rmSync(cacheRoot, { recursive: true, force: true });
    rmSync(visualCacheRoot, { recursive: true, force: true });
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
