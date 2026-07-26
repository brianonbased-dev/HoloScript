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
  /**
   * Digest of the ordered source paths and bytes that produced this result.
   * Older v1 receipts omit it and remain eligible only for exact-pin resume.
   */
  inputSha256?: string;
}

export type AbsorbRefreshResumeMode = 'new' | 'exact' | 'content-addressed-overlay';

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
  /**
   * Progress receipts are observational and never establish graph authority.
   * This remains false even after a successful publish.
   */
  authoritative: false;
  cachePublished: boolean;
  /**
   * True only after the graph and embedding generation passed their final
   * source pin and were atomically published. Optional for v1 receipt
   * compatibility; newly written receipts always include it.
   */
  publishedGraphAuthoritative?: boolean;
  priorAuthoritativeCachePreserved: boolean;
  resumable: boolean;
  totalCandidateFiles: number;
  totalBatches: number;
  completedBatchCount: number;
  completedCandidateFiles: number;
  remainingCandidateFiles: number;
  progressPercent: number;
  completedBatches: AbsorbRefreshCompletedBatch[];
  resumeMode?: AbsorbRefreshResumeMode;
  baseTargetGitCommitHash?: string | null;
  baseTargetWorktreeFingerprint?: string | null;
  reusedBatchCount?: number;
  invalidatedBatchCount?: number;
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
  /**
   * Adopt the newest compatible non-terminal checkpoint when no explicit
   * resumeToken is supplied. Source digests still gate every reused batch.
   */
  reuseLatest?: boolean;
}

export interface CompactAbsorbRefreshProgressReceipt extends Omit<
  AbsorbRefreshProgressReceipt,
  'completedBatches'
> {
  completedBatchesOmitted: number;
  latestCompletedBatch?: AbsorbRefreshCompletedBatch;
}

const TRANSIENT_ATOMIC_REPLACE_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);
const ATOMIC_REPLACE_RETRY_DELAYS_MS = [2, 4, 8, 16, 32, 50];
const atomicReplaceSleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function isTransientAtomicReplaceError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    TRANSIENT_ATOMIC_REPLACE_CODES.has(String((error as NodeJS.ErrnoException).code ?? ''))
  );
}

export function replaceFileWithRetry(
  temporaryPath: string,
  targetPath: string,
  renameFile: typeof fs.renameSync = fs.renameSync
): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameFile(temporaryPath, targetPath);
      return;
    } catch (error) {
      const delayMs = ATOMIC_REPLACE_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined || !isTransientAtomicReplaceError(error)) throw error;
      // Windows readers can briefly hold a sharing lock on the destination.
      // Keep the fully-written temp file and retry the atomic replace instead
      // of failing the entire resumable scan because an agent polled status.
      Atomics.wait(atomicReplaceSleepBuffer, 0, 0, delayMs);
    }
  }
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
    replaceFileWithRetry(temporaryPath, targetPath);
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

