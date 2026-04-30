/**
 * Pure validator for ABSORB_SERVICE endpoints — extracted from creditGate so
 * tests can import it without triggering the next/server + @holoscript/config
 * resolution that creditGate's module-load IIFE pulls in. The IIFE is fine
 * at runtime (Next server boot) but in vitest it can hang indefinitely on
 * some environments (commit landing this split: ssrf-guards.test.ts kept
 * timing out at 5s on `await import('../creditGate')`).
 *
 * creditGate.ts re-exports both names from here so every existing caller
 * keeps working.
 */

/**
 * Allowlist of trusted ABSORB_SERVICE hosts. The credit endpoint is called
 * on every paid LLM op, so a tampered endpoint env would silently route
 * credit checks to an attacker. Self-hosted contributors can extend the
 * list deliberately via the ABSORB_SERVICE_ALLOWED_HOSTS env var.
 */
export const ALLOWED_ABSORB_HOSTS: ReadonlySet<string> = new Set<string>([
  'absorb.holoscript.net',
  'mcp.holoscript.net',
  // Local dev / staging — only matched exactly, no wildcards.
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
]);

/**
 * Validate an ABSORB_SERVICE endpoint URL string. Throws on bad protocol or
 * untrusted host. The pure surface used by both the credit-gate IIFE and
 * the ssrf-guards test.
 */
export function validateAbsorbBaseUrl(
  base: string,
  extraAllowedHosts: readonly string[] = [],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch (e) {
    throw new Error(`Invalid ABSORB_SERVICE endpoint: ${base} — ${String(e)}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`ABSORB_SERVICE must be an http/https URL, got protocol: ${parsed.protocol}`);
  }
  const allowed = new Set([...ALLOWED_ABSORB_HOSTS, ...extraAllowedHosts]);
  if (!allowed.has(parsed.hostname)) {
    throw new Error(
      `ABSORB_SERVICE host '${parsed.hostname}' is not in the trusted-host allowlist. ` +
        `Set ABSORB_SERVICE_ALLOWED_HOSTS=${parsed.hostname} to override.`,
    );
  }
  return parsed;
}
