import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';

// Mock github-identity before importing auth
const mockResolveGitHubToken = vi.fn();
vi.mock('./github-identity.js', () => ({
  resolveGitHubToken: (...args: any[]) => mockResolveGitHubToken(...args),
}));

// Mock credit service for tier resolution
const mockGetOrCreateAccount = vi.fn();
vi.mock('@holoscript/absorb-service/credits', () => ({
  getOrCreateAccount: (...args: any[]) => mockGetOrCreateAccount(...args),
}));

import { authMiddleware, type AuthenticatedRequest } from './auth.js';

function createMockReq(overrides: Record<string, any> = {}): AuthenticatedRequest {
  return {
    path: '/api/absorb/scan',
    method: 'GET',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as any;
}

function createMockRes(): Response & { statusCode: number; _json: any; _headers: Record<string, string> } {
  const res: any = {
    statusCode: 200,
    _json: null,
    _headers: {},
    headersSent: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
    setHeader(name: string, value: any) {
      res._headers[name] = String(value);
      return res;
    },
  };
  return res;
}

describe('authMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    mockResolveGitHubToken.mockReset();
    mockGetOrCreateAccount.mockReset();
    // Default: free tier
    mockGetOrCreateAccount.mockResolvedValue({ tier: 'free' });
    // Reset env
    delete process.env.ABSORB_API_KEY;
  });

  it('passes through public paths without auth', async () => {
    const publicPaths = ['/health', '/.well-known/mcp', '/.well-known/mcp.json'];
    for (const path of publicPaths) {
      const req = createMockReq({ path });
      const res = createMockRes();
      next = vi.fn();
      await authMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('authenticates valid Bearer token (API key)', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    const req = createMockReq({
      path: '/api/absorb/scan',
      headers: { authorization: 'Bearer test-key-123' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.authenticated).toBe(true);
  });

  it('rejects invalid Bearer token when GitHub resolution also fails', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    mockResolveGitHubToken.mockResolvedValue(null);
    const req = createMockReq({
      path: '/api/absorb/scan',
      headers: { authorization: 'Bearer wrong-key' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toBe('Invalid API key or GitHub token');
  });

  it('allows free tier scan with rate limiting', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    const req = createMockReq({
      path: '/scan',
      method: 'POST',
      socket: { remoteAddress: '192.168.1.100' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.authenticated).toBe(false);
    expect(req.freeTier).toBe(true);
  });

  it('rate limits free tier after 3 scans', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    const ip = '10.0.0.42';

    // First 3 should pass
    for (let i = 0; i < 3; i++) {
      const req = createMockReq({
        path: '/scan',
        method: 'POST',
        socket: { remoteAddress: ip },
      });
      const res = createMockRes();
      const n = vi.fn();
      await authMiddleware(req, res, n);
      expect(n).toHaveBeenCalled();
    }

    // 4th should be rate limited
    const req = createMockReq({
      path: '/scan',
      method: 'POST',
      socket: { remoteAddress: ip },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res._json.error).toBe('Rate limit exceeded');
  });

  it('allows all requests in dev mode (no API key configured)', async () => {
    // No ABSORB_API_KEY set
    const req = createMockReq({ path: '/api/holodaemon', method: 'GET' });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.authenticated).toBe(false);
  });

  it('requires auth for non-scan endpoints when API key is set', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    const req = createMockReq({
      path: '/projects',
      method: 'GET',
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res._json.error).toBe('Authentication required');
  });

  it('handles X-Forwarded-For header for IP detection', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    const req = createMockReq({
      path: '/scan',
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
      socket: { remoteAddress: '10.0.0.1' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.freeTier).toBe(true);
  });

  // ── New: GitHub token resolution tests ────────────────────────────────────

  it('resolves GitHub token and sets userId', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    mockResolveGitHubToken.mockResolvedValue({
      userId: 'uuid-github-user',
      githubUsername: 'testuser',
      githubId: '12345',
      isAdmin: false,
    });

    const req = createMockReq({
      path: '/projects',
      headers: { authorization: 'Bearer ghp_some_github_token' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authenticated).toBe(true);
    expect(req.userId).toBe('uuid-github-user');
    expect(req.githubUsername).toBe('testuser');
    expect(req.isAdmin).toBe(false);
  });

  it('sets isAdmin=true for admin GitHub user', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    mockResolveGitHubToken.mockResolvedValue({
      userId: 'uuid-admin-user',
      githubUsername: 'brianonbased-dev',
      githubId: '99999',
      isAdmin: true,
    });

    const req = createMockReq({
      path: '/projects',
      headers: { authorization: 'Bearer ghp_admin_token' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.isAdmin).toBe(true);
    expect(req.githubUsername).toBe('brianonbased-dev');
  });

  it('preserves ABSORB_API_KEY path unchanged (API key takes priority)', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';

    const req = createMockReq({
      path: '/projects',
      headers: { authorization: 'Bearer test-key-123' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authenticated).toBe(true);
    // resolveGitHubToken should NOT have been called — API key matched first
    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });

  // ── Per-user quota tests ───────────────────────────────────────────────────

  it('sets tier on authenticated GitHub user', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    mockResolveGitHubToken.mockResolvedValue({
      userId: 'uuid-free-user',
      githubUsername: 'freeuser',
      githubId: '111',
      isAdmin: false,
    });
    mockGetOrCreateAccount.mockResolvedValue({ tier: 'free' });

    const req = createMockReq({
      path: '/projects',
      headers: { authorization: 'Bearer ghp_free_token' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tier).toBe('free');
  });

  it('skips rate limit for pro tier users', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    mockResolveGitHubToken.mockResolvedValue({
      userId: 'uuid-pro-user',
      githubUsername: 'prouser',
      githubId: '222',
      isAdmin: false,
    });
    mockGetOrCreateAccount.mockResolvedValue({ tier: 'pro' });

    // Make 20 requests — all should pass for pro tier
    for (let i = 0; i < 20; i++) {
      const req = createMockReq({
        path: '/projects',
        headers: { authorization: 'Bearer ghp_pro_token' },
      });
      const res = createMockRes();
      const n = vi.fn();
      await authMiddleware(req, res, n);
      expect(n).toHaveBeenCalled();
      expect(req.tier).toBe('pro');
    }
  });

  it('rate limits free GitHub user after 10 requests', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    mockResolveGitHubToken.mockResolvedValue({
      userId: 'uuid-rate-limited-user',
      githubUsername: 'ratelimited',
      githubId: '333',
      isAdmin: false,
    });
    mockGetOrCreateAccount.mockResolvedValue({ tier: 'free' });

    // First 10 should pass
    for (let i = 0; i < 10; i++) {
      const req = createMockReq({
        path: '/projects',
        headers: { authorization: 'Bearer ghp_rl_token' },
      });
      const res = createMockRes();
      const n = vi.fn();
      await authMiddleware(req, res, n);
      expect(n).toHaveBeenCalled();
    }

    // 11th should be rate limited
    const req = createMockReq({
      path: '/projects',
      headers: { authorization: 'Bearer ghp_rl_token' },
    });
    const res = createMockRes();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res._json.purchaseUrl).toBe('/absorb?tab=credits');
  });

  it('admin users bypass rate limits entirely', async () => {
    process.env.ABSORB_API_KEY = 'test-key-123';
    mockResolveGitHubToken.mockResolvedValue({
      userId: 'uuid-admin',
      githubUsername: 'brianonbased-dev',
      githubId: '99999',
      isAdmin: true,
    });

    // Make 50 requests — all should pass for admin
    for (let i = 0; i < 50; i++) {
      const req = createMockReq({
        path: '/projects',
        headers: { authorization: 'Bearer ghp_admin_token' },
      });
      const res = createMockRes();
      const n = vi.fn();
      await authMiddleware(req, res, n);
      expect(n).toHaveBeenCalled();
      expect(req.tier).toBe('admin');
    }
  });
});
