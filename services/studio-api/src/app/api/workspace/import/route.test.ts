import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { execFileMock, getServerSessionMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  getServerSessionMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('next-auth', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { POST } from './route';

type ExecFileCallback = (
  error: NodeJS.ErrnoException | null,
  stdout?: string | Buffer,
  stderr?: string | Buffer
) => void;

let tempRoot: string;
let savedWorkspaceRoot: string | undefined;

function importRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/workspace/import', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function mockGitSuccess(): void {
  execFileMock.mockImplementation(
    (_cmd: string, args: string[], _options: unknown, callback?: ExecFileCallback) => {
      if (!callback) throw new Error('Expected execFile callback');
      if (args[0] === 'rev-parse') {
        callback(null, 'feature/safe-branch\n', '');
        return {};
      }
      if (args[0] === 'ls-files') {
        callback(null, 'src/app/page.tsx\r\nREADME.md\r\npackage.json\r\n', '');
        return {};
      }
      callback(null, '', '');
      return {};
    }
  );
}

describe('/api/workspace/import route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({
      user: { email: 'agent@example.test' },
    });
    savedWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-api-import-test-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    mockGitSuccess();
  });

  afterEach(() => {
    if (savedWorkspaceRoot === undefined) {
      delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    } else {
      process.env.HOLOSCRIPT_WORKSPACES_DIR = savedWorkspaceRoot;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('clones GitHub repos with argv args, UUID workspace ids, and portable file counts', async () => {
    const response = await POST(
      importRequest({
        repoUrl: 'https://github.com/acme/private-repo.git',
        branch: 'feature/safe-branch',
        name: 'Private Repo',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toMatch(/^ws-[0-9a-f-]{36}$/i);
    expect(body.name).toBe('Private-Repo');
    expect(body.repoUrl).toBe('https://github.com/acme/private-repo.git');
    expect(body.branch).toBe('feature/safe-branch');
    expect(body.fileCount).toBe(3);
    expect(body.localPath).toContain(tempRoot);

    const [command, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      { env?: NodeJS.ProcessEnv; timeout?: number },
      ExecFileCallback,
    ];
    expect(command).toBe('git');
    expect(args).toEqual([
      'clone',
      '--depth',
      '1',
      '--branch',
      'feature/safe-branch',
      '--',
      'https://github.com/acme/private-repo.git',
      body.localPath,
    ]);
    expect(options.timeout).toBe(120_000);
    expect(options.env?.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('normalizes supported SSH GitHub URLs before invoking git', async () => {
    const response = await POST(
      importRequest({
        repoUrl: 'git@github.com:acme/private-repo.git',
        branch: 'main',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.repoUrl).toBe('https://github.com/acme/private-repo.git');
    const cloneArgs = execFileMock.mock.calls[0]?.[1] as string[];
    expect(cloneArgs).toContain('https://github.com/acme/private-repo.git');
  });

  it('rejects non-GitHub and decorated repo URLs before invoking git', async () => {
    for (const repoUrl of [
      'https://evil.example/acme/repo.git',
      'https://github.com/acme/repo.git?upload-pack=touch-pwned',
      'https://gho_private_token@github.com/acme/repo.git',
    ]) {
      const response = await POST(importRequest({ repoUrl }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/github\.com repository URL/i);
    }

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('rejects branch injection before invoking git', async () => {
    for (const branch of ['main; touch pwned', '--upload-pack=touch-pwned', 'main..pwned']) {
      const response = await POST(
        importRequest({
          repoUrl: 'https://github.com/acme/repo.git',
          branch,
        })
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/valid git ref name/i);
    }

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('returns sanitized clone failures without leaking raw git output or tokens', async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _options: unknown, callback?: ExecFileCallback) => {
        if (!callback) throw new Error('Expected execFile callback');
        const error = Object.assign(
          new Error('fatal: https://gho_private_token@github.com/acme/private-repo.git denied'),
          { code: 128 }
        );
        callback(error, '', 'token gho_private_token rejected');
        return {};
      }
    );

    const response = await POST(
      importRequest({
        repoUrl: 'https://github.com/acme/private-repo.git',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Clone failed');
    expect(body.code).toBe('128');
    expect(JSON.stringify(body)).not.toContain('gho_private_token');
    expect(JSON.stringify(body)).not.toContain('denied');
  });
});
