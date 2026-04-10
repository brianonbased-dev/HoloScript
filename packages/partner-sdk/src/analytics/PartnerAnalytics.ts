/**
 * HoloScript Partner Analytics
 *
 * Access download statistics, usage metrics, and engagement data.
 */

import { RegistryClient, PartnerCredentials } from '../api/RegistryClient';

/**
 * Time period for analytics queries
 */
export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';

/**
 * Download statistics
 */
export interface DownloadStats {
  packageName: string;
  period: AnalyticsPeriod;
  total: number;
  unique: number;
  byVersion: Record<string, number>;
  byCountry: Record<string, number>;
  byDate: Array<{ date: string; downloads: number; unique: number }>;
  trend: {
    percentage: number;
    direction: 'up' | 'down' | 'stable';
  };
}

/**
 * User engagement metrics
 */
export interface EngagementMetrics {
  packageName: string;
  period: AnalyticsPeriod;
  views: number;
  clicks: number;
  conversionRate: number; // views -> downloads
  avgTimeOnPage: number; // seconds
  bounceRate: number;
  searchImpressions: number;
  searchClicks: number;
  searchCtr: number;
}

/**
 * Package health score
 */
export interface PackageHealth {
  packageName: string;
  version: string;
  score: number; // 0-100
  factors: {
    downloads: { score: number; weight: number };
    maintenance: { score: number; weight: number };
    security: { score: number; weight: number };
    quality: { score: number; weight: number };
    community: { score: number; weight: number };
  };
  recommendations: string[];
  lastUpdated: string;
}

/**
 * Revenue analytics (for monetized packages)
 */
export interface RevenueMetrics {
  packageName: string;
  period: AnalyticsPeriod;
  totalRevenue: number;
  currency: string;
  subscriptions: {
    active: number;
    new: number;
    churned: number;
    mrr: number;
  };
  oneTimePurchases: number;
  refunds: number;
  netRevenue: number;
}

/**
 * Dependency analytics
 */
export interface DependencyAnalytics {
  packageName: string;
  dependentPackages: number;
  directDependents: Array<{
    name: string;
    downloads: number;
  }>;
  transitiveReach: number;
  topConsumers: Array<{
    name: string;
    version: string;
    downloads: number;
  }>;
}

/**
 * Competitor analysis
 */
export interface CompetitorAnalysis {
  packageName: string;
  category: string;
  marketShare: number;
  competitors: Array<{
    name: string;
    downloads: number;
    certified: boolean;
    lastUpdated: string;
  }>;
  differentiators: string[];
  opportunities: string[];
}

/**
 * Analytics export format
 */
export type ExportFormat = 'json' | 'csv' | 'excel';

/**
 * Partner Analytics Client
 *
 * Access analytics and insights for partner packages.
 */
export class PartnerAnalytics {
  private client: RegistryClient;
  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map();
  private cacheDefaultTtl = 5 * 60 * 1000; // 5 minutes

  constructor(credentials: PartnerCredentials, baseUrl?: string) {
    this.client = new RegistryClient({
      credentials,
      baseUrl,
    });
  }

  /**
   * Get download statistics for a package
   */
  async getDownloadStats(
    packageName: string,
    period: AnalyticsPeriod = 'month'
  ): Promise<DownloadStats> {
    const cacheKey = `downloads:${packageName}:${period}`;
    const cached = this.getFromCache<DownloadStats>(cacheKey);
    if (cached) return cached;

    // Simulate analytics data (in production, fetch from API)
    const stats = await this.simulateDownloadStats(packageName, period);

    this.setCache(cacheKey, stats);
    return stats;
  }

  /**
   * Get engagement metrics for a package
   */
  async getEngagementMetrics(
    packageName: string,
    period: AnalyticsPeriod = 'month'
  ): Promise<EngagementMetrics> {
    const cacheKey = `engagement:${packageName}:${period}`;
    const cached = this.getFromCache<EngagementMetrics>(cacheKey);
    if (cached) return cached;

    const metrics = await this.simulateEngagementMetrics(packageName, period);

    this.setCache(cacheKey, metrics);
    return metrics;
  }

  /**
   * Get package health score
   */
  async getPackageHealth(packageName: string): Promise<PackageHealth> {
    const cacheKey = `health:${packageName}`;
    const cached = this.getFromCache<PackageHealth>(cacheKey);
    if (cached) return cached;

    const health = await this.simulatePackageHealth(packageName);

    this.setCache(cacheKey, health);
    return health;
  }

  /**
   * Get revenue metrics (for monetized packages)
   */
  async getRevenueMetrics(
    packageName: string,
    period: AnalyticsPeriod = 'month'
  ): Promise<RevenueMetrics> {
    const cacheKey = `revenue:${packageName}:${period}`;
    const cached = this.getFromCache<RevenueMetrics>(cacheKey);
    if (cached) return cached;

    const revenue = await this.simulateRevenueMetrics(packageName, period);

    this.setCache(cacheKey, revenue);
    return revenue;
  }

