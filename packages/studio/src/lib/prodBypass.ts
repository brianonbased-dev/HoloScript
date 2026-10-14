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
