/**
 * Which code projects live on this machine, which checkout of each is the
 * one to map, and which are copies.
 *
 * Why (2026-10-05): the founder wants HoloAbsorb to cover the whole computer,
 * built around how the parts work together. Measured on the laptop: 77 git
 * checkouts but about 25 distinct projects; one project had 24 copies (agent
 * worktrees, release-gate copies, D:\ clones). Mapping every checkout would
 * repeat the same project dozens of times. Identity comes from history: a
 * project is its root commit(s). HoloRepo canon (bare repos under
 * <ai-ecosystem>/.holorepo/git) names the projects the team owns; anything
 * else found is reported as outside HoloRepo.
 *
 * This module reads git metadata only (no source files) and never follows
 * symlinks or Windows junctions (a worktree's node_modules is a junction into
 * another checkout).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface MachineCheckout {
  path: string;
  /** True when `.git` is a file (a linked worktree). */
  worktree: boolean;
  head: string | null;
  headDate: string | null;
}

export interface MachineProject {
  /** HoloRepo canon name, or the primary checkout's folder name. */
  id: string;
  inHoloRepo: boolean;
  /**
   * holorepo: a HoloRepo canon project. outside: a real project not in
   * HoloRepo. scratch: found only under a scratch/worktree/clone/archive
   * folder (test fixtures, throwaway repos); not mapped by default.
   */
  kind: 'holorepo' | 'outside' | 'scratch';
  canonGitDir: string | null;
  /** Root commit(s) of the history, sorted and joined; the project's identity. */
  identity: string;
  /** The checkout to map; null when only the canon bare repo exists here. */
  primary: MachineCheckout | null;
  copies: MachineCheckout[];
}

export interface MachineCatalog {
  schema: 'holoscript.machine-catalog.v1';
  generatedAt: string;
  searchRoots: string[];
  projects: MachineProject[];
  /** Checkouts with no readable history (empty repos, broken worktrees). */
  unidentified: MachineCheckout[];
}

export interface DiscoverOptions {
  searchRoots: string[];
  /** Directory holding HoloRepo canon bare repos (e.g. ai-ecosystem/.holorepo/git). */
  canonGitDir?: string | null;
  /** Folder depth below each search root (default 6). */
  maxDepth?: number;
}

/** Folder names never entered: dependencies, system, and places that hold credentials. */
const SKIP_NAMES = new Set(
  [
    'node_modules',
    '.pnpm-store',
    '.git',
    'AppData',
    '$Recycle.Bin',
    'System Volume Information',
    'Windows',
    'Program Files',
    'Program Files (x86)',
    'ProgramData',
    '.ssh',
    '.gnupg',
    '.aws',
    '.azure',
    '.kube',
    '.docker',
    '.cache',
    '.npm',
    '.cargo',
    '.rustup',
    'wallets',
    '.holokey',
  ].map((name) => name.toLowerCase())
);

/** Path segments that mark a checkout as a working copy rather than the main one. */
const COPY_MARKERS = ['.scratch', 'worktrees', '.holorepo-worktrees', 'clones', '_archive', '_archived', 'scratch', 'tmp', 'backups'];

function git(args: string[], cwd?: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Root commits of the first ref that has history. A clone of a bare repo whose
 * HEAD names a missing branch (three HoloRepo canon repos on the laptop point
 * HEAD at master while history is on main) has an unborn HEAD and only the
 * origin/* refs, so those are tried too.
 */
function rootIdentity(gitArgs: string[]): string | null {
  for (const ref of ['HEAD', 'main', 'master', 'origin/HEAD', 'origin/main', 'origin/master']) {
    const roots = git([...gitArgs, 'rev-list', '--max-parents=0', ref]);
    if (roots) return roots.split(/\s+/).filter(Boolean).sort().join('+');
  }
  return null;
}

function describeCheckout(dir: string, worktree: boolean): { checkout: MachineCheckout; identity: string | null } {
  const head = git(['-C', dir, 'rev-parse', 'HEAD']);
  const headDate = head ? git(['-C', dir, 'log', '-1', '--format=%cI', 'HEAD']) : null;
  return {
    checkout: { path: dir, worktree, head, headDate },
    identity: rootIdentity(['-C', dir]),
  };
}

function findCheckouts(searchRoots: string[], maxDepth: number): Array<{ dir: string; worktree: boolean }> {
  const found: Array<{ dir: string; worktree: boolean }> = [];
  const seen = new Set<string>();
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const gitEntry = entries.find((entry) => entry.name === '.git');
    if (gitEntry && !gitEntry.isSymbolicLink()) {
      const key = path.resolve(dir).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ dir: path.resolve(dir), worktree: gitEntry.isFile() });
      }
    }
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      // Never follow links: junctions and symlinks lead into other trees.
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (SKIP_NAMES.has(entry.name.toLowerCase())) continue;
      if (entry.name.endsWith('.git')) continue; // bare repos are read through canonGitDir
      walk(path.join(dir, entry.name), depth + 1);
    }
  };
  for (const root of searchRoots) walk(path.resolve(root), 0);
  return found;
}

