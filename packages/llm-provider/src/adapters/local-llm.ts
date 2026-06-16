/**
 * Local LLM Adapter
 *
 * Connects to any local OpenAI-compatible inference server:
 * llama.cpp, Ollama, LM Studio, or similar.
 * No API key required — the server runs locally.
 *
 * Supported runtimes:
 *   llama.cpp:  llama-server -m model.gguf --port 8080 --ctx-size 4096
 *   Ollama:     ollama serve  (default port 11434)
 *   LM Studio:  Start server in UI  (default port 1234)
 *
 * The server must expose: POST http://localhost:PORT/v1/chat/completions
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  Capabilities,
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  TokenUsage,
  ToolSpec,
  ToolUseBlock,
  AssistantContentBlock,
} from '../types';
import { LLMProviderError, filterGenericTools, messageContentAsString } from '../types';

type LocalLLMAdapterConfig = Omit<LLMProviderConfig, 'apiKey'> & {
  apiKey?: string;
  model?: string;
  /**
   * Use Ollama's native /api/chat endpoint instead of /v1/chat/completions.
   * Auto-detected when the base URL contains ':11434' (Ollama default port).
   * Required for thinking models (qwen3, deepseek-r1, etc.) because the OpenAI
   * compat layer drops tool_calls in responses that include thinking tokens.
   * Verified 2026-06-16: /v1/chat/completions returns toolCalls=[] for qwen3:4b
   * with tools; /api/chat returns tool_calls correctly.
   */
  nativeOllamaApi?: boolean;
};

// =============================================================================
// Well-known local GGUF model identifiers (llama.cpp / LM Studio tier)
// The server accepts any model name — these are common tested configs. The
// CANONICAL recommended catalog (incl. Ollama tags + cloud) is MODEL_LIBRARY in
// model-policy.ts; refresh both together. Removed qwen2.5-7b-instruct (blacklisted
// family — lies about tool-calling) 2026-06-16; refreshed to current open weights.
// =============================================================================

export const LOCAL_LLM_MODELS = [
  'qwen3-4b-instruct-2507',
  'mistral-small-4',
  'mistral-7b-instruct',
  'llama-3.1-8b-instruct',
  'llama-3.2-3b-instruct',
  'granite-4.0-1b',
  'phi-4-mini-instruct',
] as const;

export type LocalLLMModel = (typeof LOCAL_LLM_MODELS)[number];

// =============================================================================
// HoloScript system prompt for 7B-class local models
// =============================================================================

const LOCAL_LLM_HOLOSCRIPT_SYSTEM_PROMPT = `You are a HoloScript code generator. Output ONLY valid HoloScript code, no markdown or explanation.

HoloScript syntax:
  cube { @color(red) @position(0,1,0) @grabbable @physics }
  sphere { @color(blue) @position(2,1,0) @emissive(cyan) }
  plane { @color(gray) @position(0,0,0) @scale(10,1,10) @static }

Traits: @color(x) @position(x,y,z) @rotation(x,y,z) @scale(x,y,z)
        @grabbable @clickable @throwable @physics @gravity @collidable @static
        @emissive(color) @transparent(0.5) @glowing @networked @agent @llm_agent

Rules:
- Return code only
- y >= 0 for objects on ground level
- Use @static on floors/walls
- Group related objects together`;

// =============================================================================
// LocalLLM Adapter
// =============================================================================

/**
 * Capability manifest — Ollama / llama.cpp / LM Studio / vLLM via
 * OpenAI-compatible interface. Capabilities are PER-MODEL not
 * per-provider; this is the conservative manifest for the
 * runtime itself. Brains needing specific local-model superpowers
 * (e.g. tool-use on deepseek-v3.1) should override via per-deployment
 * capability declarations.
 *
 * Per /research task_1778109552044_xhmm — populate per-model
 * capability sheets for the models actually run (deepseek-v3.1:671b,
 * gpt-oss:120b, kimi-1T cloud, etc.). Until then: conservative defaults.
 *
 * Exported as a constant so the capability-aware router can read it
 * without instantiating the adapter — single source of truth per W.GOLD.006.
 */
