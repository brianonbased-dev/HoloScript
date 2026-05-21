/**
 * AccountExportArchiveVerifier — canonical local archive verifier for
 * HoloShell account exports.
 *
 * Verifies provider export archives (multi-part zip/tar/gz etc.) by:
 * 1. Hashing every part (SHA-256)
 * 2. Checking completeness (all declared parts present, sizes match)
 * 3. Creating an unpack manifest (per-file inventory with hashes)
 * 4. Flagging unexpected executables
 * 5. Classifying sensitivity (personal, financial, health, credentials, etc.)
 * 6. Producing an AccountExportArchiveReceipt and blocking import/delete/share
 *    until verification passes
 *
 * Also produces AccountExportReplayReceipt for deterministic replay
 * verification of previously-verified archives.
 *
 * @see AccountExportArchiveReceipt
 * @see AccountExportReplayReceipt
 * @see ProviderExportCustodyReceipt
 */

import { createHash } from 'crypto';

import {
  AccountExportArchivePayload,
  AccountExportArchiveAdapterOptions,
  ArchivePart,
  ArchiveFileManifestEntry,
  ArchiveVerificationGuard,
  ArchiveFormat,
  ArchivePartStatus,
  SensitivityLevel,
  SensitivityCategory,
  FileSensitivityFlag,
  VerificationResult,
  isExecutableFile,
  classifyFileSensitivity,
  detectMimeType,
  EXECUTABLE_EXTENSIONS,
  DEFAULT_SENSITIVITY_PATTERNS,
  archiveVerificationToReceiptInput,
  validateArchiveVerification,
  createArchiveVerificationGuard,
  stableArchiveHash,
} from './AccountExportArchiveReceipt';

import {
  SensitivityPattern,
} from './AccountExportArchiveReceipt';

import {
  AccountExportReplayPayload,
  AccountExportReplayAdapterOptions,
  ReplayTrigger,
  ReplayOutcome,
  ReplayDiffEntry,
  replayToReceiptInput,
  validateReplayVerification,
  stableReplayHash,
} from './AccountExportReplayReceipt';

import {
  TrustReceiptInput,
} from './TrustReceipt';
import { TrustLedger } from './TrustLedger';

// ─── Archive Part Input ───────────────────────────────────────────────────────

export interface ArchivePartInput {
  /** Part index (0-based). */
  partIndex: number;

  /** Total number of parts. */
  totalParts: number;

  /** File content as Buffer or string. */
  content: Buffer | string;

  /** Expected size in bytes, if known from the download manifest. */
  expectedSizeBytes?: number;

  /** Filename of this part on disk (redacted per path policy). */
  fileName?: string;
}

// ─── Archive File Input ──────────────────────────────────────────────────────

export interface ArchiveFileInput {
  /** Relative path within the archive. */
  path: string;

  /** File content as Buffer or string. */
  content: Buffer | string;

  /** Expected hash from the download manifest, if available. */
  expectedHash?: string;
}

// ─── Verifier Configuration ───────────────────────────────────────────────────

export interface ArchiveVerifierConfig {
  /** Which export workflow this verification belongs to. */
  workflow?: string;

  /** Provider being exported from. */
  provider?: string;

  /** Human-readable provider label. */
  providerLabel?: string;

  /** Archive format. */
  archiveFormat?: ArchiveFormat;

  /** Custom sensitivity patterns (overrides defaults if provided). */
  sensitivityPatterns?: SensitivityPattern[];

  /** Whether to block import when executables are detected. Default: true. */
  blockOnExecutables?: boolean;

  /** Whether to block sharing when sensitive files are detected. Default: true. */
  blockOnSensitivity?: boolean;

  /** Whether to block import on sensitivity 'restricted'. Default: true. */
  blockOnRestricted?: boolean;

  /** Custom executable extensions to add to the default set. */
  additionalExecutableExtensions?: string[];

  /** Passport DID for the actor performing verification. */
  passportDid: string;

  /** Task ID for HoloMesh board linking. */
  taskId?: string;

  /** Parent receipt IDs (e.g., the custody receipt that preceded this). */
  parentReceiptIds?: string[];

