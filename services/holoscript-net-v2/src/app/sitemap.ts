import type { MetadataRoute } from 'next';

/**
 * `/sitemap.xml` for the public website.
 *
 * WHY THIS EXISTS. `public/robots.txt` has advertised
 * `https://holoscript.net/sitemap.xml` for as long as it has existed, and that
 * URL returned 404 — measured 2026-09-16. Telling every crawler to fetch a
 * document we never served is a promise we were not keeping, so the promise is
 * now made true rather than withdrawn.
 *
 * The list is every page this service actually renders. There are four, they
 * are all public, and they are enumerated by hand precisely because this file
 * must not silently claim more than the app serves — the test beside it asserts
 * each entry has a matching `page.tsx`.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://holoscript.net').replace(
  /\/+$/,
  ''
);

/** Paths this service renders, relative to the site root. */
export const SITEMAP_PATHS: readonly string[] = ['/', '/compile', '/ecosystem', '/lotus'];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return SITEMAP_PATHS.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1 : 0.7,
  }));
}
