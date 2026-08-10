import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FLEET_PLACEMENT_POLICY, type FleetPlacementOptions } from '../fleet-placement';
import type { FetchLike } from '../fleet-router';
import {
  HOLOSERVE_COMPLETION_OUTPUT_SCHEMA,
  HOLOSERVE_DISPATCH_AUTHORITY_SCHEMA,
  HOLOSERVE_DISPATCH_EXECUTION_BINDING_SCHEMA,
  HOLOSERVE_DISPATCH_LEASE_RELEASE_SCHEMA,
  HOLOSERVE_DISPATCH_LEASE_SCHEMA,
  HoloServePlacementDispatchError,
  dispatchHoloServePlacement,
  type HoloServeCompletionExecutionContext,
  type HoloServeDispatchLeaseContext,
  type HoloServeDispatchLeaseReleaseContext,
  type HoloServeDispatchVerificationContext,
  type HoloServePlacementDispatchOptions,
} from '../holoserve-placement-dispatch';
import type { LLMCompletionResponse } from '../types';

const MODEL = 'HoloMind-s0';
const DECISION_TIME = '2026-08-09T08:00:00.000Z';

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function artifactBinding(checkpoint = digest('a')): Record<string, unknown> {
  const files = {
    'meta.json': digest('b'),
    'tokenizer.json': digest('c'),
  };
  const bins = {
    schema: 'holoscript.holoserve-bins-binding.v0.1.0',
    files,
  };
  return {
    schema: 'holoscript.holoserve-model-artifact-binding.v0.1.0',
    available: true,
    checkpointSha256: checkpoint,
    tokenizerSha256: files['tokenizer.json'],
    bins: { ...bins, bindingSha256: sha256(bins) },
  };
}

function health(
  checkpoint = digest('a'),
  process = 'holoserve-0123456789abcdef'
): Record<string, unknown> {
  return {
    status: 'ok',
    backend: 'pytorch-holo',
    sovereign: true,
    llama_cpp: false,
    gguf: false,
    process_instance_id: process,
    model: { name: MODEL, params_millions: 85 },
    models: [MODEL],
    model_artifact_bindings: {
      schema: 'holoscript.holoserve-model-artifact-registry.v0.1.0',
      defaultModel: MODEL,
      models: { [MODEL]: artifactBinding(checkpoint) },
    },
  };
}

function staticFetch(healthPayload = health()): FetchLike {
  return vi.fn(async (url: string, _init?: Parameters<FetchLike>[1]) => {
    const path = new URL(url).pathname;
    const body =
      path === '/health'
        ? healthPayload
        : path === '/props'
          ? {
              default_generation_settings: { model: MODEL, n_ctx: 128 },
              model: MODEL,
              model_path: 'private-checkpoint.pt',
              total_slots: 1,
              backend: 'pytorch-holo',
              sovereign: true,
              grammars: [],
              models: [MODEL],
            }
          : path === '/slots'
            ? [{ id: 0, state: 0, is_processing: false, model: MODEL }]
            : null;
    return { ok: body !== null, json: async () => body };
  });
}

function placement(): FleetPlacementOptions {
  return {
    decisionTime: DECISION_TIME,
    leaseLedgerVersion: 7,
    manifest: {
      schema: 'fleet-placement-manifest/v1',
      requestId: 'request-holomind-1',
      idempotencyKey: 'idempotency-holomind-1',
      upstreamAttestationReceiptDigest: digest('1'),
      laneId: 'owned-metal-inference',
      laneManifestDigest: digest('2'),
      modelReleaseDigest: digest('3'),
      runtimeProfileDigest: digest('4'),
      licensePolicyDigest: digest('5'),
      resources: {
        gpuCount: 1,
        gpuMemoryMiB: 8_000,
        hostMemoryMiB: 4_000,
        scratchBytes: 1_000,
        slots: 1,
      },
      admittedWorkerSpecDigests: [digest('6')],
      allowedCustodyTiers: ['owned'],
      dataClass: 'internal',
      policy: { ...DEFAULT_FLEET_PLACEMENT_POLICY },
    },
    capabilities: [
      {
        schema: 'fleet-worker-capability/v1',
        workerId: 'laptop-holoserve',
        laneId: 'owned-metal-inference',
        laneManifestDigest: digest('2'),
        specDigest: digest('6'),
        custodyTier: 'owned',
        signingSeat: 'holokey-laptop',
        attestationReceiptDigest: digest('7'),
        freshness: {
          bootId: 'boot-laptop-1',
          sequence: 11,
          acceptedAt: '2026-08-09T07:59:00.000Z',
          expiresAt: '2026-08-09T08:10:00.000Z',
        },
        state: 'ready',
        islands: [
          {
            islandId: 'laptop-rtx3060',
            gpuCount: 1,
            gpuMemoryTotalMiB: 12_288,
            gpuMemoryFreeMiB: 10_000,
            hostMemoryFreeMiB: 32_000,
            scratchFreeBytes: 10_000,
            availableSlots: 1,
            activeLeaseCount: 0,
            lastAssignedOrdinal: 1,
            dataEndpointId: 'serve-laptop-holoserve',
            runtimeProfileDigests: [digest('4')],
            residentReleaseDigests: [digest('3')],
            admittedLicensePolicyDigests: [digest('5')],
            allowedDataClasses: ['internal'],
          },
        ],
      },
    ],
  };
}

