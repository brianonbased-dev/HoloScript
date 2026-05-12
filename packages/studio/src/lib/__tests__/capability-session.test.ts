import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

import {
  encryptCapabilityToken,
  decryptCapabilityToken,
  getCapabilityToken,
  setCapabilityTokenCookie,
  clearCapabilityTokenCookie,
  mintCapabilityTokenForGitHubUser,
  CAPABILITY_TOKEN_COOKIE,
} from '../capability-session';

describe('capability-session', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envSnapshot };
    process.env.AUTH_SECRET = 'test-auth-secret';
  });

  describe('encryptCapabilityToken / decryptCapabilityToken', () => {
    it('round-trips a capability token secret', async () => {
      const secret = 'captok_secret_value_12345';
      const encrypted = await encryptCapabilityToken(secret);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(secret);

      const decrypted = await decryptCapabilityToken(encrypted!);
      expect(decrypted).toBe(secret);
    });

    it('returns null when decrypting malformed input', async () => {
      const result = await decryptCapabilityToken('not-valid-base64');
      expect(result).toBeNull();
    });

    it('returns null when encrypting without AUTH_SECRET', async () => {
      delete process.env.AUTH_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      const encrypted = await encryptCapabilityToken('secret');
      expect(encrypted).toBeNull();
    });
  });

  describe('getCapabilityToken / setCapabilityTokenCookie', () => {
    it('sets and retrieves a capability token from a cookie', async () => {
      const response = NextResponse.json({ ok: true });
      const secret = 'captok_test_secret_67890';
      const ok = await setCapabilityTokenCookie(response, secret);
      expect(ok).toBe(true);

      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(CAPABILITY_TOKEN_COOKIE);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).not.toContain(secret);

      // Simulate reading the cookie back from a request
      const request = new NextRequest('http://localhost/test', {
        headers: { Cookie: setCookie },
      });
      const retrieved = await getCapabilityToken(request);
      expect(retrieved).toBe(secret);
    });

    it('returns null when no cookie is present', async () => {
      const request = new NextRequest('http://localhost/test');
      const result = await getCapabilityToken(request);
      expect(result).toBeNull();
    });
  });

  describe('clearCapabilityTokenCookie', () => {
    it('clears the capability token cookie', () => {
      const response = NextResponse.json({ ok: true });
      clearCapabilityTokenCookie(response);
      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(CAPABILITY_TOKEN_COOKIE);
      expect(setCookie).toMatch(/Max-Age=0|expires=/i);
    });
  });

  describe('mintCapabilityTokenForGitHubUser', () => {
    it('mints a claude-full token by default', () => {
      const token = mintCapabilityTokenForGitHubUser({ githubUsername: 'octocat' });
      expect(token.handle).toBe('claude1');
      expect(token.surface).toBe('claude');
      expect(token.trust).toBe('full');
      expect(token.capabilities).toContain('mesh:claim');
      expect(token.capabilities).toContain('github:pr.comment');
      expect(token.tokenSecret).toMatch(/^[a-f0-9]{64}$/);
      expect(token.tokenId).toMatch(/^captok_[a-f0-9]{24}$/);
      expect(token.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('mints a mobile-reduced token when surface is mobile', () => {
      const token = mintCapabilityTokenForGitHubUser({
        githubUsername: 'octocat',
        surface: 'mobile',
      });
      expect(token.handle).toBe('mobile1');
      expect(token.surface).toBe('mobile');
      expect(token.trust).toBe('reduced');
      expect(token.capabilities).toContain('mesh:read');
      expect(token.capabilities).not.toContain('mesh:claim');
      expect(token.capabilities).not.toContain('github:pr.comment');
    });

    it('mints a headless-reduced token when surface is headless', () => {
      const token = mintCapabilityTokenForGitHubUser({
        githubUsername: 'octocat',
        surface: 'headless',
      });
      expect(token.handle).toBe('headless1');
      expect(token.surface).toBe('headless');
      expect(token.trust).toBe('reduced');
    });

    it('respects custom ttlSeconds', () => {
      const token = mintCapabilityTokenForGitHubUser({
        githubUsername: 'octocat',
        ttlSeconds: 300,
      });
      const issuedAt = new Date(token.issuedAt).getTime();
      const expiresAt = new Date(token.expiresAt).getTime();
      expect(expiresAt - issuedAt).toBe(300 * 1000);
    });
  });
});