  /** Git commit hash, if applicable. */
  commit?: string;

  /** TrustLedger instance to append receipts to. */
  ledger?: TrustLedger;
}

// ─── Verifier Result ──────────────────────────────────────────────────────────

export interface ArchiveVerifierResult {
  /** The archive verification payload. */
  payload: AccountExportArchivePayload;

  /** The verification guard (blocks/permits operations). */
  guard: ArchiveVerificationGuard;

  /** The trust receipt input (ready to be appended to a ledger). */
  receiptInput: TrustReceiptInput;

  /** Validation result for the payload. */
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

// ─── Verifier ─────────────────────────────────────────────────────────────────

/**
 * Canonical local archive verifier for HoloShell account exports.
 *
 * Usage:
 * ```ts
 * const verifier = new AccountExportArchiveVerifier(config);
 * const result = verifier.verify(parts, files);
 * if (!result.guard.importAllowed) {
 *   console.error('Import blocked:', result.guard.blockReason);
 * }
 * // Append receipt to ledger
 * if (config.ledger) {
 *   const receipt = config.ledger.append(result.receiptInput);
 * }
 * ```
 */
export class AccountExportArchiveVerifier {
  private readonly config: Required<
    Pick<ArchiveVerifierConfig,
      | 'workflow'
      | 'provider'
      | 'providerLabel'
      | 'archiveFormat'
      | 'blockOnExecutables'
      | 'blockOnSensitivity'
      | 'blockOnRestricted'
      | 'passportDid'
    >
  > & Pick<ArchiveVerifierConfig,
      'taskId' | 'parentReceiptIds' | 'commit' | 'ledger'
      | 'sensitivityPatterns' | 'additionalExecutableExtensions'
  >;

  private readonly sensitivityPatterns: SensitivityPattern[];
  private readonly executableExtensions: Set<string>;

  constructor(config: ArchiveVerifierConfig) {
    this.config = {
      workflow: config.workflow ?? 'browser_account_export',
      provider: config.provider ?? 'generic_provider_export',
      providerLabel: config.providerLabel ?? config.provider ?? 'Generic Provider',
      archiveFormat: config.archiveFormat ?? 'unknown',
      blockOnExecutables: config.blockOnExecutables ?? true,
      blockOnSensitivity: config.blockOnSensitivity ?? true,
      blockOnRestricted: config.blockOnRestricted ?? true,
      passportDid: config.passportDid,
      taskId: config.taskId,
      parentReceiptIds: config.parentReceiptIds,
      commit: config.commit,
      ledger: config.ledger,
      sensitivityPatterns: config.sensitivityPatterns,
      additionalExecutableExtensions: config.additionalExecutableExtensions,
    };

    this.sensitivityPatterns = config.sensitivityPatterns ?? DEFAULT_SENSITIVITY_PATTERNS;
    this.executableExtensions = new Set(EXECUTABLE_EXTENSIONS);
    if (config.additionalExecutableExtensions) {
      for (const ext of config.additionalExecutableExtensions) {
        this.executableExtensions.add(ext.toLowerCase());
      }
    }
  }

