/**
 * Brittney Cloud Adapter
 *
 * Connects to the first-party Brittney Cloud Service — HoloScript's
 * cloud-grade AI gateway. Supports SSE streaming, tool calling, and
 * tiered inference (standard / pro) with automatic provider routing
 * behind the service.
 *
 * Endpoints (relative to baseURL):
 *   POST /api/chat     — SSE streaming chat (primary)
 *   POST /api/generate — Non-streaming code generation
 *   GET  /api/health   — Service health
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
} from '../types';
import { LLMProviderError, LLMRateLimitError, LLMAuthenticationError, messageContentAsString } from '../types';

// =============================================================================
// Configuration
// =============================================================================

export interface BrittneyCloudProviderConfig extends Omit<LLMProviderConfig, 'apiKey'> {
  /** API key — optional for dev mode; required for authenticated endpoints. */
  apiKey?: string;

  /**
   * Inference tier. 'pro' routes to Kimi K2.5 when available;
   * 'standard' uses the preferred available provider (Fireworks,
   * Together, or Ollama fallback). Default: 'standard'.
   */
  tier?: 'standard' | 'pro';
}

// =============================================================================
// Well-known model identifiers
// =============================================================================

export const BRITTNEY_CLOUD_MODELS = [
  'brittney-standard',
  'brittney-pro',
  'brittney-qwen-v23',
] as const;

export type BrittneyCloudModel = (typeof BRITTNEY_CLOUD_MODELS)[number];

// =============================================================================
// Capability manifest
// =============================================================================

export const BRITTNEY_CLOUD_CAPABILITIES: Capabilities = {
  contextWindow: 128000,      // Kimi K2.5 / Fireworks Llama 3.1 8B range
  maxOutput: 8192,
  streaming: true,
  tools: true,
  vision: false,
  bearerTokenAccess: true,
  perLoopBudget: false,
  serverSideCompaction: false,
  promptCaching: false,
};

// =============================================================================
// SSE parsing helpers
// =============================================================================

interface BrittneyCloudSSEEvent {
  type: 'text' | 'tool_call' | 'error' | 'done';
  payload: unknown;
}

function parseSSELine(line: string): BrittneyCloudSSEEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data: ')) return null;
  const json = trimmed.slice(6); // after "data: "
  try {
    return JSON.parse(json) as BrittneyCloudSSEEvent;
  } catch {
    return null;
  }
}

// =============================================================================
// BrittneyCloud Adapter
// =============================================================================

export class BrittneyCloudAdapter extends BaseLLMAdapter {
  readonly name = 'brittney-cloud' as const;
  readonly models = BRITTNEY_CLOUD_MODELS;
  readonly defaultHoloScriptModel: string;
  readonly capabilities: Capabilities = BRITTNEY_CLOUD_CAPABILITIES;

  private readonly baseURL: string;
  private readonly tier: 'standard' | 'pro';

  constructor(config: BrittneyCloudProviderConfig = {}) {
    super({
      ...config,
      apiKey: config.apiKey ?? '',
      timeoutMs: config.timeoutMs ?? 300000,
    });

    this.baseURL = (config.baseURL ?? process.env.BRITTNEY_SERVICE_URL ?? 'http://localhost:8000')
      .replace(/\/$/, '');
    this.tier = config.tier ?? 'standard';
    this.defaultHoloScriptModel = config.defaultModel ?? 'brittney-standard';
  }

  protected getDefaultModel(): string {
    return 'brittney-standard';
  }

  // ---------------------------------------------------------------------------
  // Non-streaming completion — accumulate SSE from /api/chat
  // ---------------------------------------------------------------------------

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    const url = `${this.baseURL}/api/chat`;

    const body = JSON.stringify({
      messages: request.messages.map((m) => ({ role: m.role, content: messageContentAsString(m.content) })),
      model: model === 'brittney-standard' || model === 'brittney-pro' ? undefined : model,
      tier: this.tier,
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 2048,
      ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
    });

    return await this.withRetry(async () => {
      let raw: string | undefined;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          if (response.status === 401) {
            throw new LLMAuthenticationError('brittney-cloud');
          }
          if (response.status === 429) {
            throw new LLMRateLimitError('brittney-cloud');
          }
          const isRetryable = response.status >= 500 && response.status < 600;
          throw new LLMProviderError(
            `Brittney Cloud returned ${response.status}: ${text}`,
            'brittney-cloud',
            response.status,
            isRetryable
          );
        }

        raw = await response.text();
      } catch (err) {
        if (err instanceof LLMProviderError) throw err;

        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.includes('aborted') || msg.includes('timeout');
        const hint = isTimeout
          ? `Request timed out. Is Brittney Cloud running at ${this.baseURL}?`
          : `Cannot reach Brittney Cloud at ${this.baseURL}: ${msg}`;

        throw new LLMProviderError(hint, 'brittney-cloud', undefined, false);
      }

      // Accumulate SSE events
      const lines = raw.split('\n');
      let fullText = '';
      const toolUses: Array<{ name: string; arguments: Record<string, unknown> }> = [];
      let streamErrored = false;
      let errorPayload: string | undefined;

