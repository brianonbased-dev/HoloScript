/**
 * Google Gemini Provider Adapter
 *
 * Implements the unified ILLMProvider interface for Google Gemini's API.
 * Uses fetch-based HTTP requests (no SDK dependency) for maximum compatibility.
 * Supports Gemini 3.6 Flash, Gemini 3.5 Flash/Flash-Lite, Gemini 3 Flash
 * Preview, Gemini Omni Flash Preview route metadata, and legacy Gemini 1.5
 * models.
 *
 * Function calling uses the standard generateContent API (not the Interactions/
 * Live API). Tool calls appear as `functionCall` parts in the response
 * candidates, and tool results are fed back as `functionResponse` parts in
 * the next `contents[]` turn.
 *
 * Interactions API note (A-020, 2026-06-08): The Gemini Interactions API
 * removed the `outputs` field and replaced it with a `steps[]` array
 * (user_input + model_output step types). This adapter uses `generateContent`
 * (not the Interactions/Live endpoint) and therefore reads `candidates[0]`
 * directly. If this adapter is ever extended to use the Interactions API,
 * iterate `response.steps` (not `response.outputs`) and find
 * `step.type === 'model_output'` for content. History for Interactions API
 * multi-turn goes in `input.steps[]`, not `contents[]`.
 *
 * @version 1.1.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  AssistantContentBlock,
  Capabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMMessage,
  GeminiProviderConfig,
  GeminiThinkingLevel,
  ToolSpec,
  ToolUseBlock,
} from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
  filterGenericTools,
  messageContentAsString,
} from '../types';

// Available Google Gemini models.
// gemini-3.1-flash-image-preview and gemini-3-pro-image-preview are NOT
// included — they shut down June 25 2026 per the Interactions API breaking
// changes notice (ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026).
// gemini-2.0-flash and gemini-2.0-flash-lite are NOT included; Google lists
// them as shut down June 1 2026 in Gemini API pricing/docs (A-020, 2026-06-21).
// gemini-omni-flash-preview is included for routing metadata only: Google's
// 2026-06-30 public preview docs route video generation/editing through the
// Interactions API, not this adapter's generateContent chat path.
// Veo/Imagen media-generation model IDs are NEVER in this chat registry (media
// routes through the Interactions API axis). These are RETIRED — must not be
// reintroduced on any media route (A-020 2026-07-10, ihoc):
//   • veo-2.0-generate-001 / veo-3.0-generate-001 / veo-3.0-fast-generate-001 —
//     shut down 2026-06-30 (already live; any Veo route is broken). Successor:
//     gemini-omni-flash-preview (video-generation axis).
//   • imagen-4.0-generate-001 / imagen-4.0-ultra-generate-001 /
//     imagen-4.0-fast-generate-001 — shutdown 2026-08-17. Successor:
//     gemini-3.1-flash-lite-image (GA 2026-06-30).
//   SSOT dates: docs/llm-capabilities/google-gemini.md.
export const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-tts-preview',
  'gemini-omni-flash-preview',
  'gemini-3-flash-preview',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

export type GeminiApiSurface = 'generateContent' | 'interactions';

export interface GeminiModelMetadata {
  id: GeminiModel;
  status: 'ga' | 'preview' | 'legacy';
  apiSurface: GeminiApiSurface;
  defaultRoutingEligible: boolean;
  supportsTextCompletion: boolean;
  supportsFunctionCalling: boolean;
  supportsVideoGeneration?: boolean;
  supportsVideoEditing?: boolean;
  supportsImageAnimation?: boolean;
  supportsConversationalMediaEditing?: boolean;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  costPerMillion?: { input: number; output: number };
  defaultThinkingLevel?: GeminiThinkingLevel;
  supportedThinkingLevels?: readonly GeminiThinkingLevel[];
  supportsSamplingParameters: boolean;
  allowsPrefilledModelTurn: boolean;
  lastVerified: string;
  routingNotes: readonly string[];
  sources: readonly string[];
}

function geminiModelMetadata(
  id: GeminiModel,
  overrides: Partial<Omit<GeminiModelMetadata, 'id'>> = {}
): GeminiModelMetadata {
  return {
    id,
    status: 'ga',
    apiSurface: 'generateContent',
    defaultRoutingEligible: true,
    supportsTextCompletion: true,
    supportsFunctionCalling: true,
    supportsSamplingParameters: true,
    allowsPrefilledModelTurn: true,
    lastVerified: '2026-06-30',
    routingNotes: [],
    sources: ['https://ai.google.dev/gemini-api/docs/models'],
    ...overrides,
  };
}

export const GEMINI_MODEL_METADATA = {
  'gemini-3.6-flash': geminiModelMetadata('gemini-3.6-flash', {
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
    costPerMillion: { input: 1.5, output: 7.5 },
    defaultThinkingLevel: 'medium',
    supportedThinkingLevels: ['minimal', 'low', 'medium', 'high'],
    supportsSamplingParameters: false,
    allowsPrefilledModelTurn: false,
    lastVerified: '2026-07-21',
    routingNotes: [
      'GA agentic/multimodal Flash model; deprecated sampling parameters are never forwarded.',
      'Requests whose last non-empty turn is model-authored are rejected before dispatch.',
    ],
    sources: [
      'https://ai.google.dev/gemini-api/docs/latest-model',
      'https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash',
      'https://ai.google.dev/gemini-api/docs/pricing',
    ],
  }),
  'gemini-3.5-flash': geminiModelMetadata('gemini-3.5-flash', {
    defaultThinkingLevel: 'medium',
    supportedThinkingLevels: ['minimal', 'low', 'medium', 'high'],
    sources: [
      'https://ai.google.dev/gemini-api/docs/models',
      'https://ai.google.dev/gemini-api/docs/generate-content/thinking',
    ],
  }),
  'gemini-3.5-flash-lite': geminiModelMetadata('gemini-3.5-flash-lite', {
    inputTokenLimit: 1_048_576,
    outputTokenLimit: 65_536,
    costPerMillion: { input: 0.3, output: 2.5 },
    defaultThinkingLevel: 'minimal',
    supportedThinkingLevels: ['minimal', 'low', 'medium', 'high'],
    supportsSamplingParameters: false,
    allowsPrefilledModelTurn: false,
    lastVerified: '2026-07-21',
    routingNotes: [
      'GA high-throughput Flash-Lite model; deprecated sampling parameters are never forwarded.',
      'Requests whose last non-empty turn is model-authored are rejected before dispatch.',
    ],
    sources: [
      'https://ai.google.dev/gemini-api/docs/latest-model',
      'https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite',
      'https://ai.google.dev/gemini-api/docs/pricing',
    ],
  }),
  'gemini-3.1-flash-tts-preview': geminiModelMetadata('gemini-3.1-flash-tts-preview', {
    status: 'preview',
    routingNotes: ['Streaming speech generation remains on the generateContent/stream axis.'],
  }),
  'gemini-omni-flash-preview': geminiModelMetadata('gemini-omni-flash-preview', {
    status: 'preview',
    apiSurface: 'interactions',
    defaultRoutingEligible: false,
    supportsTextCompletion: false,
    supportsFunctionCalling: false,
    supportsVideoGeneration: true,
    supportsVideoEditing: true,
    supportsImageAnimation: true,
    supportsConversationalMediaEditing: true,
    routingNotes: [
      'Public preview released 2026-06-30 for high-speed video generation and conversational video editing.',
      'Use the Gemini Interactions API for media generation/editing; do not route normal HoloScript text completion here.',
      'Provider extension hints are provider.gemini.videoEditing, imageAnimation, and conversationalMediaEditing.',
    ],
    sources: [
      'https://ai.google.dev/gemini-api/docs/changelog',
      'https://ai.google.dev/gemini-api/docs/omni',
      'https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash',
    ],
  }),
  'gemini-3-flash-preview': geminiModelMetadata('gemini-3-flash-preview', {
    status: 'preview',
  }),
  'gemini-1.5-pro': geminiModelMetadata('gemini-1.5-pro', { status: 'legacy' }),
  'gemini-1.5-flash': geminiModelMetadata('gemini-1.5-flash', { status: 'legacy' }),
  'gemini-1.5-flash-8b': geminiModelMetadata('gemini-1.5-flash-8b', {
    status: 'legacy',
  }),
} as const satisfies Record<GeminiModel, GeminiModelMetadata>;

export function getGeminiModelMetadata(model: string): GeminiModelMetadata | undefined {
  return GEMINI_MODEL_METADATA[model as GeminiModel];
}

export function isGeminiDefaultRoutingEligible(model: string): boolean {
  return getGeminiModelMetadata(model)?.defaultRoutingEligible === true;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** A single part inside a Gemini `content` object. */
