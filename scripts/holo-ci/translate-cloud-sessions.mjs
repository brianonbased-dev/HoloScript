#!/usr/bin/env node
/**
 * translate-cloud-sessions.mjs — land stranded cloud-agent branches onto main so the
 * Windows-only local seat is no longer the manual bridge.
 *
 * WHY THIS EXISTS (W.725 + F.114 + W.726): cloud Claude/Codex sessions push to
 * `claude/*` / `codex/*` branches but are push-gated off main (F.114), and the HoloCI
 * webhook only validates pushes to main — so cloud work strands on branches (W.725),
 * unvalidated, and the founder's Windows-only seat has to detect → cross-platform-
 * validate → cherry-pick → push every one by hand. This script automates that bridge
 * and is built to run ON THE LINUX FLEET (HoloCI / a schedule), never the Windows seat.
 *
 * WHAT IT DOES (per repo --root):
 *   1. fetch --prune, enumerate origin/{claude,codex}/* branches ahead of origin/main
 *   2. classify each:
 *        ABSORBED   — every commit already on main by patch-id (git cherry all '-')  → delete candidate
 *        STALE      — too far behind main (> --max-behind, default 80) → cherry-pick will conflict;
 *                     value must be re-implemented fresh, not merged (see this session's 766-behind case)
 *        CONFLICTED — cherry-pick onto main does not apply cleanly
 *        NEEDS-FIX  — applies cleanly but FAILS the cross-platform portability gate (W.726)
 *        LANDABLE   — applies cleanly AND passes the portability gate
 *   3. report a structured plan (human table + --json)
 *   4. --cleanup : delete ABSORBED branches from origin
 *      --land    : cherry-pick LANDABLE branches onto main + push (GATED — see F.114 below)
 *
 * LANDING IS GATED (F.114): autonomous main-push is classifier-gated. `--land` refuses
 * unless HOLO_TRANSLATE_LAND=1 is set (an authorized/service context opts in explicitly).
 * Default --report mode mutates nothing and is safe to run autonomously on a schedule;
 * it surfaces LANDABLE branches for a one-step approve, removing the *detection +
 * cross-platform validation* burden (the part a Windows seat genuinely cannot do for
 * Linux code) while leaving the final push under the founder gate.
 *
 * Usage:
 *   node scripts/holo-ci/translate-cloud-sessions.mjs [--root <dir>] [--report|--cleanup|--land]
 *        [--max-behind N] [--patterns claude,codex] [--json]
 *
 * Exit 0 = ran clean (report) / all actions ok. 1 = an action failed. 2 = usage/env error.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const ROOT = path.resolve(arg('--root', process.env.HOLO_ROOT || process.cwd()));
const MODE = process.argv.includes('--land')
  ? 'land'
  : process.argv.includes('--cleanup')
    ? 'cleanup'
    : 'report';
const MAX_BEHIND = parseInt(arg('--max-behind', '80'), 10);
const PATTERNS = arg('--patterns', 'claude,codex')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const JSON_OUT = process.argv.includes('--json');
const GATE = path.join(ROOT, 'scripts/holo-ci/check-cross-platform-paths.mjs');

function git(args, opts = {}) {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}
function gitTry(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '') + String(e.stderr || e.message || '') };
  }
}

if (!fs.existsSync(path.join(ROOT, '.git'))) {
  console.error(`[translate] not a git repo: ${ROOT}`);
  process.exit(2);
}

// ── 1. discover cloud branches ahead of main ──────────────────────────────────
gitTry(['fetch', 'origin', '--prune', '--quiet']);
const mainRef = 'origin/main';
const refLines = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'])
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const branches = [];
for (const ref of refLines) {
  if (ref === mainRef || ref.endsWith('/HEAD')) continue;
  const short = ref.replace(/^origin\//, '');
  if (!PATTERNS.some((p) => short.startsWith(p + '/'))) continue;
  const ahead = parseInt(
    (gitTry(['rev-list', '--count', `${mainRef}..${ref}`]).out || '0').trim(),
    10
  );
  if (!ahead) continue; // nothing ahead — already merged
  const behind = parseInt(
    (gitTry(['rev-list', '--count', `${ref}..${mainRef}`]).out || '0').trim(),
    10
  );
  const date = (gitTry(['log', '-1', '--format=%cr', ref]).out || '').trim();
  const cherry = (gitTry(['cherry', mainRef, ref]).out || '').split('\n').filter(Boolean);
  const unmerged = cherry.filter((l) => l.startsWith('+')).length;
  branches.push({ ref, short, ahead, behind, date, unmerged });
}

// ── 2. classify ───────────────────────────────────────────────────────────────
// cherry-pick dry-run onto main without mutating the working tree, via merge-tree.
function cherryPickConflicts(ref) {
  // git merge-tree (>=2.38) computes the merge of <ref> onto main and reports conflicts
  // without touching the index/worktree. Fall back to a behind-heuristic if unavailable.
  const r = gitTry(['merge-tree', '--write-tree', '--name-only', mainRef, ref]);
  if (r.ok) return false; // exit 0 → clean merge
  if (/unknown option|usage: git merge-tree/i.test(r.out)) return null; // old git → unknown
  return true; // non-zero → conflicts
}

// run the cross-platform portability gate against a branch via a throwaway worktree
// (the gate is dependency-free, so a bare worktree needs no install — F.103-safe: no
// node_modules link/mutation). Always removed in finally.
function portabilityClean(ref) {
  if (!fs.existsSync(GATE)) return { ran: false };
  const wt = path.join(
    os.tmpdir(),
    `holo-translate-${ref.replace(/[^a-z0-9]/gi, '_')}-${process.pid}`
  );
  try {
    const add = gitTry(['worktree', 'add', '--detach', '--quiet', wt, ref]);
    if (!add.ok) return { ran: false, reason: 'worktree add failed' };
    try {
      execFileSync('node', [GATE, '--root', wt, '--changed', mainRef, '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 16 * 1024 * 1024,
      });
      return { ran: true, clean: true };
    } catch (e) {
      const out = String(e.stdout || '');
      let count = 0;
      try {
        count = (JSON.parse(out) || {}).count || 0;
      } catch {
        count = -1;
      }
      return { ran: true, clean: false, count, raw: out.slice(0, 4000) };
    }
  } finally {
    gitTry(['worktree', 'remove', '--force', wt]);
    try {
      if (fs.existsSync(wt)) fs.rmSync(wt, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

for (const b of branches) {
  if (b.unmerged === 0) {
    b.status = 'ABSORBED';
    continue;
  }
  if (b.behind > MAX_BEHIND) {
    b.status = 'STALE';
    b.note = `${b.behind} commits behind main (> ${MAX_BEHIND}) — re-implement fresh, do not merge`;
    continue;
  }
  const conflicts = cherryPickConflicts(b.ref);
  if (conflicts === true) {
    b.status = 'CONFLICTED';
    b.note = 'cherry-pick onto main does not apply cleanly';
    continue;
  }
  // applies clean (or merge-tree unavailable) → run portability gate
  const port = MODE === 'report' || MODE === 'land' ? portabilityClean(b.ref) : { ran: false };
  if (port.ran && !port.clean) {
    b.status = 'NEEDS-FIX';
    b.note = `cross-platform portability gate failed (${port.count} hazard(s), W.726)`;
    continue;
  }
  b.status = 'LANDABLE';
  b.note = port.ran
    ? 'clean cherry-pick + portability OK'
    : 'clean cherry-pick (portability gate not run)';
}

// ── 3. report ─────────────────────────────────────────────────────────────────
const buckets = { LANDABLE: [], 'NEEDS-FIX': [], CONFLICTED: [], STALE: [], ABSORBED: [] };
for (const b of branches) (buckets[b.status] ||= []).push(b);

if (JSON_OUT) {
  console.log(
    JSON.stringify({ root: ROOT, mode: MODE, count: branches.length, branches }, null, 2)
  );
} else {
  console.log(`\n[translate] cloud-session branches in ${path.basename(ROOT)} (mode: ${MODE})`);
  if (branches.length === 0) console.log('  ✅ none — no stranded cloud branches ahead of main');
  for (const [status, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    console.log(`\n  ${status} (${list.length}):`);
    for (const b of list)
      console.log(
        `    · ${b.short}  ahead=${b.ahead} behind=${b.behind} (${b.date})${b.note ? ' — ' + b.note : ''}`
      );
  }
}

// ── 4. actions ────────────────────────────────────────────────────────────────
let failed = 0;

if (MODE === 'cleanup') {
  for (const b of buckets.ABSORBED) {
    const r = gitTry(['push', 'origin', '--delete', b.short]);
    console.log(
      `  ${r.ok ? 'deleted' : 'FAILED  '} ${b.short}${r.ok ? '' : ' — ' + r.out.slice(0, 120)}`
    );
    if (!r.ok) failed++;
  }
}

if (MODE === 'land') {
  if (process.env.HOLO_TRANSLATE_LAND !== '1') {
    console.error(
      '\n[translate] --land refused: autonomous main-push is founder-gated (F.114). Set HOLO_TRANSLATE_LAND=1 in an authorized/service context to land LANDABLE branches.'
    );
    process.exit(2);
  }
  for (const b of buckets.LANDABLE) {
    // cherry-pick the branch's unmerged commits onto a fresh main, then push.
    const shas = (gitTry(['rev-list', '--reverse', `${mainRef}..${b.ref}`]).out || '')
      .split('\n')
      .filter(Boolean);
    const pick = gitTry(['cherry-pick', '-x', ...shas]);
    if (!pick.ok) {
      gitTry(['cherry-pick', '--abort']);
      console.error(`  FAILED cherry-pick ${b.short} — ${pick.out.slice(0, 160)}`);
      failed++;
      continue;
    }
    const push = gitTry(['push', 'origin', 'HEAD:main']);
    if (!push.ok) {
      console.error(
        `  cherry-picked ${b.short} locally but PUSH failed — ${push.out.slice(0, 160)}`
      );
      failed++;
      continue;
    }
    console.log(`  landed ${b.short} (${shas.length} commit(s)) → main`);
  }
}

const summary = `LANDABLE=${buckets.LANDABLE.length} NEEDS-FIX=${buckets['NEEDS-FIX'].length} CONFLICTED=${buckets.CONFLICTED.length} STALE=${buckets.STALE.length} ABSORBED=${buckets.ABSORBED.length}`;
if (!JSON_OUT) console.log(`\nSUMMARY: ${summary}`);
process.exit(failed ? 1 : 0);
