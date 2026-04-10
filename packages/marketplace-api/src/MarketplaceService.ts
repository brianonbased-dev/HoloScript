/**
 * @fileoverview Main marketplace service that ties together all components
 * @module marketplace-api/MarketplaceService
 */

import type {
  IMarketplaceAPI,
  TraitPackage,
  TraitSummary,
  VersionInfo,
  PublishRequest,
  PublishResult,
  UnpublishRequest,
  DeprecateRequest,
  SearchQuery,
  SearchResult,
  TraitRef,
  DependencyTree,
  CompatibilityReport,
  DownloadStats,
  TraitRating,
  VerificationRequest,
  VerificationStatus,
  TraitCategory,
  RateLimitInfo,
  RateLimitTier,
  DailyDownloads,
} from './types.js';
import { RATE_LIMITS } from './types.js';
import { TraitRegistry } from './TraitRegistry.js';
import { DependencyResolver } from './DependencyResolver.js';
import { VerificationService, RateLimiter, SpamDetector } from './VerificationService.js';

// =============================================================================
// DOWNLOAD STATS TRACKER
// =============================================================================

/**
 * Tracks download statistics for traits
 */
export class DownloadStatsTracker {
  private dailyCounts: Map<string, Map<string, number>> = new Map(); // traitId -> date -> count
  private totalCounts: Map<string, number> = new Map();

  /**
   * Record a download
   */
  record(traitId: string, _version: string): void {
    const today = new Date().toISOString().split('T')[0];

    // Update daily count
    if (!this.dailyCounts.has(traitId)) {
      this.dailyCounts.set(traitId, new Map());
    }
    const dailyMap = this.dailyCounts.get(traitId)!;
    dailyMap.set(today, (dailyMap.get(today) ?? 0) + 1);

    // Update total
    this.totalCounts.set(traitId, (this.totalCounts.get(traitId) ?? 0) + 1);
  }

  /**
   * Get download statistics
   */
  getStats(traitId: string): DownloadStats {
    const dailyMap = this.dailyCounts.get(traitId) ?? new Map();
    const total = this.totalCounts.get(traitId) ?? 0;

    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    let lastDay = 0;
    let lastWeek = 0;
    let lastMonth = 0;
    let lastYear = 0;

    const history: DailyDownloads[] = [];

    for (const [dateStr, count] of dailyMap.entries()) {
      const date = new Date(dateStr);
      const diff = now.getTime() - date.getTime();

      if (diff <= oneDay) lastDay += count;
      if (diff <= 7 * oneDay) lastWeek += count;
      if (diff <= 30 * oneDay) lastMonth += count;
      if (diff <= 365 * oneDay) lastYear += count;

      // Add to history (last 30 days)
      if (diff <= 30 * oneDay) {
        history.push({ date: dateStr, count });
      }
    }

    history.sort((a, b) => a.date.localeCompare(b.date));

    return {
      traitId,
      total,
      lastDay,
      lastWeek,
      lastMonth,
      lastYear,
      history,
    };
  }
}

// =============================================================================
// RATING SERVICE
// =============================================================================

/**
 * Manages trait ratings and reviews
 */
export class RatingService {
  private ratings: Map<string, Map<string, TraitRating>> = new Map(); // traitId -> userId -> rating
  private spamDetector: SpamDetector;

  constructor() {
    this.spamDetector = new SpamDetector();
  }

  /**
   * Rate a trait
   */
  async rate(
    traitId: string,
    userId: string,
    rating: number,
    review?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate rating
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return { success: false, error: 'Rating must be an integer between 1 and 5' };
    }

    // Check for spam if review provided
    if (review) {
      const spamCheck = this.spamDetector.isSpam(userId, review);
      if (spamCheck.isSpam) {
        return { success: false, error: `Review rejected: ${spamCheck.reason}` };
      }
    }

    // Get or create ratings map for trait
    if (!this.ratings.has(traitId)) {
      this.ratings.set(traitId, new Map());
    }

    const existing = this.ratings.get(traitId)!.get(userId);
    const now = new Date();

    this.ratings.get(traitId)!.set(userId, {
      traitId,
      userId,
      rating,
      review,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
    });

