/**
 * /api/github/file PUT and DELETE committed through the Contents API straight
 * to the default branch (also when `branch` was omitted) and ignored the
 * per-workspace direct-ship setting. Nothing called them, so they are removed:
 * Next.js answers 405 for a method the route does not export.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import * as route from './route';

describe('/api/github/file write methods', () => {
  it('does not export PUT (default-branch commit, branch given or omitted)', () => {
    expect((route as Record<string, unknown>).PUT).toBeUndefined();
  });

  it('does not export DELETE (default-branch commit, branch given or omitted)', () => {
    expect((route as Record<string, unknown>).DELETE).toBeUndefined();
  });

  it('still serves GET for read_file', () => {
    expect(typeof route.GET).toBe('function');
  });

  it('advertises only GET in CORS preflight', async () => {
    const res = route.OPTIONS(new Request('http://x/api/github/file', { method: 'OPTIONS' }));
    const allow = res.headers.get('access-control-allow-methods') ?? '';
    expect(allow).not.toMatch(/PUT|DELETE/);
  });
});
