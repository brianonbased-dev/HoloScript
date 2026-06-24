/**
 * Vast.ai Serverless Adapter — the sovereign-serving DURABLE foundation.
 *
 * Unlike the raw-instance fleet path (`OpenAICompatibleAdapter` against a box IP
 * resolved from the orchestrator `/serve/resolve` registry), this speaks Vast's
 * SERVERLESS PyWorker endpoint, where Vast OWNS the autoscaling and a cold-worker
 * pool — resume in seconds, $0 idle, no fragile local autoscaler tick and no raw
 * Docker-cold-pull stall (the failure modes that bricked the raw path, 2026-06-14).
 *
 * Vast serverless is NOT plain-OpenAI-at-a-stable-URL. The transport mirrors the
 * proven `scripts/vast-serverless-client.mjs` `sovereignServerlessChat`
 * (validated against the vastai SDK serverless client):
 *   1. POST https://run.vast.ai/route/  {endpoint, api_key, cost, request_idx,
 *      replay_timeout} — poll until the body carries a worker `url` (the cold pool
 *      wakes when cost >= the start threshold; SDK default 100). A not-ready body
 *      carries a `status` worker-count breakdown instead.
 *   2. POST <worker_url>/v1/chat/completions
 *      {auth_data: <ENTIRE route body>, session_id: null, payload: <openai req>}
 *      — the PyWorker validates the signature in auth_data, then proxies the
 *      payload to Ollama's OpenAI-compatible /v1 (streaming passthrough).
 *
 * The SSE parse (text + fragmented `tool_calls.function.arguments` accumulation →
 * `LLMStreamChunk`) is identical to `OpenAICompatibleAdapter`; only the request
 * envelope and the dynamically-resolved worker URL differ. Sovereign by
 * construction: our Qwen on our rented GPU, OpenAI PROTOCOL only.
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  Capabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  LLMProviderConfig,
  TokenUsage,
  ToolSpec,
} from '../types';
import {
  LLMProviderError,
  LLMAuthenticationError,
  LLMRateLimitError,
  filterGenericTools,
  messageContentAsString,
} from '../types';
import { FLEET_DEFAULT_MODEL } from '../model-policy';

const ROUTE_URL = 'https://run.vast.ai/route/';

export type VastServerlessAdapterConfig = Omit<LLMProviderConfig, 'apiKey'> & {
  /** The VAST_API_KEY — bearer for BOTH the route call and the worker call. */
  apiKey: string;
  /** Vast serverless endpoint name (e.g. 'holoscript-qwen-coder'). */
  endpointName: string;
  /** Ollama model tag the endpoint serves. */
  model?: string;
  /** Route load signal; >= the start threshold wakes the cold pool. SDK default 100 (cost=1 never wakes it). */
  cost?: number;
  /** Cap on cold-resume polling (seconds). */
  maxWaitS?: number;
  /** Delay between route polls while the cold pool wakes (ms; default 10000). */
  pollIntervalMs?: number;
};

export const VAST_SERVERLESS_CAPABILITIES: Capabilities = {
  contextWindow: 0, // per-endpoint/per-model
  maxOutput: 0,
  streaming: true,
  tools: true, // wire-level; the backing Qwen model honors native tool calls
  vision: false,
  bearerTokenAccess: true,
};

