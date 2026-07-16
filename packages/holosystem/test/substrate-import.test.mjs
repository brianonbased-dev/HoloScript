import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA,
  buildSubstrateClosure,
  importNpmPackageLock,
} from '../src/index.mjs';

const sri = (byte) => `sha512-${Buffer.alloc(64, byte).toString('base64')}`;
const verifierKeys = generateKeyPairSync('ed25519');
const verificationPolicy = {
  minimumIndependentRebuilds: 1,
  trustRoots: [
    {
      verifier: 'rebuild-farm',
      trustDomain: 'independent-rebuild-farm',
      publicKey: verifierKeys.publicKey.export({ type: 'spki', format: 'pem' }),
    },
  ],
};

const root = {
  id: 'demo-app',
  custody: { mode: 'owned', owner: 'demo', trustDomain: 'demo-release' },
  source: { uri: 'https://github.com/example/demo', revision: 'demo-revision-1' },
};

function packageLock() {
  return {
    name: 'demo-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'demo-app',
        version: '1.0.0',
        dependencies: { alpha: '1.0.0' },
        devDependencies: { devtool: '3.0.0' },
      },
      'node_modules/alpha': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz',
        integrity: sri(1),
        dependencies: { shared: '1.0.0' },
      },
      'node_modules/alpha/node_modules/shared': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/shared/-/shared-1.0.0.tgz',
        integrity: sri(2),
      },
      'node_modules/shared': {
        version: '2.0.0',
        resolved: 'https://registry.npmjs.org/shared/-/shared-2.0.0.tgz',
        integrity: sri(3),
      },
      'node_modules/devtool': {
        version: '3.0.0',
        resolved: 'https://registry.npmjs.org/devtool/-/devtool-3.0.0.tgz',
        integrity: sri(4),
      },
    },
  };
}

test('imports the production package-lock graph without flattening nested resolution', () => {
  const lockfile = packageLock();
  const left = importNpmPackageLock({
    lockfile,
    root,
    verificationPolicy,
    now: new Date('2026-07-16T00:00:00.000Z'),
  });
  const right = importNpmPackageLock({
    lockfile: {
      ...lockfile,
      packages: Object.fromEntries(Object.entries(lockfile.packages).reverse()),
    },
    root,
    verificationPolicy,
    now: new Date('2026-07-17T00:00:00.000Z'),
  });

  assert.equal(left.schema, HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA);
  assert.equal(left.status, 'coverage-and-attestation-required');
  assert.equal(left.importable, true);
  assert.equal(left.summary.components, 3);
  assert.equal(left.summary.dependencies, 2);
  assert.equal(left.summary.omittedDevRootDependencies, 1);
  assert.equal(left.summary.missingAttestations, 3);
  assert.deepEqual(left.input.coverage, {
    includedLayers: ['npm'],
    missingLayers: ['native-build', 'operating-system'],
  });
  assert.equal(left.receiptHash, right.receiptHash);
  assert.equal(left.source.lockfileHash, right.source.lockfileHash);

  const alpha = left.input.components.find((component) =>
    component.source.uri.includes('/alpha/-/')
  );
  const nestedShared = left.input.components.find(
    (component) => component.version === '1.0.0' && component.source.uri.includes('/shared/-/')
  );
  assert.deepEqual(alpha.requires, [{ id: nestedShared.id, type: 'runtime' }]);
  assert.ok(
    left.input.components.every((component) => component.verification.rebuilds.length === 0)
  );
  assert.ok(
    left.input.components
      .filter((component) => component.id !== root.id)
      .every(
        (component) =>
          component.custody.mode === 'external' && component.custody.owner === 'npm-registry'
      )
  );

  const closure = buildSubstrateClosure(left.input);
  assert.equal(closure.ready, false);
  assert.ok(closure.issues.some((issue) => issue.code === 'independent-rebuild-missing'));
  assert.ok(closure.issues.some((issue) => issue.code === 'substrate-coverage-incomplete'));
  assert.ok(!closure.issues.some((issue) => issue.code === 'artifact-digest-invalid'));
});

