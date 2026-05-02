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
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  TokenUsage,
  ToolSpec,
} from '../types';
import { LLMProviderError, messageContentAsString } from '../types';

type LocalLLMAdapterConfig = Omit<LLMProviderConfig, 'apiKey'> & {
  apiKey?: string;
  model?: string;
};

// =============================================================================
// Well-known local GGUF model identifiers
// The server accepts any model name — these are common tested configs.
// =============================================================================

export const LOCAL_LLM_MODELS = [
  'mistral-7b-instruct',
  'mistral-7b-instruct-v0.3',
  'llama-3.1-8b-instruct',
  'llama-3.2-3b-instruct',
  'phi-3.5-mini-instruct',
  'qwen2.5-7b-instruct',
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

export class LocalLLMAdapter extends BaseLLMAdapter {
  readonly name = 'local-llm' as const;
  readonly models = LOCAL_LLM_MODELS;
  readonly defaultHoloScriptModel: string;

  private readonly localBaseURL: string;

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
  }

  protected getDefaultModel(): string {
    return 'mistral-7b-instruct';
  }

  /**
   * Send a chat completion request to the local LLM server.
   * Uses the OpenAI-compatible /v1/chat/completions endpoint.
   */
  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    const url = `${this.localBaseURL}/v1/chat/completions`;

    const body = JSON.stringify({
      model,
      messages: request.messages.map((m) => ({ role: m.role, content: messageContentAsString(m.content) })),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.4,
      top_p: request.topP ?? 1,
      stop: request.stop,
      stream: false,
    });

    return await this.withRetry(async () => {
      let raw: unknown;

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

        raw = await response.json();
      } catch (err) {
        if (err instanceof LLMProviderError) throw err;

        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.includes('aborted') || msg.includes('timeout');
        const hint = isTimeout
          ? `Request timed out. Is the local LLM server running at ${this.localBaseURL}?`
          : `Cannot reach local LLM server at ${this.localBaseURL}. Start with: llama-server -m model.gguf  OR  ollama serve`;

        // Local-server unreachable is a config issue, not a transient cloud
        // hiccup — retrying won't fix a server that isn't running. Mark
        // retryable=false so withRetry doesn't burn the budget on it.
        throw new LLMProviderError(hint, 'local-llm', undefined, false);
      }

      // Parse OpenAI-compatible response shape
      const data = raw as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
      };

      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? '';

      return {
        content,
        model: data.model ?? model,
        provider: 'local-llm' as const,
        finishReason: (choice?.finish_reason as LLMCompletionResponse['finishReason']) ?? 'stop',
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        raw,
      };
    });
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
      messages: request.messages.map((m) => ({
        role: m.role,
        content: messageContentAsString(m.content),
      })),
      stream: true,
      options: {
        temperature: request.temperature ?? 0.4,
        num_predict: request.maxTokens ?? 2048,
        ...(request.topP !== undefined ? { top_p: request.topP } : {}),
        ...(request.stop ? { stop: request.stop } : {}),
      },
      ...(request.tools && request.tools.length > 0
        ? { tools: this.mapToolsToOllama(request.tools) }
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
          const toolCalls = message?.tool_calls as
            | Array<Record<string, unknown>>
            | undefined;
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
      throw new LLMProviderError(
        'Stream error during local LLM completion',
        'local-llm'
      );
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
