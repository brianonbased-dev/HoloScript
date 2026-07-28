import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, it, expect, vi } from 'vitest';
import { generateKekBase64, kekEnvVar, KEK_CURRENT_ENV } from '../env-kek-provider';
import { HOLOKEY_STORE_PATH_ENV } from '../file-secret-backend';
import { createHoloKeyVault } from '../vault-bootstrap';
import type { SecretResolveAudit } from '../secret-resolver';
import type { SecretResolveReceipt } from '../resolve-receipt';

const tempRoots: string[] = [];

/** A working dev env-KEK env block (the bootstrap secret, for tests). */
function devKekEnv(
  extra: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const kekId = 'k1';
  return { [KEK_CURRENT_ENV]: kekId, [kekEnvVar(kekId)]: generateKekBase64(), ...extra };
}

async function tempStorePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'holokey-vault-bootstrap-'));
  tempRoots.push(root);
  return join(root, 'secret-store.json');
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('createHoloKeyVault — Phase 0: turn the vault on', () => {
  it('returns null when no KEK is configured (flag-gate OFF — wiring it into a boot cannot break the boot)', () => {
    expect(createHoloKeyVault({ env: {} })).toBeNull();
  });

  it('turns on with a dev env-KEK and round-trips put -> get -> resolve (encrypted at rest)', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) });
    expect(vault).not.toBeNull();
    expect(vault!.backend).toBe('in-memory');
    expect(vault!.kekGrade).toBe('dev');

    const owner = 'service:mcp-server';
    const { ref, version } = await vault!.store.put({
      ownerId: owner,
      name: 'OPENAI_API_KEY',
      value: 'sk-test-abc123',
    });
    expect(ref).toBe('vault:OPENAI_API_KEY');
    expect(version).toBe(1);

    // The trusted server-side resolve path returns the plaintext for the owner.
    const resolved = await vault!.resolver.resolve({ authenticatedOwnerId: owner, ref });
    expect(resolved.value).toBe('sk-test-abc123');

    // The raw store get is owner-isolated and returns the same value.
    const got = await vault!.store.get({ ownerId: owner, ref });
    expect(got.value).toBe('sk-test-abc123');
  });

  it("owner-isolation: a different owner cannot resolve another owner's secret", async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) })!;
    const { ref } = await vault.store.put({ ownerId: 'service:a', name: 'K', value: 'v' });
    await expect(
      vault.resolver.resolve({ authenticatedOwnerId: 'service:b', ref })
    ).rejects.toThrow();
  });

  it('fail-closed: a resolve with no authenticated owner is denied (never returns a value)', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) })!;
    await expect(
      vault.resolver.resolve({ authenticatedOwnerId: '', ref: 'vault:anything' })
    ).rejects.toThrow();
  });

  it('uses the URL-free file backend when HOLOKEY_STORE_PATH is configured', async () => {
    const filePath = await tempStorePath();
    const env = devKekEnv({ NODE_ENV: 'test', [HOLOKEY_STORE_PATH_ENV]: filePath });

    const first = createHoloKeyVault({ env })!;
    expect(first.backend).toBe('file');
    await first.store.put({ ownerId: 'infra', name: 'HOLOSCRIPT_API_KEY', value: 'stored' });

    const second = createHoloKeyVault({ env })!;
    expect(second.backend).toBe('file');
    const resolved = await second.resolver.resolve({
      authenticatedOwnerId: 'infra',
      ref: 'vault:HOLOSCRIPT_API_KEY',
    });
    expect(resolved.value).toBe('stored');
  });

  it('prod gate: a dev KEK under NODE_ENV=production stays OFF (returns null, never throws)', () => {
    // requireProductionGradeKek rejects the env KEK; the bootstrap catches it and returns null
    // so a production boot keeps its prior (vault-off) behavior instead of crashing.
    expect(createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'production' }) })).toBeNull();
  });
});

describe('createHoloKeyVault — resolve-receipt chain (the emit → seal → persist wire)', () => {
  const owner = 'service:mcp-server';

  /** Put a secret, then drive one allowed + two denied resolves through the vault. */
  async function driveResolves(vault: NonNullable<ReturnType<typeof createHoloKeyVault>>) {
    const { ref } = await vault.store.put({
      ownerId: owner,
      name: 'OPENAI_API_KEY',
      value: 'sk-test-abc123',
    });
    await vault.resolver.resolve({ authenticatedOwnerId: owner, ref }); // allowed
    await vault.resolver.resolve({ authenticatedOwnerId: 'service:other', ref }).catch(() => {}); // denied (owner mismatch)
    await vault.resolver.resolve({ authenticatedOwnerId: '', ref: 'vault:X' }).catch(() => {}); // denied (no auth)
    return ref;
  }

  it('seals EVERY resolve attempt (allowed + denied) onto a tamper-evident chain exposed as vault.receipts', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) })!;
    expect(vault.receipts.size()).toBe(0); // nothing resolved yet
    await driveResolves(vault);

    expect(vault.receipts.size()).toBe(3);
    expect(vault.receipts.chain().map((r) => r.outcome)).toEqual(['allowed', 'denied', 'denied']);
    expect(vault.receipts.verify()).toEqual({ ok: true, brokenAt: null });
    expect(vault.receipts.head()).toBe(vault.receipts.chain()[2].receiptHash);
  });

  it('the sealed log is tamper-evident: editing a recorded outcome breaks verification', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) })!;
    await driveResolves(vault);
    // Take the sealed chain and forge the allowed→denied flip an attacker would want hidden.
    const forged: SecretResolveReceipt[] = vault.receipts
      .chain()
      .map((r, i) => (i === 0 ? { ...r, outcome: 'denied' as const } : r));
    // verify() on the live sink is still ok (its internal array is untouched)...
    expect(vault.receipts.verify().ok).toBe(true);
    // ...but the chain fields self-attest: recomputing the forged copy pinpoints the edit.
    const { verifyResolveReceiptChain } = await import('../resolve-receipt');
    expect(verifyResolveReceiptChain(forged)).toEqual({ ok: false, brokenAt: 0 });
  });

  it('composes with a caller-supplied audit — BOTH the caller sink and the receipt chain see every attempt', async () => {
    const callerSeen: SecretResolveAudit[] = [];
    const vault = createHoloKeyVault({
      env: devKekEnv({ NODE_ENV: 'test' }),
      audit: (e) => callerSeen.push(e),
    })!;
    await driveResolves(vault);
    expect(callerSeen).toHaveLength(3); // the caller's own audit still fires...
    expect(vault.receipts.size()).toBe(3); // ...and the receipts are sealed too
  });

  it('persistReceipts receives each sealed receipt for a durable audit trail', async () => {
    const persisted: SecretResolveReceipt[] = [];
    const persistReceipts = vi.fn((r: SecretResolveReceipt) => void persisted.push(r));
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }), persistReceipts })!;
    await driveResolves(vault);
    expect(persistReceipts).toHaveBeenCalledTimes(3);
    expect(persisted.map((r) => r.outcome)).toEqual(['allowed', 'denied', 'denied']);
    expect(persisted[0].receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('receipts carry ZERO secret material — the plaintext value never appears in the sealed log', async () => {
    const vault = createHoloKeyVault({ env: devKekEnv({ NODE_ENV: 'test' }) })!;
    await driveResolves(vault);
    expect(JSON.stringify(vault.receipts.chain())).not.toContain('sk-test-abc123');
  });
});
