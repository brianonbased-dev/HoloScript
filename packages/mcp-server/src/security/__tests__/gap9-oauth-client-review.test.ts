/**
 * Muse Gap 9: open self-registration with public social scopes, human consent
 * for everything else, suspend, credits/check identity, abuse limits.
 */
import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getOAuth21Service, resetOAuth21Service, CONSENT_REQUIRED_ERROR } from '../oauth21';
import {
  consentFreeScopes,
  expandScopes,
  getInvalidPublicOAuthScopes,
  OAuth2Provider,
  PUBLIC_SOCIAL_SCOPES,
} from '../../auth/oauth2-provider';
import { InMemoryTokenStore, isClientNotApprovedError } from '../../auth/token-store';
import { resetConsentReplayGuard, signStudioConsent, verifyStudioConsent } from '../studio-consent';
import { creditCheckSubject } from '../credit-check-subject';
import { FixedWindowLimiter, registrationsPerIpPerHour } from '../client-abuse-limits';
import { authorizeToolCall, PUBLIC_SOCIAL_TOOL_SCOPES } from '../tool-scopes';

const SECRET = 'x'.repeat(40);
const VERIFIER = 'v'.repeat(48);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const REDIRECT = 'http://localhost/cb';

function svc() {
  return getOAuth21Service({ legacyApiKey: '', migrationMode: 'permissive' });
}

function register(selfRegistered: boolean, scopes = ['social', 'tools:read', 'tools:execute']) {
  return svc().registerClient({
    clientName: 'gap9-test',
    redirectUris: [REDIRECT],
    scopes,
    clientType: 'confidential',
    ...(selfRegistered ? { selfRegistered: true } : {}),
  });
}

function codeFlow(
  clientId: string,
  clientSecret: string,
  scopes: string[],
  consent?: { userId: string; grantId: string; scopes?: string[] }
) {
  const code = svc().createAuthorizationCode({
    clientId,
    redirectUri: REDIRECT,
    scopes,
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    ...(consent ? { consent } : {}),
  });
  return svc().exchangeAuthorizationCode({
    code,
    clientId,
    clientSecret,
    redirectUri: REDIRECT,
    codeVerifier: VERIFIER,
  });
}

beforeEach(() => {
  resetOAuth21Service();
  resetConsentReplayGuard();
});
afterEach(() => resetOAuth21Service());

describe('(a) public social scope set', () => {
  it('social is a public scope and expands only to social:read/social:write', () => {
    expect(getInvalidPublicOAuthScopes(['social'])).toEqual([]);
    expect(getInvalidPublicOAuthScopes(['admin'])).toEqual(['admin']);
    expect(PUBLIC_SOCIAL_SCOPES).toEqual(['social']);
    expect(expandScopes(['social']).sort()).toEqual(['social:read', 'social:write']);
  });

  it('social reaches every listed social tool and nothing that touches human data', () => {
    const social = expandScopes(['social']);
    for (const tool of Object.keys(PUBLIC_SOCIAL_TOOL_SCOPES)) {
      expect(authorizeToolCall(tool, social).authorized, tool).toBe(true);
    }
    for (const tool of [
      'holo_memory_store',
      'workflow_memory_write',
      'workflow_memory_read',
      'execute_workflow',
      'create_share_link',
      'generate_scene',
      'holomesh_crosspost_moltbook',
      'holomesh_wallet_status',
      'holomesh_board_add',
    ]) {
      expect(authorizeToolCall(tool, social).authorized, tool).toBe(false);
    }
  });

  it('control: tools:write still reaches the social write tools', () => {
    expect(authorizeToolCall('holomesh_reply', ['tools:write']).authorized).toBe(true);
  });
});