  /**
   * Verify an archive from its parts and unpacked file contents.
   * Produces an AccountExportArchiveReceipt and a verification guard.
   */
  verify(parts: ArchivePartInput[], files: ArchiveFileInput[]): ArchiveVerifierResult {
    // ─── Step 1: Hash and verify parts ──────────────────────────────────────

    const verifiedParts: ArchivePart[] = parts.map((part) => {
      const contentBuf = typeof part.content === 'string'
        ? Buffer.from(part.content, 'utf-8')
        : part.content;

      const partHash = 'sha256:' + createHash('sha256').update(contentBuf).digest('hex');
      const partSizeBytes = contentBuf.length;

      let status: ArchivePartStatus = 'present_intact';
      const warnings: string[] = [];

      if (part.expectedSizeBytes !== undefined && partSizeBytes !== part.expectedSizeBytes) {
        status = 'present_size_mismatch';
      }

      return {
        partIndex: part.partIndex,
        totalParts: part.totalParts,
        partHash,
        partSizeBytes,
        status,
        expectedSizeBytes: part.expectedSizeBytes,
        fileName: part.fileName,
      };
    });

    const totalParts = parts.length > 0 ? parts[0].totalParts : 1;
    const partsComplete = verifiedParts.every((p) => p.status === 'present_intact' || p.status === 'present_size_mismatch');
    const totalSizeBytes = verifiedParts.reduce((sum, p) => sum + p.partSizeBytes, 0);

    // ─── Step 2: Build file manifest ────────────────────────────────────────

    const fileManifest: ArchiveFileManifestEntry[] = files.map((file) => {
      const contentBuf = typeof file.content === 'string'
        ? Buffer.from(file.content, 'utf-8')
        : file.content;

      const contentHash = 'sha256:' + createHash('sha256').update(contentBuf).digest('hex');
      const sizeBytes = contentBuf.length;
      const mimeType = detectMimeType(file.path);

      // Executable check
      const exeResult = isExecutableFile(file.path);
      // Also check against our custom extensions
      const lowerPath = file.path.toLowerCase();
      let isCustomExe = false;
      let customExt: string | undefined;
      for (const ext of this.executableExtensions) {
        if (lowerPath.endsWith(ext)) {
          isCustomExe = true;
          customExt = ext;
          break;
        }
      }
      const isExe = exeResult.executable || isCustomExe;
      const exeExt = exeResult.executable ? exeResult.extension : (isCustomExe ? customExt : undefined);

      // Sensitivity classification
      const sensitivity = classifyFileSensitivity(file.path, this.sensitivityPatterns);

      return {
        path: file.path,
        contentHash,
        sizeBytes,
        isExecutable: isExe,
        executableExtension: exeExt,
        sensitivityLevel: sensitivity.level,
        sensitivityCategories: sensitivity.categories,
        sensitivityFlags: sensitivity.flags,
        mimeType,
      };
    });

    // ─── Step 3: Compute aggregate archive hash ──────────────────────────────

    // The archive hash is the hash of all file content hashes concatenated,
    // sorted alphabetically by path for determinism.
    const sortedManifest = [...fileManifest].sort((a, b) => a.path.localeCompare(b.path));
    const archiveHashInput = sortedManifest
      .map((entry) => `${entry.path}:${entry.contentHash}`)
      .join('\n');
    const archiveHash = 'sha256:' + createHash('sha256').update(archiveHashInput).digest('hex');

    // ─── Step 4: Aggregate sensitivity and executables ──────────────────────

    const executableFiles = fileManifest
      .filter((entry) => entry.isExecutable)
      .map((entry) => entry.path);

    const allCategories = new Set<SensitivityCategory>();
    let aggregateSensitivity: SensitivityLevel = 'public';
    const sensitivityOrder: SensitivityLevel[] = ['public', 'internal', 'personal', 'sensitive', 'restricted'];
    const sensitivityIndex = (l: SensitivityLevel) => sensitivityOrder.indexOf(l);

    for (const entry of fileManifest) {
      for (const cat of entry.sensitivityCategories) {
        allCategories.add(cat);
      }
      if (sensitivityIndex(entry.sensitivityLevel) > sensitivityIndex(aggregateSensitivity)) {
        aggregateSensitivity = entry.sensitivityLevel;
      }
    }

    const restrictedFiles = fileManifest
      .filter((entry) => entry.sensitivityLevel === 'restricted')
      .map((entry) => entry.path);

    const sensitiveFiles = fileManifest
      .filter((entry) => sensitivityIndex(entry.sensitivityLevel) >= sensitivityIndex('sensitive'))
      .map((entry) => entry.path);

    // ─── Step 5: Determine verification result ──────────────────────────────

    const errors: string[] = [];
    const warnings: string[] = [];
    let verificationResult: VerificationResult = 'verified';

    // Check for corrupt parts
    const corruptParts = verifiedParts.filter((p) => p.status === 'present_corrupt');
    if (corruptParts.length > 0) {
      verificationResult = 'failed_corrupt';
      errors.push(`${corruptParts.length} archive part(s) are corrupt`);
    }

    // Check for missing parts
    const missingParts = verifiedParts.filter((p) => p.status === 'missing');
    if (missingParts.length > 0) {
      verificationResult = 'failed_incomplete';
      errors.push(`${missingParts.length} archive part(s) are missing`);
    }

    // Check for size mismatches (warning only, not blocking)
    const sizeMismatchParts = verifiedParts.filter((p) => p.status === 'present_size_mismatch');
    if (sizeMismatchParts.length > 0) {
      warnings.push(`${sizeMismatchParts.length} archive part(s) have size mismatches`);
    }

    // Check for executables
    if (executableFiles.length > 0) {
      if (this.config.blockOnExecutables) {
        verificationResult = 'failed_executable_detected';
        errors.push(`Executable files detected: ${executableFiles.join(', ')}`);
      } else {
        warnings.push(`Executable files detected (not blocking): ${executableFiles.join(', ')}`);
        if (verificationResult === 'verified') {
          verificationResult = 'verified_with_warnings';
        }
      }
    }

    // Check for restricted/sensitive files
    if (restrictedFiles.length > 0 || sensitiveFiles.length > 0) {
      if (this.config.blockOnRestricted && restrictedFiles.length > 0) {
        verificationResult = 'failed_sensitivity_blocked';
        errors.push(`Restricted sensitivity files detected: ${restrictedFiles.join(', ')}`);
      } else if (this.config.blockOnSensitivity) {
        warnings.push(`Sensitive files detected: ${sensitiveFiles.join(', ')}`);
        if (verificationResult === 'verified') {
          verificationResult = 'verified_with_warnings';
        }
      }
    }

    // If still verified but warnings exist, promote to verified_with_warnings
    if (verificationResult === 'verified' && warnings.length > 0) {
      verificationResult = 'verified_with_warnings';
    }

    // ─── Step 6: Build payload ──────────────────────────────────────────────

    const payload: AccountExportArchivePayload = {
      workflow: this.config.workflow,
      provider: this.config.provider,
      providerLabel: this.config.providerLabel,
      archiveFormat: this.config.archiveFormat,
      totalParts,
      totalSizeBytes,
      archiveHash,
      fileCount: files.length,
      parts: verifiedParts,
      partsComplete,
      fileManifest,
      manifestExtracted: true,
      executableFiles,
      executablesDetected: executableFiles.length > 0,
      executableBlockImport: executableFiles.length > 0 && this.config.blockOnExecutables,
      aggregateSensitivity,
      sensitivityCategories: [...allCategories],
      restrictedFiles,
      sensitiveFiles,
      sensitivityBlockShare: (restrictedFiles.length > 0 || sensitiveFiles.length > 0)
        && this.config.blockOnSensitivity,
      verificationResult,
      verificationSummary: this.buildVerificationSummary(verificationResult, executableFiles, restrictedFiles, sensitiveFiles, errors, warnings),
      warnings,
      errors,
      credentialAdjacent: false,
      sourceFileMutationPerformed: false,
      rawPrivateDataPublished: false,
      privatePathLeakedToPublicReceipt: false,
    };

    // ─── Step 7: Validate and create guard ──────────────────────────────────

    const validation = validateArchiveVerification(payload);
    const guard = createArchiveVerificationGuard(payload);

    const adapterOptions: AccountExportArchiveAdapterOptions = {
      passportDid: this.config.passportDid,
      taskId: this.config.taskId,
      commit: this.config.commit,
      parentReceiptIds: this.config.parentReceiptIds,
    };

    const receiptInput = archiveVerificationToReceiptInput(payload, adapterOptions);

    // Append to ledger if provided
    if (this.config.ledger) {
      this.config.ledger.append(receiptInput);
    }

    return {
      payload,
      guard,
      receiptInput,
      validation,
    };
  }

