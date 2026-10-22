/**
 * #621 (Mapping N1): /api/absorb/projects/[id]/absorb/stream bills the
 * signed-in session owner and refuses any other credential, so the client must
 * not send the connector token there. Other absorb routes still get it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { connections: { github: { credentials: { token: 'gho_connector' } } } } as Record<string, unknown>,
}));

vi.mock('@/lib/stores/connectorStore', () => ({
  useConnectorStore: { getState: () => state },
}));

import { absorbFetch, isSessionOnlyRoute } from './fetchWithAuth';

function sentHeaders(fetchMock: ReturnType<typeof vi.fn>): Headers {
  return new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
}

describe('absorbFetch connector header: stream is session-only (#621)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('omits Authorization on /api/absorb/projects/[id]/absorb/stream', async () => {
    await absorbFetch('/api/absorb/projects/ws-11111111-2222-3333-4444-555555555555/absorb/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const headers = sentHeaders(fetchMock);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('omits it on the trailing-slash stream path too (/absorb/stream/)', async () => {
    await absorbFetch('/api/absorb/projects/p1/absorb/stream/', { headers: { Authorization: 'Bearer other' } });
    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
  });

  it('omits it even when the caller passes one explicitly', async () => {
    await absorbFetch('/api/absorb/projects/p1/absorb/stream', { headers: { Authorization: 'Bearer other' } });
    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
  });

  it('still sends it on other absorb routes', async () => {
    for (const url of ['/api/absorb/credits', '/api/absorb/projects', '/api/absorb/projects/p1/knowledge']) {
      fetchMock.mockClear();
      await absorbFetch(url);
      expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer gho_connector');
    }
  });

  it('matches the stream route by path, with or without origin or query', () => {
    expect(isSessionOnlyRoute('/api/absorb/projects/p1/absorb/stream')).toBe(true);
    expect(isSessionOnlyRoute('https://holoscript.studio/api/absorb/projects/p1/absorb/stream?cursor=3')).toBe(true);
    expect(isSessionOnlyRoute('/api/absorb/projects/p1/absorb/stream/')).toBe(true);
    expect(isSessionOnlyRoute('/api/absorb/projects/p1/absorb/stream/?cursor=3')).toBe(true);
    expect(isSessionOnlyRoute('/api/absorb/projects/p1/absorb/stream/extra')).toBe(false);
    expect(isSessionOnlyRoute('/api/absorb/projects/p1/absorb/stream//')).toBe(false);
    expect(isSessionOnlyRoute('/api/absorb/projects')).toBe(false);
  });
});