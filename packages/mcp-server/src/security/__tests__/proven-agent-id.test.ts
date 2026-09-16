/**
 * The verifier the whole agent_id binding rests on.
 *
 * Every oauth test passes `provenAgentId` in as a parameter, so the grants were
 * covered while the thing that DECIDES that value had no test at all. The proof
 * could have been rewritten to trust a caller-supplied header and all 24 oauth
 * tests would still pass. These tests exercise the resolver itself.
 *
 * What must hold:
 *   - a live registry key resolves to exactly the agent it was issued to;
 *   - an expired key proves nothing;
 *   - an unknown key proves nothing (undefined, never a default identity);
 *   - the SHARED legacy key header cannot be upgraded into a proven identity.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the store at a temp dir before importing state, so importing it cannot
// touch the real data directory.
process.env.HOLOMESH_DATA_DIR = mkdtempSync(join(tmpdir(), 'proven-agent-id-'));

const { agentKeyStore, keyRegistry, SEEDABLE_KEY_ENV_VARS } = await import('../../holomesh/state');
const { agentBindingForRegistration, resolveProvenAgentId } = await import('../proven-agent-id');

const LIVE_KEY = 'live-key-owned-by-one-agent';
const EXPIRED_KEY = 'expired-key-value';
const SHARED_LEGACY_KEY = 'shared-legacy-key-every-caller-holds';

function seedKey(key: string, agentId: string, expiresAt?: string): void {
  keyRegistry.set(key, {
    key,
    walletAddress: `0x${'1'.repeat(40)}`,
    agentId,
    agentName: agentId,
    scopes: ['*'],
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: false,
    ...(expiresAt ? { expiresAt } : {}),
  });
}

describe('resolveProvenAgentId', () => {
  beforeEach(() => {
    keyRegistry.clear();
  });

  it('resolves a registry-seeded key to the agent it was issued to', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    expect(resolveProvenAgentId({ 'x-agent-key': LIVE_KEY })).toBe('agent_owner');
    expect(resolveProvenAgentId({ 'x-mcp-api-key': LIVE_KEY })).toBe('agent_owner');
    expect(resolveProvenAgentId({ authorization: `Bearer ${LIVE_KEY}` })).toBe('agent_owner');
  });

  it('proves nothing with an expired key', () => {
    seedKey(EXPIRED_KEY, 'agent_owner', new Date(Date.now() - 60_000).toISOString());

    expect(resolveProvenAgentId({ 'x-agent-key': EXPIRED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-mcp-api-key': EXPIRED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: `Bearer ${EXPIRED_KEY}` })).toBeUndefined();
  });

  it('still honours a key whose expiry is in the future', () => {
    seedKey(LIVE_KEY, 'agent_owner', new Date(Date.now() + 60_000).toISOString());

    expect(resolveProvenAgentId({ 'x-agent-key': LIVE_KEY })).toBe('agent_owner');
  });

  it('returns undefined for an unknown key rather than any default identity', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    expect(resolveProvenAgentId({ 'x-agent-key': 'never-issued' })).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-mcp-api-key': 'never-issued' })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: 'Bearer never-issued' })).toBeUndefined();
  });

  it('returns undefined when the request presents no key at all', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    expect(resolveProvenAgentId({})).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-agent-key': '   ' })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: 'Basic abc' })).toBeUndefined();
  });

  it('refuses to upgrade the shared legacy x-api-key into a proven identity', () => {
    // HOLOSCRIPT_API_KEY is both the shared legacy key AND a seeded registry
    // key, so honouring x-api-key here would let every holder of the common
    // key speak as whatever agent that record names.
    seedKey(SHARED_LEGACY_KEY, 'agent_env_holoscript_api_key');

    expect(resolveProvenAgentId({ 'x-api-key': SHARED_LEGACY_KEY })).toBeUndefined();
  });

  it('ignores a repeated header rather than trusting the second copy', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    // Node hands duplicated headers over as an array; only the first is read.
    expect(resolveProvenAgentId({ 'x-agent-key': ['never-issued', LIVE_KEY] })).toBeUndefined();
  });
});

const { generateKeyPairSync, sign: signPayload } = await import('node:crypto');

const SEEDED_KEY = 'shared-env-key-every-configured-caller-holds';

/** A record as first-boot seeding writes it: shared value, marked as seeded. */
function seedSharedEnvKey(key: string, envVar: string, marked = true): void {
  keyRegistry.set(key, {
    key,
    walletAddress: `0x${'2'.repeat(40)}`,
    agentId: `agent_env_${envVar.toLowerCase()}`,
    agentName: `env:${envVar}`,
    scopes: ['*'],
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: false,
    ...(marked ? { seededFromEnv: envVar } : {}),
  });
}

