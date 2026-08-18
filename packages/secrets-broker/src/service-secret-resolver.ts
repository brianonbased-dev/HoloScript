/**
 * Service-side secret resolution — the Phase 1 "resolve from the vault, else process.env" bridge.
 *
 * A long-running service (or fleet agent) resolves its OWN config secrets through one helper: if the
 * HoloKey vault is ON and holds the secret for this service's owner, return it (decrypted at
 * use-time); otherwise FALL BACK to `process.env[name]` — the exact prior behavior. So a consumer
 * can swap `process.env.OPENAI_API_KEY` for `resolve('OPENAI_API_KEY')` with ZERO risk: until the
 * key is put in the vault nothing changes; once it is, the consumer transparently picks it up. This
 * is the incremental migration off per-service plaintext env — no flag day, no boot coupling.
 *
 * Service identity (Phase 1): the owner is derived from `HOLOKEY_OWNER`, HoloMesh agent id,
 * fleet seat, Railway service id/name, or an x402 bearer fingerprint. Operational secret refs may
 * use the `infra://<NAME>` namespace; they resolve for the service owner without going through
 * Studio's human workspace namespace.
 *
 * Fail-safe by construction: the vault is built lazily on first resolve and cached; ANY failure
 * (no KEK, DDL/pool error, decrypt error, not-found, denied) falls through to `process.env`. The
 * helper logs ONE affirmation line (vault ON / OFF) so a silently-off vault is observable — the
 * premortem's explicit-affirmation requirement.
 *
 * @module secrets-broker/service-secret-resolver
 */

import { createHoloKeyVault, type HoloKeyVault } from './vault-bootstrap';
import { createHoloKeydSource, type RemoteSecretSource } from './holokeyd-source';
import type { SecretQueryRunner } from './postgres-secret-backend';
import type { SecretResolveAudit } from './secret-resolver';
import {
  normalizeServiceSecretRef,
  resolveServiceIdentity,
  type ServiceIdentity,
  type NormalizedServiceSecretRef,
} from './service-identity';

type Env = Record<string, string | undefined>;

export interface ServiceSecretResolverOpts {
  /** Environment to read KEK material + fall-back values from. Defaults to `process.env`. */
  env?: Env;
  /** Injected pg query runner (bound `pool.query`). Absent → in-memory backend (non-persistent / dev). */
  query?: SecretQueryRunner['query'];
  /**
   * Owner identity this service resolves as. When absent, derived from HoloKey/HoloMesh/fleet/
   * Railway/x402 env signals, with legacy fallback `infra`.
   */
  owner?: string;
  /** Audit sink for every resolve attempt. */
  audit?: (e: SecretResolveAudit) => void;
  /** One-time affirmation logger (default `console.log`). Pass a no-op to silence (tests). */
  log?: (msg: string) => void;
  /**
   * Inject a pre-built vault instead of building one from env. `undefined` → build via
   * createHoloKeyVault; an explicit `HoloKeyVault | null` is used as-is (advanced wiring + tests).
   */
  vault?: HoloKeyVault | null;
  /**
   * Last-resort plaintext source consulted AFTER the vault and `process.env` — the bridge
   * to the TPM-bound `holokeyd` vault, which cannot be a `SecretStoreBackend` because it
   * hands back plaintext rather than ciphertext this KEK could open.
   *
   * `undefined` → built from env (`HOLOKEYD_HOST`), which means OFF unless configured.
   * An explicit `RemoteSecretSource | null` is used as-is (tests, advanced wiring).
   */
  remoteSource?: RemoteSecretSource | null;
}

export interface ServiceSecretResolver {
  /**
   * Vault value for this owner if present, else `process.env[name]`, else `undefined`.
   * Accepts `NAME`, `vault:NAME`, or `infra://NAME`. Never throws for vault failures.
   */
  resolve(nameOrRef: string): Promise<string | undefined>;
  /** Whether the vault is ON for this resolver (lazily determined on first call). */
  vaultEnabled(): boolean;
  /** Service/fleet owner identity used for HoloKey owner isolation and audit. */
  identity(): ServiceIdentity;
}

