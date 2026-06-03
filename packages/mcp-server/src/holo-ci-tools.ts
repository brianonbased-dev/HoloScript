/**
 * holo-ci-tools.ts — MCP tool surface for HoloScript-native CI (HoloCI).
 *
 * Why this exists: HoloCI dispatch normally needs the orchestrator key
 * (`HOLOSCRIPT_API_KEY`, sent as `x-mcp-api-key` to the mcp-orchestrator GPU
 * queue) — a high-privilege credential that submits fleet workloads. We do NOT
 * want that key copied into every external client's config file. Instead we
 * expose CI dispatch as an MCP tool: a Bearer-authed client (Claude Desktop,
 * Cursor, a cloud Claude Code session, …) calls `holo_ci_dispatch` with only
 * the MCP access token it already has, and THIS server — which already holds
 * the orchestrator key for its other orchestrator calls (see
 * absorb-provenance-tools.ts) — makes the privileged POST server-side. The
 * orchestrator key never leaves the server.
 *
 * The gate catalog + workload builder below is a faithful TypeScript port of
 * ai-ecosystem/scripts/holo-ci/{gates,lib}.mjs. It is duplicated rather than
 * imported because HoloScript and ai-ecosystem are separate repos with no
 * shared module path. Keep the two in sync when gates change.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// ─── Gate catalog (port of gates.mjs) ───────────────────────────────────────
type Profile = 'quick' | 'full';
type GateSpec = {
  description: string;
  step: string;
  profiles: Profile[];
  resource_requirements: { max_dph: number };
};

const HOLOSCRIPT_GATES: Record<string, GateSpec> = {
  'frozen-lockfile': {
    description:
      'Frozen-lockfile drift gate: fail loud if any package.json ⇄ pnpm-lock.yaml is out of sync (ERR_PNPM_OUTDATED_LOCKFILE bricks deploys)',
    step: 'node scripts/holo-ci/frozen-lockfile-check.mjs',
    profiles: ['quick', 'full'],
    resource_requirements: { max_dph: 0.2 },
  },
  lint: {
    description: 'Lint + format + version-lane + architecture-coupling static checks',
    step: ['pnpm lint', 'pnpm format:check', 'pnpm version:check', 'pnpm architecture:check'].join(
      '\n'
    ),
    profiles: ['quick', 'full'],
    resource_requirements: { max_dph: 0.3 },
  },
  secrets: {
    description: 'Secret scan (gitleaks — blocks ghp_/classic sk-/AKIA/private-keys; F.106)',
    step: [
      'GL=8.21.2',
      'curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GL}/gitleaks_${GL}_linux_x64.tar.gz" | tar -xz gitleaks',
      'CFG=""; [ -f .gitleaks.toml ] && CFG="--config .gitleaks.toml"',
      './gitleaks detect --no-git --source . $CFG --redact --no-banner --exit-code 1',
    ].join('\n'),
    profiles: ['quick', 'full'],
    resource_requirements: { max_dph: 0.2 },
  },
  build: {
    description: 'Build all @holoscript/* packages (pnpm build)',
    step: 'pnpm build',
    profiles: ['full'],
    resource_requirements: { max_dph: 0.4 },
  },
  test: {
    description: 'Core test suite (build + pnpm test:coverage || pnpm test)',
    step: 'pnpm build\npnpm test:coverage || pnpm test',
    profiles: ['full'],
    resource_requirements: { max_dph: 0.55 },
  },
  security: {
    description: 'Dependency audit (pnpm audit --prod, high+ severities)',
    step: 'pnpm audit --prod --audit-level high',
    profiles: ['full'],
    resource_requirements: { max_dph: 0.3 },
  },
  // W.667 BLOCKING release gate — packs+installs the whole claim-bearing publish set
  // cold (optional/peer omitted) and probes ESM+CJS barrels, the ./runtime subpath, and
  // optional-peer absence. Omitting it here would let holo_ci_dispatch trigger a CI run
  // that silently skips the fence that caught non-installable @holoscript/core (W.667/W.681).
  // Must stay in lockstep with the canonical scripts/holo-ci/gates.mjs cold-consume gate.
  'cold-consume': {
    description:
      'Cold-consume release gate (W.667, deepened): --local pack + install (omit optional/peer) the whole publish set; barrel (ESM+CJS) + ./runtime cold-import + optional-peer-absence; @holoscript subpath leak = fail, external peer = info',
    step: [
      'pnpm --filter @holoscript/core --filter @holoscript/engine --filter @holoscript/mesh --filter @holoscript/framework --filter @holoscript/runtime --filter @holoscript/cli build',
      'node scripts/cold-consume-check.mjs --local',
    ].join('\n'),
    profiles: ['full'],
    resource_requirements: { max_dph: 0.5 },
  },
};

const HOLOLAND_GATES: Record<string, GateSpec> = {
  lint: {
    description: 'HoloLand lint gate (pnpm lint)',
    step: 'pnpm lint',
    profiles: ['quick', 'full'],
    resource_requirements: { max_dph: 0.3 },
  },
  secrets: {
    description: 'Secret scan (gitleaks — blocks ghp_/classic sk-/AKIA/private-keys; F.106)',
    step: [
      'GL=8.21.2',
      'curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GL}/gitleaks_${GL}_linux_x64.tar.gz" | tar -xz gitleaks',
      'CFG=""; [ -f .gitleaks.toml ] && CFG="--config .gitleaks.toml"',
      './gitleaks detect --no-git --source . $CFG --redact --no-banner --exit-code 1',
    ].join('\n'),
    profiles: ['quick', 'full'],
    resource_requirements: { max_dph: 0.2 },
  },
  build: {
    description: 'HoloLand workspace build (pnpm build)',
    step: 'pnpm build',
    profiles: ['full'],
    resource_requirements: { max_dph: 0.4 },
  },
  test: {
    description: 'HoloLand root adapter tests plus workspace tests',
    step: ['pnpm test:holoshell-holomap-replay-preview', 'pnpm test'].join('\n'),
    profiles: ['full'],
    resource_requirements: { max_dph: 0.45 },
  },
  security: {
    description: 'HoloLand dependency audit (pnpm audit --prod, high+ severities)',
    step: 'pnpm audit --prod --audit-level high',
    profiles: ['full'],
    resource_requirements: { max_dph: 0.3 },
  },
};

const REPO_CONFIGS: Record<string, { workspaceRoot: string; gates: Record<string, GateSpec> }> = {
  'brianonbased-dev/HoloScript': {
    workspaceRoot: '/workspace/HoloScript',
    gates: HOLOSCRIPT_GATES,
  },
  'brianonbased-dev/Hololand': {
    workspaceRoot: '/workspace/Hololand',
    gates: HOLOLAND_GATES,
  },
};

/** Repos this tool will dispatch for. CI may only ever run trusted repos. */
const ALLOWED_REPOS = Object.keys(REPO_CONFIGS);

