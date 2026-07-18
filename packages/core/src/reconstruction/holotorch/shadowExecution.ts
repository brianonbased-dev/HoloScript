import { canonicalizeDomainReceiptPayload } from '../../receipts/DomainSimulationReceipt';
import { hashReceiptPayloadAsync } from '../../receipts/hash-policy';
import { hashBytes } from '../../testing/DeterminismHarness';
import type { BlockWeights } from './decoderBlock';
import type { HoloTorchModel, ModelConfig, ModelWeights } from './holoTorchModel';

export type { BlockWeights } from './decoderBlock';
export type { HoloTorchModel, ModelConfig, ModelWeights } from './holoTorchModel';

export const HOLOTORCH_SHADOW_EXECUTION_SCHEMA =
  'holoscript.holotorch-shadow-execution.v0.1.0' as const;
export const HOLOTORCH_TENSOR_SET_SCHEMA = 'holoscript.holotorch-tensor-set.v0.1.0' as const;
export const HOLOTORCH_ARTIFACT_BINDING_SCHEMA =
  'holoscript.holotorch-artifact-binding.v0.1.0' as const;

export type HoloTorchSha256 = `sha256:${string}`;

export interface HoloTorchShadowBinding {
  model: string;
  architecture: 'holo-gpt2-v0';
  config: {
    nLayer: number;
    nEmbd: number;
    nHead: number;
    vocab: number;
    maxPosition: number;
  };
  artifactBindingSha256: HoloTorchSha256;
  checkpointSha256: HoloTorchSha256;
  tokenizerSha256: HoloTorchSha256;
  expectedTensorSetSha256: HoloTorchSha256;
  kernelSetSha256: HoloTorchSha256;
  runtimeSha256: HoloTorchSha256;
  sourceRevision: string;
}

export type HoloTorchArtifactBindingMaterial = Omit<
  HoloTorchShadowBinding,
  'artifactBindingSha256'
>;

export interface HoloTorchExecutionEnvironment {
  /** Caller-observed availability; this field is not hardware attestation. */
  available: boolean;
  runtime: {
    name: string;
    version: string;
    hostOS: string;
  };
  adapter: {
    vendor: string;
    architecture: string;
    device: string;
    driver: string;
    fingerprintSha256: HoloTorchSha256;
  };
}

export interface HoloTorchTensorSetFingerprint {
  tensorSetSha256: HoloTorchSha256;
  tensorCount: number;
  totalBytes: number;
}

export interface HoloTorchShadowExecutionReceipt {
  schema: typeof HOLOTORCH_SHADOW_EXECUTION_SCHEMA;
  authority: 'shadow-only';
  status: 'observed';
  trust: {
    executionEvidence: 'caller-observed';
    authentication: 'self-hash-only';
    executionClass: 'one-shot-audit';
  };
  model: {
    name: string;
    architecture: 'holo-gpt2-v0';
    config: {
      nLayer: number;
      nEmbd: number;
      nHead: number;
      vocab: number;
      maxPosition: number;
    };
  };
  artifact: {
    artifactBindingSha256: HoloTorchSha256;
    checkpointSha256: HoloTorchSha256;
    tokenizerSha256: HoloTorchSha256;
    tensorSetSha256: HoloTorchSha256;
    tensorCount: number;
    totalBytes: number;
  };
  runtime: {
    backend: 'holotorch-webgpu';
    kernelSetSha256: HoloTorchSha256;
    runtimeSha256: HoloTorchSha256;
    sourceRevision: string;
    name: string;
    version: string;
    hostOS: string;
    adapter: {
      vendor: string;
      architecture: string;
      device: string;
      driver: string;
      fingerprintSha256: HoloTorchSha256;
    };
  };
  input: {
    dtype: 'u32le';
    tokenCount: number;
    tokenIdsSha256: HoloTorchSha256;
  };
  output: {
    dtype: 'f32le';
    shape: [number, number];
    logitsSha256: HoloTorchSha256;
    finite: true;
  };
  timing: {
    startedAt: string;
    durationMs: number;
  };
  receiptSha256: HoloTorchSha256;
}

export interface HoloTorchShadowVerificationPolicy {
  artifactBindingSha256: HoloTorchSha256;
  adapterFingerprintSha256: HoloTorchSha256;
  sourceRevision: string;
}

export interface HoloTorchShadowExecutor {
  /** Executes once. Create a new audit executor for each sampled observation. */
  execute(ids: Uint32Array): Promise<{
    logits: Float32Array;
    receipt: HoloTorchShadowExecutionReceipt;
  }>;
}

export interface HoloTorchShadowClock {
  nowMs(): number;
  nowIso(): string;
}

