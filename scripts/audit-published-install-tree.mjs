#!/usr/bin/env node
/**
 * Published-tree install audit.
 *
 * Crawls the PUBLISHED npm dependency graph from a root package (default
 * @holoscript/cli@latest) and fails if any reachable published package.json:
 *   1. contains a `workspace:` spec in any dependency field (the
 *      EUNSUPPORTEDPROTOCOL leak — workspace protocol not resolved at publish),
 *   2. pins an @holoscript/* dependency to a version that does not exist on
 *      the registry (the ETARGET / 404 phantom-pin failure mode).
 *
 * This is the guard that source-side checks (check-workspace-deps.js,
 * verify-internal-workspace-protocol.mjs) CANNOT provide: those validate the
 * monorepo source, but a manual/npm publish path or an internal dep that
 * bypassed `pnpm publish`'s workspace→semver rewrite still ships a broken
 * tree. This audits what the public actually downloads.
 *
 * Reproduces and would have caught the cli@7.0.0 incident (board task
 * task_1780122553060_ag5c): core@6.0.4 published with 39 raw workspace:*
 * specs, plus core@7.0.0 pinning ~23 unpublished plugin versions.
 *
 * No auth required for public packages; reads NPM_TOKEN from env if present
 * so private/pre-release dist-tags resolve identically to a real install.
 *
 * Usage:
 *   node scripts/audit-published-install-tree.mjs
 *   node scripts/audit-published-install-tree.mjs @holoscript/cli@7.0.0
 *   node scripts/audit-published-install-tree.mjs @holoscript/core@latest --json
 *
 * Exit codes: 0 clean, 1 leaks/phantoms found, 2 usage/network error.
 */

const REGISTRY = process.env.npm_config_registry || 'https://registry.npmjs.org';
const TOKEN = process.env.NPM_TOKEN || process.env.npm_token || '';
const JSON_OUT = process.argv.includes('--json');
const ROOT_SPEC = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) || '@holoscript/cli@latest';

const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

