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
import type { LLMProviderConfig, LLMCompletionRequest, LLMCompletionResponse } from '../types';
import { LLMProviderError } from '../types';

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

    this.localBaseURL = (config.baseURL ?? 'http://localhost:8080').replace(/\/$/, '');
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
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.4,
      top_p: request.topP ?? 1,
      stop: request.stop,
      stream: false,
    });

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
        throw new LLMProviderError(
          `Local LLM server returned ${response.status}: ${text}`,
          'local-llm',
          response.status,
          response.status === 429
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
      provider: 'local-llm',
      finishReason: (choice?.finish_reason as LLMCompletionResponse['finishReason']) ?? 'stop',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      raw,
    };
  }

  /**
   * Returns the HoloScript-tuned system prompt for local models.
   */
  protected getHoloScriptSystemPrompt(): string {
    return LOCAL_LLM_HOLOSCRIPT_SYSTEM_PROMPT;
  }

  /**
   * Check if the local LLM server is reachable.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.localBaseURL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      // Some llama.cpp builds use /v1/models instead of /health
      if (!response.ok) {
        const modelsResponse = await fetch(`${this.localBaseURL}/v1/models`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!modelsResponse.ok) throw new Error(`Status ${modelsResponse.status}`);
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `Local LLM server unreachable at ${this.localBaseURL}: ${error}`,
      };
    }
  }
}