describe('(b) human consent for non-social scopes', () => {
  it('consentFreeScopes narrows a self-registered client only, and only without consent', () => {
    const asked = ['social', 'tools:execute'];
    expect(consentFreeScopes({ selfRegistered: true }, asked, undefined)).toEqual(['social']);
    expect(consentFreeScopes({ selfRegistered: true }, asked, { userId: 'u1' })).toEqual(asked);
    expect(consentFreeScopes({}, asked, undefined)).toEqual(asked);
  });

  it('without a session, authorize grants a self-registered client social only', () => {
    const c = register(true);
    const tok = codeFlow(c.clientId, c.clientSecret, ['social', 'tools:execute']);
    expect(tok.scope).toBe('social');
    const intro = svc().introspect(tok.access_token);
    expect(intro.userId).toBeUndefined();
  });

  it('without a session, asking only for non-social scopes is consent_required', () => {
    const c = register(true);
    expect(() => codeFlow(c.clientId, c.clientSecret, ['tools:execute'])).toThrow(
      CONSENT_REQUIRED_ERROR
    );
  });

  it('with consent, the token carries user_id and grant id, limited to what the human approved', () => {
    const c = register(true);
    const tok = codeFlow(c.clientId, c.clientSecret, ['social', 'tools:execute', 'tools:read'], {
      userId: 'user-42',
      grantId: 'grant_abc',
      scopes: ['social', 'tools:execute'],
    });
    expect(tok.scope.split(' ').sort()).toEqual(['social', 'tools:execute']);
    const intro = svc().introspect(tok.access_token);
    expect(intro.userId).toBe('user-42');
    expect(intro.grantId).toBe('grant_abc');
    // refresh keeps the human
    const r = svc().refreshAccessToken({
      refreshToken: tok.refresh_token!,
      clientId: c.clientId,
      clientSecret: c.clientSecret,
    });
    expect(svc().introspect(r.access_token).userId).toBe('user-42');
  });

  it('control: a pre-provisioned (not self-registered) client is unchanged', () => {
    const c = register(false);
    const tok = codeFlow(c.clientId, c.clientSecret, ['tools:execute']);
    expect(tok.scope).toContain('tools');
  });

  it('studio consent assertions verify only with the secret, the right client, and in time', () => {
    const a = signStudioConsent({ sub: 'u1', cid: 'hsc_1', scp: ['tools:execute'] }, SECRET);
    expect(verifyStudioConsent(a, 'hsc_1', SECRET)?.userId).toBe('u1');
    expect(verifyStudioConsent(a, 'hsc_2', SECRET)).toBeNull();
    expect(verifyStudioConsent(a, 'hsc_1', 'y'.repeat(40))).toBeNull();
    expect(verifyStudioConsent(a, 'hsc_1', undefined)).toBeNull();
    expect(verifyStudioConsent(a, 'hsc_1', SECRET, Date.now() + 10 * 60_000)).toBeNull();
    const tampered = a.replace(/\.([^.]+)\./, (_m, p) => `.${p}A.`);
    expect(verifyStudioConsent(tampered, 'hsc_1', SECRET)).toBeNull();
    expect(verifyStudioConsent('garbage', 'hsc_1', SECRET)).toBeNull();
  });
});

describe('(c) client_credentials is limited to public social scopes', () => {
  it('a self-registered client gets social only via client_credentials', () => {
    const c = register(true);
    const tok = svc().exchangeClientCredentials({
      clientId: c.clientId,
      clientSecret: c.clientSecret,
      scopes: ['social', 'tools:execute'],
    });
    expect(tok.scope).toBe('social');
    expect(() =>
      svc().exchangeClientCredentials({
        clientId: c.clientId,
        clientSecret: c.clientSecret,
        scopes: ['tools:execute'],
      })
    ).toThrow(CONSENT_REQUIRED_ERROR);
  });
});

