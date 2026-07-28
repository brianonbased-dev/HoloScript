import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOLO_RUNTIME_SCHEMA = 'holoscript.holo-runtime.m1';
export const HOLO_RUNNER_TOKENIZER_MODULE = 'scripts/holorunner-tokenizer-v0.mjs';
export const HOLO_RUNTIME_MODEL_FLEET_NODE_KIND = {
  kind: 'holo-runtime-m1-cpu-decoder',
  package: '@holoscript/holo-runtime',
  backend: 'pure-ts-cpu',
  checkpointFamily: 'holorunner-s0-state-dict',
  tokenizer: 'holorunner-tokenizer-v0.mjs direct import',
  role: 'sovereign decoder seed under @model_fleet',
} as const;

const SPECIAL_COUNT = 6;
const BYTE_BASE = SPECIAL_COUNT;
const MERGE_BASE = BYTE_BASE + 256;
const DEFAULT_EPSILON = 1e-5;

export interface HoloRunnerS0ConfigInput {
  vocab_size?: number;
  vocabSize?: number;
  n_layer?: number;
  nLayer?: number;
  n_head?: number;
  nHead?: number;
  n_embd?: number;
  nEmbd?: number;
  block_size?: number;
  blockSize?: number;
  dropout?: number;
}

export interface HoloRunnerS0Config {
  vocabSize: number;
  nLayer: number;
  nHead: number;
  nEmbd: number;
  blockSize: number;
  dropout: number;
}

export interface TensorRecord {
  data: TensorInputData;
  shape?: readonly number[];
  dtype?: string;
}

export type TensorInputData =
  | Float32Array
  | readonly number[]
  | readonly (readonly number[])[]
  | readonly (readonly (readonly number[])[])[];
export type TensorInput = TensorInputData | TensorRecord;

export interface Tensor {
  data: Float32Array;
  shape: number[];
}

export interface HoloRunnerS0StateDictInput {
  config: HoloRunnerS0ConfigInput;
  state?: Record<string, TensorInput>;
  model?: Record<string, TensorInput>;
  tokenizer?: {
    merges?: HoloRunnerMerge[];
    modulePath?: string;
  };
}

export interface HoloRunnerS0BlockWeights {
  ln1Weight: Tensor;
  ln1Bias: Tensor;
  attnInProjWeight: Tensor;
  attnInProjBias: Tensor;
  attnOutProjWeight: Tensor;
  attnOutProjBias: Tensor;
  ln2Weight: Tensor;
  ln2Bias: Tensor;
  mlp0Weight: Tensor;
  mlp0Bias: Tensor;
  mlp2Weight: Tensor;
  mlp2Bias: Tensor;
}

export interface HoloRunnerS0Weights {
  tokWeight: Tensor;
  posWeight: Tensor;
  lnfWeight: Tensor;
  lnfBias: Tensor;
  headWeight: Tensor;
  blocks: HoloRunnerS0BlockWeights[];
}

export interface LoadedHoloRunnerS0 {
  schema: typeof HOLO_RUNTIME_SCHEMA;
  config: HoloRunnerS0Config;
  weights: HoloRunnerS0Weights;
  sourceKeys: string[];
  tokenizer?: {
    merges?: HoloRunnerMerge[];
    modulePath?: string;
  };
}

export interface HoloRuntimeForwardResult {
  logits: Float32Array;
  shape: [tokens: number, vocab: number];
}

export interface HoloRunnerEncodedToken {
  symbol: string;
  byteLength?: number;
  start?: number;
  end?: number;
}

export type HoloRunnerMerge = readonly [string, string, string];

export interface HoloRunnerTokenizerModule {
  encode: (text: string, merges: readonly HoloRunnerMerge[]) => HoloRunnerEncodedToken[];
  decode: (tokens: readonly HoloRunnerEncodedToken[]) => string;
}

export interface HoloRunnerTokenizerBridge extends HoloRunnerTokenizerModule {
  modulePath: string;
  encodeTextToIds: (text: string, merges: readonly HoloRunnerMerge[]) => number[];
  decodeIdsToText: (ids: readonly number[], merges: readonly HoloRunnerMerge[]) => string;
}

