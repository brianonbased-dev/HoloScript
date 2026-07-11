#!/usr/bin/env node
/**
 * check-docker-drift.mjs — fail loud on per-service Docker BUILD-drift.
 *
 * WHY THIS GATE EXISTS (W.787 — the Railway deploy lane was dead for DAYS):
 * every service builds from a SEPARATE per-service Docker recipe (its own
 * Dockerfile build-order + `scripts/docker/tsup.core.docker.cjs` externals +
 * `.npmrc` COPY). The recurring failure class is a one-sided edit: an import
 * gets added to a package's SOURCE (and the standard build config), but the
 * per-service Docker recipe is never updated to match. The local `pnpm build`
 * (shamefully-hoisted, all packages present) passes; the Docker container build
 * then breaks or ships a missing dep. It coasts unnoticed because live /health
 * stays 200 on the last good image. Six instances were peeled 2026-07-10
 * (2f2b16e21, b22e2d750, bd2481ffd, fa95936fc, a602acc8c + the .npmrc layer),
 * on top of the export→entry drift the sibling gate check-docker-core-entries.mjs
 * already guards.
 *
 * THE MODEL — import graph vs. Docker wiring, four checks:
 *
 *   (1) ORDER-DTS drift  [ratcheted]  — the studio-class break. A package X built
 *       WITH a declaration emit (`tsc --emitDeclarationOnly` / bare `tsup` / a
 *       `generate-types` step) needs the `dist/*.d.ts` of every workspace package
 *       it imports ON DISK when its dts step runs. So every workspace dep Y that
 *       X's src imports must be built-WITH-dts EARLIER in the same Dockerfile.
 *       Not built earlier (built later, or never) ⇒ TS2307 "Cannot find module
 *       '@holoscript/Y'" at docker build (the holoembed/holollama/secrets-broker
 *       -before-config layers). Engine is exempt (studio resolves it via the
 *       `../engine/src` tsconfig alias, built --no-dts by design); core is exempt
 *       (always built early with hand-crafted d.ts via generate-types).
 *
 *   (2) EXTERNALS drift  [ratcheted]  — the core-docker-bundle break. The Docker
 *       core build inlines workspace deps via `scripts/docker/tsup.core.docker.cjs`.
 *       A workspace dep Y that core's src imports that is NEITHER declared in
 *       core/package.json (so esbuild can resolve+bundle it) NOR externalized in
 *       the Docker tsup `external` array ⇒ esbuild "Could not resolve
 *       @holoscript/Y" — every Railway core-stack deploy fails (the @holoscript/mesh
 *       lazy-peer layer, f81352295 → 2f2b16e21).
 *
 *   (3) COPY-completeness  [ratcheted]  — a package built by a Dockerfile (`RUN cd
 *       packages/X && ...`, or inside a build-*.sh it runs) MUST have its SOURCE
 *       copied into the builder stage earlier (an explicit `COPY packages/X/`, a
 *       wholesale `COPY packages/ packages/`, or a whole-context `COPY . .`).
 *       Built-but-not-copied ⇒ "tsup: No input files" (the core-types drift
 *       documented in Dockerfile.absorb-service). Current tree has ZERO of these,
 *       so the baseline is empty and any NEW built-but-uncopied package fails.
 *
 *   (4) NPMRC-hoisting  [ratcheted]  — a stage that runs `pnpm install` should have
 *       `.npmrc` available earlier in the SAME stage (an explicit `COPY .npmrc` or a
 *       whole-context `COPY . .`). `.npmrc` carries `shamefully-hoist=true`; without
 *       it pnpm's strict layout hides undeclared-but-hoisted type deps and core's
 *       public-subpath dts emit fails TS2307 (the .npmrc layer, 2026-07-10).
 *
 * All four checks are ratcheted against a baseline
 * (scripts/holo-ci/docker-drift-baseline.json): the CURRENT set of gaps is blessed
 * and a NEW gap (a fresh one-sided import / omitted COPY) fails. This mirrors the
 * repo's other ratchets (check-verified-view.mjs, boundary-ratchet.mjs) and lets the
 * gate pass clean on a real, imperfect tree while still tripping on regressions. The
 * accuracy hinges on modelling what actually breaks each tool:
 *   · Only `tsc` (declaration emit) RESOLVES the import graph and throws TS2307 on a
 *     missing dep .d.ts — so ORDER-DTS scopes its consumers to `tsc` steps. `tsup`
 *     (esbuild) treats workspace deps as externals; `generate-types.mjs` is hand-crafted.
 *   · esbuild ERASES type-only imports — so EXTERNALS counts only VALUE imports (the
 *     @holoscript/mesh break was a real value import + `await import`).
 *
 * This is STATIC validation (parse import graph vs. docker COPY/build-order/externals)
 * — it does NOT run `docker build`, so it works in a CI box with no docker daemon.
 * A `docker build --target builder` smoke is the deeper (optional, manual) mode the
 * Dockerfile comments describe; this gate is the fast pre-Railway tripwire.
 *
 * Usage:
 *   node scripts/holo-ci/check-docker-drift.mjs                   # check (exit 1 on regression / hard violation)
 *   node scripts/holo-ci/check-docker-drift.mjs --update-baseline # reseed the ratchet to the current state
 *   node scripts/holo-ci/check-docker-drift.mjs --json            # print the full report as JSON
 *
 * Exit codes: 0 = pass (holds/improves vs baseline, no hard violations); 1 = hard
 * violation OR a NEW ratcheted gap OR any error; 2 = usage / missing-input error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_PATH = path.join(__dirname, 'docker-drift-baseline.json');

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const DO_UPDATE = args.includes('--update-baseline');

// Dockerfiles whose per-service recipe drifts. Enumerated by glob so the set
// self-updates as services are added. (root has none; these are the shipped ones.)
const DOCKERFILES = [
  'infrastructure/Dockerfile.absorb-service',
  'infrastructure/Dockerfile.marketplace-api',
  'infrastructure/Dockerfile.mcp-server',
  'infrastructure/Dockerfile.export-api',
  'infrastructure/Dockerfile.store',
  'packages/studio/Dockerfile',
  'packages/hologram-worker/Dockerfile',
].filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)));

// The single Docker-specific tsup config (core is inlined for the runtime image).
const CORE_DOCKER_TSUP = 'scripts/docker/tsup.core.docker.cjs';

// Packages that never need a built .d.ts on disk to satisfy a downstream dts emit:
//   engine — resolved via the `../engine/src` tsconfig path alias (built --no-dts by design)
//   core   — always built early with hand-crafted d.ts (generate-types.mjs)
const ORDER_DTS_EXEMPT = new Set(['@holoscript/engine', '@holoscript/core']);

const SRC_EXT = /\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '__tests__', '.turbo', '.next', 'coverage']);

// ── workspace package name → dir ────────────────────────────────────────────
/** Map every workspace package `name` to its directory (relative to REPO_ROOT). */
function buildWorkspaceMap() {
  const globs = ['packages', 'packages/plugins', 'services', 'benchmarks'];
  const nameToDir = new Map();
  for (const g of globs) {
    const base = path.join(REPO_ROOT, g);
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const pkgJson = path.join(base, e.name, 'package.json');
      if (!fs.existsSync(pkgJson)) continue;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        if (pkg.name) nameToDir.set(pkg.name, `${g}/${e.name}`);
      } catch {
        // skip unreadable manifest
      }
    }
  }
  return nameToDir;
}

