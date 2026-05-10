import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { name: 'Test User' } })),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { GET } from './route';

describe('/api/git/tree route', () => {
  let tempRoot: string;
  let workspaceRoot: string;
  let repoPath: string;
  const originalWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-git-tree-'));
    workspaceRoot = path.join(tempRoot, 'workspaces');
    repoPath = path.join(workspaceRoot, 'project-1', 'repo');
    fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'src', 'index.ts'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Repo\n');
    process.env.HOLOSCRIPT_WORKSPACES_DIR = workspaceRoot;
  });

  afterEach(() => {
    process.env.HOLOSCRIPT_WORKSPACES_DIR = originalWorkspacesDir;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('lists immediate files and directories for a workspace repo', async () => {
    const req = new NextRequest(
      `http://localhost/api/git/tree?workspacePath=${encodeURIComponent(repoPath)}`
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'src', type: 'directory', path: 'src' }),
        expect.objectContaining({ name: 'README.md', type: 'file', path: 'README.md' }),
      ])
    );
    expect(body.entries.some((entry: { name: string }) => entry.name === '.git')).toBe(false);
  });

  it('rejects workspace paths outside the configured workspace root', async () => {
    const outside = path.join(tempRoot, 'workspaces-other', 'repo');
    fs.mkdirSync(path.join(outside, '.git'), { recursive: true });
    const req = new NextRequest(
      `http://localhost/api/git/tree?workspacePath=${encodeURIComponent(outside)}`
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/inside ~\/.holoscript\/workspaces/i);
  });

  it('rejects directory traversal in the requested path', async () => {
    const req = new NextRequest(
      `http://localhost/api/git/tree?workspacePath=${encodeURIComponent(repoPath)}&path=..`
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/inside the workspace/i);
  });
});
