/**
 * @fileoverview Trait Registry for storage and retrieval of trait packages
 * @module marketplace-api/TraitRegistry
 */

import type {
  TraitPackage,
  TraitSummary,
  VersionInfo,
  PublishRequest,
  PublishResult,
  SearchQuery,
  SearchResult,
  TraitCategory,
  SearchFacets,
} from './types.js';
import { createHash } from 'crypto';

// =============================================================================
// DATABASE INTERFACE (Abstract - supports multiple backends)
// =============================================================================

/**
 * Abstract database interface for trait storage
 */
export interface ITraitDatabase {
  // CRUD operations
  insertTrait(trait: TraitPackage): Promise<void>;
  updateTrait(id: string, updates: Partial<TraitPackage>): Promise<void>;
  deleteTrait(id: string): Promise<void>;
  deleteVersion(id: string, version: string): Promise<void>;

  // Retrieval
  getTraitById(id: string): Promise<TraitPackage | null>;
  getTraitByName(name: string): Promise<TraitPackage | null>;
  getTraitVersion(name: string, version: string): Promise<TraitPackage | null>;
  getVersions(traitId: string): Promise<VersionInfo[]>;

  // Search
  search(query: SearchQuery): Promise<SearchResult>;
  getFacets(query: SearchQuery): Promise<SearchFacets>;

  // Stats
  incrementDownloads(traitId: string, version: string): Promise<void>;
  getPopular(category?: TraitCategory, limit?: number): Promise<TraitSummary[]>;
  getRecent(limit?: number): Promise<TraitSummary[]>;
}

// =============================================================================
// IN-MEMORY DATABASE IMPLEMENTATION (For development/testing)
// =============================================================================

/**
 * In-memory database implementation for development and testing
 */
export class InMemoryTraitDatabase implements ITraitDatabase {
  private traits: Map<string, TraitPackage> = new Map();
  private versions: Map<string, Map<string, TraitPackage>> = new Map(); // traitId -> version -> package

  async insertTrait(trait: TraitPackage): Promise<void> {
    this.traits.set(trait.id, trait);

    // Store version
    if (!this.versions.has(trait.id)) {
      this.versions.set(trait.id, new Map());
    }
    this.versions.get(trait.id)!.set(trait.version, { ...trait });
  }

  async updateTrait(id: string, updates: Partial<TraitPackage>): Promise<void> {
    const existing = this.traits.get(id);
    if (!existing) {
      throw new Error(`Trait ${id} not found`);
    }
    this.traits.set(id, { ...existing, ...updates, updatedAt: new Date() });
  }

  async deleteTrait(id: string): Promise<void> {
    this.traits.delete(id);
    this.versions.delete(id);
  }

  async deleteVersion(id: string, version: string): Promise<void> {
    this.versions.get(id)?.delete(version);

    // If no versions left, delete trait
    if (this.versions.get(id)?.size === 0) {
      this.traits.delete(id);
      this.versions.delete(id);
    }
  }

  async getTraitById(id: string): Promise<TraitPackage | null> {
    return this.traits.get(id) ?? null;
  }

  async getTraitByName(name: string): Promise<TraitPackage | null> {
    for (const trait of this.traits.values()) {
      if (trait.name === name) {
        return trait;
      }
    }
    return null;
  }

  async getTraitVersion(name: string, version: string): Promise<TraitPackage | null> {
    const trait = await this.getTraitByName(name);
    if (!trait) return null;

    return this.versions.get(trait.id)?.get(version) ?? null;
  }

