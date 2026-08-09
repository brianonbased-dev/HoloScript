import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  HOLOSYSTEM_CATALOG_SCHEMA,
  HOLOSYSTEM_FARM_SCHEMA,
  HOLOSYSTEM_LINEAGE_SCHEMA,
  buildConsumptionSurfaceCatalog,
  buildFarmProposalReceipt,
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

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)])
  );
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function hashCurrentPortfolioReceipt(receipt) {
  const unsigned = { ...receipt, generatedAt: null };
  delete unsigned.receiptHash;
  return sha256(stableValue(unsigned));
}

function refinalizePortfolioReceipt(receipt) {
  receipt.receiptHash = `sha256:${'0'.repeat(64)}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const serializedBytes = Buffer.byteLength(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    if (receipt.bounds.serializedBytes === serializedBytes) break;
    receipt.bounds.serializedBytes = serializedBytes;
  }
  receipt.receiptHash = hashCurrentPortfolioReceipt(receipt);
  assert.equal(
    receipt.bounds.serializedBytes,
    Buffer.byteLength(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  );
  return receipt;
}

function finalizePortfolioReceipt(value = portfolio) {
  const receipt = {
    schema: 'holosystem.portfolio-consumer-gate.v1',
    generatedAt: '2026-08-09T00:00:00.000Z',
    status: value.packages.some((item) => item.classification !== 'passing') ? 'failed' : 'passed',
    admissible: value.packages.every((item) => item.classification === 'passing'),
    scope: structuredClone(value.scope || {}),
    summary: { total: value.packages.length },
    packages: structuredClone(value.packages),
    bounds: {
      maxPackages: 200,
      maxFindings: 50,
      maxStringLength: 240,
      maxSerializedBytes: 196608,
      packagesEmitted: value.packages.length,
      packagesOmitted: 0,
      findingsEmitted: 0,
      findingsOmitted: 0,
      truncated: false,
      serializedBytes: 0,
    },
    receiptHash: `sha256:${'0'.repeat(64)}`,
  };
  return refinalizePortfolioReceipt(receipt);
}

function rehashInsertionReceipt(receipt) {
  receipt.receiptHash = sha256({ ...receipt, generatedAt: null, receiptHash: undefined });
  return receipt;
}

function registryEvidence(ecosystem, integrity, name, version) {
  const pythonFilename = `${name.replaceAll('-', '_')}-${version}-py3-none-any.whl`;
  const tarball = ecosystem === 'npm'
    ? `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`
    : `https://files.pythonhosted.org/packages/fixture/${pythonFilename}`;
  return {
    status: 200,
    integrity,
    tarball,
    integrityBinding: {
      status: 'registry-digest-match',
      integrity,
      url: tarball,
      filename: ecosystem === 'pypi' ? pythonFilename : null,
      packageType: ecosystem === 'pypi' ? 'bdist_wheel' : 'npm-tarball',
    },
    evidenceUrl:
      ecosystem === 'npm'
        ? `https://www.npmjs.com/package/${name}/v/${version}`
        : `https://pypi.org/project/${name}/${version}`,
    deprecated: null,
    successor: null,
  };
}

function npmIntegrity(byte) {
  return `sha512-${Buffer.alloc(64, byte).toString('base64')}`;
}

function rehashReconciliationReceipt(receipt) {
  const unsigned = structuredClone(receipt);
  delete unsigned.receiptHash;
  receipt.receiptHash = sha256(unsigned);
  return receipt;
}

function reconciliationFixture() {
  const revision = 'a'.repeat(40);
  const historicalRevision = 'b'.repeat(40);
  const repository = 'https://github.com/example/public-source';
  const canonicalEvidence = `${repository}/blob/${revision}/packages/ready/package.json`;
  const artifacts = [
    {
      ecosystem: 'npm',
      name: '@example/ready',
      version: '1.0.0',
      registry: {
        ...registryEvidence('npm', npmIntegrity(0x41), '@example/ready', '1.0.0'),
        deprecated: 'Deprecated: use @example/current.',
        successor: '@example/current',
      },
      source: {
        repository,
        directory: 'packages/ready',
        revision,
        owner: 'example',
        evidenceKind: 'public-git-exact-manifest',
        evidenceUrl: canonicalEvidence,
        manifestPath: 'packages/ready/package.json',
        manifestSha256: `sha256:${'1'.repeat(64)}`,
        canonical: true,
        disposition: {
          status: 'canonical-public-source',
          evidenceUrl: canonicalEvidence,
          reason: null,
        },
      },
    },
    {
      ecosystem: 'npm',
      name: '@example/migrated',
      version: '2.0.0',
      registry: {
        ...registryEvidence(
          'npm',
          npmIntegrity(0x42),
          '@example/migrated',
          '2.0.0'
        ),
        deprecated: 'Deprecated: use @example/current.',
        successor: '@example/current',
      },
      source: {
        repository: null,
        directory: null,
        revision: null,
        evidenceKind: 'unmapped',
        evidenceUrl: null,
        manifestPath: null,
        manifestSha256: null,
        canonical: false,
        disposition: {
          status: 'deprecated-registry-artifact',
          evidenceUrl: 'https://www.npmjs.com/package/@example/migrated/v/2.0.0',
          reason: 'Deprecated: use @example/current.',
        },
      },
    },
    {
      ecosystem: 'npm',
      name: '@example/retired',
      version: '3.0.0',
      registry: registryEvidence(
        'npm',
        npmIntegrity(0x43),
        '@example/retired',
        '3.0.0'
      ),
      source: {
        repository: null,
        directory: null,
        revision: null,
        evidenceKind: 'unmapped',
        evidenceUrl: null,
        manifestPath: null,
        manifestSha256: null,
        canonical: false,
        disposition: {
          status: 'public-historical-deprecation',
          repository,
          revision: historicalRevision,
          evidenceUrl: `${repository}/commit/${historicalRevision}`,
          reason: 'Public history retires this package without a named successor.',
          successor: null,
        },
      },
    },
    {
      ecosystem: 'pypi',
      name: 'example-python',
      version: '3.0.0',
      registry: registryEvidence(
        'pypi',
        `sha256:${'2'.repeat(64)}`,
        'example-python',
        '3.0.0'
      ),
      source: {
        repository: null,
        directory: null,
        revision: null,
        evidenceKind: 'unmapped',
        evidenceUrl: null,
        manifestPath: null,
        manifestSha256: null,
        canonical: false,
        disposition: {
          status: 'source-not-publicly-verifiable',
          evidenceUrl: 'https://pypi.org/project/example-python/3.0.0',
          reason: null,
        },
      },
    },
  ];
  return rehashReconciliationReceipt({
    schema: 'holosystem.package-source-lineage-reconciliation.v1',
    generatedAt: '2026-08-09T00:00:00.000Z',
    status: 'partial',
    summary: {
      total: 4,
      sourceMapped: 1,
      sourceUnmapped: 3,
      sourceLineageResolved: 3,
      sourceLineageUnresolved: 1,
      deprecatedRegistryDisposition: 1,
      publicHistoricalDeprecation: 1,
      sourceNotPubliclyVerifiable: 1,
      residuals: { 'canonical-source': ['pypi:example-python@3.0.0'] },
    },
    artifacts,
    receiptHash: null,
  });
}

