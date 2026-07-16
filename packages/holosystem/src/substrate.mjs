import { createHash, createPublicKey, verify } from 'node:crypto';

export const HOLOSYSTEM_SUBSTRATE_SCHEMA = 'holoscript.holosystem.substrate.v1';
export const HOLOSYSTEM_REBUILD_ATTESTATION_SCHEMA = 'holoscript.holosystem.rebuild-attestation.v1';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PORTABLE_SOURCE_PATTERN = /^(?:git\+https|https|holorepo|npm|pypi|oci):\/\//u;
const FLOATING_VERSION_PATTERN =
  /(?:^|[\s:])(?:latest|main|master|next|workspace|file|link|portal|git|https?)(?:$|[\s:])|[*^~<>=|]/iu;

function list(value) {
  return Array.isArray(value) ? value : [];
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

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function encodeRebuildAttestation({ verifier, component }) {
  return JSON.stringify({
    schema: HOLOSYSTEM_REBUILD_ATTESTATION_SCHEMA,
    verifier,
    component: {
      id: component.id,
      kind: component.kind,
      version: component.version,
      source: {
        uri: component.source.uri,
        revision: component.source.revision,
      },
      artifact: { digest: component.artifact.digest },
    },
  });
}

export function createRebuildAttestationPayload({ verifier, component } = {}) {
  if (
    !validId(verifier) ||
    !validId(component?.id) ||
    !validId(component?.kind) ||
    !pinnedVersion(component?.version) ||
    !portableSource(component?.source?.uri) ||
    !pinnedRevision(component?.source?.revision) ||
    !validDigest(component?.artifact?.digest)
  ) {
    throw new TypeError('Cannot create a rebuild attestation for an invalid component tuple.');
  }
  return encodeRebuildAttestation({ verifier, component });
}

function hashReceipt(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function publicKeyFingerprint(key) {
  return `sha256:${createHash('sha256')
    .update(key.export({ type: 'spki', format: 'der' }))
    .digest('hex')}`;
}

function decodeEd25519Signature(value) {
  if (typeof value !== 'string' || value.length !== 88 || !/^[A-Za-z0-9+/]+={2}$/u.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 64 && decoded.toString('base64') === value ? decoded : null;
}

function issue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function normalizeVerificationPolicy(value, issues) {
  const minimum = value?.minimumIndependentRebuilds;
  if (!Number.isInteger(minimum) || minimum < 1 || minimum > 16) {
    issue(
      issues,
      'verification-minimum-invalid',
      'verificationPolicy.minimumIndependentRebuilds',
      'minimumIndependentRebuilds must be an integer from 1 to 16.'
    );
  }
  if (!Array.isArray(value?.trustRoots) || value.trustRoots.length === 0) {
    issue(
      issues,
      'trust-roots-missing',
      'verificationPolicy.trustRoots',
      'At least one caller-owned Ed25519 trust root is required.'
    );
  }

  const roots = [];
  for (const [index, root] of list(value?.trustRoots).entries()) {
    const path = `verificationPolicy.trustRoots[${index}]`;
    const verifier = validId(root?.verifier) ? root.verifier : null;
    const trustDomain = validId(root?.trustDomain) ? root.trustDomain : null;
    let key = null;
    let fingerprint = null;
    if (!verifier) {
      issue(issues, 'trust-root-verifier-invalid', `${path}.verifier`, 'Verifier id is invalid.');
    }
    if (!trustDomain) {
      issue(
        issues,
        'trust-root-domain-invalid',
        `${path}.trustDomain`,
        'Trust domain id is invalid.'
      );
    }
    try {
      if (
        typeof root?.publicKey !== 'string' ||
        root.publicKey.length > 8192 ||
        !root.publicKey.startsWith('-----BEGIN PUBLIC KEY-----') ||
        !root.publicKey.trimEnd().endsWith('-----END PUBLIC KEY-----')
      ) {
        throw new TypeError('Public key must be bounded SPKI PEM text.');
      }
      key = createPublicKey(root.publicKey);
      if (key.asymmetricKeyType !== 'ed25519') {
        throw new TypeError('Public key must be Ed25519.');
      }
      fingerprint = publicKeyFingerprint(key);
    } catch {
      issue(
        issues,
        'trust-root-key-invalid',
        `${path}.publicKey`,
        'Trust root must contain an Ed25519 public key.'
      );
      key = null;
    }
    roots.push({
      verifier,
      trustDomain,
      publicKeyFingerprint: fingerprint,
      key,
      sourceIndex: index,
    });
  }
  roots.sort(
    (left, right) =>
      compareText(left.verifier, right.verifier) || compareText(left.trustDomain, right.trustDomain)
  );

  const trustRootMap = new Map();
  const fingerprintOwners = new Map();
  for (const root of roots) {
    if (!root.verifier || !root.trustDomain || !root.key || !root.publicKeyFingerprint) continue;
    if (trustRootMap.has(root.verifier)) {
      issue(
        issues,
        'trust-root-verifier-duplicate',
        `verificationPolicy.trustRoots[${root.sourceIndex}].verifier`,
        'Each verifier must have exactly one trust root.'
      );
      continue;
    }
    if (fingerprintOwners.has(root.publicKeyFingerprint)) {
      issue(
        issues,
        'trust-root-key-duplicate',
        `verificationPolicy.trustRoots[${root.sourceIndex}].publicKey`,
        'Each trust root key may identify only one verifier.'
      );
      continue;
    }
    trustRootMap.set(root.verifier, root);
    fingerprintOwners.set(root.publicKeyFingerprint, root.verifier);
  }

  return {
    minimumIndependentRebuilds:
      Number.isInteger(minimum) && minimum >= 1 && minimum <= 16 ? minimum : null,
    trustRoots: roots.map(({ verifier, trustDomain, publicKeyFingerprint: fingerprint }) => ({
      verifier,
      trustDomain,
      publicKeyFingerprint: fingerprint,
    })),
    trustRootMap,
  };
}

function normalizeRequirement(value, componentPath, index, issues) {
  const path = `${componentPath}.requires[${index}]`;
  const id = validId(value?.id) ? value.id : null;
  const type = validId(value?.type) ? value.type : null;
  if (!id) {
    issue(issues, 'dependency-id-invalid', `${path}.id`, 'Dependency id must be portable.');
  }
  if (!type) {
    issue(issues, 'dependency-type-invalid', `${path}.type`, 'Dependency type must be portable.');
  }
  return { id, type };
}

function normalizeRebuild(value, componentPath, index, component, trustRootMap, issues) {
  const path = `${componentPath}.verification.rebuilds[${index}]`;
  const verifier = validId(value?.verifier) ? value.verifier : null;
  const digest = validDigest(value?.digest) ? value.digest : null;
  const signature = decodeEd25519Signature(value?.signature);
  if (!verifier) {
    issue(issues, 'rebuild-verifier-invalid', `${path}.verifier`, 'Verifier id must be portable.');
  }
  if (!digest) {
    issue(issues, 'rebuild-digest-invalid', `${path}.digest`, 'Rebuild digest must be sha256.');
  }
  if (!signature) {
    issue(
      issues,
      'rebuild-signature-invalid',
      `${path}.signature`,
      'Rebuild signature must be a canonical Ed25519 signature in base64.'
    );
  }

  const trustRoot = verifier ? trustRootMap.get(verifier) : null;
  if (verifier && !trustRoot) {
    issue(
      issues,
      'rebuild-verifier-untrusted',
      `${path}.verifier`,
      'Verifier is not present in the caller-owned trust policy.'
    );
  }
  const distinctTrustDomain = Boolean(
    trustRoot?.trustDomain &&
    component.custody.trustDomain &&
    trustRoot.trustDomain !== component.custody.trustDomain
  );
  if (trustRoot && component.custody.trustDomain && !distinctTrustDomain) {
    issue(
      issues,
      'rebuild-trust-domain-not-independent',
      `${path}.verifier`,
      'Verifier and component custodian belong to the same declared trust domain.'
    );
  }
  const digestMatches = Boolean(digest && component.artifact.digest === digest);
  if (digest && component.artifact.digest && !digestMatches) {
    issue(
      issues,
      'independent-rebuild-mismatch',
      `${path}.digest`,
      'Rebuild digest does not match the declared artifact.'
    );
  }

  const componentTupleValid = Boolean(
    component.id &&
    component.kind &&
    component.version &&
    component.source.uri &&
    component.source.revision &&
    component.artifact.digest
  );
  let signatureVerified = false;
  let attestationHash = null;
  if (verifier && trustRoot?.key && signature && componentTupleValid) {
    const payload = encodeRebuildAttestation({ verifier, component });
    signatureVerified = verify(null, Buffer.from(payload), trustRoot.key, signature);
    attestationHash = hashReceipt({ payload, signature: value.signature });
    if (!signatureVerified) {
      issue(
        issues,
        'rebuild-attestation-invalid',
        `${path}.signature`,
        'Rebuild signature does not authenticate the declared component tuple.'
      );
    }
  }

  const policyIndependent = Boolean(
    signatureVerified && distinctTrustDomain && digestMatches && trustRoot?.publicKeyFingerprint
  );
  return {
    verifier,
    digest,
    trustDomain: trustRoot?.trustDomain || null,
    publicKeyFingerprint: trustRoot?.publicKeyFingerprint || null,
    attestationHash,
    signatureVerified,
    policyIndependent,
  };
}

function normalizeComponent(value, index, verificationPolicy, issues) {
  const path = `components[${index}]`;
  const id = validId(value?.id) ? value.id : null;
  const kind = validId(value?.kind) ? value.kind : null;
  const version = pinnedVersion(value?.version) ? value.version : null;
  const custodyMode = value?.custody?.mode;
  const custodyOwner = validId(value?.custody?.owner) ? value.custody.owner : null;
  const custodyTrustDomain = validId(value?.custody?.trustDomain)
    ? value.custody.trustDomain
    : null;
  const sourceUri = portableSource(value?.source?.uri) ? value.source.uri : null;
  const sourceRevision = pinnedRevision(value?.source?.revision) ? value.source.revision : null;
  const artifactDigest = validDigest(value?.artifact?.digest) ? value.artifact.digest : null;

  if (!id) issue(issues, 'component-id-invalid', `${path}.id`, 'Component id must be portable.');
  if (!kind)
    issue(issues, 'component-kind-invalid', `${path}.kind`, 'Component kind must be portable.');
  if (!version) {
    issue(
      issues,
      'component-version-floating',
      `${path}.version`,
      'Component version must be exact rather than floating or local.'
    );
  }
  if (custodyMode !== 'owned' && custodyMode !== 'external') {
    issue(
      issues,
      'custody-mode-invalid',
      `${path}.custody.mode`,
      'Custody mode must be owned or external.'
    );
  }
  if (!custodyOwner) {
    issue(issues, 'custody-owner-invalid', `${path}.custody.owner`, 'Custody owner is required.');
  }
  if (!custodyTrustDomain) {
    issue(
      issues,
      'custody-trust-domain-invalid',
      `${path}.custody.trustDomain`,
      'Custody trust domain is required.'
    );
  }
  if (!sourceUri) {
    issue(
      issues,
      'source-uri-not-portable',
      `${path}.source.uri`,
      'Source must use a portable public or HoloRepo URI.'
    );
  }
  if (!sourceRevision) {
    issue(
      issues,
      'source-revision-not-pinned',
      `${path}.source.revision`,
      'Source revision must be pinned.'
    );
  }
  if (!artifactDigest) {
    issue(
      issues,
      'artifact-digest-invalid',
      `${path}.artifact.digest`,
      'Artifact digest must be sha256.'
    );
  }
  if (!Array.isArray(value?.requires)) {
    issue(
      issues,
      'dependencies-missing',
      `${path}.requires`,
      'Component dependencies must be explicit.'
    );
  }

  const requires = list(value?.requires)
    .map((item, requirementIndex) => normalizeRequirement(item, path, requirementIndex, issues))
    .sort((left, right) => compareText(left.id, right.id) || compareText(left.type, right.type));
  const componentTuple = {
    id,
    kind,
    version,
    custody: {
      mode: custodyMode === 'owned' || custodyMode === 'external' ? custodyMode : null,
      owner: custodyOwner,
      trustDomain: custodyTrustDomain,
    },
    source: { uri: sourceUri, revision: sourceRevision },
    artifact: { digest: artifactDigest },
  };
  const rebuilds = list(value?.verification?.rebuilds)
    .map((item, rebuildIndex) =>
      normalizeRebuild(
        item,
        path,
        rebuildIndex,
        componentTuple,
        verificationPolicy.trustRootMap,
        issues
      )
    )
    .sort(
      (left, right) =>
        compareText(left.verifier, right.verifier) || compareText(left.digest, right.digest)
    );
  const policyIndependentRoots = new Set(
    rebuilds
      .filter((rebuild) => rebuild.policyIndependent)
      .map((rebuild) => rebuild.publicKeyFingerprint)
  );
  const requiredRebuilds = verificationPolicy.minimumIndependentRebuilds;
  if (requiredRebuilds && policyIndependentRoots.size < requiredRebuilds) {
    issue(
      issues,
      'independent-rebuild-missing',
      `${path}.verification.rebuilds`,
      `Component needs ${requiredRebuilds} policy-independent signed rebuild attestation(s).`
    );
  }

  return {
    id,
    kind,
    version,
    custody: {
      mode: custodyMode === 'owned' || custodyMode === 'external' ? custodyMode : null,
      owner: custodyOwner,
      trustDomain: custodyTrustDomain,
    },
    source: { uri: sourceUri, revision: sourceRevision },
    artifact: { digest: artifactDigest },
    requires,
    verification: {
      rebuilds,
      policyIndependentRebuilds: policyIndependentRoots.size,
    },
  };
}

function findCycles(componentMap) {
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(id, trail) {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      cycles.push([...trail.slice(Math.max(0, start)), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const component = componentMap.get(id);
    for (const dependency of component?.requires || []) {
      if (dependency.id && componentMap.has(dependency.id)) {
        visit(dependency.id, [...trail, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of [...componentMap.keys()].sort(compareText)) visit(id, []);
  return cycles;
}

function reachableFrom(root, componentMap) {
  const reachable = new Set();
  function visit(id) {
    if (reachable.has(id) || !componentMap.has(id)) return;
    reachable.add(id);
    for (const dependency of componentMap.get(id).requires) visit(dependency.id);
  }
  visit(root);
  return reachable;
}

function dependencyFirstOrder(root, componentMap) {
  const ordered = [];
  const visited = new Set();
  function visit(id) {
    if (visited.has(id) || !componentMap.has(id)) return;
    visited.add(id);
    for (const dependency of componentMap.get(id).requires) visit(dependency.id);
    ordered.push(id);
  }
  visit(root);
  return ordered;
}

export function buildSubstrateClosure({
  root,
  verificationPolicy: policyInput,
  components = [],
  now = new Date(),
} = {}) {
  const issues = [];
  const verificationPolicy = normalizeVerificationPolicy(policyInput, issues);
  const normalizedRoot = validId(root) ? root : null;
  if (!normalizedRoot) {
    issue(issues, 'root-id-invalid', 'root', 'Root component id must be portable.');
  }
  if (!Array.isArray(components) || components.length === 0) {
    issue(issues, 'components-missing', 'components', 'At least one component is required.');
  }

  const normalized = list(components)
    .map((component, index) => normalizeComponent(component, index, verificationPolicy, issues))
    .sort((left, right) => compareText(left.id, right.id) || compareText(left.kind, right.kind));
  const componentMap = new Map();
  for (const [index, component] of normalized.entries()) {
    if (!component.id) continue;
    if (componentMap.has(component.id)) {
      issue(
        issues,
        'component-id-duplicate',
        `components[${index}].id`,
        'Component ids must be unique.'
      );
      continue;
    }
    componentMap.set(component.id, component);
  }
  if (normalizedRoot && !componentMap.has(normalizedRoot)) {
    issue(issues, 'root-component-missing', 'root', 'Root component is not declared.');
  }

  const edges = [];
  let dependencyMissing = false;
  for (const component of componentMap.values()) {
    for (const dependency of component.requires) {
      if (!dependency.id || !dependency.type) continue;
      edges.push({ from: component.id, to: dependency.id, type: dependency.type });
      if (!componentMap.has(dependency.id)) {
        dependencyMissing = true;
        issue(
          issues,
          'dependency-component-missing',
          `components.${component.id}.requires`,
          'A dependency edge points to an undeclared component.'
        );
      }
    }
  }
  edges.sort(
    (left, right) =>
      compareText(left.from, right.from) ||
      compareText(left.to, right.to) ||
      compareText(left.type, right.type)
  );

  const cycles = findCycles(componentMap);
  for (const cycle of cycles) {
    issue(
      issues,
      'dependency-cycle',
      `components.${cycle[0]}.requires`,
      'Dependency graph contains a cycle.'
    );
  }

  const reachable = normalizedRoot ? reachableFrom(normalizedRoot, componentMap) : new Set();
  if (normalizedRoot && componentMap.has(normalizedRoot)) {
    for (const id of [...componentMap.keys()].sort(compareText)) {
      if (!reachable.has(id)) {
        issue(
          issues,
          'component-unreachable',
          `components.${id}`,
          'Component is outside the declared root closure.'
        );
      }
    }
  }

  issues.sort(
    (left, right) => compareText(left.path, right.path) || compareText(left.code, right.code)
  );
  const uniqueComponents = [...componentMap.values()].sort((left, right) =>
    compareText(left.id, right.id)
  );
  const externalBoundaries = uniqueComponents
    .filter((component) => component.custody.mode === 'external')
    .map((component) => ({
      id: component.id,
      kind: component.kind,
      owner: component.custody.owner,
      trustDomain: component.custody.trustDomain,
    }));
  const independentlyVerified = uniqueComponents.filter(
    (component) =>
      verificationPolicy.minimumIndependentRebuilds &&
      component.verification.policyIndependentRebuilds >=
        verificationPolicy.minimumIndependentRebuilds
  ).length;
  const ready = issues.length === 0;
  const buildOrder =
    !dependencyMissing &&
    cycles.length === 0 &&
    normalizedRoot &&
    reachable.size === componentMap.size
      ? dependencyFirstOrder(normalizedRoot, componentMap)
      : null;
  const receipt = {
    schema: HOLOSYSTEM_SUBSTRATE_SCHEMA,
    generatedAt: now.toISOString(),
    status: ready ? 'ready' : 'blocked',
    ready,
    root: normalizedRoot,
    rule: 'Every infrastructure dependency is explicit, pinned, custody-attributed, content-addressed, and rebuilt under a distinct trust domain authorized by the caller policy.',
    verificationPolicy: {
      minimumIndependentRebuilds: verificationPolicy.minimumIndependentRebuilds,
      trustRoots: verificationPolicy.trustRoots,
    },
    summary: {
      components: uniqueComponents.length,
      dependencies: edges.length,
      independentlyVerified,
      owned: uniqueComponents.filter((component) => component.custody.mode === 'owned').length,
      external: externalBoundaries.length,
      issues: issues.length,
    },
    sovereignty: {
      fullyOwned: ready && externalBoundaries.length === 0,
      externalBoundaries,
    },
    buildOrder,
    components: uniqueComponents,
    dependencies: edges,
    issues,
    boundaries: {
      provenanceIsNotReview: true,
      signaturesAreNotSafetyProof: true,
      trustDomainsAreCallerAssertions: true,
      policyIndependenceIsNotOrganizationalProof: true,
      signedPolicyIndependentRebuildRequired: true,
      externalDependenciesRemainVisible: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}
