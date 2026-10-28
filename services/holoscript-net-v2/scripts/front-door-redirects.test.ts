/**
 * holoscript.net's front door sends /getting-started and /docs elsewhere until
 * the site serves them itself. Those redirects are TEMPORARY, so they must stay
 * 302s: a 301 would be cached by browsers and crawlers long after removal.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serviceRoot = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const nextConfig = require(join(serviceRoot, 'next.config.js'));
const README = 'https://github.com/brianonbased-dev/HoloScript#readme';

describe('front-door redirects', () => {
  it('are all temporary (302), never permanent', async () => {
    const redirects = await nextConfig.redirects();
    expect(redirects.length).toBeGreaterThan(0);
    for (const r of redirects) {
      expect(r.permanent).toBe(false);
      expect(r.statusCode).toBeUndefined();
    }
  });

  it('send getting-started to Studio install and docs to the README', async () => {
    const bySource = Object.fromEntries(
      (await nextConfig.redirects()).map((r: { source: string; destination: string }) => [r.source, r.destination]),
    );
    expect(bySource['/getting-started']).toBe('https://holoscript.studio/install');
    expect(bySource['/docs']).toBe(README);
    expect(bySource['/docs/:path*']).toBe(README);
  });

  it('point "Read the docs" at the README in both the .holo source and the generated page', () => {
    for (const rel of ['holo-pages/page.holo', 'src/app/page.tsx']) {
      const src = readFileSync(join(serviceRoot, rel), 'utf8');
      const idx = src.indexOf('Read the docs');
      expect(idx, rel).toBeGreaterThan(-1);
      expect(src.slice(Math.max(0, idx - 200), idx), rel).toContain(README);
    }
  });
});