function farmInputs({ packages = portfolio.packages, activeProofBatches = [] } = {}) {
  const portfolioReceipt = finalizePortfolioReceipt({ ...portfolio, packages });
  const lineage = buildSourceLineageReceipt({
    portfolio: portfolioReceipt,
    metadata: [],
    now: new Date('2026-08-09T00:00:01.000Z'),
  });
  const catalog = buildConsumptionSurfaceCatalog({
    seeds: { github: { products: [] }, mcp: { sourceAudit: { tools: 1 } } },
    portfolio: portfolioReceipt,
    lineage,
    activeProofBatches,
    mcpHealth: { tools: 1 },
    skills: { ok: true, count: 0 },
    now: new Date('2026-08-09T00:00:02.000Z'),
  });
  return {
    catalog,
    portfolio: portfolioReceipt,
    lineage,
    sourceReceipts: {
      catalog: 'receipts/catalog.json',
      portfolio: 'receipts/portfolio.json',
      lineage: 'receipts/lineage.json',
    },
  };
}

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
    activeProofBatches: [
      { id: 'slice-1', packageCount: 4, status: 'running', secret: 'do-not-project' },
    ],
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

test('farm builds an action-ready proposal bound to current canonical input receipts', () => {
  const inputs = farmInputs({
    activeProofBatches: [
      {
        id: 'completed-proof',
        status: 'completed',
        packages: [{ ecosystem: 'npm', name: '@example/ready' }],
        receiptHash: `sha256:${'a'.repeat(64)}`,
      },
    ],
  });
  const receipt = buildFarmProposalReceipt({
    ...inputs,
    now: new Date('2026-08-09T00:00:03.000Z'),
  });

  assert.equal(receipt.schema, HOLOSYSTEM_FARM_SCHEMA);
  assert.equal(receipt.status, 'action-ready');
  assert.equal(receipt.mode, 'propose-only');
  assert.equal(receipt.publicFirst, true);
  assert.equal(receipt.requiresAuthority, true);
  assert.equal(receipt.accepted, false);
  assert.deepEqual(receipt.changesApplied, []);
  assert.deepEqual(receipt.decision, inputs.catalog.activity.nextWork);
  assert.equal(receipt.decisionProof.source, 'catalog.activity.nextWork');
  assert.equal(receipt.decisionProof.equivalentToCanonicalSelection, true);
  assert.equal(receipt.proofBatches[0].id, 'completed-proof');
  assert.equal(receipt.nextWork.length, 1);
  assert.equal(receipt.nextWork[0].name, '@example/stale');
  assert.equal(receipt.nextWork[0].status, 'proposed');
  assert.equal(receipt.nextWork[0].requiresAuthority, true);
  assert.deepEqual(receipt.sourceReceipts, [
    'receipts/catalog.json',
    'receipts/portfolio.json',
    'receipts/lineage.json',
  ]);
  for (const binding of Object.values(receipt.sourceReceiptBindings)) {
    assert.match(binding.receiptHash, /^sha256:[0-9a-f]{64}$/u);
    assert.match(binding.contentHash, /^sha256:[0-9a-f]{64}$/u);
  }
  assert.equal(receipt.boundaries.executesTasks, false);
  assert.equal(receipt.boundaries.acquiresAuthority, false);
});

test('farm recomputes an absent catalog decision and returns an idle proposal', () => {
  const passingPackages = portfolio.packages.map((item) => ({
    ...item,
    classification: 'passing',
    issues: [],
  }));
  const inputs = farmInputs({ packages: passingPackages });
  delete inputs.catalog.activity.nextWork;
  rehashInsertionReceipt(inputs.catalog);

  const receipt = buildFarmProposalReceipt({
    ...inputs,
    now: new Date('2026-08-09T00:00:03.000Z'),
  });

  assert.equal(receipt.status, 'idle');
  assert.equal(receipt.decision.status, 'idle');
  assert.equal(receipt.decisionProof.source, 'canonical-recompute');
  assert.equal(receipt.decisionProof.catalogDecisionPresent, false);
  assert.equal(receipt.decisionProof.equivalentToCanonicalSelection, true);
  assert.deepEqual(receipt.nextWork, []);
});

test('farm canonical selection excludes running, claimed, and queued proof batches', () => {
  const packages = [
    {
      ecosystem: 'npm',
      name: '@example/running',
      expectedVersion: '1.0.0',
      classification: 'failed',
      issues: ['import-failed'],
    },
    {
      ecosystem: 'npm',
      name: '@example/claimed',
      expectedVersion: '1.0.0',
      classification: 'stale',
      issues: ['integrity-mismatch'],
    },
    {
      ecosystem: 'pypi',
      name: 'queued-example',
      expectedVersion: '1.0.0',
      classification: 'missing',
      issues: ['import-missing'],
    },
  ];
  const activeProofBatches = [
    { status: 'running', packages: [packages[0]] },
    { status: 'claimed', packages: [packages[1]] },
    { status: 'queued', packages: [packages[2]] },
  ];
  const receipt = buildFarmProposalReceipt({
    ...farmInputs({ packages, activeProofBatches }),
    now: new Date('2026-08-09T00:00:03.000Z'),
  });

  assert.equal(receipt.status, 'idle');
  assert.deepEqual(receipt.nextWork, []);
  assert.deepEqual(receipt.decisionProof.activeStatusesExcluded, [
    'running',
    'claimed',
    'queued',
  ]);
});