test('fails closed on local packages, missing runtime entries, and invalid integrity', () => {
  const lockfile = packageLock();
  lockfile.packages[''].dependencies = {
    local: 'file:../private/local',
    missing: '1.0.0',
    broken: '1.0.0',
  };
  lockfile.packages[''].optionalDependencies = { absentOptional: '1.0.0' };
  lockfile.packages['node_modules/local'] = {
    version: '1.0.0',
    resolved: 'file:C:\\private\\local',
    link: true,
  };
  lockfile.packages['node_modules/broken'] = {
    version: '1.0.0',
    resolved: 'https://registry.npmjs.org/broken/-/broken-1.0.0.tgz',
    integrity: 'sha512-not-base64',
  };

  const receipt = importNpmPackageLock({ lockfile, root, verificationPolicy });

  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.importable, false);
  assert.equal(receipt.summary.skippedOptionalDependencies, 1);
  assert.ok(receipt.issues.some((issue) => issue.code === 'package-source-not-portable'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'package-integrity-invalid'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'dependency-lock-entry-missing'));
  assert.doesNotMatch(JSON.stringify(receipt), /C:\\private/u);
});

test('rejects package-lock v1 and invalid root provenance without echoing it', () => {
  const lockfile = packageLock();
  lockfile.lockfileVersion = 1;
  delete lockfile.packages;

  const receipt = importNpmPackageLock({
    lockfile,
    root: {
      ...root,
      source: { uri: 'C:\\private\\demo', revision: 'main' },
    },
  });

  assert.equal(receipt.importable, false);
  assert.ok(receipt.issues.some((issue) => issue.code === 'lockfile-version-unsupported'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'root-source-not-portable'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'root-revision-not-pinned'));
  assert.doesNotMatch(JSON.stringify(receipt), /C:\\private/u);
});

test('rejects and redacts private keys in the import trust policy', () => {
  const receipt = importNpmPackageLock({
    lockfile: packageLock(),
    root,
    verificationPolicy: {
      minimumIndependentRebuilds: 1,
      trustRoots: [
        {
          verifier: 'unsafe-builder',
          trustDomain: 'unsafe-domain',
          publicKey: verifierKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        },
      ],
    },
  });

  assert.equal(receipt.importable, false);
  assert.ok(receipt.issues.some((issue) => issue.code === 'verification-policy-key-invalid'));
  const privateKeyHeader = ['BEGIN', 'PRIVATE', 'KEY'].join(' ');
  assert.ok(!JSON.stringify(receipt).includes(privateKeyHeader));
});

test('preserves configured-registry indirection and blocks lifecycle-script execution', () => {
  const lockfile = packageLock();
  lockfile.packages[''].dependencies = { nativeTool: '1.0.0' };
  lockfile.packages['node_modules/nativeTool'] = {
    version: '1.0.0',
    resolved: 'registry.npmjs.org',
    integrity: sri(9),
    hasInstallScript: true,
    os: ['linux'],
    cpu: ['x64'],
  };

  const imported = importNpmPackageLock({ lockfile, root, verificationPolicy });

  assert.equal(imported.importable, true);
  assert.equal(imported.status, 'execution-policy-required');
  assert.equal(imported.summary.installScriptPackages, 1);
  assert.equal(imported.summary.configuredRegistryReferences, 1);
  const nativeTool = imported.input.components.find(
    (component) => component.kind === 'npm-package'
  );
  assert.match(nativeTool.source.uri, /^npm:\/\/configured-registry\//u);
  assert.deepEqual(nativeTool.execution, { installScripts: 'present' });

  const closure = buildSubstrateClosure(imported.input);
  assert.equal(closure.ready, false);
  assert.ok(closure.issues.some((issue) => issue.code === 'install-script-present'));
});