interface TensorDescriptor {
  name: string;
  value: Float32Array;
  shape: number[];
}

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireSha256(value: unknown, label: string): HoloTorchSha256 {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`HoloTorch shadow admission: ${label} must be sha256:<64 lowercase hex>`);
  }
  return value as HoloTorchSha256;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`HoloTorch shadow admission: ${label} must be a non-empty trimmed string`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`HoloTorch shadow admission: ${label} must be a positive safe integer`);
  }
  return Number(value);
}

function requireFiniteTensor(value: unknown, expectedLength: number, label: string): Float32Array {
  if (!(value instanceof Float32Array) || value.length !== expectedLength) {
    throw new Error(`HoloTorch shadow admission: ${label} must be Float32Array(${expectedLength})`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(value[index])) {
      throw new Error(`HoloTorch shadow admission: ${label} contains a non-finite value`);
    }
  }
  return value;
}

function blockTensorDescriptors(
  block: BlockWeights,
  blockIndex: number,
  nEmbd: number
): TensorDescriptor[] {
  const prefix = `blocks.${blockIndex}`;
  return [
    {
      name: `${prefix}.ln1g`,
      value: requireFiniteTensor(block.ln1g, nEmbd, `${prefix}.ln1g`),
      shape: [nEmbd],
    },
    {
      name: `${prefix}.ln1b`,
      value: requireFiniteTensor(block.ln1b, nEmbd, `${prefix}.ln1b`),
      shape: [nEmbd],
    },
    {
      name: `${prefix}.wqkv`,
      value: requireFiniteTensor(block.wqkv, nEmbd * 3 * nEmbd, `${prefix}.wqkv`),
      shape: [nEmbd, 3 * nEmbd],
    },
    {
      name: `${prefix}.bqkv`,
      value: requireFiniteTensor(block.bqkv, 3 * nEmbd, `${prefix}.bqkv`),
      shape: [3 * nEmbd],
    },
    {
      name: `${prefix}.wproj`,
      value: requireFiniteTensor(block.wproj, nEmbd * nEmbd, `${prefix}.wproj`),
      shape: [nEmbd, nEmbd],
    },
    {
      name: `${prefix}.bproj`,
      value: requireFiniteTensor(block.bproj, nEmbd, `${prefix}.bproj`),
      shape: [nEmbd],
    },
    {
      name: `${prefix}.ln2g`,
      value: requireFiniteTensor(block.ln2g, nEmbd, `${prefix}.ln2g`),
      shape: [nEmbd],
    },
    {
      name: `${prefix}.ln2b`,
      value: requireFiniteTensor(block.ln2b, nEmbd, `${prefix}.ln2b`),
      shape: [nEmbd],
    },
    {
      name: `${prefix}.wfc1`,
      value: requireFiniteTensor(block.wfc1, nEmbd * 4 * nEmbd, `${prefix}.wfc1`),
      shape: [nEmbd, 4 * nEmbd],
    },
    {
      name: `${prefix}.bfc1`,
      value: requireFiniteTensor(block.bfc1, 4 * nEmbd, `${prefix}.bfc1`),
      shape: [4 * nEmbd],
    },
    {
      name: `${prefix}.wfc2`,
      value: requireFiniteTensor(block.wfc2, 4 * nEmbd * nEmbd, `${prefix}.wfc2`),
      shape: [4 * nEmbd, nEmbd],
    },
    {
      name: `${prefix}.bfc2`,
      value: requireFiniteTensor(block.bfc2, nEmbd, `${prefix}.bfc2`),
      shape: [nEmbd],
    },
  ];
}

