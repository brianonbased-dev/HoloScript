/**
 * @holoscript/config — Startup Config Validation
 *
 * Call validateConfig() at service startup to fail fast
 * on missing required environment variables.
 */

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate that required environment variables are set.
 * Returns a result object — does NOT exit. Caller decides what to do.
 */
export function validateConfig(required: string[], optional: string[] = []): ValidationResult {
  const missing = required.filter((k) => !process.env[k]);
  const warnings = optional
    .filter((k) => !process.env[k])
    .map((k) => `Optional env var ${k} is not set`);

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate and throw if required vars are missing.
 * Use at service startup for fail-fast behavior.
 *
 * Throws (instead of process.exit) so this module is safe to import
 * from Edge-runtime contexts (Next.js instrumentation, edge middleware).
 * Edge runtime rejects modules that reference process.exit even if
 * the call site is unreachable. The caller decides whether to exit:
 * the typical Node entry point wraps this in try/catch and exits with
 * code 1 on failure.
 */
export function requireConfig(required: string[], serviceName?: string): void {
  const result = validateConfig(required);
  if (!result.valid) {
    const name = serviceName || 'service';
    const message =
      `[${name}] Missing required environment variables: ${result.missing.join(', ')}\n` +
      `Set these in your .env file and restart.`;
    console.error(message);
    throw new Error(message);
  }
}

/** Common required vars for each service type */
export const REQUIRED_VARS = {
  MCP_SERVER: ['HOLOSCRIPT_API_KEY'],
  ABSORB_SERVICE: ['HOLOSCRIPT_API_KEY', 'DATABASE_URL'],
  STUDIO: ['HOLOSCRIPT_API_KEY'],
  ORCHESTRATOR: ['HOLOSCRIPT_API_KEY', 'DATABASE_URL'],
} as const;
