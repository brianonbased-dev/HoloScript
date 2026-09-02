#!/usr/bin/env node
/**
 * HoloKey Phase 0 proof — does the vault actually work, and does it fail closed?
 *
 * Runs entirely in a throwaway temp dir with a throwaway KEK generated in-process.
 * No key material is written to any real .env; nothing here touches the operator's
 * secrets. The point is to answer "is Phase 0 real?" with a run, not a grep — the
 * same mistake that produced a wrong 'never wired' claim earlier today.
 *
 * Six assertions:
 *   1  vault OFF when no KEK is configured           (the current laptop state)
 *   2  vault ON  with a KEK                          (turning it on works)
 *   3  put -> resolve round-trips the exact value    (it is a real store)
 *   4  the value is NOT on disk in plaintext         (it actually encrypts)
 *   5  resolve without an owner is DENIED            (fail-closed, not fail-open)
 *   6  NODE_ENV=production + dev KEK -> vault OFF    (the prod gate has teeth)
 */
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const { createHoloKeyVault } = await import('@holoscript/secrets-broker');

const dir = mkdtempSync(join(tmpdir(), 'holokey-proof-'));
const storePath = join(dir, 'vault.json');
const SECRET = `phase0-canary-${randomBytes(8).toString('hex')}`;
const OWNER = 'infra://mcp-server';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

try {
  // 1 — no KEK at all: this is exactly what the laptop looks like today.
  const off = createHoloKeyVault({ env: { HOLOKEY_STORE_PATH: storePath } });
  check('no KEK configured -> vault OFF (today\'s laptop state)', off === null);

  // 2 — production-grade KEK (the scoped HOLOKEY_PROD_* keyring): vault comes up.
  const kek = randomBytes(32).toString('base64');
  const prodEnv = {
    NODE_ENV: 'development',
    HOLOKEY_PROD_KEK_CURRENT: 'k1',
    HOLOKEY_PROD_KEK_K1: kek,
    HOLOKEY_STORE_PATH: storePath,
  };
  // DEV-ONLY KEK: deliberately NO HOLOKEY_PROD_* vars, so pickKek falls to the env
  // provider (productionGrade:false). An earlier version of this file set BOTH and
  // the prod-gate assertion passed without ever exercising the gate — the vault had
  // simply picked the production keyring. A control that cannot fail proves nothing.
  const devOnlyEnv = {
    NODE_ENV: 'development',
    SECRETS_VAULT_KEK_CURRENT: 'k1',
    SECRETS_VAULT_KEK_K1: kek,
    HOLOKEY_STORE_PATH: join(dir, 'vault-dev.json'),
  };
  const vault = createHoloKeyVault({ env: prodEnv });
  check('KEK configured -> vault ON', vault !== null, vault ? `kekGrade=${vault.kekGrade}, backend=${vault.backend}` : 'null');
  if (!vault) throw new Error('vault did not come up; remaining assertions are moot');

  // 3 — a real store: put then resolve returns the same bytes.
  await vault.store.put({ ownerId: OWNER, name: 'PHASE0_CANARY', value: SECRET });
  const got = await vault.resolver.resolve({
    ref: 'vault:PHASE0_CANARY',
    authenticatedOwnerId: OWNER,
    purpose: 'phase0-proof',
  });
  const value = typeof got === 'string' ? got : got?.value;
  check('put -> resolve round-trips the exact value', value === SECRET);

  // 4 — the whole point: the value must not be readable on disk.
  const onDisk = existsSync(storePath) ? readFileSync(storePath, 'utf8') : '';
  check('secret is NOT stored in plaintext on disk', onDisk.length > 0 && !onDisk.includes(SECRET),
        `store ${onDisk.length} bytes, plaintext hit=${onDisk.includes(SECRET)}`);

  // 5 — fail-closed: no authenticated owner must be a denial, never a value.
  let denied = false, leaked = false;
  try {
    const r = await vault.resolver.resolve({ ref: 'vault:PHASE0_CANARY', purpose: 'no-owner' });
    leaked = (typeof r === 'string' ? r : r?.value) === SECRET;
  } catch { denied = true; }
  check('resolve without an owner is DENIED (fail-closed)', denied && !leaked,
        leaked ? 'LEAKED THE VALUE' : 'threw as required');

  // 6a — the control must be able to succeed: a dev-only KEK OUTSIDE production works.
  const devVault = createHoloKeyVault({ env: devOnlyEnv });
  check('dev-only KEK, NODE_ENV=development -> vault ON at dev grade',
        devVault !== null && devVault.kekGrade === 'dev',
        devVault ? `kekGrade=${devVault.kekGrade}` : 'null (control cannot fire)');

  // 6b — and the gate must refuse that exact KEK once NODE_ENV says production.
  const prodWithDevKek = createHoloKeyVault({ env: { ...devOnlyEnv, NODE_ENV: 'production' } });
  check('SAME dev KEK + NODE_ENV=production -> REFUSED (prod gate has teeth)',
        prodWithDevKek === null,
        prodWithDevKek ? `LEAK: vault came up at kekGrade=${prodWithDevKek.kekGrade}` : 'vault OFF as required');

  // Bonus: the audit chain should have sealed both the allow and the deny.
  const chain = vault.receipts?.chain?.() ?? [];
  const verified = vault.receipts?.verify?.();
  console.log(`\n  audit chain: ${chain.length} sealed receipt(s), verify()=${JSON.stringify(verified)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${fail === 0 ? 'PHASE 0 VERIFIED' : 'PHASE 0 HAS A HOLE'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
