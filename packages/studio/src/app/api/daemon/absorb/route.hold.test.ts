import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Mapping HOLD on #617: H1 (a proxy's 404/413/504 keeps the pending id), N1
 * (first writer wins, before any await) and N2 (compare-and-clear). The
 * stand-in absorb charges once per distinct importId and replays a known one.
 */
const m = vi.hoisted(() => ({ session: { user: { id: 'user-a' } } as { user: { id: string } } | null }));

vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({
  // A real token lookup takes a moment: the window two devices race in.
  getGitHubToken: async () => {
    await new Promise((r) => setTimeout(r, 20));
    return 'gh-user-token';
  },
}));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { GET, POST } from './route';
import {
  claimPendingAbsorbImportId,
  clearPendingAbsorbImportId,
  upsertDurableAbsorbProject,
} from '@/lib/absorb/projectState';

const WS = 'ws-11111111-2222-4333-8444-555555555555';
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const pendingId = async () =>
  (await (await GET(new NextRequest(`http://localhost/api/daemon/absorb?workspaceId=${WS}`))).json())
    .pendingImportId as string | null;

describe('/api/daemon/absorb: Mapping HOLD (H1, N1, N2)', () => {
  let tempRoot: string;
  let charges: string[];
  let sent: string[];
  // The answer for the NEXT call only (after absorb has run and charged).
  let nextAnswer: null | (() => Response);

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-absorb-hold-'));
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
    nextAnswer = null;
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      const { importId } = JSON.parse(init.body as string) as { importId: string };
      sent.push(importId);
      const replay = charges.includes(importId);
      if (!replay) charges.push(importId);
      if (nextAnswer) {
        const a = nextAnswer;
        nextAnswer = null;
        return a();
      }
      return new Response(JSON.stringify({ graphId: 'g1', stats: { totalFiles: 1 }, cost: replay ? 0 : 10 }), {
        status: 200,
      });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('H1: a proxy 504 with an HTML body keeps the pending id; the retry gives ONE charge', async () => {
    nextAnswer = () => new Response('<html><body>504 Gateway Time-out</body></html>', { status: 504 });
    const first = await POST(post({ workspaceId: WS, importId: 'imp-proxy-1111' }));
    expect(first.status).toBe(502);
    expect((await first.json()).reason).toBe('absorb_outcome_unknown');
    expect(await pendingId()).toBe('imp-proxy-1111');
    const retry = await POST(post({ workspaceId: WS }));
    expect(retry.status).toBe(200);
    expect(sent).toEqual(['imp-proxy-1111', 'imp-proxy-1111']);
    expect(charges).toHaveLength(1);
  });

  it('H1: a proxy 504 with an empty body, and a proxy 404 or 413, keep the pending id', async () => {
    for (const [status, body] of [
      [504, ''],
      [404, '<html>Not Found</html>'],
      [413, '<html>Request Entity Too Large</html>'],
    ] as const) {
      nextAnswer = () => new Response(body, { status });
      const r = await POST(post({ workspaceId: WS, importId: 'imp-proxy-2222' }));
      expect(r.status).toBe(502);
      expect(await pendingId()).toBe('imp-proxy-2222');
    }
    expect(new Set(sent)).toEqual(new Set(['imp-proxy-2222']));
    expect(charges).toHaveLength(1);
  });

  it("H1: absorb's own clone_timeout (504) and clone_too_large (413) are definitive and clear it", async () => {
    for (const [status, code] of [
      [504, 'clone_timeout'],
      [413, 'clone_too_large'],
    ] as const) {
      nextAnswer = () => new Response(JSON.stringify({ error: code, message: 'x' }), { status });
      const r = await POST(post({ workspaceId: WS }));
      expect(r.status).toBe(status);
      expect(await pendingId()).toBeNull();
    }
  });

  it('N1: two first attempts from two devices at once get ONE importId and ONE charge', async () => {
    const [a, b] = await Promise.all([
      POST(post({ workspaceId: WS, importId: 'imp-laptop-3333' })),
      POST(post({ workspaceId: WS, importId: 'imp-phone-4444' })),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(sent).toHaveLength(2);
    expect(new Set(sent).size).toBe(1);
    expect(charges).toHaveLength(1);
  });

  it('N2: clearing is compare-and-clear: a stale id does not clear the current one', () => {
    expect(claimPendingAbsorbImportId(WS, 'user-a', 'imp-current-5555')).toBe('imp-current-5555');
    expect(claimPendingAbsorbImportId(WS, 'user-a', 'imp-later-6666')).toBe('imp-current-5555');
    expect(clearPendingAbsorbImportId(WS, 'user-a', 'imp-stale-7777')).toBe(false);
    expect(clearPendingAbsorbImportId(WS, 'user-b', 'imp-current-5555')).toBe(false);
    expect(claimPendingAbsorbImportId(WS, 'user-b', 'imp-other-8888')).toBeNull();
    expect(clearPendingAbsorbImportId(WS, 'user-a', 'imp-current-5555')).toBe(true);
    expect(claimPendingAbsorbImportId(WS, 'user-a', 'imp-next-9999')).toBe('imp-next-9999');
  });
});
