import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// #658's auth rules, on #617's owner-checked importId flow (there is no MCP
// path any more: absorb_run_absorb carries no importId, so it would skip the claim).
const m = vi.hoisted(() => ({
  session: { user: { id: 'user-a' } } as { user: { id: string } } | null,
  ghToken: 'gh-session-token' as string | null,
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => m.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: vi.fn(async () => m.ghToken) }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { POST } from './route';
import { upsertDurableAbsorbProject } from '@/lib/absorb/projectState';

const WS = 'ws-11111111-2222-4333-8444-666666666666';

function post(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify({ workspaceId: WS, importId: 'imp-0001-auth' }),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('/api/daemon/absorb auth (#658)', () => {
  let tempRoot: string;
  let seen: Record<string, string> | null;
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-absorb-auth-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    m.session = { user: { id: 'user-a' } };
    m.ghToken = 'gh-session-token';
    seen = null;
    upsertDurableAbsorbProject({
      id: WS,
      name: 'tiny',
      ownerId: 'user-a',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/tiny.git',
      localPath: `/data/workspaces/${WS}/tiny`,
      metadata: { branch: 'main' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        seen = init.headers as Record<string, string>;
        return new Response('{"graphId":"g1","stats":{"totalFiles":1},"cost":10}', { status: 200 });
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("cookie-session browser call: the session user's own token is sent, never the service key", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(seen!.Authorization).toBe('Bearer gh-session-token');
    expect(JSON.stringify(seen)).not.toContain('service-key');
  });

  it('no signed-in user credential: 401, nothing sent to absorb, even with a client bearer', async () => {
    m.ghToken = null;
    const res = await POST(post({ Authorization: 'Bearer service-key' }));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('absorb_no_user_credential');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a client-sent Authorization is ignored; only the session token is used', async () => {
    await POST(post({ Authorization: 'Bearer service-key' }));
    expect(seen!.Authorization).toBe('Bearer gh-session-token');
    expect(JSON.stringify(seen)).not.toContain('service-key');
  });
});