export interface SampleOptions {
  temperature?: number;
  topK?: number;
  rng?: () => number;
}

export interface SampleResult {
  tokenId: number;
  probability: number;
  candidates: Array<{ tokenId: number; probability: number; logit: number }>;
}

export interface GenerateOptions extends SampleOptions {
  maxNewTokens: number;
  stopTokenIds?: readonly number[];
}

export class HoloRuntimeKvCache {
  readonly layers: Array<{ keys: Float32Array; values: Float32Array; length: number }>;

  constructor(
    readonly nLayer: number,
    readonly blockSize: number,
    readonly nEmbd: number
  ) {
    this.layers = Array.from({ length: nLayer }, () => ({
      keys: new Float32Array(blockSize * nEmbd),
      values: new Float32Array(blockSize * nEmbd),
      length: 0,
    }));
  }

  reset(): void {
    for (const layer of this.layers) {
      layer.keys.fill(0);
      layer.values.fill(0);
      layer.length = 0;
    }
  }

  append(layerIndex: number, key: Float32Array, value: Float32Array): number {
    const layer = this.layers[layerIndex];
    if (!layer) throw new Error(`KV cache layer ${layerIndex} is out of range`);
    if (key.length !== this.nEmbd || value.length !== this.nEmbd) {
      throw new Error(`KV cache vectors must have ${this.nEmbd} elements`);
    }
    if (layer.length >= this.blockSize) {
      throw new Error(`KV cache exceeded block size ${this.blockSize}`);
    }
    const offset = layer.length * this.nEmbd;
    layer.keys.set(key, offset);
    layer.values.set(value, offset);
    layer.length += 1;
    return layer.length - 1;
  }

  key(layerIndex: number, tokenIndex: number): Float32Array {
    return this.slice('keys', layerIndex, tokenIndex);
  }

  value(layerIndex: number, tokenIndex: number): Float32Array {
    return this.slice('values', layerIndex, tokenIndex);
  }

  private slice(which: 'keys' | 'values', layerIndex: number, tokenIndex: number): Float32Array {
    const layer = this.layers[layerIndex];
    if (!layer) throw new Error(`KV cache layer ${layerIndex} is out of range`);
    if (tokenIndex < 0 || tokenIndex >= layer.length) {
      throw new Error(`KV cache token ${tokenIndex} is out of range for layer ${layerIndex}`);
    }
    const offset = tokenIndex * this.nEmbd;
    return layer[which].slice(offset, offset + this.nEmbd);
  }
}

export class HoloRuntimeDecoder {
  readonly config: HoloRunnerS0Config;
  readonly weights: HoloRunnerS0Weights;

  constructor(readonly loaded: LoadedHoloRunnerS0) {
    this.config = loaded.config;
    this.weights = loaded.weights;
  }

  createKvCache(): HoloRuntimeKvCache {
    return new HoloRuntimeKvCache(this.config.nLayer, this.config.blockSize, this.config.nEmbd);
  }

  forward(inputIds: readonly number[]): HoloRuntimeForwardResult {
    const { config, weights } = this;
    assertTokenWindow(inputIds, config);
    const tokens = inputIds.length;
    let x = new Float32Array(tokens * config.nEmbd);
    for (let tokenIndex = 0; tokenIndex < tokens; tokenIndex += 1) {
      const tokenId = inputIds[tokenIndex] ?? 0;
      const token = embeddingRow(weights.tokWeight, tokenId, config.nEmbd);
      const pos = embeddingRow(weights.posWeight, tokenIndex, config.nEmbd);
      for (let column = 0; column < config.nEmbd; column += 1) {
        x[tokenIndex * config.nEmbd + column] = token[column] + pos[column];
      }
    }

    for (const block of weights.blocks) {
      const h1 = layerNormSequence(x, tokens, config.nEmbd, block.ln1Weight, block.ln1Bias);
      const attn = causalSelfAttentionSequence(h1, tokens, config, block);
      addInPlace(x, attn);
      const h2 = layerNormSequence(x, tokens, config.nEmbd, block.ln2Weight, block.ln2Bias);
      const mlpHidden = linearSequence(h2, tokens, config.nEmbd, block.mlp0Weight, block.mlp0Bias);
      for (let index = 0; index < mlpHidden.length; index += 1) {
        mlpHidden[index] = geluErf(mlpHidden[index] ?? 0);
      }
      const mlpOut = linearSequence(
        mlpHidden,
        tokens,
        config.nEmbd * 4,
        block.mlp2Weight,
        block.mlp2Bias
      );
      addInPlace(x, mlpOut);
    }

    const normalized = layerNormSequence(
      x,
      tokens,
      config.nEmbd,
      weights.lnfWeight,
      weights.lnfBias
    );
    const logits = linearSequence(normalized, tokens, config.nEmbd, weights.headWeight);
    return { logits, shape: [tokens, config.vocabSize] };
  }

