#!/usr/bin/env node
/**
 * Resolve the Android release-signing secrets from HoloKey (the wallet-keyed vault) — or, when the
 * vault is OFF, from process.env — and materialize the keystore to a private tmp file. Returns the
 * four env additions gradle reads via its System.getenv fallback: KEYSTORE_FILE / KEYSTORE_PASSWORD
 * / KEY_ALIAS / KEY_PASSWORD (see android-mr/app/build.gradle.kts `signingValue`).
 *
 * Secrets-safe (F.106 / W.721): NEVER prints a secret value. The keystore is written to os.tmpdir()
 * at mode 0o600 and is meant to be unlink()'d by the caller after the build (build-release.mjs does
 * this). Nothing secret is committed — keystore.properties stays gitignored; the only durable copies
 * are the KEK-wrapped HoloKey rows + the founder's offline keystore backup.
 *
 * Provision the secrets once (founder) — see RELEASE.md "Signing secrets (HoloKey)":
 *   KEYSTORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS, ANDROID_KEYSTORE_B64 (= base64 of release.keystore)
 * The vault is ON only with HOLOKEY_PROD_KEK_* (+ DATABASE_URL); otherwise these resolve from
 * process.env, so CI/local can also pass them directly without the vault.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

// UPPER_SNAKE names (required by the secrets-broker `assertSecretName`).
const NAME = {
  storePassword: 'KEYSTORE_PASSWORD',
  keyPassword: 'KEY_PASSWORD',
  keyAlias: 'KEY_ALIAS',
  keystoreB64: 'ANDROID_KEYSTORE_B64',
  keystoreFile: 'KEYSTORE_FILE', // optional direct-path override (skips base64 materialization)
};

/**
 * @returns {Promise<{ ok: boolean, materialized: string|null, env: Record<string,string> }>}
 *   ok=false → secrets unresolved (caller should abort; gradle would error on signing anyway).
 *   materialized = the keystore path WE created from base64 (caller must delete it); null if a
 *   direct KEYSTORE_FILE path was supplied instead.
 */
export async function resolveSigningEnv() {
  const pkg = await import('@holoscript/secrets-broker').catch(() => null);
  if (!pkg?.createServiceSecretResolver) {
    throw new Error(
      'resolve-signing-secrets: @holoscript/secrets-broker not built — run ' +
        '`pnpm --filter @holoscript/secrets-broker build`'
    );
  }

  const owner = process.env.HOLOKEY_OWNER || 'infra';
  const dbUrl = process.env.HOLOKEY_DATABASE_URL || process.env.DATABASE_URL;
  let pool = null;
  let query;
  if (dbUrl) {
    const pg = (await import('pg')).default;
    pool = new pg.Pool({ connectionString: dbUrl });
    if (pkg.SECRET_STORE_DDL) await pool.query(pkg.SECRET_STORE_DDL); // idempotent CREATE TABLE IF NOT EXISTS
    query = (sql, params) => pool.query(sql, params);
  }

  try {
    const resolver = pkg.createServiceSecretResolver({ env: process.env, query, owner });
    const [storePassword, keyPassword, keyAlias, keystoreB64, keystoreFileDirect] = await Promise.all([
      resolver.resolve(NAME.storePassword),
      resolver.resolve(NAME.keyPassword),
      resolver.resolve(NAME.keyAlias),
      resolver.resolve(NAME.keystoreB64),
      resolver.resolve(NAME.keystoreFile),
    ]);

    let keystorePath = keystoreFileDirect || null;
    let materialized = null;
    if (!keystorePath && keystoreB64) {
      keystorePath = join(os.tmpdir(), `qr-release-${process.pid}-${process.hrtime.bigint()}.keystore`);
      writeFileSync(keystorePath, Buffer.from(keystoreB64, 'base64'), { mode: 0o600 });
      materialized = keystorePath;
    }

    const ok = Boolean(keystorePath && storePassword && keyAlias && keyPassword);
    return {
      ok,
      materialized,
      env: ok
        ? {
            KEYSTORE_FILE: keystorePath,
            KEYSTORE_PASSWORD: storePassword,
            KEY_ALIAS: keyAlias,
            KEY_PASSWORD: keyPassword,
          }
        : {},
    };
  } finally {
    if (pool) await pool.end();
  }
}
