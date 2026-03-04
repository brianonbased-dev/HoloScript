/**
 * @fileoverview Marketplace API client for HoloScript Studio
 *
 * Fetches creator content data from the marketplace-api REST endpoints.
 * Used by useCreatorStats to aggregate trait, plugin, and skill data
 * into a unified creator dashboard view.
 *
 * @module @holoscript/studio/lib/marketplaceApi
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Base URL for the marketplace API.
 *
 * In production this should point to the deployed marketplace service
 * (e.g. https://marketplace.holoscript.net/api).
 * In local dev it defaults to the marketplace-api dev server on port 3000.
 *
 * Configured via NEXT_PUBLIC_MARKETPLACE_URL in .env.local.
 */
const MARKETPLACE_API_BASE =
  process.env.NEXT_PUBLIC_MARKETPLACE_URL || 'http://localhost:3000/api/v1';

/**
 * Request timeout in milliseconds. Marketplace calls that take longer
 * than this will be treated as failures (triggering mock fallback).
 */
const REQUEST_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Shared API response types (matching marketplace-api envelope)
// ---------------------------------------------------------------------------

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Trait types (subset of marketplace-api TraitSummary/SearchResult)
// ---------------------------------------------------------------------------

interface TraitSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; verified: boolean };
  category: string;
  platforms: string[];
  downloads: number;
  rating: number;
  ratingCount?: number;
  verified: boolean;
  deprecated: boolean;
  updatedAt: string;
}

interface TraitSearchResult {
  results: TraitSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Plugin types (subset of marketplace-api PluginSummary/SearchResult)
// ---------------------------------------------------------------------------

interface PluginSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; verified: boolean };
  category: string;
  downloads: number;
  rating: number;
  ratingCount?: number;
  verified: boolean;
  updatedAt: string;
}

interface PluginSearchResult {
  results: PluginSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Skill types (subset of marketplace-api SkillSummary/SearchResult)
// ---------------------------------------------------------------------------

interface SkillSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; verified: boolean };
  category: string;
  targetPlatform: string;
  pricingModel: string;
  price: number;
  subscriptionPrice?: number;
  downloads: number;
  installs?: number;
  rating: number;
  ratingCount?: number;
  verified: boolean;
  deprecated?: boolean;
  updatedAt: string;
}

interface SkillSearchResult {
  results: SkillSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Aggregated creator content response
// ---------------------------------------------------------------------------

export interface ContentTypeData {
  type: string;
  label: string;
  count: number;
  published: number;
  downloads: number;
  revenue: number;
  rating: number;
  ratingCount: number;
}

export interface MarketplaceCreatorData {
  traits: TraitSummary[];
  plugins: PluginSummary[];
  skills: SkillSummary[];
  contentByType: ContentTypeData[];
  totalContent: number;
  totalPublished: number;
  totalDownloads: number;
  totalContentRevenue: number;
}

// ---------------------------------------------------------------------------
// Fetch helper with timeout + abort
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Individual endpoint fetchers
// ---------------------------------------------------------------------------

/**
 * Search traits by author.
 * Endpoint: GET /traits?author=<author>&limit=100
 */
export async function fetchTraitsByAuthor(
  author: string,
): Promise<TraitSummary[]> {
  const url = `${MARKETPLACE_API_BASE}/traits?author=${encodeURIComponent(author)}&limit=100`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Traits API responded with ${response.status}`);
  }

  const body = (await response.json()) as ApiResponse<TraitSearchResult>;
  if (!body.success || !body.data) {
    throw new Error(body.error?.message || 'Failed to fetch traits');
  }

  return body.data.results;
}

/**
 * Search plugins by author.
 * Endpoint: GET /plugins?author=<author>&limit=100
 */
export async function fetchPluginsByAuthor(
  author: string,
): Promise<PluginSummary[]> {
  const url = `${MARKETPLACE_API_BASE}/plugins?author=${encodeURIComponent(author)}&limit=100`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Plugins API responded with ${response.status}`);
  }

  const body = (await response.json()) as ApiResponse<PluginSearchResult>;
  if (!body.success || !body.data) {
    throw new Error(body.error?.message || 'Failed to fetch plugins');
  }

  return body.data.results;
}

