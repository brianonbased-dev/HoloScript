import { sha256 as sha256Hex } from '../security/crypto';

export const PACKAGE_IR_SCHEMA_VERSION = 'holoscript.package-ir.v0.1' as const;
export const PACKAGE_LOCK_SCHEMA_VERSION = 'holoscript.package-lock-receipt.v0.1' as const;

export type PackageKind = 'library' | 'application' | 'template' | 'trait-pack' | 'plugin';

export type PackageSupportTier =
  | 'supported'
  | 'preview'
  | 'experimental'
  | 'internal'
  | 'deprecated'
  | 'archived';

export type PackageTarget =
  | 'node'
  | 'browser-wasm'
  | 'wasi-component'
  | 'native-linux'
  | 'native-windows'
  | 'owned-metal';

export type PackageSourceKind = 'registry' | 'path' | 'git' | 'content';

export interface PackageSource {
  kind: PackageSourceKind;
  locator?: string;
}

export interface PackageDependencySpec {
  range: string;
  source: PackageSource;
  optional?: boolean;
  peer?: boolean;
}

export interface PackageEntrypoints {
  source: string;
  exports?: Record<string, string>;
  compiled?: Partial<Record<PackageTarget, string>>;
}

export interface PackageCompatibility {
  holoscript: string;
  targets: PackageTarget[];
  node?: string;
}

export interface PackageProvenance {
  license: string;
  repository: string;
  owner: string;
  documentation?: string;
}

/**
 * Compiler-visible package contract.
 *
 * Host manifests such as package.json and registry records project into this
 * shape. Resolvers, compilers, catalogs, and release gates consume this shape
 * instead of maintaining parallel package truth.
 */
export interface PackageIR {
  schemaVersion: typeof PACKAGE_IR_SCHEMA_VERSION;
  name: string;
  version: string;
  kind: PackageKind;
  supportTier: PackageSupportTier;
  entrypoints: PackageEntrypoints;
  dependencies: Record<string, PackageDependencySpec>;
  compatibility: PackageCompatibility;
  capabilities: string[];
  provenance: PackageProvenance;
}

export interface ResolvedPackageArtifact {
  name: string;
  version: string;
  source: PackageSource;
  manifestDigest: string;
  contentDigest: string;
  dependencies: string[];
}

export interface PackageLockReceipt {
  schemaVersion: typeof PACKAGE_LOCK_SCHEMA_VERSION;
  root: {
    name: string;
    version: string;
    manifestDigest: string;
  };
  packages: ResolvedPackageArtifact[];
  graphDigest: string;
  generatedAt: string;
}

export interface PackageContractValidation {
  valid: boolean;
  errors: string[];
}

const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const EXACT_SEMVER =
  /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SUPPORT_TIERS = new Set<PackageSupportTier>([
  'supported',
  'preview',
  'experimental',
  'internal',
  'deprecated',
  'archived',
]);
const KINDS = new Set<PackageKind>([
  'library',
  'application',
  'template',
  'trait-pack',
  'plugin',
]);
const TARGETS = new Set<PackageTarget>([
  'node',
  'browser-wasm',
  'wasi-component',
  'native-linux',
  'native-windows',
  'owned-metal',
]);
const SOURCES = new Set<PackageSourceKind>(['registry', 'path', 'git', 'content']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPackageRelativePath(value: string): boolean {
  if (!value || value.startsWith('/') || /^[A-Za-z]:[/\\]/.test(value)) return false;
  const segments = value.replace(/\\/g, '/').split('/');
  return !segments.some((segment) => segment === '..');
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForCanonicalJson);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortForCanonicalJson(value[key])])
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

async function sha256(value: string): Promise<string> {
  return `sha256:${await sha256Hex(value)}`;
}

export function canonicalizePackageIR(packageIR: PackageIR): string {
  return stableJson(packageIR);
}

export async function digestPackageSource(source: string): Promise<string> {
  return await sha256(source);
}

function validateResolvedSource(source: unknown, label: string): string[] {
  if (
    !isRecord(source) ||
    typeof source.kind !== 'string' ||
    !SOURCES.has(source.kind as PackageSourceKind)
  ) {
    return [`${label} requires a recognized source`];
  }

  if (source.kind === 'registry') {
    if (source.locator !== undefined && typeof source.locator !== 'string') {
      return [`${label} registry locator must be a string`];
    }
    return [];
  }

  if (typeof source.locator !== 'string' || source.locator.length === 0) {
    return [`${label} source ${source.kind} requires a locator`];
  }

  if (source.kind === 'path' && !isPackageRelativePath(source.locator)) {
    return [`${label} path source must be package-relative`];
  }
  if (source.kind === 'git' && /^(?:file:|[A-Za-z]:[/\\]|\/)/.test(source.locator)) {
    return [`${label} git source must not reference a host-local path`];
  }
  if (source.kind === 'content' && !SHA256_DIGEST.test(source.locator)) {
    return [`${label} content source locator must be a sha256 digest`];
  }

  return [];
}

