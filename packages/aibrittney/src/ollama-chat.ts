import type { ChatMessage } from './session.js';
import { extractTextToolCalls } from './tool-call-fallback.js';

/**
 * Non-streaming chat turn — used by the tool loop, where we need the full
 * response (and any tool_calls) before deciding the next step. Streaming is
 * still handled separately in ollama-stream.ts for the final user-facing turn.
 *
 * Two wire protocols are spoken:
 *   - Ollama's native `POST /api/chat` (the historical default), and
 *   - OpenAI-compatible `POST /v1/chat/completions`, which llama.cpp's
 *     llama-server and holo-inference-proxy serve while answering 404 for
 *     `/api/chat`. Every real HoloShell Brittney turn on the Jetson failed on
 *     that dead route from 2026-07-01 until this fallback existed, while the
 *     self-tests kept reporting ok (board task task_1790054556427_33av).
 */

/**
 * Context window for agentic Ollama turns. Default 16384 — comfortably fits the
 * observed ~8.5K-token agentic payload (system prompt + shellContext + tool
 * schemas) plus tool-result growth across iterations, while staying within
 * qwen3:4b's window and the Jetson's 8GB (KV @16K ≈ ~1.5 GiB). Override with
 * AIBRITTNEY_NUM_CTX for smaller/larger nodes.
 */
export function resolveNumCtx(): number {
  const n = Number(process.env.AIBRITTNEY_NUM_CTX);
  return Number.isFinite(n) && n > 0 ? n : 16384;
}

export type ApiStyle = 'ollama' | 'openai' | 'auto';

/** Per-host style `auto` has learned, keyed by normalized host. */
const detectedStyle = new Map<string, Exclude<ApiStyle, 'auto'>>();

/** Statuses meaning "this server does not serve that route" (as opposed to "that request was bad"). */
const ROUTE_MISSING = new Set([404, 405]);

/**
 * Which wire protocol to use for `host`. `AIBRITTNEY_API_STYLE=ollama|openai`
 * pins it. Otherwise (`auto`, the default) the answer is whatever `auto`
 * already learned for this host, or `auto` itself — meaning: try `/api/chat`
 * first and fall back to `/v1/chat/completions` when the host answers 404/405.
 */
export function resolveApiStyle(host: string): ApiStyle {
  const pinned = (process.env.AIBRITTNEY_API_STYLE ?? '').trim().toLowerCase();
  if (pinned === 'ollama' || pinned === 'openai') return pinned;
  return detectedStyle.get(normalizeHost(host)) ?? 'auto';
}

/** Forget every learned per-host style (tests, or after swapping the server behind a host). */
export function resetApiStyleCache(): void {
  detectedStyle.clear();
}

function normalizeHost(host: string): string {
  return host.replace(/\/+$/, '');
}

export interface ToolCall {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
}

export interface ChatTurn {
  ok: true;
  message: { role: 'assistant'; content: string; tool_calls?: ToolCall[] };
  evalCount?: number;
  evalDurationMs?: number;
}

export interface ChatError {
  ok: false;
  error: string;
}

export type ChatResult = ChatTurn | ChatError;

