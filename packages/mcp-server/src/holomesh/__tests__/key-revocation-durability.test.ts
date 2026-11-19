/**
 * Revocation has to survive a restart, and founder authority belongs to the
 * configured founder key only.
 *
 * keys.json is append-only, so dropping a key from memory alone let it load
 * again on the next start. These drive the real persistKeyRegistry() and
 * initStores() over a temp data dir to simulate that restart.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMP_DIR = mkdtempSync(join(tmpdir(), 'holomesh-key-revocation-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DIR;

const state = await import('../state');
const {
  keyRegistry,
  agentKeyStore,
  walletToAgent,
  initStores,
  persistKeyRegistry,
  persistAgentStore,
  revokeKeyRecord,
  isKeyRevoked,
  keyIdOf,
  findKeyRecordById,
  isDefounderDryRun,
  _restrictFounderFlag,
  _resetKeyRevocationsForTests,
  SEEDABLE_KEY_ENV_VARS,
} = state;
import type { KeyRecord } from '../types';

const FOUNDER_VALUE = 'configured-founder-value-for-test';
const OTHER_FLAGGED = 'other-founder-flagged-value-for-test';
const PLAIN = 'plain-agent-value-for-test';

function record(key: string, agentId: string, isFounder = false): KeyRecord {
  return {
    key,
    walletAddress: `0x${agentId.length.toString(16).padStart(40, '0')}`,
    agentId,
    agentName: agentId,
    scopes: ['holomesh'],
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder,
  };
}

/** Simulate a process restart: forget all in-memory state, then load from disk. */
async function restart(): Promise<void> {
  keyRegistry.clear();
  agentKeyStore.clear();
  walletToAgent.clear();
  _resetKeyRevocationsForTests();
  await initStores();
}

function wipeDisk(): void {
  rmSync(TEMP_DIR, { recursive: true, force: true });
  mkdirSync(TEMP_DIR, { recursive: true });
}

const savedDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.HOLOMESH_FOUNDER_KEY;
  delete process.env.HOLOMESH_DEFOUNDER_DRY_RUN;
  for (const v of SEEDABLE_KEY_ENV_VARS) delete process.env[v];
  keyRegistry.clear();
  agentKeyStore.clear();
  walletToAgent.clear();
  _resetKeyRevocationsForTests();
  wipeDisk();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
  delete process.env.HOLOMESH_FOUNDER_KEY;
  delete process.env.HOLOMESH_DEFOUNDER_DRY_RUN;
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe('durable revocation', () => {
  it('a revoked key stays revoked across a restart', async () => {
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    keyRegistry.set('kept-value-for-test', record('kept-value-for-test', 'agent_kept'));
    persistKeyRegistry();

    revokeKeyRecord(PLAIN);
    persistKeyRegistry();
    await restart();

    expect(keyRegistry.has(PLAIN)).toBe(false);
    expect(keyRegistry.has('kept-value-for-test')).toBe(true);
    // The record is kept on disk for audit, marked revoked.
    const stored = JSON.parse(readFileSync(join(TEMP_DIR, 'keys.json'), 'utf-8'));
    const kept = stored.keys.find((r: KeyRecord) => r.agentId === 'agent_plain');
    expect(typeof kept.revokedAt).toBe('string');
  });

  it('stays revoked through a second restart and a later persist', async () => {
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    persistKeyRegistry();
    revokeKeyRecord(PLAIN);
    persistKeyRegistry();
    await restart();
    keyRegistry.set('new-value-for-test', record('new-value-for-test', 'agent_new'));
    persistKeyRegistry();
    await restart();

    expect(keyRegistry.has(PLAIN)).toBe(false);
    expect(keyRegistry.has('new-value-for-test')).toBe(true);
  });

  it('does not reload the revoked key from the agent store either', async () => {
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    agentKeyStore.set(PLAIN, {
      id: 'agent_plain',
      apiKey: PLAIN,
      name: 'agent_plain',
      traits: [],
      reputation: 0,
      createdAt: new Date().toISOString(),
    });
    persistKeyRegistry();
    persistAgentStore();
    // Revoke the registry record but leave a stale agents.json row behind.
    revokeKeyRecord(PLAIN);
    persistKeyRegistry();
    await restart();

    expect(agentKeyStore.has(PLAIN)).toBe(false);
  });

  it('an env seed cannot bring a revoked key back when keys.json is missing', async () => {
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    persistKeyRegistry();
    revokeKeyRecord(PLAIN);
    persistKeyRegistry();
    rmSync(join(TEMP_DIR, 'keys.json'));

    process.env.HOLOSCRIPT_API_KEY = PLAIN;
    process.env.HOLOMESH_API_KEY = 'unrevoked-seed-value-for-test';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await restart();

    expect(keyRegistry.has(PLAIN)).toBe(false);
    expect(keyRegistry.has('unrevoked-seed-value-for-test')).toBe(true);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('Not seeding HOLOSCRIPT_API_KEY'))
    ).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PLAIN);
  });

  it('an env seed cannot bring a revoked key back when keys.json is unreadable', async () => {
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    persistKeyRegistry();
    revokeKeyRecord(PLAIN);
    persistKeyRegistry();
    // Corrupt keys.json: readJSON returns null, so the seed path runs.
    rmSync(join(TEMP_DIR, 'keys.json'));
    mkdirSync(join(TEMP_DIR, 'keys.json'));

    process.env.GEMINI_HOLOMESH_KEY = PLAIN;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await restart();

    expect(keyRegistry.has(PLAIN)).toBe(false);
  });

  it('writes no key value into the revocation file', () => {
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    persistKeyRegistry();
    revokeKeyRecord(PLAIN);
    persistKeyRegistry();

    const path = join(TEMP_DIR, 'revoked-keys.json');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf-8')).not.toContain(PLAIN);
    expect(isKeyRevoked(PLAIN)).toBe(true);
    expect(isKeyRevoked('kept-value-for-test')).toBe(false);
  });

  it('gives every persisted record a stable key id', async () => {
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    persistKeyRegistry();
    const id = keyIdOf(keyRegistry.get(PLAIN)!);
    expect(id).toMatch(/^key_[0-9a-f]{32}$/);
    expect(id).not.toContain(PLAIN);

    await restart();
    expect(findKeyRecordById(id)?.key).toBe(PLAIN);
  });
});

