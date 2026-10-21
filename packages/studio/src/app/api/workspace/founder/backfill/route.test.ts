/**
 * founder/backfill: founder-only, server-only key, fail closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: vi.fn(), isFounder: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/workspace/workspaceIdentity', () => ({ isFounderWorkspaceIdentity: h.isFounder }));
vi.mock('@/lib/absorb/projectState', () => ({ findDurableAbsorbProject: () => null }));
vi.mock('@/lib/services/absorb-client', () => ({ ABSORB_API_KEY: '', ABSORB_BASE: 'https://absorb.test' }));
vi.mock('@/lib/workspace/founderWorkspaceBackfill', () => ({
  buildFounderWorkspaceBackfill: async () => ({
    knowledgeSyncPayload: { entries: [{ id: 'e1' }] },
    linkedRepos: [],
  }),
  persistFounderWorkspaceBackfill: () => null,
}));

import { POST } from './route';

const post = () =>
  new Request('https://studio.test/api/workspace/founder/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persist: false, registerAbsorb: false }),
  });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(
    async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  );
  vi.stubGlobal('fetch', fetchSpy);
  h.session.mockResolvedValue({ user: { id: 'founder-1' } });
  h.isFounder.mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  h.session.mockReset();
  h.isFounder.mockReset();
});

describe('founder/backfill: founder-only, no public key fallback', () => {
  it('anonymous caller gets 401 and nothing goes upstream', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'srv-key-sentinel');
    h.session.mockResolvedValue(null);
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signed-in non-founder gets 403 and nothing goes upstream', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'srv-key-sentinel');
    h.session.mockResolvedValue({ user: { id: 'someone-else' } });
    h.isFounder.mockReturnValue(false);
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never uses NEXT_PUBLIC_MCP_API_KEY; with no server key the sync fails closed and nothing goes upstream', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MCP_API_KEY', 'browser-bundle-key');
    const res = await POST(post());
    const body = await res.json();
    expect(body.knowledgeSync.status).toBe('failed');
    expect(JSON.stringify(body.knowledgeSync.errors)).not.toContain('NEXT_PUBLIC');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('founder with the server key syncs using only that key', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'srv-key-sentinel');
    vi.stubEnv('NEXT_PUBLIC_MCP_API_KEY', 'browser-bundle-key');
    await POST(post());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-mcp-api-key']).toBe('srv-key-sentinel');
  });
});
