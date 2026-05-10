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
          return new Response(JSON.stringify({ key: 'mcp-provisioned-secret-key' }), {
            status: 200,
          });
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
        agentGenesisPath: 'ecosystem/agent-genesis.json',
        skillsLobbyPath: 'ecosystem/skills/lobby.yml',
        agentRosterPath: 'agents/roster.yml',
        fleetAutospawnPath: 'ecosystem/fleet/autospawn.yml',
        holohealChecksPath: 'ecosystem/holoheal/checks.yml',
      }),
      repoImport: expect.objectContaining({
        workspaceId: 'ws_octocat',
        conversionRecommendationsPath: 'ecosystem/conversion-recommendations.json',
      }),
      daemon: expect.objectContaining({
        workspaceId: 'ws_octocat',
        agentConfigPath: 'agents/claude.yml',
        agentGenesisPath: 'ecosystem/agent-genesis.json',
        skillsLobbyPath: 'ecosystem/skills/lobby.yml',
        fleetAutospawnPath: 'ecosystem/fleet/autospawn.yml',
        holohealChecksPath: 'ecosystem/holoheal/checks.yml',
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
        '.env.example',
        'README.md',
        'profile.yml',
        'config.yml',
        'agents/claude.yml',
        'agents/gemini.yml',
        'agents/roster.yml',
        'ecosystem/secrets.manifest.yml',
        'ecosystem/account-workspace.json',
        'ecosystem/linked-repos.json',
        'ecosystem/board-state.json',
        'ecosystem/paper-unlocks.json',
        'ecosystem/conversion-recommendations.json',
        'ecosystem/agent-genesis.json',
        'ecosystem/skills/lobby.yml',
        'ecosystem/fleet/autospawn.yml',
        'ecosystem/holoheal/checks.yml',
        'ecosystem/holoheal/secret-grant-receipt.yml',
        'knowledge/wisdom/README.md',
        '.claude/CLAUDE.md',
      ])
    );

    const profile = pushedFiles.find((file) => file.path === 'profile.yml')?.content;
    expect(profile).toContain('workspace_id: "ws_octocat"');
    expect(profile).toContain('template: "ai-workspace-template"');

    const envExample = pushedFiles.find((file) => file.path === '.env.example')?.content ?? '';
    expect(envExample).toContain('HOLOSCRIPT_API_KEY=');
    expect(envExample).toContain('MCP_WORKSPACE_ID=ws_octocat');
    expect(envExample).toContain('GitHub Actions secret named HOLOSCRIPT_API_KEY');

    const secretManifest =
      pushedFiles.find((file) => file.path === 'ecosystem/secrets.manifest.yml')?.content ?? '';
    expect(secretManifest).toContain(
      'ref: "secret://workspace/ws_octocat/holoscript/orchestrator/api-key"'
    );
    expect(secretManifest).toContain('delivery: "studio-broker-or-github-actions-secret"');

    const agentGenesis = JSON.parse(
      pushedFiles.find((file) => file.path === 'ecosystem/agent-genesis.json')?.content ?? '{}'
    ) as {
      strategy: string;
      agents: Array<{ missionProfile: string; autospawn: boolean; daemonAgent: { rawSecretAccess: boolean } }>;
      secretBroker: { plaintextInWorkspace: boolean; handlesOnly: boolean };
      meshWiring: { holoheal: { incidentTarget: string; receiptTarget: string; trustTarget: string } };
    };
    expect(agentGenesis.strategy).toBe('skills-first-agent-genesis');
    expect(agentGenesis.agents.map((agent) => agent.missionProfile)).toEqual(
      expect.arrayContaining(['holoheal', 'secret-custodian', 'fleet-auditor', 'builder'])
    );
    expect(agentGenesis.agents.every((agent) => agent.daemonAgent.rawSecretAccess === false)).toBe(
      true
    );
    expect(agentGenesis.secretBroker).toMatchObject({
      plaintextInWorkspace: false,
      handlesOnly: true,
    });
    expect(agentGenesis.meshWiring.holoheal).toEqual({
      incidentTarget: 'HoloClaw',
      receiptTarget: 'HoloMesh',
      trustTarget: 'Fleet',
    });

    const skillsLobby = pushedFiles.find((file) => file.path === 'ecosystem/skills/lobby.yml')?.content ?? '';
    expect(skillsLobby).toContain('rule: "skills-first"');
    expect(skillsLobby).toContain('secret_token_or_oauth');

    const roster = pushedFiles.find((file) => file.path === 'agents/roster.yml')?.content ?? '';
    expect(roster).toContain('mission_profile: "holoheal"');
    expect(roster).toContain('raw_secret_access: false');

    const fleetAutospawn =
      pushedFiles.find((file) => file.path === 'ecosystem/fleet/autospawn.yml')?.content ?? '';
    expect(fleetAutospawn).toContain('receipt: "secret.granted"');
    expect(fleetAutospawn).toContain('incident_target: "HoloClaw"');

    const holohealChecks =
      pushedFiles.find((file) => file.path === 'ecosystem/holoheal/checks.yml')?.content ?? '';
    expect(holohealChecks).toContain('secret_manifest_handles_only');
    expect(holohealChecks).toContain('trust_target: "Fleet"');

    const receiptPolicy =
      pushedFiles.find((file) => file.path === 'ecosystem/holoheal/secret-grant-receipt.yml')?.content ?? '';
    expect(receiptPolicy).toContain('event: "secret.granted"');
    expect(receiptPolicy).toContain('plaintextReturned: false');

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
    expect(pushedFiles.map((file) => file.content).join('\n')).not.toContain(
      'mcp-provisioned-secret-key'
    );
    expect(pushedFiles.map((file) => file.path)).not.toContain('.env');
  });

  it('connects an existing repo only when it appears in the approved repo list', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      repoUrl: 'git@github.com:octocat/demo-app.git',
      approvedRepos: ['https://github.com/octocat/demo-app'],
      approvedScaffold: false,
      approvedAbsorb: false,
      approvedPublishKnowledge: false,
      approvedDaemon: false,
    });

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({
      workspaceId: 'ws_octocat',
      repoUrl: 'https://github.com/octocat/demo-app.git',
      repoName: 'demo-app',
      scaffolded: false,
      daemonStarted: false,
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/demo-app',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gho_customer_secret_token',
        }),
      })
    );
  });

  it('rejects existing repo provisioning when the repo was not approved', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      repoUrl: 'https://github.com/octocat/private-app.git',
      approvedRepos: ['octocat/demo-app'],
      approvedScaffold: false,
      approvedAbsorb: false,
      approvedPublishKnowledge: false,
      approvedDaemon: false,
    });

    expect(result.success).toBe(false);
    expect(result.errorStatus).toBe(403);
    expect(result.error).toMatch(/not approved/i);
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'ensure-repo',
          status: 'failed',
          detail: 'Repository octocat/private-app is not approved for Studio access.',
        }),
      ])
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