export const LOCAL_LLM_CAPABILITIES: Capabilities = {
  contextWindow: 0, // per-model — populate per deployment
  maxOutput: 0,

  streaming: true,
  tools: false, // model-dependent; many local models don't tool-call reliably
  vision: false, // model-dependent

  local: true, // hardware-native deployment
  zeroMarginalInference: true, // compute paid via GPU rental, $0 per-call
  bearerTokenAccess: false, // local server, no auth required
};

export class LocalLLMAdapter extends BaseLLMAdapter {
  readonly name = 'local-llm' as const;
  readonly models = LOCAL_LLM_MODELS;
  readonly defaultHoloScriptModel: string;

  readonly capabilities: Capabilities = LOCAL_LLM_CAPABILITIES;

  private readonly localBaseURL: string;
  /** True → complete() uses /api/chat (native Ollama); false → /v1/chat/completions. */
  private readonly useNativeOllamaApi: boolean;

  constructor(config: LocalLLMAdapterConfig = {}) {
    // BaseLLMAdapter requires apiKey — pass empty string for local servers
    super({ ...config, apiKey: config.apiKey ?? '', timeoutMs: config.timeoutMs ?? 120000 });

    // Strip trailing slash + trailing /v1 to avoid URL doubling. The adapter
    // builds `${baseURL}/v1/chat/completions` (line below); if a caller passes
    // `http://host:8081/v1` (a common mistake — vLLM's own endpoint advertises
    // /v1/models, so operators pattern-match), the result becomes
    // /v1/v1/chat/completions and 404s. Observed 2026-04-25 on the local-llm
    // fleet tier (16 workers, mw02 H100 NVL + mw03 A100). Both forms now work.
    this.localBaseURL = (config.baseURL ?? 'http://localhost:8080')
      .replace(/\/$/, '')
      .replace(/\/v1$/, '');
    this.defaultHoloScriptModel = config.model ?? 'mistral-7b-instruct';
    // Auto-detect Ollama by default port (11434). Can be overridden explicitly.
    this.useNativeOllamaApi =
      config.nativeOllamaApi ?? this.localBaseURL.includes(':11434');
  }

  protected getDefaultModel(): string {
    return 'mistral-7b-instruct';
  }

