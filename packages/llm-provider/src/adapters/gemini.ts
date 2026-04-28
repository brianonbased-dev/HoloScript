/**
 * Google Gemini Provider Adapter
 *
 * Implements the unified ILLMProvider interface for Google Gemini's API.
 * Uses fetch-based HTTP requests (no SDK dependency) for maximum compatibility.
 * Supports Gemini 2.0, 1.5 Pro, and 1.5 Flash models.
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type { LLMCompletionRequest, LLMCompletionResponse, GeminiProviderConfig } from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
  messageContentAsString,
} from '../types';

// Available Google Gemini models
export const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiContent {
  parts: Array<{ text: string }>;
  role: 'user' | 'model';
}

interface GeminiResponse {
  candidates?: Array<{
    content: { parts: Array<{ text: string }> };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Google Gemini provider adapter for HoloScript.
 *
 * @example
 * ```typescript
 * const gemini = new GeminiAdapter({
 *   apiKey: process.env.GEMINI_API_KEY!,
 * });
 *
 * const scene = await gemini.generateHoloScript({
 *   prompt: "an underwater scene with glowing fish and coral",
 * });
 * console.log(scene.code);
 * ```
 */
export class GeminiAdapter extends BaseLLMAdapter {
  readonly name = 'gemini' as const;
  readonly models = GEMINI_MODELS;
  readonly defaultHoloScriptModel: string;

  constructor(config: GeminiProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? 'gemini-1.5-flash';
  }

  protected getDefaultModel(): string {
    return 'gemini-1.5-flash';
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    const baseURL = this.config.baseURL || GEMINI_API_BASE;
    const url = `${baseURL}/models/${model}:generateContent?key=${this.config.apiKey}`;

    // Gemini uses a different message structure: separate system instruction
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const conversationMessages = request.messages.filter((m) => m.role !== 'system');

    const contents: GeminiContent[] = conversationMessages.map((m) => ({
      parts: [{ text: messageContentAsString(m.content) }],
      role: m.role === 'assistant' ? 'model' : 'user',
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
        topP: request.topP,
        stopSequences: request.stop,
      },
    };

    // Add system instruction if present
    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    return await this.withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data: GeminiResponse = (await response.json()) as GeminiResponse;

        if (!response.ok || data.error) {
          throw this.mapGeminiError(
            response.status,
            data.error?.message ?? 'Unknown error',
            response.headers.get('retry-after')
          );
        }

        const candidate = data.candidates?.[0];
        const content = candidate?.content?.parts?.map((p) => p.text).join('') ?? '';
        const usage = data.usageMetadata;

        return {
          content,
          usage: {
            promptTokens: usage?.promptTokenCount ?? 0,
            completionTokens: usage?.candidatesTokenCount ?? 0,
            totalTokens: usage?.totalTokenCount ?? 0,
          },
          model,
          provider: 'gemini' as const,
          finishReason: this.mapFinishReason(candidate?.finishReason),
          raw: data,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (
          err instanceof LLMProviderError ||
          err instanceof LLMAuthenticationError ||
          err instanceof LLMRateLimitError ||
          err instanceof LLMContextLengthError
        ) {
          throw err;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          throw new LLMProviderError(`Request timeout after ${this.config.timeoutMs}ms`, 'gemini');
        }
        throw new LLMProviderError(err instanceof Error ? err.message : String(err), 'gemini');
      }
    });
  }

  private mapFinishReason(reason: string | undefined): LLMCompletionResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  private mapGeminiError(
    status: number,
    message: string,
    retryAfterHeader?: string | null
  ): LLMProviderError {
    if (status === 400 && message.includes('API key')) {
      return new LLMAuthenticationError('gemini');
    }
    if (status === 401 || status === 403) {
      return new LLMAuthenticationError('gemini');
    }
    if (status === 429) {
      const retryAfterMs =
        retryAfterHeader && /^\d+$/.test(retryAfterHeader)
          ? parseInt(retryAfterHeader) * 1000
          : undefined;
      return new LLMRateLimitError('gemini', retryAfterMs);
    }
    if (status === 400 && message.toLowerCase().includes('token')) {
      return new LLMContextLengthError('gemini', 0);
    }
    return new LLMProviderError(message, 'gemini', status, status >= 500 && status < 600);
  }
}
