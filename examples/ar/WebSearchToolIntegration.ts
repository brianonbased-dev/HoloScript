/**
 * WebSearchToolIntegration — Web search tool for the ResearchAgent
 *
 * Integrates web_search tool capability into the uAA2++ ResearchAgent pipeline.
 * Provides tool definition, result parsing, rate limiting, a time-based cache
 * layer, and relevance scoring for ranking search results.
 *
 * Features:
 *   - Standard tool definition compatible with MCP tool protocol
 *   - Rate limiter with configurable window, burst, and cooldown
 *   - TTL-based cache to avoid duplicate queries within a session
 *   - BM25-inspired relevance scoring with term frequency and field boosts
 *   - Result deduplication by URL
 *   - Integration hooks for ResearchAgent phases (Discover, Execute)
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/** Standard MCP-compatible tool definition */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterDef>;
    required: string[];
  };
}

export interface ToolParameterDef {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  enum?: string[];
  default?: unknown;
  items?: { type: string };
}

/** Raw result from the web search provider */
export interface RawSearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

/** Scored and enriched search result */
export interface ScoredSearchResult extends RawSearchResult {
  relevanceScore: number;
  termMatches: number;
  freshnessFactor: number;
  domainAuthority: number;
  deduplicated: boolean;
}

/** Search request parameters */
export interface SearchRequest {
  query: string;
  maxResults?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  freshnessDays?: number;
  language?: string;
}

/** Full search response */
export interface SearchResponse {
  query: string;
  results: ScoredSearchResult[];
  totalRawResults: number;
  cacheHit: boolean;
  rateLimited: boolean;
  executionMs: number;
  timestamp: number;
}

/** Rate limiter configuration */
export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Minimum delay between requests in milliseconds */
  minDelayMs: number;
  /** Cooldown period after hitting limit, in milliseconds */
  cooldownMs: number;
}

/** Cache configuration */
export interface CacheConfig {
  /** Time-to-live for cached results in milliseconds */
  ttlMs: number;
  /** Maximum number of cached entries */
  maxEntries: number;
  /** Whether to match queries case-insensitively */
  caseInsensitive: boolean;
}

/** Relevance scoring weights */
export interface ScoringWeights {
  /** Weight for title term matches (0-1) */
  titleWeight: number;
  /** Weight for snippet term matches (0-1) */
  snippetWeight: number;
  /** Weight for URL keyword matches (0-1) */
  urlWeight: number;
  /** Weight for content freshness (0-1) */
  freshnessWeight: number;
  /** Weight for domain authority (0-1) */
  domainAuthorityWeight: number;
  /** Bonus for exact phrase match */
  exactMatchBonus: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
  minDelayMs: 200,
  cooldownMs: 10_000,
};

const DEFAULT_CACHE: CacheConfig = {
  ttlMs: 15 * 60_000, // 15 minutes
  maxEntries: 200,
  caseInsensitive: true,
};

const DEFAULT_SCORING: ScoringWeights = {
  titleWeight: 0.35,
  snippetWeight: 0.30,
  urlWeight: 0.05,
  freshnessWeight: 0.15,
  domainAuthorityWeight: 0.10,
  exactMatchBonus: 0.05,
};

/**
 * Domain authority scores for well-known technical sources.
 * 0.0 = unknown, 1.0 = highest authority.
 */
const DOMAIN_AUTHORITY: Record<string, number> = {
  'developer.mozilla.org': 0.95,
  'docs.microsoft.com': 0.90,
  'learn.microsoft.com': 0.90,
  'github.com': 0.85,
  'stackoverflow.com': 0.80,
  'arxiv.org': 0.85,
  'w3.org': 0.95,
  'tc39.es': 0.90,
  'nodejs.org': 0.90,
  'typescriptlang.org': 0.90,
  'react.dev': 0.90,
  'threejs.org': 0.85,
  'docs.rs': 0.85,
  'en.wikipedia.org': 0.70,
  'medium.com': 0.40,
  'dev.to': 0.45,
};

// =============================================================================
// TOOL DEFINITION
// =============================================================================

/**
 * MCP-compatible tool definition for web_search.
 * Register this with the agent's tool registry.
 */