// ── precise import extraction (value vs type) ───────────────────────────────
// Match only REAL module specifiers and classify each as a VALUE import or a
// TYPE-ONLY import. This excludes JSDoc `@module @holoscript/x` tags / prose
// mentions a bare-quote scan false-positives on, and lets EXTERNALS ignore
// type-only imports (esbuild erases them — no resolution needed).
//   VALUE:  `import x from 'S'` / `import {x} from 'S'` / `export {x} from 'S'`
//           / `require('S')` / `import('S')`  (runtime dynamic import)
//   TYPE :  `import type … from 'S'` / `export type … from 'S'`
//           / `typeof import('S')`  (type-position dynamic import)
// tsc resolves BOTH; esbuild resolves only VALUE.
// Anchored to line-start (`m` flag) so `import … from '…'` is matched only as a
// real STATEMENT, not when the same text appears inside a generated-code string
// literal (`imports.push(`import { X } from '@holoscript/ui'`)`) or a `//` comment —
// those have the keyword preceded by `"`, a backtick, or `//`, never at line-start.
const STATIC_IMPORT_RE = /^[ \t]*(import|export)\s+(type\s+)?([\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT_RE = /(typeof\s+)?\bimport\s*\(\s*['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]/g;

function resolveWorkspaceName(spec, names) {
  if (!spec.startsWith('@') && !spec.includes('/')) return null;
  let best = null;
  for (const n of names) {
    if (spec === n || spec.startsWith(n + '/')) {
      if (!best || n.length > best.length) best = n;
    }
  }
  return best;
}

const importCache = new Map(); // pkgDir → { all:Set, value:Set }
/** The workspace package NAMES `pkgDir`'s source imports, split value vs all (excl. self). */
function workspaceImportsOf(pkgDir, selfName, workspace) {
  if (importCache.has(pkgDir)) return importCache.get(pkgDir);
  const abs = path.join(REPO_ROOT, pkgDir);
  const srcRoot = fs.existsSync(path.join(abs, 'src')) ? path.join(abs, 'src') : abs;
  const names = [...workspace.keys()];
  const all = new Set();
  const value = new Set();
  const add = (spec, isValue) => {
    const n = resolveWorkspaceName(spec, names);
    if (!n || n === selfName) return;
    all.add(n);
    if (isValue) value.add(n);
  };
  const files = [];
  walkSrc(srcRoot, files);
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(STATIC_IMPORT_RE)) {
      const isType = Boolean(m[2]); // `import type` / `export type`
      add(m[4], !isType);
    }
    for (const m of text.matchAll(DYNAMIC_IMPORT_RE)) {
      const isTypeof = Boolean(m[1]); // `typeof import('…')`
      add(m[2], !isTypeof);
    }
    for (const m of text.matchAll(REQUIRE_RE)) add(m[1], true);
  }
  const result = { all, value };
  importCache.set(pkgDir, result);
  return result;
}

function walkSrc(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walkSrc(path.join(dir, e.name), out);
    } else if (SRC_EXT.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(path.join(dir, e.name));
    }
  }
}

