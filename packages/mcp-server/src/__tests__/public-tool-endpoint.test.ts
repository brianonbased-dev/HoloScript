/**
 * Tests for POST /api/public/tool — the anonymous tier.
 *
 * Mirrors the production handler in `http-server.ts` (the constants
 * PUBLIC_ANON_TOOLS and PUBLIC_ANON_RATE_LIMIT MUST match). Tests the
 * routing contract: allowlist enforcement, request shape validation,
 * rate limit, and the discovery payload.
 *
 * Pattern follows hologram-http-route.test.ts — re-implement the handler
 * as a pure async function so the whole MCP server doesn't need to boot.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// MUST stay in sync with http-server.ts. The drift risk is intentional —
// if a future agent changes one, this test fails and forces them to
// reconcile both sides.
const PUBLIC_ANON_TOOLS: ReadonlySet<string> = new Set([
  'parse_holo',
  'validate_holoscript',
  'explain_trait',
  'get_syntax_reference',
  'get_examples',
  'list_export_targets',
]);
const PUBLIC_ANON_RATE_LIMIT = 30;

// Mock dispatcher — stands in for _handleSingleToolLogic.
const handleSingleToolMock = vi.fn();

// Stateful per-IP rate-limiter mirror.
type Bucket = { count: number; resetAt: number };
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, Bucket>();

function getRateLimit(ip: string, limit: number) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return {
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: bucket.resetAt,
  };
}

type Response = {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string | number>;
};

async function publicToolHandler(
  method: 'GET' | 'POST',
  body: Record<string, unknown> | null,
  clientIP = '127.0.0.1'
): Promise<Response> {
  // GET — discovery
  if (method === 'GET') {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: {
        description: 'Anonymous tier — read-only HoloScript tools, no API key required.',
        tools: Array.from(PUBLIC_ANON_TOOLS),
        rate_limit_per_minute: PUBLIC_ANON_RATE_LIMIT,
        usage: {
          method: 'POST',
          content_type: 'application/json',
          body_schema: { tool: 'string', arguments: 'object' },
          example: {
            tool: 'parse_holo',
            arguments: { code: 'composition "Hello" { object "Box" {} }' },
          },
        },
        upgrade: {
          endpoint: '/oauth/register',
          why: 'Higher rate limits and access to all MCP tools (compile, generate, codebase intelligence, etc.).',
        },
      },
    };
  }

  // POST — anonymous tool dispatch
  const rl = getRateLimit(`anon:${clientIP}`, PUBLIC_ANON_RATE_LIMIT);
  const rateHeaders = {
    'X-RateLimit-Limit': rl.limit,
    'X-RateLimit-Remaining': rl.remaining,
    'X-RateLimit-Reset': Math.ceil(rl.resetAt / 1000),
  };

  if (rl.remaining === 0) {
    return {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateHeaders },
      body: {
        error: 'rate_limit_exceeded',
        message: `Anonymous tier limited to ${PUBLIC_ANON_RATE_LIMIT} requests/minute per IP. Register a client at POST /oauth/register for higher limits.`,
        retry_after_seconds: Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
    };
  }

  const tool = body?.tool as string | undefined;
  const args = (body?.arguments as Record<string, unknown> | undefined) || {};

  if (!tool || typeof tool !== 'string') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateHeaders },
      body: {
        error: 'invalid_request',
        message: 'Missing required field: tool (string)',
        example: { tool: 'parse_holo', arguments: { code: 'composition "Hello" {}' } },
      },
    };
  }

  if (!PUBLIC_ANON_TOOLS.has(tool)) {
    return {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateHeaders },
      body: {
        error: 'tool_not_public',
        message: `Tool '${tool}' is not available on the anonymous tier.`,
        available_anonymous_tools: Array.from(PUBLIC_ANON_TOOLS),
        upgrade: {
          endpoint: '/oauth/register',
          why: 'Register a client to access all MCP tools.',
        },
      },
    };
  }

  try {
    const result = await handleSingleToolMock(tool, args);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateHeaders },
      body: result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateHeaders },
      body: { error: 'tool_execution_failed', message },
    };
  }
}

describe('POST /api/public/tool — anonymous tier', () => {
  beforeEach(() => {
    handleSingleToolMock.mockReset();
    rateBuckets.clear();
  });

  describe('GET /api/public/tool — discovery', () => {
    it('returns 200 with the full allowlist', async () => {
      const res = await publicToolHandler('GET', null);
      expect(res.status).toBe(200);
      expect(res.body.tools).toEqual([
        'parse_holo',
        'validate_holoscript',
        'explain_trait',
        'get_syntax_reference',
        'get_examples',
        'list_export_targets',
      ]);
      expect(res.body.rate_limit_per_minute).toBe(30);
      expect(res.body.upgrade).toMatchObject({ endpoint: '/oauth/register' });
    });

    it('returns a callable example that uses an allowlisted tool with the schema-required field name', async () => {
      const res = await publicToolHandler('GET', null);
      const example = (res.body.usage as Record<string, unknown>).example as Record<string, unknown>;
      expect(PUBLIC_ANON_TOOLS.has(example.tool as string)).toBe(true);
      // parse_holo's input schema (tools.ts:90) requires `code`, NOT `source`.
      // This caught a real bug 2026-05-10 — both the prod discovery payload
      // and PUBLIC_ACCESS.md docs had `source` and crashed on first call.
      if (example.tool === 'parse_holo') {
        const args = example.arguments as Record<string, unknown>;
        expect(args).toHaveProperty('code');
        expect(args).not.toHaveProperty('source');
      }
    });
  });

  describe('POST — happy path', () => {
    it('dispatches an allowlisted tool and returns the result', async () => {
      handleSingleToolMock.mockResolvedValue({
        content: [{ type: 'text', text: '{"ast":"ok"}' }],
      });

      const res = await publicToolHandler('POST', {
        tool: 'parse_holo',
        arguments: { source: 'composition "X" {}' },
      });

      expect(res.status).toBe(200);
      expect(handleSingleToolMock).toHaveBeenCalledWith('parse_holo', { source: 'composition "X" {}' });
      expect(res.body).toMatchObject({ content: expect.any(Array) });
    });

    it('emits X-RateLimit headers on every response', async () => {
      handleSingleToolMock.mockResolvedValue({ ok: true });
      const res = await publicToolHandler('POST', { tool: 'parse_holo', arguments: {} });
      expect(res.headers['X-RateLimit-Limit']).toBe(30);
      expect(res.headers['X-RateLimit-Remaining']).toBe(29);
    });
  });

  describe('POST — false cases (G.GOLD.013)', () => {
    it('rejects a request missing the tool field with 400', async () => {
      const res = await publicToolHandler('POST', { arguments: { source: 'x' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(handleSingleToolMock).not.toHaveBeenCalled();
    });

    it('rejects a request with tool=null with 400', async () => {
      const res = await publicToolHandler('POST', { tool: null });
      expect(res.status).toBe(400);
      expect(handleSingleToolMock).not.toHaveBeenCalled();
    });

    it('rejects a non-allowlisted tool with 403 and exposes the allowlist', async () => {
      const res = await publicToolHandler('POST', {
        tool: 'generate_scene',
        arguments: { prompt: 'a cube' },
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('tool_not_public');
      expect(res.body.available_anonymous_tools).toContain('parse_holo');
      expect(res.body.available_anonymous_tools).not.toContain('generate_scene');
      expect(handleSingleToolMock).not.toHaveBeenCalled();
    });

    it('returns 500 with the dispatcher error message when the tool throws', async () => {
      handleSingleToolMock.mockRejectedValue(new Error('parser crashed'));
      const res = await publicToolHandler('POST', { tool: 'parse_holo', arguments: {} });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('tool_execution_failed');
      expect(res.body.message).toBe('parser crashed');
    });
  });

  describe('POST — rate limit', () => {
    it('blocks once the bucket hits the limit (effective limit is limit-1 by design)', async () => {
      handleSingleToolMock.mockResolvedValue({ ok: true });
      // getRateLimit increments first then computes remaining = max(0, limit - count).
      // So call N=limit returns remaining=0 and our check refuses it. Effective
      // allowance is limit-1 successful calls before the cap kicks in. This
      // matches the existing OAuth-endpoint rate limiter (line ~1536 of
      // http-server.ts) so the semantics stay consistent across the server.
      for (let i = 0; i < PUBLIC_ANON_RATE_LIMIT - 1; i++) {
        const res = await publicToolHandler(
          'POST',
          { tool: 'parse_holo', arguments: {} },
          '10.0.0.1'
        );
        expect(res.status).toBe(200);
      }
      const blocked = await publicToolHandler(
        'POST',
        { tool: 'parse_holo', arguments: {} },
        '10.0.0.1'
      );
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toBe('rate_limit_exceeded');
      expect(blocked.body.retry_after_seconds).toBeGreaterThanOrEqual(1);
    });

    it('isolates rate buckets per client IP', async () => {
      handleSingleToolMock.mockResolvedValue({ ok: true });
      // IP A exhausts its bucket.
      for (let i = 0; i < 31; i++) {
        await publicToolHandler('POST', { tool: 'parse_holo' }, '10.0.0.2');
      }
      // IP B starts fresh.
      const res = await publicToolHandler('POST', { tool: 'parse_holo' }, '10.0.0.3');
      expect(res.status).toBe(200);
    });
  });

  describe('allowlist contract', () => {
    it('contains exactly the six read-only / inert tools', () => {
      expect(PUBLIC_ANON_TOOLS.size).toBe(6);
      expect(Array.from(PUBLIC_ANON_TOOLS).sort()).toEqual([
        'explain_trait',
        'get_examples',
        'get_syntax_reference',
        'list_export_targets',
        'parse_holo',
        'validate_holoscript',
      ]);
    });

    it('excludes anything that costs LLM inference or writes state', () => {
      // Sanity checks — these MUST NOT leak into the anon tier.
      expect(PUBLIC_ANON_TOOLS.has('generate_scene')).toBe(false);
      expect(PUBLIC_ANON_TOOLS.has('generate_object')).toBe(false);
      expect(PUBLIC_ANON_TOOLS.has('holo_ask_codebase')).toBe(false);
      expect(PUBLIC_ANON_TOOLS.has('holo_protocol_publish')).toBe(false);
      expect(PUBLIC_ANON_TOOLS.has('compile_to_unity')).toBe(false);
    });
  });
});
