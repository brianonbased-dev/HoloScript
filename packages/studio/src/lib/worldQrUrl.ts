/**
 * The address a QR code must encode for a world link, which is NOT the link we
 * show people, and the difference is why the studio's QR codes could not be
 * scanned on the headset.
 *
 * `/w/:id` is a real short link (next.config.js rewrites it to `/shared/:id`),
 * so it is the right thing for a human to copy. But HoloQR pattern-matches
 * `https://holoscript.studio/w/` as a WORLD PORTAL link (WorldPortal.kt:21),
 * then demands a signed manifest and checks it against a trusted-key list that
 * ships EMPTY (WorldTrust.kt:31), so every `/w/` QR is refused on the headset
 * with "World blocked: signed-parameter-cardinality". `/shared/:id` matches none
 * of its link patterns, falls through to the ordinary-URL path, and opens the
 * WebXR viewer at app/shared/[id]. Same destination, the one spelling the
 * scanner admits.
 *
 * One helper for every QR the studio draws for a world link (SharePanel,
 * PublishModal), so the fix cannot be present on one screen and absent on the
 * next, which is exactly how PR #308 shipped (independent review of 2026-09-21).
 *
 * Anchored to the PATHNAME: only a path whose first segment is `w` is rewritten.
 * `?next=/w/abc` and `/shared/w/abc` are left alone; an unparseable string is
 * returned as given.
 */
export function worldQrUrl(url: string): string {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url, 'https://holoscript.studio');
  } catch {
    return url;
  }
  const match = parsed.pathname.match(/^\/w\/([^/]+)\/?$/);
  if (!match) return url;
  parsed.pathname = `/shared/${match[1]}`;
  // A relative input stays relative: the caller chose the origin, not us.
  return url.startsWith('/') ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
}