function withEnv(envVar: string, value: string, run: () => void): void {
  const before = process.env[envVar];
  process.env[envVar] = value;
  try {
    run();
  } finally {
    if (before === undefined) delete process.env[envVar];
    else process.env[envVar] = before;
  }
}

/**
 * The refusal must be a property of the KEY, not of one header's name.
 *
 * Refusing only `x-api-key` left the SAME shared value working under
 * `x-mcp-api-key` and under `Bearer`. "The shared key cannot be upgraded into a
 * proven identity" was therefore true of one spelling and false of two — a
 * property enforced per header name is not the property, only a silhouette.
 */
describe('a shared env-seeded key proves nothing, under any header', () => {
  beforeEach(() => {
    keyRegistry.clear();
    agentKeyStore.clear();
  });

  it('is refused on every header that carries a per-agent key', () => {
    seedSharedEnvKey(SEEDED_KEY, 'HOLOSCRIPT_API_KEY');

    expect(resolveProvenAgentId({ 'x-api-key': SEEDED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-mcp-api-key': SEEDED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-agent-key': SEEDED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: `Bearer ${SEEDED_KEY}` })).toBeUndefined();
  });

  it('is refused even when the record predates the marker, by matching the env value', () => {
    // Every server already running was seeded before `seededFromEnv` existed,
    // so its records carry no marker. Re-seeding does not run once keys.json
    // has keys, which would leave those stores unprotected by a marker-only
    // check. The key VALUE is still the shared secret, so compare that too.
    seedSharedEnvKey(SEEDED_KEY, 'HOLOSCRIPT_API_KEY', false);
    expect(keyRegistry.get(SEEDED_KEY)?.seededFromEnv).toBeUndefined();

    withEnv('HOLOSCRIPT_API_KEY', SEEDED_KEY, () => {
      expect(resolveProvenAgentId({ 'x-mcp-api-key': SEEDED_KEY })).toBeUndefined();
      expect(resolveProvenAgentId({ authorization: `Bearer ${SEEDED_KEY}` })).toBeUndefined();
    });
  });

  it('cannot be used to bind an agent_id at registration either', () => {
    seedSharedEnvKey(SEEDED_KEY, 'HOLOMESH_API_KEY');

    const binding = agentBindingForRegistration({
      requestedAgentId: 'agent_env_holomesh_api_key',
      registrarAgentId: resolveProvenAgentId({ 'x-mcp-api-key': SEEDED_KEY }),
    });

    expect(binding.ok).toBe(false);
  });

  it('still lets a per-agent key prove its own identity', () => {
    // The refusal must not spread: a provisioned key is not a shared secret.
    seedSharedEnvKey(SEEDED_KEY, 'HOLOSCRIPT_API_KEY');
    seedKey(LIVE_KEY, 'agent_owner');

    expect(resolveProvenAgentId({ 'x-mcp-api-key': LIVE_KEY })).toBe('agent_owner');
  });

  it('refuses a seeded key whose value is configured under any seedable variable', () => {
    for (const envVar of SEEDABLE_KEY_ENV_VARS) {
      keyRegistry.clear();
      seedSharedEnvKey(SEEDED_KEY, envVar, false);
      withEnv(envVar, SEEDED_KEY, () => {
        expect(resolveProvenAgentId({ 'x-agent-key': SEEDED_KEY })).toBeUndefined();
      });
    }
  });
});

/**
 * The canonical resolver accepts three proofs; so must this one.
 *
 * Consulting only the key registry meant an agent the rest of the server
 * authenticates normally — by platform-signed manifest, or by a key predating
 * the registry — got a hard throw at registration on a field `main` ignored.
 * A door that fails closed on a legitimate caller is still a broken door.
 */
