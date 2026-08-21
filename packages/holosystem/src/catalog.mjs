import { createHash } from 'node:crypto';

export const HOLOSYSTEM_CATALOG_SCHEMA = 'holoscript.holosystem.consumption-catalog.v1';
export const HOLOSYSTEM_LINEAGE_SCHEMA = 'holoscript.holosystem.source-lineage.v1';
export const HOLOSYSTEM_NEXT_WORK_SCHEMA = 'holoscript.holosystem.next-consumption-work.v1';
export const HOLOSYSTEM_CONSUMER_INPUT_SCHEMA = 'holoscript.holosystem.consumer-input.v1';
export const HOLOSYSTEM_FARM_SCHEMA = 'holosystem.self-improvement-farm.v2';

const HOLOSYSTEM_PORTFOLIO_SCHEMA = 'holosystem.portfolio-consumer-gate.v1';
const PACKAGE_SOURCE_RECONCILIATION_SCHEMA =
  'holosystem.package-source-lineage-reconciliation.v1';
const RECONCILIATION_DISPOSITIONS = new Set([
  'canonical-public-source',
  'deprecated-registry-artifact',
  'public-historical-deprecation',
  'public-package-alias',
  'public-release-manifest-binding',
  'public-manifest-identity-mismatch',
  'source-not-publicly-verifiable',
]);
const RESOLVED_RECONCILIATION_DISPOSITIONS = new Set([
  'canonical-public-source',
  'deprecated-registry-artifact',
  'public-historical-deprecation',
  'public-package-alias',
  'public-release-manifest-binding',
]);
const PYTHON_PUBLIC_VERSION_PATTERN =
  /^(?:([1-9][0-9]*)!)?((?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*)(?:(a|b|rc)([0-9]+))?(?:\.post([0-9]+))?(?:\.dev([0-9]+))?(?:\+([a-z0-9]+(?:[.-][a-z0-9]+)*))?$/u;
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
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
      value
    ) &&
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

function lineageInputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function reconciliationArtifactKey(ecosystem, name, version) {
  const normalizedEcosystem = String(ecosystem || '').trim().toLowerCase();
  const rawName = String(name || '').trim().toLowerCase();
  const normalizedName = normalizedEcosystem === 'pypi'
    ? rawName.replace(/[._-]+/gu, '-')
    : rawName;
  const rawVersion = String(version || '').trim();
  const normalizedVersion = normalizedEcosystem === 'pypi'
    ? canonicalPythonVersionKey(rawVersion) || rawVersion
    : rawVersion;
  return `${normalizedEcosystem}:${normalizedName}@${normalizedVersion}`;
}

function canonicalPythonVersionKey(version) {
  const match = typeof version === 'string' ? version.match(PYTHON_PUBLIC_VERSION_PATTERN) : null;
  if (!match) return null;
  const release = match[2].split('.');
  while (release.length > 1 && release.at(-1) === '0') release.pop();
  const epoch = match[1] ? `${match[1]}!` : '';
  const prerelease = match[3] ? `${match[3]}${BigInt(match[4])}` : '';
  const post = match[5] ? `.post${BigInt(match[5])}` : '';
  const dev = match[6] ? `.dev${BigInt(match[6])}` : '';
  const local = match[7] ? `+${match[7].replaceAll('-', '.')}` : '';
  return `${epoch}${release.join('.')}${prerelease}${post}${dev}${local}`;
}

function strictGitHubRepository(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'github.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      segments.length !== 2 ||
      segments.some((segment) => !/^[A-Za-z0-9_.-]+$/u.test(segment)) ||
      segments[1].toLowerCase().endsWith('.git')
    ) {
      return null;
    }
    return `https://github.com/${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

function exactPublicEvidenceUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['github.com', 'www.npmjs.com', 'pypi.org'].includes(url.hostname.toLowerCase())
    ) {
      return null;
    }
    return url.href.replace(/\/$/u, '');
  } catch {
    return null;
  }
}

function exactRegistryIntegrity(ecosystem, value) {
  if (ecosystem === 'npm') {
    if (typeof value !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
      return false;
    }
    const encoded = value.slice('sha512-'.length);
    try {
      const digest = Buffer.from(encoded, 'base64');
      return digest.length === 64 && digest.toString('base64') === encoded;
    } catch {
      return false;
    }
  }
  if (ecosystem === 'pypi') {
    return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
  }
  return false;
}

function exactIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function exactRegistryArtifactUrl(ecosystem, value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const expectedHost = ecosystem === 'npm' ? 'registry.npmjs.org' : 'files.pythonhosted.org';
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === expectedHost &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function expectedRegistryEvidenceUrl(ecosystem, name, version) {
  return ecosystem === 'npm'
    ? `https://www.npmjs.com/package/${name}/v/${version}`
    : `https://pypi.org/project/${name}/${version}`;
}

