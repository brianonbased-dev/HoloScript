import { createHash } from 'node:crypto';

export const HOLOSYSTEM_CATALOG_SCHEMA = 'holoscript.holosystem.consumption-catalog.v1';
export const HOLOSYSTEM_LINEAGE_SCHEMA = 'holoscript.holosystem.source-lineage.v1';
export const HOLOSYSTEM_NEXT_WORK_SCHEMA = 'holoscript.holosystem.next-consumption-work.v1';
export const HOLOSYSTEM_CONSUMER_INPUT_SCHEMA = 'holoscript.holosystem.consumer-input.v1';
export const HOLOSYSTEM_FARM_SCHEMA = 'holosystem.self-improvement-farm.v2';

const HOLOSYSTEM_PORTFOLIO_SCHEMA = 'holosystem.portfolio-consumer-gate.v1';
const FARM_PROOF_BATCH_PROJECTION_CAP = 25;
const FARM_PROOF_BATCH_PACKAGE_PROJECTION_CAP = 100;
const FARM_NEXT_WORK_ID_MAX_LENGTH = 128;
const DEFAULT_FARM_SOURCE_RECEIPTS = Object.freeze({
  catalog: 'runtime/receipts/gates/consumption-surface-catalog-latest.json',
  portfolio: 'runtime/receipts/gates/portfolio-consumer-latest.json',
  lineage: 'runtime/receipts/gates/source-lineage-latest.json',
});

const STOP_CONDITIONS = [
  'authority-required',
  'validation-failed',
  'lease-expired',
  'spend-limit-reached',
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashReceipt(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
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

function hashStable(value) {
  return hashReceipt(stableValue(value));
}

function exactPublicVersion(value) {
  return (
    typeof value === 'string' &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value) &&
    !/^(?:file|workspace|link|portal|git|https?):/iu.test(value)
  );
}

function fullGitRevision(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{40}$/u.test(normalized) ? normalized : null;
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function inspectPublicDependencySpecs(dependencies = {}) {
  const packages = Object.entries(dependencies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => ({
      name,
      version,
      exactPublicVersion: exactPublicVersion(version),
    }));
  const issues = packages
    .filter((item) => !item.exactPublicVersion)
    .map((item) => ({
      code: 'dependency-not-exact-public-version',
      name: item.name,
      version: item.version,
    }));
  return {
    schema: HOLOSYSTEM_CONSUMER_INPUT_SCHEMA,
    ready: issues.length === 0,
    packages,
    issues,
  };
}

export function hashConsumerInput({ dependencies = {}, manifest = {}, requirements = [] }) {
  const dependencyInspection = inspectPublicDependencySpecs(dependencies);
  const normalized = {
    dependencies: dependencyInspection.packages.map(({ name, version }) => ({ name, version })),
    npm: list(manifest?.npm)
      .map((item) => ({
        name: item?.name || null,
        version: item?.version || null,
        integrity: item?.integrity || null,
        probeKind: item?.probe?.kind || 'import',
      }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name))),
    pypi: list(manifest?.pypi)
      .map((item) => ({
        name: item?.name || null,
        version: item?.version || null,
        hashes: list(item?.hashes).slice().sort(),
      }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name))),
    requirements: list(requirements).map(String).sort(),
  };
  return {
    schema: HOLOSYSTEM_CONSUMER_INPUT_SCHEMA,
    ready: dependencyInspection.ready,
    hash: hashReceipt(normalized),
    normalized,
    issues: dependencyInspection.issues,
  };
}

function artifactKey(ecosystem, name) {
  return `${String(ecosystem || '').toLowerCase()}:${String(name || '').toLowerCase()}`;
}

