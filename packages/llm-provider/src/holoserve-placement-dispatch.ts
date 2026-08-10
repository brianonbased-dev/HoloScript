import { createHash } from 'node:crypto';

import {
  planFleetPlacement,
  type FleetPlacementManifest,
  type FleetPlacementOptions,
  type FleetPlacementReceipt,
  type FleetWorkerCapability,
  type FleetWorkerIsland,
} from './fleet-placement';
import {
  admitHoloServeHealth,
  discoverPytorchHoloNode,
  type FetchLike,
  type HoloServeArtifactAdmission,
} from './fleet-router';
import { isBlacklistedModel } from './model-policy';
import type { LLMCompletionRequest, LLMCompletionResponse } from './types';

export const HOLOSERVE_DISPATCH_AUTHORITY_SCHEMA =
  'holoscript.holoserve-dispatch-authority.v1' as const;
export const HOLOSERVE_DISPATCH_LEASE_SCHEMA = 'holoscript.holoserve-dispatch-lease.v1' as const;
export const HOLOSERVE_DISPATCH_LEASE_RELEASE_SCHEMA =
  'holoscript.holoserve-dispatch-lease-release.v1' as const;
export const HOLOSERVE_DISPATCH_EXECUTION_BINDING_SCHEMA =
  'holoscript.holoserve-dispatch-execution-binding.v1' as const;
export const HOLOSERVE_COMPLETION_OUTPUT_SCHEMA =
  'holoscript.holoserve-completion-output.v1' as const;
export const HOLOSERVE_PLACEMENT_DISPATCH_RECEIPT_SCHEMA =
  'holoscript.holoserve-placement-dispatch-receipt.v1' as const;

