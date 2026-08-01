import { describe, expect, it, vi } from 'vitest';
import {
  ComputeJobServiceError,
  type ComputeJobServiceErrorCode,
  type ComputeJobUserService as TrustedComputeJobUserService,
} from '../compute-job-service';
import { createComputeJobRouteService } from '../compute-job-route-service';
import type { ComputeJobUserServiceStatus } from '../routes/compute-job-routes';

const TEAM_ID = 'team_compute_adapter';
const AGENT_ID = 'agent_compute_adapter';
const WALLET = '0x0000000000000000000000000000000000000001';
const JOB_ID = `sha256:${'a'.repeat(64)}`;
const RECEIPT_ID = `sha256:${'b'.repeat(64)}`;

const SUBMIT_INPUT = {
  teamId: TEAM_ID,
  principal: { agentId: AGENT_ID, walletAddress: WALLET },
  sourceText: 'composition gpu_job { @compute }',
  idempotencyKey: 'submit-adapter-1',
} as const;

const STATUS_INPUT = {
  teamId: TEAM_ID,
  principal: { agentId: AGENT_ID, walletAddress: WALLET },
  canOperateAnyJob: true,
  jobId: JOB_ID,
  attempt: 1,
} as const;

const CANCEL_INPUT = {
  teamId: TEAM_ID,
  principal: { agentId: AGENT_ID, walletAddress: WALLET },
  canOperateAnyJob: false,
  jobId: JOB_ID,
  attempt: 1,
  expectedJobReceiptId: RECEIPT_ID,
  reasonCode: 'user_cancelled',
  idempotencyKey: 'cancel-adapter-1',
} as const;

function makeTrustedService(): {
  service: TrustedComputeJobUserService;
  submit: ReturnType<typeof vi.fn<TrustedComputeJobUserService['submit']>>;
  status: ReturnType<typeof vi.fn<TrustedComputeJobUserService['status']>>;
  cancel: ReturnType<typeof vi.fn<TrustedComputeJobUserService['cancel']>>;
} {
  const submit = vi.fn<TrustedComputeJobUserService['submit']>();
  const status = vi.fn<TrustedComputeJobUserService['status']>();
  const cancel = vi.fn<TrustedComputeJobUserService['cancel']>();
  return { service: { submit, status, cancel }, submit, status, cancel };
}

describe('compute job route service success forwarding', () => {
  it('forwards submit bytes exactly with 201 and server-derived caller fields', async () => {
    const trusted = makeTrustedService();
    const publicJson = '{  "state" : "preflighted", "job_id" : "public"  }\n';
    trusted.submit.mockResolvedValue(publicJson);
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.submit(SUBMIT_INPUT);

    expect(result).toEqual({ status: 201, publicJson });
    expect(result.publicJson).toBe(publicJson);
    expect(trusted.submit).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      agentId: AGENT_ID,
      walletAddress: WALLET,
      canOperate: false,
      sourceText: SUBMIT_INPUT.sourceText,
      idempotencyKey: SUBMIT_INPUT.idempotencyKey,
    });
  });

  it('forwards status bytes exactly with 200 and operator authority', async () => {
    const trusted = makeTrustedService();
    const publicJson = '\n{"state":"running","providerReservation":false}\n';
    trusted.status.mockResolvedValue(publicJson);
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.status(STATUS_INPUT);

    expect(result).toEqual({ status: 200, publicJson });
    expect(result.publicJson).toBe(publicJson);
    expect(trusted.status).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      agentId: AGENT_ID,
      walletAddress: WALLET,
      canOperate: true,
      jobId: JOB_ID,
      attempt: 1,
    });
  });

  it('forwards cancel bytes exactly with 200 and own-principal authority', async () => {
    const trusted = makeTrustedService();
    const publicJson = '{"state":"cancelled"}\n';
    trusted.cancel.mockResolvedValue(publicJson);
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.cancel(CANCEL_INPUT);

    expect(result).toEqual({ status: 200, publicJson });
    expect(result.publicJson).toBe(publicJson);
    expect(trusted.cancel).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      agentId: AGENT_ID,
      walletAddress: WALLET,
      canOperate: false,
      jobId: JOB_ID,
      attempt: 1,
      expectedJobReceiptId: RECEIPT_ID,
      idempotencyKey: CANCEL_INPUT.idempotencyKey,
    });
  });
});

interface ErrorMappingCase {
  readonly code: ComputeJobServiceErrorCode;
  readonly status: ComputeJobUserServiceStatus;
  readonly publicError: string;
}

