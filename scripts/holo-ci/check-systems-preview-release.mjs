#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_MANIFEST = join(
  DEFAULT_ROOT,
  'scripts',
  'holo-ci',
  'systems-preview-release-manifest.json'
);

export const REQUIRED_GATE_IDS = [
  'named-consumer-boundary',
  'supported-features-known-limits',
  'cumulative-machine-conformance',
  'deterministic-artifact-provenance',
  'cold-npm-consumption',
  'registry-version-dependency-closure',
  'package-architecture',
  'package-stewardship',
  'publish-secret-safe-boundary',
  'railway-readback',
  'preview-compatibility-policy',
  'release-owner-support-rollback',
  'cross-rail-parity',
];

const REQUIRED_COMPONENT_IDS = [
  'npm-core',
  'npm-cli',
  'native-compiler',
  'wasm-validation-runtime',
];

const REQUIRED_RAIL_IDS = [
  'npm-toolchain',
  'native-windows-x64',
  'wasm-portable-runtime',
  'hosted-mcp',
  'hosted-absorb',
  'hosted-studio',
  'legacy-pypi',
];

const ALLOWED_GATE_STATUSES = new Set(['pass', 'partial', 'blocked', 'fail', 'not-applicable']);
const REQUIRED_EVIDENCE_POLICY_KEYS = [
  'requireResolvableSourceCommit',
  'requireExistingArtifactPaths',
  'requireMatchingArtifactDigests',
  'requireMachineReadableReceipts',
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function uniqueRecords(records, key, label, errors) {
  const byKey = new Map();
  for (const record of records || []) {
    const value = record?.[key];
    if (!value) {
      errors.push(`${label} record is missing ${key}`);
      continue;
    }
    if (byKey.has(value)) errors.push(`duplicate ${label} ${key}: ${value}`);
    byKey.set(value, record);
  }
  return byKey;
}

function requireStrings(values, label, errors, minimum = 1) {
  if (!Array.isArray(values) || values.length < minimum) {
    errors.push(`${label} must contain at least ${minimum} item(s)`);
    return;
  }
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) errors.push(`${label} contains an empty item`);
  }
}

function assertRepoPath(rootDir, path, label, errors) {
  if (typeof path !== 'string' || !path.trim()) {
    errors.push(`${label} is missing a repository-relative path`);
    return;
  }
  if (isAbsolute(path)) {
    errors.push(`${label} must be repository-relative: ${path}`);
    return;
  }
  const absolute = resolve(rootDir, path);
  const escaped = relative(rootDir, absolute).startsWith('..');
  if (escaped) {
    errors.push(`${label} escapes the repository: ${path}`);
  } else if (!existsSync(absolute)) {
    errors.push(`${label} does not exist: ${path}`);
  }
}

function workspaceCargoVersion(rootDir) {
  const cargo = readFileSync(join(rootDir, 'Cargo.toml'), 'utf8');
  const workspacePackage = cargo.match(/\[workspace\.package\]([\s\S]*?)(?:\n\[|$)/u)?.[1] || '';
  return workspacePackage.match(/^version\s*=\s*"([^"]+)"/mu)?.[1] || '';
}

function gitCommitResolves(rootDir, commit) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(String(commit || ''))) return false;
  const result = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
    cwd: rootDir,
    stdio: 'ignore',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function secretShapedValues(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => secretShapedValues(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') {
    if (
      typeof value === 'string' &&
      /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,})/u.test(
        value
      )
    ) {
      findings.push(path);
    }
    return findings;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:api[_-]?key|private[_-]?key|wallet[_-]?key|access[_-]?token)$/iu.test(key)) {
      findings.push(`${path}.${key}`);
    }
    secretShapedValues(child, `${path}.${key}`, findings);
  }
  return findings;
}

