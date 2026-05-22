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
  const savedHoloMeshKey = process.env.HOLOMESH_API_KEY;
  const savedMcpServerUrl = process.env.MCP_SERVER_URL;
  let publishStatus = 200;
  let extractEntries: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STUDIO_FOUNDER_GITHUB_USERS = 'brianonbased-dev';
    process.env.HOLOSCRIPT_API_KEY = 'master-key';
    process.env.HOLOMESH_API_KEY = 'holomesh-publish-key';
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    publishStatus = 200;
    extractEntries = [
      {
        type: 'wisdom',
        content: 'Starter workspaces should keep W/P/G entries attributable to the source repo.',
        tags: ['absorb'],
        confidence: 0.92,
      },
    ];
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
        if (href.includes('/tools/call')) {
          const payload = JSON.parse(String(init?.body ?? '{}')) as { tool?: string };
          if (payload.tool === 'absorb_run_absorb') {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }
          if (payload.tool === 'absorb_extract_knowledge') {
            return new Response(JSON.stringify({ entries: extractEntries }), { status: 200 });
          }
        }
        if (href === 'https://mcp.test/api/holomesh/contribute' && method === 'POST') {
          return new Response(
            publishStatus === 200 ? JSON.stringify({ id: 'entry_1' }) : 'publish failed',
            {
              status: publishStatus,
            }
          );
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
    if (savedHoloMeshKey === undefined) {
      delete process.env.HOLOMESH_API_KEY;
    } else {
      process.env.HOLOMESH_API_KEY = savedHoloMeshKey;
    }
    if (savedMcpServerUrl === undefined) {
      delete process.env.MCP_SERVER_URL;
    } else {
      process.env.MCP_SERVER_URL = savedMcpServerUrl;
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
        holodoorPolicyPath: 'ecosystem/holodoor/policy.json',
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
        holodoorPolicyPath: 'ecosystem/holodoor/policy.json',
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
        'ecosystem/holodoor/policy.json',
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
    // "GitHub Actions secret named HOLOSCRIPT_API_KEY" is in secrets.manifest.yml, not .env.example
    expect(envExample).toContain('HOLOMESH_AGENT_ID=');
    expect(envExample).toContain('HOLOMESH_WALLET_ADDRESS=');

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
      agents: Array<{
        missionProfile: string;
        autospawn: boolean;
        daemonAgent: { rawSecretAccess: boolean };
      }>;
      secretBroker: { plaintextInWorkspace: boolean; handlesOnly: boolean };
      meshWiring: {
        holoheal: {
          policyGate: string;
          incidentTarget: string;
          receiptTarget: string;
          trustTarget: string;
        };
        holodoor: { policyPath: string; telemetryTarget: string; gates: string[] };
      };
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
      policyGate: 'HoloDoor',
      incidentTarget: 'HoloClaw',
      receiptTarget: 'HoloMesh',
      trustTarget: 'Fleet',
    });
    expect(agentGenesis.meshWiring.holodoor).toEqual({
      policyPath: 'ecosystem/holodoor/policy.json',
      telemetryTarget: 'HoloMesh',
      gates: ['tool-use', 'mcp-config', 'secret-grant'],
    });

    const skillsLobby =
      pushedFiles.find((file) => file.path === 'ecosystem/skills/lobby.yml')?.content ?? '';
    expect(skillsLobby).toContain('rule: "skills-first"');
    expect(skillsLobby).toContain('secret_token_or_oauth');
    expect(skillsLobby).toContain('HoloDoor');

    const roster = pushedFiles.find((file) => file.path === 'agents/roster.yml')?.content ?? '';
    expect(roster).toContain('mission_profile: "holoheal"');
    expect(roster).toContain('policy_path: "ecosystem/holodoor/policy.json"');
    expect(roster).toContain('raw_secret_access: false');

    const fleetAutospawn =
      pushedFiles.find((file) => file.path === 'ecosystem/fleet/autospawn.yml')?.content ?? '';
    expect(fleetAutospawn).toContain('receipt: "secret.granted"');
    expect(fleetAutospawn).toContain('incident_target: "HoloClaw"');
    expect(fleetAutospawn).toContain('policy_gate: "HoloDoor"');

    const holohealChecks =
      pushedFiles.find((file) => file.path === 'ecosystem/holoheal/checks.yml')?.content ?? '';
    expect(holohealChecks).toContain('secret_manifest_handles_only');
    expect(holohealChecks).toContain('holodoor_policy_present');
    expect(holohealChecks).toContain('trust_target: "Fleet"');

    const holodoorPolicy = JSON.parse(
      pushedFiles.find((file) => file.path === 'ecosystem/holodoor/policy.json')?.content ?? '{}'
    ) as {
      schemaVersion: string;
      secretGrants: {
        allowedSecretRefPrefixes: string[];
        allowedCapabilityRefs: string[];
        maxTtlSeconds: number;
      };
      telemetry: { redact: string };
      enforcement: { onViolation: string };
    };
    expect(holodoorPolicy).toMatchObject({
      schemaVersion: '1.0.0',
      secretGrants: {
        allowedSecretRefPrefixes: ['secret://workspace/ws_octocat/'],
        allowedCapabilityRefs: expect.arrayContaining(['cap://daemon/secrets/broker-only']),
        maxTtlSeconds: 900,
      },
      telemetry: { redact: 'strict' },
      enforcement: { onViolation: 'warn' },
    });

    const receiptPolicy =
      pushedFiles.find((file) => file.path === 'ecosystem/holoheal/secret-grant-receipt.yml')
        ?.content ?? '';
    expect(receiptPolicy).toContain('event: "secret.granted"');
    expect(receiptPolicy).toContain('plaintextReturned: false');
    expect(receiptPolicy).toContain('policyDecisionId');

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
  }, 30_000);

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

  it('publishes extracted knowledge with attribution when consent is approved', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      approvedRepos: [],
      approvedScaffold: false,
      approvedAbsorb: true,
      approvedPublishKnowledge: true,
      approvedDaemon: false,
      intent: 'Ship a HoloScript starter workspace',
    });

    expect(result.success).toBe(true);
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'absorb-scan', status: 'done' }),
        expect.objectContaining({
          name: 'publish-knowledge',
          status: 'done',
          detail: 'published 1 knowledge entries',
        }),
      ])
    );

    const fetchMock = vi.mocked(fetch);
    const toolPayloads = fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/tools/call'))
      .map(
        ([, init]) =>
          JSON.parse(String(init?.body ?? '{}')) as { tool: string; args: Record<string, unknown> }
      );
    expect(toolPayloads.map((payload) => payload.tool)).toEqual([
      'absorb_run_absorb',
      'absorb_extract_knowledge',
    ]);
    expect(toolPayloads[1].args).toMatchObject({
      workspaceId: 'ws_octocat',
      repoUrl: 'https://github.com/octocat/ai-workspace-octocat',
    });

    const [, publishInit] = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/holomesh/contribute')
    ) as [string, RequestInit];
    const published = JSON.parse(String(publishInit.body)) as {
      type: string;
      content: string;
      domain: string;
      tags: string[];
      metadata: {
        attribution: Record<string, string>;
        provenance: Record<string, string | null>;
      };
    };

    expect(publishInit.headers).toMatchObject({
      Authorization: 'Bearer holomesh-publish-key',
    });
    expect(published).toMatchObject({
      type: 'wisdom',
      content: 'Starter workspaces should keep W/P/G entries attributable to the source repo.',
      domain: 'ws_octocat',
      tags: expect.arrayContaining(['absorb', 'studio-provision', 'workspace:ws_octocat']),
    });
    expect(published.metadata.attribution).toMatchObject({
      githubUsername: 'octocat',
      workspaceId: 'ws_octocat',
      repoUrl: 'https://github.com/octocat/ai-workspace-octocat',
      repoName: 'ai-workspace-octocat',
    });
    expect(published.metadata.provenance).toMatchObject({
      tool: 'absorb_extract_knowledge',
      intent: 'Ship a HoloScript starter workspace',
    });
  });

  it('fails the publish step when HoloMesh publication fails', async () => {
    publishStatus = 500;

    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      approvedRepos: [],
      approvedScaffold: false,
      approvedAbsorb: true,
      approvedPublishKnowledge: true,
      approvedDaemon: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Knowledge publication failed/i);
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'publish-knowledge',
          status: 'failed',
          detail: expect.stringMatching(/publish failed/i),
        }),
      ])
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

