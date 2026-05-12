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
  Capabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMFileMetadata,
  LLMFileUploadRequest,
  LLMStreamChunk,
  AnthropicProviderConfig,
  AnthropicEffortLevel,
  LLMMessage,
  TokenUsage,
  ToolSpecUnion,
} from '../types';
import {
  isAnthropicAdvisorTool,
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMContextLengthError,
  LLMProviderError,
} from '../types';

/** Beta token for the advisor tool (`advisor-tool-2026-03-01`). */
export const ANTHROPIC_ADVISOR_BETA = 'advisor-tool-2026-03-01';
/** Beta token for the Files API (`files-api-2025-04-14`). */
export const ANTHROPIC_FILES_BETA = 'files-api-2025-04-14';
/** Beta token for server-side compaction (`compact-2026-01-12`). */
export const ANTHROPIC_COMPACT_BETA = 'compact-2026-01-12';
/** Beta token for per-loop task budgets (`task-budgets-2026-03-13`). */
export const ANTHROPIC_TASK_BUDGETS_BETA = 'task-budgets-2026-03-13';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnthropicFileContentBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === 'container_upload') {
    return typeof value.file_id === 'string' && value.file_id.length > 0;
  }
  if (value.type !== 'document' && value.type !== 'image') return false;
  const source = value.source;
  return (
    isRecord(source) &&
    source.type === 'file' &&
    typeof source.file_id === 'string' &&
    source.file_id.length > 0
  );
}

export function hasAnthropicFileContent(request: LLMCompletionRequest): boolean {
  for (const message of request.messages) {
    if (!Array.isArray(message.content)) continue;
    if (message.content.some(isAnthropicFileContentBlock)) {
      return true;
    }
  }
  return false;
}

/**
 * Collect every `anthropic-beta` token implied by a request:
 *
 *   1. Any tool with shape `{ type: 'advisor_20260301', name: 'advisor' }`
 *      contributes `advisor-tool-2026-03-01`.
 *   2. Any Files API content block (`document`/`image` with file source, or
 *      `container_upload`) contributes `files-api-2025-04-14`.
 *   3. Explicit `req.provider.anthropic.betaHeaders` entries pass through
 *      verbatim (callers can opt into future betas without an adapter bump).
 *
 * Duplicates removed; order preserved (advisor tokens first, then explicit
 * caller tokens). Returns `undefined` when no betas are required so the
 * adapter can skip the `anthropic-beta` header entirely and stay on the
 * fast, header-free request shape for the common case (`request.tools`
 * absent OR all generic function tools, no `betaHeaders`).
 */
