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

const { agentKeyStore, FOUNDER_AGENT_ID, keyRegistry, SEEDABLE_KEY_ENV_VARS } = await import(
  '../../holomesh/state'
);
const {
  AGENT_ID_NOT_BOUND_AT_REGISTRATION_ERROR,
  AGENT_ID_RESERVED_ERROR,
  agentBindingForRegistration,
  loopbackRegistrantMayBindUnproven,
  resolveProvenAgentId,
} = await import('../proven-agent-id');

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

  const PLATFORM = generateKeyPairSync('ed25519');
  const PLATFORM_SPKI = Buffer.from(
    PLATFORM.publicKey.export({ format: 'der', type: 'spki' })
  ).toString('base64');

  /**
   * Build a signed manifest, optionally carrying the replay bound.
   *
   * The signed payload is the manifest's own fields in this order, so
   * `issuedAt` sits INSIDE the signed bytes and cannot be edited or removed
   * without breaking the signature.
   */
  function manifestHeaders(params: {
    id: string;
    issuedAt?: number;
    signWith?: typeof PLATFORM.privateKey;
  }): Record<string, string> {
    const manifest = {
      id: params.id,
      name: 'Manifest Owner',
      walletAddress: `0x${'a'.repeat(40)}`,
      capabilities: ['read'],
      ...(params.issuedAt !== undefined ? { issuedAt: params.issuedAt } : {}),
    };
    const signature = signPayload(
      null,
      Buffer.from(JSON.stringify(manifest)),
      params.signWith ?? PLATFORM.privateKey
    ).toString('base64');
    return {
      'x-agent-manifest': Buffer.from(JSON.stringify(manifest)).toString('base64'),
      'x-agent-manifest-sig': signature,
    };
  }

  function withPlatformKey(run: () => void): void {
    withEnv('HOLOSCRIPT_PLATFORM_PUBLIC_KEY', PLATFORM_SPKI, run);
  }

  it('honours a platform-signed manifest that carries its replay bound', () => {
    withPlatformKey(() => {
      const proven = resolveProvenAgentId(
        manifestHeaders({ id: 'agent_manifest_owner', issuedAt: Date.now() })
      );
      expect(proven).toBe('agent_manifest_owner');
    });
  });

  it('refuses a manifest whose signature does not verify', () => {
    const other = generateKeyPairSync('ed25519');

    withPlatformKey(() => {
      const proven = resolveProvenAgentId(
        manifestHeaders({
          id: 'agent_manifest_forged',
          issuedAt: Date.now(),
          signWith: other.privateKey,
        })
      );
      expect(proven).toBeUndefined();
    });
  });

  it('refuses a manifest with no replay bound, however valid its signature', () => {
    // A signature never expires, so an unbounded manifest is replayable for as
    // long as the platform key lives. It still authenticates ordinary requests
    // through `resolveRequestingAgent`; what it may not do is MINT a durable
    // identity that outlives the request.
    withPlatformKey(() => {
      expect(resolveProvenAgentId(manifestHeaders({ id: 'agent_manifest_owner' }))).toBeUndefined();
    });
  });

  it('refuses a manifest whose bound has gone stale', () => {
    withPlatformKey(() => {
      const proven = resolveProvenAgentId(
        manifestHeaders({ id: 'agent_manifest_owner', issuedAt: Date.now() - 6 * 60_000 })
      );
      expect(proven).toBeUndefined();
    });
  });

  it('refuses a manifest dated into the future, which would buy an open window', () => {
    withPlatformKey(() => {
      const proven = resolveProvenAgentId(
        manifestHeaders({ id: 'agent_manifest_owner', issuedAt: Date.now() + 10 * 60_000 })
      );
      expect(proven).toBeUndefined();
    });
  });

  it('refuses a captured manifest whose bound was edited to look fresh', () => {
    // The whole point of signing `issuedAt`: refreshing it by hand must break
    // the signature, or the bound would be decoration.
    const captured = manifestHeaders({
      id: 'agent_manifest_owner',
      issuedAt: Date.now() - 10 * 60_000,
    });
    const refreshed = {
      id: 'agent_manifest_owner',
      name: 'Manifest Owner',
      walletAddress: `0x${'a'.repeat(40)}`,
      capabilities: ['read'],
      issuedAt: Date.now(),
    };

    withPlatformKey(() => {
      const proven = resolveProvenAgentId({
        'x-agent-manifest': Buffer.from(JSON.stringify(refreshed)).toString('base64'),
        'x-agent-manifest-sig': captured['x-agent-manifest-sig'],
      });
      expect(proven).toBeUndefined();
    });
  });

  it('refuses a perfectly valid manifest that names a reserved identity', () => {
    // Otherwise a platform signature mints the founder — walking around the
    // shared-key refusal by presenting a different KIND of proof.
    withPlatformKey(() => {
      expect(
        resolveProvenAgentId(manifestHeaders({ id: FOUNDER_AGENT_ID, issuedAt: Date.now() }))
      ).toBeUndefined();
      expect(
        resolveProvenAgentId(
          manifestHeaders({ id: 'agent_env_holoscript_api_key', issuedAt: Date.now() })
        )
      ).toBeUndefined();
      // Capitalisation is not a way around it.
      expect(
        resolveProvenAgentId(manifestHeaders({ id: 'Agent_Founder', issuedAt: Date.now() }))
      ).toBeUndefined();
    });
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

/**
 * Rotation is the thing a value comparison cannot survive.
 *
 * Detecting a shared key by its VALUE works exactly until the key is rotated:
 * rotation issues a brand new secret, so no env var equals it any more and the
 * comparison can never fire again. The refusal has to ride on the RECORD.
 */
describe('a shared key stays refused after rotation', () => {
  const ROTATED_KEY = 'hs_sk_rotated_value_no_env_var_holds';
  /** What `/admin/provision` actually mints: a per-agent, non-reserved id. */
  const PROVISIONED_SHAPE_ID = 'agent_1758000000000_ab12';

  /** A seeded FOUNDER record, as rotation would leave it: new value, same identity. */
  function seedFounderRecord(key: string, marked: boolean): void {
    keyRegistry.set(key, {
      key,
      walletAddress: `0x${'e'.repeat(40)}`,
      agentId: FOUNDER_AGENT_ID,
      agentName: 'Founder',
      scopes: ['*'],
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      rotationCount: 1,
      lastRotatedAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
      isFounder: true,
      ...(marked ? { seededFromEnv: 'HOLOMESH_API_KEY' } : {}),
    });
  }

  /**
   * A PER-AGENT record whose value an operator later put into a seedable
   * variable — so it became a shared secret — and which has since been rotated.
   * Its identity is provisioning-shaped, so nothing about the id gives it away
   * and the marker is genuinely the only thing that can refuse it.
   */
  function seedRotatedSharedRecord(key: string, marked: boolean): void {
    keyRegistry.set(key, {
      key,
      walletAddress: `0x${'b'.repeat(40)}`,
      agentId: PROVISIONED_SHAPE_ID,
      agentName: 'SharedValueAgent',
      scopes: ['*'],
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      rotationCount: 1,
      lastRotatedAt: new Date('2026-02-01T00:00:00.000Z').toISOString(),
      isFounder: false,
      ...(marked ? { seededFromEnv: 'HOLOMESH_API_KEY' } : {}),
    });
  }

  beforeEach(() => {
    keyRegistry.clear();
    agentKeyStore.clear();
  });

  it('refuses a rotated seeded key by its provenance marker', () => {
    // No env var holds this value: the marker is all that is left.
    seedSharedEnvKey(ROTATED_KEY, 'HOLOMESH_API_KEY');

    expect(resolveProvenAgentId({ 'x-agent-key': ROTATED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: `Bearer ${ROTATED_KEY}` })).toBeUndefined();
  });

  it('refuses one rotated before the marker existed, by its reserved identity', () => {
    // A store rotated on a server running the old code kept the seeded id and
    // lost every other trace. `agent_env_*` is minted only by seeding, so the
    // identity itself still gives the record away.
    seedSharedEnvKey(ROTATED_KEY, 'HOLOMESH_API_KEY', false);

    expect(resolveProvenAgentId({ 'x-agent-key': ROTATED_KEY })).toBeUndefined();
  });

  it('shows the marker is load-bearing: flip it and the verdict flips', () => {
    // The control has to run on a record whose IDENTITY gives nothing away.
    // `agent_env_*` and `agent_founder` are both refused on the id alone, so on
    // either of those the marker could be deleted and this control would not
    // notice — it would be measuring the reserved-id check instead. A
    // provisioned-shape id is the honest subject: here the marker is all there is.
    seedRotatedSharedRecord(ROTATED_KEY, false);
    expect(resolveProvenAgentId({ 'x-agent-key': ROTATED_KEY })).toBe(PROVISIONED_SHAPE_ID);

    keyRegistry.clear();
    seedRotatedSharedRecord(ROTATED_KEY, true);
    expect(resolveProvenAgentId({ 'x-agent-key': ROTATED_KEY })).toBeUndefined();
  });

  it('refuses a rotated FOUNDER record that lost its marker with the variable', () => {
    // The shape a store seeded before the marker is in TODAY: seeding wrote
    // `agent_founder` with no marker, then rotation — or a changed variable —
    // moved the value off every env var. Marker misses it, value misses it.
    // It used to resolve to the founder, so a holder of a superseded shared
    // value could bind a client it controls to `agent_founder` and have every
    // later token stamped founder, without re-presenting any key.
    seedFounderRecord(ROTATED_KEY, false);

    expect(resolveProvenAgentId({ 'x-agent-key': ROTATED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: `Bearer ${ROTATED_KEY}` })).toBeUndefined();
    expect(
      agentBindingForRegistration({
        requestedAgentId: FOUNDER_AGENT_ID,
        registrarAgentId: resolveProvenAgentId({ 'x-agent-key': ROTATED_KEY }),
      }).ok
    ).toBe(false);
  });

  it('refuses the same record when it DOES carry the marker', () => {
    // Both halves refuse now, which is the point: the founder identity does not
    // depend on a marker that a pre-marker store was never given.
    seedFounderRecord(ROTATED_KEY, true);

    expect(resolveProvenAgentId({ 'x-agent-key': ROTATED_KEY })).toBeUndefined();
  });
});

/**
 * Two refusals that are DELIBERATE, recorded so nobody reads them as bugs.
 */
describe('identities nothing outside the key registry may claim', () => {
  beforeEach(() => {
    keyRegistry.clear();
    agentKeyStore.clear();
  });

  it('refuses a legacy store record that carries a seeded identity', () => {
    const LEGACY = 'legacy-record-claiming-a-seeded-identity';
    agentKeyStore.set(LEGACY, {
      id: 'agent_env_holoscript_api_key',
      apiKey: LEGACY,
      walletAddress: `0x${'f'.repeat(40)}`,
      name: 'legacy',
      traits: [],
      reputation: 0,
      isFounder: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    });

    expect(resolveProvenAgentId({ 'x-mcp-api-key': LEGACY })).toBeUndefined();
  });

  it('refuses the founder env key, which is a shared secret by construction', () => {
    // HOLOMESH_FOUNDER_KEY can only name a value one of the seedable variables
    // already holds, so every caller configured with that variable presents the
    // same string. It authenticates and it is a founder — it simply cannot
    // prove WHICH agent is calling, so it cannot stamp agent_founder on a
    // token. A provisioned per-agent founder key is how that is restored.
    const FOUNDER_ENV_KEY = 'founder-key-value-shared-with-holomesh-api-key';
    keyRegistry.set(FOUNDER_ENV_KEY, {
      key: FOUNDER_ENV_KEY,
      walletAddress: `0x${'1'.repeat(40)}`,
      agentId: FOUNDER_AGENT_ID,
      agentName: 'Founder',
      scopes: ['*'],
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      rotationCount: 0,
      lastRotatedAt: null,
      isFounder: true,
      seededFromEnv: 'HOLOMESH_API_KEY',
    });

    withEnv('HOLOMESH_API_KEY', FOUNDER_ENV_KEY, () => {
      expect(resolveProvenAgentId({ 'x-agent-key': FOUNDER_ENV_KEY })).toBeUndefined();
      expect(
        agentBindingForRegistration({
          requestedAgentId: FOUNDER_AGENT_ID,
          registrarAgentId: resolveProvenAgentId({ 'x-agent-key': FOUNDER_ENV_KEY }),
        }).ok
      ).toBe(false);
    });
  });

  it('lets a provisioned founder key prove its OWN identity, never `agent_founder`', () => {
    // The refusal must not spread to the key that is genuinely per-agent: a
    // founder-flagged provisioned key still proves the agent it was issued to,
    // and `isFounder` (what founder-only routes read) is untouched.
    //
    // What it cannot do is claim the reserved id — and it never needed to,
    // because `/admin/provision` mints `agent_<timestamp>_<rand>` even with
    // `is_founder: true`. That premise is pinned by a test in the admin-routes
    // suite, so if provisioning ever mints `agent_founder` this stops being safe
    // loudly rather than silently.
    seedKey('hs_sk_provisioned_founder_key', 'agent_1758000000000_ab12');
    expect(resolveProvenAgentId({ 'x-agent-key': 'hs_sk_provisioned_founder_key' })).toBe(
      'agent_1758000000000_ab12'
    );

    seedKey('hs_sk_record_claiming_the_reserved_id', FOUNDER_AGENT_ID);
    expect(
      resolveProvenAgentId({ 'x-agent-key': 'hs_sk_record_claiming_the_reserved_id' })
    ).toBeUndefined();
  });
});

/**
 * The loopback exception, at the decision that carries it.
 *
 * HoloShell — the Jetson anchor's founder surface — registers over 127.0.0.1
 * with no per-agent key and calls holo_daemon_turn as the daimon's owner. Once
 * callerId is bound to the token's principal, a proof-only rule refuses the
 * founder's own surface. Processes on the anchor's host already hold its disk,
 * so a self-declared id adds no reach — but only while the registration door
 * is closed to the LAN: behind a reverse proxy in the same container every
 * remote peer looks like loopback, so the moment the door opens, proof is back.
 */
describe('loopbackRegistrantMayBindUnproven', () => {
  it.each([
    { registrarIsLoopback: true, remoteRegistrationAllowed: false, expected: true },
    { registrarIsLoopback: true, remoteRegistrationAllowed: true, expected: false },
    { registrarIsLoopback: false, remoteRegistrationAllowed: false, expected: false },
    { registrarIsLoopback: false, remoteRegistrationAllowed: true, expected: false },
  ])(
    'loopback=$registrarIsLoopback remoteAllowed=$remoteRegistrationAllowed -> $expected',
    ({ registrarIsLoopback, remoteRegistrationAllowed, expected }) => {
      expect(
        loopbackRegistrantMayBindUnproven({ registrarIsLoopback, remoteRegistrationAllowed })
      ).toBe(expected);
    }
  );
});

describe('agentBindingForRegistration for a registrant that proved nothing', () => {
  beforeEach(() => {
    keyRegistry.clear();
    agentKeyStore.clear();
  });

  /** What the route passes for each (peer, door) pair. */
  const door = (registrarIsLoopback: boolean, remoteRegistrationAllowed: boolean) =>
    loopbackRegistrantMayBindUnproven({ registrarIsLoopback, remoteRegistrationAllowed });

  it('loopback peer, door closed: binds the requested id, trimmed, case kept', () => {
    expect(
      agentBindingForRegistration({
        requestedAgentId: '  founder ',
        registrarAgentId: undefined,
        unprovenBindingAllowed: door(true, false),
      })
    ).toEqual({ ok: true, boundAgentId: 'founder' });

    // No registry record exists to take a spelling from, and the daimon binder
    // compares callerId to the token's agentId verbatim — so the caller's own
    // case is what gets recorded.
    expect(
      agentBindingForRegistration({
        requestedAgentId: 'HoloShell-Founder',
        registrarAgentId: undefined,
        unprovenBindingAllowed: door(true, false),
      })
    ).toEqual({ ok: true, boundAgentId: 'HoloShell-Founder' });
  });

  it('loopback peer, door open: refused — a proxy in the container makes remote look local', () => {
    expect(
      agentBindingForRegistration({
        requestedAgentId: 'founder',
        registrarAgentId: undefined,
        unprovenBindingAllowed: door(true, true),
      })
    ).toEqual({ ok: false, reason: AGENT_ID_NOT_BOUND_AT_REGISTRATION_ERROR });
  });

  it('remote peer: refused whether the door is closed or open', () => {
    for (const remoteRegistrationAllowed of [false, true]) {
      expect(
        agentBindingForRegistration({
          requestedAgentId: 'founder',
          registrarAgentId: undefined,
          unprovenBindingAllowed: door(false, remoteRegistrationAllowed),
        })
      ).toEqual({ ok: false, reason: AGENT_ID_NOT_BOUND_AT_REGISTRATION_ERROR });
    }
  });

  it('omitting the input keeps the proof-only rule', () => {
    expect(
      agentBindingForRegistration({ requestedAgentId: 'founder', registrarAgentId: undefined })
    ).toEqual({ ok: false, reason: AGENT_ID_NOT_BOUND_AT_REGISTRATION_ERROR });
  });

  it.each([
    'agent_founder',
    'Agent_Founder',
    ' agent_founder ',
    'agent_env_anything',
    'AGENT_ENV_HOLOSCRIPT_API_KEY',
  ])(
    'a reserved id (%j) is refused on loopback with the door closed, naming the reservation',
    (reserved) => {
      const binding = agentBindingForRegistration({
        requestedAgentId: reserved,
        registrarAgentId: undefined,
        unprovenBindingAllowed: door(true, false),
      });
      expect(binding).toEqual({ ok: false, reason: AGENT_ID_RESERVED_ERROR });
      if (!binding.ok) {
        expect(binding.reason).toMatch(/agent_founder/);
        expect(binding.reason).toMatch(/agent_env_/);
      }
    }
  );

  it('binds nothing when nothing is requested, even on loopback with the door closed', () => {
    expect(
      agentBindingForRegistration({
        requestedAgentId: '   ',
        registrarAgentId: undefined,
        unprovenBindingAllowed: door(true, false),
      })
    ).toEqual({ ok: true });
  });

  it('a proven registrar still records the registry spelling, whatever the door', () => {
    // The comparison path is untouched: the new input only decides what
    // happens when the request matches no proven identity.
    seedKey(LIVE_KEY, 'agent_owner');
    const registrarAgentId = resolveProvenAgentId({ 'x-agent-key': LIVE_KEY });
    expect(registrarAgentId).toBe('agent_owner');

    expect(
      agentBindingForRegistration({
        requestedAgentId: '  AGENT_Owner ',
        registrarAgentId,
        unprovenBindingAllowed: true,
      })
    ).toEqual({ ok: true, boundAgentId: 'agent_owner' });
  });

  it('a proven registrar asking for a DIFFERENT non-reserved id on loopback, door closed, gets it (refusing would reward stripping the proof)', () => {
    // Refusing here would protect nothing: the same process can drop its key
    // header and register the id unproven. The key never narrows what a
    // loopback registrant may bind; it only fixes the spelling when it matches.
    expect(
      agentBindingForRegistration({
        requestedAgentId: 'founder',
        registrarAgentId: 'agent_owner',
        unprovenBindingAllowed: door(true, false),
      })
    ).toEqual({ ok: true, boundAgentId: 'founder' });

    // ...and still never a reserved one.
    expect(
      agentBindingForRegistration({
        requestedAgentId: FOUNDER_AGENT_ID,
        registrarAgentId: 'agent_owner',
        unprovenBindingAllowed: door(true, false),
      })
    ).toEqual({ ok: false, reason: AGENT_ID_RESERVED_ERROR });
  });
});
