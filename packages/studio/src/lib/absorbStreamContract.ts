export const ABSORB_PROGRESS_CONTRACT_VERSION = 'absorb-progress.v1' as const;

export type AbsorbProgressPhase =
  | 'queued'
  | 'cloning'
  | 'absorbing'
  | 'indexing'
  | 'detecting'
  | 'complete'
  | 'error'
  | 'heartbeat';

export interface AbsorbProgressContractEvent {
  contract: typeof ABSORB_PROGRESS_CONTRACT_VERSION;
  phase: AbsorbProgressPhase;
  progress: number;
  message?: string;
  jobId?: string;
  rawType?: string;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeProgress(value: unknown): number {
  if (typeof value !== 'number') return 0;
  if (value > 0 && value <= 1) {
    return clampProgress(value * 100);
  }
  return clampProgress(value);
}

function normalizePhase(rawType: string): AbsorbProgressPhase {
  const type = rawType.toLowerCase();

  if (type.includes('heartbeat') || type.includes('ping')) return 'heartbeat';
  if (type.includes('queue')) return 'queued';
  if (type.includes('clone')) return 'cloning';
  if (type.includes('index')) return 'indexing';
  if (type.includes('detect')) return 'detecting';
  if (type.includes('absorb') || type.includes('progress') || type.includes('running')) {
    return 'absorbing';
  }
  if (type.includes('done') || type.includes('complete') || type.includes('success')) {
    return 'complete';
  }
  if (type.includes('error') || type.includes('fail')) return 'error';

  return 'absorbing';
}

/**
 * Normalizes arbitrary absorb SSE payloads into a stable Studio UI contract.
 */
export function toAbsorbProgressContractEvent(payload: unknown): AbsorbProgressContractEvent | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const rawType =
    (typeof record.type === 'string' && record.type) ||
    (typeof record.event === 'string' && record.event) ||
    (typeof record.status === 'string' && record.status) ||
    'progress';

  const phase = normalizePhase(rawType);

  const progress =
    record.progress !== undefined
      ? normalizeProgress(record.progress)
      : phase === 'complete'
        ? 100
        : phase === 'queued'
          ? 5
          : phase === 'cloning'
            ? 25
            : phase === 'absorbing'
              ? 60
              : phase === 'indexing'
                ? 75
                : phase === 'detecting'
                  ? 90
                  : phase === 'error'
                    ? 100
                    : 0;

  const event: AbsorbProgressContractEvent = {
    contract: ABSORB_PROGRESS_CONTRACT_VERSION,
    phase,
    progress,
    rawType,
  };

  if (typeof record.message === 'string') {
    event.message = record.message;
  } else if (typeof record.error === 'string') {
    event.message = record.error;
  }

  if (typeof record.jobId === 'string') {
    event.jobId = record.jobId;
  }

  return event;
}
