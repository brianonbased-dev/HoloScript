import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import {
  publishKnowledgeEntries,
  type KnowledgePublicationEntry,
} from '@/lib/knowledgePublication';
import { buildAccountWorkspaceSeed, type AccountWorkspaceMetadata } from './accountWorkspace';
import { RepoConsentError, requireApprovedGitHubRepo } from './repoConsent';
import { resolveWorkspaceIdForIdentity } from './workspaceIdentity';

/**
 * User Provisioning Pipeline
 *
 * When a user authenticates with GitHub OAuth, this module:
 * 1. Provisions an MCP API key (scoped to their workspace)
 * 2. Creates or connects their GitHub repo
 * 3. Seeds the .claude/ structure + secret references for their API key
 * 4. Starts the HoloHeal-capable daemon
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
  /** HoloMesh agent identity — write-once, never overwrite (GOLD G.016) */
  holomeshAgentId?: string;
  holomeshApiKey?: string;
  holomeshWalletAddress?: string;
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
  /** User approved: start the resident HoloDaemon on their code */
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

interface ExtractKnowledgeContext {
  apiKey: string;
  workspaceId: string;
  repoUrl: string;
  repoName: string;
  githubUsername: string;
  intent?: string;
}

function mcpServerUrl(): string {
  return process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
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
 * Check whether a repo already exists for the user on GitHub.
 * Returns repo info if found, or null if it doesn't exist.
 */
async function checkExistingRepo(
  token: string,
  username: string,
  repoName: string
): Promise<{ owner: string; repoUrl: string; repoName: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (res.ok) {
    const repo = (await res.json()) as { html_url: string; name: string };
    return {
      owner: username,
      repoUrl: repo.html_url ?? `https://github.com/${username}/${repoName}`,
      repoName: repo.name ?? repoName,
    };
  }
  // 404 means not found; other errors are unexpected but we treat them as "not found"
  // and let the creation step surface the real problem.
  return null;
}

/**
 * Create a new GitHub repo for the user, or verify access to an existing one.
 *
 * Idempotent: checks for an existing repo BEFORE attempting to create one.
 * If the workspace repo already exists (e.g. from a prior wizard run),
 * returns it without re-running scaffold or seed.
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

  // Determine the target repo name
  const repoName = (projectName || `ai-workspace-${username}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');

  // ── Idempotency pre-flight: check if the repo already exists ──
  // This prevents duplicate repos when provisionUser is called multiple times
  // (e.g. first-run wizard followed by import-repo wizard).
  const existing = await checkExistingRepo(token, username, repoName);
  if (existing) {
    return { ...existing, isNew: false };
  }

  // Create new repo
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
      // Race condition: another wizard created the repo between our check and creation.
      // Re-check for the repo and return it if found.
      const racedExisting = await checkExistingRepo(token, username, repoName);
      if (racedExisting) {
        return { ...racedExisting, isNew: false };
      }
    }
    const err = await res.text();
    throw new Error(`Failed to create repo: ${res.status} ${err}`);
  }

  const repo = (await res.json()) as { html_url: string; name: string };
  return { owner: username, repoUrl: repo.html_url, repoName: repo.name, isNew: true };
}

// ── Step 3: Seed .claude/ + secret references ───────────────────────────────

/**
 * Push the scaffolded .claude/ structure and secret references to the repo.
 * Uses the GitHub Contents API to create/update files.
 */
async function seedRepo(
  token: string,
  owner: string,
  repoName: string,
  _workspaceId: string,
  scaffoldFiles: Record<string, string>
): Promise<void> {
  // Push all scaffold files: secret references + .claude/ structure + skills + hooks.
  // Callers build the full file map (via buildSecretReferenceFiles) before calling seedRepo.
  for (const [filePath, content] of Object.entries(scaffoldFiles)) {
    await pushFile(token, owner, repoName, filePath, content, `chore: scaffold ${filePath}`);
  }
}

function buildSecretReferenceFiles(
  workspaceId: string,
  holomesh?: HolomeshRegistration
): Record<string, string> {
  const secretRef = `secret://workspace/${workspaceId}/holoscript/orchestrator/api-key`;
  const holomeshAgentId = holomesh?.agentId ?? '';
  const holomeshWalletAddress = holomesh?.walletAddress ?? '';

  return {
    '.env.example': [
      '# HoloScript Platform — local development only',
      '# NEVER commit .env to git. Copy this file to .env and fill in the values.',
      '# Wallet vars are write-once identity (GOLD G.016) — never overwrite.',
      '',
      '# ── Orchestrator ──────────────────────────────────────────────────────',
      'HOLOSCRIPT_API_KEY=',
      `MCP_WORKSPACE_ID=${workspaceId}`,
      `MCP_ORCHESTRATOR_URL=${ORCHESTRATOR_URL}`,
      'HOLOSCRIPT_MCP=https://mcp.holoscript.net',
      '',
      '# ── HoloMesh Agent Identity (write-once — GOLD G.016) ────────────────',
      '# These were provisioned when you signed up. Keep them safe.',
      'HOLOMESH_API_KEY=',
      `HOLOMESH_AGENT_ID=${holomeshAgentId}`,
      '',
      '# ── HoloMesh Wallet Identity (write-once — NEVER overwrite) ──────────',
      `HOLOMESH_WALLET_ADDRESS=${holomeshWalletAddress}`,
      'HOLOMESH_WALLET_KEY=',
      '',
    ].join('\n'),
    '.env.identity.example': [
      '# Write-once wallet identity — separate from session keys (GOLD G.016).',
      '# Copy to .env.identity and fill in HOLOMESH_WALLET_KEY.',
      '# NEVER commit .env.identity to git.',
      '',
      `HOLOMESH_WALLET_ADDRESS=${holomeshWalletAddress}`,
      'HOLOMESH_WALLET_KEY=',
      '',
    ].join('\n'),
    'ecosystem/secrets.manifest.yml': [
      'version: 1',
      `workspace_id: "${workspaceId}"`,
      'secrets:',
      '  - name: "HOLOSCRIPT_API_KEY"',
      `    ref: "${secretRef}"`,
      '    delivery: "studio-broker-or-github-actions-secret"',
      '    required_for:',
      '      - "holoscript-mcp"',
      '      - "orchestrator-tools"',
      '    setup:',
      '      - "Store the provisioned value in Studio/HoloVault or a GitHub Actions secret named HOLOSCRIPT_API_KEY."',
      '      - "For local development, copy .env.example to .env outside Git and fill the value locally."',
      '  - name: "HOLOMESH_API_KEY"',
      '    ref: "secret://holomesh/agent/api-key"',
      '    delivery: "studio-broker-or-local-env"',
      '    required_for:',
      '      - "holomesh-board"',
      '      - "agent-mesh"',
      '',
    ].join('\n'),
  };
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
 * Register the project with the daemon system so HoloHeal and resident missions can start.
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
      capabilities: ['holoheal', 'resident-missions', 'type-fix', 'test-coverage', 'cleanup'],
      metadata: { repoUrl, workspaceId },
    }),
  });
}

