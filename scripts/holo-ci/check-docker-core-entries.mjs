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
 * SOURCE DRIFT (HARDENED 2026-09-15): an entry can exist and still be wrong. The Docker
 * config built `parser` from src/parser/HoloScriptPlusParser.ts while the standard build
 * uses the src/parser/index.ts barrel, so the image's dist/parser.js lacked parseHolo.
 * When absorb-service imported `parseHolo` from '@holoscript/core/parser' (54ed06a48),
 * all five absorb-service deploys on 2026-09-06 died at the image's MCP import check, and
 * this gate said COVERED throughout — it skipped flat exports (./dist/parser.js), skipped
 * bare entry keys (`parser:`), scanned only the mcp-server image's workspaces, and never
 * compared entry sources. It now does all four.
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
const STANDARDCFG = path.join(ROOT, 'packages/core/tsup.config.ts');
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
  return pkgs.map((p) => `packages/${p}/src`);
}
// Every OTHER image that runs the Docker core build (build-core-stack-no-dts.sh /
// tsup.core.docker.cjs) ships its own workspace set, COPY'd as source directories
// (`COPY packages/holollama/ packages/holollama/`, `COPY services/absorb-service/ ...`).
// Until 2026-09-15 only the mcp-server image was scanned — and the image that broke on
// 2026-09-06 was absorb-service's.
function coreBuildImageSrcDirs() {
  let files;
  try {
    files = fs.readdirSync(path.join(ROOT, 'infrastructure')).filter((f) => /^Dockerfile\./.test(f));
  } catch {
    return [];
  }
  const dirs = new Set();
  for (const f of files) {
    const df = fs.readFileSync(path.join(ROOT, 'infrastructure', f), 'utf8');
    if (!/build-core-stack-no-dts\.sh|tsup\.core\.docker\.cjs/.test(df)) continue;
    // An image that ships SELECTED dists (`COPY --from=builder .../packages/<x>/dist`, as
    // mcp-server does) ships exactly those — a workspace COPY'd only into its builder stage
    // (mcp-server's cli) never runs there. An image that ships the whole built tree
    // (`COPY --from=builder /app/packages packages`, as absorb-service does) ships every
    // workspace it COPY'd in.
    const shipped = [...df.matchAll(/((?:packages|services)\/[a-z0-9][a-z0-9-]*)\/dist\b/g)].map((m) => m[1]);
    const copied = [
      ...df.matchAll(/^\s*COPY\s+(?:--\S+\s+)*((?:packages|services)\/[a-z0-9][a-z0-9-]*)\//gm),
    ].map((m) => m[1]);
    for (const rel of shipped.length ? shipped : copied) {
      const name = rel.split('/')[1];
      if (name !== 'core' && name !== 'core-types') dirs.add(`${rel}/src`);
    }
  }
  return [...dirs];
}

// Drop block comments and whole-line // comments that START a line before matching, so a
// QUOTED specifier inside a JSDoc usage example (` *   import { X } from '@holoscript/core/testing';`)
// is not read as an import. Anchoring at line start keeps a '/*' inside a string literal
// (a glob such as 'src/**') from swallowing the code after it.
function stripLineComments(src) {
  return src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const WORKSPACE_SRC_DIRS = [...new Set([...runtimeWorkspaceSrcDirs(), ...coreBuildImageSrcDirs()])].filter(
  (rel) => fs.existsSync(path.join(ROOT, rel))
);

// 1. core exports → map dist path -> declared subpath. Both export shapes count:
//      ./dist/<dir>/index.{cjs,js} -> '<dir>'   (policy, world, hololand, ...)
//      ./dist/<name>.{cjs,js}      -> '<name>'  (parser, runtime, math/vec3, ...)
//    The flat shape was skipped until 2026-09-15, which hid ./parser from this gate.
const corePkg = JSON.parse(fs.readFileSync(COREPKG, 'utf8'));
const exportDir = new Map(); // 'policy' -> '@holoscript/core/policy'
for (const [sub, val] of Object.entries(corePkg.exports || {})) {
  if (sub === '.' || sub.includes('*') || !val || typeof val !== 'object') continue;
  const target = String(val.require || val.import || '');
  const m = target.match(/^\.\/dist\/(.+?)(?:\/index)?\.(?:cjs|js)$/);
  if (m) exportDir.set(m[1], '@holoscript/core/' + sub.replace(/^\.\//, ''));
}

// 2. tsup entry maps (key -> source file) for the Docker config AND the standard config.
//    Keys may be quoted ('policy/index': ...) or bare (parser: ...). The old pattern saw
//    only quoted keys, so every bare-key entry (index, parser, runtime, ...) was invisible.
function parseEntries(src) {
  const entries = new Map();
  for (const m of src.matchAll(/(?:'([^']+)'|"([^"]+)"|\b([A-Za-z_$][\w$]*))\s*:\s*['"](src\/[^'"]+)['"]/g)) {
    const key = m[1] ?? m[2] ?? m[3];
    if (!entries.has(key)) entries.set(key, m[4]);
  }
  return entries;
}
const dockerEntries = parseEntries(fs.readFileSync(DOCKERCFG, 'utf8'));
const standardEntries = fs.existsSync(STANDARDCFG)
  ? parseEntries(fs.readFileSync(STANDARDCFG, 'utf8'))
  : new Map();
const entryKey = (entries, dir) =>
  entries.has(dir + '/index') ? dir + '/index' : entries.has(dir) ? dir : null;
const hasEntry = (dir) => entryKey(dockerEntries, dir) !== null;

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
    const text = stripLineComments(fs.readFileSync(f, 'utf8'));
    // (see below) each specifier maps to its LONGEST matching export only.
    // Match ONLY real module specifiers — `@holoscript/core/<subpath>` inside the quotes
    // of an import / export-from / require() / dynamic import(). Requiring the surrounding
    // quote is what eliminates the false positives that bare-text matching produced once
    // the scan widened past the service: JSDoc `@module @holoscript/core/agents` tags
    // (unquoted) and the path mentioned in prose comments. A type-only import is still
    // counted — `import type { X } from '@holoscript/core/y'` is rare for these value
    // subpaths and counting it errs safe (demands an entry that does no harm if present).
    for (const m of text.matchAll(/['"]@holoscript\/core\/([a-zA-Z0-9][a-zA-Z0-9/_-]*)['"]/g)) {
      // Longest export that is the imported path or a prefix of it, and ONLY that one:
      // '@holoscript/core/parser/HoloCompositionTypes' is that export, not also the parser barrel.
      const imp = m[1].replace(/\/$/, '');
      let dir = null;
      for (const d of exportDir.keys()) {
        if ((imp === d || imp.startsWith(d + '/')) && (!dir || d.length > dir.length)) dir = d;
      }
      if (dir) {
        importedDirs.add(dir);
        if (!importedByWorkspace.has(dir)) importedByWorkspace.set(dir, new Set());
        importedByWorkspace.get(dir).add(wsName);
      }
    }
  }
}

// 4. every imported export must have a Docker entry
const missing = [...importedDirs].filter((dir) => !hasEntry(dir)).sort();

// 5. ...built from the SAME source file as the standard build. An entry that exists but
//    points elsewhere ships a dist file with different exports; a named ESM import of a
//    missing name then dies at link time ("does not provide an export named 'parseHolo'"
//    — the 2026-09-06 absorb-service outage: Docker built parser from
//    HoloScriptPlusParser.ts while the standard build uses the parser/index.ts barrel).
const sourceDrift = [...importedDirs]
  .filter((dir) => hasEntry(dir))
  .map((dir) => {
    const std = entryKey(standardEntries, dir);
    return {
      dir,
      docker: dockerEntries.get(entryKey(dockerEntries, dir)),
      standard: std ? standardEntries.get(std) : null,
    };
  })
  .filter((d) => d.standard && d.docker !== d.standard)
  .sort((a, b) => a.dir.localeCompare(b.dir));

const wsList = WORKSPACE_SRC_DIRS.map((s) =>
  s.replace(/^packages\//, '').replace(/\/src$/, '')
).join(', ');
console.log(
  `\n[docker-core-entries] ${exportDir.size} core dist-subpath exports · ${dockerEntries.size} Docker entries · ${importedDirs.size} imported by runtime-image workspaces`
);
console.log(`  scanned workspaces (${WORKSPACE_SRC_DIRS.length}): ${wsList}`);
if (missing.length === 0 && sourceDrift.length === 0) {
  console.log(
    '  [ok]   every core subpath a runtime-image workspace imports has a Docker tsup entry built from the same source as the standard build'
  );
  console.log('\nRESULT: COVERED — no Docker-entry-drift.');
  process.exit(0);
}
const importers = (dir) => [...(importedByWorkspace.get(dir) || [])].sort().join(', ') || 'unknown';
for (const dir of missing) {
  console.error(
    `  [FAIL] ${exportDir.get(dir)} is imported by runtime-image workspace(s) [${importers(dir)}] but '${dir}' is MISSING from scripts/docker/tsup.core.docker.cjs`
  );
}
for (const d of sourceDrift) {
  console.error(
    `  [FAIL] ${exportDir.get(d.dir)} is imported by runtime-image workspace(s) [${importers(d.dir)}] but scripts/docker/tsup.core.docker.cjs builds it from '${d.docker}' while packages/core/tsup.config.ts builds it from '${d.standard}' — the image's dist file will lack exports the standard build has`
  );
}
const total = missing.length + sourceDrift.length;
console.error(
  `\nRESULT: ${total} Docker-entry-drift(s). The image will omit or mis-build these core subpaths and the service fails its build-time import check or CRASH-LOOPS at boot. Make each Docker entry match packages/core/tsup.config.ts${missing.length ? `; missing: ${missing.map((d) => `'${d}'`).join(', ')}` : ''}`
);
process.exit(1);
