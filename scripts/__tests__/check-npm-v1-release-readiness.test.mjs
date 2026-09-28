#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'holo-ci', 'check-npm-v1-release-readiness.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertMatch(text, pattern, name) {
  testsRun += 1;
  if (pattern.test(text)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: ${pattern} not found in output`);
  }
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function buildFixture({ pkg, candidate, dist = true }) {
  const root = mkdtempSync(join(tmpdir(), 'npm-v1-release-'));
  const pkgDir = join(root, 'packages', 'candidate');
  const manifestDir = join(root, 'scripts', 'holo-ci');
  mkdirSync(pkgDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });
  if (dist) {
    mkdirSync(join(pkgDir, 'dist'), { recursive: true });
    writeFileSync(join(pkgDir, 'dist', 'index.js'), 'export const ok = true;\n');
    writeFileSync(join(pkgDir, 'dist', 'index.d.ts'), 'export declare const ok: boolean;\n');
  }
  writeJson(join(pkgDir, 'package.json'), pkg);
  writeJson(join(manifestDir, 'npm-v1-release-manifest.json'), {
    schema: 'test',
    candidatePackages: [candidate || { name: pkg.name }],
  });
  return root;
}

function run(root, extra = []) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--root', root, '--skip-registry', ...extra],
    {
      encoding: 'utf8',
    }
  );
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

const validPackage = {
  name: '@holoscript/example',
  version: '1.0.0',
  description: 'Example package',
  license: 'MIT',
  repository: { type: 'git', url: 'https://example.test/repo.git' },
  main: './dist/index.js',
  types: './dist/index.d.ts',
  files: ['dist'],
};

console.log('check-npm-v1-release-readiness.test.mjs');

{
  const root = buildFixture({ pkg: validPackage });
  try {
    const result = run(root, ['--require-built']);
    assertEq(result.code, 0, 'valid built candidate passes');
    assertMatch(result.out, /PASS/, 'valid built candidate prints PASS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = buildFixture({ pkg: { ...validPackage, private: true } });
  try {
    const result = run(root);
    assertEq(result.code, 1, 'private candidate fails');
    assertMatch(result.out, /candidate package is private/, 'private failure is explicit');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = buildFixture({
    pkg: { ...validPackage, publishConfig: undefined },
    candidate: { name: validPackage.name, allowFirstPublish: true },
  });
  try {
    const result = run(root);
    assertEq(result.code, 1, 'first scoped publish without public access fails');
    assertMatch(
      result.out,
      /publishConfig\.access='public'/,
      'first publish failure names public access'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = buildFixture({ pkg: validPackage, dist: false });
  try {
    const result = run(root, ['--require-built']);
    assertEq(result.code, 1, 'missing built files fail under --require-built');
    assertMatch(result.out, /built entrypoint missing/, 'built-file failure is explicit');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Registry comparison must use the MAX published version, not npm's \`latest\`
// dist-tag and not the last element of the versions array.
//
// Both lie. A dist-tag can be moved backwards (@holoscript/engine had
// latest=6.1.7 on 2026-09-02 while 8.0.0 was on the registry), and the versions
// array is PUBLISH ORDER, so the newest push is not the greatest once anything
// is backported. Either mistake lets this gate green-light a version that goes
// BACKWARDS over an existing release, which is the one thing it exists to stop.
//
// These run the real script against a fake npm on PATH, because the harness
// above passes --skip-registry and therefore never reaches this code path.
// ---------------------------------------------------------------------------
function runWithFakeNpm(root, versions, extra = []) {
  const binDir = mkdtempSync(join(tmpdir(), 'fake-npm-'));
  const payload = join(binDir, 'versions.json');
  writeFileSync(payload, JSON.stringify(versions));
  // A tiny node shim: whatever npm is asked, answer with the versions array.
  writeFileSync(
    join(binDir, 'fake-npm.mjs'),
    "import { readFileSync } from 'node:fs';\n" +
      "import { dirname, join } from 'node:path';\n" +
      "import { fileURLToPath } from 'node:url';\n" +
      "process.stdout.write(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'versions.json'), 'utf8'));\n"
  );
  writeFileSync(join(binDir, 'npm.cmd'), '@echo off\r\nnode "%~dp0fake-npm.mjs" %*\r\n');
  writeFileSync(join(binDir, 'npm'), '#!/bin/sh\nexec node "$(dirname "$0")/fake-npm.mjs" "$@"\n', {
    mode: 0o755,
  });
  try {
    const result = spawnSync(process.execPath, [SCRIPT, '--root', root, ...extra], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: binDir + (process.platform === 'win32' ? ';' : ':') + process.env.PATH,
      },
    });
    return { code: result.status, out: (result.stdout || '') + (result.stderr || '') };
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
}

{
  // Within a major, going backwards is always wrong. Published out of order so
  // the LAST entry (2.1.0) is not the greatest on the line (2.5.0): local 2.2.0
  // is above the last-published and below the line head, and must fail naming
  // the head. This is what .at(-1) got wrong.
  const root = buildFixture({ pkg: { ...validPackage, version: '2.2.0' } });
  try {
    const result = runWithFakeNpm(root, ['2.0.0', '2.5.0', '2.1.0']);
    assertEq(
      result.code,
      1,
      'local below its own line head fails even when above the last-published'
    );
    assertMatch(
      result.out,
      /older than npm 2\.5\.0/,
      'the failure names the line head (2.5.0), not the last entry (2.1.0)'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  // A higher major can be ABANDONED. @holoscript/platform published 7.0.0 in
  // May 2026 and then shipped 6.1.0-6.1.4 over the following three months. The
  // next release on that package is 6.1.5, and demanding 7.x to satisfy this
  // gate would force a jump onto a dead line. Report it, never fail on it.
  const root = buildFixture({ pkg: { ...validPackage, version: '2.1.0' } });
  try {
    const result = runWithFakeNpm(root, ['2.0.0', '3.0.0'], ['--require-built']);
    assertEq(result.code, 0, 'a higher abandoned major does not block a release on the live line');
    assertMatch(result.out, /publish-update/, 'continuing the live line is a publish-update');
    assertMatch(result.out, /higher major 3\.0\.0/, 'the abandoned major is reported as a warning');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
