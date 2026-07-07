/**
 * HoloKey vault bootstrap — the single place that turns the encrypted value-store ON.
 *
 * Phase 0 of the operational-secret migration (research/2026-06-16_holokey-operational-
 * secret-migration.md). The secrets-broker package ships every piece — `SecretStore`,
 * the Postgres backend, KEK providers, the fail-closed resolver — but nothing instantiates
 * them in a live server: only an in-memory *lease* adapter runs (W.705, built-but-dead-
 * wired). This factory assembles them from config so an agent/service can finally
 * `put`/`get`/`resolve` a secret at runtime.
 *
 * FLAG-GATED so it can never break a boot: with no KEK configured it returns `null` and
 * the caller falls back to its prior behavior. A misconfigured prod KEK (a dev KEK under
 * `NODE_ENV=production`) is logged and also returns `null` rather than throwing. So wiring
 * `createHoloKeyVault()` into a server bootstrap is purely additive — absent config = the
 * exact prior behavior.
 *
 * The bootstrap secret model (research §bootstrap): a service is configured with ONE
 * KEK (a Railway managed/sealed var) and a DB URL; with those it decrypts every other
 * secret from the vault at runtime. N plaintext keys per service → 1 rotatable KEK.
 *
 * @module secrets-broker/vault-bootstrap
 */

import {
  createSecretStore,
  createInMemorySecretBackend,
  type SecretStore,
  type SecretStoreBackend,
  type KekProvider,
} from './secret-store';
import { createPostgresSecretBackend, type SecretQueryRunner } from './postgres-secret-backend';
import {
  createFileSecretBackend,
  HOLOKEY_STORE_PATH_ENV,
  SECRETS_VAULT_STORE_PATH_ENV,
} from './file-secret-backend';
import { createEnvKekProvider, KEK_CURRENT_ENV } from './env-kek-provider';
import { createScopedSecretKeyring } from './scoped-secret-keyring';
import { createKmsKekProvider } from './kms-kek-provider';
import {
  createSecretResolver,
  type SecretResolver,
  type SecretResolveAudit,
} from './secret-resolver';

type Env = Record<string, string | undefined>;

/** Env var naming the current PRODUCTION, service-scoped KEK id (vs the dev `SECRETS_VAULT_KEK_*`). */
export const PROD_KEK_CURRENT_ENV = 'HOLOKEY_PROD_KEK_CURRENT';

export interface HoloKeyVault {
  /** Encrypt + store / metadata / delete / rotate. Owner-isolated. */
  readonly store: SecretStore;
  /** Fail-closed, owner-bound, audited value resolution for trusted server-side consumers. */
  readonly resolver: SecretResolver;
  /** Which KEK backed the store — `production` (KMS/scoped-keyring) or `dev` (env KEK). */
  readonly kekGrade: 'production' | 'dev';
  /** Which persistence backend — `postgres` (durable) or `in-memory` (non-persistent / tests). */
  readonly backend: 'postgres' | 'file' | 'in-memory';
}

export interface CreateHoloKeyVaultOpts {
  /** Environment to read KEK material + NODE_ENV from. Defaults to `process.env`. */
  env?: Env;
  /** Injected pg query runner (a bound `pool.query`). Absent → in-memory backend (non-persistent). */
  query?: SecretQueryRunner['query'];
  /** Audit sink for every resolve attempt (allowed + denied). Never carries the value. */
  audit?: (e: SecretResolveAudit) => void;
}

/**
 * Pick a KEK provider from env: prefer the production scoped-keyring (`HOLOKEY_PROD_KEK_*`,
 * `productionGrade: true`); fall back to the dev env KEK (`SECRETS_VAULT_KEK_*`). Returns
 * null when NEITHER is set — the flag-gate that keeps the vault OFF.
 */
function pickKek(env: Env): { kek: KekProvider; grade: 'production' | 'dev' } | null {
  if (env[PROD_KEK_CURRENT_ENV]) {
    return {
      kek: createKmsKekProvider({ keyring: createScopedSecretKeyring({ env }) }),
      grade: 'production',
    };
  }
  if (env[KEK_CURRENT_ENV]) {
    return { kek: createEnvKekProvider({ env }), grade: 'dev' };
  }
  return null;
}

function pickBackend(
  env: Env,
  query: SecretQueryRunner['query'] | undefined
): { backend: SecretStoreBackend; kind: HoloKeyVault['backend'] } {
  if (query) {
    return { backend: createPostgresSecretBackend({ query }), kind: 'postgres' };
  }
  const filePath = env[HOLOKEY_STORE_PATH_ENV]?.trim() || env[SECRETS_VAULT_STORE_PATH_ENV]?.trim();
  if (filePath) {
    return { backend: createFileSecretBackend({ filePath }), kind: 'file' };
  }
  return { backend: createInMemorySecretBackend(), kind: 'in-memory' };
}

/**
 * Assemble the HoloKey vault from config, or return `null` (vault OFF) when no KEK is
 * configured or the prod gate rejects a dev KEK. Never throws on config — a boot wiring
 * this in keeps its prior behavior when unconfigured.
 */
export function createHoloKeyVault(opts: CreateHoloKeyVaultOpts = {}): HoloKeyVault | null {
  const env = opts.env ?? process.env;
  const picked = pickKek(env);
  if (!picked) return null; // no KEK → vault OFF; caller keeps its prior behavior.

  const { backend, kind } = pickBackend(env, opts.query);

  const requireProductionGradeKek = env.NODE_ENV === 'production';
  let store: SecretStore;
  try {
    store = createSecretStore({ backend, kekProvider: picked.kek, requireProductionGradeKek });
  } catch (err) {
    // InsecureKekError (prod + dev KEK) or a KEK config error — stay OFF rather than break the boot.
    // eslint-disable-next-line no-console
    console.warn(
      `[holokey] vault NOT enabled: ${err instanceof Error ? err.name : 'config error'} ` +
        `(kekGrade=${picked.grade}, NODE_ENV=${env.NODE_ENV ?? 'unset'}). Falling back to vault-off.`
    );
    return null;
  }

  const resolver = createSecretResolver({ store, audit: opts.audit });
  return {
    store,
    resolver,
    kekGrade: picked.grade,
    backend: kind,
  };
}
