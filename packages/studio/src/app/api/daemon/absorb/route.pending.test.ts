import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Mapping N1 (#617): the pending importId is kept on the SERVER per workspace,
 * so a reload, a new tab or a new device retries the SAME import and absorb
 * charges once. The stand-in absorb charges once per distinct importId and
 * replays a known one at cost 0, as the real claim store does.
 */
const m = vi.hoisted(() => ({
  session: { user: { id: 'user-a' } } as { user: { id: string } } | null,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: async () => 'gh-user-token' }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { GET, POST } from './route';
import { upsertDurableAbsorbProject } from '@/lib/absorb/projectState';

const WS = 'ws-11111111-2222-4333-8444-555555555555';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}
const pending = () => GET(new NextRequest(`http://localhost/api/daemon/absorb?workspaceId=${WS}`));

describe('/api/daemon/absorb: server-side pending importId (Mapping N1)', () => {
  let tempRoot: string;
  let charges: string[];
  let sent: string[];
  let cutNext: boolean;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-absorb-pending-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    m.session = { user: { id: 'user-a' } };
    upsertDurableAbsorbProject({
      id: WS,
      name: 'tiny',
      ownerId: 'user-a',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/tiny.git',
      metadata: { branch: 'main' },
    });
    charges = [];
    sent = [];
    cutNext = false;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { importId } = JSON.parse(init.body as string) as { importId: string };
      sent.push(importId);
      const replay = charges.includes(importId);
      if (!replay) charges.push(importId); // absorb runs and charges...
      if (cutNext) {
        cutNext = false; // ...but Studio's call is cut: outcome unknown.
        throw new DOMException('The operation timed out.', 'TimeoutError');
      }
      return new Response(
        JSON.stringify({ graphId: 'g1', stats: { totalFiles: 1 }, cost: replay ? 0 : 10, replayed: replay }),
        { status: 200 }
      );
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('502 (outcome unknown), then a reload (fresh client state): the retry reuses the importId, ONE charge', async () => {
    cutNext = true;
    const first = await POST(post({ workspaceId: WS, importId: 'imp-tab-one-1111' }));
    expect(first.status).toBe(502);
    expect((await first.json()).reason).toBe('absorb_outcome_unknown');
    // The server remembers it.
    expect((await (await pending()).json()).pendingImportId).toBe('imp-tab-one-1111');

    // Reload: the page lost everything it knew; it sends no importId.
    const retry = await POST(post({ workspaceId: WS }));
    expect(retry.status).toBe(200);
    expect(sent).toEqual(['imp-tab-one-1111', 'imp-tab-one-1111']);
    expect(charges).toHaveLength(1);
    // Done: cleared, so the next import of this workspace is a new one.
    expect((await (await pending()).json()).pendingImportId).toBeNull();
  });

  it('a new tab or device (another client, same user and workspace) sending its own importId still reuses the pending one', async () => {
    cutNext = true;
    expect((await POST(post({ workspaceId: WS, importId: 'imp-laptop-2222' }))).status).toBe(502);
    const phone = await POST(post({ workspaceId: WS, importId: 'imp-phone-3333' }));
    expect(phone.status).toBe(200);
    expect((await phone.json()).importId).toBe('imp-laptop-2222');
    expect(sent).toEqual(['imp-laptop-2222', 'imp-laptop-2222']);
    expect(charges).toHaveLength(1);
  });

  it('a different user: 404, the pending id is neither read nor reused', async () => {
    cutNext = true;
    expect((await POST(post({ workspaceId: WS, importId: 'imp-owner-4444' }))).status).toBe(502);
    m.session = { user: { id: 'user-b' } };
    expect((await pending()).status).toBe(404);
    const other = await POST(post({ workspaceId: WS }));
    expect(other.status).toBe(404);
    expect(sent).toEqual(['imp-owner-4444']);
    expect(charges).toHaveLength(1);
  });

  it('a definitive refusal (402) clears the pending id; the next attempt is a new import', async () => {
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      sent.push((JSON.parse(init.body as string) as { importId: string }).importId);
      return new Response('{"error":"x"}', { status: 402 });
    });
    expect((await POST(post({ workspaceId: WS, importId: 'imp-broke-5555' }))).status).toBe(402);
    expect((await (await pending()).json()).pendingImportId).toBeNull();
  });
});
