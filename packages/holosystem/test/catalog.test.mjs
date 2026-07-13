import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOLOSYSTEM_CATALOG_SCHEMA,
  HOLOSYSTEM_LINEAGE_SCHEMA,
  buildConsumptionSurfaceCatalog,
  buildSourceLineageReceipt,
  discoverSourceLineage,
  hashConsumerInput,
  inspectPublicDependencySpecs,
  selectNextConsumptionWork,
} from '../src/catalog.mjs';

const portfolio = {
  scope: {
    registries: {
      npm: { declaredComplete: true },
      pypi: { declaredComplete: true },
    },
  },
  packages: [
    {
      ecosystem: 'npm',
      name: '@example/ready',
      expectedVersion: '1.0.0',
      classification: 'passing',
      issues: [],
    },
    {
      ecosystem: 'npm',
      name: '@example/stale',
      expectedVersion: '2.0.0',
      observedVersion: '1.9.0',
      classification: 'stale',
      issues: ['integrity-mismatch', 'import-stale', 'readback-stale'],
    },
    {
      ecosystem: 'pypi',
      name: 'example-python',
      expectedVersion: '3.0.0',
      classification: 'missing',
      issues: ['exactVersion-missing', 'import-missing', 'readback-missing'],
    },
  ],
};

test('catalog keeps rails separate and projects proof, lineage, and activity state', () => {
  const lineage = buildSourceLineageReceipt({
    portfolio,
    metadata: [
      {
        ecosystem: 'npm',
        name: '@example/ready',
        sourceRepository: 'https://github.com/example/repo',
        sourceDirectory: 'packages/ready',
      },
      {
        ecosystem: 'npm',
        name: '@example/stale',
        sourceRepository: 'https://github.com/example/repo',
        sourceDirectory: 'packages/stale',
      },
    ],
    now: new Date('2026-07-13T00:00:00.000Z'),
  });
  const receipt = buildConsumptionSurfaceCatalog({
    seeds: {
      github: { products: ['example/repo'] },
      mcp: {
        sourceAudit: {
          tools: 8,
          coveredTools: 6,
          orphanTools: 2,
          unbackedCoveredTools: 1,
          routes: 4,
        },
      },
    },
    manifest: {
      npm: [{ name: '@example/ready' }],
      pypi: [{ name: 'example-python' }],
    },
    portfolio,
    github: [{ name: 'example/repo', published: true, contractReady: true }],
    services: [{ name: 'mcp', published: true, contractReady: true }],
    containers: [{ name: 'mcp', published: true, contractReady: false }],
    mcpHealth: { tools: 9, version: '1.0.0' },
    skills: { ok: true, count: 3 },
    lineage,
    activeProofBatches: [{ id: 'slice-1', packageCount: 4, status: 'running', secret: 'do-not-project' }],
    promotionHistory: [{ id: 'promotion-1', status: 'admitted', secret: 'do-not-project' }],
    evidence: {
      operatingSet: 'consumer/package-manifest.json',
      packageAdmission: 'consumer/portfolio-receipt.json',
      sourceLineage: 'consumer/source-lineage.json',
    },
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  assert.equal(receipt.schema, HOLOSYSTEM_CATALOG_SCHEMA);
  assert.equal(receipt.status, 'current');
  assert.deepEqual(receipt.rails.npm, {
    published: 2,
    consumerReady: 1,
    dogfooded: 1,
    gaps: 1,
    evidence: 'consumer/portfolio-receipt.json',
  });
  assert.equal(receipt.rails.pypi.published, 1);
  assert.equal(receipt.rails.containers.gaps, 1);
  assert.equal(receipt.packageFailures.stale, 1);
  assert.equal(receipt.packageFailures.missing, 1);
  assert.equal(receipt.packageFailures.integrity, 1);
  assert.equal(receipt.lineage.mapped, 2);
  assert.equal(receipt.lineage.gaps, 1);
  assert.equal(receipt.activity.activeProofBatches.length, 1);
  assert.equal(receipt.activity.promotionHistory.length, 1);
  assert.doesNotMatch(JSON.stringify(receipt.activity), /do-not-project/u);
  assert.equal(receipt.boundaries.noGrandTotal, true);
  assert.equal('total' in receipt, false);
});

test('lineage receipt maps registry artifacts without local machine paths', () => {
  const receipt = buildSourceLineageReceipt({
    portfolio,
    metadata: [
      {
        ecosystem: 'npm',
        name: '@example/ready',
        sourceRepository: 'git+https://github.com/example/repo.git',
        sourceDirectory: 'packages/ready',
        registryStatus: 200,
        integrity: 'sha512-ready',
        sourceRevision: 'abc123',
      },
      {
        ecosystem: 'pypi',
        name: 'example-python',
        sourceRepository: 'https://github.com/example/python/',
      },
    ],
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  assert.equal(receipt.schema, HOLOSYSTEM_LINEAGE_SCHEMA);
  assert.equal(receipt.summary.total, 3);
  assert.equal(receipt.summary.mapped, 2);
  assert.equal(receipt.summary.gaps, 1);
  assert.equal(receipt.artifacts[0].sourceRepository, 'https://github.com/example/repo');
  assert.equal(receipt.artifacts[0].registryStatus, 200);
  assert.equal(receipt.artifacts[0].sourceRevision, 'abc123');
  assert.equal(receipt.artifacts[1].version, '2.0.0');
  assert.equal(receipt.artifacts[2].sourceRepository, 'https://github.com/example/python');
  assert.doesNotMatch(JSON.stringify(receipt), /[A-Z]:\\/u);
});

test('bounded next-work selection excludes active batches and names stop conditions', () => {
  const lineage = buildSourceLineageReceipt({
    portfolio,
    metadata: [],
    now: new Date('2026-07-13T00:00:00.000Z'),
  });
  const decision = selectNextConsumptionWork({
    portfolio,
    lineage,
    activeProofBatches: [
      { packages: [{ ecosystem: 'npm', name: '@example/stale' }], status: 'running' },
    ],
    maxCandidates: 5,
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  assert.equal(decision.selected.ecosystem, 'pypi');
  assert.equal(decision.selected.name, 'example-python');
  assert.equal(decision.selected.action, 'prove-cold-consumption');
  assert.ok(decision.stopConditions.includes('authority-required'));
  assert.ok(decision.stopConditions.includes('validation-failed'));
  assert.equal(decision.policy.maxCandidates, 5);
});

test('bounded next-work sends failed artifacts to contract repair first', () => {
  const failedPortfolio = {
    ...portfolio,
    packages: [...portfolio.packages, {
      ecosystem: 'npm',
      name: '@example/failed',
      expectedVersion: '1.0.0',
      classification: 'failed',
      issues: ['import-failed', 'readback-failed'],
    }],
  };
  const lineage = buildSourceLineageReceipt({
    portfolio: failedPortfolio,
    metadata: [],
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  const decision = selectNextConsumptionWork({
    portfolio: failedPortfolio,
    lineage,
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  assert.equal(decision.selected.name, '@example/failed');
  assert.equal(decision.selected.action, 'repair-consumer-contract');
});

test('registry lineage queries the expected artifact and preserves integrity and revision', async () => {
  const urls = [];
  const receipt = await discoverSourceLineage({
    portfolio: {
      packages: [{
        ecosystem: 'npm',
        name: '@example/stale',
        expectedVersion: '2.0.0',
        observedVersion: '1.9.0',
      }],
    },
    fetchImpl: async (url) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            name: '@example/stale',
            version: '2.0.0',
            repository: {
              url: 'git+https://github.com/example/repo.git',
              directory: 'packages/stale',
            },
            dist: { integrity: 'sha512-exact' },
            gitHead: 'revision-200',
          };
        },
      };
    },
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  assert.match(urls[0], /%40example%2Fstale\/2\.0\.0$/u);
  assert.equal(receipt.artifacts[0].version, '2.0.0');
  assert.equal(receipt.artifacts[0].integrity, 'sha512-exact');
  assert.equal(receipt.artifacts[0].sourceRevision, 'revision-200');
});

test('consumer input rejects local specs and hashes stable public evidence', () => {
  const rejected = inspectPublicDependencySpecs({
    '@example/public': '1.0.0',
    '@example/local': 'file:C:/private/package.tgz',
  });
  assert.equal(rejected.ready, false);
  assert.deepEqual(rejected.issues.map((issue) => issue.name), ['@example/local']);

  const left = hashConsumerInput({
    dependencies: { b: '2.0.0', a: '1.0.0' },
    manifest: {
      npm: [{ name: 'b', version: '2.0.0', integrity: 'sha512-b' }],
      pypi: [{ name: 'py-a', version: '1.0.0', hashes: ['sha256:b', 'sha256:a'] }],
    },
    requirements: ['py-b==2.0.0', 'py-a==1.0.0'],
  });
  const right = hashConsumerInput({
    dependencies: { a: '1.0.0', b: '2.0.0' },
    manifest: {
      npm: [{ integrity: 'sha512-b', version: '2.0.0', name: 'b' }],
      pypi: [{ hashes: ['sha256:a', 'sha256:b'], version: '1.0.0', name: 'py-a' }],
    },
    requirements: ['py-a==1.0.0', 'py-b==2.0.0'],
  });
  assert.equal(left.ready, true);
  assert.equal(left.hash, right.hash);
});
