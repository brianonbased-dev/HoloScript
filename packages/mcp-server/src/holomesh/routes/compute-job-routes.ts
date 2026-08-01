/**
 * Authenticated user routes for HoloMesh compute jobs.
 *
 * This module is intentionally a narrow HTTP boundary. It does not register
 * fleet capacity, choose a provider, mint admissions, or mutate the compute
 * store directly. A separately configured ComputeJobUserService must compile
 * the caller-authored HoloScript source and perform those trusted operations.
 */

import type http from 'http';
import type { HoloMeshBearerCapability, RegisteredAgent } from '../types';
import { hasBearerCapability } from '../auth-utils';
import { getDefaultComputeJobRouteService } from '../compute-job-route-service';
import { teamStore } from '../state';
import { hasTeamPermission, json, parseJsonBody, requireTeamAccessFresh } from '../utils';

export type ComputeJobUserServiceStatus = 200 | 201 | 202 | 400 | 401 | 403 | 404 | 409 | 422 | 503;

/** Public JSON bytes returned by the trusted user-service boundary. */
export interface ComputeJobUserServiceResponse {
  readonly status: ComputeJobUserServiceStatus;
  readonly publicJson: string;
}

export interface ComputeJobReadPrincipal {
  readonly agentId: string;
  readonly walletAddress: string;
}

export interface ComputeJobMutationPrincipal extends ComputeJobReadPrincipal {
  readonly walletAddress: string;
}

export interface ComputeJobUserService {
  /** Compile sourceText into the exact compiler WorkUnit before admission. */
  submit(input: {
    readonly teamId: string;
    readonly principal: ComputeJobMutationPrincipal;
    readonly sourceText: string;
    readonly idempotencyKey: string;
  }): Promise<ComputeJobUserServiceResponse>;

  status(input: {
    readonly teamId: string;
    readonly principal: ComputeJobReadPrincipal;
    readonly canOperateAnyJob: boolean;
    readonly jobId: string;
    readonly attempt: number;
  }): Promise<ComputeJobUserServiceResponse>;

  /**
   * When canOperateAnyJob is false, the service must verify that the stored
   * job principal matches principal before accepting the cancellation.
   */
  cancel(input: {
    readonly teamId: string;
    readonly principal: ComputeJobMutationPrincipal;
    readonly canOperateAnyJob: boolean;
    readonly jobId: string;
    readonly attempt: number;
    readonly expectedJobReceiptId: string;
    readonly reasonCode: 'user_cancelled';
    readonly idempotencyKey: string;
  }): Promise<ComputeJobUserServiceResponse>;
}

let configuredUserService: ComputeJobUserService | null = null;

/** Startup injection seam for the separately-custodied compute user service. */
export function configureComputeJobUserService(service: ComputeJobUserService | null): void {
  configuredUserService = service;
}

const COLLECTION_PATH = /^\/api\/holomesh\/team\/[^/]+\/compute\/jobs$/;
const ITEM_PATH = /^\/api\/holomesh\/team\/[^/]+\/compute\/jobs\/([^/]+)$/;
const CANCEL_PATH = /^\/api\/holomesh\/team\/[^/]+\/compute\/jobs\/([^/]+)\/cancel$/;
const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SAFE_SERVICE_STATUSES = new Set<number>([200, 201, 202, 400, 401, 403, 404, 409, 422, 503]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(body);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAttempt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return null;
  return value;
}

function parseAttemptQuery(url: string): number | null {
  const search = new URL(url, 'http://localhost').searchParams;
  const values = search.getAll('attempt');
  const keys = Array.from(search.keys());
  if (values.length !== 1 || keys.some((key) => key !== 'attempt')) return null;
  if (!/^[1-9][0-9]*$/.test(values[0]!)) return null;
  const attempt = Number(values[0]);
  return Number.isSafeInteger(attempt) ? attempt : null;
}

