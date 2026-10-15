/**
 * Per-workspace ship policy.
 *
 * Imports default to branch + PR. Direct ship (push straight to the repo's
 * default branch with no PR) is a per-workspace setting, stored as
 * `metadata.directShip` on the workspace's registry row, and it is OFF unless
 * the workspace owner turned it on. A missing or non-boolean value is OFF:
 * rows imported before this setting existed are branch + PR.
 *
 * GitHub role (owner/maintainer) only says whether direct ship is PERMITTED.
 * It never turns it on by itself. Before this, every import by a repo owner
 * was treated as direct-ship (api/github/access recommendedFlow).
 */

import { runGitSync } from '@/lib/git/safeGit';

export type ShipMode = 'branch-pr' | 'direct-ship';

export const DEFAULT_IMPORT_SHIP_MODE: ShipMode = 'branch-pr';

/** Branch names treated as protected when the real default branch is unknown. */
const FALLBACK_PROTECTED_BRANCHES = ['main', 'master'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True only when the workspace row explicitly has `metadata.directShip === true`. */
export function workspaceDirectShipEnabled(
  project: { metadata?: unknown } | null | undefined
): boolean {
  if (!project || !isRecord(project.metadata)) return false;
  return project.metadata.directShip === true;
}

export function workspaceShipMode(project: { metadata?: unknown } | null | undefined): ShipMode {
  return workspaceDirectShipEnabled(project) ? 'direct-ship' : 'branch-pr';
}

/** Metadata written on every new import. */
export function importShipMetadata(defaultBranch: string | null): Record<string, unknown> {
  return {
    directShip: false,
    shipMode: DEFAULT_IMPORT_SHIP_MODE,
    ...(defaultBranch ? { defaultBranch } : {}),
  };
}

function normalizeBranch(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^heads\//, '')
    .replace(/^origin\//, '');
  return trimmed || null;
}

/**
 * A branch name a caller supplies must be a plain branch name. Git expands
 * `heads/main` and `refs/heads/main` to the default branch, `HEAD`/`@` to
 * whatever is checked out, `+main` to a forced push, and `x:main` to a
 * refspec that lands on main. All are refused before any policy check.
 * Returns an error message, or null when the name is acceptable.
 */
export function unsafeBranchInput(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (!value) return null;
  if (
    /^head$/i.test(value) || // HEAD, and head/Head on case-insensitive filesystems
    value === '@' ||
    value.startsWith('-') ||
    value.startsWith('+') ||
    value.includes(':') ||
    value.includes('@{') ||
    /^(refs|heads)\//i.test(value)
  ) {
    return `"${value}" is not a plain branch name. Give a branch name like "studio/my-change" (no refs/, heads/, HEAD in any case, @, leading + or -, or ':').`;
  }
  return null;
}

/**
 * Full ref a branch name resolves to in this clone (`git rev-parse
 * --symbolic-full-name`). A branch that does not exist locally yet resolves
 * to refs/heads/<name>, which is where the push would create it.
 */
export function resolveTargetRef(cwd: string, branch: string): string {
  try {
    // No --end-of-options: git 2.47 echoes it as a literal first line, which
    // made every lookup fall back. A leading '-' is already refused by
    // unsafeBranchInput, so the name cannot be read as an option. Parse
    // defensively: last non-empty line, and it must be a full ref.
    const out = String(
      runGitSync(['rev-parse', '--symbolic-full-name', branch], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
    const lines = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const full = lines[lines.length - 1] ?? '';
    if (full.startsWith('refs/')) return full;
  } catch {
    // not a local ref yet
  }
  return `refs/heads/${branch}`;
}

/**
 * The remote's default branch for a clone: recorded metadata first, then
 * refs/remotes/origin/HEAD. Null when neither is known.
 */
export function resolveDefaultBranch(
  cwd: string,
  project?: { metadata?: unknown } | null
): string | null {
  if (project && isRecord(project.metadata)) {
    const recorded = normalizeBranch(
      typeof project.metadata.defaultBranch === 'string' ? project.metadata.defaultBranch : null
    );
    if (recorded) return recorded;
  }
  try {
    const ref = runGitSync(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return normalizeBranch(String(ref));
  } catch {
    return null;
  }
}

export type PushDecision = { ok: true } | { ok: false; error: string; reason: 'direct_ship_off' };

/**
 * With direct ship off, a push to the default branch is refused. When the
 * default branch is unknown, main and master are both treated as default.
 * A missing branch (detached HEAD / "push whatever is current") is refused too.
 */
export function evaluatePush(input: {
  directShip: boolean;
  branch: string | null | undefined;
  defaultBranch: string | null | undefined;
  /** Full ref the push lands on (from resolveTargetRef). Compared as refs/heads/<default>. */
  targetRef?: string | null;
  force?: boolean;
}): PushDecision {
  const protectedRefs = new Set(FALLBACK_PROTECTED_BRANCHES.map((b) => `refs/heads/${b}`));
  const defaultBranch = normalizeBranch(input.defaultBranch);
  if (defaultBranch) protectedRefs.add(`refs/heads/${defaultBranch}`);
  const unsafe = unsafeBranchInput(input.branch);
  const branch = normalizeBranch(input.branch);
  const targetRef = input.targetRef?.trim() || (branch ? `refs/heads/${branch}` : null);
  const hitsDefault =
    !!unsafe ||
    !branch ||
    branch === 'HEAD' ||
    !targetRef ||
    !targetRef.startsWith('refs/heads/') ||
    protectedRefs.has(targetRef);
  // A force push to the default branch is refused even with direct ship on.
  if (input.force && hitsDefault) {
    return {
      ok: false,
      reason: 'direct_ship_off',
      error: 'Studio never force-pushes the default branch.',
    };
  }
  if (input.directShip && !unsafe) return { ok: true };
  if (hitsDefault) {
    return {
      ok: false,
      reason: 'direct_ship_off',
      error: `Direct ship is off for this workspace, so Studio will not push to ${
        branch && branch !== 'HEAD' ? `"${branch}"` : 'the default branch'
      }. Push a feature branch and open a pull request, or turn on direct ship in this workspace's settings.`,
    };
  }
  return { ok: true };
}

/** owner/repo from a GitHub remote URL (https, token-in-URL, or ssh). */
export function parseGitHubRemote(remoteUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!remoteUrl) return null;
  const match = remoteUrl.trim().match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

/**
 * The repo's CURRENT default branch from the GitHub API, looked up at push
 * time. This wins over recorded metadata, so a repo that renamed its default
 * (main -> trunk) after import is still protected. Null if the API can't say.
 */
export async function fetchGitHubDefaultBranch(
  token: string | null | undefined,
  owner: string,
  repo: string
): Promise<string | null> {
  const base = (
    process.env.GITHUB_API_URL ||
    process.env.GITHUB_API_BASE_URL ||
    'https://api.github.com'
  ).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'HoloScript-Studio',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { default_branch?: unknown };
    return typeof data.default_branch === 'string' && data.default_branch.trim()
      ? data.default_branch.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * Default branch for a push decision: GitHub API first, then the recorded
 * metadata / origin/HEAD. evaluatePush also always protects main and master.
 */
export async function resolveDefaultBranchForPush(input: {
  token?: string | null;
  remoteUrl?: string | null;
  cwd?: string;
  project?: { metadata?: unknown } | null;
}): Promise<string | null> {
  const ref = parseGitHubRemote(input.remoteUrl);
  if (ref) {
    const fromApi = await fetchGitHubDefaultBranch(input.token, ref.owner, ref.repo);
    if (fromApi) return fromApi;
  }
  return input.cwd ? resolveDefaultBranch(input.cwd, input.project) : null;
}

/**
 * argv for a server push of ONE branch to the same-named remote branch.
 *
 * A bare `git push origin <b>` lets repo config pick the destination: a
 * planted `remote.<name>.push = refs/heads/x:refs/heads/main`, or a branch
 * upstream of main with `push.default=upstream`, lands the push on main. So:
 *   - the refspec is explicit and full: refs/heads/<b>:refs/heads/<b>;
 *   - with a refspec on the command line git ignores `remote.<name>.push`,
 *     and push.default is pinned to simple. (An empty `-c remote.<name>.push=`
 *     is not usable: git rejects it as "invalid refspec ''".)
 * safeGit's hardening pins are still prepended by runGit/runGitSync.
 */
export function explicitPushArgs(remote: string, branch: string, force = false): string[] {
  const ref = `refs/heads/${branch}`;
  return [
    '-c',
    'push.default=simple',
    'push',
    ...(force ? ['--force'] : []),
    '--',
    remote,
    `${ref}:${ref}`,
  ];
}