  /**
   * Get dependency analytics
   */
  async getDependencyAnalytics(packageName: string): Promise<DependencyAnalytics> {
    const cacheKey = `deps:${packageName}`;
    const cached = this.getFromCache<DependencyAnalytics>(cacheKey);
    if (cached) return cached;

    const deps = await this.simulateDependencyAnalytics(packageName);

    this.setCache(cacheKey, deps);
    return deps;
  }

  /**
   * Get competitor analysis
   */
  async getCompetitorAnalysis(packageName: string): Promise<CompetitorAnalysis> {
    const cacheKey = `competitors:${packageName}`;
    const cached = this.getFromCache<CompetitorAnalysis>(cacheKey);
    if (cached) return cached;

    const analysis = await this.simulateCompetitorAnalysis(packageName);

    this.setCache(cacheKey, analysis);
    return analysis;
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    packageName: string,
    options: {
      metrics: Array<'downloads' | 'engagement' | 'health' | 'revenue'>;
      period: AnalyticsPeriod;
      format: ExportFormat;
    }
  ): Promise<string | Buffer> {
    const data: Record<string, unknown> = {};

    if (options.metrics.includes('downloads')) {
      data.downloads = await this.getDownloadStats(packageName, options.period);
    }

    if (options.metrics.includes('engagement')) {
      data.engagement = await this.getEngagementMetrics(packageName, options.period);
    }

    if (options.metrics.includes('health')) {
      data.health = await this.getPackageHealth(packageName);
    }

    if (options.metrics.includes('revenue')) {
      data.revenue = await this.getRevenueMetrics(packageName, options.period);
    }

    switch (options.format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.toCSV(data);
      case 'excel':
        return this.toExcel(data);
      default:
        return JSON.stringify(data);
    }
  }

  /**
   * Get aggregated stats across all partner packages
   */
  async getPortfolioStats(_period: AnalyticsPeriod = 'month'): Promise<{
    totalPackages: number;
    totalDownloads: number;
    certifiedPackages: number;
    averageHealth: number;
    topPerformers: Array<{ name: string; downloads: number }>;
    needsAttention: Array<{ name: string; reason: string }>;
  }> {
    // Simulate portfolio stats
    return {
      totalPackages: 12,
      totalDownloads: 150000,
      certifiedPackages: 8,
      averageHealth: 82,
      topPerformers: [
        { name: '@partner/ui-components', downloads: 45000 },
        { name: '@partner/utils', downloads: 32000 },
        { name: '@partner/hooks', downloads: 28000 },
      ],
      needsAttention: [
        { name: '@partner/legacy-lib', reason: 'No updates in 90 days' },
        { name: '@partner/deprecated-pkg', reason: 'Security vulnerability found' },
      ],
    };
  }

