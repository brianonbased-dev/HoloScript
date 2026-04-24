/**
 * LocalRegistry and PackageResolver
 *
 * In-process package registry for testing, local development, and composing
 * multi-package scenes without a remote registry.
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface LocalPackageInput {
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  content?: string;
}

export interface LocalVersionEntry {
  version: string;
  description?: string;
  content?: string;
  checksum: string;
  publishedAt: string;
}

export interface LocalPackageManifest {
  name: string;
  description?: string;
  author?: string;
  tags?: string[];
  latest: string;
  downloads: number;
  versions: LocalVersionEntry[];
}

// ============================================================================
// LocalRegistry
// ============================================================================

/**
 * In-memory package registry.  Supports publish, search, list, clear.
 */
export class LocalRegistry {
  private readonly _packages = new Map<string, LocalPackageManifest>();

  /** Number of packages registered */
  get size(): number {
    return this._packages.size;
  }

  private checksum(content: string | undefined): string {
    return createHash('sha256').update(content ?? '').digest('hex');
  }

  /**
   * Publish a package version.
   * Re-publishing the same name+version throws.
   */
  publish(pkg: LocalPackageInput): LocalPackageManifest {
    const existing = this._packages.get(pkg.name);
    const versionEntry: LocalVersionEntry = {
      version: pkg.version,
      description: pkg.description,
      content: pkg.content,
      checksum: this.checksum(pkg.content),
      publishedAt: new Date().toISOString(),
    };

    if (existing) {
      if (existing.versions.some((v) => v.version === pkg.version)) {
        throw new Error(`Version ${pkg.version} already published for ${pkg.name}`);
      }
      existing.versions.push(versionEntry);
      existing.latest = pkg.version;
      if (pkg.description) existing.description = pkg.description;
      if (pkg.author) existing.author = pkg.author;
      if (pkg.tags) existing.tags = [...pkg.tags];
      return existing;
    }

    const manifest: LocalPackageManifest = {
      name: pkg.name,
      description: pkg.description,
      author: pkg.author,
      tags: pkg.tags ? [...pkg.tags] : [],
      latest: pkg.version,
      downloads: 0,
      versions: [versionEntry],
    };
    this._packages.set(pkg.name, manifest);
    return manifest;
  }

  /**
   * Retrieve the manifest for a named package (or undefined).
   */
  getPackage(name: string): LocalPackageManifest | undefined {
    return this._packages.get(name);
  }

  /**
   * Retrieve a specific version entry (or undefined).
   */
  getVersion(name: string, version: string): LocalVersionEntry | undefined {
    return this._packages.get(name)?.versions.find((v) => v.version === version);
  }

  /**
   * Case-insensitive substring search across name, description, and tags.
   */
  search(query: string): LocalPackageManifest[] {
    const q = query.toLowerCase();
    const results: LocalPackageManifest[] = [];
    for (const manifest of this._packages.values()) {
      const hitName = manifest.name.toLowerCase().includes(q);
      const hitDesc = (manifest.description ?? '').toLowerCase().includes(q);
      const hitTags = (manifest.tags ?? []).some((t) => t.toLowerCase().includes(q));
      if (hitName || hitDesc || hitTags) {
        results.push(manifest);
      }
    }
    return results;
  }

  /**
   * Return all registered packages, optionally filtered by tag.
   */
  list(tag?: string): LocalPackageManifest[] {
    const all = Array.from(this._packages.values());
    if (!tag) return all;
    const needle = tag.toLowerCase();
    return all.filter((m) => (m.tags ?? []).some((t) => t.toLowerCase() === needle));
  }

  /** Increment package download count. */
  recordDownload(name: string): void {
    const pkg = this._packages.get(name);
    if (!pkg) return;
    pkg.downloads += 1;
  }

  /** Remove an entire package. */
  unpublish(name: string): boolean {
    return this._packages.delete(name);
  }

  /** Remove one version from a package. */
  unpublishVersion(name: string, version: string): boolean {
    const pkg = this._packages.get(name);
    if (!pkg) return false;
    const before = pkg.versions.length;
    pkg.versions = pkg.versions.filter((v) => v.version !== version);
    if (pkg.versions.length === before) return false;

    if (pkg.versions.length === 0) {
      this._packages.delete(name);
      return true;
    }

    pkg.latest = pkg.versions[pkg.versions.length - 1].version;
    return true;
  }

  /**
   * Remove all packages.
   */
  clear(): void {
    this._packages.clear();
  }
}

// ============================================================================
// PackageResolver  (simple pure-JS SemVer, no external deps)
// ============================================================================

function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Resolve SemVer ranges against a LocalRegistry.
 *
 * Supported range syntax: exact version, `*`, `^major.minor.patch`, `~major.minor.patch`
 */
export class PackageResolver {
  constructor(private readonly registry: LocalRegistry) {}

  /**
   * Returns true when `version` satisfies `range`.
   *
   * - `*`         → any version
   * - `1.2.3`     → exact match
   * - `^1.2.3`    → same major, >= minor+patch
   * - `~1.2.3`    → same major+minor, >= patch
   */
  satisfies(version: string, range: string): boolean {
    if (range === '*') return true;

    const v = parseSemver(version);
    if (!v) return false;

    if (range.startsWith('^')) {
      const r = parseSemver(range.slice(1));
      if (!r) return false;
      if (v[0] !== r[0]) return false;          // major must match
      if (v[1] < r[1]) return false;             // minor >= required
      if (v[1] === r[1] && v[2] < r[2]) return false; // patch >= if same minor
      return true;
    }

    if (range.startsWith('~')) {
      const r = parseSemver(range.slice(1));
      if (!r) return false;
      if (v[0] !== r[0] || v[1] !== r[1]) return false; // major+minor must match
      return v[2] >= r[2];
    }

    // Exact match
    const r = parseSemver(range);
    if (!r) return false;
    return v[0] === r[0] && v[1] === r[1] && v[2] === r[2];
  }

  /**
   * Resolve the best (latest matching) version for a package.
   * Returns null when no match.
   */
  resolve(name: string, range: string): LocalVersionEntry | null {
    const matching = this.getMatchingVersions(name, range);
    if (matching.length === 0) return null;
    // Return the last published (highest index — re-use whatever order registry has)
    return matching[matching.length - 1];
  }

  /**
   * All version entries that satisfy `range` for the named package.
   */
  getMatchingVersions(name: string, range: string): LocalVersionEntry[] {
    const manifest = this.registry.getPackage(name);
    if (!manifest) return [];
    return manifest.versions.filter((v) => this.satisfies(v.version, range));
  }
}