// ── build-command dts detection ─────────────────────────────────────────────
/**
 * Does this build command PROVIDE declaration files (.d.ts) on disk for later
 * consumers? tsc dts emit, bare `tsup` (dts:true), `--dts-only`, `generate-types`,
 * or a package `build` script all do.
 */
function commandProvidesDts(cmd) {
  if (/emitDeclarationOnly|generate-types\.mjs|--dts-only|tsc\s+-p\b|pnpm exec tsc\b|pnpm run build\b/.test(cmd)) {
    return true;
  }
  if (/\btsup\b/.test(cmd) && !/--no-dts/.test(cmd)) return true;
  return false;
}

/**
 * Does this build command CONSUME the import graph's .d.ts — i.e. run `tsc`, which
 * resolves every imported module and throws TS2307 when a workspace dep's .d.ts is
 * absent? Only `tsc` does this. `tsup`/esbuild treats workspace deps as externals;
 * `generate-types.mjs` emits hand-crafted d.ts without walking imports. This narrow
 * scope is what keeps the ORDER-DTS check honest (a bare `tsup` build is NOT a
 * consumer, so core/mcp-server/engine are correctly not flagged).
 */
function commandRequiresDepDts(cmd) {
  return /\btsc\b/.test(cmd) && !/generate-types\.mjs/.test(cmd);
}

