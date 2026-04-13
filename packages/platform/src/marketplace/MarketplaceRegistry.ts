/**
 * @fileoverview Marketplace Registry — Store, Search, Install
 * @module @holoscript/core/marketplace
 *
 * The in-memory marketplace registry for HoloScript packages.
 * Supports publishing, searching, versioned installs, and
 * dependency resolution.
 *
 * In production, this would be backed by a database and CDN.
 *
 * @version 1.0.0
 */

import {
  MarketplaceSubmission,
  PackageMetadata,
  ContentCategory,
  SemanticVersion,
  Publisher,
} from './MarketplaceSubmission';
import { SafetyReport, SafetyVerdict } from '@holoscript/core';
import { PlatformTarget } from '@holoscript/core';

// =============================================================================
// REGISTRY TYPES
// =============================================================================

/** A published package listing */
export interface PackageListing {
  /** Package metadata */
  metadata: PackageMetadata;
  /** Safety report from verification */
  safetyReport: SafetyReport;
  /** Download count */
  downloads: number;
  /** Rating (0-5) */
  rating: number;
  /** Number of reviews */
  reviewCount: number;
  /** Published versions */
  versions: SemanticVersion[];
  /** Featured flag */
  featured: boolean;
  /** Published timestamp */
  publishedAt: string;
}

/** Search filters */
export interface SearchFilters {
  query?: string;
  category?: ContentCategory;
  publisher?: string;
  platform?: PlatformTarget;
  minRating?: number;
  safetyVerdict?: SafetyVerdict;
  tags?: string[];
  featured?: boolean;
  sortBy?: 'downloads' | 'rating' | 'recent' | 'name';
  limit?: number;
  offset?: number;
}

/** Search result */
export interface SearchResult {
  listings: PackageListing[];
  total: number;
  offset: number;
  limit: number;
}

/** Install manifest — what gets deployed to a HoloLand world */
export interface InstallManifest {
  packageId: string;
  version: SemanticVersion;
  safetyVerdict: SafetyVerdict;
  dangerScore: number;
  requiredCapabilities: string[];
  targetPlatforms: PlatformTarget[];
  dependencies: { id: string; version: string }[];
  installedAt: string;
}

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * MarketplaceRegistry — the HoloScript package store.
 */
export class MarketplaceRegistry {
  private packages: Map<string, PackageListing> = new Map();
  private installed: Map<string, InstallManifest> = new Map(); // worldId:pkgId → manifest

  /**
   * Publish a verified submission to the registry.
   */
  publish(submission: MarketplaceSubmission): PackageListing {
    if (submission.status !== 'published') {
      throw new Error(`Cannot register: submission status is '${submission.status}'`);
    }
    if (!submission.safetyReport) {
      throw new Error('Cannot register: no safety report');
    }

    const listing: PackageListing = {
      metadata: submission.package.metadata,
      safetyReport: submission.safetyReport,
      downloads: 0,
      rating: 0,
      reviewCount: 0,
      versions: [submission.package.metadata.version],
      featured: false,
      publishedAt: submission.publishedAt || new Date().toISOString(),
    };

    this.packages.set(submission.package.metadata.id, listing);
    return listing;
  }

  /**
   * Get a package listing by ID.
   */
  get(packageId: string): PackageListing | undefined {
    return this.packages.get(packageId);
  }

  /**
   * Search the registry.
   */
  search(filters: SearchFilters = {}): SearchResult {
    let results = [...this.packages.values()];

    // Text search (name, description, tags)
    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.metadata.name.toLowerCase().includes(q) ||
          p.metadata.description.toLowerCase().includes(q) ||
          p.metadata.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (filters.category) {
      results = results.filter((p) => p.metadata.category === filters.category);
    }

    // Publisher filter
    if (filters.publisher) {
      results = results.filter((p) => p.metadata.publisher.id === filters.publisher);
    }

    // Platform filter
    if (filters.platform) {
      results = results.filter((p) => p.metadata.platforms.includes(filters.platform!));
    }

    // Rating filter
    if (filters.minRating !== undefined) {
      results = results.filter((p) => p.rating >= filters.minRating!);
    }

    // Safety verdict filter
    if (filters.safetyVerdict) {
      results = results.filter((p) => p.safetyReport.verdict === filters.safetyVerdict);
    }

    // Tags filter
    if (filters.tags?.length) {
      results = results.filter((p) => filters.tags!.some((t) => p.metadata.tags.includes(t)));
    }

    // Featured filter
    if (filters.featured !== undefined) {
      results = results.filter((p) => p.featured === filters.featured);
    }

    const total = results.length;

    // Sort
    const sortBy = filters.sortBy || 'downloads';
    results.sort((a, b) => {
      switch (sortBy) {
        case 'downloads':
          return b.downloads - a.downloads;
        case 'rating':
          return b.rating - a.rating;
        case 'recent':
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        case 'name':
          return a.metadata.name.localeCompare(b.metadata.name);
        default:
          return 0;
      }
    });

    // Pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    results = results.slice(offset, offset + limit);

    return { listings: results, total, offset, limit };
  }

  /**
   * Install a package into a HoloLand world.
   */
  install(packageId: string, worldId: string): InstallManifest {
    const listing = this.packages.get(packageId);
    if (!listing) throw new Error(`Package '${packageId}' not found`);

    listing.downloads++;

    const manifest: InstallManifest = {
      packageId: listing.metadata.id,
      version: listing.metadata.version,
      safetyVerdict: listing.safetyReport.verdict,
      dangerScore: listing.safetyReport.dangerScore,
      requiredCapabilities: listing.safetyReport.capabilities.required.map((r) => r.scope),
      targetPlatforms: listing.metadata.platforms,
      dependencies: listing.metadata.dependencies,
      installedAt: new Date().toISOString(),
    };

    this.installed.set(`${worldId}:${packageId}`, manifest);
    return manifest;
  }

  /**
   * Uninstall a package from a world.
   */
  uninstall(packageId: string, worldId: string): boolean {
    return this.installed.delete(`${worldId}:${packageId}`);
  }

  /**
   * Get installed packages for a world.
   */
  getInstalled(worldId: string): InstallManifest[] {
    const results: InstallManifest[] = [];
    for (const [key, manifest] of this.installed) {
      if (key.startsWith(`${worldId}:`)) results.push(manifest);
    }
    return results;
  }

  /**
   * Rate a package.
   */
  rate(packageId: string, rating: number): boolean {
    const listing = this.packages.get(packageId);
    if (!listing || rating < 0 || rating > 5) return false;
    // Simple running average
    const total = listing.rating * listing.reviewCount + rating;
    listing.reviewCount++;
    listing.rating = total / listing.reviewCount;
    return true;
  }

  /**
   * Feature/unfeature a package.
   */
  setFeatured(packageId: string, featured: boolean): boolean {
    const listing = this.packages.get(packageId);
    if (!listing) return false;
    listing.featured = featured;
    return true;
  }

  /**
   * Get registry statistics.
   */
  stats(): {
    totalPackages: number;
    totalDownloads: number;
    totalInstalls: number;
    categories: Record<string, number>;
  } {
    let totalDownloads = 0;
    const categories: Record<string, number> = {};
    for (const p of this.packages.values()) {
      totalDownloads += p.downloads;
      categories[p.metadata.category] = (categories[p.metadata.category] || 0) + 1;
    }
    return {
      totalPackages: this.packages.size,
      totalDownloads,
      totalInstalls: this.installed.size,
      categories,
    };
  }
}
