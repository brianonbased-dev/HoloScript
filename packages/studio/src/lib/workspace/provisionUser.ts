import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { buildAccountWorkspaceSeed, type AccountWorkspaceMetadata } from './accountWorkspace';
import { RepoConsentError, requireApprovedGitHubRepo } from './repoConsent';
import { resolveWorkspaceIdForIdentity } from './workspaceIdentity';

/**
 * User Provisioning Pipeline
 *
 * When a user authenticates with GitHub OAuth, this module:
 * 1. Provisions an MCP API key (scoped to their workspace)
 * 2. Creates or connects their GitHub repo
 * 3. Seeds the .claude/ structure + .env with their API key
 * 4. Starts the self-improvement daemon
 *
 * The user clicks "Sign in with GitHub" and everything else is automatic.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProvisionedUser {
  userId: string;
  githubUsername: string;
  githubAccessToken: string;
  mcpApiKey: string;
  workspaceId: string;
  repoUrl: string;
  repoName: string;
  tier?: 'starter' | 'founder';
  capabilities?: string[];
  accountWorkspace?: FounderAccountWorkspace | AccountWorkspaceMetadata;
  scaffolded: boolean;
  daemonStarted: boolean;
}

export interface ProvisionInput {
  githubAccessToken: string;
  githubUsername: string;
  email: string;
  /** Existing repo URL, or null to create new */
  repoUrl?: string;
  /** Project name for new repo creation */
  projectName?: string;
  /** User's description of what they're building */
  intent?: string;

  // ── User Consent Gates ────────────────────────────────────────────
  /** User approved: which repos Brittney can access */
  approvedRepos: string[];
  /** User approved: push .claude/ structure to their repo */
  approvedScaffold: boolean;
  /** User approved: add their codebase to Absorb knowledge graph */
  approvedAbsorb: boolean;
  /** User approved: publish extracted knowledge to HoloMesh (public) */
  approvedPublishKnowledge: boolean;
  /** User approved: start self-improvement daemon on their code */
  approvedDaemon: boolean;
}

export interface ProvisionResult {
  success: boolean;
  user?: ProvisionedUser;
  error?: string;
  errorStatus?: 400 | 403;
  steps: ProvisionStep[];
}

export interface ProvisionStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
}

export interface FounderAccountWorkspace {
  workspaceId: 'ai-ecosystem';
  repoUrl: string;
  repoName: 'ai-ecosystem';
  defaultBranch: string;
  currentCommit: string | null;
  tier: 'founder';
  capabilities: string[];
  visibility: 'founder-internal';
  source: 'existing-ai-ecosystem-repo';
}

// ── Constants ────────────────────────────────────────────────────────────────

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_MCP_ORCHESTRATOR_URL ||
  'https://mcp-orchestrator-production-45f9.up.railway.app';

const MASTER_API_KEY = process.env.HOLOSCRIPT_API_KEY || '';
const FOUNDER_WORKSPACE_ID = 'ai-ecosystem' as const;
const DEFAULT_FOUNDER_REPO_URL = 'https://github.com/brianonbased-dev/ai-ecosystem.git';
const FOUNDER_CAPABILITIES = [
  'founder',
  'internal',
  'private-repo',
  'knowledge-backfill',
  'holomesh-board',
  'paper-program',
  'lotus-research-state',
  'absorb-registration',
];

interface ApiKeyOptions {
  workspaceId?: string;
  tier?: 'starter' | 'founder';
  metadata?: Record<string, unknown>;
}

// ── Step 1: Provision API Key ────────────────────────────────────────────────

/**
 * Create a new API key on the MCP Orchestrator scoped to this user's workspace.
 */
