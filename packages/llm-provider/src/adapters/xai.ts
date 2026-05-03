/**
 * xAI (Grok) Provider Adapter
 *
 * Implements the unified ILLMProvider interface for xAI's API.
 * xAI provides an OpenAI-compatible chat completions API at
 * https://api.x.ai/v1.
 *
 * Models: grok-3, grok-3-mini, grok-2, grok-2-mini, etc.
 * Default model for HoloScript generation: grok-3-mini (cost-effective).
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type { LLMCompletionRequest, LLMCompletionResponse, XAIProviderConfig } from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
  messageContentAsString,
} from '../types';

// Available xAI models for HoloScript generation
export const XAI_MODELS = [
  'grok-3',
  'grok-3-mini',
  'grok-2',
  'grok-2-mini',
] as const;

export type XAIModel = (typeof XAI_MODELS)[number];

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
export class XAIAdapter extends BaseLLMAdapter {
  readonly name = 'xai' as const;
  readonly models = XAI_MODELS;
  readonly defaultHoloScriptModel: string;

  constructor(config: XAIProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? 'grok-3-mini';
  }

  protected getDefaultModel(): string {
    return 'grok-3-mini';
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