function exactRegistryBinding(ecosystem, name, version, registry) {
  const binding = registry?.integrityBinding;
  if (
    !binding ||
    binding.status !== 'registry-digest-match' ||
    binding.integrity !== registry.integrity ||
    binding.url !== registry.tarball ||
    !exactRegistryArtifactUrl(ecosystem, registry.tarball) ||
    exactPublicEvidenceUrl(registry.evidenceUrl) !==
      expectedRegistryEvidenceUrl(ecosystem, name, version)
  ) {
    return false;
  }
  if (ecosystem === 'npm') {
    const baseName = name.split('/').at(-1);
    return (
      registry.tarball === `https://registry.npmjs.org/${name}/-/${baseName}-${version}.tgz` &&
      binding.filename === null &&
      binding.packageType === 'npm-tarball'
    );
  }
  try {
    const filename = decodeURIComponent(new URL(registry.tarball).pathname.split('/').at(-1));
    if (typeof binding.filename !== 'string' || binding.filename !== filename) return false;
    const distribution = name.replaceAll('-', '_');
    if (binding.packageType === 'bdist_wheel') {
      const wheel = filename.match(/^([A-Za-z0-9_.]+)-([A-Za-z0-9.!+]+)(?:-[A-Za-z0-9_.]+)?-[A-Za-z0-9_.]+-[A-Za-z0-9_.]+-[A-Za-z0-9_.]+\.whl$/u);
      return Boolean(
        wheel &&
          wheel[1].toLowerCase().replace(/[._-]+/gu, '-') === name &&
          wheel[2].toLowerCase().replaceAll('_', '.') === version.toLowerCase()
      );
    }
    if (binding.packageType === 'sdist') {
      return [
        `${distribution}-${version}.tar.gz`,
        `${distribution}-${version}.zip`,
        `${name}-${version}.tar.gz`,
        `${name}-${version}.zip`,
      ].includes(filename);
    }
    return false;
  } catch {
    return false;
  }
}

