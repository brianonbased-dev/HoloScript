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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set the temp data dir before importing state.ts so it picks up the override.
const TEMP_DIR = mkdtempSync(join(tmpdir(), 'holomesh-founder-seed-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DIR;

const state = await import('../state');
const {
  _seedFounderKeysFromEnv,
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
