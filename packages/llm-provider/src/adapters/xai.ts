/**
 * xAI (Grok) Provider Adapter
 *
 * Implements the unified ILLMProvider interface for xAI's API.
 * xAI provides an OpenAI-compatible chat completions API at
 * https://api.x.ai/v1.
 *
 * Models: grok-4.3 and grok-build-0.1.
 * Default model for HoloScript generation: grok-4.3.
 *
 * @version 1.0.0
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
export const XAI_MODELS = [
  'grok-4.3',
  'grok-build-0.1',
] as const;

export type XAIModel = (typeof XAI_MODELS)[number];

export interface XAIModelCapability {
  contextWindow: number;
  /**
   * xAI model cards currently publish context windows, not a separate hard
   * completion-token cap. Use the model context as the nonzero upper bound.
   */
  maxOutput: number;
  costPerMillion: {
    input: number;
    cachedInput: number;
    output: number;
  };
  status: 'active';
  lastVerified: string;
}

export const XAI_MODEL_CAPABILITIES = {
  'grok-4.3': {
    contextWindow: 1_000_000,
    maxOutput: 1_000_000,
    costPerMillion: {
      input: 1.25,
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
 * Model metadata is verified against official xAI docs on 2026-05-25:
 * grok-4.3 is the current chat default, while grok-build-0.1 covers coding.
 * xAI's API is OpenAI-compatible at the wire level, so streaming + tools are
 * confirmed. Grok 4.3 and Grok Build 0.1 both list text/image input, function
 * calling, structured outputs, cached-token pricing, and reasoning support.
 *
 * Exported as a constant so the capability-aware router can read it
 * without instantiating the adapter: single source of truth per W.GOLD.006.
 */
export const XAI_CAPABILITIES: Capabilities = {
  contextWindow: XAI_MODEL_CAPABILITIES['grok-4.3'].contextWindow,
  maxOutput: XAI_MODEL_CAPABILITIES['grok-4.3'].maxOutput,
  costPerMillion: {
    input: XAI_MODEL_CAPABILITIES['grok-4.3'].costPerMillion.input,
    output: XAI_MODEL_CAPABILITIES['grok-4.3'].costPerMillion.output,
  },

  streaming: true,
  tools: true,                   // OpenAI-compatible function calling
  vision: true,                  // text + image input

  visibleReasoning: true,
  adjustableEffort: true,        // grok-4.3 supports none/low/medium/high
  liveWebSearch: true,           // Live Search
  promptCaching: true,           // cached-token pricing
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
    this.defaultHoloScriptModel = config.defaultModel ?? 'grok-4.3';
  }

  protected getDefaultModel(): string {
    return 'grok-4.3';
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
        return new LLMRateLimitError(
          'xai',
          retryAfter ? parseInt(retryAfter) * 1000 : undefined
        );
      }
      if (status === 400 && err.message.includes('context_length')) {
        return new LLMContextLengthError('xai', 0);
      }
      const isRetryableStatus =
        typeof status === 'number' && status >= 500 && status < 600;
      return new LLMProviderError(err.message, 'xai', status, isRetryableStatus);
    }
    return new LLMProviderError(String(err), 'xai');
  }
}
