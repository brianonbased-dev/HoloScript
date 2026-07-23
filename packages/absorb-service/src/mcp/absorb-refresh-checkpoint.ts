import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import type { PlannedScanBatch, ScanPlan } from '../engine/CodebaseScanner';
import type { ScanResult } from '../engine/types';
import { resolveCodebaseCachePaths } from './codebase-cache-storage';

export const ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA =
  'holoscript.absorb-refresh-progress-receipt.v1';

type AbsorbRefreshStatus =
  | 'prepared'
  | 'scanning'
  | 'interrupted'
  | 'invalidated'
  | 'scanned'
  | 'complete';

export interface AbsorbRefreshCompletedBatch {
  index: number;
  label: string;
  candidateFiles: number;
  scannedFiles: number;
  resultFile: string;
  sha256: string;
}

export interface AbsorbRefreshProgressReceipt {
  schemaVersion: typeof ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA;
  kind: 'AbsorbRefreshProgressReceipt';
  resumeToken: string;
  rootDir: string;
  targetGitCommitHash: string | null;
  targetWorktreeFingerprint: string | null;
  planHash: string;
  selectedFilesHash: string;
  scanPolicyHash: string;
  status: AbsorbRefreshStatus;
  authoritative: false;
  cachePublished: boolean;
  priorAuthoritativeCachePreserved: boolean;
  resumable: boolean;
  totalCandidateFiles: number;
  totalBatches: number;
  completedBatchCount: number;
  completedCandidateFiles: number;
  remainingCandidateFiles: number;
  progressPercent: number;
  completedBatches: AbsorbRefreshCompletedBatch[];
  selection: {
    maxFiles: number;
    workspaceCandidateFiles: number | null;
    selectedCandidateFiles: number;
    truncated: boolean;
    truncationReason: 'maxFiles' | null;
  };
  receiptFile: string;
  checkpointDirectory: string;
  ownerProcessId: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface PrepareAbsorbRefreshCheckpointOptions {
  rootDir: string;
  scanPlan: ScanPlan;
  targetGitCommitHash: string | null;
  targetWorktreeFingerprint: string | null;
  scanPolicyHash: string;
  maxFiles: number;
  workspaceCandidateFiles?: number;
  resumeToken?: string;
}

function atomicWriteFileSync(targetPath: string, data: string): void {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
  );
  try {
    fs.writeFileSync(temporaryPath, data, 'utf-8');
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeRoot(rootDir: string): string {
  const normalized = path.normalize(path.resolve(rootDir)).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function normalizePlannedFile(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function buildSelectedFilesHash(plan: ScanPlan): string {
  return sha256(
    JSON.stringify(
      plan.batches.flatMap((batch) =>
        batch.files.map((filePath) => normalizePlannedFile(plan.rootDir, filePath))
      )
    )
  );
}

function buildPlanHash(plan: ScanPlan): string {
  return sha256(
    JSON.stringify({
      rootDir: normalizeRoot(plan.rootDir),
      rootDirs: plan.rootDirs.map(normalizeRoot),
      totalFiles: plan.totalFiles,
      batchSize: plan.batchSize,
      selectionMode: plan.selectionMode ?? 'filesystem',
      batches: plan.batches.map((batch) => ({
        index: batch.index,
        label: batch.label,
        files: batch.files.map((filePath) => normalizePlannedFile(plan.rootDir, filePath)),
      })),
    })
  );
}

function validateResumeToken(token: string): void {
  if (!/^[a-f0-9]{32}$/.test(token)) {
    throw new Error('resumeToken must be the 32-character token from an absorb progress receipt');
  }
}

function checkpointPaths(
  rootDir: string,
  resumeToken: string
): {
  directory: string;
  receiptFile: string;
} {
  const cacheDirectory = resolveCodebaseCachePaths(rootDir).directory;
  const directory = path.join(cacheDirectory, 'absorb-refreshes', resumeToken);
  return {
    directory,
    receiptFile: path.join(directory, 'progress-receipt.json'),
  };
}

function readReceipt(receiptFile: string): AbsorbRefreshProgressReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(receiptFile, 'utf-8'));
  } catch (error) {
    throw new Error(`Unable to read absorb refresh receipt: ${String(error)}`);
  }
  const receipt = parsed as Partial<AbsorbRefreshProgressReceipt>;
  if (
    receipt.schemaVersion !== ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA ||
    receipt.kind !== 'AbsorbRefreshProgressReceipt' ||
    typeof receipt.resumeToken !== 'string' ||
    !Array.isArray(receipt.completedBatches)
  ) {
    throw new Error('Absorb refresh receipt is missing required v1 fields');
  }
  return receipt as AbsorbRefreshProgressReceipt;
}

function isProcessAlive(processId: number): boolean {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

function validateResumedBatchResult(
  plan: ScanPlan,
  batch: PlannedScanBatch,
  result: ScanResult
): void {
  if (normalizeRoot(result.rootDir) !== normalizeRoot(plan.rootDir)) {
    throw new Error(`Checkpoint batch ${batch.index} root does not match the current scan plan`);
  }
  if (
    !Array.isArray(result.files) ||
    !result.stats ||
    result.stats.totalFiles !== result.files.length
  ) {
    throw new Error(`Checkpoint batch ${batch.index} has an invalid ScanResult shape`);
  }
  const selectedFiles = new Set(
    batch.files.map((filePath) => normalizePlannedFile(plan.rootDir, filePath))
  );
  const unexpectedFiles = result.files
    .map((file) => file.path.replace(/\\/g, '/'))
    .filter((filePath) => !selectedFiles.has(filePath));
  if (unexpectedFiles.length > 0) {
    throw new Error(
      `Checkpoint batch ${batch.index} contains files outside the selected set: ${unexpectedFiles
        .slice(0, 3)
        .join(', ')}`
    );
  }
}

export class AbsorbRefreshCheckpoint {
  private receipt: AbsorbRefreshProgressReceipt;

  constructor(
    private readonly plan: ScanPlan,
    receipt: AbsorbRefreshProgressReceipt
  ) {
    this.receipt = receipt;
  }

  progressReceipt(): AbsorbRefreshProgressReceipt {
    return structuredClone(this.receipt);
  }

  markScanning(): void {
    this.updateReceipt({
      status: 'scanning',
      resumable: true,
      error: undefined,
      ownerProcessId: process.pid,
    });
  }

  loadBatchResult(batch: PlannedScanBatch): ScanResult | null {
    const completed = this.receipt.completedBatches.find((entry) => entry.index === batch.index);
    if (!completed) return null;
    const expectedResultFile = `batch-${String(batch.index).padStart(5, '0')}.json`;
    if (
      completed.resultFile !== expectedResultFile ||
      completed.label !== batch.label ||
      completed.candidateFiles !== batch.files.length
    ) {
      throw new Error(`Checkpoint batch ${batch.index} metadata does not match the current plan`);
    }
    const resultFile = path.join(this.receipt.checkpointDirectory, completed.resultFile);
    let serialized: string;
    try {
      serialized = fs.readFileSync(resultFile, 'utf-8');
    } catch (error) {
      throw new Error(`Unable to read checkpoint batch ${batch.index}: ${String(error)}`);
    }
    if (sha256(serialized) !== completed.sha256) {
      throw new Error(`Checkpoint batch ${batch.index} failed its SHA-256 integrity check`);
    }
    const result = JSON.parse(serialized) as ScanResult;
    validateResumedBatchResult(this.plan, batch, result);
    return result;
  }

  persistBatch(batch: PlannedScanBatch, result: ScanResult): void {
    validateResumedBatchResult(this.plan, batch, result);
    const resultFile = `batch-${String(batch.index).padStart(5, '0')}.json`;
    const serialized = JSON.stringify(result);
    atomicWriteFileSync(path.join(this.receipt.checkpointDirectory, resultFile), serialized);

    const completedBatches = this.receipt.completedBatches
      .filter((entry) => entry.index !== batch.index)
      .concat({
        index: batch.index,
        label: batch.label,
        candidateFiles: batch.files.length,
        scannedFiles: result.files.length,
        resultFile,
        sha256: sha256(serialized),
      })
      .sort((left, right) => left.index - right.index);
    const completedCandidateFiles = completedBatches.reduce(
      (total, entry) => total + entry.candidateFiles,
      0
    );
    this.updateReceipt({
      status: 'scanning',
      completedBatches,
      completedBatchCount: completedBatches.length,
      completedCandidateFiles,
      remainingCandidateFiles: Math.max(
        0,
        this.receipt.totalCandidateFiles - completedCandidateFiles
      ),
      progressPercent:
        this.receipt.totalCandidateFiles === 0
          ? 100
          : Number(((completedCandidateFiles / this.receipt.totalCandidateFiles) * 100).toFixed(2)),
    });
  }

  markScanned(): void {
    this.updateReceipt({
      status: 'scanned',
      resumable: true,
      progressPercent: 100,
      remainingCandidateFiles: 0,
    });
  }

  markInterrupted(error: unknown): void {
    this.updateReceipt({
      status: 'interrupted',
      resumable: true,
      cachePublished: false,
      priorAuthoritativeCachePreserved: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  markInvalidated(error: unknown): void {
    this.updateReceipt({
      status: 'invalidated',
      resumable: false,
      cachePublished: false,
      priorAuthoritativeCachePreserved: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  markComplete(): void {
    this.updateReceipt({
      status: 'complete',
      resumable: false,
      cachePublished: true,
      priorAuthoritativeCachePreserved: false,
      progressPercent: 100,
      remainingCandidateFiles: 0,
      error: undefined,
    });
  }

  private updateReceipt(
    updates: Partial<AbsorbRefreshProgressReceipt> & {
      error?: string | undefined;
    }
  ): void {
    this.receipt = {
      ...this.receipt,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (updates.error === undefined) delete this.receipt.error;
    atomicWriteFileSync(this.receipt.receiptFile, JSON.stringify(this.receipt, null, 2));
  }
}

export function prepareAbsorbRefreshCheckpoint(
  options: PrepareAbsorbRefreshCheckpointOptions
): AbsorbRefreshCheckpoint {
  const rootDir = path.resolve(options.rootDir);
  const planHash = buildPlanHash(options.scanPlan);
  const selectedFilesHash = buildSelectedFilesHash(options.scanPlan);
  const resumeToken = options.resumeToken ?? randomUUID().replace(/-/g, '');
  validateResumeToken(resumeToken);
  const paths = checkpointPaths(rootDir, resumeToken);

  if (options.resumeToken) {
    const receipt = readReceipt(paths.receiptFile);
    const errors: string[] = [];
    if (receipt.resumeToken !== resumeToken) errors.push('resume token');
    if (normalizeRoot(receipt.rootDir) !== normalizeRoot(rootDir)) errors.push('repository root');
    if (receipt.targetGitCommitHash !== options.targetGitCommitHash) errors.push('git commit pin');
    if (receipt.targetWorktreeFingerprint !== options.targetWorktreeFingerprint) {
      errors.push('worktree fingerprint');
    }
    if (receipt.planHash !== planHash) errors.push('scan plan');
    if (receipt.selectedFilesHash !== selectedFilesHash) errors.push('selected file set');
    if (receipt.scanPolicyHash !== options.scanPolicyHash) errors.push('scan policy');
    if (receipt.status === 'complete') errors.push('completed checkpoint');
    if (
      receipt.status === 'scanning' &&
      receipt.ownerProcessId !== process.pid &&
      isProcessAlive(receipt.ownerProcessId)
    ) {
      errors.push(`active owner process ${receipt.ownerProcessId}`);
    }
    if (receipt.status === 'scanning' && receipt.ownerProcessId === process.pid) {
      errors.push(`active owner process ${receipt.ownerProcessId}`);
    }
    if (errors.length > 0) {
      throw new Error(`Absorb refresh checkpoint does not match: ${errors.join(', ')}`);
    }
    return new AbsorbRefreshCheckpoint(options.scanPlan, receipt);
  }

  fs.mkdirSync(paths.directory, { recursive: true });
  const now = new Date().toISOString();
  const workspaceCandidateFiles = Number.isFinite(options.workspaceCandidateFiles)
    ? Math.max(0, Math.floor(options.workspaceCandidateFiles!))
    : null;
  const truncated =
    workspaceCandidateFiles !== null && workspaceCandidateFiles > options.scanPlan.totalFiles;
  const receipt: AbsorbRefreshProgressReceipt = {
    schemaVersion: ABSORB_REFRESH_PROGRESS_RECEIPT_SCHEMA,
    kind: 'AbsorbRefreshProgressReceipt',
    resumeToken,
    rootDir,
    targetGitCommitHash: options.targetGitCommitHash,
    targetWorktreeFingerprint: options.targetWorktreeFingerprint,
    planHash,
    selectedFilesHash,
    scanPolicyHash: options.scanPolicyHash,
    status: 'prepared',
    authoritative: false,
    cachePublished: false,
    priorAuthoritativeCachePreserved: true,
    resumable: true,
    totalCandidateFiles: options.scanPlan.totalFiles,
    totalBatches: options.scanPlan.batches.length,
    completedBatchCount: 0,
    completedCandidateFiles: 0,
    remainingCandidateFiles: options.scanPlan.totalFiles,
    progressPercent: 0,
    completedBatches: [],
    selection: {
      maxFiles: options.maxFiles,
      workspaceCandidateFiles,
      selectedCandidateFiles: options.scanPlan.totalFiles,
      truncated,
      truncationReason: truncated ? 'maxFiles' : null,
    },
    receiptFile: paths.receiptFile,
    checkpointDirectory: paths.directory,
    ownerProcessId: process.pid,
    createdAt: now,
    updatedAt: now,
  };
  atomicWriteFileSync(paths.receiptFile, JSON.stringify(receipt, null, 2));
  return new AbsorbRefreshCheckpoint(options.scanPlan, receipt);
}
