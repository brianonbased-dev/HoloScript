'use client';

import { createContext, createElement, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const JOB_STATES = new Set([
  'preflighted',
  'queued',
  'leased',
  'starting',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;

export const DEFAULT_GPU_COMPUTE_SOURCE = `composition "ManagedGpuJob" {
  object "BoundedGpuWork" @compute {
    intent: "Run one bounded GPU computation with explicit quality and cost limits.",
    allowed_accelerators: ["gpu"],
    placement_policy: "external_bridge_requested",
    data_classification: "internal",
    quality_metric: "max_abs_error",
    quality_operator: "lte",
    quality_threshold: 0.00001,
    quality_reference: "cpu_reference",
    deadline_ms: 60000,
    budget_currency: "USD",
    max_cost_minor_units: 100,
    allow_fallback: false
  } {}
}`;

export interface GpuComputePublicJob {
  readonly schemaVersion: string;
  readonly verificationScope: 'durable_job_state_only';
  readonly jobId: string;
  readonly attempt: number;
  readonly state: string;
  readonly jobReceiptId: string;
  readonly providerReservation: 'not_asserted';
  readonly execution: 'not_asserted';
  readonly transitionReceiptId?: string;
  readonly allocationCommitReceiptId?: string;
}

const GpuComputeTeamContext = createContext<string | null>(null);

export function GpuComputeTeamProvider({
  teamId,
  children,
}: {
  readonly teamId: string;
  readonly children: ReactNode;
}) {
  return createElement(GpuComputeTeamContext.Provider, { value: teamId }, children);
}

function parsePublicJob(value: unknown): GpuComputePublicJob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const job = value as Record<string, unknown>;
  if (
    typeof job.schemaVersion !== 'string' ||
    job.verificationScope !== 'durable_job_state_only' ||
    typeof job.jobId !== 'string' ||
    !SHA256_LABEL.test(job.jobId) ||
    typeof job.attempt !== 'number' ||
    !Number.isSafeInteger(job.attempt) ||
    job.attempt < 1 ||
    typeof job.state !== 'string' ||
    !JOB_STATES.has(job.state) ||
    typeof job.jobReceiptId !== 'string' ||
    !SHA256_LABEL.test(job.jobReceiptId) ||
    job.providerReservation !== 'not_asserted' ||
    job.execution !== 'not_asserted'
  ) {
    return null;
  }
  return job as unknown as GpuComputePublicJob;
}

function randomIdempotencyKey(prefix: string): string {
  const value =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

async function responseBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function publicError(body: Record<string, unknown> | null, status: number): string {
  const code = typeof body?.error === 'string' ? body.error : `compute_request_${status}`;
  const reasons = Array.isArray(body?.reason_codes)
    ? body.reason_codes.filter((value): value is string => typeof value === 'string')
    : [];
  return reasons.length ? `${code}: ${reasons.join(', ')}` : code;
}

export function useGpuComputeJobs() {
  const teamId = useContext(GpuComputeTeamContext);
  const [sourceText, setSourceText] = useState(DEFAULT_GPU_COMPUTE_SOURCE);
  const [job, setJob] = useState<GpuComputePublicJob | null>(null);
  const [busyState, setBusyState] = useState(false);
  const [error, setError] = useState('');
  const submitRetry = useRef<{ sourceText: string; idempotencyKey: string } | null>(null);
  const cancelRetry = useRef<{ receiptId: string; idempotencyKey: string } | null>(null);

  const acceptJobResponse = useCallback(async (response: Response): Promise<boolean> => {
    const body = await responseBody(response);
    if (!response.ok) {
      setError(publicError(body, response.status));
      return response.status >= 500 || body?.committed === true;
    }
    const nextJob = parsePublicJob(body);
    if (!nextJob) {
      setError('compute_response_invalid');
      return false;
    }
    setJob(nextJob);
    setError('');
    return false;
  }, []);

  const submit = useCallback(async () => {
    if (busyState) return;
    if (!teamId) {
      setError('compute_team_unavailable');
      return;
    }
    if (!sourceText.trim()) {
      setError('compute_source_required');
      return;
    }
    const retry =
      submitRetry.current?.sourceText === sourceText
        ? submitRetry.current
        : { sourceText, idempotencyKey: randomIdempotencyKey('gpu-submit') };
    submitRetry.current = retry;
    setBusyState(true);
    setError('');
    try {
      const response = await fetch('/api/agents/fleet/compute/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          sourceText,
          idempotencyKey: retry.idempotencyKey,
        }),
      });
      const retryUncertain = await acceptJobResponse(response);
      if (!retryUncertain) submitRetry.current = null;
    } catch {
      setError('compute_service_unavailable');
    } finally {
      setBusyState(false);
    }
  }, [acceptJobResponse, busyState, sourceText, teamId]);

  const refresh = useCallback(async () => {
    if (busyState || !teamId || !job) return;
    setBusyState(true);
    setError('');
    try {
      const query = new URLSearchParams({ teamId, attempt: String(job.attempt) });
      const response = await fetch(
        `/api/agents/fleet/compute/jobs/${encodeURIComponent(job.jobId)}?${query.toString()}`
      );
      await acceptJobResponse(response);
    } catch {
      setError('compute_service_unavailable');
    } finally {
      setBusyState(false);
    }
  }, [acceptJobResponse, busyState, job, teamId]);

  const cancel = useCallback(async () => {
    if (busyState || !teamId || !job || !['preflighted', 'queued'].includes(job.state)) return;
    const retry =
      cancelRetry.current?.receiptId === job.jobReceiptId
        ? cancelRetry.current
        : {
            receiptId: job.jobReceiptId,
            idempotencyKey: randomIdempotencyKey('gpu-cancel'),
          };
    cancelRetry.current = retry;
    setBusyState(true);
    setError('');
    try {
      const response = await fetch(
        `/api/agents/fleet/compute/jobs/${encodeURIComponent(job.jobId)}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            attempt: job.attempt,
            expectedJobReceiptId: job.jobReceiptId,
            idempotencyKey: retry.idempotencyKey,
          }),
        }
      );
      const retryUncertain = await acceptJobResponse(response);
      if (!retryUncertain) cancelRetry.current = null;
    } catch {
      setError('compute_service_unavailable');
    } finally {
      setBusyState(false);
    }
  }, [acceptJobResponse, busyState, job, teamId]);

  return {
    sourceText,
    setSourceText,
    state: job?.state ?? '',
    jobId: job?.jobId ?? '',
    jobReceiptId: job?.jobReceiptId ?? '',
    verificationScope: job?.verificationScope ?? 'durable_job_state_only',
    providerReservation: job?.providerReservation ?? 'not_asserted',
    execution: job?.execution ?? 'not_asserted',
    error,
    // Native2D @when equality currently emits canonical scalar text comparisons.
    busy: busyState ? 'true' : 'false',
    canRefresh: job ? 'true' : 'false',
    canCancel: job && ['preflighted', 'queued'].includes(job.state) ? 'true' : 'false',
    submit,
    refresh,
    cancel,
  };
}