    return { success: true };
  }

  /**
   * Get ratings for a trait
   */
  async getRatings(traitId: string, page: number = 1, limit: number = 20): Promise<TraitRating[]> {
    const ratingsMap = this.ratings.get(traitId);
    if (!ratingsMap) return [];

    const allRatings = Array.from(ratingsMap.values());
    const startIndex = (page - 1) * limit;
    return allRatings.slice(startIndex, startIndex + limit);
  }

  /**
   * Get average rating for a trait
   */
  getAverageRating(traitId: string): { average: number; count: number } {
    const ratingsMap = this.ratings.get(traitId);
    if (!ratingsMap || ratingsMap.size === 0) {
      return { average: 0, count: 0 };
    }

    const ratings = Array.from(ratingsMap.values());
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    return {
      average: Math.round((sum / ratings.length) * 10) / 10,
      count: ratings.length,
    };
  }

  /**
   * Delete a rating
   */
  async deleteRating(traitId: string, userId: string): Promise<boolean> {
    return this.ratings.get(traitId)?.delete(userId) ?? false;
  }
}

// =============================================================================
// MARKETPLACE SERVICE
// =============================================================================

/**
 * Main marketplace service implementing the full API
 */
export class MarketplaceService implements IMarketplaceAPI {
  private registry: TraitRegistry;
  private resolver: DependencyResolver;
  private verificationService: VerificationService;
  private downloadStats: DownloadStatsTracker;
  private rateLimiters: Map<RateLimitTier, RateLimiter> = new Map();
  private ratingService: RatingService;

  // User sessions (mock - would be JWT/OAuth in production)
  private sessions: Map<string, { userId: string; tier: RateLimitTier }> = new Map();

  constructor(options: { registry?: TraitRegistry } = {}) {
    this.registry = options.registry ?? new TraitRegistry();
    this.resolver = new DependencyResolver(this.registry);
    this.verificationService = new VerificationService();
    this.downloadStats = new DownloadStatsTracker();
    this.ratingService = new RatingService();

    // Initialize rate limiters for each tier
    for (const [tier, limit] of Object.entries(RATE_LIMITS)) {
      this.rateLimiters.set(
        tier as RateLimitTier,
        new RateLimiter(60 * 60 * 1000, limit) // 1 hour window
      );
    }
  }

  // ===========================================================================
  // AUTHENTICATION HELPERS
  // ===========================================================================

  /**
   * Validate token and get user info
   */
  private getUser(token: string): {
    userId: string;
    name: string;
    email?: string;
    verified: boolean;
    tier: RateLimitTier;
  } | null {
    const session = this.sessions.get(token);
    if (!session) return null;

    // Mock user data (would fetch from database in production)
    return {
      userId: session.userId,
      name: session.userId,
      verified: session.tier !== 'anonymous',
      tier: session.tier,
    };
  }

  /**
   * Register a session (for testing)
   */
  registerSession(token: string, userId: string, tier: RateLimitTier = 'authenticated'): void {
    this.sessions.set(token, { userId, tier });
  }

  /**
   * Check rate limit
   */
  checkRateLimit(token: string): RateLimitInfo {
    const user = this.getUser(token);
    const tier: RateLimitTier = user?.tier ?? 'anonymous';
    const limiter = this.rateLimiters.get(tier)!;
    const key = user?.userId ?? token;

    const allowed = limiter.isAllowed(key);
    const limit = RATE_LIMITS[tier];
    const remaining = limiter.getRemaining(key);
    const reset = Math.ceil(Date.now() / 1000) + Math.ceil(limiter.getResetTime(key) / 1000);

    return {
      limit,
      remaining,
      reset,
      retryAfter: allowed ? undefined : Math.ceil(limiter.getResetTime(key) / 1000),
    };
  }

  // ===========================================================================
  // PUBLISHING
  // ===========================================================================

  async publish(request: PublishRequest, token: string): Promise<PublishResult> {
    const user = this.getUser(token);
    if (!user) {
      return {
        success: false,
        traitId: '',
        version: '',
        tarballUrl: '',
        shasum: '',
        errors: ['Authentication required'],
      };
    }

    // Verify source code
    const sourceCheck = await this.verificationService.verifyTraitSource(request.source);
    if (!sourceCheck.safe) {
      return {
        success: false,
        traitId: '',
        version: request.version,
        tarballUrl: '',
        shasum: '',
        errors: ['Source code verification failed: ' + sourceCheck.issues.join(', ')],
        warnings: sourceCheck.warnings,
      };
    }

    return this.registry.publish(request, {
      name: user.name,
      email: user.email,
      verified: user.verified,
    });
  }

