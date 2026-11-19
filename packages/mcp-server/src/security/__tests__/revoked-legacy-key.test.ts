/**
 * A revoked key stays refused on the legacy single-key checks too, even while
 * it is still the configured env value. Those checks compare against the env
 * var directly, so they must consult the revocation set by fingerprint.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addRevokedFingerprint,
  isKeyRevoked,
  keyFingerprint,
  markKeyRevoked,
  revokedFingerprintList,
  _resetRevokedKeysForTests,
} from '../revoked-keys';
import { OAuth21Service } from '../oauth21';
import { OAuth2Provider } from '../../auth/oauth2-provider';
import { validatePartnerRegistryCredentials } from '../../partner-registry-route';

const LEGACY = 'legacy-single-key-value-for-test';

afterEach(() => {
  _resetRevokedKeysForTests();
  vi.restoreAllMocks();
});

describe('revoked key set', () => {
  it('stores fingerprints only and matches by value', () => {
    markKeyRevoked(LEGACY);
    expect(isKeyRevoked(LEGACY)).toBe(true);
    expect(isKeyRevoked('some-other-value')).toBe(false);
    expect(isKeyRevoked(undefined)).toBe(false);
    expect(revokedFingerprintList()).toEqual([keyFingerprint(LEGACY)]);
    expect(JSON.stringify(revokedFingerprintList())).not.toContain(LEGACY);
  });

  it('accepts only sha256 hex fingerprints from disk', () => {
    expect(addRevokedFingerprint('not-a-fingerprint')).toBe(false);
    expect(addRevokedFingerprint(keyFingerprint(LEGACY))).toBe(true);
    expect(isKeyRevoked(LEGACY)).toBe(true);
  });
});

describe('OAuth legacy key check', () => {
  function service(): OAuth21Service {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    return new OAuth21Service({
      legacyApiKey: LEGACY,
      migrationMode: 'permissive',
      tokenSecret: 'x'.repeat(64),
    });
  }

  it('accepts the configured key while it is not revoked', () => {
    expect(service().validateLegacyKey(LEGACY).active).toBe(true);
  });

  it('refuses the configured key once it is revoked', () => {
    const svc = service();
    markKeyRevoked(LEGACY);
    expect(svc.validateLegacyKey(LEGACY)).toEqual({ active: false });
  });
});

describe('OAuth2Provider legacy key check', () => {
  it('refuses the configured key once it is revoked', async () => {
    const provider = new OAuth2Provider({ legacyApiKey: LEGACY, migrationMode: 'permissive' });
    expect((await provider.authenticateRequest({ 'x-api-key': LEGACY })).active).toBe(true);
    markKeyRevoked(LEGACY);
    expect((await provider.authenticateRequest({ 'x-api-key': LEGACY })).active).toBe(false);
    expect((await provider.authenticateRequest({ authorization: `Bearer ${LEGACY}` })).active).toBe(
      false
    );
  });
});

describe('partner registry credential check', () => {
  it('refuses a revoked key that still equals the configured value', () => {
    const headers = { 'x-api-key': LEGACY };
    expect(validatePartnerRegistryCredentials(headers, LEGACY).status).toBe(200);
    markKeyRevoked(LEGACY);
    expect(validatePartnerRegistryCredentials(headers, LEGACY).status).toBe(401);
  });
});
