import { describe, it, expect } from 'vitest';
import {
  CapabilityTokenError,
  DEFAULT_CAPABILITY_BY_TRUST,
  DEFAULT_TRUST_BY_SURFACE,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
  assertHandle,
  createDeviceFlowChallenge,
  mintCapabilityToken,
  parseHandle,
  revokeCapabilityToken,
  storeCapabilityToken,
  validateCapabilityToken,
  type Capability,
  type Handle,
  type StoredCapabilityToken,
} from './index';

// Deterministic RNG for reproducible token IDs / secrets.
function fixedRng(seed: number): (size: number) => Buffer {
  let counter = seed;
  return (size: number) => {
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      counter = (counter * 1103515245 + 12345) & 0x7fffffff;
      buf[i] = counter & 0xff;
    }
    return buf;
  };
}

const FIXED_NOW = new Date('2026-05-12T12:00:00.000Z');

describe('parseHandle / assertHandle', () => {
  it('parses well-formed handles', () => {
    expect(parseHandle('claude1')).toEqual({ surface: 'claude', slot: 1 });
    expect(parseHandle('mobile42')).toEqual({ surface: 'mobile', slot: 42 });
    expect(parseHandle('headless0')).toEqual({ surface: 'headless', slot: 0 });
  });

  // G.GOLD.013: false-case for the computed parser result.
  it('rejects malformed handles', () => {
    expect(parseHandle('')).toBeNull();
    expect(parseHandle('claude')).toBeNull(); // missing slot
    expect(parseHandle('claude-1')).toBeNull(); // hyphen
    expect(parseHandle('1claude')).toBeNull(); // wrong order
    expect(parseHandle('antigravity1')).toBeNull(); // not in SurfaceKind union
    expect(parseHandle('Claude1')).toBeNull(); // case-sensitive
  });

  it('assertHandle accepts matching surface', () => {
    expect(() => assertHandle('claude1', 'claude')).not.toThrow();
    expect(() => assertHandle('mobile3', 'mobile')).not.toThrow();
  });

  it('assertHandle throws INVALID_HANDLE on mismatch', () => {
    expect(() => assertHandle('claude1', 'mobile')).toThrow(CapabilityTokenError);
    try {
      assertHandle('claude1', 'mobile');
    } catch (err) {
      expect((err as CapabilityTokenError).code).toBe('INVALID_HANDLE');
    }
  });

  it('assertHandle throws INVALID_HANDLE on malformed input', () => {
    expect(() => assertHandle('', 'claude')).toThrow(CapabilityTokenError);
    expect(() => assertHandle('bogus', 'claude')).toThrow(CapabilityTokenError);
  });
});

describe('trust tier defaults', () => {
  it('mobile + headless default to reduced (S-3 mobile-as-seat memo)', () => {
    expect(DEFAULT_TRUST_BY_SURFACE.mobile).toBe('reduced');
    expect(DEFAULT_TRUST_BY_SURFACE.headless).toBe('reduced');
  });

  it('IDE surfaces default to full', () => {
    expect(DEFAULT_TRUST_BY_SURFACE.claude).toBe('full');
    expect(DEFAULT_TRUST_BY_SURFACE.cursor).toBe('full');
    expect(DEFAULT_TRUST_BY_SURFACE.copilot).toBe('full');
    expect(DEFAULT_TRUST_BY_SURFACE.gemini).toBe('full');
    expect(DEFAULT_TRUST_BY_SURFACE.codex).toBe('full');
  });

  it('reduced is a strict subset of full', () => {
    const full = new Set(DEFAULT_CAPABILITY_BY_TRUST.full);
    for (const cap of DEFAULT_CAPABILITY_BY_TRUST.reduced) {
      expect(full.has(cap)).toBe(true);
    }
    // G.GOLD.013 false-case: reduced lacks claim/sign (the things mobile can't safely do).
    expect(DEFAULT_CAPABILITY_BY_TRUST.reduced).not.toContain('mesh:claim' as Capability);
    expect(DEFAULT_CAPABILITY_BY_TRUST.reduced).not.toContain('mesh:sign' as Capability);
    expect(DEFAULT_CAPABILITY_BY_TRUST.reduced).not.toContain('mesh:done' as Capability);
  });

  it('read-only is a strict subset of reduced', () => {
    const reduced = new Set(DEFAULT_CAPABILITY_BY_TRUST.reduced);
    for (const cap of DEFAULT_CAPABILITY_BY_TRUST['read-only']) {
      expect(reduced.has(cap)).toBe(true);
    }
    expect(DEFAULT_CAPABILITY_BY_TRUST['read-only']).not.toContain('mesh:message' as Capability);
  });
});