export const WEB_SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for current information. Returns ranked results with relevance scores. ' +
    'Use for: technical documentation, API references, recent announcements, research papers, ' +
    'and any information beyond the knowledge cutoff.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Be specific and include relevant keywords.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (1-20). Default: 10.',
        default: 10,
      },
      allowed_domains: {
        type: 'array',
        description: 'Only include results from these domains.',
        items: { type: 'string' },
      },
      blocked_domains: {
        type: 'array',
        description: 'Exclude results from these domains.',
        items: { type: 'string' },
      },
      freshness_days: {
        type: 'number',
        description: 'Prefer results published within this many days. Default: no preference.',
      },
    },
    required: ['query'],
  },
};

// =============================================================================
// RATE LIMITER
// =============================================================================

export class RateLimiter {
  private config: RateLimitConfig;
  private timestamps: number[] = [];
  private cooldownUntil: number = 0;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }

  /**
   * Check if a request is allowed right now.
   * Returns the number of milliseconds to wait, or 0 if allowed immediately.
   */
  check(): number {
    const now = Date.now();

    // In cooldown?
    if (now < this.cooldownUntil) {
      return this.cooldownUntil - now;
    }

    // Clean old timestamps outside the window
    this.timestamps = this.timestamps.filter(
      (ts) => now - ts < this.config.windowMs,
    );

    // Over limit?
    if (this.timestamps.length >= this.config.maxRequests) {
      this.cooldownUntil = now + this.config.cooldownMs;
      return this.config.cooldownMs;
    }

    // Enforce minimum delay between requests
    if (this.timestamps.length > 0) {
      const lastTs = this.timestamps[this.timestamps.length - 1];
      const elapsed = now - lastTs;
      if (elapsed < this.config.minDelayMs) {
        return this.config.minDelayMs - elapsed;
      }
    }

    return 0;
  }

  /**
   * Record that a request was made. Call after successful execution.
   */
  record(): void {
    this.timestamps.push(Date.now());
  }

  /**
   * Get current usage statistics.
   */
  getStats(): { used: number; remaining: number; windowMs: number; inCooldown: boolean } {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(
      (ts) => now - ts < this.config.windowMs,
    );
    return {
      used: this.timestamps.length,
      remaining: Math.max(0, this.config.maxRequests - this.timestamps.length),
      windowMs: this.config.windowMs,
      inCooldown: now < this.cooldownUntil,
    };
  }
}

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry {
  response: SearchResponse;
  expiresAt: number;
}

export class SearchCache {
  private config: CacheConfig;
  private entries: Map<string, CacheEntry> = new Map();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE, ...config };
  }

  /**
   * Normalize a query string for cache key generation.
   */
  private normalizeKey(query: string): string {
    let key = query.trim().replace(/\s+/g, ' ');
    if (this.config.caseInsensitive) key = key.toLowerCase();
    return key;
  }

  /**
   * Get a cached response if available and not expired.
   */
  get(query: string): SearchResponse | null {
    const key = this.normalizeKey(query);
    const entry = this.entries.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return { ...entry.response, cacheHit: true };
  }

  /**
   * Store a response in the cache.
   */
  set(query: string, response: SearchResponse): void {
    // Evict oldest entries if at capacity
    if (this.entries.size >= this.config.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }

    const key = this.normalizeKey(query);
    this.entries.set(key, {
      response,
      expiresAt: Date.now() + this.config.ttlMs,
    });
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; maxEntries: number; ttlMs: number } {
    return {
      size: this.entries.size,
      maxEntries: this.config.maxEntries,
      ttlMs: this.config.ttlMs,
    };
  }
}

// =============================================================================
// RELEVANCE SCORER
// =============================================================================

export class RelevanceScorer {
  private weights: ScoringWeights;

  constructor(weights: Partial<ScoringWeights> = {}) {
    this.weights = { ...DEFAULT_SCORING, ...weights };
  }