function parseJobId(pathValue: string): string | null {
  try {
    const decoded = decodeURIComponent(pathValue);
    return CONTENT_DIGEST.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function mutationPrincipal(caller: RegisteredAgent): ComputeJobMutationPrincipal | null {
  if (caller.id === 'system') return null;
  const walletAddress = nonEmptyString(caller.walletAddress);
  return walletAddress ? { agentId: caller.id, walletAddress } : null;
}

function requireCapability(
  caller: RegisteredAgent,
  capability: HoloMeshBearerCapability,
  res: http.ServerResponse
): boolean {
  if (hasBearerCapability(caller, capability)) return true;
  json(res, 403, {
    error: 'capability_denied',
    required_capability: capability,
  });
  return false;
}

function serviceUnavailable(res: http.ServerResponse): void {
  json(res, 503, { error: 'compute_service_unavailable' });
}

/**
 * Validate the service boundary, then forward its already-public JSON bytes
 * without reserializing or adding a success wrapper.
 */
function sendServiceResponse(
  res: http.ServerResponse,
  response: ComputeJobUserServiceResponse
): void {
  if (!SAFE_SERVICE_STATUSES.has(response.status) || typeof response.publicJson !== 'string') {
    serviceUnavailable(res);
    return;
  }

  try {
    const parsed: unknown = JSON.parse(response.publicJson);
    if (!isRecord(parsed)) {
      serviceUnavailable(res);
      return;
    }
  } catch {
    serviceUnavailable(res);
    return;
  }

  res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(response.publicJson);
}

async function invokeService(
  res: http.ServerResponse,
  operation: () => Promise<ComputeJobUserServiceResponse>
): Promise<void> {
  try {
    sendServiceResponse(res, await operation());
  } catch {
    // Never expose compiler, signer, provider, database, or credential errors.
    serviceUnavailable(res);
  }
}

/**
 * Handle the authenticated compute user API. Returns false for unrelated
 * paths. Tests may pass a service directly; production startup configures the
 * same interface with configureComputeJobUserService.
 */
export async function handleComputeJobRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string,
  service: ComputeJobUserService | null | undefined = undefined
): Promise<boolean> {
  const activeService =
    service === undefined ? (configuredUserService ?? getDefaultComputeJobRouteService()) : service;
  if (COLLECTION_PATH.test(pathname) && method === 'POST') {
    const access = await requireTeamAccessFresh(req, res, url, 'compute:submit');
    if (!access) return true;
    if (!requireCapability(access.caller, 'sign', res)) return true;

    const principal = mutationPrincipal(access.caller);
    if (!principal) {
      json(res, 403, { error: 'durable_wallet_identity_required' });
      return true;
    }

    const body: unknown = await parseJsonBody(req);
    if (!isRecord(body) || !hasExactKeys(body, ['source_text', 'idempotency_key'])) {
      json(res, 400, { error: 'invalid_compute_submit_body' });
      return true;
    }

    const sourceText = typeof body.source_text === 'string' ? body.source_text : '';
    const idempotencyKey = nonEmptyString(body.idempotency_key);
    if (!sourceText.trim() || !idempotencyKey) {
      json(res, 400, { error: 'invalid_compute_submit_body' });
      return true;
    }
    if (!activeService) {
      serviceUnavailable(res);
      return true;
    }

    await invokeService(res, () =>
      activeService.submit({
        teamId: access.teamId,
        principal,
        sourceText,
        idempotencyKey,
      })
    );
    return true;
  }

  const cancelMatch = pathname.match(CANCEL_PATH);
  if (cancelMatch && method === 'POST') {
    const access = await requireTeamAccessFresh(req, res, url, 'compute:submit');
    if (!access) return true;
    if (!requireCapability(access.caller, 'sign', res)) return true;

    const principal = mutationPrincipal(access.caller);
    if (!principal) {
      json(res, 403, { error: 'durable_wallet_identity_required' });
      return true;
    }

    const jobId = parseJobId(cancelMatch[1]!);
    const body: unknown = await parseJsonBody(req);
    if (
      !jobId ||
      !isRecord(body) ||
      !hasExactKeys(body, ['attempt', 'expected_job_receipt_id', 'reason_code', 'idempotency_key'])
    ) {
      json(res, 400, { error: 'invalid_compute_cancel_request' });
      return true;
    }

    const attempt = parseAttempt(body.attempt);
    const expectedJobReceiptId = nonEmptyString(body.expected_job_receipt_id);
    const idempotencyKey = nonEmptyString(body.idempotency_key);
    if (
      !attempt ||
      !expectedJobReceiptId ||
      !CONTENT_DIGEST.test(expectedJobReceiptId) ||
      body.reason_code !== 'user_cancelled' ||
      !idempotencyKey
    ) {
      json(res, 400, { error: 'invalid_compute_cancel_request' });
      return true;
    }
    if (!activeService) {
      serviceUnavailable(res);
      return true;
    }

    const team = teamStore.get(access.teamId);
    const canOperateAnyJob = Boolean(
      team && hasTeamPermission(team, access.caller.id, 'compute:operate')
    );
    await invokeService(res, () =>
      activeService.cancel({
        teamId: access.teamId,
        principal,
        canOperateAnyJob,
        jobId,
        attempt,
        expectedJobReceiptId,
        reasonCode: 'user_cancelled',
        idempotencyKey,
      })
    );
    return true;
  }

  const itemMatch = pathname.match(ITEM_PATH);
  if (itemMatch && method === 'GET') {
    const access = await requireTeamAccessFresh(req, res, url, 'compute:read');
    if (!access) return true;
    if (!requireCapability(access.caller, 'read', res)) return true;

    const principal = mutationPrincipal(access.caller);
    if (!principal) {
      json(res, 403, { error: 'durable_wallet_identity_required' });
      return true;
    }

    const jobId = parseJobId(itemMatch[1]!);
    const attempt = parseAttemptQuery(url);
    if (!jobId || !attempt) {
      json(res, 400, { error: 'invalid_compute_job_reference' });
      return true;
    }
    if (!activeService) {
      serviceUnavailable(res);
      return true;
    }

    const team = teamStore.get(access.teamId);
    const canOperateAnyJob = Boolean(
      team && hasTeamPermission(team, access.caller.id, 'compute:operate')
    );
    await invokeService(res, () =>
      activeService.status({
        teamId: access.teamId,
        principal,
        canOperateAnyJob,
        jobId,
        attempt,
      })
    );
    return true;
  }

  return false;
}