function safeEvidenceText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 500 ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    /(?:^|[\s([{"'])(?:[A-Za-z]:[\\/]|file:\/\/|~[\\/])/iu.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function namedPackageSuccessor(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u.test(
    value
  )
    ? value
    : null;
}

function exactReconciliationIdentity(ecosystem, name, version) {
  if (
    typeof name !== 'string' ||
    typeof version !== 'string' ||
    name !== name.trim() ||
    version !== version.trim() ||
    name.length > 214 ||
    version.length > 128 ||
    /[\u0000-\u0020\u007f]/u.test(name) ||
    /[\u0000-\u0020\u007f]/u.test(version) ||
    /[\\/?#%]/u.test(version)
  ) {
    return false;
  }
  if (ecosystem === 'npm') {
    return namedPackageSuccessor(name) === name && exactPublicVersion(version);
  }
  return (
    ecosystem === 'pypi' &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(name) &&
    !/[._]/u.test(name) &&
    PYTHON_PUBLIC_VERSION_PATTERN.test(version)
  );
}

function exactPublicRepositoryPath(value, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (value === '.' && nullable) return null;
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    /[\\?#%\u0000-\u001f\u007f]/u.test(value)
  ) {
    return undefined;
  }
  const normalized = portableDirectory(value);
  return normalized === value ? normalized : undefined;
}

function exactInteger(value, expected, field) {
  if (!Number.isInteger(value) || value !== expected) {
    throw lineageInputError(
      'lineage-reconciliation-summary-invalid',
      `Reconciliation summary ${field} does not recompute from artifacts.`
    );
  }
}

function exactAdditiveInteger(value, expected, field) {
  if (value === undefined && expected === 0) return;
  exactInteger(value, expected, field);
}

function sameSortedStrings(value, expected) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return false;
  const actual = value.slice().sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && actual.every((item, index) => item === wanted[index]);
}

function normalizeReconciliationMetadata(receipt) {
  if (Array.isArray(receipt)) {
    return { items: receipt, reconciliation: null };
  }
  if (!receipt || typeof receipt !== 'object') {
    throw lineageInputError(
      'lineage-reconciliation-schema-invalid',
      `Lineage metadata must be an array or ${PACKAGE_SOURCE_RECONCILIATION_SCHEMA}.`
    );
  }
  receipt = clone(receipt);
  if (!receipt || typeof receipt !== 'object' || receipt.schema !== PACKAGE_SOURCE_RECONCILIATION_SCHEMA) {
    throw lineageInputError(
      'lineage-reconciliation-schema-invalid',
      `Lineage metadata must be an array or ${PACKAGE_SOURCE_RECONCILIATION_SCHEMA}.`
    );
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(receipt.receiptHash || '')) {
    throw lineageInputError(
      'lineage-reconciliation-hash-invalid',
      'Reconciliation receiptHash is missing or malformed.'
    );
  }
  if (!exactIsoTimestamp(receipt.generatedAt)) {
    throw lineageInputError(
      'lineage-reconciliation-generated-at-invalid',
      'Reconciliation generatedAt must be a canonical ISO timestamp.'
    );
  }
  const unsigned = clone(receipt);
  delete unsigned.receiptHash;
  if (hashReceipt(unsigned) !== receipt.receiptHash) {
    throw lineageInputError(
      'lineage-reconciliation-hash-invalid',
      'Reconciliation receiptHash does not match the supplied bytes.'
    );
  }
  if (!Array.isArray(receipt.artifacts) || !receipt.summary || typeof receipt.summary !== 'object') {
    throw lineageInputError(
      'lineage-reconciliation-shape-invalid',
      'Reconciliation artifacts and summary are required.'
    );
  }

  const seen = new Set();
  const publicEvidenceHashes = new Map();
  const publicManifestIdentities = new Map();
  const releaseEvidenceGroups = new Map();
  const projected = [];
  const unresolved = [];
  const counts = {
    canonical: 0,
    resolved: 0,
    deprecatedRegistry: 0,
    historicalDeprecation: 0,
    packageAlias: 0,
    releaseManifestBinding: 0,
    sourceNotPublic: 0,
  };
  const bindPublicEvidenceHash = (url, digest, artifactKey) => {
    const prior = publicEvidenceHashes.get(url);
    if (prior && prior !== digest) {
      throw lineageInputError(
        'lineage-reconciliation-evidence-conflict',
        `Public evidence ${url} has contradictory hashes, including ${artifactKey}.`
      );
    }
    publicEvidenceHashes.set(url, digest);
  };
  const bindPublicManifestIdentity = (url, identity, artifactKey) => {
    const prior = publicManifestIdentities.get(url);
    if (prior && prior !== identity) {
      throw lineageInputError(
        'lineage-reconciliation-evidence-conflict',
        `Public manifest ${url} has contradictory identities, including ${artifactKey}.`
      );
    }
    publicManifestIdentities.set(url, identity);
  };

  for (const artifact of receipt.artifacts) {
    const ecosystem = artifact?.ecosystem;
    const name = artifact?.name;
    const version = artifact?.version;
    if (
      !['npm', 'pypi'].includes(ecosystem) ||
      !exactReconciliationIdentity(ecosystem, name, version)
    ) {
      throw lineageInputError(
        'lineage-reconciliation-artifact-invalid',
        'Every reconciliation artifact requires a supported ecosystem, name, and version.'
      );
    }
    const key = reconciliationArtifactKey(ecosystem, name, version);
    const residualKey = `${ecosystem}:${name}@${version}`;
    if (seen.has(key)) {
      throw lineageInputError(
        'lineage-reconciliation-duplicate-artifact',
        `Reconciliation artifact ${key} is duplicated.`
      );
    }
    seen.add(key);

    const registry = artifact.registry;
    const source = artifact.source;
    const disposition = source?.disposition;
    const status = disposition?.status;
    if (
      !registry ||
      !source ||
      !RECONCILIATION_DISPOSITIONS.has(status) ||
      registry.status !== 200 ||
      !exactRegistryIntegrity(ecosystem, registry.integrity) ||
      !exactRegistryBinding(ecosystem, name, version, registry)
    ) {
      throw lineageInputError(
        'lineage-reconciliation-artifact-invalid',
        `Reconciliation artifact ${key} has invalid registry or disposition evidence.`
      );
    }

    let sourceRepository = null;
    let sourceDirectory = null;
    let sourceRevision = null;
    let lineageKind = 'unknown';
    let mapped = false;
    let canonical = false;
    let successor = null;
    const registrySuccessor = registry.successor === null || registry.successor === undefined
      ? null
      : namedPackageSuccessor(registry.successor);
    if (registry.successor !== null && registry.successor !== undefined && !registrySuccessor) {
      throw lineageInputError(
        'lineage-reconciliation-successor-invalid',
        `Registry successor for ${key} is malformed.`
      );
    }
    if (ecosystem === 'npm' && registrySuccessor === name) {
      throw lineageInputError(
        'lineage-reconciliation-successor-invalid',
        `Registry successor for ${key} cannot name the same package.`
      );
    }
    let deprecated = safeEvidenceText(registry.deprecated);
    if (registry.deprecated !== null && registry.deprecated !== undefined && !deprecated) {
      throw lineageInputError(
        'lineage-reconciliation-disposition-invalid',
        `Registry deprecation for ${key} is malformed.`
      );
    }
    let dispositionRepository = null;
    let dispositionRevision = null;
    let dispositionEvidenceUrl = exactPublicEvidenceUrl(disposition.evidenceUrl);
    let dispositionReason = safeEvidenceText(disposition.reason);
    let dispositionDetails = {};

    if (status === 'canonical-public-source') {
      sourceRepository = strictGitHubRepository(source.repository);
      sourceRevision = fullGitRevision(source.revision);
      sourceDirectory = exactPublicRepositoryPath(source.directory, { nullable: true });
      const manifestPath = exactPublicRepositoryPath(source.manifestPath);
      const manifestFilename = ecosystem === 'npm' ? 'package.json' : 'pyproject.toml';
      const expectedManifestPath = sourceDirectory
        ? `${sourceDirectory}/${manifestFilename}`
        : manifestFilename;
      const expectedEvidenceUrl =
        sourceRepository && sourceRevision && manifestPath
          ? `${sourceRepository}/blob/${sourceRevision}/${manifestPath}`
          : null;
      if (
        source.canonical !== true ||
        !sourceRepository ||
        !sourceRevision ||
        sourceDirectory === undefined ||
        !manifestPath ||
        manifestPath !== expectedManifestPath ||
        !/^sha256:[0-9a-f]{64}$/u.test(source.manifestSha256 || '') ||
        !['public-git-exact-manifest', 'public-git-exact-manifest-verified'].includes(
          source.evidenceKind
        ) ||
        source.evidenceUrl !== expectedEvidenceUrl ||
        disposition.evidenceUrl !== expectedEvidenceUrl
      ) {
        throw lineageInputError(
          'lineage-reconciliation-canonical-proof-invalid',
          `Canonical proof for ${key} is incomplete or non-public.`
        );
      }
      lineageKind = 'repository';
      bindPublicEvidenceHash(expectedEvidenceUrl, source.manifestSha256, key);
      bindPublicManifestIdentity(expectedEvidenceUrl, key, key);
      mapped = true;
      canonical = true;
      successor = registrySuccessor;
      counts.canonical += 1;
    } else if (RESOLVED_RECONCILIATION_DISPOSITIONS.has(status)) {
      if (
        source.canonical !== false ||
        source.evidenceKind !== 'unmapped' ||
        source.repository !== null ||
        source.directory !== null ||
        source.revision !== null ||
        source.owner !== null ||
        source.evidenceUrl !== null ||
        source.manifestPath !== null ||
        source.manifestSha256 !== null
      ) {
        throw lineageInputError(
          'lineage-reconciliation-disposition-invalid',
          `Noncanonical disposition ${status} for ${key} cannot claim canonical source.`
        );
      }
      const dispositionSuccessor = disposition.successor === null || disposition.successor === undefined
        ? null
        : namedPackageSuccessor(disposition.successor);
      if (
        (registry.successor !== null && registry.successor !== undefined && !registrySuccessor) ||
        (disposition.successor !== null && disposition.successor !== undefined && !dispositionSuccessor) ||
        (registrySuccessor && dispositionSuccessor && registrySuccessor !== dispositionSuccessor)
      ) {
        throw lineageInputError(
          'lineage-reconciliation-successor-invalid',
          `Disposition successor for ${key} is malformed or contradictory.`
        );
      }
      successor = registrySuccessor || dispositionSuccessor;
      if (ecosystem === 'npm' && successor === name) {
        throw lineageInputError(
          'lineage-reconciliation-successor-invalid',
          `Disposition successor for ${key} cannot name the same package.`
        );
      }
      if (status === 'deprecated-registry-artifact') {
        if (
          !deprecated ||
          dispositionEvidenceUrl !== expectedRegistryEvidenceUrl(ecosystem, name, version)
        ) {
          throw lineageInputError(
            'lineage-reconciliation-disposition-invalid',
            `Registry retirement for ${key} lacks public deprecation evidence.`
          );
        }
        counts.deprecatedRegistry += 1;
        lineageKind = successor ? 'migration' : 'retirement';
      } else if (status === 'public-historical-deprecation') {
        dispositionRepository = strictGitHubRepository(disposition.repository);
        dispositionRevision = fullGitRevision(disposition.revision);
        const evidencePath = disposition.evidencePath === null || disposition.evidencePath === undefined
          ? null
          : exactPublicRepositoryPath(disposition.evidencePath);
        const evidenceSha256 = disposition.evidenceSha256 === null || disposition.evidenceSha256 === undefined
          ? null
          : disposition.evidenceSha256;
        const expectedEvidenceUrl = dispositionRepository && dispositionRevision
          ? evidencePath
            ? `${dispositionRepository}/blob/${dispositionRevision}/${evidencePath}`
            : `${dispositionRepository}/commit/${dispositionRevision}`
          : null;
        if (
          !dispositionRepository ||
          !dispositionRevision ||
          evidencePath === undefined ||
          (evidencePath ? !/^sha256:[0-9a-f]{64}$/u.test(evidenceSha256 || '') : evidenceSha256 !== null) ||
          disposition.evidenceUrl !== expectedEvidenceUrl ||
          dispositionEvidenceUrl !== expectedEvidenceUrl ||
          !dispositionReason
        ) {
          throw lineageInputError(
            'lineage-reconciliation-disposition-invalid',
            `Historical retirement for ${key} lacks exact public commit evidence.`
          );
        }
        deprecated = dispositionReason;
        if (evidencePath) {
          bindPublicEvidenceHash(expectedEvidenceUrl, evidenceSha256, key);
        }
        counts.historicalDeprecation += 1;
        lineageKind = successor ? 'migration' : 'retirement';
        dispositionDetails = { evidencePath, evidenceSha256 };
      } else if (status === 'public-package-alias') {
        dispositionRepository = strictGitHubRepository(disposition.repository);
        dispositionRevision = fullGitRevision(disposition.revision);
        const evidencePath = exactPublicRepositoryPath(disposition.evidencePath);
        const sourceDirectory = exactPublicRepositoryPath(disposition.sourceDirectory);
        const implementationManifestPath = exactPublicRepositoryPath(disposition.implementationManifestPath);
        const aliasOf = namedPackageSuccessor(disposition.aliasOf);
        const implementationName = namedPackageSuccessor(disposition.implementationName);
        const expectedEvidenceUrl = dispositionRepository && dispositionRevision && evidencePath
          ? `${dispositionRepository}/blob/${dispositionRevision}/${evidencePath}`
          : null;
        if (
          ecosystem !== 'npm' ||
          !dispositionRepository ||
          !dispositionRevision ||
          !evidencePath ||
          !/^sha256:[0-9a-f]{64}$/u.test(disposition.evidenceSha256 || '') ||
          disposition.evidenceUrl !== expectedEvidenceUrl ||
          dispositionEvidenceUrl !== expectedEvidenceUrl ||
          !dispositionReason ||
          !aliasOf ||
          aliasOf === name ||
          !sourceDirectory ||
          implementationManifestPath !== `${sourceDirectory}/package.json` ||
          implementationManifestPath === evidencePath ||
          !/^sha256:[0-9a-f]{64}$/u.test(disposition.implementationManifestSha256 || '') ||
          disposition.implementationManifestSha256 === disposition.evidenceSha256 ||
          !implementationName ||
          implementationName !== aliasOf ||
          !exactPublicVersion(disposition.implementationVersion) ||
          disposition.parityClaimed !== false ||
          successor !== null ||
          deprecated !== null
        ) {
          throw lineageInputError(
            'lineage-reconciliation-disposition-invalid',
            `Package alias for ${key} lacks exact noncanonical public evidence.`
          );
        }
        counts.packageAlias += 1;
        bindPublicEvidenceHash(expectedEvidenceUrl, disposition.evidenceSha256, key);
        bindPublicEvidenceHash(
          `${dispositionRepository}/blob/${dispositionRevision}/${implementationManifestPath}`,
          disposition.implementationManifestSha256,
          key
        );
        bindPublicManifestIdentity(
          `${dispositionRepository}/blob/${dispositionRevision}/${implementationManifestPath}`,
          `npm:${implementationName}@${disposition.implementationVersion}`,
          key
        );
        lineageKind = 'alias';
        dispositionDetails = {
          evidencePath,
          evidenceSha256: disposition.evidenceSha256,
          aliasOf,
          sourceDirectory,
          implementationManifestPath,
          implementationManifestSha256: disposition.implementationManifestSha256,
          implementationName,
          implementationVersion: disposition.implementationVersion,
          parityClaimed: false,
        };
      } else if (status === 'public-release-manifest-binding') {
        dispositionRepository = strictGitHubRepository(disposition.repository);
        dispositionRevision = fullGitRevision(disposition.revision);
        const manifestPath = exactPublicRepositoryPath(disposition.manifestPath);
        const readbackPath = exactPublicRepositoryPath(disposition.publicReadbackReceiptPath);
        const sourceCommit = fullGitRevision(disposition.sourceCommit);
        const candidateCommit = fullGitRevision(disposition.candidateCommit);
        const expectedEvidenceUrl = dispositionRepository && dispositionRevision && manifestPath
          ? `${dispositionRepository}/blob/${dispositionRevision}/${manifestPath}`
          : null;
        const expectedReadbackUrl = dispositionRepository && dispositionRevision && readbackPath
          ? `${dispositionRepository}/blob/${dispositionRevision}/${readbackPath}`
          : null;
        const packageBinding = disposition.package;
        if (
          ecosystem !== 'npm' ||
          !dispositionRepository ||
          !dispositionRevision ||
          !manifestPath ||
          !/^sha256:[0-9a-f]{64}$/u.test(disposition.manifestSha256 || '') ||
          disposition.evidenceUrl !== expectedEvidenceUrl ||
          dispositionEvidenceUrl !== expectedEvidenceUrl ||
          !readbackPath ||
          readbackPath === manifestPath ||
          !/^sha256:[0-9a-f]{64}$/u.test(disposition.publicReadbackReceiptSha256 || '') ||
          disposition.publicReadbackReceiptSha256 === disposition.manifestSha256 ||
          disposition.publicReadbackEvidenceUrl !== expectedReadbackUrl ||
          exactPublicEvidenceUrl(disposition.publicReadbackEvidenceUrl) !== expectedReadbackUrl ||
          !sourceCommit ||
          !candidateCommit ||
          sourceCommit === candidateCommit ||
          dispositionRevision === sourceCommit ||
          dispositionRevision === candidateCommit ||
          !dispositionReason ||
          packageBinding?.name !== name ||
          packageBinding?.version !== version ||
          packageBinding?.integrity !== registry.integrity ||
          packageBinding?.tarballUrl !== registry.tarball ||
          !/^[0-9a-f]{40}$/u.test(packageBinding?.shasum || '') ||
          successor !== null ||
          deprecated !== null
        ) {
          throw lineageInputError(
            'lineage-reconciliation-disposition-invalid',
            `Release-manifest binding for ${key} lacks exact noncanonical public evidence.`
          );
        }
        const releaseGroup = JSON.stringify({
          repository: dispositionRepository,
          revision: dispositionRevision,
          manifestPath,
          manifestSha256: disposition.manifestSha256,
          publicReadbackReceiptPath: readbackPath,
          publicReadbackReceiptSha256: disposition.publicReadbackReceiptSha256,
          publicReadbackEvidenceUrl: expectedReadbackUrl,
          sourceCommit,
          candidateCommit,
        });
        const priorReleaseGroup = releaseEvidenceGroups.get(expectedEvidenceUrl);
        if (priorReleaseGroup && priorReleaseGroup !== releaseGroup) {
          throw lineageInputError(
            'lineage-reconciliation-evidence-conflict',
            `Release evidence ${expectedEvidenceUrl} has contradictory shared fields.`
          );
        }
        releaseEvidenceGroups.set(expectedEvidenceUrl, releaseGroup);
        counts.releaseManifestBinding += 1;
        bindPublicEvidenceHash(expectedEvidenceUrl, disposition.manifestSha256, key);
        bindPublicEvidenceHash(
          expectedReadbackUrl,
          disposition.publicReadbackReceiptSha256,
          key
        );
        lineageKind = 'release-manifest';
        dispositionDetails = {
          manifestPath,
          manifestSha256: disposition.manifestSha256,
          publicReadbackReceiptPath: readbackPath,
          publicReadbackReceiptSha256: disposition.publicReadbackReceiptSha256,
          publicReadbackEvidenceUrl: expectedReadbackUrl,
          sourceCommit,
          candidateCommit,
          package: {
            name,
            version,
            integrity: packageBinding.integrity,
            tarballUrl: packageBinding.tarballUrl,
            shasum: packageBinding.shasum,
          },
        };
      }
      mapped = true;
    } else {
      if (
        source.canonical !== false ||
        source.evidenceKind !== 'unmapped' ||
        source.repository !== null ||
        source.directory !== null ||
        source.revision !== null ||
        source.owner !== null ||
        source.evidenceUrl !== null ||
        source.manifestPath !== null ||
        source.manifestSha256 !== null
      ) {
        throw lineageInputError(
          'lineage-reconciliation-disposition-invalid',
          `Unresolved disposition ${status} for ${key} cannot claim canonical source.`
        );
      }
      if (status === 'source-not-publicly-verifiable') counts.sourceNotPublic += 1;
      unresolved.push(residualKey);
    }

    if (mapped) counts.resolved += 1;
    projected.push({
      ecosystem,
      name,
      version,
      sourceRepository,
      sourceDirectory,
      registryStatus: registry.status,
      registryError: null,
      integrity: registry.integrity,
      sourceRevision,
      deprecated,
      successor,
      lineageKind,
      mapped,
      canonical,
      lineageEvidence: {
        kind: 'package-source-lineage-reconciliation',
        sourceReceiptSchema: receipt.schema,
        sourceReceiptHash: receipt.receiptHash,
        disposition: {
          status,
          evidenceUrl: dispositionEvidenceUrl,
          repository: dispositionRepository,
          revision: dispositionRevision,
          reason: dispositionReason,
          successor,
          ...dispositionDetails,
        },
        evidenceKind: source.evidenceKind,
        manifestSha256: source.manifestSha256 || null,
      },
    });
  }

  const total = projected.length;
  exactInteger(receipt.summary.total, total, 'total');
  exactInteger(receipt.summary.sourceMapped, counts.canonical, 'sourceMapped');
  exactInteger(receipt.summary.sourceUnmapped, total - counts.canonical, 'sourceUnmapped');
  exactInteger(receipt.summary.sourceLineageResolved, counts.resolved, 'sourceLineageResolved');
  exactInteger(
    receipt.summary.sourceLineageUnresolved,
    total - counts.resolved,
    'sourceLineageUnresolved'
  );
  exactInteger(
    receipt.summary.deprecatedRegistryDisposition,
    counts.deprecatedRegistry,
    'deprecatedRegistryDisposition'
  );
  exactInteger(
    receipt.summary.publicHistoricalDeprecation,
    counts.historicalDeprecation,
    'publicHistoricalDeprecation'
  );
  exactAdditiveInteger(
    receipt.summary.publicPackageAlias,
    counts.packageAlias,
    'publicPackageAlias'
  );
  exactAdditiveInteger(
    receipt.summary.publicReleaseManifestBinding,
    counts.releaseManifestBinding,
    'publicReleaseManifestBinding'
  );
  exactInteger(
    receipt.summary.sourceNotPubliclyVerifiable,
    counts.sourceNotPublic,
    'sourceNotPubliclyVerifiable'
  );
  if (!sameSortedStrings(receipt.summary.residuals?.['canonical-source'], unresolved)) {
    throw lineageInputError(
      'lineage-reconciliation-residuals-invalid',
      'Canonical-source residual membership does not match unresolved artifacts.'
    );
  }
  const expectedStatus = unresolved.length === 0 ? 'complete' : 'partial';
  if (receipt.status !== expectedStatus) {
    throw lineageInputError(
      'lineage-reconciliation-status-invalid',
      `Reconciliation status must be ${expectedStatus}.`
    );
  }

  return {
    items: projected,
    reconciliation: {
      schema: receipt.schema,
      generatedAt: typeof receipt.generatedAt === 'string' ? receipt.generatedAt : null,
      receiptHash: receipt.receiptHash,
      artifactKeys: seen,
    },
  };
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
  const normalizedMetadata = normalizeReconciliationMetadata(metadata);
  const reconciliation = normalizedMetadata.reconciliation;
  const portfolioKeys = new Set();
  if (reconciliation) {
    for (const row of list(portfolio?.packages)) {
      const version = row.expectedVersion || row.observedVersion;
      if (!exactReconciliationIdentity(row.ecosystem, row.name, version)) {
        throw lineageInputError(
          'lineage-reconciliation-portfolio-mismatch',
          'Portfolio identities and versions must be canonical public package identities.'
        );
      }
      const key = reconciliationArtifactKey(row.ecosystem, row.name, version);
      if (portfolioKeys.has(key)) {
        throw lineageInputError(
          'lineage-reconciliation-duplicate-portfolio-artifact',
          `Portfolio artifact ${key} is duplicated.`
        );
      }
      portfolioKeys.add(key);
    }
    if (
      portfolioKeys.size !== reconciliation.artifactKeys.size ||
      [...portfolioKeys].some((key) => !reconciliation.artifactKeys.has(key))
    ) {
      throw lineageInputError(
        'lineage-reconciliation-portfolio-mismatch',
        'Portfolio identities and versions must exactly match the reconciliation receipt.'
      );
    }
  }
  const metadataByArtifact = new Map(
    normalizedMetadata.items.map((item) => [
      reconciliation
        ? reconciliationArtifactKey(item.ecosystem, item.name, item.version)
        : artifactKey(item.ecosystem, item.name),
      item,
    ])
  );
  const directArtifacts = list(portfolio?.packages).map((row) => {
    const requestedVersion = row.expectedVersion || row.observedVersion || null;
    const source = metadataByArtifact.get(
      reconciliation
        ? reconciliationArtifactKey(row.ecosystem, row.name, requestedVersion)
        : artifactKey(row.ecosystem, row.name)
    ) || {};
    const version = requestedVersion || source.version || null;
    if (reconciliation && source.version !== version) {
      throw lineageInputError(
        'lineage-reconciliation-portfolio-mismatch',
        `Portfolio version for ${artifactKey(row.ecosystem, row.name)} does not match its proof.`
      );
    }
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
      ecosystem: reconciliation ? source.ecosystem : row.ecosystem,
      name: reconciliation ? source.name : row.name,
      version,
      sourceRepository,
      sourceDirectory: portableDirectory(source.sourceDirectory || source.directory),
      registryStatus: Number.isInteger(source.registryStatus) ? source.registryStatus : null,
      registryError: source.registryError ? String(source.registryError).slice(0, 240) : null,
      integrity: typeof source.integrity === 'string' ? source.integrity : null,
      sourceRevision: typeof source.sourceRevision === 'string' ? source.sourceRevision : null,
      deprecated,
      successor,
      lineageKind: reconciliation
        ? source.lineageKind
        : sourceRepository
          ? 'repository'
          : migrationMapped
            ? 'migration'
            : 'unknown',
      mapped: reconciliation ? source.mapped === true : Boolean(sourceRepository) || migrationMapped,
      ...(reconciliation
        ? {
            canonical: source.canonical === true,
            lineageEvidence: clone(source.lineageEvidence),
          }
        : {}),
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
        !reconciliation &&
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
  const retirement = artifacts.filter((artifact) => artifact.lineageKind === 'retirement').length;
  if (retirement > 0) byKind.retirement = retirement;
  const alias = artifacts.filter((artifact) => artifact.lineageKind === 'alias').length;
  if (alias > 0) byKind.alias = alias;
  const releaseManifest = artifacts.filter(
    (artifact) => artifact.lineageKind === 'release-manifest'
  ).length;
  if (releaseManifest > 0) byKind['release-manifest'] = releaseManifest;
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
    ...(reconciliation
      ? {
          sourceReceipt: {
            schema: reconciliation.schema,
            generatedAt: reconciliation.generatedAt,
            receiptHash: reconciliation.receiptHash,
          },
        }
      : {}),
    boundaries: {
      registryMetadataIsEvidence: true,
      localPathsForbidden: true,
      unknownLineageBlocksSourceClaims: true,
      deprecatedPackagesRequireNamedSuccessors: !reconciliation,
      ...(reconciliation
        ? {
            migrationClaimsRequireNamedSuccessors: true,
            typedRetirementsMayResolveWithoutSuccessor: true,
            typedAliasesDoNotProveParity: true,
            releaseManifestBindingsAreNoncanonical: true,
            sourceReceiptRequiresIndependentPinning: true,
            remoteEvidenceInheritedNotRefetched: true,
          }
        : {}),
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
  const scoped = message.match(
    /\buse\s+(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)\b/iu
  )?.[1];
  if (namedPackageSuccessor(scoped)) return scoped;
  const quotedBare = message.match(
    /\buse\s+[`'"]([a-z0-9][a-z0-9._-]*)[`'"]/iu
  )?.[1];
  return namedPackageSuccessor(quotedBare);
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
