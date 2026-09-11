#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAllowedTarballPackage,
  assertFramework617Repair,
  assertRequiredDeps,
  assertSameFilesExcept,
  assertSnn873Repair,
  leftoverWorkspaceIn,
  parseRequireDep,
  pickPublishableVersion,
} from '../holo-ci/publish-tarball-contract.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'publish-npm-package.mjs');

let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`ok   ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}\n     ${String(error.message).split('\n')[0]}`);
  }
}

function writeTarball(root, manifest, files = { 'index.js': 'export default 1\n' }) {
  const pkgDir = join(root, 'package');
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(pkgDir, name), body);
  }
  const tarball = join(root, 'pack.tgz');
  execFileSync('tar', ['-czf', tarball, 'package'], { cwd: root, timeout: 15_000 });
  return tarball;
}

check('systems tarball packages are refused', () => {
  assert.throws(() => assertAllowedTarballPackage('@holoscript/systems'), /systems dist-tags stay/);
});

check('framework 6.1.7 repair refuses a self-compared tarball', () => {
  assert.throws(
    () =>
      assertFramework617Repair({
        tarballPath: 'C:/tmp/same.tgz',
        sourceTarballPath: 'C:/tmp/same.tgz',
        packedManifest: {
          name: '@holoscript/framework',
          version: '6.1.7',
          dependencies: { '@holoscript/core': '^8.0.17', '@holoscript/llm-provider': '^1.5.0' },
        },
        sourceManifest: { name: '@holoscript/framework', version: '6.1.6' },
      }),
    /different tarball/
  );
});

check('framework 6.1.7 repair refuses a non-6.1.6 source identity', () => {
  assert.throws(
    () =>
      assertFramework617Repair({
        tarballPath: 'C:/tmp/new.tgz',
        sourceTarballPath: 'C:/tmp/old.tgz',
        packedManifest: {
          name: '@holoscript/framework',
          version: '6.1.7',
          dependencies: { '@holoscript/core': '^8.0.17', '@holoscript/llm-provider': '^1.5.0' },
        },
        sourceManifest: { name: '@holoscript/framework', version: '6.1.7' },
      }),
    /must be @holoscript\/framework@6\.1\.6/
  );
});

check('snn-webgpu 8.7.3 repair refuses a non-8.7.2 source identity', () => {
  assert.throws(
    () =>
      assertSnn873Repair({
        tarballPath: 'C:/tmp/new.tgz',
        sourceTarballPath: 'C:/tmp/old.tgz',
        packedManifest: {
          name: '@holoscript/snn-webgpu',
          version: '8.7.3',
          peerDependencies: { '@holoscript/core': '^8.7.0' },
        },
        sourceManifest: { name: '@holoscript/snn-webgpu', version: '8.7.3' },
      }),
    /must be @holoscript\/snn-webgpu@8\.7\.2/
  );
});

check('required 6.1.5 pins must match exactly', () => {
  assert.throws(
    () =>
      assertRequiredDeps(
        {
          name: '@holoscript/framework',
          version: '6.1.7',
          dependencies: { '@holoscript/core': '^8.7.0', '@holoscript/llm-provider': '^1.5.0' },
        },
        [
          { name: '@holoscript/core', spec: '^8.0.17' },
          { name: '@holoscript/llm-provider', spec: '^1.5.0' },
        ]
      ),
    /dependencies\.@holoscript\/core must be \^8\.0\.17/
  );
});

check('pickPublishableVersion ignores a stale latest tag', () => {
  assert.equal(
    pickPublishableVersion('8.8.0', {
      exactExists: false,
      versions: ['8.0.17', '8.0.20', '8.7.0', '7.0.0'],
    }),
    '8.7.0'
  );
  assert.equal(
    pickPublishableVersion('8.8.0', { exactExists: true, versions: ['8.7.0'] }),
    '8.8.0'
  );
});

check('parseRequireDep splits name=spec', () => {
  assert.deepEqual(parseRequireDep('@holoscript/core=^8.0.17'), {
    name: '@holoscript/core',
    spec: '^8.0.17',
  });
});