// ── E2E Smoke Test: HoloMesh Identity Registration ──────────────────────────────
//
// Verifies the full provision → HoloMesh register → identity display flow:
// 1. registerHolomeshAgent returns agentId, apiKey, walletAddress
// 2. These values propagate through provisionUser result
// 3. .env.example and .env.identity.example contain identity fields
// 4. The FirstRunWizard success step would display these values

describe('E2E smoke: provision → HoloMesh identity → display', () => {
  const savedFounderUsers = process.env.STUDIO_FOUNDER_GITHUB_USERS;
  const savedMasterKey = process.env.HOLOSCRIPT_API_KEY;
  const savedHoloMeshKey = process.env.HOLOMESH_API_KEY;
  const savedMcpServerUrl = process.env.MCP_SERVER_URL;

  // Stable test identity values
  const TEST_AGENT_ID = 'agent_studio_octocat_ws_octocat';
  const TEST_HOLOMESH_API_KEY = 'hs_sk_test_octocat_identity_key_abc123';
  const TEST_WALLET_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';

  let holomeshRegisterStatus = 200;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STUDIO_FOUNDER_GITHUB_USERS = 'brianonbased-dev';
    process.env.HOLOSCRIPT_API_KEY = 'master-key';
    process.env.HOLOMESH_API_KEY = 'holomesh-publish-key';
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    holomeshRegisterStatus = 200;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        const method = init?.method ?? 'GET';

        // HoloMesh agent registration
        if (href.includes('/api/holomesh/register') && method === 'POST') {
          if (holomeshRegisterStatus !== 200) {
            return new Response(JSON.stringify({ error: 'registration failed' }), {
              status: holomeshRegisterStatus,
            });
          }
          return new Response(
            JSON.stringify({
              agentId: TEST_AGENT_ID,
              apiKey: TEST_HOLOMESH_API_KEY,
              walletAddress: TEST_WALLET_ADDRESS,
            }),
            { status: 200 }
          );
        }

        // Orchestrator API key provisioning
        if (href.includes('/admin/keys')) {
          return new Response(JSON.stringify({ key: 'mcp-provisioned-secret-key' }), {
            status: 200,
          });
        }

        // HoloMesh contribute (knowledge publish)
        if (href === 'https://mcp.test/api/holomesh/contribute' && method === 'POST') {
          return new Response(JSON.stringify({ id: 'entry_1' }), { status: 200 });
        }

        // GitHub repo creation
        if (href === 'https://api.github.com/user/repos' && method === 'POST') {
          return new Response(
            JSON.stringify({
              html_url: 'https://github.com/octocat/ai-workspace-octocat',
              name: 'ai-workspace-octocat',
            }),
            { status: 201 }
          );
        }

        // GitHub file push
        if (href.includes('/contents/') && method === 'PUT') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        // GitHub file read (for update SHA check)
        if (href.includes('/contents/')) {
          return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
        }

        // GitHub repo access check
        if (href.includes('/repos/octocat/')) {
          return new Response(JSON.stringify({ name: href.split('/').pop() }), { status: 200 });
        }

        // Absorb tool calls
        if (href.includes('/tools/call')) {
          const payload = JSON.parse(String(init?.body ?? '{}')) as { tool?: string };
          if (payload.tool === 'absorb_run_absorb') {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }
          if (payload.tool === 'absorb_extract_knowledge') {
            return new Response(JSON.stringify({ entries: [] }), { status: 200 });
          }
        }

        return new Response(JSON.stringify({ error: `unexpected fetch ${href}` }), {
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
    if (savedHoloMeshKey === undefined) {
      delete process.env.HOLOMESH_API_KEY;
    } else {
      process.env.HOLOMESH_API_KEY = savedHoloMeshKey;
    }
    if (savedMcpServerUrl === undefined) {
      delete process.env.MCP_SERVER_URL;
    } else {
      process.env.MCP_SERVER_URL = savedMcpServerUrl;
    }
    vi.unstubAllGlobals();
  });

  it('provisions HoloMesh agent identity and propagates to provision result', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      approvedRepos: [],
      approvedScaffold: true,
      approvedAbsorb: false,
      approvedPublishKnowledge: false,
      approvedDaemon: false,
    });

    expect(result.success).toBe(true);

    // HoloMesh identity fields MUST be present
    expect(result.user?.holomeshAgentId).toBe(TEST_AGENT_ID);
    expect(result.user?.holomeshApiKey).toBe(TEST_HOLOMESH_API_KEY);
    expect(result.user?.holomeshWalletAddress).toBe(TEST_WALLET_ADDRESS);

    // Step tracking — register-holomesh-agent must be done
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'register-holomesh-agent',
          status: 'done',
          detail: expect.stringContaining(TEST_AGENT_ID),
        }),
      ])
    );

    // Verify the HoloMesh registration call happened with correct params
    const fetchMock = vi.mocked(fetch);
    const registerCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/holomesh/register') && init?.method === 'POST'
    );
    expect(registerCall).toBeDefined();
    const registerPayload = JSON.parse(
      String(registerCall![1]?.body ?? '{}')
    ) as { name: string };
    expect(registerPayload.name).toBe('studio-octocat');

    // Verify the API key was passed as header
    const registerHeaders = registerCall![1]?.headers as Record<string, string>;
    expect(registerHeaders['x-mcp-api-key']).toBe('mcp-provisioned-secret-key');
  });

  it('seeds .env.example with HoloMesh identity fields when identity is registered', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      approvedRepos: [],
      approvedScaffold: true,
      approvedAbsorb: false,
      approvedPublishKnowledge: false,
      approvedDaemon: false,
    });

    expect(result.success).toBe(true);

    // Collect all pushed files from fetch mock
    const fetchMock = vi.mocked(fetch);
    const pushedFiles = fetchMock.mock.calls
      .filter(([url, init]) => init?.method === 'PUT')
      .map(([url, init]) => {
        const pathPart = decodeURIComponent(String(url).split('/contents/')[1] ?? '');
        const body = JSON.parse(String(init?.body)) as { content: string };
        return {
          path: pathPart,
          content: Buffer.from(body.content, 'base64').toString('utf-8'),
        };
      });

    // .env.example MUST contain HoloMesh identity fields
    const envExample = pushedFiles.find((f) => f.path === '.env.example');
    expect(envExample).toBeDefined();
    expect(envExample!.content).toContain('HOLOMESH_API_KEY=');
    expect(envExample!.content).toContain(`HOLOMESH_AGENT_ID=${TEST_AGENT_ID}`);
    expect(envExample!.content).toContain(`HOLOMESH_WALLET_ADDRESS=${TEST_WALLET_ADDRESS}`);
    expect(envExample!.content).toContain('HOLOMESH_WALLET_KEY=');

    // .env.identity.example MUST contain wallet address
    const envIdentity = pushedFiles.find((f) => f.path === '.env.identity.example');
    expect(envIdentity).toBeDefined();
    expect(envIdentity!.content).toContain(`HOLOMESH_WALLET_ADDRESS=${TEST_WALLET_ADDRESS}`);
    expect(envIdentity!.content).toContain('HOLOMESH_WALLET_KEY=');

    // secrets.manifest.yml MUST reference HoloMesh API key
    const secretsManifest = pushedFiles.find(
      (f) => f.path === 'ecosystem/secrets.manifest.yml'
    );
    expect(secretsManifest).toBeDefined();
    expect(secretsManifest!.content).toContain('HOLOMESH_API_KEY');
  });

  it('marks register-holomesh-agent as failed but continues when HoloMesh registration is down', async () => {
    holomeshRegisterStatus = 503;

    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      approvedRepos: [],
      approvedScaffold: true,
      approvedAbsorb: false,
      approvedPublishKnowledge: false,
      approvedDaemon: false,
    });

    // Provision still succeeds — HoloMesh registration is non-fatal
    expect(result.success).toBe(true);

    // Identity fields are undefined when registration fails
    expect(result.user?.holomeshAgentId).toBeUndefined();
    expect(result.user?.holomeshApiKey).toBeUndefined();
    expect(result.user?.holomeshWalletAddress).toBeUndefined();

    // Step marked as failed with retry hint
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'register-holomesh-agent',
          status: 'failed',
          detail: expect.stringContaining('retry'),
        }),
      ])
    );

    // .env.example still exists but with empty identity values
    const fetchMock = vi.mocked(fetch);
    const pushedFiles = fetchMock.mock.calls
      .filter(([url, init]) => init?.method === 'PUT')
      .map(([url, init]) => {
        const pathPart = decodeURIComponent(String(url).split('/contents/')[1] ?? '');
        const body = JSON.parse(String(init?.body)) as { content: string };
        return {
          path: pathPart,
          content: Buffer.from(body.content, 'base64').toString('utf-8'),
        };
      });

    const envExample = pushedFiles.find((f) => f.path === '.env.example');
    expect(envExample).toBeDefined();
    expect(envExample!.content).toContain('HOLOMESH_AGENT_ID=');
    expect(envExample!.content).toContain('HOLOMESH_WALLET_ADDRESS=');
  });

  it('does not leak githubAccessToken into pushed files or provision result', async () => {
    const result = await provisionUser({
      githubAccessToken: 'gho_customer_secret_token',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
      approvedRepos: [],
      approvedScaffold: true,
      approvedAbsorb: false,
      approvedPublishKnowledge: false,
      approvedDaemon: false,
    });

    expect(result.success).toBe(true);

    // Result JSON must not contain the access token
    const resultJson = JSON.stringify(result.user);
    expect(resultJson).not.toContain('gho_customer_secret_token');

    // Pushed files must not contain the access token
    const fetchMock = vi.mocked(fetch);
    const pushedContent = fetchMock.mock.calls
      .filter(([url, init]) => init?.method === 'PUT')
      .map(([url, init]) => {
        const body = JSON.parse(String(init?.body)) as { content: string };
        return Buffer.from(body.content, 'base64').toString('utf-8');
      })
      .join('\n');
    expect(pushedContent).not.toContain('gho_customer_secret_token');
  });
});
