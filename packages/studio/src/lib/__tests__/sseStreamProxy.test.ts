import { describe, expect, it } from 'vitest';
import { createSSEHeartbeatStream, resolveReconnectCursor } from '../sseStreamProxy';

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

describe('sseStreamProxy', () => {
  it('resolves reconnect cursor from header or query param', () => {
    const headerCursor = resolveReconnectCursor({
      headers: { get: (name: string) => (name === 'last-event-id' ? 'cursor-1' : null) },
      nextUrl: { searchParams: new URLSearchParams() },
    });
    expect(headerCursor).toBe('cursor-1');

    const queryCursor = resolveReconnectCursor({
      headers: { get: () => null },
      nextUrl: { searchParams: new URLSearchParams('cursor=query-2') },
    });
    expect(queryCursor).toBe('query-2');
  });

  it('prepends cursor event and heartbeats to upstream SSE stream', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('data: {"type":"progress"}\n\n'));
          controller.close();
        }, 10);
      },
    });

    const wrapped = createSSEHeartbeatStream(source, {
      heartbeatIntervalMs: 5,
      cursor: 'cursor-xyz',
    });

    const text = await readText(wrapped);
    expect(text).toContain('event: cursor');
    expect(text).toContain('cursor-xyz');
    expect(text).toContain(': heartbeat open');
    expect(text).toContain('data: {"type":"progress"}');
  });
});
