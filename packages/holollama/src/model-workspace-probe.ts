import { createHash } from 'node:crypto';

export const MODEL_WORKSPACE_RECEIPT_SCHEMA = 'holoscript.model-workspace-receipt.v0.1.0' as const;
export const MODEL_WORKSPACE_CAPABILITY_SCHEMA =
  'holoscript.model-workspace-capability.v0.1.0' as const;
export const MODEL_WORKSPACE_HASH_CANONICALIZATION =
  'holoscript.integer-measurement-json.v0.1.0' as const;
export const HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA =
  'holollama.model-workspace-probe.v0.1.0' as const;

export type ModelWorkspaceEstimator =
  | 'explicit_pair_average_v0'
  | 'corpus_position_average_v1';

export interface ModelWorkspaceConcept {
  tokenId: number;
  token: string;
  scoreE8: number;
  probabilityE8: number;
}

export interface ModelWorkspaceLayerObservation {
  layer: number;
  position: number;
  concepts: ModelWorkspaceConcept[];
  controlConcepts: ModelWorkspaceConcept[];
  tailProbabilityMassE8: number;
}

export interface ModelWorkspaceReceipt {
  schema: typeof MODEL_WORKSPACE_RECEIPT_SCHEMA;
  kind: 'ModelWorkspaceReceipt';
  mode: 'observe';
  createdAt: string;
  requestId: string;
  model: {
    requestedId: string;
    servedId: string;
    checkpointSha256: string;
    architecture: string;
  };
  tokenizer: {
    sha256: string;
    vocabSize: number;
  };
  lens: {
    method: 'jacobian_lens';
    estimator: ModelWorkspaceEstimator;
    paperParity: boolean;
    parityScope?: 'reference-estimator-only';
    paperExperimentParity?: false;
    implementationVersion: string;
    corpusSha256: string;
    lensSha256: string;
    positionPolicy: string;
    jacobianCount: number;
    k: number;
  };
  input: {
    promptSha256: string;
    tokenCount: number;
    originalTokenCount?: number;
    truncated?: boolean;
    truncationPolicy?: 'none' | 'left-truncate-to-model-block-size';
    layers: number[];
    requestedPositions: number[];
    positions: number[];
    seed: null;
  };
  observation: {
    status: 'observed';
    layerBand: { start: number; end: number };
    layers: ModelWorkspaceLayerObservation[];
  };
  observationSha256: string;
  runtime: {
    backend: 'pytorch-holo';
    device: string;
    torchVersion: string;
    pythonVersion: string;
    holoserveVersion: string;
  };
  integrity: {
    algorithm: 'sha256';
    canonicalization: typeof MODEL_WORKSPACE_HASH_CANONICALIZATION;
  };
  safety: {
    readOnly: true;
    interventionApplied: false;
    rawActivationsPersisted: false;
    identityBinding: 'none';
    retention: 'receipt_only';
  };
  limitations: string[];
  receiptHash: string;
}

export interface ModelWorkspaceReceiptExpectation {
  requestedModel: string | null;
  promptSha256: string;
  layers: number[];
  requestedPositions: number[];
  k: number;
  lensSha256: string;
  estimator: ModelWorkspaceEstimator;
}

export interface HoloLlamaWorkspaceProbeFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type HoloLlamaWorkspaceProbeFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<HoloLlamaWorkspaceProbeFetchResponse>;

export interface ObserveHoloLlamaModelWorkspaceOptions {
  endpoint: string;
  prompt: string;
  model?: string;
  layers?: number[];
  positions?: number[];
  k?: number;
  timeoutMs?: number;
  generatedAt?: string;
  fetchImpl?: HoloLlamaWorkspaceProbeFetch;
}

export interface HoloLlamaModelWorkspaceProbeReceipt {
  schema: typeof HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA;
  ok: boolean;
  status: 'observed' | 'unsupported' | 'failed';
  generatedAt: string;
  endpoint: string;
  requestedModel: string | null;
  backend: string | null;
  capability: {
    observe: boolean;
    intervention: false;
    reason?: string;
  };
  evidence: {
    healthStatus: number | null;
    observeStatus: number | null;
  };
  modelWorkspaceReceipt?: ModelWorkspaceReceipt;
  sourceReceiptHash?: string;
  blockers: string[];
  receiptHash: string;
}

interface JsonProbe {
  ok: boolean;
  status: number;
  body: unknown;
  error?: string;
}

