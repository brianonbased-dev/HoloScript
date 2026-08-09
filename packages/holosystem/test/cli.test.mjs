import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  HOLOSYSTEM_FARM_SCHEMA,
  buildConsumptionSurfaceCatalog,
  buildSourceLineageReceipt,
  createRebuildAttestationPayload,
} from '../src/index.mjs';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(PACKAGE_ROOT, 'bin', 'holosystem.mjs');

function run(args, { cwd, input } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function initializeRepository(cwd, files) {
  git(cwd, ['init', '--quiet']);
  git(cwd, ['config', 'user.email', 'source-canon@example.invalid']);
  git(cwd, ['config', 'user.name', 'Source Canon Test']);
  for (const [path, contents] of Object.entries(files)) writeFileSync(join(cwd, path), contents);
  git(cwd, ['add', ...Object.keys(files)]);
  git(cwd, ['commit', '--quiet', '-m', 'test: source canon fixture']);
}

function withReceiptHash(value) {
  const receipt = structuredClone(value);
  delete receipt.receiptHash;
  receipt.receiptHash = `sha256:${createHash('sha256')
    .update(JSON.stringify({ ...receipt, generatedAt: null }))
    .digest('hex')}`;
  return receipt;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)])
  );
}

function withPortfolioReceiptHash(value) {
  const receipt = structuredClone(value);
  receipt.bounds = {
    maxPackages: 200,
    maxFindings: 50,
    maxStringLength: 240,
    maxSerializedBytes: 196608,
    packagesEmitted: receipt.packages.length,
    packagesOmitted: 0,
    findingsEmitted: 0,
    findingsOmitted: 0,
    truncated: false,
    serializedBytes: 0,
  };
  receipt.receiptHash = `sha256:${'0'.repeat(64)}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const serializedBytes = Buffer.byteLength(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    if (receipt.bounds.serializedBytes === serializedBytes) break;
    receipt.bounds.serializedBytes = serializedBytes;
  }
  const unsigned = { ...receipt, generatedAt: null };
  delete unsigned.receiptHash;
  receipt.receiptHash = `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(unsigned)))
    .digest('hex')}`;
  assert.equal(
    receipt.bounds.serializedBytes,
    Buffer.byteLength(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  );
  return receipt;
}

function writeFarmInputs(cwd, { idle = false, proofBatchCount = 0 } = {}) {
  const generatedAt = '2026-08-09T00:00:00.000Z';
  const row = idle
    ? {
        ecosystem: 'npm',
        name: '@example/ready',
        expectedVersion: '1.0.0',
        observedVersion: '1.0.0',
        classification: 'passing',
        issues: [],
      }
    : {
        ecosystem: 'npm',
        name: '@example/stale',
        expectedVersion: '2.0.0',
        observedVersion: '1.9.0',
        classification: 'stale',
        issues: ['integrity-mismatch', 'import-stale', 'readback-stale'],
      };
  const portfolio = withPortfolioReceiptHash({
    schema: 'holosystem.portfolio-consumer-gate.v1',
    generatedAt,
    status: idle ? 'passed' : 'failed',
    admissible: idle,
    scope: {
      registries: {
        npm: { declaredComplete: true },
        pypi: { declaredComplete: true },
      },
    },
    summary: {
      total: 1,
      passing: idle ? 1 : 0,
      stale: idle ? 0 : 1,
      missing: 0,
      failed: 0,
    },
    packages: [row],
  });
  const lineage = buildSourceLineageReceipt({
    portfolio,
    metadata: [
      {
        ecosystem: row.ecosystem,
        name: row.name,
        version: row.expectedVersion,
        sourceRepository: 'https://github.com/example/repo',
        sourceDirectory: idle ? 'packages/ready' : 'packages/stale',
      },
    ],
    now: new Date(generatedAt),
  });
  const catalog = buildConsumptionSurfaceCatalog({
    seeds: { github: { products: [] }, mcp: { sourceAudit: { tools: 1 } } },
    manifest: { npm: [{ name: row.name }], pypi: [] },
    portfolio,
    lineage,
    skills: { ok: true, count: 0 },
    mcpHealth: { tools: 1, version: '1.0.0' },
    activeProofBatches: Array.from({ length: proofBatchCount }, (_, index) => ({
      id: `proof-${index + 1}`,
      status: 'completed',
      generatedAt,
      packages: [],
      summary: { total: 0, passing: 0, failed: 0 },
      receiptHash: `sha256:${String(index + 1).padStart(64, '0')}`,
    })),
    evidence: {
      operatingSet: 'package-manifest.json',
      packageAdmission: 'portfolio.json',
      sourceLineage: 'lineage.json',
    },
    now: new Date(generatedAt),
  });
  writeFileSync(join(cwd, 'catalog.json'), JSON.stringify(catalog), 'utf8');
  writeFileSync(join(cwd, 'portfolio.json'), JSON.stringify(portfolio), 'utf8');
  writeFileSync(join(cwd, 'lineage.json'), JSON.stringify(lineage), 'utf8');
  return { catalog, portfolio, lineage };
}

test('package bin is wired to the executable CLI and help is available', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const result = run(['--help'], { cwd: PACKAGE_ROOT });

  assert.equal(manifest.bin.holosystem, 'bin/holosystem.mjs');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /holosystem create/u);
  assert.match(result.stdout, /holosystem inspect/u);
  assert.match(result.stdout, /holosystem catalog/u);
  assert.match(result.stdout, /holosystem lineage/u);
  assert.match(result.stdout, /holosystem farm/u);
  assert.match(result.stdout, /farm is proposal-only/u);
  assert.match(result.stdout, /holosystem source-canon/u);
  assert.match(result.stdout, /holosystem substrate/u);
  assert.match(result.stdout, /holosystem substrate-import/u);
});

test('farm emits action-ready and idle proposal-only receipts without applying work', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-farm-cli-'));
  try {
    writeFarmInputs(cwd);
    const actionReady = run(
      [
        'farm',
        '--catalog',
        'catalog.json',
        '--portfolio',
        'portfolio.json',
        '--lineage',
        'lineage.json',
        '--output',
        'farm.json',
        '--json',
      ],
      { cwd }
    );
    assert.equal(actionReady.status, 0, actionReady.stderr);
    const actionReceipt = JSON.parse(actionReady.stdout);
    assert.equal(actionReceipt.schema, HOLOSYSTEM_FARM_SCHEMA);
    assert.equal(actionReceipt.status, 'action-ready');
    assert.equal(actionReceipt.mode, 'propose-only');
    assert.equal(actionReceipt.accepted, false);
    assert.deepEqual(actionReceipt.changesApplied, []);
    assert.equal(actionReceipt.requiresAuthority, true);
    assert.equal(actionReceipt.nextWork.length, 1);
    assert.equal(actionReceipt.nextWork[0].requiresAuthority, true);
    assert.deepEqual(actionReceipt.sourceReceipts, [
      'catalog.json',
      'portfolio.json',
      'lineage.json',
    ]);
    assert.equal(actionReceipt.sourceReceiptBindings.catalog.source, 'catalog.json');
    assert.equal(actionReceipt.sourceReceiptBindings.portfolio.source, 'portfolio.json');
    assert.equal(actionReceipt.sourceReceiptBindings.lineage.source, 'lineage.json');
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, 'farm.json'), 'utf8')), actionReceipt);

    const overwrite = run(
      [
        'farm',
        '--catalog',
        'catalog.json',
        '--portfolio',
        'portfolio.json',
        '--lineage',
        'lineage.json',
        '--output',
        'farm.json',
        '--json',
      ],
      { cwd }
    );
    assert.equal(overwrite.status, 2);
    assert.match(overwrite.stderr, /already exists/u);

    const forced = run(
      [
        'farm',
        '--catalog',
        'catalog.json',
        '--portfolio',
        'portfolio.json',
        '--lineage',
        'lineage.json',
        '--output',
        'farm.json',
        '--force',
        '--json',
      ],
      { cwd }
    );
    assert.equal(forced.status, 0, forced.stderr);
    assert.equal(JSON.parse(forced.stdout).status, 'action-ready');

    writeFarmInputs(cwd, { idle: true });
    const idle = run(
      [
        'farm',
        '--catalog',
        'catalog.json',
        '--portfolio',
        'portfolio.json',
        '--lineage',
        'lineage.json',
        '--json',
      ],
      { cwd }
    );
    assert.equal(idle.status, 0, idle.stderr);
    const idleReceipt = JSON.parse(idle.stdout);
    assert.equal(idleReceipt.status, 'idle');
    assert.equal(idleReceipt.accepted, false);
    assert.deepEqual(idleReceipt.changesApplied, []);
    assert.equal(idleReceipt.requiresAuthority, true);
    assert.deepEqual(idleReceipt.nextWork, []);

    writeFarmInputs(cwd, { proofBatchCount: 25 });
    const blocked = run(
      [
        'farm',
        '--catalog',
        'catalog.json',
        '--portfolio',
        'portfolio.json',
        '--lineage',
        'lineage.json',
        '--json',
      ],
      { cwd }
    );
    assert.equal(blocked.status, 2, blocked.stderr);
    const blockedReceipt = JSON.parse(blocked.stdout);
    assert.equal(blockedReceipt.status, 'blocked');
    assert.equal(blockedReceipt.accepted, false);
    assert.deepEqual(blockedReceipt.changesApplied, []);
    assert.equal(blockedReceipt.requiresAuthority, true);
    assert.deepEqual(blockedReceipt.nextWork, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('farm rejects missing, unknown, malformed, wrong-schema, and inconsistent inputs', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-farm-cli-'));
  try {
    const fixtures = writeFarmInputs(cwd);
    const base = [
      'farm',
      '--catalog',
      'catalog.json',
      '--portfolio',
      'portfolio.json',
      '--lineage',
      'lineage.json',
      '--json',
    ];

    const missing = run(['farm', '--catalog', 'catalog.json', '--json'], { cwd });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /--portfolio is required/u);

    const unknown = run([...base, '--execute'], { cwd });
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Unknown option --execute/u);

    const originalCatalog = readFileSync(join(cwd, 'catalog.json'), 'utf8');
    for (const alias of ['catalog.json', './catalog.json']) {
      const unsafeOutput = run(
        [...base.slice(0, -1), '--output', alias, '--force', '--json'],
        { cwd }
      );
      assert.equal(unsafeOutput.status, 2);
      assert.match(unsafeOutput.stderr, /must not alias farm input/u);
      assert.equal(readFileSync(join(cwd, 'catalog.json'), 'utf8'), originalCatalog);
    }
    try {
      linkSync(join(cwd, 'catalog.json'), join(cwd, 'catalog-hardlink.json'));
      const hardlinkOutput = run(
        [...base.slice(0, -1), '--output', 'catalog-hardlink.json', '--force', '--json'],
        { cwd }
      );
      assert.equal(hardlinkOutput.status, 2);
      assert.match(hardlinkOutput.stderr, /must not alias farm input/u);
      assert.equal(readFileSync(join(cwd, 'catalog.json'), 'utf8'), originalCatalog);
      assert.equal(readFileSync(join(cwd, 'catalog-hardlink.json'), 'utf8'), originalCatalog);
    } catch (error) {
      if (!new Set(['EACCES', 'EINVAL', 'ENOSYS', 'ENOTSUP', 'EPERM', 'EXDEV']).has(error.code)) {
        throw error;
      }
      t.diagnostic(`Hardlink negative skipped: filesystem returned ${error.code}.`);
    }

    writeFileSync(join(cwd, 'catalog.json'), '{ malformed', 'utf8');
    const malformed = run(base, { cwd });
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /Cannot read proposal-only farm inputs/u);

    writeFileSync(
      join(cwd, 'catalog.json'),
      JSON.stringify(withReceiptHash({ ...fixtures.catalog, schema: 'wrong.catalog.v1' })),
      'utf8'
    );
    const wrongSchema = run(base, { cwd });
    assert.equal(wrongSchema.status, 2);
    assert.match(wrongSchema.stderr, /schema/iu);

    const inconsistent = structuredClone(fixtures.catalog);
    inconsistent.activity.nextWork.selected.name = '@example/detached';
    inconsistent.activity.nextWork.candidates[0].name = '@example/detached';
    inconsistent.activity.nextWork = withReceiptHash(inconsistent.activity.nextWork);
    writeFileSync(join(cwd, 'catalog.json'), JSON.stringify(withReceiptHash(inconsistent)), 'utf8');
    const detached = run(base, { cwd });
    assert.equal(detached.status, 2);
    assert.match(detached.stderr, /does not match canonical selection|inconsistent|decision/iu);

    const forceWithoutOutput = run([...base.slice(0, -1), '--force', '--json'], { cwd });
    assert.equal(forceWithoutOutput.status, 2);
    assert.match(forceWithoutOutput.stderr, /--force requires --output/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('source-canon blocks foreign tracked source and writes only a HoloScript projection', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-source-canon-cli-'));
  try {
    initializeRepository(cwd, {
      'HOLOSYSTEM.holo': 'composition "HoloSystem" {}\n',
      'status.mjs': 'export const status = "foreign";\n',
    });

    const blocked = run(['source-canon', '--output', 'source-canon.hsplus', '--json'], { cwd });
    assert.equal(blocked.status, 2, blocked.stderr);
    const report = JSON.parse(blocked.stdout);
    assert.equal(report.status, 'blocked');
    assert.equal(report.summary.holoScriptFiles, 1);
    assert.equal(report.summary.foreignFiles, 1);
    assert.match(readFileSync(join(cwd, 'source-canon.hsplus'), 'utf8'), /foreignFiles: 1/u);

    const wrongFormat = run(['source-canon', '--output', 'source-canon.json', '--json'], { cwd });
    assert.equal(wrongFormat.status, 2);
    assert.match(wrongFormat.stderr, /\.hsplus/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('source-canon verifies a HoloScript-only tracked repository', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-source-canon-cli-'));
  try {
    initializeRepository(cwd, {
      'HOLOSYSTEM.holo': 'composition "HoloSystem" {}\n',
      'runtime.hsplus': '@trait Runtime {}\n',
      'logic.hs': 'function ready() { return true }\n',
    });

    const verified = run(['source-canon', '--json'], { cwd });
    assert.equal(verified.status, 0, verified.stderr);
    const report = JSON.parse(verified.stdout);
    assert.equal(report.status, 'verified');
    assert.equal(report.verified, true);
    assert.equal(report.summary.foreignFiles, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('source-canon blocks foreign code disguised with a HoloScript extension', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-source-canon-cli-'));
  try {
    initializeRepository(cwd, {
      'status.hs': 'export const status = "foreign";\n',
    });

    const blocked = run(['source-canon', '--json'], { cwd });
    assert.equal(blocked.status, 2, blocked.stderr);
    const report = JSON.parse(blocked.stdout);
    assert.equal(report.summary.foreignFiles, 0);
    assert.equal(report.summary.parseFailed, 1);
    assert.ok(report.issues.some((issue) => issue.code === 'holoscript-source-invalid'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('substrate-import emits a lock-derived input that preserves closure gaps', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-substrate-import-cli-'));
  const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
  const lockfile = {
    name: 'demo-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'demo-app', version: '1.0.0', dependencies: { alpha: '1.0.0' } },
      'node_modules/alpha': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz',
        integrity,
      },
    },
  };
  const config = {
    root: {
      id: 'demo-app',
      custody: { mode: 'owned', owner: 'demo', trustDomain: 'demo-release' },
      source: { uri: 'https://github.com/example/demo', revision: 'demo-revision-1' },
    },
  };

  try {
    writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify(lockfile), 'utf8');
    writeFileSync(join(cwd, 'import-config.json'), JSON.stringify(config), 'utf8');
    const imported = run(
      [
        'substrate-import',
        '--lock',
        'package-lock.json',
        '--config',
        'import-config.json',
        '--output',
        'substrate-input.json',
        '--json',
      ],
      { cwd }
    );

    assert.equal(imported.status, 0, imported.stderr);
    const receipt = JSON.parse(imported.stdout);
    assert.equal(receipt.status, 'coverage-and-attestation-required');
    assert.equal(receipt.importable, true);
    assert.deepEqual(
      JSON.parse(readFileSync(join(cwd, 'substrate-input.json'), 'utf8')),
      receipt.input
    );

    const closed = run(['substrate', '--input', 'substrate-input.json', '--json'], { cwd });
    assert.equal(closed.status, 2, closed.stderr);
    assert.equal(JSON.parse(closed.stdout).ready, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('create writes a portable config and inspect emits an agent receipt', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-cli-'));
  try {
    const created = run(['create', '--id', 'contoso-founder', '--workspace', 'contoso', '--json'], {
      cwd,
    });
    assert.equal(created.status, 0, created.stderr);
    const createReceipt = JSON.parse(created.stdout);
    assert.equal(createReceipt.ok, true);

    const inspected = run(['inspect', 'holosystem.config.json', '--json'], { cwd });
    assert.equal(inspected.status, 0, inspected.stderr);
    const inspectReceipt = JSON.parse(inspected.stdout);
    assert.equal(inspectReceipt.operation, 'inspect');
    assert.equal(inspectReceipt.report.ready, true);
    assert.equal(inspectReceipt.report.summary.consumer.id, 'contoso-founder');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('create refuses accidental overwrite and inspect fails closed on invalid config', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-cli-'));
  try {
    assert.equal(run(['create'], { cwd }).status, 0);
    const overwrite = run(['create', '--json'], { cwd });
    assert.equal(overwrite.status, 1);
    assert.match(overwrite.stderr, /already exists/u);

    writeFileSync(
      join(cwd, 'invalid.json'),
      JSON.stringify({ schema: 'unknown', password: 'private-value-must-not-echo' }),
      'utf8'
    );
    const inspected = run(['inspect', 'invalid.json', '--json'], { cwd });
    assert.equal(inspected.status, 2);
    assert.doesNotMatch(inspected.stdout, /private-value-must-not-echo/u);
    const receipt = JSON.parse(inspected.stdout);
    assert.equal(receipt.ok, false);
    assert.ok(receipt.report.errors.some((error) => error.code === 'embedded-sensitive-field'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('inspect accepts a config over stdin for agent pipelines', () => {
  const created = run(['create', '--stdout'], { cwd: PACKAGE_ROOT });
  assert.equal(created.status, 0, created.stderr);

  const inspected = run(['inspect', '-', '--json'], {
    cwd: PACKAGE_ROOT,
    input: created.stdout,
  });
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.equal(JSON.parse(inspected.stdout).report.ready, true);
});

test('substrate writes a deterministic closure receipt and blocks unverifiable components', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-substrate-cli-'));
  const sha = `sha256:${'a'.repeat(64)}`;
  const builder = generateKeyPairSync('ed25519');
  const input = {
    root: 'holosystem',
    coverage: {
      includedLayers: ['runtime'],
      missingLayers: [],
    },
    verificationPolicy: {
      minimumIndependentRebuilds: 1,
      trustRoots: [
        {
          verifier: 'independent-builder',
          trustDomain: 'independent-builders',
          publicKey: builder.publicKey.export({ type: 'spki', format: 'pem' }),
        },
      ],
    },
    components: [
      {
        id: 'holosystem',
        kind: 'runtime',
        version: '1.0.0',
        custody: { mode: 'owned', owner: 'holoscript', trustDomain: 'holoscript-release' },
        source: { uri: 'holorepo://holoscript', revision: 'abc123' },
        artifact: { digest: sha },
        execution: { installScripts: 'none' },
        requires: [],
        verification: {
          rebuilds: [{ verifier: 'independent-builder', digest: sha, signature: '' }],
        },
      },
    ],
  };
  input.components[0].verification.rebuilds[0].signature = sign(
    null,
    Buffer.from(
      createRebuildAttestationPayload({
        verifier: 'independent-builder',
        component: input.components[0],
      })
    ),
    builder.privateKey
  ).toString('base64');

  try {
    writeFileSync(join(cwd, 'substrate.json'), JSON.stringify(input), 'utf8');
    const built = run(
      ['substrate', '--input', 'substrate.json', '--output', 'substrate-lock.json', '--json'],
      { cwd }
    );
    assert.equal(built.status, 0, built.stderr);
    const receipt = JSON.parse(built.stdout);
    assert.equal(receipt.schema, 'holoscript.holosystem.substrate.v1');
    assert.equal(receipt.ready, true);
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, 'substrate-lock.json'), 'utf8')), receipt);

    input.components[0].verification.rebuilds = [];
    writeFileSync(join(cwd, 'blocked.json'), JSON.stringify(input), 'utf8');
    const blocked = run(['substrate', '--input', 'blocked.json', '--json'], { cwd });
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.equal(JSON.parse(blocked.stdout).ready, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
