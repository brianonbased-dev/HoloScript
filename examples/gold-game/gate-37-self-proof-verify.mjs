// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — FLAGSHIP Gate 37 verifier (REPRODUCIBLE; committed so it re-runs)
//
// Gate 37 = "the drive proves itself, offline": the air-gapped build carries a SHA-256
// manifest of its embedded data blobs + a pure-JS SHA-256 function, and on load it
// RE-DERIVES each blob's hash in the player's own browser (no network, works on file://
// because it does NOT use crypto.subtle) and checks it against the sealed manifest.
//
// This verifier proves that self-proof is REAL, not theater:
//   1. the build embeds the manifest, the SHA-256 fn, the self-proof panel + script;
//   2. the EMBEDDED pure-JS SHA-256 is genuine SHA-256 — cross-checked against
//      node:crypto on known vectors (a fake fn that just echoes the manifest FAILS here);
//   3. re-running the EMBEDDED fn over the EMBEDDED blobs reproduces the manifest hashes
//      (so the browser self-check will pass on a clean machine);
//   4. NEGATIVE CONTROL (anti-F.069): tampering one byte of a blob makes the recompute
//      DIVERGE from the manifest — the check is load-bearing, not a grep.
//
// HONEST SCOPE: this proves DATA-INTEGRITY self-derivation offline (the bytes you run are
// the bytes that were sealed). It does NOT re-run the TS gate verifiers on the drive (no
// repo/toolchain there); the gate receipts ride on the drive for full re-derivation.
//
//   node examples/gold-game/gate-37-self-proof-verify.mjs --emit
//   node examples/gold-game/gate-37-self-proof-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const buildPath = join(here, 'drive-build', 'index.html');
const receiptPath = join(here, 'GATE-37-SELF-PROOF-receipt.json');
const nodeSha = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail });
};

const build = existsSync(buildPath) ? readFileSync(buildPath, 'utf8') : '';
check('generated playable build exists', build.length > 0, buildPath);

// ── Extract the embedded self-proof manifest, the SHA-256 fn, and the data blobs ──
let manifest = null,
  shaFnSrc = null;
try {
  const m = build.match(
    /__GOLD_GAME_SELFPROOF__\s*=\s*(\{[\s\S]*?\});\s*window\.__GOLD_GAME_SHA256__\s*=\s*\(([\s\S]*?)\);<\/script>/
  );
  if (m) {
    manifest = JSON.parse(m[1]).manifest;
    shaFnSrc = m[2];
  }
} catch {
  /* parse fail */
}
check(
  'build embeds a self-proof manifest',
  Array.isArray(manifest) && manifest.length > 0,
  manifest ? `${manifest.length} entries` : 'none'
);
check(
  'build embeds a pure-JS SHA-256 fn (works offline on file://, no crypto.subtle)',
  !!shaFnSrc && !/crypto\.subtle/.test(shaFnSrc),
  shaFnSrc ? 'embedded' : 'missing'
);

let embeddedSha = null;
try {
  embeddedSha = new Function('return (' + shaFnSrc + ')')();
} catch {
  /* bad fn */
}
check('embedded SHA-256 fn loads and runs', typeof embeddedSha === 'function', typeof embeddedSha);

// (2) The embedded fn is GENUINE SHA-256 — cross-check vs node:crypto on known vectors.
// A fake fn (e.g. one that returns the manifest value regardless of input) fails this.
let realSha = typeof embeddedSha === 'function';
const vectors = ['', 'abc', 'GOLD📜', 'the quick brown fox'];
if (realSha)
  for (const v of vectors) {
    if (embeddedSha(v) !== nodeSha(v)) {
      realSha = false;
      break;
    }
  }
check(
  'embedded fn is GENUINE SHA-256 (matches node:crypto on 4 vectors incl. UTF-8)',
  realSha,
  realSha ? 'all vectors match' : 'NOT real sha256'
);

