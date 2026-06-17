/**
 * Boot-time HoloKey hydration — Phase 2 fan-out (absorb-service-host).
 *
 * Resolves named config secrets from the shared HoloKey vault (the same prod Postgres + the shared
 * `HOLOKEY_PROD_KEK_*` KEK, owner=`infra`) and writes any the vault HOLDS into `process.env` BEFORE
 * the server starts. Every existing `process.env.X` read across the service (LLM providers, etc.)
 * then transparently sees the vault value — no per-call-site swap, no async ripple. This is the
 * "stop maintaining a key in N service .env files" payoff: set it once in the shared vault, every
 * service that hydrates picks it up. absorb-service shares mcp-server's exact Postgres + KEK + owner,
 * so it resolves the very keys mcp-server already migrated.
 *
 * Fail-safe BY CONSTRUCTION: the whole thing is wrapped so it can NEVER throw into boot. No KEK / no
 * DATABASE_URL / DB error / key-not-in-vault → the key is simply left as whatever was already in
 * `process.env` (the prior behavior). A one-shot pool is opened and closed; nothing is left running.
 *
 * @module absorb-service-host/boot-secrets
 */
import { Pool } from 'pg';
import { createHoloKeyVault, SECRET_STORE_DDL } from '@holoscript/secrets-broker';

const OWNER = process.env.HOLOKEY_OWNER || 'infra';

/**
 * Hydrate `process.env` from the HoloKey vault for the named secrets. Returns the names that were
 * sourced from the vault (for the affirmation log). Never throws.
 */
export async function hydrateServiceSecrets(names: readonly string[]): Promise<void> {
  let pool: Pool | undefined;
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.log('[holokey] hydrate skipped (no DATABASE_URL) — secrets resolve from process.env');
      return;
    }
    pool = new Pool({ connectionString: dbUrl, max: 2 });
    await pool.query(SECRET_STORE_DDL).catch((e: unknown) => {
      console.warn(
        `[holokey] SECRET_STORE_DDL apply failed (env unchanged): ${e instanceof Error ? e.message : String(e)}`
      );
    });
    const query = (sql: string, params: readonly unknown[]) => pool!.query(sql, params as unknown[]);
    const vault = createHoloKeyVault({ env: process.env, query });
    if (!vault) {
      console.log('[holokey] hydrate: vault OFF (no KEK) — secrets resolve from process.env');
      return;
    }
    const hydrated: string[] = [];
    for (const name of names) {
      try {
        const { value } = await vault.resolver.resolve({
          authenticatedOwnerId: OWNER,
          ref: `vault:${name}`,
          purpose: 'boot-hydrate',
        });
        if (value) {
          process.env[name] = value;
          hydrated.push(name);
        }
      } catch {
        // not in the vault (or unreadable) → leave process.env[name] as-is.
      }
    }
    console.log(
      `[holokey] hydrate ON (owner=${OWNER} backend=${vault.backend} kek=${vault.kekGrade}) — ${hydrated.length}/${names.length} from vault: [${hydrated.join(', ')}]`
    );
  } catch (e) {
    console.warn(
      `[holokey] hydrate failed (env unchanged, fully fallback-safe): ${e instanceof Error ? e.message : String(e)}`
    );
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}
