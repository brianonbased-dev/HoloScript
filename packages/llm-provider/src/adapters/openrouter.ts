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
  LLMRequestOptions,
  OpenRouterProviderConfig,
} from '../types';
import {
  filterGenericTools,
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
  messageContentAsString,
} from '../types';
import {
  parseOpenAIChatCompletionToolCalls,
  resolveOpenAIToolControls,
  toolSpecsToOpenAIChatCompletionTools,
} from './openai';

// Popular OpenRouter models for HoloScript generation.
// Full model list: https://openrouter.ai/models
export const OPENROUTER_MODELS = [
  'anthropic/claude-haiku-4.5',
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
/**
 * Capability manifest — OpenRouter is a meta-provider whose actual
 * capabilities depend on the upstream model selected. Conservative
 * declaration: only what's universally true across the catalog.
 *
 * For routing decisions that need specific model superpowers, prefer
 * the direct provider adapter (Anthropic / OpenAI / etc.) — OpenRouter
 * is the fallback / cost-shopping path, not the capability-sensitive
 * default. `costPerMillion` omitted (varies wildly per upstream).
 *
 * Exported as a constant so the capability-aware router can read it
 * without instantiating the adapter — single source of truth per W.GOLD.006.
 */
export const OPENROUTER_CAPABILITIES: Capabilities = {
  contextWindow: 0, // per-upstream-model; 0 = use direct adapter for capability-sensitive routing
  maxOutput: 0,

  streaming: true,
  tools: true, // most upstream models support function calling
  vision: false, // model-dependent — set per-deployment if needed
  bearerTokenAccess: true,

  // multimodal / reasoning / agentic: model-dependent — left
  // conservative-default false. Upstream-model-specific manifests would
  // require a separate per-model capability resolver.
};

/** Build the OpenAI-compatible request sent to OpenRouter. */
export function buildOpenRouterChatCompletionPayload(
  request: LLMCompletionRequest,
  model: string
): Record<string, unknown> {
  const tools = filterGenericTools(request.tools);
  const controls = resolveOpenAIToolControls(request, false);
  return {
    model,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: messageContentAsString(message.content),
    })),
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    top_p: request.topP,
    stop: request.stop,
    stream: false,
    ...(tools.length > 0
      ? {
          tools: toolSpecsToOpenAIChatCompletionTools(tools),
          tool_choice: controls.toolChoice,
          parallel_tool_calls: controls.parallelToolCalls,
        }
      : {}),
  };
}

export class OpenRouterAdapter extends BaseLLMAdapter {
  readonly name = 'openrouter' as const;
  readonly models = OPENROUTER_MODELS;
  readonly defaultHoloScriptModel: string;

  readonly capabilities: Capabilities = OPENROUTER_CAPABILITIES;

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
    model: string = this.defaultHoloScriptModel,
    options: LLMRequestOptions = {}
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
        const payload = buildOpenRouterChatCompletionPayload(request, model) as never;
        const response = options.signal
          ? await client.chat.completions.create(payload, { signal: options.signal })
          : await client.chat.completions.create(payload);

        const choice = response.choices[0];
        const content = choice?.message?.content ?? '';
        const usage = response.usage;
        const { toolUses, assistantBlocks } = parseOpenAIChatCompletionToolCalls(choice);

        return {
          content,
          usage: usage
            ? {
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
              }
            : { promptTokens: 0, completionTokens: 0, totalTokens: 0, reported: false },
          model: response.model ?? model,
          reportedModel: response.model ?? null,
          provider: 'openrouter',
          finishReason:
            toolUses.length > 0 ? 'tool_use' : this.mapFinishReason(choice?.finish_reason),
          toolUses: toolUses.length > 0 ? toolUses : undefined,
          assistantBlocks: assistantBlocks.length > 0 ? assistantBlocks : undefined,
          requestId: response.id,
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
      const isRetryableStatus = typeof status === 'number' && status >= 500 && status < 600;
      return new LLMProviderError(err.message, 'openrouter', status, isRetryableStatus);
    }
    return new LLMProviderError(String(err), 'openrouter');
  }
}
