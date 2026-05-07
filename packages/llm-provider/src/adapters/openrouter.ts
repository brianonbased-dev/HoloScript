/**
 * OpenRouter Provider Adapter
 *
 * Implements the unified ILLMProvider interface for OpenRouter's API.
 * OpenRouter provides an OpenAI-compatible chat completions API at
 * https://openrouter.ai/api/v1, with required HTTP-Referer and X-Title
 * headers for attribution.
 *
 * Models use provider-prefixed format (e.g., "anthropic/claude-sonnet-4",
 * "openai/gpt-4o", "google/gemini-2.0-flash"). The default model for
 * HoloScript generation is "anthropic/claude-sonnet-4" — a strong generalist
 * that balances cost and capability.
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  Capabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  OpenRouterProviderConfig,
} from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
  messageContentAsString,
} from '../types';

// Popular OpenRouter models for HoloScript generation.
// Full model list: https://openrouter.ai/models
export const OPENROUTER_MODELS = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat',
  'x-ai/grok-3',
  'x-ai/grok-3-mini',
] as const;

export type OpenRouterModel = (typeof OPENROUTER_MODELS)[number];

/**
 * OpenRouter provider adapter for HoloScript.
 *
 * OpenRouter routes to 200+ models through a single OpenAI-compatible API.
 * The required HTTP-Referer and X-Title headers are set for attribution;
 * callers can override via config.
 *
 * @example
 * ```typescript
 * const openrouter = new OpenRouterAdapter({
 *   apiKey: process.env.OPENROUTER_API_KEY!,
 *   referer: 'https://myapp.com',
 *   title: 'My App',
 * });
 *
 * const scene = await openrouter.generateHoloScript({
 *   prompt: "a floating island with glowing crystals",
 * });
 * console.log(scene.code);
 * ```
 */
export class OpenRouterAdapter extends BaseLLMAdapter {
  readonly name = 'openrouter' as const;
  readonly models = OPENROUTER_MODELS;
  readonly defaultHoloScriptModel: string;

  /**
   * Capability manifest — OpenRouter is a meta-provider whose actual
   * capabilities depend on the upstream model selected. Conservative
   * declaration: only what's universally true across the catalog.
   *
   * For routing decisions that need specific model superpowers, prefer
   * the direct provider adapter (Anthropic / OpenAI / etc.) — OpenRouter
   * is the fallback / cost-shopping path, not the capability-sensitive
   * default. `costPerMillion` omitted (varies wildly per upstream).
   */
  readonly capabilities: Capabilities = {
    contextWindow: 0,              // per-upstream-model; 0 = use direct adapter for capability-sensitive routing
    maxOutput: 0,

    streaming: true,
    tools: true,                   // most upstream models support function calling
    vision: false,                 // model-dependent — set per-deployment if needed
    bearerTokenAccess: true,

    // multimodal / reasoning / agentic: model-dependent — left
    // conservative-default false. Upstream-model-specific manifests would
    // require a separate per-model capability resolver.
  };

  private readonly referer: string;
  private readonly title: string;

  constructor(config: OpenRouterProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? 'anthropic/claude-sonnet-4';
    this.referer = config.referer ?? 'https://holoscript.net';
    this.title = config.title ?? 'HoloScript';
  }

  protected getDefaultModel(): string {
    return 'anthropic/claude-sonnet-4';
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    // Dynamically import openai to keep it optional — OpenRouter is
    // OpenAI-compatible, so we reuse the same SDK.
    let OpenAI: typeof import('openai').default;
    try {
      const module = await import('openai');
      OpenAI = module.default;
    } catch {
      throw new LLMProviderError(
        'openai package not installed. Run: npm install openai (required by OpenRouter adapter)',
        'openrouter'
      );
    }

    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || 'https://openrouter.ai/api/v1',
      timeout: this.config.timeoutMs,
      maxRetries: 0, // We handle retries ourselves
      defaultHeaders: {
        'HTTP-Referer': this.referer,
        'X-Title': this.title,
      },
    });

    return await this.withRetry(async () => {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: messageContentAsString(m.content),
          })),
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          top_p: request.topP,
          stop: request.stop,
          stream: false,
        });

        const choice = response.choices[0];
        const content = choice?.message?.content ?? '';
        const usage = response.usage;

        return {
          content,
          usage: {
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
          },
          model: response.model,
          provider: 'openrouter',
          finishReason: this.mapFinishReason(choice?.finish_reason),
          raw: response,
        };
      } catch (err: unknown) {
        throw this.mapOpenRouterError(err);
      }
    });
  }

  private mapFinishReason(
    reason: string | null | undefined
  ): LLMCompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  private mapOpenRouterError(err: unknown): Error {
    if (err instanceof Error) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        return new LLMAuthenticationError('openrouter');
      }
      if (status === 429) {
        const retryAfter = (err as { headers?: { 'retry-after'?: string } }).headers?.[
          'retry-after'
        ];
        return new LLMRateLimitError(
          'openrouter',
          retryAfter ? parseInt(retryAfter) * 1000 : undefined
        );
      }
      if (status === 400 && err.message.includes('context_length')) {
        return new LLMContextLengthError('openrouter', 0);
      }
      const isRetryableStatus =
        typeof status === 'number' && status >= 500 && status < 600;
      return new LLMProviderError(err.message, 'openrouter', status, isRetryableStatus);
    }
    return new LLMProviderError(String(err), 'openrouter');
  }
}