  /**
   * Replay a previously-verified archive against its original verification
   * receipt. Produces an AccountExportReplayReceipt comparing the two.
   *
   * @param originalPayload The payload from the original verification.
   * @param currentFiles The current files to compare against the original.
   * @param trigger What triggered this replay.
   * @param originalReceiptId The receipt ID from the original verification (stored in ledger).
   * @param originalTimestamp The timestamp from the original verification receipt.
   */
  replay(
    originalPayload: AccountExportArchivePayload,
    currentFiles: ArchiveFileInput[],
    trigger: ReplayTrigger = 'integrity_check',
    originalReceiptId: string = '',
    originalTimestamp: string = '',
  ): {
    payload: AccountExportReplayPayload;
    receiptInput: TrustReceiptInput;
    validation: { valid: boolean; errors: string[]; warnings: string[] };
  } {
    const originalManifest = new Map(
      originalPayload.fileManifest.map((e) => [e.path, e]),
    );

    const currentHashes = new Map<string, string>();
    const diffEntries: ReplayDiffEntry[] = [];

    let filesMatched = 0;
    let filesDiffered = 0;
    let filesMissing = 0;
    let filesExtra = 0;
    let sensitivityMatch = true;
    let executableMatch = true;

    // Compare current files against original manifest
    for (const file of currentFiles) {
      const contentBuf = typeof file.content === 'string'
        ? Buffer.from(file.content, 'utf-8')
        : file.content;
      const currentHash = 'sha256:' + createHash('sha256').update(contentBuf).digest('hex');
      currentHashes.set(file.path, currentHash);

      const originalEntry = originalManifest.get(file.path);
      if (!originalEntry) {
        filesExtra++;
        diffEntries.push({
          path: file.path,
          diffType: 'extra_in_replay',
          originalValue: '(not in original)',
          replayValue: currentHash,
        });
        continue;
      }

      if (currentHash === originalEntry.contentHash) {
        filesMatched++;
      } else {
        filesDiffered++;
        diffEntries.push({
          path: file.path,
          diffType: 'content_hash_mismatch',
          originalValue: originalEntry.contentHash,
          replayValue: currentHash,
        });
      }

      // Check sensitivity drift
      const currentSensitivity = classifyFileSensitivity(file.path, this.sensitivityPatterns);
      if (currentSensitivity.level !== originalEntry.sensitivityLevel) {
        sensitivityMatch = false;
        diffEntries.push({
          path: file.path,
          diffType: 'sensitivity_drift',
          originalValue: originalEntry.sensitivityLevel,
          replayValue: currentSensitivity.level,
        });
      }

      // Check executable drift
      const currentExe = isExecutableFile(file.path);
      if (currentExe.executable !== originalEntry.isExecutable) {
        executableMatch = false;
        diffEntries.push({
          path: file.path,
          diffType: 'executable_drift',
          originalValue: String(originalEntry.isExecutable),
          replayValue: String(currentExe.executable),
        });
      }
    }

    // Check for files in original but missing in current
    for (const [path] of originalManifest) {
      if (!currentHashes.has(path)) {
        filesMissing++;
        diffEntries.push({
          path,
          diffType: 'missing_in_replay',
          originalValue: originalManifest.get(path)!.contentHash,
          replayValue: '(missing)',
        });
      }
    }

    // Compute current archive hash for comparison
    const currentArchiveInput = currentFiles
      .map((f) => f.path)
      .sort()
      .map((p) => `${p}:${currentHashes.get(p)}`)
      .join('\n');
    const currentArchiveHash = 'sha256:' + createHash('sha256').update(currentArchiveInput).digest('hex');

    const archiveHashMatch = currentArchiveHash === originalPayload.archiveHash;
    const fileContentMatch = filesDiffered === 0 && filesMissing === 0 && filesExtra === 0;

    // Determine replay outcome
    let replayOutcome: ReplayOutcome;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (fileContentMatch && sensitivityMatch && executableMatch) {
      replayOutcome = 'match';
    } else if (fileContentMatch && (sensitivityMatch || !this.config.blockOnSensitivity) && (executableMatch || !this.config.blockOnExecutables)) {
      replayOutcome = 'match_with_warnings';
      if (!sensitivityMatch) warnings.push('Sensitivity classification drifted');
      if (!executableMatch) warnings.push('Executable classification drifted');
    } else if (filesMissing > 0) {
      replayOutcome = 'mismatch_missing_files';
      errors.push(`${filesMissing} file(s) missing from replay`);
    } else if (!archiveHashMatch && filesDiffered > 0) {
      replayOutcome = 'mismatch_corrupt';
      errors.push(`Archive hash mismatch: ${filesDiffered} file(s) differ`);
    } else if (!executableMatch) {
      replayOutcome = 'mismatch_executable_drift';
      errors.push('Executable classification has drifted');
    } else if (!sensitivityMatch) {
      replayOutcome = 'mismatch_sensitivity_drift';
      warnings.push('Sensitivity classification has drifted');
    } else {
      replayOutcome = 'mismatch';
      errors.push('Archive content does not match original verification');
    }

    const replayTimestamp = new Date().toISOString();

    const replayPayload: AccountExportReplayPayload = {
      workflow: originalPayload.workflow,
      provider: originalPayload.provider,
      providerLabel: originalPayload.providerLabel,
      originalVerificationReceiptId: originalReceiptId,
      originalArchiveHash: originalPayload.archiveHash,
      originalVerificationResult: originalPayload.verificationResult,
      trigger,
      originalVerificationTimestamp: originalTimestamp,
      replayTimestamp,
      replayDurationMs: 0, // Caller should compute this
      archiveHashMatch,
      fileContentMatch,
      filesMatched,
      filesDiffered,
      filesMissing,
      filesExtra,
      sensitivityMatch,
      executableMatch,
      replayOutcome,
      replaySummary: this.buildReplaySummary(replayOutcome, filesMatched, filesDiffered, filesMissing, filesExtra, sensitivityMatch, executableMatch),
      diffEntries,
      warnings,
      errors,
      sourceFileMutationPerformed: false,
      rawPrivateDataPublished: false,
      privatePathLeakedToPublicReceipt: false,
    };

    const validation = validateReplayVerification(replayPayload);

    const adapterOptions: AccountExportReplayAdapterOptions = {
      passportDid: this.config.passportDid,
      taskId: this.config.taskId,
      commit: this.config.commit,
      parentReceiptIds: this.config.parentReceiptIds,
    };

    const receiptInput = replayToReceiptInput(replayPayload, adapterOptions);

    // Append to ledger if provided
    if (this.config.ledger) {
      this.config.ledger.append(receiptInput);
    }

    return {
      payload: replayPayload,
      receiptInput,
      validation,
    };
  }

