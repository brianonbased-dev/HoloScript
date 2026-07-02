import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const buildPortableMindMock = vi.hoisted(() => vi.fn());

vi.mock('@holoscript/holoscript-agent/portable-mind', () => ({
  buildPortableMind: buildPortableMindMock,
}));

import { GET, seatIdCandidatesForAgent } from './route';

const PRIVATE_KEY = `0x${'1'.repeat(64)}`;
const WALLET = `0x${'2'.repeat(40)}`;

describe('/api/portable-mind/[agentId]', () => {
  beforeEach(() => {
    buildPortableMindMock.mockReset();
    delete process.env.HOLOKEY_VAULT_BIN;
    delete process.env.PORTABLE_MIND_WALLET_PRIVATE_KEY;
    delete process.env.PORTABLE_MIND_WALLET_PRIVATE_KEY_BRITTNEY;
    delete process.env.HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY;
    delete process.env.HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY_BRITTNEY;
    delete process.env.PORTABLE_MIND_X402_BEARER;
    delete process.env.PORTABLE_MIND_X402_BEARER_BRITTNEY;
    delete process.env.HOLOSCRIPT_AGENT_X402_BEARER;
    delete process.env.HOLOSCRIPT_AGENT_X402_BEARER_BRITTNEY;
    delete process.env.PORTABLE_MIND_TEAM_ID;
    delete process.env.HOLOMESH_TEAM_ID;
    delete process.env.HOLOMESH_API_BASE;
  });

  it('loads a server-side mind and returns only public identity plus memories', async () => {
    process.env.PORTABLE_MIND_WALLET_PRIVATE_KEY = PRIVATE_KEY;
    process.env.PORTABLE_MIND_X402_BEARER = 'bearer-secret';
    process.env.HOLOMESH_TEAM_ID = 'team-test';
    process.env.HOLOMESH_API_BASE = 'https://mesh.test/api/holomesh';

    buildPortableMindMock.mockResolvedValueOnce({
      identity: () => ({ wallet: WALLET, agentId: 'brittney' }),
      loadMemory: vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'm1', content: 'portable mind reached the headset', score: 0.9 },
        ]),
    });

    const response = await GET(
      new Request('http://localhost/api/portable-mind/brittney') as NextRequest,
      {
        params: Promise.resolve({ agentId: 'brittney' }),
      }
    );
    const body = (await response.json()) as {
      identity: { wallet: string; agentId: string };
      memories: Array<{ id: string; content: string; score: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.identity).toEqual({ wallet: WALLET, agentId: 'brittney' });
    expect(body.memories).toEqual([
      { id: 'm1', content: 'portable mind reached the headset', score: 0.9 },
    ]);
    expect(buildPortableMindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKey: PRIVATE_KEY,
        bearer: 'bearer-secret',
        meshApiBase: 'https://mesh.test/api/holomesh',
        teamId: 'team-test',
        agentId: 'brittney',
      })
    );
    expect(JSON.stringify(body)).not.toContain(PRIVATE_KEY.slice(2));
    expect(JSON.stringify(body)).not.toContain('bearer-secret');
  });

  it('fails closed when no server-side seat is configured', async () => {
    process.env.HOLOMESH_TEAM_ID = 'team-test';

    const response = await GET(
      new Request('http://localhost/api/portable-mind/missing-portable-mind-test') as NextRequest,
      {
        params: Promise.resolve({ agentId: 'missing-portable-mind-test' }),
      }
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/seat is not configured/u);
    expect(buildPortableMindMock).not.toHaveBeenCalled();
  });

  it('knows the existing encrypted HoloScript agent seat naming shape', () => {
    expect(
      seatIdCandidatesForAgent('brittney', {
        PORTABLE_MIND_MACHINE_FINGERPRINT: 'c40b1de5',
      } as NodeJS.ProcessEnv)
    ).toContain('holoscript-brittney-c40b1de5-x402');
  });
});