export interface OllamaChatOptions {
  host: string;
  model: string;
  messages: ChatMessage[];
  tools?: Array<{ type: 'function'; function: unknown }>;
  /**
   * Optional bearer token. Required when `host` points at Ollama Cloud
   * (`https://ollama.com/...`) or any hosted Ollama-compatible endpoint
   * that gates `/api/chat`. Local Ollama (`127.0.0.1:11434`) ignores it.
   * Sourced from `OLLAMA_API_KEY` by default — see `defaultApiKey()` in
   * `session.ts`.
   */
  apiKey?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function chatOnceFromOllama(opts: OllamaChatOptions): Promise<ChatResult> {
  const host = normalizeHost(opts.host);
  const style = resolveApiStyle(host);
  if (style === 'openai') return (await chatViaOpenAI(host, opts)).result;

  const ollama = await chatViaOllama(host, opts);
  // `auto` re-routes only when the server answered "no such route". A
  // connection failure or a real request error is returned as-is — no guessing.
  if (style === 'auto' && ollama.status !== undefined && ROUTE_MISSING.has(ollama.status)) {
    const openai = await chatViaOpenAI(host, opts);
    if (openai.status !== undefined && !ROUTE_MISSING.has(openai.status)) {
      detectedStyle.set(host, 'openai');
    }
    return openai.result;
  }
  return ollama.result;
}

/** One route's outcome. `status` is set whenever the server answered at all, ok or not. */
interface RouteAttempt {
  result: ChatResult;
  status?: number;
}

async function postJson(url: string, payload: unknown, opts: OllamaChatOptions): Promise<Response> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`;
  return fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
}

async function chatViaOllama(host: string, opts: OllamaChatOptions): Promise<RouteAttempt> {
  let res: Response;
  try {
    res = await postJson(
      `${host}/api/chat`,
      {
        model: opts.model,
        messages: opts.messages,
        stream: false,
        // Declare the context window the agentic payload needs. Newer Ollama
        // (Jetson v0.30.8) defaults n_ctx to 4096 and HARD-REJECTS (HTTP 400
        // exceed_context_size_error) when the system prompt + shellContext + tool
        // schemas exceed it (~8.5K tokens observed). Older Ollama auto-extended,
        // hiding this. Set num_ctx so the request fits on any node. Env-overridable.
        options: { num_ctx: resolveNumCtx() },
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
      },
      opts
    );
  } catch (err) {
    return {
      result: {
        ok: false,
        error: `failed to reach ollama at ${opts.host}: ${(err as Error).message}`,
      },
    };
  }
  if (!res.ok) {
    return {
      status: res.status,
      result: { ok: false, error: `ollama returned HTTP ${res.status} ${res.statusText}` },
    };
  }
  let body: {
    message?: { role?: string; content?: string; tool_calls?: ToolCall[] };
    eval_count?: number;
    eval_duration?: number;
    error?: string;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch (err) {
    return {
      status: res.status,
      result: { ok: false, error: `ollama returned non-JSON: ${(err as Error).message}` },
    };
  }
  if (body.error) {
    return { status: res.status, result: { ok: false, error: body.error } };
  }
  const msg = body.message ?? {};
  return {
    status: res.status,
    result: finishTurn(
      msg.content ?? '',
      msg.tool_calls,
      body.eval_count,
      body.eval_duration ? body.eval_duration / 1_000_000 : undefined
    ),
  };
}

/** A tool call as an OpenAI-compatible server returns it: arguments arrive as a JSON string. */
interface OpenAIToolCallWire {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: unknown };
}

async function chatViaOpenAI(host: string, opts: OllamaChatOptions): Promise<RouteAttempt> {
  let res: Response;
  try {
    res = await postJson(
      `${host}/v1/chat/completions`,
      {
        model: opts.model,
        messages: toOpenAIMessages(opts.messages),
        stream: false,
        // No `options.num_ctx` here: that knob is Ollama-only. llama-server sizes
        // its context at launch (-c) and the proxy forwards what it was given.
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
      },
      opts
    );
  } catch (err) {
    return {
      result: {
        ok: false,
        error: `failed to reach openai-compatible endpoint at ${opts.host}: ${(err as Error).message}`,
      },
    };
  }
  if (!res.ok) {
    const detail = await readErrorDetail(res);
    return {
      status: res.status,
      result: {
        ok: false,
        error: `openai-compatible endpoint returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      },
    };
  }
  let body: {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAIToolCallWire[] } }>;
    usage?: { completion_tokens?: number };
    error?: unknown;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch (err) {
    return {
      status: res.status,
      result: {
        ok: false,
        error: `openai-compatible endpoint returned non-JSON: ${(err as Error).message}`,
      },
    };
  }
  if (body.error) {
    return { status: res.status, result: { ok: false, error: errorText(body.error) } };
  }
  const msg = body.choices?.[0]?.message ?? {};
  return {
    status: res.status,
    result: finishTurn(
      msg.content ?? '',
      msg.tool_calls?.map(fromOpenAIToolCall),
      body.usage?.completion_tokens,
      undefined
    ),
  };
}

/** OpenAI-compatible message, as sent on the wire. */
export interface OpenAIChatMessage {
  role: ChatMessage['role'];
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/**
 * Ollama accepts our `ChatMessage` history verbatim; OpenAI-compatible servers
 * want tool-call arguments as a JSON string, an id per call, and `tool_call_id`
 * on the tool result. Everything else passes through as role + content.
 */
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIChatMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls.map((call, index) => ({
          id: call.id ?? `call_${index}`,
          type: 'function' as const,
          function: {
            name: call.function.name,
            arguments:
              typeof call.function.arguments === 'string'
                ? call.function.arguments
                : JSON.stringify(call.function.arguments),
          },
        })),
      };
    }
    if (msg.role === 'tool') {
      return { role: msg.role, content: msg.content, tool_call_id: msg.tool_call_id ?? msg.name };
    }
    return { role: msg.role, content: msg.content };
  });
}

function fromOpenAIToolCall(call: OpenAIToolCallWire): ToolCall {
  return {
    id: typeof call.id === 'string' ? call.id : undefined,
    function: {
      name: call.function?.name ?? '',
      arguments: parseToolArguments(call.function?.arguments),
    },
  };
}

/** A JSON-object argument string becomes the object; anything else is handed through as-is. */
function parseToolArguments(raw: unknown): Record<string, unknown> | string {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Not JSON — keep the string; agent.ts normalizeArgs() copes with it.
    }
    return raw;
  }
  return isRecord(raw) ? raw : {};
}

/** Best-effort `{ error: { message } }` / `{ error: "..." }` from a non-OK body. */
async function readErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return body.error === undefined || body.error === null ? undefined : errorText(body.error);
  } catch {
    return undefined;
  }
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  const message = isRecord(error) ? error.message : undefined;
  return typeof message === 'string' && message ? message : JSON.stringify(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finishTurn(
  content: string,
  nativeToolCalls: ToolCall[] | undefined,
  evalCount: number | undefined,
  evalDurationMs: number | undefined
): ChatTurn {
  // Native structured tool_calls win. When a weaker model emits the call as
  // text in `content` instead (e.g. Gemma E-series on some Ollama backends),
  // recover it so the tool loop stays model-agnostic. See tool-call-fallback.ts.
  let toolCalls = nativeToolCalls;
  if ((!toolCalls || toolCalls.length === 0) && content) {
    const recovered = extractTextToolCalls(content);
    if (recovered.length > 0) toolCalls = recovered;
  }
  return {
    ok: true,
    message: {
      role: 'assistant',
      content,
      tool_calls: toolCalls,
    },
    evalCount,
    evalDurationMs,
  };
}
