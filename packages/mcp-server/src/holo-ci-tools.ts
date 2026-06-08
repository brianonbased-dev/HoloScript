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
 *
 * ## Spend authorisation (task_1780456938486_eldw)
 *
 * Two-layer guard applied on every non-dry submit:
 *
 * 1. **Per-caller daily submit cap** — in-memory rolling-24h window, keyed by a
 *    SHA-256 fingerprint of the caller token (never stored in the clear). Default
 *    cap = `HOLOCI_DAILY_SUBMIT_CAP` env var (defaults to 3 submits/day). The
 *    server's own orchestrator key (founder seat) is exempt.  When the cap is
 *    exceeded the handler returns `ok:false` with `capExceeded:true` AND the
 *    dry-run preview so the caller can still inspect the workload.
 *
 * 2. **Token → identity → spend allowance lookup** — the caller token is hashed
 *    to a stable fingerprint and checked against a per-identity allowance table
 *    (`HOLOCI_SPEND_ALLOWANCES` env JSON, keyed by SHA-256 fingerprint). When no
 *    entry is found the caller is treated as `restricted` (cap = 1/day, no full
 *    profile).  Founder-key callers are always `unlimited`.  The allowance table
 *    can be provisioned at deploy time; a future follow-up can replace this with
 *    a live orchestrator /identity/allowance lookup once that endpoint exists.
 */

