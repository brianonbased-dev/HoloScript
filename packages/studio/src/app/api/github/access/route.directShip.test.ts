/**
 * Being the repo owner on GitHub only PERMITS direct ship. It is on only when
 * the workspace's own setting is on, and that setting defaults to off.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ project: null as null | Record<string, unknown> }));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ accessToken: 't', user: { id: 'u1', provider: 'github' } })),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/absorb/projectState', () => ({
  findDurableAbsorbProject: vi.fn(() => h.project),
}));

import { GET } from './route';

function stubOwner() {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'brianonbased-dev' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ owner: { login: 'brianonbased-dev' }, permissions: { admin: true } }),
          { status: 200 }
        )
      )
  );
}

const url = 'http://localhost/api/github/access?owner=brianonbased-dev&repo=Ride';

describe('/api/github/access direct-ship default', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    h.project = null;
  });

  it('repo owner with no workspace: branch-pr, direct ship off', async () => {
    stubOwner();
    const body = await (await GET(new NextRequest(url))).json();
    expect(body.role).toBe('owner');
    expect(body.rolePermitsDirectShip).toBe(true);
    expect(body.canDirectShip).toBe(false);
    expect(body.recommendedFlow).toBe('branch-pr');
  });

  it('repo owner, workspace imported with default settings: branch-pr', async () => {
    stubOwner();
    h.project = { id: 'ws-1', ownerId: 'u1', metadata: { directShip: false } };
    const body = await (await GET(new NextRequest(`${url}&workspaceId=ws-1`))).json();
    expect(body.directShipEnabled).toBe(false);
    expect(body.canDirectShip).toBe(false);
    expect(body.recommendedFlow).toBe('branch-pr');
  });

  it('repo owner, workspace setting turned on: direct-ship', async () => {
    stubOwner();
    h.project = { id: 'ws-1', ownerId: 'u1', metadata: { directShip: true } };
    const body = await (await GET(new NextRequest(`${url}&workspaceId=ws-1`))).json();
    expect(body.canDirectShip).toBe(true);
    expect(body.recommendedFlow).toBe('direct-ship');
  });

  it("another user's workspace setting is ignored", async () => {
    stubOwner();
    h.project = { id: 'ws-1', ownerId: 'someone-else', metadata: { directShip: true } };
    const body = await (await GET(new NextRequest(`${url}&workspaceId=ws-1`))).json();
    expect(body.canDirectShip).toBe(false);
  });
});