test('farm blocks a running 101-artifact batch instead of proposing its projected omission', () => {
  const packages = Array.from({ length: 101 }, (_, index) => ({
    ecosystem: 'npm',
    name: `@example/active-${String(index).padStart(3, '0')}`,
    expectedVersion: '1.0.0',
    classification: 'missing',
    issues: ['import-missing'],
  }));
  const receipt = buildFarmProposalReceipt({
    ...farmInputs({
      packages,
      activeProofBatches: [{ status: 'running', packages }],
    }),
    now: new Date('2026-08-09T00:00:03.000Z'),
  });

  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, ['proof-batch-package-projection-may-be-truncated']);
  assert.equal(receipt.proofBatches[0].packages.length, 100);
  assert.equal(receipt.proofBatches[0].projection.packagesOmitted, 1);
  assert.equal(receipt.decisionProof.equivalentToCanonicalSelection, false);
  assert.deepEqual(receipt.nextWork, []);
});

test('farm fails closed at the exact 100-package batch projection cap', () => {
  const packages = Array.from({ length: 100 }, (_, index) => ({
    ecosystem: 'npm',
    name: `@example/active-${String(index).padStart(3, '0')}`,
    expectedVersion: '1.0.0',
    classification: 'missing',
    issues: ['import-missing'],
  }));
  const receipt = buildFarmProposalReceipt({
    ...farmInputs({
      packages,
      activeProofBatches: [{ status: 'running', packages }],
    }),
    now: new Date('2026-08-09T00:00:03.000Z'),
  });

  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, ['proof-batch-package-projection-may-be-truncated']);
  assert.equal(receipt.proofBatches[0].projection.atCap, true);
  assert.deepEqual(receipt.nextWork, []);
});

test('farm blocks when catalog proof-batch history reaches its projection cap', () => {
  const activeProofBatches = Array.from({ length: 25 }, (_, index) => ({
    id: `completed-${index}`,
    status: 'completed',
    packages: [],
  }));
  const receipt = buildFarmProposalReceipt({
    ...farmInputs({ activeProofBatches }),
    now: new Date('2026-08-09T00:00:03.000Z'),
  });

  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, ['proof-batch-history-may-be-truncated']);
  assert.deepEqual(receipt.nextWork, []);
  assert.ok(receipt.stopConditions.includes('proof-batch-history-may-be-truncated'));
});

test('farm blocks an incomplete catalog without proposing its otherwise valid decision', () => {
  const inputs = farmInputs();
  inputs.catalog.status = 'incomplete-discovery';
  rehashInsertionReceipt(inputs.catalog);

  const receipt = buildFarmProposalReceipt(inputs);
  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, ['catalog-not-current']);
  assert.deepEqual(receipt.nextWork, []);
});

test('farm blocks truncated portfolio evidence without proposing omitted work', () => {
  const inputs = farmInputs();
  inputs.portfolio.summary.total += 1;
  inputs.portfolio.bounds.packagesOmitted = 1;
  inputs.portfolio.bounds.truncated = true;
  refinalizePortfolioReceipt(inputs.portfolio);
  inputs.catalog.inputReceipts.portfolio.receiptHash = inputs.portfolio.receiptHash;
  rehashInsertionReceipt(inputs.catalog);

  const receipt = buildFarmProposalReceipt(inputs);
  assert.equal(receipt.status, 'blocked');
  assert.deepEqual(receipt.blockers, ['portfolio-evidence-truncated']);
  assert.deepEqual(receipt.nextWork, []);
});

test('farm rejects inconsistent portfolio totals before they can produce false idle', () => {
  const inputs = farmInputs({ packages: [] });
  inputs.portfolio.summary.total = 1;
  refinalizePortfolioReceipt(inputs.portfolio);

  assert.equal(inputs.catalog.activity.nextWork.status, 'idle');
  assert.throws(
    () => buildFarmProposalReceipt(inputs),
    (error) => error.code === 'farm-portfolio-invariants-invalid'
  );
});

test('farm enforces every portfolio emission and truncation invariant', () => {
  const mutations = [
    (receipt) => {
      receipt.summary.total = -1;
    },
    (receipt) => {
      receipt.bounds.packagesEmitted = -1;
    },
    (receipt) => {
      receipt.bounds.packagesOmitted = -1;
    },
    (receipt) => {
      receipt.packages.pop();
    },
    (receipt) => {
      receipt.summary.total += 1;
    },
    (receipt) => {
      receipt.summary.total += 1;
      receipt.bounds.packagesOmitted = 1;
      receipt.bounds.truncated = false;
    },
  ];

  for (const mutate of mutations) {
    const inputs = farmInputs();
    mutate(inputs.portfolio);
    refinalizePortfolioReceipt(inputs.portfolio);
    assert.throws(
      () => buildFarmProposalReceipt(inputs),
      (error) => error.code === 'farm-portfolio-invariants-invalid'
    );
  }
});

test('farm rejects malformed emitted package identities before selection', () => {
  const base = {
    ecosystem: 'npm',
    name: '@example/candidate',
    expectedVersion: '1.0.0',
    classification: 'missing',
    issues: ['import-missing'],
  };
  const mutations = [
    (row) => {
      row.name = '';
    },
    (row) => {
      row.name = '   ';
    },
    (row) => {
      row.name = ' @example/candidate ';
    },
    (row) => {
      row.ecosystem = '';
    },
    (row) => {
      row.ecosystem = 'cargo';
    },
    (row) => {
      row.classification = 'unknown';
    },
  ];

  for (const mutate of mutations) {
    const row = structuredClone(base);
    mutate(row);
    const inputs = farmInputs({ packages: [row] });
    assert.throws(
      () => buildFarmProposalReceipt(inputs),
      (error) => error.code === 'farm-portfolio-row-invalid'
    );
  }
});

test('farm accepts real-shaped npm and pypi package identities', () => {
  const inputs = farmInputs({
    packages: [structuredClone(portfolio.packages[1]), structuredClone(portfolio.packages[2])],
  });
  const receipt = buildFarmProposalReceipt(inputs);

  assert.equal(receipt.status, 'action-ready');
  assert.equal(receipt.nextWork[0].ecosystem, 'npm');
  assert.equal(receipt.nextWork[0].name, '@example/stale');
});