  logitsForLastToken(inputIds: readonly number[]): Float32Array {
    const result = this.forward(inputIds);
    const [, vocab] = result.shape;
    return result.logits.slice(result.logits.length - vocab);
  }

  decodeToken(
    tokenId: number,
    cache: HoloRuntimeKvCache,
    position = cache.layers[0]?.length ?? 0
  ): Float32Array {
    const { config, weights } = this;
    assertTokenId(tokenId, config.vocabSize);
    if (position < 0 || position >= config.blockSize) {
      throw new Error(`position ${position} is outside block size ${config.blockSize}`);
    }
    let x = addVectors(
      embeddingRow(weights.tokWeight, tokenId, config.nEmbd),
      embeddingRow(weights.posWeight, position, config.nEmbd)
    );

    for (let layerIndex = 0; layerIndex < weights.blocks.length; layerIndex += 1) {
      const block = weights.blocks[layerIndex]!;
      const h1 = layerNormVector(x, block.ln1Weight, block.ln1Bias);
      const qkv = linearVector(h1, block.attnInProjWeight, block.attnInProjBias);
      const query = qkv.slice(0, config.nEmbd);
      const key = qkv.slice(config.nEmbd, config.nEmbd * 2);
      const value = qkv.slice(config.nEmbd * 2, config.nEmbd * 3);
      cache.append(layerIndex, key, value);
      const attn = cachedSelfAttention(query, cache, layerIndex, config);
      const projected = linearVector(attn, block.attnOutProjWeight, block.attnOutProjBias);
      x = addVectors(x, projected);
      const h2 = layerNormVector(x, block.ln2Weight, block.ln2Bias);
      const hidden = linearVector(h2, block.mlp0Weight, block.mlp0Bias);
      for (let index = 0; index < hidden.length; index += 1) {
        hidden[index] = geluErf(hidden[index] ?? 0);
      }
      x = addVectors(x, linearVector(hidden, block.mlp2Weight, block.mlp2Bias));
    }

    return linearVector(layerNormVector(x, weights.lnfWeight, weights.lnfBias), weights.headWeight);
  }

  prefill(
    inputIds: readonly number[],
    cache = this.createKvCache()
  ): { logits: Float32Array; cache: HoloRuntimeKvCache } {
    assertTokenWindow(inputIds, this.config);
    let logits = this.decodeToken(inputIds[0] ?? 0, cache, 0);
    for (let index = 1; index < inputIds.length; index += 1) {
      logits = this.decodeToken(inputIds[index] ?? 0, cache, index);
    }
    return { logits, cache };
  }

  generate(inputIds: readonly number[], options: GenerateOptions): number[] {
    const ids = [...inputIds];
    const cache = this.createKvCache();
    let logits = this.prefill(ids, cache).logits;
    const stopTokenIds = new Set(options.stopTokenIds ?? []);
    for (let step = 0; step < options.maxNewTokens; step += 1) {
      const sample = sampleFromLogits(logits, options);
      ids.push(sample.tokenId);
      if (stopTokenIds.has(sample.tokenId)) break;
      logits = this.decodeToken(sample.tokenId, cache);
    }
    return ids;
  }
}

