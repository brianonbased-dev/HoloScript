/**
 * HoloScript Marketplace API Client
 *
 * Client for communicating with the marketplace-api backend
 */

import type {
  TraitPackage,
  TraitSummary,
  SearchQuery,
  SearchResult,
  VersionInfo,
  DownloadStats,
  DependencyTree,
  TraitRating,
  ApiError,
} from '../types';

//=============================================================================
// Configuration
//=============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

//=============================================================================
// Base Request Handler
//=============================================================================

class MarketplaceApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MarketplaceApiError';
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    signal,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let error: ApiError;
    try {
      const data = await response.json();
      error = data.error || { code: 'UNKNOWN_ERROR', message: response.statusText };
    } catch {
      error = { code: 'PARSE_ERROR', message: response.statusText };
    }

    throw new MarketplaceApiError(error.message, error.code, response.status, error.details);
  }

  const data = await response.json();
  return data.data ?? data;
}

//=============================================================================
// Trait API
//=============================================================================

export const traitsApi = {
  /**
   * Search for traits
   */
  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult> {
    const params = new URLSearchParams();

    if (query.q) params.set('q', query.q);
    if (query.category) params.set('category', query.category);
    if (query.platform) params.set('platform', query.platform);
    if (query.author) params.set('author', query.author);
    if (query.verified !== undefined) params.set('verified', String(query.verified));
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortOrder) params.set('sortOrder', query.sortOrder);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));

    const queryString = params.toString();
    const endpoint = `/traits${queryString ? `?${queryString}` : ''}`;

    return request<SearchResult>(endpoint, { signal });
  },

  /**
   * Get a specific trait by ID
   */
  async getTrait(id: string, version?: string): Promise<TraitPackage> {
    const endpoint = version
      ? `/traits/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`
      : `/traits/${encodeURIComponent(id)}`;
    return request<TraitPackage>(endpoint);
  },

  /**
   * Get all versions of a trait
   */
  async getVersions(id: string): Promise<VersionInfo[]> {
    return request<VersionInfo[]>(`/traits/${encodeURIComponent(id)}/versions`);
  },

  /**
   * Get download statistics for a trait
   */
  async getStats(id: string): Promise<DownloadStats> {
    return request<DownloadStats>(`/traits/${encodeURIComponent(id)}/stats`);
  },

  /**
   * Get popular traits
   */
  async getPopular(category?: string, limit = 10): Promise<TraitSummary[]> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    params.set('limit', String(limit));
    params.set('sortBy', 'downloads');
    params.set('sortOrder', 'desc');

    const result = await request<SearchResult>(`/traits?${params.toString()}`);
    return result.traits;
  },

  /**
   * Get recently updated traits
   */
  async getRecent(limit = 10): Promise<TraitSummary[]> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('sortBy', 'updated');
    params.set('sortOrder', 'desc');

    const result = await request<SearchResult>(`/traits?${params.toString()}`);
    return result.traits;
  },

  /**
   * Record a download (called when user installs a trait)
   */
  async recordDownload(id: string, version: string): Promise<void> {
    await request(`/traits/${encodeURIComponent(id)}/download`, {
      method: 'POST',
      body: { version },
    });
  },
};

//=============================================================================
// Dependency API
//=============================================================================

export const dependenciesApi = {
  /**
   * Resolve dependencies for a set of traits
   */
  async resolve(traits: Array<{ id: string; version: string }>): Promise<DependencyTree> {
    return request<DependencyTree>('/resolve', {
      method: 'POST',
      body: { traits },
    });
  },

  /**
   * Check compatibility between traits
   */
  async checkCompatibility(traits: Array<{ id: string; version: string }>): Promise<{
    compatible: boolean;
    conflicts: Array<{
      traitId: string;
      requestedVersions: Array<{ by: string; version: string }>;
      resolvedVersion: string;
      severity: 'warning' | 'error';
    }>;
  }> {
    return request('/compatibility', {
      method: 'POST',
      body: { traits },
    });
  },
};

//=============================================================================
// Ratings API
//=============================================================================

export const ratingsApi = {
  /**
   * Get ratings for a trait
   */
  async getRatings(
    traitId: string,
    options?: { page?: number; limit?: number }
  ): Promise<{
    ratings: TraitRating[];
    total: number;
    average: number;
  }> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));

    const queryString = params.toString();
    const endpoint = `/traits/${encodeURIComponent(traitId)}/ratings${queryString ? `?${queryString}` : ''}`;

    return request(endpoint);
  },

  /**
   * Submit a rating for a trait
   */
  async submitRating(traitId: string, rating: number, review?: string): Promise<void> {
    await request(`/traits/${encodeURIComponent(traitId)}/ratings`, {
      method: 'POST',
      body: { rating, review },
    });
  },
};

//=============================================================================
// User API
//=============================================================================

export const usersApi = {
  /**
   * Get user/author profile
   */
  async getProfile(userId: string): Promise<{
    id: string;
    name: string;
    avatar?: string;
    verified: boolean;
    github?: string;
    website?: string;
    traitsCount: number;
    totalDownloads: number;
    joinedAt: Date;
  }> {
    return request(`/users/${encodeURIComponent(userId)}`);
  },

  /**
   * Get traits published by a user
   */
  async getTraits(userId: string): Promise<TraitSummary[]> {
    const result = await request<SearchResult>(`/traits?author=${encodeURIComponent(userId)}`);
    return result.traits;
  },
};

//=============================================================================
// Health API
//=============================================================================

export const healthApi = {
  /**
   * Check API health status
   */
  async check(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    timestamp: string;
  }> {
    return request('/health');
  },
};

//=============================================================================
// Export Combined API
//=============================================================================

export const marketplaceApi = {
  traits: traitsApi,
  dependencies: dependenciesApi,
  ratings: ratingsApi,
  users: usersApi,
  health: healthApi,
};

export { MarketplaceApiError };
export default marketplaceApi;