export function validatePackageIR(value: unknown): PackageContractValidation {
  if (!isRecord(value)) {
    return { valid: false, errors: ['package must be an object'] };
  }

  const errors: string[] = [];
  const packageIR = value as unknown as Partial<PackageIR>;

  if (packageIR.schemaVersion !== PACKAGE_IR_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${PACKAGE_IR_SCHEMA_VERSION}`);
  }
  if (typeof packageIR.name !== 'string' || !PACKAGE_NAME.test(packageIR.name)) {
    errors.push('name must be a valid scoped or unscoped package name');
  }
  if (typeof packageIR.version !== 'string' || !EXACT_SEMVER.test(packageIR.version)) {
    errors.push('version must be an exact semantic version');
  }
  if (!packageIR.kind || !KINDS.has(packageIR.kind)) {
    errors.push('kind must be a supported package kind');
  }
  if (!packageIR.supportTier || !SUPPORT_TIERS.has(packageIR.supportTier)) {
    errors.push('supportTier must be a recognized support tier');
  }

  const entrypoints = packageIR.entrypoints;
  if (!entrypoints || typeof entrypoints.source !== 'string') {
    errors.push('entrypoints.source is required');
  } else if (!isPackageRelativePath(entrypoints.source)) {
    errors.push('entrypoints.source must stay within the package root');
  }

  for (const path of Object.values(entrypoints?.exports ?? {})) {
    if (!isPackageRelativePath(path)) {
      errors.push(`export path must stay within the package root: ${path}`);
    }
  }
  for (const path of Object.values(entrypoints?.compiled ?? {})) {
    if (path && !isPackageRelativePath(path)) {
      errors.push(`compiled path must stay within the package root: ${path}`);
    }
  }

  if (!isRecord(packageIR.dependencies)) {
    errors.push('dependencies must be an object');
  } else {
    for (const [name, dependency] of Object.entries(packageIR.dependencies)) {
      if (!PACKAGE_NAME.test(name)) {
        errors.push(`invalid dependency name: ${name}`);
        continue;
      }
      if (!isRecord(dependency)) {
        errors.push(`dependency ${name} must be an object`);
        continue;
      }
      if (typeof dependency.range !== 'string' || dependency.range.length === 0) {
        errors.push(`dependency ${name} requires a version range`);
      }
      errors.push(...validateResolvedSource(dependency.source, `dependency ${name}`));
    }
  }

  if (
    !packageIR.compatibility ||
    typeof packageIR.compatibility.holoscript !== 'string' ||
    packageIR.compatibility.holoscript.length === 0
  ) {
    errors.push('compatibility.holoscript is required');
  }
  if (
    !packageIR.compatibility ||
    !Array.isArray(packageIR.compatibility.targets) ||
    packageIR.compatibility.targets.length === 0
  ) {
    errors.push('compatibility.targets requires at least one target');
  } else {
    for (const target of packageIR.compatibility.targets) {
      if (!TARGETS.has(target)) errors.push(`unsupported target: ${String(target)}`);
    }
  }

  if (!Array.isArray(packageIR.capabilities)) {
    errors.push('capabilities must be an array');
  } else if (packageIR.capabilities.some((capability) => typeof capability !== 'string')) {
    errors.push('capabilities must contain strings only');
  }

  if (
    !packageIR.provenance ||
    typeof packageIR.provenance.license !== 'string' ||
    typeof packageIR.provenance.repository !== 'string' ||
    typeof packageIR.provenance.owner !== 'string'
  ) {
    errors.push('provenance requires license, repository, and owner');
  }

  return { valid: errors.length === 0, errors };
}

function canonicalGraphPayload(
  root: PackageLockReceipt['root'],
  packages: ResolvedPackageArtifact[]
): string {
  return stableJson({ root, packages });
}

function resolvedIdentity(name: string, version: string): string {
  return `${name}@${version}`;
}

function validateResolvedPackageArtifact(artifact: unknown): PackageContractValidation {
  if (!isRecord(artifact)) {
    return { valid: false, errors: ['resolved package must be an object'] };
  }

  const errors: string[] = [];
  const value = artifact as unknown as Partial<ResolvedPackageArtifact>;
  const identity = resolvedIdentity(String(value.name ?? ''), String(value.version ?? ''));

  if (typeof value.name !== 'string' || !PACKAGE_NAME.test(value.name)) {
    errors.push(`invalid resolved package name: ${String(value.name)}`);
  }
  if (typeof value.version !== 'string' || !EXACT_SEMVER.test(value.version)) {
    errors.push(`invalid resolved package version: ${identity}`);
  }
  errors.push(...validateResolvedSource(value.source, `resolved package ${identity}`));
  if (typeof value.manifestDigest !== 'string' || !SHA256_DIGEST.test(value.manifestDigest)) {
    errors.push(`invalid manifest digest for ${identity}`);
  }
  if (typeof value.contentDigest !== 'string' || !SHA256_DIGEST.test(value.contentDigest)) {
    errors.push(`invalid content digest for ${identity}`);
  }
  if (!Array.isArray(value.dependencies)) {
    errors.push(`dependencies must be an array for ${identity}`);
  } else {
    const seen = new Set<string>();
    for (const dependency of value.dependencies) {
      if (typeof dependency !== 'string') {
        errors.push(`dependency identities must be strings for ${identity}`);
        continue;
      }
      const separator = dependency.lastIndexOf('@');
      const dependencyName = dependency.slice(0, separator);
      const dependencyVersion = dependency.slice(separator + 1);
      if (
        separator <= 0 ||
        !PACKAGE_NAME.test(dependencyName) ||
        !EXACT_SEMVER.test(dependencyVersion)
      ) {
        errors.push(`invalid resolved dependency identity ${dependency} required by ${identity}`);
      }
      if (seen.has(dependency)) {
        errors.push(`duplicate resolved dependency ${dependency} required by ${identity}`);
      }
      seen.add(dependency);
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateResolvedGraph(artifacts: ResolvedPackageArtifact[]): PackageContractValidation {
  const errors: string[] = [];
  const packageKeys = new Set<string>();

  for (const artifact of artifacts) {
    errors.push(...validateResolvedPackageArtifact(artifact).errors);
    const key = resolvedIdentity(artifact.name, artifact.version);
    if (packageKeys.has(key)) errors.push(`duplicate resolved package: ${key}`);
    packageKeys.add(key);
  }

  for (const artifact of artifacts) {
    for (const dependency of artifact.dependencies ?? []) {
      if (!packageKeys.has(dependency)) {
        errors.push(
          `missing resolved dependency ${dependency} required by ${resolvedIdentity(
            artifact.name,
            artifact.version
          )}`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function createPackageLockReceipt(
  rootPackage: PackageIR,
  artifacts: ResolvedPackageArtifact[],
  generatedAt = new Date().toISOString()
): Promise<PackageLockReceipt> {
  const validation = validatePackageIR(rootPackage);
  if (!validation.valid) {
    throw new Error(`Invalid PackageIR: ${validation.errors.join('; ')}`);
  }
  const graphValidation = validateResolvedGraph(artifacts);
  if (!graphValidation.valid) {
    throw new Error(`Invalid resolved package graph: ${graphValidation.errors.join('; ')}`);
  }

  const packages = [...artifacts]
    .map((artifact) => ({
      ...artifact,
      dependencies: [...artifact.dependencies].sort(),
    }))
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name);
      return byName === 0 ? left.version.localeCompare(right.version) : byName;
    });
  const root = {
    name: rootPackage.name,
    version: rootPackage.version,
    manifestDigest: await sha256(canonicalizePackageIR(rootPackage)),
  };

  return {
    schemaVersion: PACKAGE_LOCK_SCHEMA_VERSION,
    root,
    packages,
    graphDigest: await sha256(canonicalGraphPayload(root, packages)),
    generatedAt,
  };
}

export async function verifyPackageLockReceipt(
  receipt: PackageLockReceipt
): Promise<PackageContractValidation> {
  const errors: string[] = [];

  if (receipt.schemaVersion !== PACKAGE_LOCK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${PACKAGE_LOCK_SCHEMA_VERSION}`);
  }
  if (!PACKAGE_NAME.test(receipt.root.name) || !EXACT_SEMVER.test(receipt.root.version)) {
    errors.push('root package identity is invalid');
  }
  if (!SHA256_DIGEST.test(receipt.root.manifestDigest)) {
    errors.push('root manifest digest is invalid');
  }
  errors.push(...validateResolvedGraph(receipt.packages).errors);

  const expectedGraphDigest = await sha256(canonicalGraphPayload(receipt.root, receipt.packages));
  if (receipt.graphDigest !== expectedGraphDigest) {
    errors.push('graph digest mismatch');
  }

  return { valid: errors.length === 0, errors };
}

export async function verifyCachedPackageArtifact(
  artifact: ResolvedPackageArtifact,
  cachedSource: string
): Promise<boolean> {
  return (await digestPackageSource(cachedSource)) === artifact.contentDigest;
}
