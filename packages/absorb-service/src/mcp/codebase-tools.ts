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
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthHeadersAsync } from '@holoscript/config';
import {
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
import { resolveCodebaseCachePaths } from './codebase-cache-storage';
import {
  AbsorbRefreshCheckpoint,
  prepareAbsorbRefreshCheckpoint,
  type AbsorbRefreshProgressReceipt,
} from './absorb-refresh-checkpoint';
import type { EmbeddingProviderName } from '../engine/providers/EmbeddingProvider';
import type { CommunityAwareImpactReceipt } from '../engine/CodebaseGraph';
import type { ScanPlan } from '../engine/CodebaseScanner';
import type { ScanResult } from '../engine/types';

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
}

interface AbsorbMemoryBudgetTelemetry extends AbsorbMemoryBudgetLimits {
  peakRssMb: number;
  peakHeapUsedMb: number;
  exceeded: boolean;
  exceededResource?: 'rss' | 'heap' | 'rss_and_heap';
  exceededAtPhase?: string;
  headroomExhausted: boolean;
  headroomResource?: 'rss' | 'heap' | 'rss_and_heap';
  headroomExhaustedAtPhase?: string;
  effectiveMaxRssBeforeCacheCommitMb?: number;
  effectiveMaxHeapUsedBeforeCacheCommitMb?: number;
}

type AbsorbCancellationReason =
  | 'cancel_requested'
  | 'memory_budget_exceeded'
  | 'cache_commit_headroom_exhausted';

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

function readPositiveEnvMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function readPositiveEnvInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
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
    readonly actualCommit: string | null
  ) {
    super(
      `Repository HEAD changed during absorb refresh: expected ${expectedCommit}, received ${
        actualCommit ?? 'no git commit'
      }`
    );
    this.name = 'AbsorbRefreshCommitPinError';
  }
}

class AbsorbRefreshWorktreePinError extends Error {
  constructor(
    readonly expectedFingerprint: string,
    readonly actualFingerprint: string | null
  ) {
    super(
      `Repository worktree changed during absorb refresh: expected ${expectedFingerprint}, received ${
        actualFingerprint ?? 'unavailable'
      }`
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
}

const absorbJobs = new Map<string, AbsorbJob>();

function createAbsorbMemoryBudget(limits: AbsorbMemoryBudgetLimits): AbsorbMemoryBudgetTelemetry {
  const current = readAbsorbMemorySnapshot();
  const headroom = limits.cacheCommitHeadroomMb ?? 0;
  return {
    ...limits,
    peakRssMb: current.rssMb,
    peakHeapUsedMb: current.heapUsedMb,
    exceeded: false,
    headroomExhausted: false,
    ...(limits.maxRssMb !== undefined && {
      effectiveMaxRssBeforeCacheCommitMb: Math.max(0, limits.maxRssMb - headroom),
    }),
    ...(limits.maxHeapUsedMb !== undefined && {
      effectiveMaxHeapUsedBeforeCacheCommitMb: Math.max(0, limits.maxHeapUsedMb - headroom),
    }),
  };
}

function updateAbsorbMemoryBudget(job: AbsorbJob, phase: string): void {
  const current = readAbsorbMemorySnapshot();
  job.memoryBudget.peakRssMb = Math.max(job.memoryBudget.peakRssMb, current.rssMb);
  job.memoryBudget.peakHeapUsedMb = Math.max(job.memoryBudget.peakHeapUsedMb, current.heapUsedMb);

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
  if (!rssExceeded && !heapExceeded && !rssHeadroomExhausted && !heapHeadroomExhausted) {
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
  if (!job.abortController.signal.aborted) {
    const hardLimitExceeded = rssExceeded || heapExceeded;
    const resource = hardLimitExceeded
      ? job.memoryBudget.exceededResource
      : job.memoryBudget.headroomResource;
    requestAbsorbCancellation(
      job,
      hardLimitExceeded ? 'memory_budget_exceeded' : 'cache_commit_headroom_exhausted',
      hardLimitExceeded
        ? `Absorb ${resource} memory budget exceeded during ${phase}`
        : `Absorb ${resource} cache-commit headroom exhausted during ${phase}; preserving the prior authoritative cache`
    );
  }
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
      refreshProgressReceipt: job.refreshProgressReceipt,
      resumeToken: job.refreshProgressReceipt.resumeToken,
    }),
    memoryBudget: { ...job.memoryBudget },
  };
  job.result = receipt;
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
}

/**
 * Create a new absorb job and register it.
 */