function isOperationalSecretRef(value: string | undefined): value is string {
  const trimmed = value?.trim();
  return Boolean(trimmed && (trimmed.startsWith('vault:') || trimmed.startsWith('infra://')));
}

async function resolveVaultValue(args: {
  vault: HoloKeyVault;
  serviceIdentity: ServiceIdentity;
  normalized: NormalizedServiceSecretRef;
}): Promise<string | undefined> {
  try {
    const { value } = await args.vault.resolver.resolve({
      authenticatedOwnerId: args.serviceIdentity.ownerId,
      ref: args.normalized.ref,
      purpose: 'service-config',
    });
    return value;
  } catch {
    return undefined;
  }
}

function tryNormalizeServiceSecretRef(input: string): NormalizedServiceSecretRef | null {
  try {
    return normalizeServiceSecretRef(input);
  } catch {
    return null;
  }
}

export function createServiceSecretResolver(
  opts: ServiceSecretResolverOpts = {}
): ServiceSecretResolver {
  const env = opts.env ?? process.env;
  const serviceIdentity = resolveServiceIdentity({ env, owner: opts.owner });
  const log = opts.log ?? ((m: string) => console.log(m));
  let built = false;
  let vault: HoloKeyVault | null = null;
  let remote: RemoteSecretSource | null = null;

  function ensureVault(): HoloKeyVault | null {
    if (built) return vault;
    built = true;
    if (opts.vault !== undefined) {
      vault = opts.vault;
    } else {
      try {
        vault = createHoloKeyVault({ env, query: opts.query, audit: opts.audit });
      } catch {
        vault = null; // never throw — fall back to env
      }
    }
    if (opts.remoteSource !== undefined) {
      remote = opts.remoteSource;
    } else {
      try {
        remote = createHoloKeydSource({ env });
      } catch {
        remote = null; // never throw — the bridge is optional by construction
      }
    }
    const tail = remote ? `, else ${remote.id}` : '';
    log(
      vault
        ? `[holokey] vault ON (owner=${serviceIdentity.ownerId} source=${serviceIdentity.source} backend=${vault.backend} kek=${vault.kekGrade}) — service secrets resolve from the vault, else process.env${tail}`
        : `[holokey] vault OFF (no KEK / not configured) — service secrets resolve from process.env${tail}`
    );
    return vault;
  }

  return {
    async resolve(nameOrRef: string): Promise<string | undefined> {
      const normalized = normalizeServiceSecretRef(nameOrRef);
      const v = ensureVault();
      if (v) {
        try {
          const value = await resolveVaultValue({ vault: v, serviceIdentity, normalized });
          if (value !== undefined) return value;
        } catch {
          // not-in-vault / denied / decrypt error → fall back to env (the migration bridge).
        }
      }
      const fallback = env[normalized.envName];
      if (isOperationalSecretRef(fallback)) {
        const fallbackRef = tryNormalizeServiceSecretRef(fallback);
        if (!fallbackRef) return undefined;
        if (v) {
          const viaVault = await resolveVaultValue({ vault: v, serviceIdentity, normalized: fallbackRef });
          if (viaVault !== undefined) return viaVault;
        }
        // The ref pointed at the vault and the vault could not answer — the bridge is
        // the whole point of that indirection, so try it before giving up.
        return remote ? remote.resolve(fallbackRef.envName) : undefined;
      }
      if (fallback) return fallback;
      // Last resort: the TPM-bound holokeyd vault. Reaching here means neither the
      // local vault nor plaintext env had it — i.e. exactly the post-migration state.
      return remote ? remote.resolve(normalized.envName) : undefined;
    },
    vaultEnabled(): boolean {
      return ensureVault() !== null;
    },
    identity(): ServiceIdentity {
      return serviceIdentity;
    },
  };
}
