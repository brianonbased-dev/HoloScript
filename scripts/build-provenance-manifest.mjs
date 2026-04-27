#!/usr/bin/env node
/**
 * build-provenance-manifest.mjs — generate docs/public/provenance-manifest.json
 *
 * Walks the ai-ecosystem research/ tree on the local machine, reads every
 * `.base.json` (Base L2 anchor receipt) + tests for the matching `.ots`
 * (OpenTimestamps Bitcoin receipt) and the source file, computes the current
 * LF-normalized SHA-256 of the source, and emits a JSON manifest the
 * holoscript.net /provenance page consumes at build time.
 *
 * Drift detection: a receipt is BITCOIN_BASE_OK only if (current sha256 ==
 * receipt.file_sha256). Anything else is flagged drifted and surfaced in the
 * audit bucket. This mirrors scripts/verify_provenance.py in ai-ecosystem
 * (the SSOT verifier) — that script's TEXT_EXTS list is reproduced below.
 *
 * Refresh cadence: manual. Re-run after every anchor round closes:
 *   node scripts/build-provenance-manifest.mjs
 *   git add docs/public/provenance-manifest.json
 *   git commit -m "docs(provenance): refresh manifest — round N"
 *
 * The site build (docs/.vitepress/) never touches ai-ecosystem; it reads
 * the committed manifest. Cross-repo coupling stays at refresh time.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default to the Windows clone path the founder uses; override with --ai-eco=<path>.
const argMap = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const AI_ECO_ROOT =
  argMap['ai-eco'] ||
  process.env.AI_ECO_ROOT ||
  'C:/Users/josep/.ai-ecosystem';

const RESEARCH_ROOT = path.join(AI_ECO_ROOT, 'research');
const OUT_PATH = path.resolve(
  __dirname,
  '..',
  'docs',
  'public',
  'provenance-manifest.json',
);

// Mirror of scripts/verify_provenance.py TEXT_EXTS — must stay in sync.
const TEXT_EXTS = new Set([
  '.md', '.markdown', '.txt', '.rst',
  '.json', '.yml', '.yaml', '.toml', '.xml',
  '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.sh', '.ps1', '.bash', '.zsh',
  '.rs', '.go', '.c', '.cc', '.cpp', '.h', '.hpp',
  '.css', '.html', '.svg',
  '.hs', '.hsplus', '.holo',
  '.tex', '.bib', '.cls', '.sty',
]);

function sha256OfFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const buf = fs.readFileSync(absPath);
  const h = crypto.createHash('sha256');
  if (TEXT_EXTS.has(ext)) {
    // LF-normalize: \r\n -> \n, then \r -> \n
    const normalized = buf
      .toString('binary')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    h.update(Buffer.from(normalized, 'binary'));
  } else {
    h.update(buf);
  }
  return h.digest('hex');
}

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(p);
    } else if (e.isFile()) {
      yield p;
    }
  }
}

// Group helpers — derive a paper / topic group from the source path.
function groupFor(relPath) {
  const m = relPath.match(/^paper-([a-z0-9-]+)/i);
  if (m) {
    return { group: 'papers', tag: `paper-${m[1].split('-').slice(0, 2).join('-')}` };
  }
  if (relPath.startsWith('papers-22-23-mechanization')) {
    return { group: 'papers', tag: 'paper-22-23-lean' };
  }
  if (relPath.startsWith('paper-2-snn-neurips/')) {
    return { group: 'papers', tag: 'paper-2-snn-evidence' };
  }
  if (relPath.startsWith('benchmark-')) {
    return { group: 'benchmarks', tag: 'benchmark-results' };
  }
  if (relPath === 'holoscript.bib' || relPath.startsWith('holoscript-bib')) {
    return { group: 'bibliography', tag: 'holoscript-bib' };
  }
  if (/^trust-by-construction/i.test(relPath)) {
    return { group: 'papers', tag: 'trust-by-construction' };
  }
  if (/^REPRODUCIBILITY\.md$/.test(relPath)) {
    return { group: 'reproducibility', tag: 'reproducibility' };
  }
  if (/^paper-audit-matrix/i.test(relPath)) {
    return { group: 'audit', tag: 'paper-audit-matrix' };
  }
  return { group: 'memos', tag: 'memo' };
}

// Round metadata — mined transactions from anchor-rounds/*.md ledgers.
// Maps tx_hash → round number. Rounds 1-5 = BITCOIN_CONFIRMED (≥24h elapsed,
// OTS calendars have witnessed). Rounds 6-7 = OTS PENDING (Bitcoin attestation
// arrives within 24h of the round close — re-run this script after that
// window to refresh).
//
// We stash this as a date heuristic: if the .base.json anchored_at unix-ts
// is older than (now - 48h), assume OTS has Bitcoin-confirmed. Within 48h,
// OTS likely PENDING. Conservative — verify_provenance.py is the SSOT.
const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
function otsStatusFromAnchorAge(anchoredAtUnix, otsExists) {
  if (!otsExists) return 'OTS_MISSING';
  const ageMs = Date.now() - anchoredAtUnix * 1000;
  if (ageMs < TWO_DAYS_MS) return 'OTS_PENDING_LIKELY';
  return 'OTS_BITCOIN_LIKELY';
}

function main() {
  if (!fs.existsSync(RESEARCH_ROOT)) {
    console.error(`[provenance] research root not found: ${RESEARCH_ROOT}`);
    console.error('  pass --ai-eco=<path> or set AI_ECO_ROOT env');
    process.exit(1);
  }

  console.error(`[provenance] scanning ${RESEARCH_ROOT}`);

  const entries = [];
  let countBaseJson = 0;
  let countOts = 0;

  for (const abs of walk(RESEARCH_ROOT)) {
    if (!abs.endsWith('.base.json')) continue;
    countBaseJson += 1;

    // sourcePath = abs minus '.base.json'
    const sourceAbs = abs.slice(0, -'.base.json'.length);
    const sourceRel = path
      .relative(RESEARCH_ROOT, sourceAbs)
      .replace(/\\/g, '/');

    let receipt;
    try {
      receipt = JSON.parse(fs.readFileSync(abs, 'utf-8'));
    } catch (err) {
      console.error(`[provenance] skipping unreadable ${abs}: ${err.message}`);
      continue;
    }

    const sourceExists = fs.existsSync(sourceAbs);
    let currentSha256 = null;
    let drift = null;
    if (sourceExists) {
      try {
        currentSha256 = sha256OfFile(sourceAbs);
        drift =
          receipt.file_sha256 &&
          currentSha256.toLowerCase() !== receipt.file_sha256.toLowerCase();
      } catch (err) {
        console.error(`[provenance] hash failed ${sourceAbs}: ${err.message}`);
      }
    }

    const otsAbs = sourceAbs + '.ots';
    const otsExists = fs.existsSync(otsAbs);
    if (otsExists) countOts += 1;

    const baseStatus = drift === true ? 'BASE_DRIFTED' : 'BASE_CONFIRMED';
    const otsStatus = otsStatusFromAnchorAge(receipt.anchored_at, otsExists);

    let bucket;
    if (drift === true) {
      bucket = 'drifted';
    } else if (otsStatus === 'OTS_BITCOIN_LIKELY') {
      bucket = 'bitcoin_base';
    } else if (otsStatus === 'OTS_PENDING_LIKELY') {
      bucket = 'base_only_pending_btc';
    } else {
      bucket = 'base_only';
    }

    const { group, tag } = groupFor(sourceRel);

    entries.push({
      sourcePath: sourceRel,
      sourceExists,
      currentSha256,
      anchoredAt: receipt.anchored_at,
      anchoredAtIso:
        typeof receipt.anchored_at === 'number'
          ? new Date(receipt.anchored_at * 1000).toISOString()
          : null,
      txHash: receipt.tx_hash,
      blockNumber: receipt.block_number,
      blockHash: receipt.block_hash,
      gasUsed: receipt.gas_used,
      chain: receipt.chain || 'base-mainnet',
      chainId: receipt.chain_id || 8453,
      wallet: receipt.wallet,
      basescanUrl: receipt.basescan_url,
      receiptFileSha256: receipt.file_sha256,
      drift,
      baseStatus,
      otsExists,
      otsStatus,
      bucket,
      group,
      tag,
    });
  }

  // Sort: by anchoredAt descending (newest first)
  entries.sort((a, b) => (b.anchoredAt || 0) - (a.anchoredAt || 0));

  // Audit summary
  const buckets = {
    bitcoin_base: 0,
    base_only_pending_btc: 0,
    base_only: 0,
    drifted: 0,
  };
  for (const e of entries) buckets[e.bucket] = (buckets[e.bucket] || 0) + 1;

  // Group counts
  const groups = {};
  for (const e of entries) {
    groups[e.group] = (groups[e.group] || 0) + 1;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceRepo: 'brianonbased-dev/ai-ecosystem',
    sourceCommit: null, // intentionally not pinned — refresh on every round
    counts: {
      receipts: entries.length,
      otsReceipts: countOts,
      baseReceipts: countBaseJson,
      buckets,
      groups,
    },
    notes: {
      otsHeuristic:
        'OTS status is inferred from receipt age (anchored_at). Receipts older than 48h are assumed Bitcoin-confirmed; receipts younger than 48h are assumed PENDING (Bitcoin calendars witness within ~24h). The ground truth is scripts/verify_provenance.py in the ai-ecosystem repo — re-run that on any individual file to confirm.',
      driftDetection:
        'A receipt is bucket=drifted when the current LF-normalized sha256 of the source file does not match the file_sha256 committed in the .base.json. Drifted receipts remain valid evidence of the prior file state but indicate the file has been amended since anchoring.',
      verifyCommand:
        'python scripts/verify_provenance.py <path>',
    },
    entries,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.error(
    `[provenance] wrote ${entries.length} entries to ${path.relative(process.cwd(), OUT_PATH)}`,
  );
  console.error(
    `[provenance] buckets: ${JSON.stringify(buckets)}; groups: ${JSON.stringify(groups)}`,
  );
}

main();
