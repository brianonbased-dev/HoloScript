/**
 * MCPMeBillingBridge Tests
 *
 * Tests tier validation, cache behavior, offline fallback,
 * and agent search/install methods.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPMeBillingBridge, tierAllows } from '../MCPMeBillingBridge';

// ── Tier Validation ─────────────────────────────────────────────────────────

describe('tierAllows', () => {
  it('free allows free only', () => {
    expect(tierAllows('free', 'free')).toBe(true);
    expect(tierAllows('free', 'starter')).toBe(false);
    expect(tierAllows('free', 'pro')).toBe(false);
    expect(tierAllows('free', 'enterprise')).toBe(false);
  });

  it('starter allows free and starter', () => {
    expect(tierAllows('starter', 'free')).toBe(true);
    expect(tierAllows('starter', 'starter')).toBe(true);
    expect(tierAllows('starter', 'pro')).toBe(false);
    expect(tierAllows('starter', 'enterprise')).toBe(false);
  });

  it('pro allows free, starter, pro', () => {
    expect(tierAllows('pro', 'free')).toBe(true);
    expect(tierAllows('pro', 'starter')).toBe(true);
    expect(tierAllows('pro', 'pro')).toBe(true);
    expect(tierAllows('pro', 'enterprise')).toBe(false);
  });

  it('enterprise allows all', () => {
    expect(tierAllows('enterprise', 'free')).toBe(true);
    expect(tierAllows('enterprise', 'starter')).toBe(true);
    expect(tierAllows('enterprise', 'pro')).toBe(true);
    expect(tierAllows('enterprise', 'enterprise')).toBe(true);
  });
});

// ── Bridge ──────────────────────────────────────────────────────────────────

describe('MCPMeBillingBridge', () => {
  let bridge: MCPMeBillingBridge;

  beforeEach(() => {
    bridge = new MCPMeBillingBridge({
      orchestratorUrl: 'http://localhost:5567',
      apiKey: 'test-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkTier', () => {
    it('returns allowed=true when user tier meets requirement', () => {
      const result = bridge.checkTier('pro', 'starter');
      expect(result.allowed).toBe(true);
      expect(result.currentTier).toBe('pro');
    });

    it('returns allowed=false when user tier is below requirement', () => {
      const result = bridge.checkTier('free', 'pro');
      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe('pro');
      expect(result.reason).toContain('pro');
    });

    it('returns allowed=true for same tier', () => {
      const result = bridge.checkTier('enterprise', 'enterprise');
      expect(result.allowed).toBe(true);
    });
  });

  describe('getCatalog', () => {
    it('returns cached data on subsequent calls', async () => {
      const mockResponse = {
        services: [
          {
            id: 'svc-1',
            name: 'Test',
            description: 'test',
            tier: 'free',
            tools: [],
            computeMultiplier: 1,
          },
        ],
        plans: [{ tier: 'free', name: 'Free', price: 0, features: ['basic'] }],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result1 = await bridge.getCatalog();
      const result2 = await bridge.getCatalog();

      expect(result1).toEqual(mockResponse);
      expect(result2).toEqual(mockResponse);
      // Should only call fetch once (second call is cached)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns offline fallback on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await bridge.getCatalog();
      expect(result.plans.length).toBeGreaterThan(0);
      expect(result.plans[0].tier).toBe('free');
    });
  });

  describe('searchAgents', () => {
    it('calls correct endpoint with query params', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ templates: [], total: 0 }),
      } as Response);

      await bridge.searchAgents({ query: 'guard', category: 'security', sort: 'popular' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/marketplace/search');
      expect(url).toContain('q=guard');
      expect(url).toContain('category=security');
      expect(url).toContain('sort=popular');
    });
  });

  describe('installAgent', () => {
    it('blocks install if user tier is below required', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          template: { id: 'a1', name: 'Pro Agent', tier: 'pro' },
          reviews: [],
        }),
      } as Response);

      const result = await bridge.installAgent('a1', 'free');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pro');
    });

    it('allows install when tier matches', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            template: { id: 'a1', name: 'Free Agent', tier: 'free' },
            reviews: [],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            templateId: 'a1',
            templateName: 'Free Agent',
            program: 'INTAKE; REFLECT; EXECUTE;',
            programType: 'intent',
          }),
        } as Response);

      const result = await bridge.installAgent('a1', 'starter');
      expect(result.success).toBe(true);
      expect(result.program).toBeTruthy();
    });
  });
});
