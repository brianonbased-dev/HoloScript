import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * #617 follow-up: this route sends an importId, kept server-side as the
 * project's pending id, so a retry or a double click is charged once. The
 * stand-in absorb charges once per distinct importId and replays a known one
 * at cost 0, as absorb's claim store does.
 */
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

// H4 (#623): the route requires the project owner's session.
const sessionState = vi.hoisted(() => ({ user: { id: 'user-a' } as { id: string } | null }));
vi.mock('next-auth', () => ({
  getServerSession: async () => (sessionState.user ? { user: sessionState.user } : null),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { POST } from './route';
import * as state from '@/lib/absorb/projectState';

const timing = (state as Record<string, unknown>).__absorbStateLockTiming as
  { timeoutMs: number } | undefined;
const PID = 'ws-11111111-2222-4333-8444-555555555555';

type Mode =
  | 'ok'
  | 'drop-after-charge'
  | 'proxy-504'
  | 'absorb-504'
  | 'proxy-404'
  | 'hold-lock'
  | 'already-charged';

describe('/api/absorb/projects/[id]/absorb importId (#617 follow-up)', () => {
  let root: string;
  let charges: string[];
  let sent: Array<string | undefined>;
  let next: Mode[];
  let savedTimeout = 0;
  const lockPath = () => path.join(root, '.absorb-projects.json.lock');
  const pending = () =>
    state.findDurableAbsorbProject({ projectId: PID })?.metadata.pendingFolderImportId;
  const post = (body: Record<string, unknown> = {}) =>
    POST(
      new NextRequest(`http://localhost/api/absorb/projects/${PID}/absorb`, {
        method: 'POST',
        body: JSON.stringify({ depth: 'shallow', ...body }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: PID }) }
    );

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-absorb-importid-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    if (timing) {
      savedTimeout = timing.timeoutMs;
      timing.timeoutMs = 100;
    }
    state.upsertDurableAbsorbProject({
      id: PID,
      name: 'repo',
      ownerId: 'user-a',
      localPath: path.join(root, PID, 'repo'),
      status: 'ready',
    });
    charges = [];
    sent = [];
    next = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { importId } = JSON.parse(init.body as string) as { importId?: string };
      sent.push(importId);
      const mode = next.shift() ?? 'ok';
      if (mode === 'proxy-504')
        return new Response('<html>Gateway Timeout</html>', { status: 504 });
      if (mode === 'already-charged')
        return new Response(JSON.stringify({ error: 'import_already_charged' }), { status: 409 });
      if (mode === 'proxy-404') return new Response('Not Found', { status: 404 });
      if (mode === 'absorb-504')
        return new Response(JSON.stringify({ error: 'clone_timeout' }), { status: 504 });
      // Absorb dedupes by importId; without one every call is a new charge.
      const replay = importId !== undefined && charges.includes(importId);
      if (!replay) charges.push(importId ?? `none-${charges.length}`);
      if (mode === 'drop-after-charge') throw new TypeError('fetch failed');
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

  it('a double click (two requests at once, no client id) is charged once', async () => {
    const [a, b] = await Promise.all([post(), post()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(sent[0]).toBeTruthy();
    expect(sent[1]).toBe(sent[0]);
    expect(charges).toHaveLength(1);
  });

  it('a retry after a dropped response replays at cost 0 with the same importId', async () => {
    next = ['drop-after-charge'];
    const first = await post();
    expect(first.status).toBe(502);
    const firstBody = await first.json();
    expect(firstBody.importId).toBe(sent[0]);
    expect(pending()).toBe(sent[0]);
    const retry = await post(); // reload: no client id
    expect(retry.status).toBe(200);
    const body = await retry.json();
    expect(body.cost).toBe(0);
    expect(body.replayed).toBe(true);
    expect(sent[1]).toBe(sent[0]);
    expect(charges).toHaveLength(1);
    expect(pending()).toBeNull();
  });

  it('an ambiguous failure (proxy 504, proxy 404) keeps the id; absorb clone_timeout clears it', async () => {
    next = ['proxy-504'];
    const r1 = await post();
    expect(r1.status).toBe(502);
    expect((await r1.json()).reason).toBe('absorb_outcome_unknown');
    expect(pending()).toBe(sent[0]);
    next = ['proxy-404'];
    expect((await post()).status).toBe(502);
    expect(sent[1]).toBe(sent[0]);
    expect(pending()).toBe(sent[0]);
    next = ['absorb-504'];
    expect((await post()).status).toBe(504);
    expect(pending()).toBeNull();
  });

  it('a post-charge lock timeout answers 200 with data + importId, keeps the id, and the retry replays', async () => {
    next = ['hold-lock'];
    const first = await post({ importId: 'imp-client-0001' });
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body).toMatchObject({ graphId: 'g1', importId: 'imp-client-0001', recordPending: true });
    fs.rmSync(lockPath(), { force: true });
    expect(pending()).toBe('imp-client-0001');
    const retry = await post();
    expect((await retry.json()).replayed).toBe(true);
    expect(charges).toEqual(['imp-client-0001']);
  });

  it('N12: after recordPending the replay records the job and clears the id; the next absorb is new', async () => {
    next = ['hold-lock'];
    await post({ importId: 'imp-n12-proj-0001' });
    fs.rmSync(lockPath(), { force: true });
    await post();
    const row = state.findDurableAbsorbProject({ projectId: PID });
    expect(row?.absorbJobs.some((j) => j.status === 'complete')).toBe(true);
    expect(pending()).toBeNull();
    await post();
    expect(sent[2]).not.toBe('imp-n12-proj-0001');
  });

  it('N13: 409 import_already_charged records the job and clears the id', async () => {
    next = ['already-charged'];
    const r = await post({ importId: 'imp-n13-proj-0001' });
    expect(r.status).toBe(409);
    expect(pending()).toBeNull();
    expect(state.findDurableAbsorbProject({ projectId: PID })?.lastAbsorbedAt).not.toBeNull();
  });
});
