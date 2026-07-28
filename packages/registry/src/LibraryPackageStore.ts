import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { validatePackageIR, type PackageIR } from '@holoscript/platform';
import { Router, type Request } from 'express';

const STORE_SCHEMA_VERSION = 'holoscript.library-package-store.v1' as const;
const INTEGRITY = /^sha256:[0-9a-f]{64}$/;

export interface LibraryPackagePublishEnvelope {
  packageIR: PackageIR;
  source: string;
}

export interface LibraryPackageRecord {
  packageIR: PackageIR;
  source: string;
  integrity: string;
  publishedAt: string;
}

interface SerializedStore {
  schemaVersion: typeof STORE_SCHEMA_VERSION;
  packages: Record<string, Record<string, LibraryPackageRecord>>;
}

export interface LibraryPackagePrincipal {
  namespace: string;
}

export interface LibraryPackageRouterOptions {
  store: LibraryPackageStore;
  authenticate: (request: Request) => LibraryPackagePrincipal | null;
}

function digestSource(source: string): string {
  return `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
}

function packageSpecifier(namespace: string, name: string): string {
  return `@${namespace}/${name}`;
}

function splitSpecifier(specifier: string): { namespace: string; name: string } | null {
  const match = /^@([a-z0-9-~][a-z0-9-._~]*)\/([a-z0-9-~][a-z0-9-._~]*)$/.exec(specifier);
  return match ? { namespace: match[1], name: match[2] } : null;
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
}

function satisfies(version: string, range: string): boolean {
  if (!range || range === '*') return true;
  const current = parseVersion(version);
  const requested = parseVersion(range.replace(/^[~^]/, ''));

  if (range.startsWith('^')) {
    if (current[0] !== requested[0]) return false;
    if (current[1] !== requested[1]) return current[1] > requested[1];
    return current[2] >= requested[2];
  }
  if (range.startsWith('~')) {
    return current[0] === requested[0] && current[1] === requested[1] && current[2] >= requested[2];
  }
  return current.every((part, index) => part === requested[index]);
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  return b[0] - a[0] || b[1] - a[1] || b[2] - a[2] || right.localeCompare(left);
}

function publicRecord(record: LibraryPackageRecord) {
  const specifier = record.packageIR.name;
  const { namespace, name } = splitSpecifier(specifier)!;
  return {
    specifier,
    version: record.packageIR.version,
    integrity: record.integrity,
    entrypoint: record.packageIR.entrypoints.source,
    sourceUrl: `/api/v1/packages/${namespace}/${name}/versions/${record.packageIR.version}`,
    packageIR: record.packageIR,
    publishedAt: record.publishedAt,
  };
}

export class LibraryPackageStore {
  private readonly packages = new Map<string, Map<string, LibraryPackageRecord>>();

  constructor(private readonly storagePath?: string) {
    if (storagePath && existsSync(storagePath)) this.load(storagePath);
  }

  publish(
    envelope: LibraryPackagePublishEnvelope,
    principal: LibraryPackagePrincipal
  ): LibraryPackageRecord {
    if (!envelope || typeof envelope.source !== 'string' || envelope.source.length === 0) {
      throw new Error('Invalid package: source is required');
    }
    const validation = validatePackageIR(envelope.packageIR);
    if (!validation.valid) {
      throw new Error(`Invalid package: ${validation.errors.join('; ')}`);
    }

    const identity = splitSpecifier(envelope.packageIR.name);
    if (!identity) throw new Error('Invalid package: a scoped package name is required');
    if (identity.namespace !== principal.namespace) {
      throw new Error(
        `Namespace mismatch: authenticated namespace ${principal.namespace} cannot publish ${envelope.packageIR.name}`
      );
    }

    let versions = this.packages.get(envelope.packageIR.name);
    if (!versions) {
      versions = new Map();
      this.packages.set(envelope.packageIR.name, versions);
    }
    if (versions.has(envelope.packageIR.version)) {
      throw new Error(
        `Version exists: ${envelope.packageIR.name}@${envelope.packageIR.version} is immutable`
      );
    }

    const record: LibraryPackageRecord = {
      packageIR: envelope.packageIR,
      source: envelope.source,
      integrity: digestSource(envelope.source),
      publishedAt: new Date().toISOString(),
    };
    versions.set(envelope.packageIR.version, record);
    this.persist();
    return record;
  }

  get(specifier: string, version: string): LibraryPackageRecord | null {
    const record = this.packages.get(specifier)?.get(version) ?? null;
    if (
      record &&
      (!INTEGRITY.test(record.integrity) || digestSource(record.source) !== record.integrity)
    ) {
      throw new Error(`Stored package integrity mismatch: ${specifier}@${version}`);
    }
    return record;
  }

  resolve(specifier: string, range = '*'): LibraryPackageRecord | null {
    const versions = this.packages.get(specifier);
    if (!versions) return null;
    const version = [...versions.keys()]
      .filter((candidate) => satisfies(candidate, range))
      .sort(compareVersions)[0];
    return version ? this.get(specifier, version) : null;
  }

  get size(): number {
    let count = 0;
    for (const versions of this.packages.values()) count += versions.size;
    return count;
  }

  private load(storagePath: string): void {
    const serialized = JSON.parse(readFileSync(storagePath, 'utf8')) as SerializedStore;
    if (serialized.schemaVersion !== STORE_SCHEMA_VERSION || !serialized.packages) {
      throw new Error(`Unsupported library package store: ${storagePath}`);
    }

    for (const [specifier, versions] of Object.entries(serialized.packages)) {
      const versionMap = new Map<string, LibraryPackageRecord>();
      for (const [version, record] of Object.entries(versions)) {
        const validation = validatePackageIR(record.packageIR);
        if (
          !validation.valid ||
          record.packageIR.name !== specifier ||
          record.packageIR.version !== version ||
          !INTEGRITY.test(record.integrity) ||
          digestSource(record.source) !== record.integrity
        ) {
          throw new Error(`Stored package integrity mismatch: ${specifier}@${version}`);
        }
        versionMap.set(version, record);
      }
      this.packages.set(specifier, versionMap);
    }
  }

  private persist(): void {
    if (!this.storagePath) return;
    mkdirSync(dirname(this.storagePath), { recursive: true });
    const packages: SerializedStore['packages'] = {};
    for (const [specifier, versions] of this.packages) {
      packages[specifier] = Object.fromEntries(versions);
    }
    const serialized: SerializedStore = { schemaVersion: STORE_SCHEMA_VERSION, packages };
    const temporaryPath = `${this.storagePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(serialized, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, this.storagePath);
  }
}

