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
  const trimmed = name.trim().replace(/^refs\/heads\//, '').replace(/^origin\//, '');
  return trimmed || null;
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
}): PushDecision {
  if (input.directShip) return { ok: true };
  const branch = normalizeBranch(input.branch);
  const protectedBranches = new Set(FALLBACK_PROTECTED_BRANCHES);
  const defaultBranch = normalizeBranch(input.defaultBranch);
  if (defaultBranch) protectedBranches.add(defaultBranch);
  if (!branch || branch === 'HEAD' || protectedBranches.has(branch)) {
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