export function loadHoloRunnerS0StateDict(input: HoloRunnerS0StateDictInput): LoadedHoloRunnerS0 {
  const config = normalizeConfig(input.config);
  const state = input.state ?? input.model;
  if (!state) throw new Error('HoloRunner S0 checkpoint requires state or model tensor map');
  const weights = loadWeights(config, state);
  return {
    schema: HOLO_RUNTIME_SCHEMA,
    config,
    weights,
    sourceKeys: Object.keys(state).sort(),
    tokenizer: input.tokenizer,
  };
}

export function loadHoloRunnerS0Checkpoint(raw: unknown): LoadedHoloRunnerS0 {
  if (!isRecord(raw)) throw new Error('checkpoint must be an object');
  const configValue = raw.config;
  if (!isRecord(configValue)) throw new Error('checkpoint.config must be an object');
  const vocabSize = numberField(raw, 'vocab_size') ?? numberField(configValue, 'vocab_size');
  const config = normalizeConfig({ ...configValue, vocab_size: vocabSize });
  const model = raw.model;
  const state = raw.state;
  if (!isTensorMap(model) && !isTensorMap(state)) {
    throw new Error('checkpoint requires model or state tensor map');
  }
  return loadHoloRunnerS0StateDict({
    config,
    state: isTensorMap(state) ? state : undefined,
    model: isTensorMap(model) ? model : undefined,
  });
}

export async function loadHoloRunnerTokenizer(
  options: { modulePath?: string } = {}
): Promise<HoloRunnerTokenizerBridge> {
  const modulePath = resolveTokenizerModulePath(options.modulePath);
  const moduleRecord = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  const encode = moduleRecord.encode;
  const decode = moduleRecord.decode;
  if (typeof encode !== 'function' || typeof decode !== 'function') {
    throw new Error(`Tokenizer module ${modulePath} must export encode and decode functions`);
  }
  const tokenizerModule: HoloRunnerTokenizerModule = {
    encode: encode as HoloRunnerTokenizerModule['encode'],
    decode: decode as HoloRunnerTokenizerModule['decode'],
  };
  return {
    modulePath,
    encode: tokenizerModule.encode,
    decode: tokenizerModule.decode,
    encodeTextToIds(text, merges) {
      return tokenIdsFromEncodedTokens(tokenizerModule.encode(text, merges), merges);
    },
    decodeIdsToText(ids, merges) {
      return tokenizerModule.decode(encodedTokensFromTokenIds(ids, merges));
    },
  };
}

export function resolveTokenizerModulePath(modulePath?: string): string {
  if (modulePath) return resolve(modulePath);
  const ecosystemRoot = process.env.HOLOAI_ECOSYSTEM_ROOT
    ? resolve(process.env.HOLOAI_ECOSYSTEM_ROOT)
    : join(homedir(), '.ai-ecosystem');
  const candidate = join(ecosystemRoot, HOLO_RUNNER_TOKENIZER_MODULE);
  return isAbsolute(candidate) ? candidate : resolve(candidate);
}

export function tokenIdsFromEncodedTokens(
  tokens: readonly HoloRunnerEncodedToken[],
  merges: readonly HoloRunnerMerge[]
): number[] {
  const mergeIds = new Map<string, number>(merges.map((merge, index) => [merge[2], index]));
  return tokens.map((token) => {
    const mergeId = mergeIds.get(token.symbol);
    if (mergeId !== undefined) return MERGE_BASE + mergeId;
    const byte = Number(token.symbol);
    if (Number.isInteger(byte) && byte >= 0 && byte <= 255) return BYTE_BASE + byte;
    throw new Error(`Cannot map tokenizer symbol ${token.symbol} to an S0 token id`);
  });
}

