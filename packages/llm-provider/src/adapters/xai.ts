/**
 * xAI (Grok) Provider Adapter
 *
 * Implements the unified ILLMProvider interface for xAI's API.
 * xAI provides an OpenAI-compatible chat completions API at
 * https://api.x.ai/v1.
 *
 * Models: grok-4-0709, grok-4-fast-reasoning, grok-4-fast-non-reasoning,
 *         grok-4.3, grok-build-0.1.
 * Default model for HoloScript generation: grok-4-0709.
 *
 * Model metadata last verified 2026-06-08 per A-020 refresh.
 * Sources: docs.x.ai/developers/models/grok-4-0709, x.ai/news/grok-4-fast
 *
 * @version 1.1.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  Capabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  XAIProviderConfig,
} from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
  messageContentAsString,
} from '../types';

// Available xAI models for HoloScript generation
// Last updated 2026-06-08 per A-020 refresh
// Sources: docs.x.ai/developers/models/grok-4-0709, x.ai/news/grok-4-fast
export const XAI_MODELS = [
  'grok-4-0709',
  'grok-4-fast-reasoning',
  'grok-4-fast-non-reasoning',
  'grok-4.3',
  'grok-build-0.1',
] as const;

export type XAIModel = (typeof XAI_MODELS)[number];

export interface XAIModelCapability {
  contextWindow: number;
  /**
   * xAI does not publish a separate max-output token cap for most models.
   * 0 means "not published" — treat the context window as the upper bound.
   */
  maxOutput: number;
  costPerMillion: {
    input: number;
    /**
     * inputAbove128K applies to grok-4-0709 only — xAI charges higher input
     * rates for tokens beyond the 128K boundary in that model.
     * 0 means "same rate / not applicable for this model".
     */
    inputAbove128K: number;
    cachedInput: number;
    output: number;
  };
  status: 'active';
  lastVerified: string;
}

export const XAI_MODEL_CAPABILITIES = {
  // Grok 4 flagship — 256K context, tiered pricing above 128K
  // Source: docs.x.ai/developers/models/grok-4-0709 (verified 2026-06-08)
  'grok-4-0709': {
    contextWindow: 256_000,
    maxOutput: 0, // not published by xAI as of 2026-06-08
    costPerMillion: {
      input: 3.0,
      inputAbove128K: 6.0, // xAI higher-context tier above 128K tokens
      cachedInput: 0.75,
      output: 15.0,
    },
    status: 'active',
    lastVerified: '2026-06-08',
  },
  // Grok 4 Fast — 2M context, two reasoning variants
  // Source: x.ai/news/grok-4-fast (verified 2026-06-08)
  'grok-4-fast-reasoning': {
    contextWindow: 2_000_000,
    maxOutput: 0, // not published by xAI as of 2026-06-08
    costPerMillion: {
      input: 0, // pricing not published as of 2026-06-08
      inputAbove128K: 0,
      cachedInput: 0,
      output: 0,
    },
    status: 'active',
    lastVerified: '2026-06-08',
  },
  'grok-4-fast-non-reasoning': {
    contextWindow: 2_000_000,
    maxOutput: 0, // not published by xAI as of 2026-06-08
    costPerMillion: {
      input: 0, // pricing not published as of 2026-06-08
      inputAbove128K: 0,
      cachedInput: 0,
      output: 0,
    },
    status: 'active',
    lastVerified: '2026-06-08',
  },
  // Legacy / existing models kept for backwards compatibility
  'grok-4.3': {
    contextWindow: 1_000_000,
    maxOutput: 1_000_000,
    costPerMillion: {
      input: 1.25,
      inputAbove128K: 0,
      cachedInput: 0.2,
      output: 2.5,
    },
    status: 'active',
    lastVerified: '2026-05-25',
  },
  'grok-build-0.1': {
    contextWindow: 256_000,
    maxOutput: 256_000,
    costPerMillion: {
      input: 1.0,
      inputAbove128K: 0,
      cachedInput: 0.2,
      output: 2.0,
    },
    status: 'active',
    lastVerified: '2026-05-25',
  },
} as const satisfies Record<XAIModel, XAIModelCapability>;