function normalizedRepoKey(repo: string): string {
  const value = String(repo || 'brianonbased-dev/HoloScript').trim();
  const match = value.match(/([^/:]+\/[^/]+?)(?:\.git)?$/);
  const key = match ? match[1] : value;
  return ALLOWED_REPOS.find((c) => c.toLowerCase() === key.toLowerCase()) || key;
}

// ─── Bid policy (port of vastai-bid-policy.mjs, the default CI path) ──────────
function roundBidPrice(n: number): number {
  return Number(n.toFixed(4));
}

/**
 * Resolve the vast.ai resource requirements for a checkpointable, interruptible
 * CI job. Mirrors applyVastBidPolicyToResourceRequirements for the policy path
 * every CI gate uses (checkpointable=true, rentalMarket='policy', maxDph set).
 */
function applyBidPolicy(rr: { max_dph: number }): Record<string, unknown> {
  // policy path: checkpointable interruptible, bid = min(maxDph)
  return {
    max_dph: rr.max_dph,
    checkpointable: true,
    restartable: true,
    rental_market: 'interruptible',
    bid_policy_source: 'policy',
    bid_price: roundBidPrice(rr.max_dph),
  };
}

// ─── Input validation (these values land in shell commands — guard hard) ─────
const SHA_RE = /^[0-9a-f]{7,40}$/i;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function assertSafeRepo(repo: string): void {
  if (!REPO_RE.test(repo)) throw new Error(`unsafe repo slug "${repo}"`);
}

/** Shell prologue every gate runs first: land the exact commit, install. */
function prologue(repo: string, sha: string, workspaceRoot: string): string {
  assertSafeRepo(repo);
  return [
    'set -euo pipefail',
    `WORKSPACE_ROOT="\${WORKSPACE_ROOT:-${workspaceRoot}}"`,
    'if [ ! -d "$WORKSPACE_ROOT/.git" ]; then',
    '  mkdir -p "$(dirname "$WORKSPACE_ROOT")"',
    `  git clone --quiet "https://github.com/${repo}.git" "$WORKSPACE_ROOT"`,
    'fi',
    'cd "$WORKSPACE_ROOT"',
    `git remote set-url origin "https://github.com/${repo}.git" >/dev/null 2>&1 || true`,
    `git fetch --quiet --depth 1 origin ${sha}`,
    `git checkout --quiet --force ${sha}`,
    'corepack enable >/dev/null 2>&1 || true',
    'pnpm install --frozen-lockfile',
  ].join('\n');
}

export type HoloCiWorkload = {
  workload: {
    id: string;
    name: string;
    description: string;
    lane: string;
    jobs: Array<Record<string, unknown>>;
  };
  contexts: string[];
};