// ── build-*.sh expansion ────────────────────────────────────────────────────
const scriptCache = new Map();
/**
 * Parse a build shell script into an ordered list of { name, dts } build steps,
 * resolving `cd` (relative + absolute) and recursing into nested `./scripts/...sh`
 * invocations. Used to expand build-core-stack-no-dts.sh / build-engine-no-dts.sh
 * that Dockerfiles run as a single RUN step.
 */
function expandBuildScript(scriptRel, workspace, dirToName, seen = new Set()) {
  if (scriptCache.has(scriptRel)) return scriptCache.get(scriptRel);
  if (seen.has(scriptRel)) return [];
  seen.add(scriptRel);
  const abs = path.join(REPO_ROOT, scriptRel);
  const steps = [];
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    return steps;
  }
  let curDir = ''; // repo-root-relative cwd of the script (starts at repo root)
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cdMatch = line.match(/^cd\s+(\S+)/);
    if (cdMatch) {
      curDir = path.posix.normalize(path.posix.join(curDir, cdMatch[1].replace(/\\/g, '/')));
      if (curDir === '.') curDir = '';
      continue;
    }
    const nestedSh = line.match(/(scripts\/[^\s]+\.sh)/);
    if (nestedSh && /tsup|tsc|build|generate-types|\.sh/.test(line) && line.includes('.sh') && !line.includes('chmod')) {
      // recurse into a nested build script (e.g. build-engine-no-dts.sh)
      for (const s of expandBuildScript(nestedSh[1], workspace, dirToName, seen)) steps.push(s);
      continue;
    }
    if (/\b(tsup|tsc|generate-types\.mjs|pnpm run build)\b/.test(line)) {
      const name = dirToName.get(curDir);
      if (name) {
        const existing = steps.find((s) => s.name === name);
        const provides = commandProvidesDts(line);
        const requires = commandRequiresDepDts(line);
        if (existing) {
          existing.provides = existing.provides || provides;
          existing.requires = existing.requires || requires;
        } else {
          steps.push({ name, provides, requires });
        }
      }
    }
  }
  scriptCache.set(scriptRel, steps);
  return steps;
}

// ── Dockerfile parsing ──────────────────────────────────────────────────────
/**
 * Parse a Dockerfile into:
 *   stages[]           — { name, startLine } FROM boundaries
 *   copiedSource       — Map<workspace name, line> earliest source COPY
 *   wholesaleCopyLine  — line of `COPY packages/ packages/` (or null)
 *   builds[]           — ordered { name, provides, requires, line } build steps
 *   installs[]         — { line, stageIdx }  pnpm install occurrences
 *   npmrcCopiesByStage — Map<stageIdx, [lines]>  (.npmrc + whole-context COPY . .)
 */
