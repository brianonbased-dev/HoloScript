/**
 * Tests for Marketplace API Error + URL construction
 */

import { describe, it, expect, vi } from 'vitest';

// Replicate MarketplaceApiError for testing
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

describe('MarketplaceApiError', () => {
  it('creates with all fields', () => {
    const err = new MarketplaceApiError('Not found', 'NOT_FOUND', 404);
    expect(err.message).toBe('Not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.name).toBe('MarketplaceApiError');
  });

  it('is instance of Error', () => {
    const err = new MarketplaceApiError('fail', 'ERR', 500);
    expect(err instanceof Error).toBe(true);
  });

  it('includes details', () => {
    const err = new MarketplaceApiError('bad input', 'VALIDATION', 400, { field: 'name' });
    expect(err.details?.field).toBe('name');
  });
});

// Test search URL construction logic
describe('Search URL builder', () => {
  function buildSearchParams(query: {
    q?: string;
    category?: string;
    platform?: string;
    verified?: boolean;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }): string {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.category) params.set('category', query.category);
    if (query.platform) params.set('platform', query.platform);
    if (query.verified !== undefined) params.set('verified', String(query.verified));
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortOrder) params.set('sortOrder', query.sortOrder);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    return params.toString();
  }

  it('builds empty params for no filters', () => {
    expect(buildSearchParams({})).toBe('');
  });

  it('includes query string', () => {
    const params = buildSearchParams({ q: 'physics' });
    expect(params).toContain('q=physics');
  });

  it('includes all filter params', () => {
    const params = buildSearchParams({
      q: 'test',
      category: 'rendering',
      platform: 'web',
      verified: true,
      sortBy: 'downloads',
      sortOrder: 'desc',
      page: 2,
      limit: 20,
    });
    expect(params).toContain('category=rendering');
    expect(params).toContain('platform=web');
    expect(params).toContain('verified=true');
    expect(params).toContain('sortBy=downloads');
    expect(params).toContain('page=2');
  });

  it('omits undefined fields', () => {
    const params = buildSearchParams({ q: 'test', category: undefined });
    expect(params).not.toContain('category');
  });
});
