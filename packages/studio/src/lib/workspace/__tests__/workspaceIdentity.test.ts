import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOUNDER_RECOGNITION_UNCONFIGURED_MESSAGE,
  FOUNDER_WORKSPACE_ID,
  founderRecognitionConfig,
  isFounderWorkspaceIdentity,
  resolveWorkspaceIdForIdentity,
} from '../workspaceIdentity';

/**
 * Round 6 doors audit: founder authority must not be reachable by anything the
 * person signing in can type for themselves.
 */

const FOUNDER_GITHUB_ID = '10427327';
const FOUNDER_GOOGLE_ID = '104271234567890123456';
const FOUNDER_LOGIN = 'founder-login';
const FOUNDER_EMAIL = 'founder@example.test';

/** The configuration a deployment must carry for a founder to be recognised. */
function configureFounder(): void {
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', FOUNDER_GITHUB_ID);
  vi.stubEnv('STUDIO_FOUNDER_GOOGLE_IDS', FOUNDER_GOOGLE_ID);
  vi.stubEnv('STUDIO_FOUNDER_EMAILS', FOUNDER_EMAIL);
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_USERS', FOUNDER_LOGIN);
}

function configureNoFounder(): void {
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', '');
  vi.stubEnv('STUDIO_FOUNDER_GOOGLE_IDS', '');
  vi.stubEnv('STUDIO_FOUNDER_EMAILS', '');
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_USERS', '');
}

describe('founder recognition', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('never treats a chosen display name as the founder', () => {
    configureFounder();

    // Every one of these is a name the person signing in types themselves.
    expect(isFounderWorkspaceIdentity({ provider: 'github', name: FOUNDER_LOGIN })).toBe(false);
    expect(isFounderWorkspaceIdentity({ provider: 'github', name: 'josep' })).toBe(false);
    expect(isFounderWorkspaceIdentity({ provider: 'google', name: FOUNDER_EMAIL })).toBe(false);
    expect(
      isFounderWorkspaceIdentity({
        provider: 'google',
        name: FOUNDER_LOGIN,
        email: 'someone-else@example.test',
        emailVerified: true,
      })
    ).toBe(false);
  });

  it('recognises the founder by GitHub numeric account id whatever the display name says', () => {
    configureFounder();

    expect(
      isFounderWorkspaceIdentity({
        provider: 'github',
        providerAccountId: FOUNDER_GITHUB_ID,
        name: 'Somebody Else Entirely',
      })
    ).toBe(true);
    expect(
      isFounderWorkspaceIdentity({ provider: 'github', providerAccountId: '999999999' })
    ).toBe(false);
  });

  it('accepts a configured email only from a Google sign-in, and never over a refusal', () => {
    configureFounder();

    expect(
      isFounderWorkspaceIdentity({ provider: 'google', email: FOUNDER_EMAIL, emailVerified: true })
    ).toBe(true);
    // An explicit `false` stays a refusal. This is what keeps the API-key and
    // benchmark callers — which set the flag false on purpose — non-founder.
    expect(
      isFounderWorkspaceIdentity({ provider: 'google', email: FOUNDER_EMAIL, emailVerified: false })
    ).toBe(false);
    // GitHub sends no verified-email claim and its profile email can be any
    // address, so the email branch is unreachable from a GitHub sign-in.
    expect(
      isFounderWorkspaceIdentity({ provider: 'github', email: FOUNDER_EMAIL, emailVerified: true })
    ).toBe(false);
    expect(isFounderWorkspaceIdentity({ email: FOUNDER_EMAIL, emailVerified: true })).toBe(false);
  });

  it('recognises the founder by Google account id whatever the display name says', () => {
    configureFounder();

    expect(
      isFounderWorkspaceIdentity({
        provider: 'google',
        providerAccountId: FOUNDER_GOOGLE_ID,
        name: 'Somebody Else Entirely',
      })
    ).toBe(true);
    // An account id is only ever matched against the provider that issued it.
    expect(
      isFounderWorkspaceIdentity({ provider: 'github', providerAccountId: FOUNDER_GOOGLE_ID })
    ).toBe(false);
    expect(
      isFounderWorkspaceIdentity({ provider: 'google', providerAccountId: FOUNDER_GITHUB_ID })
    ).toBe(false);
  });

  it('keeps the founder recognised on a Google token minted before emailVerified existed', () => {
    configureFounder();

    // Sessions are 30-day JWTs and a token only gains a field when it is
    // minted, so `emailVerified` is absent from every token issued before this
    // field shipped. Absent means "unknown", not "the provider said no" — if it
    // meant no, the founder would lose his own surfaces at deploy and stay
    // locked out until his token expired.
    expect(isFounderWorkspaceIdentity({ provider: 'google', email: FOUNDER_EMAIL })).toBe(true);
    // The allowance is for the configured address only, not for any Google user.
    expect(
      isFounderWorkspaceIdentity({ provider: 'google', email: 'someone-else@example.test' })
    ).toBe(false);
  });

  it('accepts the configured GitHub login only from a GitHub sign-in', () => {
    configureFounder();

    expect(isFounderWorkspaceIdentity({ provider: 'github', githubUsername: FOUNDER_LOGIN })).toBe(
      true
    );
    // A Google sign-in cannot present somebody else's GitHub login.
    expect(isFounderWorkspaceIdentity({ provider: 'google', githubUsername: FOUNDER_LOGIN })).toBe(
      false
    );
    expect(isFounderWorkspaceIdentity({ githubUsername: FOUNDER_LOGIN })).toBe(false);
  });

  it('recognises nobody when no founder is configured, and names what is missing', () => {
    configureNoFounder();

    expect(founderRecognitionConfig().configured).toBe(false);
    expect(
      isFounderWorkspaceIdentity({
        provider: 'github',
        githubUsername: 'brianonbased-dev',
        name: 'josep',
        email: 'anybody@example.test',
        emailVerified: true,
      })
    ).toBe(false);

    for (const variableName of [
      'STUDIO_FOUNDER_GITHUB_IDS',
      'STUDIO_FOUNDER_GOOGLE_IDS',
      'STUDIO_FOUNDER_EMAILS',
      'STUDIO_FOUNDER_GITHUB_USERS',
    ]) {
      expect(FOUNDER_RECOGNITION_UNCONFIGURED_MESSAGE).toContain(variableName);
    }
  });

  it('ignores an identity with nothing in it', () => {
    configureFounder();

    expect(isFounderWorkspaceIdentity(null)).toBe(false);
    expect(isFounderWorkspaceIdentity({})).toBe(false);
  });
});