export function createLibraryPackageRouter(options: LibraryPackageRouterOptions): Router {
  const router = Router();

  router.post('/api/v1/packages', (request, response) => {
    const principal = options.authenticate(request);
    if (!principal) return response.status(401).json({ error: 'Authentication required' });

    try {
      const record = options.store.publish(request.body, principal);
      return response.status(201).json(publicRecord(record));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publish failed';
      if (message.startsWith('Namespace mismatch:')) {
        return response.status(403).json({ error: message });
      }
      if (message.startsWith('Version exists:')) {
        return response.status(409).json({ error: message });
      }
      return response.status(400).json({ error: message });
    }
  });

  router.get('/api/v1/packages/:namespace/:name/resolve', (request, response) => {
    try {
      const record = options.store.resolve(
        packageSpecifier(request.params.namespace, request.params.name),
        typeof request.query.range === 'string' ? request.query.range : '*'
      );
      return record
        ? response.json(publicRecord(record))
        : response.status(404).json({ error: 'No matching package version' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resolve failed';
      return response.status(500).json({ error: message });
    }
  });

  router.get('/api/v1/packages/:namespace/:name/versions/:version', (request, response) => {
    try {
      const record = options.store.get(
        packageSpecifier(request.params.namespace, request.params.name),
        request.params.version
      );
      return record
        ? response.json({ ...publicRecord(record), source: record.source })
        : response.status(404).json({ error: 'Package version not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Package read failed';
      return response.status(500).json({ error: message });
    }
  });

  return router;
}
