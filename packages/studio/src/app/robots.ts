import type { MetadataRoute } from 'next';

import { studioSiteUrl } from '@/lib/site-url';

/**
 * `/robots.txt`, served as text by Next's metadata route.
 *
 * Until 2026-09-16 this path returned ~54KB of application HTML with
 * `content-type: text/html`, because the root catch-all route answered it like
 * any other unmatched path. A crawler asking what it may read was handed a 3D
 * editor. There was no robots file at all — nothing to be wrong, which is why
 * nobody noticed.
 *
 * The disallow list is the private half of the app: anything that needs a
 * session, anything operational, and the probe/diagnostic pages. Public reading
 * surfaces (`/shared/*`, `/view/*`, `/u/*`, `/g/*`) are deliberately NOT
 * disallowed — they carry their own SEO metadata and exist to be found.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/dev/',
          '/settings',
          '/workspace',
          '/teams',
          '/projects',
          '/operations',
          '/coordinator',
          '/auth/',
          '/remote/',
          '/quest-probe',
          '/quest-proof',
        ],
      },
    ],
    sitemap: `${studioSiteUrl()}/sitemap.xml`,
  };
}
