import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { requireAuthMock, proxyHoloMeshMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  proxyHoloMeshMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('../../../../../lib/holomesh-proxy', () => ({ proxyHoloMesh: proxyHoloMeshMock }));

import { GET } from './route';
import { AUTHENTICATED_USER_HEADER } from '../../../_lib/earningsIdentity';

const USER_A = '22222222-2222-2222-2222-222222222222';

describe('/api/holomesh/dashboard/earnings route', () => {
  beforeEach(() => {
    requireAuthMock.mockReset();
    proxyHoloMeshMock.mockReset();
    proxyHoloMeshMock.mockResolvedValue(NextResponse.json({ ok: true }));
  });

  it('SECURITY: returns 401 when unauthenticated and never proxies', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );

    const req = new NextRequest('http://localhost/api/holomesh/dashboard/earnings?wallet=0xVICTIM');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(proxyHoloMeshMock).not.toHaveBeenCalled();
  });

  it('SECURITY: strips client-supplied identity params and forwards authed user id', async () => {
    requireAuthMock.mockResolvedValue({ user: { id: USER_A } });

    const req = new NextRequest(
      'http://localhost/api/holomesh/dashboard/earnings?wallet=0xVICTIM&agentId=agent_victim&period=30d'
    );
    await GET(req);

    expect(proxyHoloMeshMock).toHaveBeenCalledTimes(1);
    const [path, forwardReq] = proxyHoloMeshMock.mock.calls[0];
    expect(path).toBe('/api/holomesh/dashboard/earnings');

    // Identity selectors are gone; benign params preserved.
    const search = forwardReq.nextUrl.search;
    expect(search).not.toContain('wallet');
    expect(search).not.toContain('agentId');
    expect(search).toContain('period=30d');

    // Authed identity forwarded out-of-band.
    expect(forwardReq.headers.get(AUTHENTICATED_USER_HEADER)).toBe(USER_A);
  });
});
