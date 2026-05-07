/**
 * OpenAI Provider Adapter
 *
 * Implements the unified ILLMProvider interface for OpenAI's API.
 * Defaults to the Responses API and keeps Chat Completions as an explicit
 * compatibility surface for older proxies and deployments.
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
  OpenAIProviderConfig,
  TokenUsage,
  ToolSpec,
  ToolUseBlock,
} from '../types';
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
  messageContentAsString,
} from '../types';

// Available OpenAI models for HoloScript generation.
// Keep current aliases first and legacy aliases last so callers can still opt
// into old pinned behavior without making those models the default.
export const OPENAI_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-pro',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5-codex',
  'gpt-5.2',
  'gpt-5',
  'gpt-4.1',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4-turbo-preview',
  'gpt-4',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
] as const;

export type OpenAIModel = (typeof OPENAI_MODELS)[number];

type OpenAIResponseInputItem = Record<string, unknown>;
type OpenAIResponseTool = Record<string, unknown>;

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseToolInput(value: unknown): Record<string, unknown> {
  if (asRecord(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || value.trim().length === 0) return {};

  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function flushTextInput(
  input: OpenAIResponseInputItem[],
  role: LLMMessage['role'],
  textParts: string[]
): void {
  if (textParts.length === 0) return;
  input.push({
    role,
    content: textParts.join('\n'),
  });
  textParts.length = 0;
}

/**
 * Translate the provider-neutral HoloScript tool shape to OpenAI Responses
 * function tools.
 */
export function toolSpecsToOpenAIResponseTools(tools: ToolSpec[] = []): OpenAIResponseTool[] {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    strict: false,
  }));
}

/**
 * Translate provider-neutral messages to the Responses API input array.
 * Text turns stay as role/content messages. Prior assistant tool calls and
 * user tool results are represented as Responses function_call /
 * function_call_output items so HoloScript tool loops can round-trip.
 */
export function messagesToOpenAIResponsesInput(messages: LLMMessage[]): OpenAIResponseInputItem[] {
  const input: OpenAIResponseInputItem[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      input.push({ role: message.role, content: message.content });
      continue;
    }

    const textParts: string[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
        continue;
      }

      flushTextInput(input, message.role, textParts);

      if (block.type === 'tool_use') {
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      } else if (block.type === 'tool_result') {
        input.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: block.content,
        });
      }
    }

    flushTextInput(input, message.role, textParts);
  }

  return input;
}

/**
 * Parse an OpenAI Responses API result into the provider-neutral completion
 * shape. Exported so the wire contract is testable without live API calls.
 */
export function parseOpenAIResponsesResult(
  response: unknown,
  fallbackModel: string
): LLMCompletionResponse {
  const record = asRecord(response) ?? {};
  const textParts: string[] = [];
  const toolUses: ToolUseBlock[] = [];
  const assistantBlocks: AssistantContentBlock[] = [];
  let sawRefusal = false;

  const output = asArray(record.output);
  for (const itemValue of output) {
    const item = asRecord(itemValue);
    if (!item) continue;

    const itemType = stringField(item.type);
    if (itemType === 'function_call') {
      const id = stringField(item.call_id) ?? stringField(item.id) ?? `call_${toolUses.length}`;
      const name = stringField(item.name) ?? 'unknown_function';
      const input = parseToolInput(item.arguments);
      const toolUse: ToolUseBlock = { type: 'tool_use', id, name, input };
      toolUses.push(toolUse);
      assistantBlocks.push(toolUse);
      continue;
    }

    if (itemType === 'message') {
      for (const blockValue of asArray(item.content)) {
        const block = asRecord(blockValue);
        if (!block) continue;

        const blockType = stringField(block.type);
        if (blockType === 'output_text' || blockType === 'text') {
          const text = stringField(block.text) ?? '';
          if (text.length > 0) {
            textParts.push(text);
            assistantBlocks.push({ type: 'text', text });
          }
        } else if (blockType === 'refusal') {
          sawRefusal = true;
          const refusal = stringField(block.refusal) ?? stringField(block.text) ?? '';
          if (refusal.length > 0) {
            textParts.push(refusal);
            assistantBlocks.push({ type: 'text', text: refusal });
          }
        }
      }
    } else if (itemType === 'output_text') {
      const text = stringField(item.text) ?? '';
      if (text.length > 0) {
        textParts.push(text);
        assistantBlocks.push({ type: 'text', text });
      }
    } else if (itemType === 'refusal') {
      sawRefusal = true;
      const refusal = stringField(item.refusal) ?? stringField(item.text) ?? '';
      if (refusal.length > 0) {
        textParts.push(refusal);
        assistantBlocks.push({ type: 'text', text: refusal });
      }
    }
  }

  const outputText = stringField(record.output_text);
  if (textParts.length === 0 && outputText && outputText.length > 0) {
    textParts.push(outputText);
    assistantBlocks.push({ type: 'text', text: outputText });
  }

  return {
    content: textParts.join(''),
    usage: parseOpenAIUsage(record.usage),
    model: stringField(record.model) ?? fallbackModel,
    provider: 'openai',
    finishReason: mapOpenAIResponseFinishReason(record, toolUses.length > 0, sawRefusal),
    toolUses: toolUses.length > 0 ? toolUses : undefined,
    assistantBlocks: assistantBlocks.length > 0 ? assistantBlocks : undefined,
    requestId: stringField(record._request_id) ?? stringField(record.id),
    raw: response,
  };
}

