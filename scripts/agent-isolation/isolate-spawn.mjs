#!/usr/bin/env node
/**
 * Isolation-at-spawn enforcement — agent-substrate fix Phase 0 (W.GOLD.546 / MEMORY D.068).
 *
 * THE FIX (not a bandaid): an agent must never mutate the shared primary checkout.
 * When a session starts in the frozen primary, this provisions (or reuses) an
 * isolated worktree for the agent and emits guidance as SessionStart additionalContext.
 * Per-agent working copy = the shared-tree collision (stash/index races, stranded
 * commits) becomes IMPOSSIBLE, while "everyone writes to main" velocity is preserved.
 *
 * ACTIVATION IS FLEET-COORDINATED. Do NOT add this to .claude/settings.json
 * SessionStart until the running fleet is coordinated — flipping it live changes
 * every agent's startup. This file is the drafted enforcement primitive; wiring it
 * is the deliberate, coordinated step (see README.md).
 *
 * Output: a SessionStart hook JSON envelope (additionalContext). Side effect: may
 * create one worktree per agent handle (idempotent — reuses an existing one).
 */
import { execSync } from 'node:child_process';

const PRIMARY = 'c:/users/josep/documents/github/holoscript';
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
const emit = (additionalContext) =>
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));

const root = norm(sh('git rev-parse --show-toplevel'));
if (root !== PRIMARY) { emit(''); process.exit(0); } // already isolated — no-op

const handle = (process.env.AGENT_HANDLE || process.env.HOLOMESH_HANDLE || `agent-${process.pid}`)
  .replace(/[^a-z0-9-]/gi, '-').toLowerCase();
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

// Reuse this handle's existing worktree if one is live
const mine = sh('git worktree list --porcelain')
  .split('\n').map((l) => (l.match(/^worktree (.+)$/) || [])[1]).filter(Boolean)
  .find((p) => norm(p).includes('/.scratch/') && norm(p).includes(handle));

let wt = mine;
if (!wt) {
  const top = sh('git rev-parse --show-toplevel');
  wt = `${top}/.scratch/${handle}-${ts}`;
  sh('git fetch origin --quiet');
  sh(`git worktree add "${wt}" -b codex/${handle}-${ts} origin/main`);
}

emit([
  '⚠️ ISOLATION (W.GOLD.546 / D.068): this session started in the FROZEN PRIMARY checkout.',
  'Do NOT edit or commit here — the shared tree collides (stash/index races) and commits to main/codex/* strand.',
  'Your isolated worktree — do ALL edits, commits, and pushes there:',
  `  cd "${wt}"`,
  'Per-agent isolation makes collisions impossible while preserving commit-straight-to-main velocity.',
].join('\n'));