  /**
   * Send a chat completion request to the local LLM server.
   *
   * Two paths depending on `useNativeOllamaApi` (auto-detected from port 11434):
   *
   * Ollama native (/api/chat, stream:false) — used when useNativeOllamaApi=true.
   *   Ollama's /v1/chat/completions OpenAI-compat shim silently drops tool_calls
   *   for thinking models (qwen3, deepseek-r1) because thinking tokens precede
   *   tool calls and the compat layer misroutes them. The native endpoint does not
   *   have this bug. Verified 2026-06-16: /v1 → toolCalls=0, /api/chat → toolCalls=1.
   *
   * OpenAI-compat (/v1/chat/completions) — used for llama.cpp / LM Studio / vLLM.
   */
  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    return this.useNativeOllamaApi
      ? this.completeNativeOllama(request, model)
      : this.completeOpenAICompat(request, model);
  }

  /**
   * Injects `/no_think` into the system prompt for qwen3-family models when
   * thinking mode is off. Ollama ≤0.30.x silently ignores `think: false` and
   * routes thinking tokens into the `content` field, bloating outputs and
   * corrupting tool-call parsing. The `/no_think` directive works at the model
   * tokenizer level, independent of Ollama version.
   * Verified: Ollama 0.30.8 + qwen3:4b — `think:false` ignored, `/no_think` works.
   */
  private _withNoThinkMessages(
    model: string,
    messages: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> {
    if (process.env.HOLO_LLM_LOCAL_THINK === '1') return messages;
    if (!/qwen3/i.test(model)) return messages;
    const sysIdx = messages.findIndex((m) => m.role === 'system');
    if (sysIdx >= 0) {
      return messages.map((m, i) =>
        i === sysIdx ? { ...m, content: `/no_think\n${m.content}` } : m
      );
    }
    return [{ role: 'system', content: '/no_think' }, ...messages];
  }

  /**
   * Returns `{}` — we never send `think:false` in the Ollama payload.
   *
   * Confirmed 2026-06-16: `think:false` disables the decode-time grammar mask
   * that enables structured JSON tool calls for BOTH qwen3 AND Gemma 4 families
   * (same root cause as Ollama #15260 / vLLM #39130 — mask deferred until the
   * end-of-thinking token which never fires when thinking is closed, so the model
   * emits prose instead of tool_calls JSON). With thinking ON, Ollama 0.30.8
   * correctly routes thinking to `message.thinking` (separate field) and leaves
   * `message.content` clean — _stripThinkBlock() handles any edge-case bleed.
   * Thinking is soft-suppressed via `/no_think` in the system prompt
   * (_withNoThinkMessages), which reduces thinking tokens without breaking
   * tool-call structured output.
   */
  private _thinkParam(_model: string): Record<string, never> {
    return {};
  }

  /**
   * Ollama 0.30.x (qwen3): strips the <think> opener but leaves the thinking
   * body + </think> closing tag inside message.content. Strip everything up to
   * and including </think> so the returned content is the model's actual reply.
   * When future Ollama separates thinking into message.thinking, content will
   * arrive clean and this is a no-op.
   */
  private _stripThinkBlock(content: string): string {
    const closeTag = '</think>';
    const idx = content.indexOf(closeTag);
    if (idx === -1) return content;
    return content.slice(idx + closeTag.length).trimStart();
  }

  private async completeNativeOllama(
    request: LLMCompletionRequest,
    model: string
  ): Promise<LLMCompletionResponse> {
    const url = `${this.localBaseURL}/api/chat`;
    const filteredTools = filterGenericTools(request.tools);

    const body = JSON.stringify({
      model,
      stream: false,
      // Thinking OFF: qwen3-class thinking routes tool-call output into the
      // think channel — the visible reply arrives empty. Matches streamCompletion().
      ...this._thinkParam(model),
      messages: this._withNoThinkMessages(
        model,
        request.messages.map((m) => ({ role: m.role, content: messageContentAsString(m.content) }))
      ),
      options: {
        temperature: request.temperature ?? 0.4,
        num_predict: request.maxTokens ?? 2048,
        ...(request.topP !== undefined ? { top_p: request.topP } : {}),
        ...(request.stop ? { stop: request.stop } : {}),
        // KV-cache context cap. qwen3:4b at Ollama default ctx (4096) peaks
        // ~7 GB on the Jetson's 8 GB shared RAM → OOM + SSH wedge (W.735).
        // At 2048 → ~4 GB; at 1024 → ~3 GB. Override via HOLOSCRIPT_LLM_NUM_CTX.
        // Unset → Ollama uses the model's baked-in default.
        ...(process.env.HOLOSCRIPT_LLM_NUM_CTX
          ? { num_ctx: parseInt(process.env.HOLOSCRIPT_LLM_NUM_CTX, 10) }
          : {}),
        // Release model weights from RAM after each request. Ollama's default
        // keep_alive (5 min) holds 2.5 GB pinned between ticks — on an 8 GB
        // device sharing RAM with OS + monitor + agent this is fatal across
        // consecutive heavy requests. Set HOLOSCRIPT_LLM_KEEP_ALIVE=5m to
        // restore caching on devices with enough headroom.
        keep_alive: process.env.HOLOSCRIPT_LLM_KEEP_ALIVE ?? 0,
      },
      ...(filteredTools.length > 0 ? { tools: this.mapToolsToOllama(filteredTools) } : {}),
    });

    return await this.withRetry(async () => {
      const raw = await this.fetchJson(url, body);

      // Parse Ollama native /api/chat (stream:false) response
      const data = raw as {
        message?: {
          content?: string;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: unknown };
          }>;
        };
        done_reason?: string;
        eval_count?: number;
        prompt_eval_count?: number;
        model?: string;
      };

      return this.buildResponse(
        raw,
        model,
        this._stripThinkBlock(data.message?.content ?? ''),
        data.message?.tool_calls ?? [],
        data.model,
        data.done_reason,
        data.eval_count ?? 0,
        data.prompt_eval_count ?? 0,
        /* openAiUsage */ undefined
      );
    });
  }

  private async completeOpenAICompat(
    request: LLMCompletionRequest,
    model: string
  ): Promise<LLMCompletionResponse> {
    const url = `${this.localBaseURL}/v1/chat/completions`;
    const filteredTools = filterGenericTools(request.tools);

    const body = JSON.stringify({
      model,
      messages: this._withNoThinkMessages(
        model,
        request.messages.map((m) => ({ role: m.role, content: messageContentAsString(m.content) }))
      ),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.4,
      top_p: request.topP ?? 1,
      stop: request.stop,
      stream: false,
      ...this._thinkParam(model),
      ...(filteredTools.length > 0 ? { tools: this.mapToolsToOllama(filteredTools) } : {}),
    });

    return await this.withRetry(async () => {
      const raw = await this.fetchJson(url, body);

      const data = raw as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              id?: string;
              function?: { name?: string; arguments?: unknown };
            }>;
          };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
      };

      const choice = data.choices?.[0];
      return this.buildResponse(
        raw,
        model,
        choice?.message?.content ?? '',
        choice?.message?.tool_calls ?? [],
        data.model,
        choice?.finish_reason,
        data.usage?.completion_tokens ?? 0,
        data.usage?.prompt_tokens ?? 0,
        data.usage
      );
    });
  }

  /** Shared fetch+error handling for both complete() paths. */
  private async fetchJson(url: string, body: string): Promise<unknown> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const isRetryable =
          response.status === 429 || (response.status >= 500 && response.status < 600);
        throw new LLMProviderError(
          `Local LLM server returned ${response.status}: ${text}`,
          'local-llm',
          response.status,
          isRetryable
        );
      }

      return await response.json();
    } catch (err) {
      if (err instanceof LLMProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('aborted') || msg.includes('timeout');
      const hint = isTimeout
        ? `Request timed out. Is the local LLM server running at ${this.localBaseURL}?`
        : `Cannot reach local LLM server at ${this.localBaseURL}. Start with: llama-server -m model.gguf  OR  ollama serve`;
      throw new LLMProviderError(hint, 'local-llm', undefined, false);
    }
  }

  /** Build a unified LLMCompletionResponse from either response format. */
  private buildResponse(
    raw: unknown,
    model: string,
    content: string,
    rawToolCalls: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>,
    responseModel: string | undefined,
    finishReasonStr: string | undefined,
    completionTokens: number,
    promptTokens: number,
    openAiUsage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  ): LLMCompletionResponse {
    const toolUses: ToolUseBlock[] = [];
    for (let i = 0; i < rawToolCalls.length; i += 1) {
      const tc = rawToolCalls[i];
      const fn = tc?.function;
      if (!fn?.name) continue;
      let input: Record<string, unknown> = {};
      const rawArgs = fn.arguments;
      if (typeof rawArgs === 'string') {
        try { input = JSON.parse(rawArgs) as Record<string, unknown>; } catch { input = {}; }
      } else if (rawArgs && typeof rawArgs === 'object') {
        input = rawArgs as Record<string, unknown>;
      }
      toolUses.push({ type: 'tool_use', id: tc?.id ?? `call_${i}`, name: fn.name, input });
    }
    const hadToolCalls = toolUses.length > 0;
    const assistantBlocks: AssistantContentBlock[] = hadToolCalls
      ? [...(content ? [{ type: 'text' as const, text: content }] : []), ...toolUses]
      : [];

    const totalTokens = openAiUsage
      ? (openAiUsage.total_tokens ?? promptTokens + completionTokens)
      : promptTokens + completionTokens;

    return {
      content,
      model: responseModel ?? model,
      provider: 'local-llm' as const,
      finishReason: hadToolCalls
        ? 'tool_use'
        : ((finishReasonStr as LLMCompletionResponse['finishReason']) ?? 'stop'),
      ...(hadToolCalls ? { toolUses, assistantBlocks } : {}),
      usage: { promptTokens, completionTokens, totalTokens },
      raw,
    };
  }

  // =============================================================================
  // Ollama tool-call format → unified LLMStreamChunk
  // =============================================================================

  /**
   * Map Ollama's tool definition shape (function.parameters) from our
   * ToolSpec shape (input_schema). Ollama's /api/chat uses `parameters`
   * where our ToolSpec uses `input_schema` — same schema, different key.
   */
  private mapToolsToOllama(tools: ToolSpec[]): unknown[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  /**
   * Map Ollama's `done_reason` to our unified `finishReason`.
   */
  private mapDoneReason(
    doneReason: string | undefined,
    hadToolCalls: boolean
  ): LLMCompletionResponse['finishReason'] {
    if (hadToolCalls) return 'tool_use';
    switch (doneReason) {
      case 'length':
        return 'length';
      case 'stop':
      default:
        return 'stop';
    }
  }

  /**
   * Stream a completion as provider-agnostic chunks via Ollama's native
   * `/api/chat` endpoint with `stream: true`.
   *
   * Ollama returns NDJSON — one JSON object per line. Each line carries an
   * incremental `message.content` text delta and/or a `message.tool_calls`
   * array. The final line has `done: true` with usage statistics.
   *
   * Translation rules:
   *   message.content (non-empty)  → text_delta
   *   message.tool_calls            → tool_use_start + tool_use_end per tool
   *                                  (Ollama sends complete tool calls in one
   *                                   shot, no streamed JSON fragments, so no
   *                                   tool_use_input_delta chunks)
   *   done: true                    → message_stop (with finishReason + usage)
   *
   * No `withRetry` — partial-text retries would re-emit prefix tokens and
   * corrupt downstream state (the same contract as AnthropicAdapter).
   * Pre-flight failures (429, 5xx, network) throw before the first chunk;
   * mid-stream failures yield a `message_stop` with `finishReason: 'error'`
   * and the partial state observed so far.
   */
  async *streamCompletion(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): AsyncIterable<LLMStreamChunk> {
    const url = `${this.localBaseURL}/api/chat`;

    const body = JSON.stringify({
      model,
      messages: this._withNoThinkMessages(
        model,
        request.messages.map((m) => ({ role: m.role, content: messageContentAsString(m.content) }))
      ),
      stream: true,
      // Thinking OFF by default: qwen3.5-class thinking routes the ENTIRE
      // answer into the think channel on tool turns — the visible reply
      // arrives empty and post-tool rounds emit no prose (fable5 run
      // 20260610T233100: F02/F08/F09 failed ONLY on empty output text while
      // every deterministic geometry check passed; F01 burned its whole 240s
      // wall clock thinking inside one round). Verified harmless on
      // non-thinking models (qwen2.5-coder). Opt back in with
      // HOLO_LLM_LOCAL_THINK=1 for reasoning-heavy non-tool workloads.
      ...this._thinkParam(model),
      options: {
        temperature: request.temperature ?? 0.4,
        num_predict: request.maxTokens ?? 2048,
        ...(request.topP !== undefined ? { top_p: request.topP } : {}),
        ...(request.stop ? { stop: request.stop } : {}),
      },
      ...(filterGenericTools(request.tools).length > 0
        ? { tools: this.mapToolsToOllama(filterGenericTools(request.tools)) }
        : {}),
    });

    // --- Pre-flight: fetch + status check (throw before first chunk) ---
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const isRetryable =
          response.status === 429 || (response.status >= 500 && response.status < 600);
        throw new LLMProviderError(
          `Local LLM server returned ${response.status}: ${text}`,
          'local-llm',
          response.status,
          isRetryable
        );
      }
    } catch (err) {
      if (err instanceof LLMProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('aborted') || msg.includes('timeout');
      const hint = isTimeout
        ? `Request timed out. Is the local LLM server running at ${this.localBaseURL}?`
        : `Cannot reach local LLM server at ${this.localBaseURL}. Start with: llama-server -m model.gguf  OR  ollama serve`;
      throw new LLMProviderError(hint, 'local-llm', undefined, false);
    }

    // --- Stream: parse NDJSON line-by-line ---
    if (!response.body) {
      // No body to stream from — fall through to emit message_stop with zero
      // usage. This shouldn't happen with a real fetch but is defensive.
      yield {
        type: 'message_stop',
        finishReason: 'stop',
        usage: this.zeroUsage(),
        model,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolCallIndex = 0;
    let hadToolCalls = false;
    let finishReason: LLMCompletionResponse['finishReason'] = 'stop';
    let usage: TokenUsage = this.zeroUsage();
    let finalModel = model;
    let streamErrored = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Last element may be an incomplete line — keep it in the buffer.
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue; // skip blank lines between NDJSON objects

          let chunk: Record<string, unknown>;
          try {
            chunk = JSON.parse(trimmed);
          } catch {
            // Malformed line — skip it rather than crash the whole stream.
            continue;
          }

          // Ollama error object (e.g. model not found) surfaces mid-stream.
          if (chunk.error) {
            // Treat as a stream error — yield message_stop with 'error' below.
            streamErrored = true;
            break;
          }

          const message = chunk.message as Record<string, unknown> | undefined;

          // --- Text delta ---
          if (message && typeof message.content === 'string' && message.content.length > 0) {
            yield { type: 'text_delta', text: message.content };
          }

          // --- Tool calls ---
          const toolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
          if (toolCalls && toolCalls.length > 0) {
            hadToolCalls = true;
            for (const tc of toolCalls) {
              const func = tc.function as Record<string, unknown> | undefined;
              if (!func) continue;

              const id = `call_${toolCallIndex++}`;
              const name = (func.name as string) || 'unknown';
              const rawArgs = func.arguments;
              let input: Record<string, unknown>;
              if (typeof rawArgs === 'string') {
                // Some Ollama versions send arguments as a JSON string.
                try {
                  input = JSON.parse(rawArgs) as Record<string, unknown>;
                } catch {
                  input = {};
                }
              } else if (rawArgs && typeof rawArgs === 'object') {
                input = rawArgs as Record<string, unknown>;
              } else {
                input = {};
              }

              yield { type: 'tool_use_start', id, name };
              // Ollama sends complete tool calls in one shot — no incremental
              // JSON fragments, so emit start + end together. No
              // tool_use_input_delta because the input is already fully parsed.
              yield { type: 'tool_use_end', id, input };
            }
          }

          // --- Done signal ---
          if (chunk.done) {
            finalModel = (chunk.model as string) || model;
            const evalCount = (chunk.eval_count as number) || 0;
            const promptEvalCount = (chunk.prompt_eval_count as number) || 0;
            usage = {
              promptTokens: promptEvalCount,
              completionTokens: evalCount,
              totalTokens: promptEvalCount + evalCount,
            };
            finishReason = this.mapDoneReason(
              chunk.done_reason as string | undefined,
              hadToolCalls
            );
          }
        }

        if (streamErrored) break;
      }
    } catch (err) {
      streamErrored = true;
      if (err instanceof LLMProviderError) throw err;
      // Fall through to yield message_stop with 'error', then throw.
    }

    // --- Final chunk: exactly one message_stop ---
    if (streamErrored) {
      finishReason = 'error';
    }

    yield {
      type: 'message_stop',
      finishReason,
      usage,
      model: finalModel,
    };

    if (streamErrored) {
      throw new LLMProviderError('Stream error during local LLM completion', 'local-llm');
    }
  }

  /**
   * Returns the HoloScript-tuned system prompt for local models.
   */
  protected getHoloScriptSystemPrompt(): string {
    return LOCAL_LLM_HOLOSCRIPT_SYSTEM_PROMPT;
  }

  /**
   * Check if the local LLM server is reachable.
   * Delegates to BaseLLMAdapter.healthCheckLocalServer — same /health →
   * /v1/models fallback, branded error message for this adapter.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    return this.healthCheckLocalServer(
      this.localBaseURL,
      (baseURL, message) => `Local LLM server unreachable at ${baseURL}: ${message}`
    );
  }
}
