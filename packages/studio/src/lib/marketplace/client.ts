/**
 * Marketplace API client
 *
 * Handles all HTTP requests to the HoloScript marketplace backend.
 * Supports browsing, searching, downloading, and uploading templates.
 */

import type {
  MarketplaceTemplate,
  MarketplaceCategory,
  MarketplaceFilter,
  MarketplaceResponse,
  TemplateUpload,
  TemplateReview,
} from './types';
import type { AgentWorkflow } from '@/lib/orchestrationStore';
import type { BTNode } from '@/lib/orchestrationStore';

export interface MarketplaceClientConfig {
  baseUrl?: string;
  apiKey?: string;
}

export class MarketplaceClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: MarketplaceClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://marketplace.holoscript.xyz/api';
    this.apiKey = config.apiKey;
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
   * Generic GET request
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
   * Generic POST request
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

  // ── Template Discovery ────────────────────────────────────────────────────

  /**
   * Browse templates with filters
   */
  async browseTemplates(
    filter: MarketplaceFilter = {}
  ): Promise<MarketplaceResponse<MarketplaceTemplate[]>> {
    return this.get<MarketplaceResponse<MarketplaceTemplate[]>>('/templates', filter);
  }

  /**
   * Search templates by query
   */
  async searchTemplates(
    query: string,
    filter: Omit<MarketplaceFilter, 'search'> = {}
  ): Promise<MarketplaceResponse<MarketplaceTemplate[]>> {
    return this.get<MarketplaceResponse<MarketplaceTemplate[]>>('/templates/search', {
      ...filter,
      search: query,
    });
  }

  /**
   * Get featured templates
   */
  async getFeaturedTemplates(): Promise<MarketplaceTemplate[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceTemplate[]>>(
      '/templates/featured'
    );
    return response.data;
  }

  /**
   * Get trending templates (most downloads in last 7 days)
   */
  async getTrendingTemplates(limit = 10): Promise<MarketplaceTemplate[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceTemplate[]>>(
      '/templates/trending',
      { limit }
    );
    return response.data;
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string): Promise<MarketplaceTemplate> {
    return this.get<MarketplaceTemplate>(`/templates/${id}`);
  }

  // ── Template Download ─────────────────────────────────────────────────────

  /**
   * Download template content
   */
  async downloadTemplate(id: string): Promise<AgentWorkflow | BTNode[]> {
    const response = await this.get<{ content: string }>(`/templates/${id}/download`);
    return JSON.parse(response.content);
  }

  /**
   * Track download (increment download count)
   */
  async trackDownload(id: string): Promise<void> {
    await this.post(`/templates/${id}/download-count`, {});
  }

  // ── Categories ────────────────────────────────────────────────────────────

  /**
   * Get all categories
   */
  async getCategories(): Promise<MarketplaceCategory[]> {
    return this.get<MarketplaceCategory[]>('/categories');
  }

  /**
   * Get templates by category
   */
  async getTemplatesByCategory(
    categoryId: string,
    filter: Omit<MarketplaceFilter, 'category'> = {}
  ): Promise<MarketplaceResponse<MarketplaceTemplate[]>> {
    return this.get<MarketplaceResponse<MarketplaceTemplate[]>>('/templates', {
      ...filter,
      category: categoryId,
    });
  }

  // ── Reviews & Ratings ─────────────────────────────────────────────────────

  /**
   * Get reviews for a template
   */
  async getReviews(templateId: string, page = 1, limit = 10): Promise<MarketplaceResponse<TemplateReview[]>> {
    return this.get<MarketplaceResponse<TemplateReview[]>>(`/templates/${templateId}/reviews`, {
      page,
      limit,
    });
  }

  /**
   * Submit a review
   */
  async submitReview(
    templateId: string,
    rating: number,
    comment: string
  ): Promise<TemplateReview> {
    return this.post<TemplateReview>(`/templates/${templateId}/reviews`, {
      rating,
      comment,
    });
  }

  // ── Template Upload ───────────────────────────────────────────────────────

  /**
   * Upload a new template
   */
  async uploadTemplate(upload: TemplateUpload): Promise<MarketplaceTemplate> {
    // For file uploads (thumbnail), we need multipart/form-data
    const formData = new FormData();
    formData.append('name', upload.name);
    formData.append('description', upload.description);
    formData.append('type', upload.type);
    formData.append('category', upload.category);
    formData.append('tags', JSON.stringify(upload.tags));
    formData.append('content', upload.content);

    if (upload.thumbnail) {
      formData.append('thumbnail', upload.thumbnail);
    }

    const response = await fetch(`${this.baseUrl}/templates/upload`, {
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
   * Update existing template
   */
  async updateTemplate(id: string, updates: Partial<TemplateUpload>): Promise<MarketplaceTemplate> {
    return this.post<MarketplaceTemplate>(`/templates/${id}`, updates);
  }

  /**
   * Delete template (requires auth + ownership)
   */
  async deleteTemplate(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/templates/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }

  // ── User Templates ────────────────────────────────────────────────────────

  /**
   * Get user's uploaded templates
   */
  async getMyTemplates(): Promise<MarketplaceTemplate[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceTemplate[]>>('/templates/mine');
    return response.data;
  }

  /**
   * Get user's favorited templates
   */
  async getFavorites(): Promise<MarketplaceTemplate[]> {
    const response = await this.get<MarketplaceResponse<MarketplaceTemplate[]>>('/templates/favorites');
    return response.data;
  }

  /**
   * Add template to favorites
   */
  async addFavorite(templateId: string): Promise<void> {
    await this.post(`/templates/${templateId}/favorite`, {});
  }

  /**
   * Remove template from favorites
   */
  async removeFavorite(templateId: string): Promise<void> {
    await fetch(`${this.baseUrl}/templates/${templateId}/favorite`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }

  // ── Stats & Analytics ─────────────────────────────────────────────────────

  /**
   * Get marketplace statistics
   */
  async getStats(): Promise<{
    totalTemplates: number;
    totalDownloads: number;
    totalAuthors: number;
    popularTags: Array<{ tag: string; count: number }>;
  }> {
    return this.get('/stats');
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