  async getVersions(traitId: string): Promise<VersionInfo[]> {
    const versionMap = this.versions.get(traitId);
    if (!versionMap) return [];

    return Array.from(versionMap.values()).map((pkg) => ({
      version: pkg.version,
      publishedAt: pkg.publishedAt,
      publishedBy: pkg.author.name,
      downloads: pkg.downloads,
      deprecated: pkg.deprecated,
      tarballUrl: `/traits/${pkg.id}/versions/${pkg.version}/download`,
      shasum: createHash('sha256').update(pkg.source).digest('hex'),
      size: Buffer.byteLength(pkg.source, 'utf8'),
    }));
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    let results = Array.from(this.traits.values());

    // Apply filters
    if (query.q) {
      const q = query.q.toLowerCase();
      results = results.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }

    if (query.category) {
      results = results.filter((t) => t.category === query.category);
    }

    if (query.platform) {
      results = results.filter(
        (t) => t.platforms.includes(query.platform!) || t.platforms.includes('all')
      );
    }

    if (query.author) {
      results = results.filter((t) =>
        t.author.name.toLowerCase().includes(query.author!.toLowerCase())
      );
    }

    if (query.keywords?.length) {
      results = results.filter((t) => query.keywords!.some((k) => t.keywords.includes(k)));
    }

    if (query.verified !== undefined) {
      results = results.filter((t) => t.verified === query.verified);
    }

    if (query.deprecated !== undefined) {
      results = results.filter((t) => t.deprecated === query.deprecated);
    }

    if (query.minRating !== undefined) {
      results = results.filter((t) => t.rating >= query.minRating!);
    }

    if (query.minDownloads !== undefined) {
      results = results.filter((t) => t.downloads >= query.minDownloads!);
    }

    // Sort
    results = this.sortResults(results, query.sortBy ?? 'relevance', query.sortOrder ?? 'desc');

    // Paginate
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const total = results.length;
    const startIndex = (page - 1) * limit;
    const paginatedResults = results.slice(startIndex, startIndex + limit);

    // Convert to summaries
    const summaries: TraitSummary[] = paginatedResults.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      description: t.description,
      author: { name: t.author.name, verified: t.author.verified },
      category: t.category,
      platforms: t.platforms,
      downloads: t.downloads,
      rating: t.rating,
      verified: t.verified,
      deprecated: t.deprecated,
      updatedAt: t.updatedAt,
    }));

    return {
      results: summaries,
      total,
      page,
      limit,
      hasMore: startIndex + limit < total,
      query,
    };
  }

  private sortResults(
    results: TraitPackage[],
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ): TraitPackage[] {
    const sorted = [...results];
    const order = sortOrder === 'asc' ? 1 : -1;

    switch (sortBy) {
      case 'downloads':
        sorted.sort((a, b) => (a.downloads - b.downloads) * order);
        break;
      case 'rating':
        sorted.sort((a, b) => (a.rating - b.rating) * order);
        break;
      case 'updated':
        sorted.sort((a, b) => (a.updatedAt.getTime() - b.updatedAt.getTime()) * order);
        break;
      case 'created':
        sorted.sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * order);
        break;
      case 'relevance':
      default:
        // Keep original order for relevance (assumes search already sorted)
        break;
    }

    return sorted;
  }

  async getFacets(query: SearchQuery): Promise<SearchFacets> {
    const _results = await this.search({ ...query, limit: 1000 });
    const allTraits = Array.from(this.traits.values());

    const categoryCount = new Map<string, number>();
    const platformCount = new Map<string, number>();
    const licenseCount = new Map<string, number>();
    const authorCount = new Map<string, number>();

    for (const trait of allTraits) {
      categoryCount.set(trait.category, (categoryCount.get(trait.category) ?? 0) + 1);

      for (const platform of trait.platforms) {
        platformCount.set(platform, (platformCount.get(platform) ?? 0) + 1);
      }

      licenseCount.set(trait.license, (licenseCount.get(trait.license) ?? 0) + 1);
      authorCount.set(trait.author.name, (authorCount.get(trait.author.name) ?? 0) + 1);
    }

    return {
      categories: Array.from(categoryCount.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      platforms: Array.from(platformCount.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      licenses: Array.from(licenseCount.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      authors: Array.from(authorCount.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  async incrementDownloads(traitId: string, version: string): Promise<void> {
    const trait = this.traits.get(traitId);
    if (trait) {
      trait.downloads++;
    }

    const versionPkg = this.versions.get(traitId)?.get(version);
    if (versionPkg) {
      versionPkg.downloads++;
    }
  }

  async getPopular(category?: TraitCategory, limit: number = 10): Promise<TraitSummary[]> {
    let traits = Array.from(this.traits.values());

    if (category) {
      traits = traits.filter((t) => t.category === category);
    }

    traits.sort((a, b) => b.downloads - a.downloads);
    traits = traits.slice(0, limit);

    return traits.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      description: t.description,
      author: { name: t.author.name, verified: t.author.verified },
      category: t.category,
      platforms: t.platforms,
      downloads: t.downloads,
      rating: t.rating,
      verified: t.verified,
      deprecated: t.deprecated,
      updatedAt: t.updatedAt,
    }));
  }

  async getRecent(limit: number = 10): Promise<TraitSummary[]> {
    const traits = Array.from(this.traits.values())
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);

    return traits.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      description: t.description,
      author: { name: t.author.name, verified: t.author.verified },
      category: t.category,
      platforms: t.platforms,
      downloads: t.downloads,
      rating: t.rating,
      verified: t.verified,
      deprecated: t.deprecated,
      updatedAt: t.updatedAt,
    }));
  }
}