const HOLOSERVE_EXECUTION_RECEIPT_SCHEMA = 'holoscript.holoserve-execution-receipt.v1';
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;
const PORTABLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const OPAQUE_ENDPOINT_ID_RE = /^serve-[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/u;
const RFC3339_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const MAX_PLACEMENT_AGE_MS = 60_000;
const CLOCK_SKEW_MS = 5_000;
const RELEASE_MARGIN_MS = 1_000;

type JsonRecord = Record<string, unknown>;

export interface HoloServeDispatchProfile {
  model: string;
  inferenceRequestDigest: string;
  laneId: string;
  laneManifestDigest: string;
  modelReleaseDigest: string;
  runtimeProfileDigest: string;
  licensePolicyDigest: string;
  dataClass: string;
  workerId: string;
  islandId: string;
  workerSpecDigest: string;
  custodyTier: string;
}

export interface HoloServeDispatchVerificationContext {
  placementReceipt: FleetPlacementReceipt;
  manifest: FleetPlacementManifest;
  capability: FleetWorkerCapability;
  island: FleetWorkerIsland;
  capabilityDigest: string;
  exactProfile: HoloServeDispatchProfile;
  exactProfileDigest: string;
}

/**
 * Result from a caller-custodied signature/issuer verifier. HoloServe dispatch
 * deliberately provides no "trust this JSON" helper: the host must verify the
 * upstream request receipt, worker attestation, static spec, and exact serving
 * tuple against its own trust store before returning this object.
 */
export interface HoloServeDispatchAuthority {
  schema: typeof HOLOSERVE_DISPATCH_AUTHORITY_SCHEMA;
  verdict: 'verified';
  capabilityDigest: string;
  exactProfileDigest: string;
  model: string;
  inferenceRequestDigest: string;
  artifactBindingSha256: string;
  artifactRegistrySha256: string;
  processInstanceId: string;
  requestAttestationReceiptDigest: string;
  workerAttestationReceiptDigest: string;
  workerSpecDigest: string;
  verificationReceiptDigest: string;
  verifiedAt: string;
  expiresAt: string;
}

export interface HoloServeDispatchLease {
  schema: typeof HOLOSERVE_DISPATCH_LEASE_SCHEMA;
  status: 'acquired';
  leaseId: string;
  requestId: string;
  idempotencyKeyDigest: string;
  workerId: string;
  islandId: string;
  workerBootId: string;
  capabilityDigest: string;
  exactProfileDigest: string;
  inferenceRequestDigest: string;
  model: string;
  placementReceiptDigest: string;
  endpointIdDigest: string;
  artifactBindingSha256: string;
  artifactRegistrySha256: string;
  processInstanceId: string;
  authorityVerificationReceiptDigest: string;
  previousLedgerVersion: number;
  ledgerVersion: number;
  acquiredAt: string;
  expiresAt: string;
  acquisitionReceiptDigest: string;
}

export interface HoloServeDispatchLeaseRelease {
  schema: typeof HOLOSERVE_DISPATCH_LEASE_RELEASE_SCHEMA;
  status: 'released';
  leaseId: string;
  acquisitionReceiptDigest: string;
  outcome: 'completed' | 'failed';
  serverRequestId: string | null;
  executionReceiptDigest: string | null;
  executionObservedAt: string | null;
  releasedAt: string;
  releaseReceiptDigest: string;
}

export interface HoloServeDispatchLeaseContext {
  placementReceiptDigest: string;
  requestId: string;
  idempotencyKeyDigest: string;
  workerId: string;
  islandId: string;
  workerBootId: string;
  capabilityDigest: string;
  exactProfileDigest: string;
  inferenceRequestDigest: string;
  model: string;
  previousLedgerVersion: number;
  endpointIdDigest: string;
  artifactBindingSha256: string;
  artifactRegistrySha256: string;
  processInstanceId: string;
  authorityVerificationReceiptDigest: string;
}

export interface HoloServeDispatchLeaseReleaseContext {
  outcome: 'completed' | 'failed';
  serverRequestId: string | null;
  executionReceiptDigest: string | null;
  executionObservedAt: string | null;
}

export interface HoloServeCompletionExecutionContext {
  signal: AbortSignal;
  deadline: string;
  leaseId: string;
  inferenceRequestDigest: string;
  idempotencyKeyDigest: string;
  modelReleaseDigest: string;
  artifactBindingSha256: string;
  artifactRegistrySha256: string;
}

export interface HoloServePlacementDispatchReceipt {
  schema: typeof HOLOSERVE_PLACEMENT_DISPATCH_RECEIPT_SCHEMA;
  status: 'dispatched';
  placementReceiptDigest: string;
  placementRequestDigest: string;
  inferenceRequestDigest: string;
  idempotencyKeyDigest: string;
  workerId: string;
  islandId: string;
  endpointIdDigest: string;
  workerSpecDigest: string;
  capabilityDigest: string;
  exactProfileDigest: string;
  model: string;
  modelReleaseDigest: string;
  runtimeProfileDigest: string;
  licensePolicyDigest: string;
  artifactBindingSha256: string;
  artifactRegistrySha256: string;
  processInstanceId: string;
  serverRequestId: string;
  executionReceiptDigest: string;
  completionOutputDigest: string;
  executionKind: 'model-generation' | 'deterministic-executor';
  gpuExecution: boolean;
  authorityVerificationReceiptDigest: string;
  leaseAcquisitionReceiptDigest: string;
  leaseReleaseReceiptDigest: string;
  claimBoundary: 'self-reported-holoserve-execution-bound-to-verified-control-plane';
  controlPlane: {
    scope: 'dispatcher-owned-control-plane';
    loopbackOnly: true;
    endpointResolved: true;
    healthProbed: true;
    leaseAcquired: true;
    leaseReleased: true;
  };
  receiptDigest: string;
}

export interface HoloServePlacementDispatchResult {
  placement: FleetPlacementReceipt;
  response: LLMCompletionResponse;
  receipt: HoloServePlacementDispatchReceipt;
}

export type HoloServeDispatchVerifier = (
  context: HoloServeDispatchVerificationContext
) => Promise<HoloServeDispatchAuthority | null>;

export type HoloServeEndpointResolver = (endpointId: string) => Promise<string | null>;

export type HoloServeLeaseAcquirer = (
  context: HoloServeDispatchLeaseContext
) => Promise<HoloServeDispatchLease | null>;

export type HoloServeLeaseReleaser = (
  lease: HoloServeDispatchLease,
  context: HoloServeDispatchLeaseReleaseContext
) => Promise<HoloServeDispatchLeaseRelease | null>;

export type HoloServeCompletionExecutor = (
  baseURL: string,
  model: string,
  request: LLMCompletionRequest,
  context: HoloServeCompletionExecutionContext
) => Promise<LLMCompletionResponse>;

export interface HoloServePlacementDispatchOptions {
  placement: FleetPlacementOptions;
  model: string;
  request: LLMCompletionRequest;
  verifyAuthority: HoloServeDispatchVerifier;
  resolveEndpoint: HoloServeEndpointResolver;
  acquireLease: HoloServeLeaseAcquirer;
  releaseLease: HoloServeLeaseReleaser;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  executeCompletion?: HoloServeCompletionExecutor;
}

export class HoloServePlacementDispatchError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HoloServePlacementDispatchError';
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new HoloServePlacementDispatchError(code, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function canonicalJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('NON_CANONICAL_JSON', 'cannot hash a non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') fail('NON_CANONICAL_JSON', 'cannot hash a non-JSON value');
  if (seen.has(value)) fail('NON_CANONICAL_JSON', 'cannot hash cyclic JSON');
  if (Object.getOwnPropertySymbols(value).length > 0)
    fail('NON_CANONICAL_JSON', 'cannot hash symbol-keyed JSON');
  seen.add(value);
  try {
    if (Array.isArray(value))
      return `[${value.map((entry) => canonicalJson(entry, seen)).join(',')}]`;
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          fail('NON_CANONICAL_JSON', 'cannot hash accessor-backed JSON');
        }
        return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, seen)}`;
      })
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function snapshotJson<T>(value: T): T {
  return deepFreeze(JSON.parse(canonicalJson(value)) as T);
}

function snapshotExternal<T>(value: T, code: string, message: string): T {
  try {
    return snapshotJson(value);
  } catch {
    fail(code, message);
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

function parseCanonicalInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !RFC3339_UTC_RE.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const fractional = value.match(/\.(\d{1,3})Z$/u)?.[1] ?? '';
  const canonicalInput = fractional
    ? value.replace(/\.\d{1,3}Z$/u, `.${fractional.padEnd(3, '0')}Z`)
    : value.replace(/Z$/u, '.000Z');
  return new Date(milliseconds).toISOString() === canonicalInput ? milliseconds : null;
}

function validateLiveCapabilityWindow(capability: FleetWorkerCapability, now: number): number {
  const acceptedAt = parseCanonicalInstant(capability.freshness.acceptedAt);
  const expiresAt = parseCanonicalInstant(capability.freshness.expiresAt);
  if (
    acceptedAt === null ||
    expiresAt === null ||
    acceptedAt > now + CLOCK_SKEW_MS ||
    expiresAt <= now
  ) {
    fail('CAPABILITY_PROOF_STALE', 'selected worker capability is not live at dispatch time');
  }
  return expiresAt;
}

function validateLivePlacementWindow(
  decisionTime: number,
  capability: FleetWorkerCapability,
  now: number
): number {
  if (decisionTime > now + CLOCK_SKEW_MS || now - decisionTime > MAX_PLACEMENT_AGE_MS) {
    fail('PLACEMENT_DECISION_STALE', 'placement decision is outside the live dispatch window');
  }
  return validateLiveCapabilityWindow(capability, now);
}

function profileFor(
  manifest: FleetPlacementManifest,
  capability: FleetWorkerCapability,
  island: FleetWorkerIsland,
  model: string,
  inferenceRequestDigest: string
): HoloServeDispatchProfile {
  return {
    model,
    inferenceRequestDigest,
    laneId: manifest.laneId,
    laneManifestDigest: manifest.laneManifestDigest,
    modelReleaseDigest: manifest.modelReleaseDigest,
    runtimeProfileDigest: manifest.runtimeProfileDigest,
    licensePolicyDigest: manifest.licensePolicyDigest,
    dataClass: manifest.dataClass,
    workerId: capability.workerId,
    islandId: island.islandId,
    workerSpecDigest: capability.specDigest,
    custodyTier: capability.custodyTier,
  };
}

function validateAuthority(
  value: HoloServeDispatchAuthority | null,
  context: HoloServeDispatchVerificationContext,
  now: number
): HoloServeDispatchAuthority {
  if (!value || !isRecord(value as unknown))
    fail(
      'AUTHORITY_NOT_VERIFIED',
      'the caller-custodied authority verifier did not admit dispatch'
    );
  if (
    !hasExactKeys(value as unknown as JsonRecord, [
      'schema',
      'verdict',
      'capabilityDigest',
      'exactProfileDigest',
      'model',
      'inferenceRequestDigest',
      'artifactBindingSha256',
      'artifactRegistrySha256',
      'processInstanceId',
      'requestAttestationReceiptDigest',
      'workerAttestationReceiptDigest',
      'workerSpecDigest',
      'verificationReceiptDigest',
      'verifiedAt',
      'expiresAt',
    ]) ||
    value.schema !== HOLOSERVE_DISPATCH_AUTHORITY_SCHEMA ||
    value.verdict !== 'verified' ||
    value.capabilityDigest !== context.capabilityDigest ||
    value.exactProfileDigest !== context.exactProfileDigest ||
    value.model !== context.exactProfile.model ||
    value.inferenceRequestDigest !== context.exactProfile.inferenceRequestDigest ||
    !isSha256(value.artifactBindingSha256) ||
    !isSha256(value.artifactRegistrySha256) ||
    typeof value.processInstanceId !== 'string' ||
    !PORTABLE_ID_RE.test(value.processInstanceId) ||
    value.requestAttestationReceiptDigest !== context.manifest.upstreamAttestationReceiptDigest ||
    value.workerAttestationReceiptDigest !== context.capability.attestationReceiptDigest ||
    value.workerSpecDigest !== context.capability.specDigest ||
    !isSha256(value.verificationReceiptDigest)
  ) {
    fail(
      'AUTHORITY_PROOF_MISMATCH',
      'authority proof does not bind the exact selected request and worker tuple'
    );
  }
  const verifiedAt = parseCanonicalInstant(value.verifiedAt);
  const expiresAt = parseCanonicalInstant(value.expiresAt);
  if (
    verifiedAt === null ||
    expiresAt === null ||
    verifiedAt > now + CLOCK_SKEW_MS ||
    verifiedAt >= expiresAt ||
    expiresAt <= now
  ) {
    fail('AUTHORITY_PROOF_STALE', 'authority proof is not valid at dispatch time');
  }
  return deepFreeze(value);
}

function validateOpaqueEndpointId(value: string): void {
  if (!OPAQUE_ENDPOINT_ID_RE.test(value)) {
    fail(
      'UNSAFE_ENDPOINT_ID',
      'dispatch endpoint IDs must be opaque serve-* registry handles, never addresses or credentials'
    );
  }
}

function loopbackBaseURL(value: string | null): string {
  if (!value) fail('ENDPOINT_NOT_RESOLVED', 'the selected endpoint handle did not resolve');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('UNSAFE_ENDPOINT_URL', 'the selected endpoint did not resolve to a valid URL');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  const loopback = hostname === '::1' || /^127(?:\.\d{1,3}){3}$/u.test(hostname);
  if (
    !loopback ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '' && url.pathname !== '/')
  ) {
    fail(
      'REMOTE_TRANSPORT_FORBIDDEN',
      'v1 dispatch is loopback-only; use an authenticated tunnel or wait for the mTLS serving lane'
    );
  }
  return url.toString().replace(/\/$/u, '');
}

async function fetchHealth(
  baseURL: string,
  timeoutMs: number,
  fetchImpl: FetchLike
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseURL}/health`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response?.ok) fail('HOLOSERVE_UNHEALTHY', 'HoloServe health did not return success');
    return await response.json();
  } catch (error) {
    if (error instanceof HoloServePlacementDispatchError) throw error;
    fail('HOLOSERVE_UNREACHABLE', 'HoloServe health could not be read');
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRuntimeContract(
  baseURL: string,
  expectedModel: string,
  timeoutMs: number,
  fetchImpl: FetchLike
): Promise<{ contextWindow: number; grammars: readonly string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseURL}/props`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response?.ok)
      fail('HOLOSERVE_RUNTIME_CONTRACT_INVALID', 'HoloServe runtime contract is unavailable');
    const value = await response.json();
    if (!isRecord(value) || !isRecord(value.default_generation_settings)) {
      fail('HOLOSERVE_RUNTIME_CONTRACT_INVALID', 'HoloServe runtime contract is malformed');
    }
    const settings = value.default_generation_settings;
    const grammars = value.grammars;
    if (
      value.backend !== 'pytorch-holo' ||
      value.model !== expectedModel ||
      settings.model !== expectedModel ||
      !Number.isSafeInteger(settings.n_ctx) ||
      (settings.n_ctx as number) < 1 ||
      !Array.isArray(grammars) ||
      grammars.some(
        (grammar) => typeof grammar !== 'string' || grammar.length < 1 || grammar.length > 128
      )
    ) {
      fail('HOLOSERVE_RUNTIME_CONTRACT_INVALID', 'HoloServe runtime contract is inconsistent');
    }
    return deepFreeze({ contextWindow: settings.n_ctx as number, grammars: [...grammars] });
  } catch (error) {
    if (error instanceof HoloServePlacementDispatchError) throw error;
    fail('HOLOSERVE_RUNTIME_CONTRACT_INVALID', 'HoloServe runtime contract could not be read');
  } finally {
    clearTimeout(timer);
  }
}

function healthIdentity(
  health: unknown,
  expectedModel: string
): { admission: HoloServeArtifactAdmission; processInstanceId: string } {
  const admission = admitHoloServeHealth(health, expectedModel);
  if (!admission)
    fail('HOLOSERVE_ARTIFACT_NOT_ADMITTED', 'HoloServe health failed exact artifact admission');
  if (!isRecord(health)) fail('HOLOSERVE_HEALTH_INVALID', 'HoloServe health must be one object');
  const processInstanceId = health.process_instance_id;
  if (typeof processInstanceId !== 'string' || !PORTABLE_ID_RE.test(processInstanceId)) {
    fail(
      'HOLOSERVE_PROCESS_ID_MISSING',
      'HoloServe health did not expose a portable process identity'
    );
  }
  return { admission, processInstanceId };
}

function sameHealthIdentity(
  left: { admission: HoloServeArtifactAdmission; processInstanceId: string },
  right: { admission: HoloServeArtifactAdmission; processInstanceId: string }
): boolean {
  return (
    left.processInstanceId === right.processInstanceId &&
    left.admission.selectedModel === right.admission.selectedModel &&
    left.admission.bindingSha256 === right.admission.bindingSha256 &&
    left.admission.registrySha256 === right.admission.registrySha256
  );
}

function validateLease(
  value: HoloServeDispatchLease | null,
  context: HoloServeDispatchLeaseContext,
  decisionTime: number,
  now: number,
  maximumExpiry: number
): HoloServeDispatchLease {
  if (!value || !isRecord(value as unknown))
    fail('LEASE_NOT_ACQUIRED', 'the lease authority did not atomically acquire the selected slot');
  if (
    !hasExactKeys(value as unknown as JsonRecord, [
      'schema',
      'status',
      'leaseId',
      'requestId',
      'idempotencyKeyDigest',
      'workerId',
      'islandId',
      'workerBootId',
      'capabilityDigest',
      'exactProfileDigest',
      'inferenceRequestDigest',
      'model',
      'placementReceiptDigest',
      'endpointIdDigest',
      'artifactBindingSha256',
      'artifactRegistrySha256',
      'processInstanceId',
      'authorityVerificationReceiptDigest',
      'previousLedgerVersion',
      'ledgerVersion',
      'acquiredAt',
      'expiresAt',
      'acquisitionReceiptDigest',
    ]) ||
    value.schema !== HOLOSERVE_DISPATCH_LEASE_SCHEMA ||
    value.status !== 'acquired' ||
    !PORTABLE_ID_RE.test(value.leaseId) ||
    value.requestId !== context.requestId ||
    value.idempotencyKeyDigest !== context.idempotencyKeyDigest ||
    value.workerId !== context.workerId ||
    value.islandId !== context.islandId ||
    value.workerBootId !== context.workerBootId ||
    value.capabilityDigest !== context.capabilityDigest ||
    value.exactProfileDigest !== context.exactProfileDigest ||
    value.inferenceRequestDigest !== context.inferenceRequestDigest ||
    value.model !== context.model ||
    value.placementReceiptDigest !== context.placementReceiptDigest ||
    value.endpointIdDigest !== context.endpointIdDigest ||
    value.artifactBindingSha256 !== context.artifactBindingSha256 ||
    value.artifactRegistrySha256 !== context.artifactRegistrySha256 ||
    value.processInstanceId !== context.processInstanceId ||
    value.authorityVerificationReceiptDigest !== context.authorityVerificationReceiptDigest ||
    value.previousLedgerVersion !== context.previousLedgerVersion ||
    !Number.isSafeInteger(value.ledgerVersion) ||
    value.ledgerVersion !== value.previousLedgerVersion + 1 ||
    !isSha256(value.acquisitionReceiptDigest)
  ) {
    fail(
      'LEASE_PROOF_MISMATCH',
      'lease proof does not bind the selected request, worker, and CAS ledger version'
    );
  }
  const acquiredAt = parseCanonicalInstant(value.acquiredAt);
  const expiresAt = parseCanonicalInstant(value.expiresAt);
  if (
    acquiredAt === null ||
    expiresAt === null ||
    acquiredAt < decisionTime - CLOCK_SKEW_MS ||
    acquiredAt > now + CLOCK_SKEW_MS ||
    expiresAt <= now ||
    expiresAt <= acquiredAt ||
    expiresAt > maximumExpiry
  ) {
    fail('LEASE_WINDOW_INVALID', 'lease timestamps do not cover this dispatch');
  }
  return deepFreeze(value);
}

function validateRelease(
  value: HoloServeDispatchLeaseRelease | null,
  lease: HoloServeDispatchLease,
  context: HoloServeDispatchLeaseReleaseContext,
  now: number
): HoloServeDispatchLeaseRelease {
  if (
    !value ||
    !isRecord(value as unknown) ||
    !hasExactKeys(value as unknown as JsonRecord, [
      'schema',
      'status',
      'leaseId',
      'acquisitionReceiptDigest',
      'outcome',
      'serverRequestId',
      'executionReceiptDigest',
      'executionObservedAt',
      'releasedAt',
      'releaseReceiptDigest',
    ]) ||
    value.schema !== HOLOSERVE_DISPATCH_LEASE_RELEASE_SCHEMA ||
    value.status !== 'released' ||
    value.leaseId !== lease.leaseId ||
    value.acquisitionReceiptDigest !== lease.acquisitionReceiptDigest ||
    value.outcome !== context.outcome ||
    value.serverRequestId !== context.serverRequestId ||
    value.executionReceiptDigest !== context.executionReceiptDigest ||
    value.executionObservedAt !== context.executionObservedAt ||
    !isSha256(value.releaseReceiptDigest)
  ) {
    fail('LEASE_RELEASE_UNVERIFIED', 'lease release did not return an exact, receipted proof');
  }
  const acquiredAt = parseCanonicalInstant(lease.acquiredAt)!;
  const expiresAt = parseCanonicalInstant(lease.expiresAt)!;
  const releasedAt = parseCanonicalInstant(value.releasedAt);
  const executionObservedAt =
    context.executionObservedAt === null
      ? null
      : parseCanonicalInstant(context.executionObservedAt);
  if (
    releasedAt === null ||
    (context.executionObservedAt !== null && executionObservedAt === null) ||
    releasedAt < acquiredAt ||
    (executionObservedAt !== null && releasedAt < executionObservedAt) ||
    releasedAt > expiresAt ||
    releasedAt > now + CLOCK_SKEW_MS ||
    now > expiresAt + CLOCK_SKEW_MS
  ) {
    fail('LEASE_RELEASE_WINDOW_INVALID', 'lease release is outside the acquired lease window');
  }
  return deepFreeze(value);
}

function completionOutputDigest(
  response: LLMCompletionResponse,
  serverRequestId: string,
  model: string
): string {
  if (
    !hasExactKeys(response as unknown as JsonRecord, [
      'content',
      'usage',
      'model',
      'reportedModel',
      'provider',
      'finishReason',
      'raw',
    ]) ||
    typeof response.content !== 'string' ||
    response.model !== model ||
    response.reportedModel !== model ||
    response.provider !== 'local-llm' ||
    !['stop', 'length'].includes(response.finishReason) ||
    !isRecord(response.usage as unknown) ||
    !hasExactKeys(response.usage as unknown as JsonRecord, [
      'promptTokens',
      'completionTokens',
      'totalTokens',
    ]) ||
    !Number.isSafeInteger(response.usage.promptTokens) ||
    !Number.isSafeInteger(response.usage.completionTokens) ||
    !Number.isSafeInteger(response.usage.totalTokens)
  ) {
    fail('EXECUTION_OUTPUT_INVALID', 'HoloServe completion output is malformed');
  }
  return sha256({
    schema: HOLOSERVE_COMPLETION_OUTPUT_SCHEMA,
    serverRequestId,
    model,
    content: response.content,
    finishReason: response.finishReason,
    usage: {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    },
  });
}

function validateExecution(
  response: LLMCompletionResponse,
  model: string,
  expected: { admission: HoloServeArtifactAdmission; processInstanceId: string },
  dispatch: Omit<HoloServeCompletionExecutionContext, 'signal'>,
  now: number,
  acquiredAt: number,
  leaseExpiresAt: number
): {
  serverRequestId: string;
  executionReceiptDigest: string;
  executionKind: 'model-generation' | 'deterministic-executor';
  gpuExecution: boolean;
  observedAt: string;
  completionOutputDigest: string;
} {
  const raw = response.raw;
  if (!isRecord(raw))
    fail(
      'EXECUTION_RECEIPT_MISSING',
      'HoloServe response did not preserve its raw receipt metadata'
    );
  const serverRequestId = raw.id;
  if (typeof serverRequestId !== 'string' || !PORTABLE_ID_RE.test(serverRequestId)) {
    fail(
      'EXECUTION_REQUEST_ID_INVALID',
      'HoloServe response did not expose a portable request identity'
    );
  }
  if (
    raw.model !== model ||
    response.model !== model ||
    (response.reportedModel !== undefined && response.reportedModel !== model)
  ) {
    fail('EXECUTION_MODEL_MISMATCH', 'HoloServe response model does not match the admitted model');
  }
  const holo = raw.holo;
  if (
    !isRecord(holo) ||
    holo.backend !== 'pytorch-holo' ||
    holo.sovereign !== true ||
    holo.llama_cpp !== false ||
    holo.process_instance_id !== expected.processInstanceId ||
    holo.model_artifact_binding_sha256 !== expected.admission.bindingSha256 ||
    sha256(holo.model_artifact_binding) !== expected.admission.bindingSha256
  ) {
    fail(
      'EXECUTION_BINDING_MISMATCH',
      'HoloServe response does not bind the admitted artifact and process identity'
    );
  }
  const execution = holo.execution;
  const expectedCompletionOutputDigest = completionOutputDigest(response, serverRequestId, model);
  if (
    !isRecord(execution) ||
    execution.schema !== HOLOSERVE_EXECUTION_RECEIPT_SCHEMA ||
    execution.server_request_id !== serverRequestId ||
    execution.process_instance_id !== expected.processInstanceId ||
    execution.dispatch_binding_schema !== HOLOSERVE_DISPATCH_EXECUTION_BINDING_SCHEMA ||
    execution.dispatch_request_sha256 !== dispatch.inferenceRequestDigest ||
    execution.dispatch_lease_id !== dispatch.leaseId ||
    execution.dispatch_idempotency_key_sha256 !== dispatch.idempotencyKeyDigest ||
    execution.model !== model ||
    execution.model_release_sha256 !== dispatch.modelReleaseDigest ||
    execution.artifact_binding_sha256 !== dispatch.artifactBindingSha256 ||
    execution.artifact_registry_sha256 !== dispatch.artifactRegistrySha256 ||
    execution.completion_output_sha256 !== expectedCompletionOutputDigest ||
    !['model-generation', 'deterministic-executor'].includes(String(execution.execution_kind)) ||
    execution.gpu_execution !== true ||
    !isRecord(execution.hardware) ||
    execution.hardware.device_type !== 'cuda' ||
    execution.hardware.parameter_matches_target !== true ||
    execution.hardware.telemetry_available !== true ||
    parseCanonicalInstant(execution.observed_at) === null
  ) {
    fail('EXECUTION_RECEIPT_INVALID', 'HoloServe execution receipt is missing or inconsistent');
  }
  const observedAtMilliseconds = parseCanonicalInstant(execution.observed_at)!;
  if (
    observedAtMilliseconds < acquiredAt - CLOCK_SKEW_MS ||
    observedAtMilliseconds >= leaseExpiresAt ||
    observedAtMilliseconds > now + CLOCK_SKEW_MS ||
    now >= leaseExpiresAt
  ) {
    fail('EXECUTION_WINDOW_INVALID', 'HoloServe execution is outside the acquired lease window');
  }
  return {
    serverRequestId,
    executionReceiptDigest: sha256(execution),
    executionKind: execution.execution_kind as 'model-generation' | 'deterministic-executor',
    gpuExecution: execution.gpu_execution,
    observedAt: execution.observed_at as string,
    completionOutputDigest: expectedCompletionOutputDigest,
  };
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function sealReceipt(
  receipt: Omit<HoloServePlacementDispatchReceipt, 'receiptDigest'>
): HoloServePlacementDispatchReceipt {
  return deepFreeze({ ...receipt, receiptDigest: sha256(receipt) });
}

function validateDispatchRequestSurface(request: LLMCompletionRequest): void {
  const supported = new Set(['messages', 'maxTokens', 'temperature', 'stream', 'grammar']);
  const unsupported = Object.keys(request).filter((key) => !supported.has(key));
  if (unsupported.length > 0 || request.stream === true) {
    fail(
      'DISPATCH_REQUEST_UNSUPPORTED',
      'the bounded default HoloServe executor does not support this request surface'
    );
  }
  if (
    !Array.isArray(request.messages) ||
    request.messages.length < 1 ||
    request.messages.length > 128 ||
    request.messages.some(
      (message) =>
        !isRecord(message as unknown) ||
        !hasExactKeys(message as unknown as JsonRecord, ['role', 'content']) ||
        !['system', 'user', 'assistant'].includes(String(message.role)) ||
        typeof message.content !== 'string'
    ) ||
    (request.maxTokens !== undefined &&
      (!Number.isSafeInteger(request.maxTokens) ||
        request.maxTokens < 1 ||
        request.maxTokens > 4_096)) ||
    (request.temperature !== undefined &&
      (!Number.isFinite(request.temperature) ||
        request.temperature < 0 ||
        request.temperature > 10)) ||
    (request.grammar !== undefined &&
      (typeof request.grammar !== 'string' ||
        request.grammar.length < 1 ||
        request.grammar.length > 128))
  ) {
    fail('DISPATCH_REQUEST_INVALID', 'completion request is outside the bounded text-only lane');
  }
  const prompt = request.messages.map((message) => message.content as string).join('\n\n');
  if (
    new TextEncoder().encode(prompt).byteLength > 32 * 1_024 ||
    new TextEncoder().encode(canonicalJson(request)).byteLength > 48 * 1_024
  ) {
    fail('DISPATCH_REQUEST_TOO_LARGE', 'completion request exceeds the bounded text-only lane');
  }
}

function openAIRequestBody(
  model: string,
  request: LLMCompletionRequest,
  context: HoloServeCompletionExecutionContext
): JsonRecord {
  validateDispatchRequestSurface(request);
  return {
    model,
    messages: request.messages,
    stream: false,
    ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.grammar !== undefined ? { grammar: request.grammar } : {}),
    holo_dispatch: {
      schema: HOLOSERVE_DISPATCH_EXECUTION_BINDING_SCHEMA,
      request_sha256: context.inferenceRequestDigest,
      lease_id: context.leaseId,
      idempotency_key_sha256: context.idempotencyKeyDigest,
      model_release_sha256: context.modelReleaseDigest,
      artifact_binding_sha256: context.artifactBindingSha256,
      artifact_registry_sha256: context.artifactRegistrySha256,
      deadline: context.deadline,
    },
  };
}

async function defaultCompletionExecutor(
  baseURL: string,
  model: string,
  request: LLMCompletionRequest,
  context: HoloServeCompletionExecutionContext,
  fetchImpl: FetchLike
): Promise<LLMCompletionResponse> {
  let payload: unknown;
  try {
    const response = await fetchImpl(`${baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: canonicalJson(openAIRequestBody(model, request, context)),
      signal: context.signal,
      redirect: 'error',
    });
    if (!response?.ok) fail('HOLOSERVE_COMPLETION_REJECTED', 'HoloServe rejected completion');
    payload = await response.json();
  } catch (error) {
    if (error instanceof HoloServePlacementDispatchError) throw error;
    fail('HOLOSERVE_COMPLETION_FAILED', 'HoloServe completion transport failed');
  }
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    fail('HOLOSERVE_COMPLETION_INVALID', 'HoloServe completion response is malformed');
  }
  const choice = payload.choices[0];
  const message = isRecord(choice.message) ? choice.message : null;
  const content = message?.content;
  if (typeof content !== 'string') {
    fail('HOLOSERVE_COMPLETION_INVALID', 'HoloServe completion content is malformed');
  }
  const usage = isRecord(payload.usage) ? payload.usage : {};
  const promptTokens = Number.isSafeInteger(usage.prompt_tokens) ? Number(usage.prompt_tokens) : 0;
  const completionTokens = Number.isSafeInteger(usage.completion_tokens)
    ? Number(usage.completion_tokens)
    : 0;
  const reportedModel = typeof payload.model === 'string' ? payload.model : model;
  return {
    content,
    model: reportedModel,
    reportedModel,
    provider: 'local-llm',
    finishReason: (typeof choice.finish_reason === 'string' ? choice.finish_reason : 'stop') as
      | 'stop'
      | 'length'
      | 'tool_use'
      | 'content_filter'
      | 'error',
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: Number.isSafeInteger(usage.total_tokens)
        ? Number(usage.total_tokens)
        : promptTokens + completionTokens,
    },
    raw: payload,
  };
}

