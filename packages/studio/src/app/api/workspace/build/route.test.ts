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

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/workspace/build', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/workspace/build route', () => {
  let tempRoot: string;
  let workspaceRoot: string;
  let repoPath: string;
  const originalWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ws-build-'));
    workspaceRoot = path.join(tempRoot, 'workspaces');
    repoPath = path.join(workspaceRoot, 'project-1', 'repo');
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        scripts: { build: 'node -e "console.log(\'built ok\')"' },
      })
    );
    process.env.HOLOSCRIPT_WORKSPACES_DIR = workspaceRoot;
  });

  afterEach(() => {
    process.env.HOLOSCRIPT_WORKSPACES_DIR = originalWorkspacesDir;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('rejects workspaces outside the configured root', async () => {
    const outside = path.join(tempRoot, 'elsewhere');
    fs.mkdirSync(outside, { recursive: true });
    const res = await POST(buildRequest({ workspacePath: outside }));
    expect(res.status).toBe(403);
  });

  it('rejects script names that fail the charset check', async () => {
    const res = await POST(
      buildRequest({ workspacePath: repoPath, script: 'build && rm -rf /' })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must match/i);
  });

  it('rejects scripts that do not exist in package.json', async () => {
    const res = await POST(buildRequest({ workspacePath: repoPath, script: 'missing-script' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no "missing-script" script/i);
    expect(body.availableScripts).toContain('build');
  });

  it('rejects workspaces without a package.json', async () => {
    const bare = path.join(workspaceRoot, 'bare');
    fs.mkdirSync(bare, { recursive: true });
    const res = await POST(buildRequest({ workspacePath: bare }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no package\.json/i);
  });

  it('runs an allowlisted package.json script and returns real output', async () => {
    const res = await POST(buildRequest({ workspacePath: repoPath, script: 'build' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.exitCode).toBe(0);
    expect(body.stdout).toContain('built ok');
    expect(body.packageManager).toBe('npm');
  }, 60_000);

  it('reports a non-zero exit code instead of throwing', async () => {
    fs.writeFileSync(
      path.join(repoPath, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        scripts: { build: 'node -e "console.error(\'boom\'); process.exit(2)"' },
      })
    );
    const res = await POST(buildRequest({ workspacePath: repoPath, script: 'build' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.exitCode).toBe(2);
    expect(body.stderr).toContain('boom');
  }, 60_000);
});