function modelTensorDescriptors(
  weights: ModelWeights,
  config: ModelConfig
): { tensors: TensorDescriptor[]; nLayer: number; maxPosition: number } {
  const nEmbd = requirePositiveInteger(config.nEmbd, 'config.nEmbd');
  const nHead = requirePositiveInteger(config.nHead, 'config.nHead');
  const vocab = requirePositiveInteger(config.vocab, 'config.vocab');
  if (nEmbd % nHead !== 0) {
    throw new Error('HoloTorch shadow admission: config.nEmbd must be divisible by config.nHead');
  }
  if (!Array.isArray(weights.blocks) || weights.blocks.length === 0) {
    throw new Error('HoloTorch shadow admission: weights.blocks must contain at least one layer');
  }
  if (!(weights.wpe instanceof Float32Array) || weights.wpe.length % nEmbd !== 0) {
    throw new Error('HoloTorch shadow admission: wpe length must be a positive multiple of nEmbd');
  }
  const maxPosition = weights.wpe.length / nEmbd;
  requirePositiveInteger(maxPosition, 'maxPosition');
  const tensors: TensorDescriptor[] = [
    {
      name: 'wte',
      value: requireFiniteTensor(weights.wte, vocab * nEmbd, 'wte'),
      shape: [vocab, nEmbd],
    },
    {
      name: 'wpe',
      value: requireFiniteTensor(weights.wpe, maxPosition * nEmbd, 'wpe'),
      shape: [maxPosition, nEmbd],
    },
  ];
  weights.blocks.forEach((block, index) => {
    tensors.push(...blockTensorDescriptors(block, index, nEmbd));
  });
  tensors.push(
    { name: 'lnfg', value: requireFiniteTensor(weights.lnfg, nEmbd, 'lnfg'), shape: [nEmbd] },
    { name: 'lnfb', value: requireFiniteTensor(weights.lnfb, nEmbd, 'lnfb'), shape: [nEmbd] }
  );
  return { tensors, nLayer: weights.blocks.length, maxPosition };
}

function cloneBlockWeights(block: BlockWeights): BlockWeights {
  return {
    ln1g: new Float32Array(block.ln1g),
    ln1b: new Float32Array(block.ln1b),
    wqkv: new Float32Array(block.wqkv),
    bqkv: new Float32Array(block.bqkv),
    wproj: new Float32Array(block.wproj),
    bproj: new Float32Array(block.bproj),
    ln2g: new Float32Array(block.ln2g),
    ln2b: new Float32Array(block.ln2b),
    wfc1: new Float32Array(block.wfc1),
    bfc1: new Float32Array(block.bfc1),
    wfc2: new Float32Array(block.wfc2),
    bfc2: new Float32Array(block.bfc2),
  };
}

function snapshotModelWeights(weights: ModelWeights): ModelWeights {
  return {
    wte: new Float32Array(weights.wte),
    wpe: new Float32Array(weights.wpe),
    blocks: weights.blocks.map(cloneBlockWeights),
    lnfg: new Float32Array(weights.lnfg),
    lnfb: new Float32Array(weights.lnfb),
  };
}

function float32LittleEndianBytes(value: Float32Array): Uint8Array {
  const bytes = new Uint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) {
    view.setFloat32(index * 4, value[index], true);
  }
  return bytes;
}

function uint32LittleEndianBytes(value: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) {
    view.setUint32(index * 4, value[index], true);
  }
  return bytes;
}

async function secureBytesHash(value: Uint8Array, label: string): Promise<HoloTorchSha256> {
  return requireSha256(await hashBytes(value, 'sha256'), label);
}

async function secureCanonicalHash(value: unknown, label: string): Promise<HoloTorchSha256> {
  const canonical = canonicalizeDomainReceiptPayload(value);
  return requireSha256(await hashReceiptPayloadAsync(canonical, 'secure'), label);
}

export async function fingerprintHoloTorchTensorSet(
  weights: ModelWeights,
  config: ModelConfig
): Promise<HoloTorchTensorSetFingerprint> {
  const { tensors, nLayer, maxPosition } = modelTensorDescriptors(weights, config);
  let totalBytes = 0;
  const manifestTensors = [];
  for (const tensor of tensors) {
    const bytes = float32LittleEndianBytes(tensor.value);
    totalBytes += bytes.byteLength;
    manifestTensors.push({
      name: tensor.name,
      dtype: 'f32le',
      shape: tensor.shape,
      bytes: bytes.byteLength,
      sha256: await secureBytesHash(bytes, `${tensor.name} hash`),
    });
  }
  const tensorSetSha256 = await secureCanonicalHash(
    {
      schema: HOLOTORCH_TENSOR_SET_SCHEMA,
      architecture: 'holo-gpt2-v0',
      config: {
        nLayer,
        nEmbd: config.nEmbd,
        nHead: config.nHead,
        vocab: config.vocab,
        maxPosition,
      },
      tensors: manifestTensors,
    },
    'tensorSetSha256'
  );
  return { tensorSetSha256, tensorCount: tensors.length, totalBytes };
}

