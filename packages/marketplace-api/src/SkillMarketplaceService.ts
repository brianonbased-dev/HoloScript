/**
 * @fileoverview Skill Marketplace Service
 *
 * Manages AI skill packages: Claude workflows, agent configs, RBAC policies,
 * MCP bundles, ecosystem scripts, and decision templates.
 *
 * Users build skills in HoloScript Studio, test against sample prompts,
 * then publish to the marketplace for others to purchase and install.
 *
 * @module marketplace-api/SkillMarketplaceService
 */

import crypto from 'crypto';
import type {
  SkillPackage,
  SkillSummary,
  SkillCategory,
  SkillTargetPlatform,
  SkillSearchQuery,
  SkillSearchResult,
  SkillPublishRequest,
  SkillPublishResult,
  SkillSearchFacets,
  SkillPermission,
  DownloadStats,
  DailyDownloads,
  TraitRating,
  Author,
  ISkillMarketplaceAPI,
  FacetCount,
} from './types.js';

// =============================================================================
// DATABASE INTERFACE
// =============================================================================

/**
 * Database interface for skill storage.
 * Implement this to plug in Postgres, Supabase, etc.
 */
export interface ISkillDatabase {
  getSkill(skillId: string, version?: string): Promise<SkillPackage | null>;
  saveSkill(skill: SkillPackage): Promise<void>;
  deleteSkill(skillId: string): Promise<void>;
  searchSkills(query: SkillSearchQuery): Promise<{ skills: SkillPackage[]; total: number }>;
  getSkillsByAuthor(authorName: string): Promise<SkillPackage[]>;
}

/**
 * In-memory skill database for development and testing.
 */
export class InMemorySkillDatabase implements ISkillDatabase {
  private skills: Map<string, SkillPackage> = new Map();

  async getSkill(skillId: string, version?: string): Promise<SkillPackage | null> {
    const skill = this.skills.get(skillId);
    if (!skill) return null;
    if (version && skill.version !== version) return null;
    return skill;
  }

  async saveSkill(skill: SkillPackage): Promise<void> {
    this.skills.set(skill.id, skill);
  }

  async deleteSkill(skillId: string): Promise<void> {
    this.skills.delete(skillId);
  }

  async searchSkills(query: SkillSearchQuery): Promise<{ skills: SkillPackage[]; total: number }> {
    let results = Array.from(this.skills.values()).filter((s) => s.published);

    // Text search
    if (query.q) {
      const q = query.q.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }

    // Filters
    if (query.category) results = results.filter((s) => s.category === query.category);
    if (query.targetPlatform)
      results = results.filter((s) => s.targetPlatform === query.targetPlatform);
    if (query.author) results = results.filter((s) => s.author.name === query.author);
    if (query.pricingModel) results = results.filter((s) => s.pricingModel === query.pricingModel);
    if (query.maxPrice !== undefined) results = results.filter((s) => s.price <= query.maxPrice!);
    if (query.verified !== undefined)
      results = results.filter((s) => s.verified === query.verified);
    if (query.deprecated !== undefined)
      results = results.filter((s) => s.deprecated === query.deprecated);
    if (query.minRating !== undefined)
      results = results.filter((s) => s.rating >= query.minRating!);
    if (query.minDownloads !== undefined)
      results = results.filter((s) => s.downloads >= query.minDownloads!);

    // Sort
    const sortBy = query.sortBy || 'relevance';
    const sortOrder = query.sortOrder || 'desc';
    const mult = sortOrder === 'asc' ? 1 : -1;

    results.sort((a, b) => {
      switch (sortBy) {
        case 'downloads':
          return mult * (a.downloads - b.downloads);
        case 'rating':
          return mult * (a.rating - b.rating);
        case 'price':
          return mult * (a.price - b.price);
        case 'updated':
          return mult * (a.updatedAt.getTime() - b.updatedAt.getTime());
        case 'created':
          return mult * (a.createdAt.getTime() - b.createdAt.getTime());
        default:
          return mult * (a.downloads - b.downloads); // relevance fallback
      }
    });

    const total = results.length;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const start = (page - 1) * limit;
    results = results.slice(start, start + limit);

    return { skills: results, total };
  }