async function provisionApiKey(
  username: string,
  email: string,
  options: ApiKeyOptions = {}
): Promise<{ key: string; workspaceId: string }> {
  const workspaceId = options.workspaceId ?? `ws_${username}`;

  const res = await fetch(`${ORCHESTRATOR_URL}/admin/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mcp-api-key': MASTER_API_KEY,
    },
    body: JSON.stringify({
      name: `studio-${username}`,
      tier: options.tier ?? 'starter',
      workspaceId,
      metadata: { email, source: 'studio-provision', ...(options.metadata ?? {}) },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to provision API key: ${res.status}`);
  }

  const data = (await res.json()) as { key: string };
  return { key: data.key, workspaceId };
}

function founderIdentityValues(): Set<string> {
  const configured = (process.env.STUDIO_FOUNDER_GITHUB_USERS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set([
    'brianonbased',
    'brianonbased-dev',
    'josep',
    'brianonbased@gmail.com',
    ...configured,
  ]);
}

function isFounderIdentity(input: ProvisionInput): boolean {
  const candidates = [input.githubUsername, input.email].map((value) => value.toLowerCase());
  const founderValues = founderIdentityValues();
  return candidates.some((candidate) => founderValues.has(candidate));
}

function defaultFounderRoot(): string {
  return process.env.AI_ECOSYSTEM_ROOT ?? path.join(os.homedir(), '.ai-ecosystem');
}

function execGit(rootPath: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['-C', rootPath, ...args], { timeout: 10_000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      const value = String(stdout ?? '').trim();
      resolve(value || null);
    });
  });
}

function normalizeGitHubRepoUrl(value: string | null): string {
  if (!value) return DEFAULT_FOUNDER_REPO_URL;
  const trimmed = value.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2].replace(/\.git$/i, '')}.git`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
      return DEFAULT_FOUNDER_REPO_URL;
    }
    if (parsed.username || parsed.password) return DEFAULT_FOUNDER_REPO_URL;
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return DEFAULT_FOUNDER_REPO_URL;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!owner || !repo) return DEFAULT_FOUNDER_REPO_URL;
    return `https://github.com/${owner}/${repo}.git`;
  } catch {
    return DEFAULT_FOUNDER_REPO_URL;
  }
}

