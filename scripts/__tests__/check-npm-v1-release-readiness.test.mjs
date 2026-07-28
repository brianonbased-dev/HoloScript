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

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
