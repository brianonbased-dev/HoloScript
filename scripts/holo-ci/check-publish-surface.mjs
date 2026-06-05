#!/usr/bin/env node
/**
 * check-publish-surface.mjs — keep the PUBLISHED npm surface clean and bounded.
 *
 * WHY THIS GATE EXISTS (publish-surface audit, 2026-06-04):
 *   Two recurring defect classes, both reactive-only until now:
 *
 *   (1) MOJIBAKE in published descriptions. @holoscript/core and @holoscript/core-types
 *       shipped descriptions containing "â€"" — a UTF-8-double-encoded em-dash — which
 *       renders as garbage on the npm package page. Caught only by a human eyeballing
 *       npm. This gate flags the double-encoding signature at commit time.
 *
 *   (2) UNBOUNDED PUBLIC SURFACE. Every package with `private:false` is a cold-consume
 *       surface that must stay green — the W.669 publish-chain bug family (uaal eager
 *       import, mesh devDep⇄dep, core mesh-peer contradiction) scales with the count of
 *       public packages. New packages silently default to publishable and widen the
 *       surface with no review. This gate pins the public set to an explicit allowlist:
 *       a package may only become public by being added to the allowlist ON PURPOSE.
 *
 * WHAT IT DOES (read-only, no install, no network):
 *   - Scans every packages/<name>/package.json.
 *   - For each `private !== true` package:
 *       a. Asserts `description` carries no mojibake signature (double-encoded UTF-8).
 *       b. Collects its `name`.
 *   - Compares the public-name set to scripts/holo-ci/publish-surface-allowlist.json:
 *       * a public package NOT in the allowlist  -> ERROR (surface grew; intentional?
 *         add it via --update, or set private:true).
 *       * an allowlist entry NOT found public     -> ERROR (package removed/renamed/
 *         privatized; reconcile via --update).
 *
 * Usage:
 *   node scripts/holo-ci/check-publish-surface.mjs            # check, exit 1 on any drift
 *   node scripts/holo-ci/check-publish-surface.mjs --update   # rewrite the allowlist from
 *                                                              # current state (intentional)
 *   node scripts/holo-ci/check-publish-surface.mjs --root <dir>
 *
 * Exit 0 iff the surface is clean and matches the allowlist. Exit 1 on drift. Exit 2 on usage.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const PKGS_DIR = join(ROOT, 'packages');
const ALLOWLIST = join(ROOT, 'scripts', 'holo-ci', 'publish-surface-allowlist.json');

// Double-encoded-UTF-8 signatures: "â€" (em/en dash, smart quotes), "Ã"+cont (accents),
// "Â"+nbsp/punct, and the Unicode replacement char. A clean description is ASCII or
// proper UTF-8 (em-dash U+2014), none of which match these.
const MOJIBAKE = /â€|Ã[-¿]|Â[ -¿]|�/;

if (!existsSync(PKGS_DIR)) {
  console.error(`[publish-surface] no packages/ dir at ${PKGS_DIR}`);
  process.exit(2);
}

const errors = [];
const publicNames = [];

for (const d of readdirSync(PKGS_DIR)) {
  const p = join(PKGS_DIR, d, 'package.json');
  if (!existsSync(p)) continue;
  let j;
  try { j = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
  if (j.private === true || !j.name) continue;

  publicNames.push(j.name);

  if (typeof j.description === 'string' && MOJIBAKE.test(j.description)) {
    errors.push(`MOJIBAKE  ${j.name}  (packages/${d}/package.json description) — double-encoded UTF-8; re-author the dash/quote as a proper character`);
  }
}

publicNames.sort();

if (UPDATE) {
  writeFileSync(ALLOWLIST, JSON.stringify({
    _comment: 'Explicit allowlist of PUBLISHED (private:false) @holoscript packages. A package may only become public by being added here on purpose. Regenerate with: node scripts/holo-ci/check-publish-surface.mjs --update',
    packages: publicNames,
  }, null, 2) + '\n');
  console.log(`[publish-surface] allowlist updated: ${publicNames.length} public packages -> ${ALLOWLIST}`);
  // still report mojibake even on --update so it can't be papered over
  if (errors.length) { for (const e of errors) console.error('  ' + e); process.exit(1); }
  process.exit(0);
}

let allow = { packages: [] };
if (existsSync(ALLOWLIST)) {
  try { allow = JSON.parse(readFileSync(ALLOWLIST, 'utf8')); } catch { errors.push(`ALLOWLIST unparseable: ${ALLOWLIST}`); }
} else {
  errors.push(`ALLOWLIST missing: ${ALLOWLIST} — run --update to create it`);
}
const allowSet = new Set(allow.packages || []);
const publicSet = new Set(publicNames);

for (const n of publicNames) if (!allowSet.has(n)) {
  errors.push(`SURFACE-GREW  ${n} is private:false but not in the allowlist — add it via --update (intentional) or set private:true`);
}
for (const n of (allow.packages || [])) if (!publicSet.has(n)) {
  errors.push(`SURFACE-SHRANK  ${n} is in the allowlist but no longer published — reconcile via --update`);
}

if (errors.length) {
  console.error(`[publish-surface] ${errors.length} issue(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`[publish-surface] OK — ${publicNames.length} public packages, all allowlisted, no mojibake.`);
process.exit(0);
