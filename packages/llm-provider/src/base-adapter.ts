/**
 * Base LLM Adapter
 *
 * Abstract base class providing shared functionality for all LLM provider adapters.
 * Implements retry logic, HoloScript generation prompting, and response validation.
 *
 * @version 1.0.0
 */

import type {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  HoloScriptGenerationRequest,
  HoloScriptGenerationResponse,
  LLMProviderName,
  LLMProviderConfig,
  TokenUsage,
} from './types';
import {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
} from './types';

// =============================================================================
// HoloScript Generation System Prompt
// =============================================================================

const HOLOSCRIPT_SYSTEM_PROMPT = `You are an expert HoloScript developer. HoloScript is a spatial computing language for VR/AR scenes.

HoloScript syntax:
- Objects: cube, sphere, plane, cylinder, cone, torus, mesh, text, light, camera
- Traits: @color(value), @position(x, y, z), @rotation(x, y, z), @scale(x, y, z)
- Interaction: @grabbable, @clickable, @hoverable, @throwable, @scalable
- Physics: @physics, @gravity, @collidable, @static, @kinematic
- Visual: @emissive(color), @transparent(opacity), @wireframe, @metallic(value)
- Network: @networked, @shared, @owned
- AI: @agent, @llm_agent, @reactive

Rules:
1. Return ONLY valid HoloScript code - no markdown, no explanations
2. Use realistic positions (objects should be visible, y >= 0 for floor level)
3. Group related objects logically
4. Keep scenes focused on the user's request
5. Use appropriate traits for the described behavior

Example:
cube {
  @color(red)
  @position(0, 1, 0)
  @grabbable
  @physics
}`;

// =============================================================================
// Trait extraction regex
// =============================================================================

const TRAIT_REGEX = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Extract unique @trait references from a HoloScript code snippet.
 * Exported for direct testing — was inline-called from validateAndTrack
 * below. 2026-04-23: exported so provider.test.ts can assert its contract
 * without the class-method round-trip that broke when it moved out of
 * BaseLLMAdapter.
 */
export function extractTraits(code: string): string[] {
  const traits = new Set<string>();

  for (const match of code.matchAll(TRAIT_REGEX)) {
    traits.add(`@${match[1]}`);
  }

  return Array.from(traits);
}

// =============================================================================
// Base Adapter
// =============================================================================

export abstract class BaseLLMAdapter implements ILLMProvider {
  abstract readonly name: LLMProviderName;
  abstract readonly models: readonly string[];
  abstract readonly defaultHoloScriptModel: string;

  protected readonly config: Required<LLMProviderConfig>;

