import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function provisionRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/workspace/provision', {
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
  mocks.getServerSession.mockResolvedValue({
    user: { id: USER_ID, name: 'Provision User', email: 'user@example.test' },
  });
  mocks.getGitHubToken.mockResolvedValue('github-access-token');
  mocks.provisionUser.mockResolvedValue(successfulProvision());
  mocks.putUserSecret.mockResolvedValue(undefined);
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
