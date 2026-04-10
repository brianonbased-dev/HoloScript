import { describe, expect, it } from 'vitest';
import { createSSEHeartbeatStream, resolveReconnectCursor } from './sseStreamProxy';

describe('resolveReconnectCursor', () => {
  it('prefers Last-Event-ID and sanitizes invalid values', () => {
    const request = {
      headers: {
        get(name: string) {
          if (name === 'last-event-id') return 'cursor-123';
          if (name === 'x-reconnect-cursor') return 'fallback-cursor';
          return null;
        },
      },
      nextUrl: {
        searchParams: new URLSearchParams('cursor=query-cursor'),
      },
    };

    expect(resolveReconnectCursor(request)).toBe('cursor-123');
  });

  it('drops suspicious cursor values and falls back to query cursor', () => {
    const request = {
      headers: {
        get(name: string) {
          if (name === 'last-event-id') return '../../bad';
          if (name === 'x-reconnect-cursor') return '';
          return null;
        },
      },
      nextUrl: {
        searchParams: new URLSearchParams('cursor=good_cursor-42'),
      },
    };

    expect(resolveReconnectCursor(request)).toBe('good_cursor-42');
  });
});

describe('createSSEHeartbeatStream', () => {
  it('emits cursor and retry directives before streaming payload', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"ok":true}\n\n'));
        controller.close();
      },
    });

    const stream = createSSEHeartbeatStream(source, {
      cursor: 'cursor-123',
      heartbeatIntervalMs: 10_000,
      retryMs: 4_000,
    });

    const text = await new Response(stream).text();

    expect(text).toContain('id: cursor-123');
    expect(text).toContain('event: cursor');
    expect(text).toContain('retry: 4000');
    expect(text).toContain('data: {"ok":true}');
  });
});