interface GeminiPart {
  text?: string;
  /** Emitted by the model when it wants to invoke a function. */
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  /** Provided by the caller to return a function result to the model. */
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  parts: GeminiPart[];
  role: 'user' | 'model';
}

function isNonEmptyGeminiPart(part: GeminiPart): boolean {
  if (part.functionCall || part.functionResponse) return true;
  return typeof part.text === 'string' && part.text.trim().length > 0;
}

/**
 * Gemini `generateContent` response shape.
 *
 * NOTE: The Interactions/Live API (not used here) replaced the `outputs`
 * field with `steps[]` as of the May 2026 breaking-change notice
 * (A-020, 2026-06-08). This adapter reads `candidates[]` from the
 * standard REST `generateContent` endpoint, which is unaffected.
 */
interface GeminiResponse {
  candidates?: Array<{
    content: { parts: GeminiPart[]; role: string };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    /**
     * Tokens served from Gemini context caching. A SUBSET of
     * `promptTokenCount`, not an addition to it. Absent when no cached
     * content was used.
     */
    cachedContentTokenCount?: number;
  };
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/** Gemini function declaration for the `tools` request field. */
interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
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
/**
 * Capability manifest sourced from `docs/LLM_CAPABILITIES.md`
 * Google (Gemini). Native multimodal is Gemini's strongest differentiator:
 * text + image + video + audio in one model. Search Grounding (first-party
 * Google Search citations) and cached_content (long-context reuse) are the
 * other major routing signals.
 *
 * `contextWindow` / `maxOutput` reflect the current Gemini 3.5 Flash model
 * card as verified against Google AI docs on 2026-05-25. `costPerMillion`
 * omitted (varies per model + Vertex vs Studio pricing delta).
 *
 * Exported as a constant so the capability-aware router can read it
 * without instantiating the adapter: single source of truth per W.GOLD.006.
 */
export const GEMINI_CAPABILITIES: Capabilities = {
  contextWindow: 1_048_576,
  maxOutput: 65_536,

  streaming: true,
  tools: true, // function calling

  vision: true, // image input
  videoInput: true, // native video input — Gemini's differentiator
  audioInput: true, // native audio input
  audioOutput: true,
  streamingSpeechGeneration: true, // TTS audio chunks via streamGenerateContent / Interactions stream:true
  imageGeneration: true, // Imagen
  videoGeneration: true, // Veo (Sora is deprecated; Veo is GA)
  videoEditing: true, // Gemini Omni Flash / Interactions media refinement
  imageAnimation: true, // Gemini Omni Flash still-image animation
  conversationalMediaEditing: true, // Gemini Omni Flash conversational edits

  visibleReasoning: true, // thinking
  liveWebSearch: true, // Search Grounding (first-party)
  computerUse: true, // Computer Use tool (3.5 Flash, public preview 2026-06-24) — intent dialect in provider.gemini.computerUse; GUI automation gated at the HoloDoor chokepoint
  promptCaching: true, // cached_content
  structuredOutputs: true, // JSON mode + response schema
  embeddings: true, // first-class endpoint

  vertexAvailable: true, // native Vertex hosting
  bearerTokenAccess: true,
};

export class GeminiAdapter extends BaseLLMAdapter {
  readonly name = 'gemini' as const;
  readonly models = GEMINI_MODELS;
  readonly defaultHoloScriptModel: string;

