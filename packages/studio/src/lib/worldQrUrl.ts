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
 * One helper for every QR the studio draws for a world link a headset will scan
 * (SharePanel, PublishModal, and the publish receipt's QR that PublishPanel
 * shows), so the fix cannot be present on one screen and absent on the next,
 * which is exactly how PR #308 shipped (independent review of 2026-09-21).
 *
 * Scope: the studio's OWN world links. Any host's `/w/<id>` path is rewritten,
 * because the studio runs on holoscript.studio, on preview hosts and on
 * localhost and every caller builds the link from its own origin; do not hand
 * it a third-party URL (a wiki's `/w/index.php` would be rewritten too).
 * Deliberately not used by the in-VR viewer's QR (ImmersiveViewer.client.tsx):
 * a phone camera scans that one, not HoloQR, and the /w/ short link is right
 * there.
 *
 * Anchored to the PATHNAME: only a path whose first segment is `w` is rewritten;
 * `?next=/w/abc` and `/shared/w/abc` are left alone. Case-insensitive, as
 * HoloQR's own match is (WorldPortal.kt:64 ignoreCase), so `/W/abc` is rewritten
 * too. Relative-ness is decided by the absence of a scheme, not by a leading
 * slash: a protocol-relative `//host/w/id` keeps its host, and surrounding
 * whitespace is trimmed. A string the URL parser rejects is returned as given
 * (a render must not throw).
 */
export function worldQrUrl(url: string): string {
  if (!url) return url;
  const input = url.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input);
  const protocolRelative = !hasScheme && input.startsWith('//');
  let parsed: URL;
  try {
    parsed = new URL(input, 'https://holoscript.studio');
  } catch {
    return url;
  }
  const match = parsed.pathname.match(/^\/w\/([^/]+)\/?$/i);
  if (!match) return url;
  parsed.pathname = `/shared/${match[1]}`;
  if (hasScheme) return parsed.toString();
  const rest = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (protocolRelative) return `//${parsed.host}${rest}`;
  // A relative input stays relative: the caller chose the origin, not us.
  return rest;
}
