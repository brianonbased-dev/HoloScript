import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession, type Session } from 'next-auth';

vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { DELETE } from './route';
import {
  listDurableAbsorbProjects,
  recordAbsorbJob,
  upsertDurableAbsorbProject,
} from '@/lib/absorb/projectState';

const ID = 'ws-11111111-2222-4333-8444-555555555555';
let tempRoot: string;

function seed(ownerId: string): string {
  const dir = path.join(tempRoot, ID);
  const localPath = path.join(dir, 'brian-music-bot');
  fs.mkdirSync(localPath, { recursive: true });
  fs.writeFileSync(path.join(localPath, 'README.md'), 'x');
  upsertDurableAbsorbProject({ id: ID, name: 'brian-music-bot', ownerId, localPath, status: 'ready' });
  return dir;
}

function del(id = ID): Promise<Response> {
  return DELETE(new NextRequest(`http://localhost/api/workspace/import?id=${id}`, { method: 'DELETE' }));
}

describe('DELETE /api/workspace/import (failed-import rollback)', () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-rollback-test-'));
    vi.stubEnv('HOLOSCRIPT_WORKSPACES_DIR', tempRoot);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'joseph' } } as Session);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('removes the caller\'s never-absorbed workspace dir and its project row', async () => {
    const dir = seed('joseph');
    const res = await del();
    expect(res.status).toBe(200);
    expect(fs.existsSync(dir)).toBe(false);
    expect(listDurableAbsorbProjects('joseph')).toHaveLength(0);
  });

  it('still removes it after a recorded failed absorb (the prod 502 case)', async () => {
    const dir = seed('joseph');
    recordAbsorbJob({ projectId: ID, source: 'http', request: {}, result: null, error: 'MCP 406' });
    const res = await del();
    expect(res.status).toBe(200);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('twin: refuses (409) and keeps a workspace that was absorbed successfully', async () => {
    const dir = seed('joseph');
    recordAbsorbJob({ projectId: ID, source: 'mcp', request: {}, result: { status: 'complete' } });
    const res = await del();
    expect(res.status).toBe(409);
    expect(fs.existsSync(dir)).toBe(true);
    expect(listDurableAbsorbProjects('joseph')).toHaveLength(1);
  });

  it('twin: refuses (404) another account\'s workspace and leaves it intact', async () => {
    const dir = seed('someone-else');
    const res = await del();
    expect(res.status).toBe(404);
    expect(fs.existsSync(dir)).toBe(true);
    expect(listDurableAbsorbProjects('someone-else')).toHaveLength(1);
  });

  it('refuses signed-out callers (401) and non-workspace ids (400)', async () => {
    seed('joseph');
    expect((await del('..%2F..%2Fetc')).status).toBe(400);
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect((await del()).status).toBe(401);
    expect(fs.existsSync(path.join(tempRoot, ID))).toBe(true);
  });
});