// OpenAI chat-completions SSE delta shapes (narrow, local — same as openai-compatible).
interface OpenAIDeltaToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}
interface OpenAIStreamDelta {
  content?: string;
  tool_calls?: OpenAIDeltaToolCall[];
}
interface OpenAIStreamChunk {
  choices?: Array<{ delta?: OpenAIStreamDelta; finish_reason?: string | null }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface RouteResponse {
  url?: string;
  request_idx?: number;
  status?: unknown;
}

function headerObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export class VastServerlessAdapter extends BaseLLMAdapter {
  readonly name = 'fleet' as const;
  readonly models: readonly string[];
  readonly defaultHoloScriptModel: string;
  readonly capabilities: Capabilities = VAST_SERVERLESS_CAPABILITIES;

  private readonly vastKey: string;
  private readonly endpointName: string;
  private readonly cost: number;
  private readonly maxWaitS: number;
  private readonly pollIntervalMs: number;

  constructor(config: VastServerlessAdapterConfig) {
    super({ ...config, apiKey: config.apiKey });
    this.vastKey = config.apiKey;
    this.endpointName = config.endpointName;
    this.defaultHoloScriptModel = config.model ?? FLEET_DEFAULT_MODEL;
    this.models = [this.defaultHoloScriptModel];
    this.cost = config.cost ?? (Number(process.env['VAST_SERVERLESS_COST']) || 100);
    this.maxWaitS = config.maxWaitS ?? (Number(process.env['VAST_SERVERLESS_MAX_WAIT_S']) || 540);
    this.pollIntervalMs = config.pollIntervalMs ?? 10_000;
  }

  protected getDefaultModel(): string {
    return this.defaultHoloScriptModel;
  }

  private mapFinishReason(
    reason: string | null | undefined,
    hadToolCalls: boolean
  ): LLMCompletionResponse['finishReason'] {
    if (reason === 'tool_calls' || hadToolCalls) return 'tool_use';
    switch (reason) {
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'stop':
      default:
        return 'stop';
    }
  }

  /**
   * Wake (or replay against) the serverless endpoint: POST run.vast.ai/route/
   * until a worker `url` is READY, returning that url + the FULL route body
   * (the signature the PyWorker validates as `auth_data`).
   */
  private async resolveWorker(
    options: { maxWaitS?: number; pollIntervalMs?: number } = {}
  ): Promise<{ url: string; authData: unknown; requestIdx?: number }> {
    const maxWaitS = options.maxWaitS ?? this.maxWaitS;
    const pollIntervalMs = options.pollIntervalMs ?? this.pollIntervalMs;
    const t0 = Date.now();
    let requestIdx = 0;
    for (;;) {
      let resp: Response;
      try {
        resp = await fetch(ROUTE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.vastKey}` },
          body: JSON.stringify({
            endpoint: this.endpointName,
            api_key: this.vastKey,
            cost: this.cost,
            request_idx: requestIdx,
            replay_timeout: 60.0,
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new LLMProviderError(
          `vast serverless route unreachable: ${msg}`,
          this.name,
          undefined,
          true
        );
      }
      if (resp.status === 401 || resp.status === 403) throw new LLMAuthenticationError(this.name);
      if (resp.status === 429) throw new LLMRateLimitError(this.name);
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new LLMProviderError(
          `vast serverless route HTTP ${resp.status}: ${text.slice(0, 200)}`,
          this.name,
          resp.status,
          resp.status >= 500
        );
      }
      const route = (await resp.json()) as RouteResponse;
      requestIdx = route.request_idx ?? requestIdx;
      if (route.url)
        return { url: route.url.replace(/\/$/, ''), authData: route, requestIdx: route.request_idx };
      if (maxWaitS <= 0 || (Date.now() - t0) / 1000 >= maxWaitS) {
        const latestStatus =
          route.status === undefined ? 'no status' : JSON.stringify(route.status).slice(0, 200);
        throw new LLMProviderError(
          `vast serverless: no worker became READY within ${maxWaitS}s; latest route status: ${latestStatus}`,
          this.name,
          undefined,
          true
        );
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  private mapToolToOpenAI(tool: ToolSpec): unknown {
    return {
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
    };
  }

  /** The OpenAI-style chat body that becomes the envelope `payload`. */
  private buildPayload(request: LLMCompletionRequest, model: string, stream: boolean): unknown {
    const tools = filterGenericTools(request.tools);
    return {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: messageContentAsString(m.content),
      })),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
      top_p: request.topP ?? 1,
      stop: request.stop,
      stream,
      ...(tools.length > 0 ? { tools: tools.map((t) => this.mapToolToOpenAI(t)) } : {}),
    };
  }

  /** POST the resolved worker with the {auth_data, session_id, payload} envelope. */
  private async postWorker(payload: unknown): Promise<{ response: Response; workerUrl: string; requestIdx?: number }> {
    const { url, authData, requestIdx } = await this.resolveWorker();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.vastKey}` },
        body: JSON.stringify({ auth_data: authData, session_id: null, payload }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.status === 401 || response.status === 403)
        throw new LLMAuthenticationError(this.name);
      if (response.status === 429) throw new LLMRateLimitError(this.name);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new LLMProviderError(
          `vast serverless completion HTTP ${response.status}: ${text.slice(0, 200)}`,
          this.name,
          response.status,
          response.status >= 500
        );
      }
      return { response, workerUrl: url, requestIdx };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof LLMProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new LLMProviderError(
        `vast serverless worker unreachable: ${msg}`,
        this.name,
        undefined,
        true
      );
    }
  }

  private buildRequestId(response: Response, requestIdx?: number): string | undefined {
    return (
      response.headers.get('x-request-id') ??
      response.headers.get('request-id') ??
      response.headers.get('x-vast-request-id') ??
      (requestIdx !== undefined ? `vast:${this.endpointName}:${requestIdx}` : undefined)
    );
  }

