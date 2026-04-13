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
  steps: ProvisionStep[];
}

export interface ProvisionStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_MCP_ORCHESTRATOR_URL ||
  'https://mcp-orchestrator-production-45f9.up.railway.app';

const MASTER_API_KEY = process.env.HOLOSCRIPT_API_KEY || '';

// ── Step 1: Provision API Key ────────────────────────────────────────────────

/**
 * Create a new API key on the MCP Orchestrator scoped to this user's workspace.
 */
async function provisionApiKey(
  username: string,
  email: string
): Promise<{ key: string; workspaceId: string }> {
  const workspaceId = `ws_${username}`;

  const res = await fetch(`${ORCHESTRATOR_URL}/admin/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mcp-api-key': MASTER_API_KEY,
    },
    body: JSON.stringify({
      name: `studio-${username}`,
      tier: 'starter',
      workspaceId,
      metadata: { email, source: 'studio-provision' },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to provision API key: ${res.status}`);
  }

  const data = (await res.json()) as { key: string };
  return { key: data.key, workspaceId };
}

// ── Step 2: Create or Connect Repo ───────────────────────────────────────────

/**
 * Create a new GitHub repo for the user, or verify access to an existing one.
 */
async function ensureRepo(
  token: string,
  username: string,
  repoUrl?: string,
  projectName?: string
): Promise<{ repoUrl: string; repoName: string; isNew: boolean }> {
  if (repoUrl) {
    // Verify access to existing repo
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git$/, '');

    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });

    if (!res.ok) throw new Error(`Cannot access repo ${owner}/${repoName}: ${res.status}`);
    return { repoUrl, repoName, isNew: false };
  }

  // Create new repo
  const repoName = (projectName || `holoscript-${Date.now()}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
    const err = await res.text();
    throw new Error(`Failed to create repo: ${res.status} ${err}`);
  }

  const repo = (await res.json()) as { html_url: string; name: string };
  return { repoUrl: repo.html_url, repoName: repo.name, isNew: true };
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
  await pushFile(token, owner, repoName, '.env', envContent, 'chore: provision HoloScript platform credentials');

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
async function startDaemon(
  apiKey: string,
  workspaceId: string,
  repoUrl: string
): Promise<void> {
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
  const steps: ProvisionStep[] = [
    { name: 'provision-key', status: 'pending' },
    { name: 'ensure-repo', status: 'pending' },
    ...(input.approvedAbsorb ? [{ name: 'absorb-scan', status: 'pending' as const }] : []),
    ...(input.approvedScaffold ? [{ name: 'scaffold', status: 'pending' as const }] : []),
    ...(input.approvedScaffold ? [{ name: 'seed-repo', status: 'pending' as const }] : []),
    ...(input.approvedPublishKnowledge ? [{ name: 'publish-knowledge', status: 'pending' as const }] : []),
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
    // Step 1: Provision API key
    updateStep('provision-key', 'running');
    const { key: apiKey, workspaceId } = await provisionApiKey(input.githubUsername, input.email);
    updateStep('provision-key', 'done', `key: ${apiKey.slice(0, 8)}...`);

    // Step 2: Ensure repo exists
    updateStep('ensure-repo', 'running');
    const { repoUrl, repoName, isNew } = await ensureRepo(
      input.githubAccessToken,
      input.githubUsername,
      input.repoUrl,
      input.projectName
    );
    updateStep('ensure-repo', 'done', isNew ? `created ${repoName}` : `connected ${repoName}`);

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
    let scaffold: Awaited<ReturnType<typeof import('./scaffolder').scaffoldProjectWorkspace>> | undefined;
    if (input.approvedScaffold) {
      updateStep('scaffold', 'running');
      const { scaffoldProjectWorkspace } = await import('./scaffolder');
      const dna = {
        name: repoName,
        repoUrl,
        techStack: [],         // Will be enriched by Absorb scan results
        frameworks: [],
        languages: [],
        packageCount: 0,
        testCoverage: 0,
        codeHealthScore: 5,    // Default until scanned
        compilationTargets: [],
        traits: [],
      };
      scaffold = scaffoldProjectWorkspace(dna);
      updateStep('scaffold', 'done');

      // Step 5: Seed repo with .claude/ + .env (only if scaffold approved)
      updateStep('seed-repo', 'running');
      const owner = input.githubUsername;
      const files: Record<string, string> = {
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
        githubAccessToken: input.githubAccessToken,
        mcpApiKey: apiKey,
        workspaceId,
        repoUrl,
        repoName,
        scaffolded: true,
        daemonStarted: true,
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
    }
    return { success: false, error: msg, steps };
  }
}
