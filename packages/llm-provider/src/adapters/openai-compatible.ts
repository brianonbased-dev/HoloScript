/**
 * OpenAI-Compatible Bearer Adapter
 *
 * A hosted OpenAI-compatible chat-completions adapter for any provider that
 * speaks the `${baseURL}/chat/completions` wire format with an optional
 * `Authorization: Bearer <apiKey>` header. This is the shared substrate for
 * Fireworks, Kimi (via Fireworks), Together, and the self-hosted Fleet serving
 * tier — all of which are OpenAI-compatible Bearer endpoints.
 *
 * Why a separate adapter from `openrouter.ts` / `xai.ts`?
 *   - Those adapters depend on the optional `openai` SDK and add provider
 *     attribution headers. This adapter is SDK-free (raw fetch) and carries no
 *     provider-specific headers — it's the lowest-common-denominator path so a
 *     caller can point it at ANY OpenAI-compatible endpoint (cloud or
 *     self-hosted vLLM/TGI/SGLang box) with just `{ baseURL, apiKey?, model }`.
 *   - It implements native streaming (`streamCompletion`) by parsing the
 *     OpenAI chat-completions SSE stream, INCLUDING fragmented
 *     `tool_calls.function.arguments` accumulation across deltas — the exact
 *     parsing logic that previously lived in
 *     `services/llm-service/src/services/InferenceRouter.ts` (`parseOpenAIStream`).
 *     Lifting it here lets the service dogfood the package instead of
 *     hand-rolling the parser.
 *
 * The public stream shape is the package's `LLMStreamChunk` discriminated
 * union (text_delta / tool_use_start / tool_use_input_delta / tool_use_end /
 * message_stop). Service-side callers that need the legacy
 * `StreamEvent {type,payload}` wire contract shim `LLMStreamChunk` → that shape
 * at their boundary; the package itself never speaks `StreamEvent`.
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  Capabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  LLMProviderConfig,
  TokenUsage,
  ToolSpec,
} from '../types';
import {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  filterGenericTools,
  messageContentAsString,
} from '../types';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Config for a generic hosted OpenAI-compatible Bearer endpoint.
 *
 * `apiKey` is optional — a self-hosted box launched without `--api-key`
 * answers unauthenticated, so we omit the `Authorization` header when no key
 * is present (matches the Fleet serving tier's dev/unauthenticated mode).
 */
export type OpenAICompatibleAdapterConfig = Omit<LLMProviderConfig, 'apiKey'> & {
  /** Bearer token for the endpoint. Omit / empty => no Authorization header. */
  apiKey?: string;
  /** Default model id sent in the request body. */
  model?: string;
};

// =============================================================================
// Capability manifest
// =============================================================================

/**
 * Capability manifest — generic OpenAI-compatible endpoint. Capabilities are
 * per-endpoint/per-model not per-provider; this is the conservative manifest
 * for the wire protocol itself. Tool-calling is declared `true` because the
 * adapter parses fragmented `tool_calls` deltas — but whether the BACKING
 * model honors tools is model-dependent.
 *
 * Exported as a constant so the capability-aware router can read it without
 * instantiating the adapter — single source of truth per W.GOLD.006.
 */
export const OPENAI_COMPATIBLE_CAPABILITIES: Capabilities = {
  contextWindow: 0, // per-endpoint/per-model
  maxOutput: 0,
  streaming: true,
  tools: true, // wire-level; backing model may not honor
  vision: false, // model-dependent
  bearerTokenAccess: true,
};

// =============================================================================
// OpenAI-compatible chat-completions SSE delta shapes (narrow, local)
// =============================================================================

