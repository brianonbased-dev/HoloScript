import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/** Mapping N12/N13 (#617 follow-up) on /api/daemon/absorb. */
const m = vi.hoisted(() => ({ session: { user: { id: 'user-a' } } }));
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: async () => 'gh-user-token' }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { POST } from './route';
import * as state from '@/lib/absorb/projectState';

const WS = 'ws-11111111-2222-4333-8444-555555555555';
const timing = (state as Record<string, unknown>).__absorbStateLockTiming as
  { timeoutMs: number } | undefined;
type Mode = 'ok' | 'hold-lock' | 'already-charged' | 'in-progress';

describe('/api/daemon/absorb N12/N13', () => {
  let root: string;
  let charges: string[];
  let sent: string[];
  let next: Mode[];
  let savedTimeout = 0;
  const lockPath = () => path.join(root, '.absorb-projects.json.lock');
  const row = () => state.findDurableAbsorbProject({ projectId: WS });
  const post = (body: Record<string, unknown> = {}) =>
    POST(
      new NextRequest('http://localhost/api/daemon/absorb', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: WS, ...body }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-absorb-n13-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    if (timing) {
      savedTimeout = timing.timeoutMs;
      timing.timeoutMs = 100;
    }
    state.upsertDurableAbsorbProject({
      id: WS,
      name: 'tiny',
      ownerId: 'user-a',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/tiny.git',
      metadata: { branch: 'main' },
    });
    charges = [];
    sent = [];
    next = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { importId } = JSON.parse(init.body as string) as { importId: string };
      sent.push(importId);
      const mode = next.shift() ?? 'ok';
      if (mode === 'already-charged')
        return new Response(JSON.stringify({ error: 'import_already_charged' }), { status: 409 });
      if (mode === 'in-progress')
        return new Response(JSON.stringify({ error: 'import_in_progress' }), { status: 409 });
      const replay = charges.includes(importId);
      if (!replay) charges.push(importId);
      if (mode === 'hold-lock') fs.writeFileSync(lockPath(), 'another-studio-process');
      return new Response(
        JSON.stringify({ graphId: 'g1', cost: replay ? 0 : 10, replayed: replay }),
        {
          status: 200,
        }
      );
    });
  });
  afterEach(() => {
    if (timing) timing.timeoutMs = savedTimeout;
    vi.unstubAllGlobals();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('N12: after recordPending, the next request replays, records the job and clears the id; the one after is a NEW import', async () => {
    next = ['hold-lock'];
    expect((await post({ importId: 'imp-n12-first-0001' })).status).toBe(200);
    fs.rmSync(lockPath(), { force: true });
    const replay = await post();
    expect((await replay.json()).replayed).toBe(true);
    expect(row()?.absorbJobs.some((j) => j.status === 'complete')).toBe(true);
    expect(row()?.metadata.pendingImportId).toBeNull();
    await post();
    expect(sent[2]).not.toBe('imp-n12-first-0001');
    expect(charges).toHaveLength(2);
  });

  it('N13: 409 import_already_charged records the job and clears the pending id', async () => {
    next = ['already-charged'];
    const r = await post({ importId: 'imp-n13-charged-01' });
    expect(r.status).toBe(409);
    expect((await r.json()).reason).toBe('import_already_charged');
    expect(row()?.metadata.pendingImportId).toBeNull();
    expect(row()?.lastAbsorbedAt).not.toBeNull();
    expect(row()?.absorbJobs.some((j) => j.status === 'complete')).toBe(true);
  });

  it('N13: 409 import_in_progress keeps the id; a later already_charged resolves it', async () => {
    next = ['in-progress'];
    expect((await post({ importId: 'imp-n13-running-1' })).status).toBe(409);
    expect(row()?.metadata.pendingImportId).toBe('imp-n13-running-1');
    next = ['already-charged'];
    await post();
    expect(sent[1]).toBe('imp-n13-running-1');
    expect(row()?.metadata.pendingImportId).toBeNull();
  });
});
