import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/app/api/github/_shared', () => ({
  getGitHubToken: vi.fn(async () => 'gh-user-token'),
}));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { POST } from './route';
import * as state from '@/lib/absorb/projectState';

const timing = (state as Record<string, unknown>).__absorbStateLockTiming as
  { timeoutMs: number } | undefined;

/**
 * Mapping H2 (#617): a state-lock timeout after a successful (charged) scan
 * must not turn into an error that invites a re-charge.
 */
describe('/api/absorb/projects/[id]/absorb: lock held between charge and record (H2)', () => {
  let root: string;
  let savedTimeout = 0;
  const wsPath = () => path.join(root, 'ws-1', 'repo');

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-absorb-h2-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    if (timing) {
      savedTimeout = timing.timeoutMs;
      timing.timeoutMs = 100;
    }
  });
  afterEach(() => {
    if (timing) timing.timeoutMs = savedTimeout;
    vi.unstubAllGlobals();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('answers 200 with the scan data and recordPending, after exactly one charge', async () => {
    const lock = path.join(root, '.absorb-projects.json.lock');
    const fetchMock = vi.fn(async () => {
      fs.writeFileSync(lock, 'another-studio-process');
      return new Response('{"graphId":"g1","cost":10}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(
      new NextRequest('http://localhost/api/absorb/projects/x/absorb', {
        method: 'POST',
        body: '{"depth":"shallow"}',
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: wsPath() }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.graphId).toBe('g1');
    expect(body.recordPending).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
