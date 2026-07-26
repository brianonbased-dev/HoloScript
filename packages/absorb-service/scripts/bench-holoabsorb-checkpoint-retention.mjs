#!/usr/bin/env node
/**
 * HoloAbsorb durable-checkpoint benchmark.
 *
 * The benchmark plans the real repository, checkpoints every batch except the
 * last, then resumes the same scan. This records content-addressed batch reuse,
 * the one intentionally rescanned batch, wall time, compact versus full status
 * bytes, and bounded collection of synthetic legacy checkpoint directories.
 * Source files are read-only; all checkpoint state is written to a temporary
 * cache root.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const defaultRepoRoot = resolve(packageRoot, '../..');

function positiveInt(value, flag) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    repo: defaultRepoRoot,
    out: null,
    maxFiles: 30_000,
    batchSize: 100,
    legacyCheckpoints: 96,
    maxCheckpointDirectories: 4,
    maxCheckpointBytes: 1024 * 1024 * 1024,
    legacyPayloadBytes: 4_096,
    keepCache: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--keep-cache') {
      options.keepCache = true;
      continue;
    }
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith('--')) index += 1;
    if (flag === '--repo') options.repo = resolve(value);
    if (flag === '--out') options.out = value;
    if (flag === '--max-files') options.maxFiles = positiveInt(value, flag);
    if (flag === '--batch-size') options.batchSize = positiveInt(value, flag);
    if (flag === '--legacy-checkpoints') {
      options.legacyCheckpoints = positiveInt(value, flag);
    }
    if (flag === '--max-checkpoint-directories') {
      options.maxCheckpointDirectories = positiveInt(value, flag);
    }
    if (flag === '--max-checkpoint-bytes') {
      options.maxCheckpointBytes = positiveInt(value, flag);
    }
    if (flag === '--legacy-payload-bytes') {
      options.legacyPayloadBytes = positiveInt(value, flag);
    }
  }
  if (options.legacyCheckpoints <= options.maxCheckpointDirectories) {
    throw new Error('--legacy-checkpoints must exceed --max-checkpoint-directories');
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function directoryBytes(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) total += directoryBytes(entryPath);
    else if (entry.isFile()) total += statSync(entryPath).size;
  }
  return total;
}

function checkpointDirectoryCount(refreshDirectory) {
  return readdirSync(refreshDirectory, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && /^[a-f0-9]{32}$/.test(entry.name)
  ).length;
}

function writeReceipt(outPath, receipt, repoRoot) {
  if (!outPath) return;
  const resolved = resolve(repoRoot, outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function createLegacyCheckpointPressure({
  refreshDirectory,
  template,
  count,
  payloadBytes,
}) {
  const baseTime = Date.now() - (count + 1) * 1_000;
  for (let index = 0; index < count; index += 1) {
    const resumeToken = randomUUID().replace(/-/g, '');
    const checkpointDirectory = resolve(refreshDirectory, resumeToken);
    const receiptFile = resolve(checkpointDirectory, 'progress-receipt.json');
    const timestamp = new Date(baseTime + index * 1_000).toISOString();
    mkdirSync(checkpointDirectory, { recursive: true });
    writeFileSync(
      receiptFile,
      JSON.stringify(
        {
          ...template,
          resumeToken,
          status: 'complete',
          cachePublished: true,
          publishedGraphAuthoritative: true,
          priorAuthoritativeCachePreserved: false,
          resumable: false,
          completedBatchCount: 0,
          completedCandidateFiles: 0,
          remainingCandidateFiles: 0,
          progressPercent: 100,
          completedBatches: [],
          reusedBatchCount: 0,
          invalidatedBatchCount: 0,
          receiptFile,
          checkpointDirectory,
          ownerProcessId: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
          error: undefined,
        },
        null,
        2
      ),
      'utf8'
    );
    writeFileSync(resolve(checkpointDirectory, 'legacy-payload.bin'), Buffer.alloc(payloadBytes));
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const repoRoot = resolve(options.repo);
  if (!existsSync(resolve(repoRoot, '.git'))) {
    throw new Error(`--repo must be a Git worktree: ${repoRoot}`);
  }
  const cacheRoot = mkdtempSync(resolve(tmpdir(), 'holoabsorb-checkpoint-bench-'));
  const priorCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
  const priorCacheLayout = process.env.HOLOSCRIPT_CACHE_LAYOUT;
  const priorWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACE_ROOT;

  try {
    process.env.HOLOSCRIPT_CACHE_DIR = cacheRoot;
    process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoRoot;

    const [{ CodebaseScanner }, checkpointModule] = await Promise.all([
      import('../dist/engine/index.js'),
      import('../dist/mcp/index.js'),
    ]);
    const {
      compactAbsorbRefreshProgressReceipt,
      prepareAbsorbRefreshCheckpoint,
      pruneAbsorbRefreshCheckpoints,
    } = checkpointModule;

    const targetGitCommitHash = git(repoRoot, ['rev-parse', 'HEAD']);
    const worktreeStatus = git(repoRoot, ['status', '--porcelain=v1', '-uno']);
    const targetWorktreeFingerprint = worktreeStatus ? sha256(worktreeStatus) : null;
    const scanner = new CodebaseScanner(undefined, false);

    const planStartedAt = performance.now();
    const scanPlan = scanner.planScan(
      {
        rootDir: repoRoot,
        maxFiles: options.maxFiles,
        respectGitIgnore: true,
        includeUntracked: false,
      },
      options.batchSize
    );
    const planDurationMs = performance.now() - planStartedAt;
    if (scanPlan.batches.length === 0) throw new Error('The repository produced no scan batches');
    console.error(
      `[holoabsorb-checkpoints] planned ${scanPlan.totalFiles} files in ${scanPlan.batches.length} batches`
    );

    const scanPolicyHash = sha256(
      JSON.stringify({
        maxFiles: options.maxFiles,
        batchSize: options.batchSize,
        respectGitIgnore: true,
        includeUntracked: false,
      })
    );
    const checkpoint = prepareAbsorbRefreshCheckpoint({
      rootDir: repoRoot,
      scanPlan,
      targetGitCommitHash,
      targetWorktreeFingerprint,
      scanPolicyHash,
      maxFiles: options.maxFiles,
      workspaceCandidateFiles: scanPlan.totalFiles,
    });
    checkpoint.markScanning();

    const seededBatchCount = Math.max(0, scanPlan.batches.length - 1);
    const seedStartedAt = performance.now();
    let seededCandidateFiles = 0;
    for (const [batchOffset, batch] of scanPlan.batches
      .slice(0, seededBatchCount)
      .entries()) {
      const inputSha256 = checkpoint.captureBatchInput(batch);
      const result = await scanner.scanFiles(repoRoot, batch.files);
      if (!checkpoint.persistBatch(batch, result, inputSha256)) {
        throw new Error(`Source changed while checkpointing batch ${batch.index}`);
      }
      seededCandidateFiles += batch.files.length;
      if ((batchOffset + 1) % 10 === 0 || batchOffset + 1 === seededBatchCount) {
        console.error(
          `[holoabsorb-checkpoints] checkpointed ${batchOffset + 1}/${seededBatchCount} seed batches`
        );
      }
    }
    checkpoint.markInterrupted(new Error('intentional benchmark interruption'));
    const seedDurationMs = performance.now() - seedStartedAt;
    const interruptedReceipt = checkpoint.progressReceipt();

    const resumeStartedAt = performance.now();
    const resumed = prepareAbsorbRefreshCheckpoint({
      rootDir: repoRoot,
      scanPlan,
      targetGitCommitHash,
      targetWorktreeFingerprint,
      scanPolicyHash,
      maxFiles: options.maxFiles,
      workspaceCandidateFiles: scanPlan.totalFiles,
      resumeToken: interruptedReceipt.resumeToken,
    });
    resumed.markScanning();
    let reusedBatchCount = 0;
    let reusedCandidateFiles = 0;
    let rescannedBatchCount = 0;
    let rescannedCandidateFiles = 0;
    let totalParsedFiles = 0;
    let totalSymbols = 0;
    for (const [batchOffset, batch] of scanPlan.batches.entries()) {
      const inputSha256 = resumed.captureBatchInput(batch);
      let result = resumed.loadBatchResult(batch, inputSha256);
      if (result) {
        reusedBatchCount += 1;
        reusedCandidateFiles += batch.files.length;
      } else {
        result = await scanner.scanFiles(repoRoot, batch.files);
        if (!resumed.persistBatch(batch, result, inputSha256)) {
          throw new Error(`Source changed while resuming batch ${batch.index}`);
        }
        rescannedBatchCount += 1;
        rescannedCandidateFiles += batch.files.length;
      }
      totalParsedFiles += result.stats.totalFiles;
      totalSymbols += result.stats.totalSymbols;
      if ((batchOffset + 1) % 25 === 0 || batchOffset + 1 === scanPlan.batches.length) {
        console.error(
          `[holoabsorb-checkpoints] resumed ${batchOffset + 1}/${scanPlan.batches.length} batches`
        );
      }
    }
    resumed.markScanned();
    const resumeDurationMs = performance.now() - resumeStartedAt;
    const fullReceipt = resumed.progressReceipt();
    const compactReceipt = compactAbsorbRefreshProgressReceipt(fullReceipt);
    const fullStatusBytes = jsonBytes(fullReceipt);
    const compactStatusBytes = jsonBytes(compactReceipt);
    const checkpointBytes = directoryBytes(fullReceipt.checkpointDirectory);

    const refreshDirectory = dirname(fullReceipt.checkpointDirectory);
    createLegacyCheckpointPressure({
      refreshDirectory,
      template: fullReceipt,
      count: options.legacyCheckpoints,
      payloadBytes: options.legacyPayloadBytes,
    });
    const directoriesBeforeRetention = checkpointDirectoryCount(refreshDirectory);
    const retentionStartedAt = performance.now();
    const retention = pruneAbsorbRefreshCheckpoints({
      rootDir: repoRoot,
      preserveResumeTokens: [fullReceipt.resumeToken],
      maxDirectories: options.maxCheckpointDirectories,
      maxBytes: options.maxCheckpointBytes,
      terminalMaxAgeMs: Number.MAX_SAFE_INTEGER,
      resumableMaxAgeMs: Number.MAX_SAFE_INTEGER,
      unreadableMaxAgeMs: Number.MAX_SAFE_INTEGER,
    });
    const retentionWallTimeMs = performance.now() - retentionStartedAt;
    const directoriesAfterRetention = checkpointDirectoryCount(refreshDirectory);

    const checks = {
      fullCorpusSelected: scanPlan.totalFiles > 0 && scanPlan.totalFiles < options.maxFiles,
      allBatchesCovered:
        reusedBatchCount + rescannedBatchCount === scanPlan.batches.length &&
        reusedCandidateFiles + rescannedCandidateFiles === scanPlan.totalFiles,
      completedBatchesReused: reusedBatchCount === seededBatchCount,
      onlyInterruptedTailRescanned: rescannedBatchCount === scanPlan.batches.length - seededBatchCount,
      receiptReuseCountMatches: fullReceipt.reusedBatchCount === reusedBatchCount,
      compactStatusSmaller: compactStatusBytes < fullStatusBytes,
      compactStatusBounded: compactStatusBytes < 16 * 1024,
      legacyPressureObserved:
        directoriesBeforeRetention === options.legacyCheckpoints + 1 &&
        retention.discoveredDirectories === directoriesBeforeRetention,
      retentionBounded:
        directoriesAfterRetention <= options.maxCheckpointDirectories &&
        retention.retainedDirectories === directoriesAfterRetention &&
        retention.bytesAfter <= options.maxCheckpointBytes,
      retentionReclaimedDisk:
        retention.removedDirectories > 0 &&
        retention.bytesReclaimed > 0 &&
        retention.bytesAfter < retention.bytesBefore,
      protectedCheckpointRetained: existsSync(fullReceipt.checkpointDirectory),
      retentionClean: retention.failedRemovals.length === 0,
    };
    const status = Object.values(checks).every(Boolean) ? 'pass' : 'fail';
    const receipt = {
      schemaVersion: 'holoscript.holoabsorb.checkpoint-retention-benchmark.v1',
      productName: 'HoloAbsorb',
      status,
      completedAt: new Date().toISOString(),
      repository: {
        rootDir: repoRoot,
        commit: targetGitCommitHash,
        dirtyTrackedWorktree: Boolean(worktreeStatus),
        worktreeFingerprint: targetWorktreeFingerprint,
      },
      configuration: {
        maxFiles: options.maxFiles,
        batchSize: options.batchSize,
        legacyCheckpoints: options.legacyCheckpoints,
        maxCheckpointDirectories: options.maxCheckpointDirectories,
        maxCheckpointBytes: options.maxCheckpointBytes,
        legacyPayloadBytes: options.legacyPayloadBytes,
        retainedCacheRoot: options.keepCache ? cacheRoot : null,
      },
      corpus: {
        selectedFiles: scanPlan.totalFiles,
        totalBatches: scanPlan.batches.length,
        parsedFiles: totalParsedFiles,
        symbols: totalSymbols,
      },
      checkpointReuse: {
        seededBatchCount,
        seededCandidateFiles,
        reusedBatchCount,
        reusedCandidateFiles,
        rescannedBatchCount,
        rescannedCandidateFiles,
      },
      wallTimeMs: {
        plan: Math.round(planDurationMs * 1_000) / 1_000,
        seedCheckpoint: Math.round(seedDurationMs * 1_000) / 1_000,
        resume: Math.round(resumeDurationMs * 1_000) / 1_000,
        scanTotal: Math.round((seedDurationMs + resumeDurationMs) * 1_000) / 1_000,
        retention: Math.round(retentionWallTimeMs * 1_000) / 1_000,
      },
      statusPayloadBytes: {
        compact: compactStatusBytes,
        full: fullStatusBytes,
        completedBatchesOmitted: compactReceipt.completedBatchesOmitted,
      },
      disk: {
        activeCheckpointBytes: checkpointBytes,
        projectedBytesAtDirectoryCap: checkpointBytes * options.maxCheckpointDirectories,
        directoriesBeforeRetention,
        directoriesAfterRetention,
        bytesBeforeRetention: retention.bytesBefore,
        bytesAfterRetention: retention.bytesAfter,
        bytesReclaimed: retention.bytesReclaimed,
      },
      retention,
      checks,
      claimBoundary:
        'This receipt measures one read-only full-corpus scan of the named Git commit on this machine. It proves checkpoint reuse, payload compaction, and bounded temporary-cache retention for that run; it is not a universal throughput claim.',
    };
    writeReceipt(options.out, receipt, defaultRepoRoot);
    console.log(JSON.stringify(receipt, null, 2));
    return status === 'pass' ? 0 : 1;
  } finally {
    if (priorCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
    else process.env.HOLOSCRIPT_CACHE_DIR = priorCacheDir;
    if (priorCacheLayout === undefined) delete process.env.HOLOSCRIPT_CACHE_LAYOUT;
    else process.env.HOLOSCRIPT_CACHE_LAYOUT = priorCacheLayout;
    if (priorWorkspaceRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
    else process.env.HOLOSCRIPT_WORKSPACE_ROOT = priorWorkspaceRoot;
    if (!options.keepCache) rmSync(cacheRoot, { recursive: true, force: true });
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(
        `[bench-holoabsorb-checkpoint-retention] ${error instanceof Error ? error.stack : error}`
      );
      process.exit(1);
    }
  );
}
