import { createHash, createPublicKey } from 'node:crypto';

export const HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA = 'holoscript.holosystem.substrate-import.v1';

const PORTABLE_SOURCE_PATTERN = /^(?:git\+https|https|holorepo|npm):\/\//u;
const FLOATING_VERSION_PATTERN =
  /(?:^|[\s:])(?:latest|main|master|next|workspace|file|link|portal|git|https?)(?:$|[\s:])|[*^~<>=|]/iu;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function issue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function validId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(value);
}

function pinnedVersion(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 160 &&
    !FLOATING_VERSION_PATTERN.test(value)
  );
}

function portableSource(value) {
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    !PORTABLE_SOURCE_PATTERN.test(value) ||
    value.includes('..')
  ) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function pinnedRevision(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !/^(?:latest|main|master|next|head)$/iu.test(value.trim())
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareText)
      .map((key) => [key, stableValue(value[key])])
  );
}

function hashJson(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')}`;
}

function hashReceipt(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function parseIntegrity(value) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  const tokens = value.trim().split(/\s+/u);
  for (const algorithm of ['sha512', 'sha256']) {
    const token = tokens.find((candidate) => candidate.startsWith(`${algorithm}-`));
    if (!token) continue;
    const encoded = token.slice(algorithm.length + 1);
    if (
      encoded.length === 0 ||
      encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)
    ) {
      continue;
    }
    const decoded = Buffer.from(encoded, 'base64');
    const expectedBytes = algorithm === 'sha512' ? 64 : 32;
    if (decoded.length !== expectedBytes || decoded.toString('base64') !== encoded) continue;
    return `${algorithm}:${decoded.toString('hex')}`;
  }
  return null;
}

function sanitizeVerificationPolicy(value, issues) {
  if (value == null) return null;
  const minimum = value?.minimumIndependentRebuilds;
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 16) {
    issue(
      issues,
      'verification-policy-minimum-invalid',
      'verificationPolicy.minimumIndependentRebuilds',
      'minimumIndependentRebuilds must be an integer from 1 to 16.'
    );
  }
  if (!Array.isArray(value?.trustRoots) || value.trustRoots.length === 0) {
    issue(
      issues,
      'verification-policy-roots-missing',
      'verificationPolicy.trustRoots',
      'Verification policy must contain at least one Ed25519 public trust root.'
    );
  }

  const trustRoots = [];
  for (const [index, root] of (Array.isArray(value?.trustRoots)
    ? value.trustRoots
    : []
  ).entries()) {
    const path = `verificationPolicy.trustRoots[${index}]`;
    const verifier = validId(root?.verifier) ? root.verifier : null;
    const trustDomain = validId(root?.trustDomain) ? root.trustDomain : null;
    let publicKey = null;
    if (!verifier) {
      issue(
        issues,
        'verification-policy-verifier-invalid',
        `${path}.verifier`,
        'Verifier id must be portable.'
      );
    }
    if (!trustDomain) {
      issue(
        issues,
        'verification-policy-domain-invalid',
        `${path}.trustDomain`,
        'Trust domain must be portable.'
      );
    }
    try {
      if (
        typeof root?.publicKey !== 'string' ||
        root.publicKey.length > 8192 ||
        !root.publicKey.startsWith('-----BEGIN PUBLIC KEY-----') ||
        !root.publicKey.trimEnd().endsWith('-----END PUBLIC KEY-----')
      ) {
        throw new TypeError('Expected SPKI public key PEM.');
      }
      const key = createPublicKey(root.publicKey);
      if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('Expected Ed25519 key.');
      publicKey = root.publicKey;
    } catch {
      issue(
        issues,
        'verification-policy-key-invalid',
        `${path}.publicKey`,
        'Trust root must contain an Ed25519 public key; private key material is rejected.'
      );
    }
    trustRoots.push({ verifier, trustDomain, publicKey });
  }
  trustRoots.sort(
    (left, right) =>
      compareText(left.verifier, right.verifier) || compareText(left.trustDomain, right.trustDomain)
  );
  return {
    minimumIndependentRebuilds:
      Number.isInteger(minimum) && minimum >= 1 && minimum <= 16 ? minimum : null,
    trustRoots,
  };
}

