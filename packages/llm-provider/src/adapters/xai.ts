/**
 * xAI (Grok) Provider Adapter
 *
 * Implements the unified ILLMProvider interface for xAI's API.
 * xAI provides an OpenAI-compatible chat completions API at
 * https://api.x.ai/v1.
 *
 * Models: grok-4.3, grok-4.5, grok-build-0.1, grok-4.20-0309-reasoning,
 *         grok-4.20-0309-non-reasoning, grok-4.20-multi-agent-0309.
 * Default model for HoloScript generation: grok-4.3.
 * (grok-4.5 launched 2026-07-08 and is the vendor-recommended default
 * including code; HoloScript KEEPS grok-4.3 as default — the independent
 * eval ran 2026-07-10 (task 9c9h) and found PARITY (12/12 both models on a
 * bounded objective suite), so the 1M→500K context drop and 2.4× output
 * price are not justified by any measured capability gain. grok-4.5 stays
 * available for explicit opt-in. Receipt:
 * research/2026-07-10_grok-4.5-vs-4.3-eval-9c9h.md.)
 *
 * Model metadata last verified 2026-07-10 via credentialed
 * /v1/language-models discovery.
 * Sources: docs.x.ai/developers/models,
 * docs.x.ai/developers/rest-api-reference/inference/models
 *
 * @version 1.2.0
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

// Available xAI language models for HoloScript generation.
// Last updated 2026-07-10 from credentialed /v1/language-models discovery.
export const XAI_MODELS = [
  'grok-4.3',
  'grok-4.5',
  'grok-build-0.1',
  'grok-4.20-0309-reasoning',
  'grok-4.20-0309-non-reasoning',
  'grok-4.20-multi-agent-0309',
] as const;

export type XAIModel = (typeof XAI_MODELS)[number];

export interface XAIModelCapability {
  contextWindow: number;
  /**
   * xAI does not publish a separate max-output token cap for most models.
   * 0 means "not published" — treat the context window as the upper bound.
   */
  maxOutput: number;
  /** Long-context price threshold from /v1/language-models; 0 = none published. */
  longContextThreshold: number;
  costPerMillion: {
    input: number;
    /** Input price above longContextThreshold; 0 means same rate / not applicable. */
    inputLongContext: number;
    cachedInput: number;
    output: number;
  };
  status: 'active';
  lastVerified: string;
}

export const XAI_MODEL_CAPABILITIES = {
  // Current HoloScript default chat model. Source: docs.x.ai/developers/models
  // plus credentialed /v1/language-models (verified 2026-07-10).
  'grok-4.3': {
    contextWindow: 1_000_000,
    maxOutput: 0, // not published by xAI as of 2026-07-10
    longContextThreshold: 200_000,
    costPerMillion: {
      input: 1.25,
      inputLongContext: 2.5,
      cachedInput: 0.2,
      output: 2.5,
    },
    status: 'active',
    lastVerified: '2026-07-10',
  },
  // Launched 2026-07-08; vendor-recommended default including code.
  // HoloScript default stays grok-4.3 until an independent eval gates the
  // flip. Pricing credential-verified 2026-07-10 via /v1/language-models:
  // $2/M in, $6/M out, $0.50/M cached in; above the 200K long-context
  // threshold the API also doubles cached-input ($1/M) and output ($12/M)
  // prices — fields this schema does not carry yet (input-side only).
  // Context window from docs.x.ai/developers/models (500K); the
  // language-models API does not return a window field.
  'grok-4.5': {
    contextWindow: 500_000,
    maxOutput: 0, // not published by xAI as of 2026-07-10
    longContextThreshold: 200_000,
    costPerMillion: {
      input: 2.0,
      inputLongContext: 4.0,
      cachedInput: 0.5,
      output: 6.0,
    },
    status: 'active',
    lastVerified: '2026-07-10',
  },
  // Coding model; aliases include grok-code-fast-1.
  'grok-build-0.1': {
    contextWindow: 256_000,
    maxOutput: 0, // not published by xAI as of 2026-07-10
    longContextThreshold: 200_000,
    costPerMillion: {
      input: 1.0,
      inputLongContext: 2.0,
      cachedInput: 0.2,
      output: 2.0,
    },
    status: 'active',
    lastVerified: '2026-07-10',
  },
  // API-visible Grok 4.20 family. Public docs conflict on 1M vs 2M context;
  // use the conservative 1M until model-specific API output exposes a window.
  'grok-4.20-0309-reasoning': {
    contextWindow: 1_000_000,
    maxOutput: 0,
    longContextThreshold: 200_000,
    costPerMillion: {
      input: 1.25,
      inputLongContext: 2.5,
      cachedInput: 0.2,
      output: 2.5,
    },
    status: 'active',
    lastVerified: '2026-07-10',
  },
  'grok-4.20-0309-non-reasoning': {
    contextWindow: 1_000_000,
    maxOutput: 0,
    longContextThreshold: 200_000,
    costPerMillion: {
      input: 1.25,
      inputLongContext: 2.5,
      cachedInput: 0.2,
      output: 2.5,
    },
    status: 'active',
    lastVerified: '2026-07-10',
  },
  'grok-4.20-multi-agent-0309': {
    contextWindow: 1_000_000,
    maxOutput: 0,
    longContextThreshold: 200_000,
    costPerMillion: {
      input: 1.25,
      inputLongContext: 2.5,
      cachedInput: 0.2,
      output: 2.5,
    },
    status: 'active',
    lastVerified: '2026-07-10',
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
 * Capability manifest sourced from `docs/LLM_CAPABILITIES.md`
 * xAI (Grok). Live Search (real-time web + X-platform) is Grok's unique
 * differentiator vs Anthropic/OpenAI/Gemini for social and news signal.
 *
 * Model metadata verified against official xAI docs and credentialed
 * /v1/language-models discovery on 2026-07-10 (A-020):
 * - grok-4.3: current HoloScript default chat model, 1M context,
 *   $1.25/$2.50 per MTok.
 * - grok-4.5: launched 2026-07-08, vendor-recommended default incl. code,
 *   500K context, $2/$6 per MTok, $0.50/M cached input, reasoning_effort
 *   (low/medium/high, default high), built-in web/X-search/code-execution
 *   tools. NOT the HoloScript default until an independent eval gates it.
 * - grok-build-0.1: coding model, 256K context, $1.00/$2.00 per MTok.
 * - grok-4.20-* family: API-visible language models, routed only when
 *   explicitly selected until public context-window docs stop conflicting.
 * - grok-4-0709 and grok-4-fast-* are absent from credentialed discovery.
 * xAI's API is OpenAI-compatible at the wire level, so streaming + tools are
 * confirmed. All Grok 4 variants support text/image input, function calling,
 * structured outputs, cached-token pricing, and reasoning.
 *
 * XAI_CAPABILITIES reflects grok-4.3 (the current default model) per A-020.
 * Media fields describe the separate Grok Imagine API axis, not complete().
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
  tools: true, // OpenAI-compatible function calling
  vision: true, // text + image input
  imageGeneration: true, // Grok Imagine image API
  videoGeneration: true, // Grok Imagine video API
  videoEditing: true, // Grok Imagine Agent Mode / batch media edits
  imageAnimation: true, // Grok Imagine 1.5 image-to-video preview

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
