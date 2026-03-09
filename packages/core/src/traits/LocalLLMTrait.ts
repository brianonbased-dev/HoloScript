/**
 * LocalLLMTrait — v4.0
 *
 * Run HoloScript agents on local LLMs: Ollama, LM Studio, llama.cpp.
 * No API key. Privacy-first. Full SSE streaming.
 *
 * TODO(P.XR.02): Add 'executorch' backend for on-device XR inference.
 *   ExecuTorch + QNN Delegate: 50KB footprint, native Hexagon NPU support.
 *   Llama 3.2 1B/3B at 4-bit groupwise quantization, 25-40 tok/s on NPU.
 *   New LLMBackend type: 'executorch'. No HTTP — direct native bridge.
 *
 * TODO(W.032): Add 'bitnet' backend for ultra-low-power inference.
 *   BitNet 2B at 1.58-bit: 400MB, 20-35 tok/s, 55-70% energy reduction.
 *   Ternary weights ({-1, 0, 1}) — all multiply → add/subtract.
 *   Mathematical convergence with SNN perception layer.
 *
 * TODO(P.XR.07): Dynamic memory budget manager integration.
 *   GS primitives vs KV cache is zero-sum on 8GB Quest 3.
 *   LocalLLMTrait must communicate memory pressure to GaussianBudgetAnalyzer.
 *   Expose getKVCacheSize_MB(): number for the budget manager to monitor.
 *
 * TODO(P.XR.03): Speculative decoding with cloud verifier.
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
};

function chatEndpoint(config: LocalLLMConfig): string {
  return config.backend === 'ollama'
    ? `${config.base_url}/api/chat`
    : `${config.base_url}/v1/chat/completions`;
}

function modelsEndpoint(config: LocalLLMConfig): string {
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
  defaultConfig: DEFAULT_CONFIG,

  async onAttach(node: any, config: LocalLLMConfig, ctx: any): Promise<void> {
    const state: LocalLLMState = {
      isReady: false,
      backend: config.backend,
      activeModel: null,
      availableModels: [],
      activeRequests: new Map(),
      usingFallback: false,
      totalRequests: 0,
      totalTokens: 0,
    };
    node.__localLLMState = state;

    try {
      const res = await fetch(modelsEndpoint(config), { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      const models: string[] = data.models
        ? data.models.map((m: any) => m.name ?? m.model)
        : (data.data ?? []).map((m: any) => m.id);
      state.availableModels = models.filter(Boolean);
      state.activeModel = config.model;
      state.isReady = true;
      ctx.emit('llm_model_loaded', {
        node,
        model: config.model,
        backend: config.backend,
        availableModels: models,
      });
    } catch {
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
        ctx.emit('llm_error', {
          node,
          requestId: null,
          error: `Cannot connect to ${config.backend} at ${config.base_url}`,
        });
      }
    }
  },

  onDetach(node: any, _c: LocalLLMConfig, ctx: any): void {
    const s: LocalLLMState | undefined = node.__localLLMState;
    if (!s) return;
    for (const [id, ac] of s.activeRequests) {
      ac.abort();
      ctx.emit('llm_cancelled', { node, requestId: id });
    }
    ctx.emit('llm_stopped', { node, totalRequests: s.totalRequests, totalTokens: s.totalTokens });
    delete node.__localLLMState;
  },

  onEvent(node: any, config: LocalLLMConfig, ctx: any, event: any): void {
    const s: LocalLLMState | undefined = node.__localLLMState;
    if (!s?.isReady) return;
    const { type, payload } = event;

    if (type === 'llm_prompt') {
      this._chat(s, node, config, ctx, {
        messages: [{ role: 'user', content: payload?.prompt ?? '' }],
        ...payload,
      });
    } else if (type === 'llm_chat') {
      this._chat(s, node, config, ctx, payload);
    } else if (type === 'llm_cancel') {
      this._cancel(s, node, ctx, payload?.requestId);
    } else if (type === 'llm_list_models') {
      ctx.emit('llm_models_listed', { node, models: s.availableModels });
    } else if (type === 'llm_switch_model' && payload?.model) {
      s.activeModel = payload.model;
      ctx.emit('llm_model_loaded', { node, model: payload.model, backend: s.backend });
    }
  },

  onUpdate(_n: any, _c: any, _ctx: any, _dt: number): void {
    /* async only */
  },

  _chat(s: LocalLLMState, node: any, config: LocalLLMConfig, ctx: any, payload: any): void {
    if (!payload?.messages?.length) return;
    const requestId = payload.requestId ?? `llm_${Date.now()}`;
    const model = payload.model ?? s.activeModel ?? config.model;
    const ac = new AbortController();
    s.activeRequests.set(requestId, ac);
    s.totalRequests++;
    ctx.emit('llm_started', { node, requestId, model, prompt: payload.messages.at(-1)?.content });

    const cfg: LocalLLMConfig = s.usingFallback
      ? {
          ...config,
          backend: 'openai',
          model: config.fallback_model,
          base_url: 'https://api.openai.com',
        }
      : { ...config, model };

    this._exec(s, node, cfg, ctx, requestId, payload.messages, ac).catch((err: Error) => {
      if (err.name !== 'AbortError') ctx.emit('llm_error', { node, requestId, error: err.message });
      s.activeRequests.delete(requestId);
    });
  },

  async _exec(
    s: LocalLLMState,
    node: any,
    config: LocalLLMConfig,
    ctx: any,
    requestId: string,
    messages: LLMMessage[],
    ac: AbortController
  ): Promise<void> {
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
            const d = JSON.parse(line);
            isDone = d.done;
            token = d.message?.content ?? '';
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
              token = JSON.parse(p).choices?.[0]?.delta?.content ?? '';
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

  _cancel(s: LocalLLMState, node: any, ctx: any, requestId?: string): void {
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