function createAbsorbJob(rootDir: string, memoryBudget: AbsorbMemoryBudgetLimits = {}): string {
  const jobId = `absorb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  absorbJobs.set(jobId, {
    jobId,
    rootDir,
    status: 'queued',
    progress: 0,
    phase: 'Initializing',
    filesProcessed: 0,
    totalFiles: 0,
    startedAt: Date.now(),
    phaseMetrics: [],
    abortController: new AbortController(),
    memoryBudget: createAbsorbMemoryBudget(memoryBudget),
    cacheCommitted: false,
  });

  // Auto-cleanup after 1 hour. Do not keep one-shot MCP verifier processes alive.
  const cleanupTimer = setTimeout(
    () => {
      absorbJobs.delete(jobId);
    },
    60 * 60 * 1000
  );
  unrefTimer(cleanupTimer);

  return jobId;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function startBackgroundAbsorbJob(jobId: string, work: () => Promise<unknown>): void {
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
      })
      .catch((err: unknown) => {
        if (isAbsorbCancellation(err, jobId)) {
          settleCancelledAbsorbJob(jobId, err);
          return;
        }
        const message = errorMessage(err);
        failAbsorbJob(jobId, 'Failed', message, {
          error: 'absorb_failed',
          message,
          jobId,
        });
      });
  }, 0);
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

interface GraphCacheEnvelope {
  version: 1 | 2;
  rootDir: string;
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

function getCacheFile(rootDir?: string | null): string {
  return resolveCodebaseCachePaths(resolveCacheWorkspaceRoot(rootDir)).graphFile;
}

function getEmbeddingsFile(rootDir?: string | null): string {
  return resolveCodebaseCachePaths(resolveCacheWorkspaceRoot(rootDir)).embeddingsFile;
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

function countGitAbsorbableFiles(
  rootDir: string,
  scanPolicy: GraphScanPolicy | null | undefined,
  includeUntracked: boolean
): number | null {
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
    return output
      .split('\0')
      .filter((line) => line.length > 0)
      .filter((line) => !isCoverageExcludedPath(line, policy))
      .filter((line) => {
        try {
          return fs.statSync(path.join(rootDir, line)).size <= policy.maxFileSize;
        } catch {
          return false;
        }
      }).length;
  } catch {
    return null;
  }
}

function buildGraphCoverageStatus(
  rootDir: string | null | undefined,
  graphFileCount: number,
  scanPolicy?: GraphScanPolicy | null
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

  const trackedCandidateCount = countGitAbsorbableFiles(rootDir, policy.receipt, false);
  if (trackedCandidateCount === null) {
    return {
      available: false,
      source: 'unavailable',
      graphFileCount: safeGraphFileCount,
      defaultMaxFiles: policy.maxFiles,
      error: 'git ls-files unavailable',
    };
  }

  const workspaceCandidateCount = policy.includeUntracked
    ? countGitAbsorbableFiles(rootDir, policy.receipt, true)
    : trackedCandidateCount;
  if (workspaceCandidateCount === null) {
    return {
      available: false,
      source: 'unavailable',
      graphFileCount: safeGraphFileCount,
      trackedCandidateCount,
      defaultMaxFiles: policy.maxFiles,
      error: 'git ls-files --others --exclude-standard unavailable',
    };
  }

  const selectedCandidateCount = policy.includeUntracked
    ? workspaceCandidateCount
    : trackedCandidateCount;
  const expectedGraphFileCount = Math.min(selectedCandidateCount, policy.maxFiles);
  const complete = safeGraphFileCount >= expectedGraphFileCount;
  const extraGraphFiles = Math.max(0, safeGraphFileCount - expectedGraphFileCount);
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
    cappedByMaxFiles: selectedCandidateCount > policy.maxFiles,
    overInclusive: extraGraphFiles > 0,
    extraGraphFiles,
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

// Scan reuse can be complete for an explicitly capped subset even though that
// subset must not claim whole-repository authority. Keep execution reuse and
// authority as separate predicates to avoid rebuilding the same capped plan on
// every call while still failing closed for global queries.
function graphCoverageMatchesScanPolicy(coverage: GraphCoverageStatus): boolean {
  return !coverage.available || (coverage.complete !== false && coverage.overInclusive !== true);
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

function buildStatsOnlySemanticIndexReceipt(rootDir: string): SemanticIndexReadinessReceipt {
  return {
    schemaVersion: SEMANTIC_INDEX_READINESS_RECEIPT_SCHEMA,
    kind: 'SemanticIndexReadinessReceipt',
    rootDir,
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
  }
): SemanticIndexReadinessReceipt {
  const graphRagReady = options.graphRagReadyOverride ?? isGraphRAGReady();
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
    semanticIndexReady: graphRagReady,
    graphRagReady,
    embeddingIndexReady: graphRagReady,
    embeddingSkipped: false,
    priorGraphRagReady: options.priorGraphRagReady,
    provider: NATIVE_GRAPH_RAG_PROVIDER,
    graphProvider: 'holograph',
    message: graphRagReady
      ? 'HoloGraph cache and HoloEmbed semantic index are ready for this absorb result.'
      : 'HoloGraph cache was updated, but no HoloEmbed semantic index is ready for this absorb result.',
    nextStep: graphRagReady
      ? 'Use holo_semantic_search or holo_ask_codebase with the current GraphRAG index.'
      : 'Run holo_absorb_repo with outputFormat "graph" or "holo" and verify semanticIndexReady before relying on semantic tools.',
    createdAt: new Date().toISOString(),
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

  try {
    fs.writeFileSync(tempPath, data, options);
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore temp cleanup failures; preserve the original write error.
    }
    throw err;
  }
}

function writeUtf8ChunksSync(fileDescriptor: number, value: string): void {
  const chunkCharacters = 1024 * 1024;
  for (let offset = 0; offset < value.length; offset += chunkCharacters) {
    const buffer = Buffer.from(value.slice(offset, offset + chunkCharacters), 'utf-8');
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
function atomicWriteGraphCacheEnvelopeSync(targetPath: string, envelope: GraphCacheEnvelope): void {
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
    const { graphJson, ...metadata } = envelope;
    const metadataJson = JSON.stringify(metadata);
    fileDescriptor = fs.openSync(tempPath, 'wx');
    writeUtf8ChunksSync(fileDescriptor, metadataJson.slice(0, -1));
    writeUtf8ChunksSync(fileDescriptor, ',"graphJson":"');
    const chunkCharacters = 1024 * 1024;
    for (let offset = 0; offset < graphJson.length; offset += chunkCharacters) {
      const escaped = JSON.stringify(graphJson.slice(offset, offset + chunkCharacters)).slice(
        1,
        -1
      );
      writeUtf8ChunksSync(fileDescriptor, escaped);
    }
    writeUtf8ChunksSync(fileDescriptor, '"}');
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(tempPath, targetPath);
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
  serializedGraph?: string
): boolean {
  const totalFiles = Number((stats as { totalFiles?: unknown })?.totalFiles ?? 0);
  if (!Number.isFinite(totalFiles) || totalFiles <= 0) {
    return false;
  }
  try {
    const normalizedScanPolicy = normalizeScanPolicy(scanPolicy);
    const coverageAtScan = buildGraphCoverageStatus(
      rootDir,
      fileHashes ? Object.keys(fileHashes).length : totalFiles,
      normalizedScanPolicy
    );
    const worktreeFingerprint = buildGitWorktreeFingerprint(rootDir, normalizedScanPolicy);
    graph.gitCommitHash = gitCommitHash;
    graph.fileHashes = fileHashes;
    graph.scanPolicy = normalizedScanPolicy;
    graph.worktreeFingerprint = worktreeFingerprint ?? undefined;
    graph.coverageAtScan = coverageAtScan;
    graph.localCodebaseSnapshotReceipt = localCodebaseSnapshotReceipt;
    const envelope: GraphCacheEnvelope = {
      version: 2,
      rootDir,
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
    };
    const cacheFile = getCacheFile(rootDir);
    atomicWriteGraphCacheEnvelopeSync(cacheFile, envelope);
    return true;
  } catch (err) {
    // Best-effort — don't break absorb if persistence fails
    console.warn(
      `[CacheDebug][codebase] save miss path=${getCacheFile(rootDir)} error=${(err as Error)?.message ?? String(err)}`
    );
    return false;
  }
}

function saveEmbeddingsCache(index: any, rootDir: string): void {
  try {
    if (typeof index.serializeBinary === 'function') {
      const buffer = index.serializeBinary();
      atomicWriteFileSync(getEmbeddingsFile(rootDir), buffer);
    }
  } catch (err) {
    console.warn(
      `[CacheDebug][codebase] save embeddings miss path=${getEmbeddingsFile(rootDir)} error=${(err as Error)?.message}`
    );
  }
}

function readEmbeddingsCacheModel(rootDir?: string | null): string | null {
  const embeddingsFile = getEmbeddingsFile(rootDir);
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
  rootDir?: string | null
): Promise<any | null> {
  try {
    const embeddingsFile = getEmbeddingsFile(rootDir);
    if (!fs.existsSync(embeddingsFile)) return null;
    const buffer = fs.readFileSync(embeddingsFile);
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
    console.warn(`[CacheDebug][codebase] load embeddings miss path=${getEmbeddingsFile(rootDir)}`);
    return null;
  }
}

interface GraphCacheReadResult {
  envelope: GraphCacheEnvelope;
  cacheFile: string;
}

function readGraphCache(
  rootDir?: string | null,
  options: { allowExpiredV1?: boolean } = {}
): GraphCacheReadResult | null {
  const workspaceRoot = resolveCacheWorkspaceRoot(rootDir);
  const paths = resolveCodebaseCachePaths(workspaceRoot);
  const candidates =
    paths.layout === 'flat' ? [paths.graphFile] : [paths.graphFile, paths.legacyGraphFile];

  for (const cacheFile of candidates) {
    if (!fs.existsSync(cacheFile)) continue;
    try {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const envelope: GraphCacheEnvelope = JSON.parse(raw);
      if (envelope.version !== 1 && envelope.version !== 2) continue;

      // A namespaced reader may use the old flat cache only when it belongs to
      // this exact workspace. This makes upgrades non-destructive without
      // reviving the cross-repository eviction bug.
      if (paths.layout !== 'flat' && !rootMatchesCurrentRepo(envelope.rootDir, workspaceRoot)) {
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

function loadGraphCache(rootDir?: string | null): GraphCacheEnvelope | null {
  return readGraphCache(rootDir)?.envelope ?? null;
}

function attachGraphCacheMetadata(graph: any, envelope: GraphCacheEnvelope): void {
  graph.gitCommitHash = envelope.gitCommitHash;
  graph.fileHashes = envelope.fileHashes;
  graph.scanPolicy = normalizeScanPolicy(envelope.scanPolicy);
  graph.worktreeFingerprint = envelope.worktreeFingerprint;
  graph.coverageAtScan = envelope.coverageAtScan;
  graph.localCodebaseSnapshotReceipt = envelope.localCodebaseSnapshotReceipt;
}

function getCacheAge(rootDir?: string | null): {
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
} {
  try {
    const cacheRead = readGraphCache(rootDir, { allowExpiredV1: true });
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
            'Output format: "holo" for .holo source, "graph" for serialized knowledge graph JSON, "stats" for scan statistics only. Defaults to "holo".',
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
            'Resume a previously interrupted forced scan from the exact durable progress receipt. The token is bound to repository root, git HEAD, scan policy, batch plan, and selected file set; mismatches are rejected without changing the authoritative graph.',
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
      'Check the status of the codebase knowledge graph: whether it is loaded in memory, whether a disk cache exists, cache age, and scan statistics. Use this before running queries to confirm the graph is ready.',
    inputSchema: {
      type: 'object',
      properties: {},
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
// Guards the background GraphRAG embedding warm so concurrent cold loads don't
// kick off duplicate builds (the build is fired-and-forgotten in ensureCachedGraph).
let graphRAGWarmInProgress = false;

export function resetCodebaseToolStateForTests(skipDiskAutoload = true): void {
  cachedGraph = null;
  cachedRootDir = '';
  cacheAutoLoaded = skipDiskAutoload;
  cacheProvenance = null;
  cacheTimestamp = 0;
  for (const job of absorbJobs.values()) {
    if (
      !job.abortController.signal.aborted &&
      job.status !== 'complete' &&
      job.status !== 'error' &&
      job.status !== 'cancelled'
    ) {
      requestAbsorbCancellation(job, 'cancel_requested', 'Test state reset');
    }
  }
  absorbJobs.clear();
  resetGraphRAGStateForTests();
}

async function hydrateGraphRAGFromDiskEmbeddings(
  mod: CodebaseModule,
  graph: unknown,
  rootDir: string,
  timestamp?: number
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

  const cachedIndex = await loadEmbeddingsCache(mod, providerObj, rootDir);
  if (!cachedIndex) return false;

  setGraphRAGState(cachedIndex, new GraphRAGEngine(graph, cachedIndex), {
    rootDir,
    timestamp,
  });
  return true;
}

/**
 * Ensure graph is loaded. Returns { loaded: boolean; source: string; ageMs?: number }.
 * Order of preference:
 *   1. Already in memory (cachedGraph set)
 *   2. Disk cache (if younger than 24 h)
 *   3. Nothing available → returns loaded=false
 */
async function ensureCachedGraph(): Promise<{
  loaded: boolean;
  source: 'memory' | 'disk-cache' | 'none';
  ageMs?: number;
  rootDir?: string;
  stale?: boolean;
  coverage?: GraphCoverageStatus;
  graphUnavailableReceipt?: GraphUnavailableReceipt;
}> {
  if (cachedGraph) {
    const memoryRootDir = cachedRootDir || resolveWorkspaceRoot();
    const memoryGraph = cachedGraph as {
      gitCommitHash?: string;
      fileHashes?: Record<string, string>;
      scanPolicy?: GraphScanPolicy;
      worktreeFingerprint?: string;
      coverageAtScan?: GraphCoverageStatus;
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
    let coverage = memoryGraph.coverageAtScan;
    const localCodebaseSnapshot = buildLocalCodebaseSnapshotAuthority({
      receipt: memoryGraph.localCodebaseSnapshotReceipt,
      rootDir: memoryRootDir,
      graphFileCount: memoryFileHashes ? Object.keys(memoryFileHashes).length : 0,
      freshByAge,
    });
    let authoritative = localCodebaseSnapshot?.authoritative === true && freshByAge;

    // Warm path: HEAD and the persisted dirty-worktree fingerprint match, so
    // no graph JSON reload, full-repo hash pass, or repeated coverage walk is
    // needed. The fingerprint hashes bytes for every Git-visible dirty path.
    if (
      !authoritative &&
      freshByAge &&
      memoryGitCommitHash &&
      currentGitCommitHash === memoryGitCommitHash &&
      memoryGraph.worktreeFingerprint &&
      currentWorktreeFingerprint === memoryGraph.worktreeFingerprint &&
      coverage &&
      graphCoverageIsComplete(coverage)
    ) {
      authoritative = true;
    }

    // Legacy cache or changed HEAD/worktree: pay the comprehensive check once.
    if (!authoritative && freshByAge) {
      coverage = buildGraphCoverageStatus(
        memoryRootDir,
        memoryFileHashes ? Object.keys(memoryFileHashes).length : 0,
        memoryScanPolicy
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

    if (!isGraphRAGReady()) {
      try {
        const mod = await loadCodebaseModule();
        await hydrateGraphRAGFromDiskEmbeddings(mod, cachedGraph, cachedRootDir, cacheTimestamp);
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
      const coverage = buildGraphCoverageStatus(
        cacheMatchesCwd ? currentCwd : envelope.rootDir,
        getEnvelopeGraphFileCount(envelope),
        envelope.scanPolicy
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
      try {
        const hydrated = await hydrateGraphRAGFromDiskEmbeddings(
          mod,
          cachedGraph,
          cachedRootDir,
          cacheTimestamp
        );
        if (hydrated) {
          // GraphRAG is ready from the persisted HoloEmbed index.
        } else if (!graphRAGWarmInProgress) {
          graphRAGWarmInProgress = true;
          const graphForWarm = cachedGraph;
          const rootForWarm = cachedRootDir;
          // Fire-and-forget — do not block graph availability on the build.
          void (async () => {
            const idx = await createDynamicEmbeddingIndex(mod);
            try {
              await withPhaseTimeout(
                idx.buildIndex(graphForWarm),
                CACHE_WARM_GRAPH_RAG_TIMEOUT_MS,
                'disk-cache GraphRAG embedding rebuild (background)',
                () => disposeEmbeddingIndex(idx)
              );
              saveEmbeddingsCache(idx, rootForWarm);
              setGraphRAGState(idx, new GraphRAGEngine(graphForWarm, idx), {
                rootDir: rootForWarm,
              });
            } catch (err) {
              console.warn(`[AbsorbCacheWarm] background GraphRAG build failed: ${String(err)}`);
            } finally {
              await disposeEmbeddingIndex(idx);
              graphRAGWarmInProgress = false;
            }
          })();
        }
      } catch (err) {
        console.warn(`[AbsorbCacheWarm] GraphRAG warmup skipped: ${String(err)}`);
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

import * as EngineMod from '../engine/index';

/**
 * Return the engine module shape consumed by the MCP codebase tools.
 * Keeping this wrapper centralizes the dependency while TypeScript verifies
 * that the engine barrel still exports the expected scanner/graph APIs.
 */
async function loadCodebaseModule(): Promise<CodebaseModule> {
  return EngineMod;
}

function shouldAutoLoadGraph(name: string, args: Record<string, unknown>): boolean {
  if (
    name === 'holo_graph_status' ||
    name === 'holo_get_absorb_status' ||
    name === 'holo_cancel_absorb'
  )
    return false;
  if (name === 'holo_absorb_repo' && args.force === true) return false;
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
    // Pre-warm: load from disk if available (errors intentionally swallowed)
    await ensureCachedGraph().catch(() => {});
  }

  switch (name) {
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
      return handleGraphStatus();
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
  targetWorktreeFingerprint?: string | null
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
  const priorEnvelopeForHydrate = loadGraphCache(primaryRootDir);
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
    const cache = getCacheAge(primaryRootDir);
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

  const enforceRefreshSourcePin = (): void => {
    let error: AbsorbRefreshCommitPinError | AbsorbRefreshWorktreePinError | undefined;
    if (targetGitCommitHash) {
      const detector = new GitChangeDetector(primaryRootDir);
      const currentCommit =
        typeof detector.isGitRepo !== 'function' || detector.isGitRepo()
          ? (detector.getHeadCommit?.() ?? null)
          : null;
      if (currentCommit !== targetGitCommitHash) {
        error = new AbsorbRefreshCommitPinError(targetGitCommitHash, currentCommit);
      }
    }
    if (!error && targetWorktreeFingerprint) {
      const currentFingerprint = buildGitWorktreeFingerprint(primaryRootDir, effectiveScanPolicy);
      if (currentFingerprint !== targetWorktreeFingerprint) {
        error = new AbsorbRefreshWorktreePinError(targetWorktreeFingerprint, currentFingerprint);
      }
    }
    if (!error) return;
    refreshCheckpoint?.markInvalidated(error);
    setAbsorbJobRefreshProgress(jobId, refreshCheckpoint?.progressReceipt());
    throw error;
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
    enforceRefreshSourcePin();
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
      scanPlanReceipt = summarizeModuleScanPlan(scanPlan);
      setAbsorbJobScanPlan(jobId, scanPlanReceipt);
      refreshCheckpoint?.markScanning();
      setAbsorbJobRefreshProgress(jobId, refreshCheckpoint?.progressReceipt());
      scanResult = await scanner.scanInBatches({
        ...scanOptions,
        scanBatchSize,
        scanPlan,
        signal,
        loadBatchResult: refreshCheckpoint
          ? (batch: PlannedScannerBatch) => refreshCheckpoint.loadBatchResult(batch)
          : undefined,
        onBatchResume: refreshCheckpoint
          ? (batch: PlannedScannerBatch, _result: ScanResult, totalBatches: number) => {
              setAbsorbJobRefreshProgress(jobId, refreshCheckpoint.progressReceipt());
              if (jobId) {
                trackAbsorbProgress(
                  jobId,
                  `Resumed batch ${batch.index}/${totalBatches}: ${batch.label}`,
                  10 + (batch.index / Math.max(totalBatches, 1)) * 50
                );
              }
            }
          : undefined,
        onBatchStart: (batch: PlannedScannerBatch, totalBatches: number) => {
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
          if (refreshCheckpoint) {
            refreshCheckpoint.persistBatch(batch, batchResult);
            setAbsorbJobRefreshProgress(jobId, refreshCheckpoint.progressReceipt());
          }
          if (jobId) {
            trackAbsorbProgress(
              jobId,
              `Completed batch ${batch.index}/${totalBatches}: ${batch.label}`,
              10 + (batch.index / Math.max(totalBatches, 1)) * 50
            );
          }
        },
        onProgress: (processed: number, total: number, file: string) => {
          if (jobId) {
            const scanPercent = 10 + (processed / Math.max(total, 1)) * 50; // 10-60%
            trackAbsorbProgress(jobId, `Parsed ${file}`, scanPercent, processed, total);
          }
        },
      });
      refreshCheckpoint?.markScanned();
      setAbsorbJobRefreshProgress(jobId, refreshCheckpoint?.progressReceipt());
    }
  } catch (error) {
    if (refreshCheckpoint) {
      if (
        error instanceof AbsorbRefreshCommitPinError ||
        error instanceof AbsorbRefreshWorktreePinError
      ) {
        refreshCheckpoint.markInvalidated(error);
      } else refreshCheckpoint.markInterrupted(error);
      setAbsorbJobRefreshProgress(jobId, refreshCheckpoint.progressReceipt());
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

  if (inlineSourceFiles) {
    fileHashes = hashInlineSourceFiles(inlineSourceFiles);
  } else {
    const detector = new GitChangeDetector(primaryRootDir);
    if (detector.isGitRepo()) {
      gitCommitHash = targetGitCommitHash ?? detector.getHeadCommit() ?? undefined;
      const filePaths = (scanResult as { files: any[] }).files.map((f: any) => f.path);
      const hashes = detector.computeFileHashes(filePaths);
      fileHashes = Object.fromEntries(hashes.map((h: any) => [h.filePath, h.hash]));
    }
  }

  graph.gitCommitHash = gitCommitHash;
  graph.fileHashes = fileHashes;
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
    enforceRefreshSourcePin();
    enforceAbsorbJobControl(jobId, 'graph-cache-commit');
    const cacheSaved = saveGraphCache(
      graph,
      primaryRootDir,
      stats,
      gitCommitHash,
      fileHashes,
      detectedProvider,
      localCodebaseSnapshotReceipt,
      effectiveScanPolicy
    );
    if (!cacheSaved) {
      const error = new Error('Unable to publish the completed absorb graph cache atomically');
      refreshCheckpoint?.markInterrupted(error);
      setAbsorbJobRefreshProgress(jobId, refreshCheckpoint?.progressReceipt());
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
    refreshCheckpoint?.markComplete();
    setAbsorbJobRefreshProgress(jobId, refreshCheckpoint?.progressReceipt());
    recordPhaseMetric('graph-cache-save', {
      filesProcessed: scanResult?.stats?.totalFiles,
      totalFiles: scanPlanReceipt?.totalCandidateFiles,
      totalSymbols: stats.totalSymbols,
    });
    if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);
    const semanticIndexReadiness = buildStatsOnlySemanticIndexReceipt(primaryRootDir);
    resetGraphRAGState();
    recordPhaseMetric('stats-response');
    const result = {
      rootDir: primaryRootDir,
      stats,
      embeddingPolicy,
      scanPolicy: effectiveScanPolicy,
      scanPlan: scanPlanReceipt,
      ...(refreshCheckpoint && {
        resumeToken: refreshCheckpoint.progressReceipt().resumeToken,
        refreshProgressReceipt: refreshCheckpoint.progressReceipt(),
      }),
      phaseMetrics,
      gitCommitHash,
      diagnostics,
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
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
      }
    }
    return result;
  }

  if (jobId) trackAbsorbProgress(jobId, 'Creating embeddings', 80);

  // Build embedding index with granular progress (Phase 8 Extension)
  const priorGraphRagReadyForEmbedding = isGraphRAGReady();
  let embeddingBuildError: unknown;
  let preparedEmbeddingIndex: any = null;
  let embeddingCacheNeedsSave = false;
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
      !!priorGitCommitHash && !!gitCommitHash && priorGitCommitHash === gitCommitHash;

    let hydratedIndex: any = null;
    if (gitHashMatches) {
      try {
        const providerObj = await mod.createEmbeddingProvider({
          provider: providerName as EmbeddingProviderName,
          ollamaUrl: process.env.OLLAMA_URL,
          ollamaModel: process.env.OLLAMA_MODEL,
          openaiApiKey: embeddingApiKey || process.env.OPENAI_API_KEY,
          openaiModel: embeddingModel || process.env.OPENAI_MODEL,
          xenovaModel: process.env.XENOVA_MODEL,
        });
        hydratedIndex = await loadEmbeddingsCache(mod, providerObj, primaryRootDir);
        if (hydratedIndex) {
          console.error(
            `[AbsorbEmbeddings] Fast-hydrate: loaded embeddings from disk (git ${gitCommitHash?.slice(0, 7)} match, provider ${providerName}) — skipping re-embed.`
          );
          if (jobId) trackAbsorbProgress(jobId, 'Loaded embeddings from disk cache', 95);
          // The disk `.bin` is already current for this commit; stage it in
          // memory and do not publish session state until cancellation can no
          // longer invalidate the graph transaction.
          preparedEmbeddingIndex = hydratedIndex;
        }
      } catch (err) {
        if (isAbsorbCancellation(err, jobId)) throw err;
        console.warn(`[AbsorbEmbeddings] Fast-hydrate load failed, will rebuild: ${String(err)}`);
        hydratedIndex = null;
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
      embeddingCacheNeedsSave = true;
      recordPhaseMetric('embedding-build', {
        totalSymbols: stats.totalSymbols,
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
  const semanticIndexReadiness = buildSemanticIndexReadinessReceipt(primaryRootDir, {
    priorGraphRagReady: priorGraphRagReadyForEmbedding,
    embeddingBuildError,
    graphRagReadyOverride: preparedEmbeddingIndex !== null && embeddingBuildError === undefined,
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
      graph: serializedGraphForCache,
      embeddingPolicy,
      scanPolicy: normalizeScanPolicy(scanPolicy),
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
      semanticIndexReadiness,
      embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
      ...(semanticIndexReadiness.embeddingSkipReason && {
        embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
      }),
      scanPlan: scanPlanReceipt,
      phaseMetrics,
      gitCommitHash,
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
      semanticIndexReadiness,
      embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
      ...(semanticIndexReadiness.embeddingSkipReason && {
        embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
      }),
      scanPlan: scanPlanReceipt,
      phaseMetrics,
      gitCommitHash,
      diagnostics,
      ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
      durationMs: Date.now() - startTime,
    };
  }

  // Transactional publication boundary: cancellation and memory-budget checks
  // have completed for scan, graph, embedding, mesh, and response generation.
  // Only now replace the prior authoritative graph/index caches and session state.
  enforceRefreshSourcePin();
  enforceAbsorbJobControl(jobId, 'cache-commit');
  cacheTimestamp = Date.now();
  if (preparedEmbeddingIndex && embeddingCacheNeedsSave) {
    saveEmbeddingsCache(preparedEmbeddingIndex, primaryRootDir);
  }
  const cacheSaved = saveGraphCache(
    graph,
    primaryRootDir,
    stats,
    gitCommitHash,
    fileHashes,
    detectedProvider,
    localCodebaseSnapshotReceipt,
    effectiveScanPolicy,
    serializedGraphForCache
  );
  if (!cacheSaved) {
    const error = new Error('Unable to publish the completed absorb graph cache atomically');
    refreshCheckpoint?.markInterrupted(error);
    setAbsorbJobRefreshProgress(jobId, refreshCheckpoint?.progressReceipt());
    throw error;
  }
  cachedGraph = graph;
  cachedRootDir = primaryRootDir;
  cacheProvenance = localCodebaseSnapshotReceipt ? 'local-codebase-snapshot-receipt' : 'fresh-scan';
  if (preparedEmbeddingIndex) {
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
  refreshCheckpoint?.markComplete();
  setAbsorbJobRefreshProgress(jobId, refreshCheckpoint?.progressReceipt());
  if (refreshCheckpoint && typeof result === 'object' && result !== null) {
    Object.assign(result as Record<string, unknown>, {
      resumeToken: refreshCheckpoint.progressReceipt().resumeToken,
      refreshProgressReceipt: refreshCheckpoint.progressReceipt(),
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
  scanPolicy?: GraphScanPolicy
): Promise<unknown> {
  const { CodebaseScanner, CodebaseGraph, GitChangeDetector } = mod;
  const startTime = Date.now();
  const embeddingPolicy = buildGraphRAGEmbeddingPolicyReceipt();
  const effectiveScanPolicy = normalizeScanPolicy(scanPolicy ?? envelope.scanPolicy);
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
  const allFilePaths = graph.getFilePaths();
  const newHashes = detector.computeFileHashes(allFilePaths);
  graph.fileHashes = Object.fromEntries(newHashes.map((h: any) => [h.filePath, h.hash]));

  if (outputFormat === 'stats') {
    cachedGraph = graph;
    cachedRootDir = rootDir;
    cacheProvenance = 'incremental-patch';
    cacheTimestamp = Date.now();

    const statsOnlyGraphStats = graph.getStats();
    const statsOnlyProvider = embeddingProvider
      ? requireNativeGraphRAGProvider(embeddingProvider, 'embeddingProvider argument')
      : (envelope.embeddingProvider ?? (await detectBestEmbeddingProvider()));

    saveGraphCache(
      graph,
      rootDir,
      statsOnlyGraphStats,
      graph.gitCommitHash,
      graph.fileHashes,
      statsOnlyProvider,
      undefined,
      effectiveScanPolicy
    );
    const statsJob = jobId ? absorbJobs.get(jobId) : undefined;
    if (statsJob) statsJob.cacheCommitted = true;

    if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);
    const patchDurationMs = Date.now() - startTime;
    const semanticIndexReadiness = buildStatsOnlySemanticIndexReceipt(rootDir);
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
      graphRagReady: semanticIndexReadiness.graphRagReady,
      semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
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
      }
    }

    return result;
  }

  if (jobId) trackAbsorbProgress(jobId, 'Updating embeddings', 80);

  // Update embedding index
  const priorGraphRagReadyForEmbedding = isGraphRAGReady();
  let embeddingBuildError: unknown;
  let preparedEmbeddingIndex: any = null;
  let embeddingCacheNeedsSave = false;
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

      index = await loadEmbeddingsCache(mod, providerObj, rootDir);
      if (!index) {
        index = await createDynamicEmbeddingIndex(
          mod,
          embeddingProvider,
          embeddingApiKey,
          embeddingModel
        );
      }

      // Remove stale embeddings
      for (const file of filesToRemove) {
        index.removeSymbols(file);
      }
      // Add fresh embeddings
      const newSymbols = rescanResult.files.flatMap(
        (f: Record<string, unknown>) => (f as { symbols?: unknown[] }).symbols ?? []
      );
      try {
        if (newSymbols.length > 0) {
          await withPhaseTimeout(
            index.addSymbols(newSymbols, graph),
            INCREMENTAL_EMBEDDING_TIMEOUT_MS,
            'holo_absorb_repo incremental embedding update',
            () => disposeEmbeddingIndex(index),
            signal
          );
        }

        preparedEmbeddingIndex = index;
        embeddingCacheNeedsSave = true;
      } finally {
        await disposeEmbeddingIndex(index);
      }
    }
  } catch (err) {
    if (isAbsorbCancellation(err, jobId)) throw err;
    console.warn(`[AbsorbEmbeddings] Incremental GraphRAG skipped: ${String(err)}`);
    embeddingBuildError = err;
  }

  const graphStats = graph.getStats();
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
  cacheTimestamp = Date.now();
  if (preparedEmbeddingIndex && embeddingCacheNeedsSave) {
    saveEmbeddingsCache(preparedEmbeddingIndex, rootDir);
  }
  saveGraphCache(
    graph,
    rootDir,
    graphStats,
    graph.gitCommitHash,
    graph.fileHashes,
    detectedProvider,
    undefined,
    effectiveScanPolicy
  );
  cachedGraph = graph;
  cachedRootDir = rootDir;
  cacheProvenance = 'incremental-patch';
  if (preparedEmbeddingIndex) {
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
    scanPolicy: effectiveScanPolicy,
    graphRagReady: semanticIndexReadiness.graphRagReady,
    semanticIndexReady: semanticIndexReadiness.semanticIndexReady,
    semanticIndexReadiness,
    embeddingSkipped: semanticIndexReadiness.embeddingSkipped,
    ...(semanticIndexReadiness.embeddingSkipReason && {
      embeddingSkipReason: semanticIndexReadiness.embeddingSkipReason,
    }),
    holoSource,
    interactiveScene,
    gitCommitHash: changes.headCommit,
    message: `Incremental update: patched ${filesToRescan.length} files in ${patchDurationMs}ms (${graphStats.totalFiles} total)`,
  };

  // Store result in job
  if (jobId) {
    const job = absorbJobs.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'complete';
      job.completedAt = Date.now();
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
    effectiveRootDirs =
      rootDirsRaw && rootDirsRaw.length > 0 ? rootDirsRaw : rootDir ? [rootDir] : [];
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

  // Create job for progress tracking
  const jobId = createAbsorbJob(primaryRootDir, memoryBudgetResult.limits);

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
  };

  const requestedBackground = args.async === true || args.background === true;
  const autoBackground = requestedBackground
    ? ({ autoBackground: false } satisfies AbsorbAutoBackgroundDecision)
    : await buildAutoBackgroundDecision(plan);
  const runInBackground = requestedBackground || autoBackground.autoBackground;
  if (runInBackground) {
    if (plan.force && !plan.fromSourceFiles) {
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
    startBackgroundAbsorbJob(jobId, () => executeAbsorbPlan(plan));
    return {
      accepted: true,
      async: true,
      ...(autoBackground.autoBackground && {
        autoBackground: true,
        autoBackgroundReason: autoBackground.reason,
        foregroundThresholdFiles: autoBackground.thresholdFiles,
        scanPlan: autoBackground.scanPlan,
      }),
      status: 'queued',
      jobId,
      pollTool: 'holo_get_absorb_status',
      rootDir: primaryRootDir,
      outputFormat,
      force,
      embeddingPolicy: buildGraphRAGEmbeddingPolicyReceipt(),
      memoryBudget: { ...absorbJobs.get(jobId)!.memoryBudget },
      scanPolicy,
      ...(plan.refreshCheckpoint && {
        resumeToken: plan.refreshCheckpoint.progressReceipt().resumeToken,
        refreshProgressReceipt: plan.refreshCheckpoint.progressReceipt(),
      }),
      fromSourceFiles,
      fromLocalCodebaseSnapshotReceipt: Boolean(localCodebaseSnapshotReceipt),
      ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
      message: autoBackground.autoBackground
        ? 'Large cold absorb scan was started in the background to avoid the MCP foreground timeout; poll holo_get_absorb_status with jobId.'
        : 'Absorb job started in the background; poll holo_get_absorb_status with jobId.',
    };
  }

  try {
    return await executeAbsorbPlan(plan);
  } catch (err) {
    if (isAbsorbCancellation(err, jobId)) return settleCancelledAbsorbJob(jobId, err);
    if (plan.refreshCheckpoint || resumeToken) {
      const message = errorMessage(err);
      const refreshProgressReceipt = plan.refreshCheckpoint?.progressReceipt();
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
          refreshProgressReceipt,
        }),
      };
      failAbsorbJob(jobId, 'Refresh failed', message, result);
      return result;
    }
    throw err;
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
  preparedScanPlan?: PlannedScannerScanPlan;
  refreshCheckpoint?: AbsorbRefreshCheckpoint;
  targetGitCommitHash?: string | null;
  targetWorktreeFingerprint?: string | null;
}

interface AbsorbAutoBackgroundDecision {
  autoBackground: boolean;
  reason?: 'scan_plan_exceeds_foreground_threshold';
  thresholdFiles?: number;
  scanPlan?: AbsorbScanPlanReceipt;
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
  const coverage = buildGraphCoverageStatus(plan.primaryRootDir, 0, plan.scanPolicy);
  const checkpoint = prepareAbsorbRefreshCheckpoint({
    rootDir: plan.primaryRootDir,
    scanPlan: scanPlan as ScanPlan,
    targetGitCommitHash,
    targetWorktreeFingerprint,
    scanPolicyHash: scanPolicyKey(plan.scanPolicy),
    maxFiles: plan.maxFiles ?? plan.scanPolicy.maxFiles ?? DEFAULT_SCAN_MAX_FILES,
    workspaceCandidateFiles: coverage.selectedCandidateCount ?? undefined,
    resumeToken: plan.resumeToken,
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

  const existingCache = loadGraphCache(plan.primaryRootDir);
  const existingCacheMatchesRoot =
    existingCache?.version === 2 &&
    rootMatchesCurrentRepo(existingCache.rootDir, plan.primaryRootDir);
  const effectiveScanPolicy =
    existingCacheMatchesRoot && !plan.scanPolicyExplicit && !plan.force
      ? normalizeScanPolicy(existingCache.scanPolicy)
      : plan.scanPolicy;
  const effectiveMaxFiles = plan.maxFiles ?? effectiveScanPolicy.maxFiles ?? DEFAULT_SCAN_MAX_FILES;
  const effectiveIncludeBuildArtifacts =
    plan.includeBuildArtifacts || effectiveScanPolicy.includeBuildArtifacts === true;
  const existingCacheCoverageComplete = existingCache
    ? graphCoverageMatchesScanPolicy(
        buildGraphCoverageStatus(
          plan.primaryRootDir,
          getEnvelopeGraphFileCount(existingCache),
          existingCache.scanPolicy
        )
      )
    : false;
  if (
    !plan.force &&
    existingCacheMatchesRoot &&
    scanPoliciesEqual(existingCache.scanPolicy, effectiveScanPolicy) &&
    existingCacheCoverageComplete
  ) {
    return { autoBackground: false };
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
    preparedScanPlan,
    refreshCheckpoint,
    targetGitCommitHash,
    targetWorktreeFingerprint,
  } = plan;
  const { CodebaseGraph, GitChangeDetector } = mod;
  const signal = getAbsorbJobSignal(jobId);
  try {
    enforceAbsorbJobControl(jobId, 'initializing');
  } catch (error) {
    const activeCheckpoint = plan.refreshCheckpoint ?? refreshCheckpoint;
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
    if (!fromSourceFiles && !refreshCheckpoint) {
      await prepareDurableRefreshCheckpoint(plan);
    }
    const activeCheckpoint = plan.refreshCheckpoint ?? refreshCheckpoint;
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
        plan.preparedScanPlan ?? preparedScanPlan,
        activeCheckpoint,
        plan.targetGitCommitHash ?? targetGitCommitHash,
        plan.targetWorktreeFingerprint ?? targetWorktreeFingerprint
      );
      return {
        ...(result as Record<string, unknown>),
        jobId,
        fromSourceFiles,
        fromLocalCodebaseSnapshotReceipt: Boolean(localCodebaseSnapshotReceipt),
        ...(localCodebaseSnapshotReceipt && { localCodebaseSnapshotReceipt }),
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
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 2: Load cache checks
  // ═══════════════════════════════════════════════════════════════════════════
  const envelope = loadGraphCache(primaryRootDir);
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
  // rootDir "C:/Users/Josep/..." vs a request "C:\\Users\\josep\\..."). Normalize
  // both sides (case-insensitive on win32, slash/trailing-slash agnostic) so the
  // fast-hydrate path is reached when they refer to the same repo.
  if (!rootMatchesCurrentRepo(envelope.rootDir, primaryRootDir)) {
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

  const envelopeCoverage = buildGraphCoverageStatus(
    primaryRootDir,
    getEnvelopeGraphFileCount(envelope),
    envelope.scanPolicy
  );
  const sameRootScanPolicy = scanPolicyExplicit
    ? scanPolicy
    : normalizeScanPolicy(envelope.scanPolicy);
  const cachePolicyChanged =
    scanPolicyExplicit && !scanPoliciesEqual(envelope.scanPolicy, scanPolicy);
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

  const changes = detector.detectChanges(envelope.gitCommitHash ?? null);
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
    if (outputFormat !== 'stats' && !isGraphRAGReady()) {
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
        const diskIndex = await loadEmbeddingsCache(mod, providerObj, rootDir);
        enforceAbsorbJobControl(jobId, 'embedding-cache-hydrate');
        if (diskIndex) {
          console.error(
            `[AbsorbEmbeddings] Fast-hydrate (zero-change): loaded embeddings from disk (git ${changes.headCommit.slice(0, 7)} match, provider ${providerName}) — no re-embed.`
          );
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
          saveEmbeddingsCache(rebuiltIndex, rootDir);
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
      (cachedGraph as { gitCommitHash?: string }).gitCommitHash = changes.headCommit;
      (cachedGraph as { fileHashes?: Record<string, string> }).fileHashes = envelope.fileHashes;
      cacheTimestamp = Date.now();
      saveGraphCache(
        cachedGraph,
        rootDir,
        envelope.stats,
        changes.headCommit,
        envelope.fileHashes,
        envelope.embeddingProvider ?? (await detectBestEmbeddingProvider()),
        envelope.localCodebaseSnapshotReceipt,
        sameRootScanPolicy
      );
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
      }
    }

    const semanticIndexReadiness =
      outputFormat === 'stats'
        ? buildStatsOnlySemanticIndexReceipt(rootDir)
        : buildSemanticIndexReadinessReceipt(rootDir, {
            priorGraphRagReady: priorGraphRagReadyForHydrate,
            embeddingBuildError: embeddingLoadError,
            embeddingFailureReason: embeddingLoadError ? 'embeddingLoadFailed' : undefined,
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
    sameRootScanPolicy
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

async function handleGraphStatus(): Promise<unknown> {
  const currentCwd = resolveWorkspaceRoot();
  const activeCacheRoot = cachedRootDir || currentCwd;
  const activeCachePaths = resolveCodebaseCachePaths(activeCacheRoot);
  const cache = getCacheAge(activeCacheRoot);
  const embeddingPolicy = cache.embeddingPolicy ?? buildGraphRAGEmbeddingPolicyReceipt();
  const { getGraphRAGStateStatus } = await import('./graph-rag-tools');
  const embeddingsCacheExists = fs.existsSync(getEmbeddingsFile(activeCacheRoot));
  const embeddingsCacheModel = readEmbeddingsCacheModel(activeCacheRoot);
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
  const diskGraphFileCount =
    cache.fileHashCount ??
    Number((cache.stats as { totalFiles?: unknown } | undefined)?.totalFiles ?? 0);
  const inMemoryGraphFileCount =
    cachedGraph !== null
      ? typeof (cachedGraph as { getFilePaths?: () => unknown[] }).getFilePaths === 'function'
        ? (cachedGraph as { getFilePaths: () => unknown[] }).getFilePaths().length
        : Number(
            (cachedGraph as { getStats?: () => { totalFiles?: unknown } }).getStats?.()
              ?.totalFiles ?? 0
          )
      : undefined;
  const activeGraphFileCount = inMemoryGraphFileCount ?? diskGraphFileCount;
  const activeAndDiskShareCoverage =
    (cachedGraph === null || cacheProvenance === 'disk-cache') &&
    rootMatchesCurrentRepo(cacheRootDir, cache.rootDir ?? currentCwd) &&
    activeGraphFileCount === diskGraphFileCount;
  const activeCoverage = buildGraphCoverageStatus(
    cacheMatchesCwd || diskCacheMatchesCwd ? currentCwd : cacheRootDir,
    activeGraphFileCount,
    cache.scanPolicy
  );
  const diskCoverage = activeAndDiskShareCoverage
    ? activeCoverage
    : buildGraphCoverageStatus(
        diskCacheMatchesCwd ? currentCwd : cache.rootDir,
        diskGraphFileCount,
        cache.scanPolicy
      );
  const activeCoverageComplete = graphCoverageIsComplete(activeCoverage);
  const diskCoverageComplete = graphCoverageIsComplete(diskCoverage);
  const activeHeadMatchesWorkspace = cacheGitMatchesHead(
    activeGitCommitHash,
    workspaceGitCommitHash
  );
  const diskHeadMatchesWorkspace = cacheGitMatchesHead(cache.gitCommitHash, workspaceGitCommitHash);
  const activeFileHashes =
    ((cachedGraph as { fileHashes?: Record<string, string> } | null)?.fileHashes ??
      cache.fileHashes) ||
    undefined;
  const activeSameRootFileHashFreshness =
    cacheMatchesCwd && activeFreshByAge && activeCoverageComplete
      ? buildGraphFileHashFreshnessStatus(cacheRootDir, activeFileHashes)
      : buildSkippedFileHashFreshnessStatus('not_checked', activeFileHashes);
  const activeAndDiskShareFileSnapshot =
    activeAndDiskShareCoverage &&
    activeGitCommitHash === (cache.gitCommitHash ?? null) &&
    cacheMatchesCwd === diskCacheMatchesCwd;
  const diskSameRootFileHashFreshness =
    diskCacheMatchesCwd && diskCacheFreshByAge && diskCoverageComplete
      ? activeAndDiskShareFileSnapshot
        ? activeSameRootFileHashFreshness
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
  ];
  const diskAuthorityCaveats = [
    ...buildCoverageAuthorityCaveats(diskCoverage),
    ...buildHeadFreshnessAuthorityCaveats({
      gitMatchesHead: diskCacheGitMatchesHead,
      fileHashFreshForHeadMismatch: diskFileHashFreshForHeadMismatch,
    }),
  ];
  const localGraphLive =
    graphRAGState.ready &&
    graphRAGMatchesCwd &&
    graphRAGFreshByAge &&
    (noGraphCachePresent ||
      (activeFileHashFreshness.fresh &&
        (activeGitMatchesHead || activeFileHashFreshForHeadMismatch))) &&
    localGraphCoverageComplete;

  const graphAuthoritative =
    (cacheMatchesCwd &&
      (cachedGraph !== null || cache.exists) &&
      activeFreshByAge &&
      activeFileHashFreshness.fresh &&
      (activeGitMatchesHead || activeFileHashFreshForHeadMismatch) &&
      activeCoverageComplete) ||
    activeCrossRootAuthority.ok ||
    localGraphLive;

  const freshForCurrentRepo = graphAuthoritative;
  const diskCacheFreshForCurrentRepo =
    (diskCacheMatchesCwd &&
      diskCacheFreshByAge &&
      diskFileHashFreshness.fresh &&
      (diskCacheGitMatchesHead || diskFileHashFreshForHeadMismatch) &&
      diskCoverageComplete) ||
    diskCrossRootAuthority.ok;
  const diskEmbeddingProviderMatchesPolicy =
    embeddingsCacheExists &&
    (embeddingsCacheModel === null || embeddingsCacheModel === embeddingPolicy.provider);
  const diskSemanticIndexHydratable =
    embeddingsCacheExists && diskCacheFreshForCurrentRepo && diskEmbeddingProviderMatchesPolicy;
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

  return {
    inMemory: cachedGraph !== null,
    rootDir: cachedRootDir || null,
    cacheStorage: {
      layout: activeCachePaths.layout,
      workspaceId: activeCachePaths.workspaceId,
      directory: activeCachePaths.directory,
      graphFile: activeCachePaths.graphFile,
      embeddingsFile: activeCachePaths.embeddingsFile,
    },
    ...(latestRefreshJob?.refreshProgressReceipt && {
      refreshInProgress: !['complete', 'error', 'cancelled'].includes(latestRefreshJob.status),
      refreshJobId: latestRefreshJob.jobId,
      refreshProgressReceipt: latestRefreshJob.refreshProgressReceipt,
    }),
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
  if (!job) return { error: 'Job not found', jobId };

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
      refreshProgressReceipt: job.refreshProgressReceipt,
    }),
    pollTool: 'holo_get_absorb_status',
  };
}

async function handleGetAbsorbStatus(args: Record<string, unknown>): Promise<unknown> {
  const jobId = args.jobId as string;
  const job = absorbJobs.get(jobId);

  if (!job) {
    return { error: 'Job not found', jobId };
  }
  if (job.status !== 'complete' && job.status !== 'error' && job.status !== 'cancelled') {
    updateAbsorbMemoryBudget(job, job.phase);
  }

  const response: Record<string, unknown> = {
    jobId,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    embeddingPolicy: buildGraphRAGEmbeddingPolicyReceipt(),
    filesProcessed: job.filesProcessed,
    totalFiles: job.totalFiles,
    durationMs: (job.completedAt ?? Date.now()) - job.startedAt,
    memory: readAbsorbMemorySnapshot(),
    memoryBudget: { ...job.memoryBudget },
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
    response.refreshProgressReceipt = job.refreshProgressReceipt;
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
