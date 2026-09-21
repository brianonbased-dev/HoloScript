#!/usr/bin/env node
/**
 * Regression test for scripts/holo-ci/check-docker-core-entries.mjs (W.731 hardened gate).
 *
 * This gate has prevented a class of bug that caused 6 production crash-loop outages
 * (a core subpath exported + imported by a runtime-image workspace but MISSING from the
 * Docker tsup config -> the image builds, then MODULE_NOT_FOUND at boot). The test pins
 * the gate's behavior so the hardening can't silently regress:
 *   A. drift (imported, no Docker entry)            -> exit 1, [FAIL]
 *   B. covered (imported, Docker entry present)      -> exit 0, COVERED
 *   C. JSDoc false-positive guard (unquoted @module) -> exit 0  (the W.731 hardening:
 *      bare-text matching false-positived on `@module @holoscript/core/x` tags; the gate
 *      now requires a QUOTED module specifier, so an unquoted JSDoc tag is NOT a drift)
 *   D. test-file exclusion (import in *.test.ts)     -> exit 0  (test files never ship)
 *
 * Run: node scripts/__tests__/docker-core-entries-gate.test.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(__dirname, '..', 'holo-ci', 'check-docker-core-entries.mjs');

let testsRun = 0;
let testsFailed = 0;
function assertEq(actual, expected, msg) {
  testsRun += 1;
  if (actual !== expected) {
    testsFailed += 1;
    console.error(
      `  FAIL: ${msg}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  } else {
    console.log(`  ok: ${msg}`);
  }
}

/**
 * Build a minimal repo fixture the gate can scan via --root.
 * @param {object} o
 * @param {boolean} o.dockerHasEntry  whether the Docker tsup config covers the 'policy' subpath
 * @param {'quoted-import'|'jsdoc-unquoted'|'test-file-import'|'none'} o.importStyle
 */
function buildFixture({ dockerHasEntry, importStyle }) {
  const root = mkdtempSync(join(tmpdir(), 'docker-core-gate-'));
  // core exports: ./policy -> ./dist/policy/index.cjs (a dist-subpath export the gate maps)
  mkdirSync(join(root, 'packages/core'), { recursive: true });
  writeFileSync(
    join(root, 'packages/core/package.json'),
    JSON.stringify({
      name: '@holoscript/core',
      exports: { './policy': { require: './dist/policy/index.cjs' } },
    })
  );
  // Docker tsup config — covers 'policy/index' only when dockerHasEntry; else a decoy entry.
  mkdirSync(join(root, 'scripts/docker'), { recursive: true });
  const entries = dockerHasEntry
    ? "{ 'policy/index': 'src/policy/index.ts' }"
    : "{ 'unrelated/index': 'src/unrelated/index.ts' }";
  writeFileSync(
    join(root, 'scripts/docker/tsup.core.docker.cjs'),
    `module.exports = { entry: ${entries} };\n`
  );
  // Runtime Dockerfile: ships the engine workspace's dist -> engine/src is scanned.
  mkdirSync(join(root, 'infrastructure'), { recursive: true });
  writeFileSync(
    join(root, 'infrastructure/Dockerfile.mcp-server'),
    'COPY --from=builder /app/packages/engine/dist /app/packages/engine/dist\n'
  );
  // The engine workspace source that does (or does not) import the core subpath.
  mkdirSync(join(root, 'packages/engine/src'), { recursive: true });
  if (importStyle === 'quoted-import') {
    writeFileSync(
      join(root, 'packages/engine/src/use-policy.ts'),
      `import { p } from '@holoscript/core/policy';\nexport const y = p;\n`
    );
  } else if (importStyle === 'jsdoc-unquoted') {
    // Unquoted JSDoc module tag + a prose mention — bare-text matching would false-positive here.
    writeFileSync(
      join(root, 'packages/engine/src/doc.ts'),
      `/**\n * @module @holoscript/core/policy\n * See @holoscript/core/policy for the policy contract.\n */\nexport const y = 1;\n`
    );
  } else if (importStyle === 'jsdoc-quoted-example') {
    // A QUOTED specifier inside a JSDoc usage example — still documentation, not an import.
    writeFileSync(
      join(root, 'packages/engine/src/doc-example.ts'),
      `/**\n * Usage:\n *   import { p } from '@holoscript/core/policy';\n */\nexport const y = 1;\n`
    );
  } else if (importStyle === 'test-file-import') {
    writeFileSync(
      join(root, 'packages/engine/src/use-policy.test.ts'),
      `import { p } from '@holoscript/core/policy';\nexport const y = p;\n`
    );
  } else {
    writeFileSync(join(root, 'packages/engine/src/noop.ts'), `export const y = 1;\n`);
  }
  return root;
}

