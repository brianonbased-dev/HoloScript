/**
 * An empty key store must not be able to mint founders.
 *
 * On first boot with no keys.json, the registry seeded EVERY configured env key
 * as a founder: HOLOSCRIPT_API_KEY, HOLOMESH_API_KEY, COPILOT_HOLOMESH_KEY and
 * GEMINI_HOLOMESH_KEY. A founder bypasses both credit routes and every premium
 * gate, so a missing or unreadable store silently handed founder authority to
 * four separate shared keys.
 *
 * Founder is now granted only to the key value named by HOLOMESH_FOUNDER_KEY.
 * Every other configured key is still seeded, so nothing that authenticates
 * today stops authenticating — it simply stops being a founder.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set the temp data dir before importing state.ts so it picks up the override.
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'holomesh-founder-seed-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DIR;

const state = await import('../state');
const {
  _markSeededKeysFromEnv,
  _seedFounderKeysFromEnv,
  initStores,
  keyRegistry,
  SEEDABLE_KEY_ENV_VARS,
  FOUNDER_AGENT_ID,
  seededAgentIdFor,
} = state;

const HS_KEY = 'hs-key-value-for-seeding-test';
const HM_KEY = 'hm-key-value-for-seeding-test';
const COPILOT_KEY = 'copilot-key-value-for-seeding-test';
const GEMINI_KEY = 'gemini-key-value-for-seeding-test';

function clearSeedEnv(): void {
  for (const envVar of SEEDABLE_KEY_ENV_VARS) delete process.env[envVar];
  delete process.env.HOLOMESH_FOUNDER_KEY;
}

describe('first-boot key seeding', () => {
  beforeEach(() => {
    keyRegistry.clear();
    clearSeedEnv();
  });

  afterAll(() => {
    keyRegistry.clear();
    clearSeedEnv();
    rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  it('does not make a founder out of a configured env key', () => {
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.HOLOMESH_API_KEY = HM_KEY;
    process.env.COPILOT_HOLOMESH_KEY = COPILOT_KEY;

    _seedFounderKeysFromEnv();

    expect(keyRegistry.get(HS_KEY)?.isFounder).toBe(false);
    expect(keyRegistry.get(HM_KEY)?.isFounder).toBe(false);
    expect(keyRegistry.get(COPILOT_KEY)?.isFounder).toBe(false);
  });

  it('grants founder only to the key named by HOLOMESH_FOUNDER_KEY', () => {
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.HOLOMESH_API_KEY = HM_KEY;
    process.env.HOLOMESH_FOUNDER_KEY = HM_KEY;

    _seedFounderKeysFromEnv();

    expect(keyRegistry.get(HM_KEY)?.isFounder).toBe(true);
    expect(keyRegistry.get(HS_KEY)?.isFounder).toBe(false);
  });

  it('gives each seeded variable its own agent identity', () => {
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.COPILOT_HOLOMESH_KEY = COPILOT_KEY;
    process.env.GEMINI_HOLOMESH_KEY = GEMINI_KEY;

    _seedFounderKeysFromEnv();

    const ids = [HS_KEY, COPILOT_KEY, GEMINI_KEY].map((k) => keyRegistry.get(k)?.agentId);
    // Every seeded key used to carry agent_founder, so holding any one of them
    // proved the founder's identity and could mint a token stamped with it.
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain(FOUNDER_AGENT_ID);
    expect(keyRegistry.get(COPILOT_KEY)?.agentId).toBe(seededAgentIdFor('COPILOT_HOLOMESH_KEY'));
  });

  it('gives each seeded variable its own identity anchor', () => {
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.COPILOT_HOLOMESH_KEY = COPILOT_KEY;
    process.env.HOLOMESH_FOUNDER_KEY = HS_KEY;

    _seedFounderKeysFromEnv();

    // A shared wallet is the same collision one field over: callers are looked
    // up by wallet, so a sibling key would inherit the founder's agent record.
    expect(keyRegistry.get(COPILOT_KEY)?.walletAddress).not.toBe(
      keyRegistry.get(HS_KEY)?.walletAddress
    );
    expect(keyRegistry.get(HS_KEY)?.agentId).toBe(FOUNDER_AGENT_ID);
  });

  it('grants no founder when HOLOMESH_FOUNDER_KEY names a key that was not seeded', () => {
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.HOLOMESH_FOUNDER_KEY = 'a-key-value-that-is-configured-nowhere';

    _seedFounderKeysFromEnv();

    expect(keyRegistry.get(HS_KEY)?.isFounder).toBe(false);
    expect([...keyRegistry.values()].some((r) => r.isFounder)).toBe(false);
  });

  it('still seeds every configured key so live callers keep authenticating', () => {
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.HOLOMESH_API_KEY = HM_KEY;
    process.env.COPILOT_HOLOMESH_KEY = COPILOT_KEY;
    process.env.HOLOMESH_FOUNDER_KEY = HS_KEY;

    _seedFounderKeysFromEnv();

    expect(keyRegistry.has(HS_KEY)).toBe(true);
    expect(keyRegistry.has(HM_KEY)).toBe(true);
    expect(keyRegistry.has(COPILOT_KEY)).toBe(true);
    // The designated founder keeps full authority.
    expect(keyRegistry.get(HS_KEY)?.isFounder).toBe(true);
    expect(keyRegistry.get(HS_KEY)?.scopes).toContain('*');
  });

  it('seeds one record per distinct key value', () => {
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.HOLOMESH_API_KEY = HS_KEY;

    _seedFounderKeysFromEnv();

    expect(keyRegistry.size).toBe(1);
  });

  it('does nothing when no key env var is configured', () => {
    _seedFounderKeysFromEnv();
    expect(keyRegistry.size).toBe(0);
  });
});

/**
 * Provenance has to be stamped on the RECORD, because the value stops matching.
 *
 * "Is this a shared key" was answered by comparing the presented value against
 * the env vars. Rotation issues a brand new value, so after one rotation no env
 * var equals it and that comparison can never fire again — the shared secret
 * quietly became a key that proves one agent's identity. Marking at load is
 * what gives the stores that predate the marker — every server already running
 * — a provenance that survives rotation.
 */