  async getSkillsByAuthor(authorName: string): Promise<SkillPackage[]> {
    return Array.from(this.skills.values()).filter((s) => s.author.name === authorName);
  }
}

// =============================================================================
// STATS TRACKER
// =============================================================================

export class SkillDownloadStatsTracker {
  private stats: Map<string, { total: number; daily: Map<string, number> }> = new Map();

  async recordDownload(skillId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const entry = this.stats.get(skillId) || { total: 0, daily: new Map() };
    entry.total++;
    entry.daily.set(today, (entry.daily.get(today) || 0) + 1);
    this.stats.set(skillId, entry);
  }

  async getStats(skillId: string): Promise<DownloadStats> {
    const entry = this.stats.get(skillId) || { total: 0, daily: new Map() };
    const now = Date.now();
    const history: DailyDownloads[] = Array.from(entry.daily.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    return {
      traitId: skillId,
      total: entry.total,
      lastDay: this.countSince(entry.daily, now - 86400000),
      lastWeek: this.countSince(entry.daily, now - 604800000),
      lastMonth: this.countSince(entry.daily, now - 2592000000),
      lastYear: this.countSince(entry.daily, now - 31536000000),
      history,
    };
  }

  private countSince(daily: Map<string, number>, since: number): number {
    let count = 0;
    for (const [date, n] of daily) {
      if (new Date(date).getTime() >= since) count += n;
    }
    return count;
  }
}

// =============================================================================
// RATING SERVICE
// =============================================================================

export class SkillRatingService {
  private ratings: Map<string, TraitRating[]> = new Map();

  async rate(skillId: string, userId: string, rating: number, review?: string): Promise<void> {
    const entries = this.ratings.get(skillId) || [];
    const existing = entries.findIndex((r) => r.userId === userId);
    const entry: TraitRating = {
      traitId: skillId,
      userId,
      rating: Math.min(5, Math.max(1, rating)),
      review,
      createdAt: new Date(),
      updatedAt: existing >= 0 ? new Date() : undefined,
    };
    if (existing >= 0) {
      entries[existing] = entry;
    } else {
      entries.push(entry);
    }
    this.ratings.set(skillId, entries);
  }

  async getRatings(skillId: string, page = 1, limit = 10): Promise<TraitRating[]> {
    const entries = this.ratings.get(skillId) || [];
    const start = (page - 1) * limit;
    return entries.slice(start, start + limit);
  }

  async getAverageRating(skillId: string): Promise<{ rating: number; count: number }> {
    const entries = this.ratings.get(skillId) || [];
    if (entries.length === 0) return { rating: 0, count: 0 };
    const sum = entries.reduce((acc, r) => acc + r.rating, 0);
    return { rating: sum / entries.length, count: entries.length };
  }
}

// =============================================================================
// CATEGORY DESCRIPTIONS
// =============================================================================

const SKILL_CATEGORY_DESCRIPTIONS: Record<SkillCategory, string> = {
  agent_framework: 'Full agent implementations with identity, RBAC, and lifecycle management',
  workflow: 'Step-by-step Claude/Gemini workflows for specific tasks',
  rbac_policy: 'Pre-configured role-based access control policies',
  orchestration: 'uAA2++ protocol configurations and orchestration patterns',
  mcp_bundle: 'Curated Model Context Protocol tool bundles',
  ecosystem_script: 'Monitoring, quality scoring, CI/CD, and health scripts',
  decision_template: 'Structured architecture/security/performance decision frameworks',
  prompt_template: 'Reusable prompt engineering templates and chains',
  code_generator: 'Code generation patterns, scaffolding, and boilerplate generators',
};

// =============================================================================
// SKILL MARKETPLACE SERVICE
// =============================================================================

/**
 * Main service implementing ISkillMarketplaceAPI.
 */
export class SkillMarketplaceService implements ISkillMarketplaceAPI {
  constructor(
    private db: ISkillDatabase,
    private downloadTracker: SkillDownloadStatsTracker,
    private ratingService: SkillRatingService
  ) {}

  // ─── Publishing ──────────────────────────────────────────────────────────────