async function readJsonResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

function payloadEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.entries)) return record.entries;
  if (Array.isArray(record.knowledge)) return record.knowledge;
  if (Array.isArray(record.items)) return record.items;

  const result = record.result;
  if (result && typeof result === 'object') {
    return payloadEntries(result);
  }

  const content = record.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        try {
          return payloadEntries(JSON.parse((part as { text: string }).text));
        } catch {
          return [];
        }
      }
    }
  }

  return [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeKnowledgeEntry(
  value: unknown,
  index: number,
  context: ExtractKnowledgeContext
): KnowledgePublicationEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const content = typeof record.content === 'string' ? record.content.trim() : '';
  if (!content) return null;

  const type = typeof record.type === 'string' ? record.type.toLowerCase() : 'wisdom';
  const tags = Array.from(
    new Set([
      ...stringArray(record.tags),
      'studio-provision',
      `workspace:${context.workspaceId}`,
    ])
  );
  const metadata =
    record.metadata && typeof record.metadata === 'object'
      ? { ...(record.metadata as Record<string, unknown>) }
      : {};

  return {
    ...record,
    type,
    content,
    domain: typeof record.domain === 'string' ? record.domain : context.workspaceId,
    tags,
    workspace_id: context.workspaceId,
    workspaceId: context.workspaceId,
    metadata: {
      ...metadata,
      source: 'studio-provision',
      extractionIndex: index,
      attribution: {
        githubUsername: context.githubUsername,
        workspaceId: context.workspaceId,
        repoUrl: context.repoUrl,
        repoName: context.repoName,
      },
      provenance: {
        tool: 'absorb_extract_knowledge',
        workspaceId: context.workspaceId,
        repoUrl: context.repoUrl,
        repoName: context.repoName,
        intent: context.intent ?? null,
      },
    },
  };
}

async function extractProvisionedKnowledge(
  context: ExtractKnowledgeContext
): Promise<KnowledgePublicationEntry[]> {
  const response = await fetch(`${ORCHESTRATOR_URL}/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': context.apiKey },
    body: JSON.stringify({
      server: 'holoscript-absorb',
      tool: 'absorb_extract_knowledge',
      args: {
        workspaceId: context.workspaceId,
        repoUrl: context.repoUrl,
        minConfidence: 0.5,
        maxPerType: 20,
        includeSpeculative: false,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to extract knowledge: ${response.status}`);
  }

  const payload = await readJsonResponse(response);
  return payloadEntries(payload)
    .map((entry, index) => normalizeKnowledgeEntry(entry, index, context))
    .filter((entry): entry is KnowledgePublicationEntry => entry !== null);
}