export function encodedTokensFromTokenIds(
  ids: readonly number[],
  merges: readonly HoloRunnerMerge[]
): HoloRunnerEncodedToken[] {
  const tokens: HoloRunnerEncodedToken[] = [];
  for (const id of ids) {
    if (id < SPECIAL_COUNT) continue;
    if (id >= BYTE_BASE && id < MERGE_BASE) {
      tokens.push({ symbol: String(id - BYTE_BASE) });
    } else if (id >= MERGE_BASE) {
      const merge = merges[id - MERGE_BASE];
      if (!merge) throw new Error(`merge token id ${id} has no merge entry`);
      tokens.push({ symbol: merge[2] });
    } else {
      throw new Error(`token id ${id} is not decodable by HoloTokenizer-v0`);
    }
  }
  return tokens;
}

export function sampleFromLogits(logits: Float32Array, options: SampleOptions = {}): SampleResult {
  const temperature = options.temperature ?? 1;
  const topK = options.topK ?? 0;
  const rng = options.rng ?? Math.random;
  if (logits.length === 0) throw new Error('Cannot sample from empty logits');
  if (temperature <= 0) {
    let tokenId = 0;
    for (let index = 1; index < logits.length; index += 1) {
      if ((logits[index] ?? -Infinity) > (logits[tokenId] ?? -Infinity)) tokenId = index;
    }
    return {
      tokenId,
      probability: 1,
      candidates: [{ tokenId, probability: 1, logit: logits[tokenId] ?? 0 }],
    };
  }
  const sorted = Array.from(logits, (logit, tokenId) => ({
    tokenId,
    logit: logit / temperature,
  })).sort((left, right) => right.logit - left.logit);
  const candidates = topK > 0 ? sorted.slice(0, Math.max(1, topK)) : sorted;
  const probabilities = softmaxArray(candidates.map((candidate) => candidate.logit));
  let cursor = Math.min(Math.max(rng(), 0), 0.999999999);
  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= probabilities[index] ?? 0;
    if (cursor <= 0 || index === candidates.length - 1) {
      const candidate = candidates[index]!;
      return {
        tokenId: candidate.tokenId,
        probability: probabilities[index] ?? 0,
        candidates: candidates.map((item, candidateIndex) => ({
          tokenId: item.tokenId,
          logit: item.logit,
          probability: probabilities[candidateIndex] ?? 0,
        })),
      };
    }
  }
  throw new Error('sampling failed to select a token');
}

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function matmul(
  left: Float32Array,
  leftRows: number,
  leftCols: number,
  right: Float32Array,
  rightCols: number
): Float32Array {
  if (left.length !== leftRows * leftCols)
    throw new Error('left matrix shape does not match data length');
  if (right.length !== leftCols * rightCols)
    throw new Error('right matrix shape does not match data length');
  const out = new Float32Array(leftRows * rightCols);
  for (let row = 0; row < leftRows; row += 1) {
    for (let column = 0; column < rightCols; column += 1) {
      let sum = 0;
      for (let inner = 0; inner < leftCols; inner += 1) {
        sum += (left[row * leftCols + inner] ?? 0) * (right[inner * rightCols + column] ?? 0);
      }
      out[row * rightCols + column] = sum;
    }
  }
  return out;
}

export function geluErf(x: number): number {
  return 0.5 * x * (1 + erf(x / Math.SQRT2));
}

export function geluTanhApprox(x: number): number {
  return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
}

export function softmaxArray(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  return sum === 0 ? values.map(() => 0) : exps.map((value) => value / sum);
}

export function layerNormVector(
  input: Float32Array,
  weight: Tensor,
  bias: Tensor,
  epsilon = DEFAULT_EPSILON
): Float32Array {
  const width = input.length;
  if (weight.data.length !== width || bias.data.length !== width) {
    throw new Error(`layerNorm width ${width} does not match weight/bias`);
  }
  let mean = 0;
  for (const value of input) mean += value;
  mean /= width;
  let variance = 0;
  for (const value of input) {
    const delta = value - mean;
    variance += delta * delta;
  }
  variance /= width;
  const scale = 1 / Math.sqrt(variance + epsilon);
  const out = new Float32Array(width);
  for (let index = 0; index < width; index += 1) {
    out[index] =
      ((input[index] ?? 0) - mean) * scale * (weight.data[index] ?? 0) + (bias.data[index] ?? 0);
  }
  return out;
}