  constructor(config: LLMProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? '',
      // 5 min default — long-form generation (e.g. Claude Opus producing
      // a Lean proof or a multi-page reasoning trace) commonly takes 1-3 min.
      // Observed 2026-04-25: W01 H200 mesh-worker claimed Lean invariant-4
      // task, then aborted with "Request timed out" after 30s default — the
      // model hadn't even started streaming a substantive response. Adapters
      // (bitnet 60s, local-llm 120s, mock 5s) override this default for their
      // own latency profiles; 30s was an unreasonably tight base default.
      timeoutMs: config.timeoutMs ?? 300000,
      maxRetries: config.maxRetries ?? 3,
      defaultModel: config.defaultModel ?? this.getDefaultModel(),
    };
  }

  protected abstract getDefaultModel(): string;

  abstract complete(request: LLMCompletionRequest, model?: string): Promise<LLMCompletionResponse>;

  /**
   * Default `streamCompletion` implementation: call `complete()`, then yield
   * the full response as a synthesized batch of stream chunks.
   *
   * Adapters that support NATIVE streaming (Anthropic, Ollama, OpenAI)
   * override this with a real translation of their provider's stream events
   * to `LLMStreamChunk`. Adapters that don't (Mock, BitNet, Gemini) inherit
   * this default — callers get the same chunk shape, just batched at the end
   * instead of token-by-token.
   *
   * Synthesis order: text chunks first (one `text_delta` carrying the full
   * concatenated text), then tool-use chunks (one `tool_use_start` +
   * `tool_use_end` per tool — no `tool_use_input_delta` since the input is
   * already fully parsed), finally `message_stop`. This preserves the
   * type-level invariant that `tool_use_end` carries fully-parsed input.
   */
  async *streamCompletion(
    request: LLMCompletionRequest,
    model?: string
  ): AsyncIterable<LLMStreamChunk> {
    const response = await this.complete(request, model);

    if (response.content.length > 0) {
      yield { type: 'text_delta', text: response.content };
    }

    for (const tu of response.toolUses ?? []) {
      yield { type: 'tool_use_start', id: tu.id, name: tu.name };
      yield { type: 'tool_use_end', id: tu.id, input: tu.input };
    }

    yield {
      type: 'message_stop',
      finishReason: response.finishReason,
      usage: response.usage,
      model: response.model,
    };
  }

  /**
   * Generate HoloScript code from a natural language description.
   *
   * Transient-error retry lives inside `complete()` (each adapter wraps its
   * call in `withRetry`). The outer retry loop that previously lived here
   * was multiplicative with the inner one (4 outer × 4 inner = 16 worst-case
   * calls on persistent rate-limits) without adding behavior the inner loop
   * doesn't already cover.
   */
  async generateHoloScript(
    request: HoloScriptGenerationRequest
  ): Promise<HoloScriptGenerationResponse> {
    const systemPrompt = request.systemPrompt ?? HOLOSCRIPT_SYSTEM_PROMPT;
    const format = request.targetFormat ?? 'hsplus';

    const userPrompt = this.buildGenerationPrompt(request.prompt, format, request.maxObjects);

    const completionRequest: LLMCompletionRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 2048,
      temperature: request.temperature ?? 0.7,
    };

    const response = await this.complete(completionRequest, this.defaultHoloScriptModel);

    const code = this.extractHoloScriptCode(response.content);
    const validation = this.validateHoloScriptOutput(code);
    const detectedTraits = extractTraits(code);

    return {
      code,
      valid: validation.valid,
      errors: validation.errors,
      provider: this.name,
      usage: response.usage,
      detectedTraits,
    };
  }

  /**
   * Health check - tests connectivity and authentication.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.complete({
        messages: [{ role: 'user', content: 'Reply with just "ok"' }],
        maxTokens: 10,
        temperature: 0,
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Probe an OpenAI-compatible local inference server (llama.cpp, Ollama,
   * LM Studio, bitnet.cpp). Tries `${baseURL}/health` first, falls back to
   * `${baseURL}/v1/models` if that 404s — different runtimes ship different
   * health endpoints. 5s timeout per probe.
   *
   * `formatError` brands the error string per adapter so the failure message
   * carries the right setup hint (e.g. local-llm says "Start with: llama-server
   * -m model.gguf"; bitnet says "Run: python run_inference.py --serve").
   *
   * Local-server adapters (local-llm, bitnet) override the cloud-flavored
   * `healthCheck()` (which calls `complete()`) and delegate here instead —
   * pinging a tiny endpoint is much cheaper than a full chat round-trip.
   */
  protected async healthCheckLocalServer(
    baseURL: string,
    formatError: (baseURL: string, message: string) => string
  ): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const response = await fetch(`${baseURL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        const modelsResponse = await fetch(`${baseURL}/v1/models`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!modelsResponse.ok) throw new Error(`Status ${modelsResponse.status}`);
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: formatError(baseURL, message),
      };
    }
  }

  // ===========================================================================
  // Protected Helpers
  // ===========================================================================

  protected buildGenerationPrompt(
    description: string,
    format: string,
    maxObjects?: number
  ): string {
    const objectLimit = maxObjects ? ` Use at most ${maxObjects} objects.` : '';
    return `Generate a ${format} HoloScript scene for: "${description}".${objectLimit}

Return ONLY the HoloScript code, no explanations or markdown.`;
  }

  /**
   * Extract HoloScript code from LLM response, stripping markdown fences if present.
   */
  protected extractHoloScriptCode(content: string): string {
    // Strip markdown code fences (common LLM habit)
    const fencedMatch = content.match(/```(?:holoscript|holo|hsplus|hs)?\n?([\s\S]*?)```/);
    if (fencedMatch) {
      return fencedMatch[1].trim();
    }
    return content.trim();
  }

  /**
   * Basic structural validation of generated HoloScript code.
   */
  protected validateHoloScriptOutput(code: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!code || code.trim().length === 0) {
      errors.push('Generated code is empty');
      return { valid: false, errors };
    }

    // Check for markdown leakage
    if (code.includes('```')) {
      errors.push('Code contains markdown code fences');
    }

    // Check for balanced braces
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} opening, ${closeBraces} closing`);
    }

    // Check for at least one object
    const objectMatch = code.match(
      /\b(cube|sphere|plane|cylinder|cone|torus|mesh|text|light|camera|scene)\s*\{/
    );
    if (!objectMatch) {
      errors.push('No recognized HoloScript object types found');
    }

    return { valid: errors.length === 0, errors };
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Run an async operation with retry on transient errors.
   *
   * Retries `LLMProviderError` instances where `retryable=true` (e.g.
   * `LLMRateLimitError`, 5xx via `mapXError`) up to `this.config.maxRetries`
   * times. `LLMAuthenticationError`, `LLMContextLengthError`, and any
   * `LLMProviderError` with `retryable=false` (4xx other than 429) throw
   * immediately. Non-`LLMProviderError` exceptions (network errors, SDK
   * shapes the adapter didn't classify) get one retry then re-throw — they
   * could be transient or programmer errors, one retry covers the common
   * "first connection from cold worker" case without masking real bugs.
   *
   * Backoff is `2^attempt * 100ms + jitter`, capped at 8000ms. When the
   * caught error is `LLMRateLimitError` with `retryAfterMs`, that value is
   * used instead of the exponential backoff.
   *
   * Adapters call this around their SDK invocation: previously the SDK's
   * own retry was disabled (`maxRetries: 0` with the comment "We handle
   * retries ourselves") but no handler existed; this is that handler.
   */
  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxRetries = this.config.maxRetries;
    let lastError: unknown;
    let unknownErrorRetried = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;

        if (err instanceof LLMAuthenticationError || err instanceof LLMContextLengthError) {
          throw err;
        }

        let isRetryable: boolean;
        let retryAfterMs: number | undefined;

        if (err instanceof LLMProviderError) {
          isRetryable = err.retryable;
          if (err instanceof LLMRateLimitError) {
            retryAfterMs = err.retryAfterMs;
          }
        } else {
          // Non-LLMProviderError: retry once, then surface to caller.
          if (unknownErrorRetried) throw err;
          unknownErrorRetried = true;
          isRetryable = true;
        }

        if (!isRetryable) throw err;
        if (attempt >= maxRetries) break;

        const backoffMs = Math.min(Math.pow(2, attempt) * 100, 8000);
        const jitter = Math.random() * 100;
        const delayMs = retryAfterMs ?? backoffMs + jitter;
        await this.sleep(delayMs);
      }
    }

    throw lastError;
  }

  /**
   * Create a zero-usage TokenUsage for mock/error cases.
   */
  protected zeroUsage(): TokenUsage {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
}
