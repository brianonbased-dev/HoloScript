/**
 * @fileoverview Plugin Marketplace Service - Core registry API for plugin packages
 *
 * Provides the full lifecycle for Studio plugin distribution:
 *   - Publishing (with validation, signature verification, and indexing)
 *   - Discovery (search, browse, featured/popular/recent/trending)
 *   - Version management
 *   - Download tracking
 *   - Rating and review system
 *   - Author profiles
 *
 * This service is the server-side counterpart to the client-side
 * PluginInstallPipeline, which handles download and installation.
 *
 * @module marketplace-api/PluginMarketplaceService
 */

import { createHash } from 'crypto';
import type {
  PluginPackageManifest,
  PluginSummary,
  PluginVersionInfo,
  PluginSearchQuery,
  PluginSearchResult,
  PluginSearchFacets,
  PluginPublishRequest,
  PluginPublishResult,
  PluginDetailData,
  PluginDownloadStats,
  PluginRatingData,
  PluginReview,
  PluginCategory,
  MarketplaceHomeData,
  AuthorProfileData,
  IPluginMarketplaceAPI,
  SignatureVerificationResult,
} from './PluginPackageSpec.js';
import type { Author, RateLimitTier } from './types.js';
import { RATE_LIMITS } from './types.js';
import { PluginSignatureService } from './PluginSignatureService.js';
import { VerificationService, RateLimiter, SpamDetector } from './VerificationService.js';

// =============================================================================
// PLUGIN DATABASE INTERFACE
// =============================================================================

/**
 * Abstract storage interface for plugin packages.
 * Can be backed by Postgres, in-memory, or any other store.
 */
export interface IPluginDatabase {
  insertPlugin(plugin: PluginPackageManifest): Promise<void>;
  updatePlugin(id: string, updates: Partial<PluginPackageManifest>): Promise<void>;
  deletePlugin(id: string): Promise<void>;
  deletePluginVersion(id: string, version: string): Promise<void>;

  getPluginById(id: string): Promise<PluginPackageManifest | null>;
  getPluginVersion(id: string, version: string): Promise<PluginPackageManifest | null>;
  getPluginVersions(id: string): Promise<PluginVersionInfo[]>;

  search(query: PluginSearchQuery): Promise<PluginSearchResult>;
  getFacets(query: PluginSearchQuery): Promise<PluginSearchFacets>;

  incrementDownloads(pluginId: string, version: string): Promise<void>;
  getPopular(category?: PluginCategory, limit?: number): Promise<PluginSummary[]>;
  getRecent(limit?: number): Promise<PluginSummary[]>;
  getTrending(limit?: number): Promise<PluginSummary[]>;
  getFeatured(limit?: number): Promise<PluginSummary[]>;
}

// =============================================================================
// IN-MEMORY PLUGIN DATABASE
// =============================================================================

/**
 * In-memory implementation for development and testing
 */
export class InMemoryPluginDatabase implements IPluginDatabase {
  private plugins: Map<string, PluginPackageManifest> = new Map();
  private versions: Map<string, Map<string, PluginPackageManifest>> = new Map();
  private featured: Set<string> = new Set();
  private bundleStore: Map<string, string> = new Map(); // pluginId@version -> bundle base64

  async insertPlugin(plugin: PluginPackageManifest): Promise<void> {
    this.plugins.set(plugin.id, plugin);

    if (!this.versions.has(plugin.id)) {
      this.versions.set(plugin.id, new Map());
    }
    this.versions.get(plugin.id)!.set(plugin.version, { ...plugin });
  }

  async updatePlugin(id: string, updates: Partial<PluginPackageManifest>): Promise<void> {
    const existing = this.plugins.get(id);
    if (!existing) throw new Error(`Plugin ${id} not found`);
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.plugins.set(id, updated);
  }

  async deletePlugin(id: string): Promise<void> {
    this.plugins.delete(id);
    this.versions.delete(id);
    this.featured.delete(id);
  }

  async deletePluginVersion(id: string, version: string): Promise<void> {
    this.versions.get(id)?.delete(version);
    this.bundleStore.delete(`${id}@${version}`);

    if (this.versions.get(id)?.size === 0) {
      this.plugins.delete(id);
      this.versions.delete(id);
    }
  }

  async getPluginById(id: string): Promise<PluginPackageManifest | null> {
    return this.plugins.get(id) ?? null;
  }

