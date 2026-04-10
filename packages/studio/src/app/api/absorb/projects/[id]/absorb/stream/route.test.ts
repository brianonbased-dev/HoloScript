import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  forwardAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
}));

vi.mock('@/lib/absorbStreamContract', () => ({
  ABSORB_PROGRESS_CONTRACT_VERSION: 'v-test',
  toAbsorbProgressContractEvent: vi.fn((event) => event),
}));

vi.mock('@/lib/sseStreamProxy', () => ({
  resolveReconnectCursor: vi.fn(() => 'cursor-123'),
  createSSEHeartbeatStream: vi.fn((body) => body),
}));

import { GET, POST } from './route';

describe('/api/absorb/projects/[id]/absorb/stream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET proxies stream and includes project id payload', async () => {
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

    const req = new NextRequest(
      'http://localhost/api/absorb/projects/project-1/absorb/stream?depth=deep&tier=high'
    );

    const res = await GET(req, { params: Promise.resolve({ id: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-holoscript-stream-contract')).toBe('v-test');

    const called = fetchMock.mock.calls[0];
    expect(String(called?.[0])).toContain('/api/absorb/stream');

    const init = called?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('"projectId":"project-1"');
    expect(String(init.body)).toContain('"depth":"deep"');
    expect(String(init.body)).toContain('"tier":"high"');
    expect((init.headers as Record<string, string>)['Last-Event-ID']).toBe('cursor-123');
  });

  it('POST uses request body and returns upstream error payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('rate limited', {
        status: 429,
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/absorb/projects/project-2/absorb/stream', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'project-2', depth: 'shallow', tier: 'medium' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'project-2' }) });
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toContain('Absorb service failed [429]');
    expect(body.error).toContain('rate limited');
  });

  it('returns SSE error event when upstream fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const req = new NextRequest('http://localhost/api/absorb/projects/project-3/absorb/stream');
    const res = await GET(req, { params: Promise.resolve({ id: 'project-3' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('"status":"failed"');
    expect(text).toContain('"jobId":"project-3"');
  });

  it('returns deterministic JSON error when upstream stream body is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    );

    const req = new NextRequest('http://localhost/api/absorb/projects/project-4/absorb/stream');
    const res = await GET(req, { params: Promise.resolve({ id: 'project-4' }) });

    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = await res.json();
    expect(body.error).toContain('empty stream body');
  });
});