describe('every proof the canonical resolver accepts', () => {
  beforeEach(() => {
    keyRegistry.clear();
    agentKeyStore.clear();
  });

  it('honours a platform-signed manifest', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const spki = publicKey.export({ format: 'der', type: 'spki' });
    const manifest = {
      id: 'agent_manifest_owner',
      name: 'Manifest Owner',
      walletAddress: `0x${'a'.repeat(40)}`,
      capabilities: ['read'],
    };
    const payload = JSON.stringify({
      id: manifest.id,
      name: manifest.name,
      walletAddress: manifest.walletAddress,
      capabilities: manifest.capabilities,
    });
    const signature = signPayload(null, Buffer.from(payload), privateKey).toString('base64');

    withEnv('HOLOSCRIPT_PLATFORM_PUBLIC_KEY', Buffer.from(spki).toString('base64'), () => {
      const proven = resolveProvenAgentId({
        'x-agent-manifest': Buffer.from(JSON.stringify(manifest)).toString('base64'),
        'x-agent-manifest-sig': signature,
      });
      expect(proven).toBe('agent_manifest_owner');
    });
  });

  it('refuses a manifest whose signature does not verify', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const other = generateKeyPairSync('ed25519');
    const manifest = {
      id: 'agent_manifest_forged',
      name: 'Forged',
      walletAddress: `0x${'b'.repeat(40)}`,
      capabilities: ['read'],
    };
    const payload = JSON.stringify({
      id: manifest.id,
      name: manifest.name,
      walletAddress: manifest.walletAddress,
      capabilities: manifest.capabilities,
    });
    // Signed by a key that is NOT the configured platform key.
    const signature = signPayload(null, Buffer.from(payload), other.privateKey).toString('base64');

    withEnv(
      'HOLOSCRIPT_PLATFORM_PUBLIC_KEY',
      Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).toString('base64'),
      () => {
        const proven = resolveProvenAgentId({
          'x-agent-manifest': Buffer.from(JSON.stringify(manifest)).toString('base64'),
          'x-agent-manifest-sig': signature,
        });
        expect(proven).toBeUndefined();
      }
    );
  });

  it('honours a legacy per-agent key from the agent key store', () => {
    const LEGACY_KEY = 'legacy-per-agent-key-predating-the-registry';
    agentKeyStore.set(LEGACY_KEY, {
      id: 'agent_legacy',
      apiKey: LEGACY_KEY,
      walletAddress: `0x${'c'.repeat(40)}`,
      name: 'legacy-agent',
      traits: [],
      reputation: 0,
      isFounder: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    });

    expect(resolveProvenAgentId({ 'x-mcp-api-key': LEGACY_KEY })).toBe('agent_legacy');
    expect(resolveProvenAgentId({ authorization: `Bearer ${LEGACY_KEY}` })).toBe('agent_legacy');
  });

  it('prefers the registry record when a key appears in both stores', () => {
    seedKey(LIVE_KEY, 'agent_owner');
    agentKeyStore.set(LIVE_KEY, {
      id: 'agent_stale_legacy_copy',
      apiKey: LIVE_KEY,
      walletAddress: `0x${'d'.repeat(40)}`,
      name: 'stale',
      traits: [],
      reputation: 0,
      isFounder: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    });

    expect(resolveProvenAgentId({ 'x-agent-key': LIVE_KEY })).toBe('agent_owner');
  });
});

/**
 * The register-time binding decision, which had no test and was deletable.
 *
 * A client bound to an agent may later stamp that agent_id on a token WITHOUT
 * re-presenting the key, so the binding is exactly as trustworthy as this check.
 */
describe('agentBindingForRegistration', () => {
  beforeEach(() => {
    keyRegistry.clear();
    agentKeyStore.clear();
  });

  it('binds nothing when no agent_id is requested', () => {
    const binding = agentBindingForRegistration({ registrarAgentId: 'agent_owner' });

    expect(binding).toEqual({ ok: true });
  });

  it('refuses an agent_id from a registrar that proved nothing', () => {
    const binding = agentBindingForRegistration({
      requestedAgentId: 'agent_founder',
      registrarAgentId: undefined,
    });

    expect(binding.ok).toBe(false);
  });

  it('refuses an agent_id that is not the one the registrar proved', () => {
    const binding = agentBindingForRegistration({
      requestedAgentId: 'agent_founder',
      registrarAgentId: 'agent_owner',
    });

    expect(binding.ok).toBe(false);
  });

  it('accepts the proven agent_id and records the registry spelling', () => {
    // Case- and whitespace-insensitive to match the GRANT's comparison: a
    // stricter test here would let a client register under a spelling its own
    // token requests are then refused for.
    const binding = agentBindingForRegistration({
      requestedAgentId: '  AGENT_Owner ',
      registrarAgentId: 'agent_owner',
    });

    expect(binding).toEqual({ ok: true, boundAgentId: 'agent_owner' });
  });

  it('treats a whitespace-only agent_id as no request at all', () => {
    const binding = agentBindingForRegistration({
      requestedAgentId: '   ',
      registrarAgentId: undefined,
    });

    expect(binding).toEqual({ ok: true });
  });

  it('binds the agent a live registry key proves', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    const binding = agentBindingForRegistration({
      requestedAgentId: 'agent_owner',
      registrarAgentId: resolveProvenAgentId({ 'x-agent-key': LIVE_KEY }),
    });

    expect(binding).toEqual({ ok: true, boundAgentId: 'agent_owner' });
  });
});