function runGate(root) {
  const res = spawnSync(process.execPath, [GATE, '--root', root], { encoding: 'utf8' });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

// ── A. drift: imported but no Docker entry -> exit 1 ──────────────────────────
{
  const root = buildFixture({ dockerHasEntry: false, importStyle: 'quoted-import' });
  try {
    const r = runGate(root);
    assertEq(r.code, 1, 'A: imported core subpath missing from Docker config -> exit 1 (drift)');
    assertEq(
      /\[FAIL\]/.test(r.out) && /policy/.test(r.out),
      true,
      'A: FAIL message names the drifting subpath'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── B. covered: imported AND Docker entry present -> exit 0 ───────────────────
{
  const root = buildFixture({ dockerHasEntry: true, importStyle: 'quoted-import' });
  try {
    const r = runGate(root);
    assertEq(r.code, 0, 'B: imported core subpath present in Docker config -> exit 0 (covered)');
    assertEq(/COVERED/.test(r.out), true, 'B: reports COVERED');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── C. JSDoc/prose false-positive guard: unquoted @module, no real import -> exit 0 ──
{
  const root = buildFixture({ dockerHasEntry: false, importStyle: 'jsdoc-unquoted' });
  try {
    const r = runGate(root);
    assertEq(
      r.code,
      0,
      'C: unquoted JSDoc @module tag is NOT a drift (W.731 quoted-specifier hardening)'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── D. test-file exclusion: import lives in a *.test.ts -> exit 0 ─────────────
{
  const root = buildFixture({ dockerHasEntry: false, importStyle: 'test-file-import' });
  try {
    const r = runGate(root);
    assertEq(
      r.code,
      0,
      'D: a core import in a *.test.ts file is excluded (never ships in the image)'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── H. a quoted specifier inside a JSDoc usage example -> exit 0 ──────────────
{
  const root = buildFixture({ dockerHasEntry: false, importStyle: 'jsdoc-quoted-example' });
  try {
    const r = runGate(root);
    assertEq(r.code, 0, 'H: a quoted import inside a JSDoc example is documentation, not a drift');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── I. builder-only workspace in a selective-ship image -> not scanned, exit 0 ──
// mcp-server COPYs packages/cli into its builder stage but ships only selected dists, so a
// core import that exists only in cli never runs in that image.
{
  const root = buildFixture({ dockerHasEntry: false, importStyle: 'none' });
  try {
    writeFileSync(
      join(root, 'infrastructure/Dockerfile.mcp-server'),
      'COPY packages/cli/ packages/cli/\nRUN ./scripts/docker/build-core-stack-no-dts.sh\n' +
        'COPY --from=builder /app/packages/engine/dist /app/packages/engine/dist\n'
    );
    mkdirSync(join(root, 'packages/cli/src'), { recursive: true });
    writeFileSync(
      join(root, 'packages/cli/src/use-policy.ts'),
      `import { p } from '@holoscript/core/policy';\nexport const y = p;\n`
    );
    const r = runGate(root);
    assertEq(r.code, 0, 'I: a workspace built but not shipped by a selective-ship image is not scanned');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── E/F/G. flat subpath + source-file drift (the 2026-09-06 absorb-service outage) ──
// core exports ./parser -> ./dist/parser.js (a FLAT dist file, not <dir>/index). The
// standard build makes it from the parser barrel; the Docker config built it from one
// file inside that barrel, so dist/parser.js lacked parseHolo and the image's runtime
// import check died with "does not provide an export named 'parseHolo'". The old gate
// could not see it: it skipped flat exports, skipped unquoted entry keys, and never
// compared which source file an entry is built from.
function buildParserFixture({ dockerParser, standardParser }) {
  const root = mkdtempSync(join(tmpdir(), 'docker-core-gate-parser-'));
  mkdirSync(join(root, 'packages/core'), { recursive: true });
  writeFileSync(
    join(root, 'packages/core/package.json'),
    JSON.stringify({
      name: '@holoscript/core',
      exports: { './parser': { import: './dist/parser.js', require: './dist/parser.cjs' } },
    })
  );
  writeFileSync(
    join(root, 'packages/core/tsup.config.ts'),
    `export default { entry: { index: 'src/index.ts', parser: '${standardParser}' } };\n`
  );
  mkdirSync(join(root, 'scripts/docker'), { recursive: true });
  const dockerEntry = dockerParser ? `, parser: '${dockerParser}'` : '';
  writeFileSync(
    join(root, 'scripts/docker/tsup.core.docker.cjs'),
    `module.exports = { entry: { index: 'src/index.ts'${dockerEntry} } };\n`
  );
  mkdirSync(join(root, 'infrastructure'), { recursive: true });
  writeFileSync(
    join(root, 'infrastructure/Dockerfile.mcp-server'),
    'COPY --from=builder /app/packages/engine/dist /app/packages/engine/dist\n'
  );
  // absorb-service ships through its own Dockerfile, which also runs the Docker core build.
  writeFileSync(
    join(root, 'infrastructure/Dockerfile.absorb-service'),
    'COPY packages/absorb-service/ packages/absorb-service/\nRUN ./scripts/docker/build-core-stack-no-dts.sh\n'
  );
  mkdirSync(join(root, 'packages/engine/src'), { recursive: true });
  writeFileSync(join(root, 'packages/engine/src/noop.ts'), `export const y = 1;\n`);
  mkdirSync(join(root, 'packages/absorb-service/src/ingest'), { recursive: true });
  writeFileSync(
    join(root, 'packages/absorb-service/src/ingest/ingestHoloSource.ts'),
    `import { parseHolo } from '@holoscript/core/parser';\nexport const p = parseHolo;\n`
  );
  return root;
}

{
  const root = buildParserFixture({
    dockerParser: 'src/parser/HoloScriptPlusParser.ts',
    standardParser: 'src/parser/index.ts',
  });
  try {
    const r = runGate(root);
    assertEq(r.code, 1, 'E: Docker builds a subpath from a different source than the standard build -> exit 1');
    assertEq(
      /\[FAIL\]/.test(r.out) && /parser/.test(r.out) && /HoloScriptPlusParser\.ts/.test(r.out),
      true,
      'E: FAIL message names the subpath and both source files'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = buildParserFixture({ dockerParser: null, standardParser: 'src/parser/index.ts' });
  try {
    const r = runGate(root);
    assertEq(r.code, 1, 'F: a flat dist subpath (./dist/parser.js) missing from Docker config -> exit 1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = buildParserFixture({
    dockerParser: 'src/parser/index.ts',
    standardParser: 'src/parser/index.ts',
  });
  try {
    const r = runGate(root);
    assertEq(r.code, 0, 'G: flat subpath built from the same source in both configs -> exit 0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (testsFailed > 0) {
  console.error(`\nFAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}
console.log(`\nPASS ${testsRun} assertions`);