  readonly capabilities: Capabilities = GEMINI_CAPABILITIES;

  constructor(config: GeminiProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? 'gemini-3.5-flash';
  }

  protected getDefaultModel(): string {
    return 'gemini-3.5-flash';
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    const modelMetadata = getGeminiModelMetadata(model);
    if (modelMetadata?.apiSurface === 'interactions') {
      throw new LLMProviderError(
        `${model} uses the Gemini Interactions API for media generation/editing; ` +
          'GeminiAdapter.complete() only supports generateContent text/tool calls. ' +
          'Route media requests via provider.gemini media hints and an Interactions adapter.',
        'gemini',
        400,
        false
      );
    }

    const baseURL = this.config.baseURL || GEMINI_API_BASE;
    const url = `${baseURL}/models/${model}:generateContent?key=${this.config.apiKey}`;

    // Gemini uses a different message structure: separate system instruction
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const conversationMessages = request.messages.filter((m) => m.role !== 'system');

    const contents: GeminiContent[] = conversationMessages.map((m) =>
      this.messageToGeminiContent(m)
    );

    if (modelMetadata?.allowsPrefilledModelTurn === false) {
      let lastNonEmptyContent: GeminiContent | undefined;
      for (let index = contents.length - 1; index >= 0; index -= 1) {
        if (contents[index].parts.some((part) => isNonEmptyGeminiPart(part))) {
          lastNonEmptyContent = contents[index];
          break;
        }
      }
      if (lastNonEmptyContent?.role === 'model') {
        throw new LLMProviderError(
          `${model} does not accept a prefilled model turn. The last non-empty ` +
            'conversation message must be user-authored; use a system instruction or ' +
            'structured output contract to constrain the response.',
          'gemini',
          400,
          false
        );
      }
    }

    const thinkingLevel = request.provider?.gemini?.thinkingLevel;
    if (thinkingLevel && !modelMetadata?.supportedThinkingLevels?.includes(thinkingLevel)) {
      throw new LLMProviderError(
        `${model} does not declare support for Gemini thinkingLevel=${thinkingLevel}.`,
        'gemini',
        400,
        false
      );
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxTokens,
      stopSequences: request.stop,
    };
    if (modelMetadata?.supportsSamplingParameters !== false) {
      generationConfig.temperature = request.temperature;
      generationConfig.topP = request.topP;
    }
    if (thinkingLevel) {
      generationConfig.thinkingConfig = { thinkingLevel };
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    // Add system instruction if present
    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: messageContentAsString(systemMessage.content) }],
      };
    }

    // Add function declarations when tools are requested. Only generic
    // ToolSpec entries are forwarded — provider-specific shapes (e.g.
    // AnthropicAdvisorToolSpec) are filtered out.
    const genericTools = filterGenericTools(request.tools);
    if (genericTools.length > 0) {
      body.tools = [
        {
          functionDeclarations: geminiToolsFromToolSpecs(genericTools),
        },
      ];
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

        return parseGeminiResponse(data, model);
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

  /**
   * Translate a provider-neutral LLMMessage to a Gemini `content` object.
   *
   * Handles three message shapes:
   *   1. Plain string content → single `text` part.
   *   2. Assistant message with `tool_use` blocks → `functionCall` parts so
   *      Gemini sees the model's prior tool invocations in history.
   *   3. User message with `tool_result` blocks → `functionResponse` parts so
   *      Gemini receives the results of those invocations.
   */
  private messageToGeminiContent(message: LLMMessage): GeminiContent {
    const role = message.role === 'assistant' ? 'model' : 'user';

    if (typeof message.content === 'string') {
      return { parts: [{ text: message.content }], role };
    }

    const parts: GeminiPart[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        parts.push({ text: block.text });
      } else if (block.type === 'tool_use') {
        // Model turn: translate tool_use → functionCall part
        parts.push({
          functionCall: {
            name: block.name,
            args: block.input,
          },
        });
      } else if (block.type === 'tool_result') {
        // User turn: translate tool_result → functionResponse part
        parts.push({
          functionResponse: {
            name: block.tool_use_id, // best proxy — caller should normalise to name
            response: { output: block.content },
          },
        });
      }
      // AnthropicFileContentBlock types are not forwarded to Gemini
    }

    if (parts.length === 0) {
      parts.push({ text: messageContentAsString(message.content) });
    }

    return { parts, role };
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

// =============================================================================
// Module-level helpers (exported for unit-testing without instantiation)
// =============================================================================

/**
 * Map a Gemini `finishReason` string to the provider-neutral finish reason.
 */
export function mapGeminiFinishReason(
  reason: string | undefined
): LLMCompletionResponse['finishReason'] {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
      return 'content_filter';
    case 'FUNCTION_CALL':
      // Gemini sets finishReason=FUNCTION_CALL when the model wants to invoke a
      // function rather than returning a final text response.
      return 'tool_use';
    default:
      return 'stop';
  }
}

