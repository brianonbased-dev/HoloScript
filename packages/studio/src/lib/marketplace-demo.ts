/**
 * marketplace-demo — studio-local in-memory marketplace for the Marketplace panel.
 *
 * WHY THIS EXISTS (2026-05-31): the marketplace registry/submission helpers used
 * to be imported from `@holoscript/platform`. The `core -> platform ->
 * marketplace-api` circular-dependency refactor moved those symbols out of
 * platform (they now live in `@holoscript/marketplace-api`, a Postgres/express
 * SERVER package). Studio's Marketplace panel is a client-side demo with
 * hardcoded seeds — it must not bundle the marketplace server package into the
 * browser, and `@holoscript/platform` is already replaced with an empty stub in
 * studio's webpack/turbopack config (next.config.js), so the old import resolved
 * to `undefined` at runtime anyway.
 *
 * This module is the studio-owned, dependency-free demo equivalent — matching
 * the studio-local pattern already used by PluginMarketplacePanel (local types +
 * fetch, no heavy @holoscript runtime import). It has NO dependency on
 * @holoscript/core's safety-pass machinery; demo submissions verify as `safe`.
 * The canonical, server-backed marketplace lives in @holoscript/marketplace-api.
 */

// =============================================================================
// PACKAGE TYPES (studio-local mirror of the marketplace content model)
// =============================================================================

/** Categories of marketplace content */
export type ContentCategory =
  | 'world'
  | 'object'
  | 'agent'
  | 'trait'
  | 'shader'
  | 'vfx'
  | 'audio'
  | 'template'
  | 'plugin';

/** Target platform identifier (kept permissive for demo seed data) */
export type PlatformTarget = string;

/** Safety verdict for a package */
export type SafetyVerdict = 'safe' | 'warnings' | 'unsafe';

/** Minimal safety report — only the fields the Marketplace panel reads */
export interface SafetyReport {
  verdict: SafetyVerdict;
  dangerScore: number;
  capabilities: {
    required: { scope: string }[];
    missing: { scope: string }[];
  };
}

/** Version following semver */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Publisher identity */
export interface Publisher {
  id: string;
  name: string;
  did: string;
  verified: boolean;
  trustLevel: 'new' | 'verified' | 'trusted' | 'official';
}

/** Package metadata */
export interface PackageMetadata {
  id: string;
  name: string;
  description: string;
  category: ContentCategory;
  version: SemanticVersion;
  publisher: Publisher;
  tags: string[];
  platforms: PlatformTarget[];
  license: string;
  dependencies: { id: string; version: string }[];
  createdAt: string;
  updatedAt: string;
}

/** A node in a packaged creation (loosely typed — demo data only) */
export interface PackageASTNode {
  type: string;
  name: string;
  traits: string[];
  calls: unknown[];
  declaredEffects: string[];
}

/** A marketplace package ready for submission */
export interface MarketplacePackage {
  metadata: PackageMetadata;
  nodes: PackageASTNode[];
  assets: { path: string; sizeBytes: number; hash: string }[];
  bundleSizeBytes: number;
}

// =============================================================================
// SUBMISSION PIPELINE
// =============================================================================

/** Submission status */
export type SubmissionStatus =
  | 'draft'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'published'
  | 'delisted';

/** A marketplace submission */
export interface MarketplaceSubmission {
  id: string;
  package: MarketplacePackage;
  status: SubmissionStatus;
  safetyReport?: SafetyReport;
  rejectionReasons?: string[];
  submittedAt: string;
  verifiedAt?: string;
  publishedAt?: string;
}

/** Max demo bundle size (50MB) */
const MAX_BUNDLE_SIZE = 50 * 1024 * 1024;

/**
 * Step 1: Package — create a submission from a package.
 */
