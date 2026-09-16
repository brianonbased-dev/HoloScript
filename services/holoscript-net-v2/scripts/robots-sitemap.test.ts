/**
 * The public website tells crawlers a sitemap exists. It must exist.
 *
 * `public/robots.txt` has advertised `https://holoscript.net/sitemap.xml` for as
 * long as the file has existed. Measured 2026-09-16, that URL returned HTTP 404
 * while robots.txt kept pointing at it. Nothing in the repository noticed,
 * because nothing compared the advertisement to the app.
 *
 * This compares them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SITEMAP_PATHS } from '../src/app/sitemap';

const serviceRoot = fileURLToPath(new URL('..', import.meta.url));
const appDir = join(serviceRoot, 'src', 'app');

function robotsText(): string {
  return readFileSync(join(serviceRoot, 'public', 'robots.txt'), 'utf8');
}

describe('robots.txt advertises only what we serve', () => {
  it('names a sitemap this service actually renders', () => {
    const advertised = robotsText().match(/^Sitemap:\s*(\S+)$/m)?.[1];

    expect(advertised).toBeDefined();

    const advertisedPath = new URL(advertised ?? '').pathname;

    expect(advertisedPath).toBe('/sitemap.xml');
    // Next serves /sitemap.xml from this metadata route. Without the file the
    // advertised URL 404s, which is the state this test was written against.
    expect(existsSync(join(appDir, 'sitemap.ts'))).toBe(true);
  });

  it('lists only paths that are really pages', () => {
    expect(SITEMAP_PATHS.length).toBeGreaterThan(0);

    const missing = SITEMAP_PATHS.filter((path) => {
      const segments = path.split('/').filter(Boolean);
      return !existsSync(join(appDir, ...segments, 'page.tsx'));
    });

    expect(missing).toEqual([]);
  });
});
