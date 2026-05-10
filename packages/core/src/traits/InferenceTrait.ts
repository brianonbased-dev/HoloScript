/**
 * InferenceTrait — v5.1
 *
 * Run inference (text, image, structured) against registered model adapters.
 *
 * Events:
 *  inference:run      { modelId, input, options }
 *  inference:result   { modelId, output, latencyMs }
 *  inference:error    { modelId, code, error, message }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface InferenceOptions {
  timeoutMs: number;
  maxTokens: number;
  [key: string]: unknown;
}

export interface InferenceAdapterMatchRequest {
  modelId: string;
  input: unknown;
  options: InferenceOptions;
  event: TraitEvent;
  node: HSPlusNode;
  context: TraitContext;
}

export interface InferenceRequest extends InferenceAdapterMatchRequest {
  runNumber: number;
  signal: AbortSignal;
}

export interface InferenceResult {
  output: unknown;
  latencyMs?: number;
  tokensUsed?: number;
  adapterId?: string;
  metadata?: Record<string, unknown>;
}

export interface InferenceAdapter {
  id?: string;
  modelIds?: readonly string[];
  models?: readonly string[];
  canRun?: (request: InferenceAdapterMatchRequest) => boolean;
  run: (request: InferenceRequest) => Promise<InferenceResult> | InferenceResult;
}

export type InferenceErrorCode =
  | 'INFERENCE_MODEL_ID_REQUIRED'
  | 'INFERENCE_INPUT_REQUIRED'
  | 'INFERENCE_ADAPTER_NOT_FOUND'
  | 'INFERENCE_ADAPTER_FAILED'
  | 'INFERENCE_TIMEOUT'
  | 'INFERENCE_INVALID_RESULT';

export interface InferenceErrorPayload {
  code: InferenceErrorCode;
  error: string;
  message: string;
  modelId?: string;
  runNumber: number;
  recoverable: boolean;
  adapterId?: string;
  availableAdapters?: string[];
  timeoutMs?: number;
}

export type InferenceAdapterCollection =
  | readonly InferenceAdapter[]
  | Record<string, InferenceAdapter>
  | Map<string, InferenceAdapter>;

export interface InferenceAdapterRegistry {
  adapters?: InferenceAdapterCollection;
  get?: (modelId: string) => InferenceAdapter | undefined;
  getAdapter?: (modelId: string) => InferenceAdapter | undefined;
}

export interface InferenceConfig {
  timeout_ms: number;
  max_tokens: number;
  adapter?: InferenceAdapter;
  adapters?: readonly InferenceAdapter[];
  adapterFactory?: (request: InferenceAdapterMatchRequest) => InferenceAdapter | undefined;
  registry?: InferenceAdapterRegistry;
}

interface InferenceState {
  totalRuns: number;
  totalTokens: number;
}

interface AdapterContext {
  inferenceAdapters?: InferenceAdapterCollection;
  modelAdapters?: InferenceAdapterCollection;
  getInferenceAdapter?: (modelId: string) => InferenceAdapter | undefined;
  getModelAdapter?: (modelId: string) => InferenceAdapter | undefined;
}

export const inferenceHandler: TraitHandler<InferenceConfig> = {
  name: 'inference',
  defaultConfig: { timeout_ms: 30000, max_tokens: 4096 },

  onAttach(node: HSPlusNode): void {
    node.__inferenceState = { totalRuns: 0, totalTokens: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__inferenceState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: InferenceConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__inferenceState as InferenceState | undefined;
    if (!state) return;

    if ((typeof event === 'string' ? event : event.type) !== 'inference:run') return;

    state.totalRuns++;
    const runNumber = state.totalRuns;
    const modelId = readString(event.modelId);

    if (!modelId) {
      emitInferenceError(context, {
        code: 'INFERENCE_MODEL_ID_REQUIRED',
        message: 'inference:run requires a non-empty modelId',
        runNumber,
        recoverable: false,
      });
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(event, 'input')) {
      emitInferenceError(context, {
        code: 'INFERENCE_INPUT_REQUIRED',
        message: 'inference:run requires an input payload',
        modelId,
        runNumber,
        recoverable: false,
      });
      return;
    }

    const input = event.input;
    const options = resolveOptions(config, event);
    const matchRequest: InferenceAdapterMatchRequest = {
      modelId,
      input,
      options,
      event,
      node,
      context,
    };
    let candidates: InferenceAdapter[];
    try {
      candidates = collectAdapters(config, context, matchRequest);
    } catch (err: unknown) {
      emitInferenceError(context, {
        code: 'INFERENCE_ADAPTER_FAILED',
        message: errorMessage(err),
        modelId,
        runNumber,
        recoverable: true,
      });
      return;
    }
    const adapter = resolveAdapter(candidates, matchRequest, readString(event.adapterId));

    if (!adapter) {
      emitInferenceError(context, {
        code: 'INFERENCE_ADAPTER_NOT_FOUND',
        message: `No inference adapter registered for model "${modelId}"`,
        modelId,
        runNumber,
        recoverable: false,
        availableAdapters: candidates.map(adapterLabel),
      });
      return;
    }

    void runWithAdapter(adapter, state, context, matchRequest, runNumber);
  },
};

async function runWithAdapter(
  adapter: InferenceAdapter,
  state: InferenceState,
  context: TraitContext,
  matchRequest: InferenceAdapterMatchRequest,
  runNumber: number
): Promise<void> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new InferenceTimeoutError(matchRequest.options.timeoutMs));
    }, matchRequest.options.timeoutMs);
  });

  const request: InferenceRequest = {
    ...matchRequest,
    runNumber,
    signal: controller.signal,
  };
  const adapterPromise = Promise.resolve().then(() => adapter.run(request));
  adapterPromise.catch(() => undefined);

  try {
    const result = await Promise.race([adapterPromise, timeoutPromise]);
    if (!isInferenceResult(result)) {
      emitInferenceError(context, {
        code: 'INFERENCE_INVALID_RESULT',
        message: 'Inference adapter returned a result without an output field',
        modelId: matchRequest.modelId,
        runNumber,
        recoverable: false,
        adapterId: adapter.id,
      });
      return;
    }

    const latencyMs = isPositiveFiniteNumber(result.latencyMs)
      ? result.latencyMs
      : Math.max(0, Date.now() - startedAt);
    const tokensUsed = isPositiveFiniteNumber(result.tokensUsed) ? result.tokensUsed : 0;
    state.totalTokens += tokensUsed;

    context.emit?.('inference:result', {
      modelId: matchRequest.modelId,
      output: result.output,
      latencyMs,
      maxTokens: matchRequest.options.maxTokens,
      runNumber,
      adapterId: result.adapterId ?? adapter.id,
      tokensUsed,
      totalTokens: state.totalTokens,
      metadata: result.metadata,
    });
  } catch (err: unknown) {
    const timeout = timedOut || err instanceof InferenceTimeoutError;
    emitInferenceError(context, {
      code: timeout ? 'INFERENCE_TIMEOUT' : 'INFERENCE_ADAPTER_FAILED',
      message: timeout
        ? `Inference adapter timed out after ${matchRequest.options.timeoutMs}ms`
        : errorMessage(err),
      modelId: matchRequest.modelId,
      runNumber,
      recoverable: true,
      adapterId: adapter.id,
      timeoutMs: timeout ? matchRequest.options.timeoutMs : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function collectAdapters(
  config: InferenceConfig,
  context: TraitContext,
  request: InferenceAdapterMatchRequest
): InferenceAdapter[] {
  const candidates: InferenceAdapter[] = [];
  const seen = new Set<InferenceAdapter>();
  const addAdapter = (adapter: InferenceAdapter | undefined) => {
    if (adapter && !seen.has(adapter)) {
      seen.add(adapter);
      candidates.push(adapter);
    }
  };
  const addCollection = (collection: InferenceAdapterCollection | undefined) => {
    if (!collection) return;
    if (Array.isArray(collection)) {
      for (const adapter of collection) addAdapter(adapter);
      return;
    }
    if (collection instanceof Map) {
      for (const adapter of collection.values()) addAdapter(adapter);
      return;
    }
    for (const adapter of Object.values(collection)) addAdapter(adapter);
  };

  addAdapter(config.adapter);
  addCollection(config.adapters);
  addAdapter(config.adapterFactory?.(request));
  addAdapter(config.registry?.get?.(request.modelId));
  addAdapter(config.registry?.getAdapter?.(request.modelId));
  addCollection(config.registry?.adapters);

  const adapterContext = context as TraitContext & AdapterContext;
  addAdapter(adapterContext.getInferenceAdapter?.(request.modelId));
  addAdapter(adapterContext.getModelAdapter?.(request.modelId));
  addCollection(adapterContext.inferenceAdapters);
  addCollection(adapterContext.modelAdapters);

  return candidates;
}

function resolveAdapter(
  candidates: readonly InferenceAdapter[],
  request: InferenceAdapterMatchRequest,
  adapterId: string | undefined
): InferenceAdapter | undefined {
  if (adapterId) {
    return candidates.find((adapter) => adapter.id === adapterId);
  }

  const declaredMatch = candidates.find((adapter) => supportsModel(adapter, request.modelId));
  if (declaredMatch) return declaredMatch;

  const canRunMatch = candidates.find((adapter) => {
    if (!adapter.canRun) return false;
    try {
      return adapter.canRun(request);
    } catch {
      return false;
    }
  });
  if (canRunMatch) return canRunMatch;

  return candidates.length === 1 ? candidates[0] : undefined;
}

function supportsModel(adapter: InferenceAdapter, modelId: string): boolean {
  return adapter.modelIds?.includes(modelId) === true || adapter.models?.includes(modelId) === true;
}

function resolveOptions(config: InferenceConfig, event: TraitEvent): InferenceOptions {
  const rawOptions = isRecord(event.options) ? event.options : {};
  const configTimeoutMs = positiveNumberOrDefault(config.timeout_ms, 30000);
  const configMaxTokens = positiveNumberOrDefault(config.max_tokens, 4096);
  const requestedTimeout = readPositiveNumber(rawOptions.timeoutMs ?? rawOptions.timeout_ms);
  const requestedMaxTokens = readPositiveNumber(rawOptions.maxTokens ?? rawOptions.max_tokens);
  return {
    ...rawOptions,
    timeoutMs: requestedTimeout ? Math.min(requestedTimeout, configTimeoutMs) : configTimeoutMs,
    maxTokens: requestedMaxTokens ? Math.min(requestedMaxTokens, configMaxTokens) : configMaxTokens,
  };
}

function emitInferenceError(
  context: TraitContext,
  payload: Omit<InferenceErrorPayload, 'error'>
): void {
  context.emit?.('inference:error', {
    ...payload,
    error: payload.message,
  });
}

function isInferenceResult(value: unknown): value is InferenceResult {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'output');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function positiveNumberOrDefault(value: unknown, fallback: number): number {
  return readPositiveNumber(value) ?? fallback;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function adapterLabel(adapter: InferenceAdapter): string {
  return adapter.id ?? adapter.models?.join(',') ?? adapter.modelIds?.join(',') ?? 'anonymous';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

class InferenceTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Inference timed out after ${timeoutMs}ms`);
  }
}

export default inferenceHandler;