test('farm next-work ids are collision-resistant, deterministic, readable, and bounded', () => {
  const proposalFor = (name) => {
    const receipt = buildFarmProposalReceipt({
      ...farmInputs({
        packages: [
          {
            ecosystem: 'npm',
            name,
            expectedVersion: '1.0.0',
            classification: 'missing',
            issues: ['import-missing'],
          },
        ],
      }),
      now: new Date('2026-08-09T00:00:03.000Z'),
    });
    return receipt.nextWork[0];
  };

  const scoped = proposalFor('@a/b');
  const dashed = proposalFor('-a-b');
  const repeated = proposalFor('@a/b');
  assert.notEqual(scoped.id, dashed.id);
  assert.equal(scoped.id, repeated.id);
  assert.match(scoped.id, /^consume-npm-a-b-[0-9a-f]{64}$/u);
  assert.ok(
    scoped.id.endsWith(createHash('sha256').update('npm\0@a/b', 'utf8').digest('hex'))
  );

  const long = proposalFor(`@scope/${'a'.repeat(500)}`);
  for (const proposal of [scoped, dashed, long]) {
    assert.match(proposal.id, /^[a-z0-9][a-z0-9._-]*$/u);
    assert.ok(proposal.id.length <= 128);
  }
});

test('farm cannot clear a missing input-receipt binding by changing generatedAt', () => {
  const inputs = farmInputs();
  delete inputs.catalog.inputReceipts;
  rehashInsertionReceipt(inputs.catalog);

  const before = buildFarmProposalReceipt(inputs);
  assert.equal(before.status, 'blocked');
  assert.deepEqual(before.blockers, ['catalog-input-receipts-unbound']);

  inputs.catalog.generatedAt = '2030-08-09T00:00:00.000Z';
  const after = buildFarmProposalReceipt(inputs);
  assert.equal(after.status, 'blocked');
  assert.deepEqual(after.blockers, ['catalog-input-receipts-unbound']);
  assert.deepEqual(after.nextWork, []);
});

test('farm blocks mismatched or out-of-order integrity-bound catalog inputs', () => {
  const mismatch = farmInputs();
  mismatch.catalog.inputReceipts.portfolio.receiptHash = `sha256:${'f'.repeat(64)}`;
  rehashInsertionReceipt(mismatch.catalog);
  const mismatchReceipt = buildFarmProposalReceipt(mismatch);
  assert.equal(mismatchReceipt.status, 'blocked');
  assert.deepEqual(mismatchReceipt.blockers, ['catalog-input-receipts-mismatch']);

  const outOfOrder = farmInputs();
  outOfOrder.catalog.inputReceipts.observedAt = '2026-08-08T23:59:59.000Z';
  rehashInsertionReceipt(outOfOrder.catalog);
  const outOfOrderReceipt = buildFarmProposalReceipt(outOfOrder);
  assert.equal(outOfOrderReceipt.status, 'blocked');
  assert.deepEqual(outOfOrderReceipt.blockers, ['catalog-evidence-sequence-invalid']);
});

test('farm rejects malformed inputs and exact-schema mismatches', () => {
  const inputs = farmInputs();
  assert.throws(
    () => buildFarmProposalReceipt({ ...inputs, catalog: null }),
    (error) => error.code === 'farm-input-invalid'
  );

  const wrongSchema = structuredClone(inputs.catalog);
  wrongSchema.schema = 'holoscript.holosystem.consumption-catalog.v0';
  assert.throws(
    () => buildFarmProposalReceipt({ ...inputs, catalog: wrongSchema }),
    (error) => error.code === 'farm-input-schema-mismatch'
  );

  assert.throws(
    () =>
      buildFarmProposalReceipt({
        ...inputs,
        sourceReceipts: { catalog: '', portfolio: '', lineage: '' },
      }),
    (error) => error.code === 'farm-source-receipt-ref-invalid'
  );
});

test('farm rejects a self-consistent but forged catalog decision', () => {
  const inputs = farmInputs();
  const forged = structuredClone(inputs.catalog);
  forged.activity.nextWork.selected = structuredClone(forged.activity.nextWork.candidates[1]);
  rehashInsertionReceipt(forged.activity.nextWork);
  rehashInsertionReceipt(forged);

  assert.throws(
    () => buildFarmProposalReceipt({ ...inputs, catalog: forged }),
    (error) => error.code === 'farm-catalog-decision-inconsistent'
  );
});

test('farm receipt hash is deterministic and detects proposal or input-reference tampering', () => {
  const inputs = farmInputs();
  const left = buildFarmProposalReceipt({
    ...inputs,
    now: new Date('2026-08-09T00:00:03.000Z'),
  });
  const right = buildFarmProposalReceipt({
    ...inputs,
    now: new Date('2026-08-09T00:01:03.000Z'),
  });
  assert.notEqual(left.generatedAt, right.generatedAt);
  assert.equal(left.receiptHash, right.receiptHash);

  const tampered = structuredClone(left);
  tampered.accepted = true;
  assert.notEqual(
    left.receiptHash,
    sha256(stableValue({ ...tampered, generatedAt: null, receiptHash: undefined }))
  );

  const differentSource = buildFarmProposalReceipt({
    ...inputs,
    sourceReceipts: { ...inputs.sourceReceipts, catalog: 'receipts/other-catalog.json' },
    now: new Date('2026-08-09T00:00:03.000Z'),
  });
  assert.notEqual(left.receiptHash, differentSource.receiptHash);
});

test('farm rejects the legacy portfolio hash that normalized serializedBytes to zero', () => {
  const inputs = farmInputs();
  const legacyUnsigned = {
    ...inputs.portfolio,
    generatedAt: null,
    bounds: { ...inputs.portfolio.bounds, serializedBytes: 0 },
  };
  delete legacyUnsigned.receiptHash;
  inputs.portfolio.receiptHash = sha256(stableValue(legacyUnsigned));

  assert.throws(
    () => buildFarmProposalReceipt(inputs),
    (error) => error.code === 'farm-input-receipt-hash-invalid'
  );
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
  assert.deepEqual(receipt.summary.byKind, {
    repository: 2,
    'revision-cohort': 0,
    migration: 0,
    unknown: 1,
  });
  assert.equal(receipt.artifacts[0].sourceRepository, 'https://github.com/example/repo');
  assert.equal(receipt.artifacts[0].registryStatus, 200);
  assert.equal(receipt.artifacts[0].sourceRevision, 'abc123');
  assert.equal(receipt.artifacts[1].version, '2.0.0');
  assert.equal(receipt.artifacts[2].sourceRepository, 'https://github.com/example/python');
  assert.equal(receipt.boundaries.additiveSchema, true);
  assert.equal(receipt.boundaries.lineageKindOpen, true);
  assert.doesNotMatch(JSON.stringify(receipt), /[A-Z]:\\/u);
});