describe('(d) credits/check takes the user from the token', () => {
  it('uses the token user and refuses a mismatching body userId', () => {
    expect(creditCheckSubject({ userId: 'u1', scopes: ['social:read'] }, undefined)).toEqual({
      ok: true,
      userId: 'u1',
    });
    expect(creditCheckSubject({ userId: 'u1', scopes: [] }, 'u1')).toEqual({
      ok: true,
      userId: 'u1',
    });
    expect(creditCheckSubject({ userId: 'u1', scopes: ['admin:*'] }, 'victim')).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('a token with no user cannot name one (the old cross-user oracle)', () => {
    expect(creditCheckSubject({ scopes: ['tools:read', 'tools:write'] }, 'victim')).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('control: an operator key with no user (Studio server) may still name the user', () => {
    expect(creditCheckSubject({ scopes: ['admin:*', 'tools:admin'] }, 'u9')).toEqual({
      ok: true,
      userId: 'u9',
    });
  });
});

describe('(e) suspend', () => {
  it('in-memory: suspend refuses every grant, kills live tokens, keeps the record; approve restores sign-in', () => {
    const c = register(true);
    const tok = codeFlow(c.clientId, c.clientSecret, ['social']);
    expect(svc().introspect(tok.access_token).active).toBe(true);
    expect(svc().setClientStatus(c.clientId, 'suspended')).toBe(true);
    expect(svc().introspect(tok.access_token).active).toBe(false);
    expect(svc().getClient(c.clientId)?.status).toBe('suspended');
    let caught: unknown;
    try {
      codeFlow(c.clientId, c.clientSecret, ['social']);
    } catch (e) {
      caught = e;
    }
    expect(isClientNotApprovedError(caught)).toBe(true);
    expect(() =>
      svc().refreshAccessToken({
        refreshToken: tok.refresh_token!,
        clientId: c.clientId,
        clientSecret: c.clientSecret,
      })
    ).toThrow();
    svc().setClientStatus(c.clientId, 'approved');
    expect(svc().introspect(tok.access_token).active).toBe(false); // old token stays dead
    expect(codeFlow(c.clientId, c.clientSecret, ['social']).scope).toBe('social');
  });

  it('durable: suspend deletes the client tokens, keeps the row, and introspect goes inactive', async () => {
    const provider = new OAuth2Provider({ backend: new InMemoryTokenStore() });
    const reg = await provider.registerClient({
      clientName: 'gap9-durable',
      redirectUris: [REDIRECT],
      scopes: ['social'],
      selfRegistered: true,
    });
    const now = Date.now();
    await provider.importAccessToken({
      token: 'at-1',
      clientId: reg.clientId,
      scopes: ['social'],
      issuedAt: now,
      expiresAt: now + 60_000,
      userId: 'u1',
      grantId: 'g1',
    });
    expect(await provider.introspect('at-1')).toMatchObject({
      active: true,
      userId: 'u1',
      grantId: 'g1',
    });
    const out = await provider.setClientStatus(reg.clientId, 'suspended');
    expect(out).toMatchObject({ found: true, accessTokensDeleted: 1 });
    expect((await provider.getClient(reg.clientId))?.status).toBe('suspended');
    expect((await provider.getClient(reg.clientId))?.selfRegistered).toBe(true);
    expect((await provider.introspect('at-1')).active).toBe(false);
    expect(await provider.setClientStatus('nope', 'suspended')).toMatchObject({ found: false });
    provider.destroy();
  });

  it('durable: a rewrite that names no status never un-suspends', async () => {
    const backend = new InMemoryTokenStore();
    const provider = new OAuth2Provider({ backend });
    const reg = await provider.registerClient({
      clientName: 'x',
      redirectUris: [],
      scopes: ['social'],
    });
    await provider.setClientStatus(reg.clientId, 'suspended');
    const row = (await backend.getClient(reg.clientId))!;
    const { status: _drop, ...rest } = row;
    await backend.setClient(rest);
    expect((await backend.getClient(reg.clientId))?.status).toBe('suspended');
    provider.destroy();
  });
});

describe('(e) abuse limits', () => {
  it('fixed window: allows the limit, refuses the next, resets after the window', () => {
    const l = new FixedWindowLimiter(1000);
    for (let i = 0; i < 3; i++) expect(l.hit('ip', 3, 0).allowed).toBe(true);
    expect(l.hit('ip', 3, 10).allowed).toBe(false);
    expect(l.hit('other', 3, 10).allowed).toBe(true);
    expect(l.hit('ip', 3, 1001).allowed).toBe(true);
  });

  it('registration per-IP default and override', () => {
    expect(registrationsPerIpPerHour({})).toBe(20);
    expect(registrationsPerIpPerHour({ OAUTH_REGISTER_PER_IP_PER_HOUR: '5' })).toBe(5);
    expect(registrationsPerIpPerHour({ OAUTH_REGISTER_PER_IP_PER_HOUR: 'nope' })).toBe(20);
  });
});
