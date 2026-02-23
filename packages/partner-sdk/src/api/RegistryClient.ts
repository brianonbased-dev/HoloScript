/**
 * HoloScript Registry API Client
 *
 * Provides programmatic access to the HoloScript package registry.
 */

import { hmacSha256 } from '../utils/crypto.js';

/**
 * Partner authentication credentials
 */
export interface PartnerCredentials {
  partnerId: string;
  apiKey: string;
  secretKey?: string;
}

/**
 * API client configuration
 */
export interface RegistryClientConfig {
  credentials: PartnerCredentials;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Package metadata from registry
 */
export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string };
  license?: string;
  downloads: {
    total: number;
    lastMonth: number;
    lastWeek: number;
  };
  certified: boolean;
  certificationGrade?: string;
  publishedAt: string;
  updatedAt: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
  maintainers: Array<{ name: string; email?: string }>;
}

/**
 * Package version info
 */
export interface VersionInfo {
  version: string;
  publishedAt: string;
  deprecated?: boolean;
  deprecationReason?: string;
  downloadCount: number;
  tarballUrl: string;
  integrity: string;
}

/**
 * Search result from registry
 */
export interface SearchResult {
  packages: Array<{
    name: string;
    version: string;
    description?: string;
    certified: boolean;
    downloads: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  rateLimit?: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
}

/**
 * Rate limiting error
 */
export class RateLimitError extends Error {
  constructor(
    public readonly retryAfter: number,
    public readonly limit: number
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    this.name = 'RateLimitError';
  }
}

/**
 * API authentication error
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Registry API Client
 *
 * Main client for interacting with the HoloScript package registry.
 */
export class RegistryClient {
  private config: Required<RegistryClientConfig>;
  private rateLimitRemaining: number = 1000;
  private rateLimitResetAt: Date | null = null;

  constructor(config: RegistryClientConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || 'https://registry.holoscript.net/api/v1',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
    };
  }

  /**
   * Get package information
   */
  async getPackage(name: string): Promise<ApiResponse<PackageInfo>> {
    return this.request<PackageInfo>('GET', `/packages/${encodeURIComponent(name)}`);
  }

  /**
   * Get specific version information
   */
  async getVersion(name: string, version: string): Promise<ApiResponse<VersionInfo>> {
    return this.request<VersionInfo>(
      'GET',
      `/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`
    );
  }

  /**
   * List all versions of a package
   */
  async listVersions(name: string): Promise<ApiResponse<VersionInfo[]>> {
    return this.request<VersionInfo[]>('GET', `/packages/${encodeURIComponent(name)}/versions`);
  }

  /**
   * Search for packages
   */
  async search(
    query: string,
    options?: {
      page?: number;
      pageSize?: number;
      certified?: boolean;
      keywords?: string[];
      sort?: 'relevance' | 'downloads' | 'recent';
    }
  ): Promise<ApiResponse<SearchResult>> {
    const params = new URLSearchParams({ q: query });

    if (options?.page) params.set('page', options.page.toString());
    if (options?.pageSize) params.set('pageSize', options.pageSize.toString());
    if (options?.certified !== undefined) params.set('certified', options.certified.toString());
    if (options?.keywords?.length) params.set('keywords', options.keywords.join(','));
    if (options?.sort) params.set('sort', options.sort);

    return this.request<SearchResult>('GET', `/packages/search?${params}`);
  }

  /**
   * Get download statistics for a package
   */
  async getDownloadStats(
    name: string,
    period: 'day' | 'week' | 'month' | 'year' = 'month'
  ): Promise<ApiResponse<{ date: string; downloads: number }[]>> {
    return this.request<{ date: string; downloads: number }[]>(
      'GET',
      `/packages/${encodeURIComponent(name)}/stats/downloads?period=${period}`
    );
  }

  /**
   * Check if a package name is available
   */
  async checkNameAvailability(
    name: string
  ): Promise<ApiResponse<{ available: boolean; reason?: string }>> {
    return this.request<{ available: boolean; reason?: string }>(
      'GET',
      `/packages/check-name/${encodeURIComponent(name)}`
    );
  }