export function collectAnthropicBetaHeaders(
  request: LLMCompletionRequest,
): string[] | undefined {
  const tokens: string[] = [];
  const tools = request.tools as ToolSpecUnion[] | undefined;
  if (tools && tools.length > 0) {
    for (const t of tools) {
      if (isAnthropicAdvisorTool(t)) {
        tokens.push(ANTHROPIC_ADVISOR_BETA);
        break; // one advisor tool ⇒ one header; duplicates would be redundant
      }
    }
  }
  if (hasAnthropicFileContent(request)) {
    tokens.push(ANTHROPIC_FILES_BETA);
  }
  // Per-provider request extensions (compaction / task budgets) are
  // Anthropic-specific server-side knobs. Each implies its own beta token —
  // we read them off `request.provider.anthropic.*` and contribute the
  // matching token here so the request shape stays uniform across adapters.
  if (request.provider?.anthropic?.compaction) {
    tokens.push(ANTHROPIC_COMPACT_BETA);
  }
  if (request.provider?.anthropic?.taskBudget) {
    tokens.push(ANTHROPIC_TASK_BUDGETS_BETA);
  }
  const explicit = request.provider?.anthropic?.betaHeaders;
  if (explicit && explicit.length > 0) {
    for (const h of explicit) {
      if (typeof h === 'string' && h.length > 0) {
        tokens.push(h);
      }
    }
  }
  if (tokens.length === 0) return undefined;
  // Dedupe while preserving order — the SDK forwards verbatim to the
  // `anthropic-beta` header, and Anthropic accepts comma-separated tokens
  // but a duplicate is a wasted byte and a log smell.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of tokens) {
    if (!seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out;
}

/**
 * Build the Anthropic-specific request body fields for server-side compaction
 * and per-loop task budgets. Returns an object suitable for spread into the
 * Messages API request — empty when neither extension is set so the common
 * path emits the unchanged request shape.
 *
 * The body field NAMES are snake_case (`compaction`, `task_budget`) to match
 * the Anthropic API convention; the value shapes are passed through verbatim
 * from `provider.anthropic.compaction` / `provider.anthropic.taskBudget` as
 * the typed unions on `AnthropicProviderExtensions` already match the wire
 * format. The matching `anthropic-beta` tokens are emitted separately by
 * `collectAnthropicBetaHeaders`.
 */
export function buildAnthropicExtensionBody(
  request: LLMCompletionRequest,
): { compaction?: { type: string }; task_budget?: { type: string; total: number } } {
  const out: { compaction?: { type: string }; task_budget?: { type: string; total: number } } = {};
  const compaction = request.provider?.anthropic?.compaction;
  if (compaction) {
    out.compaction = { type: compaction.type };
  }
  const taskBudget = request.provider?.anthropic?.taskBudget;
  if (taskBudget) {
    out.task_budget = { type: taskBudget.type, total: taskBudget.total };
  }
  return out;
}

function collectAnthropicUploadBetas(request: LLMFileUploadRequest): string[] {
  return [
    ANTHROPIC_FILES_BETA,
    ...(request.provider?.anthropic?.betaHeaders ?? []),
  ].filter((token, index, all) => token.length > 0 && all.indexOf(token) === index);
}

function mapAnthropicFileMetadata(value: unknown): LLMFileMetadata {
  const record = isRecord(value) ? value : {};
  return {
    id: String(record.id ?? ''),
    type: 'file',
    filename: String(record.filename ?? ''),
    mimeType: String(record.mime_type ?? ''),
    sizeBytes: typeof record.size_bytes === 'number' ? record.size_bytes : 0,
    createdAt: String(record.created_at ?? ''),
    downloadable: typeof record.downloadable === 'boolean' ? record.downloadable : undefined,
    raw: value,
  };
}

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

/** Opus 4.6/4.7 and Sonnet 4.5/4.6 — default adaptive + summarized unless caller disables. */
const ADAPTIVE_THINKING_DEFAULT_MODELS: ReadonlySet<string> = new Set([
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
]);

function isOpusFamilyModel(model: string): boolean {
  return model.startsWith('claude-opus');
}

/**
 * Maps unified request fields to Anthropic `thinking` + `output_config.effort`.
 * - Default `thinking: { type: 'adaptive', display: 'summarized' }` for supported
 *   Opus/Sonnet 4.x models when the caller does not set `thinking: { type: 'disabled' }`.
 * - Default effort: `xhigh` for `claude-opus-4-7`, `high` for other adaptive-default models.
 * - `effort: 'max'` and `effort: 'xhigh'` are only passed through on models that
 *   support them; otherwise we downgrade to avoid 400s.
 */
export function buildThinkingAndOutputForAnthropic(
  model: string,
  request: LLMCompletionRequest,
): { thinking?: Record<string, unknown>; output_config?: { effort: AnthropicEffortLevel } } {
  if (request.thinking?.type === 'disabled') {
    return { thinking: { type: 'disabled' } };
  }

  let thinking: Record<string, unknown> | undefined;
  if (request.thinking) {
    thinking = { ...request.thinking } as Record<string, unknown>;
    if (request.thinkingDisplay !== undefined) {
      thinking.display = request.thinkingDisplay;
    }
  } else if (ADAPTIVE_THINKING_DEFAULT_MODELS.has(model)) {
    thinking = {
      type: 'adaptive',
      display: request.thinkingDisplay ?? 'summarized',
    };
  }

  let effort = request.effort;
  if (effort === 'xhigh' && model !== 'claude-opus-4-7') {
    effort = 'high';
  }
  if (effort === 'max' && !isOpusFamilyModel(model)) {
    effort = 'high';
  }
  // Note: by this point request.thinking?.type is narrowed to
  // 'adaptive' | 'enabled' | undefined — the 'disabled' early-return on
  // line 77 has already exited. So the previous redundant
  // `request.thinking?.type !== 'disabled'` check that lived here was
  // statically always-true and TypeScript flagged it as dead code (TS2367),
  // breaking pre-flight build and blocking ALL Railway production deploys
  // (verified 2026-04-27 — task_1777332064755_xlc0 deploy 25025460074).
  if (effort === undefined) {
    if (model === 'claude-opus-4-7') {
      effort = 'xhigh';
    } else if (ADAPTIVE_THINKING_DEFAULT_MODELS.has(model)) {
      effort = 'high';
    }
  }

  const output_config = effort !== undefined ? { effort } : undefined;
  const out: { thinking?: Record<string, unknown>; output_config?: { effort: AnthropicEffortLevel } } = {};
  if (thinking) out.thinking = thinking;
  if (output_config) out.output_config = output_config;
  return out;
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
/**
 * Capability manifest sourced from `ai-ecosystem/docs/LLM_CAPABILITIES.md`
 * § Anthropic. Multi-model provider — `contextWindow` / `maxOutput` declare
 * the MAX across the lineup (Opus 4.7/4.6 + Sonnet 4.6 = 1M context, 128K
 * out; Haiku 4.5 is 200K/64K). `costPerMillion` intentionally omitted —
 * varies by model (Opus $5/$25, Sonnet $3/$15, Haiku $1/$5). Per-model
 * pricing lives in `holoscript-agent/src/cost-guard.ts`
 * `ANTHROPIC_PRICING_USD_PER_MTOK`.
 *
 * Exported as a constant so the capability-aware router in
 * holoscript-agent can read it without instantiating the adapter
 * (which requires an API key). The instance property below references
 * this constant — single source of truth per W.GOLD.006.
 */
export const ANTHROPIC_CAPABILITIES: Capabilities = {
  contextWindow: 1_000_000,
  maxOutput: 128_000,

  streaming: true,
  tools: true,

  vision: true,
  highResVision: true,           // Opus 4.7 — 2576px long edge
  visibleReasoning: true,        // adaptive thinking
  adjustableEffort: true,        // low / medium / high / xhigh / max

  liveWebSearch: true,           // server-side web_search tool (proxy, not real-time)
  codeExecutionSandbox: true,    // server-side code_execution
  promptCaching: true,           // cache_control breakpoints, 5min/1hr TTL
  perLoopBudget: true,           // Task Budgets — beta task-budgets-2026-03-13 (Opus 4.7)
  serverSideCompaction: true,    // beta compact-2026-01-12 (4.6+)
  hostedAgenticLoop: true,       // Managed Agents — beta managed-agents-2026-04-01 (1P only)
  persistentMemoryStore: true,   // Memory Stores (under managed-agents)
  structuredOutputs: true,       // strict JSON schema
  batchApi: true,                // 50% off, 24h SLA

  bedrockAvailable: true,
  vertexAvailable: true,
  bearerTokenAccess: true,
};

export class AnthropicAdapter extends BaseLLMAdapter {
  readonly name = 'anthropic' as const;
  readonly models = ANTHROPIC_MODELS;
  readonly defaultHoloScriptModel: string;

  readonly capabilities: Capabilities = ANTHROPIC_CAPABILITIES;

  private readonly apiVersion: string;
  private readonly enablePromptCaching: boolean;
  private readonly maxCacheBreakpoints: number;

  constructor(config: AnthropicProviderConfig) {
    super(config);
    // Default to Opus 4.7 — most capable. Callers explicitly opt down to Sonnet/Haiku
    // when they want cost/speed tradeoffs. NEVER silently downgrade.
    this.defaultHoloScriptModel = config.defaultModel ?? 'claude-opus-4-7';
    this.apiVersion = config.apiVersion ?? '2023-06-01';
    // Default ON. The Anthropic API skill explicitly recommends prompt
    // caching as the default for every call — below-minimum prefixes (under
    // 2-4K tokens depending on model) skip caching entirely with no cost
    // penalty, and above-minimum stable prefixes get ~10× per-tick savings
    // once cached. The only pathological case is a hot path with above-
    // minimum prefixes that never repeat (paying 1.25× writes with zero
    // reads); that caller can opt out with `enablePromptCaching: false`.
    this.enablePromptCaching = config.enablePromptCaching ?? true;
    // Anthropic's hard limit is 4 breakpoints per request. One is always
    // used for the system+tools prefix; the rest are distributed across
    // message turns (most recent assistant turn first).
    this.maxCacheBreakpoints = config.maxCacheBreakpoints ?? 4;
  }

  protected getDefaultModel(): string {
    return 'claude-opus-4-7';
  }

  async uploadFile(request: LLMFileUploadRequest): Promise<LLMFileMetadata> {
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
      maxRetries: 0,
    });

    return await this.withRetry(async () => {
      try {
        const uploaded = await client.beta.files.upload({
          file: request.file as never,
          betas: collectAnthropicUploadBetas(request) as never,
        });
        return mapAnthropicFileMetadata(uploaded);
      } catch (err: unknown) {
        throw this.mapAnthropicError(err);
      }
    });
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

    return await this.withRetry(async () => {
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
      // Prompt caching opt-in: when enabled AND we have a system prompt,
      // send `system` as an array with cache_control on the last (only)
      // block. Render order is `tools → system → messages`, so this single
      // breakpoint caches BOTH tools AND system together — the exact prefix
      // an agent runner reuses across ticks. The first request pays ~1.25×
      // input on the cached prefix; subsequent ticks within TTL pay ~0.1×.
      // Below the model's minimum cacheable prefix (~2-4K tokens) the
      // request is processed unchanged — no error, no benefit.
      const systemField = this.enablePromptCaching && system
        ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
        : (system || undefined);

      const thinkingOut = buildThinkingAndOutputForAnthropic(model, request);

      // Extended prompt caching: place breakpoints on recent assistant turns
      // so that agent tool-loops get cache hits beyond the system+tools prefix.
      const cachedMessages = this.buildMessagesWithCacheBreakpoints(
        messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content as never,
        })),
        !!(this.enablePromptCaching && system),
      );

      // Beta header for the advisor tool / explicit caller-supplied betas.
      // When undefined the adapter calls stream() with one arg (no options
      // object) so the request shape is unchanged for the common path —
      // this preserves the literal-object call shape that the W.production
      // 30s-wall comment above depends on.
      const betas = collectAnthropicBetaHeaders(request);
      const streamOptions = betas
        ? { headers: { 'anthropic-beta': betas.join(',') } }
        : undefined;

      const streamBody = {
        model,
        // Default to 16000 per current API skill guidance (was 2048 — too low,
        // truncates commonly on modern models).
        max_tokens: request.maxTokens ?? 16000,
        ...samplingParams,
        stop_sequences: request.stop,
        system: systemField as never,
        messages: cachedMessages.map((m) => ({
          role: m.role,
          content: m.content as never,
        })),
        // Only set tools when the caller passed any — keeps the request
        // shape identical to the working pre-tool-use path when tools=[].
        ...(request.tools && request.tools.length > 0 ? { tools: request.tools as never } : {}),
        // Adaptive thinking + output_config.effort (see buildThinkingAndOutputForAnthropic).
        ...(thinkingOut.thinking ? { thinking: thinkingOut.thinking as never } : {}),
        ...(thinkingOut.output_config
          ? { output_config: thinkingOut.output_config as never }
          : {}),
        // Server-side compaction + per-loop task budgets (see
        // buildAnthropicExtensionBody). Empty object spread when neither
        // extension is set, preserving the literal-object call shape.
        ...buildAnthropicExtensionBody(request),
      };
      const stream = streamOptions
        ? client.messages.stream(streamBody, streamOptions)
        : client.messages.stream(streamBody);
      const response = await stream.finalMessage();

      // Capture request-id and response headers for observability.
      // stream.request_id is the `request-id` HTTP header that Anthropic
      // assigns to every request — critical for debugging and support
      // escalations. stream.response exposes the raw Response with all
      // headers (rate-limit, retry-after, etc).
      const requestId: string | undefined = stream.request_id ?? undefined;
      let responseHeaders: Record<string, string> | undefined;
      const rawResponse = stream.response;
      if (rawResponse) {
        const headers: Record<string, string> = {};
        rawResponse.headers.forEach((value, key) => {
          headers[key] = value;
        });
        if (Object.keys(headers).length > 0) {
          responseHeaders = headers;
        }
      }

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
        requestId,
        responseHeaders,
        raw: response,
      };
    } catch (err: unknown) {
      throw this.mapAnthropicError(err);
    }
    });
  }

  /**
   * Stream a completion as provider-agnostic chunks. Translates Anthropic
   * SDK stream events to `LLMStreamChunk`:
   *
   *   content_block_start { type: 'tool_use', id, name }   → tool_use_start
   *   content_block_start { type: 'text' }                 → (no chunk; first text_delta covers it)
   *   content_block_delta { delta.text }                   → text_delta
   *   content_block_delta { delta.partial_json }           → tool_use_input_delta
   *   content_block_stop  (after a tool_use block)         → tool_use_end (with parsed input)
   *   message_delta       { delta.stop_reason }            → captured for final message_stop
   *   stream.finalMessage().usage                          → emitted in message_stop
   *
   * No `withRetry` — partial-text retries would re-emit prefix tokens and
   * corrupt downstream state (the route's roundText accumulator, the CAEL
   * chain, and the SSE bytes already sent to the client). Pre-flight
   * failures (auth, 429, request validation) throw on the FIRST `for await`
   * iteration before any chunk is yielded, so the caller sees them as
   * thrown errors. Mid-stream failures yield a `message_stop` with
   * `finishReason: 'error'` and the partial usage observed so far.
   */
  async *streamCompletion(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): AsyncIterable<LLMStreamChunk> {
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
      maxRetries: 0,
    });

    const { system, messages } = this.separateSystemMessages(request.messages);

    const samplingParams: { temperature?: number; top_p?: number } = {};
    if (supportsSamplingParams(model)) {
      if (request.temperature !== undefined) samplingParams.temperature = request.temperature;
      if (request.topP !== undefined) samplingParams.top_p = request.topP;
    }

    const systemField =
      this.enablePromptCaching && system
        ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
        : system || undefined;

    const thinkingOut = buildThinkingAndOutputForAnthropic(model, request);

    // Extended prompt caching: place breakpoints on recent assistant turns.
    const cachedMessages = this.buildMessagesWithCacheBreakpoints(
      messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as never,
      })),
      !!(this.enablePromptCaching && system),
    );

    // Beta header for the advisor tool / explicit caller-supplied betas.
    // See collectAnthropicBetaHeaders() — undefined ⇒ skip the options arg
    // entirely so the common-path request shape is unchanged.
    const betas = collectAnthropicBetaHeaders(request);
    const streamOptions = betas
      ? { headers: { 'anthropic-beta': betas.join(',') } }
      : undefined;

    let stream;
    try {
      const streamBody = {
        model,
        max_tokens: request.maxTokens ?? 16000,
        ...samplingParams,
        stop_sequences: request.stop,
        system: systemField as never,
        messages: cachedMessages.map((m) => ({
          role: m.role,
          content: m.content as never,
        })),
        ...(request.tools && request.tools.length > 0 ? { tools: request.tools as never } : {}),
        ...(thinkingOut.thinking ? { thinking: thinkingOut.thinking as never } : {}),
        ...(thinkingOut.output_config
          ? { output_config: thinkingOut.output_config as never }
          : {}),
        // Server-side compaction + per-loop task budgets. Same plumbing as
        // complete() — see buildAnthropicExtensionBody.
        ...buildAnthropicExtensionBody(request),
      };
      stream = streamOptions
        ? client.messages.stream(streamBody, streamOptions)
        : client.messages.stream(streamBody);
    } catch (err) {
      throw this.mapAnthropicError(err);
    }

    // Per-content-block tool-use accumulators. Anthropic emits one
    // content_block_start with the tool_use shape (id + name), then a
    // sequence of content_block_delta with delta.partial_json fragments,
    // then a content_block_stop. We accumulate the partial JSON to emit
    // a tool_use_end with the FULLY PARSED input on content_block_stop.
    let activeToolId: string | null = null;
    let activeToolJson = '';
    // Captured stop_reason from message_delta (Anthropic's signal for
    // tool_use vs end_turn vs max_tokens vs refusal vs context-window).
    let capturedStopReason: string | null = null;

    let streamErrored = false;
    let streamError: unknown;

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start': {
            const block = event.content_block as
              | { type: 'text' }
              | { type: 'tool_use'; id: string; name: string }
              | { type: 'thinking' };
            if (block.type === 'tool_use') {
              activeToolId = block.id;
              activeToolJson = '';
              yield { type: 'tool_use_start', id: block.id, name: block.name };
            }
            // text + thinking blocks need no start chunk — text_delta covers
            // text incrementally; thinking blocks aren't surfaced in v1
            // (could become 'thinking_delta' in a future chunk type).
            break;
          }

          case 'content_block_delta': {
            const delta = event.delta as
              | { type: 'text_delta'; text: string }
              | { type: 'input_json_delta'; partial_json: string }
              | { type: 'thinking_delta'; thinking: string }
              | { type: 'signature_delta'; signature: string };
            if (delta.type === 'text_delta' && delta.text) {
              yield { type: 'text_delta', text: delta.text };
            } else if (delta.type === 'input_json_delta' && delta.partial_json) {
              if (activeToolId !== null) {
                activeToolJson += delta.partial_json;
                yield {
                  type: 'tool_use_input_delta',
                  id: activeToolId,
                  partialJson: delta.partial_json,
                };
              }
              // If activeToolId is null we got a partial_json without a
              // matching content_block_start tool_use — drop silently rather
              // than crash; the SDK contract guarantees the start arrives
              // first, but defensive code costs nothing.
            }
            // thinking_delta + signature_delta intentionally ignored in v1.
            break;
          }

          case 'content_block_stop': {
            if (activeToolId !== null) {
              let parsedInput: Record<string, unknown> = {};
              if (activeToolJson.length > 0) {
                try {
                  parsedInput = JSON.parse(activeToolJson) as Record<string, unknown>;
                } catch {
                  // Anthropic's input_json_delta fragments concatenate into
                  // valid JSON — a parse failure here means truncated
                  // streaming (the model didn't finish). Surface as empty
                  // input + let the caller see a tool_use_end with {} so
                  // tool dispatch fails fast instead of receiving garbage.
                  parsedInput = {};
                }
              }
              yield { type: 'tool_use_end', id: activeToolId, input: parsedInput };
              activeToolId = null;
              activeToolJson = '';
            }
            break;
          }

          case 'message_delta': {
            const md = event as { delta?: { stop_reason?: string | null } };
            if (md.delta && typeof md.delta.stop_reason !== 'undefined') {
              capturedStopReason = md.delta.stop_reason ?? null;
            }
            break;
          }

          // message_start / message_stop / ping not surfaced — final
          // usage + model come from finalMessage() below.
          default:
            break;
        }
      }
    } catch (err) {
      streamErrored = true;
      streamError = err;
    }

    // Capture request-id and response headers from the stream object.
    // Available after the stream connects (request_id is set by the first
    // response from Anthropic). For mid-stream errors, the request_id may
    // still be available if the connection was established before the error.
    const capturedRequestId: string | undefined = stream.request_id ?? undefined;
    let capturedResponseHeaders: Record<string, string> | undefined;
    const rawResp = stream.response;
    if (rawResp) {
      const headers: Record<string, string> = {};
      rawResp.headers.forEach((value, key) => {
        headers[key] = value;
      });
      if (Object.keys(headers).length > 0) {
        capturedResponseHeaders = headers;
      }
    }

    // Pull the final message off the stream for usage + model. finalMessage()
    // resolves once the stream is fully drained; on a mid-stream throw we
    // skip it (the stream object may not have a valid final state) and
    // synthesize a zero-usage stop.
    let usage: TokenUsage = this.zeroUsage();
    let finalModel = model;
    let finishReason: LLMCompletionResponse['finishReason'] = 'stop';

    if (!streamErrored) {
      try {
        const final = await stream.finalMessage();
        usage = {
          promptTokens: final.usage.input_tokens,
          completionTokens: final.usage.output_tokens,
          totalTokens: final.usage.input_tokens + final.usage.output_tokens,
        };
        finalModel = final.model;
        finishReason =
          final.stop_reason === 'tool_use'
            ? 'tool_use'
            : this.mapStopReason(final.stop_reason);
      } catch {
        // finalMessage() can throw if the stream ended without a clean
        // message_stop event. Fall back to capturedStopReason from the
        // mid-stream message_delta.
        finishReason =
          capturedStopReason === 'tool_use'
            ? 'tool_use'
            : this.mapStopReason(capturedStopReason);
      }
    } else {
      finishReason = 'error';
    }

    yield {
      type: 'message_stop',
      finishReason,
      usage,
      model: finalModel,
      requestId: capturedRequestId,
      responseHeaders: capturedResponseHeaders,
    };

    if (streamErrored) {
      throw this.mapAnthropicError(streamError);
    }
  }

  /**
   * Build Anthropic-format messages array with cache breakpoints on assistant
   * turns. Strategy: walk the messages backwards, placing
   * `cache_control: { type: 'ephemeral' }` on the last content block of
   * each assistant turn until the breakpoint budget is exhausted.
   *
   * Budget calculation: `maxCacheBreakpoints - systemBreakpoint` (the system
   * breakpoint is handled separately in the caller). If caching is off,
   * returns messages unchanged (no cache_control anywhere).
   *
   * Why assistant turns: in an agent tool-loop, each tick appends one
   * assistant turn + one user turn (tool_result). The assistant turn is
   * the stable boundary that repeats identically across subsequent ticks —
   * exactly the pattern Anthropic's cache rewards. Placing breakpoints on
   * the MOST RECENT assistant turns maximises cache-hit TTL: the 5-min
   * window starts from the first request that writes the cache, so later
   * breakpoints expire later.
   */
  private buildMessagesWithCacheBreakpoints(
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>,
    systemBreakpointUsed: boolean,
  ): Array<{ role: 'user' | 'assistant'; content: unknown }> {
    if (!this.enablePromptCaching) {
      return messages.map((m) => ({ role: m.role, content: m.content }));
    }

    const budget = Math.max(0, this.maxCacheBreakpoints - (systemBreakpointUsed ? 1 : 0));
    if (budget <= 0) {
      // All breakpoints consumed by system prefix; pass messages through.
      return messages.map((m) => ({ role: m.role, content: m.content }));
    }

    let breakpointsRemaining = budget;

    // Walk backwards to find assistant turns to cache, then apply forward.
    // This two-pass approach avoids mutating during iteration and keeps the
    // forward-order output stable.
    const assistantTurnIndices: number[] = [];
    for (let i = messages.length - 1; i >= 0 && assistantTurnIndices.length < budget; i--) {
      if (messages[i].role === 'assistant') {
        assistantTurnIndices.push(i);
      }
    }
    // Reverse so we mark in forward order (most-recent assistant turns first
    // in the reversed list = last in forward order).
    assistantTurnIndices.reverse();

    const result: Array<{ role: 'user' | 'assistant'; content: unknown }> = messages.map((m, i) => {
      const shouldCache = assistantTurnIndices.includes(i) && breakpointsRemaining > 0;
      if (shouldCache && typeof m.content === 'string') {
        breakpointsRemaining--;
        // Single string content → wrap in array form to add cache_control
        // on the last (only) block.
        return {
          role: m.role,
          content: [
            { type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' as const } },
          ],
        };
      }
      if (shouldCache && Array.isArray(m.content)) {
        breakpointsRemaining--;
        // Structured content (tool_use blocks from prior assistant turns):
        // add cache_control to the LAST content block.
        const blocks = [...(m.content as Array<Record<string, unknown>>)];
        if (blocks.length > 0) {
          blocks[blocks.length - 1] = {
            ...blocks[blocks.length - 1],
            cache_control: { type: 'ephemeral' as const },
          };
        }
        return { role: m.role, content: blocks };
      }
      // No cache breakpoint for this turn.
      return { role: m.role, content: m.content };
    });

    return result;
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
    // Surface refusal + context-window-exceeded explicitly. The pre-2026-04-27
    // default-bucket treated both as 'stop' which silently blurred two
    // distinct caller-actionable signals: a refusal needs prompt re-shaping
    // (NOT a retry of the same bytes), and a context-window stop needs
    // history compaction (NOT a max_tokens bump). Bucketing both as 'stop'
    // also lost the policy-trigger signal Opus 4.7 emits more often than
    // Opus 4.6. See API skill `shared/model-migration.md` checklist items
    // for `refusal` and `model_context_window_exceeded`.
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'refusal':
        return 'refusal';
      case 'model_context_window_exceeded':
        return 'context_window_exceeded';
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
        const retryAfter = (err as { headers?: { 'retry-after'?: string } }).headers?.[
          'retry-after'
        ];
        return new LLMRateLimitError(
          'anthropic',
          retryAfter ? parseInt(retryAfter) * 1000 : undefined
        );
      }
      if (status === 400 && err.message.includes('context')) {
        return new LLMContextLengthError('anthropic', 0);
      }
      const isRetryableStatus =
        typeof status === 'number' && status >= 500 && status < 600;
      return new LLMProviderError(err.message, 'anthropic', status, isRetryableStatus);
    }
    return new LLMProviderError(String(err), 'anthropic');
  }
}
