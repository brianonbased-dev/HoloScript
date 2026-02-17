/**
 * OpenAI Provider Adapter
 *
 * Implements the unified ILLMProvider interface for OpenAI's API.
 * Supports GPT-4o, GPT-4 Turbo, and GPT-3.5 Turbo models.
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  OpenAIProviderConfig,
} from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
} from '../types';

// Available OpenAI models for HoloScript generation
export const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4-turbo-preview',
  'gpt-4',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
] as const;

export type OpenAIModel = (typeof OPENAI_MODELS)[number];

/**
 * OpenAI provider adapter for HoloScript.
 *
 * @example
 * ```typescript
 * const openai = new OpenAIAdapter({
 *   apiKey: process.env.OPENAI_API_KEY!,
 * });
 *
 * const scene = await openai.generateHoloScript({
 *   prompt: "a floating island with glowing crystals",
 * });
 * console.log(scene.code);
 * ```
 */
export class OpenAIAdapter extends BaseLLMAdapter {
  readonly name = 'openai' as const;
  readonly models = OPENAI_MODELS;
  readonly defaultHoloScriptModel: string;

  private readonly organization?: string;

  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? 'gpt-4o-mini';
    this.organization = config.organization;
  }

  protected getDefaultModel(): string {
    return 'gpt-4o-mini';
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    // Dynamically import openai to keep it optional
    let OpenAI: typeof import('openai').default;
    try {
      const module = await import('openai');
      OpenAI = module.default;
    } catch {
      throw new LLMProviderError(
        'openai package not installed. Run: npm install openai',
        'openai'
      );
    }

    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || undefined,
      organization: this.organization,
      timeout: this.config.timeoutMs,
      maxRetries: 0, // We handle retries ourselves
    });

    try {
      const response = await client.chat.completions.create({
        model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
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
        provider: 'openai',
        finishReason: this.mapFinishReason(choice?.finish_reason),
        raw: response,
      };
    } catch (err: unknown) {
      throw this.mapOpenAIError(err);
    }
  }

  private mapFinishReason(
    reason: string | null | undefined
  ): LLMCompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      default: return 'stop';
    }
  }

  private mapOpenAIError(err: unknown): Error {
    if (err instanceof Error) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        return new LLMAuthenticationError('openai');
      }
      if (status === 429) {
        const retryAfter = (err as { headers?: { 'retry-after'?: string } }).headers?.['retry-after'];
        return new LLMRateLimitError('openai', retryAfter ? parseInt(retryAfter) * 1000 : undefined);
      }
      if (status === 400 && err.message.includes('context_length')) {
        return new LLMContextLengthError('openai', 0);
      }
      return new LLMProviderError(err.message, 'openai', status, status === 500);
    }
    return new LLMProviderError(String(err), 'openai');
  }
}
