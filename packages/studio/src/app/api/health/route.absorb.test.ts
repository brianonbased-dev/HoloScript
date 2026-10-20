/**
 * /api/health reports degraded when absorb is down or misconfigured.
 * Twin: on main the route never looks at absorb, so these fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const absorbState = { value: { status: 'ok', degraded: false } as any, calls: 0 };

vi.mock('../../../db/client', () => ({
  getDb: () => ({
    execute: async () => ({ rows: [{ active_teams: 1, total_agents: 2, tasks_completed_today: 3 }] }),
  }),
}));
vi.mock('../../../db/schema', () => ({ holomeshBoardTasks: {} }));
vi.mock('@/lib/secrets/serviceSecretStore', () => ({ resolveStudioServiceSecret: async () => '' }));
vi.mock('../_lib/ownedLocalFallback', () => ({ resolveRouteLocalModel: () => null }));
vi.mock('@/lib/absorb/absorbHealth', () => ({
  getAbsorbHealthCached: vi.fn(async () => {
    absorbState.calls++;
    return absorbState.value;
  }),
}));

async function body() {
  const { GET } = await import('./route');
  const res = await GET();
  return { status: res.status, json: await res.json() };
}

describe('/api/health absorb check', () => {
  beforeEach(() => {
    absorbState.calls = 0;
  });

  it('healthy when the board and absorb are both fine', async () => {
    absorbState.value = { status: 'ok', degraded: false, origin: 'https://absorb.example', httpStatus: 200 };
    const { status, json } = await body();
    expect(status).toBe(200);
    expect(json.degraded).toBe(false);
    expect(json.absorb).toMatchObject({ status: 'ok' });
    expect(absorbState.calls).toBe(1);
  });

  it.each(['unreachable', 'misconfigured', 'unhealthy'])('degraded when absorb is %s', async (s) => {
    absorbState.value = { status: s, degraded: true };
    const { json } = await body();
    expect(json.degraded).toBe(true);
    expect(json.absorb.status).toBe(s);
  });

  it('never echoes an API key', async () => {
    absorbState.value = { status: 'ok', degraded: false };
    const { json } = await body();
    expect(JSON.stringify(json)).not.toMatch(/Bearer|api[_-]?key"\s*:\s*"[^"]/i);
  });
});