  async getPluginVersion(id: string, version: string): Promise<PluginPackageManifest | null> {
    return this.versions.get(id)?.get(version) ?? null;
  }

  async getPluginVersions(id: string): Promise<PluginVersionInfo[]> {
    const versionMap = this.versions.get(id);
    if (!versionMap) return [];

    return Array.from(versionMap.values()).map((pkg) => {
      const bundleKey = `${pkg.id}@${pkg.version}`;
      const bundle = this.bundleStore.get(bundleKey) ?? '';
      const shasum = createHash('sha256').update(bundle).digest('hex');

      return {
        version: pkg.version,
        publishedAt: pkg.publishedAt ?? new Date(),
        publishedBy: pkg.author.name,
        downloads: pkg.downloads ?? 0,
        deprecated: pkg.deprecated ?? false,
        packageUrl: `/api/plugins/${pkg.id}/versions/${pkg.version}/download`,
        shasum,
        size: Buffer.byteLength(bundle, 'base64'),
        signatureStatus: 'unsigned' as const, // Would check actual signature in production
        studioVersion: pkg.compatibility.studioVersion,
        releaseNotes: undefined,
      };
    });
  }

  /** Store the raw bundle for a version */
  storeBundle(pluginId: string, version: string, bundle: string): void {
    this.bundleStore.set(`${pluginId}@${version}`, bundle);
  }

  /** Mark a plugin as featured */
  setFeatured(pluginId: string, isFeatured: boolean): void {
    if (isFeatured) {
      this.featured.add(pluginId);
    } else {
      this.featured.delete(pluginId);
    }
  }

  async search(query: PluginSearchQuery): Promise<PluginSearchResult> {
    let results = Array.from(this.plugins.values());

    // Apply filters
    if (query.q) {
      const q = query.q.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.keywords.some((k) => k.toLowerCase().includes(q)) ||
          p.id.toLowerCase().includes(q)
      );
    }

    if (query.category) {
      results = results.filter((p) => p.category === query.category);
    }

    if (query.platform) {
      const platforms = query.platform;
      results = results.filter(
        (p) =>
          p.compatibility.platforms?.includes(platforms) ||
          p.compatibility.platforms?.includes('all') ||
          !p.compatibility.platforms
      );
    }

    if (query.author) {
      results = results.filter((p) =>
        p.author.name.toLowerCase().includes(query.author!.toLowerCase())
      );
    }

    if (query.keywords?.length) {
      results = results.filter((p) => query.keywords!.some((k) => p.keywords.includes(k)));
    }

    if (query.pricingModel) {
      results = results.filter((p) => p.pricing?.model === query.pricingModel);
    }

    if (query.maxPrice !== undefined) {
      results = results.filter((p) => !p.pricing?.price || p.pricing.price <= query.maxPrice!);
    }

    if (query.verified !== undefined) {
      results = results.filter((p) => (p.verified ?? false) === query.verified);
    }

    if (query.permission) {
      results = results.filter((p) => p.security.permissions.includes(query.permission!));
    }

    if (query.excludeDeprecated !== false) {
      results = results.filter((p) => !p.deprecated);
    }

    if (query.minRating !== undefined) {
      results = results.filter((p) => (p.rating ?? 0) >= query.minRating!);
    }