export function validateSystemsPreviewRelease(manifest, { rootDir = DEFAULT_ROOT } = {}) {
  const root = resolve(rootDir);
  const errors = [];
  const warnings = [];

  if (manifest?.schema !== 'holoscript.systems-preview-release/v1') {
    errors.push(`unexpected manifest schema: ${manifest?.schema || '<missing>'}`);
  }

  const identity = manifest?.releaseIdentity || {};
  if (identity.distributionId !== 'holoscript-systems-toolchain') {
    errors.push('releaseIdentity.distributionId must be holoscript-systems-toolchain');
  }
  if (identity.version !== '0.1.0') errors.push('the first systems preview version must be 0.1.0');
  if (identity.channel !== 'outward-preview') {
    errors.push('releaseIdentity.channel must be outward-preview');
  }
  if (identity.legacyVersionReset !== 'forbidden') {
    errors.push('releaseIdentity.legacyVersionReset must be forbidden');
  }
  if (!identity.versionAuthority || !identity.immutableArtifactRule) {
    errors.push('release identity must define versionAuthority and immutableArtifactRule');
  }

  const registryPackage = identity.registryPackage || {};
  if (registryPackage.registry !== 'npm') errors.push('the distribution registry must be npm');
  if (registryPackage.name !== '@holoscript/systems') {
    errors.push('the distribution package identity must be @holoscript/systems');
  }
  if (registryPackage.version !== identity.version) {
    errors.push('registry package version must equal the distribution version');
  }

  for (const [key, path] of Object.entries({
    machineReleaseLadder: manifest?.authority?.machineReleaseLadder,
    readinessBaseline: manifest?.authority?.readinessBaseline,
    consumerContract: manifest?.authority?.consumerContract,
  })) {
    assertRepoPath(root, path, `authority.${key}`, errors);
  }

  requireStrings(
    manifest?.supportedSurface?.sourceFormats,
    'supportedSurface.sourceFormats',
    errors,
    3
  );
  requireStrings(
    manifest?.supportedSurface?.capabilities,
    'supportedSurface.capabilities',
    errors,
    4
  );
  requireStrings(
    manifest?.supportedSurface?.consumerPromises,
    'supportedSurface.consumerPromises',
    errors,
    3
  );
  requireStrings(manifest?.knownLimits, 'knownLimits', errors, 5);
  if (manifest?.supportedSurface?.minimumMachineContract !== 'hs-machine-v31') {
    errors.push(
      'supportedSurface.minimumMachineContract must name the currently proven hs-machine-v31 floor'
    );
  }

  const components = manifest?.components || [];
  const componentById = uniqueRecords(components, 'id', 'component', errors);
  for (const id of REQUIRED_COMPONENT_IDS) {
    if (!componentById.has(id)) errors.push(`missing required component: ${id}`);
  }

  const releaseCandidatesPath = join(root, 'scripts', 'holo-ci', 'npm-v1-release-manifest.json');
  const releaseCandidates = existsSync(releaseCandidatesPath)
    ? new Set(
        (readJson(releaseCandidatesPath).candidatePackages || []).map((record) => record.name)
      )
    : new Set();
  const componentNames = new Set(components.map((component) => component?.name).filter(Boolean));
  if (componentNames.has(registryPackage.name) || releaseCandidates.has(registryPackage.name)) {
    errors.push(`${registryPackage.name} collides with a legacy component identity`);
  }

  for (const component of components) {
    assertRepoPath(
      root,
      component.localManifest,
      `component ${component.id}.localManifest`,
      errors
    );
    if (!component.localManifest || !existsSync(resolve(root, component.localManifest))) continue;
    if (component.kind === 'npm-component') {
      const local = readJson(resolve(root, component.localManifest));
      if (local.name !== component.name) {
        errors.push(
          `${component.id}: local package name ${local.name} does not match ${component.name}`
        );
      }
      if (local.version !== component.version) {
        errors.push(
          `${component.id}: manifest version ${component.version} does not match local ${local.version}`
        );
      }
      if (!releaseCandidates.has(component.name)) {
        errors.push(
          `${component.id}: ${component.name} is missing from npm-v1-release-manifest.json`
        );
      }
      for (const bin of component.bins || []) {
        if (!Object.hasOwn(local.bin || {}, bin))
          errors.push(`${component.id}: local package is missing bin ${bin}`);
      }
    }
  }

  const cargoVersion = existsSync(join(root, 'Cargo.toml')) ? workspaceCargoVersion(root) : '';
  for (const id of ['native-compiler', 'wasm-validation-runtime']) {
    const component = componentById.get(id);
    if (component && component.version !== cargoVersion) {
      errors.push(
        `${id}: component version ${component.version} does not match Cargo workspace ${cargoVersion || '<missing>'}`
      );
    }
  }
  if (
    componentById.get('native-compiler')?.machineContract !==
    manifest?.supportedSurface?.minimumMachineContract
  ) {
    errors.push(
      'native-compiler machineContract must equal supportedSurface.minimumMachineContract'
    );
  }

  const rails = manifest?.rails || [];
  const railById = uniqueRecords(rails, 'id', 'rail', errors);
  for (const id of REQUIRED_RAIL_IDS) {
    if (!railById.has(id)) errors.push(`missing declared rail: ${id}`);
  }
  for (const id of ['npm-toolchain', 'native-windows-x64', 'wasm-portable-runtime']) {
    const rail = railById.get(id);
    if (rail && (rail.class !== 'distribution' || rail.required !== true)) {
      errors.push(`${id} must be a required distribution rail`);
    }
  }
  for (const id of ['hosted-mcp', 'hosted-absorb', 'hosted-studio']) {
    const rail = railById.get(id);
    if (rail && (rail.class !== 'optional-companion' || rail.required !== false)) {
      errors.push(`${id} must be an optional companion rail`);
    }
    if (rail?.requiredForLocalCompile !== false) {
      errors.push(`${id} must explicitly remain unnecessary for local compilation`);
    }
    if (rail?.versionMode !== 'independent-compatible-component') {
      errors.push(`${id} must retain independent-compatible-component versioning`);
    }
  }
  if (railById.get('legacy-pypi')?.class !== 'excluded') {
    errors.push('legacy-pypi must be explicitly excluded from the distribution identity');
  }

  const railwayTargetsPath = join(root, 'scripts', 'data', 'railway-ecosystem.targets.json');
  if (existsSync(railwayTargetsPath)) {
    const targetByName = new Map(
      (readJson(railwayTargetsPath).targets || []).map((target) => [target.name, target])
    );
    for (const [railId, targetName] of [
      ['hosted-mcp', 'mcp-server'],
      ['hosted-absorb', 'absorb-service'],
      ['hosted-studio', 'studio'],
    ]) {
      const rail = railById.get(railId);
      const target = targetByName.get(targetName);
      if (!target?.healthUrl) {
        errors.push(`${railId}: missing Railway health target ${targetName}`);
        continue;
      }
      let expectedOrigin = '';
      try {
        expectedOrigin = new URL(target.healthUrl).origin;
      } catch {
        errors.push(`${railId}: invalid Railway health URL for ${targetName}`);
      }
      if (rail?.identity !== expectedOrigin) {
        errors.push(
          `${railId}: identity ${rail?.identity || '<missing>'} does not match Railway target ${expectedOrigin || '<invalid>'}`
        );
      }
    }
  } else {
    errors.push('missing scripts/data/railway-ecosystem.targets.json');
  }

  const install = manifest?.installContract || {};
  const exactInstall = `@holoscript/systems@${identity.version || '<missing>'}`;
  if (!String(install.primaryCommand || '').includes(exactInstall)) {
    errors.push(`installContract.primaryCommand must pin ${exactInstall}`);
  }
  requireStrings(install.expectedBins, 'installContract.expectedBins', errors, 3);
  requireStrings(
    install.coldConsumerRequirements,
    'installContract.coldConsumerRequirements',
    errors,
    4
  );

  for (const [section, keys] of Object.entries({
    compatibilityPolicy: [
      'minorReleaseRule',
      'patchReleaseRule',
      'deprecationRule',
      'machineContractRule',
      'componentPinRule',
    ],
    supportContract: ['ownerId', 'supportChannel', 'serviceLevel'],
    rollbackContract: ['npm', 'nativeArtifacts', 'services', 'source'],
    securityContract: ['credentialBoundary'],
  })) {
    for (const key of keys) {
      if (!manifest?.[section]?.[key]) errors.push(`${section}.${key} is required`);
    }
  }
  requireStrings(manifest?.supportContract?.supported, 'supportContract.supported', errors, 2);
  requireStrings(manifest?.supportContract?.unsupported, 'supportContract.unsupported', errors, 2);
  requireStrings(
    manifest?.securityContract?.requiredArtifactChecks,
    'securityContract.requiredArtifactChecks',
    errors,
    4
  );
  requireStrings(
    manifest?.parityContract?.requiredProof,
    'parityContract.requiredProof',
    errors,
    3
  );
  for (const key of REQUIRED_EVIDENCE_POLICY_KEYS) {
    if (manifest?.evidencePolicy?.[key] !== true) {
      errors.push(`evidencePolicy.${key} must be true`);
    }
  }

  const gates = manifest?.gates || [];
  const gateById = uniqueRecords(gates, 'id', 'gate', errors);
  const policyIds = manifest?.gatePolicy?.requiredGateIds || [];
  if (JSON.stringify(policyIds) !== JSON.stringify(REQUIRED_GATE_IDS)) {
    errors.push(
      'gatePolicy.requiredGateIds must exactly match the canonical ordered required gate set'
    );
  }
  for (const id of REQUIRED_GATE_IDS) {
    const gate = gateById.get(id);
    if (!gate) {
      errors.push(`missing required gate: ${id}`);
      continue;
    }
    if (gate.required !== true) errors.push(`${id}: canonical gate must be required`);
    if (!ALLOWED_GATE_STATUSES.has(gate.status))
      errors.push(`${id}: unsupported status ${gate.status}`);
  }
  for (const gate of gates) {
    for (const path of gate.evidencePaths || []) {
      assertRepoPath(root, path, `gate ${gate.id}.evidencePaths`, errors);
    }
    if (gate.required && gate.status !== 'pass' && !String(gate.remaining || '').trim()) {
      errors.push(`${gate.id}: non-passing required gate must name remaining work`);
    }
  }

  const blockingGateIds = REQUIRED_GATE_IDS.filter((id) => gateById.get(id)?.status !== 'pass');
  const declaredBlocking = manifest?.releaseDecision?.blockingGateIds || [];
  if (JSON.stringify(declaredBlocking) !== JSON.stringify(blockingGateIds)) {
    errors.push(
      'releaseDecision.blockingGateIds must exactly match computed non-passing required gates'
    );
  }
  const ready = blockingGateIds.length === 0;
  if (manifest?.releaseDecision?.readyToPublish !== ready) {
    errors.push(`releaseDecision.readyToPublish must be ${ready}`);
  }
  if (manifest?.releaseDecision?.status !== (ready ? 'ready' : 'not-ready')) {
    errors.push(`releaseDecision.status must be ${ready ? 'ready' : 'not-ready'}`);
  }
  if (ready) {
    if (!['candidate-built', 'published'].includes(registryPackage.publishState)) {
      errors.push('a ready release must have a built or published registry package');
    }
    for (const id of ['npm-toolchain', 'native-windows-x64', 'wasm-portable-runtime']) {
      if (/^planned-/u.test(String(railById.get(id)?.artifactState || ''))) {
        errors.push(`${id}: a ready release cannot retain a planned artifact state`);
      }
    }

    const candidateEvidence = manifest?.candidateEvidence;
    if (!candidateEvidence || typeof candidateEvidence !== 'object') {
      errors.push('a ready release must include candidateEvidence');
    } else {
      if (!gitCommitResolves(root, candidateEvidence.sourceCommit)) {
        errors.push('candidateEvidence.sourceCommit must resolve to a repository commit');
      }

      const artifactPaths = candidateEvidence.artifactPaths;
      requireStrings(artifactPaths, 'candidateEvidence.artifactPaths', errors, 3);
      const artifactDigests = candidateEvidence.artifactDigests || {};
      for (const path of artifactPaths || []) {
        assertRepoPath(root, path, 'candidateEvidence.artifactPaths', errors);
        const expectedDigest = artifactDigests[path];
        if (!/^[0-9a-f]{64}$/u.test(String(expectedDigest || ''))) {
          errors.push(`candidateEvidence.artifactDigests is missing a SHA-256 for ${path}`);
          continue;
        }
        const absolute = resolve(root, path);
        if (existsSync(absolute) && fileSha256(absolute) !== expectedDigest) {
          errors.push(`candidateEvidence.artifactDigests does not match ${path}`);
        }
      }

      const receiptPaths = candidateEvidence.receiptPaths;
      requireStrings(receiptPaths, 'candidateEvidence.receiptPaths', errors, 1);
      for (const path of receiptPaths || []) {
        assertRepoPath(root, path, 'candidateEvidence.receiptPaths', errors);
        const absolute = resolve(root, path);
        if (!existsSync(absolute)) continue;
        if (!path.endsWith('.json')) {
          errors.push(`candidateEvidence receipt must be JSON: ${path}`);
          continue;
        }
        try {
          readJson(absolute);
        } catch {
          errors.push(`candidateEvidence receipt is not valid JSON: ${path}`);
        }
      }
    }
  }

  const secretFindings = secretShapedValues(manifest);
  if (secretFindings.length) {
    errors.push(`manifest contains secret-shaped material at: ${secretFindings.join(', ')}`);
  }

  if (!ready)
    warnings.push(`release is structurally defined but NOT READY: ${blockingGateIds.join(', ')}`);

  return {
    schema: 'holoscript.systems-preview-release-check/v1',
    ok: errors.length === 0,
    ready,
    distributionId: identity.distributionId || null,
    version: identity.version || null,
    registryPackage: registryPackage.name || null,
    componentCount: components.length,
    railCount: rails.length,
    gateCount: gates.length,
    blockingGateIds,
    errors,
    warnings,
  };
}

