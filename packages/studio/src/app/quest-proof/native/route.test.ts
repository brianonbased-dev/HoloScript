import { describe, it, expect } from 'vitest';
import { GET } from './route';

/**
 * Verifies the /quest-proof/native route serves the HoloScript-authored Founder
 * Console as hydration-free HTML with live @fetch binding — end-to-end through the
 * real route handler (reads founder-console.holo → parseHolo → Native2DCompiler).
 * Run from the studio package so process.cwd() matches `next dev`.
 */
describe('GET /quest-proof/native — HoloScript-native console', () => {
  it('returns 200 text/html, hydration-free, with live inbox binding', async () => {
    const res = await GET();
    const html = await res.text();
    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.error('[route 500 body]', html.slice(0, 400));
    }
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Founder Console');
    // hydration-free: no React on this response
    expect(html).not.toMatch(/import React/);
    expect(html).not.toMatch(/useState|useEffect/);
    // live binding wired
    expect(html).toContain('data-holo-fetch="/api/quest-proof/inbox"');
    expect(html).toContain('data-holo-template');
    expect(html).toContain("querySelectorAll('[data-holo-fetch]')");
  });
});
