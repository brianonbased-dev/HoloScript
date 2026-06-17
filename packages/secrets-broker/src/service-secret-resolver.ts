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
 * Service identity (Phase 1, minimal): the owner is a configured constant (`HOLOKEY_OWNER`, default
 * `infra`) plus the bootstrap KEK. A service resolving its OWN config needs no delegated auth; the
 * fuller X402/seat-bound identity is for resolving on behalf of OTHER owners (later).
 *
 * Fail-safe by construction: the vault is built lazily on first resolve and cached; ANY failure
 * (no KEK, DDL/pool error, decrypt error, not-found, denied) falls through to `process.env`. The
 * helper logs ONE affirmation line (vault ON / OFF) so a silently-off vault is observable — the
 * premortem's explicit-affirmation requirement.
 *
 * @module secrets-broker/service-secret-resolver
 */

import { createHoloKeyVault, type HoloKeyVault } from './vault-bootstrap';
import type { SecretQueryRunner } from './postgres-secret-backend';
import type { SecretResolveAudit } from './secret-resolver';

type Env = Record<string, string | undefined>;

export interface ServiceSecretResolverOpts {
  /** Environment to read KEK material + fall-back values from. Defaults to `process.env`. */
  env?: Env;
  /** Injected pg query runner (bound `pool.query`). Absent → in-memory backend (non-persistent / dev). */
  query?: SecretQueryRunner['query'];
  /** Owner identity this service resolves as. Default: `env.HOLOKEY_OWNER ?? 'infra'`. */
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
}

export interface ServiceSecretResolver {
  /** Vault value for this owner if present, else `process.env[name]`, else `undefined`. Never throws. */
  resolve(name: string): Promise<string | undefined>;
  /** Whether the vault is ON for this resolver (lazily determined on first call). */
  vaultEnabled(): boolean;
}

export function createServiceSecretResolver(
  opts: ServiceSecretResolverOpts = {}
): ServiceSecretResolver {
  const env = opts.env ?? process.env;
  const owner = opts.owner ?? env.HOLOKEY_OWNER ?? 'infra';
  const log = opts.log ?? ((m: string) => console.log(m));
  let built = false;
  let vault: HoloKeyVault | null = null;

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
    log(
      vault
        ? `[holokey] vault ON (owner=${owner} backend=${vault.backend} kek=${vault.kekGrade}) — service secrets resolve from the vault, else process.env`
        : `[holokey] vault OFF (no KEK / not configured) — service secrets resolve from process.env`
    );
    return vault;
  }

  return {
    async resolve(name: string): Promise<string | undefined> {
      const v = ensureVault();
      if (v) {
        try {
          const { value } = await v.resolver.resolve({
            authenticatedOwnerId: owner,
            ref: `vault:${name}`,
            purpose: 'service-config',
          });
          return value;
        } catch {
          // not-in-vault / denied / decrypt error → fall back to env (the migration bridge).
        }
      }
      return env[name];
    },
    vaultEnabled(): boolean {
      return ensureVault() !== null;
    },
  };
}
