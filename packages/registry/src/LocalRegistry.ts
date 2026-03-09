import type { PackageManifest, PackageVersion } from './PackageManifest.js';
import { createHash } from 'crypto';

export interface PublishOptions {
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  content: string;
}

export interface SearchResult {
  name: string;
  description?: string;
  latest: string;
  downloads: number;
  tags?: string[];
}

export class LocalRegistry {
  private packages: Map<string, PackageManifest> = new Map();

  publish(options: PublishOptions): PackageManifest {
    const { name, version, description, author, tags, content } = options;
    const checksum = createHash('sha256').update(content).digest('hex');
    const publishedAt = new Date().toISOString();
    const newVersion: PackageVersion = {
      version,
      description,
      author,
      tags,
      publishedAt,
      checksum,
    };

    const existing = this.packages.get(name);
    if (existing) {
      const versionExists = existing.versions.some((v) => v.version === version);
      if (versionExists) {
        throw new Error('Version ' + version + ' of package ' + name + ' already exists');
      }
      existing.versions.push(newVersion);
      existing.latest = version;
      if (description) existing.description = description;
      if (author) existing.author = author;
      if (tags) existing.tags = tags;
      return existing;
    }

    const manifest: PackageManifest = {
      name,
      description,
      author,
      versions: [newVersion],
      latest: version,
      downloads: 0,
      tags,
    };
    this.packages.set(name, manifest);
    return manifest;
  }

  getPackage(name: string): PackageManifest | undefined {
    return this.packages.get(name);
  }

  getVersion(name: string, version: string): PackageVersion | undefined {
    const pkg = this.packages.get(name);
    return pkg?.versions.find((v) => v.version === version);
  }

  list(tag?: string): SearchResult[] {
    const results: SearchResult[] = [];
    for (const pkg of this.packages.values()) {
      if (tag && !pkg.tags?.includes(tag)) continue;
      results.push({
        name: pkg.name,
        description: pkg.description,
        latest: pkg.latest,
        downloads: pkg.downloads,
        tags: pkg.tags,
      });
    }
    return results;
  }

  search(query: string): SearchResult[] {
    const lower = query.toLowerCase();
    const results: SearchResult[] = [];
    for (const pkg of this.packages.values()) {
      const matches =
        pkg.name.toLowerCase().includes(lower) ||
        pkg.description?.toLowerCase().includes(lower) ||
        pkg.tags?.some((t) => t.toLowerCase().includes(lower));
      if (matches) {
        results.push({
          name: pkg.name,
          description: pkg.description,
          latest: pkg.latest,
          downloads: pkg.downloads,
          tags: pkg.tags,
        });
      }
    }
    return results;
  }

  recordDownload(name: string): void {
    const pkg = this.packages.get(name);
    if (pkg) pkg.downloads += 1;
  }

  unpublish(name: string): boolean {
    return this.packages.delete(name);
  }

  unpublishVersion(name: string, version: string): boolean {
    const pkg = this.packages.get(name);
    if (!pkg) return false;
    const index = pkg.versions.findIndex((v) => v.version === version);
    if (index === -1) return false;
    pkg.versions.splice(index, 1);
    if (pkg.versions.length > 0 && pkg.latest === version) {
      pkg.latest = pkg.versions[pkg.versions.length - 1]!.version;
    }
    return true;
  }

  get size(): number {
    return this.packages.size;
  }

  clear(): void {
    this.packages.clear();
  }
}