  private buildResponseHeaders(
    response: Response,
    workerUrl: string,
    requestIdx?: number
  ): Record<string, string> {
    return {
      ...headerObject(response.headers),
      'x-holoscript-fleet-endpoint': this.endpointName,
      'x-holoscript-fleet-worker-url': workerUrl,
      ...(requestIdx !== undefined ? { 'x-holoscript-fleet-request-idx': String(requestIdx) } : {}),
    };
  }

  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    return await this.withRetry(async () => {
      const { response, workerUrl, requestIdx } = await this.postWorker(
        this.buildPayload(request, model, false)
      );
      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string; tool_calls?: OpenAIDeltaToolCall[] };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
      };
      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? '';
      const toolUses = (choice?.message?.tool_calls ?? [])
        .filter((tc) => tc.function?.name)
        .map((tc, i) => {
          let input: Record<string, unknown> = {};
          try {
            input = tc.function?.arguments
              ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
              : {};
          } catch {
            input = {};
          }
          return {
            type: 'tool_use' as const,
            id: tc.id ?? `call_${i}`,
            name: tc.function!.name!,
            input,
          };
        });
      return {
        content,
        model: data.model ?? model,
        provider: this.name,
        finishReason: this.mapFinishReason(choice?.finish_reason, toolUses.length > 0),
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        requestId: this.buildRequestId(response, requestIdx),
        responseHeaders: this.buildResponseHeaders(response, workerUrl, requestIdx),
        ...(toolUses.length > 0
          ? { toolUses, assistantBlocks: [{ type: 'text' as const, text: content }, ...toolUses] }
          : {}),
        raw: data,
      };
    });
  }

  async *streamCompletion(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): AsyncIterable<LLMStreamChunk> {
    const { response, workerUrl, requestIdx } = await this.postWorker(
      this.buildPayload(request, model, true)
    );
    const requestId = this.buildRequestId(response, requestIdx);
    const responseHeaders = this.buildResponseHeaders(response, workerUrl, requestIdx);

    if (!response.body) {
      yield { type: 'message_stop', finishReason: 'stop', usage: this.zeroUsage(), model, requestId, responseHeaders };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolCallIndex = 0;
    let hadToolCalls = false;
    let finishReason: LLMCompletionResponse['finishReason'] = 'stop';
    let usage: TokenUsage = this.zeroUsage();
    let finalModel = model;
    let streamErrored = false;
    let pendingToolCall: { id: string; name: string; argsBuf: string } | null = null;

    const flushPending = function* (
      pending: { id: string; name: string; argsBuf: string } | null
    ): Generator<LLMStreamChunk> {
      if (!pending) return;
      let input: Record<string, unknown> = {};
      try {
        input = pending.argsBuf ? (JSON.parse(pending.argsBuf) as Record<string, unknown>) : {};
      } catch {
        input = {};
      }
      yield { type: 'tool_use_end', id: pending.id, input };
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.replace(/^data: /, '').trim();
          if (!trimmed || trimmed === '[DONE]') {
            if (trimmed === '[DONE]') {
              yield* flushPending(pendingToolCall);
              pendingToolCall = null;
            }
            continue;
          }
          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(trimmed) as OpenAIStreamChunk;
          } catch {
            continue;
          }
          const choice = chunk.choices?.[0];
          const delta = choice?.delta;
          if (chunk.model) finalModel = chunk.model;
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens:
                chunk.usage.total_tokens ??
                (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0),
            };
          }
          if (choice?.finish_reason)
            finishReason = this.mapFinishReason(choice.finish_reason, hadToolCalls);
          if (!delta) continue;
          if (delta.content) yield { type: 'text_delta', text: delta.content };
          if (delta.tool_calls?.length) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                if (pendingToolCall) yield* flushPending(pendingToolCall);
                hadToolCalls = true;
                const id = tc.id ?? `call_${toolCallIndex++}`;
                pendingToolCall = {
                  id,
                  name: tc.function.name,
                  argsBuf: tc.function.arguments ?? '',
                };
                yield { type: 'tool_use_start', id, name: tc.function.name };
                if (tc.function.arguments) {
                  yield { type: 'tool_use_input_delta', id, partialJson: tc.function.arguments };
                }
              } else if (pendingToolCall && tc.function?.arguments) {
                pendingToolCall.argsBuf += tc.function.arguments;
                yield {
                  type: 'tool_use_input_delta',
                  id: pendingToolCall.id,
                  partialJson: tc.function.arguments,
                };
              }
            }
          }
        }
      }
    } catch {
      streamErrored = true;
    }

    if (pendingToolCall) {
      yield* flushPending(pendingToolCall);
      pendingToolCall = null;
    }
    if (streamErrored) finishReason = 'error';
    else if (hadToolCalls && finishReason === 'stop') finishReason = 'tool_use';

    yield { type: 'message_stop', finishReason, usage, model: finalModel, requestId, responseHeaders };
    if (streamErrored) {
      throw new LLMProviderError('Stream error during vast serverless completion', this.name);
    }
  }

  /** Health: a route call that wakes/replays the endpoint and confirms a worker resolves. */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.resolveWorker();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `vast serverless endpoint unreachable: ${message}`,
      };
    }
  }
}
