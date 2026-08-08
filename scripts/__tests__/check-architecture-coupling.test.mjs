import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  analyzeArchitecture,
  loadWorkspacePackages,
  normalizePair,
  runArchitectureCheck,
} = require('../check-architecture-coupling.js');

function createWorkspace(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'holoscript-architecture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writePackage(root, '.', {
    name: 'fixture-root',
    private: true,
    workspaces: ['packages/*', 'packages/plugins/*', 'services/*', 'benchmarks/*'],
  });
  return root;
}

function writePackage(root, relativeDir, manifest) {
  const packageDir = path.join(root, relativeDir);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

test('discovers every package declared by nested workspace globs', (t) => {
  const root = createWorkspace(t);
  writePackage(root, 'packages/core', { name: '@fixture/core' });
  writePackage(root, 'packages/plugins/input', { name: '@fixture/input' });
  writePackage(root, 'services/api', { name: '@fixture/api' });
  writePackage(root, 'benchmarks/load', { name: '@fixture/load' });

  const names = loadWorkspacePackages({ root }).map((pkg) => pkg.name);
  assert.deepEqual(names, [
    '@fixture/api',
    '@fixture/core',
    '@fixture/input',
    '@fixture/load',
  ]);
});

test('reports a runtime cycle that crosses plugin and service boundaries', (t) => {
  const root = createWorkspace(t);
  writePackage(root, 'packages/plugins/input', {
    name: '@fixture/input',
    dependencies: { '@fixture/api': 'workspace:*' },
  });
  writePackage(root, 'services/api', {
    name: '@fixture/api',
    peerDependencies: { '@fixture/input': 'workspace:*' },
  });

  const result = analyzeArchitecture({ root, allowedMutualPairs: new Set() });
  assert.deepEqual(result.violations, [normalizePair('@fixture/input', '@fixture/api')]);
});

test('keeps dev-only mutual dependencies as warnings', (t) => {
  const root = createWorkspace(t);
  writePackage(root, 'packages/a', {
    name: '@fixture/a',
    dependencies: { '@fixture/b': 'workspace:*' },
  });
  writePackage(root, 'packages/b', {
    name: '@fixture/b',
    devDependencies: { '@fixture/a': 'workspace:*' },
  });

  const result = runArchitectureCheck({
    root,
    allowedMutualPairs: new Set(),
    log() {},
    error() {},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.devOnlyPairs, [normalizePair('@fixture/a', '@fixture/b')]);
});
