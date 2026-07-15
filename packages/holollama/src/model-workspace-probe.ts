import { createHash } from 'node:crypto';

export const LEGACY_MODEL_WORKSPACE_RECEIPT_SCHEMA =
  'holoscript.model-workspace-receipt.v0.1.0' as const;
export const MODEL_WORKSPACE_RECEIPT_SCHEMA = 'holoscript.model-workspace-receipt.v0.2.0' as const;
export const MODEL_WORKSPACE_CAPABILITY_SCHEMA =
  'holoscript.model-workspace-capability.v0.2.0' as const;
export const MODEL_WORKSPACE_HASH_CANONICALIZATION =
  'holoscript.integer-measurement-json.v0.1.0' as const;
export const MODEL_WORKSPACE_MEASUREMENT_PROFILE = 'full-distribution-v1' as const;
export const MODEL_WORKSPACE_CONTROL_PROFILE = 'uncorrected-logit-lens-v1' as const;
export const MODEL_WORKSPACE_SCORE_PROFILE =
  'mean-mapped-control-full-vocabulary-jsd-nats-v1' as const;
export const MODEL_WORKSPACE_SIGNAL_RECEIPT_SCHEMA =
  'holollama.model-workspace-signal-receipt.v0.1.0' as const;
export const HOLOLLAMA_MODEL_WORKSPACE_PROBE_SCHEMA =
  'holollama.model-workspace-probe.v0.1.0' as const;
export const MODEL_WORKSPACE_ENDPOINT_POSITION_POLICY = 'endpoint-self-only' as const;
export const MODEL_WORKSPACE_ENDPOINT_AFFINE_TRANSPORT_PROFILE =
  'mean-anchored-affine-final-residual-v1' as const;
export const MODEL_WORKSPACE_LOCAL_TAYLOR_TRANSPORT_PROFILE =
  'local-taylor-affine-final-residual-v1' as const;
export const MODEL_WORKSPACE_SCALAR_CALIBRATED_TRANSPORT_PROFILE =
  'mean-centered-scalar-jacobian-final-residual-v1' as const;
export const MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE =
  's5-unscaled-mean-centered-jacobian-v1' as const;

const MODEL_WORKSPACE_ENDPOINT_TRANSPORT_PROFILES = {
  endpoint_self_jacobian_affine_v1: MODEL_WORKSPACE_ENDPOINT_AFFINE_TRANSPORT_PROFILE,
  endpoint_self_jacobian_local_taylor_v1: MODEL_WORKSPACE_LOCAL_TAYLOR_TRANSPORT_PROFILE,
  endpoint_self_jacobian_scalar_calibrated_v1: MODEL_WORKSPACE_SCALAR_CALIBRATED_TRANSPORT_PROFILE,
} as const;

const MODEL_WORKSPACE_S4_TRANSPORT_CONTROL_NAMES = [
  'localTaylor',
  'scalarIdentity',
  'unscaledCentered',
] as const;
const MODEL_WORKSPACE_S5_TRANSPORT_CONTROL_NAMES = [
  'localTaylor',
  'scalarCalibrated',
  'scalarIdentity',
] as const;

const MODEL_WORKSPACE_CAPABILITY_ALLOWED_FIELD_PATHS = new Set(['intervention']);
const MODEL_WORKSPACE_FORBIDDEN_FIELD_NAMES = new Set([
  'activation',
  'activations',
  'b',
  'c',
  'ci',
  'conscious',
  'consciousness',
  'direction',
  'hiddenstate',
  'hiddenstates',
  'intent',
  'intervention',
  'jbar',
  'm',
  'residual',
  'residuals',
  'safe',
  'sentient',
  's',
  'si',
  'strength',
  'truth',
  'vector',
  'xbar',
  'ybar',
]);
const MODEL_WORKSPACE_ALLOWED_TARGET_MEASUREMENT_FIELDS = new Set([
  'anchortargetjensenshannondivergencenatse8',
  'controltargetjensenshannondivergencenatse8',
  'mappedtargetjensenshannondivergencenatse8',
  'targetentropynatse8',
  'targetjensenshannondivergencenatse8',
  'targetmaxprobabilitye8',
  'targettoptokenid',
]);

export type ModelWorkspaceEndpointEstimator =
  keyof typeof MODEL_WORKSPACE_ENDPOINT_TRANSPORT_PROFILES;

export type ModelWorkspaceEstimator =
  | 'explicit_pair_average_v0'
  | 'corpus_position_average_v1'
  | ModelWorkspaceEndpointEstimator;

export type ModelWorkspaceTransportProfile =
  (typeof MODEL_WORKSPACE_ENDPOINT_TRANSPORT_PROFILES)[ModelWorkspaceEndpointEstimator];

export type ModelWorkspaceExperimentProfile = typeof MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE;

export type ModelWorkspacePositionBin = [start: number, end: number];

export interface ModelWorkspaceConcept {
  tokenId: number;
  token: string;
  scoreE8: number;
  probabilityE8: number;
}

