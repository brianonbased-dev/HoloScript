/**
 * Legacy API key comparison must reject malformed keys without throwing,
 * still reject wrong keys, and still accept the configured key.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuth21Service } from '../oauth21';
import { OAuth2Provider } from '../../auth/oauth2-provider';
import { constantTimeEqual } from '../constant-time';
import { authenticateOrReject } from '../authenticate-or-reject';

const REAL_KEY = 'hs_live_key_for_tests_0123456789abcdef';
const MALFORMED_SAME_LENGTH = REAL_KEY.slice(0, -1) + '\u00e9';
const ASCII_WRONG_SAME_LENGTH = REAL_KEY.slice(0, -1) + 'x';
const WRONG_LENGTH = REAL_KEY + 'extra';

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeOauth21() {
  return new OAuth21Service({
    legacyApiKey: REAL_KEY,
    migrationMode: 'permissive',
    tokenSecret: 'x'.repeat(64),
  });
}

function makeOauth2() {
  return new OAuth2Provider({ legacyApiKey: REAL_KEY, migrationMode: 'permissive' });
}

describe('constantTimeEqual', () => {
  it('matches equal strings and rejects malformed keys without throwing', () => {
    expect(MALFORMED_SAME_LENGTH.length).toBe(REAL_KEY.length);
    expect(constantTimeEqual(REAL_KEY, REAL_KEY)).toBe(true);
    expect(() => constantTimeEqual(MALFORMED_SAME_LENGTH, REAL_KEY)).not.toThrow();
    expect(constantTimeEqual(MALFORMED_SAME_LENGTH, REAL_KEY)).toBe(false);
    expect(constantTimeEqual(ASCII_WRONG_SAME_LENGTH, REAL_KEY)).toBe(false);
    expect(constantTimeEqual(WRONG_LENGTH, REAL_KEY)).toBe(false);
  });
});

describe('OAuth21Service legacy key compare', () => {
  it('validateLegacyKey rejects malformed keys without throwing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const svc = makeOauth21();
    expect(() => svc.validateLegacyKey(MALFORMED_SAME_LENGTH)).not.toThrow();
    expect(svc.validateLegacyKey(MALFORMED_SAME_LENGTH).active).toBe(false);
  });

  it('authenticateRequest rejects malformed keys without throwing on every header path', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const svc = makeOauth21();
    for (const headers of [
      { 'x-api-key': MALFORMED_SAME_LENGTH },
      { 'x-mcp-api-key': MALFORMED_SAME_LENGTH },
      { authorization: `Bearer ${MALFORMED_SAME_LENGTH}` },
    ]) {
      expect(() => svc.authenticateRequest(headers)).not.toThrow();
      expect(svc.authenticateRequest(headers).active).toBe(false);
    }
  });

  it('still refuses an ASCII wrong key and a wrong length, and accepts the right key', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const svc = makeOauth21();
    expect(svc.validateLegacyKey(ASCII_WRONG_SAME_LENGTH).active).toBe(false);
    expect(svc.validateLegacyKey(WRONG_LENGTH).active).toBe(false);
    expect(svc.validateLegacyKey(REAL_KEY).active).toBe(true);
  });
});

describe('OAuth2Provider legacy key compare', () => {
  it('authenticateRequest rejects malformed keys without throwing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const provider = makeOauth2();
    for (const headers of [
      { 'x-api-key': MALFORMED_SAME_LENGTH },
      { authorization: `Bearer ${MALFORMED_SAME_LENGTH}` },
    ]) {
      await expect(provider.authenticateRequest(headers)).resolves.toMatchObject({ active: false });
    }
  });

  it('still refuses an ASCII wrong key and a wrong length, and accepts the right key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const provider = makeOauth2();
    expect(
      (await provider.authenticateRequest({ 'x-api-key': ASCII_WRONG_SAME_LENGTH })).active
    ).toBe(false);
    expect((await provider.authenticateRequest({ 'x-api-key': WRONG_LENGTH })).active).toBe(false);
    expect((await provider.authenticateRequest({ 'x-api-key': REAL_KEY })).agentId).toBe(
      'legacy-api-key'
    );
  });
});

describe('authenticateOrReject', () => {
  it('returns an inactive result when authentication throws', async () => {
    const failing = async () => {
      throw new RangeError('boom');
    };
    await expect(authenticateOrReject(failing, {} as never)).resolves.toEqual({ active: false });
  });

  it('passes through a successful result', async () => {
    const ok = async () => ({ active: true, agentId: 'a' });
    await expect(authenticateOrReject(ok, {} as never)).resolves.toEqual({
      active: true,
      agentId: 'a',
    });
  });
});