describe('mintCapabilityToken', () => {
  it('mints a token with surface defaults', () => {
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(1),
    });
    expect(t.version).toBe(1);
    expect(t.event).toBe('capability.minted');
    expect(t.handle).toBe('claude1');
    expect(t.surface).toBe('claude');
    expect(t.trust).toBe('full');
    expect(t.tokenId).toMatch(/^captok_[0-9a-f]{24}$/);
    expect(t.tokenSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(t.receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(t.capabilities).toContain('mesh:claim');
  });

  it('mints a reduced-tier token for mobile by default', () => {
    const t = mintCapabilityToken({
      handle: 'mobile1' as Handle,
      surface: 'mobile',
      now: FIXED_NOW,
      randomBytes: fixedRng(2),
    });
    expect(t.trust).toBe('reduced');
    expect(t.capabilities).not.toContain('mesh:claim');
    expect(t.capabilities).toContain('mesh:read');
  });

  it('uses DEFAULT_TTL_SECONDS when ttl omitted', () => {
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(3),
    });
    const elapsed = new Date(t.expiresAt).getTime() - new Date(t.issuedAt).getTime();
    expect(elapsed).toBe(DEFAULT_TTL_SECONDS * 1000);
  });

  it('respects an explicit ttl', () => {
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      ttlSeconds: 300,
      now: FIXED_NOW,
      randomBytes: fixedRng(4),
    });
    const elapsed = new Date(t.expiresAt).getTime() - new Date(t.issuedAt).getTime();
    expect(elapsed).toBe(300 * 1000);
  });

  // G.GOLD.013: each policy assertion has a paired rejection test.
  it('rejects ttl below MIN_TTL_SECONDS', () => {
    expect(() =>
      mintCapabilityToken({
        handle: 'claude1' as Handle,
        surface: 'claude',
        ttlSeconds: MIN_TTL_SECONDS - 1,
        now: FIXED_NOW,
      })
    ).toThrow(/ttlSeconds/);
  });

  it('rejects ttl above MAX_TTL_SECONDS', () => {
    expect(() =>
      mintCapabilityToken({
        handle: 'claude1' as Handle,
        surface: 'claude',
        ttlSeconds: MAX_TTL_SECONDS + 1,
        now: FIXED_NOW,
      })
    ).toThrow(/ttlSeconds/);
  });

  it('rejects non-finite ttl', () => {
    expect(() =>
      mintCapabilityToken({
        handle: 'claude1' as Handle,
        surface: 'claude',
        ttlSeconds: Number.POSITIVE_INFINITY,
        now: FIXED_NOW,
      })
    ).toThrow(CapabilityTokenError);
    expect(() =>
      mintCapabilityToken({
        handle: 'claude1' as Handle,
        surface: 'claude',
        ttlSeconds: Number.NaN,
        now: FIXED_NOW,
      })
    ).toThrow(CapabilityTokenError);
  });

  it('rejects mobile attempting to escalate to full trust', () => {
    expect(() =>
      mintCapabilityToken({
        handle: 'mobile1' as Handle,
        surface: 'mobile',
        trust: 'full',
        now: FIXED_NOW,
      })
    ).toThrow(/cannot request trust=full/);
  });

  it('allows mobile to step down to read-only', () => {
    const t = mintCapabilityToken({
      handle: 'mobile1' as Handle,
      surface: 'mobile',
      trust: 'read-only',
      now: FIXED_NOW,
      randomBytes: fixedRng(5),
    });
    expect(t.trust).toBe('read-only');
    expect(t.capabilities).not.toContain('mesh:message');
  });

  it('rejects requesting a capability outside the trust tier', () => {
    expect(() =>
      mintCapabilityToken({
        handle: 'mobile1' as Handle,
        surface: 'mobile',
        capabilities: ['mesh:claim'],
        now: FIXED_NOW,
      })
    ).toThrow(/Capability mesh:claim not in trust tier reduced/);
  });

  it('rejects handle whose surface prefix does not match surface arg', () => {
    expect(() =>
      mintCapabilityToken({
        handle: 'claude1' as Handle,
        surface: 'mobile',
        now: FIXED_NOW,
      })
    ).toThrow(CapabilityTokenError);
  });

  it('two mints with identical inputs but different randomBytes produce different tokenIds', () => {
    const a = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(10),
    });
    const b = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(11),
    });
    expect(a.tokenId).not.toBe(b.tokenId);
    expect(a.tokenSecret).not.toBe(b.tokenSecret);
  });
});

