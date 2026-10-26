/**
 * Provisioned-client secret expiry and rotation overlap (Trust review of #611 B3),
 * and the authorization_code refusal (B4/N2), at the service level with a clock.
 */
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  clientSecretAccepted,
  getOAuth21Service,
  PROVISIONED_NO_BROWSER_ERROR,
  PROVISIONED_SECRET_EXPIRED_ERROR,
} from '../oauth21';
import { adminProvisioningActor } from '../admin-client-provisioning';

const svc = () => getOAuth21Service({ legacyApiKey: '', migrationMode: 'permissive' });
const DAY = 86_400_000;

function provisioned(secretExpiresAt: number) {
  return svc().registerClient({
    clientName: 'prov',
    redirectUris: [],
    scopes: ['tools:read'],
    clientType: 'confidential',
    provisioning: { ownerUserId: 'joseph', purpose: 'smoke-mcp-auth', secretExpiresAt },
  });
}

describe('provisioned client secret', () => {
  it('is refused at and after expiry, with a clear error', () => {
    const { clientId, clientSecret } = provisioned(Date.now() - 1);
    expect(() =>
      svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['tools:read'] })
    ).toThrow(PROVISIONED_SECRET_EXPIRED_ERROR);
    expect(svc().verifyClientSecret(clientId, clientSecret)).toBe(false);
  });

  it('works before expiry', () => {
    const { clientId, clientSecret } = provisioned(Date.now() + DAY);
    expect(svc().exchangeClientCredentials({ clientId, clientSecret, scopes: ['tools:read'] }).scope).toBe('tools:read');
  });

  it('rotate: the old secret works only inside the overlap, the new one until its own expiry', () => {
    const now = Date.now();
    const { clientId, clientSecret: oldSecret } = provisioned(now + DAY);
    const r = svc().rotateProvisionedSecret(clientId, { overlapMs: 60_000, ttlMs: 90 * DAY, rotatedBy: 'brian', now })!;
    const client = svc().getClient(clientId)!;
    expect(client.provisioning?.ownerUserId).toBe('joseph');
    expect(client.provisioning?.rotatedBy).toBe('brian');
    expect(clientSecretAccepted(client, oldSecret, now + 30_000)).toBe(true);
    expect(clientSecretAccepted(client, oldSecret, now + 60_001)).toBe(false);
    expect(clientSecretAccepted(client, r.clientSecret, now + 89 * DAY)).toBe(true);
    expect(clientSecretAccepted(client, r.clientSecret, now + 90 * DAY)).toBe(false);
  });

  it('rotate is refused for a client that is not provisioned', () => {
    const plain = svc().registerClient({ clientName: 'p', redirectUris: ['http://localhost/cb'], scopes: ['tools:read'] });
    expect(svc().rotateProvisionedSecret(plain.clientId, { overlapMs: 1, ttlMs: DAY, rotatedBy: 'x' })).toBeNull();
  });

  it('never issues an authorization code', () => {
    const { clientId } = provisioned(Date.now() + DAY);
    expect(() =>
      svc().createAuthorizationCode({
        clientId,
        redirectUri: 'http://localhost/cb',
        scopes: ['tools:read'],
        codeChallenge: createHash('sha256').update('v'.repeat(48)).digest('base64url'),
        codeChallengeMethod: 'S256',
      })
    ).toThrow(PROVISIONED_NO_BROWSER_ERROR);
  });
});

describe('adminProvisioningActor', () => {
  const ok = () => 'joseph';
  it('refuses keys in the URL before reading anything else', () => {
    for (const q of ['apiKey=k', 'key=k', 'api_key=k']) {
      expect(adminProvisioningActor({ url: `/oauth/admin/clients?${q}`, headers: {} }, ok)).toMatchObject({ ok: false, status: 400 });
    }
  });
  it('refuses any key or bearer header', () => {
    for (const h of ['authorization', 'x-api-key', 'x-mcp-api-key']) {
      expect(adminProvisioningActor({ url: '/oauth/admin/clients', headers: { [h]: 'k', 'x-studio-consent': 'a' } }, ok)).toMatchObject({ ok: false, status: 401 });
    }
  });
  it('needs a verified human admin session', () => {
    expect(adminProvisioningActor({ url: '/oauth/admin/clients', headers: {} }, () => null)).toMatchObject({ ok: false, status: 401 });
    expect(adminProvisioningActor({ url: '/oauth/admin/clients', headers: { 'x-studio-consent': 'a' } }, ok)).toEqual({ ok: true, userId: 'joseph' });
  });
});