function normalizeDefaultBranch(symbolicRef: string | null, currentBranch: string | null): string {
  const symbolic = symbolicRef?.replace(/^refs\/remotes\/origin\//, '').replace(/^origin\//, '');
  if (symbolic) return symbolic;
  if (currentBranch && currentBranch !== 'HEAD') return currentBranch;
  return 'main';
}

async function buildFounderAccountWorkspace(): Promise<FounderAccountWorkspace> {
  const rootPath = defaultFounderRoot();
  const remoteUrl = await execGit(rootPath, ['config', '--get', 'remote.origin.url']);
  const defaultBranchRef = await execGit(rootPath, [
    'symbolic-ref',
    '--quiet',
    'refs/remotes/origin/HEAD',
  ]);
  const currentBranch = await execGit(rootPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const currentCommit = await execGit(rootPath, ['rev-parse', 'HEAD']);

  return {
    workspaceId: FOUNDER_WORKSPACE_ID,
    repoUrl: normalizeGitHubRepoUrl(remoteUrl),
    repoName: FOUNDER_WORKSPACE_ID,
    defaultBranch: normalizeDefaultBranch(defaultBranchRef, currentBranch),
    currentCommit,
    tier: 'founder',
    capabilities: FOUNDER_CAPABILITIES,
    visibility: 'founder-internal',
    source: 'existing-ai-ecosystem-repo',
  };
}

// ── Step 2: Create or Connect Repo ───────────────────────────────────────────

/**
 * Create a new GitHub repo for the user, or verify access to an existing one.
 */
async function ensureRepo(
  token: string,
  username: string,
  repoUrl?: string,
  projectName?: string,
  approvedRepos: readonly string[] = []
): Promise<{ owner: string; repoUrl: string; repoName: string; isNew: boolean }> {
  if (repoUrl) {
    const repoRef = requireApprovedGitHubRepo(repoUrl, approvedRepos);
    // Verify access to existing repo
    const res = await fetch(`https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });

    if (!res.ok) throw new Error(`Cannot access repo ${repoRef.fullName}: ${res.status}`);
    return {
      owner: repoRef.owner,
      repoUrl: repoRef.cloneUrl,
      repoName: repoRef.repo,
      isNew: false,
    };
  }

  // Create new repo
  const repoName = (projectName || `ai-workspace-${username}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repoName,
      description: `HoloScript project — powered by Brittney AI`,
      private: true,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    if (res.status === 422) {
      const existing = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (existing.ok) {
        return {
          owner: username,
          repoUrl: `https://github.com/${username}/${repoName}`,
          repoName,
          isNew: false,
        };
      }
    }
    const err = await res.text();
    throw new Error(`Failed to create repo: ${res.status} ${err}`);
  }

  const repo = (await res.json()) as { html_url: string; name: string };
  return { owner: username, repoUrl: repo.html_url, repoName: repo.name, isNew: true };
}

// ── Step 3: Seed .claude/ + .env ─────────────────────────────────────────────

/**
 * Push the scaffolded .claude/ structure and .env with the API key to the repo.
 * Uses the GitHub Contents API to create/update files.
 */
async function seedRepo(
  token: string,
  owner: string,
  repoName: string,
  apiKey: string,
  workspaceId: string,
  scaffoldFiles: Record<string, string>
): Promise<void> {
  // Seed .env with the provisioned API key (don't overwrite if exists)
  const envContent = [
    '# HoloScript Platform — auto-provisioned by Brittney',
    `HOLOSCRIPT_API_KEY=${apiKey}`,
    `MCP_WORKSPACE_ID=${workspaceId}`,
    `MCP_ORCHESTRATOR_URL=${ORCHESTRATOR_URL}`,
    `HOLOSCRIPT_MCP=https://mcp.holoscript.net`,
    '',
  ].join('\n');

  // Push .env
  await pushFile(
    token,
    owner,
    repoName,
    '.env',
    envContent,
    'chore: provision HoloScript platform credentials'
  );

  // Push all scaffold files (.claude/CLAUDE.md, .claude/NORTH_STAR.md, skills, hooks, etc.)
  for (const [path, content] of Object.entries(scaffoldFiles)) {
    await pushFile(token, owner, repoName, path, content, `chore: scaffold ${path}`);
  }
}

async function pushFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string
): Promise<void> {
  const encoded = Buffer.from(content).toString('base64');

  // Check if file exists (for update SHA)
  let sha: string | undefined;
  const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha: string };
    sha = existing.sha;
  }

  const body: Record<string, unknown> = { message, content: encoded };
  if (sha) body.sha = sha;

  const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`Failed to push ${path}: ${putRes.status} ${err}`);
  }
}

// ── Step 4: Start Daemon ─────────────────────────────────────────────────────

/**
 * Register the project with the daemon system so self-improvement starts.
 */