import { createHash } from 'node:crypto';
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
  // FREEZE RATCHET (render-surface dogfooding ruling 2026-06-05; D.012/D.014/I.018).
  // Production render .tsx (r3f-renderer + studio) must be HS-native (compiler-emitted, carrying
  // an "@generated by HoloScript" header) or a compiler example; net-new hand-authored render is
  // blocked, existing hand-authored is grandfathered into an allowlist. Fast static check.
  // Lockstep with the canonical scripts/holo-ci/gates.mjs render-surface gate.
  'render-surface': {
    description:
      'Render-surface native freeze: production render .tsx must be compiler-emitted (HS-native) or a compiler example; net-new hand-authored render is blocked (grandfathered legacy allowlisted)',
    step: 'node scripts/holo-ci/check-render-surface-native.mjs',
    profiles: ['quick', 'full'],
    resource_requirements: { max_dph: 0.2 },
  },
  // Retro-wire (F.073 sister): check-publish-surface.mjs was an orphan gate (run by nobody).
  // Pins the published npm surface to an explicit allowlist + flags description mojibake.
  // Lockstep with the canonical scripts/holo-ci/gates.mjs publish-surface gate.
  'publish-surface': {
    description:
      'Publish-surface bound: published (private:false) @holoscript packages must match the explicit allowlist; no mojibake in descriptions (W.669 surface-growth fence)',
    step: 'node scripts/holo-ci/check-publish-surface.mjs',
    profiles: ['quick', 'full'],
    resource_requirements: { max_dph: 0.2 },
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

// ─── Per-caller spend authorisation ─────────────────────────────────────────

/**
 * Tier of spend authority granted to a caller.
 *
 * - `founder`     – unlimited submits, any profile.
 * - `trusted`     – up to HOLOCI_DAILY_SUBMIT_CAP (default 3) submits/day, any profile.
 * - `restricted`  – cap capped at 1/day, quick-profile only (no full-profile GPU spend).
 */
type CallerTier = 'founder' | 'trusted' | 'restricted';

/** SHA-256 of a raw token string (hex, 64 chars). Never log the token itself. */
function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Resolve caller tier from the token fingerprint.
 *
 * Priority:
 * 1. Fingerprint matches the server's own orchestrator key → founder (unlimited).
 * 2. `HOLOCI_SPEND_ALLOWANCES` JSON env var contains the fingerprint → use declared tier.
 * 3. Fallback → restricted.
 *
 * `HOLOCI_SPEND_ALLOWANCES` format (JSON object):
 *   { "<sha256-fingerprint>": "trusted" | "founder" | "restricted", ... }
 */
function resolveCallerTier(callerFingerprint: string): CallerTier {
  // Server's own orchestrator key is always founder-tier (self-dispatch).
  const serverKey = process.env.HOLOSCRIPT_API_KEY || process.env.HOLOMESH_API_KEY || '';
  if (serverKey && tokenFingerprint(serverKey) === callerFingerprint) return 'founder';

  // Provisioned allowance table (deploy-time env JSON).
  const raw = process.env.HOLOCI_SPEND_ALLOWANCES || '';
  if (raw) {
    try {
      const table = JSON.parse(raw) as Record<string, string>;
      const tier = table[callerFingerprint];
      if (tier === 'founder' || tier === 'trusted' || tier === 'restricted') return tier;
    } catch {
      // Malformed env — fail safe to restricted.
    }
  }

  return 'restricted';
}

/**
 * Rolling-24h submit counter, keyed by caller fingerprint.
 * Each entry is a list of submit timestamps (ms since epoch).
 * In-memory only — resets on server restart (intentional: short-lived guard,
 * not a durable audit log). A follow-up can persist to Redis if needed.
 */
const _submitLedger = new Map<string, number[]>();

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Returns how many submits the caller has made in the last 24 h. */
function recentSubmitCount(fingerprint: string, nowMs: number = Date.now()): number {
  const ts = _submitLedger.get(fingerprint) ?? [];
  return ts.filter((t) => nowMs - t < WINDOW_MS).length;
}

/** Record a new submit for the caller. Prunes entries older than 24 h. */
function recordSubmit(fingerprint: string, nowMs: number = Date.now()): void {
  const ts = (_submitLedger.get(fingerprint) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  ts.push(nowMs);
  _submitLedger.set(fingerprint, ts);
}

/** Test-only: reset the ledger. */
export function resetSubmitLedger(): void {
  _submitLedger.clear();
}

/**
 * Effective daily cap for a caller tier.
 * `HOLOCI_DAILY_SUBMIT_CAP` overrides the trusted tier cap.
 */
function effectiveCap(tier: CallerTier): number {
  if (tier === 'founder') return Infinity;
  const envCap = Number(process.env.HOLOCI_DAILY_SUBMIT_CAP || '');
  const trustedCap = Number.isFinite(envCap) && envCap > 0 ? envCap : 3;
  return tier === 'trusted' ? trustedCap : 1; // restricted = 1/day
}

/**
 * Gate a non-dry submit against the per-caller spend policy.
 *
 * Returns `null` if the submit is allowed; otherwise returns the error payload
 * the handler should return (always includes the dry-run workload preview so
 * the caller can still see what would have run).
 *
 * @param callerToken  Raw bearer token or MCP key from the caller. Hashed before use.
 *                     Pass `undefined` when the caller is the stdio/local process
 *                     (trusted unconditionally — no network attacker path).
 * @param profile      Workload profile the caller is requesting.
 * @param dryPreview   Workload preview to attach to error responses.
 */
function checkSpendAuthz(
  callerToken: string | undefined,
  profile: Profile,
  dryPreview: HoloCiWorkload
): null | Record<string, unknown> {
  // stdio / local process — no token, fully trusted (no network path).
  if (!callerToken) return null;

  const fingerprint = tokenFingerprint(callerToken);
  const tier = resolveCallerTier(fingerprint);
  const cap = effectiveCap(tier);
  const used = recentSubmitCount(fingerprint);

  // Tier check: restricted callers may not submit full-profile workloads.
  if (tier === 'restricted' && profile === 'full') {
    return {
      ok: false,
      capExceeded: false,
      tierDenied: true,
      tier,
      error:
        'Full-profile GPU workloads require a trusted or founder token. ' +
        'Use profile:"quick" or contact the server operator to upgrade your token tier.',
      dryRunPreview: dryPreview,
    };
  }

  // Daily cap check.
  if (used >= cap) {
    return {
      ok: false,
      capExceeded: true,
      tier,
      used,
      cap: cap === Infinity ? null : cap,
      resetInMs: WINDOW_MS, // approximate (client can retry after ~24 h)
      error: `Daily CI submit cap reached (${used}/${cap === Infinity ? '∞' : cap} in last 24 h). Re-run with dryRun:true to preview the workload without spending.`,
      dryRunPreview: dryPreview,
    };
  }

  return null; // allowed
}

// ─── Tool definition ─────────────────────────────────────────────────────────
export const holoCiTools: Tool[] = [
  {
    name: 'holo_ci_dispatch',
    description:
      'Trigger a HoloCI (HoloScript-native CI) run for a commit on the vast.ai fleet via the mcp-orchestrator GPU queue. The orchestrator key is held server-side, so any authenticated MCP client can dispatch CI without holding fleet credentials. SAFE-BY-DEFAULT: this PREVIEWS the workload (gates + commands) and submits nothing unless you pass dryRun:false, which incurs real GPU spend. Returns the submitted workload id and the per-gate commit-status contexts that will be reported on the SHA.',
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
            'Default TRUE (safe): build and return the workload WITHOUT submitting to the fleet — no orchestrator key needed, no spend. Pass dryRun:false to ACTUALLY submit to the GPU fleet and incur real spend.',
        },
      },
      required: ['sha'],
    },
  },
];

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Handle `holo_ci_dispatch` tool calls.
 *
 * @param name         Tool name — returns `null` when not `holo_ci_dispatch`.
 * @param args         Tool arguments from the MCP client.
 * @param callerToken  Raw bearer token or MCP key for the requesting client.
 *                     Used only for per-caller spend authorisation — hashed
 *                     before any use, never stored or logged in the clear.
 *                     Pass `undefined` for stdio (local) callers that are
 *                     unconditionally trusted.
 */
export async function handleHoloCiTool(
  name: string,
  args: Record<string, unknown>,
  callerToken?: string
): Promise<unknown | null> {
  if (name !== 'holo_ci_dispatch') return null;

  const repo =
    typeof args.repo === 'string' && args.repo.trim() ? args.repo : 'brianonbased-dev/HoloScript';
  const sha = typeof args.sha === 'string' ? args.sha.trim() : '';
  const profile: Profile = args.profile === 'quick' ? 'quick' : 'full';
  // Safe-by-default: preview unless the caller EXPLICITLY opts into real GPU spend
  // with dryRun:false. The orchestrator key is server-side, so any authenticated MCP
  // token can reach this handler; defaulting to submit would make a bare call (or an
  // automation retry-loop) silently burn fleet budget. Spending must be deliberate.
  const dryRun = args.dryRun !== false;

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

  // ── Spend authorisation gate (non-dry path only) ──────────────────────────
  // Must happen AFTER dryRun branch so previews are never gated.
  const authzDenial = checkSpendAuthz(callerToken, profile, built);
  if (authzDenial) return authzDenial;

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

    // Record the successful submit against the caller's daily quota.
    if (callerToken) {
      recordSubmit(tokenFingerprint(callerToken));
    }

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
