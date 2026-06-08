/**
 * Scoped-secret KMS keyring — the production KEK source for a Railway-style deploy.
 *
 * Implements {@link KmsKeyring} (consumed by `createKmsKekProvider`) by reading the KEK
 * from a DEDICATED, service-scoped secret namespace — distinct from the shared-surface
 * env the dev provider uses. The premortem's accepted minimum: "a Railway secret scoped
 * to ONLY the one service that decrypts, never the shared root."
 *
 * Deployment contract (load-bearing — this is what makes it production-grade):
 *   - Set `HOLOKEY_PROD_KEK_CURRENT` + `HOLOKEY_PROD_KEK_<KEKID>` ONLY on the single
 *     service that resolves secrets, NEVER on the shared monorepo deploy root.
 *   - These vars must NOT appear in any `.env`, Dockerfile, or `railway.toml` committed to
 *     the repo — provision them in the platform secret UI for that one service.
 *
 * The distinct `HOLOKEY_PROD_*` prefix (vs the dev provider's `SECRETS_VAULT_KEK_*`) is the
 * signal that these are production, service-scoped material. Wrapping this in
 * `createKmsKekProvider` yields a `productionGrade: true` provider the SecretStore gate accepts.
 *
 * For a true cloud KMS / HSM (AWS KMS, GCP Secret Manager, Vault), write a ~10-line adapter
 * implementing the same {@link KmsKeyring} over its SDK instead of this env reader.
 *
 * @module secrets-broker/scoped-secret-keyring
 */

import type { KmsKeyring } from './kms-kek-provider';

const KEK_BYTES = 32;
const KEK_ID_RE = /^[A-Za-z0-9_]+$/;
const DEFAULT_PREFIX = 'HOLOKEY_PROD_KEK';

/** Thrown when the scoped secret material is missing or malformed. Carries no key bytes. */
export class ScopedSecretKeyringError extends Error {
  constructor(message: string) {
    super(`scoped-secret-keyring: ${message}`);
    this.name = 'ScopedSecretKeyringError';
  }
}

export interface ScopedSecretKeyringDeps {
  /** Environment to read from. Defaults to `process.env`. Injectable for tests. */
  env?: Record<string, string | undefined>;
  /** Override the var prefix (default `HOLOKEY_PROD_KEK`). The `_CURRENT` / `_<KEKID>` suffixes apply. */
  prefix?: string;
}

/**
 * Create a {@link KmsKeyring} backed by service-scoped secret env vars. Pass the result to
 * `createKmsKekProvider` to get the production KEK provider.
 */
export function createScopedSecretKeyring(deps: ScopedSecretKeyringDeps = {}): KmsKeyring {
  const env = deps.env ?? process.env;
  const prefix = deps.prefix ?? DEFAULT_PREFIX;
  const currentVar = `${prefix}_CURRENT`;
  const kekVar = (kekId: string): string => `${prefix}_${kekId.toUpperCase()}`;

  const currentKekId = (): string => {
    const id = env[currentVar];
    if (!id) throw new ScopedSecretKeyringError(`${currentVar} is not set`);
    if (!KEK_ID_RE.test(id))
      throw new ScopedSecretKeyringError(`invalid kekId "${id}" (allowed: [A-Za-z0-9_])`);
    return id;
  };

  return {
    currentKekId,
    async resolveKekBytes(kekId: string): Promise<Buffer> {
      if (!KEK_ID_RE.test(kekId)) throw new ScopedSecretKeyringError(`invalid kekId "${kekId}"`);
      const raw = env[kekVar(kekId)];
      if (!raw) throw new ScopedSecretKeyringError(`${kekVar(kekId)} is not set`);
      const buf = Buffer.from(raw, 'base64');
      if (buf.length !== KEK_BYTES) {
        throw new ScopedSecretKeyringError(
          `${kekVar(kekId)} must be base64 of ${KEK_BYTES} bytes (got ${buf.length})`
        );
      }
      return buf;
    },
  };
}
