#!/usr/bin/env node
/**
 * check-docker-core-entries.mjs — fail loud on Docker-entry-drift in @holoscript/core.
 *
 * WHY THIS GATE EXISTS (5 prod outages and counting): the Docker runtime image builds
 * core with a SEPARATE tsup entry list (`scripts/docker/tsup.core.docker.cjs`) from the
 * standard `packages/core/tsup.config.ts`. When a new core subpath export is added to the
 * standard config + `package.json#exports` + a service import, but NOT to the Docker
 * config, the Docker build silently omits `dist/<subpath>/index.cjs`. The image builds and
 * pushes fine, then the service CRASH-LOOPS at boot with:
 *     Error: Cannot find module '@holoscript/core/dist/<subpath>/index.cjs'
 * and the deploy fails its healthcheck. This has hit prod for:
 *     hololand (2026-05-16) · world (2026-06-08) · traits/simulation-solver-factory
 *     · policy (2026-06-16)  — each a separate outage, same drift.
 *
 * WHAT IT CHECKS: for every @holoscript/core subpath that ANY workspace whose compiled
 * dist is copied into the Docker runtime image IMPORTS at runtime AND that
 * `core/package.json#exports` maps to a `./dist/<dir>/index.{cjs,js}` file, the Docker
 * tsup config MUST have a matching entry (`<dir>/index` or `<dir>`). Missing = a
 * guaranteed crash-loop on the next deploy → FAIL.
 *
 * WHY "ANY workspace", not just the service (HARDENED 2026-06-16, W.731): the service
 * (mcp-server) is NOT the only thing that `require('@holoscript/core/<subpath>')` at boot.
 * engine/, framework/, absorb-service/, holomap/ — every workspace whose dist is COPY'd
 * into the runtime image and symlinked under node_modules/@holoscript — resolves its core
 * subpath imports against the SAME symlinked core dist at boot. A core subpath imported
 * only by engine/ (never by the service) still crash-loops the service if the Docker core
 * build omits it. The 6th outage of this class (parameter-envelope + coordinators,
 * 646c602ec) was exactly this: engine-only imports the service-scoped gate could not see.
 * The runtime-image workspace set is derived from the `COPY --from=builder .../dist` lines
 * in infrastructure/Dockerfile.mcp-server (the authoritative list of what ships).
 *
 * It only flags subpaths that are BOTH exported-to-a-dist-file AND actually imported by a
 * runtime-image workspace — so an exported-but-unused subpath won't false-positive, but
 * the moment any shipped workspace imports it, the gate demands the Docker entry (at push
 * time, not in prod). Test files (`__tests__/`, `*.test.*`, `*.spec.*`) are excluded — they
 * never ship in the runtime image, so a test-only core import is not a drift risk.
 *
 * Usage:  node scripts/holo-ci/check-docker-core-entries.mjs [--root <dir>]
 * Exit 0 = every required subpath is covered. 1 = drift (missing entry). 2 = usage error.
 */
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const ROOT = path.resolve(arg('--root', process.env.HOLO_ROOT || process.cwd()));

const COREPKG = path.join(ROOT, 'packages/core/package.json');
const DOCKERCFG = path.join(ROOT, 'scripts/docker/tsup.core.docker.cjs');
const RUNTIME_DOCKERFILE = path.join(ROOT, 'infrastructure/Dockerfile.mcp-server');

for (const f of [COREPKG, DOCKERCFG]) {
  if (!fs.existsSync(f)) {
    console.error(`[docker-core-entries] missing ${path.relative(ROOT, f)} — cannot check`);
    process.exit(2);
  }
}

// Workspaces whose compiled dist is COPY'd into the Docker runtime image. These are the
// packages whose `require('@holoscript/core/<subpath>')` calls resolve at boot against the
// symlinked core dist — so ANY of them, not just the service, can crash-loop the deploy.
// Derived from the `COPY --from=builder .../packages/<x>/dist` lines in the runtime
// Dockerfile so this list self-updates when a new workspace ships in the image. Core itself
// is excluded (it's the package being built). A static fallback covers the case where the
// Dockerfile can't be read.
const FALLBACK_RUNTIME_PKGS = [
  'absorb-service',
  'agent-protocol',
  'config',
  'crdt',
  'crdt-spatial',
  'engine',
  'framework',
  'holoembed',
  'holomap',
  'llm-provider',
  'mcp-server',
  'mesh',
  'platform',
  'secrets-broker',
  'snn-webgpu',
  'uaal',
];
function runtimeWorkspaceSrcDirs() {
  let pkgs = null;
  try {
    const df = fs.readFileSync(RUNTIME_DOCKERFILE, 'utf8');
    const found = new Set();
    for (const m of df.matchAll(/packages\/([a-z0-9][a-z0-9-]*)\/dist/g)) {
      if (m[1] !== 'core' && m[1] !== 'core-types') found.add(m[1]);
    }
    if (found.size) pkgs = [...found];
  } catch {
    // fall through to fallback
  }
  if (!pkgs) pkgs = FALLBACK_RUNTIME_PKGS;
  return pkgs
    .map((p) => `packages/${p}/src`)
    .filter((rel) => fs.existsSync(path.join(ROOT, rel)));
}
const WORKSPACE_SRC_DIRS = runtimeWorkspaceSrcDirs();

