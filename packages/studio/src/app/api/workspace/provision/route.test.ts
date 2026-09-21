import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getGitHubToken: vi.fn(),
  provisionUser: vi.fn(),
  putUserSecret: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/app/api/github/_shared', () => ({
  getGitHubToken: mocks.getGitHubToken,
  GITHUB_API_BASE_URL: 'https://github.test/api',
  createGitHubHeaders: (token: string) => ({ Authorization: `Bearer ${token}` }),
}));

vi.mock('@/lib/workspace/provisionUser', () => ({
  provisionUser: mocks.provisionUser,
}));

vi.mock('@/lib/secrets/userSecretStore', () => ({
  putUserSecret: mocks.putUserSecret,
}));

import { POST } from './route';

const USER_ID = 'user-provision-1';
const HOLOMESH_KEY = 'hs_sk_one_time_workspace_key';
/** The GitHub login and the provider's own immutable numeric id for this session. */
const GITHUB_LOGIN = 'octocat';
const GITHUB_ACCOUNT_ID = '583231';
/** Freely chosen by whoever signs in, so it must never reach provisioning. */
const DISPLAY_NAME = 'Provision User';

function provisionRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('https://studio.test/api/workspace/provision', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function successfulProvision(holomeshApiKey: string | null = HOLOMESH_KEY) {
  return {
    success: true,
    user: {
      workspaceId: 'workspace-1',
      repoUrl: 'https://github.com/example/workspace-1',
      repoName: 'workspace-1',
      tier: 'free',
      capabilities: ['compile'],
      accountWorkspace: '/workspace-1',
      scaffolded: true,
      daemonStarted: false,
      holomeshAgentId: 'agent-workspace-1',
      ...(holomeshApiKey === null ? {} : { holomeshApiKey }),
      holomeshWalletAddress: '0x0000000000000000000000000000000000000001',
    },
    steps: [{ id: 'complete', status: 'done' }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The session fields provisioning is allowed to read. A GitHub sign-in
  // carries the login and the provider's immutable numeric id; the display
  // name is present so the assertions below can prove it never stands in for
  // either of them.
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: USER_ID,
      name: DISPLAY_NAME,
      email: 'user@example.test',
      provider: 'github',
      githubUsername: GITHUB_LOGIN,
      providerAccountId: GITHUB_ACCOUNT_ID,
    },
  });
  // The credential that does the provisioning work may be a server one; the
  // credential that says WHO the caller is must not be. Two answers, so the
  // tests below can tell the two uses apart.
  mocks.getGitHubToken.mockImplementation(
    async (_request: unknown, options?: { userOnly?: boolean }) =>
      options?.userOnly ? null : 'github-access-token'
  );
  mocks.provisionUser.mockResolvedValue(successfulProvision());
  mocks.putUserSecret.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/workspace/provision HoloMesh credential custody', () => {
  it('stores the provisioned key in the authenticated owner vault', async () => {
    const response = await POST(provisionRequest({ projectName: 'Workspace One' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.putUserSecret).toHaveBeenCalledOnce();
    expect(mocks.putUserSecret).toHaveBeenCalledWith({
      ownerId: USER_ID,
      name: 'HOLOMESH_API_KEY',
      value: HOLOMESH_KEY,
    });
    expect(body.holomeshCredentialStored).toBe(true);
    expect(body.user.holomeshApiKey).toBe(HOLOMESH_KEY);
    expect(JSON.stringify(body).split(HOLOMESH_KEY)).toHaveLength(2);
  });

  it.each([
    ['unconfigured vault', new Error('vault is not configured')],
    ['vault write failure', new Error('encrypted store unavailable')],
  ])('keeps provisioning successful when the %s occurs', async (_label, vaultError) => {
    mocks.putUserSecret.mockRejectedValue(vaultError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const response = await POST(provisionRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.holomeshCredentialStored).toBe(false);
      expect(body.user.holomeshApiKey).toBe(HOLOMESH_KEY);
      expect(JSON.stringify(body)).not.toContain(vaultError.message);
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
      consoleLog.mockRestore();
    }
  });

  it('does not touch the vault when provisioning returns no HoloMesh key', async () => {
    mocks.provisionUser.mockResolvedValue(successfulProvision(null));

    const response = await POST(provisionRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.holomeshCredentialStored).toBe(false);
    expect(body.user).not.toHaveProperty('holomeshApiKey');
    expect(mocks.putUserSecret).not.toHaveBeenCalled();
  });

  it('does not provision or store anything for an unauthenticated request', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await POST(provisionRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Authentication required' });
    expect(mocks.getGitHubToken).not.toHaveBeenCalled();
    expect(mocks.provisionUser).not.toHaveBeenCalled();
    expect(mocks.putUserSecret).not.toHaveBeenCalled();
  });

  it('does not store a key when workspace provisioning fails', async () => {
    mocks.provisionUser.mockResolvedValue({
      success: false,
      error: 'workspace provisioning rejected',
      errorStatus: 422,
      steps: [{ id: 'provision', status: 'failed' }],
    });

    const response = await POST(provisionRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: 'workspace provisioning rejected',
      steps: [{ id: 'provision', status: 'failed' }],
    });
    expect(body).not.toHaveProperty('holomeshCredentialStored');
    expect(mocks.putUserSecret).not.toHaveBeenCalled();
  });

  it('does not provision or store when the GitHub credential is unavailable', async () => {
    mocks.getGitHubToken.mockResolvedValue(null);

    const response = await POST(provisionRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/GitHub access token not available/);
    expect(mocks.provisionUser).not.toHaveBeenCalled();
    expect(mocks.putUserSecret).not.toHaveBeenCalled();
  });
});

