/**
 * mcp-server HoloKey resolver + one-shot env→vault migration — Phase 2.
 *
 * Resolves a service config secret from the HoloKey vault (the prod Postgres + the shared
 * `HOLOKEY_PROD_KEK_*` KEK) if it's there, else from `process.env`. A consumer swaps
 * `process.env.ANTHROPIC_API_KEY` for `await resolveServiceSecret('ANTHROPIC_API_KEY')` and
 * behavior is IDENTICAL until that key is put in the vault — then it transparently resolves
 * from the vault. `infra://ANTHROPIC_API_KEY` is also accepted for operational refs. No boot
 * coupling: the pool + vault are built lazily on first call.
 *
 * `migrateEnvKeys` is the "set once" step run INSIDE the service: it copies named secrets from
 * `process.env` into the vault (owner-scoped, idempotent), so the value reads from the service's
 * own env and never transits a wire as plaintext beyond the encrypted store.
 *
 * Fail-safe by construction (premortem): the pg pool init and the `SECRET_STORE_DDL` apply each
 * have their OWN try/catch — a DB/perms/schema failure NEVER throws into a caller; resolves fall
 * back to env. `createServiceSecretResolver` logs ONE affirmation line (vault ON/OFF) on first use.
 *
 * @module mcp-server/holokey-resolver
 */
import { Pool } from 'pg';
import {
  AuthRequiredError,
  createHoloKeyVault,
  createServiceSecretResolver,
  registerNeedsKeyTrait,
  SECRET_STORE_DDL,
  SecretNotFoundError,
  type HoloKeyVault,
  type SecretResolver,
  type ServiceIdentity,
  type ServiceSecretResolver,
} from '@holoscript/secrets-broker';
import type { SigningContext } from './holomesh/identity/signing-middleware';
import { createRailwayPostgresPoolOptions } from './postgres-pool-options';

let built = false;
let vault: HoloKeyVault | null = null;
let resolver: ServiceSecretResolver | null = null;
let serviceIdentity: ServiceIdentity | null = null;

interface NeedsKeyTraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export interface McpNeedsKeyRegistrationResult {
  registered: true;
  ownerId: string | null;
  authenticated: boolean;
  vaultConfigured: boolean;
}

const unavailableSecretResolver: SecretResolver = {
  async resolve(input) {
    if (!input.authenticatedOwnerId) {
      throw new AuthRequiredError(input.ref);
    }
    throw new SecretNotFoundError(input.ref);
  },
};

function ensure(): void {
  if (built) return;
  built = true;

  let query:
    | ((
        sql: string,
        params: readonly unknown[]
      ) => Promise<{ rows: Array<Record<string, unknown>> }>)
    | undefined;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const pool = new Pool(createRailwayPostgresPoolOptions(dbUrl, { max: 2 }));
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

  vault = createHoloKeyVault({ env: process.env, query });
  resolver = createServiceSecretResolver({ vault, env: process.env });
  serviceIdentity = resolver.identity();
}

/**
 * Resolve a service config secret: the HoloKey vault value if present (for this service's
 * owner, decrypted at use-time), else `process.env[name]`. Never throws; fully fallback-safe.
 */
export function resolveServiceSecret(name: string): Promise<string | undefined> {
  ensure();
  return resolver!.resolve(name);
}

export function ownerIdFromSigningContext(signingCtx: SigningContext | null | undefined) {
  if (!signingCtx?.signingValid || !signingCtx.signer) return null;
  return signingCtx.signer;
}

/**
 * Bind HoloKey's `@needs_key` trait for an MCP request-scoped runtime.
 *
 * The owner is derived from the verified SigningContext signer. When HoloKey is
 * not provisioned on the service, the trait is still registered against a
 * value-free resolver that denies every request instead of letting the trait
 * silently disappear.
 */
export function registerNeedsKeyTraitForMcpRequest(
  registrar: NeedsKeyTraitRegistrar,
  input: {
    signingCtx?: SigningContext | null;
    resolver?: SecretResolver | null;
  } = {}
): McpNeedsKeyRegistrationResult {
  ensure();
  const ownerId = ownerIdFromSigningContext(input.signingCtx);
  const secretResolver = input.resolver ?? vault?.resolver ?? unavailableSecretResolver;

  registerNeedsKeyTrait(registrar, {
    resolver: secretResolver,
    authenticatedOwnerId: ownerId,
  });

  return {
    registered: true,
    ownerId,
    authenticated: ownerId !== null,
    vaultConfigured: Boolean(input.resolver ?? vault?.resolver),
  };
}

/**
 * One-shot migration: copy the named secrets from `process.env` INTO the vault under the
 * derived service owner, idempotent (skips ones already stored). Returns NAMES only — never a value.
 */
export async function migrateEnvKeys(
  names: readonly string[]
): Promise<{ vaultOff: boolean; owner: string; migrated: string[]; skipped: string[] }> {
  ensure();
  const migrated: string[] = [];
  const skipped: string[] = [];
  const owner = serviceIdentity?.ownerId ?? 'infra';
  if (!vault) return { vaultOff: true, owner, migrated, skipped };
  for (const name of names) {
    const value = process.env[name];
    if (!value) {
      skipped.push(`${name}:no-env`);
      continue;
    }
    try {
      // Already in the vault for this owner? skip (idempotent).
      await vault.resolver.resolve({ authenticatedOwnerId: owner, ref: `vault:${name}` });
      skipped.push(`${name}:exists`);
    } catch {
      // Not present (or unreadable) → store it.
      try {
        await vault.store.put({ ownerId: owner, name, value });
        migrated.push(name);
      } catch {
        skipped.push(`${name}:err`);
      }
    }
  }
  return { vaultOff: false, owner, migrated, skipped };
}
