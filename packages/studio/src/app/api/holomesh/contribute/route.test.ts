/**
 * POST /api/holomesh/contribute without a caller key must not publish as Studio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/holomesh/contribute', () => {
  it('without a caller key: 404 no_holomesh_agent and nothing upstream', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(new NextRequest('http://localhost/api/holomesh/contribute', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('no_holomesh_agent');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