/**
 * Which GitHub identity provisioning acts on.
 *
 * Provisioning creates repos and can mint a founder-tier orchestrator key, and
 * it used to be handed `session.user.name || session.user.id` in a field called
 * `githubUsername` — a display name, chosen freely by whoever signed in. These
 * cases pin what replaced it: an identity the caller cannot choose, proved by a
 * GitHub credential the caller actually holds, and a refusal when there is
 * none.
 */
type ProvisionCallInput = { githubUsername: string; githubAccountId: string };

function firstProvisionInput(): ProvisionCallInput {
  return mocks.provisionUser.mock.calls[0][0] as ProvisionCallInput;
}

function googleSession(): void {
  mocks.getServerSession.mockResolvedValue({
    user: {
      id: USER_ID,
      name: DISPLAY_NAME,
      email: 'user@example.test',
      provider: 'google',
      providerAccountId: 'google-subject-1',
    },
  });
}

describe('POST /api/workspace/provision GitHub identity', () => {
  it('provisions from the GitHub login and numeric id, never the display name', async () => {
    const response = await POST(provisionRequest({ projectName: 'Workspace One' }));

    expect(response.status).toBe(200);
    expect(mocks.provisionUser).toHaveBeenCalledOnce();
    const input = firstProvisionInput();
    expect(input.githubUsername).toBe(GITHUB_LOGIN);
    expect(input.githubAccountId).toBe(GITHUB_ACCOUNT_ID);
    expect(JSON.stringify(input)).not.toContain(DISPLAY_NAME);
  });

  it('refuses a session with no GitHub account, and provisions nothing', async () => {
    googleSession();
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await POST(provisionRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    // The caller is told what is missing and how to fix it — a closed door the
    // person can act on, not a silent failure.
    expect(body.error).toMatch(/GitHub/);
    expect(body.error).toMatch(/Sign in with GitHub/);
    expect(mocks.provisionUser).not.toHaveBeenCalled();
    expect(mocks.putUserSecret).not.toHaveBeenCalled();
    // Nothing to ask about, so GitHub was never asked.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lets a linked GitHub account provision a session that signed in elsewhere', async () => {
    googleSession();
    mocks.getGitHubToken.mockResolvedValue('linked-user-token');
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ login: GITHUB_LOGIN, id: Number(GITHUB_ACCOUNT_ID) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const response = await POST(provisionRequest());

    expect(response.status).toBe(200);
    const input = firstProvisionInput();
    expect(input.githubUsername).toBe(GITHUB_LOGIN);
    expect(input.githubAccountId).toBe(GITHUB_ACCOUNT_ID);
    expect(JSON.stringify(input)).not.toContain(DISPLAY_NAME);
  });

  it('never names the caller from a server-wide GitHub credential', async () => {
    googleSession();
    // The server credential is offered for the provisioning work and refused
    // for identity. Without `userOnly` this caller would be provisioned as
    // whoever owns that credential.
    mocks.getGitHubToken.mockImplementation(
      async (_request: unknown, options?: { userOnly?: boolean }) =>
        options?.userOnly ? null : 'server-wide-token'
    );
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await POST(provisionRequest());

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.getGitHubToken).toHaveBeenCalledWith(expect.anything(), { userOnly: true });
    expect(mocks.provisionUser).not.toHaveBeenCalled();
  });

  it('refuses when GitHub will not say who the linked credential belongs to', async () => {
    googleSession();
    mocks.getGitHubToken.mockResolvedValue('linked-user-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 403 }))
    );

    const response = await POST(provisionRequest());

    expect(response.status).toBe(400);
    expect(mocks.provisionUser).not.toHaveBeenCalled();
    expect(mocks.putUserSecret).not.toHaveBeenCalled();
  });
});
