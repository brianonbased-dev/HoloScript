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
