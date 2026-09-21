/**
 * The public origin this Studio is served from.
 *
 * `NEXT_PUBLIC_STUDIO_URL` is the variable the root layout already uses for
 * `metadataBase`; robots and sitemap read the same one so the three can never
 * disagree about which host we are. The fallback is the canonical vanity
 * recorded in SURFACES.md (`holoscript.studio`, CNAME'd to Railway) — not a
 * guess, and not localhost, because a sitemap that advertises a development
 * origin is worse than no sitemap.
 *
 * A trailing slash is stripped so callers can append `/sitemap.xml` without
 * producing a doubled separator.
 */
export const DEFAULT_STUDIO_SITE_URL = 'https://holoscript.studio';

export function studioSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_STUDIO_URL?.trim();
  const base = configured && configured.length > 0 ? configured : DEFAULT_STUDIO_SITE_URL;
  return base.replace(/\/+$/, '');
}
