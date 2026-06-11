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

import { POST } from './route';

function filesRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/workspace/files', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/workspace/files route', () => {
  let tempRoot: string;
  let workspaceRoot: string;
  let repoPath: string;
  const originalWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ws-files-'));
    workspaceRoot = path.join(tempRoot, 'workspaces');
    repoPath = path.join(workspaceRoot, 'project-1', 'repo');
    fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'src', 'index.ts'), 'export const ok = true;\n');
    fs.writeFileSync(path.join(repoPath, '.git', 'config'), '[core]\n');
    process.env.HOLOSCRIPT_WORKSPACES_DIR = workspaceRoot;
  });

  afterEach(() => {
    process.env.HOLOSCRIPT_WORKSPACES_DIR = originalWorkspacesDir;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('writes, reads, lists, moves, and deletes a file inside the workspace', async () => {
    const writeRes = await POST(
      filesRequest({
        workspacePath: repoPath,
        op: 'write',
        path: 'src/utils/math.ts',
        content: 'export const add = (a: number, b: number) => a + b;\n',
      })
    );
    expect(writeRes.status).toBe(200);
    expect((await writeRes.json()).created).toBe(true);

    const readRes = await POST(
      filesRequest({ workspacePath: repoPath, op: 'read', path: 'src/utils/math.ts' })
    );
    const readBody = await readRes.json();
    expect(readRes.status).toBe(200);
    expect(readBody.content).toContain('export const add');
    expect(readBody.truncated).toBe(false);

    const listRes = await POST(filesRequest({ workspacePath: repoPath, op: 'list', path: '' }));
    const listBody = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listBody.entries.some((e: { name: string }) => e.name === 'src')).toBe(true);
    expect(listBody.entries.some((e: { name: string }) => e.name === '.git')).toBe(false);

    const moveRes = await POST(
      filesRequest({
        workspacePath: repoPath,
        op: 'move',
        path: 'src/utils/math.ts',
        toPath: 'src/lib/math.ts',
      })
    );
    expect(moveRes.status).toBe(200);
    expect(fs.existsSync(path.join(repoPath, 'src', 'lib', 'math.ts'))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, 'src', 'utils', 'math.ts'))).toBe(false);

    const deleteRes = await POST(
      filesRequest({ workspacePath: repoPath, op: 'delete', path: 'src/lib/math.ts' })
    );
    expect(deleteRes.status).toBe(200);
    expect(fs.existsSync(path.join(repoPath, 'src', 'lib', 'math.ts'))).toBe(false);
  });

  it('rejects workspace paths outside the configured workspace root', async () => {
    const outside = path.join(tempRoot, 'elsewhere');
    fs.mkdirSync(outside, { recursive: true });
    const res = await POST(
      filesRequest({ workspacePath: outside, op: 'read', path: 'anything.ts' })
    );
    expect(res.status).toBe(403);
  });

  it('rejects path traversal, absolute paths, and .git targets', async () => {
    const traversal = await POST(
      filesRequest({ workspacePath: repoPath, op: 'write', path: '../escape.ts', content: 'x' })
    );
    expect(traversal.status).toBe(400);

    const absolute = await POST(
      filesRequest({ workspacePath: repoPath, op: 'read', path: '/etc/passwd' })
    );
    expect(absolute.status).toBe(400);

    const gitRead = await POST(
      filesRequest({ workspacePath: repoPath, op: 'read', path: '.git/config' })
    );
    expect(gitRead.status).toBe(400);

    const gitMoveTarget = await POST(
      filesRequest({
        workspacePath: repoPath,
        op: 'move',
        path: 'src/index.ts',
        toPath: '.git/hooks/pre-commit',
      })
    );
    expect(gitMoveTarget.status).toBe(400);
  });

  it('never overwrites on move and never deletes non-empty directories', async () => {
    fs.writeFileSync(path.join(repoPath, 'a.ts'), 'a\n');
    fs.writeFileSync(path.join(repoPath, 'b.ts'), 'b\n');

    const clobber = await POST(
      filesRequest({ workspacePath: repoPath, op: 'move', path: 'a.ts', toPath: 'b.ts' })
    );
    expect(clobber.status).toBe(400);
    expect((await clobber.json()).error).toMatch(/never overwrite/i);

    const dirDelete = await POST(
      filesRequest({ workspacePath: repoPath, op: 'delete', path: 'src' })
    );
    expect(dirDelete.status).toBe(400);
    expect(fs.existsSync(path.join(repoPath, 'src', 'index.ts'))).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await POST(
      filesRequest({ workspacePath: repoPath, op: 'read', path: 'src/index.ts' })
    );
    expect(res.status).toBe(401);
  });
});