    if (query.minDownloads !== undefined) {
      results = results.filter((p) => (p.downloads ?? 0) >= query.minDownloads!);
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
    const summaries: PluginSummary[] = paginatedResults.map((p) => this.toSummary(p));

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
    results: PluginPackageManifest[],
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ): PluginPackageManifest[] {
    const sorted = [...results];
    const order = sortOrder === 'asc' ? 1 : -1;

    switch (sortBy) {
      case 'downloads':
        sorted.sort((a, b) => ((a.downloads ?? 0) - (b.downloads ?? 0)) * order);
        break;
      case 'rating':
        sorted.sort((a, b) => ((a.rating ?? 0) - (b.rating ?? 0)) * order);
        break;
      case 'updated':
        sorted.sort(
          (a, b) => ((a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0)) * order
        );
        break;
      case 'created':
        sorted.sort(
          (a, b) => ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)) * order
        );
        break;
      case 'price':
        sorted.sort((a, b) => ((a.pricing?.price ?? 0) - (b.pricing?.price ?? 0)) * order);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name) * order);
        break;
      case 'relevance':
      default:
        break;
    }

    return sorted;
  }

  private toSummary(p: PluginPackageManifest): PluginSummary {
    return {
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      author: {
        name: p.author.name,
        verified: p.author.verified,
        avatarUrl: p.author.avatarUrl,
      },
      category: p.category,
      keywords: p.keywords,
      iconUrl: p.icon ? `/api/plugins/${p.id}/icon` : undefined,
      pricing: p.pricing,
      downloads: p.downloads ?? 0,
      rating: p.rating ?? 0,
      ratingCount: p.ratingCount ?? 0,
      verified: p.verified ?? false,
      deprecated: p.deprecated ?? false,
      signatureStatus: 'unsigned',
      platforms: p.compatibility.platforms ?? ['all'],
      permissions: p.security.permissions,
      updatedAt: p.updatedAt ?? new Date(),
      createdAt: p.createdAt ?? new Date(),
    };
  }

  async getFacets(_query: PluginSearchQuery): Promise<PluginSearchFacets> {
    const allPlugins = Array.from(this.plugins.values());
    const categoryCount = new Map<string, number>();
    const platformCount = new Map<string, number>();
    const pricingCount = new Map<string, number>();
    const permissionCount = new Map<string, number>();
    const authorCount = new Map<string, number>();

    for (const plugin of allPlugins) {
      categoryCount.set(plugin.category, (categoryCount.get(plugin.category) ?? 0) + 1);

      for (const platform of plugin.compatibility.platforms ?? ['all']) {
        platformCount.set(platform, (platformCount.get(platform) ?? 0) + 1);
      }

      const pricing = plugin.pricing?.model ?? 'free';
      pricingCount.set(pricing, (pricingCount.get(pricing) ?? 0) + 1);

      for (const perm of plugin.security.permissions) {
        permissionCount.set(perm, (permissionCount.get(perm) ?? 0) + 1);
      }

      authorCount.set(plugin.author.name, (authorCount.get(plugin.author.name) ?? 0) + 1);
    }

    const toFacetArray = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);

    return {
      categories: toFacetArray(categoryCount),
      platforms: toFacetArray(platformCount),
      pricingModels: toFacetArray(pricingCount),
      permissions: toFacetArray(permissionCount),
      authors: toFacetArray(authorCount).slice(0, 10),
    };
  }

  async incrementDownloads(pluginId: string, version: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.downloads = (plugin.downloads ?? 0) + 1;
    }
    const versionPkg = this.versions.get(pluginId)?.get(version);
    if (versionPkg) {
      versionPkg.downloads = (versionPkg.downloads ?? 0) + 1;
    }
  }

  async getPopular(category?: PluginCategory, limit = 10): Promise<PluginSummary[]> {
    let plugins = Array.from(this.plugins.values());
    if (category) plugins = plugins.filter((p) => p.category === category);
    plugins.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));
    return plugins.slice(0, limit).map((p) => this.toSummary(p));
  }

  async getRecent(limit = 10): Promise<PluginSummary[]> {
    const plugins = Array.from(this.plugins.values()).sort(
      (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)
    );
    return plugins.slice(0, limit).map((p) => this.toSummary(p));
  }

  async getTrending(limit = 10): Promise<PluginSummary[]> {
    // Simple trending: sort by downloads (in production, would use weekly growth rate)
    return this.getPopular(undefined, limit);
  }

  async getFeatured(limit = 10): Promise<PluginSummary[]> {
    const plugins = Array.from(this.plugins.values()).filter((p) => this.featured.has(p.id));
    return plugins.slice(0, limit).map((p) => this.toSummary(p));
  }
}

// =============================================================================
// PLUGIN DOWNLOAD STATS TRACKER
// =============================================================================

/**
 * Tracks per-plugin download statistics
 */
export class PluginDownloadStatsTracker {
  private dailyCounts: Map<string, Map<string, number>> = new Map();
  private totalCounts: Map<string, number> = new Map();

  record(pluginId: string, _version: string): void {
    const today = new Date().toISOString().split('T')[0];

    if (!this.dailyCounts.has(pluginId)) {
      this.dailyCounts.set(pluginId, new Map());
    }
    const dailyMap = this.dailyCounts.get(pluginId)!;
    dailyMap.set(today, (dailyMap.get(today) ?? 0) + 1);
    this.totalCounts.set(pluginId, (this.totalCounts.get(pluginId) ?? 0) + 1);
  }

