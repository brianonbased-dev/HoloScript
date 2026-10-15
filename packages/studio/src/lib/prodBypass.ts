/**
 * True when dev/benchmark/admin bypasses must be refused.
 * Production is detected from NODE_ENV or a Railway production environment,
 * so a mis-set NODE_ENV on Railway cannot re-open them.
 *
 * Shared by creditGate (credit bypasses) and api-auth (benchmark sign-in skip).
 * Lives in its own module because creditGate imports api-auth.
 */
export function bypassesDisabled(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production' ||
    process.env.RAILWAY_ENVIRONMENT === 'production'
  );
}

/**
 * Length-checked constant-time string compare (no early exit on the first
 * differing character). Length is not secret here; the key's content is.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True only when a benchmark key is configured, bypasses are allowed (never in
 * production), and the presented key matches it in constant time.
 * A null/empty header or an unset key never matches.
 */
export function benchmarkKeyMatches(
  presented: string | null | undefined,
  configured: string | null | undefined
): boolean {
  if (bypassesDisabled()) return false;
  if (!configured || presented === null || presented === undefined || presented === '')
    return false;
  return constantTimeEqual(presented, configured);
}