export interface ModelWorkspaceDistributionMetrics {
  mappedControlJensenShannonDivergenceNatsE8: number;
  mappedTargetJensenShannonDivergenceNatsE8: number;
  controlTargetJensenShannonDivergenceNatsE8: number;
  lensGainJensenShannonNatsE8: number;
  totalVariationDistanceE8: number;
  mappedEntropyNatsE8: number;
  controlEntropyNatsE8: number;
  mappedMaxProbabilityE8: number;
  controlMaxProbabilityE8: number;
}

export interface ModelWorkspaceAnchorControlMetrics {
  anchorTargetJensenShannonDivergenceNatsE8: number;
  mappedVsAnchorLensGainJensenShannonNatsE8: number;
  anchorEntropyNatsE8: number;
  anchorMaxProbabilityE8: number;
  targetEntropyNatsE8: number;
  targetMaxProbabilityE8: number;
  mappedTopTokenId: number;
  anchorTopTokenId: number;
  targetTopTokenId: number;
}

export interface ModelWorkspaceTransportControlMetric {
  targetJensenShannonDivergenceNatsE8: number;
}

export interface ModelWorkspaceS4TransportControlMetrics {
  unscaledCentered: ModelWorkspaceTransportControlMetric;
  localTaylor: ModelWorkspaceTransportControlMetric;
  scalarIdentity: ModelWorkspaceTransportControlMetric;
}

export interface ModelWorkspaceS5TransportControlMetrics {
  scalarCalibrated: ModelWorkspaceTransportControlMetric;
  localTaylor: ModelWorkspaceTransportControlMetric;
  scalarIdentity: ModelWorkspaceTransportControlMetric;
}

export type ModelWorkspaceTransportControlMetrics =
  | ModelWorkspaceS4TransportControlMetrics
  | ModelWorkspaceS5TransportControlMetrics;

export interface ModelWorkspaceLayerObservation {
  layer: number;
  position: number;
  concepts: ModelWorkspaceConcept[];
  controlConcepts: ModelWorkspaceConcept[];
  tailProbabilityMassE8: number;
  controlTailProbabilityMassE8?: number;
  distributionMetrics?: ModelWorkspaceDistributionMetrics;
  anchorControlMetrics?: ModelWorkspaceAnchorControlMetrics;
  transportControlMetrics?: ModelWorkspaceTransportControlMetrics;
}

export interface ModelWorkspaceReceipt {
  schema: typeof MODEL_WORKSPACE_RECEIPT_SCHEMA | typeof LEGACY_MODEL_WORKSPACE_RECEIPT_SCHEMA;
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
    positionBins?: ModelWorkspacePositionBin[];
    transportProfile?: ModelWorkspaceTransportProfile;
    experimentProfile?: ModelWorkspaceExperimentProfile;
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
    measurementProfile?: typeof MODEL_WORKSPACE_MEASUREMENT_PROFILE;
    seed: null;
  };
  observation: {
    status: 'observed';
    measurementProfile?: typeof MODEL_WORKSPACE_MEASUREMENT_PROFILE;
    controlProfile?: typeof MODEL_WORKSPACE_CONTROL_PROFILE;
    layerBand: { start: number; end: number };
    layers: ModelWorkspaceLayerObservation[];
    summary?: {
      scoreProfile: typeof MODEL_WORKSPACE_SCORE_PROFILE;
      coordinateCount: number;
      scoreE8: number;
    };
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
  positionBins?: ModelWorkspacePositionBin[];
  transportProfile?: ModelWorkspaceTransportProfile;
  experimentProfile?: ModelWorkspaceExperimentProfile;
  measurementProfile: typeof MODEL_WORKSPACE_MEASUREMENT_PROFILE;
  controlProfile: typeof MODEL_WORKSPACE_CONTROL_PROFILE;
}

