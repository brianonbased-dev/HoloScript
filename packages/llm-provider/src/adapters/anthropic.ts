/**
 * Anthropic (Claude) Provider Adapter
 *
 * Implements the unified ILLMProvider interface for Anthropic's Claude API.
 * Supports Claude 4.5, Claude 4, Claude 3.5, and Claude 3 model families.
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  AnthropicProviderConfig,
  LLMMessage,
} from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
} from '../types';

// Available Anthropic Claude models for HoloScript generation
export const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
] as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

/**
 * Anthropic Claude provider adapter for HoloScript.
 *
 * @example
 * ```typescript
 * const claude = new AnthropicAdapter({
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 * });
 *
 * const scene = await claude.generateHoloScript({
 *   prompt: "a space station interior with zero-gravity objects",
 * });
 * console.log(scene.code);
 * ```
 */
export class AnthropicAdapter extends BaseLLMAdapter {
  readonly name = 'anthropic' as const;
  readonly models = ANTHROPIC_MODELS;
  readonly defaultHoloScriptModel: string;

  private readonly apiVersion: string;

  constructor(config: AnthropicProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? 'claude-haiku-4-5-20251001';
    this.apiVersion = config.apiVersion ?? '2023-06-01';
  }

  protected getDefaultModel(): string {
    return 'claude-haiku-4-5-20251001';
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    // Dynamically import Anthropic SDK to keep it optional
    let Anthropic: typeof import('@anthropic-ai/sdk').default;
    try {
      const module = await import('@anthropic-ai/sdk');
      Anthropic = module.default;
    } catch {
      throw new LLMProviderError(
        '@anthropic-ai/sdk package not installed. Run: npm install @anthropic-ai/sdk',
        'anthropic'
      );
    }

    const client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || undefined,
      timeout: this.config.timeoutMs,
      maxRetries: 0, // We handle retries ourselves
    });

    // Anthropic separates system messages from the messages array
    const { system, messages } = this.separateSystemMessages(request.messages);

    try {
      const response = await client.messages.create({
        model,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature,
        top_p: request.topP,
        stop_sequences: request.stop,
        system: system || undefined,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });

      const content = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('');

      const usage = response.usage;

      return {
        content,
        usage: {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
        },
        model: response.model,
        provider: 'anthropic',
        finishReason: this.mapStopReason(response.stop_reason),
        raw: response,
      };
    } catch (err: unknown) {
      throw this.mapAnthropicError(err);
    }
  }

  private separateSystemMessages(messages: LLMMessage[]): {
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    return {
      system: systemMessages.map((m) => m.content).join('\n\n'),
      messages: nonSystemMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
    };
  }

  private mapStopReason(
    reason: string | null
  ): LLMCompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'stop_sequence': return 'stop';
      default: return 'stop';
    }
  }

  private mapAnthropicError(err: unknown): Error {
    if (err instanceof Error) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        return new LLMAuthenticationError('anthropic');
      }
      if (status === 429) {
        return new LLMRateLimitError('anthropic');
      }
      if (status === 400 && err.message.includes('context')) {
        return new LLMContextLengthError('anthropic', 0);
      }
      return new LLMProviderError(err.message, 'anthropic', status, status === 500);
    }
    return new LLMProviderError(String(err), 'anthropic');
  }
}