  async publishSkill(request: SkillPublishRequest, token: string): Promise<SkillPublishResult> {
    // Generate unique ID
    const skillId = `skill-${crypto.randomBytes(8).toString('hex')}`;

    // Compute signature hash from all file contents
    const contentHash = crypto
      .createHash('sha256')
      .update(request.files.map((f) => f.content).join('\n'))
      .digest('hex');

    const skill: SkillPackage = {
      id: skillId,
      name: request.name,
      version: request.version,
      description: request.description,
      author: { name: 'creator', verified: false }, // TODO: extract from token
      license: request.license,
      keywords: request.keywords,
      repository: request.repository,
      category: request.category,
      targetPlatform: request.targetPlatform,
      entrypoint: request.entrypoint,
      files: request.files,
      requiredEnvVars: request.requiredEnvVars,
      readme: request.readme,
      examples: request.examples,
      sandboxed: request.sandboxed,
      permissions: request.permissions,
      signatureVerified: false,
      pricingModel: request.pricingModel,
      price: request.price,
      subscriptionPrice: request.subscriptionPrice,
      verified: false,
      published: true,
      deprecated: false,
      downloads: 0,
      installs: 0,
      rating: 0,
      ratingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
    };

    await this.db.saveSkill(skill);

    return {
      success: true,
      skillId,
      version: request.version,
      signatureHash: contentHash,
    };
  }

  async unpublishSkill(skillId: string, _token: string): Promise<void> {
    await this.db.deleteSkill(skillId);
  }

  async deprecateSkill(skillId: string, message: string, _token: string): Promise<void> {
    const skill = await this.db.getSkill(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    skill.deprecated = true;
    skill.deprecationMessage = message;
    skill.updatedAt = new Date();
    await this.db.saveSkill(skill);
  }

  // ─── Discovery ───────────────────────────────────────────────────────────────

  async searchSkills(query: SkillSearchQuery): Promise<SkillSearchResult> {
    const { skills, total } = await this.db.searchSkills(query);
    const page = query.page || 1;
    const limit = query.limit || 20;

    const results: SkillSummary[] = skills.map((s) => this.toSummary(s));

    // Build facets
    const allSkills = (await this.db.searchSkills({ ...query, page: 1, limit: 1000 })).skills;
    const facets = this.buildFacets(allSkills);

    return {
      results,
      total,
      page,
      limit,
      hasMore: page * limit < total,
      query,
      facets,
    };
  }

  async getSkill(skillId: string, version?: string): Promise<SkillPackage> {
    const skill = await this.db.getSkill(skillId, version);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    return skill;
  }

  async getFeaturedSkills(category?: SkillCategory, limit = 10): Promise<SkillSummary[]> {
    const { skills } = await this.db.searchSkills({
      category,
      sortBy: 'downloads',
      sortOrder: 'desc',
      verified: true,
      limit,
    });
    return skills.map((s) => this.toSummary(s));
  }

  async getRecentSkills(limit = 10): Promise<SkillSummary[]> {
    const { skills } = await this.db.searchSkills({
      sortBy: 'created',
      sortOrder: 'desc',
      limit,
    });
    return skills.map((s) => this.toSummary(s));
  }

  async getTopSkills(
    sortBy: 'downloads' | 'rating' | 'installs',
    limit = 10
  ): Promise<SkillSummary[]> {
    const { skills } = await this.db.searchSkills({
      sortBy: sortBy === 'installs' ? 'downloads' : sortBy,
      sortOrder: 'desc',
      limit,
    });
    return skills.map((s) => this.toSummary(s));
  }

  async getCategories(): Promise<
    { category: SkillCategory; count: number; description: string }[]
  > {
    const allCategories: SkillCategory[] = [
      'agent_framework',
      'workflow',
      'rbac_policy',
      'orchestration',
      'mcp_bundle',
      'ecosystem_script',
      'decision_template',
      'prompt_template',
      'code_generator',
    ];

    const results = await Promise.all(
      allCategories.map(async (category) => {
        const { total } = await this.db.searchSkills({ category, limit: 0 });
        return {
          category,
          count: total,
          description: SKILL_CATEGORY_DESCRIPTIONS[category],
        };
      })
    );

    return results;
  }

  // ─── Purchase & Download ─────────────────────────────────────────────────────

  async purchaseSkill(
    skillId: string,
    _token: string
  ): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const skill = await this.db.getSkill(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);

    // TODO: integrate with x402PaymentService for actual payment
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    return {
      url: `/api/skills/${skillId}/download`,
      expiresAt,
    };
  }