export async function observeHoloLlamaModelWorkspace(
  options: ObserveHoloLlamaModelWorkspaceOptions
): Promise<HoloLlamaModelWorkspaceProbeReceipt> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  let endpoint: string;
  try {
    endpoint = normalizeEndpoint(options.endpoint);
  } catch (error) {
    return finalize({
      schema: HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA,
      ok: false,
      status: 'failed',
      generatedAt,
      endpoint: '<invalid>',
      requestedModel: options.model ?? null,
      backend: null,
      capability: { observe: false, intervention: false, reason: 'invalid_endpoint' },
      evidence: { healthStatus: null, observeStatus: null },
      blockers: [error instanceof Error ? error.message : String(error)],
    });
  }
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const health = await fetchJson(fetchImpl, `${endpoint}/health`, {
    timeoutMs: options.timeoutMs,
  });
  const healthBody = isRecord(health.body) ? health.body : {};
  const backend = typeof healthBody.backend === 'string' ? healthBody.backend : null;
  const requestedModel =
    options.model ??
    (isRecord(healthBody.model) && typeof healthBody.model.name === 'string'
      ? healthBody.model.name
      : null);

  if (!health.ok) {
    return finalize({
      schema: HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA,
      ok: false,
      status: 'failed',
      generatedAt,
      endpoint,
      requestedModel,
      backend,
      capability: { observe: false, intervention: false, reason: 'health_probe_failed' },
      evidence: { healthStatus: health.status || null, observeStatus: null },
      blockers: [`health probe failed: ${health.error ?? `HTTP ${health.status}`}`],
    });
  }

  const capabilityRoot = isRecord(healthBody.model_workspace_probe)
    ? healthBody.model_workspace_probe
    : null;
  const modelCapabilities =
    capabilityRoot && isRecord(capabilityRoot.models) ? capabilityRoot.models : null;
  const selectedCapability =
    modelCapabilities && requestedModel && isRecord(modelCapabilities[requestedModel])
      ? modelCapabilities[requestedModel]
      : null;
  const advertisedLayers =
    selectedCapability &&
    Array.isArray(selectedCapability.layers) &&
    selectedCapability.layers.length > 0 &&
    selectedCapability.layers.every((layer) => Number.isSafeInteger(layer))
      ? (selectedCapability.layers as number[])
      : [];
  const advertisedEstimator =
    selectedCapability &&
    isSupportedWorkspaceEstimator(
      selectedCapability.estimator,
      selectedCapability.paperParity,
      selectedCapability.parityScope,
      selectedCapability.paperExperimentParity
    )
      ? selectedCapability.estimator
      : null;
  const observeSupported =
    backend === 'pytorch-holo' &&
    capabilityRoot?.schema === MODEL_WORKSPACE_CAPABILITY_SCHEMA &&
    capabilityRoot.observe === true &&
    capabilityRoot.intervention === false &&
    selectedCapability?.schema === MODEL_WORKSPACE_CAPABILITY_SCHEMA &&
    selectedCapability?.observe === true &&
    selectedCapability.intervention === false &&
    selectedCapability.method === 'jacobian_lens' &&
    advertisedEstimator !== null &&
    isSha256(selectedCapability.lensSha256) &&
    advertisedLayers.length > 0;

  if (!observeSupported) {
    const reason =
      backend === 'llama.cpp'
        ? 'backend_has_no_differentiable_hidden_state_access'
        : selectedCapability && typeof selectedCapability.reason === 'string'
          ? selectedCapability.reason
          : 'model_workspace_probe_not_advertised';
    return finalize({
      schema: HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA,
      ok: false,
      status: 'unsupported',
      generatedAt,
      endpoint,
      requestedModel,
      backend,
      capability: { observe: false, intervention: false, reason },
      evidence: { healthStatus: health.status, observeStatus: null },
      blockers: [reason],
    });
  }

  const expectedLayers = [...new Set(options.layers ?? advertisedLayers)].sort((a, b) => a - b);
  const expectedPositions = options.positions ? [...options.positions] : [-1];
  const expectedK = options.k ?? 10;
  const expectation: ModelWorkspaceReceiptExpectation = {
    requestedModel,
    promptSha256: sha256Text(options.prompt),
    layers: expectedLayers,
    requestedPositions: expectedPositions,
    k: expectedK,
    lensSha256: String(selectedCapability!.lensSha256),
    estimator: advertisedEstimator!,
  };

  const observe = await fetchJson(fetchImpl, `${endpoint}/v1/model-workspace/observe`, {
    timeoutMs: options.timeoutMs,
    method: 'POST',
    body: {
      prompt: options.prompt,
      ...(requestedModel ? { model: requestedModel } : {}),
      ...(options.layers ? { layers: options.layers } : {}),
      ...(options.positions ? { positions: options.positions } : {}),
      ...(options.k !== undefined ? { k: options.k } : {}),
    },
  });
  if (!observe.ok) {
    return finalize({
      schema: HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA,
      ok: false,
      status: 'failed',
      generatedAt,
      endpoint,
      requestedModel,
      backend,
      capability: { observe: true, intervention: false },
      evidence: { healthStatus: health.status, observeStatus: observe.status },
      blockers: [`workspace observation failed: ${observe.error ?? `HTTP ${observe.status}`}`],
    });
  }

  const validation = validateModelWorkspaceReceipt(observe.body, expectation);
  if (!validation.ok || !validation.receipt) {
    return finalize({
      schema: HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA,
      ok: false,
      status: 'failed',
      generatedAt,
      endpoint,
      requestedModel,
      backend,
      capability: { observe: true, intervention: false },
      evidence: { healthStatus: health.status, observeStatus: observe.status },
      blockers: validation.blockers,
    });
  }

  return finalize({
    schema: HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA,
    ok: true,
    status: 'observed',
    generatedAt,
    endpoint,
    requestedModel,
    backend,
    capability: { observe: true, intervention: false },
    evidence: { healthStatus: health.status, observeStatus: observe.status },
    modelWorkspaceReceipt: validation.receipt,
    sourceReceiptHash: validation.receipt.receiptHash,
    blockers: [],
  });
}