function parseDockerfile(rel, workspace, dirToName) {
  const abs = path.join(REPO_ROOT, rel);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);

  const stages = [];
  const copiedSource = new Map();
  let wholesaleCopyLine = null;
  const builds = [];
  const installs = [];
  const npmrcCopiesByStage = new Map();

  const stageIdxAt = (lineNo) => {
    let idx = -1;
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].startLine <= lineNo) idx = i;
      else break;
    }
    return idx;
  };

  // First pass: stage boundaries.
  lines.forEach((raw, i) => {
    const m = raw.match(/^\s*FROM\s+.*?(?:\s+AS\s+(\S+))?\s*$/i);
    if (m) stages.push({ name: m[1] || `stage${stages.length}`, startLine: i });
  });

  // Second pass: COPY / RUN.
  lines.forEach((raw, i) => {
    const line = raw.trim();

    const stage = stageIdxAt(i);
    // whole-context copy: `COPY . .` — brings in .npmrc AND all package source
    const wholeContext = /^COPY\s+\.\s+\.\/?\s*$/.test(line);

    // .npmrc availability (explicit COPY .npmrc, or a whole-context COPY . .), per stage
    if (/^COPY\b/.test(line) && (/(^|\s|\/)\.npmrc(\s|$)/.test(line) || wholeContext)) {
      if (!npmrcCopiesByStage.has(stage)) npmrcCopiesByStage.set(stage, []);
      npmrcCopiesByStage.get(stage).push(i);
    }

    // wholesale source copy IN THE SAME BUILD STAGE: `COPY packages/ packages/` (studio
    // builder) or `COPY . .`. Recorded with its stage so a manifests-stage `COPY . .`
    // (which only feeds the /manifests package.json extract) does NOT count as source
    // for the builder stage.
    if (/^COPY\s+packages\/?\s+\.?\/?packages\/?\s*$/.test(line) || wholeContext) {
      wholesaleCopyLine = { line: i, stage };
    }

    // explicit source copy: `COPY packages/X/ packages/X/` / `COPY services/X/ ...` /
    // `COPY packages/plugins/X/ ...` (NOT `COPY --from=builder .../dist` = runtime dist)
    const srcCopy = line.match(/^COPY\s+((?:packages\/plugins\/[a-z0-9-]+)|(?:packages|services)\/[a-z0-9][a-z0-9-]*)\/\s/);
    if (srcCopy && !/--from=/.test(line)) {
      const name = dirToName.get(srcCopy[1]);
      if (name && !copiedSource.has(name)) copiedSource.set(name, { line: i, stage });
    }

    if (/^RUN\b/.test(line)) {
      if (/pnpm\s+install/.test(line)) installs.push({ line: i, stageIdx: stage });

      // build-*.sh invocation actually executed (`./scripts/docker/*.sh`) → expand
      const shMatch = line.match(/\.\/(scripts\/docker\/[a-z0-9-]+\.sh)/i);
      if (shMatch) {
        for (const s of expandBuildScript(shMatch[1], workspace, dirToName)) {
          builds.push({ name: s.name, provides: s.provides, requires: s.requires, line: i, stage });
        }
      }

      // `RUN cd packages/X && <build>` and `RUN pnpm --filter @scope/x build`
      const cdBuild = line.match(/cd\s+((?:packages|services)\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9-]+)?)\s*&&\s*(.*)$/);
      if (cdBuild) {
        const name = dirToName.get(cdBuild[1]);
        const cmd = cdBuild[2];
        if (name && /\b(tsup|tsc|generate-types\.mjs|pnpm run build)\b/.test(cmd)) {
          builds.push({ name, provides: commandProvidesDts(cmd), requires: commandRequiresDepDts(cmd), line: i, stage });
        }
      }
      const filterBuild = line.match(/pnpm\s+--filter\s+(\S+)\s+build\b/);
      if (filterBuild) {
        const name = filterBuild[1];
        if (workspace.has(name)) {
          builds.push({ name, provides: true, requires: false, line: i, stage });
        }
      }
    }
  });

  return { rel, stages, copiedSource, wholesaleCopyLine, builds, installs, npmrcCopiesByStage };
}

