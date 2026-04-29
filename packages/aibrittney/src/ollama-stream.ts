import type { ChatMessage } from './session.js';

export interface StreamChunk {
  type: 'token' | 'done' | 'error';
  content: string;
  totalTokens?: number;
  evalDurationMs?: number;
}

export async function* streamChatFromOllama(
  host: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk, void, unknown> {
  const url = `${host.replace(/\/$/, '')}/api/chat`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
  } catch (err) {
    yield {
      type: 'error',
      content: `failed to reach ollama at ${host}: ${(err as Error).message}`,
    };
    return;
  }

  if (!response.ok || !response.body) {
    yield {
      type: 'error',
      content: `ollama returned HTTP ${response.status} ${response.statusText}`,
    };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let parsed: {
        message?: { content?: string };
        done?: boolean;
        eval_count?: number;
        eval_duration?: number;
        error?: string;
      };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.error) {
        yield { type: 'error', content: parsed.error };
        return;
      }
      const tok = parsed.message?.content ?? '';
      if (tok) yield { type: 'token', content: tok };
      if (parsed.done) {
        yield {
          type: 'done',
          content: '',
          totalTokens: parsed.eval_count,
          evalDurationMs: parsed.eval_duration ? parsed.eval_duration / 1_000_000 : undefined,
        };
        return;
      }
    }
  }
}
