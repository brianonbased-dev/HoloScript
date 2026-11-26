/** A state-file lock timeout answers 503 + Retry-After, not 500 (Mapping N5, #617). */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as state from '@/lib/absorb/projectState';

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ getSession: getSessionMock }));

import { POST } from './route';

const timing = (state as Record<string, unknown>).__absorbStateLockTiming as
  { timeoutMs: number } | undefined;

describe('/api/absorb/projects POST under a held state lock', () => {
  let root: string;
  let savedDir: string | undefined;
  let savedTimeout = 0;

  beforeEach(() => {
    savedDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-lock-route-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    if (timing) {
      savedTimeout = timing.timeoutMs;
      timing.timeoutMs = 100;
    }
    getSessionMock.mockResolvedValue({ user: { id: 'user-a' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service down')));
  });

  afterEach(() => {
    if (timing) timing.timeoutMs = savedTimeout;
    vi.unstubAllGlobals();
    if (savedDir === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = savedDir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('answers 503 with Retry-After when the lock is held, and writes nothing', async () => {
    fs.writeFileSync(path.join(root, '.absorb-projects.json.lock'), 'other-owner');
    const res = await POST(
      new NextRequest('http://localhost/api/absorb/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Local', source_type: 'local' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('2');
    expect((await res.json()).reason).toBe('absorb_state_locked');
    expect(fs.existsSync(path.join(root, '.absorb-projects.json'))).toBe(false);
  });
});
