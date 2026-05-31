#!/usr/bin/env node
/**
 * HoloShell Worktree Reap Adapter
 *
 * The hygiene surface for git worktree sprawl — the disk-debris mechanism that
 * accreted ~11 GB of dead `.scratch` worktrees because isolation-at-spawn
 * (W.GOLD.546 / D.068) produced per-agent worktrees while its conservative GC
 * (`scripts/agent-isolation/worktree-gc.mjs`) was drafted-but-never-scheduled.
 *
 * This adapter wraps that GC's proven-safe logic and closes the two gaps the
 * 2026-05-30 sprawl audit proved are the WHOLE problem here, not edge cases:
 *   1. DE-REGISTERED orphans — trees that lost their `git worktree list` entry,
 *      so the registration-reading GC is blind to them.
 *   2. UNMERGED-STALE WIP — abandoned per-agent branches the GC (correctly)
 *      refuses to touch, which therefore accrete forever.
 *
 * Matches the HoloShell adapter contract: dry-run default, redacted SHA-256
 * receipt, `hololand.holoshell.*` schema namespace, no raw absolute paths in the
 * public receipt. Sizing is deliberately NOT done during scan (walking
 * node_modules-heavy trees is the very I/O storm this audit hit) — reclaimed
 * bytes are measured as a free-space delta only on actual reap.
 *
 * Buckets:
 *   REGISTERED_REAPABLE  registered + non-detached branch + clean + merged to
 *                        origin/main + older than TTL. Auto-reapable (the GC set).
 *   DEREGISTERED_ORPHAN  a `.scratch` checkout NOT in `git worktree list`. Cannot
 *                        be git-audited for uncommitted work (no `.git`), so it is
 *                        FLAGGED by default; reaped only with --reap-orphans and
 *                        age > ORPHAN_TTL.
 *   UNMERGED_STALE       registered + unmerged + older than UNMERGED_TTL. FLAGGED
 *                        only; never auto-reaped (would discard un-pushed work).
 *
 * Usage:
 *   node scripts/holoshell-worktree-reap-adapter.mjs scan [--roots a,b] [--out r.json]
 *   node scripts/holoshell-worktree-reap-adapter.mjs reap --commit [--reap-orphans]
 *   node scripts/holoshell-worktree-reap-adapter.mjs --self-test
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { dirname, resolve, join, basename } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'hololand.holoshell.worktree-reap.v0.1.0';
export const WORKFLOW = 'worktree-reap';

const TTL_DAYS = Number(process.env.WT_GC_TTL_DAYS ?? 7); // merged-stale TTL (matches worktree-gc)
const ORPHAN_TTL_DAYS = Number(process.env.WT_ORPHAN_TTL_DAYS ?? 14); // de-registered orphan TTL
const UNMERGED_TTL_DAYS = Number(process.env.WT_UNMERGED_TTL_DAYS ?? 30); // unmerged-stale flag threshold
const DAY_MS = 86400000;

const PRIMARY = 'c:/users/josep/documents/github/holoscript';
const PROTECT = [
  PRIMARY,
  '/c/tmp/holoscript-deploy',
  'c:/tmp/holoscript-deploy',
];
// Scratch roots scanned for de-registered orphans (immediate children only).
const DEFAULT_ROOTS = [
  'C:/Users/josep/Documents/GitHub/HoloScript/.scratch',
  'C:/Users/josep/.ai-ecosystem/.scratch/worktrees',
  'C:/Users/josep/.ai-ecosystem/.scratch',
];

const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
const shSafe = (cmd, opts = {}) => {
  try {
    return sh(cmd, opts);
  } catch {
    return null;
  }
};

// ---- receipt primitives (HoloShell adapter contract) ----
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}
function digest(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}
function hashValue(value) {
  return `sha256:${digest(value)}`;
}
function withHash(receipt) {
  const base = { ...receipt, hashAlgorithm: 'sha256' };
  return { ...base, hash: hashValue(base) };
}
function nowIso(args) {
  const value = args.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ISO timestamp: ${value}`);
  return value;
}
// Public receipt must not leak absolute paths — emit a hash + a redacted leaf.
function pathRef(p) {
  return { pathHash: hashValue(norm(p)), leaf: basename(p.replace(/\\/g, '/')) };
}

function parseArgs(argv) {
  const args = {
    command: argv[0],
    roots: undefined,
    out: undefined,
    now: undefined,
    commit: false,
    reapOrphans: false,
    json: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--roots') args.roots = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--now') args.now = argv[++i];
    else if (a === '--commit') args.commit = true;
    else if (a === '--reap-orphans') args.reapOrphans = true;
    else if (a === '--json') args.json = true;
    else if (a === '--self-test') args.command = '--self-test';
    else if (a === '--help' || a === '-h') args.command = 'help';
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function protectedPath(np) {
  return np === PRIMARY || PROTECT.some((p) => np === norm(p));
}

// A `.keep` sentinel in a scratch dir pins it from reaping regardless of age —
// the escape hatch for reusable toolchains/dep-caches (android-sdk, jdk, gradle,
// platform-tools) that are NOT task scratch and are expensive to re-download.
// Founder policy 2026-05-31: auto-.keep toolchains; honor a hand-dropped .keep too.
function isKept(fullPath) {
  return existsSync(join(fullPath, '.keep'));
}

// ---- discovery (no tree sizing — git metadata + dir mtime only) ----
function listRegistered() {
  const out = shSafe(`git -C "${PRIMARY}" worktree list --porcelain`);
  if (!out) return [];
  return out
    .split('\n\n')
    .filter(Boolean)
    .map((b) => ({
      path: (b.match(/^worktree (.+)$/m) || [])[1],
      branch: (b.match(/^branch (.+)$/m) || [])[1]?.replace('refs/heads/', ''),
      detached: /^detached$/m.test(b),
    }))
    .filter((wt) => wt.path);
}

function classifyRegistered(wt, now) {
  const np = norm(wt.path);
  if (protectedPath(np) || !np.includes('/.scratch/')) return null;
  if (isKept(wt.path)) return { bucket: 'KEPT_SKIP', wt, ageDays: null, merged: false };
  if (wt.detached || !wt.branch) return null;
  const dirty = shSafe(`git -C "${wt.path}" status --porcelain`);
  if (dirty === null) return null; // unreadable → skip, never guess
  const lastTs = Number(shSafe(`git -C "${wt.path}" log -1 --format=%ct`) ?? 0) * 1000;
  const ageDays = lastTs ? Math.round((now - lastTs) / DAY_MS) : null;
  let merged = false;
  try {
    execSync(`git -C "${PRIMARY}" merge-base --is-ancestor ${wt.branch} origin/main`, {
      stdio: 'ignore',
    });
    merged = true;
  } catch {
    merged = false;
  }
  if (dirty !== '') return { bucket: 'DIRTY_SKIP', wt, ageDays, merged: false };
  if (merged && ageDays !== null && ageDays >= TTL_DAYS)
    return { bucket: 'REGISTERED_REAPABLE', wt, ageDays, merged: true };
  if (!merged && ageDays !== null && ageDays >= UNMERGED_TTL_DAYS)
    return { bucket: 'UNMERGED_STALE', wt, ageDays, merged: false };
  return { bucket: 'ACTIVE_SKIP', wt, ageDays, merged };
}

function findOrphans(roots, registeredPaths, now) {
  const regSet = new Set(registeredPaths.map(norm));
  const orphans = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = join(root, e.name);
      const np = norm(full);
      if (regSet.has(np) || protectedPath(np)) continue;
      if (isKept(full)) continue; // .keep-pinned toolchain/cache — never an orphan target
      // Only treat as a worktree-orphan if it looks like a checkout, not a tool dir.
      const looksLikeCheckout =
        existsSync(join(full, 'package.json')) || existsSync(join(full, 'pnpm-workspace.yaml'));
      if (!looksLikeCheckout) continue;
      const hasGit = existsSync(join(full, '.git'));
      if (hasGit) continue; // a real registered/linked worktree handled elsewhere
      let mtime = 0;
      try {
        mtime = statSync(full).mtimeMs;
      } catch {
        /* ignore */
      }
      const ageDays = mtime ? Math.round((now - mtime) / DAY_MS) : null;
      orphans.push({ bucket: 'DEREGISTERED_ORPHAN', path: full, ageDays });
    }
  }
  return orphans;
}