/** Build a HoloWorkload for a CI run (port of buildWorkload in gates.mjs). */
export function buildWorkload(opts: {
  repo: string;
  sha: string;
  profile?: Profile;
  tier?: 'T1' | 'T2' | 'T3';
}): HoloCiWorkload {
  const { sha, profile = 'full', tier = 'T2' } = opts;
  if (!SHA_RE.test(sha)) throw new Error(`unsafe commit sha "${sha}" (expected 7–40 hex chars)`);
  const repoKey = normalizedRepoKey(opts.repo);
  if (!ALLOWED_REPOS.includes(repoKey)) {
    throw new Error(
      `repo "${repoKey}" is not allowed for CI dispatch (allowed: ${ALLOWED_REPOS.join(', ')})`
    );
  }
  const { workspaceRoot, gates } = REPO_CONFIGS[repoKey];
  const shortSha = sha.slice(0, 8);
  const selected = Object.entries(gates).filter(([, g]) => g.profiles.includes(profile));
  if (selected.length === 0) throw new Error(`no gates match profile "${profile}"`);

  const jobs = selected.map(([id, g]) => ({
    id,
    description: `[CI ${shortSha}] ${g.description}`,
    command: prologue(repoKey, sha, workspaceRoot) + '\n' + g.step,
    workspace_root: workspaceRoot,
    repo: repoKey,
    tier,
    requires_gpu: false,
    resource_requirements: applyBidPolicy(g.resource_requirements),
  }));

  return {
    workload: {
      id: `ci-${shortSha}-${Date.now().toString(36)}`,
      name: `holo-ci ${repoKey}@${shortSha} (${profile})`,
      description: `Native CI run for ${repoKey} @ ${sha} — profile=${profile}`,
      lane: 'ci',
      jobs,
    },
    contexts: jobs.map((j) => `holo-ci/${j.id}`),
  };
}

// ─── Orchestrator submit (server-side; uses the server's own key) ────────────
function readOrchestratorKey(): string {
  return process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || '';
}

function orchestratorUrl(): string {
  return (
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app'
  ).replace(/\/$/, '');
}

// ─── Tool definition ─────────────────────────────────────────────────────────
export const holoCiTools: Tool[] = [
  {
    name: 'holo_ci_dispatch',
    description:
      'Trigger a HoloCI (HoloScript-native CI) run for a commit on the vast.ai fleet via the mcp-orchestrator GPU queue. The orchestrator key is held server-side, so any authenticated MCP client can dispatch CI without holding fleet credentials. Use dryRun:true to preview the exact workload (gates + commands) without submitting — no key required. Returns the submitted workload id and the per-gate commit-status contexts that will be reported on the SHA.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description:
            'Repository slug "owner/name". Allowed: brianonbased-dev/HoloScript, brianonbased-dev/Hololand. Defaults to brianonbased-dev/HoloScript.',
        },
        sha: {
          type: 'string',
          description: 'Commit SHA to validate (7–40 hex chars; full SHA preferred).',
        },
        profile: {
          type: 'string',
          enum: ['quick', 'full'],
          description:
            '"quick" = fast static gates (lockfile/lint/secrets); "full" = the complete PR gate set (adds build/test/security). Default "full".',
        },
        dryRun: {
          type: 'boolean',
          description:
            'If true, build and return the workload WITHOUT submitting to the fleet (no orchestrator key needed). Default false.',
        },
      },
      required: ['sha'],
    },
  },
];

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function handleHoloCiTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name !== 'holo_ci_dispatch') return null;

  const repo =
    typeof args.repo === 'string' && args.repo.trim() ? args.repo : 'brianonbased-dev/HoloScript';
  const sha = typeof args.sha === 'string' ? args.sha.trim() : '';
  const profile: Profile = args.profile === 'quick' ? 'quick' : 'full';
  const dryRun = args.dryRun === true;

  if (!sha) {
    return { ok: false, error: 'sha is required (7–40 hex chars).' };
  }

  let built: HoloCiWorkload;
  try {
    built = buildWorkload({ repo, sha, profile });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      repo: normalizedRepoKey(repo),
      profile,
      gateCount: built.workload.jobs.length,
      contexts: built.contexts,
      workload: built.workload,
    };
  }

  const apiKey = readOrchestratorKey();
  if (!apiKey) {
    return {
      ok: false,
      error:
        'Orchestrator key not provisioned on this server (HOLOSCRIPT_API_KEY / HOLOMESH_API_KEY unset). Cannot submit to the fleet. Provision the key as a server env secret, or re-run with dryRun:true to preview the workload.',
      contexts: built.contexts,
    };
  }

  try {
    const res = await fetch(`${orchestratorUrl()}/gpu/workload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify(built.workload),
      signal: AbortSignal.timeout(20_000),
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* leave as text */
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `orchestrator /gpu/workload → ${res.status}`,
        detail: typeof parsed === 'string' ? parsed.slice(0, 400) : parsed,
      };
    }

    const wlId =
      (parsed as { id?: string; workload_id?: string })?.id ??
      (parsed as { workload_id?: string })?.workload_id ??
      built.workload.id;

    return {
      ok: true,
      dispatched: true,
      repo: normalizedRepoKey(repo),
      profile,
      workloadId: wlId,
      jobCount: built.workload.jobs.length,
      contexts: built.contexts,
      orchestrator: parsed,
    };
  } catch (err) {
    return {
      ok: false,
      error: `orchestrator submit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
