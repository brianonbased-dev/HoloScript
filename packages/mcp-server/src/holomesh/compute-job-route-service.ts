/**
 * Secret-safe HTTP adapter for the durable HoloMesh compute service.
 *
 * The trusted service owns compilation, Fleet admission, signing, and database
 * custody. This adapter exposes only provider-neutral status codes, reason codes,
 * and the exact public success bytes committed by that service.
 */

import {
  ComputeJobServiceError,
  getDefaultComputeJobUserService,
  type ComputeJobUserService as TrustedComputeJobUserService,
} from './compute-job-service';
import type {
  ComputeJobUserService as RouteComputeJobUserService,
  ComputeJobUserServiceResponse,
  ComputeJobUserServiceStatus,
} from './routes/compute-job-routes';

function publicError(
  status: ComputeJobUserServiceStatus,
  error: string,
  options: {
    readonly reasonCodes?: readonly string[];
    readonly committed?: boolean;
  } = {}
): ComputeJobUserServiceResponse {
  return {
    status,
    publicJson: JSON.stringify({
      error,
      ...(options.reasonCodes?.length ? { reason_codes: [...options.reasonCodes] } : {}),
      ...(options.committed ? { committed: true, retry_with_same_idempotency_key: true } : {}),
    }),
  };
}

function mapServiceError(error: unknown): ComputeJobUserServiceResponse {
  if (!(error instanceof ComputeJobServiceError)) {
    return publicError(503, 'compute_service_unavailable');
  }

  switch (error.code) {
    case 'invalid_request':
    case 'invalid_source':
    case 'ambiguous_work_unit':
      return publicError(400, error.code);
    case 'identity_unavailable':
      return publicError(403, error.code);
    case 'job_not_found':
    case 'job_hidden':
      return publicError(404, 'compute_job_not_found');
    case 'job_conflict':
    case 'running_cancellation_requires_executor_evidence':
      return publicError(409, error.code);
    case 'placement_rejected':
      return publicError(422, error.code, { reasonCodes: error.details });
    case 'capacity_unavailable':
    case 'service_unavailable':
      return publicError(503, error.code);
    case 'committed_readback_failed':
      return publicError(503, error.code, { committed: error.committed });
  }
}

async function adapt(
  status: ComputeJobUserServiceStatus,
  operation: () => Promise<string>
): Promise<ComputeJobUserServiceResponse> {
  try {
    return { status, publicJson: await operation() };
  } catch (error) {
    return mapServiceError(error);
  }
}

/** Bind an already-constructed trusted service to the route interface. */
export function createComputeJobRouteService(
  service: TrustedComputeJobUserService
): RouteComputeJobUserService {
  return {
    submit: (input) =>
      adapt(201, () =>
        service.submit({
          teamId: input.teamId,
          agentId: input.principal.agentId,
          walletAddress: input.principal.walletAddress,
          canOperate: false,
          sourceText: input.sourceText,
          idempotencyKey: input.idempotencyKey,
        })
      ),
    status: (input) =>
      adapt(200, () =>
        service.status({
          teamId: input.teamId,
          agentId: input.principal.agentId,
          walletAddress: input.principal.walletAddress,
          canOperate: input.canOperateAnyJob,
          jobId: input.jobId,
          attempt: input.attempt,
        })
      ),
    cancel: (input) =>
      adapt(200, () =>
        service.cancel({
          teamId: input.teamId,
          agentId: input.principal.agentId,
          walletAddress: input.principal.walletAddress,
          canOperate: input.canOperateAnyJob,
          jobId: input.jobId,
          attempt: input.attempt,
          expectedJobReceiptId: input.expectedJobReceiptId,
          idempotencyKey: input.idempotencyKey,
        })
      ),
  };
}

let defaultRouteService: RouteComputeJobUserService | undefined;

/**
 * Lazy fail-closed production adapter. Missing database/signing/Fleet policy
 * configuration becomes a generic 503; no ephemeral custody is created.
 */
export function getDefaultComputeJobRouteService(): RouteComputeJobUserService {
  defaultRouteService ??= {
    submit: async (input) =>
      createComputeJobRouteService(await getDefaultComputeJobUserService()).submit(input),
    status: async (input) =>
      createComputeJobRouteService(await getDefaultComputeJobUserService()).status(input),
    cancel: async (input) =>
      createComputeJobRouteService(await getDefaultComputeJobUserService()).cancel(input),
  };
  return defaultRouteService;
}

/** Test-only reset for environment/bootstrap isolation. */
export function resetDefaultComputeJobRouteServiceForTests(): void {
  defaultRouteService = undefined;
}