export interface ModelWorkspaceSignalReceipt {
  schema: typeof MODEL_WORKSPACE_SIGNAL_RECEIPT_SCHEMA;
  kind: 'ModelWorkspaceSignalReceipt';
  measurementProfile: typeof MODEL_WORKSPACE_MEASUREMENT_PROFILE;
  controlProfile: typeof MODEL_WORKSPACE_CONTROL_PROFILE;
  scoreProfile: typeof MODEL_WORKSPACE_SCORE_PROFILE;
  scoreE8: number;
  coordinateCount: number;
  sourceReceiptHash: string;
  lensSha256: string;
  receiptHash: string;
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
      selectedCapability.paperExperimentParity,
      selectedCapability.transportProfile,
      selectedCapability.positionBins,
      selectedCapability.positionPolicy,
      selectedCapability.experimentProfile
    )
      ? selectedCapability.estimator
      : null;
  const advertisedMeasurementProfile =
    selectedCapability?.measurementProfile === MODEL_WORKSPACE_MEASUREMENT_PROFILE
      ? MODEL_WORKSPACE_MEASUREMENT_PROFILE
      : null;
  const advertisedControlProfile =
    selectedCapability?.controlProfile === MODEL_WORKSPACE_CONTROL_PROFILE
      ? MODEL_WORKSPACE_CONTROL_PROFILE
      : null;
  const forbiddenCapabilityFields = selectedCapability
    ? findForbiddenWorkspaceFields(
        selectedCapability,
        '',
        MODEL_WORKSPACE_CAPABILITY_ALLOWED_FIELD_PATHS
      )
    : [];
  const validCapabilityFields = selectedCapability
    ? hasExactWorkspaceCapabilityFields(selectedCapability)
    : false;
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
    advertisedMeasurementProfile !== null &&
    advertisedControlProfile !== null &&
    isSha256(selectedCapability.lensSha256) &&
    advertisedLayers.length > 0 &&
    validCapabilityFields &&
    forbiddenCapabilityFields.length === 0;

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
  const expectedTransportProfile = workspaceTransportProfileForEstimator(advertisedEstimator);
  const expectedExperimentProfile =
    selectedCapability?.experimentProfile === MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE
      ? MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE
      : null;
  const expectation: ModelWorkspaceReceiptExpectation = {
    requestedModel,
    promptSha256: sha256Text(options.prompt),
    layers: expectedLayers,
    requestedPositions: expectedPositions,
    k: expectedK,
    lensSha256: String(selectedCapability!.lensSha256),
    estimator: advertisedEstimator!,
    ...(expectedTransportProfile !== null
      ? {
          transportProfile: expectedTransportProfile,
          positionBins: cloneWorkspacePositionBins(selectedCapability!.positionBins),
        }
      : {}),
    ...(expectedExperimentProfile === null ? {} : { experimentProfile: expectedExperimentProfile }),
    measurementProfile: advertisedMeasurementProfile!,
    controlProfile: advertisedControlProfile!,
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
  const currentReceipt = value.schema === MODEL_WORKSPACE_RECEIPT_SCHEMA;
  const legacyReceipt = value.schema === LEGACY_MODEL_WORKSPACE_RECEIPT_SCHEMA;
  if (
    currentReceipt &&
    !hasExactKeys(value, [
      'schema',
      'kind',
      'mode',
      'createdAt',
      'requestId',
      'model',
      'tokenizer',
      'lens',
      'input',
      'observation',
      'observationSha256',
      'runtime',
      'integrity',
      'safety',
      'limitations',
      'receiptHash',
    ])
  ) {
    blockers.push('receipt public envelope contains undeclared fields');
  }
  if (!currentReceipt && !legacyReceipt) {
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
    (currentReceipt &&
      !hasExactKeys(model, ['requestedId', 'servedId', 'checkpointSha256', 'architecture'])) ||
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
    (currentReceipt && !hasExactKeys(tokenizer, ['sha256', 'vocabSize'])) ||
    !isSha256(tokenizer.sha256) ||
    !Number.isSafeInteger(tokenizer.vocabSize) ||
    Number(tokenizer.vocabSize) < 1
  ) {
    blockers.push('tokenizer binding is incomplete');
  }
  const lens = isRecord(value.lens) ? value.lens : null;
  const expectedLensFields = [
    'method',
    'estimator',
    'paperParity',
    'implementationVersion',
    'corpusSha256',
    'lensSha256',
    'positionPolicy',
    'jacobianCount',
    'k',
    ...(lens?.estimator === 'corpus_position_average_v1'
      ? ['parityScope', 'paperExperimentParity']
      : workspaceTransportProfileForEstimator(lens?.estimator) !== null
        ? ['transportProfile', 'positionBins']
        : []),
    ...(lens?.experimentProfile === MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE
      ? ['experimentProfile']
      : []),
  ];
  if (lens?.method !== 'jacobian_lens') blockers.push('lens method must be jacobian_lens');
  if (
    !lens ||
    (currentReceipt && !hasExactKeys(lens, expectedLensFields)) ||
    !isSupportedWorkspaceEstimator(
      lens.estimator,
      lens.paperParity,
      lens.parityScope,
      lens.paperExperimentParity,
      lens.transportProfile,
      lens.positionBins,
      lens.positionPolicy,
      lens.experimentProfile
    ) ||
    (legacyReceipt && workspaceTransportProfileForEstimator(lens.estimator) !== null) ||
    !isSha256(lens.corpusSha256) ||
    !isSha256(lens.lensSha256) ||
    typeof lens.implementationVersion !== 'string' ||
    lens.implementationVersion.length < 1 ||
    !isSupportedWorkspacePositionPolicy(lens.estimator, lens.positionPolicy) ||
    !Number.isSafeInteger(lens.jacobianCount) ||
    Number(lens.jacobianCount) < 1 ||
    !Number.isSafeInteger(lens.k) ||
    Number(lens.k) < 1 ||
    Number(lens.k) > 25 ||
    (tokenizer !== null && Number(lens.k) > Number(tokenizer.vocabSize))
  ) {
    blockers.push('lens provenance or sparse-readout bound is invalid');
  }
  const input = isRecord(value.input) ? value.input : null;
  const positions = input && Array.isArray(input.positions) ? input.positions : null;
  const requestedPositions =
    input && Array.isArray(input.requestedPositions) ? input.requestedPositions : null;
  const inputLayers = input && Array.isArray(input.layers) ? input.layers : null;
  const hasTruncationMetadata = Boolean(
    input && ('originalTokenCount' in input || 'truncated' in input || 'truncationPolicy' in input)
  );
  const validTruncationMetadata = Boolean(
    input &&
    Number.isSafeInteger(input.originalTokenCount) &&
    Number(input.originalTokenCount) >= Number(input.tokenCount) &&
    typeof input.truncated === 'boolean' &&
    input.truncated === Number(input.originalTokenCount) > Number(input.tokenCount) &&
    input.truncationPolicy === (input.truncated ? 'left-truncate-to-model-block-size' : 'none')
  );
  const validNormalizedPositions = Boolean(
    input &&
    Number.isSafeInteger(input.tokenCount) &&
    Number(input.tokenCount) > 0 &&
    requestedPositions &&
    positions &&
    requestedPositions.length === positions.length &&
    requestedPositions.every((requested, index) => {
      if (!Number.isSafeInteger(requested)) return false;
      const normalized =
        Number(requested) < 0 ? Number(requested) + Number(input.tokenCount) : Number(requested);
      return (
        normalized >= 0 &&
        normalized < Number(input.tokenCount) &&
        Number(positions[index]) === normalized
      );
    })
  );
  const validEstimatorPositions = Boolean(
    workspaceTransportProfileForEstimator(lens?.estimator) === null ||
    (lens &&
      input &&
      positions &&
      positions.length === 1 &&
      Number(positions[0]) === Number(input.tokenCount) - 1 &&
      workspacePositionBinsCover(Number(positions[0]), lens.positionBins))
  );
  if (
    !input ||
    (currentReceipt &&
      !hasExactKeys(input, [
        'promptSha256',
        'tokenCount',
        'originalTokenCount',
        'truncated',
        'truncationPolicy',
        'layers',
        'requestedPositions',
        'positions',
        'measurementProfile',
        'seed',
      ])) ||
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
    !validNormalizedPositions ||
    !validEstimatorPositions ||
    (currentReceipt && input.measurementProfile !== MODEL_WORKSPACE_MEASUREMENT_PROFILE) ||
    (legacyReceipt && 'measurementProfile' in input) ||
    input.seed !== null ||
    (currentReceipt
      ? !validTruncationMetadata
      : (lens?.estimator === 'corpus_position_average_v1' || hasTruncationMetadata) &&
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
    if (
      workspaceTransportProfileForEstimator(expectation.estimator) !== null &&
      lens?.transportProfile !== expectation.transportProfile
    ) {
      blockers.push('receipt transport profile does not match the advertised model capability');
    }
    if (
      workspaceTransportProfileForEstimator(expectation.estimator) !== null &&
      !workspacePositionBinsEqual(lens?.positionBins, expectation.positionBins)
    ) {
      blockers.push('receipt position bins do not match the advertised model capability');
    }
    if (lens?.experimentProfile !== expectation.experimentProfile) {
      blockers.push('receipt experiment profile does not match the advertised model capability');
    }
    if (input?.measurementProfile !== expectation.measurementProfile) {
      blockers.push('receipt measurement profile does not match the advertised model capability');
    }
  }
  blockers.push(
    ...validateWorkspaceObservation(
      isRecord(value.observation) ? value.observation : null,
      lens && Number.isSafeInteger(lens.k) ? Number(lens.k) : null,
      inputLayers,
      positions,
      tokenizer && Number.isSafeInteger(tokenizer.vocabSize) ? Number(tokenizer.vocabSize) : null,
      currentReceipt,
      expectation?.measurementProfile ?? null,
      expectation?.controlProfile ?? null,
      lens?.estimator ?? null,
      lens?.experimentProfile ?? null
    )
  );
  const runtime = isRecord(value.runtime) ? value.runtime : null;
  if (
    (currentReceipt &&
      runtime !== null &&
      !hasExactKeys(runtime, [
        'backend',
        'device',
        'torchVersion',
        'pythonVersion',
        'holoserveVersion',
      ])) ||
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
    (currentReceipt &&
      integrity !== null &&
      !hasExactKeys(integrity, ['algorithm', 'canonicalization'])) ||
    integrity?.algorithm !== 'sha256' ||
    integrity.canonicalization !== MODEL_WORKSPACE_HASH_CANONICALIZATION
  ) {
    blockers.push('receipt hash canonicalization is missing or unsupported');
  }
  const safety = isRecord(value.safety) ? value.safety : null;
  if (
    !safety ||
    (currentReceipt &&
      !hasExactKeys(safety, [
        'readOnly',
        'interventionApplied',
        'rawActivationsPersisted',
        'identityBinding',
        'retention',
      ])) ||
    safety.readOnly !== true ||
    safety.interventionApplied !== false ||
    safety.rawActivationsPersisted !== false ||
    safety.identityBinding !== 'none' ||
    safety.retention !== 'receipt_only'
  ) {
    blockers.push('receipt safety envelope is missing or unsafe');
  }
  const forbidden = findForbiddenWorkspaceFields(value);
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
  vocabSize: number | null,
  currentReceipt: boolean,
  expectedMeasurementProfile: string | null,
  expectedControlProfile: string | null,
  estimator: unknown,
  experimentProfile: unknown
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
    (currentReceipt &&
      !hasExactKeys(observation, [
        'status',
        'measurementProfile',
        'controlProfile',
        'layerBand',
        'layers',
        'summary',
      ])) ||
    !layerBand ||
    (currentReceipt && !hasExactKeys(layerBand, ['start', 'end'])) ||
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
  if (
    currentReceipt &&
    (observation.measurementProfile !== MODEL_WORKSPACE_MEASUREMENT_PROFILE ||
      observation.controlProfile !== MODEL_WORKSPACE_CONTROL_PROFILE ||
      (expectedMeasurementProfile !== null &&
        observation.measurementProfile !== expectedMeasurementProfile) ||
      (expectedControlProfile !== null && observation.controlProfile !== expectedControlProfile))
  ) {
    blockers.push('workspace observation measurement or control profile is invalid');
  }
  if (
    !currentReceipt &&
    ('measurementProfile' in observation ||
      'controlProfile' in observation ||
      'summary' in observation)
  ) {
    blockers.push('legacy workspace observation contains v0.2 profile fields');
  }
  const coordinates = new Set<string>();
  const primaryScores: number[] = [];
  const maxJensenShannonNatsE8 = Math.round(Math.log(2) * 100_000_000);
  const maxEntropyNatsE8 =
    vocabSize === null ? null : Math.round(Math.log(vocabSize) * 100_000_000);
  for (const [index, item] of layers.entries()) {
    if (!isRecord(item)) {
      blockers.push(`observation layer ${index} is not an object`);
      continue;
    }
    const concepts = Array.isArray(item.concepts) ? item.concepts : null;
    const controls = Array.isArray(item.controlConcepts) ? item.controlConcepts : null;
    const coordinate = `${String(item.layer)}:${String(item.position)}`;
    const expectedCoordinateFields = [
      'layer',
      'position',
      'concepts',
      'controlConcepts',
      'tailProbabilityMassE8',
      'controlTailProbabilityMassE8',
      'distributionMetrics',
      'anchorControlMetrics',
      'transportControlMetrics',
    ];
    if (
      !Number.isSafeInteger(item.layer) ||
      Number(item.layer) < 0 ||
      !Number.isSafeInteger(item.position) ||
      Number(item.position) < 0 ||
      coordinates.has(coordinate) ||
      !expectedCoordinates.has(coordinate) ||
      !concepts ||
      !controls ||
      (currentReceipt && !hasOnlyDeclaredKeys(item, expectedCoordinateFields)) ||
      k === null ||
      concepts.length !== k ||
      controls.length !== k ||
      !isE8Probability(item.tailProbabilityMassE8) ||
      (currentReceipt && !isE8Probability(item.controlTailProbabilityMassE8)) ||
      (!currentReceipt &&
        ('controlTailProbabilityMassE8' in item ||
          'distributionMetrics' in item ||
          'anchorControlMetrics' in item ||
          'transportControlMetrics' in item))
    ) {
      blockers.push(`observation layer ${index} is malformed or unbounded`);
      continue;
    }
    coordinates.add(coordinate);
    const conceptErrors = [...concepts, ...controls].some((concept) => {
      if (!isRecord(concept)) return true;
      return (
        (currentReceipt &&
          !hasExactKeys(concept, ['tokenId', 'token', 'scoreE8', 'probabilityE8'])) ||
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
      const conceptRecords = concepts as Record<string, unknown>[];
      const controlRecords = controls as Record<string, unknown>[];
      const hasInvalidSparseOrdering = [conceptRecords, controlRecords].some((records) => {
        const tokenIds = records.map((concept) => Number(concept.tokenId));
        const probabilities = records.map((concept) => Number(concept.probabilityE8));
        return (
          new Set(tokenIds).size !== tokenIds.length ||
          probabilities.some(
            (probability, probabilityIndex) =>
              probabilityIndex > 0 && probability > probabilities[probabilityIndex - 1]!
          )
        );
      });
      if (hasInvalidSparseOrdering) {
        blockers.push(`observation layer ${index} sparse concepts are duplicated or unsorted`);
      }
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
      if (
        currentReceipt
          ? controlTotal + Number(item.controlTailProbabilityMassE8) !== 100_000_000
          : controlTotal > 100_000_000
      ) {
        blockers.push(`observation layer ${index} control probability mass is inconsistent`);
      }
    }

    if (currentReceipt) {
      const metrics = isRecord(item.distributionMetrics) ? item.distributionMetrics : null;
      const jsdFields = [
        metrics?.mappedControlJensenShannonDivergenceNatsE8,
        metrics?.mappedTargetJensenShannonDivergenceNatsE8,
        metrics?.controlTargetJensenShannonDivergenceNatsE8,
      ];
      const entropyFields = [metrics?.mappedEntropyNatsE8, metrics?.controlEntropyNatsE8];
      if (
        !metrics ||
        !hasExactKeys(metrics, [
          'mappedControlJensenShannonDivergenceNatsE8',
          'mappedTargetJensenShannonDivergenceNatsE8',
          'controlTargetJensenShannonDivergenceNatsE8',
          'lensGainJensenShannonNatsE8',
          'totalVariationDistanceE8',
          'mappedEntropyNatsE8',
          'controlEntropyNatsE8',
          'mappedMaxProbabilityE8',
          'controlMaxProbabilityE8',
        ]) ||
        jsdFields.some(
          (measurement) =>
            !Number.isSafeInteger(measurement) ||
            Number(measurement) < 0 ||
            Number(measurement) > maxJensenShannonNatsE8
        ) ||
        !Number.isSafeInteger(metrics.lensGainJensenShannonNatsE8) ||
        Math.abs(Number(metrics.lensGainJensenShannonNatsE8)) > maxJensenShannonNatsE8 ||
        !isE8Probability(metrics.totalVariationDistanceE8) ||
        entropyFields.some(
          (measurement) =>
            !Number.isSafeInteger(measurement) ||
            Number(measurement) < 0 ||
            maxEntropyNatsE8 === null ||
            Number(measurement) > maxEntropyNatsE8
        ) ||
        !isE8Probability(metrics.mappedMaxProbabilityE8) ||
        !isE8Probability(metrics.controlMaxProbabilityE8) ||
        Math.abs(
          Number(metrics.mappedMaxProbabilityE8) -
            Number((concepts[0] as Record<string, unknown>).probabilityE8)
        ) > 1 ||
        Math.abs(
          Number(metrics.controlMaxProbabilityE8) -
            Number((controls[0] as Record<string, unknown>).probabilityE8)
        ) > 1 ||
        Number(metrics.lensGainJensenShannonNatsE8) !==
          Number(metrics.controlTargetJensenShannonDivergenceNatsE8) -
            Number(metrics.mappedTargetJensenShannonDivergenceNatsE8)
      ) {
        blockers.push(`observation layer ${index} distribution metrics are invalid`);
      } else {
        primaryScores.push(Number(metrics.mappedControlJensenShannonDivergenceNatsE8));
      }

      const anchorMetrics = isRecord(item.anchorControlMetrics) ? item.anchorControlMetrics : null;
      if (workspaceTransportProfileForEstimator(estimator) !== null) {
        const anchorTokenIds = [
          anchorMetrics?.mappedTopTokenId,
          anchorMetrics?.anchorTopTokenId,
          anchorMetrics?.targetTopTokenId,
        ];
        if (
          !anchorMetrics ||
          !hasExactKeys(anchorMetrics, [
            'anchorTargetJensenShannonDivergenceNatsE8',
            'mappedVsAnchorLensGainJensenShannonNatsE8',
            'anchorEntropyNatsE8',
            'anchorMaxProbabilityE8',
            'targetEntropyNatsE8',
            'targetMaxProbabilityE8',
            'mappedTopTokenId',
            'anchorTopTokenId',
            'targetTopTokenId',
          ]) ||
          !Number.isSafeInteger(anchorMetrics.anchorTargetJensenShannonDivergenceNatsE8) ||
          Number(anchorMetrics.anchorTargetJensenShannonDivergenceNatsE8) < 0 ||
          Number(anchorMetrics.anchorTargetJensenShannonDivergenceNatsE8) >
            maxJensenShannonNatsE8 ||
          !Number.isSafeInteger(anchorMetrics.mappedVsAnchorLensGainJensenShannonNatsE8) ||
          Math.abs(Number(anchorMetrics.mappedVsAnchorLensGainJensenShannonNatsE8)) >
            maxJensenShannonNatsE8 ||
          !Number.isSafeInteger(anchorMetrics.anchorEntropyNatsE8) ||
          Number(anchorMetrics.anchorEntropyNatsE8) < 0 ||
          maxEntropyNatsE8 === null ||
          Number(anchorMetrics.anchorEntropyNatsE8) > maxEntropyNatsE8 ||
          !isE8Probability(anchorMetrics.anchorMaxProbabilityE8) ||
          !Number.isSafeInteger(anchorMetrics.targetEntropyNatsE8) ||
          Number(anchorMetrics.targetEntropyNatsE8) < 0 ||
          Number(anchorMetrics.targetEntropyNatsE8) > maxEntropyNatsE8 ||
          !isE8Probability(anchorMetrics.targetMaxProbabilityE8) ||
          anchorTokenIds.some(
            (tokenId) =>
              !Number.isSafeInteger(tokenId) ||
              Number(tokenId) < 0 ||
              vocabSize === null ||
              Number(tokenId) >= vocabSize
          ) ||
          Number(anchorMetrics.mappedVsAnchorLensGainJensenShannonNatsE8) !==
            Number(anchorMetrics.anchorTargetJensenShannonDivergenceNatsE8) -
              Number(metrics?.mappedTargetJensenShannonDivergenceNatsE8)
        ) {
          blockers.push(`observation layer ${index} anchor control metrics are invalid`);
        }
      } else if ('anchorControlMetrics' in item) {
        blockers.push(`observation layer ${index} has estimator-confused anchor control metrics`);
      }
      const transportControls = isRecord(item.transportControlMetrics)
        ? item.transportControlMetrics
        : null;
      const transportControlContract =
        estimator === 'endpoint_self_jacobian_affine_v1' &&
        experimentProfile === MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE
          ? {
              generation: 'S5',
              names: MODEL_WORKSPACE_S5_TRANSPORT_CONTROL_NAMES,
            }
          : estimator === 'endpoint_self_jacobian_scalar_calibrated_v1'
            ? {
                generation: 'S4',
                names: MODEL_WORKSPACE_S4_TRANSPORT_CONTROL_NAMES,
              }
            : null;
      if (transportControlContract !== null) {
        const expectedControlNames = transportControlContract.names;
        const validControlNames =
          transportControls !== null &&
          Object.keys(transportControls).sort().join(',') === expectedControlNames.join(',');
        const validControls =
          validControlNames &&
          expectedControlNames.every((name) => {
            const control = isRecord(transportControls[name]) ? transportControls[name] : null;
            return (
              control !== null &&
              Object.keys(control).length === 1 &&
              Number.isSafeInteger(control.targetJensenShannonDivergenceNatsE8) &&
              Number(control.targetJensenShannonDivergenceNatsE8) >= 0 &&
              Number(control.targetJensenShannonDivergenceNatsE8) <= maxJensenShannonNatsE8
            );
          });
        if (!validControls) {
          blockers.push(
            `observation layer ${index} ${transportControlContract.generation} transport controls are invalid`
          );
        }
      } else if ('transportControlMetrics' in item) {
        const hasExactS5ControlNames =
          transportControls !== null &&
          Object.keys(transportControls).sort().join(',') ===
            MODEL_WORKSPACE_S5_TRANSPORT_CONTROL_NAMES.join(',');
        blockers.push(
          estimator === 'endpoint_self_jacobian_affine_v1' && hasExactS5ControlNames
            ? `observation layer ${index} S5 transport controls require the exact experiment profile`
            : `observation layer ${index} has estimator-confused S4 transport controls`
        );
      }
    }
  }

  if (currentReceipt) {
    const summary = isRecord(observation.summary) ? observation.summary : null;
    if (
      !summary ||
      !hasExactKeys(summary, ['scoreProfile', 'coordinateCount', 'scoreE8']) ||
      summary.scoreProfile !== MODEL_WORKSPACE_SCORE_PROFILE ||
      !Number.isSafeInteger(summary.coordinateCount) ||
      Number(summary.coordinateCount) !== layers.length ||
      !Number.isSafeInteger(summary.scoreE8) ||
      primaryScores.length !== layers.length ||
      Number(summary.scoreE8) !== integerMeanE8(primaryScores)
    ) {
      blockers.push('workspace observation summary is invalid');
    }
  }
  return blockers;
}

function integerMeanE8(values: number[]): number {
  if (values.length < 1) return Number.NaN;
  return Math.floor(
    (values.reduce((sum, value) => sum + value, 0) + Math.floor(values.length / 2)) / values.length
  );
}

export function summarizeModelWorkspaceSignal(value: unknown): ModelWorkspaceSignalReceipt {
  const validation = validateModelWorkspaceReceipt(value);
  if (!validation.ok || !validation.receipt) {
    throw new TypeError(`invalid model workspace receipt: ${validation.blockers.join('; ')}`);
  }
  const receipt = validation.receipt;
  if (
    receipt.schema !== MODEL_WORKSPACE_RECEIPT_SCHEMA ||
    receipt.input.measurementProfile !== MODEL_WORKSPACE_MEASUREMENT_PROFILE ||
    receipt.observation.measurementProfile !== MODEL_WORKSPACE_MEASUREMENT_PROFILE ||
    receipt.observation.controlProfile !== MODEL_WORKSPACE_CONTROL_PROFILE ||
    !receipt.observation.summary
  ) {
    throw new TypeError('model workspace receipt does not carry the full-distribution profile');
  }
  const summary = receipt.observation.summary;
  const unsigned: Omit<ModelWorkspaceSignalReceipt, 'receiptHash'> = {
    schema: MODEL_WORKSPACE_SIGNAL_RECEIPT_SCHEMA,
    kind: 'ModelWorkspaceSignalReceipt',
    measurementProfile: MODEL_WORKSPACE_MEASUREMENT_PROFILE,
    controlProfile: MODEL_WORKSPACE_CONTROL_PROFILE,
    scoreProfile: MODEL_WORKSPACE_SCORE_PROFILE,
    scoreE8: summary.scoreE8,
    coordinateCount: summary.coordinateCount,
    sourceReceiptHash: receipt.receiptHash,
    lensSha256: receipt.lens.lensSha256,
  };
  return {
    ...unsigned,
    receiptHash: hashModelWorkspacePayload({ ...unsigned, receiptHash: null }),
  };
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

function findForbiddenWorkspaceFields(
  value: unknown,
  path = '',
  allowedPaths: ReadonlySet<string> = new Set()
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenWorkspaceFields(item, `${path}[${index}]`, allowedPaths)
    );
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
    const isPublicTransportScalarControl =
      (normalizedKey === 'scalaridentity' || normalizedKey === 'scalarcalibrated') &&
      /^observation\.layers\[\d+\]\.transportControlMetrics$/u.test(path);
    const hasPrivateArtifactShape =
      normalizedKey.includes('alpha') ||
      normalizedKey.includes('beta') ||
      (normalizedKey.includes('scalar') && !isPublicTransportScalarControl) ||
      normalizedKey.includes('statistic') ||
      normalizedKey === 'stat' ||
      normalizedKey === 'stats' ||
      normalizedKey.endsWith('stats') ||
      normalizedKey.includes('matri') ||
      normalizedKey.includes('bias') ||
      normalizedKey.includes('source') ||
      normalizedKey.includes('mean') ||
      normalizedKey.includes('ridge') ||
      normalizedKey.includes('clipbound') ||
      normalizedKey.includes('sample') ||
      normalizedKey.includes('sequence') ||
      (normalizedKey.includes('target') &&
        !MODEL_WORKSPACE_ALLOWED_TARGET_MEASUREMENT_FIELDS.has(normalizedKey));
    return [
      ...(!allowedPaths.has(childPath) &&
      (MODEL_WORKSPACE_FORBIDDEN_FIELD_NAMES.has(normalizedKey) || hasPrivateArtifactShape)
        ? [childPath]
        : []),
      ...findForbiddenWorkspaceFields(child, childPath, allowedPaths),
    ];
  });
}

function hasExactWorkspaceCapabilityFields(value: Record<string, unknown>): boolean {
  const expected = new Set([
    'schema',
    'observe',
    'intervention',
    'method',
    'estimator',
    'paperParity',
    'measurementProfile',
    'controlProfile',
    'layers',
    'lensSha256',
  ]);
  if (value.estimator === 'corpus_position_average_v1') {
    expected.add('parityScope');
    expected.add('paperExperimentParity');
  } else if (workspaceTransportProfileForEstimator(value.estimator) !== null) {
    expected.add('transportProfile');
    expected.add('positionPolicy');
    expected.add('positionBins');
  }
  if (value.experimentProfile === MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE) {
    expected.add('experimentProfile');
  }
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const expected = new Set(expectedKeys);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function hasOnlyDeclaredKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
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

function workspaceTransportProfileForEstimator(
  estimator: unknown
): ModelWorkspaceTransportProfile | null {
  if (
    typeof estimator !== 'string' ||
    !Object.prototype.hasOwnProperty.call(MODEL_WORKSPACE_ENDPOINT_TRANSPORT_PROFILES, estimator)
  ) {
    return null;
  }
  return MODEL_WORKSPACE_ENDPOINT_TRANSPORT_PROFILES[estimator as ModelWorkspaceEndpointEstimator];
}

function isSupportedWorkspaceEstimator(
  estimator: unknown,
  paperParity: unknown,
  parityScope?: unknown,
  paperExperimentParity?: unknown,
  transportProfile?: unknown,
  positionBins?: unknown,
  positionPolicy?: unknown,
  experimentProfile?: unknown
): estimator is ModelWorkspaceEstimator {
  const endpointTransportProfile = workspaceTransportProfileForEstimator(estimator);
  return (
    (estimator === 'explicit_pair_average_v0' &&
      paperParity === false &&
      experimentProfile === undefined) ||
    (estimator === 'corpus_position_average_v1' &&
      paperParity === true &&
      parityScope === 'reference-estimator-only' &&
      paperExperimentParity === false &&
      experimentProfile === undefined) ||
    (endpointTransportProfile !== null &&
      paperParity === false &&
      transportProfile === endpointTransportProfile &&
      isCanonicalWorkspacePositionBins(positionBins) &&
      positionPolicy === MODEL_WORKSPACE_ENDPOINT_POSITION_POLICY &&
      (experimentProfile === undefined ||
        (estimator === 'endpoint_self_jacobian_affine_v1' &&
          transportProfile === MODEL_WORKSPACE_ENDPOINT_AFFINE_TRANSPORT_PROFILE &&
          experimentProfile === MODEL_WORKSPACE_S5_EXPERIMENT_PROFILE)))
  );
}

function isSupportedWorkspacePositionPolicy(estimator: unknown, positionPolicy: unknown): boolean {
  return (
    (estimator === 'explicit_pair_average_v0' &&
      positionPolicy === 'explicit-source-target-pairs') ||
    (estimator === 'corpus_position_average_v1' &&
      positionPolicy === 'all-valid-current-and-future-targets') ||
    (workspaceTransportProfileForEstimator(estimator) !== null &&
      positionPolicy === MODEL_WORKSPACE_ENDPOINT_POSITION_POLICY)
  );
}

function isCanonicalWorkspacePositionBins(value: unknown): value is ModelWorkspacePositionBin[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1_024) return false;
  let expectedStart = 0;
  for (const bin of value) {
    if (
      !Array.isArray(bin) ||
      bin.length !== 2 ||
      !Number.isSafeInteger(bin[0]) ||
      !Number.isSafeInteger(bin[1]) ||
      Number(bin[0]) !== expectedStart ||
      Number(bin[1]) < expectedStart
    ) {
      return false;
    }
    expectedStart = Number(bin[1]) + 1;
    if (!Number.isSafeInteger(expectedStart)) return false;
  }
  return true;
}

function cloneWorkspacePositionBins(value: unknown): ModelWorkspacePositionBin[] {
  if (!isCanonicalWorkspacePositionBins(value)) {
    throw new Error('workspace position bins are not canonical');
  }
  return value.map(([start, end]) => [start, end]);
}

function workspacePositionBinsCover(position: number, bins: unknown): boolean {
  return (
    Number.isSafeInteger(position) &&
    isCanonicalWorkspacePositionBins(bins) &&
    bins.some(([start, end]) => position >= start && position <= end)
  );
}

function workspacePositionBinsEqual(
  actual: unknown,
  expected: ModelWorkspacePositionBin[] | undefined
): boolean {
  return (
    isCanonicalWorkspacePositionBins(actual) &&
    expected !== undefined &&
    actual.length === expected.length &&
    actual.every(
      ([start, end], index) => start === expected[index]?.[0] && end === expected[index]?.[1]
    )
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
