import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA,
  buildSubstrateClosure,
  importDebianPackageSnapshot,
} from '../src/index.mjs';
import { _debianImportInternals } from '../src/substrate-import-debian.mjs';

const verifierKeys = generateKeyPairSync('ed25519');
const verificationPolicy = {
  minimumIndependentRebuilds: 1,
  trustRoots: [
    {
      verifier: 'debian-rebuild-farm',
      trustDomain: 'independent-debian-rebuilds',
      publicKey: verifierKeys.publicKey.export({ type: 'spki', format: 'pem' }),
    },
  ],
};

const root = {
  id: 'demo-linux',
  version: '12.1-1',
  custody: { mode: 'owned', owner: 'demo', trustDomain: 'demo-os-release' },
  source: { uri: 'https://images.example.test/demo-linux', revision: 'snapshot-20260716' },
};

const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const artifactHash = (digit) => digit.repeat(64);

function statusFile({ ambiguous = false } = {}) {
  return `Package: demo-app
Status: install ok installed
Architecture: amd64
Version: 1:2.0-1
Pre-Depends: base-files (>= 12.0)
Depends: libc6 (>> 2.36~rc1), default-mta | mail-transport-agent${ambiguous ? ', virtual-service' : ''}

Package: base-files
Status: hold ok installed
Architecture: amd64
Version: 12.4+deb12u5

Package: libc6
Status: install ok installed
Architecture: amd64
Version: 2.36-9+deb12u7

Package: exim4
Status: install ok installed
Architecture: amd64
Version: 4.96-15+deb12u5
Provides: default-mta (= 1.0), mail-transport-agent${ambiguous ? ', virtual-service' : ''}
${
  ambiguous
    ? `
Package: alternate-provider
Status: install ok installed
Architecture: amd64
Version: 1.0-1
Provides: virtual-service
`
    : ''
}`;
}

function packagesFile({ ambiguous = false, unsafeFilename = false } = {}) {
  return `Package: demo-app
Version: 1:2.0-1
Architecture: amd64
Filename: ${unsafeFilename ? '../escape.deb' : 'pool/main/d/demo-app/demo-app_2.0-1_amd64.deb'}
SHA256: ${artifactHash('1')}

Package: base-files
Version: 12.4+deb12u5
Architecture: amd64
Filename: pool/main/b/base-files/base-files_12.4_amd64.deb
SHA256: ${artifactHash('2')}

Package: libc6
Version: 2.36-9+deb12u7
Architecture: amd64
Filename: pool/main/g/glibc/libc6_2.36_amd64.deb
SHA256: ${artifactHash('3')}

Package: exim4
Version: 4.96-15+deb12u5
Architecture: amd64
Filename: pool/main/e/exim4/exim4_4.96_amd64.deb
SHA256: ${artifactHash('4')}
${
  ambiguous
    ? `
Package: alternate-provider
Version: 1.0-1
Architecture: amd64
Filename: pool/main/a/alternate-provider/alternate-provider_1.0_amd64.deb
SHA256: ${artifactHash('5')}
`
    : ''
}`;
}

function scriptManifest({ ambiguous = false } = {}) {
  return {
    'base-files:amd64': {},
    'demo-app:amd64': { postinst: `sha256:${artifactHash('a')}` },
    'exim4:amd64': {},
    'libc6:amd64': {},
    ...(ambiguous ? { 'alternate-provider:amd64': {} } : {}),
  };
}

function importFixture(options = {}) {
  const status = statusFile(options);
  const packagesIndex = packagesFile(options);
  return importDebianPackageSnapshot({
    status,
    packagesIndex,
    maintainerScripts: scriptManifest(options),
    repository: {
      uri: 'https://deb.example.test/debian',
      packagesIndexDigest: sha256(packagesIndex),
    },
    root,
    verificationPolicy,
    now: new Date('2026-07-16T00:00:00.000Z'),
  });
}

