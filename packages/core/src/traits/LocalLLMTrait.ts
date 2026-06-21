import type { HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { readJson } from '../errors/safeJsonParse';
/**
 * LocalLLMTrait — v4.0
 *
 * Run HoloScript agents on local LLMs: Ollama, LM Studio, llama.cpp.
 * No API key. Privacy-first. Full SSE streaming.
 *
 * P.XR.02: 'executorch' backend for on-device XR inference.
 *   Type defined in LLMBackend union. Implementation pending:
 *   ExecuTorch + QNN Delegate, native Hexagon NPU, no HTTP — direct native bridge.
 *
 * W.032: 'bitnet' backend for ultra-low-power inference.
 *   Type defined in LLMBackend union. Implementation pending:
 *   BitNet 2B at 1.58-bit, ternary weights, SNN perception convergence.
 *
 * Design backlog (P.XR.07): Dynamic memory budget manager integration.
 *   GS primitives vs KV cache is zero-sum on 8GB Quest 3.
 *   LocalLLMTrait must communicate memory pressure to GaussianBudgetAnalyzer.
 *   Expose getKVCacheSize_MB(): number for the budget manager to monitor.
 *
 * Design backlog (P.XR.03): Speculative decoding with cloud verifier.
 *   When WiFi available, use on-device model as draft + cloud 70B as verifier.
 *   SLED framework pattern: 2.2x throughput, 3.5x with cost reduction.
 *   Add speculativeConfig: { cloudEndpoint, verifierModel, batchSize } to config.
 *
 * Events:
 *  llm_model_loaded  { node, model, backend, availableModels }
 *  llm_models_listed { node, models }
 *  llm_started       { node, requestId, model, prompt }
 *  llm_token         { node, requestId, token, accumulated }
 *  llm_complete      { node, requestId, text, model, duration_ms, tokens }
 *  llm_error         { node, requestId, error }
 *  llm_cancelled     { node, requestId }
 */

export type LLMBackend = 'ollama' | 'lmstudio' | 'llamacpp' | 'openai' | 'executorch' | 'bitnet';
export type NativeLLMBackend = Extract<LLMBackend, 'executorch' | 'bitnet'>;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LocalLLMConfig {
  model: string;
  backend: LLMBackend;
  base_url: string;
  temperature: number;
  max_tokens: number;
  stream: boolean;
  system_prompt: string;
  context_length: number;
  fallback_to_remote: boolean;
  fallback_api_key: string;
  fallback_model: string;
  timeout_ms: number;
  /** P.XR.03: Speculative decoding config for cloud-verifier pattern */
  speculative?: SpeculativeConfig;
  /** P.XR.07: Maximum KV cache size in MB (for GS budget integration) */
  max_kv_cache_mb: number;
}

export interface LocalLLMNativeChatRequest {
  backend: NativeLLMBackend;
  model: string;
  messages: LLMMessage[];
  temperature: number;
  maxTokens: number;
  stream: boolean;
  contextLength: number;
  signal: AbortSignal;
}

export interface LocalLLMNativeChatResult {
  text: string;
  model?: string;
  tokens?: number;
}

export interface LocalLLMNativeTokenChunk {
  token?: string;
  text?: string;
  done?: boolean;
  tokens?: number;
}

export type LocalLLMNativeChatResponse =
  | Promise<LocalLLMNativeChatResult>
  | AsyncIterable<string | LocalLLMNativeTokenChunk>;

export interface LocalLLMNativeBridge {
  listModels(config: LocalLLMConfig, options: { signal: AbortSignal }): Promise<unknown[]>;
  chat(request: LocalLLMNativeChatRequest): LocalLLMNativeChatResponse;
}

const registeredNativeBridges = new Map<NativeLLMBackend, LocalLLMNativeBridge>();
const GLOBAL_NATIVE_BRIDGES = '__holoscriptLocalLLMNativeBridges';

type LocalLLMGlobal = typeof globalThis & {
  [GLOBAL_NATIVE_BRIDGES]?: Partial<Record<NativeLLMBackend, LocalLLMNativeBridge>>;
};

export function isNativeLLMBackend(backend: LLMBackend): backend is NativeLLMBackend {
  return backend === 'executorch' || backend === 'bitnet';
}

export function registerLocalLLMNativeBridge(
  backend: NativeLLMBackend,
  bridge: LocalLLMNativeBridge
): () => void {
  registeredNativeBridges.set(backend, bridge);
  return () => {
    if (registeredNativeBridges.get(backend) === bridge) {
      registeredNativeBridges.delete(backend);
    }
  };
}

export function clearLocalLLMNativeBridges(): void {
  registeredNativeBridges.clear();
  delete (globalThis as LocalLLMGlobal)[GLOBAL_NATIVE_BRIDGES];
}

function getNativeBridge(backend: NativeLLMBackend): LocalLLMNativeBridge | undefined {
  return (
    registeredNativeBridges.get(backend) ??
    (globalThis as LocalLLMGlobal)[GLOBAL_NATIVE_BRIDGES]?.[backend]
  );
}

function requireNativeBridge(backend: NativeLLMBackend): LocalLLMNativeBridge {
  const bridge = getNativeBridge(backend);
  if (!bridge) {
    throw new Error(
      `${backend} backend requires a registered native LocalLLM bridge ` +
        '(ExecuTorch/QNN, BitNet runtime, or host IPC). Refusing HTTP fallback.'
    );
  }
  return bridge;
}

function normalizeModelList(data: unknown): string[] {
  const rows = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && 'models' in data
      ? (data as { models?: unknown[] }).models
      : typeof data === 'object' && data !== null && 'data' in data
        ? (data as { data?: unknown[] }).data
        : [];
  return (rows ?? [])
    .map((m: unknown) =>
      typeof m === 'string'
        ? m
        : typeof m === 'object' && m !== null
          ? ((m as { name?: unknown; model?: unknown; id?: unknown }).name ??
            (m as { model?: unknown }).model ??
            (m as { id?: unknown }).id)
          : undefined
    )
    .filter((m): m is string => typeof m === 'string' && m.length > 0);
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const err = new Error('Aborted');
  err.name = 'AbortError';
  throw err;
}

/**
 * P.XR.03: Speculative decoding configuration.
 * On-device model as draft + cloud 70B as verifier.
 * SLED framework: 2.2x throughput, 3.5x with cost reduction.
 */
export interface SpeculativeConfig {
  /** Cloud endpoint for verifier model */
  cloudEndpoint: string;
  /** Verifier model name (e.g., 'llama-3.1-70b') */
  verifierModel: string;
  /** Number of draft tokens before verification */
  batchSize: number;
  /** Maximum acceptable rejection rate (0-1) */
  maxRejectionRate: number;
}

export interface LocalLLMState {
  isReady: boolean;
  backend: LLMBackend;
  activeModel: string | null;
  availableModels: string[];
  activeRequests: Map<string, AbortController>;
  usingFallback: boolean;
  totalRequests: number;
  totalTokens: number;
  /** P.XR.07: Current KV cache memory usage in MB */
  kvCacheSizeMB: number;
  /** P.XR.03: Whether speculative decoding is active */
  speculativeActive: boolean;
}

const DEFAULT_CONFIG: LocalLLMConfig = {
  model: 'llama3',
  backend: 'ollama',
  base_url: 'http://localhost:11434',
  temperature: 0.7,
  max_tokens: 2048,
  stream: true,
  system_prompt: 'You are a helpful AI embedded in a HoloScript spatial scene.',
  context_length: 4096,
  fallback_to_remote: false,
  fallback_api_key: '',
  fallback_model: 'gpt-4o-mini',
  timeout_ms: 120_000,
  max_kv_cache_mb: 512,
};

/**
 * P.XR.07: Estimate KV cache memory usage in MB.
 * Approximation: 2 bytes per element * 2 (key+value) * num_layers * head_dim * num_heads * context_tokens / 1MB.
 * Simplified: ~2MB per 1K tokens for a 3B model (reasonable Quest 3 estimate).
 */
function estimateKVCacheMB(tokenCount: number, contextLength: number): number {
  const effectiveTokens = Math.min(tokenCount, contextLength);
  // ~2MB per 1K tokens for 3B-class models (conservative estimate for Quest 3)
  return (effectiveTokens / 1024) * 2;
}

function chatEndpoint(config: LocalLLMConfig): string {
  if (isNativeLLMBackend(config.backend)) {
    throw new Error(`${config.backend} backend uses native bridge chat, not HTTP endpoints`);
  }
  return config.backend === 'ollama'
    ? `${config.base_url}/api/chat`
    : `${config.base_url}/v1/chat/completions`;
}

function modelsEndpoint(config: LocalLLMConfig): string {
  if (isNativeLLMBackend(config.backend)) {
    throw new Error(
      `${config.backend} backend uses native bridge model listing, not HTTP endpoints`
    );
  }
  return config.backend === 'ollama'
    ? `${config.base_url}/api/tags`
    : `${config.base_url}/v1/models`;
}

function buildBody(config: LocalLLMConfig, messages: LLMMessage[]): object {
  const all: LLMMessage[] = config.system_prompt
    ? [{ role: 'system', content: config.system_prompt }, ...messages]
    : messages;
  if (config.backend === 'ollama') {
    return {
      model: config.model,
      messages: all,
      stream: config.stream,
      options: { temperature: config.temperature, num_predict: config.max_tokens },
    };
  }
  return {
    model: config.model,
    messages: all,
    stream: config.stream,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
  };
}

export const localLLMHandler = {
  name: 'local_llm',
  defaultConfig: DEFAULT_CONFIG,

  async onAttach(node: HSPlusNode, config: LocalLLMConfig, ctx: TraitContext): Promise<void> {
    const state: LocalLLMState = {
      isReady: false,
      backend: config.backend,
      activeModel: null,
      availableModels: [],
      activeRequests: new Map(),
      usingFallback: false,
      totalRequests: 0,
      totalTokens: 0,
      kvCacheSizeMB: 0,
      speculativeActive: false,
    };
    node.__localLLMState = state;

    try {
      let models: string[];
      if (isNativeLLMBackend(config.backend)) {
        const bridge = requireNativeBridge(config.backend);
        models = normalizeModelList(
          await bridge.listModels(config, { signal: AbortSignal.timeout(5000) })
        );
      } else {
        const res = await fetch(modelsEndpoint(config), { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        models = normalizeModelList(data);
      }
      state.availableModels = models;
      state.activeModel = config.model;
      state.isReady = true;
      ctx.emit('llm_model_loaded', {
        node,
        model: config.model,
        backend: config.backend,
        availableModels: models,
      });
    } catch (err) {
      if (config.fallback_to_remote && config.fallback_api_key) {
        state.usingFallback = true;
        state.activeModel = config.fallback_model;
        state.isReady = true;
        ctx.emit('llm_model_loaded', {
          node,
          model: config.fallback_model,
          backend: 'openai',
          fallback: true,
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        ctx.emit('llm_error', {
          node,
          requestId: null,
          error: isNativeLLMBackend(config.backend)
            ? message
            : `Cannot connect to ${config.backend} at ${config.base_url}`,
        });
      }
    }
  },

  onDetach(node: HSPlusNode, _c: LocalLLMConfig, ctx: TraitContext): void {
    // @ts-expect-error
    const s: LocalLLMState | undefined = node.__localLLMState;
    if (!s) return;
    for (const [id, ac] of s.activeRequests) {
      ac.abort();
      ctx.emit('llm_cancelled', { node, requestId: id });
    }
    ctx.emit('llm_stopped', { node, totalRequests: s.totalRequests, totalTokens: s.totalTokens });
    delete node.__localLLMState;
  },

  onEvent(node: HSPlusNode, config: LocalLLMConfig, ctx: TraitContext, event: TraitEvent): void {
    // @ts-expect-error
    const s: LocalLLMState | undefined = node.__localLLMState;
    if (!s?.isReady) return;
    const { type, payload } = event;

    if (type === 'llm_prompt') {
      this._chat(s, node, config, ctx, {
        messages: [{ role: 'user', content: payload?.prompt ?? '' }],
        ...payload,
      });
    } else if (type === 'llm_chat') {
      this._chat(s, node, config, ctx, payload as Record<string, unknown>);
    } else if (type === 'llm_cancel') {
      const cancelPayload = payload as Record<string, unknown> | undefined;
      this._cancel(s, node, ctx, cancelPayload?.requestId as string | undefined);
    } else if (type === 'llm_list_models') {
      ctx.emit('llm_models_listed', { node, models: s.availableModels });
    } else if (type === 'llm_switch_model' && payload?.model) {
      s.activeModel = payload.model as string;
      ctx.emit('llm_model_loaded', { node, model: payload.model, backend: s.backend });
    }
  },

  onUpdate(_n: HSPlusNode, _c: unknown, _ctx: TraitContext, _dt: number): void {
    /* async only */
  },

  _chat(
    s: LocalLLMState,
    node: HSPlusNode,
    config: LocalLLMConfig,
    ctx: TraitContext,
    payload: Record<string, unknown>
  ): void {
    const messages = payload?.messages as LLMMessage[] | undefined;
    if (!messages?.length) return;
    const requestId = (payload.requestId as string) ?? `llm_${Date.now()}`;
    const model = (payload.model as string) ?? s.activeModel ?? config.model;
    const ac = new AbortController();
    s.activeRequests.set(requestId, ac);
    s.totalRequests++;
    // @ts-expect-error During migration
    const lastMessage = messages.at(-1);
    ctx.emit('llm_started', { node, requestId, model, prompt: lastMessage?.content });

    const cfg: LocalLLMConfig = s.usingFallback
      ? {
          ...config,
          backend: 'openai' as const,
          model: config.fallback_model,
          base_url: 'https://api.openai.com',
        }
      : { ...config, model };

    this._exec(s, node, cfg, ctx, requestId, messages, ac).catch((err: Error) => {
      if (err.name !== 'AbortError') ctx.emit('llm_error', { node, requestId, error: err.message });
      s.activeRequests.delete(requestId);
    });
  },

  async _exec(
    s: LocalLLMState,
    node: HSPlusNode,
    config: LocalLLMConfig,
    ctx: TraitContext,
    requestId: string,
    messages: LLMMessage[],
    ac: AbortController
  ): Promise<void> {
    if (isNativeLLMBackend(config.backend)) {
      await this._execNative(s, node, config, ctx, requestId, messages, ac);
      return;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (s.usingFallback) headers['Authorization'] = `Bearer ${config.fallback_api_key}`;
    const t0 = Date.now();

    const res = await fetch(chatEndpoint(config), {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody(config, messages)),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    if (!config.stream || !res.body) {
      const data = await res.json();
      const text =
        config.backend === 'ollama'
          ? (data.message?.content ?? '')
          : (data.choices?.[0]?.message?.content ?? '');
      const tokens = data.eval_count ?? data.usage?.completion_tokens ?? text.split(' ').length;
      s.totalTokens += tokens;
      // P.XR.07: Track KV cache memory and emit pressure warning
      s.kvCacheSizeMB = estimateKVCacheMB(s.totalTokens, config.context_length);
      if (s.kvCacheSizeMB > config.max_kv_cache_mb) {
        ctx.emit('llm_memory_pressure', {
          node,
          kvCacheSizeMB: s.kvCacheSizeMB,
          limitMB: config.max_kv_cache_mb,
        });
      }
      s.activeRequests.delete(requestId);
      ctx.emit('llm_complete', {
        node,
        requestId,
        text,
        model: config.model,
        duration_ms: Date.now() - t0,
        tokens,
      });
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let accumulated = '';
    let tokenCount = 0;
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let token = '';
        let isDone = false;
        if (config.backend === 'ollama') {
          try {
            const d = readJson(line) as Record<string, unknown>;
            isDone = !!d.done;
            token = ((d.message as Record<string, unknown>)?.content as string) ?? '';
          } catch {
            continue;
          }
        } else {
          if (!line.startsWith('data: ')) continue;
          const p = line.slice(6).trim();
          if (p === '[DONE]') {
            isDone = true;
          } else {
            try {
              token =
                (readJson(p) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]
                  ?.delta?.content ?? '';
            } catch {
              continue;
            }
          }
        }
        if (isDone) break;
        if (!token) continue;
        accumulated += token;
        tokenCount++;
        s.totalTokens++;
        ctx.emit('llm_token', { node, requestId, token, accumulated });
      }
    }
    // P.XR.07: Track KV cache memory after streaming completion
    s.kvCacheSizeMB = estimateKVCacheMB(s.totalTokens, config.context_length);
    if (s.kvCacheSizeMB > config.max_kv_cache_mb) {
      ctx.emit('llm_memory_pressure', {
        node,
        kvCacheSizeMB: s.kvCacheSizeMB,
        limitMB: config.max_kv_cache_mb,
      });
    }
    s.activeRequests.delete(requestId);
    ctx.emit('llm_complete', {
      node,
      requestId,
      text: accumulated,
      model: config.model,
      duration_ms: Date.now() - t0,
      tokens: tokenCount,
    });
  },

  async _execNative(
    s: LocalLLMState,
    node: HSPlusNode,
    config: LocalLLMConfig,
    ctx: TraitContext,
    requestId: string,
    messages: LLMMessage[],
    ac: AbortController
  ): Promise<void> {
    const backend = config.backend as NativeLLMBackend;
    const bridge = requireNativeBridge(backend);
    const t0 = Date.now();
    const response = bridge.chat({
      backend,
      model: config.model,
      messages: config.system_prompt
        ? [{ role: 'system', content: config.system_prompt }, ...messages]
        : messages,
      temperature: config.temperature,
      maxTokens: config.max_tokens,
      stream: config.stream,
      contextLength: config.context_length,
      signal: ac.signal,
    });

    let accumulated = '';
    let tokenCount = 0;

    if (isAsyncIterable<string | LocalLLMNativeTokenChunk>(response)) {
      for await (const chunk of response) {
        throwIfAborted(ac.signal);
        const token =
          typeof chunk === 'string' ? chunk : chunk.done ? '' : (chunk.token ?? chunk.text ?? '');
        const reportedTokens = typeof chunk === 'object' ? chunk.tokens : undefined;
        if (reportedTokens !== undefined) {
          const addedTokens = Math.max(0, reportedTokens - tokenCount);
          tokenCount = Math.max(tokenCount, reportedTokens);
          s.totalTokens += addedTokens;
        }
        if (!token) continue;
        accumulated += token;
        if (reportedTokens === undefined) {
          tokenCount += 1;
          s.totalTokens += 1;
        }
        if (config.stream) {
          ctx.emit('llm_token', { node, requestId, token, accumulated });
        }
      }
    } else {
      throwIfAborted(ac.signal);
      const result = await response;
      accumulated = result.text;
      tokenCount = result.tokens ?? accumulated.split(/\s+/).filter(Boolean).length;
      s.totalTokens += tokenCount;
    }

    s.kvCacheSizeMB = estimateKVCacheMB(s.totalTokens, config.context_length);
    if (s.kvCacheSizeMB > config.max_kv_cache_mb) {
      ctx.emit('llm_memory_pressure', {
        node,
        kvCacheSizeMB: s.kvCacheSizeMB,
        limitMB: config.max_kv_cache_mb,
      });
    }
    s.activeRequests.delete(requestId);
    ctx.emit('llm_complete', {
      node,
      requestId,
      text: accumulated,
      model: config.model,
      duration_ms: Date.now() - t0,
      tokens: tokenCount,
      backend,
    });
  },

  _cancel(s: LocalLLMState, node: HSPlusNode, ctx: TraitContext, requestId?: string): void {
    if (!requestId) {
      for (const [id, ac] of s.activeRequests) {
        ac.abort();
        ctx.emit('llm_cancelled', { node, requestId: id });
      }
      s.activeRequests.clear();
    } else {
      const ac = s.activeRequests.get(requestId);
      if (!ac) return;
      ac.abort();
      s.activeRequests.delete(requestId);
      ctx.emit('llm_cancelled', { node, requestId });
    }
  },
} as const;