  async unpublish(request: UnpublishRequest, token: string): Promise<void> {
    const user = this.getUser(token);
    if (!user) {
      throw new Error('Authentication required');
    }

    await this.registry.unpublish(request.traitId, request.version, user.name);
  }

  async deprecate(request: DeprecateRequest, token: string): Promise<void> {
    const user = this.getUser(token);
    if (!user) {
      throw new Error('Authentication required');
    }

    await this.registry.deprecate(
      request.traitId,
      request.message,
      request.version,
      request.replacement
    );
  }

  // ===========================================================================
  // DISCOVERY
  // ===========================================================================

  async search(query: SearchQuery): Promise<SearchResult> {
    return this.registry.search(query);
  }

  async getTrait(traitId: string, version?: string): Promise<TraitPackage> {
    const trait = await this.registry.getTrait(traitId, version);
    if (!trait) {
      throw new Error(`Trait ${traitId}${version ? `@${version}` : ''} not found`);
    }
    return trait;
  }

  async getVersions(traitId: string): Promise<VersionInfo[]> {
    return this.registry.getVersions(traitId);
  }

  async getPopular(category?: TraitCategory, limit?: number): Promise<TraitSummary[]> {
    return this.registry.getPopular(category, limit);
  }

  async getRecent(limit?: number): Promise<TraitSummary[]> {
    return this.registry.getRecent(limit);
  }

  // ===========================================================================
  // DEPENDENCIES
  // ===========================================================================

  async resolveDependencies(traits: TraitRef[]): Promise<DependencyTree> {
    return this.resolver.resolve(traits);
  }

  async checkCompatibility(traits: TraitRef[]): Promise<CompatibilityReport> {
    return this.resolver.checkCompatibility(traits);
  }

  // ===========================================================================
  // STATS
  // ===========================================================================

  async getDownloadStats(traitId: string): Promise<DownloadStats> {
    return this.downloadStats.getStats(traitId);
  }

  async recordDownload(traitId: string, version: string): Promise<void> {
    this.downloadStats.record(traitId, version);
    await this.registry.recordDownload(traitId, version);
  }

  // ===========================================================================
  // RATINGS
  // ===========================================================================

  async rateTrait(traitId: string, rating: number, review?: string, token?: string): Promise<void> {
    const user = this.getUser(token ?? '');
    if (!user) {
      throw new Error('Authentication required to rate traits');
    }

    const result = await this.ratingService.rate(traitId, user.userId, rating, review);
    if (!result.success) {
      throw new Error(result.error);
    }
  }

  async getRatings(traitId: string, page?: number): Promise<TraitRating[]> {
    return this.ratingService.getRatings(traitId, page);
  }

  // ===========================================================================
  // VERIFICATION
  // ===========================================================================

  async requestVerification(request: VerificationRequest, token: string): Promise<void> {
    const user = this.getUser(token);
    if (!user) {
      throw new Error('Authentication required');
    }

    // Start appropriate verification based on request type
    for (const evidence of request.evidence) {
      switch (evidence.type) {
        case 'email':
          await this.verificationService.startEmailVerification(user.userId, evidence.value);
          break;
        case 'github':
          await this.verificationService.startGitHubVerification(user.userId);
          break;
        case 'domain':
          await this.verificationService.startDomainVerification(user.userId, evidence.value);
          break;
        case 'manual':
          await this.verificationService.requestManualVerification(user.userId, evidence.value);
          break;
      }
    }
  }

  async getVerificationStatus(targetId: string): Promise<VerificationStatus> {
    return this.verificationService.getVerificationStatus(targetId);
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Get service health status
   */
  async getHealth(): Promise<{
    status: 'ok' | 'degraded' | 'down';
    components: Record<string, 'ok' | 'error'>;
  }> {
    return {
      status: 'ok',
      components: {
        registry: 'ok',
        resolver: 'ok',
        verification: 'ok',
        stats: 'ok',
      },
    };
  }

  /**
   * Get service metrics
   */
  async getMetrics(): Promise<Record<string, number>> {
    const searchResult = await this.registry.search({ limit: 1 });
    return {
      totalTraits: searchResult.total,
      activeSessions: this.sessions.size,
    };
  }
}
