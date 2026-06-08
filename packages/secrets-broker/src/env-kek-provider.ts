/**
 * Environment-backed KEK provider — DEV / BOOTSTRAP ONLY.
 *
 * Implements {@link KekProvider} by reading the master key-encryption-key(s) from
 * environment variables. This is the ONLY module in the secrets-broker that reads
 * `process.env` — the SecretStore itself never does; it depends on this provider
 * so the key source can be swapped without touching the crypto.
 *
 * ┌─ ⚠ PHASE-3 GATE (vault premortem, 2026-06-08) ──────────────────────────────┐
 * │ An env-var KEK is a SINGLE POINT OF TOTAL COMPROMISE: one leaked variable    │
 * │ unwraps EVERY user's stored secret. On this monorepo's shared deploy surface │
 * │ — where committed keys were found TWICE in the last 60 days — that risk is   │
 * │ unacceptable for real user secrets. Therefore:                              │
 * │   • This provider is for local dev, tests, and pre-GA bring-up ONLY.        │
 * │   • Before ANY real user secret is stored (GA), replace it with a           │
 * │     KMS/HSM-backed provider implementing the SAME `KekProvider` interface — │
 * │     no SecretStore change required. (premortem Phase 3.)                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Env contract:
 *   SECRETS_VAULT_KEK_CURRENT = <kekId>          # e.g. "v1" — the active KEK id
 *   SECRETS_VAULT_KEK_<KEKID>  = <base64 32 bytes># e.g. SECRETS_VAULT_KEK_V1=...
 * Multiple `SECRETS_VAULT_KEK_<id>` vars may coexist so {@link SecretStore.rotateKek}
 * can unwrap historical rows under their original KEK while re-wrapping under the new one.
 *
 * @module secrets-broker/env-kek-provider
 */

import { randomBytes } from 'node:crypto';
import type { KekProvider } from './secret-store';

/** AES-256 KEK length in bytes. */
const KEK_BYTES = 32;

/** kekIds map to env var names, so constrain them to a safe token charset. */
const KEK_ID_RE = /^[A-Za-z0-9_]+$/;

/** Thrown when the env KEK material is missing or malformed. Carries no key bytes. */
export class EnvKekConfigError extends Error {
  constructor(message: string) {
    super(`env-kek-provider: ${message}`);
    this.name = 'EnvKekConfigError';
  }
}

export interface EnvKekProviderDeps {
  /** Environment to read from. Defaults to `process.env`. Injectable for tests. */
  env?: Record<string, string | undefined>;
}

/** The env var that names the current KEK id. */
export const KEK_CURRENT_ENV = 'SECRETS_VAULT_KEK_CURRENT';

/** Build the env var name that holds the KEK bytes for a given id. */
export function kekEnvVar(kekId: string): string {
  return `SECRETS_VAULT_KEK_${kekId.toUpperCase()}`;
}

/**
 * Generate a fresh 32-byte KEK, base64-encoded for placing in an env var.
 * Setup helper — print once, store in the secret manager, never log thereafter.
 */
export function generateKekBase64(): string {
  return randomBytes(KEK_BYTES).toString('base64');
}

function assertKekId(kekId: string): void {
  if (!KEK_ID_RE.test(kekId)) {
    throw new EnvKekConfigError(`invalid kekId "${kekId}" (allowed: [A-Za-z0-9_])`);
  }
}

function decodeKek(raw: string, kekId: string): Buffer {
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEK_BYTES) {
    // Never include the value — only the (wrong) length.
    throw new EnvKekConfigError(
      `KEK "${kekId}" must be base64 of ${KEK_BYTES} bytes (got ${buf.length})`
    );
  }
  return buf;
}

/**
 * Create an environment-backed {@link KekProvider}. DEV/BOOTSTRAP ONLY — see the
 * Phase-3 gate banner above before using with real user secrets.
 */
export function createEnvKekProvider(deps: EnvKekProviderDeps = {}): KekProvider {
  const env = deps.env ?? process.env;

  const currentKekId = (): string => {
    const id = env[KEK_CURRENT_ENV];
    if (!id) throw new EnvKekConfigError(`${KEK_CURRENT_ENV} is not set`);
    assertKekId(id);
    return id;
  };

  return {
    // DEV/BOOTSTRAP only — the SecretStore's requireProductionGradeKek gate rejects this.
    productionGrade: false,
    currentKekId,
    async getKek(kekId?: string): Promise<Buffer> {
      const id = kekId ?? currentKekId();
      assertKekId(id);
      const raw = env[kekEnvVar(id)];
      if (!raw) throw new EnvKekConfigError(`${kekEnvVar(id)} is not set`);
      return decodeKek(raw, id);
    },
  };
}