interface OpenAIDeltaToolCall {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface OpenAIStreamDelta {
  content?: string;
  tool_calls?: OpenAIDeltaToolCall[];
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: OpenAIStreamDelta;
    finish_reason?: string | null;
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// =============================================================================
// OpenAICompatible Adapter
// =============================================================================

export class OpenAICompatibleAdapter extends BaseLLMAdapter {
  // Reuse the closest existing LLMProviderName slot — this adapter speaks the
  // same wire as openrouter (OpenAI-compatible Bearer). No new union member is
  // added so existing exhaustive switches over LLMProviderName stay closed.
  readonly name = 'openrouter' as const;
  readonly models: readonly string[];
  readonly defaultHoloScriptModel: string;

  readonly capabilities: Capabilities = OPENAI_COMPATIBLE_CAPABILITIES;

  private readonly endpointBaseURL: string;
  private readonly bearerKey: string;

  constructor(config: OpenAICompatibleAdapterConfig = {}) {
    super({ ...config, apiKey: config.apiKey ?? '' });
    // Strip a single trailing slash so `${baseURL}/chat/completions` is clean.
    this.endpointBaseURL = (config.baseURL ?? 'http://localhost:8080').replace(/\/$/, '');
    this.bearerKey = config.apiKey ?? '';
    this.defaultHoloScriptModel = config.model ?? 'gpt-3.5-turbo';
    this.models = [this.defaultHoloScriptModel];
  }

  protected getDefaultModel(): string {
    return this.defaultHoloScriptModel ?? 'gpt-3.5-turbo';
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.bearerKey) headers.Authorization = `Bearer ${this.bearerKey}`;
    return headers;
  }

  private mapFinishReason(
    reason: string | null | undefined,
    hadToolCalls: boolean
  ): LLMCompletionResponse['finishReason'] {
    if (reason === 'tool_calls' || hadToolCalls) return 'tool_use';
    switch (reason) {
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'stop':
      default:
        return 'stop';
    }
  }

  // ---------------------------------------------------------------------------
  // Non-streaming completion — POST ${baseURL}/chat/completions
  // ---------------------------------------------------------------------------

