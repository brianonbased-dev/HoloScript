/**
 * HoloKey user-secret store — Studio's per-user vault (server-only).
 *
 * Backs the HoloKey value layer (`@holoscript/secrets-broker`) onto Studio's own
 * Postgres so an authenticated user can store THEIR OWN secrets (e.g. a BYOK LLM key)
 * and have server-side consumers (Brittney's provider resolution, a Fleet job runner)
 * resolve them owner-bound, fail-closed, and audited — without the value ever crossing
 * the client or living in a shared `process.env`.
 *
 * ── Fail-SOFT by design ──────────────────────────────────────────────────────
 * Resolution is OPTIONAL infrastructure: the vault is only "configured" when BOTH a
 * database (`DATABASE_URL`) AND a KEK are present. When either is missing — local dev,
 * or a deployment that hasn't provisioned a KEK yet — the vault is DISABLED:
 *   - `resolveUserSecret` returns `null` (never throws) so callers cleanly fall back to
 *     their existing env-based credential — ZERO behaviour change until provisioned.
 *   - `putUserSecret` / `deleteUserSecret` throw {@link VaultUnconfiguredError} so the
 *     write API can surface a clear 501 rather than silently dropping a secret.
 *
 * KEK source (the ONLY place KEK env is read): a production scoped keyring
 * (`HOLOKEY_PROD_KEK_*`, service-scoped, off the shared root) is preferred; a dev env KEK
 * (`SECRETS_VAULT_KEK_*`) is the local fallback; absent either → disabled.
 *
 * This module must only be imported from server code — it pulls in `pg` + `node:crypto`
 * (via the broker) and reads KEK env, none of which may reach the browser bundle.
 *
 * @module lib/secrets/userSecretStore
 */

import {
  createSecretStore,
  createSecretResolver,
  createPostgresSecretBackend,
  createEnvKekProvider,
  createKmsKekProvider,
  createScopedSecretKeyring,
  SECRET_STORE_DDL,
  KEK_CURRENT_ENV,
  type SecretStore,
  type SecretResolver,
  type SecretStoreBackend,
  type KekProvider,
  type SecretResolveAudit,
} from '@holoscript/secrets-broker';
import { getPool } from '@/db/client';

/** A wired vault: the encrypted store plus its fail-closed, owner-bound resolver. */
export interface UserVault {
  store: SecretStore;
  resolver: SecretResolver;
}

/** Thrown by the write paths when the vault is not configured (no DB and/or no KEK). */
export class VaultUnconfiguredError extends Error {
  constructor() {
    super(
      'HoloKey user vault is not configured — set DATABASE_URL and a KEK ' +
        '(HOLOKEY_PROD_KEK_* in production, or SECRETS_VAULT_KEK_* for local dev).'
    );
    this.name = 'VaultUnconfiguredError';
  }
}

/**
 * Wire a vault from injected dependencies. Pure composition — used directly in tests
 * with an in-memory backend, and by the singleton below with the Postgres backend.
 */
export function createUserVault(deps: {
  backend: SecretStoreBackend;
  kekProvider: KekProvider;
  audit?: (event: SecretResolveAudit) => void;
}): UserVault {
  const store = createSecretStore({ backend: deps.backend, kekProvider: deps.kekProvider });
  const resolver = createSecretResolver({ store, audit: deps.audit });
  return { store, resolver };
}

/**
 * Resolve a KEK provider from env: production scoped keyring preferred, dev env-KEK
 * fallback, else null (vault disabled). The ONLY place KEK env is read.
 */
function resolveKekProvider(): KekProvider | null {
  if (process.env.HOLOKEY_PROD_KEK_CURRENT) {
    return createKmsKekProvider({ keyring: createScopedSecretKeyring() });
  }
  if (process.env[KEK_CURRENT_ENV]) {
    return createEnvKekProvider({ env: process.env });
  }
  return null;
}

let _vault: UserVault | null = null;
let _ddlReady: Promise<void> | null = null;
let _disabled = false;

/** The process-wide singleton vault, or null when unconfigured (cached after first probe). */
function getUserVault(): UserVault | null {
  if (_vault) return _vault;
  if (_disabled) return null;

  const pool = getPool();
  const kekProvider = pool ? resolveKekProvider() : null;
  if (!pool || !kekProvider) {
    _disabled = true; // env is fixed for a server process — don't re-probe every call
    return null;
  }

  const backend = createPostgresSecretBackend({
    query: (sql, params) => pool.query(sql, params as unknown[]),
  });
  _vault = createUserVault({ backend, kekProvider });

  // Lazy, idempotent schema provisioning (CREATE TABLE / INDEX IF NOT EXISTS).
  _ddlReady = pool
    .query(SECRET_STORE_DDL)
    .then(() => undefined)
    .catch((err: unknown) => {
      console.error('[userSecretStore] secret_store DDL provisioning failed:', err);
    });

  return _vault;
}

/** Whether the vault is configured (DB + KEK present) on this deployment. */
export function isUserVaultConfigured(): boolean {
  return getUserVault() !== null;
}

/**
 * Resolve an authenticated user's secret value by name (`vault:<name>`). FAIL-SOFT:
 * returns `null` — never throws — when the vault is unconfigured, the user has no such
 * secret, the caller is not the owner, or any decrypt/DB error occurs. Server-side
 * consumers treat `null` as "fall back to the existing env credential".
 */
export async function resolveUserSecret(args: {
  ownerId: string;
  name: string;
  purpose?: string;
}): Promise<string | null> {
  const vault = getUserVault();
  if (!vault) return null;
  try {
    if (_ddlReady) await _ddlReady;
    const { value } = await vault.resolver.resolve({
      authenticatedOwnerId: args.ownerId,
      ref: `vault:${args.name}`,
      purpose: args.purpose,
    });
    return value;
  } catch {
    return null;
  }
}

/** Encrypt + store (or replace) a secret for the authenticated owner. */
export async function putUserSecret(args: {
  ownerId: string;
  name: string;
  value: string;
}): Promise<void> {
  const vault = getUserVault();
  if (!vault) throw new VaultUnconfiguredError();
  if (_ddlReady) await _ddlReady;
  await vault.store.put({ ownerId: args.ownerId, name: args.name, value: args.value });
}

/** List the authenticated owner's secret NAMES — never values. Empty when unconfigured. */
export async function listUserSecretNames(ownerId: string): Promise<string[]> {
  const vault = getUserVault();
  if (!vault) return [];
  if (_ddlReady) await _ddlReady;
  const metadata = await vault.store.list({ ownerId });
  return metadata.map((m) => m.name);
}

/** Delete one of the authenticated owner's secrets by name. */
export async function deleteUserSecret(args: {
  ownerId: string;
  name: string;
}): Promise<{ deleted: boolean }> {
  const vault = getUserVault();
  if (!vault) throw new VaultUnconfiguredError();
  if (_ddlReady) await _ddlReady;
  return vault.store.delete({ ownerId: args.ownerId, ref: `vault:${args.name}` });
}

/** Test-only: reset the singleton so a test can re-probe env. Not for production use. */
export function __resetUserVaultForTests(): void {
  _vault = null;
  _ddlReady = null;
  _disabled = false;
}