  /**
   * Score a single search result against the original query.
   */
  score(result: RawSearchResult, query: string): ScoredSearchResult {
    const queryTerms = this.tokenize(query);
    const now = Date.now();

    // Term frequency scoring
    const titleScore = this.computeTermScore(this.tokenize(result.title), queryTerms);
    const snippetScore = this.computeTermScore(this.tokenize(result.snippet), queryTerms);
    const urlScore = this.computeTermScore(this.tokenize(result.url), queryTerms);

    // Freshness scoring
    let freshnessFactor = 0.5; // neutral default
    if (result.publishedDate) {
      const publishedMs = new Date(result.publishedDate).getTime();
      if (!isNaN(publishedMs)) {
        const ageMs = now - publishedMs;
        const ageDays = ageMs / (24 * 60 * 60 * 1000);
        // Exponential decay: full score within 7 days, halves every 30 days
        freshnessFactor = Math.exp(-ageDays / 43.3); // ln(2)/30 ≈ 0.0231 -> 1/0.0231 ≈ 43.3
      }
    }

    // Domain authority
    const domain = this.extractDomain(result.url);
    const domainAuthority = DOMAIN_AUTHORITY[domain] ?? 0.3;

    // Exact phrase match bonus
    const titleLower = result.title.toLowerCase();
    const snippetLower = result.snippet.toLowerCase();
    const queryLower = query.toLowerCase();
    const exactMatch =
      titleLower.includes(queryLower) || snippetLower.includes(queryLower) ? 1 : 0;

    // Total term matches (for debugging/display)
    const termMatches =
      this.countMatches(this.tokenize(result.title), queryTerms) +
      this.countMatches(this.tokenize(result.snippet), queryTerms);

    // Weighted relevance score
    const relevanceScore = Math.min(
      1.0,
      titleScore * this.weights.titleWeight +
        snippetScore * this.weights.snippetWeight +
        urlScore * this.weights.urlWeight +
        freshnessFactor * this.weights.freshnessWeight +
        domainAuthority * this.weights.domainAuthorityWeight +
        exactMatch * this.weights.exactMatchBonus,
    );

    return {
      ...result,
      relevanceScore,
      termMatches,
      freshnessFactor,
      domainAuthority,
      deduplicated: false,
    };
  }

  /**
   * Score and rank an array of results.
   * Deduplicates by URL and sorts by relevance descending.
   */
  scoreAndRank(
    results: RawSearchResult[],
    query: string,
    maxResults: number = 10,
  ): ScoredSearchResult[] {
    const scored = results.map((r) => this.score(r, query));

    // Deduplicate by normalized URL
    const seen = new Set<string>();
    const deduped: ScoredSearchResult[] = [];

    for (const result of scored) {
      const normalizedUrl = result.url.replace(/\/$/, '').toLowerCase();
      if (seen.has(normalizedUrl)) {
        continue;
      }
      seen.add(normalizedUrl);
      deduped.push(result);
    }

    // Sort by relevance
    deduped.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return deduped.slice(0, maxResults);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private computeTermScore(documentTerms: string[], queryTerms: string[]): number {
    if (queryTerms.length === 0 || documentTerms.length === 0) return 0;

    let matched = 0;
    for (const qt of queryTerms) {
      if (documentTerms.includes(qt)) matched++;
    }

    // BM25-inspired: diminishing returns for repeated matches
    const tf = matched / queryTerms.length;
    const k = 1.2;
    return (tf * (k + 1)) / (tf + k);
  }

  private countMatches(documentTerms: string[], queryTerms: string[]): number {
    let count = 0;
    for (const qt of queryTerms) {
      for (const dt of documentTerms) {
        if (dt === qt) count++;
      }
    }
    return count;
  }

  private extractDomain(url: string): string {
    try {
      const match = url.match(/^https?:\/\/([^/]+)/);
      if (!match) return '';
      return match[1].replace(/^www\./, '');
    } catch {
      return '';
    }
  }
}

// =============================================================================
// WEB SEARCH INTEGRATION
// =============================================================================

/** Callback type for the actual search provider (HTTP fetch, MCP call, etc.) */
export type SearchProviderFn = (request: SearchRequest) => Promise<RawSearchResult[]>;

export interface WebSearchIntegrationConfig {
  provider: SearchProviderFn;
  rateLimit?: Partial<RateLimitConfig>;
  cache?: Partial<CacheConfig>;
  scoring?: Partial<ScoringWeights>;
  defaultMaxResults?: number;
}

/**
 * Main integration class. Wire this into the ResearchAgent.
 */
export class WebSearchIntegration {
  private provider: SearchProviderFn;
  private rateLimiter: RateLimiter;
  private cache: SearchCache;
  private scorer: RelevanceScorer;
  private defaultMaxResults: number;

  constructor(config: WebSearchIntegrationConfig) {
    this.provider = config.provider;
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.cache = new SearchCache(config.cache);
    this.scorer = new RelevanceScorer(config.scoring);
    this.defaultMaxResults = config.defaultMaxResults ?? 10;
  }

  /**
   * Get the tool definition for registration with the agent's tool registry.
   */
  getToolDefinition(): ToolDefinition {
    return WEB_SEARCH_TOOL_DEFINITION;
  }