function normalizeConfig(input: HoloRunnerS0ConfigInput): HoloRunnerS0Config {
  const vocabSize = input.vocabSize ?? input.vocab_size;
  const nLayer = input.nLayer ?? input.n_layer;
  const nHead = input.nHead ?? input.n_head;
  const nEmbd = input.nEmbd ?? input.n_embd;
  const blockSize = input.blockSize ?? input.block_size;
  const config = { vocabSize, nLayer, nHead, nEmbd, blockSize };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      throw new Error(`HoloRunner S0 config field ${key} must be a positive integer`);
    }
  }
  if (nEmbd! % nHead! !== 0) {
    throw new Error(`n_embd ${nEmbd} must be divisible by n_head ${nHead}`);
  }
  return {
    vocabSize: vocabSize!,
    nLayer: nLayer!,
    nHead: nHead!,
    nEmbd: nEmbd!,
    blockSize: blockSize!,
    dropout: input.dropout ?? 0,
  };
}

function loadWeights(
  config: HoloRunnerS0Config,
  state: Record<string, TensorInput>
): HoloRunnerS0Weights {
  const blocks: HoloRunnerS0BlockWeights[] = [];
  const headWeight = optionalTensor(state, 'head.weight', [config.vocabSize, config.nEmbd]);
  const tokWeight = stateTensor(state, 'tok.weight', [config.vocabSize, config.nEmbd]);
  for (let layer = 0; layer < config.nLayer; layer += 1) {
    const prefix = `blocks.${layer}`;
    blocks.push({
      ln1Weight: stateTensor(state, `${prefix}.ln1.weight`, [config.nEmbd]),
      ln1Bias: stateTensor(state, `${prefix}.ln1.bias`, [config.nEmbd]),
      attnInProjWeight: stateTensor(state, `${prefix}.attn.in_proj_weight`, [
        3 * config.nEmbd,
        config.nEmbd,
      ]),
      attnInProjBias: stateTensor(state, `${prefix}.attn.in_proj_bias`, [3 * config.nEmbd]),
      attnOutProjWeight: stateTensor(state, `${prefix}.attn.out_proj.weight`, [
        config.nEmbd,
        config.nEmbd,
      ]),
      attnOutProjBias: stateTensor(state, `${prefix}.attn.out_proj.bias`, [config.nEmbd]),
      ln2Weight: stateTensor(state, `${prefix}.ln2.weight`, [config.nEmbd]),
      ln2Bias: stateTensor(state, `${prefix}.ln2.bias`, [config.nEmbd]),
      mlp0Weight: stateTensor(state, `${prefix}.mlp.0.weight`, [4 * config.nEmbd, config.nEmbd]),
      mlp0Bias: stateTensor(state, `${prefix}.mlp.0.bias`, [4 * config.nEmbd]),
      mlp2Weight: stateTensor(state, `${prefix}.mlp.2.weight`, [config.nEmbd, 4 * config.nEmbd]),
      mlp2Bias: stateTensor(state, `${prefix}.mlp.2.bias`, [config.nEmbd]),
    });
  }
  return {
    tokWeight,
    posWeight: stateTensor(state, 'pos.weight', [config.blockSize, config.nEmbd]),
    lnfWeight: stateTensor(state, 'lnf.weight', [config.nEmbd]),
    lnfBias: stateTensor(state, 'lnf.bias', [config.nEmbd]),
    headWeight: headWeight ?? tokWeight,
    blocks,
  };
}

function stateTensor(
  state: Record<string, TensorInput>,
  key: string,
  expectedShape: readonly number[]
): Tensor {
  const input = state[key];
  if (input === undefined) throw new Error(`S0 state_dict is missing ${key}`);
  return tensorFrom(input, key, expectedShape);
}

function optionalTensor(
  state: Record<string, TensorInput>,
  key: string,
  expectedShape: readonly number[]
): Tensor | undefined {
  const input = state[key];
  return input === undefined ? undefined : tensorFrom(input, key, expectedShape);
}