export const _substrateImportInternals = Object.freeze({
  compareText,
  hashJson,
  hashReceipt,
  isRecord,
  issue,
  pinnedRevision,
  pinnedVersion,
  portableSource,
  sanitizeVerificationPolicy,
  validId,
});

function packageNameFromPath(path) {
  const marker = 'node_modules/';
  const index = path.lastIndexOf(marker);
  return index === -1 ? path : path.slice(index + marker.length);
}

function resolvedSource(entry, path) {
  if (entry?.resolved === 'registry.npmjs.org' && pinnedVersion(entry?.version)) {
    return `npm://configured-registry/${encodeURIComponent(packageNameFromPath(path))}/${encodeURIComponent(entry.version)}`;
  }
  return entry?.link !== true && portableSource(entry?.resolved) ? entry.resolved : null;
}

function componentId(path) {
  const name = packageNameFromPath(path)
    .toLowerCase()
    .replace(/^@/u, '')
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  const suffix = createHash('sha256').update(path).digest('hex').slice(0, 12);
  return `npm-${name || 'package'}-${suffix}`;
}

function missingComponentId(fromPath, dependency) {
  const suffix = createHash('sha256')
    .update(`${fromPath}\0${dependency}`)
    .digest('hex')
    .slice(0, 12);
  return `npm-missing-${suffix}`;
}

function validPackagePath(path) {
  return (
    typeof path === 'string' &&
    path.length <= 512 &&
    path.startsWith('node_modules/') &&
    !path.includes('\\') &&
    !path.split('/').includes('..')
  );
}

function parentPackagePath(path) {
  const index = path.lastIndexOf('/node_modules/');
  return index === -1 ? '' : path.slice(0, index);
}