function freeBytes() {
  // PowerShell is the portable way to read free space on the Windows host.
  const out = shSafe(`powershell -NoProfile -Command "(Get-PSDrive C).Free"`);
  const n = out ? Number(out.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}

function reapRegistered(c) {
  sh(`git -C "${PRIMARY}" worktree remove "${c.wt.path}"`);
  // -d (not -D): deletes the branch only if merged; unmerged branches are kept.
  shSafe(`git -C "${PRIMARY}" branch -d ${c.wt.branch}`);
}
function reapOrphanDir(p) {
  // Branch refs/commits live in PRIMARY/.git and are untouched by removing the
  // working directory. rmSync force+recursive handles the deep node_modules trees.
  rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

function run(argv) {
  const args = parseArgs(argv);
  if (args.command === 'help' || !args.command) return printHelp();
  if (args.command === '--self-test') return selfTest();
  if (args.command !== 'scan' && args.command !== 'reap')
    throw new Error(`Unknown command: ${args.command} (expected scan | reap | --self-test)`);

  const observedAt = nowIso(args);
  const now = Date.parse(observedAt);
  const roots = (args.roots ? args.roots.split(',') : DEFAULT_ROOTS).map((r) => r.trim());

  shSafe(`git -C "${PRIMARY}" fetch origin --quiet`);
  const registered = listRegistered();
  const classified = registered.map((wt) => classifyRegistered(wt, now)).filter(Boolean);
  const orphans = findOrphans(
    roots,
    registered.map((w) => w.path),
    now
  );

  const reapable = classified.filter((c) => c.bucket === 'REGISTERED_REAPABLE');
  const unmergedStale = classified.filter((c) => c.bucket === 'UNMERGED_STALE');
  const orphanReapable = orphans.filter(
    (o) => o.ageDays !== null && o.ageDays >= ORPHAN_TTL_DAYS
  );

  const wantReap = args.command === 'reap' && args.commit;
  const freeBefore = wantReap ? freeBytes() : null;

  const actions = [];
  if (wantReap) {
    for (const c of reapable) {
      try {
        reapRegistered(c);
        actions.push({ ...pathRef(c.wt.path), bucket: c.bucket, branchHash: hashValue(c.wt.branch), result: 'reaped' });
      } catch (err) {
        actions.push({ ...pathRef(c.wt.path), bucket: c.bucket, result: 'error', error: String(err.message || err) });
      }
    }
    if (args.reapOrphans) {
      for (const o of orphanReapable) {
        try {
          reapOrphanDir(o.path);
          actions.push({ ...pathRef(o.path), bucket: o.bucket, result: existsSync(o.path) ? 'partial' : 'reaped' });
        } catch (err) {
          actions.push({ ...pathRef(o.path), bucket: o.bucket, result: 'error', error: String(err.message || err) });
        }
      }
    }
  }

  const freeAfter = wantReap ? freeBytes() : null;
  const reclaimedBytes =
    freeBefore !== null && freeAfter !== null ? Math.max(0, freeAfter - freeBefore) : null;

  const receipt = withHash({
    id: `worktree-reap-${digest({ observedAt, registeredCount: registered.length }).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    workflow: WORKFLOW,
    mode: wantReap ? 'reap' : 'scan',
    observedAt,
    policy: { ttlDays: TTL_DAYS, orphanTtlDays: ORPHAN_TTL_DAYS, unmergedTtlDays: UNMERGED_TTL_DAYS, reapOrphans: args.reapOrphans },
    registeredCount: registered.length,
    counts: {
      registeredReapable: reapable.length,
      deregisteredOrphan: orphans.length,
      deregisteredOrphanReapable: orphanReapable.length,
      unmergedStale: unmergedStale.length,
    },
    registeredReapable: reapable.map((c) => ({ ...pathRef(c.wt.path), branchHash: hashValue(c.wt.branch), ageDays: c.ageDays })),
    deregisteredOrphans: orphans.map((o) => ({ ...pathRef(o.path), ageDays: o.ageDays, reapable: o.ageDays !== null && o.ageDays >= ORPHAN_TTL_DAYS })),
    unmergedStale: unmergedStale.map((c) => ({ ...pathRef(c.wt.path), branchHash: hashValue(c.wt.branch), ageDays: c.ageDays, note: 'unpushed work — flag only, never auto-reaped' })),
    actions,
    reclaimedBytes,
    publicReceiptMayContainAbsolutePath: false,
  });

  if (args.out) {
    const abs = resolve(args.out);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  }

  // Human summary
  const L = [];
  L.push(`HoloShell worktree-reap ${VERSION} — mode=${receipt.mode}  (TTL ${TTL_DAYS}d / orphan ${ORPHAN_TTL_DAYS}d / unmerged ${UNMERGED_TTL_DAYS}d)`);
  L.push(`registered worktrees: ${registered.length}`);
  L.push(`  REGISTERED_REAPABLE (merged+clean+stale): ${reapable.length}${reapable.length ? ' — ' + reapable.map((c) => `${c.wt.branch}(${c.ageDays}d)`).join(', ') : ''}`);
  L.push(`  DEREGISTERED_ORPHAN: ${orphans.length} (${orphanReapable.length} past ${ORPHAN_TTL_DAYS}d, reaped only with --reap-orphans)`);
  for (const o of orphans) L.push(`      ${o.path}  (${o.ageDays ?? '?'}d)`);
  L.push(`  UNMERGED_STALE (flag only — unpushed work preserved): ${unmergedStale.length}${unmergedStale.length ? ' — ' + unmergedStale.map((c) => `${c.wt.branch}(${c.ageDays}d)`).join(', ') : ''}`);
  if (wantReap) {
    L.push(`reaped ${actions.filter((a) => a.result === 'reaped').length} / attempted ${actions.length}`);
    if (reclaimedBytes !== null) L.push(`reclaimed ≈ ${(reclaimedBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
  } else {
    L.push(`DRY-RUN. Re-run with: reap --commit  (add --reap-orphans to also remove de-registered orphans past TTL)`);
  }
  L.push(`receipt ${receipt.hash}${args.out ? ` → ${args.out}` : ''}`);
  process.stdout.write(L.join('\n') + '\n');
  return receipt;
}

function printHelp() {
  process.stdout.write(`HoloShell Worktree Reap Adapter ${VERSION}

Closes the worktree-sprawl gap: wraps agent-isolation/worktree-gc's proven-safe
merged+clean+stale reaping, and adds de-registered-orphan + unmerged-stale
discovery the registration-reading GC is blind to.

Usage:
  node scripts/holoshell-worktree-reap-adapter.mjs scan                 # dry-run report (default), no sizing I/O
  node scripts/holoshell-worktree-reap-adapter.mjs scan --out r.json    # write receipt
  node scripts/holoshell-worktree-reap-adapter.mjs reap --commit        # remove merged+clean+stale (safe set)
  node scripts/holoshell-worktree-reap-adapter.mjs reap --commit --reap-orphans  # also remove de-registered orphans past TTL
  node scripts/holoshell-worktree-reap-adapter.mjs --self-test

Safety: dry-run by default; never force-removes; unmerged/dirty/recent/primary/
deploy worktrees are never auto-reaped; unmerged branches are kept (branch -d).
Env: WT_GC_TTL_DAYS=${TTL_DAYS} WT_ORPHAN_TTL_DAYS=${ORPHAN_TTL_DAYS} WT_UNMERGED_TTL_DAYS=${UNMERGED_TTL_DAYS}
`);
}

function selfTest() {
  const failures = [];
  const assert = (cond, msg) => {
    if (!cond) failures.push(msg);
  };
  // receipt determinism + hash binding
  const r1 = withHash({ schemaVersion: RECEIPT_VERSION, workflow: WORKFLOW, a: 1, b: [3, 2] });
  const r2 = withHash({ workflow: WORKFLOW, b: [3, 2], schemaVersion: RECEIPT_VERSION, a: 1 });
  assert(r1.hash === r2.hash, 'canonical hash must be key-order independent');
  assert(r1.hash.startsWith('sha256:'), 'hash must be sha256-prefixed');
  const tampered = { ...r1, a: 2 };
  assert(hashValue({ ...tampered, hash: undefined, hashAlgorithm: undefined }) !== r1.hash, 'tamper must change hash');
  // pathRef must not leak absolute path
  const pr = pathRef('C:/Users/josep/.ai-ecosystem/.scratch/worktrees/holoscript-foo');
  assert(pr.pathHash.startsWith('sha256:') && pr.leaf === 'holoscript-foo', 'pathRef redacts to hash+leaf');
  assert(!JSON.stringify(pr).toLowerCase().includes('users/josep'), 'pathRef must not contain absolute path');
  // protect list
  assert(protectedPath(PRIMARY), 'primary must be protected');
  assert(protectedPath('c:/tmp/holoscript-deploy'), 'deploy must be protected');
  assert(!protectedPath('c:/users/josep/.ai-ecosystem/.scratch/worktrees/x'), 'scratch tree not protected');
  // arg parsing
  const a = parseArgs(['reap', '--commit', '--reap-orphans']);
  assert(a.command === 'reap' && a.commit && a.reapOrphans, 'arg parse reap/commit/reap-orphans');
  const s = parseArgs(['scan']);
  assert(s.command === 'scan' && !s.commit, 'scan defaults to dry-run');

  if (failures.length) {
    process.stdout.write(`SELF-TEST FAILED (${failures.length}):\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
    process.exitCode = 1;
    return false;
  }
  process.stdout.write(`SELF-TEST PASSED — ${RECEIPT_VERSION}\n`);
  return true;
}

// ESM entry guard
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('holoshell-worktree-reap-adapter.mjs');
if (isMain) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err.message || err}\n`);
    process.exitCode = 1;
  }
}

export { run, parseArgs, classifyRegistered, findOrphans, withHash, hashValue, pathRef, selfTest };