// 1. core exports → map dist dir -> declared subpath  (only ./dist/<dir>/index.{cjs,js})
const corePkg = JSON.parse(fs.readFileSync(COREPKG, 'utf8'));
const exportDir = new Map(); // 'policy' -> '@holoscript/core/policy'
for (const [sub, val] of Object.entries(corePkg.exports || {})) {
  if (sub === '.' || !val || typeof val !== 'object') continue;
  const target = String(val.require || val.import || '');
  const m = target.match(/^\.\/dist\/(.+)\/index\.(?:cjs|js)$/);
  if (m) exportDir.set(m[1], '@holoscript/core/' + sub.replace(/^\.\//, ''));
}

// 2. docker tsup entry keys
const dockerSrc = fs.readFileSync(DOCKERCFG, 'utf8');
const dockerEntries = new Set([...dockerSrc.matchAll(/'([^']+)':\s*'src\//g)].map((m) => m[1]));
const hasEntry = (dir) => dockerEntries.has(dir + '/index') || dockerEntries.has(dir);

// 3. which export dirs does ANY runtime-image workspace import at runtime?
function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.[cm]?tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(full);
    }
  }
}
const importedDirs = new Set();
// dir -> Set(workspace names) that import it — drives the per-workspace attribution in
// the FAIL message so a failure tells you WHICH workspace's import needs the Docker entry.
const importedByWorkspace = new Map();
for (const sd of WORKSPACE_SRC_DIRS) {
  const abs = path.join(ROOT, sd);
  if (!fs.existsSync(abs)) continue;
  const wsName = sd.replace(/^packages\//, '').replace(/\/src$/, '');
  const files = [];
  walk(abs, files);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    // Match ONLY real module specifiers — `@holoscript/core/<subpath>` inside the quotes
    // of an import / export-from / require() / dynamic import(). Requiring the surrounding
    // quote is what eliminates the false positives that bare-text matching produced once
    // the scan widened past the service: JSDoc `@module @holoscript/core/agents` tags
    // (unquoted) and the path mentioned in prose comments. A type-only import is still
    // counted — `import type { X } from '@holoscript/core/y'` is rare for these value
    // subpaths and counting it errs safe (demands an entry that does no harm if present).
    for (const m of text.matchAll(/['"]@holoscript\/core\/([a-zA-Z0-9][a-zA-Z0-9/_-]*)['"]/g)) {
      // longest exportDir that is a prefix of the imported path (handles core/policy and core/x/sub)
      const imp = m[1].replace(/\/$/, '');
      for (const dir of exportDir.keys()) {
        if (imp === dir || imp.startsWith(dir + '/')) {
          importedDirs.add(dir);
          if (!importedByWorkspace.has(dir)) importedByWorkspace.set(dir, new Set());
          importedByWorkspace.get(dir).add(wsName);
        }
      }
    }
  }
}

// 4. every imported export-dir must have a Docker entry
const missing = [...importedDirs].filter((dir) => !hasEntry(dir)).sort();

const wsList = WORKSPACE_SRC_DIRS.map((s) =>
  s.replace(/^packages\//, '').replace(/\/src$/, '')
).join(', ');
console.log(
  `\n[docker-core-entries] ${exportDir.size} core dist-subpath exports · ${dockerEntries.size} Docker entries · ${importedDirs.size} imported by runtime-image workspaces`
);
console.log(`  scanned workspaces (${WORKSPACE_SRC_DIRS.length}): ${wsList}`);
if (missing.length === 0) {
  console.log(
    '  [ok]   every core subpath a runtime-image workspace imports has a matching Docker tsup entry'
  );
  console.log('\nRESULT: COVERED — no Docker-entry-drift.');
  process.exit(0);
}
for (const dir of missing) {
  const by = [...(importedByWorkspace.get(dir) || [])].sort().join(', ') || 'unknown';
  console.error(
    `  [FAIL] ${exportDir.get(dir)} is imported by runtime-image workspace(s) [${by}] but '${dir}/index' is MISSING from scripts/docker/tsup.core.docker.cjs`
  );
}
console.error(
  `\nRESULT: ${missing.length} Docker-entry-drift(s). The Docker build will omit dist/<dir>/index.cjs and the service will CRASH-LOOP at boot (MODULE_NOT_FOUND). Add the entr${missing.length === 1 ? 'y' : 'ies'} to scripts/docker/tsup.core.docker.cjs: ${missing.map((d) => `'${d}/index': 'src/${d}/index.ts'`).join(', ')}`
);
process.exit(1);