function parseOpenAIUsage(value: unknown): TokenUsage {
  const usage = asRecord(value) ?? {};
  const promptTokens = numberField(usage.input_tokens) ?? numberField(usage.prompt_tokens) ?? 0;
  const completionTokens =
    numberField(usage.output_tokens) ?? numberField(usage.completion_tokens) ?? 0;
  const totalTokens =
    numberField(usage.total_tokens) ??
    numberField(usage.totalTokens) ??
    promptTokens + completionTokens;

  return { promptTokens, completionTokens, totalTokens };
}

function mapOpenAIResponseFinishReason(
  response: Record<string, unknown>,
  hasToolUse: boolean,
  sawRefusal: boolean
): LLMCompletionResponse['finishReason'] {
  if (hasToolUse) return 'tool_use';
  if (sawRefusal) return 'refusal';

  const status = stringField(response.status);
  const incomplete = asRecord(response.incomplete_details);
  const incompleteReason = stringField(incomplete?.reason);

  if (status === 'failed') return 'error';
  if (status === 'incomplete') {
    if (incompleteReason === 'max_output_tokens') return 'length';
    if (incompleteReason === 'content_filter') return 'content_filter';
    return 'length';
  }

  return 'stop';
}

function toolSpecsToChatCompletionTools(tools: ToolSpec[] = []): OpenAIResponseTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