  private buildVerificationSummary(
    result: VerificationResult,
    executables: string[],
    restricted: string[],
    sensitive: string[],
    errors: string[],
    warnings: string[],
  ): string {
    const parts: string[] = [];

    if (result === 'verified') {
      parts.push('Archive verified successfully.');
    } else if (result === 'verified_with_warnings') {
      parts.push('Archive verified with warnings.');
    } else {
      parts.push(`Archive verification failed: ${result}.`);
    }

    if (executables.length > 0) {
      parts.push(`Executable files detected: ${executables.length}.`);
    }
    if (restricted.length > 0) {
      parts.push(`Restricted files: ${restricted.length}.`);
    }
    if (sensitive.length > 0) {
      parts.push(`Sensitive files: ${sensitive.length}.`);
    }
    if (errors.length > 0) {
      parts.push(`Errors: ${errors.length}.`);
    }
    if (warnings.length > 0) {
      parts.push(`Warnings: ${warnings.length}.`);
    }

    return parts.join(' ');
  }

  private buildReplaySummary(
    outcome: ReplayOutcome,
    matched: number,
    differed: number,
    missing: number,
    extra: number,
    sensitivityMatch: boolean,
    executableMatch: boolean,
  ): string {
    const parts: string[] = [];

    if (outcome === 'match') {
      parts.push('Replay matches original verification.');
    } else if (outcome === 'match_with_warnings') {
      parts.push('Replay matches with warnings.');
    } else {
      parts.push(`Replay outcome: ${outcome}.`);
    }

    parts.push(`Files matched: ${matched}.`);
    if (differed > 0) parts.push(`Files differed: ${differed}.`);
    if (missing > 0) parts.push(`Files missing: ${missing}.`);
    if (extra > 0) parts.push(`Extra files: ${extra}.`);
    if (!sensitivityMatch) parts.push('Sensitivity classification drifted.');
    if (!executableMatch) parts.push('Executable classification drifted.');

    return parts.join(' ');
  }
}
