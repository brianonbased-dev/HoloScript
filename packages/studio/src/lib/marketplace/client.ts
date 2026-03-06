/**
 * Marketplace API client
 *
 * Handles all HTTP requests to the HoloScript marketplace backend.
 * Universal marketplace for all HoloScript content types:
 * - AI Orchestration (workflows, behavior trees)
 * - 3D Content (scenes, characters, models)
 * - Visual Programming (shader graphs, materials)
 * - Animation & Physics
 * - Audio (sound effects, music)
 * - VR/AR Environments
 * - Plugins & Scripts
 */

import type {
  MarketplaceItem,
  MarketplaceCategory,
  MarketplaceFilter,
  MarketplaceResponse,
  ContentUpload,
  ContentReview,
  ContentType,
} from './types';

export interface MarketplaceClientConfig {
  baseUrl?: string;
  apiKey?: string;
  /** MCPMe orchestrator URL for billing and tier checks */
  mcpmeUrl?: string;
  /** MCPMe API key for tier-gated access */
  mcpmeApiKey?: string;
}

export class MarketplaceClient {
  private baseUrl: string;
  private apiKey?: string;
  private mcpmeUrl: string;
  private mcpmeApiKey?: string;

  constructor(config: MarketplaceClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://marketplace.holoscript.net/api';
    this.apiKey = config.apiKey;
    this.mcpmeUrl = config.mcpmeUrl || 'https://mcp-orchestrator-production-45f9.up.railway.app';
    this.mcpmeApiKey = config.mcpmeApiKey;
  }

