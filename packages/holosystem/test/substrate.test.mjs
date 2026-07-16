import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import {
  HOLOSYSTEM_SUBSTRATE_SCHEMA,
  buildSubstrateClosure,
  createRebuildAttestationPayload,
} from '../src/index.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const builderA = generateKeyPairSync('ed25519');
const selfBuilder = generateKeyPairSync('ed25519');

function trustRoot(verifier, trustDomain, publicKey) {
  return {
    verifier,
    trustDomain,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

const verificationPolicy = {
  minimumIndependentRebuilds: 1,
  trustRoots: [
    trustRoot('builder-a', 'independent-builder-a', builderA.publicKey),
    trustRoot('self-builder', 'holoscript-release', selfBuilder.publicKey),
  ],
};
const completeCoverage = {
  includedLayers: ['kernel', 'runtime', 'toolchain'],
  missingLayers: [],
};

function component({
  id,
  kind = 'package',
  mode = 'owned',
  owner = 'holoscript',
  custodyTrustDomain = 'holoscript-release',
  requires = [],
  artifactDigest = digest('a'),
  rebuildDigest = artifactDigest,
  verifier = 'builder-a',
  privateKey = builderA.privateKey,
} = {}) {
  const value = {
    id,
    kind,
    version: '1.0.0',
    custody: { mode, owner, trustDomain: custodyTrustDomain },
    source: {
      uri: `https://github.com/example/${id}`,
      revision: `${id}-revision`,
    },
    artifact: { digest: artifactDigest },
    execution: { installScripts: 'none' },
    requires,
    verification: {
      rebuilds: [
        {
          verifier,
          digest: rebuildDigest,
          signature: '',
        },
      ],
    },
  };
  value.verification.rebuilds[0].signature = sign(
    null,
    Buffer.from(createRebuildAttestationPayload({ verifier, component: value })),
    privateKey
  ).toString('base64');
  return value;
}

test('builds a deterministic, dependency-first substrate closure', () => {
  const input = {
    root: 'holosystem',
    coverage: completeCoverage,
    verificationPolicy,
    components: [
      component({ id: 'linux-kernel', kind: 'kernel', mode: 'external', owner: 'linux' }),
      component({
        id: 'holosystem',
        kind: 'runtime',
        requires: [
          { id: 'holoscript-runtime', type: 'runtime' },
          { id: 'holoscript-toolchain', type: 'toolchain' },
        ],
      }),
      component({ id: 'holoscript-toolchain', kind: 'toolchain' }),
      component({
        id: 'holoscript-runtime',
        kind: 'runtime',
        requires: [{ id: 'linux-kernel', type: 'kernel' }],
      }),
    ],
  };

  const left = buildSubstrateClosure({
    ...input,
    now: new Date('2026-07-16T00:00:00.000Z'),
  });
  const right = buildSubstrateClosure({
    root: input.root,
    coverage: input.coverage,
    verificationPolicy: input.verificationPolicy,
    components: input.components.slice().reverse(),
    now: new Date('2026-07-17T00:00:00.000Z'),
  });

  assert.equal(left.schema, HOLOSYSTEM_SUBSTRATE_SCHEMA);
  assert.equal(left.status, 'ready');
  assert.equal(left.ready, true);
  assert.deepEqual(left.buildOrder, [
    'linux-kernel',
    'holoscript-runtime',
    'holoscript-toolchain',
    'holosystem',
  ]);
  assert.equal(left.summary.components, 4);
  assert.equal(left.summary.dependencies, 3);
  assert.equal(left.summary.independentlyVerified, 4);
  assert.equal(left.verificationPolicy.minimumIndependentRebuilds, 1);
  assert.equal(left.verificationPolicy.trustRoots.length, 2);
  assert.match(left.verificationPolicy.trustRoots[0].publicKeyFingerprint, /^sha256:/u);
  assert.doesNotMatch(JSON.stringify(left), /BEGIN PUBLIC KEY/u);
  assert.equal(left.sovereignty.fullyOwned, false);
  assert.deepEqual(left.sovereignty.externalBoundaries, [
    {
      id: 'linux-kernel',
      kind: 'kernel',
      owner: 'linux',
      trustDomain: 'holoscript-release',
    },
  ]);
  assert.equal(left.receiptHash, right.receiptHash);
  assert.deepEqual(left.components, right.components);
});

test('fails closed on implicit, unreachable, cyclic, and unverifiable infrastructure', () => {
  const receipt = buildSubstrateClosure({
    root: 'holosystem',
    coverage: completeCoverage,
    verificationPolicy,
    components: [
      component({
        id: 'holosystem',
        requires: [{ id: 'missing-runtime', type: 'runtime' }],
      }),
      component({
        id: 'cycle-a',
        requires: [{ id: 'cycle-b', type: 'runtime' }],
      }),
      component({
        id: 'cycle-b',
        requires: [{ id: 'cycle-a', type: 'runtime' }],
      }),
      component({
        id: 'unverified-toolchain',
        kind: 'toolchain',
        rebuildDigest: digest('f'),
      }),
    ],
  });

  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.ready, false);
  assert.ok(receipt.issues.some((issue) => issue.code === 'dependency-component-missing'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'component-unreachable'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'dependency-cycle'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'independent-rebuild-mismatch'));
  assert.equal(receipt.buildOrder, null);
});

test('rejects floating versions, local source paths, duplicate ids, and self-attestation', () => {
  const first = component({
    id: 'runtime',
    verifier: 'self-builder',
    privateKey: selfBuilder.privateKey,
  });
  first.version = 'latest';
  first.source.uri = 'C:\\private\\runtime';

  const receipt = buildSubstrateClosure({
    root: 'runtime',
    coverage: completeCoverage,
    verificationPolicy,
    components: [first, component({ id: 'runtime' })],
  });

  assert.equal(receipt.ready, false);
  assert.ok(receipt.issues.some((issue) => issue.code === 'component-id-duplicate'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'component-version-floating'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'source-uri-not-portable'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'rebuild-trust-domain-not-independent'));
  assert.doesNotMatch(JSON.stringify(receipt), /C:\\private/u);
});

test('rejects forged attestations and trust roots that are not Ed25519 keys', () => {
  const forged = component({ id: 'runtime' });
  forged.verification.rebuilds[0].signature = Buffer.alloc(64).toString('base64');

  const receipt = buildSubstrateClosure({
    root: 'runtime',
    coverage: completeCoverage,
    verificationPolicy: {
      minimumIndependentRebuilds: 1,
      trustRoots: [
        verificationPolicy.trustRoots[0],
        {
          verifier: 'bad-root',
          trustDomain: 'bad-domain',
          publicKey: builderA.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        },
      ],
    },
    components: [forged],
  });

  assert.equal(receipt.ready, false);
  assert.ok(receipt.issues.some((issue) => issue.code === 'rebuild-attestation-invalid'));
  assert.ok(receipt.issues.some((issue) => issue.code === 'trust-root-key-invalid'));
  assert.equal(receipt.summary.independentlyVerified, 0);
});
