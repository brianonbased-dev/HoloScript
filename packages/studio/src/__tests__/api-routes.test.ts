/**
 * Tests for Studio API routes — auth, absorb proxy, health check.
 *
 * Verifies that route modules export the correct handlers and that
 * the new API routes are structurally correct.
 */
import { describe, it, expect } from 'vitest';

describe('Studio API Routes', () => {
  describe('auth config', () => {
    it('exports authOptions with JWT strategy', async () => {
      const { authOptions } = await import('../lib/auth');
      expect(authOptions).toBeDefined();
      expect(authOptions.session?.strategy).toBe('jwt');
    });

    it('has signIn page set to /auth/signin', async () => {
      const { authOptions } = await import('../lib/auth');
      expect(authOptions.pages?.signIn).toBe('/auth/signin');
    });

    it('has session callback', async () => {
      const { authOptions } = await import('../lib/auth');
      expect(authOptions.callbacks?.session).toBeDefined();
    });
  });

  describe('NextAuth route', () => {
    it('exports GET and POST handlers', async () => {
      const route = await import('../app/api/auth/[...nextauth]/route');
      expect(route.GET).toBeDefined();
      expect(route.POST).toBeDefined();
      expect(typeof route.GET).toBe('function');
      expect(typeof route.POST).toBe('function');
    });
  });

  describe('absorb proxy route', () => {
    it('exports GET, POST, DELETE, PUT handlers', async () => {
      const route = await import('../app/api/absorb/[...path]/route');
      expect(route.GET).toBeDefined();
      expect(route.POST).toBeDefined();
      expect(route.DELETE).toBeDefined();
      expect(route.PUT).toBeDefined();
    });
  });

  describe('health route', () => {
    it('exports GET handler', async () => {
      const route = await import('../app/api/health/route');
      expect(route.GET).toBeDefined();
      expect(typeof route.GET).toBe('function');
    });

    it('returns a Response object', async () => {
      const { GET } = await import('../app/api/health/route');
      const response = await GET();
      expect(response).toBeDefined();
      // NextResponse in vitest may not fully behave like runtime;
      // verify it's a Response-like object with status 200
      expect(response.status).toBe(200);
    });
  });
});
