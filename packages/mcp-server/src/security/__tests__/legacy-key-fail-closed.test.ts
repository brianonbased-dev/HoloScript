/**
 * Open dev mode must never reach production.
 *
 * Both OAuth modules (security/oauth21.ts and auth/oauth2-provider.ts) granted
 * `admin:*` when HOLOSCRIPT_API_KEY was missing: to a caller who sent no
 * credentials ('open-dev-mode') and to a caller who sent ANY key
 * ('legacy-open-dev'). A blank key counted as present in one branch and absent
 * in another. In production a missing or blank key must refuse.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuth21Service } from '../oauth21';
import { OAuth2Provider } from '../../auth/oauth2-provider';

const REAL_KEY = 'hs_live_key_for_tests_0123456789abcdef';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ['missing', ''],
  ['blank', '   '],
])('production with a %s HOLOSCRIPT_API_KEY', (_label, legacyApiKey) => {
  it('OAuth21Service.validateLegacyKey refuses any presented key', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const svc = new OAuth21Service({ legacyApiKey, migrationMode: 'permissive', tokenSecret: 'x'.repeat(64) });
    const r = svc.validateLegacyKey('anything-at-all');
    expect(r.active).toBe(false);
    expect(r.scopes).toBeUndefined();
  });

  it('OAuth21Service.authenticateRequest refuses no-credential and any-key callers', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const svc = new OAuth21Service({ legacyApiKey, migrationMode: 'permissive', tokenSecret: 'x'.repeat(64) });
    expect(svc.authenticateRequest({}).active).toBe(false);
    expect(svc.authenticateRequest({ 'x-api-key': 'guess' }).active).toBe(false);
    expect(svc.authenticateRequest({ 'x-mcp-api-key': 'guess' }).active).toBe(false);
    expect(svc.authenticateRequest({ authorization: 'Bearer guess' }).active).toBe(false);
  });

  it('OAuth2Provider.authenticateRequest refuses no-credential and any-key callers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const provider = new OAuth2Provider({ legacyApiKey, migrationMode: 'permissive' });
    expect((await provider.authenticateRequest({})).active).toBe(false);
    expect((await provider.authenticateRequest({ 'x-api-key': 'guess' })).active).toBe(false);
    expect((await provider.authenticateRequest({ authorization: 'Bearer guess' })).active).toBe(false);
  });
});

describe('production with a configured HOLOSCRIPT_API_KEY', () => {
  it('accepts the right key and refuses a wrong one (both modules)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const svc = new OAuth21Service({ legacyApiKey: REAL_KEY, migrationMode: 'permissive', tokenSecret: 'x'.repeat(64) });
    expect(svc.authenticateRequest({ 'x-api-key': REAL_KEY }).agentId).toBe('legacy-api-key');
    expect(svc.authenticateRequest({ 'x-api-key': 'wrong' }).active).toBe(false);
    expect(svc.authenticateRequest({}).active).toBe(false);

    const provider = new OAuth2Provider({ legacyApiKey: REAL_KEY, migrationMode: 'permissive' });
    expect((await provider.authenticateRequest({ 'x-api-key': REAL_KEY })).agentId).toBe('legacy-api-key');
    expect((await provider.authenticateRequest({ 'x-api-key': 'wrong' })).active).toBe(false);
  });
});

describe('local development keeps the documented open dev mode', () => {
  it('no key outside production still opens (OAuth21Service and OAuth2Provider)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const svc = new OAuth21Service({ legacyApiKey: '', migrationMode: 'permissive', tokenSecret: 'x'.repeat(64) });
    expect(svc.authenticateRequest({}).agentId).toBe('open-dev-mode');
    expect(svc.validateLegacyKey('anything').agentId).toBe('legacy-open-dev');

    const provider = new OAuth2Provider({ legacyApiKey: '', migrationMode: 'permissive' });
    expect((await provider.authenticateRequest({})).agentId).toBe('open-dev-mode');
  });

  it('strict migration mode refuses legacy keys everywhere', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const svc = new OAuth21Service({ legacyApiKey: '', migrationMode: 'strict', tokenSecret: 'x'.repeat(64) });
    expect(svc.authenticateRequest({}).active).toBe(false);
    expect(svc.validateLegacyKey('anything').active).toBe(false);
  });
});