// ── core-docker tsup externals parse ────────────────────────────────────────
/** Parse the `external` array of tsup.core.docker.cjs into a Set<@holoscript/name>. */
function parseCoreExternals() {
  const abs = path.join(REPO_ROOT, CORE_DOCKER_TSUP);
  const text = fs.readFileSync(abs, 'utf8');
  const extBlock = text.match(/external:\s*\[([\s\S]*?)\]/);
  const set = new Set();
  if (!extBlock) return set;
  // Strip `//` line comments so a COMMENTED-OUT external is NOT counted as active —
  // otherwise commenting out the mesh entry (the shape of a regression) would be
  // invisible to the gate. The externals block uses only line comments.
  const body = extBlock[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  // string literals: '@holoscript/mesh'
  for (const m of body.matchAll(/['"](@holoscript\/[a-z0-9-]+)['"]/g)) set.add(m[1]);
  // regexes: /^@holoscript\/mesh\//  → @holoscript/mesh
  for (const m of body.matchAll(/\/\^@holoscript\\\/([a-z0-9-]+)\\\//g)) set.add('@holoscript/' + m[1]);
  return set;
}

// ── the four checks ─────────────────────────────────────────────────────────
function analyze(workspace, dirToName) {
  const orderGaps = [];
  const externalsGaps = [];
  const copyGaps = [];
  const npmrcGaps = [];

  // (1)+(3)+(4) per Dockerfile
  for (const rel of DOCKERFILES) {
    const df = parseDockerfile(rel, workspace, dirToName);

    // (3) COPY-completeness — a built package needs its SOURCE copied earlier IN THE
    //     SAME STAGE (explicit COPY packages/X/, or a same-stage wholesale COPY).
    for (const b of df.builds) {
      const src = df.copiedSource.get(b.name);
      const wholesale = df.wholesaleCopyLine;
      const copiedBefore =
        (src && src.stage === b.stage && src.line < b.line) ||
        (wholesale && wholesale.stage === b.stage && wholesale.line < b.line);
      if (!copiedBefore) {
        copyGaps.push(`${rel} :: ${b.name} built (line ${b.line + 1}) but source never COPY'd into its build stage first`);
      }
    }

    // (4) NPMRC-hoisting — every install stage should have .npmrc available earlier
    //     in the SAME stage (explicit COPY .npmrc or a whole-context COPY . .).
    for (const inst of df.installs) {
      const npmrcLines = df.npmrcCopiesByStage.get(inst.stageIdx) || [];
      if (!npmrcLines.some((l) => l < inst.line)) {
        const stageName = df.stages[inst.stageIdx]?.name ?? `stage${inst.stageIdx}`;
        npmrcGaps.push(`${rel} :: stage "${stageName}" (line ${inst.line + 1}) runs pnpm install without .npmrc (shamefully-hoist) available first`);
      }
    }

    // (1) ORDER-DTS — a tsc-consuming build needs every workspace dep built-WITH-dts
    //     earlier in the same Dockerfile (engine via src-alias + core exempt).
    const providedBefore = new Map(); // name → earliest line providing .d.ts
    for (const b of df.builds) {
      if (b.provides && (!providedBefore.has(b.name) || b.line < providedBefore.get(b.name))) {
        providedBefore.set(b.name, b.line);
      }
    }
    for (const b of df.builds) {
      if (!b.requires) continue; // only tsc steps resolve the import graph
      const dir = workspace.get(b.name);
      if (!dir) continue;
      const deps = workspaceImportsOf(dir, b.name, workspace).all; // tsc resolves value+type
      for (const dep of deps) {
        if (ORDER_DTS_EXEMPT.has(dep)) continue;
        const depLine = providedBefore.get(dep);
        if (depLine == null || depLine >= b.line) {
          orderGaps.push(`${rel} :: ${b.name} needs ${dep} built-with-dts first`);
        }
      }
    }
  }

  // (2) EXTERNALS — core VALUE-importing an UNDECLARED, non-external workspace dep.
  const coreDir = workspace.get('@holoscript/core');
  if (coreDir) {
    const externals = parseCoreExternals();
    const corePkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, coreDir, 'package.json'), 'utf8'));
    const declared = new Set([
      ...Object.keys(corePkg.dependencies || {}),
      ...Object.keys(corePkg.peerDependencies || {}),
      ...Object.keys(corePkg.optionalDependencies || {}),
      ...Object.keys(corePkg.devDependencies || {}),
    ]);
    const coreValueImports = workspaceImportsOf(coreDir, '@holoscript/core', workspace).value;
    for (const dep of coreValueImports) {
      if (declared.has(dep) || externals.has(dep)) continue;
      externalsGaps.push(`${CORE_DOCKER_TSUP} :: core value-imports ${dep} but it is neither declared in core/package.json nor externalized`);
    }
  }

  const uniqSort = (a) => [...new Set(a)].sort();
  return {
    orderGaps: uniqSort(orderGaps),
    externalsGaps: uniqSort(externalsGaps),
    copyGaps: uniqSort(copyGaps),
    npmrcGaps: uniqSort(npmrcGaps),
  };
}

// ── baseline + reporting ────────────────────────────────────────────────────
function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

const CLASSES = [
  ['orderGaps', 'a tsc-built package now imports a workspace dep that is NOT built-with-dts earlier in its Dockerfile',
    'add a build step for that dep (emitting dts) BEFORE the importer, or fix the ordering'],
  ['externalsGaps', 'core now value-imports a workspace dep neither declared in core/package.json nor externalized in tsup.core.docker.cjs',
    'add the dep to the `external` array in scripts/docker/tsup.core.docker.cjs (or declare it in core/package.json)'],
  ['copyGaps', 'a package is now BUILT in a Dockerfile stage without its source COPY\'d into that stage first',
    'add a `COPY packages/<X>/ packages/<X>/` before the build (docker build would fail "tsup: No input files")'],
  ['npmrcGaps', 'a Dockerfile stage now runs `pnpm install` without .npmrc (shamefully-hoist) available first',
    'COPY .npmrc into the stage before `pnpm install` (missing hoist breaks core\'s dts emit with TS2307)'],
];

function main() {
  const workspace = buildWorkspaceMap();
  const dirToName = new Map([...workspace.entries()].map(([n, d]) => [d, n]));

  const current = analyze(workspace, dirToName);

  const report = { dockerfiles: DOCKERFILES };
  for (const [k] of CLASSES) {
    report[k] = current[k];
    report[k + 'Count'] = current[k].length;
  }

  if (AS_JSON) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  if (DO_UPDATE) {
    const payload = {
      note:
        'Ratchet baseline for per-service Docker BUILD-drift (check-docker-drift.mjs). ' +
        'Each list is a set of currently-blessed wiring gaps; the gate FAILS if ANY set GROWS (a new one-sided ' +
        'import / omitted COPY that would break a per-service docker build before Railway). ' +
        'orderGaps = tsc-built pkg imports a workspace dep not built-with-dts earlier. ' +
        'externalsGaps = core value-imports a dep neither declared in core/package.json nor externalized. ' +
        'copyGaps = a package built without its source copied into the stage. ' +
        'npmrcGaps = a pnpm-install stage without .npmrc (shamefully-hoist). ' +
        'Wire the Docker recipe to match, then reseed with --update-baseline.',
      updatedAtIso: new Date().toISOString(),
    };
    for (const [k] of CLASSES) {
      payload[k] = current[k];
      payload[k + 'Count'] = current[k].length;
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n');
    console.log(
      `✓ docker-drift baseline reseeded: ${CLASSES.map(([k]) => `${k}=${current[k].length}`).join(', ')}`,
    );
    return;
  }

  console.log(
    `docker-drift: ${DOCKERFILES.length} Dockerfiles · ${CLASSES.map(([k]) => `${k}=${current[k].length}`).join(' · ')}`,
  );

  const baseline = readBaseline();
  if (!baseline) {
    console.error('\n✗ no baseline found — run with --update-baseline to seed it.');
    process.exit(1);
  }

  let failed = false;
  for (const [k, meaning, fix] of CLASSES) {
    if (ratchet(k, current[k], baseline[k] || [], baseline[k + 'Count'] ?? 0, meaning, fix)) failed = true;
  }

  if (failed) process.exit(1);
  console.log(
    `✓ docker-drift holds vs baseline (${CLASSES.map(([k]) => `${k} ≤ ${baseline[k + 'Count'] ?? 0}`).join(', ')}).`,
  );
}

function ratchet(label, current, baselineList, baselineCount, whatItMeans, howToFix) {
  const known = new Set(baselineList);
  const added = current.filter((g) => !known.has(g));
  if (added.length > 0) {
    console.error(`\n✗ NEW ${label} (${added.length}) — ${whatItMeans}:`);
    for (const a of added) console.error(`    + ${a}`);
    console.error(`\n  One-sided Docker-recipe drift that breaks the container build before Railway.\n  Fix: ${howToFix}, then reseed: --update-baseline.`);
    return true;
  }
  if (current.length < baselineCount) {
    console.log(`\n➜ ${label} progress: fell ${baselineCount} → ${current.length}. Run --update-baseline to lock in the gain.`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { buildWorkspaceMap, parseDockerfile, parseCoreExternals, analyze };