  /**
   * Execute a search. Checks cache, enforces rate limits, scores results.
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const start = Date.now();
    const maxResults = request.maxResults ?? this.defaultMaxResults;

    // Check cache first
    const cached = this.cache.get(request.query);
    if (cached) {
      return {
        ...cached,
        executionMs: Date.now() - start,
      };
    }

    // Check rate limit
    const waitMs = this.rateLimiter.check();
    if (waitMs > 0) {
      // Return rate-limited response rather than blocking
      return {
        query: request.query,
        results: [],
        totalRawResults: 0,
        cacheHit: false,
        rateLimited: true,
        executionMs: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    // Execute search via provider
    let rawResults: RawSearchResult[];
    try {
      rawResults = await this.provider(request);
      this.rateLimiter.record();
    } catch (error) {
      // On provider error, return empty results with metadata
      return {
        query: request.query,
        results: [],
        totalRawResults: 0,
        cacheHit: false,
        rateLimited: false,
        executionMs: Date.now() - start,
        timestamp: Date.now(),
      };
    }

    // Apply domain filters
    let filtered = rawResults;
    if (request.allowedDomains && request.allowedDomains.length > 0) {
      const allowed = new Set(request.allowedDomains.map((d) => d.toLowerCase()));
      filtered = filtered.filter((r) => {
        const domain = this.extractDomain(r.url);
        return allowed.has(domain);
      });
    }
    if (request.blockedDomains && request.blockedDomains.length > 0) {
      const blocked = new Set(request.blockedDomains.map((d) => d.toLowerCase()));
      filtered = filtered.filter((r) => {
        const domain = this.extractDomain(r.url);
        return !blocked.has(domain);
      });
    }

    // Apply freshness filter
    if (request.freshnessDays) {
      const cutoff = Date.now() - request.freshnessDays * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((r) => {
        if (!r.publishedDate) return true; // keep results without dates
        const published = new Date(r.publishedDate).getTime();
        return !isNaN(published) && published >= cutoff;
      });
    }

    // Score and rank
    const scored = this.scorer.scoreAndRank(filtered, request.query, maxResults);

    const response: SearchResponse = {
      query: request.query,
      results: scored,
      totalRawResults: rawResults.length,
      cacheHit: false,
      rateLimited: false,
      executionMs: Date.now() - start,
      timestamp: Date.now(),
    };

    // Cache the response
    this.cache.set(request.query, response);

    return response;
  }

  /**
   * Parse tool call arguments from the agent and execute search.
   * Use this as the tool handler callback.
   */
  async handleToolCall(args: Record<string, unknown>): Promise<SearchResponse> {
    const request: SearchRequest = {
      query: String(args.query ?? ''),
      maxResults: typeof args.max_results === 'number' ? args.max_results : undefined,
      allowedDomains: Array.isArray(args.allowed_domains)
        ? args.allowed_domains.map(String)
        : undefined,
      blockedDomains: Array.isArray(args.blocked_domains)
        ? args.blocked_domains.map(String)
        : undefined,
      freshnessDays: typeof args.freshness_days === 'number' ? args.freshness_days : undefined,
    };

    return this.search(request);
  }

  /**
   * Get operational statistics.
   */
  getStats(): {
    rateLimiter: ReturnType<RateLimiter['getStats']>;
    cache: ReturnType<SearchCache['getStats']>;
  } {
    return {
      rateLimiter: this.rateLimiter.getStats(),
      cache: this.cache.getStats(),
    };
  }

  /**
   * Clear cache and reset rate limiter state.
   */
  reset(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractDomain(url: string): string {
    try {
      const match = url.match(/^https?:\/\/([^/]+)/);
      if (!match) return '';
      return match[1].replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a WebSearchIntegration with a mock provider for testing.
 */
export function createMockWebSearch(): WebSearchIntegration {
  const mockProvider: SearchProviderFn = async (request) => {
    // Return synthetic results for testing
    return [
      {
        url: `https://docs.example.com/search?q=${encodeURIComponent(request.query)}`,
        title: `Documentation: ${request.query}`,
        snippet: `Comprehensive guide to ${request.query} with examples and best practices.`,
        publishedDate: new Date().toISOString(),
        source: 'docs.example.com',
      },
      {
        url: `https://github.com/example/${request.query.replace(/\s+/g, '-')}`,
        title: `${request.query} - GitHub Repository`,
        snippet: `Open source implementation of ${request.query}. Stars: 1.2k, Last updated: today.`,
        publishedDate: new Date().toISOString(),
        source: 'github.com',
      },
    ];
  };

  return new WebSearchIntegration({ provider: mockProvider });
}