function copyScore(checkout: MachineCheckout, canonName: string | null): number {
  const parts = checkout.path.replace(/\\/g, '/').toLowerCase().split('/');
  let score = 0;
  if (checkout.worktree) score += 100;
  if (parts.some((part) => COPY_MARKERS.includes(part))) score += 50;
  if (canonName && parts[parts.length - 1] !== canonName.toLowerCase()) score += 10;
  return score;
}

export function discoverMachineProjects(options: DiscoverOptions): MachineCatalog {
  const canon = new Map<string, { name: string; gitDir: string }>();
  if (options.canonGitDir) {
    let bareRepos: fs.Dirent[] = [];
    try {
      bareRepos = fs.readdirSync(options.canonGitDir, { withFileTypes: true });
    } catch {
      bareRepos = [];
    }
    for (const entry of bareRepos) {
      if (!entry.isDirectory() || !entry.name.endsWith('.git')) continue;
      const gitDir = path.join(options.canonGitDir, entry.name);
      const identity = rootIdentity(['--git-dir', gitDir]);
      if (identity) canon.set(identity, { name: entry.name.slice(0, -4), gitDir });
    }
  }

  const byIdentity = new Map<string, MachineCheckout[]>();
  const unidentified: MachineCheckout[] = [];
  for (const { dir, worktree } of findCheckouts(options.searchRoots, options.maxDepth ?? 6)) {
    const { checkout, identity } = describeCheckout(dir, worktree);
    if (!identity) {
      unidentified.push(checkout);
      continue;
    }
    const list = byIdentity.get(identity);
    if (list) list.push(checkout);
    else byIdentity.set(identity, [checkout]);
  }

  const projects: MachineProject[] = [];
  const identities = new Set([...byIdentity.keys(), ...canon.keys()]);
  for (const identity of identities) {
    const owner = canon.get(identity) ?? null;
    const checkouts = [...(byIdentity.get(identity) ?? [])].sort((a, b) => {
      const scoreDiff = copyScore(a, owner?.name ?? null) - copyScore(b, owner?.name ?? null);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.headDate ?? '').localeCompare(a.headDate ?? '');
    });
    const primary = checkouts[0] ?? null;
    const onlyInScratch =
      primary !== null &&
      primary.path
        .replace(/\\/g, '/')
        .toLowerCase()
        .split('/')
        .some((part) => COPY_MARKERS.includes(part));
    projects.push({
      id: owner?.name ?? (primary ? path.basename(primary.path) : identity.slice(0, 12)),
      inHoloRepo: owner !== null,
      kind: owner ? 'holorepo' : onlyInScratch ? 'scratch' : 'outside',
      canonGitDir: owner?.gitDir ?? null,
      identity,
      primary,
      copies: checkouts.slice(1),
    });
  }
  projects.sort((a, b) => Number(b.inHoloRepo) - Number(a.inHoloRepo) || a.id.localeCompare(b.id));

  return {
    schema: 'holoscript.machine-catalog.v1',
    generatedAt: new Date().toISOString(),
    searchRoots: options.searchRoots.map((root) => path.resolve(root)),
    projects,
    unidentified,
  };
}