test('lineage receipt normalizes a sealed package-source reconciliation receipt', () => {
  const reconciliation = reconciliationFixture();
  const reconciliationPortfolio = {
    packages: reconciliation.artifacts.map((artifact) => ({
      ecosystem: artifact.ecosystem,
      name: artifact.name,
      expectedVersion: artifact.version,
    })),
  };
  const receipt = buildSourceLineageReceipt({
    portfolio: reconciliationPortfolio,
    metadata: reconciliation,
    now: new Date('2026-08-09T00:01:00.000Z'),
  });

  assert.equal(receipt.status, 'partial');
  assert.deepEqual(receipt.summary, {
    total: 4,
    mapped: 3,
    gaps: 1,
    byKind: {
      repository: 1,
      'revision-cohort': 0,
      migration: 1,
      unknown: 1,
      retirement: 1,
    },
  });
  assert.deepEqual(receipt.sourceReceipt, {
    schema: reconciliation.schema,
    generatedAt: reconciliation.generatedAt,
    receiptHash: reconciliation.receiptHash,
  });
  const [canonical, migration, retirement, unresolved] = receipt.artifacts;
  assert.equal(canonical.canonical, true);
  assert.equal(canonical.sourceRevision, 'a'.repeat(40));
  assert.equal(canonical.successor, '@example/current');
  assert.equal(canonical.lineageEvidence.sourceReceiptHash, reconciliation.receiptHash);
  assert.equal(migration.lineageKind, 'migration');
  assert.equal(migration.successor, '@example/current');
  assert.equal(migration.canonical, false);
  assert.equal(retirement.lineageKind, 'retirement');
  assert.equal(retirement.mapped, true);
  assert.equal(retirement.successor, null);
  assert.equal(unresolved.lineageKind, 'unknown');
  assert.equal(unresolved.mapped, false);
  assert.equal(receipt.boundaries.deprecatedPackagesRequireNamedSuccessors, false);
  assert.equal(receipt.boundaries.migrationClaimsRequireNamedSuccessors, true);
  assert.equal(receipt.boundaries.typedRetirementsMayResolveWithoutSuccessor, true);
  assert.equal(receipt.boundaries.sourceReceiptRequiresIndependentPinning, true);
  assert.equal(receipt.boundaries.remoteEvidenceInheritedNotRefetched, true);
  assert.doesNotMatch(JSON.stringify(receipt), /[A-Z]:\\/u);
});

test('lineage reconciliation fails closed on tamper, duplicate, forged source, and partial portfolio', () => {
  const reconciliation = reconciliationFixture();
  const fullPortfolio = {
    packages: reconciliation.artifacts.map((artifact) => ({
      ecosystem: artifact.ecosystem,
      name: artifact.name,
      expectedVersion: artifact.version,
    })),
  };

  const tampered = structuredClone(reconciliation);
  tampered.summary.sourceLineageResolved = 4;
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: tampered }),
    (error) => error.code === 'lineage-reconciliation-hash-invalid'
  );

  const duplicate = structuredClone(reconciliation);
  duplicate.artifacts.push(structuredClone(duplicate.artifacts[0]));
  rehashReconciliationReceipt(duplicate);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: duplicate }),
    (error) => error.code === 'lineage-reconciliation-duplicate-artifact'
  );

  const forged = structuredClone(reconciliation);
  forged.artifacts[0].source.repository = 'file:///C:/private/source';
  rehashReconciliationReceipt(forged);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: forged }),
    (error) => error.code === 'lineage-reconciliation-canonical-proof-invalid'
  );

  const fragmented = structuredClone(reconciliation);
  fragmented.artifacts[0].source.directory = 'packages/ready#fragment';
  fragmented.artifacts[0].source.manifestPath = 'packages/ready#fragment/package.json';
  fragmented.artifacts[0].source.evidenceUrl =
    'https://github.com/example/public-source/blob/' +
    `${'a'.repeat(40)}/packages/ready#fragment/package.json`;
  fragmented.artifacts[0].source.disposition.evidenceUrl =
    fragmented.artifacts[0].source.evidenceUrl;
  rehashReconciliationReceipt(fragmented);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: fragmented }),
    (error) => error.code === 'lineage-reconciliation-canonical-proof-invalid'
  );

  const mismatchedDirectory = structuredClone(reconciliation);
  mismatchedDirectory.artifacts[0].source.directory = 'packages/unrelated';
  rehashReconciliationReceipt(mismatchedDirectory);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: mismatchedDirectory }),
    (error) => error.code === 'lineage-reconciliation-canonical-proof-invalid'
  );

  const unresolvedLocalPath = structuredClone(reconciliation);
  unresolvedLocalPath.artifacts[3].source.evidenceKind = 'C:/private/evidence';
  unresolvedLocalPath.artifacts[3].source.manifestSha256 = 'C:/private/hash';
  rehashReconciliationReceipt(unresolvedLocalPath);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: unresolvedLocalPath }),
    (error) => error.code === 'lineage-reconciliation-disposition-invalid'
  );

  const invalidGeneratedAt = structuredClone(reconciliation);
  invalidGeneratedAt.generatedAt = 'C:/private/timestamp';
  rehashReconciliationReceipt(invalidGeneratedAt);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: invalidGeneratedAt }),
    (error) => error.code === 'lineage-reconciliation-generated-at-invalid'
  );

  const malformedIntegrity = structuredClone(reconciliation);
  malformedIntegrity.artifacts[0].registry.integrity = 'sha512-A';
  malformedIntegrity.artifacts[0].registry.integrityBinding.integrity = 'sha512-A';
  rehashReconciliationReceipt(malformedIntegrity);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: malformedIntegrity }),
    (error) => error.code === 'lineage-reconciliation-artifact-invalid'
  );

  const malformedVersion = structuredClone(reconciliation);
  malformedVersion.artifacts[0].version = 'definitely-not-semver';
  rehashReconciliationReceipt(malformedVersion);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: malformedVersion }),
    (error) => error.code === 'lineage-reconciliation-artifact-invalid'
  );

  for (const version of ['01.2.3', '1.2.3-.']) {
    const malformedSemver = structuredClone(reconciliation);
    malformedSemver.artifacts[0].version = version;
    rehashReconciliationReceipt(malformedSemver);
    assert.throws(
      () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: malformedSemver }),
      (error) => error.code === 'lineage-reconciliation-artifact-invalid'
    );
  }

  const unrelatedWheel = structuredClone(reconciliation);
  const unrelatedFilename = 'unrelated_distribution-99.0-py3-none-any.whl';
  const unrelatedUrl = `https://files.pythonhosted.org/packages/fixture/${unrelatedFilename}`;
  unrelatedWheel.artifacts[3].registry.tarball = unrelatedUrl;
  unrelatedWheel.artifacts[3].registry.integrityBinding.url = unrelatedUrl;
  unrelatedWheel.artifacts[3].registry.integrityBinding.filename = unrelatedFilename;
  rehashReconciliationReceipt(unrelatedWheel);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: unrelatedWheel }),
    (error) => error.code === 'lineage-reconciliation-artifact-invalid'
  );

  const equivalentPythonVersion = structuredClone(reconciliation);
  const duplicatePython = structuredClone(equivalentPythonVersion.artifacts[3]);
  duplicatePython.version = '3.0.0.0';
  equivalentPythonVersion.artifacts.push(duplicatePython);
  rehashReconciliationReceipt(equivalentPythonVersion);
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: fullPortfolio, metadata: equivalentPythonVersion }),
    (error) => error.code === 'lineage-reconciliation-duplicate-artifact'
  );

  const malformedPortfolio = structuredClone(fullPortfolio);
  malformedPortfolio.packages[0].name += ' ';
  assert.throws(
    () => buildSourceLineageReceipt({ portfolio: malformedPortfolio, metadata: reconciliation }),
    (error) => error.code === 'lineage-reconciliation-portfolio-mismatch'
  );

  const alternateObjectView = structuredClone(reconciliation);
  alternateObjectView.artifacts[3].source.disposition.status = 'public-historical-deprecation';
  alternateObjectView.toJSON = () => reconciliation;
  const snapshotted = buildSourceLineageReceipt({
    portfolio: fullPortfolio,
    metadata: alternateObjectView,
  });
  assert.equal(snapshotted.summary.mapped, 3);
  assert.equal(snapshotted.summary.gaps, 1);

  assert.throws(
    () =>
      buildSourceLineageReceipt({
        portfolio: { packages: fullPortfolio.packages.slice(0, -1) },
        metadata: reconciliation,
      }),
    (error) => error.code === 'lineage-reconciliation-portfolio-mismatch'
  );
});

