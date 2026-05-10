import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

import { provisionUser } from '../provisionUser';

type ExecFileCallback = (
  error: NodeJS.ErrnoException | null,
  stdout?: string | Buffer,
  stderr?: string | Buffer
) => void;

function mockFounderGit(): void {
  execFileMock.mockImplementation(
    (_cmd: string, args: string[], _options: unknown, callback?: ExecFileCallback) => {
      if (!callback) throw new Error('Expected execFile callback');
      if (args.includes('remote.origin.url')) {
        callback(null, 'git@github.com:brianonbased-dev/ai-ecosystem.git\n', '');
        return {};
      }
      if (args.includes('symbolic-ref')) {
        callback(null, 'refs/remotes/origin/main\n', '');
        return {};
      }
      if (args.includes('--abbrev-ref')) {
        callback(null, 'main\n', '');
        return {};
      }
      if (args.includes('HEAD')) {
        callback(null, 'abc123def4567890abc123def4567890abc123de\n', '');
        return {};
      }
      callback(null, '', '');
      return {};
    }
  );
}

describe('provisionUser founder bootstrap', () => {
  const savedFounderUsers = process.env.STUDIO_FOUNDER_GITHUB_USERS;
  const savedMasterKey = process.env.HOLOSCRIPT_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STUDIO_FOUNDER_GITHUB_USERS = 'brianonbased-dev';
    process.env.HOLOSCRIPT_API_KEY = 'master-key';
    mockFounderGit();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.includes('/admin/keys')) {
          return new Response(JSON.stringify({ key: 'mcp-founder-key' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: `unexpected fetch ${href}`, init }), {
          status: 500,
        });
      })
    );
  });

  afterEach(() => {
    if (savedFounderUsers === undefined) {
      delete process.env.STUDIO_FOUNDER_GITHUB_USERS;
    } else {
      process.env.STUDIO_FOUNDER_GITHUB_USERS = savedFounderUsers;
    }
    if (savedMasterKey === undefined) {
      delete process.env.HOLOSCRIPT_API_KEY;
    } else {
      process.env.HOLOSCRIPT_API_KEY = savedMasterKey;
    }
    vi.unstubAllGlobals();
  });

  it('maps the founder login to the existing ai-ecosystem workspace without scaffolding', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_founder_secret_token',
      githubUsername: 'brianonbased-dev',
      email: 'brianonbased@gmail.com',
      approvedRepos: [],
      approvedScaffold: true,
      approvedAbsorb: true,
      approvedPublishKnowledge: true,
      approvedDaemon: true,
    });

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({
      workspaceId: 'ai-ecosystem',
      repoUrl: 'https://github.com/brianonbased-dev/ai-ecosystem.git',
      repoName: 'ai-ecosystem',
      tier: 'founder',
      scaffolded: false,
      daemonStarted: false,
    });
    expect(result.user?.capabilities).toEqual(
      expect.arrayContaining(['founder', 'internal', 'paper-program', 'absorb-registration'])
    );
    expect(result.user?.accountWorkspace).toMatchObject({
      workspaceId: 'ai-ecosystem',
      defaultBranch: 'main',
      currentCommit: 'abc123def4567890abc123def4567890abc123de',
      visibility: 'founder-internal',
    });
    expect(JSON.stringify(result.user)).not.toContain('gho_founder_secret_token');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as {
      tier: string;
      workspaceId: string;
      metadata: Record<string, unknown>;
    };
    expect(payload).toMatchObject({
      tier: 'founder',
      workspaceId: 'ai-ecosystem',
    });
    expect(payload.metadata).toMatchObject({
      founder: true,
      repoUrl: 'https://github.com/brianonbased-dev/ai-ecosystem.git',
      defaultBranch: 'main',
      currentCommit: 'abc123def4567890abc123def4567890abc123de',
    });
    expect(JSON.stringify(payload)).not.toContain('gho_founder_secret_token');
  });
});