function buildBatchInputSha256(plan: ScanPlan, batch: PlannedScanBatch): string | null {
  const digest = createHash('sha256');
  for (const filePath of batch.files) {
    let source: Buffer;
    try {
      source = fs.readFileSync(filePath);
    } catch {
      return null;
    }
    const relativePath = normalizePlannedFile(plan.rootDir, filePath);
    digest.update(String(Buffer.byteLength(relativePath, 'utf-8')));
    digest.update(':');
    digest.update(relativePath);
    digest.update(':');
    digest.update(String(source.byteLength));
    digest.update(':');
    digest.update(source);
    digest.update('\0');
  }
  return digest.digest('hex');
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

export function compactAbsorbRefreshProgressReceipt(
  receipt: AbsorbRefreshProgressReceipt,
  includeCompletedBatches = false
): AbsorbRefreshProgressReceipt | CompactAbsorbRefreshProgressReceipt {
  if (includeCompletedBatches) return structuredClone(receipt);
  const { completedBatches, ...compact } = structuredClone(receipt);
  return {
    ...compact,
    completedBatchesOmitted: completedBatches.length,
    ...(completedBatches.length > 0 && {
      latestCompletedBatch: completedBatches[completedBatches.length - 1],
    }),
  };
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
  private readonly reusedBatchIndexes = new Set<number>();

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

  captureBatchInput(batch: PlannedScanBatch): string | null {
    return buildBatchInputSha256(this.plan, batch);
  }

  loadBatchResult(
    batch: PlannedScanBatch,
    currentInputSha256 = buildBatchInputSha256(this.plan, batch)
  ): ScanResult | null {
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
    if (completed.inputSha256) {
      if (currentInputSha256 !== completed.inputSha256) {
        this.dropCompletedBatch(batch.index);
        return null;
      }
    } else if (this.receipt.resumeMode === 'content-addressed-overlay') {
      this.dropCompletedBatch(batch.index);
      return null;
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
    if (!this.reusedBatchIndexes.has(batch.index)) {
      this.reusedBatchIndexes.add(batch.index);
      this.updateReceipt({
        reusedBatchCount: (this.receipt.reusedBatchCount ?? 0) + 1,
      });
    }
    return result;
  }

  persistBatch(
    batch: PlannedScanBatch,
    result: ScanResult,
    expectedInputSha256: string | null
  ): boolean {
    validateResumedBatchResult(this.plan, batch, result);
    const currentInputSha256 = buildBatchInputSha256(this.plan, batch);
    if (!expectedInputSha256 || currentInputSha256 !== expectedInputSha256) {
      this.dropCompletedBatch(batch.index);
      return false;
    }
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
        inputSha256: expectedInputSha256,
      })
      .sort((left, right) => left.index - right.index);
    this.updateCompletedBatches(completedBatches, { status: 'scanning' });
    return true;
  }

  markScanned(): void {
    this.updateReceipt({
      status: 'scanned',
      resumable: true,
      progressPercent:
        this.receipt.completedCandidateFiles === this.receipt.totalCandidateFiles
          ? 100
          : this.receipt.progressPercent,
      remainingCandidateFiles: Math.max(
        0,
        this.receipt.totalCandidateFiles - this.receipt.completedCandidateFiles
      ),
    });
  }

  markInterrupted(error: unknown): void {
    this.updateReceipt({
      status: 'interrupted',
      resumable: true,
      cachePublished: false,
      publishedGraphAuthoritative: false,
      priorAuthoritativeCachePreserved: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  markInvalidated(error: unknown): void {
    const contentAddressedResumeAvailable = this.receipt.completedBatches.every(
      (entry) => typeof entry.inputSha256 === 'string'
    );
    this.updateReceipt({
      status: 'invalidated',
      resumable: contentAddressedResumeAvailable,
      cachePublished: false,
      publishedGraphAuthoritative: false,
      priorAuthoritativeCachePreserved: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  markComplete(): void {
    this.updateReceipt({
      status: 'complete',
      resumable: false,
      cachePublished: true,
      publishedGraphAuthoritative: true,
      priorAuthoritativeCachePreserved: false,
      progressPercent: 100,
      remainingCandidateFiles: 0,
      error: undefined,
    });
  }

  prepareForResume(options: {
    targetGitCommitHash: string | null;
    targetWorktreeFingerprint: string | null;
    resumeMode: Exclude<AbsorbRefreshResumeMode, 'new'>;
  }): void {
    const targetChanged =
      this.receipt.targetGitCommitHash !== options.targetGitCommitHash ||
      this.receipt.targetWorktreeFingerprint !== options.targetWorktreeFingerprint;
    this.updateReceipt({
      status: 'prepared',
      resumable: true,
      cachePublished: false,
      publishedGraphAuthoritative: false,
      priorAuthoritativeCachePreserved: true,
      ownerProcessId: process.pid,
      resumeMode: options.resumeMode,
      reusedBatchCount: 0,
      invalidatedBatchCount: 0,
      ...(targetChanged && {
        baseTargetGitCommitHash: this.receipt.targetGitCommitHash,
        baseTargetWorktreeFingerprint: this.receipt.targetWorktreeFingerprint,
      }),
      targetGitCommitHash: options.targetGitCommitHash,
      targetWorktreeFingerprint: options.targetWorktreeFingerprint,
      error: undefined,
    });
  }

  private dropCompletedBatch(batchIndex: number): void {
    const completedBatches = this.receipt.completedBatches.filter(
      (entry) => entry.index !== batchIndex
    );
    if (completedBatches.length === this.receipt.completedBatches.length) return;
    this.updateCompletedBatches(completedBatches, {
      invalidatedBatchCount: (this.receipt.invalidatedBatchCount ?? 0) + 1,
    });
  }

  private updateCompletedBatches(
    completedBatches: AbsorbRefreshCompletedBatch[],
    updates: Partial<AbsorbRefreshProgressReceipt> = {}
  ): void {
    const completedCandidateFiles = completedBatches.reduce(
      (total, entry) => total + entry.candidateFiles,
      0
    );
    this.updateReceipt({
      ...updates,
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

function findLatestCompatibleCheckpoint(options: {
  rootDir: string;
  planHash: string;
  selectedFilesHash: string;
  scanPolicyHash: string;
  targetGitCommitHash: string | null;
  targetWorktreeFingerprint: string | null;
}): AbsorbRefreshProgressReceipt | null {
  const refreshDirectory = path.join(
    resolveCodebaseCachePaths(options.rootDir).directory,
    'absorb-refreshes'
  );
  let receiptFiles: Array<{ receiptFile: string; modifiedAt: number }>;
  try {
    receiptFiles = fs
      .readdirSync(refreshDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const receiptFile = path.join(refreshDirectory, entry.name, 'progress-receipt.json');
        try {
          return [{ receiptFile, modifiedAt: fs.statSync(receiptFile).mtimeMs }];
        } catch {
          return [];
        }
      })
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
  } catch {
    return null;
  }

  for (const candidate of receiptFiles) {
    let receipt: AbsorbRefreshProgressReceipt;
    try {
      receipt = readReceipt(candidate.receiptFile);
    } catch {
      continue;
    }
    const compatible =
      normalizeRoot(receipt.rootDir) === normalizeRoot(options.rootDir) &&
      receipt.planHash === options.planHash &&
      receipt.selectedFilesHash === options.selectedFilesHash &&
      receipt.scanPolicyHash === options.scanPolicyHash &&
      receipt.status !== 'complete' &&
      ((receipt.targetGitCommitHash === options.targetGitCommitHash &&
        receipt.targetWorktreeFingerprint === options.targetWorktreeFingerprint) ||
        receipt.completedBatches.every((entry) => typeof entry.inputSha256 === 'string')) &&
      !(
        receipt.status === 'scanning' &&
        (receipt.ownerProcessId === process.pid || isProcessAlive(receipt.ownerProcessId))
      );
    if (compatible) return receipt;
  }
  return null;
}

export function prepareAbsorbRefreshCheckpoint(
  options: PrepareAbsorbRefreshCheckpointOptions
): AbsorbRefreshCheckpoint {
  const rootDir = path.resolve(options.rootDir);
  const planHash = buildPlanHash(options.scanPlan);
  const selectedFilesHash = buildSelectedFilesHash(options.scanPlan);
  const reusableReceipt =
    !options.resumeToken && options.reuseLatest
      ? findLatestCompatibleCheckpoint({
          rootDir,
          planHash,
          selectedFilesHash,
          scanPolicyHash: options.scanPolicyHash,
          targetGitCommitHash: options.targetGitCommitHash,
          targetWorktreeFingerprint: options.targetWorktreeFingerprint,
        })
      : null;
  const resumeToken =
    options.resumeToken ?? reusableReceipt?.resumeToken ?? randomUUID().replace(/-/g, '');
  validateResumeToken(resumeToken);
  const paths = checkpointPaths(rootDir, resumeToken);

  if (options.resumeToken || reusableReceipt) {
    const receipt = reusableReceipt ?? readReceipt(paths.receiptFile);
    const errors: string[] = [];
    if (receipt.resumeToken !== resumeToken) errors.push('resume token');
    if (normalizeRoot(receipt.rootDir) !== normalizeRoot(rootDir)) errors.push('repository root');
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
    const targetChanged =
      receipt.targetGitCommitHash !== options.targetGitCommitHash ||
      receipt.targetWorktreeFingerprint !== options.targetWorktreeFingerprint;
    if (
      targetChanged &&
      receipt.completedBatches.some((entry) => typeof entry.inputSha256 !== 'string')
    ) {
      errors.push('content-addressed batch inputs');
    }
    if (errors.length > 0) {
      throw new Error(`Absorb refresh checkpoint does not match: ${errors.join(', ')}`);
    }
    const checkpoint = new AbsorbRefreshCheckpoint(options.scanPlan, receipt);
    checkpoint.prepareForResume({
      targetGitCommitHash: options.targetGitCommitHash,
      targetWorktreeFingerprint: options.targetWorktreeFingerprint,
      resumeMode: targetChanged ? 'content-addressed-overlay' : 'exact',
    });
    return checkpoint;
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
    publishedGraphAuthoritative: false,
    priorAuthoritativeCachePreserved: true,
    resumable: true,
    totalCandidateFiles: options.scanPlan.totalFiles,
    totalBatches: options.scanPlan.batches.length,
    completedBatchCount: 0,
    completedCandidateFiles: 0,
    remainingCandidateFiles: options.scanPlan.totalFiles,
    progressPercent: 0,
    completedBatches: [],
    resumeMode: 'new',
    reusedBatchCount: 0,
    invalidatedBatchCount: 0,
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