test('lineage v1 consumers preserve additive fields and tolerate an unfamiliar kind', () => {
  const receipt = buildSourceLineageReceipt({
    portfolio,
    metadata: [],
    now: new Date('2026-07-13T00:00:00.000Z'),
  });
  const forwardReceipt = structuredClone(receipt);
  forwardReceipt.summary.futureMetric = 1;
  forwardReceipt.artifacts[1].lineageKind = 'future-evidence-kind';
  forwardReceipt.artifacts[1].lineageEvidence = { kind: 'future-evidence-kind' };
  forwardReceipt.artifacts[1].mapped = true;

  const nextWork = selectNextConsumptionWork({
    portfolio,
    lineage: forwardReceipt,
    now: new Date('2026-07-13T00:00:00.000Z'),
  });
  const selected = nextWork.candidates.find((item) => item.name === '@example/stale');
  assert.equal(selected.sourceRepository, null);
  assert.equal(selected.reasons.includes('source-lineage-missing'), false);

  const catalog = buildConsumptionSurfaceCatalog({
    seeds: { github: { products: [] }, mcp: { sourceAudit: {} } },
    manifest: { npm: [], pypi: [] },
    portfolio,
    lineage: forwardReceipt,
    skills: { ok: true, count: 0 },
    mcpHealth: { tools: 1 },
    now: new Date('2026-07-13T00:00:00.000Z'),
  });
  assert.equal(catalog.lineage.futureMetric, 1);
  assert.deepEqual(catalog.lineage.contract, {
    additiveSchema: true,
    lineageKindOpen: true,
  });
});

test('lineage receipt maps 27 plus 1 npm gaps from unique exact revision cohorts', () => {
  const sharedRevision = '91895e08cb1374f636527066c852e165a770ef37';
  const separateRevision = 'e3171db7608a881b11a582864dfefcd5404ac417';
  const sharedTargets = Array.from({ length: 27 }, (_, index) => ({
    ecosystem: 'npm',
    name: `@example/shared-${String(index + 1).padStart(2, '0')}`,
    expectedVersion: `1.0.${index}`,
  }));
  const cohortPortfolio = {
    packages: [
      {
        ecosystem: 'npm',
        name: '@example/emergency-anchor',
        expectedVersion: '1.0.0',
      },
      ...sharedTargets,
      { ecosystem: 'npm', name: '@example/cdn-anchor', expectedVersion: '2.0.0' },
      { ecosystem: 'npm', name: '@example/alphafold', expectedVersion: '3.0.0' },
    ],
  };
  const metadata = cohortPortfolio.packages.map((row) => {
    const shared = row.name !== '@example/cdn-anchor' && row.name !== '@example/alphafold';
    const anchorRepository =
      row.name === '@example/emergency-anchor' || row.name === '@example/cdn-anchor'
        ? 'git+https://github.com/example/HoloScript.git'
        : null;
    return {
      ecosystem: row.ecosystem,
      name: row.name,
      version: row.expectedVersion,
      sourceRepository: anchorRepository,
      sourceDirectory: anchorRepository ? `packages/${row.name.split('/')[1]}` : 'must-not-infer',
      registryStatus: 200,
      integrity: `sha512-${row.name}`,
      sourceRevision: shared ? sharedRevision : separateRevision,
    };
  });
  const now = new Date('2026-08-08T00:00:00.000Z');
  const receipt = buildSourceLineageReceipt({ portfolio: cohortPortfolio, metadata, now });
  const reordered = buildSourceLineageReceipt({
    portfolio: cohortPortfolio,
    metadata: metadata.slice().reverse(),
    now,
  });

  assert.equal(receipt.status, 'complete');
  assert.deepEqual(receipt.summary, {
    total: 30,
    mapped: 30,
    gaps: 0,
    byKind: { repository: 2, 'revision-cohort': 28, migration: 0, unknown: 0 },
  });
  const shared = receipt.artifacts.find((artifact) => artifact.name === '@example/shared-01');
  assert.equal(shared.sourceRepository, 'https://github.com/example/HoloScript');
  assert.equal(shared.sourceDirectory, null);
  assert.equal(shared.lineageKind, 'revision-cohort');
  assert.deepEqual(shared.lineageEvidence, {
    kind: 'revision-cohort',
    revisionKind: 'npm.gitHead',
    revision: sharedRevision,
    repository: 'https://github.com/example/HoloScript',
    anchors: [
      {
        ecosystem: 'npm',
        name: '@example/emergency-anchor',
        version: '1.0.0',
        integrity: 'sha512-@example/emergency-anchor',
      },
    ],
  });
  assert.equal(
    shared.lineageEvidence.anchors.some((anchor) => anchor.name === '@example/shared-02'),
    false
  );
  assert.equal(
    receipt.artifacts.find((artifact) => artifact.name === '@example/alphafold').lineageKind,
    'revision-cohort'
  );
  assert.equal(receipt.receiptHash, reordered.receiptHash);
});

