/**
 * src/proxy.ts sets the security headers on pages, but its matcher skips /api,
 * so API responses depend on next.config.js alone. On 2026-09-15 the live
 * https://holoscript.studio/api/health carried no X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy or Strict-Transport-Security.
 * This loads the real next.config.js and checks the all-paths rule has them.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

const require = createRequire(import.meta.url);

async function allPathsHeaders(): Promise<Map<string, string>> {
  const loaded = require('../../next.config.js');
  const config =
    typeof loaded === 'function' ? await loaded('phase-production-server', {}) : loaded;
  const rules = (await config.headers()) as HeaderRule[];
  const rule = rules.find((r) => r.source === '/(.*)');
  expect(rule, 'next.config.js must keep a header rule for every path').toBeDefined();
  return new Map(rule!.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

describe('next.config.js security headers (cover /api, which src/proxy.ts skips)', () => {
  it('sends the same four headers the proxy sends on pages', async () => {
    const headers = await allPathsHeaders();
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains; preload'
    );
  });

  it('keeps the existing isolation and permissions headers', async () => {
    const headers = await allPathsHeaders();
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
    expect(headers.get('cross-origin-embedder-policy')).toBe('credentialless');
    expect(headers.get('permissions-policy')).toContain('xr-spatial-tracking=*');
    expect(headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});
