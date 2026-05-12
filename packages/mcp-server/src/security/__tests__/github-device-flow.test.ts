/**
 * GitHub Device Flow — unit tests (offline, no GitHub API calls).
 *
 * Uses fetch mocks to simulate the GitHub device authorization endpoint
 * and the access-token polling endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initiateDeviceFlow,
  pollDeviceFlow,
  exchangeForHoloMeshToken,
  getDeviceFlowStats,
} from '../github-device-flow';

const GITHUB_CLIENT_ID = 'test-client-id-123';

beforeEach(() => {
  process.env.GITHUB_DEVICE_FLOW_CLIENT_ID = GITHUB_CLIENT_ID;
  process.env.GITHUB_DEVICE_FLOW_CLIENT_SECRET = 'test-secret';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_DEVICE_FLOW_CLIENT_ID;
  delete process.env.GITHUB_DEVICE_FLOW_CLIENT_SECRET;
});

function mockFetchDeviceCode() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      device_code: 'dev-abc-123',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    }),
  } as unknown as Response);
}

function mockFetchAccessToken(body: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as unknown as Response);
}

describe('initiateDeviceFlow', () => {
  it('returns device code payload on success', async () => {
    vi.stubGlobal('fetch', mockFetchDeviceCode());

    const result = await initiateDeviceFlow('repo,user');

    expect(result.deviceCode).toBe('dev-abc-123');
    expect(result.userCode).toBe('ABCD-EFGH');
    expect(result.verificationUri).toBe('https://github.com/login/device');
    expect(result.expiresIn).toBe(900);
    expect(result.interval).toBe(5);
  });

  it('throws when GITHUB_DEVICE_FLOW_CLIENT_ID is missing', async () => {
    delete process.env.GITHUB_DEVICE_FLOW_CLIENT_ID;
    await expect(initiateDeviceFlow()).rejects.toThrow('GITHUB_DEVICE_FLOW_CLIENT_ID');
  });

  it('tracks session in stats', async () => {
    vi.stubGlobal('fetch', mockFetchDeviceCode());
    await initiateDeviceFlow();
    const stats = getDeviceFlowStats();
    expect(stats.pending).toBeGreaterThanOrEqual(1);
  });
});

describe('pollDeviceFlow', () => {
  it('returns access token when GitHub responds with token', async () => {
    vi.stubGlobal('fetch', mockFetchDeviceCode());
    const init = await initiateDeviceFlow();

    vi.stubGlobal(
      'fetch',
      mockFetchAccessToken({
        access_token: 'ghp_testtoken123',
        token_type: 'bearer',
        scope: 'repo,user',
      })
    );

    const result = await pollDeviceFlow(init.deviceCode);

    expect('access_token' in result).toBe(true);
    if ('access_token' in result) {
      expect(result.access_token).toBe('ghp_testtoken123');
      expect(result.token_type).toBe('bearer');
    }
  });

  it('returns authorization_pending when GitHub says pending', async () => {
    vi.stubGlobal('fetch', mockFetchDeviceCode());
    const init = await initiateDeviceFlow();

    vi.stubGlobal(
      'fetch',
      mockFetchAccessToken({
        error: 'authorization_pending',
        error_description: 'User has not yet completed authorization.',
      })
    );

    const result = await pollDeviceFlow(init.deviceCode);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('authorization_pending');
    }
  });

  it('returns expired_token for unknown device code', async () => {
    const result = await pollDeviceFlow('nonexistent-code');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('expired_token');
    }
  });
});

describe('exchangeForHoloMeshToken', () => {
  it('returns null for incomplete flow', async () => {
    vi.stubGlobal('fetch', mockFetchDeviceCode());
    const init = await initiateDeviceFlow();

    const result = await exchangeForHoloMeshToken(init.deviceCode);
    expect(result).toBeNull();
  });
});

describe('getDeviceFlowStats', () => {
  it('returns non-negative counts', () => {
    const stats = getDeviceFlowStats();
    expect(stats.pending).toBeGreaterThanOrEqual(0);
    expect(stats.complete).toBeGreaterThanOrEqual(0);
    expect(stats.expired).toBeGreaterThanOrEqual(0);
  });
});
