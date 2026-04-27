#!/usr/bin/env node
/**
 * build-live-evidence-manifest.mjs — generate docs/public/live-evidence.json
 *
 * Companion to scripts/build-provenance-manifest.mjs and
 * scripts/build-papers-status-manifest.mjs (parallel pattern). Powers the
 * Live Evidence Strip on the holoscript.net homepage. Three tiles:
 *
 *   A — Fleet   : agents online, $ spent today, commits last 24h
 *   B — Anchor  : last paper anchored on Base (sha + block + tx)
 *   C — Commit  : last non-merge commit (ai-ecosystem first, fallback HoloScript)
 *
 * Read-only against:
 *   AI_ECO_ROOT/research/**\/*.base.json   (Tile B — sorted by anchored_at)
 *   AI_ECO_ROOT/vast-spend-ledger.ndjson  (Tile A — rent/close pairs)
 *   git -C AI_ECO_ROOT log + git -C HOLOSCRIPT_ROOT log  (Tiles A+C)
 *
 * Override the ai-ecosystem clone path with --ai-eco=<path> or AI_ECO_ROOT.
 *
 * Refresh cadence: every 6h via GitHub Actions cron + repository_dispatch
 * on research file change (task_1777316737268_nxgx). Manual:
 *   node scripts/build-live-evidence-manifest.mjs
 *   git add docs/public/live-evidence.json
 *   git commit -m "docs(public): refresh live-evidence manifest"
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const argMap = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const HOLOSCRIPT_ROOT = path.resolve(__dirname, '..');
const AI_ECO_ROOT =
  argMap['ai-eco'] || process.env.AI_ECO_ROOT || 'C:/Users/josep/.ai-ecosystem';
const OUT_PATH = path.resolve(HOLOSCRIPT_ROOT, 'docs', 'public', 'live-evidence.json');

const NOW_MS = Date.now();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SINCE_24H_MS = NOW_MS - ONE_DAY_MS;

// --- helpers ---
function git(repo, ...args) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function listFilesRec(dir, suffix, accum = []) {
  if (!fs.existsSync(dir)) return accum;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      listFilesRec(full, suffix, accum);
    } else if (ent.name.endsWith(suffix)) {
      accum.push(full);
    }
  }
  return accum;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function basescanTxUrl(tx) {
  return `https://basescan.org/tx/${tx}`;
}

function relativeTime(ms) {
  const delta = NOW_MS - ms;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`;
  if (delta < ONE_DAY_MS) return `${Math.floor(delta / 3_600_000)} h ago`;
  return `${Math.floor(delta / ONE_DAY_MS)} d ago`;
}

// --- Tile A: Fleet (handles online + spend today + commits 24h) ---
function buildFleetTile() {
  const ledgerPath = path.join(AI_ECO_ROOT, 'vast-spend-ledger.ndjson');
  let agentsLast24h = 0;
  let spendUsd24h = 0;
  let ledgerNote = null;

  if (fs.existsSync(ledgerPath)) {
    const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
    const events = lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Pair rented→closed by instance_id; if still open, treat close as NOW
    const open = new Map();
    const handles24h = new Set();
    for (const e of events) {
      const tsMs = new Date(e.ts_iso).getTime();
      if (e.event === 'rented') {
        open.set(e.instance_id, { rentedMs: tsMs, dph: e.dph, handle: e.handle });
        if (tsMs >= SINCE_24H_MS && e.handle) handles24h.add(e.handle);
      } else if (e.event === 'closed') {
        const r = open.get(e.instance_id);
        if (r) {
          // clip both ends to the 24h window
          const startMs = Math.max(r.rentedMs, SINCE_24H_MS);
          const endMs = Math.min(tsMs, NOW_MS);
          if (endMs > startMs) {
            const hours = (endMs - startMs) / 3_600_000;
            spendUsd24h += hours * (r.dph || 0);
          }
          open.delete(e.instance_id);
        }
      }
    }
    // Still-open instances accumulate to NOW
    for (const r of open.values()) {
      if (r.handle) handles24h.add(r.handle);
      const startMs = Math.max(r.rentedMs, SINCE_24H_MS);
      const hours = (NOW_MS - startMs) / 3_600_000;
      if (hours > 0) spendUsd24h += hours * (r.dph || 0);
    }
    agentsLast24h = handles24h.size;
  } else {
    ledgerNote = 'vast-spend-ledger.ndjson not present';
  }

  // Commits 24h — both repos. Filter bot/dependabot in JS since git log's
  // --author/--invert-grep don't compose (--invert-grep only affects --grep).
  const commitCounts = { aiEcosystem: 0, holoScript: 0 };
  const isBotAuthor = (name) =>
    /dependabot/i.test(name) || /\[bot\]/.test(name) || /github-actions/i.test(name);
  for (const [repo, key] of [
    [AI_ECO_ROOT, 'aiEcosystem'],
    [HOLOSCRIPT_ROOT, 'holoScript'],
  ]) {
    const out = git(repo, 'log', '--since=24 hours ago', '--no-merges',
      '--pretty=format:%H%x09%an');
    if (out !== null && out.length > 0) {
      const lines = out.split('\n').filter(Boolean);
      commitCounts[key] = lines.filter((l) => {
        const author = l.split('\t')[1] || '';
        return !isBotAuthor(author);
      }).length;
    }
  }

  return {
    agentsLast24h,
    spendUsd24h: Math.round(spendUsd24h * 1000) / 1000,
    commitsLast24h: commitCounts.aiEcosystem + commitCounts.holoScript,
    commitsByRepo: commitCounts,
    note: ledgerNote,
  };
}

// --- Tile B: Last paper anchored on Base ---
function buildAnchorTile() {
  const researchDir = path.join(AI_ECO_ROOT, 'research');
  const baseFiles = listFilesRec(researchDir, '.base.json');
  let latest = null;

  for (const p of baseFiles) {
    const data = readJson(p);
    if (!data || !data.anchored_at || !data.tx_hash) continue;
    if (!latest || data.anchored_at > latest.anchored_at) {
      latest = { ...data, _path: p };
    }
  }

  if (!latest) return { note: 'no .base.json receipts found' };

  // recover the source path: foo.tex.base.json -> foo.tex
  const sourceFs = latest._path.endsWith('.base.json')
    ? latest._path.slice(0, -'.base.json'.length)
    : latest._path;
  const sourceRel = path.relative(AI_ECO_ROOT, sourceFs).replace(/\\/g, '/');
  const fileName = path.basename(sourceRel);

  return {
    file: sourceRel,
    fileName,
    fileSha256: latest.file_sha256,
    fileSha256Short: (latest.file_sha256 || '').slice(0, 12),
    txHash: latest.tx_hash,
    txHashShort: (latest.tx_hash || '').slice(0, 12),
    blockNumber: latest.block_number,
    basescanUrl: basescanTxUrl(latest.tx_hash),
    anchoredAtMs: latest.anchored_at * 1000,
    anchoredAtIso: new Date(latest.anchored_at * 1000).toISOString(),
    relativeTime: relativeTime(latest.anchored_at * 1000),
  };
}

// --- Tile C: Last non-merge non-bot commit ---
function buildCommitTile() {
  const isBotAuthor = (name) =>
    /dependabot/i.test(name) || /\[bot\]/.test(name) || /github-actions/i.test(name);
  const candidates = [];
  for (const [repo, name] of [
    [AI_ECO_ROOT, 'ai-ecosystem'],
    [HOLOSCRIPT_ROOT, 'HoloScript'],
  ]) {
    // Pull last 20 candidates and filter bots in JS (git log can't exclude authors directly).
    const out = git(repo, 'log', '-20', '--no-merges',
      '--pretty=format:%H%x09%cI%x09%s%x09%an');
    if (!out) continue;
    for (const line of out.split('\n').filter(Boolean)) {
      const [hash, iso, subject, author] = line.split('\t');
      if (isBotAuthor(author || '')) continue;
      candidates.push({ repo: name, hash, iso, ms: new Date(iso).getTime(), subject, author });
      break; // first non-bot per repo is the most recent
    }
  }
  candidates.sort((a, b) => b.ms - a.ms);
  const latest = candidates[0];
  if (!latest) return { note: 'no eligible commits found' };

  return {
    repo: latest.repo,
    hash: latest.hash,
    hashShort: latest.hash.slice(0, 7),
    subject: latest.subject,
    author: latest.author,
    iso: latest.iso,
    relativeTime: relativeTime(latest.ms),
    githubUrl: `https://github.com/brianonbased-dev/${latest.repo === 'ai-ecosystem' ? 'ai-ecosystem' : 'HoloScript'}/commit/${latest.hash}`,
  };
}

// --- main ---
function main() {
  const fleet = buildFleetTile();
  const anchor = buildAnchorTile();
  const commit = buildCommitTile();

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date(NOW_MS).toISOString(),
    notes: 'Refresh via scripts/build-live-evidence-manifest.mjs. Auto-refreshes via GHA cron (task_1777316737268_nxgx) every 6h + repository_dispatch on research changes.',
    sourceRepos: {
      aiEcosystem: AI_ECO_ROOT,
      holoScript: HOLOSCRIPT_ROOT,
    },
    tiles: {
      fleet,
      anchor,
      commit,
    },
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.error(`[live-evidence] wrote ${path.relative(process.cwd(), OUT_PATH)}`);
  console.error(`[live-evidence] fleet: ${fleet.agentsLast24h} agents / $${fleet.spendUsd24h.toFixed(3)} / ${fleet.commitsLast24h} commits 24h`);
  console.error(`[live-evidence] anchor: ${anchor.fileName || '(none)'} ${anchor.relativeTime ? `(${anchor.relativeTime})` : ''}`);
  console.error(`[live-evidence] commit: ${commit.repo || '?'} ${commit.hashShort || ''} ${commit.relativeTime ? `(${commit.relativeTime})` : ''}`);
}

main();