function verifiedAuthority(context: HoloServeDispatchVerificationContext) {
  const servingHealth = health();
  return {
    schema: HOLOSERVE_DISPATCH_AUTHORITY_SCHEMA,
    verdict: 'verified' as const,
    capabilityDigest: context.capabilityDigest,
    exactProfileDigest: context.exactProfileDigest,
    model: context.exactProfile.model,
    inferenceRequestDigest: context.exactProfile.inferenceRequestDigest,
    artifactBindingSha256: sha256(artifactBinding()),
    artifactRegistrySha256: sha256(servingHealth.model_artifact_bindings),
    processInstanceId: 'holoserve-0123456789abcdef',
    requestAttestationReceiptDigest: context.manifest.upstreamAttestationReceiptDigest,
    workerAttestationReceiptDigest: context.capability.attestationReceiptDigest,
    workerSpecDigest: context.capability.specDigest,
    verificationReceiptDigest: digest('8'),
    verifiedAt: '2026-08-09T07:59:30.000Z',
    expiresAt: '2026-08-09T08:05:00.000Z',
  };
}

function acquiredLease(context: HoloServeDispatchLeaseContext) {
  return {
    schema: HOLOSERVE_DISPATCH_LEASE_SCHEMA,
    status: 'acquired' as const,
    leaseId: 'lease-holomind-1',
    requestId: context.requestId,
    idempotencyKeyDigest: context.idempotencyKeyDigest,
    workerId: context.workerId,
    islandId: context.islandId,
    workerBootId: context.workerBootId,
    capabilityDigest: context.capabilityDigest,
    exactProfileDigest: context.exactProfileDigest,
    inferenceRequestDigest: context.inferenceRequestDigest,
    model: context.model,
    placementReceiptDigest: context.placementReceiptDigest,
    endpointIdDigest: context.endpointIdDigest,
    artifactBindingSha256: context.artifactBindingSha256,
    artifactRegistrySha256: context.artifactRegistrySha256,
    processInstanceId: context.processInstanceId,
    authorityVerificationReceiptDigest: context.authorityVerificationReceiptDigest,
    previousLedgerVersion: context.previousLedgerVersion,
    ledgerVersion: context.previousLedgerVersion + 1,
    acquiredAt: DECISION_TIME,
    expiresAt: '2026-08-09T08:05:00.000Z',
    acquisitionReceiptDigest: digest('9'),
  };
}