check('same-files allows package.json rewrite and catches JS drift', () => {
  const root = mkdtempSync(join(tmpdir(), 'holo-tarball-'));
  try {
    const source = writeTarball(
      join(root, 'src'),
      {
        name: '@holoscript/framework',
        version: '6.1.6',
        dependencies: { '@holoscript/core': 'workspace:^' },
      },
      { 'index.js': 'export const n = 6\n' }
    );
    const repaired = writeTarball(
      join(root, 'out'),
      {
        name: '@holoscript/framework',
        version: '6.1.7',
        dependencies: { '@holoscript/core': '^8.0.17' },
      },
      { 'index.js': 'export const n = 6\n' }
    );
    assertSameFilesExcept(repaired, source);
    const drifted = writeTarball(
      join(root, 'bad'),
      {
        name: '@holoscript/framework',
        version: '6.1.7',
        dependencies: { '@holoscript/core': '^8.0.17' },
      },
      { 'index.js': 'export const n = 7\n' }
    );
    assert.throws(() => assertSameFilesExcept(drifted, source), /index\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check('--tarball of @holoscript/systems fails before npm publish', () => {
  const root = mkdtempSync(join(tmpdir(), 'holo-systems-tarball-'));
  try {
    const tarball = writeTarball(root, {
      name: '@holoscript/systems',
      version: '0.1.1',
      dependencies: { '@holoscript/cli': '8.0.11' },
    });
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--package', '@holoscript/systems', '--tarball', tarball, '--publish'],
      { encoding: 'utf8', timeout: 30_000 }
    );
    const out = `${result.stdout || ''}${result.stderr || ''}`;
    assert.notEqual(result.status, 0, `expected fail, got:\n${out}`);
    assert.match(out, /systems dist-tags stay/);
    assert.doesNotMatch(out, /auth-source/);
    assert.doesNotMatch(out, /PUBLISHED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check('--tarball of framework 6.1.7 without --same-files-as fails before npm', () => {
  const root = mkdtempSync(join(tmpdir(), 'holo-fw617-nosource-'));
  try {
    const tarball = writeTarball(root, {
      name: '@holoscript/framework',
      version: '6.1.7',
      dependencies: { '@holoscript/core': '^8.0.17', '@holoscript/llm-provider': '^1.5.0' },
    });
    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--package', '@holoscript/framework', '--tarball', tarball, '--inspect-only'],
      { encoding: 'utf8', timeout: 30_000 }
    );
    const out = `${result.stdout || ''}${result.stderr || ''}`;
    assert.notEqual(result.status, 0, `expected fail, got:\n${out}`);
    assert.match(out, /requires --same-files-as/);
    assert.doesNotMatch(out, /INSPECT-ONLY-PASS/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check('--tarball leftover workspace: fails before npm publish', () => {
  const root = mkdtempSync(join(tmpdir(), 'holo-workspace-tarball-'));
  try {
    const manifest = {
      name: '@holoscript/framework',
      version: '6.1.7',
      dependencies: { '@holoscript/core': 'workspace:^' },
    };
    assert.equal(leftoverWorkspaceIn(manifest), true);
    const tarball = writeTarball(root, manifest);
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--package',
        '@holoscript/framework',
        '--tarball',
        tarball,
        '--require-dep',
        '@holoscript/core=^8.0.17',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    const out = `${result.stdout || ''}${result.stderr || ''}`;
    assert.notEqual(result.status, 0, `expected fail, got:\n${out}`);
    assert.match(out, /workspace:/);
    assert.doesNotMatch(out, /auth-source/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check('--inspect-only of a matching repaired tarball exits 0 without npm auth', () => {
  const root = mkdtempSync(join(tmpdir(), 'holo-inspect-tarball-'));
  try {
    const source = writeTarball(
      join(root, 'src'),
      {
        name: '@holoscript/framework',
        version: '6.1.6',
        dependencies: {
          '@holoscript/core': 'workspace:^',
          '@holoscript/llm-provider': 'workspace:^',
        },
      },
      { 'index.js': 'export const n = 6\n' }
    );
    const repaired = writeTarball(
      join(root, 'out'),
      {
        name: '@holoscript/framework',
        version: '6.1.7',
        dependencies: { '@holoscript/core': '^8.0.17', '@holoscript/llm-provider': '^1.5.0' },
      },
      { 'index.js': 'export const n = 6\n' }
    );
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--package',
        '@holoscript/framework',
        '--tarball',
        repaired,
        '--same-files-as',
        source,
        '--require-dep',
        '@holoscript/core=^8.0.17',
        '--require-dep',
        '@holoscript/llm-provider=^1.5.0',
        '--inspect-only',
      ],
      { encoding: 'utf8', timeout: 30_000 }
    );
    const out = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0, `expected pass, got:\n${out}`);
    assert.match(out, /INSPECT-ONLY-PASS/);
    assert.match(out, /framework-6.1.7-repair PASS/);
    assert.doesNotMatch(out, /auth-source/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

if (failures) {
  console.error(`\n${failures} tarball-contract case(s) failed`);
  process.exit(1);
}
console.log('\nall publish-tarball-contract cases passed');
