#!/usr/bin/env node
/**
 * holokey — the convenience CLI for the HoloKey vault (set/rotate once, resolve everywhere).
 *
 * The founder-facing front door to the encrypted secret store (Phase 0 of the
 * operational-secret migration). Goal: stop juggling multiple .env files and rotating
 * by hand — set a key ONCE here, every agent + service resolves it from the vault.
 *
 *   node scripts/holokey.mjs gen-kek [id]      generate the one bootstrap KEK (prints the
 *                                              two Railway sealed vars to set — self-contained,
 *                                              needs no build; the value prints to YOUR screen only)
 *   node scripts/holokey.mjs set <name> <val>  store/rotate a secret (encrypted at rest)
 *   node scripts/holokey.mjs get <name>        resolve a secret value
 *   node scripts/holokey.mjs list              list secret names (never values)
 *
 * Env (set once, in Railway / .env): HOLOKEY_PROD_KEK_CURRENT + HOLOKEY_PROD_KEK_<ID>
 * (production KEK), or SECRETS_VAULT_KEK_CURRENT + SECRETS_VAULT_KEK_<ID> (dev). Plus
 * DATABASE_URL for durable storage, and HOLOKEY_OWNER (the owning identity; default "infra").
 */
import crypto from 'node:crypto';

const [, , cmd, ...rest] = process.argv;
const owner = process.env.HOLOKEY_OWNER || 'infra';

/** Generate a KEK with node:crypto only — no package, no build, works from anywhere. */
function genKek() {
  const id = (rest[0] || 'k1').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'k1';
  const value = crypto.randomBytes(32).toString('base64'); // AES-256 KEK (32 bytes)
  console.log(`# HoloKey production KEK (id=${id}). Set BOTH as Railway MANAGED/SEALED vars`);
  console.log(`# on the services that resolve secrets (this is the ONE bootstrap secret):`);
  console.log(`HOLOKEY_PROD_KEK_CURRENT=${id}`);
  console.log(`HOLOKEY_PROD_KEK_${id.toUpperCase()}=${value}`);
  console.log(`# Generated locally; rotate later by gen-kek with a new id (keep the old var so`);
  console.log(`# existing secrets can be re-wrapped). Never commit this value.`);
}

/** Build a live vault from env + DATABASE_URL, run fn, clean up. Exits 2 when the vault is OFF. */
async function withVault(fn) {
  const pkg = await import('@holoscript/secrets-broker').catch(() => null);
  if (!pkg || !pkg.createHoloKeyVault) {
    console.error('holokey: package not built. Run: pnpm --filter @holoscript/secrets-broker build');
    process.exit(2);
  }
  const dbUrl = process.env.HOLOKEY_DATABASE_URL || process.env.DATABASE_URL;
  let pool = null;
  let query;
  if (dbUrl) {
    const pg = (await import('pg')).default;
    pool = new pg.Pool({ connectionString: dbUrl });
    await pool.query(pkg.SECRET_STORE_DDL); // idempotent: CREATE TABLE IF NOT EXISTS
    query = (sql, params) => pool.query(sql, params);
  }
  const vault = pkg.createHoloKeyVault({ env: process.env, query });
  if (!vault) {
    console.error(
      'holokey: vault is OFF. Set a KEK first — run `node scripts/holokey.mjs gen-kek` and set the\n' +
        '  printed HOLOKEY_PROD_KEK_* vars (+ DATABASE_URL for durable storage).'
    );
    process.exit(2);
  }
  try {
    await fn(vault);
  } finally {
    if (pool) await pool.end();
  }
}

switch (cmd) {
  case 'gen-kek':
    genKek();
    break;
  case 'set':
    if (!rest[0] || rest[1] === undefined) {
      console.error('usage: holokey set <name> <value>');
      process.exit(2);
    }
    await withVault(async (v) => {
      const r = await v.store.put({ ownerId: owner, name: rest[0], value: rest[1] });
      console.log(`set ${r.ref} (v${r.version}) owner=${owner} backend=${v.backend} kek=${v.kekGrade}`);
    });
    break;
  case 'get':
    if (!rest[0]) {
      console.error('usage: holokey get <name>');
      process.exit(2);
    }
    await withVault(async (v) => {
      const r = await v.resolver.resolve({ authenticatedOwnerId: owner, ref: `vault:${rest[0]}` });
      process.stdout.write(r.value + '\n');
    });
    break;
  case 'list':
    await withVault(async (v) => {
      const meta = await v.store.list({ ownerId: owner });
      if (!meta.length) {
        console.log(`(no secrets for owner "${owner}")`);
        return;
      }
      for (const s of meta) console.log(`${s.name}\t(v${s.version}, used ${s.lastUsedAt ?? 'never'})`);
    });
    break;
  default:
    console.log(
      'holokey — vault convenience CLI (set/rotate once, resolve everywhere)\n\n' +
        '  gen-kek [id]        generate the bootstrap KEK (prints the Railway sealed vars to set)\n' +
        '  set <name> <value>  store/rotate a secret (encrypted at rest)\n' +
        '  get <name>          resolve a secret value\n' +
        '  list                list secret names (never values)\n\n' +
        'Env: HOLOKEY_PROD_KEK_CURRENT + HOLOKEY_PROD_KEK_<ID> (or SECRETS_VAULT_KEK_* for dev),\n' +
        '     DATABASE_URL (durable storage), HOLOKEY_OWNER (default "infra").'
    );
}
