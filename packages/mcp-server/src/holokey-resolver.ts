/**
 * mcp-server HoloKey resolver — Phase 2, the first consumer cutover.
 *
 * Resolves a service config secret from the HoloKey vault (the prod Postgres + the shared
 * `HOLOKEY_PROD_KEK_*` KEK) if it's there, else from `process.env`. A consumer swaps
 * `process.env.ANTHROPIC_API_KEY` for `await resolveServiceSecret('ANTHROPIC_API_KEY')`
 * and behavior is IDENTICAL until that key is put in the vault — then it transparently
 * resolves from the vault. No boot coupling: the pool + resolver are built lazily on first
 * call (never at import/boot).
 *
 * Fail-safe by construction (premortem requirements):
 *   - The pg pool init AND the `SECRET_STORE_DDL` apply each have their OWN try/catch — a
 *     DB/perms/schema failure NEVER throws into a caller; resolves just fall back to env.
 *   - `createServiceSecretResolver` emits ONE explicit affirmation log on first resolve
 *     (`[holokey] vault ON … backend=postgres kek=production` or `vault OFF …`) so a
 *     silently-off vault is observable in the service logs.
 *
 * Owner identity: `HOLOKEY_OWNER` (default `infra`) — the service resolves its own config.
 *
 * @module mcp-server/holokey-resolver
 */
import { Pool } from 'pg';
import {
  createServiceSecretResolver,
  SECRET_STORE_DDL,
  type ServiceSecretResolver,
} from '@holoscript/secrets-broker';

let cached: ServiceSecretResolver | null = null;

function build(): ServiceSecretResolver {
  if (cached) return cached;

  let query: ((sql: string, params: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>) | undefined;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const pool = new Pool({ connectionString: dbUrl, max: 2 });
      // Best-effort schema apply. Until it completes, resolves fall back to process.env
      // (a missing table makes the store's get() throw, which the resolver catches). The
      // apply is in its OWN catch — a DDL/perms failure NEVER bricks a caller (premortem).
      void pool.query(SECRET_STORE_DDL).catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[holokey] SECRET_STORE_DDL apply failed (resolves fall back to env): ${e instanceof Error ? e.message : String(e)}`
        );
      });
      query = (sql, params) => pool.query(sql, params as unknown[]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[holokey] pg pool init failed (resolves fall back to env): ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  cached = createServiceSecretResolver({
    env: process.env,
    query,
    owner: process.env.HOLOKEY_OWNER || 'infra',
  });
  return cached;
}

/**
 * Resolve a service config secret: the HoloKey vault value if present (for this service's
 * owner, decrypted at use-time), else `process.env[name]`. Never throws; fully fallback-safe.
 */
export function resolveServiceSecret(name: string): Promise<string | undefined> {
  return build().resolve(name);
}