  /**
   * Get partner's published packages
   */
  async getMyPackages(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<{ packages: PackageInfo[]; total: number }>> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', options.page.toString());
    if (options?.pageSize) params.set('pageSize', options.pageSize.toString());

    return this.request<{ packages: PackageInfo[]; total: number }>(
      'GET',
      `/partner/packages?${params}`
    );
  }

  /**
   * Deprecate a package version
   */
  async deprecateVersion(
    name: string,
    version: string,
    reason: string
  ): Promise<ApiResponse<void>> {
    return this.request<void>(
      'POST',
      `/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/deprecate`,
      {
        reason,
      }
    );
  }

  /**
   * Add or update package keywords
   */
  async updateKeywords(name: string, keywords: string[]): Promise<ApiResponse<void>> {
    return this.request<void>('PATCH', `/packages/${encodeURIComponent(name)}`, { keywords });
  }

  /**
   * Transfer package ownership
   */
  async transferOwnership(
    name: string,
    newOwnerId: string
  ): Promise<ApiResponse<{ transferToken: string; expiresAt: string }>> {
    return this.request<{ transferToken: string; expiresAt: string }>(
      'POST',
      `/packages/${encodeURIComponent(name)}/transfer`,
      { newOwnerId }
    );
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): { remaining: number; resetAt: Date | null } {
    return {
      remaining: this.rateLimitRemaining,
      resetAt: this.rateLimitResetAt,
    };
  }

  /**
   * Validate partner credentials
   */
  async validateCredentials(): Promise<
    ApiResponse<{ valid: boolean; partnerId: string; tier: string }>
  > {
    return this.request<{ valid: boolean; partnerId: string; tier: string }>(
      'GET',
      '/partner/validate'
    );
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const _url = `${this.config.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Partner-ID': this.config.credentials.partnerId,
      'X-API-Key': this.config.credentials.apiKey,
    };

    if (this.config.credentials.secretKey) {
      // Generate request signature for enhanced security (HMAC-SHA256)
      const timestamp = Date.now().toString();
      const signature = await this.generateSignature(method, endpoint, timestamp, body);
      headers['X-Timestamp'] = timestamp;
      headers['X-Signature'] = signature;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const response = await this.executeRequest<T>(_url, method, headers, body);

        // Update rate limit tracking
        if (response.rateLimit) {
          this.rateLimitRemaining = response.rateLimit.remaining;
          this.rateLimitResetAt = new Date(response.rateLimit.resetAt);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof RateLimitError) {
          // Don't retry rate limit errors
          throw error;
        }

        if (error instanceof AuthenticationError) {
          // Don't retry auth errors
          throw error;
        }

        // Wait before retry
        if (attempt < this.config.retries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Generate request signature for secure endpoints
   */
  private async generateSignature(
    method: string,
    endpoint: string,
    timestamp: string,
    body?: unknown
  ): Promise<string> {
    const payload = `${method}:${endpoint}:${timestamp}:${body ? JSON.stringify(body) : ''}`;
    const secret = this.config.credentials.secretKey || this.config.credentials.apiKey;
    return hmacSha256(payload, secret);
  }

  /**
   * Execute authenticated API request
   */
  private async executeRequest<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      const rateLimitHeader = response.headers.get('X-RateLimit-Remaining');
      const rateLimitResetHeader = response.headers.get('X-RateLimit-Reset');

      const result = (await response.json()) as ApiResponse<T>;

      if (rateLimitHeader && rateLimitResetHeader) {
        result.rateLimit = {
          remaining: parseInt(rateLimitHeader, 10),
          limit: parseInt(response.headers.get('X-RateLimit-Limit') || '1000', 10),
          resetAt: new Date(parseInt(rateLimitResetHeader, 10) * 1000).toISOString(),
        };
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new RateLimitError(
            parseInt(response.headers.get('Retry-After') || '60', 10),
            result.rateLimit?.limit || 1000
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(result.error?.message || 'Authentication failed');
        }
        throw new Error(result.error?.message || `Request failed with status ${response.status}`);
      }

      return result;
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error(`Request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a registry client instance
 */
export function createRegistryClient(config: RegistryClientConfig): RegistryClient {
  return new RegistryClient(config);
}