/**
 * Convert an array of provider-neutral `ToolSpec` objects to Gemini function
 * declarations for the `tools[0].functionDeclarations` request field.
 */
export function geminiToolsFromToolSpecs(tools: ToolSpec[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.input_schema.properties,
      required: tool.input_schema.required,
    },
  }));
}

/**
 * Parse a Gemini `generateContent` response into the provider-neutral
 * `LLMCompletionResponse` shape.
 *
 * Handles both plain text responses and function-call responses:
 * - Text parts → `content` string + `TextBlock` entries in `assistantBlocks`.
 * - `functionCall` parts → `ToolUseBlock` entries in `toolUses` and
 *   `assistantBlocks`. Caller must execute tools and re-feed results via a
 *   follow-up request containing the prior assistant turn + `functionResponse`
 *   user messages.
 *
 * Exported for unit-testing without live API access.
 */
export function parseGeminiResponse(
  data: GeminiResponse,
  fallbackModel: string
): LLMCompletionResponse {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const usage = data.usageMetadata;

  const textParts: string[] = [];
  const toolUses: ToolUseBlock[] = [];
  const assistantBlocks: AssistantContentBlock[] = [];

  for (const part of parts) {
    if (part.functionCall) {
      const id = `call_${toolUses.length}_${part.functionCall.name}`;
      const toolUse: ToolUseBlock = {
        type: 'tool_use',
        id,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
      };
      toolUses.push(toolUse);
      assistantBlocks.push(toolUse);
    } else if (typeof part.text === 'string' && part.text.length > 0) {
      textParts.push(part.text);
      assistantBlocks.push({ type: 'text', text: part.text });
    }
  }

  const finishReason =
    toolUses.length > 0 ? 'tool_use' : mapGeminiFinishReason(candidate?.finishReason);

  return {
    content: textParts.join(''),
    usage: {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
      // Left undefined (not 0) when Gemini omits the field — undefined means
      // "not reported", 0 would falsely assert a cache miss. Gemini has no
      // cache-write counter, so `cacheWriteTokens` is never set here.
      cacheReadTokens: usage?.cachedContentTokenCount,
    },
    model: fallbackModel,
    provider: 'gemini' as const,
    finishReason,
    toolUses: toolUses.length > 0 ? toolUses : undefined,
    assistantBlocks: assistantBlocks.length > 0 ? assistantBlocks : undefined,
    raw: data,
  };
}
