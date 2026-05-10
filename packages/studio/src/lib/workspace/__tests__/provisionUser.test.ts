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
        const method = init?.method ?? 'GET';
        if (href.includes('/admin/keys')) {
          return new Response(JSON.stringify({ key: 'mcp-founder-key' }), { status: 200 });
        }
        if (href === 'https://api.github.com/user/repos' && method === 'POST') {
          return new Response(
            JSON.stringify({
              html_url: 'https://github.com/octocat/ai-workspace-octocat',
              name: 'ai-workspace-octocat',
            }),
            { status: 201 }
          );
        }
        if (href.includes('/contents/') && method === 'PUT') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (href.includes('/contents/')) {
          return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
        }
        if (href.includes('/repos/octocat/')) {
          return new Response(JSON.stringify({ name: href.split('/').pop() }), { status: 200 });
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

  it('seeds a template-shaped account workspace repo for a Studio user', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      approvedRepos: ['octocat/library', 'https://github.com/octocat/demo-app.git'],
      approvedScaffold: true,
      approvedAbsorb: false,
      approvedPublishKnowledge: false,
      approvedDaemon: false,
    });

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({
      workspaceId: 'ws_octocat',
      repoUrl: 'https://github.com/octocat/ai-workspace-octocat',
      repoName: 'ai-workspace-octocat',
      tier: 'starter',
      scaffolded: true,
      daemonStarted: false,
    });
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'account-workspace', status: 'done' }),
        expect.objectContaining({ name: 'seed-repo', status: 'done' }),
      ])
    );
    expect(result.user?.accountWorkspace).toMatchObject({
      workspaceId: 'ws_octocat',
      template: 'ai-workspace-template',
      source: 'ai-workspace-template',
      structure: expect.objectContaining({
        profilePath: 'profile.yml',
        accountManifestPath: 'ecosystem/account-workspace.json',
        linkedReposPath: 'ecosystem/linked-repos.json',
        boardStatePath: 'ecosystem/board-state.json',
        paperUnlocksPath: 'ecosystem/paper-unlocks.json',
      }),
      repoImport: expect.objectContaining({
        workspaceId: 'ws_octocat',
        conversionRecommendationsPath: 'ecosystem/conversion-recommendations.json',
      }),
      daemon: expect.objectContaining({
        workspaceId: 'ws_octocat',
        agentConfigPath: 'agents/claude.yml',
      }),
    });
    expect(result.user?.capabilities).toEqual(
      expect.arrayContaining([
        'knowledge-sync',
        'repo-import',
        'daemon-workflows',
        'paper-unlock-state',
      ])
    );
    expect(JSON.stringify(result.user)).not.toContain('gho_customer_secret_token');

    const fetchMock = vi.mocked(fetch);
    const [, keyInit] = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/admin/keys')
    ) as [string, RequestInit];
    const keyPayload = JSON.parse(String(keyInit.body)) as {
      tier: string;
      workspaceId: string;
      metadata: Record<string, unknown>;
    };
    expect(keyPayload).toMatchObject({
      tier: 'starter',
      workspaceId: 'ws_octocat',
      metadata: {
        accountWorkspace: true,
        template: 'ai-workspace-template',
        approvedRepoCount: 2,
      },
    });

    const pushedFiles = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([url, init]) => {
        const pathPart = decodeURIComponent(String(url).split('/contents/')[1] ?? '');
        const body = JSON.parse(String(init?.body)) as { content: string };
        return {
          path: pathPart,
          content: Buffer.from(body.content, 'base64').toString('utf-8'),
        };
      });
    expect(pushedFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        '.env',
        'README.md',
        'profile.yml',
        'config.yml',
        'agents/claude.yml',
        'agents/gemini.yml',
        'ecosystem/account-workspace.json',
        'ecosystem/linked-repos.json',
        'ecosystem/board-state.json',
        'ecosystem/paper-unlocks.json',
        'ecosystem/conversion-recommendations.json',
        'knowledge/wisdom/README.md',
        '.claude/CLAUDE.md',
      ])
    );

    const profile = pushedFiles.find((file) => file.path === 'profile.yml')?.content;
    expect(profile).toContain('workspace_id: "ws_octocat"');
    expect(profile).toContain('template: "ai-workspace-template"');

    const manifest = JSON.parse(
      pushedFiles.find((file) => file.path === 'ecosystem/account-workspace.json')?.content ?? '{}'
    ) as { workspaceId: string; linkedRepos: Array<{ cloneUrl: string; role: string }> };
    expect(manifest.workspaceId).toBe('ws_octocat');
    expect(manifest.linkedRepos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cloneUrl: 'https://github.com/octocat/ai-workspace-octocat.git',
          role: 'account-workspace',
        }),
        expect.objectContaining({
          cloneUrl: 'https://github.com/octocat/library.git',
          role: 'approved-repo',
        }),
        expect.objectContaining({
          cloneUrl: 'https://github.com/octocat/demo-app.git',
          role: 'approved-repo',
        }),
      ])
    );
    expect(pushedFiles.map((file) => file.content).join('\n')).not.toContain(
      'gho_customer_secret_token'
    );
  });
});