describe('marking stored keys with their provenance', () => {
  beforeEach(() => {
    keyRegistry.clear();
    clearSeedEnv();
  });

  /** A record as it was written before `seededFromEnv` existed. */
  function storeUnmarked(key: string, agentId: string): void {
    keyRegistry.set(key, {
      key,
      walletAddress: `0x${'3'.repeat(40)}`,
      agentId,
      agentName: agentId,
      scopes: ['*'],
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      rotationCount: 0,
      lastRotatedAt: null,
      isFounder: false,
    });
  }

  it('marks a stored record whose value is still a configured env secret', () => {
    storeUnmarked(HS_KEY, seededAgentIdFor('HOLOSCRIPT_API_KEY'));
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    expect(keyRegistry.get(HS_KEY)?.seededFromEnv).toBeUndefined();

    expect(_markSeededKeysFromEnv()).toBe(1);

    expect(keyRegistry.get(HS_KEY)?.seededFromEnv).toBe('HOLOSCRIPT_API_KEY');
  });

  it('leaves a provisioned per-agent key unmarked', () => {
    // The refusal must not spread: marking this would lock a real agent out of
    // its own identity.
    storeUnmarked('hs_sk_provisioned_for_one_agent', 'agent_owner');
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;

    expect(_markSeededKeysFromEnv()).toBe(0);
    expect(keyRegistry.get('hs_sk_provisioned_for_one_agent')?.seededFromEnv).toBeUndefined();
  });

  it('marks every configured variable, not just the first', () => {
    storeUnmarked(HS_KEY, seededAgentIdFor('HOLOSCRIPT_API_KEY'));
    storeUnmarked(GEMINI_KEY, seededAgentIdFor('GEMINI_HOLOMESH_KEY'));
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;
    process.env.GEMINI_HOLOMESH_KEY = GEMINI_KEY;

    expect(_markSeededKeysFromEnv()).toBe(2);
    expect(keyRegistry.get(GEMINI_KEY)?.seededFromEnv).toBe('GEMINI_HOLOMESH_KEY');
  });

  it('is idempotent — a second pass marks nothing', () => {
    storeUnmarked(HS_KEY, seededAgentIdFor('HOLOSCRIPT_API_KEY'));
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;

    expect(_markSeededKeysFromEnv()).toBe(1);
    expect(_markSeededKeysFromEnv()).toBe(0);
  });

  it('marks the founder record too, so founder authority is not an exemption', () => {
    // HOLOMESH_FOUNDER_KEY can only name a value one of the seedable variables
    // already holds, so the founder's env key IS a shared secret.
    storeUnmarked(HM_KEY, FOUNDER_AGENT_ID);
    process.env.HOLOMESH_API_KEY = HM_KEY;

    expect(_markSeededKeysFromEnv()).toBe(1);
    expect(keyRegistry.get(HM_KEY)?.seededFromEnv).toBe('HOLOMESH_API_KEY');
  });
});