  getStats(pluginId: string): PluginDownloadStats {
    const dailyMap = this.dailyCounts.get(pluginId) ?? new Map();
    const total = this.totalCounts.get(pluginId) ?? 0;
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    let lastDay = 0;
    let lastWeek = 0;
    let lastMonth = 0;
    const history: Array<{ date: string; count: number }> = [];

    for (const [dateStr, count] of dailyMap.entries()) {
      const date = new Date(dateStr);
      const diff = now.getTime() - date.getTime();
      if (diff <= oneDay) lastDay += count;
      if (diff <= 7 * oneDay) lastWeek += count;
      if (diff <= 30 * oneDay) lastMonth += count;
      if (diff <= 90 * oneDay) {
        history.push({ date: dateStr, count });
      }
    }

    history.sort((a, b) => a.date.localeCompare(b.date));

    return { total, lastDay, lastWeek, lastMonth, history };
  }
}

// =============================================================================
// PLUGIN RATING SERVICE
// =============================================================================

/**
 * Manages plugin ratings and reviews
 */
export class PluginRatingService {
  private ratings: Map<string, Map<string, PluginReview>> = new Map();
  private spamDetector: SpamDetector;

  constructor() {
    this.spamDetector = new SpamDetector();
  }

  async rate(
    pluginId: string,
    userId: string,
    userName: string,
    rating: number,
    review?: { title?: string; body?: string },
    pluginVersion?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return { success: false, error: 'Rating must be an integer between 1 and 5' };
    }

    if (review?.body) {
      const spamCheck = this.spamDetector.isSpam(userId, review.body);
      if (spamCheck.isSpam) {
        return { success: false, error: `Review rejected: ${spamCheck.reason}` };
      }
    }

    if (!this.ratings.has(pluginId)) {
      this.ratings.set(pluginId, new Map());
    }

    const existing = this.ratings.get(pluginId)!.get(userId);
    const now = new Date();

    this.ratings.get(pluginId)!.set(userId, {
      id:
        existing?.id ??
        `review_${createHash('sha256').update(`${pluginId}:${userId}`).digest('hex').slice(0, 12)}`,
      userId,
      userName,
      rating,
      title: review?.title,
      body: review?.body,
      pluginVersion: pluginVersion ?? 'unknown',
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
      helpfulCount: existing?.helpfulCount ?? 0,
    });

    return { success: true };
  }

  getRatingData(pluginId: string, page = 1, limit = 20): PluginRatingData {
    const ratingsMap = this.ratings.get(pluginId);
    if (!ratingsMap || ratingsMap.size === 0) {
      return {
        average: 0,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        reviews: [],
      };
    }

    const allRatings = Array.from(ratingsMap.values());
    const sum = allRatings.reduce((acc, r) => acc + r.rating, 0);
    const average = Math.round((sum / allRatings.length) * 10) / 10;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of allRatings) {
      distribution[r.rating as keyof typeof distribution]++;
    }

    const startIndex = (page - 1) * limit;
    const reviews = allRatings
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(startIndex, startIndex + limit);

    return { average, count: allRatings.length, distribution, reviews };
  }

  getAverageRating(pluginId: string): { average: number; count: number } {
    const data = this.getRatingData(pluginId);
    return { average: data.average, count: data.count };
  }
}

// =============================================================================
// PLUGIN MARKETPLACE SERVICE
// =============================================================================

/**
 * Main Plugin Marketplace Service implementing the full plugin lifecycle API.
 *
 * Integrates:
 *   - Plugin registry (CRUD, search, browse)
 *   - Digital signature verification
 *   - Source code security scanning
 *   - Download tracking
 *   - Rating and review system
 *   - Rate limiting
 *
 * @example
 * ```typescript
 * const marketplace = new PluginMarketplaceService();
 *
 * // Register session (auth)
 * marketplace.registerSession('token-123', 'author-1', 'authenticated');
 *
 * // Publish a plugin
 * const result = await marketplace.publishPlugin({
 *   manifest: { ... },
 *   bundle: '<base64 bundle>',
 *   signature: { signature: '...', publicKey: '...' },
 * }, 'token-123');
 *
 * // Search plugins
 * const results = await marketplace.searchPlugins({ q: 'analytics', category: 'editor' });
 * ```
 */