test('lineage cohort normalizes one repository and sorts direct anchors', () => {
  const revision = 'dddddddddddddddddddddddddddddddddddddddd';
  const packages = ['z-anchor', 'a-anchor', 'target'].map((name) => ({
    ecosystem: 'npm',
    name: `@example/${name}`,
    expectedVersion: '1.0.0',
  }));
  const metadata = [
    {
      ecosystem: 'npm',
      name: '@example/z-anchor',
      version: '1.0.0',
      sourceRepository: 'git+https://github.com/example/repo.git',
      registryStatus: 200,
      integrity: 'sha512-z',
      sourceRevision: revision,
    },
    {
      ecosystem: 'npm',
      name: '@example/a-anchor',
      version: '1.0.0',
      sourceRepository: 'https://github.com/example/repo/',
      registryStatus: 200,
      integrity: 'sha512-a',
      sourceRevision: revision,
    },
    {
      ecosystem: 'npm',
      name: '@example/target',
      version: '1.0.0',
      registryStatus: 200,
      integrity: 'sha512-target',
      sourceRevision: revision,
    },
  ];
  const receipt = buildSourceLineageReceipt({ portfolio: { packages }, metadata });
  const target = receipt.artifacts.find((artifact) => artifact.name === '@example/target');

  assert.equal(target.sourceRepository, 'https://github.com/example/repo');
  assert.deepEqual(
    target.lineageEvidence.anchors.map((anchor) => anchor.name),
    ['@example/a-anchor', '@example/z-anchor']
  );
});

test('lineage cohort rejects targets without exact registry revision evidence', () => {
  const revision = '1111111111111111111111111111111111111111';
  const names = ['status', 'integrity', 'version', 'revision'];
  const targetPortfolio = {
    packages: [
      { ecosystem: 'npm', name: '@example/anchor', expectedVersion: '1.0.0' },
      ...names.map((name) => ({
        ecosystem: 'npm',
        name: `@example/${name}-target`,
        expectedVersion: '1.0.0',
      })),
    ],
  };
  const metadata = [
    {
      ecosystem: 'npm',
      name: '@example/anchor',
      version: '1.0.0',
      sourceRepository: 'https://github.com/example/repo',
      registryStatus: 200,
      integrity: 'sha512-anchor',
      sourceRevision: revision,
    },
    ...names.map((name) => ({
      ecosystem: 'npm',
      name: `@example/${name}-target`,
      version: name === 'version' ? '9.9.9' : '1.0.0',
      registryStatus: name === 'status' ? 503 : 200,
      integrity: name === 'integrity' ? '' : `sha512-${name}`,
      sourceRevision: name === 'revision' ? 'short-revision' : revision,
    })),
  ];
  const receipt = buildSourceLineageReceipt({ portfolio: targetPortfolio, metadata });

  for (const name of names) {
    const target = receipt.artifacts.find((artifact) => artifact.name === `@example/${name}-target`);
    assert.equal(target.lineageKind, 'unknown', name);
    assert.equal(target.mapped, false, name);
  }
});

test('lineage cohort rejects anchors without exact registry revision evidence', () => {
  const cases = ['status', 'integrity', 'version', 'revision'];
  const packages = cases.flatMap((name) => [
    { ecosystem: 'npm', name: `@example/${name}-anchor`, expectedVersion: '1.0.0' },
    { ecosystem: 'npm', name: `@example/${name}-target`, expectedVersion: '1.0.0' },
  ]);
  const metadata = cases.flatMap((name, index) => {
    const revision = name === 'revision' ? 'short-revision' : String(index + 2).repeat(40);
    return [
      {
        ecosystem: 'npm',
        name: `@example/${name}-anchor`,
        version: name === 'version' ? '9.9.9' : '1.0.0',
        sourceRepository: `https://github.com/example/${name}`,
        registryStatus: name === 'status' ? 503 : 200,
        integrity: name === 'integrity' ? '' : `sha512-${name}-anchor`,
        sourceRevision: revision,
      },
      {
        ecosystem: 'npm',
        name: `@example/${name}-target`,
        version: '1.0.0',
        registryStatus: 200,
        integrity: `sha512-${name}-target`,
        sourceRevision: revision,
      },
    ];
  });
  const receipt = buildSourceLineageReceipt({ portfolio: { packages }, metadata });

  for (const name of cases) {
    const target = receipt.artifacts.find((artifact) => artifact.name === `@example/${name}-target`);
    assert.equal(target.lineageKind, 'unknown', name);
    assert.equal(target.mapped, false, name);
  }
});