export async function probeHostedCompanions(
  manifest,
  { rootDir = DEFAULT_ROOT, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}
) {
  const root = resolve(rootDir);
  const targets = readJson(join(root, 'scripts', 'data', 'railway-ecosystem.targets.json')).targets;
  const targetByName = new Map((targets || []).map((target) => [target.name, target]));
  const railById = new Map((manifest?.rails || []).map((rail) => [rail.id, rail]));
  const rows = [];
  const errors = [];
  const warnings = [];

  for (const [railId, targetName] of [
    ['hosted-mcp', 'mcp-server'],
    ['hosted-absorb', 'absorb-service'],
    ['hosted-studio', 'studio'],
  ]) {
    const rail = railById.get(railId);
    const target = targetByName.get(targetName);
    const healthUrl = target?.healthUrl || '';
    try {
      const response = await fetchImpl(healthUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json().catch(() => ({}));
      const version = typeof body?.version === 'string' ? body.version : null;
      rows.push({
        railId,
        identity: rail?.identity || null,
        healthUrl,
        status: response.status,
        ok: response.ok,
        version,
        baselineObservedVersion: rail?.baselineObservedVersion || null,
      });
      if (!response.ok) errors.push(`${railId}: health returned HTTP ${response.status}`);
      if (rail?.baselineObservedVersion && version && version !== rail.baselineObservedVersion) {
        warnings.push(
          `${railId}: independently versioned service moved from baseline ${rail.baselineObservedVersion} to ${version}`
        );
      }
    } catch (error) {
      rows.push({
        railId,
        identity: rail?.identity || null,
        healthUrl,
        status: null,
        ok: false,
        version: null,
        baselineObservedVersion: rail?.baselineObservedVersion || null,
      });
      errors.push(
        `${railId}: health probe failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    schema: 'holoscript.systems-preview-service-readback/v1',
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    rows,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const rootIndex = args.indexOf('--root');
  const manifestIndex = args.indexOf('--manifest');
  const rootDir = rootIndex >= 0 ? resolve(args[rootIndex + 1]) : DEFAULT_ROOT;
  const manifestPath =
    manifestIndex >= 0
      ? resolve(args[manifestIndex + 1])
      : rootIndex >= 0
        ? join(rootDir, 'scripts', 'holo-ci', 'systems-preview-release-manifest.json')
        : DEFAULT_MANIFEST;
  return {
    rootDir,
    manifestPath,
    json: args.includes('--json'),
    requireReady: args.includes('--require-ready'),
    checkServices: args.includes('--check-services'),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.manifestPath)) {
    console.error(`[systems-preview-release] missing manifest: ${options.manifestPath}`);
    process.exit(1);
  }
  const manifest = readJson(options.manifestPath);
  const result = validateSystemsPreviewRelease(manifest, {
    rootDir: options.rootDir,
  });
  const serviceReadback = options.checkServices
    ? await probeHostedCompanions(manifest, { rootDir: options.rootDir })
    : null;
  const output = serviceReadback ? { ...result, serviceReadback } : result;
  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const error of result.errors) console.error(`[systems-preview-release] FAIL: ${error}`);
    for (const warning of result.warnings)
      console.warn(`[systems-preview-release] WARN: ${warning}`);
    for (const row of serviceReadback?.rows || []) {
      console.log(
        `[systems-preview-release] SERVICE: ${row.railId} HTTP ${row.status ?? 'ERR'} ` +
          `version=${row.version || '<not-reported>'}`
      );
    }
    for (const error of serviceReadback?.errors || [])
      console.error(`[systems-preview-release] SERVICE FAIL: ${error}`);
    for (const warning of serviceReadback?.warnings || [])
      console.warn(`[systems-preview-release] SERVICE WARN: ${warning}`);
    if (result.ok) {
      console.log(
        `[systems-preview-release] VALID: ${result.distributionId}@${result.version} ` +
          `${result.ready ? 'READY' : 'NOT READY'} (${result.blockingGateIds.length} blocking gates)`
      );
    }
  }
  if (!result.ok) process.exit(1);
  if (serviceReadback && !serviceReadback.ok) process.exit(1);
  if (options.requireReady && !result.ready) process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
