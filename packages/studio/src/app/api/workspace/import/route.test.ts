import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({
    user: { email: 'agent@example.test' },
    accessToken: 'gho_private_token',
  })),
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
let savedGitConfigCount: string | undefined;

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
        callback(
          null,
          [
            'package.json',
            'src/app/dashboard/page.tsx',
            'src/app/api/generate/route.ts',
            'src/components/SceneCanvas.tsx',
            'scripts/sync-knowledge.mjs',
            'prisma/schema.prisma',
          ].join('\n') + '\n',
          ''
        );
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
    savedWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedGitConfigCount = process.env.GIT_CONFIG_COUNT;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-import-test-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = tempRoot;
    delete process.env.GIT_CONFIG_COUNT;
    mockGitSuccess();
  });

  afterEach(() => {
    if (savedWorkspaceRoot === undefined) {
      delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    } else {
      process.env.HOLOSCRIPT_WORKSPACES_DIR = savedWorkspaceRoot;
    }
    if (savedGitConfigCount === undefined) {
      delete process.env.GIT_CONFIG_COUNT;
    } else {
      process.env.GIT_CONFIG_COUNT = savedGitConfigCount;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('clones private GitHub repos with argv args and token-free command arguments', async () => {
    const res = await POST(
      importRequest({
        repoUrl: 'https://github.com/acme/private-repo.git',
        branch: 'feature/safe-branch',
        name: 'Private Repo',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.repoUrl).toBe('https://github.com/acme/private-repo.git');
    expect(body.fileCount).toBe(6);
    expect(body.localPath).toContain(tempRoot);
    expect(body.conversionCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePaths: ['package.json'],
          target: '.hsplus',
        }),
        expect.objectContaining({
          sourcePaths: ['src/app/api/generate/route.ts'],
          target: 'mcp-tool',
        }),
        expect.objectContaining({
          sourcePaths: ['src/components/SceneCanvas.tsx'],
          target: 'hololand-scene',
        }),
      ])
    );
    expect(body.publishWorthiness.hiddenPaperProgramUnlocked).toBe(false);
    expect(body.publishWorthiness.verdict).toBe('locked');
    expect(body.publishWorthiness.llmAssistPrompt).toContain(
      'hidden HoloScript paper-program lane'
    );
    expect(fs.existsSync(body.conversionManifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(body.conversionManifestPath, 'utf-8')) as {
      candidates: unknown[];
      metadata: {
        publishWorthiness: {
          hiddenPaperProgramUnlocked: boolean;
          verdict: string;
        };
      };
    };
    expect(manifest.candidates).toHaveLength(body.conversionCandidates.length);
    expect(manifest.metadata.publishWorthiness).toMatchObject({
      hiddenPaperProgramUnlocked: false,
      verdict: 'locked',
    });

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
    expect(args.join(' ')).not.toContain('gho_private_token');
    expect(options.timeout).toBe(120_000);
    expect(options.env?.GIT_TERMINAL_PROMPT).toBe('0');
    expect(options.env?.GIT_CONFIG_COUNT).toBe('1');
    expect(options.env?.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    expect(options.env?.GIT_CONFIG_VALUE_0).toMatch(/^Authorization: basic /);
    expect(options.env?.GIT_CONFIG_VALUE_0).not.toContain('gho_private_token');
  });

  it('normalizes supported ssh GitHub URLs before invoking git', async () => {
    const res = await POST(
      importRequest({
        repoUrl: 'git@github.com:acme/private-repo.git',
        branch: 'main',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
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
      const res = await POST(importRequest({ repoUrl }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toMatch(/github\.com repository URL/i);
    }

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('rejects branch injection before invoking git', async () => {
    for (const branch of ['main; touch pwned', '--upload-pack=touch-pwned', 'main..pwned']) {
      const res = await POST(
        importRequest({
          repoUrl: 'https://github.com/acme/repo.git',
          branch,
        })
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toMatch(/valid git ref name/i);
    }

    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('returns sanitized clone failures without leaking tokens', async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _options: unknown, callback?: ExecFileCallback) => {
        if (!callback) throw new Error('Expected execFile callback');
        const error = Object.assign(
          new Error('fatal: https://gho_private_token@github.com/acme/private-repo.git denied'),
          { code: 128 }
        );
        callback(error, '', '');
        return {};
      }
    );

    const res = await POST(
      importRequest({
        repoUrl: 'https://github.com/acme/private-repo.git',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Clone failed');
    expect(JSON.stringify(body)).not.toContain('gho_private_token');
  });
});