/**
 * xAI (Grok) provider adapter for HoloScript.
 *
 * @example
 * ```typescript
 * const xai = new XAIAdapter({
 *   apiKey: process.env.XAI_API_KEY!,
 * });
 *
 * const scene = await xai.generateHoloScript({
 *   prompt: "a floating island with glowing crystals",
 * });
 * console.log(scene.code);
 * ```
 */
/**
 * Capability manifest sourced from `ai-ecosystem/docs/LLM_CAPABILITIES.md`
 * xAI (Grok). Live Search (real-time web + X-platform) is Grok's unique
 * differentiator vs Anthropic/OpenAI/Gemini for social and news signal.
 *
 * Model metadata verified against official xAI docs on 2026-06-08 (A-020):
 * - grok-4-0709: flagship Grok 4, 256K context, $3/$15 per MTok with
 *   higher-context pricing above 128K, $0.75/M cached.
 * - grok-4-fast-reasoning / grok-4-fast-non-reasoning: 2M context,
 *   pricing not yet published.
 * - grok-4.3 / grok-build-0.1: retained for backwards compatibility.
 * xAI's API is OpenAI-compatible at the wire level, so streaming + tools are
 * confirmed. All Grok 4 variants support text/image input, function calling,
 * structured outputs, cached-token pricing, and reasoning.
 *
 * XAI_CAPABILITIES reflects grok-4-0709 (the new default model) per A-020.
 * Exported as a constant so the capability-aware router can read it
 * without instantiating the adapter: single source of truth per W.GOLD.006.
 */
export const XAI_CAPABILITIES: Capabilities = {
  contextWindow: XAI_MODEL_CAPABILITIES['grok-4-0709'].contextWindow,
  maxOutput: XAI_MODEL_CAPABILITIES['grok-4-0709'].maxOutput,
  costPerMillion: {
    input: XAI_MODEL_CAPABILITIES['grok-4-0709'].costPerMillion.input,
    output: XAI_MODEL_CAPABILITIES['grok-4-0709'].costPerMillion.output,
  },

  streaming: true,
  tools: true, // OpenAI-compatible function calling
  vision: true, // text + image input

  visibleReasoning: true,
  adjustableEffort: true, // Grok 4 supports reasoning effort controls
  liveWebSearch: true, // Live Search (real-time web + X-platform)
  promptCaching: true, // cached-token pricing
  structuredOutputs: true,
  bearerTokenAccess: true,
};

export class XAIAdapter extends BaseLLMAdapter {
  readonly name = 'xai' as const;
  readonly models = XAI_MODELS;
  readonly defaultHoloScriptModel: string;

  readonly capabilities: Capabilities = XAI_CAPABILITIES;

  constructor(config: XAIProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? 'grok-4-0709';
  }

  protected getDefaultModel(): string {
    return 'grok-4-0709';
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    // Dynamically import openai to keep it optional — xAI is
    // OpenAI-compatible, so we reuse the same SDK.
    let OpenAI: typeof import('openai').default;
    try {
      const module = await import('openai');
      OpenAI = module.default;
    } catch {
      throw new LLMProviderError(
        'openai package not installed. Run: npm install openai (required by xAI adapter)',
        'xai'
      );
    }

    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || 'https://api.x.ai/v1',
      timeout: this.config.timeoutMs,
      maxRetries: 0, // We handle retries ourselves
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
          provider: 'xai',
          finishReason: this.mapFinishReason(choice?.finish_reason),
          raw: response,
        };
      } catch (err: unknown) {
        throw this.mapXAIError(err);
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

  private mapXAIError(err: unknown): Error {
    if (err instanceof Error) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        return new LLMAuthenticationError('xai');
      }
      if (status === 429) {
        const retryAfter = (err as { headers?: { 'retry-after'?: string } }).headers?.[
          'retry-after'
        ];
        return new LLMRateLimitError('xai', retryAfter ? parseInt(retryAfter) * 1000 : undefined);
      }
      if (status === 400 && err.message.includes('context_length')) {
        return new LLMContextLengthError('xai', 0);
      }
      const isRetryableStatus = typeof status === 'number' && status >= 500 && status < 600;
      return new LLMProviderError(err.message, 'xai', status, isRetryableStatus);
    }
    return new LLMProviderError(String(err), 'xai');
  }
}