  // Ollama (and compatible local servers) require `options.num_ctx` to be set
  // explicitly in the request body — Modelfile PARAMETER values are not reliably
  // applied at inference time when num_ctx defaults to 3072, causing context-
  // overflow errors when knowledge is injected into the prompt. Read from env
  // so the caller can tune without a code change (W.786 / W.787).
  private ollamaNumCtx(): number {
    const v = process.env.HOLOSCRIPT_AGENT_OLLAMA_NUM_CTX;
    if (!v) return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    const url = `${this.endpointBaseURL}/chat/completions`;
    const tools = filterGenericTools(request.tools);
    const numCtx = this.ollamaNumCtx();

    const body = JSON.stringify({
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: messageContentAsString(m.content),
      })),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      top_p: request.topP ?? 1,
      stop: request.stop,
      stream: false,
      ...(tools.length > 0 ? { tools: tools.map((t) => this.mapToolToOpenAI(t)) } : {}),
      ...(numCtx > 0 ? { options: { num_ctx: numCtx } } : {}),
    });

    return await this.withRetry(async () => {
      let raw: unknown;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const response = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          if (response.status === 401 || response.status === 403) {
            throw new LLMAuthenticationError('openrouter');
          }
          if (response.status === 429) {
            throw new LLMRateLimitError('openrouter');
          }
          const isRetryable = response.status >= 500 && response.status < 600;
          throw new LLMProviderError(
            `OpenAI-compatible endpoint returned ${response.status}: ${text}`,
            'openrouter',
            response.status,
            isRetryable
          );
        }
        raw = await response.json();
      } catch (err) {
        if (err instanceof LLMProviderError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.includes('aborted') || msg.includes('timeout');
        const hint = isTimeout
          ? `Request timed out. Is the endpoint running at ${this.endpointBaseURL}?`
          : `Cannot reach OpenAI-compatible endpoint at ${this.endpointBaseURL}: ${msg}`;
        throw new LLMProviderError(hint, 'openrouter', undefined, false);
      }

      const data = raw as {
        choices?: Array<{
          message?: { content?: string; tool_calls?: OpenAIDeltaToolCall[] };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
      };

      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? '';
      const rawToolCalls = choice?.message?.tool_calls ?? [];
      const toolUses = rawToolCalls
        .filter((tc) => tc.function?.name)
        .map((tc, i) => {
          let input: Record<string, unknown> = {};
          try {
            input = tc.function?.arguments
              ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
              : {};
          } catch {
            input = {};
          }
          return {
            type: 'tool_use' as const,
            id: tc.id ?? `call_${i}`,
            name: tc.function!.name!,
            input,
          };
        });

      return {
        content,
        model: data.model ?? model,
        provider: 'openrouter',
        finishReason: this.mapFinishReason(choice?.finish_reason, toolUses.length > 0),
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        ...(toolUses.length > 0
          ? {
              toolUses,
              assistantBlocks: [{ type: 'text' as const, text: content }, ...toolUses],
            }
          : {}),
        raw,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Tool mapping — ToolSpec (input_schema) → OpenAI function tool (parameters)
  // ---------------------------------------------------------------------------

  private mapToolToOpenAI(tool: ToolSpec): unknown {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Streaming completion — yield LLMStreamChunk from OpenAI chat-completions SSE
  //
  // Lifted verbatim (semantics) from InferenceRouter.parseOpenAIStream, but
  // mapped onto LLMStreamChunk instead of StreamEvent. The fragmented
  // tool_calls.function.arguments accumulation across deltas is preserved: a
  // delta with `function.name` STARTS a tool call (flushing any prior one);
  // subsequent deltas with only `function.arguments` APPEND to the current
  // call's argument buffer. The buffer is JSON-parsed at flush time.
  // ---------------------------------------------------------------------------

  async *streamCompletion(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): AsyncIterable<LLMStreamChunk> {
    const url = `${this.endpointBaseURL}/chat/completions`;
    const tools = filterGenericTools(request.tools);
    const numCtx = this.ollamaNumCtx();

    const body = JSON.stringify({
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: messageContentAsString(m.content),
      })),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      top_p: request.topP ?? 1,
      stop: request.stop,
      stream: true,
      ...(tools.length > 0 ? { tools: tools.map((t) => this.mapToolToOpenAI(t)) } : {}),
      ...(numCtx > 0 ? { options: { num_ctx: numCtx } } : {}),
    });

    // --- Pre-flight: fetch + status check (throw before first chunk) ---
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
      response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new LLMAuthenticationError('openrouter');
        }
        if (response.status === 429) {
          throw new LLMRateLimitError('openrouter');
        }
        const isRetryable = response.status >= 500 && response.status < 600;
        throw new LLMProviderError(
          `OpenAI-compatible endpoint returned ${response.status}: ${text}`,
          'openrouter',
          response.status,
          isRetryable
        );
      }
    } catch (err) {
      if (err instanceof LLMProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('aborted') || msg.includes('timeout');
      const hint = isTimeout
        ? `Request timed out. Is the endpoint running at ${this.endpointBaseURL}?`
        : `Cannot reach OpenAI-compatible endpoint at ${this.endpointBaseURL}: ${msg}`;
      throw new LLMProviderError(hint, 'openrouter', undefined, false);
    }

    // --- Stream parse ---
    if (!response.body) {
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

    // Accumulator for the currently-open tool call. `id` is the LLMStreamChunk
    // id (already emitted via tool_use_start); `name` + `argsBuf` accumulate
    // until flush. Mirrors InferenceRouter.parseOpenAIStream's pendingToolCall.
    let pendingToolCall: { id: string; name: string; argsBuf: string } | null = null;

    // Flush the pending tool call: parse its accumulated argument buffer and
    // emit the terminating tool_use_end with the fully-parsed input.
    const flushPending = function* (
      pending: { id: string; name: string; argsBuf: string } | null
    ): Generator<LLMStreamChunk> {
      if (!pending) return;
      let input: Record<string, unknown> = {};
      try {
        input = pending.argsBuf ? (JSON.parse(pending.argsBuf) as Record<string, unknown>) : {};
      } catch {
        input = {};
      }
      yield { type: 'tool_use_end', id: pending.id, input };
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Last element may be an incomplete line — keep it in the buffer.
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.replace(/^data: /, '').trim();
          if (!trimmed || trimmed === '[DONE]') {
            if (trimmed === '[DONE]') {
              // Flush any open tool call at end-of-stream.
              yield* flushPending(pendingToolCall);
              pendingToolCall = null;
            }
            continue;
          }

          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(trimmed) as OpenAIStreamChunk;
          } catch {
            // Partial / non-JSON line — skip rather than crash the stream.
            continue;
          }

          const choice = chunk.choices?.[0];
          const delta = choice?.delta;

          if (chunk.model) finalModel = chunk.model;
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens:
                chunk.usage.total_tokens ??
                (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0),
            };
          }
          if (choice?.finish_reason) {
            finishReason = this.mapFinishReason(choice.finish_reason, hadToolCalls);
          }

          if (!delta) continue;

          // --- Text delta ---
          if (delta.content) {
            yield { type: 'text_delta', text: delta.content };
          }

          // --- Tool-call deltas (fragmented arguments accumulation) ---
          if (delta.tool_calls?.length) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                // A new tool call starts. Flush the previous one (if any).
                if (pendingToolCall) {
                  yield* flushPending(pendingToolCall);
                }
                hadToolCalls = true;
                const id = tc.id ?? `call_${toolCallIndex++}`;
                pendingToolCall = {
                  id,
                  name: tc.function.name,
                  argsBuf: tc.function.arguments ?? '',
                };
                yield { type: 'tool_use_start', id, name: tc.function.name };
                // Emit the initial argument fragment as a delta if present.
                if (tc.function.arguments) {
                  yield {
                    type: 'tool_use_input_delta',
                    id,
                    partialJson: tc.function.arguments,
                  };
                }
              } else if (pendingToolCall && tc.function?.arguments) {
                // Continuation fragment — append to the current call's buffer.
                pendingToolCall.argsBuf += tc.function.arguments;
                yield {
                  type: 'tool_use_input_delta',
                  id: pendingToolCall.id,
                  partialJson: tc.function.arguments,
                };
              }
            }
          }
        }
      }
    } catch (err) {
      streamErrored = true;
      if (err instanceof LLMProviderError) {
        // Surface a terminal message_stop first, then re-throw below.
      }
    }

    // Flush any still-open tool call (provider ended stream without [DONE]).
    if (pendingToolCall) {
      yield* flushPending(pendingToolCall);
      pendingToolCall = null;
    }

    if (streamErrored) {
      finishReason = 'error';
    } else if (hadToolCalls && finishReason === 'stop') {
      // Some endpoints omit finish_reason='tool_calls' on the final chunk.
      finishReason = 'tool_use';
    }

    yield {
      type: 'message_stop',
      finishReason,
      usage,
      model: finalModel,
    };

    if (streamErrored) {
      throw new LLMProviderError('Stream error during OpenAI-compatible completion', 'openrouter');
    }
  }

  /**
   * Health check — probe the OpenAI-compatible endpoint's /v1/models-style
   * surface cheaply rather than a full chat round-trip. Tries the parent of
   * the chat-completions path (`${baseURL}/models`), falling back to a HEAD on
   * the base. Local boxes expose /v1/models; cloud endpoints usually do too.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.endpointBaseURL}/models`, {
        headers: this.bearerKey ? { Authorization: `Bearer ${this.bearerKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `OpenAI-compatible endpoint unreachable at ${this.endpointBaseURL}: ${message}`,
      };
    }
  }
}