function validateBindingMaterial(binding: HoloTorchArtifactBindingMaterial): void {
  if (!MODEL_NAME_PATTERN.test(binding.model)) {
    throw new Error('HoloTorch shadow admission: model must be a portable model identifier');
  }
  if (binding.architecture !== 'holo-gpt2-v0') {
    throw new Error('HoloTorch shadow admission: architecture must be holo-gpt2-v0');
  }
  const nLayer = requirePositiveInteger(binding.config?.nLayer, 'config.nLayer');
  const nEmbd = requirePositiveInteger(binding.config?.nEmbd, 'config.nEmbd');
  const nHead = requirePositiveInteger(binding.config?.nHead, 'config.nHead');
  requirePositiveInteger(binding.config?.vocab, 'config.vocab');
  requirePositiveInteger(binding.config?.maxPosition, 'config.maxPosition');
  if (nEmbd % nHead !== 0) {
    throw new Error('HoloTorch shadow admission: config.nEmbd must be divisible by config.nHead');
  }
  if (nLayer > Number.MAX_SAFE_INTEGER) {
    throw new Error('HoloTorch shadow admission: config.nLayer is outside the safe range');
  }
  requireSha256(binding.checkpointSha256, 'checkpointSha256');
  requireSha256(binding.tokenizerSha256, 'tokenizerSha256');
  requireSha256(binding.expectedTensorSetSha256, 'expectedTensorSetSha256');
  requireSha256(binding.kernelSetSha256, 'kernelSetSha256');
  requireSha256(binding.runtimeSha256, 'runtimeSha256');
  requireText(binding.sourceRevision, 'sourceRevision');
}

function validateBinding(binding: HoloTorchShadowBinding): void {
  validateBindingMaterial(binding);
  requireSha256(binding.artifactBindingSha256, 'artifactBindingSha256');
}

export async function deriveHoloTorchArtifactBindingSha256(
  binding: HoloTorchArtifactBindingMaterial
): Promise<HoloTorchSha256> {
  validateBindingMaterial(binding);
  return secureCanonicalHash(
    {
      schema: HOLOTORCH_ARTIFACT_BINDING_SCHEMA,
      architecture: binding.architecture,
      model: binding.model,
      config: { ...binding.config },
      checkpointSha256: binding.checkpointSha256,
      tokenizerSha256: binding.tokenizerSha256,
      tensorSetSha256: binding.expectedTensorSetSha256,
      kernelSetSha256: binding.kernelSetSha256,
      runtimeSha256: binding.runtimeSha256,
      sourceRevision: binding.sourceRevision,
    },
    'artifactBindingSha256'
  );
}

function validateEnvironment(
  environment: HoloTorchExecutionEnvironment
): HoloTorchExecutionEnvironment {
  if (!environment.available) {
    throw new Error('HoloTorch shadow admission: WebGPU hardware unavailable');
  }
  requireText(environment.runtime.name, 'runtime.name');
  requireText(environment.runtime.version, 'runtime.version');
  requireText(environment.runtime.hostOS, 'runtime.hostOS');
  requireText(environment.adapter.vendor, 'adapter.vendor');
  requireText(environment.adapter.architecture, 'adapter.architecture');
  requireText(environment.adapter.device, 'adapter.device');
  requireText(environment.adapter.driver, 'adapter.driver');
  requireSha256(environment.adapter.fingerprintSha256, 'adapter.fingerprintSha256');
  return environment;
}

const DEFAULT_CLOCK: HoloTorchShadowClock = {
  nowMs: () => globalThis.performance.now(),
  nowIso: () => new Date().toISOString(),
};

/**
 * Creates a one-shot, caller-observed audit. The receipt binds the observed
 * inputs and outputs but deliberately grants no serving or hardware-attestation authority.
 */
