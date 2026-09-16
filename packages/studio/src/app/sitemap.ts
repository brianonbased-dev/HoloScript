import type { MetadataRoute } from 'next';

import { INDUSTRY_VERTICAL_SLUGS } from '@/lib/industry-verticals';
import { studioSiteUrl } from '@/lib/site-url';

/**
 * `/sitemap.xml` — the pages we want found.
 *
 * Until 2026-09-16 this path returned application HTML, like every other
 * unmatched address. There was no sitemap to be stale, so nothing disagreed
 * with anything.
 *
 * This list is curated by hand and deliberately SHORTER than the route tree.
 * Studio has 80 page routes; most are workbench surfaces that need a session
 * (`/workspace`, `/settings`, `/teams`), operator consoles (`/admin`,
 * `/operations`, `/coordinator`), diagnostics (`/dev/ui-graph`, `/quest-probe`)
 * or per-record pages behind a dynamic segment (`/view/[id]`, `/u/[username]`)
 * whose members a crawler discovers by following links, not from here. Listing
 * those would advertise doors a stranger cannot open.
 *
 * The test beside this file asserts every path here resolves to a real
 * `page.tsx`, so an entry that stops existing fails the suite instead of
 * quietly 404ing for every crawler that trusted us.
 */
export const SITEMAP_PATHS: readonly string[] = [
  // Front door and the two ways in.
  '/',
  '/start',
  '/create',

  // Things a stranger can read or try before signing in.
  '/build',
  '/vibe',
  '/playground',
  '/docs',
  '/registry',
  '/templates',
  '/store',
  '/feed',
  '/agents',
  '/earn',
  '/verify',
  '/integrations',
  '/pipeline',

  // Public HoloMesh surfaces.
  '/holomesh',
  '/holomesh/discover',
  '/holomesh/leaderboard',
  '/holomesh/marketplace',

  // The industry portal, one real address per declared vertical.
  ...INDUSTRY_VERTICAL_SLUGS.map((slug) => `/industry/${slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = studioSiteUrl();
  const lastModified = new Date();

  return SITEMAP_PATHS.map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1 : 0.6,
  }));
}