test('lineage cohort fails closed on repository conflict, migration, and cross-ecosystem data', () => {
  const conflictRevision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const migrationRevision = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const crossEcosystemRevision = 'cccccccccccccccccccccccccccccccccccccccc';
  const packages = [
    { ecosystem: 'npm', name: '@example/left-anchor', expectedVersion: '1.0.0' },
    { ecosystem: 'npm', name: '@example/right-anchor', expectedVersion: '1.0.0' },
    { ecosystem: 'npm', name: '@example/conflict-target', expectedVersion: '1.0.0' },
    { ecosystem: 'npm', name: '@example/migration-anchor', expectedVersion: '1.0.0' },
    { ecosystem: 'npm', name: '@example/migration-target', expectedVersion: '1.0.0' },
    { ecosystem: 'npm', name: '@example/npm-anchor', expectedVersion: '1.0.0' },
    { ecosystem: 'pypi', name: 'python-target', expectedVersion: '1.0.0' },
  ];
  const base = (ecosystem, name, revision) => ({
    ecosystem,
    name,
    version: '1.0.0',
    registryStatus: 200,
    integrity: `sha512-${name}`,
    sourceRevision: revision,
  });
  const metadata = [
    {
      ...base('npm', '@example/left-anchor', conflictRevision),
      sourceRepository: 'https://github.com/example/left',
    },
    {
      ...base('npm', '@example/right-anchor', conflictRevision),
      sourceRepository: 'https://github.com/example/right',
    },
    base('npm', '@example/conflict-target', conflictRevision),
    {
      ...base('npm', '@example/migration-anchor', migrationRevision),
      deprecated: 'Use @example/current.',
      successor: '@example/current',
    },
    base('npm', '@example/migration-target', migrationRevision),
    {
      ...base('npm', '@example/npm-anchor', crossEcosystemRevision),
      sourceRepository: 'https://github.com/example/npm',
    },
    base('pypi', 'python-target', crossEcosystemRevision),
  ];
  const receipt = buildSourceLineageReceipt({ portfolio: { packages }, metadata });

  assert.equal(
    receipt.artifacts.find((artifact) => artifact.name === '@example/conflict-target').lineageKind,
    'unknown'
  );
  assert.equal(
    receipt.artifacts.find((artifact) => artifact.name === '@example/migration-anchor').lineageKind,
    'migration'
  );
  assert.equal(
    receipt.artifacts.find((artifact) => artifact.name === '@example/migration-target').lineageKind,
    'unknown'
  );
  assert.equal(
    receipt.artifacts.find((artifact) => artifact.name === 'python-target').lineageKind,
    'unknown'
  );
});

test('lineage receipt maps a deprecated package only when it names a successor', () => {
  const migratedPortfolio = {
    packages: [
      { ecosystem: 'npm', name: '@example/retired', expectedVersion: '1.0.0' },
      { ecosystem: 'npm', name: '@example/abandoned', expectedVersion: '1.0.0' },
    ],
  };
  const receipt = buildSourceLineageReceipt({
    portfolio: migratedPortfolio,
    metadata: [
      {
        ecosystem: 'npm',
        name: '@example/retired',
        deprecated: 'Deprecated: merged into @example/current. Use @example/current.',
        successor: '@example/current',
      },
      {
        ecosystem: 'npm',
        name: '@example/abandoned',
        deprecated: 'Deprecated without a migration target.',
      },
    ],
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  assert.equal(receipt.artifacts[0].mapped, true);
  assert.equal(receipt.artifacts[0].lineageKind, 'migration');
  assert.equal(receipt.artifacts[0].successor, '@example/current');
  assert.equal(receipt.artifacts[1].mapped, false);
  assert.equal(receipt.summary.mapped, 1);
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
    packages: [
      ...portfolio.packages,
      {
        ecosystem: 'npm',
        name: '@example/failed',
        expectedVersion: '1.0.0',
        classification: 'failed',
        issues: ['import-failed', 'readback-failed'],
      },
    ],
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
      packages: [
        {
          ecosystem: 'npm',
          name: '@example/stale',
          expectedVersion: '2.0.0',
          observedVersion: '1.9.0',
        },
      ],
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

test('registry lineage extracts a named npm deprecation successor', async () => {
  const receipt = await discoverSourceLineage({
    portfolio: {
      packages: [{ ecosystem: 'npm', name: '@example/retired', expectedVersion: '1.0.0' }],
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          name: '@example/retired',
          version: '1.0.0',
          deprecated: 'Merged into @example/current. Use @example/current.',
          dist: { integrity: 'sha512-retired' },
        };
      },
    }),
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  assert.equal(receipt.status, 'complete');
  assert.equal(receipt.artifacts[0].lineageKind, 'migration');
  assert.equal(receipt.artifacts[0].successor, '@example/current');
});

test('registry lineage does not promote articles in generic migration prose as successors', async () => {
  for (const deprecated of [
    'Deprecated: use the @holoscript scoped packages instead.',
    'Deprecated: use the holoscript CLI instead.',
    'Deprecated: use our maintained CLI instead.',
    'Deprecated: use npm install @example/current.',
    'Deprecated: use version 2.',
    'Deprecated: use Node 18.',
  ]) {
    const receipt = await discoverSourceLineage({
      portfolio: {
        packages: [{ ecosystem: 'npm', name: '@example/retired', expectedVersion: '1.0.0' }],
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            name: '@example/retired',
            version: '1.0.0',
            deprecated,
            dist: { integrity: 'sha512-retired' },
          };
        },
      }),
    });
    assert.equal(receipt.artifacts[0].successor, null);
    assert.equal(receipt.artifacts[0].lineageKind, 'unknown');
    assert.equal(receipt.artifacts[0].mapped, false);
  }
});

test('registry lineage accepts a deliberately quoted bare npm successor', async () => {
  const receipt = await discoverSourceLineage({
    portfolio: {
      packages: [{ ecosystem: 'npm', name: '@example/retired', expectedVersion: '1.0.0' }],
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          name: '@example/retired',
          version: '1.0.0',
          deprecated: 'Deprecated: use `example-current`.',
          dist: { integrity: 'sha512-retired' },
        };
      },
    }),
  });
  assert.equal(receipt.artifacts[0].successor, 'example-current');
  assert.equal(receipt.artifacts[0].lineageKind, 'migration');
});

test('consumer input rejects local specs and hashes stable public evidence', () => {
  const rejected = inspectPublicDependencySpecs({
    '@example/public': '1.0.0',
    '@example/local': 'file:C:/private/package.tgz',
  });
  assert.equal(rejected.ready, false);
  assert.deepEqual(
    rejected.issues.map((issue) => issue.name),
    ['@example/local']
  );

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