export class PluginMarketplaceService implements IPluginMarketplaceAPI {
  private db: IPluginDatabase;
  private signatureService: PluginSignatureService;
  private verificationService: VerificationService;
  private downloadStats: PluginDownloadStatsTracker;
  private ratingService: PluginRatingService;
  private rateLimiters: Map<RateLimitTier, RateLimiter> = new Map();
  private sessions: Map<string, { userId: string; userName: string; tier: RateLimitTier }> =
    new Map();

  constructor(
    options: {
      database?: IPluginDatabase;
      signatureService?: PluginSignatureService;
    } = {}
  ) {
    this.db = options.database ?? new InMemoryPluginDatabase();
    this.signatureService = options.signatureService ?? new PluginSignatureService();
    this.verificationService = new VerificationService();
    this.downloadStats = new PluginDownloadStatsTracker();
    this.ratingService = new PluginRatingService();

    for (const [tier, limit] of Object.entries(RATE_LIMITS)) {
      this.rateLimiters.set(tier as RateLimitTier, new RateLimiter(60 * 60 * 1000, limit));
    }
  }

  // ── Auth Helpers ────────────────────────────────────────────────────────

  private getUser(token: string): { userId: string; userName: string; tier: RateLimitTier } | null {
    return this.sessions.get(token) ?? null;
  }

  registerSession(
    token: string,
    userId: string,
    tier: RateLimitTier = 'authenticated',
    userName?: string
  ): void {
    this.sessions.set(token, { userId, userName: userName ?? userId, tier });
  }

  /** Expose signature service for route handlers */
  getSignatureService(): PluginSignatureService {
    return this.signatureService;
  }

  // ── Publishing ──────────────────────────────────────────────────────────