  /**
   * Fetch headers with auth if available
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * MCPMe orchestrator headers
   */
  private getMCPMeHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.mcpmeApiKey) {
      headers['x-mcp-api-key'] = this.mcpmeApiKey;
    }
    return headers;
  }

  /**
   * Generic GET request (marketplace backend)
   */
  private async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Marketplace API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Generic POST request (marketplace backend)
   */
  private async post<T>(endpoint: string, body: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Marketplace API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * GET request to MCPMe orchestrator
   */
  private async mcpmeGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.mcpmeUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), { headers: this.getMCPMeHeaders() });
    if (!res.ok) throw new Error(`MCPMe error: ${res.status}`);
    return res.json();
  }

  /**
   * POST request to MCPMe orchestrator
   */
  private async mcpmePost<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(new URL(path, this.mcpmeUrl).toString(), {
      method: 'POST',
      headers: this.getMCPMeHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`MCPMe error: ${res.status}`);
    return res.json();
  }

  // ── Content Discovery ─────────────────────────────────────────────────────

  /**
   * Browse content with filters
   */
  async browse(
    filter: MarketplaceFilter = {}
  ): Promise<MarketplaceResponse<MarketplaceItem[]>> {
    return this.get<MarketplaceResponse<MarketplaceItem[]>>('/content', filter);
  }

  /**
   * Search content by query
   */
  async search(
    query: string,
    filter: Omit<MarketplaceFilter, 'search'> = {}
  ): Promise<MarketplaceResponse<MarketplaceItem[]>> {
    return this.get<MarketplaceResponse<MarketplaceItem[]>>('/content/search', {
      ...filter,
      search: query,
    });
  }

  /**
   * Get featured content
   */
  async getFeatured(type?: ContentType): Promise<MarketplaceItem[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceItem[]>>(
      '/content/featured',
      type ? { type } : {}
    );
    return response.data;
  }

  /**
   * Get trending content (most downloads in last 7 days)
   */
  async getTrending(limit = 10, type?: ContentType): Promise<MarketplaceItem[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceItem[]>>(
      '/content/trending',
      { limit, ...(type ? { type } : {}) }
    );
    return response.data;
  }

  /**
   * Get content item by ID
   */
  async getItem(id: string): Promise<MarketplaceItem> {
    return this.get<MarketplaceItem>(`/content/${id}`);
  }

  /**
   * Get content by type
   */
  async getByType(
    type: ContentType,
    filter: Omit<MarketplaceFilter, 'type'> = {}
  ): Promise<MarketplaceResponse<MarketplaceItem[]>> {
    return this.get<MarketplaceResponse<MarketplaceItem[]>>('/content', {
      ...filter,
      type,
    });
  }

  // ── Content Download ──────────────────────────────────────────────────────

  /**
   * Download content (returns parsed JSON for JSON content, blob URL for binary)
   */
  async download(id: string): Promise<any> {
    const item = await this.getItem(id);

    // For binary content (models, audio, etc.), return blob URL
    if (this.isBinaryContent(item.type)) {
      const response = await fetch(`${this.baseUrl}/content/${id}/download`, {
        headers: this.getHeaders(),
      });
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }

    // For JSON content, parse and return
    const response = await this.get<{ content: string }>(`/content/${id}/download`);
    return JSON.parse(response.content);
  }

  /**
   * Check if content type is binary
   */
  private isBinaryContent(type: ContentType): boolean {
    return ['model', 'character', 'audio', 'music'].includes(type);
  }

  /**
   * Track download (increment download count)
   */
  async trackDownload(id: string): Promise<void> {
    await this.post(`/content/${id}/download-count`, {});
  }

  /**
   * Track view (increment view count)
   */
  async trackView(id: string): Promise<void> {
    await this.post(`/content/${id}/view-count`, {});
  }

  // ── Categories ────────────────────────────────────────────────────────────

  /**
   * Get all categories
   */
  async getCategories(): Promise<MarketplaceCategory[]> {
    return this.get<MarketplaceCategory[]>('/categories');
  }

  /**
   * Get content by category
   */
  async getByCategory(
    categoryId: string,
    filter: Omit<MarketplaceFilter, 'category'> = {}
  ): Promise<MarketplaceResponse<MarketplaceItem[]>> {
    return this.get<MarketplaceResponse<MarketplaceItem[]>>('/content', {
      ...filter,
      category: categoryId,
    });
  }

  // ── Reviews & Ratings ─────────────────────────────────────────────────────

  /**
   * Get reviews for content
   */
  async getReviews(contentId: string, page = 1, limit = 10): Promise<MarketplaceResponse<ContentReview[]>> {
    return this.get<MarketplaceResponse<ContentReview[]>>(`/content/${contentId}/reviews`, {
      page,
      limit,
    });
  }

  /**
   * Submit a review
   */
  async submitReview(
    contentId: string,
    rating: number,
    comment: string
  ): Promise<ContentReview> {
    return this.post<ContentReview>(`/content/${contentId}/reviews`, {
      rating,
      comment,
    });
  }

  /**
   * Mark review as helpful
   */
  async markReviewHelpful(reviewId: string): Promise<void> {
    await this.post(`/reviews/${reviewId}/helpful`, {});
  }

  // ── Content Upload ────────────────────────────────────────────────────────

  /**
   * Upload new content
   */
  async upload(upload: ContentUpload): Promise<MarketplaceItem> {
    // For file uploads (binary content + thumbnail), we need multipart/form-data
    const formData = new FormData();
    formData.append('name', upload.name);
    formData.append('description', upload.description);
    formData.append('type', upload.type);
    formData.append('category', upload.category);
    formData.append('tags', JSON.stringify(upload.tags));

    if (upload.license) {
      formData.append('license', upload.license);
    }

    if (upload.version) {
      formData.append('version', upload.version);
    }

    // Content can be string (JSON) or File (binary)
    if (typeof upload.content === 'string') {
      formData.append('content', upload.content);
    } else {
      formData.append('file', upload.content);
    }

    if (upload.thumbnail) {
      formData.append('thumbnail', upload.thumbnail);
    }

    const response = await fetch(`${this.baseUrl}/content/upload`, {
      method: 'POST',
      headers: {
        // Don't set Content-Type for FormData - browser will set it with boundary
        'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update existing content
   */
  async update(id: string, updates: Partial<ContentUpload>): Promise<MarketplaceItem> {
    return this.post<MarketplaceItem>(`/content/${id}`, updates);
  }

  /**
   * Delete content (requires auth + ownership)
   */
  async delete(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/content/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }

  // ── User Content ──────────────────────────────────────────────────────────

  /**
   * Get user's uploaded content
   */
  async getMyContent(type?: ContentType): Promise<MarketplaceItem[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceItem[]>>(
      '/content/mine',
      type ? { type } : {}
    );
    return response.data;
  }

  /**
   * Get user's favorited content
   */
  async getFavorites(type?: ContentType): Promise<MarketplaceItem[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceItem[]>>(
      '/content/favorites',
      type ? { type } : {}
    );
    return response.data;
  }

  /**
   * Add content to favorites
   */
  async addFavorite(contentId: string): Promise<void> {
    await this.post(`/content/${contentId}/favorite`, {});
  }

  /**
   * Remove content from favorites
   */
  async removeFavorite(contentId: string): Promise<void> {
    await fetch(`${this.baseUrl}/content/${contentId}/favorite`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }

  // ── Stats & Analytics ─────────────────────────────────────────────────────

  /**
   * Get marketplace statistics
   */
  async getStats(): Promise<{
    totalContent: number;
    totalDownloads: number;
    totalAuthors: number;
    totalViews: number;
    popularTags: Array<{ tag: string; count: number }>;
    contentByType: Record<ContentType, number>;
  }> {
    return this.get('/stats');
  }

  /**
   * Get stats for specific content type
   */
  async getTypeStats(type: ContentType): Promise<{
    total: number;
    downloads: number;
    views: number;
    averageRating: number;
  }> {
    return this.get(`/stats/${type}`);
  }

  // ── Collections & Bundles ─────────────────────────────────────────────────

  /**
   * Get curated collections (e.g., "Starter Pack", "Advanced VR")
   */
  async getCollections(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    items: MarketplaceItem[];
  }>> {
    return this.get('/collections');
  }

  /**
   * Get collection by ID
   */
  async getCollection(id: string): Promise<{
    id: string;
    name: string;
    description: string;
    items: MarketplaceItem[];
  }> {
    return this.get(`/collections/${id}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MCPMe — Agent Marketplace & Tier-Gated Access
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get MCPMe service catalog with pricing plans
   */
  async getMCPMeCatalog(): Promise<{
    services: Array<{
      id: string; name: string; description: string;
      tier: string; tools: string[]; computeMultiplier: number;
    }>;
    plans: Array<{
      tier: string; name: string; price: number; features: string[];
    }>;
  }> {
    return this.mcpmeGet('/catalog');
  }

  /**
   * Search uAA2++ agent templates on the orchestrator
   */
  async searchAgents(options: {
    query?: string;
    category?: string;
    tier?: string;
    sort?: 'popular' | 'recent' | 'rating';
    limit?: number;
  } = {}): Promise<{
    templates: Array<{
      id: string; name: string; slug: string; description: string;
      author: string; category: string; tier: string;
      tags: string[]; capabilities: string[];
      installs: number; rating: number; ratingCount: number;
      official: boolean;
    }>;
    total: number;
  }> {
    const params: Record<string, string> = {};
    if (options.query) params.q = options.query;
    if (options.category) params.category = options.category;
    if (options.tier) params.tier = options.tier;
    if (options.sort) params.sort = options.sort;
    if (options.limit) params.limit = String(options.limit);
    return this.mcpmeGet('/marketplace/search', params);
  }

  /**
   * Get featured agent templates (official first-party)
   */
  async getFeaturedAgents(): Promise<Array<{
    id: string; name: string; description: string;
    tier: string; installs: number; rating: number;
  }>> {
    const data = await this.mcpmeGet<{ templates: any[] }>('/marketplace/featured');
    return data.templates;
  }

  /**
   * Get agent template detail (includes reviews)
   */
  async getAgentTemplate(id: string): Promise<{
    template: any;
    reviews: any[];
  }> {
    return this.mcpmeGet(`/marketplace/${id}`);
  }

  /**
   * Install an agent template — returns uAAL program + config
   */
  async installAgent(id: string): Promise<{
    success: boolean;
    templateId?: string;
    templateName?: string;
    program?: string;
    programType?: 'intent' | 'bytecode';
    config?: { cognitiveHz: number; capabilities: string[] };
    error?: string;
  }> {
    return this.mcpmePost(`/marketplace/${id}/install`, {});
  }

  /**
   * Get agent marketplace statistics
   */
  async getAgentMarketplaceStats(): Promise<{
    total: number;
    totalInstalls: number;
    categories: number;
    avgRating: number;
  }> {
    return this.mcpmeGet('/marketplace/stats');
  }

  /**
   * Get agent categories with counts
   */
  async getAgentCategories(): Promise<{
    categories: Array<{ category: string; count: number }>;
  }> {
    return this.mcpmeGet('/marketplace/categories');
  }
}

// ── Singleton Instance ────────────────────────────────────────────────────

let marketplaceClient: MarketplaceClient | null = null;

/**
 * Get marketplace client singleton
 */
export function getMarketplaceClient(config?: MarketplaceClientConfig): MarketplaceClient {
  if (!marketplaceClient) {
    marketplaceClient = new MarketplaceClient(config);
  }
  return marketplaceClient;
}

/**
 * Configure marketplace client (set API key, base URL)
 */
export function configureMarketplace(config: MarketplaceClientConfig): void {
  marketplaceClient = new MarketplaceClient(config);
}