      for (const line of lines) {
        const event = parseSSELine(line);
        if (!event) continue;

        if (event.type === 'text' && typeof event.payload === 'string') {
          fullText += event.payload;
        } else if (event.type === 'tool_call' && event.payload && typeof event.payload === 'object') {
          const tc = event.payload as Record<string, unknown>;
          toolUses.push({
            name: (tc.name as string) || 'unknown',
            arguments: (tc.arguments as Record<string, unknown>) || {},
          });
        } else if (event.type === 'error') {
          streamErrored = true;
          errorPayload = String(event.payload);
        }
        // 'done' signals end of stream — nothing to accumulate
      }

      if (streamErrored) {
        throw new LLMProviderError(
          errorPayload ?? 'Stream error from Brittney Cloud',
          'brittney-cloud',
          undefined,
          true
        );
      }

      // Estimate usage since the SSE stream does not carry token counts
      const promptTokens = this.estimateTokens(
        request.messages.map((m) => messageContentAsString(m.content)).join(' ')
      );
      const completionTokens = this.estimateTokens(fullText);

      return {
        content: fullText,
        model,
        provider: 'brittney-cloud',
        finishReason: toolUses.length > 0 ? 'tool_use' : 'stop',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        toolUses: toolUses.map((tu, i) => ({
          type: 'tool_use',
          id: `call_${i}`,
          name: tu.name,
          input: tu.arguments,
        })),
        assistantBlocks: toolUses.length > 0
          ? [
              { type: 'text', text: fullText },
              ...toolUses.map((tu, i) => ({
                type: 'tool_use' as const,
                id: `call_${i}`,
                name: tu.name,
                input: tu.arguments,
              })),
            ]
          : undefined,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Streaming completion — yield LLMStreamChunk from SSE /api/chat
  // ---------------------------------------------------------------------------

  async *streamCompletion(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): AsyncIterable<LLMStreamChunk> {
    const url = `${this.baseURL}/api/chat`;

    const body = JSON.stringify({
      messages: request.messages.map((m) => ({ role: m.role, content: messageContentAsString(m.content) })),
      model: model === 'brittney-standard' || model === 'brittney-pro' ? undefined : model,
      tier: this.tier,
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 2048,
      ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
    });

    // --- Pre-flight ---
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (response.status === 401) {
          throw new LLMAuthenticationError('brittney-cloud');
        }
        if (response.status === 429) {
          throw new LLMRateLimitError('brittney-cloud');
        }
        const isRetryable = response.status >= 500 && response.status < 600;
        throw new LLMProviderError(
          `Brittney Cloud returned ${response.status}: ${text}`,
          'brittney-cloud',
          response.status,
          isRetryable
        );
      }
    } catch (err) {
      if (err instanceof LLMProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('aborted') || msg.includes('timeout');
      const hint = isTimeout
        ? `Request timed out. Is Brittney Cloud running at ${this.baseURL}?`
        : `Cannot reach Brittney Cloud at ${this.baseURL}: ${msg}`;
      throw new LLMProviderError(hint, 'brittney-cloud', undefined, false);
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
    let hadToolCalls = false;
    let streamErrored = false;
    let errorPayload: string | undefined;
    let toolCallIndex = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          const event = parseSSELine(line);
          if (!event) continue;

          if (event.type === 'text' && typeof event.payload === 'string') {
            yield { type: 'text_delta', text: event.payload };
          } else if (event.type === 'tool_call' && event.payload && typeof event.payload === 'object') {
            hadToolCalls = true;
            const tc = event.payload as Record<string, unknown>;
            const id = `call_${toolCallIndex++}`;
            const name = (tc.name as string) || 'unknown';
            const rawArgs = tc.arguments;
            let input: Record<string, unknown>;
            if (typeof rawArgs === 'string') {
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
            yield { type: 'tool_use_end', id, input };
          } else if (event.type === 'error') {
            streamErrored = true;
            errorPayload = String(event.payload);
          }
          // 'done' is terminal — loop will exit on reader.read() done
        }
      }
    } catch (err) {
      streamErrored = true;
      if (err instanceof LLMProviderError) throw err;
    }

    // Estimate usage post-stream
    const promptTokens = this.estimateTokens(
      request.messages.map((m) => messageContentAsString(m.content)).join(' ')
    );
    // We don't know completion tokens until stream ends — rough estimate from
    // text deltas already yielded. Since we can't rewind, we estimate.
    const completionTokens = 0; // Unknown for streaming; consumer should not trust this

    yield {
      type: 'message_stop',
      finishReason: streamErrored ? 'error' : hadToolCalls ? 'tool_use' : 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      model,
    };

    if (streamErrored) {
      throw new LLMProviderError(
        errorPayload ?? 'Stream error during Brittney Cloud completion',
        'brittney-cloud'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Health check — GET /api/health
  // ---------------------------------------------------------------------------

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseURL}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Brittney Cloud unreachable at ${this.baseURL}: ${message}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Token estimation (simple heuristic)
  // ---------------------------------------------------------------------------

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English text.
    // Brittney Cloud service does not return usage in SSE stream,
    // so this is a best-effort fallback for complete() usage stats.
    return Math.ceil(text.length / 4);
  }
}