function tensorFrom(input: TensorInput, name: string, expectedShape: readonly number[]): Tensor {
  const payload = isTensorRecord(input) ? input.data : input;
  const explicitShape = isTensorRecord(input) ? input.shape : undefined;
  const shape = explicitShape ? [...explicitShape] : inferShape(payload);
  const data = flattenTensorData(payload);
  const expectedSize = expectedShape.reduce((total, value) => total * value, 1);
  if (data.length !== expectedSize) {
    throw new Error(
      `${name} expected ${expectedSize} values for shape [${expectedShape.join(', ')}], got ${data.length}`
    );
  }
  if (shape.join('x') !== expectedShape.join('x')) {
    throw new Error(
      `${name} expected shape [${expectedShape.join(', ')}], got [${shape.join(', ')}]`
    );
  }
  return { data, shape: [...expectedShape] };
}

function flattenTensorData(input: TensorInputData): Float32Array {
  if (input instanceof Float32Array) return new Float32Array(input);
  const out: number[] = [];
  flattenNumbers(input, out);
  return Float32Array.from(out);
}

function flattenNumbers(input: unknown, out: number[]): void {
  if (typeof input === 'number') {
    out.push(input);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) flattenNumbers(item, out);
    return;
  }
  throw new Error('tensor data must contain only numbers or nested number arrays');
}

function inferShape(input: TensorInputData): number[] {
  if (input instanceof Float32Array) return [input.length];
  if (!Array.isArray(input)) return [];
  if (input.length === 0) return [0];
  const firstShape = inferShape(input[0] as TensorInputData);
  for (const item of input.slice(1)) {
    const itemShape = inferShape(item as TensorInputData);
    if (itemShape.join('x') !== firstShape.join('x'))
      throw new Error('ragged tensor arrays are not supported');
  }
  return [input.length, ...firstShape];
}

function embeddingRow(tensor: Tensor, rowIndex: number, width: number): Float32Array {
  if (rowIndex < 0 || rowIndex >= tensor.shape[0]!) {
    throw new Error(`embedding row ${rowIndex} is out of range`);
  }
  const offset = rowIndex * width;
  return tensor.data.slice(offset, offset + width);
}

function assertTokenWindow(inputIds: readonly number[], config: HoloRunnerS0Config): void {
  if (inputIds.length === 0) throw new Error('inputIds must contain at least one token');
  if (inputIds.length > config.blockSize) {
    throw new Error(`input length ${inputIds.length} exceeds block size ${config.blockSize}`);
  }
  for (const id of inputIds) assertTokenId(id, config.vocabSize);
}

function assertTokenId(id: number, vocabSize: number): void {
  if (!Number.isInteger(id) || id < 0 || id >= vocabSize) {
    throw new Error(`token id ${id} is outside vocab size ${vocabSize}`);
  }
}

function layerNormSequence(
  input: Float32Array,
  rows: number,
  width: number,
  weight: Tensor,
  bias: Tensor
): Float32Array {
  const out = new Float32Array(input.length);
  for (let row = 0; row < rows; row += 1) {
    out.set(
      layerNormVector(input.slice(row * width, row * width + width), weight, bias),
      row * width
    );
  }
  return out;
}

function linearSequence(
  input: Float32Array,
  rows: number,
  inputWidth: number,
  weight: Tensor,
  bias?: Tensor
): Float32Array {
  const outputWidth = weight.shape[0]!;
  const out = new Float32Array(rows * outputWidth);
  for (let row = 0; row < rows; row += 1) {
    const vector = linearVector(
      input.slice(row * inputWidth, row * inputWidth + inputWidth),
      weight,
      bias
    );
    out.set(vector, row * outputWidth);
  }
  return out;
}

function linearVector(input: Float32Array, weight: Tensor, bias?: Tensor): Float32Array {
  const outputWidth = weight.shape[0]!;
  const inputWidth = weight.shape[1]!;
  if (input.length !== inputWidth) {
    throw new Error(`linear input width ${input.length} does not match weight width ${inputWidth}`);
  }
  const out = new Float32Array(outputWidth);
  for (let row = 0; row < outputWidth; row += 1) {
    let sum = bias ? (bias.data[row] ?? 0) : 0;
    for (let column = 0; column < inputWidth; column += 1) {
      sum += (weight.data[row * inputWidth + column] ?? 0) * (input[column] ?? 0);
    }
    out[row] = sum;
  }
  return out;
}

