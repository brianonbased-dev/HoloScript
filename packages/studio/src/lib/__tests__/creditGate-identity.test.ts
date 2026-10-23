/**
 * Muse Gap 3: creditGate must take identity from the server session (or a
 * route-verified API-key user) only, never from client headers, and its
 * dev/benchmark/admin bypasses must be off in production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getSession = vi.fn();
vi.mock('../api-auth', () => ({ getSession: () => getSession() }));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));
vi.mock('@holoscript/config', () => ({
  ENDPOINTS: { ABSORB_SERVICE: 'https://absorb.test' },
  getAbsorbKey: () => 'k',
  getMcpApiKey: () => '',
}));
vi.mock('../absorb-host-validator', () => ({
  ALLOWED_ABSORB_HOSTS: [],
  validateAbsorbBaseUrl: () => undefined,
}));
vi.mock('../inviteAllowlist', () => ({
  adminGithubUsernames: () => new Set(['founder']),
}));

import { checkCredits, bypassesDisabled } from '../creditGate';

// Any non-free op exercises the bypass + metered lane. Cast: every defined
// StudioOperation is free today, which is exactly why the lane is latent.
const METERED = 'studio_deep_absorb' as never;
const req = (h: Record<string, string> = {}) => new Request('https://studio.test/x', { headers: h });

const ENV_KEYS = ['NODE_ENV', 'BRITTNEY_BENCHMARK_KEY', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT'];
let saved: Record<string, string | undefined>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  (process.env as Record<string, string>).NODE_ENV = 'test';
  getSession.mockReset().mockResolvedValue(null);
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else (process.env as Record<string, string>)[k] = saved[k] as string;
  }
  vi.unstubAllGlobals();
});

describe('identity source', () => {
  it('ignores a client x-user-id header with no session (401)', async () => {
    const r = await checkCredits(req({ 'x-user-id': 'victim-uuid' }), METERED);
    expect(r.userId).toBeNull();
    expect((r.error as unknown as { status: number }).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a raw Bearer token as identity', async () => {
    const r = await checkCredits(req({ authorization: 'Bearer anything-here' }), METERED);
    expect(r.userId).toBeNull();
  });

  it('session id wins over a conflicting x-user-id header', async () => {
    getSession.mockResolvedValue({ user: { id: 'alice' } });
    const r = await checkCredits(req({ 'x-user-id': 'victim-uuid' }), METERED);
    expect(r.userId).toBe('alice');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.userId).toBe('alice');
  });

  it('free ops report the session user, never the header', async () => {
    const r = await checkCredits(req({ 'x-user-id': 'victim-uuid' }), 'studio_chat');
    expect(r.userId).toBe('free');
  });

  it('uses a route-verified API-key user id over the header', async () => {
    const r = await checkCredits(req({ 'x-user-id': 'victim-uuid' }), 'studio_chat', 'keyowner');
    expect(r.userId).toBe('keyowner');
  });
});

describe('bypasses', () => {
  it('benchmark bypass works outside production', async () => {
    process.env.BRITTNEY_BENCHMARK_KEY = 'bk';
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const r = await checkCredits(req({ 'x-benchmark-key': 'bk' }), METERED);
    expect(r.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('benchmark bypass is refused in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.BRITTNEY_BENCHMARK_KEY = 'bk';
    const r = await checkCredits(req({ 'x-benchmark-key': 'bk' }), METERED);
    expect((r.error as unknown as { status: number }).status).toBe(401);
  });

  it('admin bypass is refused in production (goes to metered check)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    getSession.mockResolvedValue({ user: { id: 'f1', githubUsername: 'Founder' } });
    await checkCredits(req(), METERED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('admin bypass still works outside production', async () => {
    getSession.mockResolvedValue({ user: { id: 'f1', githubUsername: 'Founder' } });
    const r = await checkCredits(req(), METERED);
    expect(r.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Railway production disables bypasses even if NODE_ENV says development', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    expect(bypassesDisabled()).toBe(true);
    const r = await checkCredits(req(), METERED);
    expect((r.error as unknown as { status: number }).status).toBe(401);
  });

  it('dev bypass works in plain development', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    const r = await checkCredits(req(), METERED);
    expect(r).toEqual({ userId: 'dev', error: null });
  });
});