describe('storeCapabilityToken', () => {
  it('strips plaintext tokenSecret and stores its hash', () => {
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(20),
    });
    const stored = storeCapabilityToken(t);
    expect((stored as unknown as { tokenSecret?: string }).tokenSecret).toBeUndefined();
    expect(stored.tokenSecretHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Hash is deterministic from secret.
    const stored2 = storeCapabilityToken(t);
    expect(stored.tokenSecretHash).toBe(stored2.tokenSecretHash);
  });
});

describe('validateCapabilityToken', () => {
  function freshPair(overrides: Partial<{ ttl: number; surface: 'claude' | 'mobile' }> = {}) {
    const surface = overrides.surface ?? 'claude';
    const t = mintCapabilityToken({
      handle: `${surface}1` as Handle,
      surface,
      ttlSeconds: overrides.ttl ?? DEFAULT_TTL_SECONDS,
      now: FIXED_NOW,
      randomBytes: fixedRng(100),
    });
    return { token: t, stored: storeCapabilityToken(t) };
  }

  it('returns true for a valid token + matching capability', () => {
    const { token, stored } = freshPair();
    expect(
      validateCapabilityToken({
        presentedSecret: token.tokenSecret,
        stored,
        needsCapability: 'mesh:read',
        now: new Date(FIXED_NOW.getTime() + 60_000),
      })
    ).toBe(true);
  });

  // G.GOLD.013: the false case — validateCapabilityToken only returns true,
  // so the rejection paths MUST be exercised explicitly to prove the assertion isn't tautological.
  it('throws TOKEN_REVOKED when revoked', () => {
    const { token, stored } = freshPair();
    const revoked = revokeCapabilityToken(stored, 'compromised', FIXED_NOW);
    expect(() =>
      validateCapabilityToken({
        presentedSecret: token.tokenSecret,
        stored: revoked,
        needsCapability: 'mesh:read',
        now: new Date(FIXED_NOW.getTime() + 60_000),
      })
    ).toThrow(/revoked/);
    try {
      validateCapabilityToken({
        presentedSecret: token.tokenSecret,
        stored: revoked,
        needsCapability: 'mesh:read',
        now: new Date(FIXED_NOW.getTime() + 60_000),
      });
    } catch (err) {
      expect((err as CapabilityTokenError).code).toBe('TOKEN_REVOKED');
    }
  });

  it('throws TOKEN_EXPIRED past expiry', () => {
    const { token, stored } = freshPair({ ttl: MIN_TTL_SECONDS });
    expect(() =>
      validateCapabilityToken({
        presentedSecret: token.tokenSecret,
        stored,
        needsCapability: 'mesh:read',
        now: new Date(FIXED_NOW.getTime() + (MIN_TTL_SECONDS + 1) * 1000),
      })
    ).toThrow(/expired/);
  });

  it('treats expiresAt exactly == now as expired (boundary)', () => {
    const { token, stored } = freshPair({ ttl: MIN_TTL_SECONDS });
    expect(() =>
      validateCapabilityToken({
        presentedSecret: token.tokenSecret,
        stored,
        needsCapability: 'mesh:read',
        now: new Date(stored.expiresAt),
      })
    ).toThrow(/expired/);
  });

  it('throws TOKEN_INVALID_SECRET on secret mismatch', () => {
    const { stored } = freshPair();
    expect(() =>
      validateCapabilityToken({
        presentedSecret: 'a'.repeat(64),
        stored,
        needsCapability: 'mesh:read',
        now: new Date(FIXED_NOW.getTime() + 60_000),
      })
    ).toThrow(/secret mismatch/);
  });

  it('throws CAPABILITY_NOT_IN_TRUST_TIER when needed cap is not granted', () => {
    const { token, stored } = freshPair({ surface: 'mobile' });
    expect(() =>
      validateCapabilityToken({
        presentedSecret: token.tokenSecret,
        stored,
        needsCapability: 'mesh:claim',
        now: new Date(FIXED_NOW.getTime() + 60_000),
      })
    ).toThrow(/does not grant mesh:claim/);
  });

  it('precedence: revoked checked before expired', () => {
    const { token, stored } = freshPair({ ttl: MIN_TTL_SECONDS });
    const revoked = revokeCapabilityToken(stored, 'compromised', FIXED_NOW);
    try {
      validateCapabilityToken({
        presentedSecret: token.tokenSecret,
        stored: revoked,
        needsCapability: 'mesh:read',
        now: new Date(FIXED_NOW.getTime() + (MIN_TTL_SECONDS + 1) * 1000),
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as CapabilityTokenError).code).toBe('TOKEN_REVOKED');
    }
  });
});