function causalSelfAttentionSequence(
  input: Float32Array,
  tokens: number,
  config: HoloRunnerS0Config,
  block: HoloRunnerS0BlockWeights
): Float32Array {
  const qkv = linearSequence(
    input,
    tokens,
    config.nEmbd,
    block.attnInProjWeight,
    block.attnInProjBias
  );
  const context = new Float32Array(tokens * config.nEmbd);
  const headDim = config.nEmbd / config.nHead;
  const scale = 1 / Math.sqrt(headDim);
  for (let token = 0; token < tokens; token += 1) {
    for (let head = 0; head < config.nHead; head += 1) {
      const scores: number[] = [];
      for (let source = 0; source <= token; source += 1) {
        let dot = 0;
        for (let dim = 0; dim < headDim; dim += 1) {
          const q = qkv[token * 3 * config.nEmbd + head * headDim + dim] ?? 0;
          const k = qkv[source * 3 * config.nEmbd + config.nEmbd + head * headDim + dim] ?? 0;
          dot += q * k;
        }
        scores.push(dot * scale);
      }
      const probs = softmaxArray(scores);
      for (let dim = 0; dim < headDim; dim += 1) {
        let value = 0;
        for (let source = 0; source <= token; source += 1) {
          const v = qkv[source * 3 * config.nEmbd + 2 * config.nEmbd + head * headDim + dim] ?? 0;
          value += (probs[source] ?? 0) * v;
        }
        context[token * config.nEmbd + head * headDim + dim] = value;
      }
    }
  }
  return linearSequence(
    context,
    tokens,
    config.nEmbd,
    block.attnOutProjWeight,
    block.attnOutProjBias
  );
}

function cachedSelfAttention(
  query: Float32Array,
  cache: HoloRuntimeKvCache,
  layerIndex: number,
  config: HoloRunnerS0Config
): Float32Array {
  const layer = cache.layers[layerIndex]!;
  const headDim = config.nEmbd / config.nHead;
  const scale = 1 / Math.sqrt(headDim);
  const out = new Float32Array(config.nEmbd);
  for (let head = 0; head < config.nHead; head += 1) {
    const scores: number[] = [];
    for (let source = 0; source < layer.length; source += 1) {
      let dot = 0;
      const keyOffset = source * config.nEmbd + head * headDim;
      for (let dim = 0; dim < headDim; dim += 1) {
        dot += (query[head * headDim + dim] ?? 0) * (layer.keys[keyOffset + dim] ?? 0);
      }
      scores.push(dot * scale);
    }
    const probs = softmaxArray(scores);
    for (let dim = 0; dim < headDim; dim += 1) {
      let value = 0;
      for (let source = 0; source < layer.length; source += 1) {
        value +=
          (probs[source] ?? 0) * (layer.values[source * config.nEmbd + head * headDim + dim] ?? 0);
      }
      out[head * headDim + dim] = value;
    }
  }
  return out;
}

function addInPlace(left: Float32Array, right: Float32Array): void {
  if (left.length !== right.length) throw new Error('addInPlace length mismatch');
  for (let index = 0; index < left.length; index += 1) {
    left[index] = (left[index] ?? 0) + (right[index] ?? 0);
  }
}

function addVectors(left: Float32Array, right: Float32Array): Float32Array {
  if (left.length !== right.length) throw new Error('addVectors length mismatch');
  const out = new Float32Array(left.length);
  for (let index = 0; index < left.length; index += 1) {
    out[index] = (left[index] ?? 0) + (right[index] ?? 0);
  }
  return out;
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTensorRecord(value: unknown): value is TensorRecord {
  return isRecord(value) && 'data' in value;
}

function isTensorMap(value: unknown): value is Record<string, TensorInput> {
  return isRecord(value);
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}