function headers() {
  const h = { Accept: 'application/json' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

// How long to wait between retries for packages that returned 404 (npm CDN
// propagation lag — a package published seconds ago may not be visible yet).
const PROPAGATION_RETRY_DELAY_MS = parseInt(process.env.AUDIT_RETRY_DELAY_MS || '20000', 10);
const PROPAGATION_RETRY_COUNT = parseInt(process.env.AUDIT_RETRY_COUNT || '3', 10);

const packumentCache = new Map();
async function packument(name) {
  if (packumentCache.has(name)) return packumentCache.get(name);
  const url = `${REGISTRY.replace(/\/$/, '')}/${name.replace('/', '%2f')}`;
  let pk = null;
  for (let attempt = 0; attempt <= PROPAGATION_RETRY_COUNT; attempt++) {
    if (attempt > 0) {
      if (!JSON_OUT) process.stderr.write(`[audit-published-install-tree] ${name} not yet visible; retrying in ${PROPAGATION_RETRY_DELAY_MS / 1000}s (attempt ${attempt}/${PROPAGATION_RETRY_COUNT})...\n`);
      await new Promise((r) => setTimeout(r, PROPAGATION_RETRY_DELAY_MS));
    }
    try {
      const r = await fetch(url, { headers: headers() });
      if (r.ok) { pk = await r.json(); break; }
      if (r.status !== 404) break; // non-404 error — don't retry
    } catch {
      break; // network error — treated as unresolvable below
    }
  }
  packumentCache.set(name, pk);
  return pk;
}

/** Best-effort resolve a semver-ish spec to a concrete published version. */
function resolveVersion(pk, spec) {
  if (!pk || !pk.versions) return null;
  const versions = Object.keys(pk.versions);
  const tags = pk['dist-tags'] || {};
  if (tags[spec]) return tags[spec]; // dist-tag (latest, alpha, ...)
  if (pk.versions[spec]) return spec; // exact
  // ^ / ~ / >= ranges: pick highest version sharing the leading numeric.
  const m = String(spec).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return tags.latest || null;
  const wantMajor = Number(m[1]);
  const op = String(spec).trim()[0];
  const candidates = versions
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .map((v) => v.split('.').map(Number))
    .filter(([maj]) => (op === '^' || op === '~' ? maj === wantMajor : true))
    .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
  return candidates.length ? candidates[0].join('.') : tags.latest || null;
}

function isInternal(name) {
  return name.startsWith('@holoscript/') || name.startsWith('holoscript-');
}

async function main() {
  const at = ROOT_SPEC.lastIndexOf('@');
  const rootName = at > 0 ? ROOT_SPEC.slice(0, at) : ROOT_SPEC;
  const rootSpec = at > 0 ? ROOT_SPEC.slice(at + 1) : 'latest';

  const seen = new Set();
  const queue = [[rootName, rootSpec]];
  const leaks = [];
  const phantoms = [];
  let scanned = 0;

  while (queue.length) {
    const [name, spec] = queue.shift();
    const pk = await packument(name);
    if (!pk) {
      // Unresolvable package itself (404). Only flag internal ones — external
      // 404s would be a different (and louder) failure.
      if (isInternal(name)) phantoms.push({ pkg: `${name}@${spec}`, reason: 'package-404' });
      continue;
    }
    const ver = resolveVersion(pk, spec);
    if (!ver || !pk.versions[ver]) {
      if (isInternal(name)) phantoms.push({ pkg: `${name}@${spec}`, reason: 'version-not-published', available: Object.keys(pk.versions || {}) });
      continue;
    }
    const key = `${name}@${ver}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scanned++;
    const manifest = pk.versions[ver];

    for (const field of DEP_FIELDS) {
      const block = manifest[field] || {};
      for (const [dep, depSpec] of Object.entries(block)) {
        if (String(depSpec).includes('workspace:')) {
          leaks.push({ pkg: key, field, dep, spec: depSpec });
        }
        if (isInternal(dep) && !String(depSpec).includes('workspace:')) {
          // enqueue for deeper crawl (dependencies + peerDependencies only;
          // optionalDependencies may legitimately be absent for slim installs)
          if (field !== 'optionalDependencies') queue.push([dep, String(depSpec)]);
        }
      }
    }
  }

  // Dedupe phantoms (the same unpublished plugin is commonly reached via
  // multiple broken parents — report each missing package once).
  const seenPhantom = new Set();
  const uniquePhantoms = phantoms.filter((p) => {
    if (seenPhantom.has(p.pkg)) return false;
    seenPhantom.add(p.pkg);
    return true;
  });
  phantoms.length = 0;
  phantoms.push(...uniquePhantoms);

  const ok = leaks.length === 0 && phantoms.length === 0;

  if (JSON_OUT) {
    console.log(JSON.stringify({ root: `${rootName}@${rootSpec}`, scanned, ok, leaks, phantoms }, null, 2));
  } else {
    console.log(`[audit-published-install-tree] root=${rootName}@${rootSpec} scanned=${scanned} packages`);
    if (leaks.length) {
      console.error(`\n  WORKSPACE LEAKS (${leaks.length}) — these cause EUNSUPPORTEDPROTOCOL on public install:`);
      for (const l of leaks) console.error(`    ${l.pkg}  ${l.field}.${l.dep} = ${l.spec}`);
    }
    if (phantoms.length) {
      console.error(`\n  PHANTOM PINS (${phantoms.length}) — these cause ETARGET/404 on public install:`);
      for (const p of phantoms) console.error(`    ${p.pkg}  (${p.reason}${p.available ? `; published: ${p.available.join(', ')}` : ''})`);
    }
    console.log(ok ? '\n[audit-published-install-tree] OK — published tree is installable.' : '\n[audit-published-install-tree] FAIL — published tree is broken for public users.');
  }

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('[audit-published-install-tree] error:', e.message);
  process.exit(2);
});
