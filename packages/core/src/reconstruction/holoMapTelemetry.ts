/**
 * Structured HoloMap lifecycle logs for support (JSON lines on stderr/console).
 * Disable with HOLOMAP_LOG=0. Set HOLOMAP_LOG=verbose or HOLOMAP_LOG_STEPS=1
 * to emit per-frame step telemetry; the default emits compact run summaries.
 */

type HoloMapEvent =
  | 'init'
  | 'step'
  | 'step_throttled'
  | 'step_evict'
  | 'finalize'
  | 'dispose'
  | 'error';

interface PendingStepSummary {
  stepCount: number;
  firstFrameIndex: number | null;
  lastFrameIndex: number | null;
  pointCountTotal: number;
  totalStepMs: number;
  maxStepMs: number;
  minStepMs: number;
  throttledCount: number;
  evictionCount: number;
  evictedPointTotal: number;
  lastThrottledFrameIndex: number | null;
  lastEvictedFrameIndex: number | null;
  lastRetainedSteps: number | null;
  latestAvgStepMs: number | null;
  latestThrottledSoFar: number | null;
}

const highVolumeEvents = new Set<HoloMapEvent>(['step', 'step_throttled', 'step_evict']);
const pendingStepSummaries = new Map<string, PendingStepSummary>();

function loggingDisabled(): boolean {
  try {
    return typeof process !== 'undefined' && process.env?.HOLOMAP_LOG === '0';
  } catch {
    return false;
  }
}

function verboseStepLoggingEnabled(): boolean {
  try {
    if (typeof process === 'undefined') {
      return false;
    }
    const value = process.env?.HOLOMAP_LOG?.toLowerCase();
    return value === 'verbose' || value === 'debug' || process.env?.HOLOMAP_LOG_STEPS === '1';
  } catch {
    return false;
  }
}

function numericDetail(detail: Record<string, unknown> | undefined, key: string): number | null {
  const value = detail?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getOrCreateStepSummary(runId: string): PendingStepSummary {
  const existing = pendingStepSummaries.get(runId);
  if (existing) {
    return existing;
  }

  const summary: PendingStepSummary = {
    stepCount: 0,
    firstFrameIndex: null,
    lastFrameIndex: null,
    pointCountTotal: 0,
    totalStepMs: 0,
    maxStepMs: 0,
    minStepMs: Infinity,
    throttledCount: 0,
    evictionCount: 0,
    evictedPointTotal: 0,
    lastThrottledFrameIndex: null,
    lastEvictedFrameIndex: null,
    lastRetainedSteps: null,
    latestAvgStepMs: null,
    latestThrottledSoFar: null,
  };
  pendingStepSummaries.set(runId, summary);
  return summary;
}

function accumulateStepSummary(
  runId: string,
  event: HoloMapEvent,
  detail?: Record<string, unknown>
): void {
  const summary = getOrCreateStepSummary(runId);
  const frameIndex = numericDetail(detail, 'frameIndex');

  if (event === 'step') {
    summary.stepCount += 1;
    if (frameIndex !== null) {
      summary.firstFrameIndex = summary.firstFrameIndex ?? frameIndex;
      summary.lastFrameIndex = frameIndex;
    }
    summary.pointCountTotal += numericDetail(detail, 'pointCount') ?? 0;

    const stepMs = numericDetail(detail, 'stepMs');
    if (stepMs !== null) {
      summary.totalStepMs += stepMs;
      summary.maxStepMs = Math.max(summary.maxStepMs, stepMs);
      summary.minStepMs = Math.min(summary.minStepMs, stepMs);
    }

    summary.latestAvgStepMs = numericDetail(detail, 'avgStepMs') ?? summary.latestAvgStepMs;
    summary.latestThrottledSoFar =
      numericDetail(detail, 'throttledSoFar') ?? summary.latestThrottledSoFar;
    return;
  }

  if (event === 'step_throttled') {
    summary.throttledCount += 1;
    summary.lastThrottledFrameIndex = frameIndex ?? summary.lastThrottledFrameIndex;
    return;
  }

  summary.evictionCount += 1;
  summary.lastEvictedFrameIndex = frameIndex ?? summary.lastEvictedFrameIndex;
  summary.evictedPointTotal += numericDetail(detail, 'evictedPoints') ?? 0;
  summary.lastRetainedSteps = numericDetail(detail, 'retainedSteps') ?? summary.lastRetainedSteps;
}

function emitLogPayload(runId: string, event: string, detail?: Record<string, unknown>): void {
  const payload = {
    t: new Date().toISOString(),
    runId,
    event,
    ...detail,
  };
  console.log(`[HoloMap] ${JSON.stringify(payload)}`);
}

function flushStepSummary(runId: string, reason: 'finalize' | 'dispose' | 'error'): void {
  const summary = pendingStepSummaries.get(runId);
  if (!summary) {
    return;
  }
  pendingStepSummaries.delete(runId);

  const throttledCount = Math.max(summary.throttledCount, summary.latestThrottledSoFar ?? 0);
  emitLogPayload(runId, 'step_summary', {
    reason,
    stepCount: summary.stepCount,
    firstFrameIndex: summary.firstFrameIndex,
    lastFrameIndex: summary.lastFrameIndex,
    pointCountTotal: summary.pointCountTotal,
    avgStepMs:
      summary.stepCount > 0
        ? Math.round(summary.totalStepMs / summary.stepCount)
        : (summary.latestAvgStepMs ?? 0),
    maxStepMs: summary.stepCount > 0 ? Math.round(summary.maxStepMs) : 0,
    minStepMs: summary.stepCount > 0 ? Math.round(summary.minStepMs) : 0,
    throttledCount,
    evictionCount: summary.evictionCount,
    evictedPointTotal: summary.evictedPointTotal,
    lastThrottledFrameIndex: summary.lastThrottledFrameIndex,
    lastEvictedFrameIndex: summary.lastEvictedFrameIndex,
    lastRetainedSteps: summary.lastRetainedSteps,
  });
}

export function createHoloMapRunId(): string {
  try {
    const c = globalThis.crypto;
    if (c && 'randomUUID' in c) {
      return `hm_${(c as Crypto).randomUUID().slice(0, 8)}`;
    }
  } catch {
    /* ignore */
  }
  return `hm_${Math.random().toString(36).slice(2, 10)}`;
}

export function logHoloMapEvent(
  runId: string,
  event: HoloMapEvent,
  detail?: Record<string, unknown>
): void {
  if (loggingDisabled()) {
    return;
  }

  if (highVolumeEvents.has(event) && !verboseStepLoggingEnabled()) {
    accumulateStepSummary(runId, event, detail);
    return;
  }

  if (event === 'finalize' || event === 'dispose' || event === 'error') {
    flushStepSummary(runId, event);
  }

  emitLogPayload(runId, event, detail);
}

export function resetHoloMapTelemetryForTests(): void {
  pendingStepSummaries.clear();
}