  async publishPlugin(request: PluginPublishRequest, token: string): Promise<PluginPublishResult> {
    const user = this.getUser(token);
    if (!user) {
      return {
        success: false,
        pluginId: '',
        version: '',
        packageUrl: '',
        shasum: '',
        errors: ['Authentication required'],
      };
    }

    const manifest = request.manifest;
    const warnings: string[] = [];

    // Validate manifest
    const validationErrors = this.validateManifest(manifest);
    if (validationErrors.length > 0) {
      return {
        success: false,
        pluginId: manifest.id ?? '',
        version: manifest.version ?? '',
        packageUrl: '',
        shasum: '',
        errors: validationErrors,
      };
    }

    // Check for existing plugin ownership
    const existing = await this.db.getPluginById(manifest.id);
    if (existing) {
      if (existing.author.name !== user.userName) {
        return {
          success: false,
          pluginId: manifest.id,
          version: manifest.version,
          packageUrl: '',
          shasum: '',
          errors: [`You don't have permission to publish to plugin '${manifest.id}'`],
        };
      }

      // Check for duplicate version
      const existingVersion = await this.db.getPluginVersion(manifest.id, manifest.version);
      if (existingVersion) {
        return {
          success: false,
          pluginId: manifest.id,
          version: manifest.version,
          packageUrl: '',
          shasum: '',
          errors: [`Version ${manifest.version} already exists. Bump the version to publish.`],
        };
      }
    }

    // Verify signature (if provided)
    let signatureVerification: SignatureVerificationResult | undefined;
    if (request.signature) {
      const bundleHash = this.signatureService.computeContentHash(request.bundle);
      const sig = {
        algorithm: 'Ed25519' as const,
        signature: request.signature.signature,
        publicKey: request.signature.publicKey,
        keyFingerprint: this.signatureService.computeFingerprint(request.signature.publicKey),
        signedAt: new Date().toISOString(),
        keyId: request.signature.keyId,
      };

      signatureVerification = await this.signatureService.verifySignature(bundleHash, sig);

      if (!signatureVerification.valid) {
        return {
          success: false,
          pluginId: manifest.id,
          version: manifest.version,
          packageUrl: '',
          shasum: '',
          signatureVerification,
          errors: ['Signature verification failed: ' + signatureVerification.errors.join('; ')],
        };
      }

      if (signatureVerification.warnings.length > 0) {
        warnings.push(...signatureVerification.warnings);
      }
    } else {
      warnings.push('Plugin is unsigned. Consider signing for better trust and discoverability.');
    }

    // Compute SHA-256 of the bundle
    const shasum = createHash('sha256').update(request.bundle).digest('hex');
    const packageUrl = `/api/plugins/${manifest.id}/versions/${manifest.version}/download`;

    // Build the full manifest with server-populated fields
    const now = new Date();
    const fullManifest: PluginPackageManifest = {
      $schema: 'https://holoscript.dev/schemas/plugin-manifest/v1',
      ...manifest,
      author: {
        ...manifest.author,
        verified: manifest.author.verified ?? false,
      },
      readme: request.readme ?? manifest.readme,
      changelog: request.changelog ?? manifest.changelog,
      downloads: existing?.downloads ?? 0,
      rating: existing?.rating ?? 0,
      ratingCount: existing?.ratingCount ?? 0,
      verified: existing?.verified ?? false,
      deprecated: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      publishedAt: now,
    };

    // Store manifest
    await this.db.insertPlugin(fullManifest);

    // Store bundle in the database (in-memory for dev)
    if (this.db instanceof InMemoryPluginDatabase) {
      this.db.storeBundle(manifest.id, manifest.version, request.bundle);
    }

    // Warnings for missing optional fields
    if (!request.readme && !manifest.readme) {
      warnings.push('No README provided. Consider adding documentation.');
    }

    if (!manifest.screenshots?.length) {
      warnings.push('No screenshots provided. Plugins with screenshots get more downloads.');
    }

    return {
      success: true,
      pluginId: manifest.id,
      version: manifest.version,
      packageUrl,
      shasum,
      signatureVerification,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async unpublishPlugin(pluginId: string, version?: string, token?: string): Promise<void> {
    const user = this.getUser(token ?? '');
    if (!user) throw new Error('Authentication required');

    const plugin = await this.db.getPluginById(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    if (plugin.author.name !== user.userName) {
      throw new Error(`You don't have permission to unpublish '${pluginId}'`);
    }

    if (version) {
      await this.db.deletePluginVersion(pluginId, version);
    } else {
      await this.db.deletePlugin(pluginId);
    }
  }

  async deprecatePlugin(
    pluginId: string,
    message: string,
    replacement?: string,
    token?: string
  ): Promise<void> {
    const user = this.getUser(token ?? '');
    if (!user) throw new Error('Authentication required');

    const plugin = await this.db.getPluginById(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    await this.db.updatePlugin(pluginId, {
      deprecated: true,
      deprecationMessage: message + (replacement ? ` Use ${replacement} instead.` : ''),
    });
  }

  // ── Manifest Validation ─────────────────────────────────────────────────

  private validateManifest(manifest: Partial<PluginPublishRequest['manifest']>): string[] {
    const errors: string[] = [];

    if (!manifest.id || manifest.id.length < 3) {
      errors.push('Plugin ID must be at least 3 characters');
    }

    if (manifest.id && !/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-_.]*$/.test(manifest.id)) {
      errors.push(
        'Plugin ID must be lowercase alphanumeric with optional scope (e.g., "@author/plugin-name")'
      );
    }

    if (!manifest.name || manifest.name.length < 2) {
      errors.push('Plugin name must be at least 2 characters');
    }

    if (!manifest.version || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(manifest.version)) {
      errors.push('Version must be valid semver (e.g., 1.0.0, 1.0.0-beta.1)');
    }

    if (!manifest.description || manifest.description.length < 10) {
      errors.push('Description must be at least 10 characters');
    }

    if (manifest.description && manifest.description.length > 200) {
      errors.push('Description must be 200 characters or less');
    }

    if (!manifest.author?.name) {
      errors.push('Author name is required');
    }

    if (!manifest.license) {
      errors.push('License is required');
    }

    if (!manifest.category) {
      errors.push('Category is required');
    }

    if (!manifest.entrypoint?.main) {
      errors.push('Entrypoint main field is required');
    }

    if (!manifest.security) {
      errors.push('Security manifest is required');
    } else {
      if (!manifest.security.permissions) {
        errors.push('Security permissions must be declared (use empty array for no permissions)');
      }
      if (!manifest.security.trustLevel) {
        errors.push('Security trustLevel is required');
      }
    }

    if (!manifest.compatibility?.studioVersion) {
      errors.push('Compatibility studioVersion is required');
    }

    if (!manifest.keywords || manifest.keywords.length === 0) {
      errors.push('At least one keyword is required');
    }

    if (manifest.keywords && manifest.keywords.length > 20) {
      errors.push('Maximum 20 keywords allowed');
    }

    return errors;
  }

  // ── Discovery ───────────────────────────────────────────────────────────

  async searchPlugins(query: PluginSearchQuery): Promise<PluginSearchResult> {
    return this.db.search(query);
  }

  async getPlugin(pluginId: string, version?: string): Promise<PluginDetailData> {
    let manifest: PluginPackageManifest | null;
    if (version) {
      manifest = await this.db.getPluginVersion(pluginId, version);
    } else {
      manifest = await this.db.getPluginById(pluginId);
    }

    if (!manifest) {
      throw new Error(`Plugin ${pluginId}${version ? `@${version}` : ''} not found`);
    }

    const versions = await this.db.getPluginVersions(pluginId);
    const stats = this.downloadStats.getStats(pluginId);
    const ratings = this.ratingService.getRatingData(pluginId);
    const relatedPlugins = await this.db.getPopular(manifest.category, 5);

    return {
      manifest,
      versions,
      readmeHtml: manifest.readme, // In production, would render markdown to HTML
      changelogHtml: manifest.changelog,
      stats,
      ratings,
      relatedPlugins: relatedPlugins.filter((p) => p.id !== pluginId),
    };
  }

  async getPluginVersions(pluginId: string): Promise<PluginVersionInfo[]> {
    return this.db.getPluginVersions(pluginId);
  }

  async getFeaturedPlugins(limit = 10): Promise<PluginSummary[]> {
    return this.db.getFeatured(limit);
  }

  async getPopularPlugins(category?: PluginCategory, limit = 10): Promise<PluginSummary[]> {
    return this.db.getPopular(category, limit);
  }

  async getRecentPlugins(limit = 10): Promise<PluginSummary[]> {
    return this.db.getRecent(limit);
  }

  async getTrendingPlugins(limit = 10): Promise<PluginSummary[]> {
    return this.db.getTrending(limit);
  }

  async getMarketplaceHome(): Promise<MarketplaceHomeData> {
    const [featured, popular, recent, trending] = await Promise.all([
      this.db.getFeatured(6),
      this.db.getPopular(undefined, 8),
      this.db.getRecent(8),
      this.db.getTrending(8),
    ]);

    // Build category overview
    const facets = await this.db.getFacets({});

    const CATEGORY_ICONS: Record<string, string> = {
      editor: 'PanelLeft',
      workflow: 'GitBranch',
      export: 'Share2',
      collaboration: 'Users',
      analytics: 'BarChart2',
      accessibility: 'Eye',
      rendering: 'Paintbrush',
      physics: 'Atom',
      ui: 'Layout',
      ai: 'Brain',
      networking: 'Globe',
      audio: 'Volume2',
      animation: 'Play',
      data: 'Database',
      utility: 'Wrench',
      blockchain: 'Link',
      input: 'Mouse',
      debug: 'Bug',
      marketplace: 'ShoppingBag',
      integration: 'Plug',
    };

    const categories = facets.categories.map((c) => ({
      category: c.value as PluginCategory,
      label: c.value.charAt(0).toUpperCase() + c.value.slice(1),
      icon: CATEGORY_ICONS[c.value] ?? 'Package',
      count: c.count,
    }));

    const totalPlugins = facets.categories.reduce((sum, c) => sum + c.count, 0);
    const totalAuthors = facets.authors.length;

    return {
      featured,
      popular,
      recent,
      trending,
      categories,
      totalPlugins,
      totalAuthors,
    };
  }

  // ── Download & Install ──────────────────────────────────────────────────

  async downloadPlugin(
    pluginId: string,
    version?: string
  ): Promise<{ downloadUrl: string; shasum: string; size: number }> {
    const manifest = version
      ? await this.db.getPluginVersion(pluginId, version)
      : await this.db.getPluginById(pluginId);

    if (!manifest) {
      throw new Error(`Plugin ${pluginId}${version ? `@${version}` : ''} not found`);
    }

    const downloadUrl = `/api/plugins/${pluginId}/versions/${manifest.version}/download`;
    const shasum = createHash('sha256')
      .update(manifest.id + manifest.version)
      .digest('hex');

    return { downloadUrl, shasum, size: 0 };
  }

  async recordPluginDownload(pluginId: string, version: string): Promise<void> {
    this.downloadStats.record(pluginId, version);
    await this.db.incrementDownloads(pluginId, version);
  }

  // ── Signature Verification ──────────────────────────────────────────────

  async verifyPluginSignature(
    _pluginId: string,
    _version: string
  ): Promise<SignatureVerificationResult> {
    // In production, would fetch the stored signature for this version
    return {
      valid: false,
      trusted: false,
      keyFingerprint: '',
      errors: ['Signature verification requires the package signature data'],
      warnings: [],
    };
  }

  async registerSigningKey(
    publicKey: string,
    token: string
  ): Promise<{ keyId: string; fingerprint: string }> {
    const user = this.getUser(token);
    if (!user) throw new Error('Authentication required');
    return this.signatureService.registerKey(user.userId, publicKey);
  }

  async revokeSigningKey(keyId: string, token: string): Promise<void> {
    const user = this.getUser(token);
    if (!user) throw new Error('Authentication required');
    await this.signatureService.revokeKey(keyId, user.userId);
  }

  // ── Dependencies ────────────────────────────────────────────────────────

  async resolvePluginDependencies(
    pluginId: string,
    version?: string
  ): Promise<{ resolved: Array<{ pluginId: string; version: string }>; conflicts: string[] }> {
    const manifest = version
      ? await this.db.getPluginVersion(pluginId, version)
      : await this.db.getPluginById(pluginId);

    if (!manifest) {
      return { resolved: [], conflicts: [`Plugin ${pluginId} not found`] };
    }

    const resolved: Array<{ pluginId: string; version: string }> = [];
    const conflicts: string[] = [];

    for (const [depId, versionRange] of Object.entries(manifest.dependencies ?? {})) {
      const dep = await this.db.getPluginById(depId);
      if (dep) {
        resolved.push({ pluginId: depId, version: dep.version });
      } else {
        conflicts.push(`Dependency ${depId}@${versionRange} not found`);
      }
    }

    return { resolved, conflicts };
  }

  // ── Ratings & Reviews ───────────────────────────────────────────────────

  async ratePlugin(
    pluginId: string,
    rating: number,
    review?: { title?: string; body?: string },
    token?: string
  ): Promise<void> {
    const user = this.getUser(token ?? '');
    if (!user) throw new Error('Authentication required to rate plugins');

    const plugin = await this.db.getPluginById(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    const result = await this.ratingService.rate(
      pluginId,
      user.userId,
      user.userName,
      rating,
      review,
      plugin.version
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    // Update plugin average rating
    const { average, count } = this.ratingService.getAverageRating(pluginId);
    await this.db.updatePlugin(pluginId, { rating: average, ratingCount: count });
  }

  async getPluginRatings(pluginId: string, page = 1): Promise<PluginRatingData> {
    return this.ratingService.getRatingData(pluginId, page);
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  async getPluginStats(pluginId: string): Promise<PluginDownloadStats> {
    return this.downloadStats.getStats(pluginId);
  }

  // ── Author Profiles ─────────────────────────────────────────────────────

  async getAuthorProfile(authorId: string): Promise<AuthorProfileData> {
    const searchResult = await this.db.search({ author: authorId, limit: 100 });
    const plugins = searchResult.results;

    const totalDownloads = plugins.reduce((sum, p) => sum + p.downloads, 0);
    const avgRating =
      plugins.length > 0
        ? Math.round((plugins.reduce((sum, p) => sum + p.rating, 0) / plugins.length) * 10) / 10
        : 0;

    const verificationStatus = await this.verificationService.getVerificationStatus(authorId);

    return {
      author: {
        name: authorId,
        verified: verificationStatus.verified,
      },
      verificationLevel: verificationStatus.level ?? 'none',
      plugins,
      totalDownloads,
      averageRating: avgRating,
      memberSince:
        plugins.length > 0
          ? plugins.reduce(
              (earliest, p) => (p.createdAt < earliest ? p.createdAt : earliest),
              plugins[0].createdAt
            )
          : new Date(),
    };
  }

  // ── Health ──────────────────────────────────────────────────────────────

  async getHealth(): Promise<{
    status: 'ok' | 'degraded' | 'down';
    components: Record<string, 'ok' | 'error'>;
  }> {
    return {
      status: 'ok',
      components: {
        pluginRegistry: 'ok',
        signatureService: 'ok',
        downloadStats: 'ok',
        ratingService: 'ok',
      },
    };
  }
}
