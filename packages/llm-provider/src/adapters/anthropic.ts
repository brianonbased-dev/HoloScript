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

// Available Anthropic Claude models for HoloScript generation.
// Use aliases (not date-suffixed IDs) — they auto-resolve to the latest pinned build.
// Current as of 2026-04-17. Retired/deprecated models removed; do not restore without
// verifying status at https://platform.claude.com/docs/en/about-claude/models.
export const ANTHROPIC_MODELS = [
  // Current — recommended defaults
  'claude-opus-4-7',     // Most capable. Adaptive thinking only; no temperature/top_p.
  'claude-sonnet-4-6',   // Best speed/intelligence. Adaptive thinking.
  'claude-haiku-4-5',    // Fast, cost-effective for simple tasks.
  // Legacy — still active, use only on explicit request
  'claude-opus-4-6',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
] as const;

export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

// Models where sampling params (temperature, top_p, top_k) and budget_tokens
// are REMOVED — sending them returns 400. Adaptive thinking is required.
// Keep this set in sync with the skill's model documentation.
const SAMPLING_PARAMS_UNSUPPORTED: ReadonlySet<string> = new Set([
  'claude-opus-4-7',
]);

function supportsSamplingParams(model: string): boolean {
  return !SAMPLING_PARAMS_UNSUPPORTED.has(model);
}

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
    // Default to Opus 4.7 — most capable. Callers explicitly opt down to Sonnet/Haiku
    // when they want cost/speed tradeoffs. NEVER silently downgrade.
    this.defaultHoloScriptModel = config.defaultModel ?? 'claude-opus-4-7';
    this.apiVersion = config.apiVersion ?? '2023-06-01';
  }

  protected getDefaultModel(): string {
    return 'claude-opus-4-7';
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

    // Opus 4.7 removes temperature/top_p — sending them returns 400.
    // Only pass sampling params for models that still support them.
    const samplingParams: { temperature?: number; top_p?: number } = {};
    if (supportsSamplingParams(model)) {
      if (request.temperature !== undefined) samplingParams.temperature = request.temperature;
      if (request.topP !== undefined) samplingParams.top_p = request.topP;
    }

    try {
      // Use streaming + finalMessage() to avoid undici's 30s headersTimeout.
      // Without streaming, Anthropic returns response headers only AFTER the
      // full body finishes generating — for max_tokens=4096 on Opus 4.7 that
      // routinely takes 60-120s, but undici aborts after 30s waiting for
      // headers and surfaces "Request timed out" via APIConnectionTimeoutError.
      // Streaming starts emitting bytes within ~1s, so headersTimeout never
      // fires. .finalMessage() awaits the full stream and returns the same
      // shape as the non-streaming response. Observed 2026-04-25 on W01 H200
      // mesh-worker: claim → 30s → tick-error, repeated. Direct curl + direct
      // SDK call (claude-opus-4-7, max_tokens=4096) returned in 3.5s when
      // size of output was small; bug only surfaces when generation > 30s.
      // Restored pre-tool-use literal-object call shape — the dynamic
      // streamArgs Record<string,unknown> variant tripped a 30s wall in the
      // production code path that the same logic with literal-object-syntax
      // returns from in 2.8s. SDK overload resolution / inferred shape
      // matters; keep the call literal. Tools added conditionally below.
      const stream = client.messages.stream({
        model,
        // Default to 16000 per current API skill guidance (was 2048 — too low,
        // truncates commonly on modern models).
        max_tokens: request.maxTokens ?? 16000,
        ...samplingParams,
        stop_sequences: request.stop,
        system: system || undefined,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          // Pass content through whether it's a string or a structured
          // content-block array (tool_result follow-ups). SDK accepts both.
          content: m.content as never,
        })),
        // Only set tools when the caller passed any — keeps the request
        // shape identical to the working pre-tool-use path when tools=[].
        ...(request.tools && request.tools.length > 0 ? { tools: request.tools as never } : {}),
      });
      const response = await stream.finalMessage();

      // Split response.content into text + tool_use blocks. Some Opus paths
      // emit ONLY tool_use (no text) — content stays empty in that case;
      // toolUses carries the work. Caller's tool-loop must check toolUses
      // length and re-feed results before treating content as final.
      const textParts: string[] = [];
      const toolUses: Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }> = [];
      const assistantBlocks: Array<{ type: string;[k: string]: unknown }> = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push((block as { type: 'text'; text: string }).text);
          assistantBlocks.push({ type: 'text', text: (block as { type: 'text'; text: string }).text });
        } else if (block.type === 'tool_use') {
          const tu = block as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
          toolUses.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
          assistantBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
        }
      }
      const content = textParts.join('');

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
        finishReason: response.stop_reason === 'tool_use'
          ? 'tool_use'
          : this.mapStopReason(response.stop_reason),
        toolUses: toolUses.length > 0 ? toolUses : undefined,
        assistantBlocks: assistantBlocks as never,
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

  private mapStopReason(reason: string | null): LLMCompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
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
