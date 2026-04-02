/**
 * Tests for Studio knowledge extraction, publish, and earnings API routes.
 *
 * Gaps 3, 4, 6: Validates standalone API routes exist with correct exports,
 * and that the publish endpoint validates input correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally for route tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Knowledge API Routes', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('knowledge extraction route', () => {
    it('exports POST handler', async () => {
      const route = await import(
        '../app/api/absorb/projects/[id]/knowledge/route'
      );
      expect(route.POST).toBeDefined();
      expect(typeof route.POST).toBe('function');
    });

    it('returns entries from MCP tool on success', async () => {
      const mockEntries = [
        { id: 'W.TEST.001', type: 'wisdom', content: 'Test wisdom', confidence: 0.9 },
        { id: 'P.TEST.001', type: 'pattern', content: 'Test pattern', confidence: 0.8 },
      ];

      // Mock MCP tool response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  entries: mockEntries,
                  summary: { wisdom: 1, pattern: 1, gotcha: 0, total: 2 },
                }),
              },
            ],
          },
        }),
      });

      const { POST } = await import(
        '../app/api/absorb/projects/[id]/knowledge/route'
      );

      const req = new Request('http://localhost/api/absorb/projects/test-proj/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minConfidence: 0.7 }),
      });

      const response = await POST(req as any, {
        params: Promise.resolve({ id: 'test-proj' }),
      });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.entries).toHaveLength(2);
    });

    it('returns 503 when all strategies fail', async () => {
      // All fetch calls fail
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { POST } = await import(
        '../app/api/absorb/projects/[id]/knowledge/route'
      );

      const req = new Request('http://localhost/api/absorb/projects/test-proj/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(req as any, {
        params: Promise.resolve({ id: 'test-proj' }),
      });
      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.entries).toEqual([]);
      expect(data.tried).toContain('mcp-tool');
    });
  });

  describe('knowledge publish route', () => {
    it('exports POST handler', async () => {
      const route = await import('../app/api/absorb/knowledge/publish/route');
      expect(route.POST).toBeDefined();
      expect(typeof route.POST).toBe('function');
    });

    it('rejects empty entries array', async () => {
      const { POST } = await import(
        '../app/api/absorb/knowledge/publish/route'
      );

      const req = new Request('http://localhost/api/absorb/knowledge/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: 'test', entries: [] }),
      });

      const response = await POST(req as any);
      expect(response.status).toBe(400);
    });

    it('rejects missing workspace_id', async () => {
      const { POST } = await import(
        '../app/api/absorb/knowledge/publish/route'
      );

      const req = new Request('http://localhost/api/absorb/knowledge/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{ id: 'W.001', type: 'wisdom', content: 'test' }],
        }),
      });

      const response = await POST(req as any);
      expect(response.status).toBe(400);
    });

    it('publishes entries to orchestrator on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ synced: 2 }),
      });

      const { POST } = await import(
        '../app/api/absorb/knowledge/publish/route'
      );

      const req = new Request('http://localhost/api/absorb/knowledge/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: 'test-workspace',
          entries: [
            { id: 'W.001', type: 'wisdom', content: 'Important wisdom', is_premium: true },
            { id: 'P.001', type: 'pattern', content: 'Useful pattern', is_premium: false },
          ],
        }),
      });

      const response = await POST(req as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.premium_count).toBe(1);
      expect(data.free_count).toBe(1);
    });

    it('applies default_premium flag to entries without explicit setting', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ synced: 2 }),
      });

      const { POST } = await import(
        '../app/api/absorb/knowledge/publish/route'
      );

      const req = new Request('http://localhost/api/absorb/knowledge/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: 'test',
          default_premium: true,
          entries: [
            { id: 'W.001', type: 'wisdom', content: 'A' },
            { id: 'W.002', type: 'wisdom', content: 'B', is_premium: false },
          ],
        }),
      });

      const response = await POST(req as any);
      const data = await response.json();
      // W.001 gets default_premium=true, W.002 overrides to false
      expect(data.premium_count).toBe(1);
      expect(data.free_count).toBe(1);
    });
  });

  describe('knowledge earnings route', () => {
    it('exports GET handler', async () => {
      const route = await import(
        '../app/api/absorb/knowledge/earnings/route'
      );
      expect(route.GET).toBeDefined();
      expect(typeof route.GET).toBe('function');
    });

    it('returns default earnings when services unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { GET } = await import(
        '../app/api/absorb/knowledge/earnings/route'
      );

      const req = new Request(
        'http://localhost/api/absorb/knowledge/earnings?wallet=0x1234',
      );
      const response = await GET(req as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.total_revenue_cents).toBe(0);
      expect(data.total_revenue_usd).toBe('$0.00');
    });
  });

  describe('credits route', () => {
    it('exports GET and POST handlers', async () => {
      const route = await import('../app/api/absorb/credits/route');
      expect(route.GET).toBeDefined();
      expect(route.POST).toBeDefined();
    });

    it('returns defaults when absorb service unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { GET } = await import('../app/api/absorb/credits/route');
      const response = await GET();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.balance).toBe(0);
      expect(data.tier).toBeDefined();
    });
  });

  describe('projects route', () => {
    it('exports GET and POST handlers', async () => {
      const route = await import('../app/api/absorb/projects/route');
      expect(route.GET).toBeDefined();
      expect(route.POST).toBeDefined();
    });

    it('returns empty projects when absorb service unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { GET } = await import('../app/api/absorb/projects/route');
      const req = new Request('http://localhost/api/absorb/projects');
      const response = await GET(req as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.projects).toEqual([]);
      expect(data.standalone).toBe(true);
    });

    it('creates local project when absorb service unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { POST } = await import('../app/api/absorb/projects/route');
      const req = new Request('http://localhost/api/absorb/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Project',
          source_type: 'github',
          source_url: 'https://github.com/test/repo',
        }),
      });

      const response = await POST(req as any);
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.project.name).toBe('Test Project');
      expect(data.project.id).toMatch(/^local_/);
      expect(data.standalone).toBe(true);
    });
  });
});