test('imports a digest-anchored installed Debian graph and preserves execution boundaries', () => {
  const receipt = importFixture();
  const later = importDebianPackageSnapshot({
    status: statusFile(),
    packagesIndex: packagesFile(),
    maintainerScripts: scriptManifest(),
    repository: {
      uri: 'https://deb.example.test/debian/',
      packagesIndexDigest: sha256(packagesFile()),
    },
    root,
    verificationPolicy,
    now: new Date('2026-07-17T00:00:00.000Z'),
  });

  assert.equal(receipt.schema, HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA);
  assert.equal(receipt.importable, true);
  assert.equal(receipt.status, 'execution-policy-required');
  assert.equal(receipt.summary.components, 5);
  assert.equal(receipt.summary.installedPackages, 4);
  assert.equal(receipt.summary.matchedRepositoryPackages, 4);
  assert.equal(receipt.summary.dependencies, 7);
  assert.equal(receipt.summary.maintainerScriptPackages, 1);
  assert.deepEqual(receipt.evidence.maintainerScripts['demo-app:amd64'], {
    postinst: `sha256:${artifactHash('a')}`,
  });
  assert.equal(receipt.receiptHash, later.receiptHash);
  assert.deepEqual(receipt.input.coverage, {
    includedLayers: ['operating-system'],
    missingLayers: ['native-build', 'repository-authentication'],
  });

  const app = receipt.input.components.find((component) => component.version === '1:2.0-1');
  const libc = receipt.input.components.find((component) => component.version.startsWith('2.36'));
  const exim = receipt.input.components.find((component) => component.version.startsWith('4.96'));
  const base = receipt.input.components.find((component) => component.version.startsWith('12.4'));
  assert.deepEqual(app.execution, { installScripts: 'present' });
  assert.deepEqual(
    app.requires,
    [
      { id: base.id, type: 'pre-depends' },
      { id: exim.id, type: 'runtime' },
      { id: libc.id, type: 'runtime' },
    ].sort((left, right) => left.id.localeCompare(right.id) || left.type.localeCompare(right.type))
  );
  assert.match(app.source.uri, /^https:\/\/deb\.example\.test\/debian\/pool\//u);
  assert.equal(app.source.revision, app.artifact.digest);

  const closure = buildSubstrateClosure(receipt.input);
  assert.equal(closure.ready, false);
  assert.ok(closure.issues.some((item) => item.code === 'install-script-present'));
  assert.ok(closure.issues.some((item) => item.code === 'independent-rebuild-missing'));
  assert.ok(closure.issues.some((item) => item.code === 'substrate-coverage-incomplete'));
  assert.ok(!closure.issues.some((item) => item.code === 'dependency-component-missing'));
});

test('joins independently anchored repositories without erasing their custody boundaries', () => {
  const [app, base, libc, exim] = packagesFile().trim().split(/\n\n/u);
  const mainIndex = `${app}\n\n${base}\n\n${libc}\n`;
  const securityIndex = `${exim}\n`;
  const receipt = importDebianPackageSnapshot({
    status: statusFile(),
    sources: [
      {
        packagesIndex: securityIndex,
        repository: {
          uri: 'https://security.example.test/debian-security/',
          packagesIndexDigest: sha256(securityIndex),
        },
        custody: { owner: 'debian-security', trustDomain: 'debian-security-archive' },
      },
      {
        packagesIndex: mainIndex,
        repository: {
          uri: 'https://deb.example.test/debian/',
          packagesIndexDigest: sha256(mainIndex),
        },
        custody: { owner: 'debian-main', trustDomain: 'debian-main-archive' },
      },
    ],
    maintainerScripts: scriptManifest(),
    root,
    verificationPolicy,
  });

  assert.equal(receipt.importable, true);
  assert.equal(receipt.source.repositories.length, 2);
  const eximComponent = receipt.input.components.find((component) =>
    component.version.startsWith('4.96')
  );
  assert.equal(eximComponent.custody.owner, 'debian-security');
  assert.match(eximComponent.source.uri, /^https:\/\/security\.example\.test\//u);
  assert.equal(receipt.source.repositories[0].uri, 'https://deb.example.test/debian/');
});

test('implements Debian epoch, tilde, revision, and numeric version ordering', () => {
  const { compareDebianVersions } = _debianImportInternals;
  const orderedPairs = [
    ['1.0~~', '1.0~'],
    ['1.0~rc1', '1.0'],
    ['1.0', '1.0-1'],
    ['1.0-1', '1.0-2'],
    ['1.0+git2', '1.0+git10'],
    ['9.9', '1:1.0'],
  ];
  for (const [earlier, later] of orderedPairs) {
    assert.equal(compareDebianVersions(earlier, later), -1, `${earlier} < ${later}`);
    assert.equal(compareDebianVersions(later, earlier), 1, `${later} > ${earlier}`);
  }
  assert.equal(compareDebianVersions('2:1.0-3', '2:1.0-3'), 0);
});

test('fails closed on ambiguous virtual providers', () => {
  const receipt = importFixture({ ambiguous: true });

  assert.equal(receipt.importable, false);
  assert.equal(receipt.status, 'blocked');
  assert.ok(receipt.issues.some((item) => item.code === 'dependency-provider-ambiguous'));
});

test('fails closed on index tampering, path traversal, and incomplete script evidence', () => {
  const packagesIndex = packagesFile({ unsafeFilename: true });
  const manifest = scriptManifest();
  delete manifest['libc6:amd64'];
  manifest['not-installed:amd64'] = {};
  const receipt = importDebianPackageSnapshot({
    status: statusFile(),
    packagesIndex,
    maintainerScripts: manifest,
    repository: {
      uri: 'https://deb.example.test/debian/',
      packagesIndexDigest: sha256(`${packagesIndex}\ntampered`),
    },
    root,
    verificationPolicy,
  });

  assert.equal(receipt.importable, false);
  assert.ok(receipt.issues.some((item) => item.code === 'packages-index-digest-mismatch'));
  assert.ok(receipt.issues.some((item) => item.code === 'repository-package-filename-invalid'));
  assert.ok(receipt.issues.some((item) => item.code === 'maintainer-script-package-missing'));
  assert.ok(receipt.issues.some((item) => item.code === 'maintainer-script-package-unknown'));
  assert.doesNotMatch(JSON.stringify(receipt), /escape\.deb/u);
});

test('CLI writes single- and multi-repository inputs without executing package tools', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-debian-import-cli-'));
  try {
    const status = statusFile();
    const packagesIndex = packagesFile();
    writeFileSync(join(cwd, 'status'), status, 'utf8');
    writeFileSync(join(cwd, 'Packages'), packagesIndex, 'utf8');
    writeFileSync(join(cwd, 'scripts.json'), JSON.stringify(scriptManifest()), 'utf8');
    writeFileSync(
      join(cwd, 'config.json'),
      JSON.stringify({
        repository: {
          uri: 'https://deb.example.test/debian/',
          packagesIndexDigest: sha256(packagesIndex),
        },
        root,
        verificationPolicy,
      }),
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, '..', 'bin', 'holosystem.mjs'),
        'substrate-import-debian',
        '--status',
        'status',
        '--packages',
        'Packages',
        '--maintainer-scripts',
        'scripts.json',
        '--config',
        'config.json',
        '--output',
        'substrate.json',
        '--json',
      ],
      { cwd, encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    const input = JSON.parse(readFileSync(join(cwd, 'substrate.json'), 'utf8'));
    assert.equal(receipt.importable, true);
    assert.equal(input.components.length, 5);
    assert.deepEqual(input.coverage.includedLayers, ['operating-system']);

    const [app, base, libc, exim] = packagesIndex.trim().split(/\n\n/u);
    const mainIndex = `${app}\n\n${base}\n\n${libc}\n`;
    const securityIndex = `${exim}\n`;
    writeFileSync(join(cwd, 'Packages.main'), mainIndex, 'utf8');
    writeFileSync(join(cwd, 'Packages.security'), securityIndex, 'utf8');
    writeFileSync(
      join(cwd, 'sources.json'),
      JSON.stringify([
        {
          packages: 'Packages.main',
          uri: 'https://deb.example.test/debian/',
          packagesIndexDigest: sha256(mainIndex),
          custody: { owner: 'debian-main', trustDomain: 'debian-main-archive' },
        },
        {
          packages: 'Packages.security',
          uri: 'https://security.example.test/debian-security/',
          packagesIndexDigest: sha256(securityIndex),
          custody: { owner: 'debian-security', trustDomain: 'debian-security-archive' },
        },
      ]),
      'utf8'
    );
    writeFileSync(
      join(cwd, 'multi-config.json'),
      JSON.stringify({ root, verificationPolicy }),
      'utf8'
    );
    const multiResult = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, '..', 'bin', 'holosystem.mjs'),
        'substrate-import-debian',
        '--status',
        'status',
        '--sources',
        'sources.json',
        '--maintainer-scripts',
        'scripts.json',
        '--config',
        'multi-config.json',
        '--json',
      ],
      { cwd, encoding: 'utf8' }
    );
    assert.equal(multiResult.status, 0, multiResult.stderr);
    const multiReceipt = JSON.parse(multiResult.stdout);
    assert.equal(multiReceipt.source.repositories.length, 2);
    assert.ok(
      multiReceipt.input.components.some(
        (component) => component.custody.owner === 'debian-security'
      )
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