function farmNextWorkId(ecosystem, name) {
  const prefix = 'consume-';
  const suffix = createHash('sha256')
    .update(`${ecosystem}\0${name}`, 'utf8')
    .digest('hex');
  const maxSlugLength = FARM_NEXT_WORK_ID_MAX_LENGTH - prefix.length - suffix.length - 1;
  const readable = `${ecosystem}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[-._]+|[-._]+$/gu, '');
  const slug = readable.slice(0, maxSlugLength).replace(/[-._]+$/gu, '') || 'artifact';
  const id = `${prefix}${slug}-${suffix}`;
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(id) || id.length > FARM_NEXT_WORK_ID_MAX_LENGTH) {
    throw farmError('farm-next-work-id-invalid', 'Farm next-work identity could not be bounded.');
  }
  return id;
}

function portableDirectory(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  if (/^(?:[A-Za-z]:|\/|~\/)/u.test(normalized) || /(?:^|\/)\.\.(?:\/|$)/u.test(normalized)) {
    return null;
  }
  return normalized.replace(/\/$/u, '') || null;
}

export function normalizeRepositoryUrl(value) {
  const raw = typeof value === 'string' ? value : value?.url;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let normalized = raw.trim();
  normalized = normalized.replace(/^git\+/u, '');
  normalized = normalized.replace(/^git:\/\/github\.com\//u, 'https://github.com/');
  normalized = normalized.replace(/^git@github\.com:/u, 'https://github.com/');
  normalized = normalized.replace(/\.git\/?$/u, '');
  normalized = normalized.replace(/\/$/u, '');
  return /^https?:\/\//u.test(normalized) ? normalized : null;
}

function packageRail(portfolio, manifest, ecosystem, evidence) {
  const records = list(portfolio?.packages).filter((row) => row.ecosystem === ecosystem);
  const dogfoodNames = new Set(list(manifest?.[ecosystem]).map((row) => row.name));
  return {
    published: records.length,
    consumerReady: records.filter((row) => row.classification === 'passing').length,
    dogfooded: records.filter((row) => dogfoodNames.has(row.name)).length,
    gaps: records.filter((row) => row.classification !== 'passing').length,
    evidence,
  };
}

function countRail(items) {
  return {
    published: items.filter((item) => item.published).length,
    consumerReady: items.filter((item) => item.contractReady).length,
    gaps: items.filter((item) => item.published && !item.contractReady).length,
  };
}

function packageFailureCategories(portfolio) {
  const gaps = list(portfolio?.packages).filter((row) => row.classification !== 'passing');
  const issueCount = (prefix) =>
    gaps.filter((row) => list(row.issues).some((issue) => issue.startsWith(prefix))).length;
  return {
    total: gaps.length,
    missing: gaps.filter((row) => row.classification === 'missing').length,
    stale: gaps.filter((row) => row.classification === 'stale').length,
    failed: gaps.filter((row) => row.classification === 'failed').length,
    exactVersion: issueCount('exactVersion-'),
    integrity: issueCount('integrity-'),
    import: issueCount('import-'),
    readback: issueCount('readback-'),
  };
}

function projectProofBatches(value) {
  return list(value)
    .slice(-FARM_PROOF_BATCH_PROJECTION_CAP)
    .map((batch) => {
      const sourcePackages = list(batch?.packages);
      const packages = sourcePackages
        .slice(0, FARM_PROOF_BATCH_PACKAGE_PROJECTION_CAP)
        .map((item) =>
          typeof item === 'string'
            ? item
            : { ecosystem: item?.ecosystem || null, name: item?.name || null }
        );
      const declaredTotal = Number(
        batch?.summary?.total ?? batch?.packageCount ?? sourcePackages.length
      );
      const total = Number.isInteger(declaredTotal) && declaredTotal >= 0
        ? declaredTotal
        : sourcePackages.length;
      const declaredOmitted = Number(
        batch?.projection?.packagesOmitted ??
          batch?.bounds?.packagesOmitted ??
          batch?.packagesOmitted ??
          0
      );
      const packagesOmitted = Math.max(
        Number.isInteger(declaredOmitted) && declaredOmitted >= 0 ? declaredOmitted : 0,
        sourcePackages.length - packages.length,
        total - packages.length,
        0
      );
      return {
        id: typeof batch?.id === 'string' ? batch.id : null,
        status: typeof batch?.status === 'string' ? batch.status : 'unknown',
        generatedAt: typeof batch?.generatedAt === 'string' ? batch.generatedAt : null,
        packages,
        summary: {
          total,
          passing: Number(batch?.summary?.passing ?? batch?.passing) || 0,
          failed: Number(batch?.summary?.failed ?? batch?.failed) || 0,
        },
        projection: {
          packageCap: FARM_PROOF_BATCH_PACKAGE_PROJECTION_CAP,
          packagesEmitted: packages.length,
          packagesOmitted,
          atCap: packages.length === FARM_PROOF_BATCH_PACKAGE_PROJECTION_CAP,
          truncated:
            packagesOmitted > 0 ||
            batch?.projection?.truncated === true ||
            batch?.bounds?.truncated === true ||
            batch?.truncated === true,
        },
        receiptHash: typeof batch?.receiptHash === 'string' ? batch.receiptHash : null,
      };
    });
}

function projectPromotionHistory(value) {
  return list(value)
    .slice(-25)
    .map((attempt) => ({
      id: typeof attempt?.id === 'string' ? attempt.id : null,
      status: typeof attempt?.status === 'string' ? attempt.status : 'unknown',
      eligible: attempt?.eligible === true,
      generatedAt: typeof attempt?.generatedAt === 'string' ? attempt.generatedAt : null,
      receiptHash: typeof attempt?.receiptHash === 'string' ? attempt.receiptHash : null,
    }));
}

function catalogInputReceiptIdentity(receipt) {
  return {
    schema: typeof receipt?.schema === 'string' ? receipt.schema : null,
    generatedAt: typeof receipt?.generatedAt === 'string' ? receipt.generatedAt : null,
    receiptHash: typeof receipt?.receiptHash === 'string' ? receipt.receiptHash : null,
  };
}

export function buildSourceLineageReceipt({ portfolio, metadata = [], now = new Date() }) {
  const metadataByArtifact = new Map(
    list(metadata).map((item) => [artifactKey(item.ecosystem, item.name), item])
  );
  const directArtifacts = list(portfolio?.packages).map((row) => {
    const source = metadataByArtifact.get(artifactKey(row.ecosystem, row.name)) || {};
    const sourceRepository = normalizeRepositoryUrl(source.sourceRepository || source.repository);
    const deprecated =
      typeof source.deprecated === 'string' && source.deprecated.trim()
        ? source.deprecated.trim()
        : null;
    const successor =
      typeof source.successor === 'string' && source.successor.trim()
        ? source.successor.trim()
        : null;
    const migrationMapped = Boolean(deprecated && successor);
    return {
      ecosystem: row.ecosystem,
      name: row.name,
      version: row.expectedVersion || row.observedVersion || source.version || null,
      sourceRepository,
      sourceDirectory: portableDirectory(source.sourceDirectory || source.directory),
      registryStatus: Number.isInteger(source.registryStatus) ? source.registryStatus : null,
      registryError: source.registryError ? String(source.registryError).slice(0, 240) : null,
      integrity: typeof source.integrity === 'string' ? source.integrity : null,
      sourceRevision: typeof source.sourceRevision === 'string' ? source.sourceRevision : null,
      deprecated,
      successor,
      lineageKind: sourceRepository ? 'repository' : migrationMapped ? 'migration' : 'unknown',
      mapped: Boolean(sourceRepository) || migrationMapped,
    };
  });

  const cohortInputs = directArtifacts.map((artifact) => {
    const source = metadataByArtifact.get(artifactKey(artifact.ecosystem, artifact.name)) || {};
    const revision = fullGitRevision(artifact.sourceRevision);
    const exactVersionMatch =
      exactPublicVersion(artifact.version) &&
      typeof source.version === 'string' &&
      source.version === artifact.version;
    return {
      artifact,
      revision,
      eligible:
        artifact.ecosystem === 'npm' &&
        artifact.registryStatus === 200 &&
        Boolean(nonemptyString(artifact.integrity)) &&
        Boolean(revision) &&
        exactVersionMatch,
    };
  });

  const anchorsByRevision = new Map();
  for (const input of cohortInputs) {
    if (!input.eligible || input.artifact.lineageKind !== 'repository') continue;
    const repositories = anchorsByRevision.get(input.revision) || new Map();
    const anchors = repositories.get(input.artifact.sourceRepository) || [];
    anchors.push({
      ecosystem: input.artifact.ecosystem,
      name: input.artifact.name,
      version: input.artifact.version,
      integrity: input.artifact.integrity,
    });
    repositories.set(input.artifact.sourceRepository, anchors);
    anchorsByRevision.set(input.revision, repositories);
  }

  const artifacts = cohortInputs.map(({ artifact, eligible, revision }) => {
    if (!eligible || artifact.mapped) return artifact;
    const repositories = anchorsByRevision.get(revision);
    if (!repositories || repositories.size !== 1) return artifact;
    const [[repository, unsortedAnchors]] = repositories;
    const anchors = unsortedAnchors.slice().sort((left, right) => {
      const leftKey = `${left.ecosystem}\u0000${left.name}\u0000${left.version}\u0000${left.integrity}`;
      const rightKey = `${right.ecosystem}\u0000${right.name}\u0000${right.version}\u0000${right.integrity}`;
      return leftKey.localeCompare(rightKey);
    });
    return {
      ...artifact,
      sourceRepository: repository,
      sourceDirectory: null,
      lineageKind: 'revision-cohort',
      lineageEvidence: {
        kind: 'revision-cohort',
        revisionKind: 'npm.gitHead',
        revision,
        repository,
        anchors,
      },
      mapped: true,
    };
  });
  const mapped = artifacts.filter((artifact) => artifact.mapped).length;
  const byKind = {
    repository: artifacts.filter((artifact) => artifact.lineageKind === 'repository').length,
    'revision-cohort': artifacts.filter((artifact) => artifact.lineageKind === 'revision-cohort')
      .length,
    migration: artifacts.filter((artifact) => artifact.lineageKind === 'migration').length,
    unknown: artifacts.filter((artifact) => artifact.lineageKind === 'unknown').length,
  };
  const receipt = {
    schema: HOLOSYSTEM_LINEAGE_SCHEMA,
    generatedAt: now.toISOString(),
    status: mapped === artifacts.length ? 'complete' : 'partial',
    summary: {
      total: artifacts.length,
      mapped,
      gaps: artifacts.length - mapped,
      byKind,
    },
    artifacts,
    boundaries: {
      registryMetadataIsEvidence: true,
      localPathsForbidden: true,
      unknownLineageBlocksSourceClaims: true,
      deprecatedPackagesRequireNamedSuccessors: true,
      additiveSchema: true,
      lineageKindOpen: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}

function activeArtifactKeys(activeProofBatches) {
  const keys = new Set();
  for (const batch of list(activeProofBatches)) {
    if (!['running', 'claimed', 'queued'].includes(batch?.status)) continue;
    for (const item of list(batch.packages)) {
      if (typeof item === 'string') keys.add(item.toLowerCase());
      else keys.add(artifactKey(item?.ecosystem, item?.name));
    }
  }
  return keys;
}

export function selectNextConsumptionWork({
  portfolio,
  lineage,
  activeProofBatches = [],
  maxCandidates = 20,
  now = new Date(),
}) {
  const active = activeArtifactKeys(activeProofBatches);
  const sourceByArtifact = new Map(
    list(lineage?.artifacts).map((item) => [artifactKey(item.ecosystem, item.name), item])
  );
  const candidates = list(portfolio?.packages)
    .filter((row) => row.classification !== 'passing')
    .filter((row) => !active.has(artifactKey(row.ecosystem, row.name)))
    .map((row) => {
      const source = sourceByArtifact.get(artifactKey(row.ecosystem, row.name));
      const basePriority =
        row.classification === 'failed' ? 400 : row.classification === 'stale' ? 300 : 200;
      const priority = basePriority + (source?.mapped ? 0 : 25);
      return {
        ecosystem: row.ecosystem,
        name: row.name,
        version: row.expectedVersion || row.observedVersion || null,
        classification: row.classification,
        action:
          row.classification === 'failed'
            ? 'repair-consumer-contract'
            : row.classification === 'stale'
              ? 'refresh-cold-consumption'
              : 'prove-cold-consumption',
        priority,
        sourceRepository: source?.sourceRepository || null,
        reasons: [
          `classification:${row.classification}`,
          ...(source?.mapped ? [] : ['source-lineage-missing']),
          ...list(row.issues),
        ],
      };
    })
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        artifactKey(left.ecosystem, left.name).localeCompare(
          artifactKey(right.ecosystem, right.name)
        )
    )
    .slice(0, Math.max(1, Math.min(Number(maxCandidates) || 20, 100)));

  const receipt = {
    schema: HOLOSYSTEM_NEXT_WORK_SCHEMA,
    generatedAt: now.toISOString(),
    status: candidates.length > 0 ? 'action-ready' : 'idle',
    selected: candidates[0] || null,
    candidates,
    policy: {
      mode: 'bounded',
      maxCandidates: Math.max(1, Math.min(Number(maxCandidates) || 20, 100)),
      excludesActiveBatches: true,
      publishRequiresAuthority: true,
    },
    stopConditions: [...STOP_CONDITIONS],
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}

function farmError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function parseFarmNow(value) {
  const now = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(now.getTime())) {
    throw farmError('farm-now-invalid', 'Farm receipt time must be a valid date.');
  }
  return now;
}

function expectedInputReceiptHash(id, receipt) {
  const normalized = { ...receipt, generatedAt: null, receiptHash: undefined };
  return id === 'portfolio' ? hashStable(normalized) : hashReceipt(normalized);
}

function validateFarmInputReceipt(id, receipt, expectedSchema) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw farmError('farm-input-invalid', `Farm ${id} receipt must be an object.`);
  }
  if (receipt.schema !== expectedSchema) {
    throw farmError(
      'farm-input-schema-mismatch',
      `Farm ${id} receipt must use schema ${expectedSchema}.`
    );
  }
  if (typeof receipt.generatedAt !== 'string' || !Number.isFinite(Date.parse(receipt.generatedAt))) {
    throw farmError('farm-input-invalid', `Farm ${id} receipt generatedAt must be an ISO date.`);
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(receipt.receiptHash || '')) {
    throw farmError(
      'farm-input-receipt-hash-invalid',
      `Farm ${id} receipt must carry a sha256 receiptHash.`
    );
  }
  if (expectedInputReceiptHash(id, receipt) !== receipt.receiptHash) {
    throw farmError(
      'farm-input-receipt-hash-invalid',
      `Farm ${id} receiptHash does not match its content.`
    );
  }
  if (id === 'portfolio') {
    const serializedBytes = Buffer.byteLength(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    if (receipt.bounds?.serializedBytes !== serializedBytes) {
      throw farmError(
        'farm-input-receipt-hash-invalid',
        'Farm portfolio serialized byte count does not match its finalized content.'
      );
    }
  }
}

function validateFarmPortfolioInvariants(portfolio) {
  const total = portfolio.summary?.total;
  const emitted = portfolio.bounds?.packagesEmitted;
  const omitted = portfolio.bounds?.packagesOmitted;
  const findingsOmitted = portfolio.bounds?.findingsOmitted;
  const nonnegativeInteger = (value) => Number.isInteger(value) && value >= 0;
  const truncated = portfolio.bounds?.truncated;
  const expectedTruncated = omitted > 0 || findingsOmitted > 0;
  if (
    !nonnegativeInteger(total) ||
    !nonnegativeInteger(emitted) ||
    !nonnegativeInteger(omitted) ||
    !nonnegativeInteger(findingsOmitted) ||
    portfolio.packages.length !== emitted ||
    total !== emitted + omitted ||
    typeof truncated !== 'boolean' ||
    truncated !== expectedTruncated
  ) {
    throw farmError(
      'farm-portfolio-invariants-invalid',
      'Farm portfolio totals, emitted packages, omitted evidence, and truncation must agree.'
    );
  }
}

function validateFarmPortfolioRows(portfolio) {
  const classifications = new Set(['passing', 'failed', 'stale', 'missing']);
  portfolio.packages.forEach((row, index) => {
    const validRow = row && typeof row === 'object' && !Array.isArray(row);
    const validName =
      validRow &&
      typeof row.name === 'string' &&
      row.name.length > 0 &&
      row.name === row.name.trim();
    const validEcosystem = validRow && (row.ecosystem === 'npm' || row.ecosystem === 'pypi');
    const validClassification = validRow && classifications.has(row.classification);
    if (!validRow || !validName || !validEcosystem || !validClassification) {
      throw farmError(
        'farm-portfolio-row-invalid',
        `Farm portfolio package at index ${index} must have a trimmed name, an npm or pypi ecosystem, and a known classification.`
      );
    }
  });
}

function catalogInputReceiptBlockers(catalog, portfolio, lineage) {
  const bindings = catalog.inputReceipts;
  if (
    !bindings ||
    typeof bindings !== 'object' ||
    !bindings.portfolio ||
    !bindings.lineage ||
    typeof bindings.observedAt !== 'string'
  ) {
    return ['catalog-input-receipts-unbound'];
  }
  const matches = (bound, receipt) =>
    bound?.schema === receipt.schema &&
    bound?.generatedAt === receipt.generatedAt &&
    bound?.receiptHash === receipt.receiptHash;
  if (!matches(bindings.portfolio, portfolio) || !matches(bindings.lineage, lineage)) {
    return ['catalog-input-receipts-mismatch'];
  }
  const observedAt = Date.parse(bindings.observedAt);
  if (
    !Number.isFinite(observedAt) ||
    observedAt < Date.parse(bindings.portfolio.generatedAt) ||
    observedAt < Date.parse(bindings.lineage.generatedAt)
  ) {
    return ['catalog-evidence-sequence-invalid'];
  }
  return [];
}

function validateFarmSourceReceipts(sourceReceipts) {
  if (!sourceReceipts || typeof sourceReceipts !== 'object' || Array.isArray(sourceReceipts)) {
    throw farmError('farm-source-receipt-ref-invalid', 'Farm sourceReceipts must be an object.');
  }
  return Object.fromEntries(
    ['catalog', 'portfolio', 'lineage'].map((id) => {
      const value = sourceReceipts[id];
      if (typeof value !== 'string' || !value.trim()) {
        throw farmError(
          'farm-source-receipt-ref-invalid',
          `Farm sourceReceipts.${id} must be a non-empty path or reference.`
        );
      }
      return [id, value.trim()];
    })
  );
}

function farmInputBinding(source, receipt) {
  return {
    source,
    schema: receipt.schema,
    generatedAt: receipt.generatedAt,
    receiptHash: receipt.receiptHash,
    contentHash: hashStable(receipt),
  };
}

/**
 * Build a proposal-only self-improvement farm receipt from caller-owned evidence.
 * This function has no effects and confers no authority to execute its proposal.
 */
export function buildFarmProposalReceipt({
  catalog,
  portfolio,
  lineage,
  sourceReceipts = DEFAULT_FARM_SOURCE_RECEIPTS,
  now = new Date(),
}) {
  validateFarmInputReceipt('catalog', catalog, HOLOSYSTEM_CATALOG_SCHEMA);
  validateFarmInputReceipt('portfolio', portfolio, HOLOSYSTEM_PORTFOLIO_SCHEMA);
  validateFarmInputReceipt('lineage', lineage, HOLOSYSTEM_LINEAGE_SCHEMA);
  if (!Array.isArray(portfolio.packages)) {
    throw farmError('farm-input-invalid', 'Farm portfolio receipt packages must be an array.');
  }
  validateFarmPortfolioInvariants(portfolio);
  validateFarmPortfolioRows(portfolio);
  if (!Array.isArray(lineage.artifacts)) {
    throw farmError('farm-input-invalid', 'Farm lineage receipt artifacts must be an array.');
  }
  if (!catalog.activity || typeof catalog.activity !== 'object') {
    throw farmError('farm-input-invalid', 'Farm catalog receipt activity must be an object.');
  }
  if (!Array.isArray(catalog.activity.activeProofBatches)) {
    throw farmError(
      'farm-input-invalid',
      'Farm catalog activity.activeProofBatches must be an array.'
    );
  }

  const generatedAt = parseFarmNow(now).toISOString();
  const sources = validateFarmSourceReceipts(sourceReceipts);
  const embeddedProofBatches = catalog.activity.activeProofBatches;
  if (embeddedProofBatches.length > FARM_PROOF_BATCH_PROJECTION_CAP) {
    throw farmError(
      'farm-input-invalid',
      `Farm catalog cannot contain more than ${FARM_PROOF_BATCH_PROJECTION_CAP} proof batches.`
    );
  }
  const proofBatches = projectProofBatches(embeddedProofBatches);
  const proofBatchHistoryMayBeTruncated =
    embeddedProofBatches.length === FARM_PROOF_BATCH_PROJECTION_CAP;
  const proofBatchPackagesMayBeTruncated = proofBatches.some(
    (batch) =>
      batch.packages.length === FARM_PROOF_BATCH_PACKAGE_PROJECTION_CAP ||
      batch.summary.total > batch.packages.length ||
      batch.projection.packagesOmitted > 0 ||
      batch.projection.atCap === true ||
      batch.projection.truncated === true
  );
  const proofBatchProjectionAmbiguous =
    proofBatchHistoryMayBeTruncated || proofBatchPackagesMayBeTruncated;
  const catalogDecision = catalog.activity.nextWork;
  if (
    catalogDecision !== undefined &&
    catalogDecision !== null &&
    (typeof catalogDecision !== 'object' || Array.isArray(catalogDecision))
  ) {
    throw farmError('farm-catalog-decision-invalid', 'Farm catalog nextWork must be an object.');
  }

  const decisionNow = new Date(catalog.generatedAt);
  const maxCandidates = catalogDecision?.policy?.maxCandidates ?? 20;
  const canonicalDecision = selectNextConsumptionWork({
    portfolio,
    lineage,
    activeProofBatches: proofBatches,
    maxCandidates,
    now: decisionNow,
  });

  if (catalogDecision) {
    if (catalogDecision.schema !== HOLOSYSTEM_NEXT_WORK_SCHEMA) {
      throw farmError(
        'farm-catalog-decision-invalid',
        `Farm catalog nextWork must use schema ${HOLOSYSTEM_NEXT_WORK_SCHEMA}.`
      );
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(catalogDecision.receiptHash || '')) {
      throw farmError(
        'farm-catalog-decision-invalid',
        'Farm catalog nextWork must carry a sha256 receiptHash.'
      );
    }
    const embeddedHash = hashReceipt({
      ...catalogDecision,
      generatedAt: null,
      receiptHash: undefined,
    });
    if (embeddedHash !== catalogDecision.receiptHash) {
      throw farmError(
        'farm-catalog-decision-invalid',
        'Farm catalog nextWork receiptHash does not match its content.'
      );
    }
    if (
      !proofBatchProjectionAmbiguous &&
      catalogDecision.receiptHash !== canonicalDecision.receiptHash
    ) {
      throw farmError(
        'farm-catalog-decision-inconsistent',
        'Farm catalog nextWork does not match canonical selection from the bound inputs.'
      );
    }
  }

  const decision = clone(catalogDecision || canonicalDecision);
  const portfolioEvidenceTruncated =
    portfolio.bounds?.truncated === true ||
    portfolio.bounds.packagesOmitted > 0;
  const blockers = [
    ...(catalog.status === 'current' ? [] : ['catalog-not-current']),
    ...catalogInputReceiptBlockers(catalog, portfolio, lineage),
    ...(portfolioEvidenceTruncated ? ['portfolio-evidence-truncated'] : []),
    ...(proofBatchHistoryMayBeTruncated ? ['proof-batch-history-may-be-truncated'] : []),
    ...(proofBatchPackagesMayBeTruncated
      ? ['proof-batch-package-projection-may-be-truncated']
      : []),
  ];
  const status = blockers.length > 0 ? 'blocked' : canonicalDecision.status;
  if (!['action-ready', 'idle', 'blocked'].includes(status)) {
    throw farmError('farm-catalog-decision-invalid', `Unsupported farm decision status ${status}.`);
  }
  if (
    status === 'action-ready' &&
    (!['npm', 'pypi'].includes(canonicalDecision.selected?.ecosystem) ||
      typeof canonicalDecision.selected?.name !== 'string' ||
      !canonicalDecision.selected.name.trim() ||
      canonicalDecision.selected.name !== canonicalDecision.selected.name.trim())
  ) {
    throw farmError(
      'farm-catalog-decision-invalid',
      'Action-ready farm decision must select a named artifact.'
    );
  }

  const selected = status === 'action-ready' ? canonicalDecision.selected : null;
  const nextWork = selected
    ? [
        {
          id: farmNextWorkId(selected.ecosystem, selected.name),
          ...clone(selected),
          status: 'proposed',
          requiresAuthority: true,
          decisionReceiptHash: decision.receiptHash,
        },
      ]
    : [];
  const stopConditions = Array.from(
    new Set([...list(decision.stopConditions), ...blockers])
  );
  const sourceReceiptBindings = {
    catalog: farmInputBinding(sources.catalog, catalog),
    portfolio: farmInputBinding(sources.portfolio, portfolio),
    lineage: farmInputBinding(sources.lineage, lineage),
  };
  const receipt = {
    schema: HOLOSYSTEM_FARM_SCHEMA,
    generatedAt,
    status,
    mode: 'propose-only',
    publicFirst: true,
    requiresAuthority: true,
    stages: ['intake', 'benchmark', 'catalog', 'select-bounded-work', 'farm-next-work'],
    sourceReceipts: [sources.catalog, sources.portfolio, sources.lineage],
    sourceReceiptBindings,
    decision,
    decisionProof: {
      source: catalogDecision ? 'catalog.activity.nextWork' : 'canonical-recompute',
      catalogDecisionPresent: Boolean(catalogDecision),
      canonicalReceiptHash: canonicalDecision.receiptHash,
      equivalentToCanonicalSelection: !proofBatchProjectionAmbiguous,
      comparisonBlockedByProjection: proofBatchProjectionAmbiguous,
      activeStatusesExcluded: ['running', 'claimed', 'queued'],
    },
    proofBatches,
    accepted: false,
    changesApplied: [],
    nextWork,
    blockers,
    stopConditions,
    boundaries: {
      proposalOnly: true,
      executesTasks: false,
      acquiresAuthority: false,
      inputsContentAddressed: true,
      catalogInputReceiptsRequired: true,
      proofBatchProjectionCap: FARM_PROOF_BATCH_PROJECTION_CAP,
      proofBatchPackageProjectionCap: FARM_PROOF_BATCH_PACKAGE_PROJECTION_CAP,
    },
  };
  receipt.receiptHash = hashStable({ ...receipt, generatedAt: null, receiptHash: undefined });
  return receipt;
}

export function buildConsumptionSurfaceCatalog({
  seeds = {},
  manifest = {},
  portfolio = {},
  github = [],
  services = [],
  containers = [],
  mcpHealth = {},
  skills = { ok: false, count: 0 },
  lineage = null,
  activeProofBatches = [],
  promotionHistory = [],
  evidence = {},
  now = new Date(),
}) {
  const evidenceRefs = {
    operatingSet: evidence.operatingSet || 'package-manifest.json',
    packageAdmission: evidence.packageAdmission || 'portfolio-consumer.json',
    sourceLineage: evidence.sourceLineage || 'source-lineage.json',
  };
  const npm = packageRail(portfolio, manifest, 'npm', evidenceRefs.packageAdmission);
  const pypi = packageRail(portfolio, manifest, 'pypi', evidenceRefs.packageAdmission);
  const githubRail = countRail(github);
  const serviceRail = countRail(services);
  const containerRail = countRail(containers);
  const sourceAudit = seeds?.mcp?.sourceAudit || {};
  const deployedTools = Number(mcpHealth?.tools) || 0;
  const expectedProducts = list(seeds?.github?.products);
  const discoveryCurrent =
    portfolio?.scope?.registries?.npm?.declaredComplete === true &&
    portfolio?.scope?.registries?.pypi?.declaredComplete === true &&
    github.length === expectedProducts.length &&
    github.every((item) => item.published) &&
    skills.ok === true &&
    deployedTools > 0;
  const lineageSummary = lineage?.summary || {
    total: list(portfolio?.packages).length,
    mapped: 0,
    gaps: list(portfolio?.packages).length,
  };
  const findings = [];
  if (npm.gaps || pypi.gaps)
    findings.push({
      id: 'package-cold-consumption-gaps',
      severity: 'blocking',
      count: npm.gaps + pypi.gaps,
      evidence: evidenceRefs.packageAdmission,
    });
  if (lineageSummary.gaps)
    findings.push({
      id: 'package-source-lineage-gaps',
      severity: 'attention',
      count: lineageSummary.gaps,
      evidence: evidenceRefs.sourceLineage,
    });
  if (deployedTools !== Number(sourceAudit.tools || 0))
    findings.push({
      id: 'mcp-deploy-source-count-drift',
      severity: 'attention',
      deployedTools,
      sourceTools: Number(sourceAudit.tools || 0),
    });
  if (Number(sourceAudit.orphanTools || 0))
    findings.push({
      id: 'agent-tool-surface-gaps',
      severity: 'attention',
      orphanTools: Number(sourceAudit.orphanTools || 0),
      unbackedCoveredTools: Number(sourceAudit.unbackedCoveredTools || 0),
    });
  const nextWork = selectNextConsumptionWork({ portfolio, lineage, activeProofBatches, now });
  const projectedProofBatches = projectProofBatches(activeProofBatches);
  const projectedPromotionHistory = projectPromotionHistory(promotionHistory);
  const receipt = {
    schema: HOLOSYSTEM_CATALOG_SCHEMA,
    generatedAt: now.toISOString(),
    status: discoveryCurrent ? 'current' : 'incomplete-discovery',
    inputReceipts: {
      observedAt: now.toISOString(),
      portfolio: catalogInputReceiptIdentity(portfolio),
      lineage: catalogInputReceiptIdentity(lineage),
    },
    rule: 'Never collapse unlike artifacts into one total. Published, consumer-ready, and dogfooded are separate states on every rail.',
    rails: {
      npm,
      pypi,
      github: {
        ...githubRail,
        dogfooded: 0,
        evidence: 'public GitHub repository metadata plus README',
      },
      services: { ...serviceRail, dogfooded: null, evidence: 'public health endpoints' },
      containers: { ...containerRail, dogfooded: null, evidence: 'public container package pages' },
    },
    packageFailures: packageFailureCategories(portfolio),
    lineage: {
      ...lineageSummary,
      status: lineage?.status || 'unproven',
      evidence: evidenceRefs.sourceLineage,
      contract: {
        additiveSchema: lineage?.boundaries?.additiveSchema === true,
        lineageKindOpen: lineage?.boundaries?.lineageKindOpen === true,
      },
    },
    agentSurface: {
      deployedMcpTools: deployedTools,
      sourceMappedTools: Number(sourceAudit.tools || 0),
      sourceCoveredTools: Number(sourceAudit.coveredTools || 0),
      orphanTools: Number(sourceAudit.orphanTools || 0),
      unbackedCoveredTools: Number(sourceAudit.unbackedCoveredTools || 0),
      publicRoutes: Number(sourceAudit.routes || 0),
      publicSkills: Number(skills.count || 0),
      mcpVersion: mcpHealth?.version || null,
      evidence: 'public MCP health plus public repository tree and capability audit',
    },
    activity: {
      activeProofBatches: projectedProofBatches,
      promotionHistory: projectedPromotionHistory,
      nextWork,
    },
    items: { github: clone(github), services: clone(services), containers: clone(containers) },
    findings,
    boundaries: {
      ...evidenceRefs,
      noGrandTotal: true,
      privateSourceFoldersAreNotPublishedArtifacts: true,
      callerOwnsCredentialsAndPolicy: true,
      inputReceiptsIntegrityBound: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}

async function request(fetchImpl, url, { json = true } = {}) {
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: json ? 'application/json' : 'text/html,application/xhtml+xml',
        'user-agent': 'holoscript-holosystem-consumer/1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    let body = null;
    if (response.ok && json) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: null,
      error: String(error?.message || error).slice(0, 240),
    };
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  const count = Math.max(1, Math.min(Number(concurrency) || 6, 12, items.length || 1));
  await Promise.all(Array.from({ length: count }, () => runWorker()));
  return results;
}

function pypiRepository(info) {
  const urls = info?.project_urls || {};
  for (const key of ['Source', 'Source Code', 'Repository', 'Code', 'Homepage']) {
    const value = normalizeRepositoryUrl(urls[key]);
    if (value) return value;
  }
  return normalizeRepositoryUrl(info?.home_page);
}

function npmMigrationSuccessor(message) {
  if (typeof message !== 'string' || !message.trim()) return null;
  const match = message.match(
    /\buse\s+(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)\b/iu
  );
  return match?.[1] || null;
}

export async function discoverSourceLineage({
  portfolio,
  fetchImpl = globalThis.fetch,
  concurrency = 6,
  now = new Date(),
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const metadata = await mapConcurrent(list(portfolio?.packages), concurrency, async (artifact) => {
    const version = artifact.expectedVersion || artifact.observedVersion;
    if (artifact.ecosystem === 'npm') {
      const target = version
        ? `${encodeURIComponent(artifact.name)}/${encodeURIComponent(version)}`
        : encodeURIComponent(artifact.name);
      const response = await request(fetchImpl, `https://registry.npmjs.org/${target}`);
      return {
        ecosystem: 'npm',
        name: artifact.name,
        version: response.body?.version || version || null,
        sourceRepository: normalizeRepositoryUrl(response.body?.repository),
        sourceDirectory: portableDirectory(response.body?.repository?.directory),
        registryStatus: response.status,
        registryError: response.error || null,
        integrity: response.body?.dist?.integrity || null,
        sourceRevision: response.body?.gitHead || null,
        deprecated: typeof response.body?.deprecated === 'string' ? response.body.deprecated : null,
        successor: npmMigrationSuccessor(response.body?.deprecated),
      };
    }
    const suffix = version ? `/${encodeURIComponent(version)}` : '';
    const response = await request(
      fetchImpl,
      `https://pypi.org/pypi/${encodeURIComponent(artifact.name)}${suffix}/json`
    );
    const files = list(response.body?.urls);
    const digest = files.map((file) => file?.digests?.sha256).find(Boolean);
    return {
      ecosystem: 'pypi',
      name: artifact.name,
      version: response.body?.info?.version || version || null,
      sourceRepository: pypiRepository(response.body?.info),
      sourceDirectory: null,
      registryStatus: response.status,
      registryError: response.error || null,
      integrity: digest ? `sha256:${digest}` : null,
      sourceRevision: null,
    };
  });
  return buildSourceLineageReceipt({ portfolio, metadata, now });
}

