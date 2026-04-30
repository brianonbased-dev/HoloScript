import type { ChatMessage } from './session.js';

/**
 * Non-streaming /api/chat — used by the tool loop, where we need the full
 * response (and any tool_calls) before deciding the next step. Streaming is
 * still handled separately in ollama-stream.ts for the final user-facing turn.
 */

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
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function chatOnceFromOllama(opts: OllamaChatOptions): Promise<ChatResult> {
  const url = `${opts.host.replace(/\/$/, '')}/api/chat`;
  const fetchFn = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: false,
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
      }),
      signal: opts.signal,
    });
  } catch (err) {
    return { ok: false, error: `failed to reach ollama at ${opts.host}: ${(err as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, error: `ollama returned HTTP ${res.status} ${res.statusText}` };
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
    return { ok: false, error: `ollama returned non-JSON: ${(err as Error).message}` };
  }
  if (body.error) {
    return { ok: false, error: body.error };
  }
  const msg = body.message ?? {};
  return {
    ok: true,
    message: {
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: msg.tool_calls,
    },
    evalCount: body.eval_count,
    evalDurationMs: body.eval_duration ? body.eval_duration / 1_000_000 : undefined,
  };
}
