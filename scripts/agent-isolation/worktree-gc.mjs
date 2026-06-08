#!/usr/bin/env node
/**
 * Conservative worktree GC — agent-substrate fix Phase 0 (W.GOLD.546 / MEMORY D.068).
 *
 * DRY-RUN by default. Removes a `.scratch` worktree ONLY when ALL hold:
 *   - under `.scratch/` (never the primary, never the deploy worktree)
 *   - has a (non-detached) branch
 *   - working tree is CLEAN (no uncommitted or untracked changes)
 *   - its branch is fully merged into origin/main (no unmerged commits)
 *   - last commit older than TTL (default 7 days; WT_GC_TTL_DAYS to override)
 *
 * Pass --commit to actually remove. It NEVER force-removes; a dirty, unmerged,
 * recent, or protected worktree is always skipped. This exists so isolation-at-spawn
 * (one worktree per agent task) does not accrete into hundreds of dead trees —
 * the premortem gap #1 for this initiative.
 */
import { execSync } from 'node:child_process';

const TTL_DAYS = Number(process.env.WT_GC_TTL_DAYS ?? 7);
const COMMIT = process.argv.includes('--commit');
const PRIMARY = 'c:/users/josep/documents/github/holoscript';
const PROTECT = [PRIMARY, '/c/tmp/holoscript-deploy', 'c:/tmp/holoscript-deploy'];

const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();

sh('git fetch origin --quiet');

const blocks = sh('git worktree list --porcelain').split('\n\n').filter(Boolean);
const worktrees = blocks.map((b) => ({
  path: (b.match(/^worktree (.+)$/m) || [])[1],
  branch: (b.match(/^branch (.+)$/m) || [])[1]?.replace('refs/heads/', ''),
  detached: /^detached$/m.test(b),
}));

const now = Date.now();
const candidates = [];
for (const wt of worktrees) {
  if (!wt.path) continue;
  const np = norm(wt.path);
  if (np === PRIMARY || !np.includes('/.scratch/')) continue;
  if (PROTECT.some((p) => np === norm(p))) continue;
  if (wt.detached || !wt.branch) continue;
  if (sh(`git -C "${wt.path}" status --porcelain`) !== '') continue; // dirty → skip
  let merged = false;
  try {
    execSync(`git merge-base --is-ancestor ${wt.branch} origin/main`, { stdio: 'ignore' });
    merged = true;
  } catch {
    /* unmerged */
  }
  if (!merged) continue;
  const lastTs = Number(sh(`git -C "${wt.path}" log -1 --format=%ct`)) * 1000;
  const ageDays = (now - lastTs) / 86400000;
  if (ageDays < TTL_DAYS) continue;
  candidates.push({ ...wt, ageDays: Math.round(ageDays) });
}

if (candidates.length === 0) {
  console.log('No GC candidates — all .scratch worktrees are active, dirty, unmerged, or recent.');
  process.exit(0);
}
console.log(
  `${COMMIT ? 'REMOVING' : 'DRY-RUN — would remove'} ${candidates.length} merged+clean+stale worktree(s):`
);
for (const c of candidates) {
  console.log(`  ${c.branch}  (${c.ageDays}d)  ${c.path}`);
  if (COMMIT) {
    sh(`git worktree remove "${c.path}"`);
    try {
      sh(`git branch -d ${c.branch}`);
    } catch {
      /* keep branch if not deletable */
    }
  }
}
if (!COMMIT)
  console.log(
    '\nRe-run with --commit to remove. Conservative: never touches dirty/unmerged/recent/primary/deploy.'
  );
