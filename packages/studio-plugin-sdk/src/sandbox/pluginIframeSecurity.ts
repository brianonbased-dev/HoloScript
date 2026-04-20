/**
 * Hardening helpers for plugin iframe srcdoc generation and entry URLs.
 * Prevents HTML/script injection when manifest fields are attacker-controlled.
 */

/**
 * Escape text placed inside HTML elements (e.g. <title>).
 */
export function escapeHtmlTextContent(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a string embedded in a double-quoted HTML attribute.
 */
export function escapeHtmlDoubleQuotedAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Normalize and validate the plugin module URL used in <script type="module" src="…">.
 * Only absolute http(s) URLs without credentials; rejects ASCII whitespace and quotes.
 */
export function assertSafePluginModuleUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('pluginUrl must be a non-empty absolute http(s) URL');
  }
  if (/[\u0000-\u0020]/.test(trimmed) || /["'<>]/.test(trimmed)) {
    throw new Error('pluginUrl contains disallowed characters');
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error('pluginUrl must be a valid absolute URL');
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('pluginUrl must use http: or https:');
  }
  if (u.username !== '' || u.password !== '') {
    throw new Error('pluginUrl must not include user credentials');
  }

  return u.href;
}