describe('founder flag restricted to the configured founder key', () => {
  function seedFlagged(): void {
    keyRegistry.set(FOUNDER_VALUE, record(FOUNDER_VALUE, 'agent_configured', true));
    keyRegistry.set(OTHER_FLAGGED, record(OTHER_FLAGGED, 'agent_other_flagged', true));
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
  }

  it('defaults to dry run', () => {
    expect(isDefounderDryRun()).toBe(true);
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '1';
    expect(isDefounderDryRun()).toBe(true);
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
    expect(isDefounderDryRun()).toBe(false);
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = 'false';
    expect(isDefounderDryRun()).toBe(false);
  });

  it('dry run only reports what it would demote, by record id', () => {
    process.env.HOLOMESH_FOUNDER_KEY = FOUNDER_VALUE;
    seedFlagged();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = _restrictFounderFlag();

    expect(result).toEqual({ demoted: ['agent_other_flagged'], dryRun: true });
    expect(keyRegistry.get(OTHER_FLAGGED)?.isFounder).toBe(true);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain(
      '[KeyRegistry] Founder flag: would demote key record agent_other_flagged (dry run).'
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(OTHER_FLAGGED);
    expect(logged).not.toContain(FOUNDER_VALUE);
  });

  it('when enforced, demotes every other founder-flagged record and keeps the configured one', async () => {
    process.env.HOLOMESH_FOUNDER_KEY = FOUNDER_VALUE;
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
    seedFlagged();
    persistKeyRegistry();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await restart();

    expect(keyRegistry.get(FOUNDER_VALUE)?.isFounder).toBe(true);
    expect(keyRegistry.get(OTHER_FLAGGED)?.isFounder).toBe(false);
    expect(keyRegistry.get(PLAIN)?.isFounder).toBe(false);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain(
      '[KeyRegistry] Founder flag: demoted key record agent_other_flagged.'
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(OTHER_FLAGGED);

    // The demotion is persisted: a dry-run restart afterwards finds nothing to do.
    delete process.env.HOLOMESH_DEFOUNDER_DRY_RUN;
    await restart();
    expect(keyRegistry.get(OTHER_FLAGGED)?.isFounder).toBe(false);
    expect(_restrictFounderFlag().demoted).toEqual([]);
  });

  it('demotes founder-flagged agent records too', () => {
    process.env.HOLOMESH_FOUNDER_KEY = FOUNDER_VALUE;
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    keyRegistry.set(FOUNDER_VALUE, record(FOUNDER_VALUE, 'agent_configured', true));
    agentKeyStore.set(OTHER_FLAGGED, {
      id: 'agent_legacy_flagged',
      apiKey: OTHER_FLAGGED,
      name: 'legacy',
      traits: [],
      reputation: 0,
      isFounder: true,
      createdAt: new Date().toISOString(),
    });

    const result = _restrictFounderFlag();

    expect(result.demoted).toEqual(['agent_legacy_flagged']);
    expect(agentKeyStore.get(OTHER_FLAGGED)?.isFounder).toBe(false);
  });

  it('with no founder key configured, demotes no one and logs an error', () => {
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedFlagged();

    const result = _restrictFounderFlag();

    expect(result.demoted).toEqual([]);
    expect(result.skipped).toMatch(/not set/);
    expect(keyRegistry.get(FOUNDER_VALUE)?.isFounder).toBe(true);
    expect(keyRegistry.get(OTHER_FLAGGED)?.isFounder).toBe(true);
    expect(error.mock.calls.some((c) => String(c[0]).includes('demoting no one'))).toBe(true);
  });

  it('when the founder key matches no live founder record, demotes no one', () => {
    process.env.HOLOMESH_FOUNDER_KEY = 'value-no-record-holds-for-test';
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedFlagged();

    const result = _restrictFounderFlag();

    expect(result.demoted).toEqual([]);
    expect(keyRegistry.get(OTHER_FLAGGED)?.isFounder).toBe(true);
    expect(JSON.stringify(error.mock.calls)).not.toContain('value-no-record-holds-for-test');
  });

  it('a rotated founder survives an enforced restart before the env var is updated', async () => {
    const ROTATED = 'rotated-founder-value-for-test';
    process.env.HOLOMESH_FOUNDER_KEY = FOUNDER_VALUE;
    seedFlagged();
    persistKeyRegistry();

    // What admin/rotate-key does: new record inherits the flag, old value revoked.
    const old = keyRegistry.get(FOUNDER_VALUE)!;
    revokeKeyRecord(FOUNDER_VALUE);
    keyRegistry.set(ROTATED, { ...old, key: ROTATED, keyId: undefined, rotationCount: 1 });
    persistKeyRegistry();

    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await restart();

    // HOLOMESH_FOUNDER_KEY still names the revoked value: nobody is demoted.
    expect(keyRegistry.has(FOUNDER_VALUE)).toBe(false);
    expect(keyRegistry.get(ROTATED)?.isFounder).toBe(true);
    expect([...keyRegistry.values()].filter((r) => r.isFounder).length).toBeGreaterThan(0);

    // Once the env var names the new value, enforcement narrows to it.
    process.env.HOLOMESH_FOUNDER_KEY = ROTATED;
    await restart();
    expect(keyRegistry.get(ROTATED)?.isFounder).toBe(true);
    expect(keyRegistry.get(OTHER_FLAGGED)?.isFounder).toBe(false);
  });
});

describe('persistence failures are reported', () => {
  it('persistKeyRegistry returns false when the revocation file cannot be written', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    keyRegistry.set(PLAIN, record(PLAIN, 'agent_plain'));
    expect(persistKeyRegistry()).toBe(true);
    // A directory where the file should be: the write fails even for root.
    mkdirSync(join(TEMP_DIR, 'revoked-keys.json', 'blocker'), { recursive: true });

    revokeKeyRecord(PLAIN);

    expect(persistKeyRegistry()).toBe(false);
  });

  it('logs loudly at boot when HOLOMESH_DATA_DIR is unset', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.HOLOMESH_DATA_DIR;
    try {
      await restart();
    } finally {
      process.env.HOLOMESH_DATA_DIR = TEMP_DIR;
    }
    expect(
      error.mock.calls.some((c) => String(c[0]).includes('HOLOMESH_DATA_DIR is not set'))
    ).toBe(true);
  });
});
