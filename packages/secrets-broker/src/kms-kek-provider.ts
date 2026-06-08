/**
 * KMS-backed KEK provider — the PRODUCTION KEK source for HoloKey (Phase-3 gate).
 *
 * The env provider (`env-kek-provider.ts`) keeps the master KEK in an environment
 * variable on the shared deploy surface — one leaked var unwraps the entire vault, and
 * committed-key incidents have hit that exact surface. This provider instead sources the
 * KEK from a vendor-agnostic **KMS / secret-manager keyring** — AWS KMS, GCP Secret
 * Manager, HashiCorp Vault, or a Railway secret scoped to ONLY the resolving service —
 * so the KEK is never on the shared env surface and key access is audited by the manager.
 *
 * Vendor-agnostic by construction: inject a {@link KmsKeyring} adapter; this module has
 * NO vendor SDK dependency. A vendor adapter is ~10 lines (call the SDK's get-secret /
 * decrypt and return 32 bytes). Marked `productionGrade: true`, so the SecretStore's
 * production gate (`requireProductionGradeKek`) accepts it where it rejects the env provider.
 *
 * NOTE on strength: this resolves the KEK BYTES into app memory at use-time (the
 * "scoped secret manager" pattern — the minimum the premortem requires). A stronger
 * future variant has the KMS/HSM wrap+unwrap the per-secret DEK directly so the root key
 * never leaves the HSM; that is a separate `KmsDekWrapper` seam, not this provider.
 *
 * @module secrets-broker/kms-kek-provider
 */

import type { KekProvider } from './secret-store';

/** AES-256 KEK length in bytes. */
const KEK_BYTES = 32;

/** Thrown when the KMS returns malformed key material. Carries no key bytes. */
export class KmsKekError extends Error {
  constructor(message: string) {
    super(`kms-kek-provider: ${message}`);
    this.name = 'KmsKekError';
  }
}

/**
 * Vendor-agnostic keyring the provider delegates to. A vendor adapter (AWS/GCP/Vault/
 * Railway-scoped) implements these two methods over its SDK — no other contract.
 */
export interface KmsKeyring {
  /** Resolve the raw 32-byte KEK for `kekId` from the KMS / scoped secret store. */
  resolveKekBytes(kekId: string): Promise<Buffer>;
  /** The id of the KEK that `resolveKekBytes` returns for the current epoch. */
  currentKekId(): string;
}

export interface KmsKekProviderDeps {
  keyring: KmsKeyring;
}

/**
 * Create the production {@link KekProvider} backed by a {@link KmsKeyring}. Validates the
 * returned material is exactly 32 bytes (never echoing it) and is marked production-grade.
 */
export function createKmsKekProvider(deps: KmsKekProviderDeps): KekProvider {
  const { keyring } = deps;
  return {
    productionGrade: true,
    currentKekId: () => keyring.currentKekId(),
    async getKek(kekId?: string): Promise<Buffer> {
      const id = kekId ?? keyring.currentKekId();
      const kek = await keyring.resolveKekBytes(id);
      if (!Buffer.isBuffer(kek) || kek.length !== KEK_BYTES) {
        // Length only — never the value.
        const len = Buffer.isBuffer(kek) ? kek.length : 'non-buffer';
        throw new KmsKekError(
          `KEK "${id}" from the keyring must be ${KEK_BYTES} bytes (got ${len})`
        );
      }
      return kek;
    },
  };
}