export async function discoverConsumptionSurfaceCatalog({
  seeds,
  manifest,
  portfolio,
  lineage = null,
  activeProofBatches = [],
  promotionHistory = [],
  evidence = {},
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const github = await Promise.all(
    list(seeds?.github?.products).map(async (fullName) => {
      const [metadata, readme] = await Promise.all([
        request(fetchImpl, `https://api.github.com/repos/${fullName}`),
        request(fetchImpl, `https://api.github.com/repos/${fullName}/readme`),
      ]);
      const repository = metadata.body || {};
      const published = metadata.ok && repository.private === false;
      return {
        name: fullName,
        published,
        contractReady:
          published &&
          repository.archived !== true &&
          repository.fork !== true &&
          Boolean(repository.description) &&
          Boolean(repository.license?.spdx_id) &&
          readme.ok,
        defaultBranch: repository.default_branch || null,
        license: repository.license?.spdx_id || null,
        readme: readme.ok,
        archived: repository.archived === true,
        fork: repository.fork === true,
        url: repository.html_url || `https://github.com/${fullName}`,
      };
    })
  );
  const services = await Promise.all(
    list(seeds?.services).map(async (service) => {
      const probe = await request(fetchImpl, `${service.url}${service.health}`);
      return {
        name: service.name,
        url: service.url,
        health: service.health,
        published: true,
        contractReady: probe.ok,
        status: probe.status,
      };
    })
  );
  const containers = await Promise.all(
    list(seeds?.containers).map(async (container) => {
      const page = await request(
        fetchImpl,
        `https://github.com/users/${container.owner}/packages/container/package/${container.name}`,
        { json: false }
      );
      return {
        name: container.name,
        image: container.image,
        published: page.ok,
        contractReady: page.ok,
        status: page.status,
      };
    })
  );
  const [mcp, repository] = await Promise.all([
    request(fetchImpl, seeds?.mcp?.healthUrl),
    request(fetchImpl, `https://api.github.com/repos/${seeds?.mcp?.publicRepository}`),
  ]);
  const branch = repository.body?.default_branch || 'main';
  const tree = await request(
    fetchImpl,
    `https://api.github.com/repos/${seeds?.mcp?.publicRepository}/git/trees/${branch}?recursive=1`
  );
  const paths = list(tree.body?.tree).map((item) => item.path);
  const skills = {
    ok: repository.ok && tree.ok && tree.body?.truncated !== true,
    count: paths.filter((path) => /(?:^|\/)SKILL\.md$/u.test(path)).length,
    treeTruncated: tree.body?.truncated === true,
  };
  return buildConsumptionSurfaceCatalog({
    seeds,
    manifest,
    portfolio,
    github,
    services,
    containers,
    mcpHealth: mcp.body,
    skills,
    lineage,
    activeProofBatches,
    promotionHistory,
    evidence,
    now,
  });
}