export function validateModelWorkspaceReceipt(
  value: unknown,
  expectation: ModelWorkspaceReceiptExpectation | null = null
): { ok: boolean; receipt?: ModelWorkspaceReceipt; blockers: string[] } {
  const blockers: string[] = [];
  if (!isRecord(value)) return { ok: false, blockers: ['receipt body is not an object'] };
  if (value.schema !== MODEL_WORKSPACE_RECEIPT_SCHEMA) {
    blockers.push(`unexpected receipt schema: ${String(value.schema)}`);
  }
  if (value.kind !== 'ModelWorkspaceReceipt')
    blockers.push('receipt kind must be ModelWorkspaceReceipt');
  if (value.mode !== 'observe') blockers.push('receipt mode must be observe');
  if (!isSha256(value.receiptHash)) {
    blockers.push('receiptHash must be a sha256 digest');
  }
  if (!isSha256(value.observationSha256))
    blockers.push('observationSha256 must be a sha256 digest');
  if (
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.requestId !== 'string' ||
    value.requestId.length < 1 ||
    value.requestId.length > 256
  ) {
    blockers.push('receipt timestamp and request id are required');
  }
  const model = isRecord(value.model) ? value.model : null;
  if (
    !model ||
    typeof model.requestedId !== 'string' ||
    model.requestedId.length < 1 ||
    typeof model.servedId !== 'string' ||
    model.servedId.length < 1 ||
    !isSha256(model.checkpointSha256) ||
    typeof model.architecture !== 'string' ||
    model.architecture.length < 1
  ) {
    blockers.push('model binding is incomplete');
  }
  if (
    expectation?.requestedModel &&
    (model?.servedId !== expectation.requestedModel ||
      model.requestedId !== expectation.requestedModel)
  ) {
    blockers.push(
      `served model '${String(model?.servedId)}' does not match '${expectation.requestedModel}'`
    );
  }
  const tokenizer = isRecord(value.tokenizer) ? value.tokenizer : null;
  if (
    !tokenizer ||
    !isSha256(tokenizer.sha256) ||
    !Number.isSafeInteger(tokenizer.vocabSize) ||
    Number(tokenizer.vocabSize) < 1
  ) {
    blockers.push('tokenizer binding is incomplete');
  }
  const lens = isRecord(value.lens) ? value.lens : null;
  if (lens?.method !== 'jacobian_lens') blockers.push('lens method must be jacobian_lens');
  if (
    !lens ||
    !isSupportedWorkspaceEstimator(
      lens.estimator,
      lens.paperParity,
      lens.parityScope,
      lens.paperExperimentParity
    ) ||
    !isSha256(lens.corpusSha256) ||
    !isSha256(lens.lensSha256) ||
    typeof lens.implementationVersion !== 'string' ||
    lens.implementationVersion.length < 1 ||
    !isSupportedWorkspacePositionPolicy(lens.estimator, lens.positionPolicy) ||
    !Number.isSafeInteger(lens.jacobianCount) ||
    Number(lens.jacobianCount) < 1 ||
    !Number.isSafeInteger(lens.k) ||
    Number(lens.k) < 1 ||
    Number(lens.k) > 25
  ) {
    blockers.push('lens provenance or sparse-readout bound is invalid');
  }
  const input = isRecord(value.input) ? value.input : null;
  const positions = input && Array.isArray(input.positions) ? input.positions : null;
  const requestedPositions =
    input && Array.isArray(input.requestedPositions) ? input.requestedPositions : null;
  const inputLayers = input && Array.isArray(input.layers) ? input.layers : null;
  const hasTruncationMetadata = Boolean(
    input &&
      ('originalTokenCount' in input || 'truncated' in input || 'truncationPolicy' in input)
  );
  const validTruncationMetadata = Boolean(
    input &&
      Number.isSafeInteger(input.originalTokenCount) &&
      Number(input.originalTokenCount) >= Number(input.tokenCount) &&
      typeof input.truncated === 'boolean' &&
      input.truncated === (Number(input.originalTokenCount) > Number(input.tokenCount)) &&
      input.truncationPolicy ===
        (input.truncated ? 'left-truncate-to-model-block-size' : 'none')
  );
  if (
    !input ||
    !isSha256(input.promptSha256) ||
    !Number.isSafeInteger(input.tokenCount) ||
    Number(input.tokenCount) < 1 ||
    !inputLayers ||
    inputLayers.length < 1 ||
    inputLayers.some((layer) => !Number.isSafeInteger(layer) || Number(layer) < 0) ||
    new Set(inputLayers).size !== inputLayers.length ||
    !requestedPositions ||
    requestedPositions.length < 1 ||
    requestedPositions.length > 4 ||
    requestedPositions.some((position) => !Number.isSafeInteger(position)) ||
    !positions ||
    positions.length < 1 ||
    positions.length > 4 ||
    positions.some((position) => !Number.isSafeInteger(position) || Number(position) < 0) ||
    new Set(positions).size !== positions.length ||
    requestedPositions.length !== positions.length ||
    input.seed !== null ||
    ((lens?.estimator === 'corpus_position_average_v1' || hasTruncationMetadata) &&
      !validTruncationMetadata)
  ) {
    blockers.push('bounded input provenance is invalid');
  }
  if (expectation) {
    if (input?.promptSha256 !== expectation.promptSha256) {
      blockers.push('receipt prompt hash does not match the observation request');
    }
    if (!arraysEqual(inputLayers, expectation.layers)) {
      blockers.push('receipt layers do not match the observation request');
    }
    if (!arraysEqual(requestedPositions, expectation.requestedPositions)) {
      blockers.push('receipt positions do not match the observation request');
    }
    if (lens?.k !== expectation.k)
      blockers.push('receipt k does not match the observation request');
    if (lens?.lensSha256 !== expectation.lensSha256) {
      blockers.push('receipt lens hash does not match the advertised model capability');
    }
    if (lens?.estimator !== expectation.estimator) {
      blockers.push('receipt estimator does not match the advertised model capability');
    }
  }
  blockers.push(
    ...validateWorkspaceObservation(
      isRecord(value.observation) ? value.observation : null,
      lens && Number.isSafeInteger(lens.k) ? Number(lens.k) : null,
      inputLayers,
      positions,
      tokenizer && Number.isSafeInteger(tokenizer.vocabSize) ? Number(tokenizer.vocabSize) : null
    )
  );
  const runtime = isRecord(value.runtime) ? value.runtime : null;
  if (
    runtime?.backend !== 'pytorch-holo' ||
    typeof runtime.device !== 'string' ||
    runtime.device.length < 1 ||
    typeof runtime.torchVersion !== 'string' ||
    runtime.torchVersion.length < 1 ||
    typeof runtime.pythonVersion !== 'string' ||
    runtime.pythonVersion.length < 1 ||
    typeof runtime.holoserveVersion !== 'string' ||
    runtime.holoserveVersion.length < 1
  ) {
    blockers.push('runtime provenance is incomplete or is not pytorch-holo');
  }
  const integrity = isRecord(value.integrity) ? value.integrity : null;
  if (
    integrity?.algorithm !== 'sha256' ||
    integrity.canonicalization !== MODEL_WORKSPACE_HASH_CANONICALIZATION
  ) {
    blockers.push('receipt hash canonicalization is missing or unsupported');
  }
  const safety = isRecord(value.safety) ? value.safety : null;
  if (
    !safety ||
    safety.readOnly !== true ||
    safety.interventionApplied !== false ||
    safety.rawActivationsPersisted !== false ||
    safety.identityBinding !== 'none' ||
    safety.retention !== 'receipt_only'
  ) {
    blockers.push('receipt safety envelope is missing or unsafe');
  }
  const forbidden = findForbiddenReceiptFields(value);
  if (forbidden.length > 0) blockers.push(`forbidden receipt fields: ${forbidden.join(', ')}`);
  const limitations = Array.isArray(value.limitations) ? value.limitations : null;
  if (
    !limitations ||
    limitations.length < 1 ||
    limitations.length > 32 ||
    limitations.some(
      (limitation) =>
        typeof limitation !== 'string' || limitation.length < 1 || limitation.length > 1_024
    )
  ) {
    blockers.push('receipt limitations are missing or malformed');
  }
  if (integrity?.canonicalization === MODEL_WORKSPACE_HASH_CANONICALIZATION) {
    try {
      if (
        !isRecord(value.observation) ||
        hashModelWorkspacePayload(value.observation) !== value.observationSha256
      ) {
        blockers.push('observationSha256 does not match the observation payload');
      }
      if (hashModelWorkspacePayload({ ...value, receiptHash: null }) !== value.receiptHash) {
        blockers.push('receiptHash does not match the receipt payload');
      }
    } catch (error) {
      blockers.push(
        `receipt hash canonicalization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return blockers.length === 0
    ? { ok: true, receipt: value as unknown as ModelWorkspaceReceipt, blockers }
    : { ok: false, blockers };
}

function validateWorkspaceObservation(
  observation: Record<string, unknown> | null,
  k: number | null,
  inputLayers: unknown[] | null,
  positions: unknown[] | null,
  vocabSize: number | null
): string[] {
  if (!observation || observation.status !== 'observed') {
    return ['workspace observation is missing or not observed'];
  }
  const layerBand = isRecord(observation.layerBand) ? observation.layerBand : null;
  const layers = Array.isArray(observation.layers) ? observation.layers : null;
  const expectedCoordinates =
    inputLayers && positions
      ? new Set(inputLayers.flatMap((layer) => positions.map((position) => `${layer}:${position}`)))
      : null;
  const numericLayers = inputLayers?.filter((layer): layer is number =>
    Number.isSafeInteger(layer)
  );
  if (
    !layerBand ||
    !Number.isSafeInteger(layerBand.start) ||
    !Number.isSafeInteger(layerBand.end) ||
    !layers ||
    layers.length < 1 ||
    layers.length > 1_024 ||
    !expectedCoordinates ||
    layers.length !== expectedCoordinates.size ||
    !numericLayers ||
    layerBand.start !== Math.min(...numericLayers) ||
    layerBand.end !== Math.max(...numericLayers)
  ) {
    return ['workspace observation shape exceeds its bounded schema'];
  }

  const blockers: string[] = [];
  const coordinates = new Set<string>();
  for (const [index, item] of layers.entries()) {
    if (!isRecord(item)) {
      blockers.push(`observation layer ${index} is not an object`);
      continue;
    }
    const concepts = Array.isArray(item.concepts) ? item.concepts : null;
    const controls = Array.isArray(item.controlConcepts) ? item.controlConcepts : null;
    const coordinate = `${String(item.layer)}:${String(item.position)}`;
    if (
      !Number.isSafeInteger(item.layer) ||
      Number(item.layer) < 0 ||
      !Number.isSafeInteger(item.position) ||
      Number(item.position) < 0 ||
      coordinates.has(coordinate) ||
      !expectedCoordinates.has(coordinate) ||
      !concepts ||
      !controls ||
      k === null ||
      concepts.length !== k ||
      controls.length !== k ||
      !isE8Probability(item.tailProbabilityMassE8)
    ) {
      blockers.push(`observation layer ${index} is malformed or unbounded`);
      continue;
    }
    coordinates.add(coordinate);
    const conceptErrors = [...concepts, ...controls].some((concept) => {
      if (!isRecord(concept)) return true;
      return (
        !Number.isSafeInteger(concept.tokenId) ||
        Number(concept.tokenId) < 0 ||
        vocabSize === null ||
        Number(concept.tokenId) >= vocabSize ||
        typeof concept.token !== 'string' ||
        concept.token.length > 4_096 ||
        !Number.isSafeInteger(concept.scoreE8) ||
        !isE8Probability(concept.probabilityE8)
      );
    });
    if (conceptErrors) {
      blockers.push(`observation layer ${index} contains invalid concepts`);
    } else {
      const probabilityTotal = concepts.reduce(
        (sum, concept) => sum + Number((concept as Record<string, unknown>).probabilityE8),
        0
      );
      const controlTotal = controls.reduce(
        (sum, concept) => sum + Number((concept as Record<string, unknown>).probabilityE8),
        0
      );
      if (probabilityTotal + Number(item.tailProbabilityMassE8) !== 100_000_000) {
        blockers.push(`observation layer ${index} probability mass is inconsistent`);
      }
      if (controlTotal > 100_000_000) {
        blockers.push(`observation layer ${index} control probability mass is invalid`);
      }
    }
  }
  return blockers;
}

export function hashModelWorkspacePayload(value: unknown): string {
  const canonical = JSON.stringify(canonicalWorkspaceHashValue(value));
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function finalize(
  value: Omit<HoloLlamaModelWorkspaceProbeReceipt, 'receiptHash'>
): HoloLlamaModelWorkspaceProbeReceipt {
  return {
    ...value,
    receiptHash: sha256Json({ ...value, receiptHash: null }),
  };
}

async function fetchJson(
  fetchImpl: HoloLlamaWorkspaceProbeFetch,
  url: string,
  options: { timeoutMs?: number; method?: string; body?: Record<string, unknown> }
): Promise<JsonProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    try {
      return { ok: response.ok, status: response.status, body: await response.json() };
    } catch {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        body: null,
        error: body.slice(0, 500) || `non-JSON response (HTTP ${response.status})`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

const defaultFetch: HoloLlamaWorkspaceProbeFetch = async (input, init) =>
  fetch(input, init) as Promise<HoloLlamaWorkspaceProbeFetchResponse>;

function normalizeEndpoint(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('workspace probe endpoint must use http or https');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/u, '');
}

function findForbiddenReceiptFields(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenReceiptFields(item, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  const forbidden = new Set([
    'activation',
    'activations',
    'conscious',
    'consciousness',
    'direction',
    'hiddenstate',
    'hiddenstates',
    'intent',
    'intervention',
    'residual',
    'residuals',
    'safe',
    'sentient',
    'strength',
    'truth',
    'vector',
  ]);
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    return [
      ...(forbidden.has(key.toLowerCase()) ? [childPath] : []),
      ...findForbiddenReceiptFields(child, childPath),
    ];
  });
}

function canonicalWorkspaceHashValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('receipt measurements must use JavaScript-safe integers');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalWorkspaceHashValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalWorkspaceHashValue(value[key])])
    );
  }
  throw new Error(`receipt values cannot contain ${typeof value}`);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isSupportedWorkspaceEstimator(
  estimator: unknown,
  paperParity: unknown,
  parityScope?: unknown,
  paperExperimentParity?: unknown
): estimator is ModelWorkspaceEstimator {
  return (
    (estimator === 'explicit_pair_average_v0' && paperParity === false) ||
    (estimator === 'corpus_position_average_v1' &&
      paperParity === true &&
      parityScope === 'reference-estimator-only' &&
      paperExperimentParity === false)
  );
}

function isSupportedWorkspacePositionPolicy(
  estimator: unknown,
  positionPolicy: unknown
): boolean {
  return (
    (estimator === 'explicit_pair_average_v0' &&
      positionPolicy === 'explicit-source-target-pairs') ||
    (estimator === 'corpus_position_average_v1' &&
      positionPolicy === 'all-valid-current-and-future-targets')
  );
}

function isE8Probability(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100_000_000;
}

function arraysEqual(actual: unknown[] | null, expected: number[]): boolean {
  return (
    actual !== null &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableJson(value)), 'utf8')
    .digest('hex')}`;
}

function sha256Text(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJson(value[key])])
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