/**
 * Search skills by author.
 * Endpoint: GET /skills/search?author=<author>&limit=100
 */
export async function fetchSkillsByAuthor(
  author: string,
): Promise<SkillSummary[]> {
  const url = `${MARKETPLACE_API_BASE}/skills/search?author=${encodeURIComponent(author)}&limit=100`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Skills API responded with ${response.status}`);
  }

  const body = (await response.json()) as ApiResponse<SkillSearchResult>;
  if (!body.success || !body.data) {
    throw new Error(body.error?.message || 'Failed to fetch skills');
  }

  return body.data.results;
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Compute a label for a content type string.
 */
function contentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    trait: 'Traits',
    plugin: 'Plugins',
    skill: 'AI Skills',
  };
  return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Fetch all creator content from the marketplace API and aggregate it.
 *
 * Calls the traits, plugins, and skills endpoints in parallel.
 * If any individual endpoint fails the others still succeed --
 * partial data is better than none.
 *
 * @param author - Author identifier (wallet address or username)
 * @returns Aggregated creator content data
 * @throws If ALL three endpoints fail simultaneously
 */
export async function fetchCreatorContent(
  author: string,
): Promise<MarketplaceCreatorData> {
  const [traitsResult, pluginsResult, skillsResult] = await Promise.allSettled([
    fetchTraitsByAuthor(author),
    fetchPluginsByAuthor(author),
    fetchSkillsByAuthor(author),
  ]);

  const traits = traitsResult.status === 'fulfilled' ? traitsResult.value : [];
  const plugins = pluginsResult.status === 'fulfilled' ? pluginsResult.value : [];
  const skills = skillsResult.status === 'fulfilled' ? skillsResult.value : [];

  // If every call failed, propagate the first error so the hook can trigger fallback
  if (
    traitsResult.status === 'rejected' &&
    pluginsResult.status === 'rejected' &&
    skillsResult.status === 'rejected'
  ) {
    throw traitsResult.reason;
  }

  // Build per-type stats
  const traitStats: ContentTypeData = {
    type: 'trait',
    label: contentTypeLabel('trait'),
    count: traits.length,
    published: traits.filter((t) => !t.deprecated).length,
    downloads: traits.reduce((s, t) => s + t.downloads, 0),
    revenue: 0, // Traits are free by default
    rating: traits.length
      ? traits.reduce((s, t) => s + t.rating, 0) / traits.length
      : 0,
    ratingCount: traits.reduce((s, t) => s + (t.ratingCount ?? 0), 0),
  };

  const pluginStats: ContentTypeData = {
    type: 'plugin',
    label: contentTypeLabel('plugin'),
    count: plugins.length,
    published: plugins.length, // All returned plugins are published
    downloads: plugins.reduce((s, p) => s + p.downloads, 0),
    revenue: 0, // Revenue info requires separate pricing endpoint
    rating: plugins.length
      ? plugins.reduce((s, p) => s + p.rating, 0) / plugins.length
      : 0,
    ratingCount: plugins.reduce((s, p) => s + (p.ratingCount ?? 0), 0),
  };

  const skillStats: ContentTypeData = {
    type: 'skill',
    label: contentTypeLabel('skill'),
    count: skills.length,
    published: skills.filter((s) => !s.deprecated).length,
    downloads: skills.reduce((s, sk) => s + sk.downloads, 0),
    revenue: skills.reduce((s, sk) => s + sk.price, 0),
    rating: skills.length
      ? skills.reduce((s, sk) => s + sk.rating, 0) / skills.length
      : 0,
    ratingCount: skills.reduce((s, sk) => s + (sk.ratingCount ?? 0), 0),
  };

  const contentByType = [traitStats, pluginStats, skillStats].filter(
    (ct) => ct.count > 0,
  );

  const totalContent = traits.length + plugins.length + skills.length;
  const totalPublished =
    traitStats.published + pluginStats.published + skillStats.published;
  const totalDownloads =
    traitStats.downloads + pluginStats.downloads + skillStats.downloads;
  const totalContentRevenue =
    traitStats.revenue + pluginStats.revenue + skillStats.revenue;

  return {
    traits,
    plugins,
    skills,
    contentByType,
    totalContent,
    totalPublished,
    totalDownloads,
    totalContentRevenue,
  };
}
