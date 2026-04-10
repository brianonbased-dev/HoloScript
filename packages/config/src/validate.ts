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
 * Validate and exit if required vars are missing.
 * Use at service startup for fail-fast behavior.
 */
export function requireConfig(required: string[], serviceName?: string): void {
  const result = validateConfig(required);
  if (!result.valid) {
    const name = serviceName || 'service';
    console.error(
      `[${name}] Missing required environment variables: ${result.missing.join(', ')}\n` +
        `Set these in your .env file and restart.`
    );
    process.exit(1);
  }
}

/** Common required vars for each service type */
export const REQUIRED_VARS = {
  MCP_SERVER: ['MCP_API_KEY'],
  ABSORB_SERVICE: ['MCP_API_KEY', 'DATABASE_URL'],
  STUDIO: ['MCP_API_KEY'],
  ORCHESTRATOR: ['MCP_API_KEY', 'DATABASE_URL'],
} as const;