function resolveDependencyPath(packages, fromPath, dependency) {
  let current = fromPath;
  while (true) {
    const candidate = current
      ? `${current}/node_modules/${dependency}`
      : `node_modules/${dependency}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    if (!current) return null;
    current = parentPackagePath(current);
  }
}

function dependencyRelations(entry, { includeDev, root }) {
  const relations = new Map();
  const add = (values, type, optional = false) => {
    if (!isRecord(values)) return;
    for (const name of Object.keys(values).sort(compareText)) {
      if (!relations.has(name)) relations.set(name, { name, type, optional });
    }
  };
  add(entry?.optionalDependencies, 'optional', true);
  add(entry?.dependencies, 'runtime');
  if (!root) {
    add(entry?.peerDependencies, 'peer');
    for (const [name, meta] of Object.entries(entry?.peerDependenciesMeta || {})) {
      if (meta?.optional === true && relations.get(name)?.type === 'peer') {
        relations.set(name, { name, type: 'peer', optional: true });
      }
    }
  }
  if (root && includeDev) add(entry?.devDependencies, 'development');
  return [...relations.values()].sort((left, right) => compareText(left.name, right.name));
}

function normalizeRoot(root, rootEntry, lockfile, issues) {
  const id = validId(root?.id) ? root.id : null;
  const versionCandidate = root?.version || rootEntry?.version || lockfile?.version;
  const version = pinnedVersion(versionCandidate) ? versionCandidate : null;
  const custodyMode = root?.custody?.mode;
  const custodyOwner = validId(root?.custody?.owner) ? root.custody.owner : null;
  const trustDomain = validId(root?.custody?.trustDomain) ? root.custody.trustDomain : null;
  const sourceUri = portableSource(root?.source?.uri) ? root.source.uri : null;
  const sourceRevision = pinnedRevision(root?.source?.revision) ? root.source.revision : null;

  if (!id) issue(issues, 'root-id-invalid', 'root.id', 'Root id must be a portable identifier.');
  if (!version) {
    issue(issues, 'root-version-not-pinned', 'root.version', 'Root version must be exact.');
  }
  if (custodyMode !== 'owned' && custodyMode !== 'external') {
    issue(issues, 'root-custody-invalid', 'root.custody.mode', 'Root custody must be explicit.');
  }
  if (!custodyOwner) {
    issue(issues, 'root-owner-invalid', 'root.custody.owner', 'Root custody owner is required.');
  }
  if (!trustDomain) {
    issue(
      issues,
      'root-trust-domain-invalid',
      'root.custody.trustDomain',
      'Root trust domain is required.'
    );
  }
  if (!sourceUri) {
    issue(
      issues,
      'root-source-not-portable',
      'root.source.uri',
      'Root source must be a portable URI without credentials.'
    );
  }
  if (!sourceRevision) {
    issue(
      issues,
      'root-revision-not-pinned',
      'root.source.revision',
      'Root source revision must be pinned.'
    );
  }

  return {
    id,
    kind: 'npm-lock-root',
    version,
    custody: {
      mode: custodyMode === 'owned' || custodyMode === 'external' ? custodyMode : null,
      owner: custodyOwner,
      trustDomain,
    },
    source: { uri: sourceUri, revision: sourceRevision },
    artifact: { digest: hashJson(lockfile) },
    execution: { installScripts: rootEntry?.hasInstallScript === true ? 'present' : 'none' },
    requires: [],
    verification: { rebuilds: [] },
  };
}

export function importNpmPackageLock({
  lockfile,
  root,
  verificationPolicy = null,
  includeDev = false,
  externalCustody = { owner: 'npm-registry', trustDomain: 'npm-registry' },
  now = new Date(),
} = {}) {
  const issues = [];
  const sanitizedVerificationPolicy = sanitizeVerificationPolicy(verificationPolicy, issues);
  const supportedVersion = lockfile?.lockfileVersion === 2 || lockfile?.lockfileVersion === 3;
  const packages = isRecord(lockfile?.packages) ? lockfile.packages : {};
  if (!supportedVersion || !isRecord(lockfile?.packages)) {
    issue(
      issues,
      'lockfile-version-unsupported',
      'lockfile.lockfileVersion',
      'Only npm package-lock v2 and v3 files with a packages graph are supported.'
    );
  }
  const rootEntry = isRecord(packages['']) ? packages[''] : null;
  if (supportedVersion && !rootEntry) {
    issue(
      issues,
      'lockfile-root-missing',
      'lockfile.packages',
      'The package-lock packages graph must contain the root entry.'
    );
  }

  const normalizedRoot = normalizeRoot(root, rootEntry, lockfile, issues);
  const custodyOwner = validId(externalCustody?.owner) ? externalCustody.owner : null;
  const custodyTrustDomain = validId(externalCustody?.trustDomain)
    ? externalCustody.trustDomain
    : null;
  if (!custodyOwner || !custodyTrustDomain) {
    issue(
      issues,
      'external-custody-invalid',
      'externalCustody',
      'External registry custody owner and trust domain must be portable identifiers.'
    );
  }

  const idsByPath = new Map();
  for (const path of Object.keys(packages).sort(compareText)) {
    if (path === '') continue;
    if (!validPackagePath(path)) {
      issue(
        issues,
        'package-path-invalid',
        'lockfile.packages',
        'A package-lock entry uses a non-portable package path.'
      );
      continue;
    }
    idsByPath.set(path, componentId(path));
  }

  const reachable = new Set(['']);
  const queue = rootEntry ? [''] : [];
  const requirementsByPath = new Map();
  let skippedOptionalDependencies = 0;
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const fromPath = queue[queueIndex];
    const entry = packages[fromPath];
    const requirements = [];
    for (const relation of dependencyRelations(entry, {
      includeDev: includeDev === true,
      root: fromPath === '',
    })) {
      const resolvedPath = resolveDependencyPath(packages, fromPath, relation.name);
      if (!resolvedPath) {
        if (relation.optional) {
          skippedOptionalDependencies += 1;
          continue;
        }
        const pathLabel = fromPath || '<root>';
        issue(
          issues,
          'dependency-lock-entry-missing',
          `lockfile.packages.${pathLabel}.dependencies`,
          'A required dependency does not resolve to a package-lock entry.'
        );
        requirements.push({
          id: missingComponentId(fromPath, relation.name),
          type: relation.type,
        });
        continue;
      }
      const dependencyId = idsByPath.get(resolvedPath);
      if (!dependencyId) {
        issue(
          issues,
          'dependency-package-path-invalid',
          'lockfile.packages',
          'A dependency resolves through a non-portable package path.'
        );
        continue;
      }
      requirements.push({ id: dependencyId, type: relation.type });
      if (!reachable.has(resolvedPath)) {
        reachable.add(resolvedPath);
        queue.push(resolvedPath);
      }
    }
    requirements.sort(
      (left, right) => compareText(left.id, right.id) || compareText(left.type, right.type)
    );
    requirementsByPath.set(fromPath, requirements);
  }

  normalizedRoot.requires = requirementsByPath.get('') || [];
  const components = [normalizedRoot];
  for (const path of [...reachable].filter(Boolean).sort(compareText)) {
    const entry = packages[path];
    const packagePath = `lockfile.packages.${path}`;
    const version = pinnedVersion(entry?.version) ? entry.version : null;
    const sourceUri = resolvedSource(entry, path);
    const artifactDigest = parseIntegrity(entry?.integrity);
    if (!version) {
      issue(
        issues,
        'package-version-not-pinned',
        `${packagePath}.version`,
        'Resolved package version must be exact.'
      );
    }
    if (!sourceUri) {
      issue(
        issues,
        'package-source-not-portable',
        `${packagePath}.resolved`,
        'Resolved package source must be a portable URI without credentials.'
      );
    }
    if (!artifactDigest) {
      issue(
        issues,
        'package-integrity-invalid',
        `${packagePath}.integrity`,
        'Resolved package integrity must contain a canonical sha256 or sha512 digest.'
      );
    }
    components.push({
      id: idsByPath.get(path),
      kind: 'npm-package',
      version,
      custody: {
        mode: 'external',
        owner: custodyOwner,
        trustDomain: custodyTrustDomain,
      },
      source: { uri: sourceUri, revision: artifactDigest },
      artifact: { digest: artifactDigest },
      execution: { installScripts: entry?.hasInstallScript === true ? 'present' : 'none' },
      requires: requirementsByPath.get(path) || [],
      verification: { rebuilds: [] },
    });
  }
  components.sort((left, right) => compareText(left.id, right.id));

  if (
    normalizedRoot.id &&
    components.some(
      (component) => component !== normalizedRoot && component.id === normalizedRoot.id
    )
  ) {
    issue(
      issues,
      'component-id-collision',
      'root.id',
      'Root id collides with a generated package component id.'
    );
  }
  issues.sort(
    (left, right) => compareText(left.path, right.path) || compareText(left.code, right.code)
  );

  const dependencies = components.reduce(
    (count, component) => count + component.requires.length,
    0
  );
  const installScriptPackages = components.filter(
    (component) => component.execution.installScripts === 'present'
  ).length;
  const configuredRegistryReferences = components.filter((component) =>
    component.source.uri?.startsWith('npm://configured-registry/')
  ).length;
  const importable = issues.length === 0;
  const input = {
    root: normalizedRoot.id,
    coverage: {
      includedLayers: ['npm'],
      missingLayers: ['native-build', 'operating-system'],
    },
    verificationPolicy: sanitizedVerificationPolicy,
    components,
  };
  const receipt = {
    schema: HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA,
    generatedAt: now.toISOString(),
    status: importable
      ? installScriptPackages > 0
        ? 'execution-policy-required'
        : 'coverage-and-attestation-required'
      : 'blocked',
    importable,
    source: {
      format: 'npm-package-lock',
      lockfileVersion: supportedVersion ? lockfile.lockfileVersion : null,
      lockfileHash: hashJson(lockfile),
      includeDev: includeDev === true,
    },
    summary: {
      components: components.length,
      dependencies,
      missingAttestations: components.length,
      installScriptPackages,
      configuredRegistryReferences,
      omittedDevRootDependencies:
        includeDev === true || !isRecord(rootEntry?.devDependencies)
          ? 0
          : Object.keys(rootEntry.devDependencies).length,
      skippedOptionalDependencies,
      issues: issues.length,
    },
    input,
    issues,
    boundaries: {
      lockfileProvesResolutionNotRebuild: true,
      generatedComponentsRequireSignedAttestations: true,
      registryCustodyRemainsExternal: true,
      rootArtifactDigestRepresentsLockfile: true,
      optionalBranchesAreConservativeSuperset: true,
      lifecycleScriptsBlockSubstrateClosure: true,
      nativeAndOsDependenciesAreNotDerived: true,
      installScriptsWereNotExecuted: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}