function parseChatToolCalls(choice: unknown): {
  toolUses: ToolUseBlock[];
  assistantBlocks: AssistantContentBlock[];
} {
  const choiceRecord = asRecord(choice) ?? {};
  const message = asRecord(choiceRecord.message) ?? {};
  const content = stringField(message.content) ?? '';
  const toolUses: ToolUseBlock[] = [];
  const assistantBlocks: AssistantContentBlock[] = [];

  if (content.length > 0) {
    assistantBlocks.push({ type: 'text', text: content });
  }

  for (const callValue of asArray(message.tool_calls)) {
    const call = asRecord(callValue);
    const fn = asRecord(call?.function);
    if (!call || !fn) continue;

    const id = stringField(call.id) ?? `call_${toolUses.length}`;
    const name = stringField(fn.name) ?? 'unknown_function';
    const input = parseToolInput(fn.arguments);
    const toolUse: ToolUseBlock = { type: 'tool_use', id, name, input };
    toolUses.push(toolUse);
    assistantBlocks.push(toolUse);
  }

  return { toolUses, assistantBlocks };
}

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

  /**
   * Capability manifest sourced from `ai-ecosystem/docs/LLM_CAPABILITIES.md`
   * § OpenAI. Per OpenAI/Codex self-audit 2026-05-06: Responses API is the
   * primary surface (default since commit 1eebdf0ed); Chat Completions kept
   * as compatibility surface. Lineup spans GPT-5.5 / GPT-5.4 family /
   * GPT-5.3-codex / o-series / Realtime / Embeddings / GPT Image.
   *
   * `contextWindow` / `maxOutput` set to 0 (unknown) until /research
   * task_1778109552044_wstq populates the per-model spec table — F.014 /
   * W.GOLD.341 forbid pasting training-era stats. `costPerMillion` omitted
   * for the same reason (varies per model).
   */
  readonly capabilities: Capabilities = {
    contextWindow: 0,              // [VERIFY task_1778109552044_wstq]
    maxOutput: 0,                  // [VERIFY task_1778109552044_wstq]

    streaming: true,
    tools: true,                   // Responses function calling

    vision: true,                  // GPT-5.x, GPT-4o family
    audioInput: true,              // Realtime API
    audioOutput: true,             // Realtime API
    imageGeneration: true,         // GPT Image

    visibleReasoning: true,        // reasoning summaries/items; raw CoT is not exposed
    adjustableEffort: true,        // reasoning effort: none/minimal/low/medium/high/xhigh

    liveWebSearch: true,           // Responses web_search tool (first-party)
    hostedShell: true,             // Responses shell — DEFAULT-DENY in policy layer (W.GOLD don't)
    codeExecutionSandbox: true,    // Responses code interpreter
    fileSearchBuiltIn: true,       // Vector stores — NOT source-of-truth (W.GOLD don't)
    promptCaching: true,           // automatic prompt caching + retention controls
    hostedAgenticLoop: true,       // Agents SDK — interop only, never replaces HoloMesh (W.GOLD don't)
    persistentMemoryStore: true,   // Vector stores
    structuredOutputs: true,       // strict JSON schema
    embeddings: true,              // first-class endpoint
    batchApi: true,                // 50% off, 24h SLA
    realtimeVoice: true,           // Realtime API (WebRTC/SIP/WebSocket)
    embeddedChatUI: true,          // ChatKit
    appsIframeSurface: true,       // Apps SDK (MCP-Apps iframe)
    evalsFirstParty: true,         // Evals + Prompt Optimizer

    bearerTokenAccess: true,
  };

  private readonly organization?: string;
  private readonly apiSurface: NonNullable<OpenAIProviderConfig['apiSurface']>;
  private readonly reasoningEffort?: OpenAIProviderConfig['reasoningEffort'];
  private readonly store?: boolean;
  private readonly parallelToolCalls: boolean;

  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.defaultHoloScriptModel = config.defaultModel ?? this.getDefaultModel();
    this.organization = config.organization;
    this.apiSurface = config.apiSurface ?? 'responses';
    this.reasoningEffort = config.reasoningEffort;
    this.store = config.store;
    this.parallelToolCalls = config.parallelToolCalls ?? true;
  }

  protected getDefaultModel(): string {
    return 'gpt-5.5';
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    // Dynamically import openai to keep it optional.
    let OpenAI: typeof import('openai').default;
    try {
      const module = await import('openai');
      OpenAI = module.default;
    } catch {
      throw new LLMProviderError('openai package not installed. Run: npm install openai', 'openai');
    }

    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || undefined,
      organization: this.organization,
      timeout: this.config.timeoutMs,
      maxRetries: 0, // We handle retries ourselves.
    });

    if (this.apiSurface === 'chat-completions') {
      return await this.completeWithChatCompletions(client, request, model);
    }

    return await this.completeWithResponses(client, request, model);
  }

  private async completeWithResponses(
    client: InstanceType<typeof import('openai').default>,
    request: LLMCompletionRequest,
    model: string
  ): Promise<LLMCompletionResponse> {
    return await this.withRetry(async () => {
      try {
        const payload = this.buildResponsesPayload(request, model);
        const response = await client.responses.create(payload as never);
        return parseOpenAIResponsesResult(response, model);
      } catch (err: unknown) {
        throw this.mapOpenAIError(err);
      }
    });
  }

  private buildResponsesPayload(
    request: LLMCompletionRequest,
    model: string
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model,
      input: messagesToOpenAIResponsesInput(request.messages),
      max_output_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stop,
      stream: false,
      store: this.store,
      ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = toolSpecsToOpenAIResponseTools(request.tools);
      payload.tool_choice = 'auto';
      payload.parallel_tool_calls = this.parallelToolCalls;
    }

    return compactUndefined(payload);
  }

  private async completeWithChatCompletions(
    client: InstanceType<typeof import('openai').default>,
    request: LLMCompletionRequest,
    model: string
  ): Promise<LLMCompletionResponse> {
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
          ...(request.tools && request.tools.length > 0
            ? {
                tools: toolSpecsToChatCompletionTools(request.tools) as never,
                tool_choice: 'auto' as const,
              }
            : {}),
        });

        const choice = response.choices[0];
        const content = choice?.message?.content ?? '';
        const usage = response.usage;
        const { toolUses, assistantBlocks } = parseChatToolCalls(choice);

        return {
          content,
          usage: {
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
          },
          model: response.model,
          provider: 'openai',
          finishReason:
            toolUses.length > 0 ? 'tool_use' : this.mapChatFinishReason(choice?.finish_reason),
          toolUses: toolUses.length > 0 ? toolUses : undefined,
          assistantBlocks: assistantBlocks.length > 0 ? assistantBlocks : undefined,
          raw: response,
        };
      } catch (err: unknown) {
        throw this.mapOpenAIError(err);
      }
    });
  }

  private mapChatFinishReason(
    reason: string | null | undefined
  ): LLMCompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'tool_calls':
      case 'function_call':
        return 'tool_use';
      default:
        return 'stop';
    }
  }

  private mapOpenAIError(err: unknown): Error {
    if (err instanceof Error) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        return new LLMAuthenticationError('openai');
      }
      if (status === 429) {
        const retryAfter = (err as { headers?: { 'retry-after'?: string } }).headers?.[
          'retry-after'
        ];
        return new LLMRateLimitError(
          'openai',
          retryAfter ? parseInt(retryAfter) * 1000 : undefined
        );
      }
      if (
        status === 400 &&
        (err.message.includes('context_length') || err.message.includes('context window'))
      ) {
        return new LLMContextLengthError('openai', 0);
      }
      const isRetryableStatus = typeof status === 'number' && status >= 500 && status < 600;
      return new LLMProviderError(err.message, 'openai', status, isRetryableStatus);
    }
    return new LLMProviderError(String(err), 'openai');
  }
}