async function executeWithDeadline(
  execute: HoloServeCompletionExecutor,
  baseURL: string,
  model: string,
  request: LLMCompletionRequest,
  context: Omit<HoloServeCompletionExecutionContext, 'signal'>,
  deadlineMilliseconds: number
): Promise<LLMCompletionResponse> {
  const controller = new AbortController();
  const remaining = deadlineMilliseconds - Date.now();
  if (remaining < 1) fail('EXECUTION_DEADLINE_EXPIRED', 'execution deadline is already expired');
  let timedOut = false;
  const execution = Promise.resolve().then(() =>
    execute(baseURL, model, request, Object.freeze({ ...context, signal: controller.signal }))
  );
  let rejectDeadline: ((reason: HoloServePlacementDispatchError) => void) | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectDeadline?.(
      new HoloServePlacementDispatchError(
        'EXECUTION_DEADLINE_EXCEEDED',
        'HoloServe execution exceeded the acquired lease deadline'
      )
    );
  }, remaining);
  try {
    return await Promise.race([execution, deadline]);
  } catch (error) {
    if (!timedOut) throw error;
    fail(
      'EXECUTION_CESSATION_UNVERIFIED',
      'client cancellation cannot prove server cessation; lease remains held until authority expiry'
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function awaitWithDeadline<T>(
  operation: Promise<T>,
  deadlineMilliseconds: number,
  code: string,
  message: string
): Promise<T> {
  const remaining = deadlineMilliseconds - Date.now();
  if (remaining < 1) fail(code, message);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new HoloServePlacementDispatchError(code, message)),
          remaining
        );
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * Convert a digest-bound placement plan into one receipted HoloServe execution.
 *
 * This v1 bridge is intentionally narrow:
 * - exactly one already-running, single-device worker island;
 * - an opaque registry endpoint resolving only to an explicit loopback IP;
 * - caller-custodied signature/issuer verification of the exact serving tuple;
 * - a caller-custodied atomic CAS lease before inference;
 * - unchanged HoloServe artifact and process identity before/after execution.
 *
 * Dispatcher-owned code performs no provisioning, spending, artifact fetch,
 * remote-code execution, or WAN tensor transport. Signature verification,
 * CAS persistence, callback side effects, and executor cessation remain
 * caller-custodied contracts; a digest-only placement receipt is not authority.
 */
export async function dispatchHoloServePlacement(
  options: HoloServePlacementDispatchOptions
): Promise<HoloServePlacementDispatchResult> {
  const placementOptions = snapshotExternal(
    options.placement,
    'DISPATCH_INPUT_INVALID',
    'placement input must be immutable canonical JSON'
  );
  const request = snapshotExternal(
    options.request,
    'DISPATCH_INPUT_INVALID',
    'completion request must be immutable canonical JSON'
  );
  const model = options.model;
  if (typeof model !== 'string' || !PORTABLE_ID_RE.test(model)) {
    fail('MODEL_ID_INVALID', 'model must be one portable identifier');
  }
  if (isBlacklistedModel(model)) {
    fail('MODEL_POLICY_DENIED', 'the selected model is denied by ecosystem policy');
  }
  validateDispatchRequestSurface(request);
  const verifyAuthority = options.verifyAuthority;
  const resolveEndpoint = options.resolveEndpoint;
  const acquireLease = options.acquireLease;
  const releaseLease = options.releaseLease;
  const injectedExecutor = options.executeCompletion;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const noRedirectFetch: FetchLike = (url, init = {}) =>
    fetchImpl(url, { ...init, redirect: 'error' });
  const timeoutMs = options.timeoutMs ?? 6_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    fail('INVALID_TIMEOUT', 'timeoutMs must be an integer from 100 through 120000');
  }

  const placement = deepFreeze(planFleetPlacement(placementOptions));
  if (placement.status !== 'placed' || !placement.selected || placement.errors.length > 0) {
    fail('PLACEMENT_NOT_SELECTED', 'fleet placement did not select one eligible worker island');
  }
  const decisionTime = parseCanonicalInstant(placement.decisionTime);
  if (decisionTime === null)
    fail('PLACEMENT_TIME_INVALID', 'placement decision time is not a real canonical UTC instant');
  if (placementOptions.manifest.resources.gpuCount !== 1) {
    fail('MULTI_GPU_DISPATCH_UNSUPPORTED', 'HoloServe v1 dispatch supports exactly one GPU device');
  }

  const capability = placementOptions.capabilities.find(
    (candidate) => candidate.workerId === placement.selected?.workerId
  );
  const island = capability?.islands.find(
    (candidate) => candidate.islandId === placement.selected?.islandId
  );
  if (!capability || !island || island.gpuCount !== 1) {
    fail(
      'SINGLE_DEVICE_ISLAND_REQUIRED',
      'selected HoloServe island must contain exactly one GPU device'
    );
  }
  if (placement.selected.capabilityDigest !== sha256(capability)) {
    fail('CAPABILITY_DIGEST_MISMATCH', 'selected capability changed after placement');
  }
  let capabilityExpiresAt = validateLivePlacementWindow(decisionTime, capability, Date.now());

  const inferenceRequestDigest = sha256(request);
  const exactProfile = deepFreeze(
    profileFor(placementOptions.manifest, capability, island, model, inferenceRequestDigest)
  );
  const exactProfileDigest = sha256(exactProfile);
  const verificationContext: HoloServeDispatchVerificationContext = deepFreeze({
    placementReceipt: placement,
    manifest: placementOptions.manifest,
    capability,
    island,
    capabilityDigest: placement.selected.capabilityDigest,
    exactProfile,
    exactProfileDigest,
  });
  let rawAuthority: HoloServeDispatchAuthority | null;
  try {
    rawAuthority = await verifyAuthority(verificationContext);
  } catch {
    fail('AUTHORITY_VERIFIER_FAILED', 'the caller-custodied authority verifier failed closed');
  }
  const authority = validateAuthority(
    snapshotExternal(
      rawAuthority,
      'AUTHORITY_PROOF_MISMATCH',
      'authority proof is not immutable canonical JSON'
    ),
    verificationContext,
    Date.now()
  );

  validateOpaqueEndpointId(placement.selected.dataEndpointId);
  let resolvedEndpoint: string | null;
  try {
    resolvedEndpoint = await resolveEndpoint(placement.selected.dataEndpointId);
  } catch {
    fail('ENDPOINT_RESOLUTION_FAILED', 'the endpoint registry failed closed');
  }
  const baseURL = loopbackBaseURL(resolvedEndpoint);

  let discovery: Awaited<ReturnType<typeof discoverPytorchHoloNode>>;
  try {
    discovery = await discoverPytorchHoloNode(capability.workerId, baseURL, isBlacklistedModel, {
      timeoutMs,
      fetchImpl: noRedirectFetch,
    });
  } catch {
    fail('HOLOSERVE_DISCOVERY_REJECTED', 'selected endpoint failed strict HoloServe discovery');
  }
  if (
    !discovery ||
    discovery.backend !== 'pytorch-holo' ||
    discovery.baseURL.replace(/\/$/u, '') !== baseURL ||
    !discovery.installed.includes(model)
  ) {
    fail('HOLOSERVE_DISCOVERY_REJECTED', 'selected endpoint failed strict HoloServe discovery');
  }
  const runtimeContract = await fetchRuntimeContract(baseURL, model, timeoutMs, noRedirectFetch);
  if (
    (request.maxTokens !== undefined && request.maxTokens > runtimeContract.contextWindow) ||
    (request.grammar !== undefined && !runtimeContract.grammars.includes(request.grammar))
  ) {
    fail(
      'DISPATCH_REQUEST_RUNTIME_REJECTED',
      'completion request exceeds the selected HoloServe runtime contract'
    );
  }

  const before = deepFreeze(
    healthIdentity(await fetchHealth(baseURL, timeoutMs, noRedirectFetch), model)
  );
  if (
    before.admission.bindingSha256 !== authority.artifactBindingSha256 ||
    before.admission.registrySha256 !== authority.artifactRegistrySha256 ||
    before.processInstanceId !== authority.processInstanceId
  ) {
    fail(
      'HOLOSERVE_AUTHORITY_IDENTITY_MISMATCH',
      'live HoloServe artifact, registry, or process identity is not authority-admitted'
    );
  }
  capabilityExpiresAt = validateLivePlacementWindow(decisionTime, capability, Date.now());
  validateAuthority(authority, verificationContext, Date.now());

  const idempotencyKeyDigest = sha256(placementOptions.manifest.idempotencyKey);
  const endpointIdDigest = sha256(placement.selected.dataEndpointId);
  const leaseContext: HoloServeDispatchLeaseContext = deepFreeze({
    placementReceiptDigest: placement.receiptDigest,
    requestId: placementOptions.manifest.requestId,
    idempotencyKeyDigest,
    workerId: capability.workerId,
    islandId: island.islandId,
    workerBootId: capability.freshness.bootId,
    capabilityDigest: placement.selected.capabilityDigest,
    exactProfileDigest,
    inferenceRequestDigest,
    model,
    previousLedgerVersion: placementOptions.leaseLedgerVersion,
    endpointIdDigest,
    artifactBindingSha256: before.admission.bindingSha256,
    artifactRegistrySha256: before.admission.registrySha256,
    processInstanceId: before.processInstanceId,
    authorityVerificationReceiptDigest: authority.verificationReceiptDigest,
  });
  let rawLease: HoloServeDispatchLease | null;
  try {
    rawLease = await acquireLease(leaseContext);
  } catch {
    fail('LEASE_ACQUISITION_FAILED', 'the lease authority failed closed');
  }
  const authorityExpiresAt = parseCanonicalInstant(authority.expiresAt)!;
  const lease = validateLease(
    snapshotExternal(
      rawLease,
      'LEASE_PROOF_MISMATCH',
      'lease proof is not immutable canonical JSON'
    ),
    leaseContext,
    decisionTime,
    Date.now(),
    Math.min(authorityExpiresAt, capabilityExpiresAt)
  );
  const leaseAcquiredAt = parseCanonicalInstant(lease.acquiredAt)!;
  const leaseExpiresAt = parseCanonicalInstant(lease.expiresAt)!;
  const executionDeadline = Math.min(leaseExpiresAt - RELEASE_MARGIN_MS, Date.now() + timeoutMs);
  const executionContext = deepFreeze({
    deadline: new Date(executionDeadline).toISOString(),
    leaseId: lease.leaseId,
    inferenceRequestDigest,
    idempotencyKeyDigest,
    modelReleaseDigest: placementOptions.manifest.modelReleaseDigest,
    artifactBindingSha256: before.admission.bindingSha256,
    artifactRegistrySha256: before.admission.registrySha256,
  });

  let response: LLMCompletionResponse | null = null;
  let execution: ReturnType<typeof validateExecution> | null = null;
  let release: HoloServeDispatchLeaseRelease | null = null;
  let dispatchError: HoloServePlacementDispatchError | null = null;
  const execute: HoloServeCompletionExecutor =
    injectedExecutor ??
    ((url, selectedModel, completionRequest, context) =>
      defaultCompletionExecutor(url, selectedModel, completionRequest, context, noRedirectFetch));
  try {
    try {
      response = snapshotExternal(
        await executeWithDeadline(
          execute,
          baseURL,
          model,
          request,
          executionContext,
          executionDeadline
        ),
        'EXECUTION_RESPONSE_INVALID',
        'HoloServe response must be immutable canonical JSON'
      );
    } catch (error) {
      if (
        error instanceof HoloServePlacementDispatchError &&
        ['EXECUTION_DEADLINE_EXPIRED', 'EXECUTION_CESSATION_UNVERIFIED'].includes(error.code)
      ) {
        throw error;
      }
      fail(
        'EXECUTION_CESSATION_UNVERIFIED',
        'execution transport did not prove server cessation; lease remains held until expiry'
      );
    }
    execution = validateExecution(
      response,
      model,
      before,
      executionContext,
      Date.now(),
      leaseAcquiredAt,
      leaseExpiresAt
    );
    const postHealthDeadline = Math.min(leaseExpiresAt - RELEASE_MARGIN_MS, Date.now() + timeoutMs);
    const after = healthIdentity(
      await awaitWithDeadline(
        fetchHealth(baseURL, Math.max(1, postHealthDeadline - Date.now()), noRedirectFetch),
        postHealthDeadline,
        'POST_EXECUTION_HEALTH_DEADLINE_EXCEEDED',
        'post-execution HoloServe health exceeded the lease deadline'
      ),
      model
    );
    if (!sameHealthIdentity(before, after))
      fail(
        'HOLOSERVE_IDENTITY_DRIFT',
        'HoloServe artifact or process identity changed during dispatch'
      );
    capabilityExpiresAt = validateLiveCapabilityWindow(capability, Date.now());
    validateAuthority(authority, verificationContext, Date.now());
    if (Date.now() >= Math.min(leaseExpiresAt, capabilityExpiresAt, authorityExpiresAt)) {
      fail('DISPATCH_PROOF_EXPIRED', 'dispatch proof chain expired before release');
    }
  } catch (error) {
    dispatchError =
      error instanceof HoloServePlacementDispatchError
        ? error
        : new HoloServePlacementDispatchError('DISPATCH_FAILED', 'dispatch failed closed');
  }

  const releaseContext: HoloServeDispatchLeaseReleaseContext = deepFreeze({
    outcome: dispatchError ? 'failed' : 'completed',
    serverRequestId: execution?.serverRequestId ?? null,
    executionReceiptDigest: execution?.executionReceiptDigest ?? null,
    executionObservedAt: execution?.observedAt ?? null,
  });
  if (dispatchError?.code === 'EXECUTION_CESSATION_UNVERIFIED') throw dispatchError;
  let releaseError: HoloServePlacementDispatchError | null = null;
  try {
    let rawRelease: HoloServeDispatchLeaseRelease | null;
    try {
      rawRelease = await awaitWithDeadline(
        releaseLease(lease, releaseContext),
        Math.min(leaseExpiresAt, Date.now() + timeoutMs),
        'LEASE_RELEASE_DEADLINE_EXCEEDED',
        'lease authority did not acknowledge release before the lease deadline'
      );
    } catch {
      fail('LEASE_RELEASE_FAILED', 'the lease authority failed to release the selected slot');
    }
    release = validateRelease(
      snapshotExternal(
        rawRelease,
        'LEASE_RELEASE_UNVERIFIED',
        'lease release proof is not immutable canonical JSON'
      ),
      lease,
      releaseContext,
      Date.now()
    );
  } catch (error) {
    releaseError =
      error instanceof HoloServePlacementDispatchError
        ? error
        : new HoloServePlacementDispatchError(
            'LEASE_RELEASE_FAILED',
            'lease release failed closed'
          );
  }
  if (dispatchError && releaseError)
    fail('DISPATCH_AND_RELEASE_FAILED', 'dispatch and lease release both failed closed');
  if (releaseError) throw releaseError;
  if (dispatchError) throw dispatchError;
  if (!response || !execution || !release)
    fail('DISPATCH_INCOMPLETE', 'dispatch did not produce a complete receipt chain');

  const receipt = sealReceipt({
    schema: HOLOSERVE_PLACEMENT_DISPATCH_RECEIPT_SCHEMA,
    status: 'dispatched',
    placementReceiptDigest: placement.receiptDigest,
    placementRequestDigest: placement.requestDigest!,
    inferenceRequestDigest,
    idempotencyKeyDigest,
    workerId: capability.workerId,
    islandId: island.islandId,
    endpointIdDigest,
    workerSpecDigest: capability.specDigest,
    capabilityDigest: placement.selected.capabilityDigest,
    exactProfileDigest,
    model,
    modelReleaseDigest: placementOptions.manifest.modelReleaseDigest,
    runtimeProfileDigest: placementOptions.manifest.runtimeProfileDigest,
    licensePolicyDigest: placementOptions.manifest.licensePolicyDigest,
    artifactBindingSha256: before.admission.bindingSha256,
    artifactRegistrySha256: before.admission.registrySha256,
    processInstanceId: before.processInstanceId,
    serverRequestId: execution.serverRequestId,
    executionReceiptDigest: execution.executionReceiptDigest,
    completionOutputDigest: execution.completionOutputDigest,
    executionKind: execution.executionKind,
    gpuExecution: execution.gpuExecution,
    authorityVerificationReceiptDigest: authority.verificationReceiptDigest,
    leaseAcquisitionReceiptDigest: lease.acquisitionReceiptDigest,
    leaseReleaseReceiptDigest: release.releaseReceiptDigest,
    claimBoundary: 'self-reported-holoserve-execution-bound-to-verified-control-plane',
    controlPlane: {
      scope: 'dispatcher-owned-control-plane',
      loopbackOnly: true,
      endpointResolved: true,
      healthProbed: true,
      leaseAcquired: true,
      leaseReleased: true,
    },
  });
  return { placement, response, receipt };
}