function completion(
  context: Omit<HoloServeCompletionExecutionContext, 'signal'>,
  binding = artifactBinding(),
  observedAt = '2026-08-09T08:00:01.000Z'
): LLMCompletionResponse {
  const requestId = 'chatcmpl-holo-123';
  const processInstanceId = 'holoserve-0123456789abcdef';
  const outputDigest = sha256({
    schema: HOLOSERVE_COMPLETION_OUTPUT_SCHEMA,
    serverRequestId: requestId,
    model: MODEL,
    content: 'owned response',
    finishReason: 'stop',
    usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 },
  });
  return {
    content: 'owned response',
    usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 },
    model: MODEL,
    reportedModel: MODEL,
    provider: 'local-llm',
    finishReason: 'stop',
    raw: {
      id: requestId,
      model: MODEL,
      holo: {
        backend: 'pytorch-holo',
        sovereign: true,
        llama_cpp: false,
        process_instance_id: processInstanceId,
        model_artifact_binding: binding,
        model_artifact_binding_sha256: sha256(binding),
        execution: {
          schema: 'holoscript.holoserve-execution-receipt.v1',
          server_request_id: requestId,
          process_instance_id: processInstanceId,
          dispatch_binding_schema: HOLOSERVE_DISPATCH_EXECUTION_BINDING_SCHEMA,
          dispatch_request_sha256: context.inferenceRequestDigest,
          dispatch_lease_id: context.leaseId,
          dispatch_idempotency_key_sha256: context.idempotencyKeyDigest,
          model: MODEL,
          model_release_sha256: context.modelReleaseDigest,
          artifact_binding_sha256: context.artifactBindingSha256,
          artifact_registry_sha256: context.artifactRegistrySha256,
          completion_output_sha256: outputDigest,
          observed_at: observedAt,
          execution_kind: 'model-generation',
          gpu_execution: true,
          hardware: {
            device_type: 'cuda',
            parameter_matches_target: true,
            telemetry_available: true,
          },
          cuda_memory: { allocated_bytes: 1 },
        },
      },
    },
  };
}

function baseOptions() {
  return {
    placement: placement(),
    model: MODEL,
    request: { messages: [{ role: 'user' as const, content: 'hello' }] },
    verifyAuthority: vi.fn(async (context: HoloServeDispatchVerificationContext) =>
      verifiedAuthority(context)
    ),
    resolveEndpoint: vi.fn(async () => 'http://127.0.0.1:8099'),
    acquireLease: vi.fn(async (context: HoloServeDispatchLeaseContext) => acquiredLease(context)),
    releaseLease: vi.fn(
      async (
        lease: ReturnType<typeof acquiredLease>,
        context: HoloServeDispatchLeaseReleaseContext
      ) => ({
        schema: HOLOSERVE_DISPATCH_LEASE_RELEASE_SCHEMA,
        status: 'released' as const,
        leaseId: lease.leaseId,
        acquisitionReceiptDigest: lease.acquisitionReceiptDigest,
        outcome: context.outcome,
        serverRequestId: context.serverRequestId,
        executionReceiptDigest: context.executionReceiptDigest,
        executionObservedAt: context.executionObservedAt,
        releasedAt: '2026-08-09T08:00:02.000Z',
        releaseReceiptDigest: digest('d'),
      })
    ),
    fetchImpl: staticFetch(),
    executeCompletion: vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) => completion(context)
    ),
  };
}