  async getDownloadUrl(skillId: string, _token: string): Promise<{ url: string; expiresAt: Date }> {
    return this.purchaseSkill(skillId, _token);
  }

  // ─── Install ─────────────────────────────────────────────────────────────────

  async installSkill(
    skillId: string,
    workspacePath: string,
    _token: string
  ): Promise<{ installed: boolean; path: string }> {
    const skill = await this.db.getSkill(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);

    // In a real implementation, this would write files to the workspace
    const installPath = `${workspacePath}/.agents/skills/${skill.name}`;
    skill.installs = (skill.installs || 0) + 1;
    skill.updatedAt = new Date();
    await this.db.saveSkill(skill);

    return { installed: true, path: installPath };
  }

  async uninstallSkill(skillId: string, _workspacePath: string, _token: string): Promise<void> {
    const skill = await this.db.getSkill(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    skill.installs = Math.max(0, (skill.installs || 0) - 1);
    await this.db.saveSkill(skill);
  }

  async getInstalledSkills(_workspacePath: string, _token: string): Promise<SkillSummary[]> {
    // TODO: scan workspace for installed skills
    return [];
  }

  // ─── Testing ─────────────────────────────────────────────────────────────────

  async testSkill(
    skillId: string,
    prompt: string,
    _token: string
  ): Promise<{ output: string; duration: number }> {
    const skill = await this.db.getSkill(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);

    const start = Date.now();
    // TODO: integrate with actual LLM to test the skill
    const output = `[Simulated] Skill "${skill.name}" executed with prompt: "${prompt.slice(0, 50)}..."`;
    const duration = Date.now() - start;

    return { output, duration };
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  async recordSkillDownload(skillId: string): Promise<void> {
    await this.downloadTracker.recordDownload(skillId);
    const skill = await this.db.getSkill(skillId);
    if (skill) {
      skill.downloads++;
      skill.updatedAt = new Date();
      await this.db.saveSkill(skill);
    }
  }

  async getSkillDownloadStats(skillId: string): Promise<DownloadStats> {
    return this.downloadTracker.getStats(skillId);
  }

  // ─── Ratings ─────────────────────────────────────────────────────────────────

  async rateSkill(skillId: string, rating: number, review?: string, token?: string): Promise<void> {
    const userId = token || 'anonymous';
    await this.ratingService.rate(skillId, userId, rating, review);
    const { rating: avg, count } = await this.ratingService.getAverageRating(skillId);
    const skill = await this.db.getSkill(skillId);
    if (skill) {
      skill.rating = avg;
      skill.ratingCount = count;
      await this.db.saveSkill(skill);
    }
  }

  async getSkillRatings(skillId: string, page?: number): Promise<TraitRating[]> {
    return this.ratingService.getRatings(skillId, page);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private toSummary(skill: SkillPackage): SkillSummary {
    return {
      id: skill.id,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      author: { name: skill.author.name, verified: skill.author.verified },
      category: skill.category,
      targetPlatform: skill.targetPlatform,
      pricingModel: skill.pricingModel,
      price: skill.price,
      subscriptionPrice: skill.subscriptionPrice,
      fileCount: skill.files.length,
      permissions: skill.permissions,
      downloads: skill.downloads,
      installs: skill.installs,
      rating: skill.rating,
      verified: skill.verified,
      deprecated: skill.deprecated,
      publishedAt: skill.publishedAt,
      updatedAt: skill.updatedAt,
    };
  }

  private buildFacets(skills: SkillPackage[]): SkillSearchFacets {
    const countBy = <T extends string>(arr: T[]): FacetCount[] => {
      const counts = new Map<string, number>();
      arr.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
      return Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
    };

    return {
      categories: countBy(skills.map((s) => s.category)),
      platforms: countBy(skills.map((s) => s.targetPlatform)),
      pricingModels: countBy(skills.map((s) => s.pricingModel)),
      licenses: countBy(skills.map((s) => s.license)),
      authors: countBy(skills.map((s) => s.author.name)),
    };
  }
}