  /**
   * Clear analytics cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // Cache helpers

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache<T>(key: string, data: T, ttl: number = this.cacheDefaultTtl): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  // Simulation helpers (for SDK testing without backend)

  private async simulateDownloadStats(
    packageName: string,
    period: AnalyticsPeriod
  ): Promise<DownloadStats> {
    await this.delay(50);

    const multiplier = this.getPeriodMultiplier(period);
    const baseDownloads = 1000;
    const total = Math.floor(baseDownloads * multiplier * (Math.random() + 0.5));

    return {
      packageName,
      period,
      total,
      unique: Math.floor(total * 0.7),
      byVersion: {
        '1.0.0': Math.floor(total * 0.3),
        '1.1.0': Math.floor(total * 0.25),
        '1.2.0': Math.floor(total * 0.45),
      },
      byCountry: {
        US: Math.floor(total * 0.35),
        DE: Math.floor(total * 0.15),
        GB: Math.floor(total * 0.12),
        CN: Math.floor(total * 0.1),
        IN: Math.floor(total * 0.08),
        Other: Math.floor(total * 0.2),
      },
      byDate: this.generateDateSeries(period, total),
      trend: {
        percentage: Math.floor(Math.random() * 40 - 10),
        direction: Math.random() > 0.3 ? 'up' : Math.random() > 0.5 ? 'down' : 'stable',
      },
    };
  }

  private async simulateEngagementMetrics(
    packageName: string,
    period: AnalyticsPeriod
  ): Promise<EngagementMetrics> {
    await this.delay(50);

    const views = Math.floor(5000 * (Math.random() + 0.5));
    const clicks = Math.floor(views * 0.15);
    const downloads = Math.floor(clicks * 0.6);

    return {
      packageName,
      period,
      views,
      clicks,
      conversionRate: downloads / views,
      avgTimeOnPage: Math.floor(45 + Math.random() * 60),
      bounceRate: 0.3 + Math.random() * 0.2,
      searchImpressions: Math.floor(views * 3),
      searchClicks: Math.floor(views * 0.4),
      searchCtr: 0.12 + Math.random() * 0.08,
    };
  }

  private async simulatePackageHealth(packageName: string): Promise<PackageHealth> {
    await this.delay(50);

    const factors = {
      downloads: { score: Math.floor(70 + Math.random() * 30), weight: 0.25 },
      maintenance: { score: Math.floor(60 + Math.random() * 40), weight: 0.25 },
      security: { score: Math.floor(80 + Math.random() * 20), weight: 0.2 },
      quality: { score: Math.floor(75 + Math.random() * 25), weight: 0.15 },
      community: { score: Math.floor(50 + Math.random() * 50), weight: 0.15 },
    };

    const score = Object.values(factors).reduce((sum, f) => sum + f.score * f.weight, 0);

    const recommendations: string[] = [];
    if (factors.maintenance.score < 80) recommendations.push('Consider more frequent updates');
    if (factors.security.score < 90) recommendations.push('Run security audit');
    if (factors.community.score < 70) recommendations.push('Engage more with community issues');

    return {
      packageName,
      version: '1.2.0',
      score: Math.floor(score),
      factors,
      recommendations,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async simulateRevenueMetrics(
    packageName: string,
    period: AnalyticsPeriod
  ): Promise<RevenueMetrics> {
    await this.delay(50);

    const multiplier = this.getPeriodMultiplier(period);
    const baseRevenue = 500;

    return {
      packageName,
      period,
      totalRevenue: Math.floor(baseRevenue * multiplier),
      currency: 'USD',
      subscriptions: {
        active: Math.floor(50 * (Math.random() + 0.5)),
        new: Math.floor(10 * (Math.random() + 0.5)),
        churned: Math.floor(5 * Math.random()),
        mrr: Math.floor(baseRevenue / 30),
      },
      oneTimePurchases: Math.floor(baseRevenue * 0.2),
      refunds: Math.floor(baseRevenue * 0.05),
      netRevenue: Math.floor(baseRevenue * multiplier * 0.95),
    };
  }

  private async simulateDependencyAnalytics(packageName: string): Promise<DependencyAnalytics> {
    await this.delay(50);

    return {
      packageName,
      dependentPackages: Math.floor(50 + Math.random() * 100),
      directDependents: [
        { name: '@company/app', downloads: 5000 },
        { name: '@other/lib', downloads: 3500 },
        { name: 'awesome-project', downloads: 2800 },
      ],
      transitiveReach: Math.floor(500 + Math.random() * 1000),
      topConsumers: [
        { name: '@company/app', version: '2.0.0', downloads: 5000 },
        { name: '@other/lib', version: '1.5.0', downloads: 3500 },
      ],
    };
  }

  private async simulateCompetitorAnalysis(packageName: string): Promise<CompetitorAnalysis> {
    await this.delay(50);

    return {
      packageName,
      category: 'VR/XR Development',
      marketShare: 0.15 + Math.random() * 0.2,
      competitors: [
        { name: 'competitor-a', downloads: 25000, certified: true, lastUpdated: '2024-01-15' },
        { name: 'competitor-b', downloads: 18000, certified: false, lastUpdated: '2024-01-10' },
        { name: 'competitor-c', downloads: 12000, certified: true, lastUpdated: '2024-01-20' },
      ],
      differentiators: [
        'Better TypeScript support',
        'More comprehensive documentation',
        'Active community support',
      ],
      opportunities: ['Add WebXR 2.0 support', 'Improve bundle size', 'Add more example projects'],
    };
  }

  private getPeriodMultiplier(period: AnalyticsPeriod): number {
    const multipliers: Record<AnalyticsPeriod, number> = {
      day: 1,
      week: 7,
      month: 30,
      quarter: 90,
      year: 365,
      all: 1000,
    };
    return multipliers[period];
  }

  private generateDateSeries(
    period: AnalyticsPeriod,
    total: number
  ): Array<{ date: string; downloads: number; unique: number }> {
    const days = this.getPeriodMultiplier(period);
    const result: Array<{ date: string; downloads: number; unique: number }> = [];
    const now = new Date();

    for (let i = 0; i < Math.min(days, 30); i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dailyDownloads = Math.floor((total / days) * (0.5 + Math.random()));
      result.push({
        date: date.toISOString().split('T')[0],
        downloads: dailyDownloads,
        unique: Math.floor(dailyDownloads * 0.7),
      });
    }

    return result.reverse();
  }

  private toCSV(data: Record<string, unknown>): string {
    const lines: string[] = [];

    for (const [section, content] of Object.entries(data)) {
      lines.push(`# ${section.toUpperCase()}`);
      if (typeof content === 'object' && content !== null) {
        const flat = this.flattenObject(content);
        for (const [key, value] of Object.entries(flat)) {
          lines.push(`${key},${value}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private toExcel(data: Record<string, unknown>): Buffer {
    // Placeholder - in production, use a library like xlsx
    const json = JSON.stringify(data);
    return Buffer.from(json);
  }

  private flattenObject(obj: unknown, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};

    if (typeof obj !== 'object' || obj === null) {
      return { [prefix]: String(obj) };
    }

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, newKey));
      } else {
        result[newKey] = String(value);
      }
    }

    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a partner analytics instance
 */
export function createPartnerAnalytics(
  credentials: PartnerCredentials,
  baseUrl?: string
): PartnerAnalytics {
  return new PartnerAnalytics(credentials, baseUrl);
}
