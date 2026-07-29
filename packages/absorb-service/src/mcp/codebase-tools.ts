/**
 * MCP Codebase Tools for HoloScript
 *
 * Provides AI agents with tools for codebase absorption, knowledge graph
 * queries, impact analysis, and change detection.
 *
 * Tools:
 * - holo_absorb_repo: Full scan→graph→emit pipeline
 * - holo_query_codebase: Graph traversal queries
 * - holo_impact_analysis: Changed files → affected symbols
 * - holo_detect_changes: Diff two graph snapshots
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { Worker } from 'worker_threads';
import { pathToFileURL } from 'url';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthHeadersAsync } from '@holoscript/config';
import {
  getGraphRAGStateStatus,
  isGraphRAGReady,
  resetGraphRAGState,
  resetGraphRAGStateForTests,
  setGraphRAGState,
} from './graph-rag-tools';
import { ABSORB_CODEBASE_LOAD_ERROR, ABSORB_HOLO_ABSORB_REPO_HINT } from './graph-rag-prerequisite';
import {
  buildGraphRAGEmbeddingPolicyReceipt,
  coerceNativeGraphRAGProvider,
  NATIVE_GRAPH_RAG_PROVIDER,
  requireNativeGraphRAGProvider,
  type GraphRAGEmbeddingPolicyReceipt,
} from './graph-rag-embedding-policy';
import {
  codebaseRootSetId,
  resolveCodebaseCachePaths,
  resolveCodebaseCachePathsForRoots,
} from './codebase-cache-storage';
import {
  AbsorbRefreshCheckpoint,
  compactAbsorbRefreshProgressReceipt,
  prepareAbsorbRefreshCheckpoint,
  type AbsorbRefreshProgressReceipt,
} from './absorb-refresh-checkpoint';
import type { EmbeddingProviderName } from '../engine/providers/EmbeddingProvider';
import type { EmbeddingRefreshReceipt } from '../engine/EmbeddingIndex';
import type { CommunityAwareImpactReceipt } from '../engine/CodebaseGraph';
import type { ScanPlan } from '../engine/CodebaseScanner';
import type { ScanResult } from '../engine/types';
import { auditHoloAbsorbManifest, buildHoloAbsorbManifest } from '../holoabsorb/index';

// =============================================================================
// DYNAMIC MODULE INTERFACE
// =============================================================================

/**
 * Shape of the dynamically-loaded @holoscript/core codebase module. These
 * classes/functions are resolved at runtime via `loadCodebaseModule()` so we
 * cannot import their types directly without pulling in heavy build artifacts
 * at MCP startup.
 *
 * This structural type replaces `{ X: any; Y: any; ... }` declarations that
 * were duplicated in 3+ call sites. Constructors and functions are typed as
 * `(...args: unknown[]) => unknown` (structural enough to catch obvious
 * shape mismatches while accepting the dynamic resolution pattern). Callers
 * still operate on the returned instances via runtime-typed closures, so the
 * precise instance types are not observable here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicCtor = (new (...args: any[]) => any) & {
  // Dynamic classes may carry static methods (e.g., `deserialize`).
  // Index signature keeps access type-checked without requiring each
  // static member to be declared up front.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicFn = (...args: any[]) => any;

interface CodebaseModule {
  CodebaseScanner: DynamicCtor;
  CodebaseGraph: DynamicCtor;
  HoloEmitter: DynamicCtor;
  CodebaseSceneCompiler: DynamicCtor;
  GitChangeDetector: DynamicCtor;
  GraphRAGEngine: DynamicCtor;
  EmbeddingIndex: DynamicCtor;
  createEmbeddingProvider: DynamicFn;
  /** HoloGraph Phase 2 — maps symbols to MNI152 brain coordinates */
  BrainCoordNodeMapper: DynamicCtor;
}

interface AbsorbScanBatchSummary {
  index: number;
  label: string;
  files: number;
}

interface AbsorbScanPlanReceipt {
  kind: 'AbsorbScanPlan';
  mode: 'module-batched' | 'inline-source-files';
  selectionMode: 'git-visible' | 'git-tracked' | 'filesystem' | 'mixed' | 'inline';
  totalCandidateFiles: number;
  batchCount: number;
  batchSize?: number;
  batches: AbsorbScanBatchSummary[];
}

interface CompactAbsorbScanPlanReceipt extends Omit<AbsorbScanPlanReceipt, 'batches'> {
  batchDetailsOmitted: number;
}

interface PlannedScannerBatch {
  index: number;
  label: string;
  files: string[];
}

interface PlannedScannerScanPlan {
  rootDir: string;
  rootDirs: string[];
  totalFiles: number;
  batchSize: number;
  selectionMode?: 'git-visible' | 'git-tracked' | 'filesystem' | 'mixed';
  batches: PlannedScannerBatch[];
}

interface AbsorbMemorySnapshot {
  rssMb: number;
  heapUsedMb: number;
}

interface AbsorbMemoryBudgetLimits {
  maxRssMb?: number;
  maxHeapUsedMb?: number;
  cacheCommitHeadroomMb?: number;
  minSystemFreeMb?: number;
}

interface AbsorbMemoryBudgetTelemetry extends AbsorbMemoryBudgetLimits {
  peakRssMb: number;
  peakHeapUsedMb: number;
  minObservedSystemFreeMb: number;
  systemTotalMb: number;
  exceeded: boolean;
  exceededResource?: 'rss' | 'heap' | 'rss_and_heap';
  exceededAtPhase?: string;
  headroomExhausted: boolean;
  headroomResource?: 'rss' | 'heap' | 'rss_and_heap';
  headroomExhaustedAtPhase?: string;
  systemReserveExhausted: boolean;
  systemReserveExhaustedAtPhase?: string;
  effectiveMaxRssBeforeCacheCommitMb?: number;
  effectiveMaxHeapUsedBeforeCacheCommitMb?: number;
}

type AbsorbCancellationReason =
  | 'cancel_requested'
  | 'memory_budget_exceeded'
  | 'cache_commit_headroom_exhausted'
  | 'system_memory_reserve_exhausted';

interface AbsorbSourceDriftRetryPolicy {
  enabled: boolean;
  strictResumeToken: boolean;
  maxRetries: number;
  debounceMs: number;
  checkIntervalMs: number;
  maxCheckOverheadRatio: number;
}

interface AbsorbSourceDriftRetryTelemetry extends AbsorbSourceDriftRetryPolicy {
  detectionCount: number;
  retryCount: number;
  headCheckCount: number;
  headCheckDurationMs: number;
  maxHeadCheckDurationMs: number;
  effectiveCheckIntervalMs: number;
  exhausted: boolean;
  lastDetectedAt?: string;
  lastExpectedCommit?: string;
  lastObservedCommit?: string | null;
  lastRootDir?: string;
  lastDebounceDurationMs?: number;
  lastHeadCheckDurationMs?: number;
}

interface AbsorbCancellationState {
  reason: AbsorbCancellationReason;
  message: string;
  requestedAt: number;
  phaseAtRequest: string;
  completedAt?: number;
}

interface AbsorbPhaseMetric extends AbsorbMemorySnapshot {
  phase: string;
  durationMs: number;
  elapsedMs: number;
  filesProcessed?: number;
  totalFiles?: number;
  totalSymbols?: number;
}

// Disk-cache GraphRAG warm now runs in the BACKGROUND (see ensureCachedGraph), so a
// generous cap is safe — it no longer blocks the first tool call. 30s was far too low
// for a ~13k-symbol repo (~130 OpenAI batches), so the warm always timed out and
// semantic_search stayed permanently empty on the deployed server.
const CACHE_WARM_GRAPH_RAG_TIMEOUT_MS = readPositiveEnvMs('ABSORB_CACHE_WARM_TIMEOUT_MS', 600_000);
// 90s was too low for real repos: a ~13k-symbol codebase is ~130 OpenAI batches
// (batchSize 100) ≈ 65–130s, so the embedding build silently timed out and the
// graph was cached WITHOUT a HoloEmbed index (semantic_search → "no index").
// 600s caps indefinite hangs while letting large repos finish; override via env.
const EMBEDDING_BUILD_TIMEOUT_MS = readPositiveEnvMs('ABSORB_EMBEDDING_BUILD_TIMEOUT_MS', 600_000);
const INCREMENTAL_EMBEDDING_TIMEOUT_MS = readPositiveEnvMs(
  'ABSORB_INCREMENTAL_EMBEDDING_TIMEOUT_MS',
  60_000
);
const MESH_SYNC_TIMEOUT_MS = readPositiveEnvMs('ABSORB_MESH_SYNC_TIMEOUT_MS', 10_000);

async function resolveMeshAuthHeaders(): Promise<Record<string, string>> {
  const headers = await mcpAuthHeadersAsync();
  return Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] => {
      const value = entry[1];
      return typeof value === 'string' && value.trim().length > 0;
    })
  );
}

function hasMeshAuthHeaders(headers: Record<string, string>): boolean {
  return Boolean(
    headers.Authorization || headers['x-mcp-api-key'] || headers['x-holoscript-api-key']
  );
}
const DEFAULT_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD = 1_000;
const DEFAULT_CACHE_COMMIT_HEADROOM_RATIO = 0.125;
const DEFAULT_CACHE_COMMIT_HEADROOM_MAX_MB = 512;
const DEFAULT_SYSTEM_MEMORY_RESERVE_RATIO = 0.1;
const DEFAULT_SYSTEM_MEMORY_RESERVE_MIN_MB = 512;
const DEFAULT_SYSTEM_MEMORY_RESERVE_MAX_MB = 2_048;
const DEFAULT_SOURCE_DRIFT_MAX_RETRIES = 3;
const DEFAULT_SOURCE_DRIFT_DEBOUNCE_MS = 750;
const DEFAULT_SOURCE_DRIFT_CHECK_INTERVAL_MS = 1_000;
const DEFAULT_SOURCE_DRIFT_CHECK_MAX_OVERHEAD_PERCENT = 4;

function readPositiveEnvMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function readPositiveEnvInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function effectiveSystemMemoryBytes(): { free: number; total: number } {
  const processMemory = process as typeof process & {
    availableMemory?: () => number;
    constrainedMemory?: () => number;
  };
  const osTotal = os.totalmem();
  const constrained = processMemory.constrainedMemory?.();
  const total =
    Number.isFinite(constrained) && Number(constrained) > 0
      ? Math.min(osTotal, Number(constrained))
      : osTotal;
  const osFree = os.freemem();
  const processAvailable = processMemory.availableMemory?.();
  const free =
    Number.isFinite(processAvailable) && Number(processAvailable) >= 0
      ? Math.min(osFree, Number(processAvailable))
      : osFree;
  return { free, total };
}

function defaultSystemMemoryReserveMb(): number {
  const totalMb = effectiveSystemMemoryBytes().total / 1024 / 1024;
  return Math.round(
    Math.min(
      DEFAULT_SYSTEM_MEMORY_RESERVE_MAX_MB,
      Math.max(DEFAULT_SYSTEM_MEMORY_RESERVE_MIN_MB, totalMb * DEFAULT_SYSTEM_MEMORY_RESERVE_RATIO)
    )
  );
}

function resolveAbsorbMemoryBudget(
  args: Record<string, unknown>
): { valid: true; limits: AbsorbMemoryBudgetLimits } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const readLimit = (key: 'maxRssMb' | 'maxHeapUsedMb', envName: string): number | undefined => {
    const raw = args[key] ?? process.env[envName];
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${key} must be a positive number when provided.`);
      return undefined;
    }
    return value;
  };
  const limits: AbsorbMemoryBudgetLimits = {
    maxRssMb: readLimit('maxRssMb', 'ABSORB_MAX_RSS_MB'),
    maxHeapUsedMb: readLimit('maxHeapUsedMb', 'ABSORB_MAX_HEAP_USED_MB'),
  };
  const rawSystemReserve = args.minSystemFreeMb ?? process.env.ABSORB_MIN_SYSTEM_FREE_MB;
  if (rawSystemReserve === undefined || rawSystemReserve === '') {
    limits.minSystemFreeMb = defaultSystemMemoryReserveMb();
  } else {
    const value = Number(rawSystemReserve);
    if (!Number.isFinite(value) || value < 0) {
      errors.push('minSystemFreeMb must be a non-negative number when provided.');
    } else if (value > 0) {
      limits.minSystemFreeMb = value;
    }
  }
  const rawHeadroom = args.cacheCommitHeadroomMb ?? process.env.ABSORB_CACHE_COMMIT_HEADROOM_MB;
  if (rawHeadroom !== undefined && rawHeadroom !== '') {
    const value = Number(rawHeadroom);
    if (!Number.isFinite(value) || value < 0) {
      errors.push('cacheCommitHeadroomMb must be a non-negative number when provided.');
    } else {
      limits.cacheCommitHeadroomMb = value;
    }
  } else {
    const configuredCaps = [limits.maxRssMb, limits.maxHeapUsedMb].filter(
      (value): value is number => value !== undefined
    );
    if (configuredCaps.length > 0) {
      limits.cacheCommitHeadroomMb = Math.min(
        DEFAULT_CACHE_COMMIT_HEADROOM_MAX_MB,
        Math.max(0.1, Math.min(...configuredCaps) * DEFAULT_CACHE_COMMIT_HEADROOM_RATIO)
      );
    }
  }
  return errors.length > 0 ? { valid: false, errors } : { valid: true, limits };
}

function resolveAbsorbSourceDriftRetryPolicy(
  args: Record<string, unknown>,
  strictResumeToken: boolean
): { valid: true; policy: AbsorbSourceDriftRetryPolicy } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (args.autoRetrySourceDrift !== undefined && typeof args.autoRetrySourceDrift !== 'boolean') {
    errors.push('autoRetrySourceDrift must be a boolean when provided.');
  }
  const readNonNegativeInt = (key: string, envName: string, fallback: number): number => {
    const raw = args[key] ?? process.env[envName];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      errors.push(`${key} must be a non-negative integer when provided.`);
      return fallback;
    }
    return value;
  };
  const requestedEnabled =
    args.autoRetrySourceDrift !== false && !envFlagDisabled('ABSORB_AUTO_RETRY_SOURCE_DRIFT');
  const policy: AbsorbSourceDriftRetryPolicy = {
    enabled: requestedEnabled && !strictResumeToken,
    strictResumeToken,
    maxRetries: readNonNegativeInt(
      'maxSourceDriftRetries',
      'ABSORB_SOURCE_DRIFT_MAX_RETRIES',
      DEFAULT_SOURCE_DRIFT_MAX_RETRIES
    ),
    debounceMs: readNonNegativeInt(
      'sourceDriftDebounceMs',
      'ABSORB_SOURCE_DRIFT_DEBOUNCE_MS',
      DEFAULT_SOURCE_DRIFT_DEBOUNCE_MS
    ),
    checkIntervalMs: readNonNegativeInt(
      'sourceDriftCheckIntervalMs',
      'ABSORB_SOURCE_DRIFT_CHECK_INTERVAL_MS',
      DEFAULT_SOURCE_DRIFT_CHECK_INTERVAL_MS
    ),
    maxCheckOverheadRatio: (() => {
      const raw =
        args.sourceDriftCheckMaxOverheadPercent ??
        process.env.ABSORB_SOURCE_DRIFT_CHECK_MAX_OVERHEAD_PERCENT ??
        DEFAULT_SOURCE_DRIFT_CHECK_MAX_OVERHEAD_PERCENT;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        errors.push(
          'sourceDriftCheckMaxOverheadPercent must be a number between 0 and 100 when provided.'
        );
        return DEFAULT_SOURCE_DRIFT_CHECK_MAX_OVERHEAD_PERCENT / 100;
      }
      return value / 100;
    })(),
  };
  if (policy.maxRetries === 0) policy.enabled = false;
  return errors.length > 0 ? { valid: false, errors } : { valid: true, policy };
}

function envFlagDisabled(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '0' || raw === 'false' || raw === 'off' || raw === 'no';
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }
}

function readAbsorbMemorySnapshot(): AbsorbMemorySnapshot {
  const memory = process.memoryUsage();
  return {
    rssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
  };
}

function readSystemMemorySnapshot(): { freeMb: number; totalMb: number } {
  const memory = effectiveSystemMemoryBytes();
  return {
    freeMb: Math.round(memory.free / 1024 / 1024),
    totalMb: Math.round(memory.total / 1024 / 1024),
  };
}

function summarizeModuleScanPlan(plan: PlannedScannerScanPlan): AbsorbScanPlanReceipt {
  return {
    kind: 'AbsorbScanPlan',
    mode: 'module-batched',
    selectionMode: plan.selectionMode ?? 'filesystem',
    totalCandidateFiles: plan.totalFiles,
    batchCount: plan.batches.length,
    batchSize: plan.batchSize,
    batches: plan.batches.map((batch) => ({
      index: batch.index,
      label: batch.label,
      files: batch.files.length,
    })),
  };
}

function summarizeInlineScanPlan(totalCandidateFiles: number): AbsorbScanPlanReceipt {
  return {
    kind: 'AbsorbScanPlan',
    mode: 'inline-source-files',
    selectionMode: 'inline',
    totalCandidateFiles,
    batchCount: totalCandidateFiles > 0 ? 1 : 0,
    batches:
      totalCandidateFiles > 0
        ? [{ index: 1, label: 'inline-source-files', files: totalCandidateFiles }]
        : [],
  };
}

function compactAbsorbScanPlan(plan: AbsorbScanPlanReceipt): CompactAbsorbScanPlanReceipt {
  const { batches, ...summary } = plan;
  return { ...summary, batchDetailsOmitted: batches.length };
}

class AbsorbPhaseTimeoutError extends Error {
  constructor(
    readonly phase: string,
    readonly timeoutMs: number
  ) {
    super(`${phase} timed out after ${timeoutMs}ms`);
    this.name = 'AbsorbPhaseTimeoutError';
  }
}

class AbsorbCancelledError extends Error {
  constructor(
    readonly jobId: string,
    readonly reasonCode: AbsorbCancellationReason,
    readonly phase: string,
    message: string
  ) {
    super(message);
    this.name = 'AbsorbCancelledError';
  }
}

class AbsorbRefreshCommitPinError extends Error {
  constructor(
    readonly expectedCommit: string,
    readonly actualCommit: string | null,
    readonly rootDir?: string
  ) {
    super(
      `Repository HEAD changed during absorb refresh${
        rootDir ? ` for ${rootDir}` : ''
      }: expected ${expectedCommit}, received ${actualCommit ?? 'no git commit'}`
    );
    this.name = 'AbsorbRefreshCommitPinError';
  }
}

class AbsorbRefreshWorktreePinError extends Error {
  constructor(
    readonly expectedFingerprint: string,
    readonly actualFingerprint: string | null,
    readonly rootDir?: string
  ) {
    super(
      `Repository worktree changed during absorb refresh${
        rootDir ? ` for ${rootDir}` : ''
      }: expected ${expectedFingerprint}, received ${actualFingerprint ?? 'unavailable'}`
    );
    this.name = 'AbsorbRefreshWorktreePinError';
  }
}

async function withPhaseTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  phase: string,
  onStop?: () => Promise<void> | void,
  signal?: AbortSignal
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      Promise.resolve(onStop?.())
        .catch(() => undefined)
        .finally(() => reject(new AbsorbPhaseTimeoutError(phase, timeoutMs)));
    }, timeoutMs);
    unrefTimer(timer);
  });
  const cancellation = new Promise<never>((_, reject) => {
    if (!signal) return;
    abortListener = () => {
      const reason =
        signal.reason instanceof Error
          ? signal.reason
          : new Error(typeof signal.reason === 'string' ? signal.reason : `${phase} cancelled`);
      Promise.resolve(onStop?.())
        .catch(() => undefined)
        .finally(() => reject(reason));
    };
    if (signal.aborted) abortListener();
    else signal.addEventListener('abort', abortListener, { once: true });
  });

  work.catch(() => undefined);

  try {
    return await Promise.race(signal ? [work, timeout, cancellation] : [work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener('abort', abortListener);
  }
}

async function disposeEmbeddingIndex(index: unknown): Promise<void> {
  const disposable = index as { dispose?: () => Promise<void> | void } | undefined;
  if (typeof disposable?.dispose !== 'function') return;
  try {
    await disposable.dispose();
  } catch (err) {
    console.warn(`[AbsorbCleanup] Embedding index dispose failed: ${String(err)}`);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  phase: string,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const abortFromParent = (): void => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  else signal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  unrefTimer(timer);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      if (signal.reason instanceof Error) throw signal.reason;
      throw new Error(typeof signal.reason === 'string' ? signal.reason : `${phase} cancelled`);
    }
    if (controller.signal.aborted) {
      throw new AbsorbPhaseTimeoutError(phase, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromParent);
  }
}

// =============================================================================
// SMART EMBEDDING PROVIDER AUTO-DETECTION
// =============================================================================

let cachedProviderName: string | null = null;

/**
 * Select the native GraphRAG embedding provider.
 * Cached for the session (only probes once).
 *
 * Product rule: shared GraphRAG uses HoloGraph + HoloEmbed only. Local model
 * serving belongs in HoloLlama / LLM synthesis, not the embedding substrate.
 * No external or low-level experiment provider is ever auto-selected.
 */

export async function detectBestEmbeddingProvider(): Promise<string> {
  if (cachedProviderName) return cachedProviderName;

  if (process.env.EMBEDDING_PROVIDER) {
    // Ambient env is the shadow class (stale session exports of e.g. `openai`
    // can outlive the shell that set them): self-heal to the sovereign native
    // provider instead of bricking every shared absorb. Explicit per-call
    // `embeddingProvider` arguments below still fail closed.
    const { provider, coerced, requested } = coerceNativeGraphRAGProvider(
      process.env.EMBEDDING_PROVIDER,
      'EMBEDDING_PROVIDER'
    );
    if (coerced) {
      console.error(
        `[EmbeddingProvider] EMBEDDING_PROVIDER=${requested} is not a valid shared GraphRAG embedding provider; coercing to ${provider} (external providers never enter shared Absorb caches — fix or unset the stale env export)`
      );
    } else {
      console.error(`[EmbeddingProvider] Using explicit env: ${provider}`);
    }
    cachedProviderName = provider;
    return cachedProviderName;
  }

  try {
    const { createEmbeddingProvider } =
      await import('../engine/providers/EmbeddingProviderFactory');
    const provider = await createEmbeddingProvider({ provider: NATIVE_GRAPH_RAG_PROVIDER });
    if (provider.name !== NATIVE_GRAPH_RAG_PROVIDER) {
      throw new Error(`factory returned ${provider.name}`);
    }
    cachedProviderName = NATIVE_GRAPH_RAG_PROVIDER;
    console.error(
      `[EmbeddingProvider] Native GraphRAG provider: ${cachedProviderName} (HoloGraph + HoloEmbed, no fallback)`
    );
    return cachedProviderName;
  } catch (err) {
    throw new Error(
      `Native GraphRAG provider HoloEmbed is unavailable: ${
        err instanceof Error ? err.message : String(err)
      }. Fix HoloEmbed; fallback providers are disabled.`
    );
  }
}

export function resetDetectedEmbeddingProviderForTests(): void {
  cachedProviderName = null;
}

/**
 * Create an EmbeddingIndex with auto-detected or explicitly configured provider.
 */
async function createDynamicEmbeddingIndex(
  mod: {
    EmbeddingIndex: new (provider: any) => any;
    createEmbeddingProvider: (opts: any) => Promise<any>;
  },
  embeddingProvider?: string,
  embeddingApiKey?: string,
  embeddingModel?: string
): Promise<any> {
  const { EmbeddingIndex, createEmbeddingProvider } = mod;
  const providerName = embeddingProvider
    ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
    : await detectBestEmbeddingProvider();

  const provider = await createEmbeddingProvider({
    provider: providerName as EmbeddingProviderName,
    ollamaUrl: process.env.OLLAMA_URL,
    ollamaModel: process.env.OLLAMA_MODEL ?? 'nomic-embed-text',
    openaiApiKey: embeddingApiKey || process.env.OPENAI_API_KEY,
    openaiModel: embeddingModel || process.env.OPENAI_MODEL,
    xenovaModel: process.env.XENOVA_MODEL,
  });
  console.error(
    `[EmbeddingProvider] Created: ${provider.name}${embeddingProvider ? ' (agent-specified)' : ''}`
  );
  return new EmbeddingIndex({ provider });
}

// =============================================================================
// JOB TRACKING (PHASE 8: SSE Progress Streaming)
// =============================================================================

interface AbsorbJob {
  jobId: string;
  rootDir: string;
  writerKey?: string;
  writerPolicyHash?: string;
  writerLease?: AbsorbWriterLease;
  status:
    | 'queued'
    | 'scanning'
    | 'analyzing'
    | 'indexing'
    | 'cancelling'
    | 'cancelled'
    | 'complete'
    | 'error';
  progress: number; // 0-100
  phase: string;
  filesProcessed: number;
  totalFiles: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  result?: unknown;
  scanPlan?: AbsorbScanPlanReceipt;
  phaseMetrics: AbsorbPhaseMetric[];
  abortController: AbortController;
  cancellation?: AbsorbCancellationState;
  memoryBudget: AbsorbMemoryBudgetTelemetry;
  cacheCommitted: boolean;
  refreshProgressReceipt?: AbsorbRefreshProgressReceipt;
  backgroundWorker?: Worker;
  backgroundIsolation?: 'worker-thread' | 'inline-fallback';
  workerMemory?: AbsorbMemorySnapshot;
  sourceDriftRetry: AbsorbSourceDriftRetryTelemetry;
}

interface AbsorbWriterLeaseRecord {
  schemaVersion: 'holoscript.absorb-writer-lease.v1';
  kind: 'AbsorbWriterLease';
  jobId: string;
  writerKey: string;
  policyHash: string;
  token: string;
  rootDirs: string[];
  ownerPid: number;
  ownerHost: string;
  acquiredAt: string;
  updatedAt: string;
  priorGenerationId: string | null;
}

interface AbsorbWriterLease {
  record: AbsorbWriterLeaseRecord;
  leaseFile: string;
  receiptFile: string;
}

interface ExternalAbsorbJobLease {
  leaseFile: string;
  receiptFile: string;
  record: AbsorbWriterLeaseRecord;
}

interface AbsorbWriterReceiptRecord {
  schemaVersion: 'holoscript.absorb-writer-receipt.v1';
  kind: 'AbsorbWriterReceipt';
  jobId: string;
  writerKey: string | null;
  policyHash: string | null;
  status: 'complete' | 'error' | 'cancelled';
  phase: string;
  progress?: number;
  filesProcessed?: number;
  totalFiles?: number;
  cacheCommitted: boolean;
  rootDir: string;
  startedAt: string;
  completedAt: string;
  backgroundIsolation?: 'worker-thread' | 'inline-fallback';
  memoryBudget?: AbsorbMemoryBudgetTelemetry;
  sourceDriftRetry?: AbsorbSourceDriftRetryTelemetry;
  phaseMetrics?: AbsorbPhaseMetric[];
  cancellation?: {
    reason: string;
    message: string;
    phaseAtRequest: string;
    requestedAt: string;
    completedAt?: string;
  };
  error?: string;
}

interface LocatedAbsorbWriterReceipt {
  receipt: AbsorbWriterReceiptRecord;
  receiptFile: string;
}

type AbsorbWriterLeaseAcquisition =
  | { outcome: 'acquired'; lease: AbsorbWriterLease; recoveredStaleLease: boolean }
  | {
      outcome: 'occupied';
      record: AbsorbWriterLeaseRecord;
      leaseFile: string;
      receiptFile: string;
    };

const absorbJobs = new Map<string, AbsorbJob>();
const externalAbsorbJobLeases = new Map<string, ExternalAbsorbJobLease>();
const ABSORB_TERMINAL_JOB_RETENTION_MS = 60 * 60 * 1000;
const DEFAULT_ABSORB_WRITER_LEASE_STALE_MS = 6 * 60 * 60 * 1000;
const ABSORB_RECEIPT_WORKSPACE_SCAN_LIMIT = 2_048;
const ABSORB_LATEST_RECEIPT_READ_LIMIT = 32;

function isTerminalAbsorbJob(job: AbsorbJob): boolean {
  return job.status === 'complete' || job.status === 'error' || job.status === 'cancelled';
}

function releaseAbsorbWriterLease(job: AbsorbJob): void {
  const lease = job.writerLease;
  if (!lease) return;
  job.writerLease = undefined;
  const receipt = {
    schemaVersion: 'holoscript.absorb-writer-receipt.v1',
    kind: 'AbsorbWriterReceipt',
    jobId: job.jobId,
    writerKey: job.writerKey ?? null,
    policyHash: job.writerPolicyHash ?? null,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    filesProcessed: job.filesProcessed,
    totalFiles: job.totalFiles,
    cacheCommitted: job.cacheCommitted,
    rootDir: job.rootDir,
    startedAt: new Date(job.startedAt).toISOString(),
    completedAt: new Date(job.completedAt ?? Date.now()).toISOString(),
    ...(job.backgroundIsolation && { backgroundIsolation: job.backgroundIsolation }),
    memoryBudget: { ...job.memoryBudget },
    sourceDriftRetry: { ...job.sourceDriftRetry },
    phaseMetrics: job.phaseMetrics.map((metric) => ({ ...metric })),
    ...(job.cancellation && {
      cancellation: {
        reason: job.cancellation.reason,
        message: job.cancellation.message,
        phaseAtRequest: job.cancellation.phaseAtRequest,
        requestedAt: new Date(job.cancellation.requestedAt).toISOString(),
        ...(job.cancellation.completedAt && {
          completedAt: new Date(job.cancellation.completedAt).toISOString(),
        }),
      },
    }),
    ...(job.error && { error: job.error }),
  };
  try {
    atomicWriteFileSync(lease.receiptFile, JSON.stringify(receipt), 'utf-8');
  } catch (error) {
    console.warn(
      `[AbsorbWriterLease] unable to write terminal receipt ${lease.receiptFile}: ${errorMessage(error)}`
    );
  }
  try {
    const current = parseAbsorbWriterLease(fs.readFileSync(lease.leaseFile, 'utf-8'));
    if (current?.token === lease.record.token) {
      fs.unlinkSync(lease.leaseFile);
    }
  } catch {
    // The isolated worker or a stale-lease recovery may already have retired it.
  }
}

function settleAbsorbWriterLeaseIfTerminal(job: AbsorbJob): void {
  if (isTerminalAbsorbJob(job)) releaseAbsorbWriterLease(job);
}

function scheduleAbsorbJobCleanup(jobId: string, delayMs = ABSORB_TERMINAL_JOB_RETENTION_MS): void {
  const cleanupTimer = setTimeout(() => {
    const job = absorbJobs.get(jobId);
    if (!job) return;
    if (isTerminalAbsorbJob(job)) {
      const terminalAgeMs = Date.now() - (job.completedAt ?? Date.now());
      const remainingRetentionMs = ABSORB_TERMINAL_JOB_RETENTION_MS - terminalAgeMs;
      if (remainingRetentionMs <= 0) {
        absorbJobs.delete(jobId);
      } else {
        scheduleAbsorbJobCleanup(jobId, remainingRetentionMs);
      }
      return;
    }
    // Retention starts after terminal settlement. Slow scans must remain
    // observable and cancellable no matter how long they run.
    scheduleAbsorbJobCleanup(jobId);
  }, delayMs);
  unrefTimer(cleanupTimer);
}

function buildAbsorbWriterKey(rootDirs: string[]): string {
  const normalized = rootDirs.map((rootDir) => {
    const resolved = path.resolve(rootDir).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  });
  const primary = normalized[0] ?? '';
  return createHash('sha256')
    .update(`${primary}\n${[...normalized].sort().join('\n')}`)
    .digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortedStrings(values: string[] | undefined): string[] | undefined {
  return values ? [...values].sort((left, right) => left.localeCompare(right)) : undefined;
}

function buildAbsorbWriterPolicyHash(options: {
  rootDirs: string[];
  languages?: string[];
  scanPolicy: GraphScanPolicy;
  outputFormat: string;
  layout: string;
  interactive: boolean;
  force: boolean;
  scanBatchSize?: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  inlineSourceFiles?: SourceFileEntry[];
  localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary;
  resumeToken?: string;
  sourceDriftRetryPolicy: AbsorbSourceDriftRetryPolicy;
}): string {
  const normalizedScanPolicy = normalizeScanPolicy(options.scanPolicy);
  const inlineSourceDigest = options.inlineSourceFiles
    ? createHash('sha256')
        .update(
          stableStringify(
            options.inlineSourceFiles.map((entry) => ({
              path: entry.path,
              sha256: createHash('sha256').update(entry.content).digest('hex'),
            }))
          )
        )
        .digest('hex')
    : undefined;
  return createHash('sha256')
    .update(
      stableStringify({
        roots: options.rootDirs.map((entry) => normalizeRootForComparison(entry)).sort(),
        languages: sortedStrings(options.languages),
        scanPolicy: {
          ...normalizedScanPolicy,
          exclude: sortedStrings(normalizedScanPolicy.exclude),
          excludePathFragments: sortedStrings(normalizedScanPolicy.excludePathFragments),
          excludeNameFragments: sortedStrings(normalizedScanPolicy.excludeNameFragments),
        },
        outputFormat: options.outputFormat,
        layout: options.layout,
        interactive: options.interactive,
        force: options.force,
        scanBatchSize: options.scanBatchSize,
        embeddingProvider: options.embeddingProvider ?? NATIVE_GRAPH_RAG_PROVIDER,
        embeddingModel: options.embeddingModel,
        inlineSourceDigest,
        localCodebaseSnapshotReceipt: options.localCodebaseSnapshotReceipt,
        resumeToken: options.resumeToken,
        sourceDriftRetryPolicy: options.sourceDriftRetryPolicy,
      })
    )
    .digest('hex');
}

function absorbRootSetsMatch(left: string[], right: string[]): boolean {
  return buildAbsorbWriterKey(left) === buildAbsorbWriterKey(right);
}

function findActiveAbsorbWriter(writerKey: string | undefined): AbsorbJob | undefined {
  if (!writerKey) return undefined;
  return Array.from(absorbJobs.values()).find(
    (job) => job.writerKey === writerKey && !isTerminalAbsorbJob(job)
  );
}

function absorbWriterLeaseStaleMs(): number {
  const configured = Number(process.env.ABSORB_WRITER_LEASE_STALE_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_ABSORB_WRITER_LEASE_STALE_MS;
  }
  return Math.max(60_000, Math.floor(configured));
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function parseAbsorbWriterLease(raw: string): AbsorbWriterLeaseRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<AbsorbWriterLeaseRecord>;
    if (
      value.schemaVersion !== 'holoscript.absorb-writer-lease.v1' ||
      value.kind !== 'AbsorbWriterLease' ||
      typeof value.jobId !== 'string' ||
      typeof value.writerKey !== 'string' ||
      typeof value.policyHash !== 'string' ||
      typeof value.token !== 'string' ||
      !Array.isArray(value.rootDirs) ||
      typeof value.ownerPid !== 'number' ||
      typeof value.ownerHost !== 'string' ||
      typeof value.acquiredAt !== 'string' ||
      typeof value.updatedAt !== 'string'
    ) {
      return null;
    }
    return value as AbsorbWriterLeaseRecord;
  } catch {
    return null;
  }
}

function parseAbsorbWriterReceipt(raw: string): AbsorbWriterReceiptRecord | null {
  try {
    const value = JSON.parse(raw) as Partial<AbsorbWriterReceiptRecord>;
    if (
      value.schemaVersion !== 'holoscript.absorb-writer-receipt.v1' ||
      value.kind !== 'AbsorbWriterReceipt' ||
      typeof value.jobId !== 'string' ||
      (value.writerKey !== null && typeof value.writerKey !== 'string') ||
      (value.policyHash !== null && typeof value.policyHash !== 'string') ||
      !['complete', 'error', 'cancelled'].includes(String(value.status)) ||
      typeof value.phase !== 'string' ||
      typeof value.cacheCommitted !== 'boolean' ||
      typeof value.rootDir !== 'string' ||
      typeof value.startedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.startedAt)) ||
      typeof value.completedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.completedAt))
    ) {
      return null;
    }
    return value as AbsorbWriterReceiptRecord;
  } catch {
    return null;
  }
}

function safeAbsorbReceiptJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,191}$/.test(jobId);
}

function readLocatedAbsorbWriterReceipt(receiptFile: string): LocatedAbsorbWriterReceipt | null {
  try {
    const receipt = parseAbsorbWriterReceipt(fs.readFileSync(receiptFile, 'utf-8'));
    return receipt ? { receipt, receiptFile } : null;
  } catch {
    return null;
  }
}

/**
 * Terminal writer receipts outlive an MCP worker. Resolve a job ID across the
 * bounded local workspace cache index so status remains queryable after a
 * supervisor restart without requiring the caller to remember the root path.
 */
function findAbsorbWriterReceipt(
  jobId: string,
  preferredRootDir?: string | null
): LocatedAbsorbWriterReceipt | null {
  if (!safeAbsorbReceiptJobId(jobId)) return null;

  const rootDir =
    preferredRootDir || cachedRootDir || process.env.HOLOSCRIPT_WORKSPACE_ROOT || process.cwd();
  const preferredPaths = resolveCodebaseCachePaths(rootDir);
  const receiptName = `${jobId}.json`;
  const candidates = new Set<string>([
    path.join(preferredPaths.writerReceiptsDirectory, receiptName),
    path.join(preferredPaths.baseDir, 'writer-receipts', receiptName),
  ]);
  const workspacesDirectory = path.join(preferredPaths.baseDir, 'workspaces');

  try {
    const workspaceEntries = fs
      .readdirSync(workspacesDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .slice(0, ABSORB_RECEIPT_WORKSPACE_SCAN_LIMIT);
    for (const workspaceEntry of workspaceEntries) {
      candidates.add(
        path.join(workspacesDirectory, workspaceEntry, 'writer-receipts', receiptName)
      );
    }
  } catch {
    // A flat cache or a fresh install has no workspace index.
  }

  let latest: LocatedAbsorbWriterReceipt | null = null;
  let latestCompletedAt = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const located = readLocatedAbsorbWriterReceipt(candidate);
    if (!located || located.receipt.jobId !== jobId) continue;
    const completedAt = Date.parse(located.receipt.completedAt);
    if (completedAt > latestCompletedAt) {
      latest = located;
      latestCompletedAt = completedAt;
    }
  }
  return latest;
}

function findLatestAbsorbWriterReceiptForRoots(
  rootDir: string,
  rootDirs: string[] | undefined,
  jobPrefix: string
): LocatedAbsorbWriterReceipt | null {
  const receiptsDirectory = resolveCachePathsForRoots(rootDir, rootDirs).writerReceiptsDirectory;
  let receiptNames: string[];
  try {
    receiptNames = fs
      .readdirSync(receiptsDirectory)
      .filter((name) => name.startsWith(jobPrefix) && name.endsWith('.json'))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, ABSORB_LATEST_RECEIPT_READ_LIMIT);
  } catch {
    return null;
  }

  let latest: LocatedAbsorbWriterReceipt | null = null;
  let latestCompletedAt = Number.NEGATIVE_INFINITY;
  for (const receiptName of receiptNames) {
    const located = readLocatedAbsorbWriterReceipt(path.join(receiptsDirectory, receiptName));
    if (!located || !located.receipt.jobId.startsWith(jobPrefix)) continue;
    const completedAt = Date.parse(located.receipt.completedAt);
    if (completedAt > latestCompletedAt) {
      latest = located;
      latestCompletedAt = completedAt;
    }
  }
  return latest;
}

function buildRecoveredAbsorbStatus(
  located: LocatedAbsorbWriterReceipt,
  includeResult: boolean
): Record<string, unknown> {
  const { receipt, receiptFile } = located;
  const startedAt = Date.parse(receipt.startedAt);
  const completedAt = Date.parse(receipt.completedAt);
  return {
    ...receipt,
    progress: receipt.progress ?? 100,
    filesProcessed: receipt.filesProcessed ?? 0,
    totalFiles: receipt.totalFiles ?? 0,
    durationMs: Math.max(0, completedAt - startedAt),
    embeddingPolicy: buildGraphRAGEmbeddingPolicyReceipt(),
    recoveredFromReceipt: true,
    durableTerminalStatus: true,
    durableReceiptFile: receiptFile,
    resultAvailable: false,
    ...(includeResult && {
      resultUnavailableReason:
        'The terminal status survived the worker restart, but the result body was not persisted. Query the selected graph cache instead.',
    }),
  };
}

function writerLeaseIsStale(record: AbsorbWriterLeaseRecord | null, leaseFile: string): boolean {
  let ageMs = Number.POSITIVE_INFINITY;
  try {
    const timestamp = record ? Date.parse(record.updatedAt) : fs.statSync(leaseFile).mtimeMs;
    ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : Number.POSITIVE_INFINITY;
  } catch {
    return true;
  }
  if (record?.ownerHost === os.hostname()) {
    return !isProcessAlive(record.ownerPid);
  }
  return ageMs > absorbWriterLeaseStaleMs();
}

function absorbWriterReceiptFile(rootDir: string, jobId: string, rootDirs?: string[]): string {
  const paths = resolveCachePathsForRoots(rootDir, rootDirs);
  return path.join(paths.writerReceiptsDirectory, `${jobId}.json`);
}

function acquireAbsorbWriterLease(options: {
  rootDir: string;
  rootDirs: string[];
  writerKey: string;
  policyHash: string;
  jobId: string;
  adoptToken?: string;
}): AbsorbWriterLeaseAcquisition {
  const paths = resolveCachePathsForRoots(options.rootDir, options.rootDirs);
  fs.mkdirSync(paths.directory, { recursive: true });
  const receiptFile = absorbWriterReceiptFile(options.rootDir, options.jobId, options.rootDirs);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token =
      options.adoptToken ??
      createHash('sha256')
        .update(
          `${options.jobId}:${options.writerKey}:${process.pid}:${Date.now()}:${Math.random()}`
        )
        .digest('hex');
    const now = new Date().toISOString();
    const record: AbsorbWriterLeaseRecord = {
      schemaVersion: 'holoscript.absorb-writer-lease.v1',
      kind: 'AbsorbWriterLease',
      jobId: options.jobId,
      writerKey: options.writerKey,
      policyHash: options.policyHash,
      token,
      rootDirs: options.rootDirs.map((entry) => path.resolve(entry)),
      ownerPid: process.pid,
      ownerHost: os.hostname(),
      acquiredAt: now,
      updatedAt: now,
      priorGenerationId:
        readCacheGenerationManifest(options.rootDir, options.rootDirs)?.manifest.generationId ??
        null,
    };

    try {
      const fd = fs.openSync(paths.writerLeaseFile, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(record), 'utf-8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      return {
        outcome: 'acquired',
        lease: { record, leaseFile: paths.writerLeaseFile, receiptFile },
        recoveredStaleLease: attempt > 0,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    let observedRaw = '';
    try {
      observedRaw = fs.readFileSync(paths.writerLeaseFile, 'utf-8');
    } catch {
      continue;
    }
    const observed = parseAbsorbWriterLease(observedRaw);
    if (
      observed &&
      options.adoptToken &&
      observed.token === options.adoptToken &&
      observed.writerKey === options.writerKey &&
      observed.policyHash === options.policyHash
    ) {
      return {
        outcome: 'acquired',
        lease: {
          record: observed,
          leaseFile: paths.writerLeaseFile,
          receiptFile: absorbWriterReceiptFile(options.rootDir, observed.jobId, options.rootDirs),
        },
        recoveredStaleLease: false,
      };
    }
    if (!writerLeaseIsStale(observed, paths.writerLeaseFile)) {
      return {
        outcome: 'occupied',
        record:
          observed ??
          ({
            schemaVersion: 'holoscript.absorb-writer-lease.v1',
            kind: 'AbsorbWriterLease',
            jobId: 'unknown',
            writerKey: options.writerKey,
            policyHash: 'unknown',
            token: 'unreadable',
            rootDirs: options.rootDirs,
            ownerPid: -1,
            ownerHost: 'unknown',
            acquiredAt: new Date(0).toISOString(),
            updatedAt: new Date().toISOString(),
            priorGenerationId: null,
          } satisfies AbsorbWriterLeaseRecord),
        leaseFile: paths.writerLeaseFile,
        receiptFile: observed
          ? absorbWriterReceiptFile(options.rootDir, observed.jobId, options.rootDirs)
          : receiptFile,
      };
    }

    try {
      if (fs.readFileSync(paths.writerLeaseFile, 'utf-8') === observedRaw) {
        fs.unlinkSync(paths.writerLeaseFile);
      }
    } catch {
      // Another contender changed or recovered the lease. Re-read on retry.
    }
  }

  throw new Error(`Unable to acquire Absorb writer lease at ${paths.writerLeaseFile}`);
}

function createAbsorbMemoryBudget(limits: AbsorbMemoryBudgetLimits): AbsorbMemoryBudgetTelemetry {
  const current = readAbsorbMemorySnapshot();
  const system = readSystemMemorySnapshot();
  const headroom = limits.cacheCommitHeadroomMb ?? 0;
  return {
    ...limits,
    peakRssMb: current.rssMb,
    peakHeapUsedMb: current.heapUsedMb,
    minObservedSystemFreeMb: system.freeMb,
    systemTotalMb: system.totalMb,
    exceeded: false,
    headroomExhausted: false,
    systemReserveExhausted: false,
    ...(limits.maxRssMb !== undefined && {
      effectiveMaxRssBeforeCacheCommitMb: Math.max(0, limits.maxRssMb - headroom),
    }),
    ...(limits.maxHeapUsedMb !== undefined && {
      effectiveMaxHeapUsedBeforeCacheCommitMb: Math.max(0, limits.maxHeapUsedMb - headroom),
    }),
  };
}

function updateAbsorbMemoryBudget(job: AbsorbJob, phase: string): void {
  // An isolated worker owns and enforces its own process memory budget. Sampling
  // this request host would observe the wrong process and could terminate a
  // healthy worker because an unrelated MCP request raised parent RSS.
  if (job.backgroundIsolation === 'worker-thread') return;
  const current = readAbsorbMemorySnapshot();
  const system = readSystemMemorySnapshot();
  job.memoryBudget.peakRssMb = Math.max(job.memoryBudget.peakRssMb, current.rssMb);
  job.memoryBudget.peakHeapUsedMb = Math.max(job.memoryBudget.peakHeapUsedMb, current.heapUsedMb);
  job.memoryBudget.minObservedSystemFreeMb = Math.min(
    job.memoryBudget.minObservedSystemFreeMb,
    system.freeMb
  );
  job.memoryBudget.systemTotalMb = system.totalMb;

  const rssExceeded =
    job.memoryBudget.maxRssMb !== undefined && current.rssMb > job.memoryBudget.maxRssMb;
  const heapExceeded =
    job.memoryBudget.maxHeapUsedMb !== undefined &&
    current.heapUsedMb > job.memoryBudget.maxHeapUsedMb;
  const rssHeadroomExhausted =
    job.memoryBudget.effectiveMaxRssBeforeCacheCommitMb !== undefined &&
    current.rssMb > job.memoryBudget.effectiveMaxRssBeforeCacheCommitMb;
  const heapHeadroomExhausted =
    job.memoryBudget.effectiveMaxHeapUsedBeforeCacheCommitMb !== undefined &&
    current.heapUsedMb > job.memoryBudget.effectiveMaxHeapUsedBeforeCacheCommitMb;
  const systemReserveExhausted =
    job.memoryBudget.minSystemFreeMb !== undefined &&
    system.freeMb < job.memoryBudget.minSystemFreeMb;
  if (
    !rssExceeded &&
    !heapExceeded &&
    !rssHeadroomExhausted &&
    !heapHeadroomExhausted &&
    !systemReserveExhausted
  ) {
    return;
  }

  if (rssExceeded || heapExceeded) {
    job.memoryBudget.exceeded = true;
    job.memoryBudget.exceededResource =
      rssExceeded && heapExceeded ? 'rss_and_heap' : rssExceeded ? 'rss' : 'heap';
    job.memoryBudget.exceededAtPhase ??= phase;
  }
  if (rssHeadroomExhausted || heapHeadroomExhausted) {
    job.memoryBudget.headroomExhausted = true;
    job.memoryBudget.headroomResource =
      rssHeadroomExhausted && heapHeadroomExhausted
        ? 'rss_and_heap'
        : rssHeadroomExhausted
          ? 'rss'
          : 'heap';
    job.memoryBudget.headroomExhaustedAtPhase ??= phase;
  }
  if (systemReserveExhausted) {
    job.memoryBudget.systemReserveExhausted = true;
    job.memoryBudget.systemReserveExhaustedAtPhase ??= phase;
  }
  if (!job.abortController.signal.aborted) {
    const hardLimitExceeded = rssExceeded || heapExceeded;
    const resource = hardLimitExceeded
      ? job.memoryBudget.exceededResource
      : job.memoryBudget.headroomResource;
    const reason: AbsorbCancellationReason = hardLimitExceeded
      ? 'memory_budget_exceeded'
      : systemReserveExhausted
        ? 'system_memory_reserve_exhausted'
        : 'cache_commit_headroom_exhausted';
    requestAbsorbCancellation(
      job,
      reason,
      hardLimitExceeded
        ? `Absorb ${resource} memory budget exceeded during ${phase}`
        : systemReserveExhausted
          ? `Absorb host memory reserve fell to ${system.freeMb} MiB during ${phase}, below the ${job.memoryBudget.minSystemFreeMb} MiB floor; preserving the prior authoritative cache`
          : `Absorb ${resource} cache-commit headroom exhausted during ${phase}; preserving the prior authoritative cache`
    );
  }
}

function enforceAbsorbPreflightResourceGuard(jobId: string): void {
  const job = absorbJobs.get(jobId);
  if (!job || job.memoryBudget.minSystemFreeMb === undefined) return;
  const system = readSystemMemorySnapshot();
  job.memoryBudget.minObservedSystemFreeMb = Math.min(
    job.memoryBudget.minObservedSystemFreeMb,
    system.freeMb
  );
  job.memoryBudget.systemTotalMb = system.totalMb;
  if (system.freeMb >= job.memoryBudget.minSystemFreeMb) return;

  job.memoryBudget.systemReserveExhausted = true;
  job.memoryBudget.systemReserveExhaustedAtPhase ??= 'preflight resource guard';
  requestAbsorbCancellation(
    job,
    'system_memory_reserve_exhausted',
    `Absorb host memory reserve is ${system.freeMb} MiB before planning, below the ${job.memoryBudget.minSystemFreeMb} MiB floor; preserving the prior authoritative cache`
  );
  const reason = job.abortController.signal.reason;
  if (reason instanceof Error) throw reason;
  throw new AbsorbCancelledError(
    job.jobId,
    'system_memory_reserve_exhausted',
    'preflight resource guard',
    job.cancellation?.message ?? 'Absorb host memory reserve exhausted before planning'
  );
}

function createAbsorbSourceDriftRetryTelemetry(
  policy: AbsorbSourceDriftRetryPolicy
): AbsorbSourceDriftRetryTelemetry {
  return {
    ...policy,
    detectionCount: 0,
    retryCount: 0,
    headCheckCount: 0,
    headCheckDurationMs: 0,
    maxHeadCheckDurationMs: 0,
    effectiveCheckIntervalMs: policy.checkIntervalMs,
    exhausted: false,
  };
}

function recordAbsorbSourceHeadCheck(
  jobId: string | undefined,
  durationMs: number,
  effectiveCheckIntervalMs: number
): void {
  if (!jobId) return;
  const job = absorbJobs.get(jobId);
  if (!job) return;
  const roundedDurationMs = Math.round(Math.max(0, durationMs) * 1000) / 1000;
  job.sourceDriftRetry.headCheckCount += 1;
  job.sourceDriftRetry.headCheckDurationMs =
    Math.round((job.sourceDriftRetry.headCheckDurationMs + roundedDurationMs) * 1000) / 1000;
  job.sourceDriftRetry.maxHeadCheckDurationMs = Math.max(
    job.sourceDriftRetry.maxHeadCheckDurationMs,
    roundedDurationMs
  );
  job.sourceDriftRetry.effectiveCheckIntervalMs = effectiveCheckIntervalMs;
  job.sourceDriftRetry.lastHeadCheckDurationMs = roundedDurationMs;
}

function recordAbsorbSourceDrift(
  jobId: string | undefined,
  error: AbsorbRefreshCommitPinError
): AbsorbSourceDriftRetryTelemetry | undefined {
  if (!jobId) return undefined;
  const job = absorbJobs.get(jobId);
  if (!job) return undefined;
  job.sourceDriftRetry.detectionCount += 1;
  job.sourceDriftRetry.lastDetectedAt = new Date().toISOString();
  job.sourceDriftRetry.lastExpectedCommit = error.expectedCommit;
  job.sourceDriftRetry.lastObservedCommit = error.actualCommit;
  job.sourceDriftRetry.lastRootDir = error.rootDir;
  return job.sourceDriftRetry;
}

function recordAbsorbSourceDriftRetry(jobId: string | undefined, debounceDurationMs: number): void {
  if (!jobId) return;
  const job = absorbJobs.get(jobId);
  if (!job) return;
  job.sourceDriftRetry.retryCount += 1;
  job.sourceDriftRetry.lastDebounceDurationMs = debounceDurationMs;
}

function requestAbsorbCancellation(
  job: AbsorbJob,
  reason: AbsorbCancellationReason,
  message: string
): void {
  if (job.abortController.signal.aborted) return;
  job.cancellation = {
    reason,
    message,
    requestedAt: Date.now(),
    phaseAtRequest: job.phase,
  };
  job.status = 'cancelling';
  job.abortController.abort(new AbsorbCancelledError(job.jobId, reason, job.phase, message));
  if (job.backgroundWorker) {
    void job.backgroundWorker.terminate().catch(() => {});
  }
}

function enforceAbsorbJobControl(jobId: string | undefined, phase: string): void {
  if (!jobId) return;
  const job = absorbJobs.get(jobId);
  if (!job) return;
  updateAbsorbMemoryBudget(job, phase);
  if (!job.abortController.signal.aborted) return;
  if (job.abortController.signal.reason instanceof Error) {
    throw job.abortController.signal.reason;
  }
  throw new AbsorbCancelledError(
    job.jobId,
    job.cancellation?.reason ?? 'cancel_requested',
    phase,
    job.cancellation?.message ?? 'Absorb job cancelled'
  );
}

function getAbsorbJobSignal(jobId: string | undefined): AbortSignal | undefined {
  return jobId ? absorbJobs.get(jobId)?.abortController.signal : undefined;
}

function isAbsorbCancellation(err: unknown, jobId?: string): boolean {
  if (err instanceof AbsorbCancelledError) return true;
  const job = jobId ? absorbJobs.get(jobId) : undefined;
  return job?.abortController.signal.aborted === true;
}

function settleCancelledAbsorbJob(jobId: string, err?: unknown): Record<string, unknown> {
  const job = absorbJobs.get(jobId);
  if (!job) {
    return { error: 'absorb_cancelled', cancelled: true, jobId };
  }
  const completedAt = Date.now();
  const cancellation =
    job.cancellation ??
    ({
      reason: 'cancel_requested',
      message: err instanceof Error ? err.message : 'Absorb job cancelled',
      requestedAt: completedAt,
      phaseAtRequest: job.phase,
    } satisfies AbsorbCancellationState);
  cancellation.completedAt = completedAt;
  job.cancellation = cancellation;
  job.status = 'cancelled';
  job.phase = 'Cancelled';
  job.completedAt = completedAt;
  updateAbsorbMemoryBudget(job, 'cancelled');

  const receipt = {
    schemaVersion: 'holoscript.absorb-cancellation-receipt.v1',
    kind: 'AbsorbCancellationReceipt',
    error: 'absorb_cancelled',
    cancelled: true,
    jobId,
    rootDir: job.rootDir,
    reason: cancellation.reason,
    message: cancellation.message,
    phaseAtRequest: cancellation.phaseAtRequest,
    requestedAt: new Date(cancellation.requestedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    cachePreserved: !job.cacheCommitted,
    cacheCommitted: job.cacheCommitted,
    ...(job.refreshProgressReceipt && {
      refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(job.refreshProgressReceipt),
      resumeToken: job.refreshProgressReceipt.resumeToken,
    }),
    memoryBudget: { ...job.memoryBudget },
    sourceDriftRetry: { ...job.sourceDriftRetry },
  };
  job.result = receipt;
  releaseAbsorbWriterLease(job);
  return receipt;
}

/**
 * Result fields that are already persisted to the graph cache and are far too
 * large to echo through an MCP transcript. `graph` measured 826 KB on a
 * 292-file repo; because each forked session replays its ancestor's transcript,
 * every inlined copy was duplicated into every descendant (139 rollout files /
 * 174 MB observed). These are reported as metadata and never inlined — callers
 * read the cache file or query the graph via holo_query_codebase.
 */
const ABSORB_RESULT_CACHED_BLOB_FIELDS: readonly string[] = ['graph'];

/** Ceiling for the remaining result body echoed back through MCP. */
const ABSORB_RESULT_INLINE_BUDGET_BYTES = 64 * 1024;

interface AbsorbOmittedResultField {
  field: string;
  bytes: number;
  recoverVia: string;
}

function serializedBytes(value: unknown): number {
  const json = JSON.stringify(value);
  return json === undefined ? 0 : Buffer.byteLength(json, 'utf-8');
}

/**
 * Build the transcript-safe view of a terminal absorb result: blob fields are
 * always stripped, and whatever remains is inlined only on request and only
 * under the byte budget.
 */
function buildAbsorbResultEnvelope(
  result: unknown,
  includeResult: boolean
): Record<string, unknown> {
  const record =
    typeof result === 'object' && result !== null && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;

  const omitted: AbsorbOmittedResultField[] = [];
  const retained: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    if (ABSORB_RESULT_CACHED_BLOB_FIELDS.includes(key)) {
      omitted.push({ field: key, bytes: serializedBytes(value), recoverVia: getCacheFile() });
    } else {
      retained[key] = value;
    }
  }

  const body = record ? retained : result;
  const bodyBytes = serializedBytes(body);
  const envelope: Record<string, unknown> = {
    resultAvailable: true,
    resultKeys: record ? Object.keys(record) : [],
    resultBytes: bodyBytes + omitted.reduce((total, entry) => total + entry.bytes, 0),
  };

  if (omitted.length > 0) {
    envelope.resultOmittedFields = omitted;
  }

  if (!includeResult) {
    // Only advertise includeResult when it can actually deliver the body,
    // otherwise the hint provokes a second call that returns nothing new.
    envelope.resultHint =
      bodyBytes <= ABSORB_RESULT_INLINE_BUDGET_BYTES
        ? 'Call holo_get_absorb_status again with includeResult:true to retrieve the result body.'
        : `Result body is ${bodyBytes} bytes, over the ${ABSORB_RESULT_INLINE_BUDGET_BYTES}-byte inline budget. Query the absorbed graph via holo_query_codebase or holo_ask_codebase instead.`;
    return envelope;
  }

  if (bodyBytes > ABSORB_RESULT_INLINE_BUDGET_BYTES) {
    envelope.resultTruncated = true;
    envelope.resultHint = `Result body is ${bodyBytes} bytes, over the ${ABSORB_RESULT_INLINE_BUDGET_BYTES}-byte inline budget. Query the absorbed graph via holo_query_codebase or holo_ask_codebase instead.`;
    return envelope;
  }

  envelope.result = body;
  return envelope;
}

function setAbsorbJobScanPlan(
  jobId: string | undefined,
  scanPlan: AbsorbScanPlanReceipt | undefined
): void {
  if (!jobId || !scanPlan) return;
  const job = absorbJobs.get(jobId);
  if (job) job.scanPlan = scanPlan;
}

function setAbsorbJobRefreshProgress(
  jobId: string | undefined,
  receipt: AbsorbRefreshProgressReceipt | undefined
): void {
  if (!jobId || !receipt) return;
  const job = absorbJobs.get(jobId);
  if (job) job.refreshProgressReceipt = receipt;
}

function refreshIsolatedAbsorbProgressFromDisk(job: AbsorbJob): void {
  if (job.backgroundIsolation !== 'worker-thread' || isTerminalAbsorbJob(job)) return;
  const current = job.refreshProgressReceipt;
  if (!current?.receiptFile || !fs.existsSync(current.receiptFile)) return;
  try {
    const refreshed = JSON.parse(
      fs.readFileSync(current.receiptFile, 'utf-8')
    ) as AbsorbRefreshProgressReceipt;
    if (
      refreshed.schemaVersion !== 'holoscript.absorb-refresh-progress-receipt.v1' ||
      refreshed.kind !== 'AbsorbRefreshProgressReceipt' ||
      refreshed.resumeToken !== current.resumeToken ||
      !rootMatchesCurrentRepo(refreshed.rootDir, job.rootDir)
    ) {
      return;
    }
    job.refreshProgressReceipt = refreshed;
    job.filesProcessed = refreshed.completedCandidateFiles;
    job.totalFiles = refreshed.totalCandidateFiles;
    if (refreshed.status === 'complete') {
      job.progress = Math.max(job.progress, 65);
      job.phase = `Building graph and semantic index after ${refreshed.completedBatchCount}/${refreshed.totalBatches} scan batches`;
    } else {
      job.progress = Math.max(
        job.progress,
        Math.min(60, Math.floor((refreshed.progressPercent / 100) * 60))
      );
      job.phase = `Scanning checkpoint batches ${refreshed.completedBatchCount}/${refreshed.totalBatches}`;
    }
  } catch {
    // The worker atomically replaces this file. A transient read/parse miss
    // leaves the last verified snapshot in place for the next status poll.
  }
}

function appendAbsorbPhaseMetric(jobId: string | undefined, metric: AbsorbPhaseMetric): void {
  if (!jobId) return;
  const job = absorbJobs.get(jobId);
  if (job) job.phaseMetrics.push(metric);
  enforceAbsorbJobControl(jobId, metric.phase);
}

/**
 * Track absorb job progress. Updates the job state in the jobs map.
 */
function trackAbsorbProgress(
  jobId: string,
  phase: string,
  progress: number,
  filesProcessed?: number,
  totalFiles?: number
): void {
  enforceAbsorbJobControl(jobId, phase);
  const job = absorbJobs.get(jobId);
  if (job) {
    job.phase = phase;
    job.progress = Math.max(job.progress, Math.min(100, Math.max(0, progress)));
    if (filesProcessed !== undefined) job.filesProcessed = filesProcessed;
    if (totalFiles !== undefined) job.totalFiles = totalFiles;

    // Auto-update status based on progress
    if (job.progress >= 100) {
      job.status = 'complete';
      job.completedAt = Date.now();
    } else if (job.progress >= 65) {
      job.status = 'indexing';
    } else if (job.progress >= 10) {
      job.status = 'scanning';
    } else {
      job.status = 'queued';
    }
    settleAbsorbWriterLeaseIfTerminal(job);
  }
}

function failAbsorbJob(
  jobId: string | undefined,
  phase: string,
  error: string,
  result?: unknown
): void {
  if (!jobId) return;
  const job = absorbJobs.get(jobId);
  if (!job) return;
  job.status = 'error';
  job.phase = phase;
  job.progress = 100;
  job.error = error;
  job.completedAt = Date.now();
  job.result = result;
  releaseAbsorbWriterLease(job);
}

/**
 * Create a new absorb job and register it.
 */
function createAbsorbJob(
  rootDir: string,
  memoryBudget: AbsorbMemoryBudgetLimits,
  sourceDriftRetryPolicy: AbsorbSourceDriftRetryPolicy,
  writerKey?: string,
  writerPolicyHash?: string,
  writerLease?: AbsorbWriterLease,
  requestedJobId?: string
): string {
  const jobId = requestedJobId ?? `absorb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  absorbJobs.set(jobId, {
    jobId,
    rootDir,
    writerKey,
    writerPolicyHash,
    writerLease,
    status: 'queued',
    progress: 0,
    phase: 'Initializing',
    filesProcessed: 0,
    totalFiles: 0,
    startedAt: Date.now(),
    phaseMetrics: [],
    abortController: new AbortController(),
    memoryBudget: createAbsorbMemoryBudget(memoryBudget),
    sourceDriftRetry: createAbsorbSourceDriftRetryTelemetry(sourceDriftRetryPolicy),
    cacheCommitted: false,
  });

  // Keep one-shot verifier processes free of permanent job state, but never
  // expire a running worker. The timer re-arms until the job is terminal.
  scheduleAbsorbJobCleanup(jobId);

  return jobId;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface IsolatedAbsorbWorkerData {
  moduleUrl: string;
  args: Record<string, unknown>;
}

type IsolatedAbsorbWorkerFactory = (workerData: IsolatedAbsorbWorkerData) => Worker;

let isolatedAbsorbWorkerFactoryForTests: IsolatedAbsorbWorkerFactory | null = null;

export function setIsolatedAbsorbWorkerFactoryForTests(
  factory?: IsolatedAbsorbWorkerFactory
): void {
  isolatedAbsorbWorkerFactoryForTests = factory ?? null;
}

const ISOLATED_ABSORB_WORKER_SOURCE = `
(async () => {
  const { parentPort, workerData } = await import('node:worker_threads');
  const omit = new Set(['graph', 'holoSource', 'interactiveScene']);
  const compact = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const result = {};
    const omittedResultFields = [];
    for (const [key, entry] of Object.entries(value)) {
      if (omit.has(key)) {
        omittedResultFields.push(key);
      } else {
        result[key] = entry;
      }
    }
    return {
      ...result,
      isolatedBackground: true,
      ...(omittedResultFields.length > 0 && { omittedResultFields }),
    };
  };

  let mod;
  let telemetryInFlight = false;
  const reportTelemetry = async () => {
    if (telemetryInFlight) return;
    telemetryInFlight = true;
    const memory = process.memoryUsage();
    try {
      const innerJobId =
        workerData.args && typeof workerData.args.__writerJobId === 'string'
          ? workerData.args.__writerJobId
          : undefined;
      const workerStatus =
        mod && innerJobId
          ? await mod.handleCodebaseTool('holo_get_absorb_status', {
              jobId: innerJobId,
            })
          : undefined;
      parentPort.postMessage({
        type: 'telemetry',
        memory: {
          rssMb: Math.round(memory.rss / 1024 / 1024),
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        },
        workerStatus: compact(workerStatus),
      });
    } catch {
      // Telemetry must never terminate the owning scan. The terminal worker
      // result remains the authoritative success/cancellation/error receipt.
    } finally {
      telemetryInFlight = false;
    }
  };
  const telemetryTimer = setInterval(() => void reportTelemetry(), 250);
  telemetryTimer.unref();
  void reportTelemetry();

  try {
    mod = await import(workerData.moduleUrl);
    void reportTelemetry();
    const result = await mod.handleCodebaseTool('holo_absorb_repo', {
      ...workerData.args,
      async: false,
      background: false,
      __isolatedBackgroundWorker: true,
    });
    const innerJobId =
      result && typeof result === 'object' && typeof result.jobId === 'string'
        ? result.jobId
        : undefined;
    const workerStatus = innerJobId
      ? await mod.handleCodebaseTool('holo_get_absorb_status', {
          jobId: innerJobId,
          includePlan: true,
          includeReceiptDetails: true,
        })
      : undefined;
    parentPort.postMessage({
      type: 'complete',
      result: compact(result),
      workerStatus: compact(workerStatus),
    });
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearInterval(telemetryTimer);
  }
})().catch(async (error) => {
  const { parentPort } = await import('node:worker_threads');
  parentPort.postMessage({
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
  });
});
`;

function shouldUseIsolatedAbsorbWorker(): boolean {
  if (isolatedAbsorbWorkerFactoryForTests) return true;
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return false;
  return process.env.ABSORB_ISOLATED_BACKGROUND !== '0';
}

function createIsolatedAbsorbWorker(workerData: IsolatedAbsorbWorkerData): Worker {
  if (isolatedAbsorbWorkerFactoryForTests) {
    return isolatedAbsorbWorkerFactoryForTests(workerData);
  }
  return new Worker(ISOLATED_ABSORB_WORKER_SOURCE, {
    eval: true,
    workerData,
  });
}

function resolveIsolatedAbsorbModuleUrl(): string {
  const requireBase = process.argv[1]
    ? path.resolve(process.argv[1])
    : path.join(process.cwd(), 'package.json');
  const localRequire = createRequire(requireBase);
  return pathToFileURL(localRequire.resolve('@holoscript/absorb-service/mcp')).href;
}

function startIsolatedBackgroundAbsorbJob(jobId: string, args: Record<string, unknown>): boolean {
  const job = absorbJobs.get(jobId);
  if (!job || !shouldUseIsolatedAbsorbWorker()) return false;

  let worker: Worker;
  try {
    worker = createIsolatedAbsorbWorker({
      moduleUrl: resolveIsolatedAbsorbModuleUrl(),
      args,
    });
  } catch (error) {
    console.warn(`[AbsorbBackground] worker isolation unavailable: ${errorMessage(error)}`);
    return false;
  }

  job.backgroundWorker = worker;
  job.backgroundIsolation = 'worker-thread';
  // createAbsorbJob runs in the request host before the worker exists. Drop
  // that host snapshot now: only telemetry produced by the allocation-owning
  // worker may contribute to an isolated job's measured peaks and outcome.
  job.memoryBudget.peakRssMb = 0;
  job.memoryBudget.peakHeapUsedMb = 0;
  job.status = 'scanning';
  job.progress = 1;
  job.phase = 'Running in isolated worker';
  let settled = false;

  const mergeWorkerStatus = (
    activeJob: AbsorbJob,
    workerStatus: Record<string, unknown> | undefined,
    reportedMemory?: Partial<AbsorbMemorySnapshot>
  ): void => {
    const statusMemory =
      workerStatus && typeof workerStatus.memory === 'object' && workerStatus.memory !== null
        ? (workerStatus.memory as Partial<AbsorbMemorySnapshot>)
        : undefined;
    const workerMemory = reportedMemory ?? statusMemory;
    if (Number.isFinite(workerMemory?.rssMb) && Number.isFinite(workerMemory?.heapUsedMb)) {
      activeJob.workerMemory = {
        rssMb: Number(workerMemory!.rssMb),
        heapUsedMb: Number(workerMemory!.heapUsedMb),
      };
      activeJob.memoryBudget.peakRssMb = Math.max(
        activeJob.memoryBudget.peakRssMb,
        activeJob.workerMemory.rssMb
      );
      activeJob.memoryBudget.peakHeapUsedMb = Math.max(
        activeJob.memoryBudget.peakHeapUsedMb,
        activeJob.workerMemory.heapUsedMb
      );
    }
    if (
      workerStatus &&
      typeof workerStatus.memoryBudget === 'object' &&
      workerStatus.memoryBudget !== null
    ) {
      const workerBudget = workerStatus.memoryBudget as AbsorbMemoryBudgetTelemetry;
      activeJob.memoryBudget = {
        ...activeJob.memoryBudget,
        ...workerBudget,
        peakRssMb: Math.max(
          activeJob.memoryBudget.peakRssMb,
          workerBudget.peakRssMb ?? 0,
          activeJob.workerMemory?.rssMb ?? 0
        ),
        peakHeapUsedMb: Math.max(
          activeJob.memoryBudget.peakHeapUsedMb,
          workerBudget.peakHeapUsedMb ?? 0,
          activeJob.workerMemory?.heapUsedMb ?? 0
        ),
      };
    }
    if (workerStatus && Array.isArray(workerStatus.phaseMetrics)) {
      activeJob.phaseMetrics = workerStatus.phaseMetrics as AbsorbPhaseMetric[];
    }
    if (
      workerStatus &&
      typeof workerStatus.sourceDriftRetry === 'object' &&
      workerStatus.sourceDriftRetry !== null
    ) {
      activeJob.sourceDriftRetry = {
        ...activeJob.sourceDriftRetry,
        ...(workerStatus.sourceDriftRetry as Partial<AbsorbSourceDriftRetryTelemetry>),
      };
    }
    if (workerStatus && typeof workerStatus.phase === 'string') {
      activeJob.phase = workerStatus.phase;
    }
    if (workerStatus && typeof workerStatus.progress === 'number') {
      activeJob.progress = Math.max(activeJob.progress, workerStatus.progress);
    }
    if (workerStatus && typeof workerStatus.filesProcessed === 'number') {
      activeJob.filesProcessed = workerStatus.filesProcessed;
    }
    if (workerStatus && typeof workerStatus.totalFiles === 'number') {
      activeJob.totalFiles = workerStatus.totalFiles;
    }
    if (
      workerStatus?.scanPlan &&
      typeof workerStatus.scanPlan === 'object' &&
      Array.isArray((workerStatus.scanPlan as Partial<AbsorbScanPlanReceipt>).batches)
    ) {
      // Periodic worker telemetry intentionally uses compact status and omits
      // batch details. Only the terminal includePlan status may replace the
      // parent's full plan; otherwise the next parent poll would compact an
      // already-compact plan and dereference a missing batches array.
      activeJob.scanPlan = workerStatus.scanPlan as AbsorbScanPlanReceipt;
    }
    if (
      workerStatus?.refreshProgressReceipt &&
      typeof workerStatus.refreshProgressReceipt === 'object'
    ) {
      activeJob.refreshProgressReceipt =
        workerStatus.refreshProgressReceipt as AbsorbRefreshProgressReceipt;
    }
  };

  worker.on('message', (message: unknown) => {
    if (settled) return;
    const payload = message as {
      type?: unknown;
      result?: unknown;
      error?: unknown;
      memory?: unknown;
      workerStatus?: unknown;
    };
    if (payload.type === 'telemetry') {
      const memory = payload.memory as Partial<AbsorbMemorySnapshot> | undefined;
      const workerStatus =
        typeof payload.workerStatus === 'object' && payload.workerStatus !== null
          ? (payload.workerStatus as Record<string, unknown>)
          : undefined;
      const activeJob = absorbJobs.get(jobId);
      if (activeJob) mergeWorkerStatus(activeJob, workerStatus, memory);
      return;
    }
    if (payload.type === 'error') {
      settled = true;
      const activeJob = absorbJobs.get(jobId);
      if (activeJob) activeJob.backgroundWorker = undefined;
      const error = String(payload.error || 'Isolated absorb worker failed');
      failAbsorbJob(jobId, 'Failed (isolated worker)', error, {
        error: 'absorb_failed',
        message: error,
        jobId,
        isolatedBackground: true,
      });
      return;
    }
    if (payload.type !== 'complete') return;
    settled = true;
    const activeJob = absorbJobs.get(jobId);
    if (!activeJob) return;
    activeJob.backgroundWorker = undefined;
    if (activeJob.status === 'cancelling' || activeJob.abortController.signal.aborted) {
      settleCancelledAbsorbJob(jobId, activeJob.abortController.signal.reason);
      return;
    }

    const result =
      typeof payload.result === 'object' && payload.result !== null
        ? { ...(payload.result as Record<string, unknown>), jobId }
        : payload.result;
    const resultError =
      typeof result === 'object' && result !== null
        ? (result as Record<string, unknown>).error
        : undefined;
    const workerStatus =
      typeof payload.workerStatus === 'object' && payload.workerStatus !== null
        ? (payload.workerStatus as Record<string, unknown>)
        : undefined;
    mergeWorkerStatus(activeJob, workerStatus);
    if (resultError === 'absorb_cancelled' || workerStatus?.status === 'cancelled') {
      const resultRecord = result as Record<string, unknown>;
      const completedAt = Date.now();
      activeJob.status = 'cancelled';
      activeJob.progress = 100;
      activeJob.phase = 'Cancelled';
      activeJob.completedAt = completedAt;
      activeJob.result = result;
      activeJob.cancellation = {
        reason: (resultRecord.reason as AbsorbCancellationReason | undefined) ?? 'cancel_requested',
        message: String(resultRecord.message ?? 'Isolated absorb worker cancelled'),
        requestedAt:
          typeof resultRecord.requestedAt === 'string'
            ? Date.parse(resultRecord.requestedAt) || completedAt
            : completedAt,
        phaseAtRequest: String(resultRecord.phaseAtRequest ?? 'isolated worker'),
        completedAt,
      };
      releaseAbsorbWriterLease(activeJob);
      return;
    }
    if (resultError) {
      failAbsorbJob(
        jobId,
        'Failed (isolated worker)',
        String(
          (result as Record<string, unknown>).message || (result as Record<string, unknown>).error
        ),
        result
      );
      return;
    }

    invalidateInMemoryGraphAfterIsolatedRefresh();
    activeJob.result = result;
    activeJob.status = 'complete';
    activeJob.progress = 100;
    activeJob.phase = 'Complete (isolated worker)';
    activeJob.completedAt = Date.now();
    activeJob.cacheCommitted = true;
    const resultStats =
      typeof result === 'object' &&
      result !== null &&
      typeof (result as Record<string, unknown>).stats === 'object' &&
      (result as Record<string, unknown>).stats !== null
        ? ((result as Record<string, unknown>).stats as Record<string, unknown>)
        : undefined;
    const completedFileCount = Number(resultStats?.totalFiles ?? activeJob.totalFiles);
    if (Number.isFinite(completedFileCount) && completedFileCount > 0) {
      activeJob.filesProcessed = completedFileCount;
      activeJob.totalFiles = completedFileCount;
    }
    releaseAbsorbWriterLease(activeJob);
  });

  worker.once('error', (error: Error) => {
    if (settled) return;
    settled = true;
    const activeJob = absorbJobs.get(jobId);
    if (activeJob) activeJob.backgroundWorker = undefined;
    failAbsorbJob(jobId, 'Failed (isolated worker)', error.message, {
      error: 'absorb_failed',
      message: error.message,
      jobId,
      isolatedBackground: true,
    });
  });

  worker.once('exit', (code: number) => {
    const activeJob = absorbJobs.get(jobId);
    if (activeJob) activeJob.backgroundWorker = undefined;
    if (settled || !activeJob) return;
    settled = true;
    if (activeJob.status === 'cancelling' || activeJob.abortController.signal.aborted) {
      settleCancelledAbsorbJob(jobId, activeJob.abortController.signal.reason);
      return;
    }
    failAbsorbJob(jobId, 'Failed (isolated worker)', `Worker exited with code ${code}`, {
      error: 'absorb_failed',
      message: `Isolated absorb worker exited with code ${code}`,
      jobId,
      isolatedBackground: true,
    });
  });

  worker.unref();
  return true;
}

function startBackgroundAbsorbJob(
  jobId: string,
  work: () => Promise<unknown>,
  workerArgs?: Record<string, unknown>,
  requireIsolation = false
): 'worker-thread' | 'inline-fallback' | 'isolation-unavailable' {
  if (workerArgs && startIsolatedBackgroundAbsorbJob(jobId, workerArgs)) {
    return 'worker-thread';
  }
  if (requireIsolation) {
    const message =
      'Large background absorb requires worker isolation, but the worker could not be started; the request event loop was not used as a fallback.';
    failAbsorbJob(jobId, 'Worker isolation unavailable', message, {
      error: 'absorb_worker_unavailable',
      legacyError: 'absorb_background_isolation_unavailable',
      message,
      jobId,
      cachePreserved: true,
    });
    return 'isolation-unavailable';
  }
  const job = absorbJobs.get(jobId);
  if (job) job.backgroundIsolation = 'inline-fallback';
  setTimeout(() => {
    void work()
      .then((result: unknown) => {
        const job = absorbJobs.get(jobId);
        if (!job || job.status === 'error' || job.status === 'cancelled') return;
        if (job.status === 'cancelling' || job.abortController.signal.aborted) {
          settleCancelledAbsorbJob(jobId, job.abortController.signal.reason);
          return;
        }
        job.result = result;
        job.status = 'complete';
        job.progress = 100;
        job.phase = job.phase === 'Initializing' ? 'Complete' : job.phase;
        job.completedAt = Date.now();
        releaseAbsorbWriterLease(job);
      })
      .catch((err: unknown) => {
        if (isAbsorbCancellation(err, jobId)) {
          settleCancelledAbsorbJob(jobId, err);
          return;
        }
        const message = errorMessage(err);
        const job = absorbJobs.get(jobId);
        const refreshProgressReceipt = job?.refreshProgressReceipt;
        const refreshSourceChanged =
          refreshProgressReceipt?.status === 'invalidated' ||
          err instanceof AbsorbRefreshCommitPinError ||
          err instanceof AbsorbRefreshWorktreePinError;
        failAbsorbJob(jobId, 'Failed', message, {
          error: refreshSourceChanged
            ? 'absorb_refresh_source_changed'
            : refreshProgressReceipt
              ? 'absorb_refresh_failed'
              : 'absorb_failed',
          message,
          jobId,
          ...(refreshSourceChanged && {
            cachePreserved: !job?.cacheCommitted,
            graphAuthoritative: false,
          }),
          ...(refreshProgressReceipt && {
            resumeToken: refreshProgressReceipt.resumeToken,
            refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(refreshProgressReceipt),
          }),
        });
      });
  }, 0);
  return 'inline-fallback';
}

function requiresIsolatedLargeBackground(decision: AbsorbAutoBackgroundDecision): boolean {
  if (!decision.autoBackground) return false;
  // Vitest intentionally runs the inline executor so its deterministic
  // scanner fixtures remain in-process. Production can explicitly exercise
  // the fail-closed path with ABSORB_REQUIRE_ISOLATION=1.
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return process.env.ABSORB_REQUIRE_ISOLATION === '1';
  }
  return true;
}

// =============================================================================
// GRAPH PERSISTENCE
// =============================================================================

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
// The main HoloScript checkout crossed 10k absorbable files in 2026. A 10k
// default therefore produced a cache that was fresh by age and HEAD but could
// never be authoritative by coverage. Keep the scan bounded for laptop/edge
// nodes while leaving enough headroom for the current monorepo.
const DEFAULT_SCAN_MAX_FILES = 20_000;
const DEFAULT_SCAN_MAX_FILE_SIZE = 1024 * 1024;
const FILE_HASH_FRESHNESS_SAMPLE_LIMIT = 10;
const GRAPH_UNAVAILABLE_RECEIPT_SCHEMA = 'holoscript.codebase.graph-unavailable-receipt.v0.1.0';
const SEMANTIC_INDEX_READINESS_RECEIPT_SCHEMA =
  'holoscript.codebase.semantic-index-readiness-receipt.v0.1.0';
const LOCAL_ADAPTER_RECOMMENDATION_SCHEMA =
  'holoscript.codebase.local-adapter-recommendation.v0.1.0';
const LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA = 'LocalCodebaseSnapshotReceipt.v1';
const HOLOSHELL_LOCAL_CODEBASE_SNAPSHOT_RECEIPT_KIND = 'HoloShellLocalCodebaseSnapshotReceipt';
const HOLOSHELL_LOCAL_ADAPTER_SCRIPT = 'scripts/holoshell-local-codebase-absorb-bundle.mjs';
const LOCAL_ADAPTER_RECOMMENDATION =
  'Route this request through a local HoloShell codebase adapter in the same filesystem namespace as the requested path, or pass sourceFiles inline to holo_absorb_repo before trusting GraphRAG output.';
const COVERAGE_EXCLUDE_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.output',
  '__pycache__',
  '.pytest_cache',
  'vendor',
  '.venv',
  'venv',
  'env',
  '.env',
  'coverage',
  '.nyc_output',
  '.stryker-tmp',
  '.idea',
  '.vscode',
  '.vs',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const COVERAGE_NON_ABSORBABLE_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'tif',
  'tiff',
  'avif',
  'heic',
  'mp4',
  'mov',
  'avi',
  'webm',
  'mkv',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'm4a',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'rar',
  '7z',
  'pdf',
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'ply',
  'usdz',
  'draco',
  'ktx2',
  'basis',
  'bin',
  'wasm',
  'exe',
  'dll',
  'so',
  'dylib',
  'node',
  'map',
  'onnx',
  'safetensors',
  'gguf',
  'pt',
  'pth',
  'ckpt',
  'npy',
  'npz',
  'parquet',
  'lock',
  'ds_store',
]);

interface GraphRootAuthorityPin {
  rootDir: string;
  gitCommitHash: string | null;
  worktreeFingerprint: string | null;
  coverageAtScan: GraphCoverageStatus;
}

interface GraphCacheEnvelope {
  version: 1 | 2;
  cacheGenerationId?: string;
  rootDir: string;
  rootDirs?: string[];
  rootSetId?: string;
  rootAuthorityPins?: GraphRootAuthorityPin[];
  timestamp: number;
  stats: Record<string, unknown>;
  graphJson: string;
  // v2 fields (incremental absorb)
  gitCommitHash?: string;
  fileHashes?: Record<string, string>;
  embeddingProvider?: string;
  embeddingPolicy?: GraphRAGEmbeddingPolicyReceipt;
  localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary;
  scanPolicy?: GraphScanPolicy;
  worktreeFingerprint?: string;
  coverageAtScan?: GraphCoverageStatus;
  /** SHA-256 of the exact embeddings binary published with this graph generation. */
  embeddingCacheSha256?: string | null;
  embeddingCacheBytes?: number | null;
  embeddingCacheMtimeMs?: number | null;
}

interface CodebaseCacheGenerationManifest {
  schemaVersion:
    | 'holoscript.absorb-cache-generation.v1'
    | 'holoscript.absorb-cache-generation.v2';
  kind: 'AbsorbCacheGeneration';
  generationId: string;
  workspaceRoot: string;
  graphFile: string;
  /** v2: SHA-256 of the exact selected graph envelope bytes. */
  graphCacheSha256?: string;
  /** v2: byte length of the exact selected graph envelope. */
  graphCacheBytes?: number;
  embeddingsFile: string | null;
  embeddingCacheSha256: string | null;
  publishedAt: string;
}

interface CacheGenerationSelection {
  manifest: CodebaseCacheGenerationManifest;
  manifestFile: string;
  graphFile: string;
  embeddingsFile: string | null;
}

interface GraphScanPolicy {
  exclude?: string[];
  excludePathFragments?: string[];
  excludeNameFragments?: string[];
  includeHidden?: boolean;
  includeBuildArtifacts?: boolean;
  respectGitIgnore?: boolean;
  includeUntracked?: boolean;
  maxFiles?: number;
  maxFileSize?: number;
}

interface NormalizedCoveragePolicy {
  names: Set<string>;
  suffixes: string[];
  pathFragments: string[];
  nameFragments: string[];
  includeHidden: boolean;
  includeBuildArtifacts: boolean;
  respectGitIgnore: boolean;
  includeUntracked: boolean;
  maxFiles: number;
  maxFileSize: number;
  receipt: GraphScanPolicy;
}

interface AbsorbDiagnostics {
  requestedRootDir: string;
  resolvedRootDir: string;
  processCwd: string;
  resolvedDirExists: boolean;
  resolvedDirReadable: boolean;
  rootEntriesSample?: string[];
  scanErrorCount: number;
  scanErrorSample: Array<{ file: string; phase: string; error: string }>;
  hints: string[];
}

type GraphUnavailableReason =
  | 'rootDir_unavailable'
  | 'cache_stale'
  | 'cache_missing'
  | 'cache_root_mismatch'
  | 'cache_incomplete';

interface LocalAdapterRecommendation {
  schemaVersion: typeof LOCAL_ADAPTER_RECOMMENDATION_SCHEMA;
  kind: 'HoloShellLocalAdapterRecommendation';
  command: string;
  mcpTool: 'holo_absorb_repo';
  mcpArguments: Array<'localCodebaseSnapshotReceipt' | 'sourceFiles' | 'rootDir' | 'rootDirs'>;
  acceptedReceiptSchemas: string[];
  note: string;
}

interface GraphUnavailableReceipt {
  schemaVersion: typeof GRAPH_UNAVAILABLE_RECEIPT_SCHEMA;
  kind: 'GraphUnavailableReceipt';
  reason: GraphUnavailableReason;
  requestedPath: string | null;
  runtimePath: string | null;
  runtimeCwd: string;
  cacheAgeMs: number | null;
  cacheAgeHuman: string | null;
  staleThresholdMs: number;
  staleByMs: number | null;
  authoritative: false;
  recommendation: string;
  localAdapter: LocalAdapterRecommendation;
  createdAt: string;
}

interface SemanticIndexReadinessReceipt {
  schemaVersion: typeof SEMANTIC_INDEX_READINESS_RECEIPT_SCHEMA;
  kind: 'SemanticIndexReadinessReceipt';
  rootDir: string;
  graphAuthoritative?: boolean;
  graphCoverage?: GraphCoverageStatus;
  authorityCaveats?: string[];
  semanticIndexReady: boolean;
  graphRagReady: boolean;
  embeddingIndexReady: boolean;
  embeddingSkipped: boolean;
  embeddingSkipReason?: 'outputFormat:stats' | 'embeddingBuildFailed' | 'embeddingLoadFailed';
  embeddingFailure?: {
    message: string;
  };
  priorGraphRagReady: boolean;
  provider: typeof NATIVE_GRAPH_RAG_PROVIDER;
  graphProvider: 'holograph';
  message: string;
  nextStep: string;
  createdAt: string;
}

interface GraphCoverageStatus {
  available: boolean;
  source: 'git-ls-files' | 'git-ls-files-cached-and-others' | 'unavailable';
  graphFileCount: number;
  trackedCandidateCount?: number;
  workspaceCandidateCount?: number;
  selectedCandidateCount?: number;
  expectedGraphFileCount?: number;
  defaultMaxFiles: number;
  complete?: boolean;
  ratio?: number;
  cappedByMaxFiles?: boolean;
  overInclusive?: boolean;
  extraGraphFiles?: number;
  exactFileSetChecked?: boolean;
  exactFileSetMatch?: boolean;
  missingGraphFiles?: number;
  unexpectedGraphFiles?: number;
  missingGraphFileSample?: string[];
  unexpectedGraphFileSample?: string[];
  rootCount?: number;
  error?: string;
}

type GraphFileHashFreshnessReason =
  | 'not_checked'
  | 'rootDir_missing'
  | 'file_hashes_missing'
  | 'file_hashes_empty'
  | 'all_hashes_match'
  | 'hash_mismatch'
  | 'hash_check_error';

interface GraphFileHashFreshnessStatus {
  checked: boolean;
  fresh: boolean;
  reason: GraphFileHashFreshnessReason;
  verificationMode?: 'full-file-hash' | 'git-worktree-fingerprint';
  storedFileCount: number;
  checkedFileCount: number;
  modifiedFileCount: number;
  deletedFileCount: number;
  modifiedFileSample: string[];
  deletedFileSample: string[];
  error?: string;
}

interface GraphRepoAuthorityStatus {
  ok: boolean;
  currentGitCommitHash: string | null;
  gitMatchesHead: boolean;
  fileHashFreshForHeadMismatch: boolean;
  fileHashFreshness: GraphFileHashFreshnessStatus;
}

type LocalCodebaseSnapshotAuthorityReason =
  | 'receipt_sourcefiles_verified'
  | 'receipt_cache_stale'
  | 'receipt_graph_incomplete';

interface LocalCodebaseSnapshotAuthority {
  authoritative: boolean;
  scope: 'local-codebase-snapshot';
  reason: LocalCodebaseSnapshotAuthorityReason;
  rootDir: string | null;
  graphFileCount: number;
  receiptFileCount: number;
  receiptCoverageComplete: boolean;
  freshByAge: boolean;
  receipt: LocalCodebaseSnapshotReceiptSummary;
}

function resolveCacheWorkspaceRoot(rootDir?: string | null): string {
  const pinned = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
  return path.resolve(rootDir || (pinned && pinned.trim().length > 0 ? pinned : process.cwd()));
}

function resolveGenerationArtifact(
  generationsDirectory: string,
  relativeFile: string
): string | null {
  if (!relativeFile || path.isAbsolute(relativeFile)) return null;
  const resolved = path.resolve(generationsDirectory, relativeFile);
  const relative = path.relative(generationsDirectory, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

function readCacheGenerationManifest(
  rootDir?: string | null,
  rootDirs?: string[] | null
): CacheGenerationSelection | null {
  const workspaceRoot = resolveCacheWorkspaceRootForRoots(rootDir, rootDirs);
  const paths = resolveCachePathsForRoots(rootDir, rootDirs);
  if (!fs.existsSync(paths.generationManifestFile)) return null;
  try {
    const manifest = JSON.parse(
      fs.readFileSync(paths.generationManifestFile, 'utf-8')
    ) as Partial<CodebaseCacheGenerationManifest>;
    const isV2 = manifest.schemaVersion === 'holoscript.absorb-cache-generation.v2';
    if (
      (manifest.schemaVersion !== 'holoscript.absorb-cache-generation.v1' && !isV2) ||
      manifest.kind !== 'AbsorbCacheGeneration' ||
      typeof manifest.generationId !== 'string' ||
      !/^[a-f0-9]{32}$/.test(manifest.generationId) ||
      typeof manifest.workspaceRoot !== 'string' ||
      !rootMatchesCurrentRepo(manifest.workspaceRoot, workspaceRoot) ||
      typeof manifest.graphFile !== 'string' ||
      manifest.graphFile.replace(/\\/g, '/') !== `${manifest.generationId}/graph-cache.json` ||
      (manifest.embeddingsFile !== null && typeof manifest.embeddingsFile !== 'string') ||
      (typeof manifest.embeddingsFile === 'string' &&
        manifest.embeddingsFile.replace(/\\/g, '/') !==
          `${manifest.generationId}/embeddings-cache.bin`) ||
      (manifest.embeddingCacheSha256 !== null &&
        (typeof manifest.embeddingCacheSha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(manifest.embeddingCacheSha256))) ||
      (isV2 &&
        (typeof manifest.graphCacheSha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(manifest.graphCacheSha256) ||
          typeof manifest.graphCacheBytes !== 'number' ||
          !Number.isSafeInteger(manifest.graphCacheBytes) ||
          manifest.graphCacheBytes <= 0)) ||
      typeof manifest.publishedAt !== 'string'
    ) {
      return null;
    }
    const graphFile = resolveGenerationArtifact(paths.generationsDirectory, manifest.graphFile);
    const embeddingsFile =
      manifest.embeddingsFile === null
        ? null
        : resolveGenerationArtifact(paths.generationsDirectory, manifest.embeddingsFile);
    if (
      !graphFile ||
      !fs.existsSync(graphFile) ||
      (manifest.embeddingsFile !== null && (!embeddingsFile || !fs.existsSync(embeddingsFile)))
    ) {
      return null;
    }
    return {
      manifest: manifest as CodebaseCacheGenerationManifest,
      manifestFile: paths.generationManifestFile,
      graphFile,
      embeddingsFile,
    };
  } catch {
    return null;
  }
}

function getCacheFile(rootDir?: string | null, rootDirs?: string[] | null): string {
  return (
    readCacheGenerationManifest(rootDir, rootDirs)?.graphFile ??
    resolveCachePathsForRoots(rootDir, rootDirs).graphFile
  );
}

function getEmbeddingsFile(rootDir?: string | null, rootDirs?: string[] | null): string {
  const selected = readCacheGenerationManifest(rootDir, rootDirs);
  if (selected) {
    return (
      selected.embeddingsFile ??
      path.join(
        resolveCachePathsForRoots(rootDir, rootDirs).generationsDirectory,
        selected.manifest.generationId,
        'embeddings-cache.missing'
      )
    );
  }
  return resolveCachePathsForRoots(rootDir, rootDirs).embeddingsFile;
}

function formatCacheAge(ageMs: number | undefined): string | null {
  if (ageMs === undefined) return null;
  if (ageMs < 60_000) return `${Math.max(0, Math.round(ageMs / 1000))}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  return `${(ageMs / 3_600_000).toFixed(1)}h ago`;
}

function normalizeRootForComparison(rootDir: string): string {
  const normalized = path.normalize(path.resolve(rootDir)).replace(/[\\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function normalizeRootSet(rootDirs: string[]): string[] {
  return Array.from(
    new Set(rootDirs.filter(Boolean).map((rootDir) => normalizeRootForComparison(rootDir)))
  ).sort((left, right) => left.localeCompare(right));
}

function canonicalizeRootSet(rootDirs: string[]): string[] {
  const rootsByIdentity = new Map<string, string>();
  for (const rootDir of rootDirs.filter(Boolean)) {
    const resolvedRoot = path.resolve(rootDir);
    const identity = normalizeRootForComparison(resolvedRoot);
    if (!rootsByIdentity.has(identity)) {
      rootsByIdentity.set(identity, resolvedRoot);
    }
  }
  return Array.from(rootsByIdentity.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, rootDir]) => rootDir);
}

function buildRootSetId(rootDirs: string[]): string {
  return codebaseRootSetId(rootDirs);
}

/**
 * A multi-root graph is a distinct authority object, not an alias of its first
 * root. Keep the legacy single-root lane byte-for-byte compatible while giving
 * each normalized root set an isolated generation/lease namespace.
 */
function resolveCacheWorkspaceRootForRoots(
  rootDir?: string | null,
  rootDirs?: string[] | null
): string {
  const primaryRoot = resolveCacheWorkspaceRoot(rootDir);
  const normalizedRoots = normalizeRootSet(
    rootDirs && rootDirs.length > 0 ? rootDirs : [primaryRoot]
  );
  if (normalizedRoots.length <= 1) return primaryRoot;
  return resolveCodebaseCachePathsForRoots(normalizedRoots).workspaceRoot;
}

function resolveCachePathsForRoots(rootDir?: string | null, rootDirs?: string[] | null) {
  const effectiveRoots =
    rootDirs && rootDirs.length > 0 ? rootDirs : [resolveCacheWorkspaceRoot(rootDir)];
  return resolveCodebaseCachePathsForRoots(effectiveRoots);
}

function rootMatchesCurrentRepo(
  rootDir: string | null | undefined,
  currentRepoRoot: string
): boolean {
  if (!rootDir) return false;
  return normalizeRootForComparison(rootDir) === normalizeRootForComparison(currentRepoRoot);
}

function normalizeStringList(values: unknown): string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) return undefined;
  const normalized = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeScanPolicy(policy?: GraphScanPolicy | null): GraphScanPolicy {
  const normalized: GraphScanPolicy = {};
  const exclude = normalizeStringList(policy?.exclude);
  const excludePathFragments = normalizeStringList(policy?.excludePathFragments);
  const excludeNameFragments = normalizeStringList(policy?.excludeNameFragments);

  if (exclude) normalized.exclude = exclude;
  if (excludePathFragments) normalized.excludePathFragments = excludePathFragments;
  if (excludeNameFragments) normalized.excludeNameFragments = excludeNameFragments;
  if (policy?.includeHidden === true) normalized.includeHidden = true;
  if (policy?.includeBuildArtifacts === true) normalized.includeBuildArtifacts = true;
  if (policy?.respectGitIgnore === false) normalized.respectGitIgnore = false;
  if (policy?.includeUntracked === false) normalized.includeUntracked = false;
  if (Number.isFinite(policy?.maxFiles) && Number(policy?.maxFiles) > 0) {
    normalized.maxFiles = Math.floor(Number(policy?.maxFiles));
  }
  if (Number.isFinite(policy?.maxFileSize) && Number(policy?.maxFileSize) > 0) {
    normalized.maxFileSize = Math.floor(Number(policy?.maxFileSize));
  }

  return normalized;
}

function scanPolicyKey(policy?: GraphScanPolicy | null): string {
  return JSON.stringify(normalizeScanPolicy(policy));
}

function scanPoliciesEqual(
  first?: GraphScanPolicy | null,
  second?: GraphScanPolicy | null
): boolean {
  return scanPolicyKey(first) === scanPolicyKey(second);
}

function normalizePathFragment(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return normalized;
  return `/${normalized}`;
}

function addCoverageNameOrPath(
  pattern: string,
  names: Set<string>,
  suffixes: string[],
  pathFragments: string[],
  includeBuildArtifacts: boolean
): void {
  const trimmed = pattern.trim();
  if (!trimmed) return;
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    const fragment = normalizePathFragment(trimmed);
    if (fragment) pathFragments.push(fragment);
    return;
  }
  if (trimmed.startsWith('*.')) {
    const suffix = trimmed.slice(1).replace(/\*/g, '').toLowerCase();
    if (suffix && suffix !== '.') suffixes.push(suffix);
    return;
  }

  const name = trimmed.replace(/^\*\./, '').replace(/\*/g, '').toLowerCase();
  if (!name) return;
  if (includeBuildArtifacts && (name === 'dist' || name === 'build' || name === 'out')) return;
  names.add(name);
}

function buildCoveragePolicy(policy?: GraphScanPolicy | null): NormalizedCoveragePolicy {
  const receipt = normalizeScanPolicy(policy);
  const names = new Set<string>();
  const suffixes: string[] = [];
  const pathFragments: string[] = [];
  const nameFragments: string[] = [];
  const includeBuildArtifacts = receipt.includeBuildArtifacts === true;

  for (const name of COVERAGE_EXCLUDE_NAMES) {
    if (includeBuildArtifacts && (name === 'dist' || name === 'build' || name === 'out')) {
      continue;
    }
    names.add(name.toLowerCase());
  }
  for (const pattern of receipt.exclude ?? []) {
    addCoverageNameOrPath(pattern, names, suffixes, pathFragments, includeBuildArtifacts);
  }
  for (const fragment of receipt.excludePathFragments ?? []) {
    const normalized = normalizePathFragment(fragment);
    if (normalized) pathFragments.push(normalized);
  }
  for (const fragment of receipt.excludeNameFragments ?? []) {
    const normalized = fragment.trim().toLowerCase();
    if (normalized) nameFragments.push(normalized);
  }

  return {
    names,
    suffixes: Array.from(new Set(suffixes)),
    pathFragments: Array.from(new Set(pathFragments)),
    nameFragments: Array.from(new Set(nameFragments)),
    includeHidden: receipt.includeHidden === true,
    includeBuildArtifacts,
    respectGitIgnore: receipt.respectGitIgnore !== false,
    includeUntracked: receipt.includeUntracked !== false,
    maxFiles: receipt.maxFiles ?? DEFAULT_SCAN_MAX_FILES,
    maxFileSize: receipt.maxFileSize ?? DEFAULT_SCAN_MAX_FILE_SIZE,
    receipt,
  };
}

function isCoverageExcludedPath(filePath: string, policy: NormalizedCoveragePolicy): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter(Boolean);
  for (const segment of segments) {
    const lowerSegment = segment.toLowerCase();
    if (!policy.includeHidden && lowerSegment.startsWith('.') && lowerSegment !== '.') return true;
    if (policy.names.has(lowerSegment)) return true;
  }

  const basename = path.basename(normalizedPath).toLowerCase();
  if (policy.names.has(basename)) return true;
  if (policy.suffixes.some((suffix) => basename.endsWith(suffix))) return true;
  if (policy.nameFragments.some((fragment) => basename.includes(fragment))) return true;
  const pathProbe = `/${normalizedPath}`.toLowerCase();
  if (policy.pathFragments.some((fragment) => pathProbe.includes(fragment))) return true;
  if (basename.endsWith('.min.js') || basename.endsWith('.min.css')) return true;

  const dot = basename.lastIndexOf('.');
  const ext = dot >= 0 ? basename.slice(dot + 1) : '';
  return COVERAGE_NON_ABSORBABLE_EXT.has(ext);
}

function listGitAbsorbableFiles(
  rootDir: string,
  scanPolicy: GraphScanPolicy | null | undefined,
  includeUntracked: boolean
): Set<string> | null {
  const policy = buildCoveragePolicy(scanPolicy);
  try {
    const args = ['ls-files', '--cached'];
    if (includeUntracked) args.push('--others', '--exclude-standard');
    args.push('-z');
    const output = execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf-8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Set(
      output
        .split('\0')
        .filter((line) => line.length > 0)
        .filter((line) => !isCoverageExcludedPath(line, policy))
        .filter((line) => {
          try {
            return fs.statSync(path.join(rootDir, line)).size <= policy.maxFileSize;
          } catch {
            return false;
          }
        })
        .map((line) => normalizeRootForComparison(path.resolve(rootDir, line)))
    );
  } catch {
    return null;
  }
}

function buildGraphCoverageStatus(
  rootDir: string | null | undefined,
  graphFileCount: number,
  scanPolicy?: GraphScanPolicy | null,
  graphFilePaths?: Iterable<string> | null
): GraphCoverageStatus {
  const safeGraphFileCount = Number.isFinite(graphFileCount) ? Math.max(0, graphFileCount) : 0;
  const policy = buildCoveragePolicy(scanPolicy);
  if (!rootDir) {
    return {
      available: false,
      source: 'unavailable',
      graphFileCount: safeGraphFileCount,
      defaultMaxFiles: policy.maxFiles,
      error: 'rootDir missing',
    };
  }

  if (!policy.respectGitIgnore) {
    return {
      available: false,
      source: 'unavailable',
      graphFileCount: safeGraphFileCount,
      defaultMaxFiles: policy.maxFiles,
      error: 'filesystem discovery does not have a bounded Git coverage denominator',
    };
  }

  const trackedCandidates = listGitAbsorbableFiles(rootDir, policy.receipt, false);
  if (trackedCandidates === null) {
    return {
      available: false,
      source: 'unavailable',
      graphFileCount: safeGraphFileCount,
      defaultMaxFiles: policy.maxFiles,
      error: 'git ls-files unavailable',
    };
  }
  const trackedCandidateCount = trackedCandidates.size;

  const workspaceCandidates = policy.includeUntracked
    ? listGitAbsorbableFiles(rootDir, policy.receipt, true)
    : trackedCandidates;
  if (workspaceCandidates === null) {
    return {
      available: false,
      source: 'unavailable',
      graphFileCount: safeGraphFileCount,
      trackedCandidateCount,
      defaultMaxFiles: policy.maxFiles,
      error: 'git ls-files --others --exclude-standard unavailable',
    };
  }
  const workspaceCandidateCount = workspaceCandidates.size;

  const selectedCandidateCount = policy.includeUntracked
    ? workspaceCandidateCount
    : trackedCandidateCount;
  const selectedCandidates = policy.includeUntracked ? workspaceCandidates : trackedCandidates;
  const expectedGraphFileCount = Math.min(selectedCandidateCount, policy.maxFiles);
  const cappedByMaxFiles = selectedCandidateCount > policy.maxFiles;
  let exactFileSetChecked = false;
  let exactFileSetMatch: boolean | undefined;
  let missingGraphFilePaths: string[] = [];
  const unexpectedGraphFilePaths: string[] = [];
  if (graphFilePaths && !cappedByMaxFiles) {
    exactFileSetChecked = true;
    const normalizedGraphFiles = new Map<string, string>();
    for (const filePath of graphFilePaths) {
      const relativePath = normalizeRepoRelativeFilePath(rootDir, filePath);
      if (!relativePath) {
        unexpectedGraphFilePaths.push(String(filePath));
        continue;
      }
      normalizedGraphFiles.set(
        normalizeRootForComparison(path.resolve(rootDir, relativePath)),
        relativePath
      );
    }
    missingGraphFilePaths = Array.from(selectedCandidates)
      .filter((filePath) => !normalizedGraphFiles.has(filePath))
      .map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/'))
      .sort();
    unexpectedGraphFilePaths.push(
      ...Array.from(normalizedGraphFiles)
        .filter(([filePath]) => !selectedCandidates.has(filePath))
        .map(([, relativePath]) => relativePath)
        .sort()
    );
    exactFileSetMatch = missingGraphFilePaths.length === 0 && unexpectedGraphFilePaths.length === 0;
  }
  const complete =
    safeGraphFileCount >= expectedGraphFileCount &&
    (exactFileSetMatch === undefined || exactFileSetMatch);
  const extraGraphFiles = exactFileSetChecked
    ? unexpectedGraphFilePaths.length
    : Math.max(0, safeGraphFileCount - expectedGraphFileCount);
  return {
    available: true,
    source: policy.includeUntracked ? 'git-ls-files-cached-and-others' : 'git-ls-files',
    graphFileCount: safeGraphFileCount,
    trackedCandidateCount,
    workspaceCandidateCount,
    selectedCandidateCount,
    expectedGraphFileCount,
    defaultMaxFiles: policy.maxFiles,
    complete,
    ratio:
      expectedGraphFileCount === 0
        ? 1
        : Number((safeGraphFileCount / expectedGraphFileCount).toFixed(4)),
    cappedByMaxFiles,
    overInclusive: extraGraphFiles > 0,
    extraGraphFiles,
    exactFileSetChecked,
    ...(exactFileSetMatch !== undefined && { exactFileSetMatch }),
    ...(exactFileSetChecked && {
      missingGraphFiles: missingGraphFilePaths.length,
      unexpectedGraphFiles: unexpectedGraphFilePaths.length,
      missingGraphFileSample: missingGraphFilePaths.slice(0, 20),
      unexpectedGraphFileSample: unexpectedGraphFilePaths.slice(0, 20),
    }),
  };
}

function buildGraphCoverageStatusForRoots(
  rootDirs: string[] | null | undefined,
  graphFileCount: number,
  scanPolicy?: GraphScanPolicy | null,
  graphFilePaths?: Iterable<string> | null
): GraphCoverageStatus {
  const normalizedRoots = Array.from(
    new Set((rootDirs ?? []).filter(Boolean).map((rootDir) => path.resolve(rootDir)))
  );
  if (normalizedRoots.length <= 1) {
    return buildGraphCoverageStatus(normalizedRoots[0], graphFileCount, scanPolicy, graphFilePaths);
  }

  const safeGraphFileCount = Number.isFinite(graphFileCount) ? Math.max(0, graphFileCount) : 0;
  const policy = buildCoveragePolicy(scanPolicy);
  if (!policy.respectGitIgnore) {
    return {
      available: false,
      source: 'unavailable',
      graphFileCount: safeGraphFileCount,
      defaultMaxFiles: policy.maxFiles,
      rootCount: normalizedRoots.length,
      error: 'filesystem discovery does not have a bounded Git coverage denominator',
    };
  }

  const tracked = new Set<string>();
  const workspace = new Set<string>();
  for (const rootDir of normalizedRoots) {
    const trackedForRoot = listGitAbsorbableFiles(rootDir, policy.receipt, false);
    const workspaceForRoot = policy.includeUntracked
      ? listGitAbsorbableFiles(rootDir, policy.receipt, true)
      : trackedForRoot;
    if (!trackedForRoot || !workspaceForRoot) {
      return {
        available: false,
        source: 'unavailable',
        graphFileCount: safeGraphFileCount,
        defaultMaxFiles: policy.maxFiles,
        rootCount: normalizedRoots.length,
        error: 'git ls-files unavailable for one or more workspace roots',
      };
    }
    for (const filePath of trackedForRoot) tracked.add(filePath);
    for (const filePath of workspaceForRoot) workspace.add(filePath);
  }

  const selectedCandidateCount = policy.includeUntracked ? workspace.size : tracked.size;
  const expectedGraphFileCount = Math.min(selectedCandidateCount, policy.maxFiles);
  const complete = safeGraphFileCount >= expectedGraphFileCount;
  const extraGraphFiles = Math.max(0, safeGraphFileCount - expectedGraphFileCount);
  return {
    available: true,
    source: policy.includeUntracked ? 'git-ls-files-cached-and-others' : 'git-ls-files',
    graphFileCount: safeGraphFileCount,
    trackedCandidateCount: tracked.size,
    workspaceCandidateCount: workspace.size,
    selectedCandidateCount,
    expectedGraphFileCount,
    defaultMaxFiles: policy.maxFiles,
    complete,
    ratio: expectedGraphFileCount === 0 ? 1 : safeGraphFileCount / expectedGraphFileCount,
    cappedByMaxFiles: selectedCandidateCount > policy.maxFiles,
    overInclusive: extraGraphFiles > 0,
    extraGraphFiles,
    rootCount: normalizedRoots.length,
  };
}

function graphCoverageIsComplete(coverage: GraphCoverageStatus): boolean {
  return (
    coverage.available &&
    coverage.complete === true &&
    coverage.overInclusive !== true &&
    coverage.cappedByMaxFiles !== true
  );
}

interface GraphRootSourcePin {
  rootDir: string;
  gitCommitHash: string | null;
  worktreeFingerprint: string | null;
}

function fileBelongsToRoot(filePath: string, rootDir: string): boolean {
  const relative = path.relative(path.resolve(rootDir), path.resolve(filePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function captureGraphRootSourcePins(
  rootDirs: string[],
  scanPolicy: GraphScanPolicy,
  primaryCommit?: string | null,
  primaryWorktreeFingerprint?: string | null
): Promise<GraphRootSourcePin[]> {
  const primaryRoot = normalizeRootForComparison(rootDirs[0] ?? '');
  return Promise.all(
    canonicalizeRootSet(rootDirs).map(async (rootDir) => {
      const isPrimary = normalizeRootForComparison(rootDir) === primaryRoot;
      return {
        rootDir: path.resolve(rootDir),
        gitCommitHash:
          isPrimary && primaryCommit !== undefined
            ? primaryCommit
            : await getCurrentGitCommit(rootDir),
        worktreeFingerprint:
          isPrimary && primaryWorktreeFingerprint !== undefined
            ? primaryWorktreeFingerprint
            : buildGitWorktreeFingerprint(rootDir, scanPolicy),
      };
    })
  );
}

async function assertGraphRootSourcePinsCurrent(
  pins: GraphRootSourcePin[],
  scanPolicy: GraphScanPolicy
): Promise<void> {
  for (const pin of pins) {
    const currentCommit = await getCurrentGitCommit(pin.rootDir);
    if (pin.gitCommitHash !== currentCommit) {
      throw new AbsorbRefreshCommitPinError(
        pin.gitCommitHash ?? 'no git commit',
        currentCommit,
        pin.rootDir
      );
    }
    const currentFingerprint = buildGitWorktreeFingerprint(pin.rootDir, scanPolicy);
    if (pin.worktreeFingerprint !== currentFingerprint) {
      throw new AbsorbRefreshWorktreePinError(
        pin.worktreeFingerprint ?? 'unavailable',
        currentFingerprint,
        pin.rootDir
      );
    }
  }
}

async function assertGraphRootHeadPinsCurrent(pins: GraphRootSourcePin[]): Promise<void> {
  for (const pin of pins) {
    const currentCommit = await getCurrentGitCommit(pin.rootDir);
    if (pin.gitCommitHash !== currentCommit) {
      throw new AbsorbRefreshCommitPinError(
        pin.gitCommitHash ?? 'no git commit',
        currentCommit,
        pin.rootDir
      );
    }
  }
}

async function waitForAbortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error('Absorb source-drift debounce cancelled')
      );
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function waitForAbsorbSourceDriftDebounce(
  rootDirs: string[],
  debounceMs: number,
  signal?: AbortSignal
): Promise<number> {
  if (debounceMs <= 0) return 0;
  const startedAt = Date.now();
  const maxWaitMs = Math.max(debounceMs, debounceMs * 4);
  let stableSince = Date.now();
  let observedHeads = await Promise.all(
    canonicalizeRootSet(rootDirs).map((rootDir) => getCurrentGitCommit(rootDir))
  );

  while (Date.now() - stableSince < debounceMs && Date.now() - startedAt < maxWaitMs) {
    const remainingQuietMs = debounceMs - (Date.now() - stableSince);
    await waitForAbortableDelay(Math.max(1, Math.min(250, remainingQuietMs)), signal);
    const currentHeads = await Promise.all(
      canonicalizeRootSet(rootDirs).map((rootDir) => getCurrentGitCommit(rootDir))
    );
    if (currentHeads.some((head, index) => head !== observedHeads[index])) {
      observedHeads = currentHeads;
      stableSince = Date.now();
    }
  }
  return Date.now() - startedAt;
}

function buildGraphRootAuthorityPins(
  sourcePins: GraphRootSourcePin[],
  primaryRootDir: string,
  scannedFilePaths: string[],
  scanPolicy: GraphScanPolicy
): GraphRootAuthorityPin[] {
  const absoluteFiles = scannedFilePaths.map((filePath) => path.resolve(primaryRootDir, filePath));
  return sourcePins.map((pin) => {
    const graphFileCount = absoluteFiles.filter((filePath) =>
      fileBelongsToRoot(filePath, pin.rootDir)
    ).length;
    return {
      ...pin,
      coverageAtScan: buildGraphCoverageStatus(
        pin.rootDir,
        graphFileCount,
        scanPolicy,
        scannedFilePaths.filter((filePath) =>
          fileBelongsToRoot(path.resolve(primaryRootDir, filePath), pin.rootDir)
        )
      ),
    };
  });
}

interface GraphRootSetAuthorityStatus {
  authoritative: boolean;
  rootSetMatches: boolean;
  changedRoots: string[];
  incompleteRoots: string[];
}

type GraphRootSetAuthoritySource = Pick<
  GraphCacheEnvelope,
  'rootDir' | 'rootDirs' | 'rootSetId' | 'rootAuthorityPins' | 'scanPolicy'
>;

async function evaluateGraphRootSetAuthority(
  envelope: GraphRootSetAuthoritySource,
  requestedRootDirs: string[]
): Promise<GraphRootSetAuthorityStatus> {
  const envelopeRoots = envelope.rootDirs ?? [envelope.rootDir];
  const rootSetMatches = absorbRootSetsMatch(envelopeRoots, requestedRootDirs);
  const requested = canonicalizeRootSet(requestedRootDirs);
  const pins = envelope.rootAuthorityPins ?? [];
  if (
    !rootSetMatches ||
    envelope.rootSetId !== buildRootSetId(requestedRootDirs) ||
    pins.length !== requested.length
  ) {
    return {
      authoritative: false,
      rootSetMatches,
      changedRoots: [],
      incompleteRoots: requested,
    };
  }

  const pinsByRoot = new Map(
    pins.map((pin) => [normalizeRootForComparison(pin.rootDir), pin] as const)
  );
  const changedRoots: string[] = [];
  const incompleteRoots: string[] = [];
  for (const rootDir of requested) {
    const pin = pinsByRoot.get(normalizeRootForComparison(rootDir));
    if (!pin || !graphCoverageIsComplete(pin.coverageAtScan)) {
      incompleteRoots.push(rootDir);
      continue;
    }
    const currentCommit = await getCurrentGitCommit(rootDir);
    const currentFingerprint = buildGitWorktreeFingerprint(rootDir, envelope.scanPolicy);
    if (currentCommit !== pin.gitCommitHash || currentFingerprint !== pin.worktreeFingerprint) {
      changedRoots.push(rootDir);
    }
  }
  return {
    authoritative: changedRoots.length === 0 && incompleteRoots.length === 0,
    rootSetMatches,
    changedRoots,
    incompleteRoots,
  };
}

// Scan reuse can be complete for an explicitly capped subset even though that
// subset must not claim whole-repository authority. Keep execution reuse and
// authority as separate predicates to avoid rebuilding the same capped plan on
// every call while still failing closed for global queries.
function graphCoverageMatchesScanPolicy(coverage: GraphCoverageStatus): boolean {
  return !coverage.available || (coverage.complete !== false && coverage.overInclusive !== true);
}

interface ReuseScanPolicyResolution {
  policy: GraphScanPolicy;
  priorCoverage: GraphCoverageStatus;
  promotedCappedMaxFiles: boolean;
}

/**
 * Resolve the scan policy for a same-root cache reuse.
 *
 * An explicit maxFiles remains an intentional subset contract. When the caller
 * omits maxFiles, however, inheriting a previously capped cache silently turns
 * that old subset into the new request's authority boundary. Promote the cap to
 * the live Git-visible candidate count so the normal full-scan repair path can
 * restore whole-repository authority (and auto-background the work when large).
 */
function resolveReuseScanPolicy(
  rootDir: string,
  graphFileCount: number,
  requestedPolicy: GraphScanPolicy,
  maxFilesExplicit: boolean
): ReuseScanPolicyResolution {
  const policy = normalizeScanPolicy(requestedPolicy);
  const priorCoverage = buildGraphCoverageStatus(rootDir, graphFileCount, policy);
  const selectedCandidateCount = priorCoverage.selectedCandidateCount;
  if (
    maxFilesExplicit ||
    !priorCoverage.available ||
    priorCoverage.cappedByMaxFiles !== true ||
    !Number.isFinite(selectedCandidateCount) ||
    Number(selectedCandidateCount) <= 0
  ) {
    return { policy, priorCoverage, promotedCappedMaxFiles: false };
  }

  return {
    policy: normalizeScanPolicy({
      ...policy,
      maxFiles: Math.max(policy.maxFiles ?? DEFAULT_SCAN_MAX_FILES, Number(selectedCandidateCount)),
    }),
    priorCoverage,
    promotedCappedMaxFiles: true,
  };
}

/**
 * Hash the live Git worktree delta without rereading every cached file.
 *
 * HEAD alone cannot detect staged, unstaged, or untracked edits. The porcelain
 * path set plus current bytes provides a stable fingerprint for those changes:
 * staging an unchanged file does not invalidate the graph, while a second edit,
 * dirty-to-clean transition, add, delete, or rename does. Paths outside the
 * scanner policy are omitted so ignored binaries and build debris do not make a
 * source graph stale.
 */
function buildGitWorktreeFingerprint(
  rootDir: string | null | undefined,
  scanPolicy?: GraphScanPolicy | null
): string | null {
  if (!rootDir) return null;
  const policy = buildCoveragePolicy(scanPolicy);
  if (!policy.respectGitIgnore) return null;

  try {
    const output = execFileSync(
      'git',
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      {
        cwd: rootDir,
        encoding: 'utf-8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    const records = output.split('\0').filter(Boolean);
    const paths = new Set<string>();

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]!;
      if (record.length < 4) continue;
      const status = record.slice(0, 2);
      const filePath = record.slice(3).replace(/\\/g, '/');
      if (!(status === '??' && !policy.includeUntracked)) paths.add(filePath);

      // Porcelain -z emits the second rename/copy path as the next NUL record.
      if ((status.includes('R') || status.includes('C')) && records[index + 1]) {
        paths.add(records[index + 1]!.replace(/\\/g, '/'));
        index += 1;
      }
    }

    const entries: string[] = [];
    for (const filePath of Array.from(paths).sort()) {
      if (isCoverageExcludedPath(filePath, policy)) continue;
      const resolvedFile = resolveCachedGraphFilePath(rootDir, filePath);
      if (!resolvedFile) continue;
      try {
        const stat = fs.statSync(resolvedFile);
        if (!stat.isFile() || stat.size > policy.maxFileSize) continue;
        const hash = createHash('sha256').update(fs.readFileSync(resolvedFile)).digest('hex');
        entries.push(`${filePath}\0${hash}`);
      } catch {
        entries.push(`${filePath}\0<deleted>`);
      }
    }

    return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  } catch {
    return null;
  }
}

function buildCoverageAuthorityCaveats(coverage: GraphCoverageStatus): string[] {
  if (!coverage.available) return [];
  const caveats: string[] = [];
  if (coverage.cappedByMaxFiles) {
    caveats.push(
      `graph_coverage_capped_at_${coverage.expectedGraphFileCount ?? 0}_of_${coverage.selectedCandidateCount ?? 'unknown'}_git_visible_candidates`
    );
  }
  if (coverage.overInclusive) {
    caveats.push(
      `graph_contains_${coverage.extraGraphFiles ?? 0}_files_beyond_selected_candidates`
    );
  }
  if ((coverage.missingGraphFiles ?? 0) > 0) {
    caveats.push(`graph_missing_${coverage.missingGraphFiles}_selected_candidates`);
  }
  return caveats;
}

function buildSkippedFileHashFreshnessStatus(
  reason: GraphFileHashFreshnessReason,
  fileHashes?: Record<string, string> | null,
  error?: string
): GraphFileHashFreshnessStatus {
  return {
    checked: false,
    fresh: false,
    reason,
    storedFileCount: fileHashes ? Object.keys(fileHashes).length : 0,
    checkedFileCount: 0,
    modifiedFileCount: 0,
    deletedFileCount: 0,
    modifiedFileSample: [],
    deletedFileSample: [],
    ...(error && { error }),
  };
}

function resolveCachedGraphFilePath(rootDir: string, filePath: string): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(resolvedRoot, filePath.replace(/\\/g, path.sep));
  const rootProbe = normalizeRootForComparison(resolvedRoot);
  const fileProbe = normalizeRootForComparison(resolvedFile);
  if (fileProbe !== rootProbe && !fileProbe.startsWith(`${rootProbe}${path.sep}`)) {
    return null;
  }
  return resolvedFile;
}

function buildGraphFileHashFreshnessStatus(
  rootDir: string | null | undefined,
  fileHashes?: Record<string, string> | null
): GraphFileHashFreshnessStatus {
  if (!rootDir) return buildSkippedFileHashFreshnessStatus('rootDir_missing', fileHashes);
  if (!fileHashes) return buildSkippedFileHashFreshnessStatus('file_hashes_missing', fileHashes);

  const entries = Object.entries(fileHashes);
  if (entries.length === 0) {
    return buildSkippedFileHashFreshnessStatus('file_hashes_empty', fileHashes);
  }

  try {
    const modified: string[] = [];
    const deleted: string[] = [];
    let checkedFileCount = 0;

    for (const [filePath, storedHash] of entries) {
      const resolvedFile = resolveCachedGraphFilePath(rootDir, filePath);
      if (!resolvedFile) {
        deleted.push(filePath);
        continue;
      }

      try {
        const currentHash = createHash('sha256')
          .update(fs.readFileSync(resolvedFile))
          .digest('hex');
        checkedFileCount += 1;
        if (currentHash !== storedHash) modified.push(filePath);
      } catch {
        deleted.push(filePath);
      }
    }

    const fresh = modified.length === 0 && deleted.length === 0;
    return {
      checked: true,
      fresh,
      reason: fresh ? 'all_hashes_match' : 'hash_mismatch',
      verificationMode: 'full-file-hash',
      storedFileCount: entries.length,
      checkedFileCount,
      modifiedFileCount: modified.length,
      deletedFileCount: deleted.length,
      modifiedFileSample: modified.slice(0, FILE_HASH_FRESHNESS_SAMPLE_LIMIT),
      deletedFileSample: deleted.slice(0, FILE_HASH_FRESHNESS_SAMPLE_LIMIT),
    };
  } catch (err) {
    return buildSkippedFileHashFreshnessStatus(
      'hash_check_error',
      fileHashes,
      err instanceof Error ? err.message : String(err)
    );
  }
}

function buildWorktreeFingerprintFreshnessStatus(
  fileHashes?: Record<string, string> | null
): GraphFileHashFreshnessStatus {
  const storedFileCount = fileHashes ? Object.keys(fileHashes).length : 0;
  return {
    checked: true,
    fresh: true,
    reason: 'all_hashes_match',
    verificationMode: 'git-worktree-fingerprint',
    storedFileCount,
    checkedFileCount: storedFileCount,
    modifiedFileCount: 0,
    deletedFileCount: 0,
    modifiedFileSample: [],
    deletedFileSample: [],
  };
}

function fileHashesBridgeHeadMismatch(options: {
  cacheGitCommitHash: string | null | undefined;
  currentGitCommitHash: string | null | undefined;
  fileHashFreshness: GraphFileHashFreshnessStatus;
}): boolean {
  return Boolean(
    options.cacheGitCommitHash &&
    options.currentGitCommitHash &&
    options.cacheGitCommitHash !== options.currentGitCommitHash &&
    options.fileHashFreshness.fresh
  );
}

function buildHeadFreshnessAuthorityCaveats(options: {
  gitMatchesHead: boolean;
  fileHashFreshForHeadMismatch: boolean;
}): string[] {
  if (options.gitMatchesHead || !options.fileHashFreshForHeadMismatch) return [];
  return ['git_head_mismatch_but_file_hashes_match'];
}

function buildLocalCodebaseSnapshotAuthority(options: {
  receipt?: LocalCodebaseSnapshotReceiptSummary | null;
  rootDir?: string | null;
  graphFileCount: number;
  freshByAge: boolean;
}): LocalCodebaseSnapshotAuthority | null {
  if (!options.receipt) return null;

  const graphFileCount = Number.isFinite(options.graphFileCount)
    ? Math.max(0, options.graphFileCount)
    : 0;
  const receiptFileCount = Number.isFinite(options.receipt.totalFiles)
    ? Math.max(0, options.receipt.totalFiles)
    : 0;
  const receiptCoverageComplete = graphFileCount >= receiptFileCount;
  const authoritative = options.freshByAge && receiptCoverageComplete;
  const reason: LocalCodebaseSnapshotAuthorityReason = !options.freshByAge
    ? 'receipt_cache_stale'
    : !receiptCoverageComplete
      ? 'receipt_graph_incomplete'
      : 'receipt_sourcefiles_verified';

  return {
    authoritative,
    scope: 'local-codebase-snapshot',
    reason,
    rootDir: options.rootDir ?? null,
    graphFileCount,
    receiptFileCount,
    receiptCoverageComplete,
    freshByAge: options.freshByAge,
    receipt: options.receipt,
  };
}

function getEnvelopeGraphFileCount(envelope: GraphCacheEnvelope): number {
  const fileHashCount = envelope.fileHashes ? Object.keys(envelope.fileHashes).length : undefined;
  const statsTotalFiles = Number((envelope.stats as { totalFiles?: unknown })?.totalFiles ?? 0);
  if (fileHashCount !== undefined) return fileHashCount;
  return Number.isFinite(statsTotalFiles) ? Math.max(0, statsTotalFiles) : 0;
}

function hashInlineSourceFiles(sourceFiles: SourceFileEntry[]): Record<string, string> {
  return Object.fromEntries(
    sourceFiles.map((file) => [
      file.path.replace(/\\/g, '/'),
      createHash('sha256').update(file.content).digest('hex'),
    ])
  );
}

async function getCurrentGitCommit(rootDir: string | null | undefined): Promise<string | null> {
  if (!rootDir) return null;
  try {
    const { GitChangeDetector } = await loadCodebaseModule();
    const detector = new GitChangeDetector(rootDir);
    return detector.getHeadCommit?.() ?? null;
  } catch {
    return null;
  }
}

function cacheGitMatchesHead(
  cacheGitCommitHash: string | null | undefined,
  currentGitCommitHash: string | null | undefined
): boolean {
  return (
    !cacheGitCommitHash || !currentGitCommitHash || cacheGitCommitHash === currentGitCommitHash
  );
}

/**
 * The repo root the MCP treats as "the current workspace" for cache authority.
 * Defaults to process.cwd(), but a fixed-cwd sovereign MCP (one server, launched
 * once, serving many repos) can pin a specific repo via HOLOSCRIPT_WORKSPACE_ROOT
 * in its registration env, so its authoritative cache is that repo regardless of
 * the directory the client happened to launch it from.
 */
function resolveWorkspaceRoot(): string {
  const pinned = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
  return path.resolve(pinned && pinned.trim().length > 0 ? pinned : process.cwd());
}

/**
 * Cross-root authority: a HoloGraph cache whose rootDir differs from the current
 * workspace root is still authoritative for ITS OWN repo when it positively
 * describes that repo's live git HEAD with complete coverage. This lets one
 * sovereign local MCP answer structural queries about any repo it has absorbed
 * (HoloScript, ai-ecosystem, uaa2-service) instead of only the repo equal to its
 * launch dir.
 *
 * The check demands POSITIVE evidence — a real, non-null cache commit that equals
 * the rootDir's live HEAD, plus available AND complete coverage — so it rejects
 * throwaway scratch absorbs like /tmp/holoscript-absorb-XXXX: those dirs are not
 * git repos, so getCurrentGitCommit returns null and the cache is refused here.
 * cacheGitMatchesHead is deliberately NOT reused: its null-tolerance would admit
 * exactly those scratch caches.
 */
async function cacheDescribesRealCurrentRepo(options: {
  rootDir: string | null | undefined;
  cacheGitCommitHash: string | null | undefined;
  fileHashes?: Record<string, string> | null;
  freshByAge: boolean;
  coverage: GraphCoverageStatus;
}): Promise<GraphRepoAuthorityStatus> {
  const { rootDir, cacheGitCommitHash, fileHashes, freshByAge, coverage } = options;
  const unavailable = (
    reason: GraphFileHashFreshnessReason = 'not_checked'
  ): GraphRepoAuthorityStatus => ({
    ok: false,
    currentGitCommitHash: null,
    gitMatchesHead: false,
    fileHashFreshForHeadMismatch: false,
    fileHashFreshness: buildSkippedFileHashFreshnessStatus(reason, fileHashes),
  });

  if (!rootDir || !cacheGitCommitHash || !freshByAge) {
    return unavailable(!rootDir ? 'rootDir_missing' : 'not_checked');
  }
  // Coverage must be positively verified against the repo's own tracked files;
  // an "unavailable" coverage (non-git dir) is treated as NOT complete here.
  if (!coverage.available || coverage.complete !== true) {
    return unavailable();
  }
  const currentGitCommitHash = await getCurrentGitCommit(rootDir);
  const gitMatchesHead =
    currentGitCommitHash !== null && currentGitCommitHash === cacheGitCommitHash;
  // HEAD equality is not content equality in a live worktree. A staged,
  // unstaged, or untracked edit leaves HEAD unchanged, so skipping hashes here
  // can mark a graph authoritative even after its source changed. Verify the
  // persisted snapshot on every authority check; coverage separately detects
  // newly added absorbable files that are not present in fileHashes yet.
  const fileHashFreshness = buildGraphFileHashFreshnessStatus(rootDir, fileHashes);
  const fileHashFreshForHeadMismatch = fileHashesBridgeHeadMismatch({
    cacheGitCommitHash,
    currentGitCommitHash,
    fileHashFreshness,
  });

  return {
    ok:
      currentGitCommitHash !== null &&
      fileHashFreshness.fresh &&
      (gitMatchesHead || fileHashFreshForHeadMismatch),
    currentGitCommitHash,
    gitMatchesHead,
    fileHashFreshForHeadMismatch,
    fileHashFreshness,
  };
}

function shortGitHash(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 12) : 'unknown';
}

function buildGraphUnavailableReceipt(options: {
  reason: GraphUnavailableReason;
  requestedPath?: string | null;
  runtimePath?: string | null;
  cacheAgeMs?: number;
}): GraphUnavailableReceipt {
  const cacheAgeMs = options.cacheAgeMs;
  return {
    schemaVersion: GRAPH_UNAVAILABLE_RECEIPT_SCHEMA,
    kind: 'GraphUnavailableReceipt',
    reason: options.reason,
    requestedPath: options.requestedPath ?? null,
    runtimePath: options.runtimePath ?? null,
    runtimeCwd: resolveWorkspaceRoot(),
    cacheAgeMs: cacheAgeMs ?? null,
    cacheAgeHuman: formatCacheAge(cacheAgeMs),
    staleThresholdMs: CACHE_MAX_AGE_MS,
    staleByMs:
      cacheAgeMs !== undefined && cacheAgeMs >= CACHE_MAX_AGE_MS
        ? cacheAgeMs - CACHE_MAX_AGE_MS
        : null,
    authoritative: false,
    recommendation: LOCAL_ADAPTER_RECOMMENDATION,
    localAdapter: buildLocalAdapterRecommendation(options.requestedPath),
    createdAt: new Date().toISOString(),
  };
}

function buildSemanticAuthorityFields(
  graphCoverage?: GraphCoverageStatus
): Pick<
  SemanticIndexReadinessReceipt,
  'graphAuthoritative' | 'graphCoverage' | 'authorityCaveats'
> {
  if (!graphCoverage) return {};
  return {
    graphAuthoritative: graphCoverageIsComplete(graphCoverage),
    graphCoverage,
    authorityCaveats: buildCoverageAuthorityCaveats(graphCoverage),
  };
}

function buildStatsOnlySemanticIndexReceipt(
  rootDir: string,
  graphCoverage?: GraphCoverageStatus
): SemanticIndexReadinessReceipt {
  return {
    schemaVersion: SEMANTIC_INDEX_READINESS_RECEIPT_SCHEMA,
    kind: 'SemanticIndexReadinessReceipt',
    rootDir,
    ...buildSemanticAuthorityFields(graphCoverage),
    semanticIndexReady: false,
    graphRagReady: false,
    embeddingIndexReady: false,
    embeddingSkipped: true,
    embeddingSkipReason: 'outputFormat:stats',
    priorGraphRagReady: isGraphRAGReady(),
    provider: NATIVE_GRAPH_RAG_PROVIDER,
    graphProvider: 'holograph',
    message:
      'outputFormat "stats" updates the HoloGraph cache only; it does not build or validate the HoloEmbed semantic index for this absorb result.',
    nextStep:
      'Run holo_absorb_repo with outputFormat "graph" or "holo" before relying on holo_semantic_search or holo_ask_codebase for this graph.',
    createdAt: new Date().toISOString(),
  };
}

function buildSemanticIndexReadinessReceipt(
  rootDir: string,
  options: {
    priorGraphRagReady: boolean;
    embeddingBuildError?: unknown;
    embeddingFailureReason?: 'embeddingBuildFailed' | 'embeddingLoadFailed';
    graphRagReadyOverride?: boolean;
    graphCoverage?: GraphCoverageStatus;
  }
): SemanticIndexReadinessReceipt {
  const graphAuthoritative =
    options.graphCoverage === undefined || graphCoverageIsComplete(options.graphCoverage);
  const graphRagReady = (options.graphRagReadyOverride ?? isGraphRAGReady()) && graphAuthoritative;
  const authorityFields = buildSemanticAuthorityFields(options.graphCoverage);
  const failureMessage =
    options.embeddingBuildError === undefined
      ? undefined
      : options.embeddingBuildError instanceof Error
        ? options.embeddingBuildError.message
        : String(options.embeddingBuildError);

  if (failureMessage) {
    return {
      schemaVersion: SEMANTIC_INDEX_READINESS_RECEIPT_SCHEMA,
      kind: 'SemanticIndexReadinessReceipt',
      rootDir,
      ...authorityFields,
      semanticIndexReady: false,
      graphRagReady: false,
      embeddingIndexReady: false,
      embeddingSkipped: true,
      embeddingSkipReason: options.embeddingFailureReason ?? 'embeddingBuildFailed',
      embeddingFailure: { message: failureMessage },
      priorGraphRagReady: options.priorGraphRagReady,
      provider: NATIVE_GRAPH_RAG_PROVIDER,
      graphProvider: 'holograph',
      message:
        options.embeddingFailureReason === 'embeddingLoadFailed'
          ? 'HoloGraph cache was reused, but the persisted HoloEmbed semantic index could not be loaded for this absorb result.'
          : 'HoloGraph cache was updated, but HoloEmbed semantic index creation failed for this absorb result.',
      nextStep:
        options.embeddingFailureReason === 'embeddingLoadFailed'
          ? 'Rerun holo_absorb_repo with outputFormat "graph" or "holo" to rebuild the HoloEmbed semantic index before relying on holo_semantic_search or holo_ask_codebase.'
          : 'Fix the HoloEmbed failure, then rerun holo_absorb_repo with outputFormat "graph" or "holo" before relying on holo_semantic_search or holo_ask_codebase.',
      createdAt: new Date().toISOString(),
    };
  }

  return {
    schemaVersion: SEMANTIC_INDEX_READINESS_RECEIPT_SCHEMA,
    kind: 'SemanticIndexReadinessReceipt',
    rootDir,
    ...authorityFields,
    semanticIndexReady: graphRagReady,
    graphRagReady,
    embeddingIndexReady: graphRagReady,
    embeddingSkipped: false,
    priorGraphRagReady: options.priorGraphRagReady,
    provider: NATIVE_GRAPH_RAG_PROVIDER,
    graphProvider: 'holograph',
    message: graphRagReady
      ? 'HoloGraph cache and HoloEmbed semantic index are ready for this absorb result.'
      : !graphAuthoritative
        ? 'HoloEmbed completed, but HoloGraph coverage is capped or incomplete, so semantic readiness is withheld for this absorb result.'
        : 'HoloGraph cache was updated, but no HoloEmbed semantic index is ready for this absorb result.',
    nextStep: graphRagReady
      ? 'Use holo_semantic_search or holo_ask_codebase with the current GraphRAG index.'
      : !graphAuthoritative
        ? 'Rerun holo_absorb_repo without an explicit maxFiles cap (or set maxFiles to the full Git-visible candidate count) before relying on semantic tools.'
        : 'Run holo_absorb_repo with outputFormat "graph" or "holo" and verify semanticIndexReady before relying on semantic tools.',
    createdAt: new Date().toISOString(),
  };
}

function buildAbsorbAuthorityResultFields(
  receipt: SemanticIndexReadinessReceipt
): Record<string, unknown> {
  if (receipt.graphAuthoritative === undefined) return {};
  return {
    graphAuthoritative: receipt.graphAuthoritative,
    graphCoverage: receipt.graphCoverage,
    authorityCaveats: receipt.authorityCaveats ?? [],
  };
}

function shellQuoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildLocalAdapterRecommendation(
  requestedPath?: string | null
): LocalAdapterRecommendation {
  const rootArg = requestedPath && requestedPath.trim() ? requestedPath : '<repo-root>';
  return {
    schemaVersion: LOCAL_ADAPTER_RECOMMENDATION_SCHEMA,
    kind: 'HoloShellLocalAdapterRecommendation',
    command: `node ${HOLOSHELL_LOCAL_ADAPTER_SCRIPT} --agent <agent-id> --surface <surface-id> --roots ${shellQuoteArg(rootArg)} --out <receipt.json>`,
    mcpTool: 'holo_absorb_repo',
    mcpArguments: ['localCodebaseSnapshotReceipt', 'sourceFiles', 'rootDir', 'rootDirs'],
    acceptedReceiptSchemas: [
      LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA,
      HOLOSHELL_LOCAL_CODEBASE_SNAPSHOT_RECEIPT_KIND,
    ],
    note: 'Set --agent/--surface for the active HoloShell seat, or export HOLOSHELL_AGENT_ID/HOLOSHELL_AGENT_SURFACE. Pass the emitted receipt as localCodebaseSnapshotReceipt; if the receipt is hash-only, include matching sourceFiles in the same holo_absorb_repo call.',
  };
}

function fsyncDirectoryBestEffort(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(directory, 'r');
    fs.fsyncSync(descriptor);
  } catch {
    // Windows may reject directory handles. File fsync + atomic rename still
    // preserves process-crash safety; POSIX gets the stronger power-loss fence.
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Best-effort durability fence only.
      }
    }
  }
}

function atomicWriteFileSync(
  targetPath: string,
  data: string | NodeJS.ArrayBufferView,
  options?: fs.WriteFileOptions
): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = path.join(
    dir,
    `${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  let fileDescriptor: number | undefined;

  try {
    fileDescriptor = fs.openSync(tempPath, 'wx');
    fs.writeFileSync(fileDescriptor, data, options);
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(tempPath, targetPath);
    fsyncDirectoryBestEffort(dir);
  } catch (err) {
    try {
      if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    } catch {
      // Preserve the original write failure.
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore temp cleanup failures; preserve the original write error.
    }
    throw err;
  }
}

interface GraphCacheArtifactIdentity {
  sha256: string;
  bytes: number;
}

function writeUtf8ChunksSync(
  fileDescriptor: number,
  value: string,
  identity?: { hash: ReturnType<typeof createHash>; bytes: number }
): void {
  const chunkCharacters = 1024 * 1024;
  for (let offset = 0; offset < value.length; offset += chunkCharacters) {
    const buffer = Buffer.from(value.slice(offset, offset + chunkCharacters), 'utf-8');
    identity?.hash.update(buffer);
    if (identity) identity.bytes += buffer.length;
    let written = 0;
    while (written < buffer.length) {
      const bytesWritten = fs.writeSync(fileDescriptor, buffer, written, buffer.length - written);
      if (bytesWritten <= 0) {
        throw new Error('Unable to make progress while writing graph cache');
      }
      written += bytesWritten;
    }
  }
}

/**
 * Persist the graph envelope without materializing a second cache-sized JSON
 * string. `graph.serialize()` is already hundreds of MiB on the HoloScript
 * monorepo; JSON.stringify(envelope) used to duplicate and escape that entire
 * string on the V8 heap immediately before publication.
 */
function atomicWriteGraphCacheEnvelopeSync(
  targetPath: string,
  envelope: GraphCacheEnvelope
): GraphCacheArtifactIdentity {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = path.join(
    dir,
    `${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  let fileDescriptor: number | undefined;
  const identity = { hash: createHash('sha256'), bytes: 0 };

  try {
    const { graphJson, ...metadata } = envelope;
    const metadataJson = JSON.stringify(metadata);
    fileDescriptor = fs.openSync(tempPath, 'wx');
    writeUtf8ChunksSync(fileDescriptor, metadataJson.slice(0, -1), identity);
    writeUtf8ChunksSync(fileDescriptor, ',"graphJson":"', identity);
    const chunkCharacters = 1024 * 1024;
    for (let offset = 0; offset < graphJson.length; offset += chunkCharacters) {
      const escaped = JSON.stringify(graphJson.slice(offset, offset + chunkCharacters)).slice(
        1,
        -1
      );
      writeUtf8ChunksSync(fileDescriptor, escaped, identity);
    }
    writeUtf8ChunksSync(fileDescriptor, '"}', identity);
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(tempPath, targetPath);
    fsyncDirectoryBestEffort(dir);
    return {
      sha256: identity.hash.digest('hex'),
      bytes: identity.bytes,
    };
  } catch (err) {
    try {
      if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    } catch {
      // Preserve the original write failure.
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore temp cleanup failures; preserve the original write error.
    }
    throw err;
  }
}

function saveGraphCache(
  graph: any,
  rootDir: string,
  stats: Record<string, unknown>,
  gitCommitHash?: string,
  fileHashes?: Record<string, string>,
  embeddingProvider?: string,
  localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary,
  scanPolicy?: GraphScanPolicy,
  serializedGraph?: string,
  embeddingCacheIdentity?: EmbeddingCacheIdentity,
  rootDirs?: string[],
  targetPath?: string,
  cacheGenerationId?: string,
  rootAuthorityPins?: GraphRootAuthorityPin[]
): GraphCacheArtifactIdentity | null {
  const totalFiles = Number((stats as { totalFiles?: unknown })?.totalFiles ?? 0);
  if (!Number.isFinite(totalFiles) || totalFiles <= 0) {
    return null;
  }
  try {
    const normalizedScanPolicy = normalizeScanPolicy(scanPolicy);
    const normalizedRootDirs =
      rootDirs && rootDirs.length > 0 ? rootDirs.map((entry) => path.resolve(entry)) : [rootDir];
    const coverageAtScan = buildGraphCoverageStatusForRoots(
      normalizedRootDirs,
      fileHashes ? Object.keys(fileHashes).length : totalFiles,
      normalizedScanPolicy,
      fileHashes ? Object.keys(fileHashes) : undefined
    );
    const worktreeFingerprint = buildGitWorktreeFingerprint(rootDir, normalizedScanPolicy);
    graph.gitCommitHash = gitCommitHash;
    graph.fileHashes = fileHashes;
    graph.scanPolicy = normalizedScanPolicy;
    graph.worktreeFingerprint = worktreeFingerprint ?? undefined;
    graph.coverageAtScan = coverageAtScan;
    graph.rootDirs = normalizedRootDirs;
    graph.rootSetId = buildRootSetId(normalizedRootDirs);
    graph.rootAuthorityPins = rootAuthorityPins;
    graph.localCodebaseSnapshotReceipt = localCodebaseSnapshotReceipt;
    const envelope: GraphCacheEnvelope = {
      version: 2,
      ...(cacheGenerationId && { cacheGenerationId }),
      rootDir,
      rootDirs: normalizedRootDirs,
      rootSetId: buildRootSetId(normalizedRootDirs),
      rootAuthorityPins,
      timestamp: Date.now(),
      stats,
      graphJson: serializedGraph ?? graph.serialize(),
      gitCommitHash,
      fileHashes,
      embeddingProvider,
      embeddingPolicy: buildGraphRAGEmbeddingPolicyReceipt(),
      localCodebaseSnapshotReceipt,
      scanPolicy: normalizedScanPolicy,
      ...(worktreeFingerprint && { worktreeFingerprint }),
      coverageAtScan,
      embeddingCacheSha256: embeddingCacheIdentity?.sha256 ?? null,
      embeddingCacheBytes: embeddingCacheIdentity?.bytes ?? null,
      embeddingCacheMtimeMs: embeddingCacheIdentity?.mtimeMs ?? null,
    };
    const cacheFile = targetPath ?? getCacheFile(rootDir);
    return atomicWriteGraphCacheEnvelopeSync(cacheFile, envelope);
  } catch (err) {
    // Best-effort — don't break absorb if persistence fails
    console.warn(
      `[CacheDebug][codebase] save miss path=${targetPath ?? getCacheFile(rootDir)} error=${(err as Error)?.message ?? String(err)}`
    );
    return null;
  }
}

function embeddingCacheSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function fileHashMapsMatch(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined
): boolean {
  if (!left || !right) return false;
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(
    ([filePath, digest], index) =>
      rightEntries[index]?.[0] === filePath && rightEntries[index]?.[1] === digest
  );
}

interface EmbeddingCacheIdentity {
  sha256: string;
  bytes: number;
  mtimeMs: number;
}

function readEmbeddingsCacheIdentity(
  rootDir?: string | null,
  rootDirs?: string[] | null
): EmbeddingCacheIdentity | null {
  try {
    const embeddingsFile = getEmbeddingsFile(rootDir, rootDirs);
    if (!fs.existsSync(embeddingsFile)) return null;
    const buffer = fs.readFileSync(embeddingsFile);
    const stat = fs.statSync(embeddingsFile);
    return {
      sha256: embeddingCacheSha256(buffer),
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

function saveEmbeddingsCache(
  index: any,
  rootDir: string,
  targetPath?: string
): EmbeddingCacheIdentity | null {
  try {
    if (typeof index.serializeBinary === 'function') {
      const buffer = index.serializeBinary();
      const embeddingsFile = targetPath ?? getEmbeddingsFile(rootDir);
      atomicWriteFileSync(embeddingsFile, buffer);
      const stat = fs.statSync(embeddingsFile);
      return {
        sha256: embeddingCacheSha256(buffer),
        bytes: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    }
  } catch (err) {
    console.warn(
      `[CacheDebug][codebase] save embeddings miss path=${targetPath ?? getEmbeddingsFile(rootDir)} error=${(err as Error)?.message}`
    );
  }
  return null;
}

type CachePublicationFault = 'after-embeddings';
let cachePublicationFaultForTests: CachePublicationFault | null = null;

export function setCachePublicationFaultForTests(fault?: CachePublicationFault): void {
  cachePublicationFaultForTests = fault ?? null;
}

function replaceCacheAliasWithHardLink(sourcePath: string, aliasPath: string): void {
  if (path.resolve(sourcePath) === path.resolve(aliasPath)) return;
  fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(aliasPath),
    `${path.basename(aliasPath)}.link-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
  try {
    fs.linkSync(sourcePath, tempPath);
    try {
      fs.renameSync(tempPath, aliasPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      fs.unlinkSync(aliasPath);
      fs.renameSync(tempPath, aliasPath);
    }
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // The aliases are compatibility projections; the manifest stays authoritative.
    }
    console.warn(
      `[CacheDebug][codebase] compatibility alias update skipped target=${aliasPath} error=${errorMessage(error)}`
    );
  }
}

function refreshCacheCompatibilityAliases(
  rootDir: string,
  graphFile: string,
  embeddingsFile: string | null,
  rootDirs?: string[]
): void {
  const paths = resolveCachePathsForRoots(rootDir, rootDirs);
  replaceCacheAliasWithHardLink(graphFile, paths.graphFile);
  if (embeddingsFile) {
    replaceCacheAliasWithHardLink(embeddingsFile, paths.embeddingsFile);
  }
}

interface PublishCacheGenerationOptions {
  graph: any;
  rootDir: string;
  rootDirs: string[];
  stats: Record<string, unknown>;
  gitCommitHash?: string;
  fileHashes?: Record<string, string>;
  embeddingProvider?: string;
  localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary;
  scanPolicy?: GraphScanPolicy;
  serializedGraph?: string;
  embeddingIndex?: any;
  reuseCurrentEmbeddings?: boolean;
  rootAuthorityPins?: GraphRootAuthorityPin[];
}

interface PublishedCacheGeneration {
  generationId: string;
  manifestFile: string;
  graphFile: string;
  embeddingsFile: string | null;
  embeddingIdentity: EmbeddingCacheIdentity | null;
}

function publishCacheGeneration(
  options: PublishCacheGenerationOptions
): PublishedCacheGeneration | null {
  const workspaceRoot = resolveCacheWorkspaceRootForRoots(options.rootDir, options.rootDirs);
  const paths = resolveCachePathsForRoots(options.rootDir, options.rootDirs);
  const generationId = createHash('sha256')
    .update(
      `${workspaceRoot}:${options.gitCommitHash ?? ''}:${Date.now()}:${process.pid}:${Math.random()}`
    )
    .digest('hex')
    .slice(0, 32);
  const generationDirectory = path.join(paths.generationsDirectory, generationId);
  const graphFile = path.join(generationDirectory, 'graph-cache.json');
  const embeddingsFile = path.join(generationDirectory, 'embeddings-cache.bin');
  let publishedEmbeddingsFile: string | null = null;
  let embeddingIdentity: EmbeddingCacheIdentity | null = null;

  try {
    fs.mkdirSync(generationDirectory, { recursive: true });
    if (options.embeddingIndex) {
      embeddingIdentity = saveEmbeddingsCache(
        options.embeddingIndex,
        options.rootDir,
        embeddingsFile
      );
      if (!embeddingIdentity) {
        throw new Error('Unable to serialize the prepared embedding generation');
      }
      publishedEmbeddingsFile = embeddingsFile;
    } else if (options.reuseCurrentEmbeddings) {
      const currentEmbeddingsFile = getEmbeddingsFile(options.rootDir, options.rootDirs);
      if (fs.existsSync(currentEmbeddingsFile)) {
        const buffer = fs.readFileSync(currentEmbeddingsFile);
        atomicWriteFileSync(embeddingsFile, buffer);
        const stat = fs.statSync(embeddingsFile);
        embeddingIdentity = {
          sha256: embeddingCacheSha256(buffer),
          bytes: stat.size,
          mtimeMs: stat.mtimeMs,
        };
        publishedEmbeddingsFile = embeddingsFile;
      }
    }

    if (cachePublicationFaultForTests === 'after-embeddings') {
      throw new Error('Injected cache publication failure after embeddings write');
    }

    const graphIdentity = saveGraphCache(
      options.graph,
      options.rootDir,
      options.stats,
      options.gitCommitHash,
      options.fileHashes,
      options.embeddingProvider,
      options.localCodebaseSnapshotReceipt,
      options.scanPolicy,
      options.serializedGraph,
      embeddingIdentity ?? undefined,
      options.rootDirs,
      graphFile,
      generationId,
      options.rootAuthorityPins
    );
    if (!graphIdentity) {
      throw new Error('Unable to write graph artifact for cache generation');
    }

    const manifest: CodebaseCacheGenerationManifest = {
      schemaVersion: 'holoscript.absorb-cache-generation.v2',
      kind: 'AbsorbCacheGeneration',
      generationId,
      workspaceRoot,
      graphFile: path.relative(paths.generationsDirectory, graphFile).replace(/\\/g, '/'),
      graphCacheSha256: graphIdentity.sha256,
      graphCacheBytes: graphIdentity.bytes,
      embeddingsFile: publishedEmbeddingsFile
        ? path.relative(paths.generationsDirectory, publishedEmbeddingsFile).replace(/\\/g, '/')
        : null,
      embeddingCacheSha256: embeddingIdentity?.sha256 ?? null,
      publishedAt: new Date().toISOString(),
    };
    atomicWriteFileSync(paths.generationManifestFile, JSON.stringify(manifest), 'utf-8');
    refreshCacheCompatibilityAliases(
      options.rootDir,
      graphFile,
      publishedEmbeddingsFile,
      options.rootDirs
    );
    invalidateGraphStatusSnapshot();
    return {
      generationId,
      manifestFile: paths.generationManifestFile,
      graphFile,
      embeddingsFile: publishedEmbeddingsFile,
      embeddingIdentity,
    };
  } catch (error) {
    console.warn(
      `[CacheDebug][codebase] generation publication aborted id=${generationId} error=${errorMessage(error)}`
    );
    try {
      if (fs.existsSync(generationDirectory)) {
        fs.rmSync(generationDirectory, { recursive: true, force: true });
      }
    } catch {
      // An orphaned unselected generation is safe and can be reaped later.
    }
    return null;
  }
}

function bindGraphCacheToEmbeddings(
  rootDir: string,
  identity: EmbeddingCacheIdentity | null,
  rootDirs?: string[]
): boolean {
  if (!identity) return false;
  const cacheRead = readGraphCache(rootDir, { allowExpiredV1: true, rootDirs });
  if (!cacheRead) return false;
  try {
    atomicWriteGraphCacheEnvelopeSync(cacheRead.cacheFile, {
      ...cacheRead.envelope,
      embeddingCacheSha256: identity.sha256,
      embeddingCacheBytes: identity.bytes,
      embeddingCacheMtimeMs: identity.mtimeMs,
    });
    refreshCacheCompatibilityAliases(
      rootDir,
      cacheRead.cacheFile,
      getEmbeddingsFile(rootDir, rootDirs),
      rootDirs
    );
    return true;
  } catch (err) {
    console.warn(
      `[CacheDebug][codebase] embedding generation bind failed path=${cacheRead.cacheFile} error=${errorMessage(err)}`
    );
    return false;
  }
}

function readEmbeddingsCacheModel(
  rootDir?: string | null,
  rootDirs?: string[] | null
): string | null {
  const embeddingsFile = getEmbeddingsFile(rootDir, rootDirs);
  if (!fs.existsSync(embeddingsFile)) return null;

  let fd: number | undefined;
  try {
    fd = fs.openSync(embeddingsFile, 'r');
    const lengthBuffer = Buffer.alloc(4);
    if (fs.readSync(fd, lengthBuffer, 0, 4, 0) !== 4) return null;
    const metadataLength = lengthBuffer.readUInt32LE(0);
    if (metadataLength <= 0 || metadataLength > 1024 * 1024) return null;

    const metadataBuffer = Buffer.alloc(metadataLength);
    if (fs.readSync(fd, metadataBuffer, 0, metadataLength, 4) !== metadataLength) return null;
    const metadata = JSON.parse(metadataBuffer.toString('utf-8')) as { model?: unknown };
    return typeof metadata.model === 'string' ? metadata.model : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

async function loadEmbeddingsCache(
  mod: any,
  providerInstance: any,
  rootDir?: string | null,
  expectedSha256?: string | null,
  rootDirs?: string[] | null
): Promise<any | null> {
  try {
    // A current graph envelope that explicitly has no bound embedding
    // generation must not hydrate an arbitrary binary left by an older scan.
    if (expectedSha256 === null) return null;
    const embeddingsFile = getEmbeddingsFile(rootDir, rootDirs);
    if (!fs.existsSync(embeddingsFile)) return null;
    const buffer = fs.readFileSync(embeddingsFile);
    if (expectedSha256 && embeddingCacheSha256(buffer) !== expectedSha256) {
      console.warn(
        `[CacheDebug][codebase] embeddings generation does not match graph cache — discarding to avoid mixed graph/vector state.`
      );
      return null;
    }
    // No mixed embedding spaces: a cache built by a different provider holds
    // vectors from a different semantic space, so querying it with this provider's
    // vectors returns garbage. The .bin header records the building provider —
    // reject a mismatch so the index rebuilds. Shared GraphRAG should normally
    // be HoloEmbed; this guard also protects legacy/experiment caches.
    try {
      const metaLength = buffer.readUInt32LE(0);
      const meta = JSON.parse(buffer.subarray(4, 4 + metaLength).toString('utf-8')) as {
        model?: string;
      };
      const builtBy = meta.model;
      const current = providerInstance?.name;
      if (builtBy && current && builtBy !== current) {
        console.warn(
          `[CacheDebug][codebase] embeddings built with '${builtBy}' but current provider is '${current}' — discarding to avoid mixed embedding spaces (will rebuild).`
        );
        return null;
      }
    } catch {
      /* header unreadable — fall through to the normal load/catch */
    }
    const index = mod.EmbeddingIndex.deserializeBinary(buffer, { provider: providerInstance });
    return index;
  } catch (err) {
    console.warn(
      `[CacheDebug][codebase] load embeddings miss path=${getEmbeddingsFile(rootDir, rootDirs)}`
    );
    return null;
  }
}

interface GraphCacheReadResult {
  envelope: GraphCacheEnvelope;
  cacheFile: string;
}

function readGraphCache(
  rootDir?: string | null,
  options: { allowExpiredV1?: boolean; rootDirs?: string[] | null } = {}
): GraphCacheReadResult | null {
  const explicitRootDirs =
    options.rootDirs && options.rootDirs.length > 0 ? options.rootDirs : null;
  const exactRootSetRequested = explicitRootDirs !== null;
  const requestedRootDirs = explicitRootDirs ?? [resolveCacheWorkspaceRoot(rootDir)];
  const paths = resolveCachePathsForRoots(rootDir, requestedRootDirs);
  const selected = readCacheGenerationManifest(rootDir, requestedRootDirs);
  const generationManifestPresent = fs.existsSync(paths.generationManifestFile);
  const candidates = selected
    ? [
        {
          cacheFile: selected.graphFile,
          generationId: selected.manifest.generationId,
          graphSha256: selected.manifest.graphCacheSha256,
          graphBytes: selected.manifest.graphCacheBytes,
          embeddingSha256: selected.manifest.embeddingCacheSha256,
        },
      ]
    : generationManifestPresent
      ? []
      : [
          {
            cacheFile: paths.graphFile,
            generationId: undefined,
            graphSha256: undefined,
            graphBytes: undefined,
            embeddingSha256: undefined,
          },
          ...(paths.layout === 'flat'
            ? []
            : [
                {
                  cacheFile: paths.legacyGraphFile,
                  generationId: undefined,
                  graphSha256: undefined,
                  graphBytes: undefined,
                  embeddingSha256: undefined,
                },
              ]),
        ];

  for (const candidate of candidates) {
    const { cacheFile, generationId, graphSha256, graphBytes, embeddingSha256 } = candidate;
    if (!fs.existsSync(cacheFile)) continue;
    try {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      if (
        graphSha256 &&
        (Buffer.byteLength(raw, 'utf-8') !== graphBytes ||
          createHash('sha256').update(raw, 'utf-8').digest('hex') !== graphSha256)
      ) {
        console.warn(
          `[CacheDebug][codebase] selected generation ${generationId} graph bytes do not match its manifest`
        );
        continue;
      }
      const envelope: GraphCacheEnvelope = JSON.parse(raw);
      if (envelope.version !== 1 && envelope.version !== 2) continue;
      if (generationId && envelope.cacheGenerationId !== generationId) {
        console.warn(
          `[CacheDebug][codebase] generation manifest ${generationId} does not match graph envelope ${envelope.cacheGenerationId ?? 'missing'}`
        );
        continue;
      }
      if (generationId && envelope.embeddingCacheSha256 !== embeddingSha256) {
        console.warn(
          `[CacheDebug][codebase] generation manifest embedding digest does not match graph envelope`
        );
        continue;
      }

      // A namespaced reader may use a cache only when it belongs to the exact
      // normalized root set requested. This keeps A+B isolated from A+C even
      // though both sets share the same primary root A.
      const envelopeRootDirs = envelope.rootDirs ?? [envelope.rootDir];
      if (
        (exactRootSetRequested && !absorbRootSetsMatch(envelopeRootDirs, requestedRootDirs)) ||
        (!exactRootSetRequested && envelopeRootDirs.length > 1)
      ) {
        continue;
      }

      if (
        !options.allowExpiredV1 &&
        envelope.version === 1 &&
        Date.now() - envelope.timestamp > CACHE_MAX_AGE_MS
      ) {
        continue;
      }
      return { envelope, cacheFile };
    } catch {
      console.warn(`[CacheDebug][codebase] load miss path=${cacheFile} reason=parse-or-io-error`);
    }
  }
  return null;
}

function loadGraphCache(
  rootDir?: string | null,
  rootDirs?: string[] | null
): GraphCacheEnvelope | null {
  return readGraphCache(rootDir, { rootDirs })?.envelope ?? null;
}

function attachGraphCacheMetadata(graph: any, envelope: GraphCacheEnvelope): void {
  graph.gitCommitHash = envelope.gitCommitHash;
  graph.fileHashes = envelope.fileHashes;
  graph.scanPolicy = normalizeScanPolicy(envelope.scanPolicy);
  graph.worktreeFingerprint = envelope.worktreeFingerprint;
  graph.coverageAtScan = envelope.coverageAtScan;
  graph.rootSetId = envelope.rootSetId;
  graph.rootAuthorityPins = envelope.rootAuthorityPins;
  graph.localCodebaseSnapshotReceipt = envelope.localCodebaseSnapshotReceipt;
  graph.embeddingCacheSha256 = envelope.embeddingCacheSha256;
  graph.embeddingCacheBytes = envelope.embeddingCacheBytes;
  graph.embeddingCacheMtimeMs = envelope.embeddingCacheMtimeMs;
  graph.rootDirs = envelope.rootDirs ?? [envelope.rootDir];
}

function getCacheAge(
  rootDir?: string | null,
  rootDirs?: string[] | null
): {
  exists: boolean;
  ageMs?: number;
  rootDir?: string;
  stats?: Record<string, unknown>;
  gitCommitHash?: string;
  fileHashes?: Record<string, string>;
  fileHashCount?: number;
  embeddingProvider?: string;
  embeddingPolicy?: GraphRAGEmbeddingPolicyReceipt;
  localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary;
  scanPolicy?: GraphScanPolicy;
  worktreeFingerprint?: string;
  coverageAtScan?: GraphCoverageStatus;
  embeddingCacheSha256?: string | null;
  embeddingCacheBytes?: number | null;
  embeddingCacheMtimeMs?: number | null;
  rootDirs?: string[];
  rootSetId?: string;
  rootAuthorityPins?: GraphRootAuthorityPin[];
} {
  try {
    const cacheRead = readGraphCache(rootDir, { allowExpiredV1: true, rootDirs });
    if (!cacheRead) return { exists: false };
    const envelope = cacheRead.envelope;
    return {
      exists: true,
      ageMs: Date.now() - envelope.timestamp,
      rootDir: envelope.rootDir,
      stats: envelope.stats,
      gitCommitHash: envelope.gitCommitHash,
      fileHashes: envelope.fileHashes,
      fileHashCount: envelope.fileHashes ? Object.keys(envelope.fileHashes).length : undefined,
      embeddingProvider: envelope.embeddingProvider,
      embeddingPolicy: envelope.embeddingPolicy,
      localCodebaseSnapshotReceipt: envelope.localCodebaseSnapshotReceipt,
      scanPolicy: normalizeScanPolicy(envelope.scanPolicy),
      worktreeFingerprint: envelope.worktreeFingerprint,
      coverageAtScan: envelope.coverageAtScan,
      embeddingCacheSha256: envelope.embeddingCacheSha256,
      embeddingCacheBytes: envelope.embeddingCacheBytes,
      embeddingCacheMtimeMs: envelope.embeddingCacheMtimeMs,
      rootDirs: envelope.rootDirs ?? [envelope.rootDir],
      rootSetId: envelope.rootSetId,
      rootAuthorityPins: envelope.rootAuthorityPins,
    };
  } catch {
    return { exists: false };
  }
}

function buildAbsorbDiagnostics(
  rootDir: string,
  scanResult: { files: any[]; stats?: any } | null,
  includeBuildArtifacts: boolean
): AbsorbDiagnostics {
  const resolvedRootDir = path.resolve(rootDir);
  const processCwd = process.cwd();
  const resolvedDirExists = fs.existsSync(resolvedRootDir);
  let resolvedDirReadable = false;
  let rootEntriesSample: string[] | undefined;

  if (resolvedDirExists) {
    try {
      fs.accessSync(resolvedRootDir, fs.constants.R_OK);
      resolvedDirReadable = true;
    } catch {
      resolvedDirReadable = false;
    }

    if (resolvedDirReadable) {
      try {
        rootEntriesSample = fs.readdirSync(resolvedRootDir).slice(0, 20);
      } catch {
        rootEntriesSample = undefined;
      }
    }
  }

  const errors = Array.isArray(scanResult?.stats?.errors) ? scanResult?.stats?.errors : [];
  const scanErrorSample = errors.slice(0, 5).map((e: any) => ({
    file: String(e?.file ?? ''),
    phase: String(e?.phase ?? ''),
    error: String(e?.error ?? ''),
  }));

  const hints: string[] = [];
  if (!resolvedDirExists) {
    hints.push('Resolved rootDir does not exist in runtime container.');
  } else if (!resolvedDirReadable) {
    hints.push('Resolved rootDir exists but is not readable by the running process.');
  }

  const entries = rootEntriesSample ?? [];
  const hasDist = entries.includes('dist');
  const hasSrc = entries.includes('src');
  if (hasDist && !hasSrc && !includeBuildArtifacts) {
    hints.push(
      'Directory appears dist-only. Scanner excludes dist/build/out by default, so scans may return zero files in production images that omit src.'
    );
  }

  if (hasDist && !hasSrc && includeBuildArtifacts) {
    hints.push(
      'Directory appears dist-only and includeBuildArtifacts=true is set. If totalFiles is still zero, verify file extensions/language filters and runtime visibility of compiled files.'
    );
  }

  if (errors.length > 0) {
    hints.push('Scanner reported parse/read/extract errors. See scanErrorSample for details.');
  }

  if (hints.length === 0) {
    hints.push(
      'No supported source files were found after exclusions and language filters. Verify rootDir, languages filter, and runtime filesystem contents.'
    );
  }

  return {
    requestedRootDir: rootDir,
    resolvedRootDir,
    processCwd,
    resolvedDirExists,
    resolvedDirReadable,
    rootEntriesSample,
    scanErrorCount: errors.length,
    scanErrorSample,
    hints,
  };
}

// ── Inline source-file upload helpers ────────────────────────────────────────

const SOURCE_FILES_MAX_FILES = 500;
const SOURCE_FILES_MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB

interface SourceFileEntry {
  path: string;
  content: string;
}

export interface LocalCodebaseSnapshotReceiptSummary {
  schema:
    | typeof LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA
    | typeof HOLOSHELL_LOCAL_CODEBASE_SNAPSHOT_RECEIPT_KIND;
  id?: string;
  emittedAt?: string;
  roots: string[];
  totalFiles: number;
  totalBytes: number;
  contentHashAlgorithm: 'sha256';
  replayCommand?: string;
  privacyClass?: string;
  redactionStatus?: string;
  status?: string;
}

interface LocalCodebaseReceiptResolution {
  roots?: string[];
  sourceFiles?: Array<{ path: string; content: string }>;
  summary?: LocalCodebaseSnapshotReceiptSummary;
}

function isSafeRelativeSourcePath(filePath: string): boolean {
  if (filePath.length === 0 || filePath.length > 4096) return false;
  if (path.isAbsolute(filePath) || /^[A-Za-z]:[\\/]/.test(filePath)) return false;
  return !filePath.split(/[\\/]+/).includes('..');
}

function validateSourceFiles(
  entries: unknown[]
): { valid: false; error: string } | { valid: true; files: SourceFileEntry[] } {
  if (!Array.isArray(entries)) {
    return { valid: false, error: 'sourceFiles must be an array.' };
  }
  if (entries.length === 0) {
    return { valid: false, error: 'sourceFiles array is empty.' };
  }
  if (entries.length > SOURCE_FILES_MAX_FILES) {
    return {
      valid: false,
      error: `sourceFiles exceeds maximum of ${SOURCE_FILES_MAX_FILES} files.`,
    };
  }

  const files: SourceFileEntry[] = [];
  let totalBytes = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') {
      return { valid: false, error: `sourceFiles[${i}] is not an object.` };
    }
    const e = entry as Record<string, unknown>;
    const p = e.path;
    const c = e.content;

    if (typeof p !== 'string' || typeof c !== 'string') {
      return { valid: false, error: `sourceFiles[${i}] must have string "path" and "content".` };
    }
    if (!isSafeRelativeSourcePath(p)) {
      return {
        valid: false,
        error: `sourceFiles[${i}] path must be relative and cannot contain "..".`,
      };
    }

    const bytes = Buffer.byteLength(c, 'utf-8');
    totalBytes += bytes;
    if (totalBytes > SOURCE_FILES_MAX_TOTAL_BYTES) {
      return {
        valid: false,
        error: `sourceFiles total content exceeds ${SOURCE_FILES_MAX_TOTAL_BYTES} bytes.`,
      };
    }

    files.push({ path: p, content: c });
  }

  return { valid: true, files };
}

function writeSourceFilesToTemp(files: SourceFileEntry[]): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-absorb-'));
  for (const file of files) {
    const filePath = path.join(tmpDir, file.path);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
  return tmpDir;
}

function buildInlineSourceScan(
  rootDir: string,
  files: SourceFileEntry[]
): {
  filePaths: string[];
  readFile: (filePath: string) => Promise<string>;
} {
  const contentsByPath = new Map<string, string>();
  const filePaths: string[] = [];

  for (const file of files) {
    const filePath = path.resolve(rootDir, file.path);
    contentsByPath.set(normalizeRootForComparison(filePath), file.content);
    filePaths.push(filePath);
  }

  return {
    filePaths,
    readFile: async (filePath: string) => {
      const key = normalizeRootForComparison(filePath);
      const content = contentsByPath.get(key);
      if (content === undefined) {
        throw new Error(`Inline source file not found: ${path.relative(rootDir, filePath)}`);
      }
      return content;
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function sha256Utf8(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function extractReceiptRoots(receipt: Record<string, unknown>): string[] {
  const roots: string[] = [];
  const graphReceipt = asRecord(receipt.graphReceipt);
  const requestedPath = graphReceipt?.requestedPath;
  if (typeof requestedPath === 'string') roots.push(requestedPath);

  const rawRoots = receipt.roots;
  if (Array.isArray(rawRoots)) {
    for (const rawRoot of rawRoots) {
      if (typeof rawRoot === 'string') {
        roots.push(rawRoot);
        continue;
      }
      const root = asRecord(rawRoot);
      if (!root) continue;
      const candidate =
        root.rootDir ?? root.root ?? root.path ?? root.requestedPath ?? root.runtimePath;
      if (typeof candidate === 'string' && !candidate.includes('[')) {
        roots.push(candidate);
      }
    }
  }

  return uniqueStrings(roots);
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function expectedHashesFromReceiptSourceFiles(entries: unknown[]): Map<string, string> {
  const expected = new Map<string, string>();
  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record || typeof record.path !== 'string') continue;
    const hash = record.hash ?? record.contentHash;
    if (typeof hash === 'string' && hash.length > 0) {
      expected.set(record.path.replace(/\\/g, '/'), hash);
    }
  }
  return expected;
}

function validateReceiptContentHashes(
  files: SourceFileEntry[],
  expectedHashes: Map<string, string>,
  receiptLabel: string,
  errors: string[]
): void {
  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/g, '/');
    const expectedHash = expectedHashes.get(normalizedPath);
    if (!expectedHash) continue;
    if (expectedHash.length !== 64) {
      errors.push(`${receiptLabel} hash for ${normalizedPath} must be a sha256 hex digest.`);
      continue;
    }
    const actualHash = sha256Utf8(file.content);
    if (actualHash !== expectedHash) {
      errors.push(`${receiptLabel} hash mismatch for ${normalizedPath}.`);
    }
  }
}

function validateReceiptDeclaredSizes(
  sourceFileRecords: unknown[],
  files: SourceFileEntry[],
  receiptLabel: string,
  errors: string[]
): void {
  const sizesByPath = new Map<string, number>();
  for (const sourceFile of sourceFileRecords) {
    const record = asRecord(sourceFile);
    if (!record || typeof record.path !== 'string') continue;
    const size = getNumber(record.size) ?? getNumber(record.sizeBytes);
    if (size !== undefined) sizesByPath.set(record.path.replace(/\\/g, '/'), size);
  }
  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/g, '/');
    const expectedSize = sizesByPath.get(normalizedPath);
    if (expectedSize === undefined) continue;
    const actualSize = Buffer.byteLength(file.content, 'utf-8');
    if (actualSize !== expectedSize) {
      errors.push(`${receiptLabel} size mismatch for ${normalizedPath}.`);
    }
  }
}

function resolveReceiptSourceFiles(
  receiptSourceFiles: unknown,
  providedSourceFilesRaw: unknown,
  receiptLabel: string,
  errors: string[]
): SourceFileEntry[] | undefined {
  if (!Array.isArray(receiptSourceFiles)) {
    errors.push(`${receiptLabel}.sourceFiles must be an array.`);
    return undefined;
  }

  const replaySourceFilesRaw = Array.isArray(providedSourceFilesRaw)
    ? providedSourceFilesRaw
    : receiptSourceFiles;
  const hasInlineContent = replaySourceFilesRaw.every((entry) => {
    const record = asRecord(entry);
    return typeof record?.content === 'string';
  });

  if (!hasInlineContent) {
    errors.push(
      `${receiptLabel} is hash-only; provide matching sourceFiles with content in the same holo_absorb_repo call.`
    );
    return undefined;
  }

  const validation = validateSourceFiles(replaySourceFilesRaw);
  if (!validation.valid) {
    errors.push(validation.error);
    return undefined;
  }

  const expectedHashes = expectedHashesFromReceiptSourceFiles(receiptSourceFiles);
  validateReceiptContentHashes(validation.files, expectedHashes, receiptLabel, errors);
  validateReceiptDeclaredSizes(receiptSourceFiles, validation.files, receiptLabel, errors);

  return validation.files;
}

function resolveLegacyLocalCodebaseSnapshotReceipt(
  receipt: Record<string, unknown>,
  providedSourceFilesRaw: unknown
): { errors: string[]; resolution?: LocalCodebaseReceiptResolution } {
  const errors: string[] = [];
  if (receipt.schema !== LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA) {
    errors.push(`bad schema: ${String(receipt.schema)}`);
  }
  if (!receipt.version) errors.push('version required');
  if (!receipt.emittedAt) errors.push('emittedAt required');
  if (!asRecord(receipt.freshness)?.generatedAt) errors.push('freshness.generatedAt required');
  const roots = asStringArray(receipt.roots);
  if (roots.length === 0) errors.push('roots must be non-empty');

  const sourceFiles = resolveReceiptSourceFiles(
    receipt.sourceFiles,
    providedSourceFilesRaw,
    LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA,
    errors
  );

  const stats = asRecord(receipt.stats);
  const totalFiles = getNumber(stats?.totalFiles) ?? sourceFiles?.length ?? 0;
  const totalBytes =
    getNumber(stats?.totalBytes) ??
    sourceFiles?.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf-8'), 0) ??
    0;
  if (totalFiles > SOURCE_FILES_MAX_FILES) errors.push('file cap exceeded');
  if (totalBytes > SOURCE_FILES_MAX_TOTAL_BYTES) errors.push('byte cap exceeded');

  const replayCommand = receipt.replayCommand;
  if (typeof replayCommand !== 'string' || !replayCommand.includes('holo_absorb_repo')) {
    errors.push('replayCommand must reference holo_absorb_repo');
  }

  const embeddingPolicy = asRecord(receipt.embeddingPolicy);
  if (embeddingPolicy && embeddingPolicy.provider !== NATIVE_GRAPH_RAG_PROVIDER) {
    errors.push('embeddingPolicy.provider must be holoembed');
  }

  if (errors.length > 0 || !sourceFiles) return { errors };

  return {
    errors,
    resolution: {
      roots,
      sourceFiles,
      summary: {
        schema: LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA,
        emittedAt: String(receipt.emittedAt),
        roots,
        totalFiles,
        totalBytes,
        contentHashAlgorithm: 'sha256',
        replayCommand: typeof replayCommand === 'string' ? replayCommand : undefined,
        privacyClass: typeof receipt.privacyClass === 'string' ? receipt.privacyClass : undefined,
      },
    },
  };
}

function resolveHoloShellLocalCodebaseSnapshotReceipt(
  receipt: Record<string, unknown>,
  providedSourceFilesRaw: unknown
): { errors: string[]; resolution?: LocalCodebaseReceiptResolution } {
  const errors: string[] = [];
  if (!receipt.id) errors.push('HoloShellLocalCodebaseSnapshotReceipt.id is required.');
  if (!receipt.workflow) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.workflow is required.');
  }
  const roots = extractReceiptRoots(receipt);
  const sourceFiles = resolveReceiptSourceFiles(
    receipt.sourceFiles,
    providedSourceFilesRaw,
    HOLOSHELL_LOCAL_CODEBASE_SNAPSHOT_RECEIPT_KIND,
    errors
  );

  const totalFiles = getNumber(receipt.totalFiles) ?? sourceFiles?.length ?? 0;
  const totalBytes =
    getNumber(receipt.totalBytes) ??
    sourceFiles?.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf-8'), 0) ??
    0;
  const maxFiles = getNumber(receipt.maxFiles) ?? SOURCE_FILES_MAX_FILES;
  const maxBytes = getNumber(receipt.maxBytes) ?? SOURCE_FILES_MAX_TOTAL_BYTES;
  if (totalFiles > maxFiles || totalFiles > SOURCE_FILES_MAX_FILES) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalFiles must stay within caps.');
  }
  if (totalBytes > maxBytes || totalBytes > SOURCE_FILES_MAX_TOTAL_BYTES) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalBytes must stay within caps.');
  }
  if (receipt.hashAlgorithm !== 'sha256') {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.hashAlgorithm must be sha256.');
  }

  const status = typeof receipt.status === 'string' ? receipt.status : undefined;
  if (status && !['ready', 'warn', 'blocked'].includes(status)) {
    errors.push(`HoloShellLocalCodebaseSnapshotReceipt.status is unsupported: ${status}.`);
  }
  const redactionStatus =
    typeof receipt.redactionStatus === 'string' ? receipt.redactionStatus : undefined;
  if (redactionStatus && !['pass', 'warn', 'fail'].includes(redactionStatus)) {
    errors.push(
      `HoloShellLocalCodebaseSnapshotReceipt.redactionStatus is unsupported: ${redactionStatus}.`
    );
  }

  if (errors.length > 0 || !sourceFiles) return { errors };

  return {
    errors,
    resolution: {
      roots,
      sourceFiles,
      summary: {
        schema: HOLOSHELL_LOCAL_CODEBASE_SNAPSHOT_RECEIPT_KIND,
        id: typeof receipt.id === 'string' ? receipt.id : undefined,
        emittedAt: typeof receipt.endedAt === 'string' ? receipt.endedAt : undefined,
        roots,
        totalFiles,
        totalBytes,
        contentHashAlgorithm: 'sha256',
        replayCommand:
          typeof receipt.replayCommand === 'string' ? receipt.replayCommand : undefined,
        privacyClass: typeof receipt.privacyClass === 'string' ? receipt.privacyClass : undefined,
        redactionStatus,
        status,
      },
    },
  };
}

function resolveLocalCodebaseSnapshotReceiptForAbsorb(
  receiptRaw: unknown,
  providedSourceFilesRaw: unknown
):
  | { valid: true; resolution: LocalCodebaseReceiptResolution }
  | { valid: false; errors: string[] } {
  if (receiptRaw === undefined) {
    return { valid: true, resolution: {} };
  }

  const receipt = asRecord(receiptRaw);
  if (!receipt) {
    return { valid: false, errors: ['localCodebaseSnapshotReceipt must be an object.'] };
  }

  const isLegacy = receipt.schema === LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA;
  const isHoloShell =
    receipt.kind === HOLOSHELL_LOCAL_CODEBASE_SNAPSHOT_RECEIPT_KIND ||
    (typeof receipt.workflow === 'string' &&
      Array.isArray(receipt.files) &&
      Array.isArray(receipt.sourceFiles));

  const resolved = isLegacy
    ? resolveLegacyLocalCodebaseSnapshotReceipt(receipt, providedSourceFilesRaw)
    : isHoloShell
      ? resolveHoloShellLocalCodebaseSnapshotReceipt(receipt, providedSourceFilesRaw)
      : {
          errors: [
            `unsupported localCodebaseSnapshotReceipt schema: ${String(receipt.schema ?? receipt.kind ?? '<missing>')}`,
          ],
        };

  if (resolved.errors.length > 0 || !resolved.resolution) {
    return { valid: false, errors: resolved.errors };
  }
  return { valid: true, resolution: resolved.resolution };
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const codebaseTools: Tool[] = [
  {
    name: 'holo_absorb_manifest',
    description:
      'Return the official HoloAbsorb product manifest: canonical ownership, compatibility aliases, capability lanes, paper evidence contracts, and workstream coverage. This is a metadata-only call and never loads a codebase graph.',
    inputSchema: {
      type: 'object',
      properties: {
        audit: {
          type: 'boolean',
          description: 'Include the executable HoloAbsorb self-audit. Defaults to true.',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'holo_absorb_repo',
    description:
      'Absorb a codebase into HoloScript. Scans a directory, extracts symbols from all supported languages (TypeScript, Python, Rust, Go), builds a knowledge graph, and optionally generates a .holo composition for spatial visualization. Returns scan stats and the generated output.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description:
            'Absolute path to the root directory to scan (deprecated in favor of rootDirs)',
        },
        rootDirs: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of absolute paths to root directories to scan (for multi-repository context)',
        },
        outputFormat: {
          type: 'string',
          enum: ['holo', 'graph', 'stats'],
          description:
            'Output format: "holo" for .holo source, "graph" to build and cache the knowledge graph while returning a compact receipt (the graph blob is never inlined over MCP), "stats" for scan statistics only. Defaults to "holo".',
        },
        layout: {
          type: 'string',
          enum: ['force', 'layered'],
          description:
            'Layout algorithm for .holo output: "force" for organic force-directed, "layered" for dependency-depth layers. Defaults to "force".',
        },
        languages: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter to specific languages (e.g., ["typescript", "python"]). Defaults to all supported languages.',
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of files to process. Defaults to 20000.',
        },
        maxFileSize: {
          type: 'number',
          description: 'Maximum content file size in bytes. Defaults to 1048576.',
        },
        maxRssMb: {
          type: 'number',
          description:
            'Optional process RSS budget in MiB. Exceeding it cooperatively cancels the job and preserves the prior cache. May also be set with ABSORB_MAX_RSS_MB.',
        },
        maxHeapUsedMb: {
          type: 'number',
          description:
            'Optional V8 heap-used budget in MiB. Exceeding it cooperatively cancels the job and preserves the prior cache. May also be set with ABSORB_MAX_HEAP_USED_MB.',
        },
        cacheCommitHeadroomMb: {
          type: 'number',
          minimum: 0,
          description:
            'Memory reserve in MiB held below configured RSS/heap caps for graph and embedding serialization plus atomic cache publication. Near-cap jobs cancel cooperatively before touching the prior cache. Defaults to 12.5% of the smallest configured cap, capped at 512 MiB; set ABSORB_CACHE_COMMIT_HEADROOM_MB or pass 0 to disable.',
        },
        minSystemFreeMb: {
          type: 'number',
          minimum: 0,
          description:
            'Minimum host free-memory reserve in MiB. The job checks this before planning and throughout scan/embedding work, then cancels cooperatively before the host enters OOM pressure. Defaults to 10% of physical memory, bounded to 512-2048 MiB; set ABSORB_MIN_SYSTEM_FREE_MB or pass 0 to disable.',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Exact file/directory names or simple glob-like patterns to exclude from content scanning.',
        },
        excludePathFragments: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Slash-normalized path fragments to exclude from content scanning, e.g. "/runtime/shared/receipts/".',
        },
        excludeNameFragments: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Case-insensitive filename fragments to exclude from content scanning, e.g. "token" or "wallet".',
        },
        includeHidden: {
          type: 'boolean',
          description:
            'When true, dot-prefixed files/directories may be scanned unless excluded by name/path policy. Defaults to false.',
        },
        respectGitIgnore: {
          type: 'boolean',
          description:
            'When true (default), scans Git-tracked files plus non-ignored untracked files and excludes ignored build/cache debris. Set false only for explicit filesystem-wide scans.',
          default: true,
        },
        includeUntracked: {
          type: 'boolean',
          description:
            'When true (default), includes non-ignored untracked files in Git-aware discovery so new source is visible before its first commit.',
          default: true,
        },
        scanBatchSize: {
          type: 'number',
          description:
            'Maximum files per module scan batch for large repositories. Defaults to bounded module-aware batching.',
        },
        interactive: {
          type: 'boolean',
          description:
            'When true, generates an interactive 3D scene with hover, click, selection, and edge highlighting. Only applies when outputFormat is "holo". Defaults to false.',
        },
        force: {
          type: 'boolean',
          description:
            'When false (default), skips re-scanning if a disk cache already exists and is younger than 24 hours. Set to true to force a fresh scan regardless of cache age.',
        },
        async: {
          type: 'boolean',
          description:
            'When true, starts the absorb job in the background and returns immediately with jobId; poll holo_get_absorb_status for progress and the final result.',
        },
        background: {
          type: 'boolean',
          description:
            'Alias for async. Useful for long forced scans that may exceed MCP timeouts.',
        },
        resumeToken: {
          type: 'string',
          description:
            'Resume a previously interrupted forced scan from its durable progress receipt. Repository root, scan policy, batch plan, and selected file set must match; when HEAD or worktree state changed, only batches whose source-content digest still matches are reused.',
        },
        autoRetrySourceDrift: {
          type: 'boolean',
          description:
            'Automatically replan a forced refresh when HEAD advances, reusing byte-identical checkpoint batches after a quiet debounce. Defaults to true for automatic refreshes. Caller-supplied resumeToken requests remain strict and never auto-rebase.',
          default: true,
        },
        maxSourceDriftRetries: {
          type: 'number',
          minimum: 0,
          description:
            'Maximum automatic HEAD-drift replans for one job. Defaults to 3; pass 0 to disable.',
        },
        sourceDriftDebounceMs: {
          type: 'number',
          minimum: 0,
          description:
            'Required quiet period before replanning after HEAD drift. Defaults to 750ms.',
        },
        sourceDriftCheckIntervalMs: {
          type: 'number',
          minimum: 0,
          description:
            'Minimum interval between cheap HEAD-only checks at scan batch boundaries. Defaults to 1000ms; pass 0 to check every batch.',
        },
        sourceDriftCheckMaxOverheadPercent: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Maximum target share of refresh time spent on HEAD-only checks. Defaults to 4%; expensive Git probes automatically widen the effective interval. Pass 0 to disable adaptive throttling. sourceDriftCheckIntervalMs:0 still checks every batch.',
        },
        includeBuildArtifacts: {
          type: 'boolean',
          description:
            'When true, permits build output folders (dist/build/out) in scanning. In Git worktrees this includes tracked or non-ignored outputs; pair with respectGitIgnore:false to include ignored outputs. Defaults to false.',
        },
        sourceFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'Relative file path within the source tree (e.g., "src/index.ts"). Must be relative, no ".." traversal.',
              },
              content: {
                type: 'string',
                description: 'File content as UTF-8 text.',
              },
            },
            required: ['path', 'content'],
          },
          description:
            'Inline source files to absorb when filesystem access is unavailable (e.g., remote MCP servers, containers). Provide EITHER rootDir OR sourceFiles — not both. Max 500 files, 5 MB total content. Path traversal attempts are rejected.',
        },
        localCodebaseSnapshotReceipt: {
          type: 'object',
          description:
            'HoloShell local codebase snapshot receipt. Accepts LocalCodebaseSnapshotReceipt.v1 emitted by scripts/holoshell-local-codebase-absorb-bundle.mjs, or the HoloShellLocalCodebaseSnapshotReceipt hash-only shape when matching sourceFiles are supplied. Receipt hashes are verified before scanning.',
        },
        embeddingProvider: {
          type: 'string',
          enum: ['holoembed', 'structural'],
          description:
            'Native GraphRAG embedding provider. Use "holoembed": HoloGraph structural features plus HoloEmbed subword blocks. "structural" is accepted as a legacy alias and maps to "holoembed"; external fallback providers are disabled so native failures are fixed immediately.',
        },
        embeddingApiKey: {
          type: 'string',
          description:
            'Ignored for native HoloEmbed. Kept only for backward-compatible request shapes.',
        },
        embeddingModel: {
          type: 'string',
          description:
            'Ignored for native HoloEmbed. Kept only for backward-compatible request shapes.',
        },
      },
      required: [],
    },
  },
  {
    name: 'holo_cancel_absorb',
    description:
      'Request cooperative cancellation of a queued or running Absorb job. The job transitions through cancelling to a terminal cancelled receipt, disposes scanner/embedding workers, aborts mesh I/O, and preserves the prior graph and embedding caches.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID returned from holo_absorb_repo' },
        reason: {
          type: 'string',
          description: 'Optional operator-readable cancellation reason.',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'holo_query_codebase',
    description:
      'Query a codebase knowledge graph. Supports queries like "what calls X?", "what does X call?", "show imports of file", "find all classes", "trace call chain from A to B". Requires a prior holo_absorb_repo call in the same session.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language or structured query. Examples: "callers of functionName", "callees of className.method", "imports of src/file.ts", "symbols in src/file.ts", "trace MyFunc to OtherFunc"',
        },
        symbolName: {
          type: 'string',
          description: 'Specific symbol name to query (for structured queries)',
        },
        symbolOwner: {
          type: 'string',
          description: 'Owner class/struct for method queries',
        },
        filePath: {
          type: 'string',
          description: 'File path for file-scoped queries',
        },
        queryType: {
          type: 'string',
          enum: [
            'callers',
            'callees',
            'imports',
            'imported_by',
            'symbols',
            'find',
            'trace',
            'communities',
            'stats',
          ],
          description: 'Structured query type',
        },
        traceStrategy: {
          type: 'string',
          enum: ['bfs', 'tropical-min-plus'],
          description:
            'Trace algorithm for queryType="trace". bfs = shortest hop count (default), tropical-min-plus = weighted shortest path.',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum call-chain traversal depth for queryType="trace" (default: 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'holo_impact_analysis',
    description:
      'Analyze the impact of changing files or symbols. File traversal is cooperatively bounded and returns explicit completeness/truncation metadata. Given a symbol name, returns all files containing callers of that symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        changedFiles: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 1000,
          description: 'List of changed file paths (relative to scan root)',
        },
        changedSymbol: {
          type: 'string',
          description: 'Symbol name that changed (alternative to changedFiles)',
        },
        symbolOwner: {
          type: 'string',
          description: 'Owner class/struct for the changed symbol',
        },
        maxAffectedFiles: {
          type: 'number',
          minimum: 1,
          maximum: 20000,
          description:
            'Maximum changed/affected files retained for file impact analysis (default: 10000).',
        },
        maxDepth: {
          type: 'number',
          minimum: 0,
          maximum: 256,
          description: 'Maximum reverse-import hops for file impact analysis (default: 64).',
        },
        deadlineMs: {
          type: 'number',
          minimum: 1,
          maximum: 25000,
          description:
            'Cooperative traversal deadline in milliseconds (default: 20000, capped at 25000).',
        },
      },
    },
  },
  {
    name: 'holo_detect_changes',
    description:
      'Detect structural changes between two codebase snapshots. Compares a previously saved graph with a fresh scan to find added/removed/modified symbols, imports, and files.',
    inputSchema: {
      type: 'object',
      properties: {
        previousGraphJson: {
          type: 'string',
          description:
            'JSON string of the previous CodebaseGraph (from a prior holo_absorb_repo with outputFormat "graph")',
        },
        rootDir: {
          type: 'string',
          description: 'Directory to re-scan for the current state',
        },
      },
      required: ['previousGraphJson', 'rootDir'],
    },
  },
  {
    name: 'holo_graph_status',
    description:
      'Check the status of the codebase knowledge graph: whether it is loaded in memory, whether a disk cache exists, cache age, and scan statistics. Repeated polls reuse a bounded status snapshot to avoid re-reading and re-hashing a large repository. Use forceRefresh for an immediate filesystem recheck.',
    inputSchema: {
      type: 'object',
      properties: {
        forceRefresh: {
          type: 'boolean',
          description:
            'Bypass the bounded graph-status snapshot and immediately re-check repository coverage, HEAD, worktree hashes, and cache generations.',
          default: false,
        },
      },
    },
  },
  {
    name: 'holo_detect_drift',
    description:
      'Fast drift detection: checks if the current knowledge graph is out of sync with the filesystem content hashes (without a full scan). Returns a list of drifted files.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Absolute path to the root directory',
        },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'holo_resolve_symbol',
    description:
      'Federated symbol resolution: searches for a symbol across the entire absorbed knowledge mesh.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: { type: 'string', description: 'Name of the symbol to resolve' },
        limit: { type: 'number', description: 'Maximum results to return', default: 5 },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'holo_get_absorb_status',
    description:
      'Get compact progress status of a running absorb job by jobId. The absorbed graph is never returned by this tool — it is written to the graph cache; query it via holo_query_codebase or holo_ask_codebase. Completed result bodies are reported as metadata (resultBytes/resultKeys) and inlined only when includeResult:true and they fit the inline budget.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID returned from holo_absorb_repo' },
        includeResult: {
          type: 'boolean',
          description:
            'Inline the terminal result body (excluding the cached graph blob) when it fits the inline budget. Defaults to false.',
          default: false,
        },
        includePlan: {
          type: 'boolean',
          description:
            'Include every scan-batch summary. Defaults to false; compact status still reports selection mode, total files, batch count, and batch size.',
          default: false,
        },
        includeReceiptDetails: {
          type: 'boolean',
          description:
            'Include every completed checkpoint-batch receipt. Defaults to false; compact status reports counts, reuse mode, and only the latest completed batch.',
          default: false,
        },
      },
      required: ['jobId'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

// Session-level graph cache (persists across tool calls within one MCP session)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGraph: any = null;
let cachedRootDir = '';
let cacheAutoLoaded = false;
let cacheProvenance:
  | 'fresh-scan'
  | 'disk-cache'
  | 'incremental-patch'
  | 'local-codebase-snapshot-receipt'
  | null = null;
let cacheTimestamp = 0;
const DEFAULT_GRAPH_STATUS_SNAPSHOT_TTL_MS = 5_000;
const MAX_GRAPH_STATUS_SNAPSHOT_TTL_MS = 30_000;
type GraphStatusSnapshot = Record<string, unknown>;
interface GraphStatusSnapshotCacheEntry {
  key: string;
  computedAt: number;
  value: GraphStatusSnapshot;
}
let graphStatusSnapshotCache: GraphStatusSnapshotCacheEntry | null = null;
let graphStatusSnapshotInFlight: {
  key: string;
  promise: Promise<GraphStatusSnapshot>;
} | null = null;
// Guards the background GraphRAG embedding warm so concurrent cold loads don't
// kick off duplicate builds (the build is fired-and-forgotten in ensureCachedGraph).
let graphRAGWarmInProgress = false;
let graphRAGWarmJobId: string | null = null;

function invalidateGraphStatusSnapshot(): void {
  graphStatusSnapshotCache = null;
  graphStatusSnapshotInFlight = null;
}

function invalidateInMemoryGraphAfterIsolatedRefresh(): void {
  cachedGraph = null;
  cachedRootDir = '';
  cacheAutoLoaded = false;
  cacheProvenance = null;
  cacheTimestamp = 0;
  graphRAGWarmInProgress = false;
  graphRAGWarmJobId = null;
  invalidateGraphStatusSnapshot();
  resetGraphRAGState();
}

export function resetCodebaseToolStateForTests(skipDiskAutoload = true): void {
  cachedGraph = null;
  cachedRootDir = '';
  cacheAutoLoaded = skipDiskAutoload;
  cacheProvenance = null;
  cacheTimestamp = 0;
  graphRAGWarmInProgress = false;
  graphRAGWarmJobId = null;
  invalidateGraphStatusSnapshot();
  for (const job of absorbJobs.values()) {
    if (
      !job.abortController.signal.aborted &&
      job.status !== 'complete' &&
      job.status !== 'error' &&
      job.status !== 'cancelled'
    ) {
      requestAbsorbCancellation(job, 'cancel_requested', 'Test state reset');
    }
    releaseAbsorbWriterLease(job);
  }
  absorbJobs.clear();
  externalAbsorbJobLeases.clear();
  cachePublicationFaultForTests = null;
  resetGraphRAGStateForTests();
}

export function simulateAbsorbProcessRestartForTests(): void {
  absorbJobs.clear();
  externalAbsorbJobLeases.clear();
  graphRAGWarmInProgress = false;
  graphRAGWarmJobId = null;
  invalidateGraphStatusSnapshot();
}

async function hydrateGraphRAGFromDiskEmbeddings(
  mod: CodebaseModule,
  graph: unknown,
  rootDir: string,
  timestamp?: number,
  expectedEmbeddingSha256?: string | null,
  rootDirs?: string[]
): Promise<boolean> {
  const { GraphRAGEngine } = mod;
  const providerName = await detectBestEmbeddingProvider();
  const providerObj = await mod.createEmbeddingProvider({
    provider: providerName as EmbeddingProviderName,
    ollamaUrl: process.env.OLLAMA_URL,
    ollamaModel: process.env.OLLAMA_MODEL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL,
    xenovaModel: process.env.XENOVA_MODEL,
  });

  const cachedIndex = await loadEmbeddingsCache(
    mod,
    providerObj,
    rootDir,
    expectedEmbeddingSha256,
    rootDirs
  );
  if (!cachedIndex) return false;

  setGraphRAGState(cachedIndex, new GraphRAGEngine(graph, cachedIndex), {
    rootDir,
    timestamp,
  });
  return true;
}

function startBackgroundGraphRAGWarm(
  mod: CodebaseModule,
  graph: unknown,
  envelope: GraphCacheEnvelope
): string | null {
  if (graphRAGWarmInProgress) return graphRAGWarmJobId;

  const memoryBudget = resolveAbsorbMemoryBudget({});
  if (!memoryBudget.valid) {
    console.warn(
      `[AbsorbCacheWarm] skipped because the configured memory budget is invalid: ${memoryBudget.errors.join(
        ' '
      )}`
    );
    return null;
  }

  const { GraphRAGEngine } = mod;
  const rootForWarm = envelope.rootDir;
  const warmRootDirs = envelope.rootDirs ?? [rootForWarm];
  const warmWriterKey = buildAbsorbWriterKey(warmRootDirs);
  const warmPolicyHash = createHash('sha256')
    .update(
      stableStringify({
        kind: 'graph-rag-cache-warm',
        rootDirs: warmRootDirs.map((entry) => normalizeRootForComparison(entry)).sort(),
        cacheGenerationId: envelope.cacheGenerationId ?? null,
        embeddingProvider: envelope.embeddingProvider ?? NATIVE_GRAPH_RAG_PROVIDER,
      })
    )
    .digest('hex');
  const warmJobId = `absorb-warm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const activeWriter = findActiveAbsorbWriter(warmWriterKey);
  const acquisition = activeWriter
    ? null
    : acquireAbsorbWriterLease({
        rootDir: rootForWarm,
        rootDirs: warmRootDirs,
        writerKey: warmWriterKey,
        policyHash: warmPolicyHash,
        jobId: warmJobId,
      });
  if (!acquisition || acquisition.outcome === 'occupied') {
    console.error(
      `[AbsorbCacheWarm] skipped because writer job ${
        activeWriter?.jobId ??
        (acquisition?.outcome === 'occupied' ? acquisition.record.jobId : 'unknown')
      } owns this workspace`
    );
    return null;
  }

  createAbsorbJob(
    rootForWarm,
    memoryBudget.limits,
    {
      enabled: false,
      strictResumeToken: false,
      maxRetries: 0,
      debounceMs: 0,
      checkIntervalMs: 0,
      maxCheckOverheadRatio: 0,
    },
    warmWriterKey,
    warmPolicyHash,
    acquisition.lease,
    warmJobId
  );
  graphRAGWarmInProgress = true;
  graphRAGWarmJobId = warmJobId;
  invalidateGraphStatusSnapshot();

  // Fire-and-forget: structural graph availability never waits for embeddings.
  void (async () => {
    let idx: any = null;
    try {
      enforceAbsorbPreflightResourceGuard(warmJobId);
      idx = await createDynamicEmbeddingIndex(mod);
      trackAbsorbProgress(warmJobId, 'Preparing missing cached embeddings', 80);
      await withPhaseTimeout(
        idx.buildIndex(
          graph,
          (batchNumber: number, totalBatches: number, symbolsProcessed: number) => {
            const boundedTotal = Math.max(1, totalBatches);
            const progress = 80 + Math.min(19, Math.floor((batchNumber / boundedTotal) * 19));
            trackAbsorbProgress(
              warmJobId,
              `Building cached embeddings batch ${batchNumber}/${totalBatches}`,
              progress,
              symbolsProcessed
            );
          }
        ),
        CACHE_WARM_GRAPH_RAG_TIMEOUT_MS,
        'disk-cache GraphRAG embedding rebuild (background)',
        () => disposeEmbeddingIndex(idx)
      );
      enforceAbsorbJobControl(warmJobId, 'Publishing cached embeddings');
      const published = publishCacheGeneration({
        graph,
        rootDir: rootForWarm,
        rootDirs: warmRootDirs,
        stats: envelope.stats,
        gitCommitHash: envelope.gitCommitHash,
        fileHashes: envelope.fileHashes,
        embeddingProvider: envelope.embeddingProvider ?? NATIVE_GRAPH_RAG_PROVIDER,
        localCodebaseSnapshotReceipt: envelope.localCodebaseSnapshotReceipt,
        scanPolicy: envelope.scanPolicy,
        embeddingIndex: idx,
        rootAuthorityPins: envelope.rootAuthorityPins,
      });
      if (!published) {
        throw new Error('Unable to publish background GraphRAG cache generation');
      }
      const warmJob = absorbJobs.get(warmJobId);
      if (warmJob) {
        warmJob.cacheCommitted = true;
        warmJob.result = {
          schemaVersion: 'holoscript.absorb-cache-warm-receipt.v1',
          kind: 'AbsorbCacheWarmReceipt',
          jobId: warmJobId,
          cacheCommitted: true,
          generationId: published.generationId,
          embeddingCacheSha256: published.embeddingIdentity?.sha256 ?? null,
        };
      }
      setGraphRAGState(idx, new GraphRAGEngine(graph, idx), {
        rootDir: rootForWarm,
      });
      trackAbsorbProgress(warmJobId, 'Complete', 100);
    } catch (err) {
      if (isAbsorbCancellation(err, warmJobId)) {
        settleCancelledAbsorbJob(warmJobId, err);
      } else {
        console.warn(`[AbsorbCacheWarm] background GraphRAG build failed: ${String(err)}`);
        failAbsorbJob(warmJobId, 'Cache warm failed', errorMessage(err), {
          error: 'absorb_cache_warm_failed',
          message: errorMessage(err),
        });
      }
    } finally {
      if (idx) await disposeEmbeddingIndex(idx);
      if (graphRAGWarmJobId === warmJobId) {
        graphRAGWarmInProgress = false;
        graphRAGWarmJobId = null;
      }
      invalidateGraphStatusSnapshot();
    }
  })();

  return warmJobId;
}

/**
 * Ensure graph is loaded. Returns { loaded: boolean; source: string; ageMs?: number }.
 * Order of preference:
 *   1. Already in memory (cachedGraph set)
 *   2. Disk cache (if younger than 24 h)
 *   3. Nothing available → returns loaded=false
 */
async function ensureCachedGraph(options: { warmGraphRAG?: boolean } = {}): Promise<{
  loaded: boolean;
  source: 'memory' | 'disk-cache' | 'none';
  ageMs?: number;
  rootDir?: string;
  stale?: boolean;
  coverage?: GraphCoverageStatus;
  graphUnavailableReceipt?: GraphUnavailableReceipt;
  warmJobId?: string;
}> {
  if (cachedGraph) {
    const memoryRootDir = cachedRootDir || resolveWorkspaceRoot();
    const memoryGraph = cachedGraph as {
      gitCommitHash?: string;
      fileHashes?: Record<string, string>;
      scanPolicy?: GraphScanPolicy;
      worktreeFingerprint?: string;
      coverageAtScan?: GraphCoverageStatus;
      rootDirs?: string[];
      rootSetId?: string;
      rootAuthorityPins?: GraphRootAuthorityPin[];
      localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary;
    };
    const memoryFileHashes = memoryGraph.fileHashes;
    const memoryGitCommitHash = memoryGraph.gitCommitHash;
    const memoryScanPolicy = normalizeScanPolicy(memoryGraph.scanPolicy);
    const memoryTimestamp = cacheTimestamp;
    const ageMs = memoryTimestamp ? Date.now() - memoryTimestamp : undefined;
    const freshByAge = ageMs === undefined || ageMs < CACHE_MAX_AGE_MS;
    const currentGitCommitHash = await getCurrentGitCommit(memoryRootDir);
    const currentWorktreeFingerprint = buildGitWorktreeFingerprint(memoryRootDir, memoryScanPolicy);
    const memoryRootDirs = memoryGraph.rootDirs ?? [memoryRootDir];
    let coverage = memoryGraph.coverageAtScan;
    const localCodebaseSnapshot = buildLocalCodebaseSnapshotAuthority({
      receipt: memoryGraph.localCodebaseSnapshotReceipt,
      rootDir: memoryRootDir,
      graphFileCount: memoryFileHashes ? Object.keys(memoryFileHashes).length : 0,
      freshByAge,
    });
    let authoritative = localCodebaseSnapshot?.authoritative === true && freshByAge;
    if (!authoritative && freshByAge && memoryRootDirs.length > 1) {
      const rootSetAuthority = await evaluateGraphRootSetAuthority(
        {
          rootDir: memoryRootDir,
          rootDirs: memoryRootDirs,
          rootSetId: memoryGraph.rootSetId,
          rootAuthorityPins: memoryGraph.rootAuthorityPins,
          scanPolicy: memoryScanPolicy,
        },
        memoryRootDirs
      );
      authoritative = rootSetAuthority.authoritative;
    }

    // Warm path: HEAD and the persisted dirty-worktree fingerprint match, so
    // no graph JSON reload, full-repo hash pass, or repeated coverage walk is
    // needed. The fingerprint hashes bytes for every Git-visible dirty path.
    if (
      !authoritative &&
      memoryRootDirs.length === 1 &&
      freshByAge &&
      memoryGitCommitHash &&
      currentGitCommitHash === memoryGitCommitHash &&
      memoryGraph.worktreeFingerprint &&
      currentWorktreeFingerprint === memoryGraph.worktreeFingerprint &&
      coverage &&
      coverage.exactFileSetChecked === true &&
      graphCoverageIsComplete(coverage)
    ) {
      authoritative = true;
    }

    // Legacy cache or changed HEAD/worktree: pay the comprehensive check once.
    if (!authoritative && freshByAge && memoryRootDirs.length === 1) {
      coverage = buildGraphCoverageStatusForRoots(
        (memoryGraph as { rootDirs?: string[] }).rootDirs ?? [memoryRootDir],
        memoryFileHashes ? Object.keys(memoryFileHashes).length : 0,
        memoryScanPolicy,
        memoryFileHashes ? Object.keys(memoryFileHashes) : undefined
      );
      const coverageComplete = graphCoverageIsComplete(coverage);
      const fileHashFreshness = coverageComplete
        ? buildGraphFileHashFreshnessStatus(memoryRootDir, memoryFileHashes)
        : buildSkippedFileHashFreshnessStatus('not_checked', memoryFileHashes);
      const gitMatchesHead = cacheGitMatchesHead(memoryGitCommitHash, currentGitCommitHash);
      const fileHashFreshForHeadMismatch = fileHashesBridgeHeadMismatch({
        cacheGitCommitHash: memoryGitCommitHash,
        currentGitCommitHash,
        fileHashFreshness,
      });
      authoritative =
        currentGitCommitHash !== null &&
        coverageComplete &&
        fileHashFreshness.fresh &&
        (gitMatchesHead || fileHashFreshForHeadMismatch);

      if (authoritative && currentGitCommitHash) {
        memoryGraph.gitCommitHash = currentGitCommitHash;
        memoryGraph.worktreeFingerprint = currentWorktreeFingerprint ?? undefined;
        memoryGraph.coverageAtScan = coverage;
      }
    }

    if (!authoritative) {
      const reason: GraphUnavailableReason =
        coverage && !graphCoverageIsComplete(coverage) ? 'cache_incomplete' : 'cache_stale';
      cachedGraph = null;
      cachedRootDir = '';
      cacheProvenance = null;
      cacheTimestamp = 0;
      resetGraphRAGState();
      return {
        loaded: false,
        source: 'none',
        ageMs,
        rootDir: memoryRootDir,
        stale: true,
        ...(coverage && { coverage }),
        graphUnavailableReceipt: buildGraphUnavailableReceipt({
          reason,
          requestedPath: memoryRootDir,
          runtimePath: path.resolve(memoryRootDir),
          cacheAgeMs: ageMs,
        }),
      };
    }

    let warmJobId: string | null = null;
    if (options.warmGraphRAG === true && !isGraphRAGReady()) {
      try {
        const mod = await loadCodebaseModule();
        const hydrated = await hydrateGraphRAGFromDiskEmbeddings(
          mod,
          cachedGraph,
          cachedRootDir,
          cacheTimestamp,
          (cachedGraph as { embeddingCacheSha256?: string | null }).embeddingCacheSha256,
          memoryRootDirs
        );
        if (!hydrated) {
          const envelope = loadGraphCache(
            memoryRootDir,
            memoryRootDirs.length > 1 ? memoryRootDirs : undefined
          );
          if (envelope) {
            warmJobId = startBackgroundGraphRAGWarm(mod, cachedGraph, envelope);
          }
        }
      } catch (err) {
        console.warn(`[AbsorbCacheWarm] memory GraphRAG hydrate skipped: ${String(err)}`);
      }
    }
    return {
      loaded: true,
      source: cacheProvenance === 'disk-cache' ? 'disk-cache' : 'memory',
      ageMs,
      rootDir: cachedRootDir,
      stale: false,
      ...(coverage && { coverage }),
      ...(warmJobId && { warmJobId }),
    };
  }
  // Try disk
  const currentCwd = resolveWorkspaceRoot();
  const envelope = loadGraphCache(currentCwd);
  if (envelope) {
    try {
      const ageMs = Date.now() - envelope.timestamp;
      const currentGitCommitHash = await getCurrentGitCommit(envelope.rootDir);
      const cacheMatchesCwd = rootMatchesCurrentRepo(envelope.rootDir, currentCwd);
      const gitMatchesHead = cacheGitMatchesHead(envelope.gitCommitHash, currentGitCommitHash);
      const freshByAge = ageMs < CACHE_MAX_AGE_MS;
      const coverage = buildGraphCoverageStatusForRoots(
        envelope.rootDirs ?? [cacheMatchesCwd ? currentCwd : envelope.rootDir],
        getEnvelopeGraphFileCount(envelope),
        envelope.scanPolicy,
        envelope.fileHashes ? Object.keys(envelope.fileHashes) : undefined
      );
      const coverageComplete = graphCoverageIsComplete(coverage);
      const cwdFileHashFreshness =
        cacheMatchesCwd && freshByAge && coverageComplete
          ? buildGraphFileHashFreshnessStatus(envelope.rootDir, envelope.fileHashes)
          : buildSkippedFileHashFreshnessStatus('not_checked', envelope.fileHashes);
      const cwdFileHashFreshForHeadMismatch =
        cacheMatchesCwd &&
        fileHashesBridgeHeadMismatch({
          cacheGitCommitHash: envelope.gitCommitHash,
          currentGitCommitHash,
          fileHashFreshness: cwdFileHashFreshness,
        });
      const cwdLocalCodebaseSnapshot = buildLocalCodebaseSnapshotAuthority({
        receipt: envelope.localCodebaseSnapshotReceipt,
        rootDir: envelope.rootDir,
        graphFileCount: getEnvelopeGraphFileCount(envelope),
        freshByAge,
      });

      // A cache built for a different directory is still authoritative for its
      // own repo when it positively describes that repo's live HEAD with complete
      // coverage (see cacheDescribesRealCurrentRepo). This unblocks a fixed-cwd
      // sovereign MCP serving multiple repos, without trusting scratch absorbs.
      const crossRootAuthority = cacheMatchesCwd
        ? {
            ok: false,
            currentGitCommitHash,
            gitMatchesHead,
            fileHashFreshForHeadMismatch: cwdFileHashFreshForHeadMismatch,
            fileHashFreshness: cwdFileHashFreshness,
          }
        : await cacheDescribesRealCurrentRepo({
            rootDir: envelope.rootDir,
            cacheGitCommitHash: envelope.gitCommitHash,
            fileHashes: envelope.fileHashes,
            freshByAge,
            coverage,
          });
      const cwdAuthoritative =
        cacheMatchesCwd &&
        freshByAge &&
        (cwdLocalCodebaseSnapshot?.authoritative === true ||
          (coverageComplete &&
            cwdFileHashFreshness.fresh &&
            (gitMatchesHead || cwdFileHashFreshForHeadMismatch)));

      if (!cwdAuthoritative && !crossRootAuthority.ok) {
        const reason: GraphUnavailableReason = !cacheMatchesCwd
          ? 'cache_root_mismatch'
          : !coverageComplete
            ? 'cache_incomplete'
            : !cwdFileHashFreshness.fresh ||
                (!gitMatchesHead && !cwdFileHashFreshForHeadMismatch) ||
                !freshByAge
              ? 'cache_stale'
              : 'cache_incomplete';
        return {
          loaded: false,
          source: 'none',
          ageMs,
          rootDir: envelope.rootDir,
          stale: true,
          coverage,
          graphUnavailableReceipt: buildGraphUnavailableReceipt({
            reason,
            requestedPath: envelope.rootDir,
            runtimePath: path.resolve(envelope.rootDir),
            cacheAgeMs: ageMs,
          }),
        };
      }
      const mod = await loadCodebaseModule();
      const { CodebaseGraph, GraphRAGEngine } = mod;
      cachedGraph = CodebaseGraph.deserialize(envelope.graphJson);
      attachGraphCacheMetadata(cachedGraph, envelope);
      (cachedGraph as { worktreeFingerprint?: string }).worktreeFingerprint =
        envelope.worktreeFingerprint ??
        buildGitWorktreeFingerprint(envelope.rootDir, envelope.scanPolicy) ??
        undefined;
      (cachedGraph as { coverageAtScan?: GraphCoverageStatus }).coverageAtScan =
        envelope.coverageAtScan ?? coverage;
      if (cwdFileHashFreshForHeadMismatch && currentGitCommitHash) {
        (cachedGraph as { gitCommitHash?: string }).gitCommitHash = currentGitCommitHash;
      }
      cachedRootDir = envelope.rootDir;
      cacheProvenance = 'disk-cache';
      cacheTimestamp = envelope.timestamp;
      // Warm GraphRAG. If embeddings are already persisted on disk, load them
      // inline (fast). Otherwise build them in the BACKGROUND: building ~13k
      // embeddings inline would block this first tool call past the client
      // timeout, leaving find/query/impact unavailable. Backgrounding keeps the
      // structural graph instant and lets semantic_search light up once the
      // build completes + persists (survives restart via embeddings-cache.bin).
      // Search remains correct after disposeEmbeddingIndex: dispose only ends the
      // worker pool; entries stay intact and query embedding falls back to the
      // provider directly (EmbeddingIndex.getEmbeddings).
      if (options.warmGraphRAG === true) {
        try {
          const hydrated = await hydrateGraphRAGFromDiskEmbeddings(
            mod,
            cachedGraph,
            cachedRootDir,
            cacheTimestamp,
            envelope.embeddingCacheSha256
          );
          if (hydrated) {
            // GraphRAG is ready from the persisted HoloEmbed index.
          } else {
            startBackgroundGraphRAGWarm(mod, cachedGraph, envelope);
          }
        } catch (err) {
          console.warn(`[AbsorbCacheWarm] GraphRAG warmup skipped: ${String(err)}`);
        }
      }
      return {
        loaded: true,
        source: 'disk-cache',
        ageMs,
        rootDir: envelope.rootDir,
        stale: ageMs >= CACHE_MAX_AGE_MS,
        coverage,
      };
    } catch {
      /* Deserialization failed */
    }
  }
  return { loaded: false, source: 'none' };
}

/**
 * Explicit semantic-cache hydration entrypoint.
 *
 * Structural tools intentionally load HoloGraph only. Semantic tools call this
 * surface to hydrate a bound HoloEmbed generation or schedule one governed,
 * observable background warm job.
 */
export async function ensureCachedGraphRAGStateFromCodebaseTools(): Promise<{
  loaded: boolean;
  graphRAGReady: boolean;
  warmJobId?: string;
}> {
  const state = await ensureCachedGraph({ warmGraphRAG: true });
  return {
    loaded: state.loaded,
    graphRAGReady: isGraphRAGReady(),
    ...(state.warmJobId && { warmJobId: state.warmJobId }),
    ...(!state.warmJobId && graphRAGWarmJobId && { warmJobId: graphRAGWarmJobId }),
  };
}

/**
 * Load and return only an authoritative structural graph for visual selection.
 *
 * This deliberately suppresses GraphRAG warmup: holo_visual_graph_context
 * needs HoloGraph topology and citations, not a HoloEmbed semantic index.
 */
export async function getAuthoritativeGraphForVisualContext(): Promise<{
  graph: unknown;
  rootDir: string;
  timestamp: number;
} | null> {
  const state = await ensureCachedGraph({ warmGraphRAG: false });
  if (!state.loaded || !cachedGraph || !cachedRootDir) return null;
  return {
    graph: cachedGraph,
    rootDir: cachedRootDir,
    timestamp: cacheTimestamp || Date.now(),
  };
}

import * as EngineMod from '../engine/index';

/**
 * Return the engine module shape consumed by the MCP codebase tools.
 * Keeping this wrapper centralizes the dependency while TypeScript verifies
 * that the engine barrel still exports the expected scanner/graph APIs.
 */
async function loadCodebaseModule(): Promise<CodebaseModule> {
  return EngineMod;
}

function shouldAutoLoadGraph(name: string, _args: Record<string, unknown>): boolean {
  if (
    name === 'holo_absorb_manifest' ||
    name === 'holo_graph_status' ||
    name === 'holo_get_absorb_status' ||
    name === 'holo_cancel_absorb'
  )
    return false;
  // Absorb owns its cache-selection and incremental/full-scan path. Prewarming
  // here duplicates a large graph/index load before the job is even accepted
  // and, for async calls, blocks the request-serving event loop.
  if (name === 'holo_absorb_repo') return false;
  return true;
}

export async function handleCodebaseTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  // cacheAutoLoaded guard prevents repeated disk I/O within a session;
  // ensureCachedGraph handles the actual lazy-load logic.
  if (!cacheAutoLoaded && shouldAutoLoadGraph(name, args)) {
    cacheAutoLoaded = true;
    // Structural tools load HoloGraph only. HoloEmbed warming is an explicit
    // semantic-tool concern and must never surprise an exact graph query.
    await ensureCachedGraph({ warmGraphRAG: false }).catch(() => {});
  }

  switch (name) {
    case 'holo_absorb_manifest':
      return {
        manifest: buildHoloAbsorbManifest(),
        ...(args.audit === false ? {} : { audit: auditHoloAbsorbManifest() }),
      };
    case 'holo_absorb_repo':
      return handleAbsorb(args);
    case 'holo_cancel_absorb':
      return handleCancelAbsorb(args);
    case 'holo_query_codebase':
      return handleQuery(args);
    case 'holo_impact_analysis':
      return handleImpact(args);
    case 'holo_detect_changes':
      return handleDetectChanges(args);
    case 'holo_graph_status':
      return handleGraphStatus(args);
    case 'holo_detect_drift':
      return handleDetectDrift(args);
    case 'holo_resolve_symbol':
      return handleResolveSymbol(args);
    case 'holo_get_absorb_status':
      return handleGetAbsorbStatus(args);
    default:
      return null;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Run a full codebase scan (non-incremental path).
 */
async function runFullScan(
  mod: CodebaseModule,
  rootDirsRaw: string[] | undefined,
  languages: string[] | undefined,
  maxFiles: number | undefined,
  includeBuildArtifacts: boolean,
  outputFormat: string,
  layout: string,
  interactive: boolean,
  jobId?: string,
  embeddingProvider?: string,
  embeddingApiKey?: string,
  embeddingModel?: string,
  inlineSourceFiles?: SourceFileEntry[],
  localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary,
  scanBatchSize?: number,
  scanPolicy?: GraphScanPolicy,
  preparedScanPlan?: PlannedScannerScanPlan,
  refreshCheckpoint?: AbsorbRefreshCheckpoint,
  targetGitCommitHash?: string | null,
  targetWorktreeFingerprint?: string | null,
  sourceDriftRetryPolicy?: AbsorbSourceDriftRetryPolicy
): Promise<unknown> {
  const {
    CodebaseScanner,
    CodebaseGraph,
    HoloEmitter,
    CodebaseSceneCompiler,
    GitChangeDetector,
    BrainCoordNodeMapper,
  } = mod;

  const rootDirs = rootDirsRaw && rootDirsRaw.length > 0 ? rootDirsRaw : [];
  if (rootDirs.length === 0) throw new Error('No rootDir or rootDirs provided');
  const primaryRootDir = rootDirs[0];
  const signal = getAbsorbJobSignal(jobId);
  enforceAbsorbJobControl(jobId, 'initializing full scan');

  const startTime = Date.now();
  let phaseStartedAt = startTime;
  const phaseMetrics: AbsorbPhaseMetric[] = [];
  const effectiveScanPolicy = normalizeScanPolicy(scanPolicy);
  const effectiveMaxFiles = maxFiles ?? effectiveScanPolicy.maxFiles ?? DEFAULT_SCAN_MAX_FILES;
  const effectiveIncludeBuildArtifacts =
    includeBuildArtifacts || effectiveScanPolicy.includeBuildArtifacts === true;
  let activeRefreshCheckpoint = refreshCheckpoint;
  const effectiveTargetGitCommitHash = inlineSourceFiles
    ? null
    : (targetGitCommitHash ?? (await getCurrentGitCommit(primaryRootDir)));
  const effectiveTargetWorktreeFingerprint = inlineSourceFiles
    ? null
    : (targetWorktreeFingerprint ??
      buildGitWorktreeFingerprint(primaryRootDir, effectiveScanPolicy));
  const rootSourcePins = inlineSourceFiles
    ? []
    : await captureGraphRootSourcePins(
        rootDirs,
        effectiveScanPolicy,
        effectiveTargetGitCommitHash,
        effectiveTargetWorktreeFingerprint
      );
  const recordPhaseMetric = (
    phase: string,
    details: Partial<Pick<AbsorbPhaseMetric, 'filesProcessed' | 'totalFiles' | 'totalSymbols'>> = {}
  ): void => {
    const now = Date.now();
    const metric: AbsorbPhaseMetric = {
      phase,
      durationMs: now - phaseStartedAt,
      elapsedMs: now - startTime,
      ...readAbsorbMemorySnapshot(),
      ...details,
    };
    phaseMetrics.push(metric);
    appendAbsorbPhaseMetric(jobId, metric);
    phaseStartedAt = now;
  };
  const embeddingPolicy = buildGraphRAGEmbeddingPolicyReceipt();

  // FAST-HYDRATE: capture the prior on-disk envelope's git hash BEFORE
  // saveGraphCache (below) overwrites it. If the freshly-scanned graph is at the
  // same commit as the persisted embeddings, the disk `.bin` is still valid — we
  // can load it instead of re-embedding 343k symbols. Read here, at the top,
  // because the save at the end of the scan-persist step clobbers the file.
  const priorEnvelopeForHydrate = loadGraphCache(primaryRootDir, rootDirs);
  const priorGitCommitHash = priorEnvelopeForHydrate?.gitCommitHash;

  const rootDiagnostics = inlineSourceFiles
    ? []
    : rootDirs.map((rootDir) =>
        buildAbsorbDiagnostics(rootDir, null, effectiveIncludeBuildArtifacts)
      );
  const inaccessibleRoots = rootDiagnostics.filter(
    (diagnostic) => !diagnostic.resolvedDirExists || !diagnostic.resolvedDirReadable
  );
  if (inaccessibleRoots.length > 0) {
    const cache = getCacheAge(primaryRootDir, rootDirs);
    const graphUnavailableReceipt = buildGraphUnavailableReceipt({
      reason: 'rootDir_unavailable',
      requestedPath: inaccessibleRoots[0].requestedRootDir,
      runtimePath: inaccessibleRoots[0].resolvedRootDir,
      cacheAgeMs: cache.ageMs,
    });
    const result = {
      error: 'rootDir_unavailable',
      message:
        'One or more requested rootDirs are not accessible from this MCP runtime; graph cache was not updated.',
      rootDir: primaryRootDir,
      embeddingPolicy,
      scanPolicy: effectiveScanPolicy,
      graphUnavailableReceipt,
      diagnostics: inaccessibleRoots[0],
      rootDiagnostics,
      durationMs: Date.now() - startTime,
    };
    failAbsorbJob(jobId, 'Root directory unavailable', result.message, result);
    return result;
  }

  const enforceRefreshSourcePin = async (): Promise<void> => {
    try {
      await assertGraphRootSourcePinsCurrent(rootSourcePins, effectiveScanPolicy);
    } catch (error) {
      activeRefreshCheckpoint?.markInvalidated(error);
      setAbsorbJobRefreshProgress(jobId, activeRefreshCheckpoint?.progressReceipt());
      throw error;
    }
  };
  let lastBatchHeadCheckAt = 0;
  let effectiveHeadCheckIntervalMs =
    sourceDriftRetryPolicy?.checkIntervalMs ?? DEFAULT_SOURCE_DRIFT_CHECK_INTERVAL_MS;
  const enforceRefreshHeadPinBetweenBatches = async (): Promise<void> => {
    if (rootSourcePins.length === 0) return;
    const configuredCheckIntervalMs =
      sourceDriftRetryPolicy?.checkIntervalMs ?? DEFAULT_SOURCE_DRIFT_CHECK_INTERVAL_MS;
    const now = Date.now();
    if (lastBatchHeadCheckAt > 0 && now - lastBatchHeadCheckAt < effectiveHeadCheckIntervalMs) {
      return;
    }
    lastBatchHeadCheckAt = now;
    const checkStartedAt = process.hrtime.bigint();
    try {
      await assertGraphRootHeadPinsCurrent(rootSourcePins);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - checkStartedAt) / 1_000_000;
      const maxCheckOverheadRatio = sourceDriftRetryPolicy?.maxCheckOverheadRatio ?? 0;
      if (configuredCheckIntervalMs > 0 && maxCheckOverheadRatio > 0) {
        effectiveHeadCheckIntervalMs = Math.max(
          configuredCheckIntervalMs,
          effectiveHeadCheckIntervalMs,
          Math.ceil(durationMs / maxCheckOverheadRatio)
        );
      }
      recordAbsorbSourceHeadCheck(jobId, durationMs, effectiveHeadCheckIntervalMs);
    }
  };

  if (jobId) trackAbsorbProgress(jobId, 'Discovering files', 5);

  const scanner = new CodebaseScanner();
  const disposeScannerOnAbort = (): void => {
    void scanner.dispose?.();
  };
  signal?.addEventListener('abort', disposeScannerOnAbort, { once: true });
  let scanResult: any;
  let scanPlanReceipt: AbsorbScanPlanReceipt | undefined;

  if (jobId) trackAbsorbProgress(jobId, 'Scanning codebase', 10);

  try {
    await enforceRefreshSourcePin();
    if (inlineSourceFiles) {
      const inlineScan = buildInlineSourceScan(primaryRootDir, inlineSourceFiles);
      const selectedFilePaths = effectiveMaxFiles
        ? inlineScan.filePaths.slice(0, effectiveMaxFiles)
        : inlineScan.filePaths;
      scanPlanReceipt = summarizeInlineScanPlan(selectedFilePaths.length);
      setAbsorbJobScanPlan(jobId, scanPlanReceipt);
      scanResult = await scanner.scanFiles(primaryRootDir, selectedFilePaths, {
        includeBuildArtifacts: effectiveIncludeBuildArtifacts,
        maxFileSize: effectiveScanPolicy.maxFileSize,
        readFile: inlineScan.readFile,
        signal,
        onProgress: (processed: number, total: number, file: string) => {
          if (jobId) {
            const scanPercent = 10 + (processed / Math.max(total, 1)) * 50; // 10-60%
            trackAbsorbProgress(jobId, `Parsed ${file}`, scanPercent, processed, total);
          }
        },
      });
    } else {
      const scanOptions = {
        rootDir: primaryRootDir, // for backward compat mapping
        rootDirs,
        languages,
        maxFiles: effectiveMaxFiles,
        maxFileSize: effectiveScanPolicy.maxFileSize,
        includeBuildArtifacts: effectiveIncludeBuildArtifacts,
        exclude: effectiveScanPolicy.exclude,
        excludePathFragments: effectiveScanPolicy.excludePathFragments,
        excludeNameFragments: effectiveScanPolicy.excludeNameFragments,
        includeHidden: effectiveScanPolicy.includeHidden,
        respectGitIgnore: effectiveScanPolicy.respectGitIgnore !== false,
        includeUntracked: effectiveScanPolicy.includeUntracked !== false,
      };
      const scanPlan =
        preparedScanPlan ??
        (scanner.planScan(scanOptions, scanBatchSize) as PlannedScannerScanPlan);
      if (!activeRefreshCheckpoint) {
        const coverage = buildGraphCoverageStatusForRoots(rootDirs, 0, effectiveScanPolicy);
        const writerLease = jobId ? absorbJobs.get(jobId)?.writerLease : undefined;
        activeRefreshCheckpoint = prepareAbsorbRefreshCheckpoint({
          rootDir: primaryRootDir,
          scanPlan: scanPlan as ScanPlan,
          targetGitCommitHash: effectiveTargetGitCommitHash,
          targetWorktreeFingerprint: effectiveTargetWorktreeFingerprint,
          scanPolicyHash: scanPolicyKey(effectiveScanPolicy),
          maxFiles: effectiveMaxFiles,
          workspaceCandidateFiles: coverage.selectedCandidateCount ?? undefined,
          reuseLatest: true,
          ...(writerLease && {
            writerLeaseProof: {
              leaseFile: writerLease.leaseFile,
              token: writerLease.record.token,
            },
          }),
        });
      }
      const scanRefreshCheckpoint = activeRefreshCheckpoint;
      const batchInputHashes = new Map<number, string | null>();
      scanPlanReceipt = summarizeModuleScanPlan(scanPlan);
      setAbsorbJobScanPlan(jobId, scanPlanReceipt);
      scanRefreshCheckpoint.markScanning();
      setAbsorbJobRefreshProgress(jobId, scanRefreshCheckpoint.progressReceipt());
      scanResult = await scanner.scanInBatches({
        ...scanOptions,
        scanBatchSize,
        scanPlan,
        signal,
        loadBatchResult: (batch: PlannedScannerBatch) =>
          scanRefreshCheckpoint.loadBatchResult(batch, batchInputHashes.get(batch.index) ?? null),
        onBatchResume: scanRefreshCheckpoint
          ? async (batch: PlannedScannerBatch, _result: ScanResult, totalBatches: number) => {
              setAbsorbJobRefreshProgress(jobId, scanRefreshCheckpoint.progressReceipt());
              if (jobId) {
                trackAbsorbProgress(
                  jobId,
                  `Resumed batch ${batch.index}/${totalBatches}: ${batch.label}`,
                  10 + (batch.index / Math.max(totalBatches, 1)) * 50
                );
              }
              await enforceRefreshHeadPinBetweenBatches();
            }
          : undefined,
        onBatchStart: (batch: PlannedScannerBatch, totalBatches: number) => {
          batchInputHashes.set(batch.index, scanRefreshCheckpoint.captureBatchInput(batch));
          if (jobId) {
            trackAbsorbProgress(
              jobId,
              `Scanning batch ${batch.index}/${totalBatches}: ${batch.label}`,
              10
            );
          }
        },
        onBatchComplete: async (
          batch: PlannedScannerBatch,
          batchResult: ScanResult,
          totalBatches: number
        ) => {
          const persisted = scanRefreshCheckpoint.persistBatch(
            batch,
            batchResult,
            batchInputHashes.get(batch.index) ?? null
          );
          setAbsorbJobRefreshProgress(jobId, scanRefreshCheckpoint.progressReceipt());
          if (jobId) {
            trackAbsorbProgress(
              jobId,
              persisted
                ? `Completed batch ${batch.index}/${totalBatches}: ${batch.label}`
                : `Batch ${batch.index}/${totalBatches} changed during scan; checkpoint skipped`,
              10 + (batch.index / Math.max(totalBatches, 1)) * 50
            );
          }
          await enforceRefreshHeadPinBetweenBatches();
        },
        onProgress: (processed: number, total: number, file: string) => {
          if (jobId) {
            const scanPercent = 10 + (processed / Math.max(total, 1)) * 50; // 10-60%
            trackAbsorbProgress(jobId, `Parsed ${file}`, scanPercent, processed, total);
          }
        },
      });
      activeRefreshCheckpoint?.markScanned();
      setAbsorbJobRefreshProgress(jobId, activeRefreshCheckpoint?.progressReceipt());
    }
  } catch (error) {
    if (activeRefreshCheckpoint) {
      if (
        error instanceof AbsorbRefreshCommitPinError ||
        error instanceof AbsorbRefreshWorktreePinError
      ) {
        activeRefreshCheckpoint.markInvalidated(error);
      } else activeRefreshCheckpoint.markInterrupted(error);
      setAbsorbJobRefreshProgress(jobId, activeRefreshCheckpoint.progressReceipt());
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', disposeScannerOnAbort);
    await scanner.dispose?.();
  }
  recordPhaseMetric('scan', {
    filesProcessed: scanResult?.stats?.totalFiles,
    totalFiles: scanPlanReceipt?.totalCandidateFiles,
    totalSymbols: scanResult?.stats?.totalSymbols,
  });

  if (jobId) trackAbsorbProgress(jobId, 'Building graph', 65);

  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);
  recordPhaseMetric('graph-build', {
    filesProcessed: scanResult?.stats?.totalFiles,
    totalFiles: scanPlanReceipt?.totalCandidateFiles,
  });

  // HoloGraph Phase 2: map every symbol to its MNI152 brain coordinate.
  // Populates graph.nodePositions for spatial visualisation + hot/cold routing.
  if (jobId) trackAbsorbProgress(jobId, 'Mapping brain coordinates', 68);
  const brainMapper = new BrainCoordNodeMapper();
  brainMapper.populate(graph);
  recordPhaseMetric('brain-coordinate-map');

  const stats = graph.getStats();
  const diagnostics =
    stats.totalFiles === 0
      ? buildAbsorbDiagnostics(primaryRootDir, scanResult, effectiveIncludeBuildArtifacts)
      : undefined;

  if (stats.totalFiles === 0) {
    const result = {
      error: 'no_files_scanned',
      message:
        'Absorb scan found no supported source files; graph cache and in-memory graph state were not updated.',
      rootDir: primaryRootDir,
      stats,
      embeddingPolicy,
      scanPolicy: effectiveScanPolicy,
      diagnostics,
      scanPlan: scanPlanReceipt,
      phaseMetrics,
      durationMs: Date.now() - startTime,
    };
    failAbsorbJob(jobId, 'No files scanned', result.message, result);
    return result;
  }

  // Compute git commit hash and file hashes for v2 cache
  let gitCommitHash: string | undefined;
  let fileHashes: Record<string, string> | undefined;
  const scannedFilePaths =
    (scanResult as { files?: Array<{ path?: string }> }).files
      ?.map((file) => file.path)
      .filter((filePath): filePath is string => typeof filePath === 'string') ?? [];

  if (inlineSourceFiles) {
    fileHashes = hashInlineSourceFiles(inlineSourceFiles);
  } else {
    const detector = new GitChangeDetector(primaryRootDir);
    if (detector.isGitRepo()) {
      gitCommitHash = effectiveTargetGitCommitHash ?? detector.getHeadCommit() ?? undefined;
      const hashes = detector.computeFileHashes(scannedFilePaths);
      fileHashes = Object.fromEntries(hashes.map((h: any) => [h.filePath, h.hash]));
    }
  }
  const rootAuthorityPins = inlineSourceFiles
    ? undefined
    : buildGraphRootAuthorityPins(
        rootSourcePins,
        primaryRootDir,
        scannedFilePaths,
        effectiveScanPolicy
      );

  graph.gitCommitHash = gitCommitHash;
  graph.fileHashes = fileHashes;
  graph.rootSetId = buildRootSetId(rootDirs);
  graph.rootAuthorityPins = rootAuthorityPins;
  recordPhaseMetric('git-hash', {
    filesProcessed: scanResult?.stats?.totalFiles,
    totalFiles: scanPlanReceipt?.totalCandidateFiles,
  });

  // Resolve the provider before the transactional cache commit. The prior
  // graph and embedding caches remain untouched until every cancellable phase
  // has finished successfully.
  const detectedProvider = embeddingProvider
    ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
    : await detectBestEmbeddingProvider();

  if (outputFormat === 'stats') {
    await enforceRefreshSourcePin();
    enforceAbsorbJobControl(jobId, 'graph-cache-commit');
    const publishedGeneration = publishCacheGeneration({
      graph,
      rootDir: primaryRootDir,
      rootDirs,
      stats,
      gitCommitHash,
      fileHashes,
      embeddingProvider: detectedProvider,
      localCodebaseSnapshotReceipt,
      scanPolicy: effectiveScanPolicy,
      rootAuthorityPins,
    });
    if (!publishedGeneration) {
      const error = new Error('Unable to publish the completed absorb graph cache atomically');
      activeRefreshCheckpoint?.markInterrupted(error);
      setAbsorbJobRefreshProgress(jobId, activeRefreshCheckpoint?.progressReceipt());
      throw error;
    }
    cachedGraph = graph;
    cachedRootDir = primaryRootDir;
    cacheProvenance = localCodebaseSnapshotReceipt
      ? 'local-codebase-snapshot-receipt'
      : 'fresh-scan';
    cacheTimestamp = Date.now();
    const statsJob = jobId ? absorbJobs.get(jobId) : undefined;
    if (statsJob) statsJob.cacheCommitted = true;
    activeRefreshCheckpoint?.markComplete();
    setAbsorbJobRefreshProgress(jobId, activeRefreshCheckpoint?.progressReceipt());
    recordPhaseMetric('graph-cache-save', {
      filesProcessed: scanResult?.stats?.totalFiles,
      totalFiles: scanPlanReceipt?.totalCandidateFiles,
      totalSymbols: stats.totalSymbols,
    });
    if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);
    const graphCoverage = inlineSourceFiles
      ? undefined
      : buildGraphCoverageStatusForRoots(
          rootDirs,
          Number(stats.totalFiles ?? 0),
          effectiveScanPolicy
        );
    const semanticIndexReadiness = buildStatsOnlySemanticIndexReceipt(
      primaryRootDir,
      graphCoverage
    );
    resetGraphRAGState();
    recordPhaseMetric('stats-response');
    const result = {
      rootDir: primaryRootDir,
      stats,
      embeddingPolicy,
      scanPolicy: effectiveScanPolicy,
      scanPlan: scanPlanReceipt,
      ...(activeRefreshCheckpoint && {
        resumeToken: activeRefreshCheckpoint.progressReceipt().resumeToken,
        refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(
          activeRefreshCheckpoint.progressReceipt()
        ),
      }),
      phaseMetrics,
      gitCommitHash,
      rootSetId: buildRootSetId(rootDirs),
      rootAuthorityPins,
      diagnostics,
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
      ...buildAbsorbAuthorityResultFields(semanticIndexReadiness),
      semanticIndexReadiness,
      embeddingSkipped: true,
      embeddingSkipReason: 'outputFormat:stats',
      ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
      durationMs: Date.now() - startTime,
    };
    if (jobId) {
      const job = absorbJobs.get(jobId);
      if (job) {
        job.result = result;
        job.status = 'complete';
        job.completedAt = Date.now();
        settleAbsorbWriterLeaseIfTerminal(job);
      }
    }
    return result;
  }

  if (jobId) trackAbsorbProgress(jobId, 'Creating embeddings', 80);

  // Build embedding index with granular progress (Phase 8 Extension)
  const priorGraphRagReadyForEmbedding = isGraphRAGReady();
  let embeddingBuildError: unknown;
  let preparedEmbeddingIndex: any = null;
  let embeddingRefreshReceipt: EmbeddingRefreshReceipt | undefined;
  try {
    // FAST-HYDRATE: when this scan is at the SAME commit as the persisted
    // embeddings, the on-disk `.bin` is still valid for this exact graph — load
    // it (seconds) instead of re-embedding 343k symbols (minutes). The provider
    // guard in loadEmbeddingsCache still rejects a `.bin` built by a different
    // provider. Never weakens requireNativeGraphRAGProvider.
    const providerName = embeddingProvider
      ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
      : await detectBestEmbeddingProvider();
    const gitHashMatches =
      !!priorGitCommitHash &&
      !!gitCommitHash &&
      priorGitCommitHash === gitCommitHash &&
      fileHashMapsMatch(priorEnvelopeForHydrate?.fileHashes, fileHashes);

    let hydratedIndex: any = null;
    if (priorEnvelopeForHydrate?.embeddingCacheSha256) {
      try {
        const providerObj = await mod.createEmbeddingProvider({
          provider: providerName as EmbeddingProviderName,
          ollamaUrl: process.env.OLLAMA_URL,
          ollamaModel: process.env.OLLAMA_MODEL,
          openaiApiKey: embeddingApiKey || process.env.OPENAI_API_KEY,
          openaiModel: embeddingModel || process.env.OPENAI_MODEL,
          xenovaModel: process.env.XENOVA_MODEL,
        });
        hydratedIndex = await loadEmbeddingsCache(
          mod,
          providerObj,
          primaryRootDir,
          priorEnvelopeForHydrate?.embeddingCacheSha256,
          rootDirs
        );
        if (hydratedIndex && gitHashMatches) {
          console.error(
            `[AbsorbEmbeddings] Fast-hydrate: loaded embeddings from disk (git ${gitCommitHash?.slice(0, 7)} match, provider ${providerName}) — skipping re-embed.`
          );
          if (jobId) trackAbsorbProgress(jobId, 'Loaded embeddings from disk cache', 95);
          // The disk `.bin` is already current for this commit; stage it in
          // memory and do not publish session state until cancellation can no
          // longer invalidate the graph transaction.
          preparedEmbeddingIndex = hydratedIndex;
        } else if (hydratedIndex && typeof hydratedIndex.refreshIndex === 'function') {
          if (jobId) trackAbsorbProgress(jobId, 'Reconciling changed symbol embeddings', 80);
          const refreshReceipt: EmbeddingRefreshReceipt = await withPhaseTimeout(
            hydratedIndex.refreshIndex(
              graph,
              jobId
                ? (batchNum: number, totalBatches: number, symbolsProcessed: number) => {
                    const embeddingProgress =
                      80 + Math.floor((batchNum / Math.max(totalBatches, 1)) * 15);
                    trackAbsorbProgress(
                      jobId,
                      `Reconciling embedding batch ${batchNum}/${totalBatches} (${symbolsProcessed} symbols checked)`,
                      embeddingProgress
                    );
                  }
                : undefined
            ),
            EMBEDDING_BUILD_TIMEOUT_MS,
            'holo_absorb_repo changed-symbol embedding refresh',
            () => disposeEmbeddingIndex(hydratedIndex),
            signal
          );
          embeddingRefreshReceipt = refreshReceipt;
          console.error(
            `[AbsorbEmbeddings] Delta refresh: reused ${refreshReceipt.reusedSymbols}/${refreshReceipt.totalSymbols} symbols; embedded ${refreshReceipt.embeddedSymbols}.`
          );
          preparedEmbeddingIndex = hydratedIndex;
        }
      } catch (err) {
        if (isAbsorbCancellation(err, jobId)) throw err;
        console.warn(`[AbsorbEmbeddings] Fast-hydrate load failed, will rebuild: ${String(err)}`);
        if (hydratedIndex) await disposeEmbeddingIndex(hydratedIndex);
        hydratedIndex = null;
        embeddingRefreshReceipt = undefined;
      } finally {
        if (hydratedIndex) await disposeEmbeddingIndex(hydratedIndex);
      }
    }

    if (!hydratedIndex) {
      const embeddingIndex = await createDynamicEmbeddingIndex(
        mod,
        embeddingProvider,
        embeddingApiKey,
        embeddingModel
      );

      // Wire progress callback for granular embedding updates
      try {
        await withPhaseTimeout(
          embeddingIndex.buildIndex(
            graph,
            jobId
              ? (batchNum: number, totalBatches: number, symbolsProcessed: number) => {
                  // Map batch progress to 80-95% range (Phase 8 Extension)
                  const embeddingProgress = 80 + Math.floor((batchNum / totalBatches) * 15);
                  trackAbsorbProgress(
                    jobId,
                    `Embedding batch ${batchNum}/${totalBatches} (${symbolsProcessed} symbols)`,
                    embeddingProgress
                  );
                }
              : undefined
          ),
          EMBEDDING_BUILD_TIMEOUT_MS,
          'holo_absorb_repo embedding build',
          () => disposeEmbeddingIndex(embeddingIndex),
          signal
        );
      } finally {
        await disposeEmbeddingIndex(embeddingIndex);
      }

      preparedEmbeddingIndex = embeddingIndex;
      recordPhaseMetric('embedding-build', {
        totalSymbols: stats.totalSymbols,
      });
    } else if (embeddingRefreshReceipt) {
      recordPhaseMetric('embedding-incremental-refresh', {
        totalSymbols: embeddingRefreshReceipt.totalSymbols,
      });
    } else {
      recordPhaseMetric('embedding-cache-hydrate', {
        totalSymbols: stats.totalSymbols,
      });
    }
  } catch (err) {
    if (isAbsorbCancellation(err, jobId)) throw err;
    console.warn(`[AbsorbEmbeddings] Full-scan GraphRAG skipped: ${String(err)}`);
    embeddingBuildError = err;
    recordPhaseMetric('embedding-skipped', {
      totalSymbols: stats.totalSymbols,
    });
  }
  const graphCoverage = inlineSourceFiles
    ? undefined
    : buildGraphCoverageStatusForRoots(
        rootDirs,
        Number(stats.totalFiles ?? 0),
        effectiveScanPolicy
      );
  const semanticIndexReadiness = buildSemanticIndexReadinessReceipt(primaryRootDir, {
    priorGraphRagReady: priorGraphRagReadyForEmbedding,
    embeddingBuildError,
    graphRagReadyOverride: preparedEmbeddingIndex !== null && embeddingBuildError === undefined,
    graphCoverage,
  });

  // Sync with mesh (Phase 9)
  enforceAbsorbJobControl(jobId, 'mesh-sync');
  await syncWithMesh(graph, primaryRootDir, signal);
  recordPhaseMetric('mesh-sync');

  let result: unknown;
  let serializedGraphForCache: string | undefined;

  if (outputFormat === 'graph') {
    serializedGraphForCache = graph.serialize();
    result = {
      rootDir: primaryRootDir,
      stats,
      graphPayload: {
        inline: false,
        stored: true,
        reason: 'mcp_payload_memory_bound',
        recoverVia: ['holo_query_codebase', 'holo_ask_codebase', 'holo_semantic_search'],
      },
      embeddingPolicy,
      ...(embeddingRefreshReceipt && { embeddingRefresh: embeddingRefreshReceipt }),
      scanPolicy: normalizeScanPolicy(scanPolicy),
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
      ...buildAbsorbAuthorityResultFields(semanticIndexReadiness),
      semanticIndexReadiness,
      embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
      ...(semanticIndexReadiness.embeddingSkipReason && {
        embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
      }),
      scanPlan: scanPlanReceipt,
      phaseMetrics,
      gitCommitHash,
      rootSetId: buildRootSetId(rootDirs),
      rootAuthorityPins,
      diagnostics,
      ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
      durationMs: Date.now() - startTime,
    };
  } else {
    // Default: holo
    const emitter = new HoloEmitter();
    const holoSource = emitter.emit(graph, {
      name: primaryRootDir.split(/[/\\]/).pop() ?? 'codebase',
      layout: layout as 'force' | 'layered',
      lastPositions: graph.nodePositions,
    });

    // Extract positions from AST via SceneCompiler (since emitter doesn't expose them directly)
    const sceneCompiler = new CodebaseSceneCompiler();
    const scene = sceneCompiler.compile(graph, {
      layout: layout as 'force' | 'layered',
      interactive,
      lastPositions: graph.nodePositions,
    });

    // Save new positions to graph
    for (const obj of scene.objects) {
      graph.nodePositions.set(obj.name, obj.position);
    }

    result = {
      stats,
      holoSource,
      interactiveScene: scene,
      embeddingPolicy,
      scanPolicy: effectiveScanPolicy,
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
      ...buildAbsorbAuthorityResultFields(semanticIndexReadiness),
      semanticIndexReadiness,
      embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
      ...(semanticIndexReadiness.embeddingSkipReason && {
        embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
      }),
      scanPlan: scanPlanReceipt,
      phaseMetrics,
      gitCommitHash,
      rootSetId: buildRootSetId(rootDirs),
      rootAuthorityPins,
      diagnostics,
      ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
      durationMs: Date.now() - startTime,
    };
  }

  // Transactional publication boundary: cancellation and memory-budget checks
  // have completed for scan, graph, embedding, mesh, and response generation.
  // Only now replace the prior authoritative graph/index caches and session state.
  await enforceRefreshSourcePin();
  enforceAbsorbJobControl(jobId, 'cache-commit');
  cacheTimestamp = Date.now();
  const publishedGeneration = publishCacheGeneration({
    graph,
    rootDir: primaryRootDir,
    rootDirs,
    stats,
    gitCommitHash,
    fileHashes,
    embeddingProvider: detectedProvider,
    localCodebaseSnapshotReceipt,
    scanPolicy: effectiveScanPolicy,
    serializedGraph: serializedGraphForCache,
    ...(preparedEmbeddingIndex && { embeddingIndex: preparedEmbeddingIndex }),
    rootAuthorityPins,
  });
  if (!publishedGeneration) {
    const error = new Error('Unable to publish the completed absorb graph cache atomically');
    activeRefreshCheckpoint?.markInterrupted(error);
    setAbsorbJobRefreshProgress(jobId, activeRefreshCheckpoint?.progressReceipt());
    throw error;
  }
  cachedGraph = graph;
  cachedRootDir = primaryRootDir;
  cacheProvenance = localCodebaseSnapshotReceipt ? 'local-codebase-snapshot-receipt' : 'fresh-scan';
  if (preparedEmbeddingIndex && semanticIndexReadiness.graphAuthoritative !== false) {
    setGraphRAGState(
      preparedEmbeddingIndex,
      new mod.GraphRAGEngine(graph, preparedEmbeddingIndex),
      { rootDir: primaryRootDir, timestamp: cacheTimestamp }
    );
  } else {
    resetGraphRAGState();
  }
  const committedJob = jobId ? absorbJobs.get(jobId) : undefined;
  if (committedJob) committedJob.cacheCommitted = true;
  activeRefreshCheckpoint?.markComplete();
  setAbsorbJobRefreshProgress(jobId, activeRefreshCheckpoint?.progressReceipt());
  if (activeRefreshCheckpoint && typeof result === 'object' && result !== null) {
    Object.assign(result as Record<string, unknown>, {
      resumeToken: activeRefreshCheckpoint.progressReceipt().resumeToken,
      refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(
        activeRefreshCheckpoint.progressReceipt()
      ),
    });
  }
  recordPhaseMetric('cache-commit', {
    filesProcessed: scanResult?.stats?.totalFiles,
    totalFiles: scanPlanReceipt?.totalCandidateFiles,
    totalSymbols: stats.totalSymbols,
  });
  if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);

  // Store result in job
  if (jobId) {
    const job = absorbJobs.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'complete';
      job.completedAt = Date.now();
      settleAbsorbWriterLeaseIfTerminal(job);
    }
  }

  return result;
}

/**
 * Run an incremental patch (reuse cached graph, only rescan changed files).
 */
async function runIncrementalPatch(
  mod: CodebaseModule,
  rootDir: string,
  envelope: GraphCacheEnvelope,
  changes: { added: string[]; modified: string[]; deleted: string[]; headCommit: string },
  includeBuildArtifacts: boolean,
  outputFormat: string,
  layout: string,
  interactive: boolean,
  jobId?: string,
  embeddingProvider?: string,
  embeddingApiKey?: string,
  embeddingModel?: string,
  scanBatchSize?: number,
  scanPolicy?: GraphScanPolicy,
  sourcePins?: GraphRootSourcePin[],
  incompleteCacheRepair?: IncompleteCacheRepairExecution
): Promise<unknown> {
  const { CodebaseScanner, CodebaseGraph, GitChangeDetector } = mod;
  const startTime = Date.now();
  const embeddingPolicy = buildGraphRAGEmbeddingPolicyReceipt();
  const effectiveScanPolicy = normalizeScanPolicy(scanPolicy ?? envelope.scanPolicy);
  const activeSourcePins =
    sourcePins ?? (await captureGraphRootSourcePins([rootDir], effectiveScanPolicy));
  const signal = getAbsorbJobSignal(jobId);
  enforceAbsorbJobControl(jobId, 'initializing incremental patch');

  if (jobId) trackAbsorbProgress(jobId, 'Loading cached graph', 10);

  // Deserialize cached graph
  let graph: any;
  try {
    graph = CodebaseGraph.deserialize(envelope.graphJson);
    attachGraphCacheMetadata(graph, envelope);
  } catch {
    console.warn('[AbsorbIncremental] deserialization failed → full scan');
    return await runFullScan(
      mod,
      [rootDir],
      undefined,
      undefined,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      effectiveScanPolicy
    );
  }

  if (jobId) trackAbsorbProgress(jobId, 'Detecting content changes', 20);

  // Content-hash verification
  const detector = new GitChangeDetector(rootDir);
  const modifiedFiltered = detector.filterByContentHash(
    changes.modified,
    envelope.fileHashes ?? {}
  );

  const coveragePolicy = buildCoveragePolicy(effectiveScanPolicy);
  const filesToRemove = [...changes.deleted, ...modifiedFiltered.trulyChanged];
  const filesToRescan = [...changes.added, ...modifiedFiltered.trulyChanged].filter(
    (filePath) => !isCoverageExcludedPath(filePath, coveragePolicy)
  );

  if (jobId) trackAbsorbProgress(jobId, `Rescanning ${filesToRescan.length} changed files`, 30);

  // Rescan changed files
  const scanner = new CodebaseScanner();
  const disposeScannerOnAbort = (): void => {
    void scanner.dispose?.();
  };
  signal?.addEventListener('abort', disposeScannerOnAbort, { once: true });
  let rescanResult: any;
  try {
    rescanResult = await scanner.scanFiles(
      rootDir,
      filesToRescan.map((f) => path.join(rootDir, f)),
      {
        includeBuildArtifacts,
        maxFileSize: effectiveScanPolicy.maxFileSize,
        signal,
        onProgress: (processed: number, total: number, file: string) => {
          if (jobId) {
            const scanPercent = 30 + (processed / total) * 30; // 30-60%
            trackAbsorbProgress(jobId, `Parsed ${file}`, scanPercent, processed, total);
          }
        },
      }
    );
  } finally {
    signal?.removeEventListener('abort', disposeScannerOnAbort);
    await scanner.dispose?.();
  }

  if (jobId) trackAbsorbProgress(jobId, 'Patching graph', 65);

  // Patch graph. `patchFromChanges` removes stale entries first, then applies
  // rescanned files; passing rescanned added files as "modified" is safe because
  // updateFile() falls through to addFile() when the file is not already present.
  graph.patchFromChanges([], rescanResult.files, filesToRemove);

  // Update git metadata
  graph.gitCommitHash = changes.headCommit;
  const normalizedPatchedFiles = normalizedGraphFilePaths(rootDir, graph);
  if (!normalizedPatchedFiles) {
    throw new Error('Incremental graph produced invalid or duplicate repository file paths');
  }
  if (
    incompleteCacheRepair &&
    !setsMatch(normalizedPatchedFiles, incompleteCacheRepair.expectedFilePaths)
  ) {
    throw new Error(
      `Incomplete-cache delta repair refused publication: graph covers ${normalizedPatchedFiles.length}/${incompleteCacheRepair.expectedFilePaths.length} exact selected files`
    );
  }
  const hashTargetFiles = incompleteCacheRepair
    ? incompleteCacheRepair.expectedFilePaths
    : normalizedPatchedFiles;
  const newHashes = detector.computeFileHashes(hashTargetFiles);
  if (
    incompleteCacheRepair &&
    newHashes.length !== incompleteCacheRepair.expectedFilePaths.length
  ) {
    throw new Error(
      `Incomplete-cache delta repair refused publication: hashed ${newHashes.length}/${incompleteCacheRepair.expectedFilePaths.length} exact selected files`
    );
  }
  graph.fileHashes = Object.fromEntries(newHashes.map((h: any) => [h.filePath, h.hash]));
  graph.rootDirs = [rootDir];
  graph.rootSetId = buildRootSetId([rootDir]);
  const rootAuthorityPins = buildGraphRootAuthorityPins(
    activeSourcePins,
    rootDir,
    normalizedPatchedFiles,
    effectiveScanPolicy
  );
  graph.rootAuthorityPins = rootAuthorityPins;

  if (outputFormat === 'stats') {
    const statsOnlyGraphStats = graph.getStats();
    const statsOnlyProvider = embeddingProvider
      ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
      : (envelope.embeddingProvider ?? (await detectBestEmbeddingProvider()));

    await assertGraphRootSourcePinsCurrent(activeSourcePins, effectiveScanPolicy);
    const publishedGeneration = publishCacheGeneration({
      graph,
      rootDir,
      rootDirs: [rootDir],
      stats: statsOnlyGraphStats,
      gitCommitHash: graph.gitCommitHash,
      fileHashes: graph.fileHashes,
      embeddingProvider: statsOnlyProvider,
      scanPolicy: effectiveScanPolicy,
      rootAuthorityPins,
    });
    if (!publishedGeneration) {
      throw new Error('Unable to publish incremental stats cache generation');
    }
    cachedGraph = graph;
    cachedRootDir = rootDir;
    cacheProvenance = 'incremental-patch';
    cacheTimestamp = Date.now();
    const statsJob = jobId ? absorbJobs.get(jobId) : undefined;
    if (statsJob) statsJob.cacheCommitted = true;

    if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);
    const patchDurationMs = Date.now() - startTime;
    const graphCoverage = buildGraphCoverageStatus(
      rootDir,
      Number(statsOnlyGraphStats.totalFiles ?? 0),
      effectiveScanPolicy,
      normalizedPatchedFiles
    );
    const semanticIndexReadiness = buildStatsOnlySemanticIndexReceipt(rootDir, graphCoverage);
    resetGraphRAGState();
    const result = {
      incremental: true,
      filesChanged: filesToRescan.length,
      filesAdded: changes.added.length,
      filesModified: modifiedFiltered.trulyChanged.length,
      filesDeleted: changes.deleted.length,
      patchDurationMs,
      rootDir,
      stats: statsOnlyGraphStats,
      embeddingPolicy,
      scanPolicy: effectiveScanPolicy,
      gitCommitHash: changes.headCommit,
      sourcePinValidated: true,
      sourceAuthorityPins: activeSourcePins,
      ...(incompleteCacheRepair && {
        repairedIncompleteCache: true,
        incompleteCacheRepair: incompleteCacheRepair.receipt,
      }),
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
      ...buildAbsorbAuthorityResultFields(semanticIndexReadiness),
      semanticIndexReadiness,
      embeddingSkipped: true,
      embeddingSkipReason: 'outputFormat:stats',
      message: `Incremental stats update: patched ${filesToRescan.length} files in ${patchDurationMs}ms (${statsOnlyGraphStats.totalFiles} total)`,
    };

    if (jobId) {
      const job = absorbJobs.get(jobId);
      if (job) {
        job.result = result;
        job.status = 'complete';
        job.completedAt = Date.now();
        settleAbsorbWriterLeaseIfTerminal(job);
      }
    }

    return result;
  }

  if (jobId) trackAbsorbProgress(jobId, 'Updating embeddings', 80);

  // Update embedding index
  const priorGraphRagReadyForEmbedding = isGraphRAGReady();
  let embeddingBuildError: unknown;
  let preparedEmbeddingIndex: any = null;
  let embeddingRefreshReceipt: EmbeddingRefreshReceipt | undefined;
  try {
    let index: any = null;

    if (cachedGraph && cachedGraph === graph && false) {
      // In-memory cache hit (planned: global cached index not implemented)
    } else {
      const providerName = embeddingProvider
        ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
        : await detectBestEmbeddingProvider();
      const providerObj = await mod.createEmbeddingProvider({
        provider: providerName as EmbeddingProviderName,
        ollamaUrl: process.env.OLLAMA_URL,
        ollamaModel: process.env.OLLAMA_MODEL,
        openaiApiKey: embeddingApiKey || process.env.OPENAI_API_KEY,
        openaiModel: embeddingModel || process.env.OPENAI_MODEL,
        xenovaModel: process.env.XENOVA_MODEL,
      });

      index = await loadEmbeddingsCache(mod, providerObj, rootDir, envelope.embeddingCacheSha256);
      try {
        if (index && typeof index.refreshIndex === 'function') {
          embeddingRefreshReceipt = await withPhaseTimeout(
            index.refreshIndex(
              graph,
              jobId
                ? (batchNum: number, totalBatches: number, symbolsProcessed: number) => {
                    const embeddingProgress =
                      80 + Math.floor((batchNum / Math.max(totalBatches, 1)) * 15);
                    trackAbsorbProgress(
                      jobId,
                      `Reconciling embedding batch ${batchNum}/${totalBatches} (${symbolsProcessed} symbols checked)`,
                      embeddingProgress
                    );
                  }
                : undefined
            ),
            INCREMENTAL_EMBEDDING_TIMEOUT_MS,
            'holo_absorb_repo incremental changed-symbol embedding update',
            () => disposeEmbeddingIndex(index),
            signal
          );
        } else {
          index = await createDynamicEmbeddingIndex(
            mod,
            embeddingProvider,
            embeddingApiKey,
            embeddingModel
          );
          await withPhaseTimeout(
            index.buildIndex(graph),
            EMBEDDING_BUILD_TIMEOUT_MS,
            'holo_absorb_repo incremental fallback full embedding build',
            () => disposeEmbeddingIndex(index),
            signal
          );
        }

        preparedEmbeddingIndex = index;
      } finally {
        if (index) await disposeEmbeddingIndex(index);
      }
    }
  } catch (err) {
    if (isAbsorbCancellation(err, jobId)) throw err;
    console.warn(`[AbsorbEmbeddings] Incremental GraphRAG skipped: ${String(err)}`);
    embeddingBuildError = err;
  }

  const graphStats = graph.getStats();
  const graphCoverage = buildGraphCoverageStatus(
    rootDir,
    Number(graphStats.totalFiles ?? 0),
    effectiveScanPolicy,
    normalizedPatchedFiles
  );
  const detectedProvider = embeddingProvider
    ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
    : await detectBestEmbeddingProvider();

  // Layout and Emission (Phase 8: Incremental Spatial)
  let holoSource = '';
  let interactiveScene: any = null;

  if (outputFormat === 'holo' || interactive) {
    const { HoloEmitter, CodebaseSceneCompiler } = mod;
    const emitter = new HoloEmitter();
    holoSource = emitter.emit(graph, {
      name: rootDir.split(/[/\\]/).pop() ?? 'codebase',
      layout: layout as 'force' | 'layered',
      incremental: true,
      lastPositions: graph.nodePositions,
      changedFiles: filesToRescan,
    });

    const sceneCompiler = new CodebaseSceneCompiler();
    interactiveScene = sceneCompiler.compile(graph, {
      layout: layout as 'force' | 'layered',
      interactive: true,
      lastPositions: graph.nodePositions,
    });

    // Save positions back for next time
    for (const obj of interactiveScene.objects) {
      graph.nodePositions.set(obj.name, obj.position);
    }
  }

  // Sync with mesh if truly changed (Phase 9)
  if (filesToRescan.length > 0) {
    enforceAbsorbJobControl(jobId, 'mesh-sync');
    await syncWithMesh(graph, rootDir, signal);
  }

  enforceAbsorbJobControl(jobId, 'cache-commit');
  await assertGraphRootSourcePinsCurrent(activeSourcePins, effectiveScanPolicy);
  cacheTimestamp = Date.now();
  const publishedGeneration = publishCacheGeneration({
    graph,
    rootDir,
    rootDirs: [rootDir],
    stats: graphStats,
    gitCommitHash: graph.gitCommitHash,
    fileHashes: graph.fileHashes,
    embeddingProvider: detectedProvider,
    scanPolicy: effectiveScanPolicy,
    ...(preparedEmbeddingIndex && { embeddingIndex: preparedEmbeddingIndex }),
    rootAuthorityPins,
  });
  if (!publishedGeneration) {
    throw new Error('Unable to publish incremental graph and embedding cache generation');
  }
  cachedGraph = graph;
  cachedRootDir = rootDir;
  cacheProvenance = 'incremental-patch';
  if (preparedEmbeddingIndex && graphCoverageIsComplete(graphCoverage)) {
    setGraphRAGState(
      preparedEmbeddingIndex,
      new mod.GraphRAGEngine(graph, preparedEmbeddingIndex),
      { rootDir, timestamp: cacheTimestamp }
    );
  } else {
    resetGraphRAGState();
  }
  const committedJob = jobId ? absorbJobs.get(jobId) : undefined;
  if (committedJob) committedJob.cacheCommitted = true;

  if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);

  const patchDurationMs = Date.now() - startTime;
  const semanticIndexReadiness = buildSemanticIndexReadinessReceipt(rootDir, {
    priorGraphRagReady: priorGraphRagReadyForEmbedding,
    embeddingBuildError,
    graphCoverage,
  });

  const result = {
    incremental: true,
    filesChanged: filesToRescan.length,
    filesAdded: changes.added.length,
    filesModified: modifiedFiltered.trulyChanged.length,
    filesDeleted: changes.deleted.length,
    patchDurationMs,
    rootDir,
    stats: graphStats,
    embeddingPolicy,
    ...(embeddingRefreshReceipt && { embeddingRefresh: embeddingRefreshReceipt }),
    scanPolicy: effectiveScanPolicy,
    graphRagReady: semanticIndexReadiness.graphRagReady,
    semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
    ...buildAbsorbAuthorityResultFields(semanticIndexReadiness),
    semanticIndexReadiness,
    embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
    ...(semanticIndexReadiness.embeddingSkipReason && {
      embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
    }),
    holoSource,
    interactiveScene,
    gitCommitHash: changes.headCommit,
    sourcePinValidated: true,
    sourceAuthorityPins: activeSourcePins,
    ...(incompleteCacheRepair && {
      repairedIncompleteCache: true,
      incompleteCacheRepair: incompleteCacheRepair.receipt,
    }),
    message: `Incremental update: patched ${filesToRescan.length} files in ${patchDurationMs}ms (${graphStats.totalFiles} total)`,
  };

  // Store result in job
  if (jobId) {
    const job = absorbJobs.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'complete';
      job.completedAt = Date.now();
      settleAbsorbWriterLeaseIfTerminal(job);
    }
  }

  return result;
}

function readScanPolicyStringArray(
  args: Record<string, unknown>,
  key: 'exclude' | 'excludePathFragments' | 'excludeNameFragments'
): { value?: string[]; error?: string } {
  const raw = args[key];
  if (raw === undefined) return {};
  if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
    return { error: `${key} must be an array of strings.` };
  }
  return { value: normalizeStringList(raw) };
}

function buildScanPolicyFromArgs(
  args: Record<string, unknown>,
  includeBuildArtifacts: boolean,
  maxFiles: number | undefined,
  maxFileSize: number | undefined
): { valid: true; policy: GraphScanPolicy } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const exclude = readScanPolicyStringArray(args, 'exclude');
  const excludePathFragments = readScanPolicyStringArray(args, 'excludePathFragments');
  const excludeNameFragments = readScanPolicyStringArray(args, 'excludeNameFragments');

  for (const result of [exclude, excludePathFragments, excludeNameFragments]) {
    if (result.error) errors.push(result.error);
  }
  if (args.includeHidden !== undefined && typeof args.includeHidden !== 'boolean') {
    errors.push('includeHidden must be a boolean.');
  }
  if (args.respectGitIgnore !== undefined && typeof args.respectGitIgnore !== 'boolean') {
    errors.push('respectGitIgnore must be a boolean.');
  }
  if (args.includeUntracked !== undefined && typeof args.includeUntracked !== 'boolean') {
    errors.push('includeUntracked must be a boolean.');
  }
  if (
    args.maxFileSize !== undefined &&
    (!Number.isFinite(args.maxFileSize) || Number(args.maxFileSize) <= 0)
  ) {
    errors.push('maxFileSize must be a positive number.');
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    policy: normalizeScanPolicy({
      exclude: exclude.value,
      excludePathFragments: excludePathFragments.value,
      excludeNameFragments: excludeNameFragments.value,
      includeHidden: args.includeHidden === true,
      includeBuildArtifacts,
      respectGitIgnore: args.respectGitIgnore !== false,
      includeUntracked: args.includeUntracked !== false,
      maxFiles: maxFiles ?? DEFAULT_SCAN_MAX_FILES,
      maxFileSize,
    }),
  };
}

function scanPolicyArgsProvided(args: Record<string, unknown>): boolean {
  return [
    'exclude',
    'excludePathFragments',
    'excludeNameFragments',
    'includeHidden',
    'includeBuildArtifacts',
    'respectGitIgnore',
    'includeUntracked',
    'maxFiles',
    'maxFileSize',
  ].some((key) => args[key] !== undefined);
}

async function handleAbsorb(args: Record<string, unknown>): Promise<unknown> {
  const mod = (await loadCodebaseModule()) as CodebaseModule;

  const receiptRaw = args.localCodebaseSnapshotReceipt ?? args.snapshotReceipt;
  const receiptResolution = resolveLocalCodebaseSnapshotReceiptForAbsorb(
    receiptRaw,
    args.sourceFiles
  );
  if (!receiptResolution.valid) {
    return {
      error: 'localCodebaseSnapshotReceipt_validation_failed',
      message: receiptResolution.errors.join('; '),
      errors: receiptResolution.errors,
    };
  }

  const localCodebaseSnapshotReceipt = receiptResolution.resolution.summary;
  const rootDir =
    (args.rootDir as string | undefined) ?? receiptResolution.resolution.roots?.[0] ?? '';
  const rootDirsRaw = (args.rootDirs as string[] | undefined) ?? receiptResolution.resolution.roots;
  const sourceFilesRaw =
    (args.sourceFiles as unknown[] | undefined) ?? receiptResolution.resolution.sourceFiles;

  let effectiveRootDirs: string[] = [];
  let primaryRootDir = '';
  let tempDir: string | undefined;
  let fromSourceFiles = false;
  let inlineSourceFiles: SourceFileEntry[] | undefined;

  if (sourceFilesRaw && Array.isArray(sourceFilesRaw)) {
    const validation = validateSourceFiles(sourceFilesRaw);
    if (!validation.valid) {
      return { error: 'sourceFiles_validation_failed', message: validation.error };
    }
    inlineSourceFiles = validation.files;
    const provenanceRoot =
      rootDir || (rootDirsRaw && rootDirsRaw.length > 0 ? rootDirsRaw[0] : undefined);
    if (provenanceRoot) {
      primaryRootDir = path.resolve(provenanceRoot);
      effectiveRootDirs = [primaryRootDir];
    } else {
      tempDir = writeSourceFilesToTemp(validation.files);
      effectiveRootDirs = [tempDir];
      primaryRootDir = tempDir;
    }
    fromSourceFiles = true;
  } else {
    effectiveRootDirs = canonicalizeRootSet(
      rootDirsRaw && rootDirsRaw.length > 0 ? rootDirsRaw : rootDir ? [rootDir] : []
    );
    primaryRootDir = effectiveRootDirs[0];
  }

  if (!primaryRootDir) {
    return {
      error: 'rootDir_or_sourceFiles_required',
      message: 'Provide rootDir (filesystem path) OR sourceFiles (inline file array).',
    };
  }

  const outputFormat = (args.outputFormat as string) ?? 'holo';
  const layout = (args.layout as string) ?? 'force';
  const languages = args.languages as string[] | undefined;
  const maxFiles = args.maxFiles as number | undefined;
  const maxFileSize = args.maxFileSize as number | undefined;
  const scanBatchSize = args.scanBatchSize as number | undefined;
  if (args.resumeToken !== undefined && typeof args.resumeToken !== 'string') {
    return {
      error: 'resume_token_validation_failed',
      message: 'resumeToken must be a string from an AbsorbRefreshProgressReceipt.',
    };
  }
  const resumeToken = (args.resumeToken as string | undefined)?.trim() || undefined;
  const explicitResumeToken = Boolean(resumeToken) && args.__autoGeneratedResumeToken !== true;
  if (resumeToken && fromSourceFiles) {
    return {
      error: 'resume_token_validation_failed',
      message: 'resumeToken is only valid for local filesystem scans, not inline sourceFiles.',
    };
  }
  const interactive = (args.interactive as boolean) ?? false;
  // sourceFiles always forces a fresh scan (no disk cache match for temp dirs)
  const force = fromSourceFiles ? true : ((args.force as boolean) ?? false) || Boolean(resumeToken);
  const includeBuildArtifacts = (args.includeBuildArtifacts as boolean) ?? false;
  const scanPolicyResult = buildScanPolicyFromArgs(
    args,
    includeBuildArtifacts,
    maxFiles,
    maxFileSize
  );
  if (!scanPolicyResult.valid) {
    return {
      error: 'scan_policy_validation_failed',
      message: scanPolicyResult.errors.join('; '),
      errors: scanPolicyResult.errors,
    };
  }
  const scanPolicy = scanPolicyResult.policy;
  const scanPolicyExplicit = scanPolicyArgsProvided(args);
  const maxFilesExplicit = args.maxFiles !== undefined;
  const embeddingProvider = args.embeddingProvider as string | undefined;
  const embeddingApiKey = args.embeddingApiKey as string | undefined;
  const embeddingModel = args.embeddingModel as string | undefined;
  const memoryBudgetResult = resolveAbsorbMemoryBudget(args);
  if (!memoryBudgetResult.valid) {
    return {
      error: 'memory_budget_validation_failed',
      message: memoryBudgetResult.errors.join('; '),
      errors: memoryBudgetResult.errors,
    };
  }
  const sourceDriftRetryResult = resolveAbsorbSourceDriftRetryPolicy(args, explicitResumeToken);
  if (!sourceDriftRetryResult.valid) {
    return {
      error: 'source_drift_retry_validation_failed',
      message: sourceDriftRetryResult.errors.join('; '),
      errors: sourceDriftRetryResult.errors,
    };
  }
  const sourceDriftRetryPolicy = sourceDriftRetryResult.policy;
  const runningInsideIsolatedWorker = args.__isolatedBackgroundWorker === true;

  // Inline uploads with an explicit provenance root publish to that root's
  // durable cache and therefore join the same writer lease. Only anonymous
  // temp-root uploads are isolated enough to skip workspace single-flight.
  const writerKey = tempDir ? undefined : buildAbsorbWriterKey(effectiveRootDirs);
  const writerPolicyHash = writerKey
    ? runningInsideIsolatedWorker && typeof args.__writerPolicyHash === 'string'
      ? args.__writerPolicyHash
      : buildAbsorbWriterPolicyHash({
          rootDirs: effectiveRootDirs,
          languages,
          scanPolicy,
          outputFormat,
          layout,
          interactive,
          force,
          scanBatchSize,
          embeddingProvider,
          embeddingModel,
          inlineSourceFiles,
          localCodebaseSnapshotReceipt,
          resumeToken,
          sourceDriftRetryPolicy,
        })
    : undefined;
  const activeWriter = findActiveAbsorbWriter(writerKey);
  if (activeWriter) {
    if (activeWriter.writerPolicyHash !== writerPolicyHash) {
      return {
        accepted: false,
        async: false,
        busy: true,
        error: 'absorb_workspace_busy',
        activeJobId: activeWriter.jobId,
        status: activeWriter.status,
        phase: activeWriter.phase,
        rootDir: activeWriter.rootDir,
        retryable: true,
        retryHint:
          'Poll the active job to a terminal state, then retry this request. Cache-affecting scan, embedding, or output policies cannot join a different active writer.',
      };
    }
    return {
      accepted: true,
      async: true,
      coalesced: true,
      coalescedReason: 'workspace_absorb_already_active',
      jobId: activeWriter.jobId,
      status: activeWriter.status,
      phase: activeWriter.phase,
      pollTool: 'holo_get_absorb_status',
      rootDir: activeWriter.rootDir,
      backgroundIsolation: activeWriter.backgroundIsolation,
      message:
        'An absorb writer is already active for this workspace root set; this request joined the existing job instead of starting a competing cache publisher.',
    };
  }

  const requestedInternalJobId =
    runningInsideIsolatedWorker && typeof args.__writerJobId === 'string'
      ? args.__writerJobId
      : undefined;
  const requestedJobId =
    requestedInternalJobId ?? `absorb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  let writerLease: AbsorbWriterLease | undefined;
  let recoveredStaleWriterLease = false;
  if (writerKey && writerPolicyHash) {
    const acquisition = acquireAbsorbWriterLease({
      rootDir: primaryRootDir,
      rootDirs: effectiveRootDirs,
      writerKey,
      policyHash: writerPolicyHash,
      jobId: requestedJobId,
      ...(runningInsideIsolatedWorker &&
        typeof args.__writerLeaseToken === 'string' && {
          adoptToken: args.__writerLeaseToken,
        }),
    });
    if (acquisition.outcome === 'occupied') {
      const equivalent = acquisition.record.policyHash === writerPolicyHash;
      if (equivalent) {
        externalAbsorbJobLeases.set(acquisition.record.jobId, {
          leaseFile: acquisition.leaseFile,
          receiptFile: acquisition.receiptFile,
          record: acquisition.record,
        });
        return {
          accepted: true,
          async: true,
          coalesced: true,
          externalWriter: true,
          coalescedReason: 'workspace_absorb_already_active',
          jobId: acquisition.record.jobId,
          status: 'scanning',
          phase: 'External writer lease active',
          pollTool: 'holo_get_absorb_status',
          rootDir: acquisition.record.rootDirs[0] ?? primaryRootDir,
          writerLease: {
            ownerPid: acquisition.record.ownerPid,
            ownerHost: acquisition.record.ownerHost,
            acquiredAt: acquisition.record.acquiredAt,
            updatedAt: acquisition.record.updatedAt,
          },
          message:
            'An equivalent Absorb request is already running in another process; this request reused its durable writer job and publication lease.',
        };
      }
      return {
        accepted: false,
        async: false,
        busy: true,
        error: 'absorb_workspace_busy',
        activeJobId: acquisition.record.jobId,
        rootDir: acquisition.record.rootDirs[0] ?? primaryRootDir,
        retryable: true,
        writerLease: {
          ownerPid: acquisition.record.ownerPid,
          ownerHost: acquisition.record.ownerHost,
          acquiredAt: acquisition.record.acquiredAt,
          updatedAt: acquisition.record.updatedAt,
        },
        retryHint:
          'Poll or wait for the leased writer to finish, then retry. A different cache-affecting policy cannot replace the selected generation while that lease is active.',
      };
    }
    writerLease = acquisition.lease;
    recoveredStaleWriterLease = acquisition.recoveredStaleLease;
  }

  // Create job for progress tracking. The in-process map provides cheap
  // single-flight, while the durable lease closes the second-MCP-process race.
  const jobId = createAbsorbJob(
    primaryRootDir,
    memoryBudgetResult.limits,
    sourceDriftRetryPolicy,
    writerKey,
    writerPolicyHash,
    writerLease,
    requestedJobId
  );
  try {
    enforceAbsorbPreflightResourceGuard(jobId);
  } catch (error) {
    if (isAbsorbCancellation(error, jobId)) return settleCancelledAbsorbJob(jobId, error);
    throw error;
  }

  const plan: AbsorbExecutionPlan = {
    mod,
    effectiveRootDirs,
    primaryRootDir,
    rootDir,
    languages,
    maxFiles,
    maxFileSize,
    scanBatchSize,
    includeBuildArtifacts,
    scanPolicy,
    scanPolicyExplicit,
    maxFilesExplicit,
    outputFormat,
    layout,
    interactive,
    force,
    jobId,
    embeddingProvider,
    embeddingApiKey,
    embeddingModel,
    inlineSourceFiles,
    localCodebaseSnapshotReceipt,
    fromSourceFiles,
    resumeToken,
    explicitResumeToken,
    sourceDriftRetryPolicy,
  };

  const requestedBackground =
    !runningInsideIsolatedWorker && (args.async === true || args.background === true);
  // The isolated worker is already the event-loop boundary. Auto-backgrounding
  // again would recursively spawn another worker and let the parent report
  // completion before any cache publication occurred.
  const scaleDecision = runningInsideIsolatedWorker
    ? ({ autoBackground: false } satisfies AbsorbAutoBackgroundDecision)
    : await buildAutoBackgroundDecision(plan);
  const autoBackground = requestedBackground
    ? ({ autoBackground: false } satisfies AbsorbAutoBackgroundDecision)
    : scaleDecision;
  const runInBackground = requestedBackground || autoBackground.autoBackground;
  if (runInBackground) {
    const requiresLargeIsolation = requiresIsolatedLargeBackground(scaleDecision);
    const requiresFullRefreshCheckpoint =
      plan.force || scaleDecision.reason === 'scan_plan_exceeds_foreground_threshold';
    if (requiresFullRefreshCheckpoint && !plan.fromSourceFiles) {
      try {
        await prepareDurableRefreshCheckpoint(plan);
      } catch (error) {
        const message = errorMessage(error);
        const result = {
          error: 'absorb_refresh_checkpoint_rejected',
          message,
          jobId,
          cachePreserved: true,
          graphAuthoritative: false,
        };
        failAbsorbJob(jobId, 'Refresh checkpoint rejected', message, result);
        return result;
      }
    }
    const backgroundIsolation = startBackgroundAbsorbJob(
      jobId,
      () => executeAbsorbPlan(plan),
      buildIsolatedAbsorbWorkerArgs(args, plan, {
        ...(plan.refreshCheckpoint && {
          resumeToken: plan.refreshCheckpoint.progressReceipt().resumeToken,
          __autoGeneratedResumeToken: !plan.explicitResumeToken,
        }),
      }),
      requiresLargeIsolation
    );
    if (backgroundIsolation === 'isolation-unavailable') {
      return {
        accepted: false,
        async: false,
        error: 'absorb_worker_unavailable',
        legacyError: 'absorb_background_isolation_unavailable',
        jobId,
        status: absorbJobs.get(jobId)?.status ?? 'error',
        rootDir: primaryRootDir,
        cachePreserved: true,
        message:
          'Large background absorb was rejected because worker isolation was unavailable; retry after restoring the worker runtime.',
      };
    }
    return {
      accepted: true,
      async: true,
      backgroundIsolation,
      ...(autoBackground.autoBackground && {
        autoBackground: true,
        autoBackgroundReason: autoBackground.reason,
        foregroundThresholdFiles: autoBackground.thresholdFiles,
        scanPlan: autoBackground.scanPlan,
      }),
      status: absorbJobs.get(jobId)?.status ?? 'queued',
      jobId,
      pollTool: 'holo_get_absorb_status',
      rootDir: primaryRootDir,
      outputFormat,
      force,
      embeddingPolicy: buildGraphRAGEmbeddingPolicyReceipt(),
      memoryBudget: { ...absorbJobs.get(jobId)!.memoryBudget },
      sourceDriftRetry: { ...absorbJobs.get(jobId)!.sourceDriftRetry },
      ...(recoveredStaleWriterLease && { recoveredStaleWriterLease: true }),
      scanPolicy: plan.scanPolicy,
      ...(plan.refreshCheckpoint && {
        resumeToken: plan.refreshCheckpoint.progressReceipt().resumeToken,
        refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(
          plan.refreshCheckpoint.progressReceipt()
        ),
      }),
      fromSourceFiles,
      fromLocalCodebaseSnapshotReceipt: Boolean(localCodebaseSnapshotReceipt),
      ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
      message:
        backgroundIsolation === 'worker-thread'
          ? 'Absorb job started in an isolated worker so MCP health, status, and cancellation remain responsive; poll holo_get_absorb_status with jobId.'
          : autoBackground.autoBackground
            ? autoBackground.reason === 'incomplete_cache_delta_exceeds_foreground_threshold'
              ? 'Incomplete-cache delta repair was started in the background to keep the MCP responsive; only the missing or changed subset will be parsed before exact-set validation and atomic publication.'
              : 'Large cold absorb scan was started in the background to avoid the MCP foreground timeout; poll holo_get_absorb_status with jobId.'
            : 'Absorb job started in the background; poll holo_get_absorb_status with jobId.',
    };
  }

  try {
    return await executeAbsorbPlan(plan);
  } catch (err) {
    if (isAbsorbCancellation(err, jobId)) return settleCancelledAbsorbJob(jobId, err);
    if (
      plan.refreshCheckpoint ||
      resumeToken ||
      err instanceof AbsorbRefreshCommitPinError ||
      err instanceof AbsorbRefreshWorktreePinError
    ) {
      const message = errorMessage(err);
      const refreshProgressReceipt =
        plan.refreshCheckpoint?.progressReceipt() ?? absorbJobs.get(jobId)?.refreshProgressReceipt;
      const result = {
        error:
          err instanceof AbsorbRefreshCommitPinError || err instanceof AbsorbRefreshWorktreePinError
            ? 'absorb_refresh_source_changed'
            : 'absorb_refresh_failed',
        message,
        jobId,
        cachePreserved: !absorbJobs.get(jobId)?.cacheCommitted,
        graphAuthoritative: false,
        ...(refreshProgressReceipt && {
          resumeToken: refreshProgressReceipt.resumeToken,
          refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(refreshProgressReceipt),
        }),
      };
      failAbsorbJob(jobId, 'Refresh failed', message, result);
      return result;
    }
    const message = errorMessage(err);
    failAbsorbJob(jobId, 'Failed', message, {
      error: 'absorb_failed',
      message,
      jobId,
      cachePreserved: !absorbJobs.get(jobId)?.cacheCommitted,
    });
    throw err;
  } finally {
    const job = absorbJobs.get(jobId);
    if (job?.writerLease) releaseAbsorbWriterLease(job);
  }
}

interface AbsorbExecutionPlan {
  mod: CodebaseModule;
  effectiveRootDirs: string[];
  primaryRootDir: string;
  rootDir: string;
  languages?: string[];
  maxFiles?: number;
  maxFileSize?: number;
  scanBatchSize?: number;
  includeBuildArtifacts: boolean;
  scanPolicy: GraphScanPolicy;
  scanPolicyExplicit: boolean;
  maxFilesExplicit: boolean;
  outputFormat: string;
  layout: string;
  interactive: boolean;
  force: boolean;
  jobId: string;
  embeddingProvider?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
  inlineSourceFiles?: SourceFileEntry[];
  localCodebaseSnapshotReceipt?: LocalCodebaseSnapshotReceiptSummary;
  fromSourceFiles: boolean;
  resumeToken?: string;
  explicitResumeToken: boolean;
  sourceDriftRetryPolicy: AbsorbSourceDriftRetryPolicy;
  preparedScanPlan?: PlannedScannerScanPlan;
  refreshCheckpoint?: AbsorbRefreshCheckpoint;
  targetGitCommitHash?: string | null;
  targetWorktreeFingerprint?: string | null;
}

interface AbsorbAutoBackgroundDecision {
  autoBackground: boolean;
  reason?:
    | 'scan_plan_exceeds_foreground_threshold'
    | 'incomplete_cache_delta_exceeds_foreground_threshold';
  thresholdFiles?: number;
  scanPlan?: AbsorbScanPlanReceipt;
}

interface IncompleteCacheRepairReceipt {
  kind: 'IncompleteCacheRepairPlan';
  mode: 'authority-safe-delta';
  selectedCandidateFiles: number;
  cachedGraphFiles: number;
  missingFiles: number;
  changedFiles: number;
  removedFiles: number;
  parsedFiles: number;
}

interface IncompleteCacheRepairPlan {
  changes: {
    added: string[];
    modified: string[];
    deleted: string[];
    headCommit: string;
  };
  expectedFilePaths: string[];
  sourcePins?: GraphRootSourcePin[];
  scanPlan: PlannedScannerScanPlan;
  deltaScanPlan: PlannedScannerScanPlan;
  receipt: IncompleteCacheRepairReceipt;
}

interface IncompleteCacheRepairExecution {
  expectedFilePaths: string[];
  receipt: IncompleteCacheRepairReceipt;
}

function normalizeRepoRelativeFilePath(rootDir: string, filePath: string): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedRoot, filePath);
  const relativePath = path.relative(resolvedRoot, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return relativePath.replace(/\\/g, '/');
}

function collectPlannedRelativeFiles(rootDir: string, scanPlan: PlannedScannerScanPlan): string[] {
  return Array.from(
    new Set(
      scanPlan.batches
        .flatMap((batch) => batch.files)
        .map((filePath) => normalizeRepoRelativeFilePath(rootDir, filePath))
        .filter((filePath): filePath is string => Boolean(filePath))
    )
  ).sort();
}

function buildDeltaScanPlan(
  rootDir: string,
  scanPlan: PlannedScannerScanPlan,
  relativeFiles: string[]
): PlannedScannerScanPlan {
  const selected = new Set(relativeFiles);
  const batches: PlannedScannerBatch[] = [];
  for (const batch of scanPlan.batches) {
    const files = batch.files.filter((filePath) => {
      const relativePath = normalizeRepoRelativeFilePath(rootDir, filePath);
      return relativePath ? selected.has(relativePath) : false;
    });
    if (files.length === 0) continue;
    batches.push({
      index: batches.length + 1,
      label: batch.label,
      files,
    });
  }
  return {
    ...scanPlan,
    totalFiles: relativeFiles.length,
    batches,
  };
}

function normalizeEnvelopeFileHashes(
  rootDir: string,
  fileHashes: Record<string, string> | undefined
): Map<string, string> | null {
  if (!fileHashes || Object.keys(fileHashes).length === 0) return null;
  const normalized = new Map<string, string>();
  for (const [filePath, hash] of Object.entries(fileHashes)) {
    const relativePath = normalizeRepoRelativeFilePath(rootDir, filePath);
    if (!relativePath || normalized.has(relativePath) || !hash) return null;
    normalized.set(relativePath, hash);
  }
  return normalized;
}

function normalizedGraphFilePaths(rootDir: string, graph: any): string[] | null {
  if (!graph || typeof graph.getFilePaths !== 'function') return null;
  const normalized = new Set<string>();
  for (const filePath of graph.getFilePaths() as unknown[]) {
    if (typeof filePath !== 'string') return null;
    const relativePath = normalizeRepoRelativeFilePath(rootDir, filePath);
    if (!relativePath || normalized.has(relativePath)) return null;
    normalized.add(relativePath);
  }
  return Array.from(normalized).sort();
}

function setsMatch(left: Iterable<string>, right: Iterable<string>): boolean {
  const leftSet = left instanceof Set ? left : new Set(left);
  const rightSet = right instanceof Set ? right : new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  for (const entry of leftSet) {
    if (!rightSet.has(entry)) return false;
  }
  return true;
}

async function buildIncompleteCacheRepairPlan(
  plan: AbsorbExecutionPlan,
  envelope: GraphCacheEnvelope,
  scanPolicy: GraphScanPolicy,
  options: {
    verifyCachedHashes: boolean;
    captureSourcePins: boolean;
    scanPlan?: PlannedScannerScanPlan;
  }
): Promise<IncompleteCacheRepairPlan | null> {
  if (
    envelope.version !== 2 ||
    plan.effectiveRootDirs.length !== 1 ||
    !rootMatchesCurrentRepo(envelope.rootDir, plan.primaryRootDir)
  ) {
    return null;
  }

  const detector = new plan.mod.GitChangeDetector(plan.primaryRootDir);
  if (!detector.isGitRepo()) return null;

  const sourcePins = options.captureSourcePins
    ? await captureGraphRootSourcePins([plan.primaryRootDir], scanPolicy)
    : undefined;
  let scanPlan = options.scanPlan;
  if (!scanPlan) {
    const scanner = new plan.mod.CodebaseScanner(undefined, false);
    try {
      scanPlan = scanner.planScan(
        {
          rootDir: plan.primaryRootDir,
          rootDirs: plan.effectiveRootDirs,
          languages: plan.languages,
          maxFiles: plan.maxFiles ?? scanPolicy.maxFiles ?? DEFAULT_SCAN_MAX_FILES,
          maxFileSize: scanPolicy.maxFileSize ?? plan.maxFileSize,
          includeBuildArtifacts:
            plan.includeBuildArtifacts || scanPolicy.includeBuildArtifacts === true,
          exclude: scanPolicy.exclude,
          excludePathFragments: scanPolicy.excludePathFragments,
          excludeNameFragments: scanPolicy.excludeNameFragments,
          includeHidden: scanPolicy.includeHidden,
          respectGitIgnore: scanPolicy.respectGitIgnore !== false,
          includeUntracked: scanPolicy.includeUntracked !== false,
        },
        plan.scanBatchSize
      ) as PlannedScannerScanPlan;
    } finally {
      await scanner.dispose?.();
    }
  }

  let graph: any;
  try {
    graph = plan.mod.CodebaseGraph.deserialize(envelope.graphJson);
  } catch {
    return null;
  }
  const graphFilePaths = normalizedGraphFilePaths(plan.primaryRootDir, graph);
  const storedHashes = normalizeEnvelopeFileHashes(plan.primaryRootDir, envelope.fileHashes);
  if (!graphFilePaths || !storedHashes || !setsMatch(graphFilePaths, storedHashes.keys())) {
    return null;
  }

  const expectedFilePaths = collectPlannedRelativeFiles(plan.primaryRootDir, scanPlan);
  if (expectedFilePaths.length !== scanPlan.totalFiles) return null;
  const expectedSet = new Set(expectedFilePaths);
  const graphSet = new Set(graphFilePaths);
  const missingFiles = expectedFilePaths.filter((filePath) => !graphSet.has(filePath));
  const removedFiles = graphFilePaths.filter((filePath) => !expectedSet.has(filePath));

  const gitChanges = detector.detectChanges(envelope.gitCommitHash ?? null);
  if (gitChanges.notGitRepo || gitChanges.storedCommitMissing || !gitChanges.headCommit) {
    return null;
  }

  const modified = new Set(
    [...gitChanges.modified, ...gitChanges.added]
      .map((filePath) => normalizeRepoRelativeFilePath(plan.primaryRootDir, filePath))
      .filter(
        (filePath): filePath is string =>
          Boolean(filePath) && expectedSet.has(filePath!) && graphSet.has(filePath!)
      )
  );
  if (options.verifyCachedHashes) {
    const cachedCandidates = graphFilePaths.filter((filePath) => expectedSet.has(filePath));
    const storedHashRecord = Object.fromEntries(storedHashes);
    const freshness = detector.filterByContentHash(cachedCandidates, storedHashRecord);
    for (const filePath of freshness.trulyChanged) modified.add(filePath);
    if (sourcePins) await assertGraphRootSourcePinsCurrent(sourcePins, scanPolicy);
  }

  const added = Array.from(new Set(missingFiles)).sort();
  const changed = Array.from(modified)
    .filter((filePath) => !added.includes(filePath))
    .sort();
  const deleted = Array.from(new Set(removedFiles)).sort();
  const parsedFiles = [...added, ...changed].sort();
  const deltaScanPlan = buildDeltaScanPlan(plan.primaryRootDir, scanPlan, parsedFiles);

  return {
    changes: {
      added,
      modified: changed,
      deleted,
      headCommit: gitChanges.headCommit,
    },
    expectedFilePaths,
    sourcePins,
    scanPlan,
    deltaScanPlan,
    receipt: {
      kind: 'IncompleteCacheRepairPlan',
      mode: 'authority-safe-delta',
      selectedCandidateFiles: expectedFilePaths.length,
      cachedGraphFiles: graphFilePaths.length,
      missingFiles: added.length,
      changedFiles: changed.length,
      removedFiles: deleted.length,
      parsedFiles: parsedFiles.length,
    },
  };
}

function buildIsolatedAbsorbWorkerArgs(
  args: Record<string, unknown>,
  plan: AbsorbExecutionPlan,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const policy = normalizeScanPolicy(plan.scanPolicy);
  const writerLease = absorbJobs.get(plan.jobId)?.writerLease;
  return {
    ...args,
    exclude: policy.exclude,
    excludePathFragments: policy.excludePathFragments,
    excludeNameFragments: policy.excludeNameFragments,
    includeHidden: policy.includeHidden === true,
    includeBuildArtifacts: plan.includeBuildArtifacts || policy.includeBuildArtifacts === true,
    respectGitIgnore: policy.respectGitIgnore !== false,
    includeUntracked: policy.includeUntracked !== false,
    maxFiles: plan.maxFiles ?? policy.maxFiles ?? DEFAULT_SCAN_MAX_FILES,
    maxFileSize: policy.maxFileSize ?? plan.maxFileSize,
    minSystemFreeMb: absorbJobs.get(plan.jobId)?.memoryBudget.minSystemFreeMb ?? 0,
    autoRetrySourceDrift: plan.sourceDriftRetryPolicy.enabled,
    maxSourceDriftRetries: plan.sourceDriftRetryPolicy.maxRetries,
    sourceDriftDebounceMs: plan.sourceDriftRetryPolicy.debounceMs,
    sourceDriftCheckIntervalMs: plan.sourceDriftRetryPolicy.checkIntervalMs,
    sourceDriftCheckMaxOverheadPercent: plan.sourceDriftRetryPolicy.maxCheckOverheadRatio * 100,
    ...(writerLease && {
      __writerJobId: plan.jobId,
      __writerLeaseToken: writerLease.record.token,
      __writerPolicyHash: writerLease.record.policyHash,
    }),
    ...overrides,
  };
}

async function prepareDurableRefreshCheckpoint(
  plan: AbsorbExecutionPlan
): Promise<AbsorbRefreshCheckpoint> {
  if (plan.fromSourceFiles) {
    throw new Error('Durable refresh checkpoints require a local filesystem scan');
  }
  let scanPlan = plan.preparedScanPlan;
  if (!scanPlan) {
    const { CodebaseScanner } = plan.mod;
    const scanner = new CodebaseScanner(undefined, false);
    try {
      scanPlan = scanner.planScan(
        {
          rootDir: plan.primaryRootDir,
          rootDirs: plan.effectiveRootDirs,
          languages: plan.languages,
          maxFiles: plan.maxFiles ?? plan.scanPolicy.maxFiles ?? DEFAULT_SCAN_MAX_FILES,
          maxFileSize: plan.scanPolicy.maxFileSize ?? plan.maxFileSize,
          includeBuildArtifacts:
            plan.includeBuildArtifacts || plan.scanPolicy.includeBuildArtifacts === true,
          exclude: plan.scanPolicy.exclude,
          excludePathFragments: plan.scanPolicy.excludePathFragments,
          excludeNameFragments: plan.scanPolicy.excludeNameFragments,
          includeHidden: plan.scanPolicy.includeHidden,
          respectGitIgnore: plan.scanPolicy.respectGitIgnore !== false,
          includeUntracked: plan.scanPolicy.includeUntracked !== false,
        },
        plan.scanBatchSize
      ) as PlannedScannerScanPlan;
    } finally {
      await scanner.dispose?.();
    }
  }

  const targetGitCommitHash = await getCurrentGitCommit(plan.primaryRootDir);
  const targetWorktreeFingerprint = buildGitWorktreeFingerprint(
    plan.primaryRootDir,
    plan.scanPolicy
  );
  const coverage = buildGraphCoverageStatusForRoots(plan.effectiveRootDirs, 0, plan.scanPolicy);
  const writerLease = absorbJobs.get(plan.jobId)?.writerLease;
  const checkpoint = prepareAbsorbRefreshCheckpoint({
    rootDir: plan.primaryRootDir,
    scanPlan: scanPlan as ScanPlan,
    targetGitCommitHash,
    targetWorktreeFingerprint,
    scanPolicyHash: scanPolicyKey(plan.scanPolicy),
    maxFiles: plan.maxFiles ?? plan.scanPolicy.maxFiles ?? DEFAULT_SCAN_MAX_FILES,
    workspaceCandidateFiles: coverage.selectedCandidateCount ?? undefined,
    resumeToken: plan.resumeToken,
    reuseLatest: !plan.resumeToken,
    ...(writerLease && {
      writerLeaseProof: {
        leaseFile: writerLease.leaseFile,
        token: writerLease.record.token,
      },
    }),
  });
  plan.preparedScanPlan = scanPlan;
  plan.targetGitCommitHash = targetGitCommitHash;
  plan.targetWorktreeFingerprint = targetWorktreeFingerprint;
  plan.refreshCheckpoint = checkpoint;
  setAbsorbJobScanPlan(plan.jobId, summarizeModuleScanPlan(scanPlan));
  setAbsorbJobRefreshProgress(plan.jobId, checkpoint.progressReceipt());
  return checkpoint;
}

async function buildAutoBackgroundDecision(
  plan: AbsorbExecutionPlan
): Promise<AbsorbAutoBackgroundDecision> {
  if (plan.fromSourceFiles || envFlagDisabled('ABSORB_AUTO_BACKGROUND')) {
    return { autoBackground: false };
  }

  for (const rootDir of plan.effectiveRootDirs) {
    try {
      if (!fs.statSync(path.resolve(rootDir)).isDirectory()) return { autoBackground: false };
    } catch {
      // Preserve the synchronous root-unavailable error path so callers get the
      // full GraphUnavailableReceipt immediately.
      return { autoBackground: false };
    }
  }

  const existingCache = loadGraphCache(plan.primaryRootDir, plan.effectiveRootDirs);
  const existingCacheMatchesRoot =
    existingCache?.version === 2 &&
    rootMatchesCurrentRepo(existingCache.rootDir, plan.primaryRootDir) &&
    absorbRootSetsMatch(existingCache.rootDirs ?? [existingCache.rootDir], plan.effectiveRootDirs);
  const requestedScanPolicy =
    existingCacheMatchesRoot && !plan.scanPolicyExplicit && !plan.force
      ? normalizeScanPolicy(existingCache.scanPolicy)
      : plan.scanPolicy;
  const reusePolicyResolution =
    existingCacheMatchesRoot && existingCache
      ? resolveReuseScanPolicy(
          plan.primaryRootDir,
          getEnvelopeGraphFileCount(existingCache),
          requestedScanPolicy,
          plan.maxFilesExplicit
        )
      : undefined;
  const effectiveScanPolicy = reusePolicyResolution?.policy ?? requestedScanPolicy;
  const effectiveMaxFiles = plan.maxFiles ?? effectiveScanPolicy.maxFiles ?? DEFAULT_SCAN_MAX_FILES;
  const effectiveIncludeBuildArtifacts =
    plan.includeBuildArtifacts || effectiveScanPolicy.includeBuildArtifacts === true;
  // The scanner plan, durable checkpoint, and isolated worker must all derive
  // from one materialized policy. In particular, implicit full-coverage
  // promotion above DEFAULT_SCAN_MAX_FILES must not exist only in the parent
  // process or the worker will reject the checkpoint's selected file set.
  plan.scanPolicy = effectiveScanPolicy;
  plan.maxFiles = effectiveMaxFiles;
  plan.includeBuildArtifacts = effectiveIncludeBuildArtifacts;
  const existingCacheCoverageComplete = existingCache
    ? graphCoverageMatchesScanPolicy(
        buildGraphCoverageStatusForRoots(
          existingCache.rootDirs ?? plan.effectiveRootDirs,
          getEnvelopeGraphFileCount(existingCache),
          existingCache.scanPolicy,
          existingCache.fileHashes ? Object.keys(existingCache.fileHashes) : undefined
        )
      )
    : false;
  if (
    !plan.force &&
    existingCacheMatchesRoot &&
    scanPoliciesEqual(existingCache.scanPolicy, effectiveScanPolicy) &&
    existingCacheCoverageComplete
  ) {
    if (plan.effectiveRootDirs.length === 1) return { autoBackground: false };
    const rootSetAuthority = await evaluateGraphRootSetAuthority(
      existingCache,
      plan.effectiveRootDirs
    );
    if (rootSetAuthority.authoritative) return { autoBackground: false };
  }

  const thresholdFiles = readPositiveEnvInt(
    'ABSORB_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD',
    DEFAULT_AUTO_BACKGROUND_SCAN_FILE_THRESHOLD
  );
  const { CodebaseScanner } = plan.mod;
  const scanner = new CodebaseScanner(undefined, false);

  try {
    const scanPlan = scanner.planScan(
      {
        rootDir: plan.primaryRootDir,
        rootDirs: plan.effectiveRootDirs,
        languages: plan.languages,
        maxFiles: effectiveMaxFiles,
        maxFileSize: effectiveScanPolicy.maxFileSize ?? plan.maxFileSize,
        includeBuildArtifacts: effectiveIncludeBuildArtifacts,
        exclude: effectiveScanPolicy.exclude,
        excludePathFragments: effectiveScanPolicy.excludePathFragments,
        excludeNameFragments: effectiveScanPolicy.excludeNameFragments,
        includeHidden: effectiveScanPolicy.includeHidden,
        respectGitIgnore: effectiveScanPolicy.respectGitIgnore !== false,
        includeUntracked: effectiveScanPolicy.includeUntracked !== false,
      },
      plan.scanBatchSize
    ) as PlannedScannerScanPlan;
    plan.preparedScanPlan = scanPlan;
    const existingCoverage =
      existingCacheMatchesRoot && existingCache
        ? buildGraphCoverageStatusForRoots(
            existingCache.rootDirs ?? plan.effectiveRootDirs,
            getEnvelopeGraphFileCount(existingCache),
            existingCache.scanPolicy,
            existingCache.fileHashes ? Object.keys(existingCache.fileHashes) : undefined
          )
        : undefined;
    if (
      !plan.force &&
      existingCache &&
      existingCacheMatchesRoot &&
      scanPoliciesEqual(existingCache.scanPolicy, effectiveScanPolicy) &&
      existingCoverage &&
      !graphCoverageMatchesScanPolicy(existingCoverage)
    ) {
      const repairPlan = await buildIncompleteCacheRepairPlan(
        plan,
        existingCache,
        effectiveScanPolicy,
        {
          verifyCachedHashes: false,
          captureSourcePins: false,
          scanPlan,
        }
      );
      if (repairPlan) {
        if (repairPlan.receipt.parsedFiles >= thresholdFiles) {
          return {
            autoBackground: true,
            reason: 'incomplete_cache_delta_exceeds_foreground_threshold',
            thresholdFiles,
            scanPlan: summarizeModuleScanPlan(repairPlan.deltaScanPlan),
          };
        }
        return { autoBackground: false };
      }
    }
    if (scanPlan.totalFiles >= thresholdFiles) {
      return {
        autoBackground: true,
        reason: 'scan_plan_exceeds_foreground_threshold',
        thresholdFiles,
        scanPlan: summarizeModuleScanPlan(scanPlan),
      };
    }
  } finally {
    await scanner.dispose?.();
  }

  return { autoBackground: false };
}

async function reuseAuthoritativeMultiRootCache(
  mod: CodebaseModule,
  plan: AbsorbExecutionPlan,
  envelope: GraphCacheEnvelope,
  graphCoverage: GraphCoverageStatus
): Promise<Record<string, unknown>> {
  const { CodebaseGraph } = mod;
  const rootDirs = plan.effectiveRootDirs;
  const activeRootDirs = (cachedGraph as { rootDirs?: string[] } | null)?.rootDirs;
  const cacheSwitched =
    !cachedGraph || !activeRootDirs || !absorbRootSetsMatch(activeRootDirs, rootDirs);
  if (cacheSwitched) {
    resetGraphRAGState();
    cachedGraph = CodebaseGraph.deserialize(envelope.graphJson);
    attachGraphCacheMetadata(cachedGraph, envelope);
  }
  cachedRootDir = plan.primaryRootDir;
  cacheProvenance = 'disk-cache';
  cacheTimestamp = envelope.timestamp;

  const priorGraphRagReady = isGraphRAGReady();
  let embeddingLoadError: unknown;
  if (plan.outputFormat !== 'stats' && !isGraphRAGReady()) {
    try {
      const hydrated = await hydrateGraphRAGFromDiskEmbeddings(
        mod,
        cachedGraph,
        plan.primaryRootDir,
        envelope.timestamp,
        envelope.embeddingCacheSha256,
        rootDirs
      );
      if (!hydrated) {
        embeddingLoadError = new Error('Multi-root embedding generation is unavailable');
        resetGraphRAGState();
      }
    } catch (error) {
      embeddingLoadError = error;
      resetGraphRAGState();
    }
  }

  const semanticIndexReadiness =
    plan.outputFormat === 'stats'
      ? buildStatsOnlySemanticIndexReceipt(plan.primaryRootDir, graphCoverage)
      : buildSemanticIndexReadinessReceipt(plan.primaryRootDir, {
          priorGraphRagReady,
          embeddingBuildError: embeddingLoadError,
          embeddingFailureReason: embeddingLoadError ? 'embeddingLoadFailed' : undefined,
          graphCoverage,
        });
  const result: Record<string, unknown> = {
    cached: true,
    incremental: false,
    multiRootReuse: true,
    filesChanged: 0,
    rootDir: plan.primaryRootDir,
    rootDirs,
    rootSetId: envelope.rootSetId,
    rootAuthorityPins: envelope.rootAuthorityPins,
    stats: envelope.stats,
    embeddingPolicy: envelope.embeddingPolicy ?? buildGraphRAGEmbeddingPolicyReceipt(),
    scanPolicy: normalizeScanPolicy(envelope.scanPolicy),
    gitCommitHash: envelope.gitCommitHash,
    graphRagReady: semanticIndexReadiness.graphRagReady,
    semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
    ...buildAbsorbAuthorityResultFields(semanticIndexReadiness),
    semanticIndexReadiness,
    embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
    ...(semanticIndexReadiness.embeddingSkipReason && {
      embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
    }),
    message: `Reused authoritative HoloAbsorb root set ${envelope.rootSetId?.slice(0, 12)}`,
    jobId: plan.jobId,
  };
  const job = absorbJobs.get(plan.jobId);
  if (job) {
    job.result = result;
    job.status = 'complete';
    job.progress = 100;
    job.phase = 'Complete (multi-root cache)';
    job.completedAt = Date.now();
    settleAbsorbWriterLeaseIfTerminal(job);
  }
  return result;
}

async function executeAbsorbPlan(plan: AbsorbExecutionPlan): Promise<unknown> {
  const {
    mod,
    effectiveRootDirs,
    primaryRootDir,
    rootDir,
    languages,
    maxFiles,
    scanBatchSize,
    includeBuildArtifacts,
    scanPolicy,
    scanPolicyExplicit,
    maxFilesExplicit,
    outputFormat,
    layout,
    interactive,
    force,
    jobId,
    embeddingProvider,
    embeddingApiKey,
    embeddingModel,
    inlineSourceFiles,
    localCodebaseSnapshotReceipt,
    fromSourceFiles,
    sourceDriftRetryPolicy,
  } = plan;
  const { CodebaseGraph, GitChangeDetector } = mod;
  const signal = getAbsorbJobSignal(jobId);
  try {
    enforceAbsorbJobControl(jobId, 'initializing');
  } catch (error) {
    const activeCheckpoint = plan.refreshCheckpoint;
    if (activeCheckpoint) {
      activeCheckpoint.markInterrupted(error);
      setAbsorbJobRefreshProgress(jobId, activeCheckpoint.progressReceipt());
    }
    throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 1: force=true → FULL SCAN
  // ═══════════════════════════════════════════════════════════════════════════
  if (force) {
    while (true) {
      if (!fromSourceFiles && !plan.refreshCheckpoint) {
        await prepareDurableRefreshCheckpoint(plan);
      }
      const activeCheckpoint = plan.refreshCheckpoint;
      try {
        const result = await runFullScan(
          mod,
          effectiveRootDirs,
          languages,
          maxFiles,
          includeBuildArtifacts,
          outputFormat,
          layout,
          interactive,
          jobId,
          embeddingProvider,
          embeddingApiKey,
          embeddingModel,
          inlineSourceFiles,
          localCodebaseSnapshotReceipt,
          scanBatchSize,
          scanPolicy,
          plan.preparedScanPlan,
          activeCheckpoint,
          plan.targetGitCommitHash,
          plan.targetWorktreeFingerprint,
          sourceDriftRetryPolicy
        );
        return {
          ...(result as Record<string, unknown>),
          jobId,
          fromSourceFiles,
          fromLocalCodebaseSnapshotReceipt: Boolean(localCodebaseSnapshotReceipt),
          ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
          sourceDriftRetry: { ...absorbJobs.get(jobId)?.sourceDriftRetry },
        };
      } catch (error) {
        if (activeCheckpoint) {
          if (
            error instanceof AbsorbRefreshCommitPinError ||
            error instanceof AbsorbRefreshWorktreePinError
          ) {
            activeCheckpoint.markInvalidated(error);
          } else {
            activeCheckpoint.markInterrupted(error);
          }
          setAbsorbJobRefreshProgress(jobId, activeCheckpoint.progressReceipt());
        }

        if (error instanceof AbsorbRefreshCommitPinError) {
          const telemetry = recordAbsorbSourceDrift(jobId, error);
          const canRetry =
            sourceDriftRetryPolicy.enabled &&
            !plan.explicitResumeToken &&
            (telemetry?.retryCount ?? 0) < sourceDriftRetryPolicy.maxRetries;
          if (sourceDriftRetryPolicy.enabled && !canRetry && telemetry) {
            telemetry.exhausted = true;
          }
          if (canRetry) {
            const retryNumber = (telemetry?.retryCount ?? 0) + 1;
            trackAbsorbProgress(
              jobId,
              `HEAD drift detected; waiting to replan refresh (${retryNumber}/${sourceDriftRetryPolicy.maxRetries})`,
              10
            );
            const debounceDurationMs = await waitForAbsorbSourceDriftDebounce(
              effectiveRootDirs,
              sourceDriftRetryPolicy.debounceMs,
              signal
            );
            recordAbsorbSourceDriftRetry(jobId, debounceDurationMs);
            plan.resumeToken = undefined;
            plan.preparedScanPlan = undefined;
            plan.refreshCheckpoint = undefined;
            plan.targetGitCommitHash = undefined;
            plan.targetWorktreeFingerprint = undefined;
            continue;
          }
        }
        throw error;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 2: Load cache checks
  // ═══════════════════════════════════════════════════════════════════════════
  const envelope = loadGraphCache(primaryRootDir, effectiveRootDirs);
  if (!envelope) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      scanPolicy
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  if (envelope.version === 1) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      scanPolicy
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  // Root-match gate: a raw string !== forces a needless full re-scan when the
  // only difference is path casing or a trailing slash (e.g. the merged cache's
  // rootDir "C:/workspace/Repo/..." vs a request "c:\\workspace\\repo\\..."). Normalize
  // both sides (case-insensitive on win32, slash/trailing-slash agnostic) so the
  // fast-hydrate path is reached when they refer to the same repo.
  const envelopeRootDirs = envelope.rootDirs ?? [envelope.rootDir];
  if (
    !rootMatchesCurrentRepo(envelope.rootDir, primaryRootDir) ||
    !absorbRootSetsMatch(envelopeRootDirs, effectiveRootDirs)
  ) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      scanPolicy
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  // Multi-root cache reuse is governed by the exact root-set identity and every
  // root's commit/worktree/coverage pin. Changed root sets use separate cache
  // lanes; changed members invalidate only the matching set generation.
  if (effectiveRootDirs.length > 1) {
    const multiRootCoverage = buildGraphCoverageStatusForRoots(
      envelopeRootDirs,
      getEnvelopeGraphFileCount(envelope),
      envelope.scanPolicy
    );
    const requestedMultiRootScanPolicy = scanPolicyExplicit
      ? scanPolicy
      : normalizeScanPolicy(envelope.scanPolicy);
    const cachePolicyChanged = !scanPoliciesEqual(
      envelope.scanPolicy,
      requestedMultiRootScanPolicy
    );
    const rootSetAuthority = await evaluateGraphRootSetAuthority(envelope, effectiveRootDirs);
    if (
      !cachePolicyChanged &&
      graphCoverageMatchesScanPolicy(multiRootCoverage) &&
      rootSetAuthority.authoritative &&
      (outputFormat === 'stats' || Boolean(envelope.embeddingCacheSha256))
    ) {
      return reuseAuthoritativeMultiRootCache(mod, plan, envelope, multiRootCoverage);
    }
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      requestedMultiRootScanPolicy
    );
    return {
      ...(result as Record<string, unknown>),
      jobId,
      multiRootRefresh: 'full-scan',
      priorRootSetAuthority: rootSetAuthority,
      policyChanged: cachePolicyChanged,
    };
  }

  const envelopeCoverage = buildGraphCoverageStatusForRoots(
    envelopeRootDirs,
    getEnvelopeGraphFileCount(envelope),
    envelope.scanPolicy,
    envelope.fileHashes ? Object.keys(envelope.fileHashes) : undefined
  );
  const requestedSameRootScanPolicy = scanPolicyExplicit
    ? scanPolicy
    : normalizeScanPolicy(envelope.scanPolicy);
  const reusePolicyResolution = resolveReuseScanPolicy(
    primaryRootDir,
    getEnvelopeGraphFileCount(envelope),
    requestedSameRootScanPolicy,
    maxFilesExplicit
  );
  const sameRootScanPolicy = reusePolicyResolution.policy;
  const cachePolicyChanged = !scanPoliciesEqual(envelope.scanPolicy, sameRootScanPolicy);
  if (!cachePolicyChanged && !graphCoverageMatchesScanPolicy(envelopeCoverage)) {
    const repairPlan = await buildIncompleteCacheRepairPlan(plan, envelope, sameRootScanPolicy, {
      verifyCachedHashes: true,
      captureSourcePins: true,
    });
    if (repairPlan) {
      setAbsorbJobScanPlan(jobId, summarizeModuleScanPlan(repairPlan.deltaScanPlan));
      const result = await runIncrementalPatch(
        mod,
        primaryRootDir,
        envelope,
        repairPlan.changes,
        includeBuildArtifacts,
        outputFormat,
        layout,
        interactive,
        jobId,
        embeddingProvider,
        embeddingApiKey,
        embeddingModel,
        scanBatchSize,
        sameRootScanPolicy,
        repairPlan.sourcePins,
        {
          expectedFilePaths: repairPlan.expectedFilePaths,
          receipt: repairPlan.receipt,
        }
      );
      return {
        ...(result as Record<string, unknown>),
        jobId,
        repairedIncompleteCache: true,
        repairMode: 'authority-safe-delta',
        priorCoverage: envelopeCoverage,
        incompleteCacheRepair: repairPlan.receipt,
        policyChanged: false,
      };
    }
  }
  if (cachePolicyChanged || !graphCoverageMatchesScanPolicy(envelopeCoverage)) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      sameRootScanPolicy
    );
    return {
      ...(result as Record<string, unknown>),
      jobId,
      repairedIncompleteCache: true,
      priorCoverage: envelopeCoverage,
      policyChanged: cachePolicyChanged,
      ...(reusePolicyResolution.promotedCappedMaxFiles && {
        repairedCappedCache: true,
        promotedMaxFiles: sameRootScanPolicy.maxFiles,
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 3: Git change detection
  // ═══════════════════════════════════════════════════════════════════════════
  const detector = new GitChangeDetector(primaryRootDir);
  if (!detector.isGitRepo()) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      sameRootScanPolicy
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  // Pin the exact source snapshot around Git change detection. This prevents a
  // concurrent commit or dirty-worktree edit from slipping between the delta
  // calculation and the final atomic generation publication.
  const incrementalSourcePins = await captureGraphRootSourcePins(
    [primaryRootDir],
    sameRootScanPolicy
  );
  const changes = detector.detectChanges(envelope.gitCommitHash ?? null);
  await assertGraphRootSourcePinsCurrent(incrementalSourcePins, sameRootScanPolicy);
  if (changes.storedCommitMissing) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      undefined,
      undefined,
      scanBatchSize,
      sameRootScanPolicy
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  const totalChanges = changes.added.length + changes.modified.length + changes.deleted.length;

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 4: FAST PATH - Zero changes
  // ═══════════════════════════════════════════════════════════════════════════
  if (totalChanges === 0) {
    const zeroChangeCoverage = buildGraphCoverageStatusForRoots(
      envelopeRootDirs,
      getEnvelopeGraphFileCount(envelope),
      sameRootScanPolicy
    );
    const zeroChangeGraphAuthoritative = graphCoverageIsComplete(zeroChangeCoverage);
    if (!zeroChangeGraphAuthoritative) resetGraphRAGState();

    // Ensure cached graph is in session memory
    if (!cachedGraph) {
      try {
        cachedGraph = CodebaseGraph.deserialize(envelope.graphJson);
        attachGraphCacheMetadata(cachedGraph, envelope);
        cachedRootDir = rootDir;
        cacheProvenance = 'disk-cache';
        cacheTimestamp = envelope.timestamp;
      } catch {
        console.warn('[AbsorbIncremental] deserialization failed → full scan');
        const result = await runFullScan(
          mod,
          [rootDir],
          languages,
          maxFiles,
          includeBuildArtifacts,
          outputFormat,
          layout,
          interactive,
          jobId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          scanBatchSize,
          sameRootScanPolicy
        );
        return { ...(result as Record<string, unknown>), jobId };
      }
    }

    // FAST-HYDRATE: zero changes → the on-disk `.bin` is valid for this exact
    // graph. If GraphRAG isn't already warm (the pre-warm ensureCachedGraph may
    // have taken the background-rebuild branch, or this is a fresh process that
    // set cachedGraph another way), load the embeddings from disk NOW so
    // holo_semantic_search / holo_ask_codebase light up without re-embedding.
    // This is the zero-change mirror of the incremental path's loadEmbeddingsCache.
    const priorGraphRagReadyForHydrate = isGraphRAGReady();
    let embeddingLoadError: unknown;
    if (outputFormat !== 'stats' && zeroChangeGraphAuthoritative && !isGraphRAGReady()) {
      try {
        const { GraphRAGEngine } = mod;
        const providerName = embeddingProvider
          ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
          : await detectBestEmbeddingProvider();
        const providerObj = await mod.createEmbeddingProvider({
          provider: providerName as EmbeddingProviderName,
          ollamaUrl: process.env.OLLAMA_URL,
          ollamaModel: process.env.OLLAMA_MODEL,
          openaiApiKey: embeddingApiKey || process.env.OPENAI_API_KEY,
          openaiModel: embeddingModel || process.env.OPENAI_MODEL,
          xenovaModel: process.env.XENOVA_MODEL,
        });
        const diskIndex = await loadEmbeddingsCache(
          mod,
          providerObj,
          rootDir,
          envelope.embeddingCacheSha256
        );
        enforceAbsorbJobControl(jobId, 'embedding-cache-hydrate');
        if (diskIndex) {
          console.error(
            `[AbsorbEmbeddings] Fast-hydrate (zero-change): loaded embeddings from disk (git ${changes.headCommit.slice(0, 7)} match, provider ${providerName}) — no re-embed.`
          );
          if (
            envelope.embeddingCacheSha256 &&
            (typeof envelope.embeddingCacheBytes !== 'number' ||
              typeof envelope.embeddingCacheMtimeMs !== 'number')
          ) {
            const legacyIdentity = readEmbeddingsCacheIdentity(rootDir);
            if (legacyIdentity?.sha256 === envelope.embeddingCacheSha256) {
              bindGraphCacheToEmbeddings(rootDir, legacyIdentity);
            }
          }
          setGraphRAGState(diskIndex, new GraphRAGEngine(cachedGraph, diskIndex), {
            rootDir,
            timestamp: envelope.timestamp,
          });
        } else {
          if (jobId)
            trackAbsorbProgress(jobId, 'Building missing embeddings from cached graph', 80);
          const rebuiltIndex = await createDynamicEmbeddingIndex(
            mod,
            embeddingProvider,
            embeddingApiKey,
            embeddingModel
          );
          try {
            await withPhaseTimeout(
              rebuiltIndex.buildIndex(
                cachedGraph,
                jobId
                  ? (batchNum: number, totalBatches: number, symbolsProcessed: number) => {
                      const embeddingProgress =
                        80 + Math.floor((batchNum / Math.max(totalBatches, 1)) * 15);
                      trackAbsorbProgress(
                        jobId,
                        `Embedding batch ${batchNum}/${totalBatches} (${symbolsProcessed} symbols)`,
                        embeddingProgress
                      );
                    }
                  : undefined
              ),
              EMBEDDING_BUILD_TIMEOUT_MS,
              'holo_absorb_repo zero-change embedding rebuild',
              () => disposeEmbeddingIndex(rebuiltIndex),
              signal
            );
          } finally {
            await disposeEmbeddingIndex(rebuiltIndex);
          }
          enforceAbsorbJobControl(jobId, 'embedding-cache-commit');
          await assertGraphRootSourcePinsCurrent(incrementalSourcePins, sameRootScanPolicy);
          const publishedGeneration = publishCacheGeneration({
            graph: cachedGraph,
            rootDir,
            rootDirs: envelope.rootDirs ?? [rootDir],
            stats: envelope.stats,
            gitCommitHash: envelope.gitCommitHash,
            fileHashes: envelope.fileHashes,
            embeddingProvider: envelope.embeddingProvider ?? NATIVE_GRAPH_RAG_PROVIDER,
            localCodebaseSnapshotReceipt: envelope.localCodebaseSnapshotReceipt,
            scanPolicy: sameRootScanPolicy,
            embeddingIndex: rebuiltIndex,
          });
          if (!publishedGeneration) {
            throw new Error('Unable to publish rebuilt zero-change semantic generation');
          }
          const embeddingCommitJob = jobId ? absorbJobs.get(jobId) : undefined;
          if (embeddingCommitJob) embeddingCommitJob.cacheCommitted = true;
          setGraphRAGState(rebuiltIndex, new GraphRAGEngine(cachedGraph, rebuiltIndex), {
            rootDir,
            timestamp: envelope.timestamp,
          });
        }
      } catch (err) {
        if (isAbsorbCancellation(err, jobId)) throw err;
        console.warn(`[AbsorbEmbeddings] Zero-change fast-hydrate skipped: ${String(err)}`);
        embeddingLoadError = err;
        resetGraphRAGState();
      }
    }

    if (envelope.gitCommitHash !== changes.headCommit) {
      enforceAbsorbJobControl(jobId, 'graph-cache-commit');
      await assertGraphRootSourcePinsCurrent(incrementalSourcePins, sameRootScanPolicy);
      (cachedGraph as { gitCommitHash?: string }).gitCommitHash = changes.headCommit;
      (cachedGraph as { fileHashes?: Record<string, string> }).fileHashes = envelope.fileHashes;
      cacheTimestamp = Date.now();
      const publishedGeneration = publishCacheGeneration({
        graph: cachedGraph,
        rootDir,
        rootDirs: envelope.rootDirs ?? [rootDir],
        stats: envelope.stats,
        gitCommitHash: changes.headCommit,
        fileHashes: envelope.fileHashes,
        embeddingProvider: envelope.embeddingProvider ?? (await detectBestEmbeddingProvider()),
        localCodebaseSnapshotReceipt: envelope.localCodebaseSnapshotReceipt,
        scanPolicy: sameRootScanPolicy,
        reuseCurrentEmbeddings: true,
      });
      if (!publishedGeneration) {
        throw new Error('Unable to publish zero-change cache metadata generation');
      }
      const graphCommitJob = jobId ? absorbJobs.get(jobId) : undefined;
      if (graphCommitJob) graphCommitJob.cacheCommitted = true;
    }

    // Mark job as complete immediately (fast path)
    if (jobId) {
      const job = absorbJobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.progress = 100;
        job.phase = 'Complete (cached)';
        job.completedAt = Date.now();
        settleAbsorbWriterLeaseIfTerminal(job);
      }
    }

    const semanticIndexReadiness =
      outputFormat === 'stats'
        ? buildStatsOnlySemanticIndexReceipt(rootDir, zeroChangeCoverage)
        : buildSemanticIndexReadinessReceipt(rootDir, {
            priorGraphRagReady: priorGraphRagReadyForHydrate,
            embeddingBuildError: embeddingLoadError,
            embeddingFailureReason: embeddingLoadError ? 'embeddingLoadFailed' : undefined,
            graphCoverage: zeroChangeCoverage,
          });

    return {
      cached: true,
      incremental: false,
      filesChanged: 0,
      rootDir,
      stats: envelope.stats,
      embeddingPolicy: envelope.embeddingPolicy ?? buildGraphRAGEmbeddingPolicyReceipt(),
      scanPolicy: normalizeScanPolicy(envelope.scanPolicy),
      gitCommitHash: changes.headCommit,
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
      ...buildAbsorbAuthorityResultFields(semanticIndexReadiness),
      semanticIndexReadiness,
      embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
      ...(semanticIndexReadiness.embeddingSkipReason && {
        embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
      }),
      message: `No changes since last scan (${changes.headCommit.slice(0, 7)})`,
      jobId,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 5: INCREMENTAL PATCH
  // ═══════════════════════════════════════════════════════════════════════════
  const result = await runIncrementalPatch(
    mod,
    primaryRootDir,
    envelope,
    changes,
    includeBuildArtifacts,
    outputFormat,
    layout,
    interactive,
    jobId,
    embeddingProvider,
    embeddingApiKey,
    embeddingModel,
    scanBatchSize,
    sameRootScanPolicy,
    incrementalSourcePins
  );
  return { ...(result as Record<string, unknown>), jobId };
}

async function handleQuery(args: Record<string, unknown>): Promise<unknown> {
  const graphState = await ensureCachedGraph();
  if (!graphState.loaded) {
    return {
      error: ABSORB_CODEBASE_LOAD_ERROR,
      hint: ABSORB_HOLO_ABSORB_REPO_HINT,
      ...(graphState.graphUnavailableReceipt && {
        graphUnavailableReceipt: graphState.graphUnavailableReceipt,
      }),
      ...(graphState.coverage && { coverage: graphState.coverage }),
    };
  }
  const fromCache = graphState.source === 'disk-cache';
  const cacheNote = fromCache
    ? `[auto-loaded from disk cache, ${
        graphState.ageMs! < 3600000
          ? `${Math.round(graphState.ageMs! / 60000)}m old`
          : `${(graphState.ageMs! / 3600000).toFixed(1)}h old`
      }, rootDir: ${graphState.rootDir}]`
    : undefined;

  const queryType = args.queryType as string | undefined;
  const traceStrategy = args.traceStrategy as 'bfs' | 'tropical-min-plus' | undefined;
  const maxDepth = (args.maxDepth as number | undefined) ?? 10;
  const symbolName = args.symbolName as string | undefined;
  const symbolOwner = args.symbolOwner as string | undefined;
  const filePath = args.filePath as string | undefined;
  const query = args.query as string;

  // Infer query type from natural language if not provided
  const effectiveType = queryType ?? inferQueryType(query);

  switch (effectiveType) {
    case 'callers': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const callers = cachedGraph.getCallersOf(name, symbolOwner);
      return {
        query: `callers of ${symbolOwner ? `${symbolOwner}.` : ''}${name}`,
        results: callers,
        count: callers.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'callees': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const callees = cachedGraph.getCalleesOf(name);
      return {
        query: `callees of ${name}`,
        results: callees,
        count: callees.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'imports': {
      const file = filePath ?? extractFileFromQuery(query);
      const imports = cachedGraph.getImportsOf(file);
      return {
        query: `imports of ${file}`,
        results: imports,
        count: imports.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'imported_by': {
      const file = filePath ?? extractFileFromQuery(query);
      const importedBy = cachedGraph.getImportedBy(file);
      return {
        query: `files that import ${file}`,
        results: importedBy,
        count: importedBy.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'symbols': {
      const file = filePath ?? extractFileFromQuery(query);
      const symbols = cachedGraph.getSymbolsInFile(file);
      return {
        query: `symbols in ${file}`,
        results: symbols,
        count: symbols.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'find': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const {
        matchMode,
        truncated,
        results: found,
      } = cachedGraph.searchSymbolsByName(name, {
        limit: 50,
      });
      return {
        query: `find ${name}`,
        matchMode,
        results: found,
        count: found.length,
        ...(truncated && {
          truncated: true,
          note: 'Result set capped at 50; refine the query for more.',
        }),
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'trace': {
      const parts = query.match(/trace\s+(\S+)\s+(?:to\s+)?(\S+)/i);
      if (parts) {
        const inferredStrategy = query.toLowerCase().includes('tropical')
          ? 'tropical-min-plus'
          : 'bfs';
        const strategy = traceStrategy ?? inferredStrategy;
        const chain = cachedGraph.traceCallChain(parts[1], parts[2], maxDepth, {
          algorithm: strategy,
        });
        return {
          query: `trace ${parts[1]} -> ${parts[2]}`,
          strategy,
          result: chain,
          found: chain !== null,
          ...(cacheNote && { cacheNote }),
        };
      }
      return { error: 'Trace requires format: "trace SymbolA to SymbolB"' };
    }

    case 'communities': {
      const communities: Map<string, string[]> = cachedGraph.detectCommunities();
      // Cap output: only show file counts + top 10 files per community to prevent token overflow
      const MAX_FILES_PER_COMMUNITY = 10;
      return {
        query: 'communities',
        results: Array.from(communities.entries())
          .sort(([, a]: [string, string[]], [, b]: [string, string[]]) => b.length - a.length)
          .slice(0, 50)
          .map(([name, files]: [string, string[]]) => ({
            name,
            files: files.slice(0, MAX_FILES_PER_COMMUNITY),
            fileCount: files.length,
            truncated: files.length > MAX_FILES_PER_COMMUNITY,
          })),
        count: communities.size,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'stats':
      return {
        query: 'stats',
        result: cachedGraph.getStats(),
        ...(cacheNote && { cacheNote }),
      };

    default:
      return {
        error: `Unknown query type: ${effectiveType}. Use: callers, callees, imports, imported_by, symbols, find, trace, communities, stats`,
      };
  }
}

const IMPACT_DEFAULT_MAX_AFFECTED_FILES = 10_000;
const IMPACT_DEFAULT_MAX_DEPTH = 64;
const IMPACT_DEFAULT_DEADLINE_MS = 20_000;
const IMPACT_MAX_CHANGED_FILES = 1_000;

function boundedImpactInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

async function handleImpact(args: Record<string, unknown>): Promise<unknown> {
  const graphState = await ensureCachedGraph();
  if (!graphState.loaded) {
    return {
      error: ABSORB_CODEBASE_LOAD_ERROR,
      hint: ABSORB_HOLO_ABSORB_REPO_HINT,
      ...(graphState.graphUnavailableReceipt && {
        graphUnavailableReceipt: graphState.graphUnavailableReceipt,
      }),
      ...(graphState.coverage && { coverage: graphState.coverage }),
    };
  }
  const cacheNote =
    graphState.source === 'disk-cache'
      ? `auto-loaded from disk cache (${
          graphState.ageMs! < 3600000
            ? `${Math.round(graphState.ageMs! / 60000)}m old`
            : `${(graphState.ageMs! / 3600000).toFixed(1)}h old`
        })`
      : undefined;

  const changedFiles = args.changedFiles as unknown[] | undefined;
  const changedSymbol = args.changedSymbol as string | undefined;
  const symbolOwner = args.symbolOwner as string | undefined;

  if (changedFiles && changedFiles.length > 0) {
    if (changedFiles.length > IMPACT_MAX_CHANGED_FILES) {
      return {
        error: 'changedFiles_limit_exceeded',
        message: `changedFiles accepts at most ${IMPACT_MAX_CHANGED_FILES} paths per request.`,
        maxChangedFiles: IMPACT_MAX_CHANGED_FILES,
        receivedChangedFiles: changedFiles.length,
      };
    }
    if (!changedFiles.every((file): file is string => typeof file === 'string')) {
      return {
        error: 'changedFiles_validation_failed',
        message: 'Every changedFiles item must be a string path.',
      };
    }
    const maxAffectedFiles = boundedImpactInteger(
      args.maxAffectedFiles,
      IMPACT_DEFAULT_MAX_AFFECTED_FILES,
      1,
      20_000
    );
    const maxDepth = boundedImpactInteger(args.maxDepth, IMPACT_DEFAULT_MAX_DEPTH, 0, 256);
    const deadlineMs = boundedImpactInteger(args.deadlineMs, IMPACT_DEFAULT_DEADLINE_MS, 1, 25_000);
    const startedAt = Date.now();
    const impact = cachedGraph.getCommunityAwareImpactTraversal(changedFiles, {
      maxAffectedFiles,
      maxDepth,
      deadlineMs,
    }) as CommunityAwareImpactReceipt;
    const groupedAffectedCount = Array.from(impact.impactByCommunity.values()).reduce(
      (acc, files) => acc + files.length,
      0
    );
    const affectedCount = impact.affectedFiles.size;
    const observedCommunityCount = impact.impactByCommunity.size;
    const affectedCountIsLowerBound = !impact.impactTraversalComplete;
    const durationMs = Date.now() - startedAt;
    const blastRadius = impact.complete
      ? `${affectedCount} files across ${observedCommunityCount} communities affected by changes to ${impact.resolvedChangedFiles.length} files`
      : affectedCountIsLowerBound
        ? `At least ${affectedCount} affected files discovered; ${groupedAffectedCount} grouped across ${observedCommunityCount} observed communities from ${impact.resolvedChangedFiles.length} indexed changed files (bounded partial result)`
        : `${affectedCount} affected files discovered; ${groupedAffectedCount} grouped across ${observedCommunityCount} observed communities (community grouping is a bounded partial result)`;

    return {
      changedFiles,
      resolvedChangedFiles: impact.resolvedChangedFiles,
      unresolvedChangedFiles: impact.unresolvedChangedFiles,
      impactByCommunity: Object.fromEntries(impact.impactByCommunity),
      affectedCount,
      groupedAffectedCount,
      affectedCountIsLowerBound,
      totalAffectedCount: impact.impactTraversalComplete ? affectedCount : null,
      observedCommunityCount,
      complete: impact.complete,
      truncated: impact.truncated,
      truncationReasons: impact.truncationReasons,
      communityGrouping: impact.communityGrouping,
      communityGroupingComplete: impact.communityGroupingComplete,
      ungroupedAffectedFiles: impact.ungroupedAffectedFiles,
      traversal: {
        complete: impact.impactTraversalComplete,
        truncationReasons: impact.impactTraversalTruncationReasons,
        changedFileInputsProcessed: impact.changedFileInputsProcessed,
        changedFileInputsRemaining: impact.changedFileInputsRemaining,
        processedFiles: impact.processedFiles,
        traversedEdges: impact.traversedEdges,
        maxDepthReached: impact.maxDepthReached,
        queuedFilesRemaining: impact.queuedFilesRemaining,
        durationMs: impact.impactTraversalDurationMs,
        budgets: impact.budgets,
      },
      operationDurationMs: impact.durationMs,
      durationMs,
      blastRadius,
      ...(cacheNote && { cacheNote }),
    };
  }

  if (changedSymbol) {
    const affected: Set<string> = cachedGraph.getSymbolImpact(changedSymbol, symbolOwner);
    return {
      changedSymbol: symbolOwner ? `${symbolOwner}.${changedSymbol}` : changedSymbol,
      affectedFiles: Array.from(affected),
      affectedCount: affected.size,
      blastRadius: `${affected.size} files affected by changes to ${changedSymbol}`,
      ...(cacheNote && { cacheNote }),
    };
  }

  return { error: 'Provide either changedFiles or changedSymbol' };
}

async function handleDetectChanges(args: Record<string, unknown>): Promise<unknown> {
  const mod = await loadCodebaseModule();
  const { CodebaseScanner, CodebaseGraph } = mod;

  const previousGraphJson = args.previousGraphJson as string;
  const rootDir = args.rootDir as string;

  // Deserialize previous graph
  const previousGraph = CodebaseGraph.deserialize(previousGraphJson);
  const previousStats = previousGraph.getStats();
  const previousFiles = new Set<string>(previousGraph.getFilePaths());

  // Fresh scan
  const scanner = new CodebaseScanner();
  let scanResult: any;
  try {
    scanResult = await scanner.scan({ rootDir });
  } finally {
    await scanner.dispose?.();
  }
  const currentGraph = new CodebaseGraph();
  currentGraph.buildFromScanResult(scanResult);
  // HoloGraph Phase 2: populate brain-coord positions on the diff graph too
  new mod.BrainCoordNodeMapper().populate(currentGraph);
  const currentStats = currentGraph.getStats();
  const currentFiles = new Set<string>(currentGraph.getFilePaths());

  // Cache for subsequent queries
  cachedGraph = currentGraph;
  cachedRootDir = rootDir;

  // Diff files
  const addedFiles = Array.from(currentFiles).filter((f: string) => !previousFiles.has(f));
  const removedFiles = Array.from(previousFiles).filter((f: string) => !currentFiles.has(f));
  const commonFiles = Array.from(currentFiles).filter((f: string) => previousFiles.has(f));

  // Diff symbols in common files
  const modifiedFiles: string[] = [];
  for (const file of commonFiles) {
    const prevSymbols = previousGraph.getSymbolsInFile(file);
    const currSymbols = currentGraph.getSymbolsInFile(file);
    if (prevSymbols.length !== currSymbols.length) {
      modifiedFiles.push(file);
      continue;
    }
    // Check symbol names changed
    const prevNames = new Set(prevSymbols.map((s: any) => `${s.type}:${s.name}`));
    const currNames = new Set(currSymbols.map((s: any) => `${s.type}:${s.name}`));
    const changed = Array.from(currNames as Set<string>).some((n) => !prevNames.has(n));
    if (changed) modifiedFiles.push(file);
  }

  return {
    previous: previousStats,
    current: currentStats,
    changes: {
      addedFiles,
      removedFiles,
      modifiedFiles,
      addedFileCount: addedFiles.length,
      removedFileCount: removedFiles.length,
      modifiedFileCount: modifiedFiles.length,
    },
    summary: `${addedFiles.length} added, ${removedFiles.length} removed, ${modifiedFiles.length} modified`,
  };
}

async function handleDetectDrift(args: Record<string, unknown>): Promise<unknown> {
  const graphState = await ensureCachedGraph();
  if (!graphState.loaded) {
    return { error: ABSORB_CODEBASE_LOAD_ERROR, hint: ABSORB_HOLO_ABSORB_REPO_HINT };
  }

  const rootDir = args.rootDir as string;
  const mod = await loadCodebaseModule();
  const { GitChangeDetector } = mod;

  const detector = new GitChangeDetector(rootDir);
  const filePaths = cachedGraph.getFilePaths();
  const currentHashes = detector.computeFileHashes(filePaths);
  const hashMap = Object.fromEntries(currentHashes.map((h: any) => [h.filePath, h.hash]));

  const report = cachedGraph.detectDriftReport(hashMap);
  const drifted = report.driftedFiles;
  const staleEdges = report.staleEdges ?? [];

  return {
    rootDir,
    driftedFiles: drifted,
    modifiedFiles: report.modifiedFiles ?? [],
    deletedFiles: report.deletedFiles ?? [],
    driftCount: drifted.length,
    staleEdges,
    staleEdgeCount: staleEdges.length,
    inSync: drifted.length === 0 && staleEdges.length === 0,
    summary:
      drifted.length === 0 && staleEdges.length === 0
        ? 'Knowledge graph is perfectly in sync with filesystem.'
        : `Detected ${drifted.length} drifted files and ${staleEdges.length} stale graph edges. Recommend running holo_absorb_repo.`,
  };
}

// ── Graph Status ─────────────────────────────────────────────────────────────

function graphStatusSnapshotTtlMs(): number {
  const configured = Number(process.env.ABSORB_GRAPH_STATUS_SNAPSHOT_TTL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_GRAPH_STATUS_SNAPSHOT_TTL_MS;
  return Math.max(0, Math.min(MAX_GRAPH_STATUS_SNAPSHOT_TTL_MS, Math.floor(configured)));
}

function graphStatusFileGeneration(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return 'missing';
  }
}

function buildGraphStatusSnapshotKey(currentCwd: string): string {
  const activeCacheRoot = cachedRootDir || currentCwd;
  const activeRootDirs = (cachedGraph as { rootDirs?: string[] } | null)?.rootDirs ?? [
    activeCacheRoot,
  ];
  const activeRootSetSelection = activeRootDirs.length > 1 ? activeRootDirs : undefined;
  const cachePaths = resolveCachePathsForRoots(activeCacheRoot, activeRootSetSelection);
  const selectedGeneration = readCacheGenerationManifest(activeCacheRoot, activeRootSetSelection);
  const refreshGeneration = Array.from(absorbJobs.values())
    .map(
      (job) =>
        `${job.jobId}:${job.status}:${job.progress}:${job.filesProcessed}:${
          job.refreshProgressReceipt?.updatedAt ?? ''
        }`
    )
    .sort()
    .join('|');
  return [
    currentCwd,
    activeCacheRoot,
    cachedGraph === null ? 'cold' : 'loaded',
    cacheTimestamp,
    graphStatusFileGeneration(cachePaths.generationManifestFile),
    graphStatusFileGeneration(selectedGeneration?.graphFile ?? cachePaths.graphFile),
    graphStatusFileGeneration(cachePaths.writerReceiptsDirectory),
    selectedGeneration
      ? selectedGeneration.embeddingsFile
        ? graphStatusFileGeneration(selectedGeneration.embeddingsFile)
        : 'selected-generation-has-no-embeddings'
      : graphStatusFileGeneration(cachePaths.embeddingsFile),
    refreshGeneration,
  ].join('\n');
}

function withGraphStatusSnapshotMetadata(
  value: GraphStatusSnapshot,
  options: {
    cacheHit: boolean;
    coalesced: boolean;
    computedAt: number;
    ttlMs: number;
  }
): GraphStatusSnapshot {
  return {
    ...value,
    statusSnapshot: {
      cacheHit: options.cacheHit,
      coalesced: options.coalesced,
      computedAt: new Date(options.computedAt).toISOString(),
      ageMs: Math.max(0, Date.now() - options.computedAt),
      ttlMs: options.ttlMs,
      forceRefreshAvailable: true,
    },
  };
}

async function handleGraphStatus(args: Record<string, unknown>): Promise<unknown> {
  const currentCwd = resolveWorkspaceRoot();
  const forceRefresh = args.forceRefresh === true;
  const ttlMs = graphStatusSnapshotTtlMs();
  const key = buildGraphStatusSnapshotKey(currentCwd);
  const now = Date.now();

  if (
    !forceRefresh &&
    ttlMs > 0 &&
    graphStatusSnapshotCache?.key === key &&
    now - graphStatusSnapshotCache.computedAt < ttlMs
  ) {
    return withGraphStatusSnapshotMetadata(graphStatusSnapshotCache.value, {
      cacheHit: true,
      coalesced: false,
      computedAt: graphStatusSnapshotCache.computedAt,
      ttlMs,
    });
  }

  if (!forceRefresh && graphStatusSnapshotInFlight?.key === key) {
    const value = await graphStatusSnapshotInFlight.promise;
    const computedAt =
      graphStatusSnapshotCache?.key === key ? graphStatusSnapshotCache.computedAt : Date.now();
    return withGraphStatusSnapshotMetadata(value, {
      cacheHit: true,
      coalesced: true,
      computedAt,
      ttlMs,
    });
  }

  const promise = computeGraphStatus(currentCwd);
  graphStatusSnapshotInFlight = { key, promise };
  try {
    const value = await promise;
    const computedAt = Date.now();
    graphStatusSnapshotCache = { key, computedAt, value };
    return withGraphStatusSnapshotMetadata(value, {
      cacheHit: false,
      coalesced: false,
      computedAt,
      ttlMs,
    });
  } finally {
    if (graphStatusSnapshotInFlight?.promise === promise) {
      graphStatusSnapshotInFlight = null;
    }
  }
}

function readInMemoryGraphFileCount(graph: unknown): number {
  if (!graph || typeof graph !== 'object') return 0;

  try {
    const filePaths = (graph as { getFilePaths?: () => unknown }).getFilePaths?.();
    if (Array.isArray(filePaths)) return filePaths.length;
  } catch {
    // A long-lived host can briefly retain a graph instance from the previous
    // build generation. Status must degrade to metadata instead of becoming an
    // outage while the new generation is loading.
  }

  try {
    const totalFiles = (
      graph as { getStats?: () => { totalFiles?: unknown } | null | undefined }
    ).getStats?.()?.totalFiles;
    const count = Number(totalFiles);
    if (Number.isFinite(count)) return Math.max(0, count);
  } catch {
    // Fall through to serialized cache metadata.
  }

  const fileHashes = (graph as { fileHashes?: unknown }).fileHashes;
  return fileHashes && typeof fileHashes === 'object' ? Object.keys(fileHashes).length : 0;
}

async function computeGraphStatus(currentCwd: string): Promise<GraphStatusSnapshot> {
  const activeCacheRoot = cachedRootDir || currentCwd;
  const activeRootDirs = (cachedGraph as { rootDirs?: string[] } | null)?.rootDirs ?? [
    activeCacheRoot,
  ];
  const activeRootSetSelection = activeRootDirs.length > 1 ? activeRootDirs : undefined;
  const activeCachePaths = resolveCachePathsForRoots(activeCacheRoot, activeRootSetSelection);
  const selectedGeneration = readCacheGenerationManifest(activeCacheRoot, activeRootSetSelection);
  const cache = getCacheAge(activeCacheRoot, activeRootSetSelection);
  const embeddingPolicy = cache.embeddingPolicy ?? buildGraphRAGEmbeddingPolicyReceipt();
  const embeddingsFile = getEmbeddingsFile(activeCacheRoot, activeRootSetSelection);
  const embeddingsCacheExists = fs.existsSync(embeddingsFile);
  const embeddingsCacheModel = readEmbeddingsCacheModel(activeCacheRoot, activeRootSetSelection);
  let embeddingsCacheStat: fs.Stats | null = null;
  if (embeddingsCacheExists) {
    try {
      embeddingsCacheStat = fs.statSync(embeddingsFile);
    } catch {
      // A concurrent atomic generation swap can briefly retire the observed
      // path between exists and stat. Treat it as not yet hydratable.
    }
  }
  const cacheAgeMs = cache.ageMs;
  const diskCacheFreshByAge = cacheAgeMs !== undefined && cacheAgeMs < CACHE_MAX_AGE_MS;
  const inMemoryAgeMs =
    cachedGraph !== null && cacheTimestamp ? Date.now() - cacheTimestamp : undefined;
  const activeAgeMs = inMemoryAgeMs ?? cacheAgeMs;
  const activeFreshByAge =
    activeAgeMs === undefined ? cachedGraph !== null : activeAgeMs < CACHE_MAX_AGE_MS;

  // Scope freshness to the current repo root. A cache that was created for a
  // different directory (e.g. a temp absorb scratch dir) is NOT authoritative
  // for the workspace the agent is actually working in.
  const cacheRootDir = cachedRootDir || cache.rootDir || null;
  const cacheMatchesCwd = rootMatchesCurrentRepo(cacheRootDir, currentCwd);
  const diskCacheMatchesCwd = rootMatchesCurrentRepo(cache.rootDir, currentCwd);
  const workspaceGitCommitHash =
    cacheMatchesCwd || diskCacheMatchesCwd ? await getCurrentGitCommit(currentCwd) : null;
  const activeGitCommitHash =
    ((cachedGraph as { gitCommitHash?: string } | null)?.gitCommitHash ?? cache.gitCommitHash) ||
    null;
  const activeScanPolicy = normalizeScanPolicy(
    (cachedGraph as { scanPolicy?: GraphScanPolicy } | null)?.scanPolicy ?? cache.scanPolicy
  );
  const activeRootSetAuthority =
    activeRootDirs.length > 1
      ? await evaluateGraphRootSetAuthority(
          {
            rootDir: activeCacheRoot,
            rootDirs: activeRootDirs,
            rootSetId: (cachedGraph as { rootSetId?: string } | null)?.rootSetId ?? cache.rootSetId,
            rootAuthorityPins:
              (cachedGraph as { rootAuthorityPins?: GraphRootAuthorityPin[] } | null)
                ?.rootAuthorityPins ?? cache.rootAuthorityPins,
            scanPolicy: activeScanPolicy,
          },
          activeRootDirs
        )
      : null;
  const currentWorktreeFingerprint =
    cacheMatchesCwd || diskCacheMatchesCwd
      ? buildGitWorktreeFingerprint(currentCwd, activeScanPolicy)
      : null;
  const activeWorktreeFingerprint =
    (cachedGraph as { worktreeFingerprint?: string } | null)?.worktreeFingerprint ??
    cache.worktreeFingerprint;
  const diskGraphFileCount =
    cache.fileHashCount ??
    Number((cache.stats as { totalFiles?: unknown } | undefined)?.totalFiles ?? 0);
  const inMemoryGraphFileCount =
    cachedGraph !== null ? readInMemoryGraphFileCount(cachedGraph) : undefined;
  const activeGraphFileCount = inMemoryGraphFileCount ?? diskGraphFileCount;
  const activeAndDiskShareCoverage =
    (cachedGraph === null || cacheProvenance === 'disk-cache') &&
    rootMatchesCurrentRepo(cacheRootDir, cache.rootDir ?? currentCwd) &&
    activeGraphFileCount === diskGraphFileCount;
  const activeFileHashes =
    ((cachedGraph as { fileHashes?: Record<string, string> } | null)?.fileHashes ??
      cache.fileHashes) ||
    undefined;
  const activeCoverage = buildGraphCoverageStatusForRoots(
    (cachedGraph as { rootDirs?: string[] } | null)?.rootDirs ??
      cache.rootDirs ??
      [cacheMatchesCwd || diskCacheMatchesCwd ? currentCwd : cacheRootDir].filter(
        (entry): entry is string => Boolean(entry)
      ),
    activeGraphFileCount,
    cache.scanPolicy,
    activeFileHashes ? Object.keys(activeFileHashes) : undefined
  );
  const diskCoverage = activeAndDiskShareCoverage
    ? activeCoverage
    : buildGraphCoverageStatusForRoots(
        cache.rootDirs ??
          [diskCacheMatchesCwd ? currentCwd : cache.rootDir].filter((entry): entry is string =>
            Boolean(entry)
          ),
        diskGraphFileCount,
        cache.scanPolicy,
        cache.fileHashes ? Object.keys(cache.fileHashes) : undefined
      );
  const activeCoverageComplete = graphCoverageIsComplete(activeCoverage);
  const diskCoverageComplete = graphCoverageIsComplete(diskCoverage);
  const activeHeadMatchesWorkspace = cacheGitMatchesHead(
    activeGitCommitHash,
    workspaceGitCommitHash
  );
  const diskHeadMatchesWorkspace = cacheGitMatchesHead(cache.gitCommitHash, workspaceGitCommitHash);
  const activeWorktreeFingerprintMatches =
    activeHeadMatchesWorkspace &&
    Boolean(activeWorktreeFingerprint) &&
    currentWorktreeFingerprint === activeWorktreeFingerprint;
  const diskWorktreeFingerprintMatches =
    diskHeadMatchesWorkspace &&
    Boolean(cache.worktreeFingerprint) &&
    currentWorktreeFingerprint === cache.worktreeFingerprint;
  const activeSameRootFileHashFreshness =
    cacheMatchesCwd && activeFreshByAge && activeCoverageComplete
      ? activeWorktreeFingerprintMatches
        ? buildWorktreeFingerprintFreshnessStatus(activeFileHashes)
        : buildGraphFileHashFreshnessStatus(cacheRootDir, activeFileHashes)
      : buildSkippedFileHashFreshnessStatus('not_checked', activeFileHashes);
  const activeAndDiskShareFileSnapshot =
    activeAndDiskShareCoverage &&
    activeGitCommitHash === (cache.gitCommitHash ?? null) &&
    cacheMatchesCwd === diskCacheMatchesCwd;
  const diskSameRootFileHashFreshness =
    diskCacheMatchesCwd && diskCacheFreshByAge && diskCoverageComplete
      ? activeAndDiskShareFileSnapshot
        ? activeSameRootFileHashFreshness
        : diskWorktreeFingerprintMatches
          ? buildWorktreeFingerprintFreshnessStatus(cache.fileHashes)
          : buildGraphFileHashFreshnessStatus(cache.rootDir, cache.fileHashes)
      : buildSkippedFileHashFreshnessStatus('not_checked', cache.fileHashes);
  const activeSameRootFileHashFreshForHeadMismatch =
    cacheMatchesCwd &&
    fileHashesBridgeHeadMismatch({
      cacheGitCommitHash: activeGitCommitHash,
      currentGitCommitHash: workspaceGitCommitHash,
      fileHashFreshness: activeSameRootFileHashFreshness,
    });
  const diskSameRootFileHashFreshForHeadMismatch =
    diskCacheMatchesCwd &&
    fileHashesBridgeHeadMismatch({
      cacheGitCommitHash: cache.gitCommitHash,
      currentGitCommitHash: workspaceGitCommitHash,
      fileHashFreshness: diskSameRootFileHashFreshness,
    });
  const localCodebaseSnapshot = buildLocalCodebaseSnapshotAuthority({
    receipt: cache.localCodebaseSnapshotReceipt,
    rootDir: cacheRootDir,
    graphFileCount: activeGraphFileCount,
    freshByAge: activeFreshByAge,
  });
  const diskLocalCodebaseSnapshot = buildLocalCodebaseSnapshotAuthority({
    receipt: cache.localCodebaseSnapshotReceipt,
    rootDir: cache.rootDir,
    graphFileCount: diskGraphFileCount,
    freshByAge: diskCacheFreshByAge,
  });
  const graphRAGState = getGraphRAGStateStatus();
  const graphRAGMatchesCwd = rootMatchesCurrentRepo(graphRAGState.rootDir, currentCwd);
  const graphRAGFreshByAge =
    graphRAGState.ageMs === null ? graphRAGState.ready : graphRAGState.ageMs < CACHE_MAX_AGE_MS;
  const localGraphCoverageComplete =
    cachedGraph === null && !cache.exists ? true : activeCoverageComplete;

  // Cross-root authority (see cacheDescribesRealCurrentRepo): a cache is
  // authoritative for its own repo even when rootDir !== the workspace root,
  // given a real matching HEAD and complete coverage. Lets a fixed-cwd sovereign
  // MCP be authoritative for every repo it has absorbed, not just its launch dir.
  const activeCrossRootAuthority = cacheMatchesCwd
    ? {
        ok: false,
        currentGitCommitHash: null as string | null,
        gitMatchesHead: false,
        fileHashFreshForHeadMismatch: false,
        fileHashFreshness: buildSkippedFileHashFreshnessStatus('not_checked', activeFileHashes),
      }
    : await cacheDescribesRealCurrentRepo({
        rootDir: cacheRootDir,
        cacheGitCommitHash: activeGitCommitHash,
        fileHashes: activeFileHashes,
        freshByAge: activeFreshByAge,
        coverage: activeCoverage,
      });
  const diskCrossRootAuthority = diskCacheMatchesCwd
    ? {
        ok: false,
        currentGitCommitHash: null as string | null,
        gitMatchesHead: false,
        fileHashFreshForHeadMismatch: false,
        fileHashFreshness: buildSkippedFileHashFreshnessStatus('not_checked', cache.fileHashes),
      }
    : await cacheDescribesRealCurrentRepo({
        rootDir: cache.rootDir,
        cacheGitCommitHash: cache.gitCommitHash,
        fileHashes: cache.fileHashes,
        freshByAge: diskCacheFreshByAge,
        coverage: diskCoverage,
      });
  const noGraphCachePresent = cachedGraph === null && !cache.exists && !cacheRootDir;
  const currentGitCommitHash = cacheMatchesCwd
    ? workspaceGitCommitHash
    : activeCrossRootAuthority.currentGitCommitHash;
  const diskCurrentGitCommitHash = diskCacheMatchesCwd
    ? workspaceGitCommitHash
    : diskCrossRootAuthority.currentGitCommitHash;
  const activeGitMatchesHead = noGraphCachePresent
    ? true
    : cacheMatchesCwd
      ? activeHeadMatchesWorkspace
      : activeCrossRootAuthority.gitMatchesHead;
  const diskCacheGitMatchesHead = diskCacheMatchesCwd
    ? diskHeadMatchesWorkspace
    : diskCrossRootAuthority.gitMatchesHead;
  const activeFileHashFreshness = cacheMatchesCwd
    ? activeSameRootFileHashFreshness
    : activeCrossRootAuthority.fileHashFreshness;
  const diskFileHashFreshness = diskCacheMatchesCwd
    ? diskSameRootFileHashFreshness
    : diskCrossRootAuthority.fileHashFreshness;
  const activeFileHashFreshForHeadMismatch = cacheMatchesCwd
    ? activeSameRootFileHashFreshForHeadMismatch
    : activeCrossRootAuthority.fileHashFreshForHeadMismatch;
  const diskFileHashFreshForHeadMismatch = diskCacheMatchesCwd
    ? diskSameRootFileHashFreshForHeadMismatch
    : diskCrossRootAuthority.fileHashFreshForHeadMismatch;
  const activeAuthorityCaveats = [
    ...buildCoverageAuthorityCaveats(activeCoverage),
    ...buildHeadFreshnessAuthorityCaveats({
      gitMatchesHead: activeGitMatchesHead,
      fileHashFreshForHeadMismatch: activeFileHashFreshForHeadMismatch,
    }),
    ...(activeRootSetAuthority?.changedRoots.map(
      (rootDir) => `Root-set member changed since scan: ${rootDir}`
    ) ?? []),
    ...(activeRootSetAuthority?.incompleteRoots.map(
      (rootDir) => `Root-set member lacks complete authority coverage: ${rootDir}`
    ) ?? []),
  ];
  const diskAuthorityCaveats = [
    ...buildCoverageAuthorityCaveats(diskCoverage),
    ...buildHeadFreshnessAuthorityCaveats({
      gitMatchesHead: diskCacheGitMatchesHead,
      fileHashFreshForHeadMismatch: diskFileHashFreshForHeadMismatch,
    }),
    ...(activeRootSetAuthority?.changedRoots.map(
      (rootDir) => `Root-set member changed since scan: ${rootDir}`
    ) ?? []),
    ...(activeRootSetAuthority?.incompleteRoots.map(
      (rootDir) => `Root-set member lacks complete authority coverage: ${rootDir}`
    ) ?? []),
  ];
  const localGraphLive =
    graphRAGState.ready &&
    graphRAGMatchesCwd &&
    graphRAGFreshByAge &&
    (activeRootSetAuthority?.authoritative ?? true) &&
    (noGraphCachePresent ||
      (activeFileHashFreshness.fresh &&
        (activeGitMatchesHead || activeFileHashFreshForHeadMismatch))) &&
    localGraphCoverageComplete;

  const graphAuthoritative = activeRootSetAuthority
    ? (cachedGraph !== null || cache.exists) &&
      activeFreshByAge &&
      activeCoverageComplete &&
      activeRootSetAuthority.authoritative
    : (cacheMatchesCwd &&
        (cachedGraph !== null || cache.exists) &&
        activeFreshByAge &&
        activeFileHashFreshness.fresh &&
        (activeGitMatchesHead || activeFileHashFreshForHeadMismatch) &&
        activeCoverageComplete) ||
      activeCrossRootAuthority.ok ||
      localGraphLive;

  const freshForCurrentRepo = graphAuthoritative;
  const diskCacheFreshForCurrentRepo = activeRootSetAuthority
    ? cache.exists &&
      diskCacheFreshByAge &&
      diskCoverageComplete &&
      activeRootSetAuthority.authoritative
    : (diskCacheMatchesCwd &&
        diskCacheFreshByAge &&
        diskFileHashFreshness.fresh &&
        (diskCacheGitMatchesHead || diskFileHashFreshForHeadMismatch) &&
        diskCoverageComplete) ||
      diskCrossRootAuthority.ok;
  const diskEmbeddingProviderMatchesPolicy =
    embeddingsCacheExists &&
    (embeddingsCacheModel === null || embeddingsCacheModel === embeddingPolicy.provider);
  const hasStatBoundEmbeddingGeneration =
    typeof cache.embeddingCacheBytes === 'number' &&
    typeof cache.embeddingCacheMtimeMs === 'number';
  const selectedGenerationManifestMatchesGraph =
    selectedGeneration !== null &&
    selectedGeneration.embeddingsFile === embeddingsFile &&
    typeof cache.embeddingCacheSha256 === 'string' &&
    selectedGeneration.manifest.embeddingCacheSha256 === cache.embeddingCacheSha256 &&
    embeddingsCacheStat?.size === cache.embeddingCacheBytes;
  const legacyEmbeddingIdentity =
    cache.embeddingCacheSha256 && !hasStatBoundEmbeddingGeneration
      ? readEmbeddingsCacheIdentity(activeCacheRoot, activeRootSetSelection)
      : null;
  const diskEmbeddingGenerationMatchesGraph =
    cache.embeddingCacheSha256 === undefined
      ? true
      : typeof cache.embeddingCacheSha256 === 'string' &&
        (hasStatBoundEmbeddingGeneration
          ? embeddingsCacheStat?.size === cache.embeddingCacheBytes &&
            (embeddingsCacheStat?.mtimeMs === cache.embeddingCacheMtimeMs ||
              selectedGenerationManifestMatchesGraph)
          : legacyEmbeddingIdentity?.sha256 === cache.embeddingCacheSha256);
  const diskSemanticIndexHydratable =
    embeddingsCacheExists &&
    diskCacheFreshForCurrentRepo &&
    diskEmbeddingProviderMatchesPolicy &&
    diskEmbeddingGenerationMatchesGraph;
  const semanticIndexReady = localGraphLive || diskSemanticIndexHydratable;

  const requestedPath = cacheRootDir || graphRAGState.rootDir;
  const graphUnavailableReceipt = graphAuthoritative
    ? undefined
    : buildGraphUnavailableReceipt({
        reason:
          (!cacheMatchesCwd && (cache.exists || cachedGraph !== null)) ||
          (!graphRAGMatchesCwd && graphRAGState.ready)
            ? 'cache_root_mismatch'
            : (cache.exists || cachedGraph !== null || graphRAGState.ready) && !activeFreshByAge
              ? 'cache_stale'
              : (cache.exists || cachedGraph !== null) && !activeCoverageComplete
                ? 'cache_incomplete'
                : (cache.exists || cachedGraph !== null || graphRAGState.ready) &&
                    (!activeFileHashFreshness.fresh ||
                      (!activeGitMatchesHead && !activeFileHashFreshForHeadMismatch))
                  ? 'cache_stale'
                  : cache.exists || cachedGraph !== null || graphRAGState.ready
                    ? 'cache_stale'
                    : 'cache_missing',
        requestedPath,
        runtimePath: requestedPath ? path.resolve(requestedPath) : null,
        cacheAgeMs: activeAgeMs ?? graphRAGState.ageMs ?? undefined,
      });
  const latestRefreshJob = Array.from(absorbJobs.values())
    .filter(
      (job) =>
        job.refreshProgressReceipt &&
        rootMatchesCurrentRepo(job.refreshProgressReceipt.rootDir, currentCwd)
    )
    .sort((left, right) => right.startedAt - left.startedAt)[0];
  const latestCacheWarmJob = Array.from(absorbJobs.values())
    .filter(
      (job) =>
        job.jobId.startsWith('absorb-warm-') && rootMatchesCurrentRepo(job.rootDir, activeCacheRoot)
    )
    .sort((left, right) => right.startedAt - left.startedAt)[0];
  const latestCacheWarmReceipt = latestCacheWarmJob
    ? null
    : findLatestAbsorbWriterReceiptForRoots(
        activeCacheRoot,
        activeRootSetSelection,
        'absorb-warm-'
      );

  return {
    inMemory: cachedGraph !== null,
    rootDir: cachedRootDir || null,
    rootDirs: cache.rootDirs ?? activeRootDirs,
    rootSetId: (cachedGraph as { rootSetId?: string } | null)?.rootSetId ?? cache.rootSetId ?? null,
    rootSetAuthority: activeRootSetAuthority,
    cacheStorage: {
      layout: activeCachePaths.layout,
      workspaceId: activeCachePaths.workspaceId,
      directory: activeCachePaths.directory,
      graphFile: selectedGeneration?.graphFile ?? activeCachePaths.graphFile,
      embeddingsFile: selectedGeneration
        ? selectedGeneration.embeddingsFile
        : activeCachePaths.embeddingsFile,
      generationManifestFile: activeCachePaths.generationManifestFile,
      generationId: selectedGeneration?.manifest.generationId ?? null,
      generationSelectedAt: selectedGeneration?.manifest.publishedAt ?? null,
    },
    ...(latestRefreshJob?.refreshProgressReceipt && {
      refreshInProgress: !['complete', 'error', 'cancelled'].includes(latestRefreshJob.status),
      refreshJobId: latestRefreshJob.jobId,
      refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(
        latestRefreshJob.refreshProgressReceipt
      ),
    }),
    cacheWarm: latestCacheWarmJob
      ? {
          inProgress: !['complete', 'error', 'cancelled'].includes(latestCacheWarmJob.status),
          jobId: latestCacheWarmJob.jobId,
          status: latestCacheWarmJob.status,
          progress: latestCacheWarmJob.progress,
          phase: latestCacheWarmJob.phase,
          startedAt: new Date(latestCacheWarmJob.startedAt).toISOString(),
          ...(latestCacheWarmJob.completedAt && {
            completedAt: new Date(latestCacheWarmJob.completedAt).toISOString(),
          }),
          cacheCommitted: latestCacheWarmJob.cacheCommitted,
          memoryBudget: { ...latestCacheWarmJob.memoryBudget },
          ...(latestCacheWarmJob.cancellation && {
            cancellation: { ...latestCacheWarmJob.cancellation },
          }),
          ...(latestCacheWarmJob.error && { error: latestCacheWarmJob.error }),
        }
      : latestCacheWarmReceipt
        ? {
            inProgress: false,
            jobId: latestCacheWarmReceipt.receipt.jobId,
            status: latestCacheWarmReceipt.receipt.status,
            progress: latestCacheWarmReceipt.receipt.progress ?? 100,
            phase: latestCacheWarmReceipt.receipt.phase,
            startedAt: latestCacheWarmReceipt.receipt.startedAt,
            completedAt: latestCacheWarmReceipt.receipt.completedAt,
            cacheCommitted: latestCacheWarmReceipt.receipt.cacheCommitted,
            recoveredFromReceipt: true,
            durableTerminalStatus: true,
            durableReceiptFile: latestCacheWarmReceipt.receiptFile,
            ...(latestCacheWarmReceipt.receipt.memoryBudget && {
              memoryBudget: { ...latestCacheWarmReceipt.receipt.memoryBudget },
            }),
            ...(latestCacheWarmReceipt.receipt.cancellation && {
              cancellation: { ...latestCacheWarmReceipt.receipt.cancellation },
            }),
            ...(latestCacheWarmReceipt.receipt.error && {
              error: latestCacheWarmReceipt.receipt.error,
            }),
          }
        : {
            inProgress: false,
            jobId: null,
            status: 'idle',
          },
    embeddingPolicy,
    graphRAGReady: semanticIndexReady,
    semanticIndexReady,
    semanticIndex: {
      ready: semanticIndexReady,
      rootDir: graphRAGState.rootDir ?? (diskSemanticIndexHydratable ? cache.rootDir : null),
      ageMs: graphRAGState.ageMs ?? (diskSemanticIndexHydratable ? cacheAgeMs : null),
      ageHuman:
        graphRAGState.ageMs === null
          ? diskSemanticIndexHydratable
            ? formatCacheAge(cacheAgeMs)
            : null
          : formatCacheAge(graphRAGState.ageMs),
      freshForCurrentRepo: semanticIndexReady,
      cachedEmbeddingIndexReady: graphRAGState.ready,
      cachedEmbeddingIndexMatchesCwd: graphRAGMatchesCwd,
      diskEmbeddingCacheExists: embeddingsCacheExists,
      diskEmbeddingCacheModel: embeddingsCacheModel,
      diskEmbeddingProviderMatchesPolicy,
      diskEmbeddingGenerationMatchesGraph,
      graphEmbeddingGeneration: cache.embeddingCacheSha256 ?? null,
      diskEmbeddingGenerationStat: embeddingsCacheStat
        ? {
            bytes: embeddingsCacheStat.size,
            mtimeMs: embeddingsCacheStat.mtimeMs,
            verification: selectedGenerationManifestMatchesGraph
              ? 'immutable-generation-manifest'
              : hasStatBoundEmbeddingGeneration
                ? 'graph-bound-stat'
                : 'legacy-digest-fallback',
          }
        : null,
      diskHydratable: diskSemanticIndexHydratable,
      provider: embeddingPolicy.provider,
      graphProvider: 'holograph',
      hint: localGraphLive
        ? 'HoloEmbed semantic index is ready for this repo.'
        : diskSemanticIndexHydratable
          ? 'HoloEmbed disk index is fresh for this repo; semantic tools will lazy-hydrate it on first use.'
          : graphAuthoritative
            ? 'HoloGraph cache is available, but the HoloEmbed semantic index is not initialized for this repo. Run holo_absorb_repo with outputFormat "graph" or "holo", or wait for cache warmup, before relying on holo_semantic_search or holo_ask_codebase.'
            : 'Run holo_absorb_repo with outputFormat "graph" or "holo" to build a HoloGraph cache and HoloEmbed semantic index for this repo.',
    },
    graphAuthoritative,
    freshForCurrentRepo,
    authorityCaveats: activeAuthorityCaveats,
    fileHashFreshness: activeFileHashFreshness,
    fileHashFreshForHeadMismatch: activeFileHashFreshForHeadMismatch,
    currentCwd,
    scanPolicy: normalizeScanPolicy(cache.scanPolicy),
    coverage: activeCoverage,
    localGraph: {
      ready: graphRAGState.ready,
      rootDir: graphRAGState.rootDir,
      ageMs: graphRAGState.ageMs,
      ageHuman: graphRAGState.ageMs === null ? null : formatCacheAge(graphRAGState.ageMs),
      fresh: localGraphLive,
      stale: graphRAGState.ready && !localGraphLive,
      authoritative: localGraphLive,
      freshForCurrentRepo: localGraphLive,
    },
    ...(graphUnavailableReceipt && { graphUnavailableReceipt }),
    sessionProvenance: cacheProvenance ?? null,
    localCodebaseSnapshotReceipt: cache.localCodebaseSnapshotReceipt ?? null,
    localCodebaseSnapshot,
    diskCache: cache.exists
      ? {
          exists: true,
          ageMs: cacheAgeMs,
          ageHuman: formatCacheAge(cacheAgeMs),
          fresh: diskCacheFreshForCurrentRepo,
          stale: !diskCacheFreshForCurrentRepo,
          freshByAge: diskCacheFreshByAge,
          staleByAge: !diskCacheFreshByAge,
          authoritative: diskCacheFreshForCurrentRepo,
          freshForCurrentRepo: diskCacheFreshForCurrentRepo,
          rootDir: cache.rootDir,
          gitCommitHash: cache.gitCommitHash ?? null,
          currentGitCommitHash: diskCurrentGitCommitHash,
          gitCommitMatchesHead: diskCacheGitMatchesHead,
          fileHashFreshness: diskFileHashFreshness,
          fileHashFreshForHeadMismatch: diskFileHashFreshForHeadMismatch,
          authorityCaveats: diskAuthorityCaveats,
          coverage: diskCoverage,
          stats: cache.stats,
          scanPolicy: normalizeScanPolicy(cache.scanPolicy),
          embeddingProvider: cache.embeddingProvider ?? embeddingPolicy.provider,
          embeddingPolicy,
          localCodebaseSnapshotReceipt: cache.localCodebaseSnapshotReceipt ?? null,
          localCodebaseSnapshot: diskLocalCodebaseSnapshot,
          hint: !diskCacheMatchesCwd
            ? diskCrossRootAuthority.ok
              ? diskCrossRootAuthority.fileHashFreshForHeadMismatch
                ? `Cache rootDir (${cache.rootDir}) differs from the workspace root (${currentCwd}); its HEAD changed, but cached file hashes still match that repo with complete coverage and remain authoritative for ${cache.rootDir}. Queries answer about ${cache.rootDir}.`
                : `Cache rootDir (${cache.rootDir}) differs from the workspace root (${currentCwd}) but matches that repo's live HEAD with complete coverage and remains authoritative for ${cache.rootDir}. Queries answer about ${cache.rootDir}.`
              : `Cache rootDir (${cache.rootDir}) does not match current working directory (${currentCwd}). Call holo_absorb_repo for this workspace.`
            : !diskCoverageComplete
              ? `Cache covers ${diskCoverage.graphFileCount}/${diskCoverage.expectedGraphFileCount ?? 'unknown'} expected files for this checkout. Refresh with holo_absorb_repo before trusting whole-repo queries.`
              : !diskCacheGitMatchesHead && !diskFileHashFreshForHeadMismatch
                ? `Cache was built at git ${shortGitHash(cache.gitCommitHash)} but current HEAD is ${shortGitHash(currentGitCommitHash)}. Call holo_absorb_repo with force:true to refresh.`
                : !diskFileHashFreshness.fresh
                  ? `Cache file hashes no longer match the live worktree (${diskFileHashFreshness.modifiedFileCount} modified, ${diskFileHashFreshness.deletedFileCount} deleted). Call holo_absorb_repo to refresh before trusting structural or semantic queries.`
                  : !diskCacheGitMatchesHead && diskFileHashFreshForHeadMismatch
                    ? `Cache was built at git ${shortGitHash(cache.gitCommitHash)} but all cached file hashes still match current HEAD ${shortGitHash(currentGitCommitHash)}. Structural tools may use it with the head-mismatch caveat.`
                    : diskCacheFreshByAge
                      ? diskSemanticIndexHydratable
                        ? 'HoloGraph cache and HoloEmbed disk index are fresh; structural and semantic tools can auto-load without re-scanning.'
                        : 'HoloGraph cache is fresh; structural query tools can auto-load it without re-scanning. Semantic tools still require a ready HoloEmbed index.'
                      : 'Cache is older than 24h — call holo_absorb_repo to refresh.',
        }
      : {
          exists: false,
          hint: 'No disk cache found. Call holo_absorb_repo to create one.',
        },
  };
}

// ── Absorb Status ────────────────────────────────────────────────────────────

async function handleCancelAbsorb(args: Record<string, unknown>): Promise<unknown> {
  const jobId = typeof args.jobId === 'string' ? args.jobId : '';
  if (!jobId) return { error: 'jobId_required', message: 'jobId must be a non-empty string.' };
  const job = absorbJobs.get(jobId);
  if (!job) {
    const recovered = findAbsorbWriterReceipt(jobId);
    if (recovered) {
      return {
        accepted: false,
        ...buildRecoveredAbsorbStatus(recovered, false),
        message: `Absorb job is already terminal (${recovered.receipt.status}); status recovered from its durable writer receipt.`,
      };
    }
    return { error: 'Job not found', jobId };
  }

  if (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled') {
    return {
      accepted: false,
      jobId,
      status: job.status,
      message: `Absorb job is already terminal (${job.status}).`,
      ...(job.status === 'cancelled' && job.result ? { cancellationReceipt: job.result } : {}),
    };
  }

  if (!job.abortController.signal.aborted) {
    const operatorReason =
      typeof args.reason === 'string' && args.reason.trim() ? `: ${args.reason.trim()}` : '';
    requestAbsorbCancellation(job, 'cancel_requested', `Cancellation requested${operatorReason}`);
  }

  return {
    accepted: true,
    jobId,
    status: job.status,
    reason: job.cancellation?.reason,
    phaseAtRequest: job.cancellation?.phaseAtRequest,
    requestedAt: job.cancellation
      ? new Date(job.cancellation.requestedAt).toISOString()
      : undefined,
    ...(job.refreshProgressReceipt && {
      resumeToken: job.refreshProgressReceipt.resumeToken,
      refreshProgressReceipt: compactAbsorbRefreshProgressReceipt(job.refreshProgressReceipt),
    }),
    pollTool: 'holo_get_absorb_status',
  };
}

async function handleGetAbsorbStatus(args: Record<string, unknown>): Promise<unknown> {
  const jobId = args.jobId as string;
  const job = absorbJobs.get(jobId);

  if (!job) {
    const external = externalAbsorbJobLeases.get(jobId);
    if (external) {
      try {
        if (fs.existsSync(external.receiptFile)) {
          const receipt = JSON.parse(fs.readFileSync(external.receiptFile, 'utf-8')) as Record<
            string,
            unknown
          >;
          return {
            ...receipt,
            externalWriter: true,
            resultAvailable: false,
          };
        }
        if (fs.existsSync(external.leaseFile)) {
          const active = parseAbsorbWriterLease(fs.readFileSync(external.leaseFile, 'utf-8'));
          if (active?.jobId === jobId) {
            return {
              jobId,
              status: 'scanning',
              progress: null,
              phase: 'External writer lease active',
              externalWriter: true,
              rootDir: active.rootDirs[0] ?? null,
              writerLease: {
                ownerPid: active.ownerPid,
                ownerHost: active.ownerHost,
                acquiredAt: active.acquiredAt,
                updatedAt: active.updatedAt,
              },
              embeddingPolicy: buildGraphRAGEmbeddingPolicyReceipt(),
            };
          }
        }
        const selectedGenerationId =
          readCacheGenerationManifest(external.record.rootDirs[0], external.record.rootDirs)
            ?.manifest.generationId ?? null;
        if (selectedGenerationId && selectedGenerationId !== external.record.priorGenerationId) {
          return {
            jobId,
            status: 'complete',
            progress: 100,
            phase: 'External writer published a new cache generation',
            externalWriter: true,
            cacheCommitted: true,
            selectedGenerationId,
          };
        }
        return {
          jobId,
          status: 'error',
          progress: 100,
          phase: 'External writer lease ended without a new selected generation',
          externalWriter: true,
          cacheCommitted: false,
          retryable: true,
        };
      } catch (error) {
        return {
          error: 'external_absorb_status_unavailable',
          message: errorMessage(error),
          jobId,
          retryable: true,
        };
      }
    }
    const recovered = findAbsorbWriterReceipt(jobId);
    if (recovered) {
      return buildRecoveredAbsorbStatus(recovered, args.includeResult === true);
    }
    return { error: 'Job not found', jobId };
  }
  if (job.status !== 'complete' && job.status !== 'error' && job.status !== 'cancelled') {
    refreshIsolatedAbsorbProgressFromDisk(job);
    updateAbsorbMemoryBudget(job, job.phase);
  }

  const isolatedWorkerMemory =
    job.backgroundIsolation === 'worker-thread' ? (job.workerMemory ?? null) : undefined;
  const response: Record<string, unknown> = {
    jobId,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    embeddingPolicy: buildGraphRAGEmbeddingPolicyReceipt(),
    filesProcessed: job.filesProcessed,
    totalFiles: job.totalFiles,
    durationMs: (job.completedAt ?? Date.now()) - job.startedAt,
    ...(job.backgroundIsolation && {
      backgroundIsolation: job.backgroundIsolation,
      requestEventLoopIsolated: job.backgroundIsolation === 'worker-thread',
    }),
    memory:
      job.backgroundIsolation === 'worker-thread'
        ? isolatedWorkerMemory
        : readAbsorbMemorySnapshot(),
    memoryAvailable:
      job.backgroundIsolation === 'worker-thread' ? isolatedWorkerMemory !== null : true,
    memoryScope: job.backgroundIsolation === 'worker-thread' ? 'isolated-worker' : 'request-host',
    ...(job.backgroundIsolation === 'worker-thread' && {
      rssScope: 'shared-worker-thread-process',
      heapScope: 'isolated-worker-isolate',
    }),
    memoryBudget: { ...job.memoryBudget },
    sourceDriftRetry: { ...job.sourceDriftRetry },
    phaseMetrics: job.phaseMetrics,
  };

  if (job.cancellation) {
    response.cancellation = {
      reason: job.cancellation.reason,
      message: job.cancellation.message,
      phaseAtRequest: job.cancellation.phaseAtRequest,
      requestedAt: new Date(job.cancellation.requestedAt).toISOString(),
      ...(job.cancellation.completedAt && {
        completedAt: new Date(job.cancellation.completedAt).toISOString(),
      }),
    };
  }

  if (job.scanPlan) {
    response.scanPlan =
      args.includePlan === true ? job.scanPlan : compactAbsorbScanPlan(job.scanPlan);
  }

  if (job.refreshProgressReceipt) {
    response.resumeToken = job.refreshProgressReceipt.resumeToken;
    response.refreshProgressReceipt = compactAbsorbRefreshProgressReceipt(
      job.refreshProgressReceipt,
      args.includeReceiptDetails === true
    );
  }

  if (job.error) {
    response.error = job.error;
  }

  if (
    job.result &&
    (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled')
  ) {
    Object.assign(response, buildAbsorbResultEnvelope(job.result, args.includeResult === true));
  }

  return response;
}

// ── Query Helpers ────────────────────────────────────────────────────────────

function inferQueryType(query: string): string {
  const q = query.toLowerCase();
  // Callees first so "callee"/"what does X call" wins before the looser caller check.
  if (
    q.includes('callee') ||
    (q.includes('call') && (q.includes('does') || q.includes('what does')))
  )
    return 'callees';
  if (
    q.includes('caller') ||
    q.includes('who calls') ||
    q.includes('what calls') ||
    q.includes('called by')
  )
    return 'callers';
  if (q.includes('import') && q.includes('by')) return 'imported_by';
  if (q.includes('import')) return 'imports';
  if (q.includes('symbol') || q.includes('in file')) return 'symbols';
  if (q.includes('trace') || q.includes('path')) return 'trace';
  if (q.includes('communit') || q.includes('module')) return 'communities';
  if (q.includes('stat')) return 'stats';
  if (q.includes('find') || q.includes('where') || q.includes('search')) return 'find';
  return 'find'; // default: search by name
}

function extractSymbolFromQuery(query: string): string {
  // Try to extract a symbol name: last capitalized word or quoted string
  const quoted = query.match(/"([^"]+)"/);
  if (quoted) return quoted[1];

  const words = query.split(/\s+/);
  // Return the last word that looks like a symbol
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (/^[A-Z]/.test(w) || w.includes('.') || w.includes('_')) {
      return w;
    }
  }
  return words[words.length - 1];
}

function extractFileFromQuery(query: string): string {
  // Try to extract a file path
  const quoted = query.match(/"([^"]+)"/);
  if (quoted) return quoted[1];

  const pathMatch = query.match(/(\S+\.\w{1,6})/);
  if (pathMatch) return pathMatch[1];

  return query.split(/\s+/).pop() ?? '';
}

/**
 * Handle federated symbol resolution via MCP Orchestrator.
 */
async function handleResolveSymbol(args: Record<string, unknown>): Promise<unknown> {
  // Accept `symbolName` (schema) or `symbol` (common shorthand).
  const symbolName = (args.symbolName as string) ?? (args.symbol as string);
  const limit = (args.limit as number) ?? 5;

  if (!symbolName) {
    return { error: 'Provide a symbol name via "symbolName".' };
  }

  // 1. LOCAL FIRST: resolve against the loaded graph. This works offline and is
  //    exact-by-construction — federated lookup is augmentation, not the only path.
  //    Previously this handler was federated-only, so a transient orchestrator
  //    outage ("fetch failed") returned zero results despite a fully loaded graph.
  const localResults: Array<Record<string, unknown>> = [];
  try {
    const graphState = await ensureCachedGraph();
    if (graphState.loaded && cachedGraph) {
      const { matchMode, results } = cachedGraph.searchSymbolsByName(symbolName, { limit });
      for (const sym of results) {
        localResults.push({
          repo: graphState.rootDir ?? 'local',
          filePath: sym.filePath,
          type: sym.type,
          name: sym.name,
          line: sym.line,
          signature: sym.signature,
          matchMode,
          source: 'local-graph',
        });
      }
    }
  } catch {
    // Local resolution best-effort; fall through to federated.
  }

  // 2. FEDERATED: augment with cross-repo matches from the orchestrator (best-effort).
  const orchestratorUrl =
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app';
  const federatedResults: Array<Record<string, unknown>> = [];
  let federatedError: string | undefined;
  try {
    const authHeaders = await resolveMeshAuthHeaders();
    if (!hasMeshAuthHeaders(authHeaders)) {
      throw new Error('HoloKey MCP auth unavailable');
    }
    const response = await fetchWithTimeout(
      `${orchestratorUrl}/knowledge/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ search: symbolName, type: 'pattern', limit }),
      },
      MESH_SYNC_TIMEOUT_MS,
      'federated symbol lookup'
    );
    if (!response.ok) throw new Error(`Orchestrator error: ${response.status}`);
    const data = (await response.json()) as { results: any[] };
    for (const r of data.results || []) {
      federatedResults.push({
        repo: r.workspace_id,
        filePath: r.metadata?.filePath,
        type: r.metadata?.symbolType,
        content: r.content,
        relevance: r.relevance,
        source: 'federated',
      });
    }
  } catch (err) {
    federatedError = `${err}`;
  }

  const results = [...localResults, ...federatedResults];

  // Only surface an error when BOTH paths produced nothing.
  if (results.length === 0) {
    return {
      symbolName,
      results: [],
      ...(federatedError && { federatedError }),
      hint: 'No local match; ensure the graph is absorbed (holo_graph_status) or the symbol name is correct.',
    };
  }

  return {
    symbolName,
    results,
    counts: { local: localResults.length, federated: federatedResults.length },
    ...(federatedError && { federatedError }),
  };
}

/**
 * Sync codebase symbols with the MCP Orchestrator for federated discovery.
 */
export async function syncWithMesh(
  graph: any,
  rootDir: string,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    if (signal.reason instanceof Error) throw signal.reason;
    throw new Error('Mesh sync cancelled');
  }
  const orchestratorUrl =
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app';
  const workspaceId = rootDir.split(/[/\\]/).pop() || 'unknown';

  const symbols = graph.getAllSymbols().filter((s: any) => s.visibility === 'public');
  const entries = symbols.slice(0, 1000).map((s: any) => {
    const sourceKey = `${workspaceId}:${s.filePath ?? ''}:${s.line ?? ''}:${s.type ?? ''}:${s.name}`;
    const sourceHash = createHash('sha256').update(sourceKey).digest('hex').slice(0, 16);
    const signature = s.signature || '(no signature recorded)';
    const docComment = s.docComment || 'No doc comment recorded.';

    return {
      id: `symbol-${workspaceId}-${sourceHash}`,
      workspace_id: workspaceId,
      type: 'pattern',
      content: [
        `HoloScript code symbol ${s.name} is exported from ${s.filePath}.`,
        `Symbol kind: ${s.type}. Language: ${s.language || 'unknown'}. Signature: ${signature}.`,
        'This entry preserves codebase-intelligence symbol discovery in the mesh knowledge store.',
        'The orchestrator stores code symbols as pattern knowledge entries; filter metadata.entryClass=symbol for symbol-specific use.',
        `Documentation: ${docComment}`,
      ].join('\n'),
      metadata: {
        entryClass: 'symbol',
        symbolName: s.name,
        symbolType: s.type,
        filePath: s.filePath,
        line: s.line,
        language: s.language,
        repo: workspaceId,
      },
    };
  });

  if (entries.length === 0) return;

  try {
    const authHeaders = await resolveMeshAuthHeaders();
    if (!hasMeshAuthHeaders(authHeaders)) {
      console.warn('[MeshSync] HoloKey MCP auth unavailable; skipping orchestrator sync');
      return;
    }
    const response = await fetchWithTimeout(
      `${orchestratorUrl}/knowledge/sync`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          entries,
        }),
      },
      MESH_SYNC_TIMEOUT_MS,
      'mesh knowledge sync',
      signal
    );

    if (response.ok) {
    } else {
      console.warn(`[MeshSync] Orchestrator sync failed: ${response.status}`);
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn(`[MeshSync] Could not reach orchestrator: ${err}`);
  }
}

// =============================================================================
// LOCAL CODEBASE SNAPSHOT RECEIPT VALIDATION (P2 task_1779267196745_l3d4)
// =============================================================================

export interface LocalCodebaseSnapshotReceipt {
  schema: typeof LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA;
  version: string;
  emittedAt: string;
  agent?: string;
  surface?: string;
  roots: string[];
  rootHashes: Array<{ root: string; hash: string }>;
  sourceFiles: Array<{ path: string; content?: string; size: number; hash: string; mtime: string }>;
  stats: { totalFiles: number; totalBytes: number; skippedCount: number };
  skipped?: Array<{ path: string; reason: string }>;
  redactionPolicy?: string;
  replayCommand: string;
  privacyClass?: string;
  freshness: { generatedAt: string; note?: string };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Reusable validator for receipts produced by local HoloShell codebase adapters.
 * Enforces caps, relative paths, hashes, redaction, freshness, and replay command.
 */
export function validateLocalCodebaseSnapshotReceipt(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['Receipt must be an object'] };
  }
  const r = input as Partial<LocalCodebaseSnapshotReceipt>;

  if (r.schema !== LOCAL_CODEBASE_SNAPSHOT_RECEIPT_SCHEMA) {
    errors.push(`bad schema: ${r.schema}`);
  }
  if (!r.version) errors.push('version required');
  if (!r.emittedAt) errors.push('emittedAt required');
  if (!Array.isArray(r.roots) || r.roots.length === 0) errors.push('roots must be non-empty');
  if (!Array.isArray(r.sourceFiles)) errors.push('sourceFiles must be array');

  let byteSum = 0;
  if (Array.isArray(r.sourceFiles)) {
    for (const f of r.sourceFiles) {
      if (!f?.path || typeof f.path !== 'string' || !isSafeRelativeSourcePath(f.path)) {
        errors.push(`bad path: ${f?.path}`);
      }
      if (typeof f?.hash !== 'string' || f.hash.length !== 64) {
        errors.push(`bad hash for ${f?.path}`);
      }
      if (f?.size) byteSum += Number(f.size);
      if (typeof f?.content === 'string') {
        const actualHash = sha256Utf8(f.content);
        if (typeof f.hash === 'string' && f.hash.length === 64 && actualHash !== f.hash) {
          errors.push(`content hash mismatch for ${f.path}`);
        }
        const actualSize = Buffer.byteLength(f.content, 'utf-8');
        if (Number.isFinite(f.size) && actualSize !== f.size) {
          errors.push(`content size mismatch for ${f.path}`);
        }
      }
    }
  }
  if ((r.stats?.totalFiles ?? 0) > SOURCE_FILES_MAX_FILES) errors.push('file cap exceeded');
  if (byteSum > SOURCE_FILES_MAX_TOTAL_BYTES) errors.push('byte cap exceeded');

  if (!r.replayCommand || !r.replayCommand.includes('holo_absorb_repo')) {
    errors.push('replayCommand must reference holo_absorb_repo');
  }
  if (!r.freshness?.generatedAt) errors.push('freshness.generatedAt required');

  return { valid: errors.length === 0, errors };
}

export function validateHoloShellLocalCodebaseSnapshotReceipt(input: unknown): string[] {
  const receipt = asRecord(input);
  if (!receipt) return ['HoloShellLocalCodebaseSnapshotReceipt must be an object.'];

  const errors: string[] = [];
  if (!receipt.id) errors.push('HoloShellLocalCodebaseSnapshotReceipt.id is required.');
  if (!receipt.workflow) errors.push('HoloShellLocalCodebaseSnapshotReceipt.workflow is required.');
  if (!Array.isArray(receipt.files)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.files must be an array.');
  }
  if (!Array.isArray(receipt.sourceFiles)) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.sourceFiles must be an array.');
  }
  const totalFiles = getNumber(receipt.totalFiles);
  const totalBytes = getNumber(receipt.totalBytes);
  const maxFiles = getNumber(receipt.maxFiles);
  const maxBytes = getNumber(receipt.maxBytes);
  if (totalFiles !== undefined && maxFiles !== undefined && totalFiles > maxFiles) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalFiles must not exceed maxFiles.');
  }
  if (totalBytes !== undefined && maxBytes !== undefined && totalBytes > maxBytes) {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.totalBytes must not exceed maxBytes.');
  }
  if (receipt.hashAlgorithm !== 'sha256') {
    errors.push('HoloShellLocalCodebaseSnapshotReceipt.hashAlgorithm must be sha256.');
  }

  if (Array.isArray(receipt.sourceFiles)) {
    for (const sourceFile of receipt.sourceFiles) {
      const record = asRecord(sourceFile);
      if (!record || typeof record.path !== 'string' || !isSafeRelativeSourcePath(record.path)) {
        errors.push(
          `LocalCodebaseSourceFilePayload.path must be relative and safe: ${String(record?.path)}.`
        );
      }
      const hash = record?.contentHash ?? record?.hash;
      if (typeof hash !== 'string' || hash.length === 0) {
        errors.push(
          `LocalCodebaseSourceFilePayload ${String(record?.path ?? '<unknown>')}.contentHash is required.`
        );
      }
    }
  }

  return errors;
}
