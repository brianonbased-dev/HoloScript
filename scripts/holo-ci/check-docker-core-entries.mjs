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
 * WHAT IT CHECKS: for every @holoscript/core subpath that a Docker-core-built service
 * (mcp-server) IMPORTS at runtime AND that `core/package.json#exports` maps to a
 * `./dist/<dir>/index.{cjs,js}` file, the Docker tsup config MUST have a matching entry
 * (`<dir>/index` or `<dir>`). Missing = a guaranteed crash-loop on the next deploy → FAIL.
 *
 * It only flags subpaths that are BOTH exported-to-a-dist-file AND actually imported by a
 * service — so an exported-but-unused subpath won't false-positive, but the moment a
 * service imports it, the gate demands the Docker entry (at push time, not in prod).
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
// Services whose Docker image builds core via build-core-stack-no-dts.sh + tsup.core.docker.cjs.
// Add a service dir here if it adopts that Docker core build.
const SERVICE_SRC_DIRS = ['packages/mcp-server/src'];

for (const f of [COREPKG, DOCKERCFG]) {
  if (!fs.existsSync(f)) {
    console.error(`[docker-core-entries] missing ${path.relative(ROOT, f)} — cannot check`);
    process.exit(2);
  }
}

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

// 3. which export dirs does a Docker-core-built service import at runtime?
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
for (const sd of SERVICE_SRC_DIRS) {
  const abs = path.join(ROOT, sd);
  if (!fs.existsSync(abs)) continue;
  const files = [];
  walk(abs, files);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/@holoscript\/core\/([a-zA-Z0-9][a-zA-Z0-9/_-]*)/g)) {
      // longest exportDir that is a prefix of the imported path (handles core/policy and core/x/sub)
      const imp = m[1].replace(/\/$/, '');
      for (const dir of exportDir.keys()) {
        if (imp === dir || imp.startsWith(dir + '/')) importedDirs.add(dir);
      }
    }
  }
}

// 4. every imported export-dir must have a Docker entry
const missing = [...importedDirs].filter((dir) => !hasEntry(dir)).sort();

console.log(
  `\n[docker-core-entries] ${exportDir.size} core dist-subpath exports · ${dockerEntries.size} Docker entries · ${importedDirs.size} imported by services`
);
if (missing.length === 0) {
  console.log('  [ok]   every core subpath a service imports has a matching Docker tsup entry');
  console.log('\nRESULT: COVERED — no Docker-entry-drift.');
  process.exit(0);
}
for (const dir of missing) {
  console.error(
    `  [FAIL] ${exportDir.get(dir)} is imported by a Docker-built service but '${dir}/index' is MISSING from scripts/docker/tsup.core.docker.cjs`
  );
}
console.error(
  `\nRESULT: ${missing.length} Docker-entry-drift(s). The Docker build will omit dist/<dir>/index.cjs and the service will CRASH-LOOP at boot (MODULE_NOT_FOUND). Add the entr${missing.length === 1 ? 'y' : 'ies'} to scripts/docker/tsup.core.docker.cjs: ${missing.map((d) => `'${d}/index': 'src/${d}/index.ts'`).join(', ')}`
);
process.exit(1);