describe('dispatchHoloServePlacement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DECISION_TIME));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('dispatches only after authority verification, strict discovery, and an atomic lease', async () => {
    const options = baseOptions();
    const result = await dispatchHoloServePlacement(options);

    expect(options.verifyAuthority).toHaveBeenCalledOnce();
    expect(options.acquireLease).toHaveBeenCalledOnce();
    expect(options.executeCompletion).toHaveBeenCalledWith(
      'http://127.0.0.1:8099',
      MODEL,
      options.request,
      expect.objectContaining({
        leaseId: 'lease-holomind-1',
        modelReleaseDigest: digest('3'),
      })
    );
    expect(options.releaseLease).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'acquired', previousLedgerVersion: 7, ledgerVersion: 8 }),
      expect.objectContaining({
        outcome: 'completed',
        serverRequestId: 'chatcmpl-holo-123',
      })
    );
    expect(result.receipt).toMatchObject({
      status: 'dispatched',
      workerId: 'laptop-holoserve',
      islandId: 'laptop-rtx3060',
      model: MODEL,
      processInstanceId: 'holoserve-0123456789abcdef',
      serverRequestId: 'chatcmpl-holo-123',
      executionKind: 'model-generation',
      gpuExecution: true,
      authorityVerificationReceiptDigest: digest('8'),
      leaseAcquisitionReceiptDigest: digest('9'),
      leaseReleaseReceiptDigest: digest('d'),
    });
    expect(result.receipt.controlPlane).toEqual({
      scope: 'dispatcher-owned-control-plane',
      loopbackOnly: true,
      endpointResolved: true,
      healthProbed: true,
      leaseAcquired: true,
      leaseReleased: true,
    });
    expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(Object.isFrozen(result.response)).toBe(true);
    const serialized = JSON.stringify(result.receipt);
    expect(serialized).not.toContain('127.0.0.1');
    expect(serialized).not.toContain('serve-laptop-holoserve');
    expect(serialized).not.toContain('hello');
    expect(result.receipt.inferenceRequestDigest).toBe(sha256(options.request));
    expect(options.fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' })
    );
  });

  it('sends the bound dispatch envelope through the default loopback executor', async () => {
    const options: HoloServePlacementDispatchOptions = baseOptions();
    options.executeCompletion = undefined;
    const discoveryFetch = staticFetch();
    let sentBody: Record<string, unknown> | null = null;
    let completionRedirect: string | undefined;
    options.fetchImpl = vi.fn(async (url: string, init) => {
      if (new URL(url).pathname !== '/v1/chat/completions') {
        return discoveryFetch(url, init);
      }
      completionRedirect = init?.redirect;
      sentBody = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
      const dispatch = sentBody.holo_dispatch as Record<string, string>;
      const response = completion({
        deadline: dispatch.deadline!,
        leaseId: dispatch.lease_id!,
        inferenceRequestDigest: dispatch.request_sha256!,
        idempotencyKeyDigest: dispatch.idempotency_key_sha256!,
        modelReleaseDigest: dispatch.model_release_sha256!,
        artifactBindingSha256: dispatch.artifact_binding_sha256!,
        artifactRegistrySha256: dispatch.artifact_registry_sha256!,
      });
      const raw = response.raw as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          ...raw,
          choices: [{ message: { content: response.content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
        }),
      };
    });

    const result = await dispatchHoloServePlacement(options);
    expect(result.response.content).toBe('owned response');
    expect(completionRedirect).toBe('error');
    expect(sentBody).toMatchObject({
      model: MODEL,
      messages: [{ role: 'user', content: 'hello' }],
      holo_dispatch: {
        schema: HOLOSERVE_DISPATCH_EXECUTION_BINDING_SCHEMA,
        request_sha256: sha256(options.request),
        lease_id: 'lease-holomind-1',
        idempotency_key_sha256: result.receipt.idempotencyKeyDigest,
        model_release_sha256: digest('3'),
      },
    });
  });

  it('does not resolve or probe an endpoint when trusted authority is absent', async () => {
    const options = baseOptions();
    options.verifyAuthority = vi.fn(async () => null);

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'AUTHORITY_NOT_VERIFIED',
    });
    expect(options.resolveEndpoint).not.toHaveBeenCalled();
    expect(options.fetchImpl).not.toHaveBeenCalled();
    expect(options.acquireLease).not.toHaveBeenCalled();
    expect(options.executeCompletion).not.toHaveBeenCalled();
  });

  it('rejects an ecosystem-blacklisted model before authority or discovery', async () => {
    const options = baseOptions();
    options.model = 'qwen2.5-coder-7b';

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'MODEL_POLICY_DENIED',
    });
    expect(options.verifyAuthority).not.toHaveBeenCalled();
    expect(options.resolveEndpoint).not.toHaveBeenCalled();
    expect(options.fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an unsupported request surface before authority or lease acquisition', async () => {
    const options: HoloServePlacementDispatchOptions = baseOptions();
    options.request = { ...options.request, stream: true };

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'DISPATCH_REQUEST_UNSUPPORTED',
    });
    expect(options.verifyAuthority).not.toHaveBeenCalled();
    expect(options.resolveEndpoint).not.toHaveBeenCalled();
    expect(options.acquireLease).not.toHaveBeenCalled();
  });

  it('rejects malformed supported request fields before authority or lease acquisition', async () => {
    const options: HoloServePlacementDispatchOptions = baseOptions();
    options.request = { ...options.request, maxTokens: -1 };

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'DISPATCH_REQUEST_INVALID',
    });
    expect(options.verifyAuthority).not.toHaveBeenCalled();
    expect(options.acquireLease).not.toHaveBeenCalled();
  });

  it('rejects a request beyond the discovered runtime window before lease acquisition', async () => {
    const options: HoloServePlacementDispatchOptions = baseOptions();
    options.request = { ...options.request, maxTokens: 129 };

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'DISPATCH_REQUEST_RUNTIME_REJECTED',
    });
    expect(options.verifyAuthority).toHaveBeenCalledOnce();
    expect(options.acquireLease).not.toHaveBeenCalled();
  });

  it('rejects plaintext LAN endpoints before discovery or lease acquisition', async () => {
    const options = baseOptions();
    options.resolveEndpoint = vi.fn(async () => 'http://192.168.0.23:8099');

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'REMOTE_TRANSPORT_FORBIDDEN',
    });
    expect(options.fetchImpl).not.toHaveBeenCalled();
    expect(options.acquireLease).not.toHaveBeenCalled();
  });

  it('forces redirect errors so loopback probes cannot follow to another origin', async () => {
    const options = baseOptions();
    const requestedURLs: string[] = [];
    options.fetchImpl = vi.fn(async (url: string, init) => {
      requestedURLs.push(url);
      if (init?.redirect === 'error') throw new TypeError('redirect blocked');
      requestedURLs.push('http://192.168.0.23:8099/stolen');
      return { ok: true, json: async () => health() };
    });

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'HOLOSERVE_DISCOVERY_REJECTED',
    });
    expect(options.fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/127\.0\.0\.1:8099\//u),
      expect.objectContaining({ redirect: 'error' })
    );
    expect(requestedURLs).not.toContain('http://192.168.0.23:8099/stolen');
    expect(options.acquireLease).not.toHaveBeenCalled();
  });

  it('rejects an authority proof for another model request before endpoint resolution', async () => {
    const options = baseOptions();
    options.verifyAuthority = vi.fn(async (context: HoloServeDispatchVerificationContext) => ({
      ...verifiedAuthority(context),
      inferenceRequestDigest: digest('e'),
    }));

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'AUTHORITY_PROOF_MISMATCH',
    });
    expect(options.resolveEndpoint).not.toHaveBeenCalled();
    expect(options.fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects historical placement and capability proofs against wall-clock time', async () => {
    vi.setSystemTime(new Date('2026-08-09T08:11:00.000Z'));
    const options = baseOptions();

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'PLACEMENT_DECISION_STALE',
    });
    expect(options.verifyAuthority).not.toHaveBeenCalled();
    expect(options.resolveEndpoint).not.toHaveBeenCalled();
  });

  it('rejects a lease proof that swaps live artifact identity before generation', async () => {
    const options = baseOptions();
    options.acquireLease = vi.fn(async (context: HoloServeDispatchLeaseContext) => ({
      ...acquiredLease(context),
      artifactBindingSha256: digest('e'),
    }));

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'LEASE_PROOF_MISMATCH',
    });
    expect(options.executeCompletion).not.toHaveBeenCalled();
  });

  it('rejects live HoloServe identity that is not pinned by verified authority', async () => {
    const options = baseOptions();
    options.verifyAuthority = vi.fn(async (context: HoloServeDispatchVerificationContext) => ({
      ...verifiedAuthority(context),
      artifactBindingSha256: digest('e'),
    }));

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'HOLOSERVE_AUTHORITY_IDENTITY_MISMATCH',
    });
    expect(options.acquireLease).not.toHaveBeenCalled();
    expect(options.executeCompletion).not.toHaveBeenCalled();
  });

  it('releases the lease as failed when HoloServe artifact identity drifts', async () => {
    const options = baseOptions();
    let healthReads = 0;
    options.fetchImpl = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/health') {
        healthReads += 1;
        return {
          ok: true,
          json: async () => (healthReads >= 4 ? health(digest('f')) : health()),
        };
      }
      if (path === '/props') {
        return {
          ok: true,
          json: async () => ({
            default_generation_settings: { model: MODEL, n_ctx: 128 },
            model: MODEL,
            model_path: 'private-checkpoint.pt',
            total_slots: 1,
            backend: 'pytorch-holo',
            sovereign: true,
            grammars: [],
            models: [MODEL],
          }),
        };
      }
      return {
        ok: true,
        json: async () => [{ id: 0, state: 0, is_processing: false, model: MODEL }],
      };
    });

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'HOLOSERVE_IDENTITY_DRIFT',
    });
    expect(options.releaseLease).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failed' })
    );
  });

  it('rejects execution observed outside the lease and releases as failed', async () => {
    const options = baseOptions();
    options.executeCompletion = vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) => completion(context, artifactBinding(), '2026-08-09T08:06:00.000Z')
    );

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'EXECUTION_WINDOW_INVALID',
    });
    expect(options.releaseLease).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failed' })
    );
  });

  it.each([
    { binding: 'request digest', executionPatch: { dispatch_request_sha256: digest('e') } },
    { binding: 'lease ID', executionPatch: { dispatch_lease_id: 'lease-other' } },
    {
      binding: 'idempotency digest',
      executionPatch: { dispatch_idempotency_key_sha256: digest('e') },
    },
    { binding: 'model release', executionPatch: { model_release_sha256: digest('e') } },
    { binding: 'artifact binding', executionPatch: { artifact_binding_sha256: digest('e') } },
    { binding: 'artifact registry', executionPatch: { artifact_registry_sha256: digest('e') } },
    { binding: 'completion output', executionPatch: { completion_output_sha256: digest('e') } },
  ])('rejects a mismatched execution binding: $binding', async ({ executionPatch }) => {
    const options = baseOptions();
    options.executeCompletion = vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) => {
        const response = completion(context);
        const raw = response.raw as Record<string, unknown>;
        const holo = raw.holo as Record<string, unknown>;
        const execution = holo.execution as Record<string, unknown>;
        holo.execution = { ...execution, ...executionPatch };
        return response;
      }
    );

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'EXECUTION_RECEIPT_INVALID',
    });
    expect(options.releaseLease).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failed' })
    );
  });

  it.each([
    {
      contradiction: 'gpu_execution false',
      executionPatch: { gpu_execution: false },
    },
    {
      contradiction: 'CPU device',
      executionPatch: {
        hardware: {
          device_type: 'cpu',
          parameter_matches_target: true,
          telemetry_available: true,
        },
      },
    },
    {
      contradiction: 'parameter device mismatch',
      executionPatch: {
        hardware: {
          device_type: 'cuda',
          parameter_matches_target: false,
          telemetry_available: true,
        },
      },
    },
    {
      contradiction: 'telemetry unavailable',
      executionPatch: {
        hardware: {
          device_type: 'cuda',
          parameter_matches_target: true,
          telemetry_available: false,
        },
      },
    },
  ])('rejects contradictory GPU proof: $contradiction', async ({ executionPatch }) => {
    const options = baseOptions();
    options.executeCompletion = vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) => {
        const response = completion(context);
        const raw = response.raw as Record<string, unknown>;
        const holo = raw.holo as Record<string, unknown>;
        const execution = holo.execution as Record<string, unknown>;
        holo.execution = { ...execution, ...executionPatch };
        return response;
      }
    );

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'EXECUTION_RECEIPT_INVALID',
    });
    expect(options.releaseLease).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failed' })
    );
  });

  it('uses frozen input snapshots when a verifier mutates caller-owned objects', async () => {
    const options = baseOptions();
    options.verifyAuthority = vi.fn(async (context: HoloServeDispatchVerificationContext) => {
      options.placement.manifest.modelReleaseDigest = digest('f');
      options.placement.manifest.idempotencyKey = 'tampered-idempotency';
      options.request.messages[0]!.content = 'tampered prompt';
      return verifiedAuthority(context);
    });

    const result = await dispatchHoloServePlacement(options);
    expect(result.receipt.modelReleaseDigest).toBe(digest('3'));
    expect(result.receipt.inferenceRequestDigest).toBe(
      sha256({ messages: [{ role: 'user', content: 'hello' }] })
    );
    expect(options.executeCompletion).toHaveBeenCalledWith(
      expect.anything(),
      MODEL,
      { messages: [{ role: 'user', content: 'hello' }] },
      expect.anything()
    );
  });

  it('returns the frozen response snapshot when executor-owned output mutates later', async () => {
    const options = baseOptions();
    const delegate = staticFetch();
    let healthReads = 0;
    let executorOwnedResponse: LLMCompletionResponse | null = null;
    options.executeCompletion = vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) => {
        executorOwnedResponse = completion(context);
        return executorOwnedResponse;
      }
    );
    options.fetchImpl = vi.fn(async (url: string, init) => {
      if (new URL(url).pathname === '/health') {
        healthReads += 1;
        if (healthReads >= 4 && executorOwnedResponse) {
          executorOwnedResponse.content = 'mutated after execution';
        }
      }
      return delegate(url, init);
    });

    const result = await dispatchHoloServePlacement(options);
    expect(executorOwnedResponse?.content).toBe('mutated after execution');
    expect(result.response.content).toBe('owned response');
    expect(Object.isFrozen(result.response)).toBe(true);
  });

  it('rejects completion output that does not match the execution-receipt digest', async () => {
    const options = baseOptions();
    options.executeCompletion = vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) => {
        const response = completion(context);
        response.content = 'tampered before return';
        return response;
      }
    );

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'EXECUTION_RECEIPT_INVALID',
    });
    expect(options.releaseLease).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failed' })
    );
  });

  it('rejects actionable tool output from the text-only v1 receipt lane', async () => {
    const options = baseOptions();
    options.executeCompletion = vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) => ({
        ...completion(context),
        finishReason: 'tool_use' as const,
        toolUses: [
          {
            type: 'tool_use' as const,
            id: 'tool-1',
            name: 'dangerous_action',
            input: { target: 'unreceipted' },
          },
        ],
        assistantBlocks: [],
      })
    );

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'EXECUTION_OUTPUT_INVALID',
    });
    expect(options.releaseLease).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failed' })
    );
  });

  it('keeps the lease held after cooperative client cancellation without server cessation proof', async () => {
    const options = baseOptions();
    options.executeCompletion = vi.fn(
      async (
        _baseURL: string,
        _model: string,
        _request: unknown,
        context: HoloServeCompletionExecutionContext
      ) =>
        new Promise<LLMCompletionResponse>((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
            once: true,
          });
        })
    );

    const pending = dispatchHoloServePlacement(options);
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'EXECUTION_CESSATION_UNVERIFIED',
    });
    await vi.advanceTimersByTimeAsync(6_001);
    await rejection;
    expect(options.releaseLease).not.toHaveBeenCalled();
  });

  it('keeps the lease held when an executor does not acknowledge cancellation', async () => {
    const options = baseOptions();
    options.executeCompletion = vi.fn(
      async () => new Promise<LLMCompletionResponse>(() => undefined)
    );

    const pending = dispatchHoloServePlacement(options);
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'EXECUTION_CESSATION_UNVERIFIED',
    });
    await vi.advanceTimersByTimeAsync(7_001);
    await rejection;
    expect(options.releaseLease).not.toHaveBeenCalled();
  });

  it('rejects a release proof replayed from another dispatch outcome', async () => {
    const options = baseOptions();
    options.releaseLease = vi.fn(
      async (
        lease: ReturnType<typeof acquiredLease>,
        context: HoloServeDispatchLeaseReleaseContext
      ) => ({
        schema: HOLOSERVE_DISPATCH_LEASE_RELEASE_SCHEMA,
        status: 'released' as const,
        leaseId: lease.leaseId,
        acquisitionReceiptDigest: lease.acquisitionReceiptDigest,
        outcome: context.outcome === 'completed' ? ('failed' as const) : ('completed' as const),
        serverRequestId: context.serverRequestId,
        executionReceiptDigest: context.executionReceiptDigest,
        executionObservedAt: context.executionObservedAt,
        releasedAt: '2026-08-09T08:00:02.000Z',
        releaseReceiptDigest: digest('d'),
      })
    );

    await expect(dispatchHoloServePlacement(options)).rejects.toMatchObject({
      code: 'LEASE_RELEASE_UNVERIFIED',
    });
  });

  it('lets only one concurrent caller pass a caller-custodied CAS lease', async () => {
    const options = baseOptions();
    let acquired = false;
    options.acquireLease = vi.fn(async (context: HoloServeDispatchLeaseContext) => {
      if (acquired) return null;
      acquired = true;
      return acquiredLease(context);
    });

    const outcomes = await Promise.allSettled([
      dispatchHoloServePlacement(options),
      dispatchHoloServePlacement(options),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      HoloServePlacementDispatchError
    );
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'LEASE_NOT_ACQUIRED',
    });
    expect(options.executeCompletion).toHaveBeenCalledOnce();
  });
});