const ERROR_MAPPINGS: readonly ErrorMappingCase[] = [
  { code: 'invalid_request', status: 400, publicError: 'invalid_request' },
  { code: 'invalid_source', status: 400, publicError: 'invalid_source' },
  { code: 'ambiguous_work_unit', status: 400, publicError: 'ambiguous_work_unit' },
  { code: 'identity_unavailable', status: 403, publicError: 'identity_unavailable' },
  { code: 'job_not_found', status: 404, publicError: 'compute_job_not_found' },
  { code: 'job_hidden', status: 404, publicError: 'compute_job_not_found' },
  { code: 'job_conflict', status: 409, publicError: 'job_conflict' },
  {
    code: 'running_cancellation_requires_executor_evidence',
    status: 409,
    publicError: 'running_cancellation_requires_executor_evidence',
  },
  { code: 'placement_rejected', status: 422, publicError: 'placement_rejected' },
  { code: 'capacity_unavailable', status: 503, publicError: 'capacity_unavailable' },
  { code: 'service_unavailable', status: 503, publicError: 'service_unavailable' },
  {
    code: 'committed_readback_failed',
    status: 503,
    publicError: 'committed_readback_failed',
  },
];

describe('compute job route service typed error mapping', () => {
  it.each(ERROR_MAPPINGS)('$code maps to $status without exposing its message', async (mapping) => {
    const trusted = makeTrustedService();
    trusted.submit.mockRejectedValue(
      new ComputeJobServiceError(
        mapping.code,
        `provider=vast internal=postgres credential=do-not-expose ${mapping.code}`
      )
    );
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.submit(SUBMIT_INPUT);

    expect(result.status).toBe(mapping.status);
    expect(result.publicJson).toBe(JSON.stringify({ error: mapping.publicError }));
    expect(result.publicJson).not.toContain('vast');
    expect(result.publicJson).not.toContain('postgres');
    expect(result.publicJson).not.toContain('do-not-expose');
  });

  it('surfaces only provider-neutral placement reason codes', async () => {
    const trusted = makeTrustedService();
    trusted.submit.mockRejectedValue(
      new ComputeJobServiceError(
        'placement_rejected',
        'provider instance gpu-7 rejected the workload for an internal reason',
        ['data_classification_denied', 'budget_exceeded']
      )
    );
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.submit(SUBMIT_INPUT);

    expect(result).toEqual({
      status: 422,
      publicJson: JSON.stringify({
        error: 'placement_rejected',
        reason_codes: ['data_classification_denied', 'budget_exceeded'],
      }),
    });
    expect(result.publicJson).not.toContain('gpu-7');
    expect(result.publicJson).not.toContain('internal reason');
  });

  it('marks a committed readback failure for same-idempotency-key retry', async () => {
    const trusted = makeTrustedService();
    trusted.submit.mockRejectedValue(
      new ComputeJobServiceError(
        'committed_readback_failed',
        'transaction committed but provider-facing readback included sensitive context',
        undefined,
        true
      )
    );
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.submit(SUBMIT_INPUT);

    expect(result).toEqual({
      status: 503,
      publicJson: JSON.stringify({
        error: 'committed_readback_failed',
        committed: true,
        retry_with_same_idempotency_key: true,
      }),
    });
    expect(result.publicJson).not.toContain('sensitive context');
  });

  it('suppresses provider and internal messages on a typed availability failure', async () => {
    const trusted = makeTrustedService();
    trusted.status.mockRejectedValue(
      new ComputeJobServiceError(
        'capacity_unavailable',
        'vast instance 1234 failed; DATABASE_URL=postgres://user:password@host/db'
      )
    );
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.status(STATUS_INPUT);

    expect(result).toEqual({
      status: 503,
      publicJson: '{"error":"capacity_unavailable"}',
    });
    expect(result.publicJson).not.toContain('1234');
    expect(result.publicJson).not.toContain('DATABASE_URL');
    expect(result.publicJson).not.toContain('password');
  });
});

describe('compute job route service unknown errors', () => {
  it('maps unknown failures to a generic secret-safe 503', async () => {
    const trusted = makeTrustedService();
    trusted.cancel.mockRejectedValue(
      new Error('provider_token=secret database=postgres://internal-host')
    );
    const route = createComputeJobRouteService(trusted.service);

    const result = await route.cancel(CANCEL_INPUT);

    expect(result).toEqual({
      status: 503,
      publicJson: '{"error":"compute_service_unavailable"}',
    });
    expect(result.publicJson).not.toContain('secret');
    expect(result.publicJson).not.toContain('internal-host');
  });
});