async function publishProvisionedKnowledge(context: ExtractKnowledgeContext): Promise<number> {
  const entries = await extractProvisionedKnowledge(context);
  if (entries.length === 0) return 0;

  const holomeshKey = process.env.HOLOMESH_API_KEY;
  if (!holomeshKey) {
    throw new Error('HOLOMESH_API_KEY environment variable is not set');
  }

  const result = await publishKnowledgeEntries({
    entries,
    workspaceId: context.workspaceId,
    holomeshKey,
    mcpServerUrl: mcpServerUrl(),
  });

  if (!result.allSucceeded) {
    throw new Error(
      `Knowledge publication failed: ${(result.errors ?? ['unknown publish error']).join('; ')}`
    );
  }

  return result.publishedCount;
}

// ── Step: Register HoloMesh Agent Identity ───────────────────────────────────

interface HolomeshRegistration {
  agentId: string;
  holomeshApiKey: string;
  walletAddress: string;
}

/**
 * Register a new HoloMesh agent for the user.
 * Server generates the wallet — no x402 challenge needed for provisioned users.
 * The returned apiKey + walletAddress are write-once identity (GOLD G.016).
 */
async function registerHolomeshAgent(
  githubUsername: string,
  mcpApiKey: string
): Promise<HolomeshRegistration> {
  const mcpUrl = mcpServerUrl();
  const res = await fetch(`${mcpUrl}/api/holomesh/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mcp-api-key': mcpApiKey,
    },
    body: JSON.stringify({ name: `studio-${githubUsername}` }),
  });

  if (!res.ok) {
    throw new Error(`Failed to register HoloMesh agent: ${res.status}`);
  }

  const data = (await res.json()) as {
    agentId?: string;
    id?: string;
    apiKey?: string;
    walletAddress?: string;
  };
  const agentId = data.agentId ?? data.id ?? '';
  const holomeshApiKey = data.apiKey ?? '';
  const walletAddress = data.walletAddress ?? '';

  if (!agentId || !holomeshApiKey || !walletAddress) {
    throw new Error('HoloMesh register response missing required fields');
  }

  return { agentId, holomeshApiKey, walletAddress };
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/**
 * Full user provisioning pipeline. Called after GitHub OAuth completes.
 *
 * 1. Provision API key on orchestrator
 * 2. Create or connect GitHub repo
 * 3. Scaffold .claude/ structure + seed secret references
 * 4. Start HoloDaemon resident missions
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
        { name: 'register-holomesh-agent', status: 'pending' },
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
      updateStep('provision-key', 'done', 'workspace key provisioned server-side');
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
    updateStep('provision-key', 'done', 'workspace key provisioned server-side');

    // Step 1b: Register HoloMesh agent identity (write-once — GOLD G.016)
    updateStep('register-holomesh-agent', 'running');
    let holomeshRegistration: HolomeshRegistration | undefined;
    try {
      holomeshRegistration = await registerHolomeshAgent(input.githubUsername, apiKey);
      updateStep(
        'register-holomesh-agent',
        'done',
        `agent ${holomeshRegistration.agentId} registered`
      );
    } catch {
      // Non-fatal: HoloMesh identity can be provisioned later via /api/holomesh/register
      updateStep('register-holomesh-agent', 'failed', 'skipped — will retry on next login');
    }

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

    // Step 4: Scaffold .claude/ structure (if approved AND repo is new)
    // Idempotency: skip scaffold+seed when the workspace repo already existed
    // (e.g. a previous wizard run already created and seeded it). Re-scaffolding
    // an existing repo would overwrite user customizations.
    const shouldScaffold = input.approvedScaffold && isNew;
    let scaffold:
      | Awaited<ReturnType<typeof import('./scaffolder').scaffoldProjectWorkspace>>
      | undefined;
    if (shouldScaffold) {
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

      // Step 5: Seed repo with .claude/ + secret references (only if scaffold approved)
      updateStep('seed-repo', 'running');
      const secretFiles = buildSecretReferenceFiles(workspaceId, holomeshRegistration);
      const files: Record<string, string> = {
        ...accountSeed.files,
        ...secretFiles,
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
      await seedRepo(input.githubAccessToken, owner, repoName, workspaceId, files);
      updateStep('seed-repo', 'done');
    } else if (input.approvedScaffold && !isNew) {
      // User approved scaffold but repo already exists — mark steps as skipped
      updateStep('scaffold', 'done', 'skipped — workspace repo already exists');
      updateStep('seed-repo', 'done', 'skipped — workspace repo already exists');
    }

    // Step 6: Publish knowledge to HoloMesh (if approved)
    if (input.approvedPublishKnowledge) {
      updateStep('publish-knowledge', 'running');
      const publishedCount = await publishProvisionedKnowledge({
        apiKey,
        workspaceId,
        repoUrl,
        repoName,
        githubUsername: input.githubUsername,
        intent: input.intent,
      });
      updateStep('publish-knowledge', 'done', `published ${publishedCount} knowledge entries`);
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
        scaffolded: shouldScaffold,
        daemonStarted: input.approvedDaemon,
        holomeshAgentId: holomeshRegistration?.agentId,
        holomeshApiKey: holomeshRegistration?.holomeshApiKey,
        holomeshWalletAddress: holomeshRegistration?.walletAddress,
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
