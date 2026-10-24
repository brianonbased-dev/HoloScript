import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Mapping H2 (#617): absorb charged, then the state lock is held when Studio
 * records the job. The caller must get the result and importId, the pending
 * id must stay, and a retry must replay (cost 0), not charge again.
 */
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

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/api/daemon/absorb: lock held between charge and record (Mapping H2)', () => {
  let root: string;
  let charges: string[];
  let sent: string[];
  let holdLockOnNext: boolean;
  let savedTimeout = 0;
  const lockPath = () => path.join(root, '.absorb-projects.json.lock');
  const stored = () => state.findDurableAbsorbProject({ projectId: WS });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-absorb-h2-'));
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
    holdLockOnNext = false;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const { importId } = JSON.parse(init.body as string) as { importId: string };
      sent.push(importId);
      const replay = charges.includes(importId);
      if (!replay) charges.push(importId);
      if (holdLockOnNext) {
        holdLockOnNext = false;
        fs.writeFileSync(lockPath(), 'another-studio-process'); // held during the record
      }
      return new Response(
        JSON.stringify({ graphId: 'g1', cost: replay ? 0 : 10, replayed: replay }),
        { status: 200 }
      );
    });
  });
  afterEach(() => {
    if (timing) timing.timeoutMs = savedTimeout;
    vi.unstubAllGlobals();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('answers 200 with the data and importId, keeps the pending id, and the retry does not charge again', async () => {
    holdLockOnNext = true;
    const first = await POST(post({ workspaceId: WS, importId: 'imp-h2-first-1111' }));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.graphId).toBe('g1');
    expect(body.importId).toBe('imp-h2-first-1111');
    expect(charges).toEqual(['imp-h2-first-1111']);

    fs.rmSync(lockPath(), { force: true }); // the other process finishes
    expect(stored()?.metadata.pendingImportId).toBe('imp-h2-first-1111');

    // A reload sends no importId: the server's pending one is reused.
    const retry = await POST(post({ workspaceId: WS }));
    expect(retry.status).toBe(200);
    expect((await retry.json()).replayed).toBe(true);
    expect(sent).toEqual(['imp-h2-first-1111', 'imp-h2-first-1111']);
    expect(charges).toHaveLength(1);
    expect(stored()?.metadata.pendingImportId).toBeNull();
    expect(stored()?.absorbJobs.some((j) => j.status === 'complete')).toBe(true);
  });

  it('records the job and clears the pending id in one write on the normal path', async () => {
    const res = await POST(post({ workspaceId: WS, importId: 'imp-h2-normal-2222' }));
    expect(res.status).toBe(200);
    expect(stored()?.metadata.pendingImportId).toBeNull();
    expect(stored()?.absorbJobs).toHaveLength(1);
  });
});
