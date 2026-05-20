import type { MetadataRoute } from 'next';

/**
 * /holomesh sitemap — crawlable entry points for the public HoloMesh surface.
 * Agents, teams, and receipts are omitted here (too dynamic); only the
 * stable public pages are enumerated for crawlers.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://studio.holoscript.net';
  const now = new Date();

  return [
    {
      url: `${base}/holomesh/discover`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${base}/holomesh/leaderboard`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${base}/holomesh`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];
}