describe('workspace identity resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps founder identities on the founder workspace', () => {
    configureFounder();

    expect(
      resolveWorkspaceIdForIdentity({ provider: 'github', providerAccountId: FOUNDER_GITHUB_ID })
    ).toBe(FOUNDER_WORKSPACE_ID);
    expect(
      resolveWorkspaceIdForIdentity({ provider: 'github', githubUsername: FOUNDER_LOGIN })
    ).toBe(FOUNDER_WORKSPACE_ID);
  });

  it('does not send a look-alike display name to the founder workspace', () => {
    configureFounder();

    expect(
      resolveWorkspaceIdForIdentity({
        id: 'user-9',
        provider: 'github',
        githubUsername: 'octocat',
        name: FOUNDER_LOGIN,
      })
    ).toBe('ws_octocat');
  });

  it('does not default a non-founder user to ai-ecosystem', () => {
    configureFounder();

    const workspaceId = resolveWorkspaceIdForIdentity({
      id: 'user-1',
      provider: 'github',
      githubUsername: 'octocat',
      email: 'octocat@example.com',
    });

    expect(workspaceId).toBe('ws_octocat');
    expect(workspaceId).not.toBe(FOUNDER_WORKSPACE_ID);
  });

  it('uses the public Studio fallback when no session identity is available', () => {
    configureFounder();

    expect(resolveWorkspaceIdForIdentity(null)).toBe('studio-workspace');
  });

  it('refuses a non-founder request for ai-ecosystem and falls back to their account workspace', () => {
    configureFounder();

    const workspaceId = resolveWorkspaceIdForIdentity(
      { id: 'user-2', provider: 'github', githubUsername: 'builder' },
      { requestedWorkspaceId: FOUNDER_WORKSPACE_ID }
    );

    expect(workspaceId).toBe('ws_builder');
  });

  it('allows explicit founder mode to target ai-ecosystem', () => {
    configureFounder();

    const workspaceId = resolveWorkspaceIdForIdentity(
      { id: 'user-3', provider: 'github', githubUsername: 'assistant' },
      { requestedWorkspaceId: FOUNDER_WORKSPACE_ID, allowFounderWorkspace: true }
    );

    expect(workspaceId).toBe(FOUNDER_WORKSPACE_ID);
  });
});
