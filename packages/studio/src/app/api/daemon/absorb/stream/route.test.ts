import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  forwardAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-user' })),
}));

vi.mock('@/lib/absorbStreamContract', () => ({
  ABSORB_PROGRESS_CONTRACT_VERSION: 'v-test',
  toAbsorbProgressContractEvent: vi.fn((event) => event),
}));

vi.mock('@/lib/sseStreamProxy', () => ({
  resolveReconnectCursor: vi.fn(() => 'cursor-123'),
  createSSEHeartbeatStream: vi.fn((body) => body),
}));

import { POST } from './route';

describe('/api/daemon/absorb/stream route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('proxies successful SSE response and forwards cursor/auth headers', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"status":"running"}\n\n'));
        controller.close();
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(source, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/daemon/absorb/stream', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-holoscript-stream-contract')).toBe('v-test');
    expect(res.headers.get('x-reconnect-cursor')).toBe('cursor-123');
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const call = fetchMock.mock.calls[0];
    expect(String(call?.[0])).toContain('/api/absorb/stream');

    const init = call?.[1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers['Last-Event-ID']).toBe('cursor-123');
    expect(headers['X-Reconnect-Cursor']).toBe('cursor-123');
    expect(headers.Authorization).toBe('Bearer test-user');
  });

  it('returns upstream error payload when absorb service response is non-OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('rate limited', {
          status: 429,
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    );

    const req = new NextRequest('http://localhost/api/daemon/absorb/stream', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Absorb service failed [429]');
    expect(body.error).toContain('rate limited');
  });

  it('returns 500 JSON when upstream response body is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    );

    const req = new NextRequest('http://localhost/api/daemon/absorb/stream', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body.error).toContain('empty body');
  });

  it('returns SSE error event when upstream fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const req = new NextRequest('http://localhost/api/daemon/absorb/stream', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-holoscript-stream-contract')).toBe('v-test');

    const text = await res.text();
    expect(text).toContain('"status":"failed"');
    expect(text).toContain('"jobId":"proxy"');
  });
});