// Extract each embedded blob by its window key (each is its own <script>window.KEY=VALUE;</script>).
const blobValue = (key) => {
  const m = build.match(new RegExp('window\\.' + key + '\\s*=\\s*([\\s\\S]*?);<\\/script>'));
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]);
  } catch {
    return undefined;
  }
};

// (3) Re-run the EMBEDDED fn over the EMBEDDED blobs → reproduces the manifest hashes.
let allReproduce = realSha && manifest && manifest.length > 0;
const perBlob = [];
if (allReproduce) {
  for (const entry of manifest) {
    const val = blobValue(entry.key);
    const got = val !== undefined ? embeddedSha(JSON.stringify(val)) : '(blob missing)';
    const ok = got === entry.sha256;
    perBlob.push({ name: entry.name, key: entry.key, ok });
    if (!ok) allReproduce = false;
  }
}
check(
  're-deriving the embedded blobs reproduces the manifest (browser self-check WOULD pass)',
  allReproduce,
  perBlob.map((b) => `${b.key}:${b.ok ? 'ok' : 'FAIL'}`).join(', ') || 'n/a'
);

// (4) NEGATIVE CONTROL — tamper one byte of a blob; the recompute MUST diverge.
let negControlHolds = false;
if (realSha && manifest && manifest.length > 0) {
  const entry = manifest[0];
  const val = blobValue(entry.key);
  if (val !== undefined) {
    const tampered = JSON.stringify(val) + ' '; // one extra byte
    negControlHolds = embeddedSha(tampered) !== entry.sha256;
  }
}
check(
  'NEGATIVE CONTROL: a tampered blob FAILS the self-proof (check is load-bearing)',
  negControlHolds,
  `tamper detected=${negControlHolds}`
);

// (1, cont.) The visible self-proof surface is wired into the build.
check(
  'build wires the self-proof panel + summary (visible offline proof)',
  /data-gate37="self-proof-panel"/.test(build) &&
    /data-gate37="summary"/.test(build) &&
    /data-gate37="self-proof"/.test(build),
  'toggle + panel + summary markers'
);
check(
  'self-proof states it runs OFFLINE with NO network',
  /no network/i.test(build),
  'honest offline claim present'
);

// ── Report ──
const passed = checks.filter((c) => c.pass).length;
const total = checks.length;
const allPass = passed === total;

console.log('\nTHE GOLD GAME — Gate 37: self-proving boot (offline data re-derivation)\n');
for (const c of checks)
  console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  — ' + c.detail : ''}`);
console.log(`\n  ${passed}/${total} checks pass — ${allPass ? 'GATE 37 PASS' : 'GATE 37 FAIL'}\n`);

if (process.argv.includes('--emit') && allPass) {
  const receipt = {
    schema: 'cael-gate-v1',
    gate: 37,
    track: 'flagship',
    name: 'self-proving boot (offline data re-derivation)',
    timestamp: new Date().toISOString(),
    checks: { passed, total },
    manifest: manifest.map((m) => ({ name: m.name, key: m.key, sha256: m.sha256 })),
    proves: {
      offline:
        "the build re-hashes its embedded data blobs in the player's own browser with a pure-JS SHA-256 (no crypto.subtle, works on file://) — no network",
      genuine:
        'the embedded SHA-256 fn matches node:crypto on 4 known vectors incl. UTF-8 — a fake echo fn fails',
      reproduces:
        'the embedded fn over the embedded blobs reproduces the sealed manifest (browser self-check passes on a clean machine)',
      loadBearing: 'negative control: a one-byte tamper diverges from the manifest',
    },
    honestScope:
      "PROVEN: offline DATA-INTEGRITY self-derivation (the bytes you run are the bytes sealed at build time, re-checked on the player's machine). NOT claimed: re-running the TS gate verifiers on the drive (no repo/toolchain there) — the gate receipts ride on the drive for that.",
    aiHumanConnection:
      'common receipt spine made portable: the proof travels WITH the artifact and re-derives offline — the human sees it re-check on their own machine, the skeptic can re-run it with no trust in us',
    status: 'PASS',
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`  receipt → ${receiptPath}`);
}

process.exit(allPass ? 0 : 1);