export async function createHoloTorchShadowExecutor(args: {
  model: HoloTorchModel | null;
  weights: ModelWeights;
  config: ModelConfig;
  binding: HoloTorchShadowBinding;
  environment: HoloTorchExecutionEnvironment;
  clock?: HoloTorchShadowClock;
}): Promise<HoloTorchShadowExecutor> {
  validateBinding(args.binding);
  validateEnvironment(args.environment);
  if (!args.model) {
    throw new Error('HoloTorch shadow admission: WebGPU hardware unavailable');
  }
  modelTensorDescriptors(args.weights, args.config);
  const config: ModelConfig = {
    nEmbd: args.config.nEmbd,
    nHead: args.config.nHead,
    vocab: args.config.vocab,
  };
  const weights = snapshotModelWeights(args.weights);
  const binding: HoloTorchShadowBinding = { ...args.binding };
  binding.config = { ...args.binding.config };
  const environment: HoloTorchExecutionEnvironment = {
    available: args.environment.available,
    runtime: { ...args.environment.runtime },
    adapter: { ...args.environment.adapter },
  };
  const layout = modelTensorDescriptors(weights, config);
  const actualBindingConfig = {
    nLayer: layout.nLayer,
    nEmbd: config.nEmbd,
    nHead: config.nHead,
    vocab: config.vocab,
    maxPosition: layout.maxPosition,
  };
  if (
    binding.architecture !== 'holo-gpt2-v0' ||
    Object.keys(actualBindingConfig).some(
      (key) =>
        actualBindingConfig[key as keyof typeof actualBindingConfig] !==
        binding.config[key as keyof typeof binding.config]
    )
  ) {
    throw new Error('HoloTorch shadow admission: binding config does not match the model tensors');
  }
  const fingerprint = await fingerprintHoloTorchTensorSet(weights, config);
  if (fingerprint.tensorSetSha256 !== binding.expectedTensorSetSha256) {
    throw new Error(
      'HoloTorch shadow admission: actual tensor set does not match the expected tensor set'
    );
  }
  const expectedArtifactBinding = await deriveHoloTorchArtifactBindingSha256({
    model: binding.model,
    architecture: binding.architecture,
    config: binding.config,
    checkpointSha256: binding.checkpointSha256,
    tokenizerSha256: binding.tokenizerSha256,
    expectedTensorSetSha256: fingerprint.tensorSetSha256,
    kernelSetSha256: binding.kernelSetSha256,
    runtimeSha256: binding.runtimeSha256,
    sourceRevision: binding.sourceRevision,
  });
  if (binding.artifactBindingSha256 !== expectedArtifactBinding) {
    throw new Error(
      'HoloTorch shadow admission: artifactBindingSha256 does not bind the admitted artifact'
    );
  }
  const nowMs = (args.clock ?? DEFAULT_CLOCK).nowMs.bind(args.clock ?? DEFAULT_CLOCK);
  const nowIso = (args.clock ?? DEFAULT_CLOCK).nowIso.bind(args.clock ?? DEFAULT_CLOCK);
  const run = args.model.run.bind(args.model);
  let consumed = false;

  return {
    async execute(ids: Uint32Array) {
      if (consumed) {
        throw new Error('HoloTorch shadow execution is a one-shot audit and has already run');
      }
      if (!(ids instanceof Uint32Array) || ids.length === 0) {
        throw new Error('HoloTorch shadow execution requires at least one token id');
      }
      const admittedIds = new Uint32Array(ids);
      for (const id of admittedIds) {
        if (id >= config.vocab) {
          throw new Error(`HoloTorch shadow execution token id ${id} is out of vocabulary`);
        }
      }
      if (admittedIds.length > layout.maxPosition) {
        throw new Error(
          'HoloTorch shadow execution exceeds the admitted positional-embedding limit'
        );
      }
      consumed = true;
      const startedAt = nowIso();
      if (Number.isNaN(Date.parse(startedAt))) {
        throw new Error('HoloTorch shadow execution clock returned an invalid ISO timestamp');
      }
      const startedMs = nowMs();
      const modelLogits = await run(new Uint32Array(admittedIds), weights, config);
      if (
        !(modelLogits instanceof Float32Array) ||
        modelLogits.length !== admittedIds.length * config.vocab
      ) {
        throw new Error(
          `HoloTorch shadow execution output length must be ${admittedIds.length * config.vocab}`
        );
      }
      const logits = new Float32Array(modelLogits);
      for (const value of logits) {
        if (!Number.isFinite(value)) {
          throw new Error('HoloTorch shadow execution output contains a non-finite logit');
        }
      }
      const postExecutionFingerprint = await fingerprintHoloTorchTensorSet(weights, config);
      if (postExecutionFingerprint.tensorSetSha256 !== fingerprint.tensorSetSha256) {
        throw new Error('HoloTorch shadow execution mutated the admitted tensor snapshot');
      }
      const durationMs = nowMs() - startedMs;
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        throw new Error('HoloTorch shadow execution clock returned an invalid duration');
      }
      const unsignedReceipt = {
        schema: HOLOTORCH_SHADOW_EXECUTION_SCHEMA,
        authority: 'shadow-only' as const,
        status: 'observed' as const,
        trust: {
          executionEvidence: 'caller-observed' as const,
          authentication: 'self-hash-only' as const,
          executionClass: 'one-shot-audit' as const,
        },
        model: {
          name: binding.model,
          architecture: 'holo-gpt2-v0' as const,
          config: {
            nLayer: layout.nLayer,
            nEmbd: config.nEmbd,
            nHead: config.nHead,
            vocab: config.vocab,
            maxPosition: layout.maxPosition,
          },
        },
        artifact: {
          artifactBindingSha256: binding.artifactBindingSha256,
          checkpointSha256: binding.checkpointSha256,
          tokenizerSha256: binding.tokenizerSha256,
          tensorSetSha256: fingerprint.tensorSetSha256,
          tensorCount: fingerprint.tensorCount,
          totalBytes: fingerprint.totalBytes,
        },
        runtime: {
          backend: 'holotorch-webgpu' as const,
          kernelSetSha256: binding.kernelSetSha256,
          runtimeSha256: binding.runtimeSha256,
          sourceRevision: binding.sourceRevision,
          name: environment.runtime.name,
          version: environment.runtime.version,
          hostOS: environment.runtime.hostOS,
          adapter: { ...environment.adapter },
        },
        input: {
          dtype: 'u32le' as const,
          tokenCount: admittedIds.length,
          tokenIdsSha256: await secureBytesHash(
            uint32LittleEndianBytes(admittedIds),
            'tokenIdsSha256'
          ),
        },
        output: {
          dtype: 'f32le' as const,
          shape: [admittedIds.length, config.vocab] as [number, number],
          logitsSha256: await secureBytesHash(float32LittleEndianBytes(logits), 'logitsSha256'),
          finite: true as const,
        },
        timing: { startedAt, durationMs },
      };
      const receiptSha256 = await secureCanonicalHash(unsignedReceipt, 'receiptSha256');
      const receipt: HoloTorchShadowExecutionReceipt = { ...unsignedReceipt, receiptSha256 };
      return { logits, receipt };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function checkExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
  errors: string[]
): void {
  const expectedSet = new Set(expected);
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${label}.${key} is required`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) errors.push(`${label}.${key} is not allowed by this schema`);
  }
}

function nestedRecord(
  parent: Record<string, unknown>,
  key: string,
  errors: string[]
): Record<string, unknown> | null {
  if (!Object.prototype.hasOwnProperty.call(parent, key)) {
    errors.push(`${key} is required`);
    return null;
  }
  const value = parent[key];
  if (!isRecord(value)) {
    errors.push(`${key} must be an object`);
    return null;
  }
  return value;
}

function checkShaField(
  parent: Record<string, unknown> | null,
  key: string,
  errors: string[]
): void {
  if (parent && (typeof parent[key] !== 'string' || !SHA256_PATTERN.test(parent[key] as string))) {
    errors.push(`${key} must be sha256:<64 lowercase hex>`);
  }
}

/**
 * Checks schema, self-integrity, and equality with a trusted local policy.
 * It does not authenticate the process that produced the observation.
 */
export async function verifyHoloTorchShadowExecutionReceipt(
  value: unknown,
  expected: HoloTorchShadowVerificationPolicy
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['receipt must be a plain object'] };
  checkExactKeys(
    value,
    [
      'schema',
      'authority',
      'status',
      'trust',
      'model',
      'artifact',
      'runtime',
      'input',
      'output',
      'timing',
      'receiptSha256',
    ],
    'receipt',
    errors
  );
  if (value.schema !== HOLOTORCH_SHADOW_EXECUTION_SCHEMA) {
    errors.push(`schema must be ${HOLOTORCH_SHADOW_EXECUTION_SCHEMA}`);
  }
  if (value.authority !== 'shadow-only') errors.push('authority must be shadow-only');
  if (value.status !== 'observed') errors.push('status must be observed');
  const trust = nestedRecord(value, 'trust', errors);
  if (trust) {
    checkExactKeys(
      trust,
      ['executionEvidence', 'authentication', 'executionClass'],
      'trust',
      errors
    );
  }
  if (trust?.executionEvidence !== 'caller-observed') {
    errors.push('trust.executionEvidence must be caller-observed');
  }
  if (trust?.authentication !== 'self-hash-only') {
    errors.push('trust.authentication must be self-hash-only');
  }
  if (trust?.executionClass !== 'one-shot-audit') {
    errors.push('trust.executionClass must be one-shot-audit');
  }

  const model = nestedRecord(value, 'model', errors);
  const modelConfig = model ? nestedRecord(model, 'config', errors) : null;
  if (model) checkExactKeys(model, ['name', 'architecture', 'config'], 'model', errors);
  if (modelConfig) {
    checkExactKeys(
      modelConfig,
      ['nLayer', 'nEmbd', 'nHead', 'vocab', 'maxPosition'],
      'model.config',
      errors
    );
  }
  if (model && (typeof model.name !== 'string' || !MODEL_NAME_PATTERN.test(model.name))) {
    errors.push('model.name must be a portable model identifier');
  }
  if (model?.architecture !== 'holo-gpt2-v0')
    errors.push('model.architecture must be holo-gpt2-v0');
  for (const key of ['nLayer', 'nEmbd', 'nHead', 'vocab', 'maxPosition']) {
    if (modelConfig && (!Number.isSafeInteger(modelConfig[key]) || Number(modelConfig[key]) <= 0)) {
      errors.push(`model.config.${key} must be a positive safe integer`);
    }
  }
  if (
    modelConfig &&
    Number.isSafeInteger(modelConfig.nEmbd) &&
    Number.isSafeInteger(modelConfig.nHead) &&
    Number(modelConfig.nHead) > 0 &&
    Number(modelConfig.nEmbd) % Number(modelConfig.nHead) !== 0
  ) {
    errors.push('model.config.nEmbd must be divisible by model.config.nHead');
  }

  const artifact = nestedRecord(value, 'artifact', errors);
  if (artifact) {
    checkExactKeys(
      artifact,
      [
        'artifactBindingSha256',
        'checkpointSha256',
        'tokenizerSha256',
        'tensorSetSha256',
        'tensorCount',
        'totalBytes',
      ],
      'artifact',
      errors
    );
  }
  for (const key of [
    'artifactBindingSha256',
    'checkpointSha256',
    'tokenizerSha256',
    'tensorSetSha256',
  ]) {
    checkShaField(artifact, key, errors);
  }
  for (const key of ['tensorCount', 'totalBytes']) {
    if (artifact && (!Number.isSafeInteger(artifact[key]) || Number(artifact[key]) <= 0)) {
      errors.push(`artifact.${key} must be a positive safe integer`);
    }
  }

  const runtime = nestedRecord(value, 'runtime', errors);
  const adapter = runtime ? nestedRecord(runtime, 'adapter', errors) : null;
  if (runtime) {
    checkExactKeys(
      runtime,
      [
        'backend',
        'kernelSetSha256',
        'runtimeSha256',
        'sourceRevision',
        'name',
        'version',
        'hostOS',
        'adapter',
      ],
      'runtime',
      errors
    );
  }
  if (adapter) {
    checkExactKeys(
      adapter,
      ['vendor', 'architecture', 'device', 'driver', 'fingerprintSha256'],
      'runtime.adapter',
      errors
    );
  }
  if (runtime?.backend !== 'holotorch-webgpu')
    errors.push('runtime.backend must be holotorch-webgpu');
  checkShaField(runtime, 'kernelSetSha256', errors);
  checkShaField(runtime, 'runtimeSha256', errors);
  checkShaField(adapter, 'fingerprintSha256', errors);
  for (const key of ['sourceRevision', 'name', 'version', 'hostOS']) {
    if (runtime && (typeof runtime[key] !== 'string' || runtime[key] === '')) {
      errors.push(`runtime.${key} must be a non-empty string`);
    }
  }
  for (const key of ['vendor', 'architecture', 'device', 'driver']) {
    if (adapter && (typeof adapter[key] !== 'string' || adapter[key] === '')) {
      errors.push(`runtime.adapter.${key} must be a non-empty string`);
    }
  }

  const input = nestedRecord(value, 'input', errors);
  if (input) checkExactKeys(input, ['dtype', 'tokenCount', 'tokenIdsSha256'], 'input', errors);
  if (input?.dtype !== 'u32le') errors.push('input.dtype must be u32le');
  if (input && (!Number.isSafeInteger(input.tokenCount) || Number(input.tokenCount) <= 0)) {
    errors.push('input.tokenCount must be a positive safe integer');
  }
  checkShaField(input, 'tokenIdsSha256', errors);

  const output = nestedRecord(value, 'output', errors);
  if (output)
    checkExactKeys(output, ['dtype', 'shape', 'logitsSha256', 'finite'], 'output', errors);
  if (output?.dtype !== 'f32le') errors.push('output.dtype must be f32le');
  if (output?.finite !== true) errors.push('output.finite must be true');
  checkShaField(output, 'logitsSha256', errors);
  if (
    output &&
    (!Array.isArray(output.shape) ||
      output.shape.length !== 2 ||
      !output.shape.every((part) => Number.isSafeInteger(part) && Number(part) > 0))
  ) {
    errors.push('output.shape must contain two positive safe integers');
  }
  if (
    input &&
    output &&
    Array.isArray(output.shape) &&
    output.shape.length === 2 &&
    output.shape[0] !== input.tokenCount
  ) {
    errors.push('output.shape token dimension must equal input.tokenCount');
  }
  if (
    output &&
    modelConfig &&
    Array.isArray(output.shape) &&
    output.shape.length === 2 &&
    output.shape[1] !== modelConfig.vocab
  ) {
    errors.push('output.shape vocabulary dimension must equal model.config.vocab');
  }
  if (
    input &&
    modelConfig &&
    Number.isSafeInteger(input.tokenCount) &&
    Number.isSafeInteger(modelConfig.maxPosition) &&
    Number(input.tokenCount) > Number(modelConfig.maxPosition)
  ) {
    errors.push('input.tokenCount must not exceed model.config.maxPosition');
  }

  if (artifact && modelConfig) {
    const nLayer = Number(modelConfig.nLayer);
    const nEmbd = Number(modelConfig.nEmbd);
    const vocab = Number(modelConfig.vocab);
    const maxPosition = Number(modelConfig.maxPosition);
    const expectedTensorCount = 12 * nLayer + 4;
    const expectedTotalBytes =
      4 * (nEmbd * (vocab + maxPosition + 2) + nLayer * (12 * nEmbd * nEmbd + 13 * nEmbd));
    if (!Number.isSafeInteger(expectedTensorCount) || !Number.isSafeInteger(expectedTotalBytes)) {
      errors.push('model config produces tensor metadata outside the safe integer range');
    } else {
      if (artifact.tensorCount !== expectedTensorCount) {
        errors.push('artifact.tensorCount does not match model.config');
      }
      if (artifact.totalBytes !== expectedTotalBytes) {
        errors.push('artifact.totalBytes does not match model.config');
      }
    }
  }

  const timing = nestedRecord(value, 'timing', errors);
  if (timing) checkExactKeys(timing, ['startedAt', 'durationMs'], 'timing', errors);
  if (
    timing &&
    (typeof timing.startedAt !== 'string' || Number.isNaN(Date.parse(timing.startedAt)))
  ) {
    errors.push('timing.startedAt must be an ISO timestamp');
  }
  if (
    timing &&
    (typeof timing.durationMs !== 'number' ||
      !Number.isFinite(timing.durationMs) ||
      timing.durationMs < 0)
  ) {
    errors.push('timing.durationMs must be a finite non-negative number');
  }
  checkShaField(value, 'receiptSha256', errors);

  if (!isRecord(expected)) {
    errors.push('trusted verification policy is required');
  } else {
    checkExactKeys(
      expected,
      ['artifactBindingSha256', 'adapterFingerprintSha256', 'sourceRevision'],
      'expected',
      errors
    );
    checkShaField(expected, 'artifactBindingSha256', errors);
    checkShaField(expected, 'adapterFingerprintSha256', errors);
    if (typeof expected.sourceRevision !== 'string' || expected.sourceRevision.length === 0) {
      errors.push('expected.sourceRevision must be a non-empty string');
    }
    if (
      artifact &&
      typeof expected.artifactBindingSha256 === 'string' &&
      artifact.artifactBindingSha256 !== expected.artifactBindingSha256
    ) {
      errors.push('artifactBindingSha256 does not match trusted verification policy');
    }
    if (
      adapter &&
      typeof expected.adapterFingerprintSha256 === 'string' &&
      adapter.fingerprintSha256 !== expected.adapterFingerprintSha256
    ) {
      errors.push('adapter fingerprint does not match trusted verification policy');
    }
    if (
      runtime &&
      typeof expected.sourceRevision === 'string' &&
      runtime.sourceRevision !== expected.sourceRevision
    ) {
      errors.push('sourceRevision does not match trusted verification policy');
    }
  }

  if (model && artifact && runtime) {
    try {
      const derivedArtifactBinding = await deriveHoloTorchArtifactBindingSha256({
        model: model.name as string,
        architecture: model.architecture as 'holo-gpt2-v0',
        config: modelConfig as unknown as HoloTorchShadowBinding['config'],
        checkpointSha256: artifact.checkpointSha256 as HoloTorchSha256,
        tokenizerSha256: artifact.tokenizerSha256 as HoloTorchSha256,
        expectedTensorSetSha256: artifact.tensorSetSha256 as HoloTorchSha256,
        kernelSetSha256: runtime.kernelSetSha256 as HoloTorchSha256,
        runtimeSha256: runtime.runtimeSha256 as HoloTorchSha256,
        sourceRevision: runtime.sourceRevision as string,
      });
      if (artifact.artifactBindingSha256 !== derivedArtifactBinding) {
        errors.push('artifactBindingSha256 does not match the receipt artifact fields');
      }
    } catch (error) {
      errors.push(
        `artifact binding derivation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (typeof value.receiptSha256 === 'string' && SHA256_PATTERN.test(value.receiptSha256)) {
    try {
      const { receiptSha256, ...unsigned } = value;
      const expected = await secureCanonicalHash(unsigned, 'receiptSha256');
      if (receiptSha256 !== expected) {
        errors.push('receiptSha256 does not match the canonical receipt payload');
      }
    } catch (error) {
      errors.push(
        `receipt canonicalization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return { valid: errors.length === 0, errors };
}