export function createSubmission(pkg: MarketplacePackage): MarketplaceSubmission {
  return {
    id: `sub_${Date.now()}_${pkg.metadata.id}`,
    package: pkg,
    status: 'draft',
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Step 2: Verify — demo verification. Performs basic structural checks and,
 * absent the compile-time safety pass (which lives in @holoscript/core and is
 * not bundled into the browser), marks well-formed packages as `safe`.
 */
export function verifySubmission(submission: MarketplaceSubmission): MarketplaceSubmission {
  submission.status = 'verifying';

  const rejections: string[] = [];
  if (submission.package.bundleSizeBytes > MAX_BUNDLE_SIZE) {
    rejections.push(
      `Bundle too large: ${(submission.package.bundleSizeBytes / 1024 / 1024).toFixed(1)}MB > ${MAX_BUNDLE_SIZE / 1024 / 1024}MB limit`
    );
  }
  if (!submission.package.metadata.name) rejections.push('Missing package name');
  if (!submission.package.metadata.publisher.id) rejections.push('Missing publisher ID');

  if (rejections.length > 0) {
    submission.status = 'rejected';
    submission.rejectionReasons = rejections;
    return submission;
  }

  submission.safetyReport = {
    verdict: 'safe',
    dangerScore: 0,
    capabilities: { required: [], missing: [] },
  };
  submission.status = 'verified';
  submission.verifiedAt = new Date().toISOString();
  return submission;
}

/**
 * Step 3: Publish — move a verified submission to published.
 */
export function publishSubmission(submission: MarketplaceSubmission): MarketplaceSubmission {
  if (submission.status !== 'verified') {
    throw new Error(`Cannot publish: status is '${submission.status}', expected 'verified'`);
  }
  submission.status = 'published';
  submission.publishedAt = new Date().toISOString();
  return submission;
}

// =============================================================================
// REGISTRY
// =============================================================================

/** A published package listing */
export interface PackageListing {
  metadata: PackageMetadata;
  safetyReport: SafetyReport;
  downloads: number;
  rating: number;
  reviewCount: number;
  versions: SemanticVersion[];
  featured: boolean;
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
export interface MarketplaceSearchResult {
  listings: PackageListing[];
  total: number;
  offset: number;
  limit: number;
}

/** Install manifest — what gets deployed to a world */
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

/** Default safe report synthesized for demo seeds that omit one */
function defaultSafetyReport(): SafetyReport {
  return { verdict: 'safe', dangerScore: 0, capabilities: { required: [], missing: [] } };
}

/**
 * MarketplaceRegistry — studio-local in-memory package store for the demo panel.
 */
export class MarketplaceRegistry {
  private packages: Map<string, PackageListing> = new Map();
  private installed: Map<string, InstallManifest> = new Map(); // worldId:pkgId -> manifest

  /** Publish a submission to the registry. Demo seeds may omit a safety report; one is synthesized. */
  publish(submission: MarketplaceSubmission): PackageListing {
    const listing: PackageListing = {
      metadata: submission.package.metadata,
      safetyReport: submission.safetyReport ?? defaultSafetyReport(),
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

  /** Get a package listing by ID. */
  get(packageId: string): PackageListing | undefined {
    return this.packages.get(packageId);
  }

  /** Search the registry. */
  search(filters: SearchFilters = {}): MarketplaceSearchResult {
    let results = [...this.packages.values()];

    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.metadata.name.toLowerCase().includes(q) ||
          p.metadata.description.toLowerCase().includes(q) ||
          p.metadata.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (filters.category) {
      results = results.filter((p) => p.metadata.category === filters.category);
    }
    if (filters.publisher) {
      results = results.filter((p) => p.metadata.publisher.id === filters.publisher);
    }
    if (filters.platform) {
      results = results.filter((p) => p.metadata.platforms.includes(filters.platform!));
    }
    if (filters.minRating !== undefined) {
      results = results.filter((p) => p.rating >= filters.minRating!);
    }
    if (filters.safetyVerdict) {
      results = results.filter((p) => p.safetyReport.verdict === filters.safetyVerdict);
    }
    if (filters.tags?.length) {
      results = results.filter((p) => filters.tags!.some((t) => p.metadata.tags.includes(t)));
    }
    if (filters.featured !== undefined) {
      results = results.filter((p) => p.featured === filters.featured);
    }

    const total = results.length;

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

    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    results = results.slice(offset, offset + limit);

    return { listings: results, total, offset, limit };
  }

  /** Install a package into a world. */
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

  /** Uninstall a package from a world. */
  uninstall(packageId: string, worldId: string): boolean {
    return this.installed.delete(`${worldId}:${packageId}`);
  }

  /** Get installed packages for a world. */
  getInstalled(worldId: string): InstallManifest[] {
    const results: InstallManifest[] = [];
    for (const [key, manifest] of this.installed) {
      if (key.startsWith(`${worldId}:`)) results.push(manifest);
    }
    return results;
  }

  /** Rate a package (running average). */
  rate(packageId: string, rating: number): boolean {
    const listing = this.packages.get(packageId);
    if (!listing || rating < 0 || rating > 5) return false;
    const total = listing.rating * listing.reviewCount + rating;
    listing.reviewCount++;
    listing.rating = total / listing.reviewCount;
    return true;
  }

  /** Feature/unfeature a package. */
  setFeatured(packageId: string, featured: boolean): boolean {
    const listing = this.packages.get(packageId);
    if (!listing) return false;
    listing.featured = featured;
    return true;
  }

  /** Registry statistics. */
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
