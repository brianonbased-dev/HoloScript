/**
 * POST /api/brittney/warm — wakes Brittney (records demand with the orchestrator) for a
 * signed-in person, never for an anonymous caller, and at most once per user per two minutes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAuthMock } = vi.hoisted(() => ({ requireAuthMock: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

import { POST } from './route';
import { resetWakeCooldownsForTests } from '@/lib/brittney/wake';

const ORCH = 'https://orch.test';

function signedInAs(id: string) {
  requireAuthMock.mockResolvedValue({ user: { id } });
}

function post() {
  return POST(new Request('http://localhost/api/brittney/warm', { method: 'POST' }));
}

function resolveCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/serve/resolve'));
}

describe('POST /api/brittney/warm', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetWakeCooldownsForTests();
    requireAuthMock.mockReset();
    vi.stubEnv('BRITTNEY_PROVIDER', '');
    vi.stubEnv('FLEET_SERVERLESS_ENDPOINT', '');
    vi.stubEnv('VAST_QWEN_ENDPOINT_NAME', '');
    vi.stubEnv('BRITTNEY_FLEET_MODEL', 'qwen3:14b');
    vi.stubEnv('BRITTNEY_FLEET_ORCH_URL', ORCH);
    vi.stubEnv('BRITTNEY_WAKE_ETA_S', '');
    fetchMock = vi.fn(async () => Response.json({ status: 'cold' }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('records demand with the orchestrator for a signed-in person, without running a chat', async () => {
    signedInAs('user-1');
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('waking');
    expect(body.etaSeconds).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${ORCH}/serve/resolve?model=qwen3%3A14b`);
  });

  it('says warm when a box is already up', async () => {
    signedInAs('user-1');
    fetchMock.mockImplementation(async () =>
      Response.json({ status: 'warm', url: 'http://box.test:8000' })
    );
    const body = await (await post()).json();
    expect(body.status).toBe('warm');
    // The box address stays on the server.
    expect(JSON.stringify(body)).not.toContain('box.test');
  });

  it('refuses without a session and never reaches the orchestrator', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const res = await post();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reaches the orchestrator at most once per user per two minutes', async () => {
    signedInAs('user-1');
    expect((await post()).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      const res = await post();
      expect(res.status).toBe(429);
      expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    }
    expect(resolveCalls(fetchMock)).toHaveLength(1);

    // Another person is not held back by the first one's refreshes.
    signedInAs('user-2');
    expect((await post()).status).toBe(200);
    expect(resolveCalls(fetchMock)).toHaveLength(2);
  });

  it('lets the same person ask again once the two minutes are up', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      signedInAs('user-1');
      expect((await post()).status).toBe(200);
      vi.setSystemTime(Date.now() + 121_000);
      expect((await post()).status).toBe(200);
      expect(resolveCalls(fetchMock)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call the orchestrator when this Studio does not use the fleet', async () => {
    vi.stubEnv('BRITTNEY_FLEET_MODEL', '');
    vi.stubEnv('FLEET_INFERENCE_KEY', '');
    signedInAs('user-1');
    const body = await (await post()).json();
    expect(body.status).toBe('not_fleet');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