// =============================================================================
// TRAIT REGISTRY
// =============================================================================

/**
 * Main trait registry service
 */
export class TraitRegistry {
  private db: ITraitDatabase;

  constructor(database?: ITraitDatabase) {
    this.db = database ?? new InMemoryTraitDatabase();
  }

  /**
   * Generate a unique trait ID from name
   */
  private generateTraitId(name: string): string {
    // Normalize name to valid ID (lowercase, no special chars)
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Publish a new trait or version
   */
  async publish(
    request: PublishRequest,
    author: { name: string; email?: string; verified: boolean }
  ): Promise<PublishResult> {
    const warnings: string[] = [];
    const _errors: string[] = [];

    // Validate request
    const validationErrors = this.validatePublishRequest(request);
    if (validationErrors.length > 0) {
      return {
        success: false,
        traitId: '',
        version: '',
        tarballUrl: '',
        shasum: '',
        errors: validationErrors,
      };
    }

    const traitId = this.generateTraitId(request.name);

    // Check if trait exists
    const existing = await this.db.getTraitById(traitId);
    if (existing) {
      // Check if this version already exists
      const existingVersion = await this.db.getTraitVersion(request.name, request.version);
      if (existingVersion) {
        return {
          success: false,
          traitId,
          version: request.version,
          tarballUrl: '',
          shasum: '',
          errors: [
            `Version ${request.version} already exists. Bump the version number to publish.`,
          ],
        };
      }

      // Check author ownership
      if (existing.author.name !== author.name) {
        return {
          success: false,
          traitId,
          version: request.version,
          tarballUrl: '',
          shasum: '',
          errors: [`You don't have permission to publish to trait '${request.name}'`],
        };
      }
    }

    // Generate tarball info
    const shasum = createHash('sha256').update(request.source).digest('hex');
    const tarballUrl = `/traits/${traitId}/versions/${request.version}/download`;

    // Create trait package
    const now = new Date();
    const traitPackage: TraitPackage = {
      id: traitId,
      name: request.name,
      version: request.version,
      description: request.description,
      author: {
        name: author.name,
        email: author.email,
        verified: author.verified,
      },
      license: request.license,
      keywords: request.keywords,
      repository: request.repository,
      homepage: request.homepage,
      dependencies: request.dependencies ?? {},
      peerDependencies: request.peerDependencies ?? {},
      source: request.source,
      types: request.types,
      readme: request.readme,
      examples: request.examples,
      platforms: request.platforms,
      category: request.category,
      verified: author.verified,
      deprecated: false,
      downloads: existing?.downloads ?? 0,
      rating: existing?.rating ?? 0,
      ratingCount: existing?.ratingCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      publishedAt: now,
    };

    // Check for potential issues
    if (!request.readme) {
      warnings.push('No README provided. Consider adding documentation.');
    }
    if (!request.types) {
      warnings.push('No type definitions provided. Consider adding .d.ts file.');
    }
    if (Object.keys(request.dependencies ?? {}).length === 0) {
      // No warning, many traits have no dependencies
    }

    // Store trait
    await this.db.insertTrait(traitPackage);

    return {
      success: true,
      traitId,
      version: request.version,
      tarballUrl,
      shasum,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate publish request
   */
  private validatePublishRequest(request: PublishRequest): string[] {
    const errors: string[] = [];

    if (!request.name || request.name.length < 2) {
      errors.push('Trait name must be at least 2 characters');
    }

    if (!/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(request.name)) {
      errors.push(
        'Trait name must start with a letter and contain only letters, numbers, hyphens, and underscores'
      );
    }

    if (!request.version || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(request.version)) {
      errors.push('Version must be valid semver (e.g., 1.0.0, 1.0.0-beta.1)');
    }

    if (!request.description || request.description.length < 10) {
      errors.push('Description must be at least 10 characters');
    }

    if (!request.source || request.source.length === 0) {
      errors.push('Source code is required');
    }

    if (!request.platforms || request.platforms.length === 0) {
      errors.push('At least one platform must be specified');
    }

    if (!request.category) {
      errors.push('Category is required');
    }

    return errors;
  }

  /**
   * Unpublish a trait or version
   */
  async unpublish(traitId: string, version?: string, authorName?: string): Promise<void> {
    const trait = await this.db.getTraitById(traitId);
    if (!trait) {
      throw new Error(`Trait ${traitId} not found`);
    }

    // Check ownership
    if (authorName && trait.author.name !== authorName) {
      throw new Error(`You don't have permission to unpublish trait '${traitId}'`);
    }

    if (version) {
      await this.db.deleteVersion(traitId, version);
    } else {
      await this.db.deleteTrait(traitId);
    }
  }

  /**
   * Deprecate a trait or version
   */
  async deprecate(
    traitId: string,
    message: string,
    version?: string,
    replacement?: string
  ): Promise<void> {
    const trait = await this.db.getTraitById(traitId);
    if (!trait) {
      throw new Error(`Trait ${traitId} not found`);
    }

    await this.db.updateTrait(traitId, {
      deprecated: true,
      deprecationMessage: message + (replacement ? ` Use ${replacement} instead.` : ''),
    });
  }

  /**
   * Get a trait by ID
   */
  async getTrait(traitId: string, version?: string): Promise<TraitPackage | null> {
    // Normalize traitId to support both raw names and pre-normalized IDs
    const normalizedId = this.generateTraitId(traitId);
    if (version) {
      const trait = await this.db.getTraitById(normalizedId);
      if (!trait) return null;
      return this.db.getTraitVersion(trait.name, version);
    }
    return this.db.getTraitById(normalizedId);
  }

  /**
   * Get all versions of a trait
   */
  async getVersions(traitId: string): Promise<VersionInfo[]> {
    return this.db.getVersions(traitId);
  }

  /**
   * Search for traits
   */
  async search(query: SearchQuery): Promise<SearchResult> {
    return this.db.search(query);
  }

  /**
   * Get search facets
   */
  async getFacets(query: SearchQuery): Promise<SearchFacets> {
    return this.db.getFacets(query);
  }

  /**
   * Get popular traits
   */
  async getPopular(category?: TraitCategory, limit?: number): Promise<TraitSummary[]> {
    return this.db.getPopular(category, limit);
  }

  /**
   * Get recently published traits
   */
  async getRecent(limit?: number): Promise<TraitSummary[]> {
    return this.db.getRecent(limit);
  }

  /**
   * Record a download
   */
  async recordDownload(traitId: string, version: string): Promise<void> {
    await this.db.incrementDownloads(traitId, version);
  }
}