describe('revokeCapabilityToken', () => {
  it('returns a new object with revokedAt + revokeReason set', () => {
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(50),
    });
    const stored = storeCapabilityToken(t);
    const revoked = revokeCapabilityToken(stored, 'rotation', FIXED_NOW);
    expect(revoked.revokedAt).toBe(FIXED_NOW.toISOString());
    expect(revoked.revokeReason).toBe('rotation');
    // G.GOLD.013 false-case: confirm the source object was NOT mutated.
    expect(stored.revokedAt).toBeUndefined();
    expect(stored.revokeReason).toBeUndefined();
  });

  it('captures default reason when called without an explicit one indirectly', () => {
    // (The signature requires `reason` — guard against silent default by exercising real input)
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(51),
    });
    const stored = storeCapabilityToken(t);
    const revoked = revokeCapabilityToken(stored, '', FIXED_NOW);
    expect(revoked.revokeReason).toBe('');
  });
});

describe('createDeviceFlowChallenge', () => {
  it('mints a well-formed challenge', () => {
    const ch = createDeviceFlowChallenge({
      verificationUri: 'https://mcp.holoscript.net/secrets-broker/verify',
      now: FIXED_NOW,
      randomBytes: fixedRng(200),
    });
    expect(ch.version).toBe(1);
    expect(ch.event).toBe('device-flow.challenge');
    expect(ch.deviceCode).toMatch(/^[0-9a-f]{48}$/); // 24 bytes hex
    expect(ch.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // User-code alphabet excludes ambiguous chars
    expect(ch.userCode).not.toMatch(/[01OIL]/);
    expect(ch.verificationUri).toBe('https://mcp.holoscript.net/secrets-broker/verify');
    expect(ch.intervalSeconds).toBe(5);
    expect(ch.receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('respects explicit interval', () => {
    const ch = createDeviceFlowChallenge({
      verificationUri: 'https://example/v',
      intervalSeconds: 10,
      now: FIXED_NOW,
      randomBytes: fixedRng(201),
    });
    expect(ch.intervalSeconds).toBe(10);
  });

  it('rejects interval outside [1, 60]', () => {
    expect(() =>
      createDeviceFlowChallenge({
        verificationUri: 'https://example/v',
        intervalSeconds: 0,
        now: FIXED_NOW,
      })
    ).toThrow(/intervalSeconds/);
    expect(() =>
      createDeviceFlowChallenge({
        verificationUri: 'https://example/v',
        intervalSeconds: 61,
        now: FIXED_NOW,
      })
    ).toThrow(/intervalSeconds/);
    expect(() =>
      createDeviceFlowChallenge({
        verificationUri: 'https://example/v',
        intervalSeconds: Number.NaN,
        now: FIXED_NOW,
      })
    ).toThrow(CapabilityTokenError);
  });

  it('rejects ttl outside policy bounds', () => {
    expect(() =>
      createDeviceFlowChallenge({
        verificationUri: 'https://example/v',
        ttlSeconds: 1,
        now: FIXED_NOW,
      })
    ).toThrow(/ttlSeconds/);
  });
});

describe('frozen-ness contract', () => {
  it('minted token is frozen (defense-in-depth against accidental mutation)', () => {
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(300),
    });
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.capabilities)).toBe(true);
  });

  it('stored token is frozen', () => {
    const t = mintCapabilityToken({
      handle: 'claude1' as Handle,
      surface: 'claude',
      now: FIXED_NOW,
      randomBytes: fixedRng(301),
    });
    const stored: StoredCapabilityToken = storeCapabilityToken(t);
    expect(Object.isFrozen(stored)).toBe(true);
  });
});
