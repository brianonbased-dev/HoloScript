/**
 * Tests for the capability-token envelope path in extractAndVerifySigning().
 *
 * Coverage:
 * - isCapabilityEnvelopeBody discriminator (FALSE shapes + TRUE shapes)
 * - dispatch: capability-shape body routes to verifyCapabilityEnvelopeRequest;
 *   classical and dual envelopes still take their own paths
 * - verifyCapabilityEnvelopeRequest happy path + every documented failure
 *   reason (revoked / expired / invalid secret / unknown id / capability
 *   not granted)
 * - SigningContext shape: signingProtocol='capability' on every code path
 *
 * Discipline: G.GOLD.013 paired FALSE+TRUE for every computed assertion.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CapabilityTokenRegistry,
  mintCapabilityToken,
  storeCapabilityToken,
  type Capability,
  type CapabilityToken,
  type Handle,
} from '@holoscript/secrets-broker';
import {
  extractAndVerifySigning,
  isCapabilityEnvelopeBody,
  resetAttestationRegistry,
  resetCapabilityRegistry,
} from '../signing-middleware';

// ── Helpers ───────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-05-12T12:00:00.000Z');
const FIXED_NOW_MS = FIXED_NOW.getTime();

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

interface MintFixture {
  token: CapabilityToken;
  plaintextSecret: string;
}

function mintFixture(opts: {
  handle?: Handle;
  surface?: 'claude' | 'mobile';
  rngSeed?: number;
  ttlSeconds?: number;
} = {}): MintFixture {
  const token = mintCapabilityToken({
    handle: opts.handle ?? ('claude1' as Handle),
    surface: opts.surface ?? 'claude',
    now: FIXED_NOW,
    randomBytes: fixedRng(opts.rngSeed ?? 1001),
    ttlSeconds: opts.ttlSeconds,
  });
  return { token, plaintextSecret: token.tokenSecret };
}

function capabilityEnvelopeBody(opts: {
  tokenId: string;
  tokenSecret: string;
  capability: Capability;
  body?: unknown;
}) {
  return {
    envelope_type: 'capability' as const,
    token_id: opts.tokenId,
    token_secret: opts.tokenSecret,
    body: opts.body ?? { team: 'core', op: 'noop' },
    capability: opts.capability,
  };
}

beforeEach(() => {
  resetAttestationRegistry();
  resetCapabilityRegistry();
});
afterEach(() => {
  resetAttestationRegistry();
  resetCapabilityRegistry();
});

// ── isCapabilityEnvelopeBody discriminator ────────────────────────────

describe('isCapabilityEnvelopeBody', () => {
  it('FALSE: null / primitives / classical envelope', () => {
    expect(isCapabilityEnvelopeBody(null)).toBe(false);
    expect(isCapabilityEnvelopeBody(42)).toBe(false);
    expect(isCapabilityEnvelopeBody('capability')).toBe(false);
    expect(isCapabilityEnvelopeBody({ body: {}, signature: '0xaa', signer_address: '0xbb', nonce: 'n', timestamp: 't' })).toBe(false);
  });

  it('FALSE: capability-like shape missing token_id', () => {
    expect(
      isCapabilityEnvelopeBody({
        envelope_type: 'capability',
        token_secret: 'plaintext',
        capability: 'mesh:read',
        body: {},
      })
    ).toBe(false);
  });

  it('FALSE: capability-like shape with wrong envelope_type value', () => {
    expect(
      isCapabilityEnvelopeBody({
        envelope_type: 'classical',
        token_id: 'captok_abc',
        token_secret: 'plaintext',
        capability: 'mesh:read',
        body: {},
      })
    ).toBe(false);
  });

  it('TRUE: minimal capability-envelope body', () => {
    expect(
      isCapabilityEnvelopeBody({
        envelope_type: 'capability',
        token_id: 'captok_abc',
        token_secret: 'plaintext',
        capability: 'mesh:read',
        body: { x: 1 },
      })
    ).toBe(true);
  });
});

// ── Dispatch — capability shape routes to capability path ─────────────

describe('extractAndVerifySigning dispatch — capability', () => {
  it('TRUE: capability-envelope body routes to capability path (signingProtocol=capability)', async () => {
    const reg = new CapabilityTokenRegistry();
    const { token, plaintextSecret } = mintFixture();
    reg.put(storeCapabilityToken(token));

    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: plaintextSecret,
        capability: 'mesh:read',
      }),
      { capabilityRegistry: reg, nowMs: FIXED_NOW_MS + 60_000 }
    );
    expect(result.ctx.signingProtocol).toBe('capability');
    expect(result.ctx.signedRequest).toBe(true);
  });

  it('FALSE: classical body keeps signingProtocol=classical, NOT capability', async () => {
    const result = await extractAndVerifySigning({ plain: 'body' }, { strictMode: false });
    expect(result.ctx.signingProtocol).toBe('classical');
  });
});

// ── verifyCapabilityEnvelopeRequest — happy path + failures ───────────

describe('verifyCapabilityEnvelopeRequest — happy path', () => {
  it('TRUE: valid token + correct secret + granted capability → signer=handle, signingValid=true', async () => {
    const reg = new CapabilityTokenRegistry();
    const { token, plaintextSecret } = mintFixture({ handle: 'claude1' as Handle });
    reg.put(storeCapabilityToken(token));

    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: plaintextSecret,
        capability: 'mesh:read',
      }),
      { capabilityRegistry: reg, nowMs: FIXED_NOW_MS + 60_000 }
    );
    expect(result.ctx.signingValid).toBe(true);
    expect(result.ctx.signer).toBe('claude1');
    expect(result.ctx.capabilityScope).toBe('mesh:read');
    expect(result.ctx.signingReason).toBeUndefined();
    expect(result.effectiveBody).toEqual({ team: 'core', op: 'noop' });
  });
});

describe('verifyCapabilityEnvelopeRequest — failure reasons', () => {
  it('FALSE: unknown token_id → signingReason=capability-token-invalid', async () => {
    const reg = new CapabilityTokenRegistry();
    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: 'captok_unknown',
        tokenSecret: 'whatever',
        capability: 'mesh:read',
      }),
      { capabilityRegistry: reg, nowMs: FIXED_NOW_MS + 60_000 }
    );
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('capability-token-invalid');
    expect(result.ctx.signer).toBeNull();
    expect(result.ctx.signingProtocol).toBe('capability');
    expect(result.ctx.capabilityScope).toBe('mesh:read');
  });

  it('FALSE: wrong token_secret → capability-token-invalid', async () => {
    const reg = new CapabilityTokenRegistry();
    const { token } = mintFixture();
    reg.put(storeCapabilityToken(token));

    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: 'wrong-secret',
        capability: 'mesh:read',
      }),
      { capabilityRegistry: reg, nowMs: FIXED_NOW_MS + 60_000 }
    );
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('capability-token-invalid');
  });

  it('FALSE: revoked token → capability-token-revoked', async () => {
    const reg = new CapabilityTokenRegistry();
    const { token, plaintextSecret } = mintFixture();
    reg.put(storeCapabilityToken(token));
    reg.revoke(token.tokenId, 'compromise', FIXED_NOW);

    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: plaintextSecret,
        capability: 'mesh:read',
      }),
      { capabilityRegistry: reg, nowMs: FIXED_NOW_MS + 60_000 }
    );
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('capability-token-revoked');
  });

  it('FALSE: expired token → capability-token-expired', async () => {
    const reg = new CapabilityTokenRegistry();
    const { token, plaintextSecret } = mintFixture({ ttlSeconds: 60 });
    reg.put(storeCapabilityToken(token));

    // Now is 2 minutes past mint → past expiry.
    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: plaintextSecret,
        capability: 'mesh:read',
      }),
      { capabilityRegistry: reg, nowMs: FIXED_NOW_MS + 120_000 }
    );
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('capability-token-expired');
  });

  it('FALSE: capability not in token (mobile asking for mesh:claim) → capability-not-granted', async () => {
    const reg = new CapabilityTokenRegistry();
    // Mobile defaults to reduced trust, which DOES NOT include mesh:claim.
    const { token, plaintextSecret } = mintFixture({ handle: 'mobile1' as Handle, surface: 'mobile' });
    reg.put(storeCapabilityToken(token));

    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: plaintextSecret,
        capability: 'mesh:claim',
      }),
      { capabilityRegistry: reg, nowMs: FIXED_NOW_MS + 60_000 }
    );
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('capability-not-granted');
    expect(result.ctx.capabilityScope).toBe('mesh:claim');
  });
});

// ── Singleton management ──────────────────────────────────────────────

describe('CapabilityTokenRegistry singleton', () => {
  it('TRUE: extractAndVerifySigning uses the module singleton when capabilityRegistry option not provided', async () => {
    // Mint into the singleton.
    const { getCapabilityRegistry } = await import('../signing-middleware');
    const reg = getCapabilityRegistry();
    const { token, plaintextSecret } = mintFixture({ rngSeed: 5050 });
    reg.put(storeCapabilityToken(token));

    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: plaintextSecret,
        capability: 'mesh:read',
      }),
      { nowMs: FIXED_NOW_MS + 60_000 } // NO capabilityRegistry override
    );
    expect(result.ctx.signingValid).toBe(true);
    expect(result.ctx.signer).toBe('claude1');
  });

  it('FALSE: empty singleton registry → token unknown → capability-token-invalid', async () => {
    // resetCapabilityRegistry already called in beforeEach; do not put anything.
    const { token, plaintextSecret } = mintFixture();
    const result = await extractAndVerifySigning(
      capabilityEnvelopeBody({
        tokenId: token.tokenId,
        tokenSecret: plaintextSecret,
        capability: 'mesh:read',
      }),
      { nowMs: FIXED_NOW_MS + 60_000 }
    );
    expect(result.ctx.signingValid).toBe(false);
    expect(result.ctx.signingReason).toBe('capability-token-invalid');
  });
});