/**
 * The backfill has to be WIRED, not merely callable.
 *
 * First boot writes the marker while seeding, so every store that already exists
 * depends entirely on the backfill running at load — that is the whole point of
 * it: "every server already running". The tests above call
 * `_markSeededKeysFromEnv` directly, which is exactly what a DELETED call site
 * would still pass. The property lives on one line inside `initStores`, and
 * nothing was watching that line, so the function could stay green while no
 * deployed store was ever marked and the rotation defence never engaged.
 *
 * These drive the real `initStores()` over a real keys.json instead.
 */
describe('the backfill runs when the server loads a store it already had', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    keyRegistry.clear();
    clearSeedEnv();
    // JSON path only. DATABASE_URL would send initStores at Postgres, which is
    // neither what this is about nor reachable from a unit test.
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  /** Write keys.json in exactly the shape `persistKeyRegistry` writes. */
  function writeStoredKeys(records: Record<string, unknown>[]): void {
    // An earlier block's afterAll removes the temp dir; recreate it so this
    // suite does not depend on file order.
    mkdirSync(TEMP_DIR, { recursive: true });
    writeFileSync(
      join(TEMP_DIR, 'keys.json'),
      JSON.stringify({ version: 1, keys: records, savedAt: new Date().toISOString() }),
      'utf-8'
    );
  }

  /** A stored record as it was written before `seededFromEnv` existed. */
  function storedRecord(key: string, agentId: string): Record<string, unknown> {
    return {
      key,
      walletAddress: `0x${'3'.repeat(40)}`,
      agentId,
      agentName: agentId,
      scopes: ['*'],
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      rotationCount: 0,
      lastRotatedAt: null,
      isFounder: false,
    };
  }

  it('stamps provenance at startup, not only when the function is called by hand', async () => {
    writeStoredKeys([storedRecord(HS_KEY, seededAgentIdFor('HOLOSCRIPT_API_KEY'))]);
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;

    await initStores();

    // Loaded rather than re-seeded (seeding only runs on an empty store), and
    // marked on the way in. Delete the call inside initStores and this fails.
    expect(keyRegistry.get(HS_KEY)?.seededFromEnv).toBe('HOLOSCRIPT_API_KEY');
  });

  it('leaves a provisioned per-agent record in the loaded store unmarked', async () => {
    // The refusal must not spread at startup either: marking this would lock a
    // real agent out of its own identity the moment the server restarted.
    const OWN_KEY = 'hs_sk_one_agents_own_key';
    writeStoredKeys([storedRecord(OWN_KEY, 'agent_owner')]);
    // Configured, but holding a different value than this record's.
    process.env.HOLOSCRIPT_API_KEY = HS_KEY;

    await initStores();

    expect(keyRegistry.get(OWN_KEY)?.seededFromEnv).toBeUndefined();
  });
});