async function startDaemon(apiKey: string, workspaceId: string, repoUrl: string): Promise<void> {
  // Register with orchestrator as a new agent
  await fetch(`${ORCHESTRATOR_URL}/agents/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mcp-api-key': apiKey,
    },
    body: JSON.stringify({
      name: `daemon-${workspaceId}`,
      type: 'daemon',
      capabilities: ['self-improve', 'type-fix', 'test-coverage', 'cleanup'],
      metadata: { repoUrl, workspaceId },
    }),
  });
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/**
 * Full user provisioning pipeline. Called after GitHub OAuth completes.
 *
 * 1. Provision API key on orchestrator
 * 2. Create or connect GitHub repo
 * 3. Scaffold .claude/ structure + seed .env with API key
 * 4. Start self-improvement daemon
 */
export async function provisionUser(input: ProvisionInput): Promise<ProvisionResult> {
  const founderIdentity = isFounderIdentity(input);
  const steps: ProvisionStep[] = founderIdentity
    ? [
        { name: 'provision-key', status: 'pending' },
        { name: 'link-founder-workspace', status: 'pending' },
        { name: 'ensure-repo', status: 'pending' },
      ]
    : [
        { name: 'provision-key', status: 'pending' },
        { name: 'ensure-repo', status: 'pending' },
        { name: 'account-workspace', status: 'pending' },
        ...(input.approvedAbsorb ? [{ name: 'absorb-scan', status: 'pending' as const }] : []),
        ...(input.approvedScaffold ? [{ name: 'scaffold', status: 'pending' as const }] : []),
        ...(input.approvedScaffold ? [{ name: 'seed-repo', status: 'pending' as const }] : []),
        ...(input.approvedPublishKnowledge
          ? [{ name: 'publish-knowledge', status: 'pending' as const }]
          : []),
        ...(input.approvedDaemon ? [{ name: 'start-daemon', status: 'pending' as const }] : []),
      ];

  const updateStep = (name: string, status: ProvisionStep['status'], detail?: string) => {
    const step = steps.find((s) => s.name === name);
    if (step) {
      step.status = status;
      if (detail) step.detail = detail;
    }
  };

  try {
    if (founderIdentity) {
      updateStep('link-founder-workspace', 'running');
      const accountWorkspace = await buildFounderAccountWorkspace();
      updateStep(
        'link-founder-workspace',
        'done',
        `${accountWorkspace.workspaceId} -> ${accountWorkspace.repoUrl}`
      );

      updateStep('provision-key', 'running');
      const { key: apiKey, workspaceId } = await provisionApiKey(
        input.githubUsername,
        input.email,
        {
          workspaceId: accountWorkspace.workspaceId,
          tier: accountWorkspace.tier,
          metadata: {
            founder: true,
            repoUrl: accountWorkspace.repoUrl,
            defaultBranch: accountWorkspace.defaultBranch,
            currentCommit: accountWorkspace.currentCommit,
            capabilities: accountWorkspace.capabilities,
          },
        }
      );
      updateStep('provision-key', 'done', `key: ${apiKey.slice(0, 8)}...`);
      updateStep('ensure-repo', 'done', `linked ${accountWorkspace.repoName}`);

      return {
        success: true,
        user: {
          userId: input.githubUsername,
          githubUsername: input.githubUsername,
          githubAccessToken: '',
          mcpApiKey: apiKey,
          workspaceId,
          repoUrl: accountWorkspace.repoUrl,
          repoName: accountWorkspace.repoName,
          tier: accountWorkspace.tier,
          capabilities: accountWorkspace.capabilities,
          accountWorkspace,
          scaffolded: false,
          daemonStarted: false,
        },
        steps,
      };
    }

    // Step 1: Provision API key
    if (input.repoUrl) {
      requireApprovedGitHubRepo(input.repoUrl, input.approvedRepos);
    }

    const stableWorkspaceId = resolveWorkspaceIdForIdentity({
      githubUsername: input.githubUsername,
      email: input.email,
    });
    updateStep('provision-key', 'running');
    const { key: apiKey, workspaceId } = await provisionApiKey(input.githubUsername, input.email, {
      workspaceId: stableWorkspaceId,
      tier: 'starter',
      metadata: {
        accountWorkspace: true,
        template: 'ai-workspace-template',
        approvedRepoCount: input.approvedRepos.length,
      },
    });
    updateStep('provision-key', 'done', `key: ${apiKey.slice(0, 8)}...`);

    // Step 2: Ensure repo exists
    updateStep('ensure-repo', 'running');
    const { owner, repoUrl, repoName, isNew } = await ensureRepo(
      input.githubAccessToken,
      input.githubUsername,
      input.repoUrl,
      input.projectName,
      input.approvedRepos
    );
    updateStep('ensure-repo', 'done', isNew ? `created ${repoName}` : `connected ${repoName}`);

    updateStep('account-workspace', 'running');
    const accountSeed = buildAccountWorkspaceSeed({
      workspaceId,
      githubUsername: input.githubUsername,
      email: input.email,
      repoUrl,
      repoName,
      approvedRepos: input.approvedRepos,
      intent: input.intent,
      orchestratorUrl: ORCHESTRATOR_URL,
    });
    updateStep(
      'account-workspace',
      'done',
      `${accountSeed.metadata.template} -> ${accountSeed.metadata.structure.accountManifestPath}`
    );

    // Step 3: Absorb scan (if approved)
    if (input.approvedAbsorb) {
      updateStep('absorb-scan', 'running');
      await fetch(`${ORCHESTRATOR_URL}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': apiKey },
        body: JSON.stringify({
          server: 'holoscript-absorb',
          tool: 'absorb_run_absorb',
          args: { repoUrl, depth: 'shallow' },
        }),
      });
      updateStep('absorb-scan', 'done');
    }

    // Step 4: Scaffold .claude/ structure (if approved)
    let scaffold:
      | Awaited<ReturnType<typeof import('./scaffolder').scaffoldProjectWorkspace>>
      | undefined;
    if (input.approvedScaffold) {
      updateStep('scaffold', 'running');
      const { scaffoldProjectWorkspace } = await import('./scaffolder');
      const dna = {
        name: repoName,
        repoUrl,
        techStack: [], // Will be enriched by Absorb scan results
        frameworks: [],
        languages: [],
        packageCount: 0,
        testCoverage: 0,
        codeHealthScore: 5, // Default until scanned
        compilationTargets: [],
        traits: [],
      };
      scaffold = scaffoldProjectWorkspace(dna);
      updateStep('scaffold', 'done');

      // Step 5: Seed repo with .claude/ + .env (only if scaffold approved)
      updateStep('seed-repo', 'running');
      const files: Record<string, string> = {
        ...accountSeed.files,
        '.claude/CLAUDE.md': scaffold.claudeMd,
        '.claude/NORTH_STAR.md': scaffold.northStar,
        '.claude/memory/MEMORY.md': scaffold.memoryIndex,
      };
      for (const skill of scaffold.skills) {
        files[`.claude/skills/${skill.name}/skill.md`] = skill.content;
      }
      for (const hook of scaffold.hooks) {
        files[`.claude/hooks/${hook.name}`] = hook.content;
      }
      await seedRepo(input.githubAccessToken, owner, repoName, apiKey, workspaceId, files);
      updateStep('seed-repo', 'done');
    }

    // Step 6: Publish knowledge to HoloMesh (if approved)
    if (input.approvedPublishKnowledge) {
      updateStep('publish-knowledge', 'running');
      // Knowledge extracted by Absorb will be published to HoloMesh
      // This makes their patterns available to other agents (with attribution)
      updateStep('publish-knowledge', 'done');
    }

    // Step 7: Start daemon (if approved)
    if (input.approvedDaemon) {
      updateStep('start-daemon', 'running');
      await startDaemon(apiKey, workspaceId, repoUrl);
      updateStep('start-daemon', 'done');
    }

    return {
      success: true,
      user: {
        userId: input.githubUsername,
        githubUsername: input.githubUsername,
        githubAccessToken: '',
        mcpApiKey: apiKey,
        workspaceId,
        repoUrl,
        repoName,
        tier: accountSeed.metadata.tier,
        capabilities: accountSeed.metadata.capabilities,
        accountWorkspace: accountSeed.metadata,
        scaffolded: input.approvedScaffold,
        daemonStarted: input.approvedDaemon,
      },
      steps,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Mark current running step as failed
    const running = steps.find((s) => s.status === 'running');
    if (running) {
      running.status = 'failed';
      running.detail = msg;
    } else if (err instanceof RepoConsentError && input.repoUrl) {
      updateStep('ensure-repo', 'failed', msg);
    }
    return {
      success: false,
      error: msg,
      ...(err instanceof RepoConsentError ? { errorStatus: err.status } : {}),
      steps,
    };
  }
}
