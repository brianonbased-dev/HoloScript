import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  project: null as null | { id: string; name: string; ownerId: string; metadata: Record<string, unknown> },
  upsert: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/absorb/projectState', () => ({
  findDurableAbsorbProject: vi.fn(() => h.project),
  upsertDurableAbsorbProject: h.upsert,
}));

import { GET, PATCH } from './route';

describe('/api/workspace/ship-settings', () => {
  beforeEach(() => {
    h.upsert.mockReset();
    h.upsert.mockImplementation((input: { metadata: Record<string, unknown> }) => ({
      ...h.project,
      metadata: { ...h.project!.metadata, ...input.metadata },
    }));
    h.project = { id: 'ws-1', name: 'r', ownerId: 'u1', metadata: {} };
  });

  it('a workspace with no setting reads as direct ship OFF (branch-pr)', async () => {
    const body = await (
      await GET(new NextRequest('http://x/api/workspace/ship-settings?workspaceId=ws-1'))
    ).json();
    expect(body).toMatchObject({ directShip: false, shipMode: 'branch-pr' });
  });

  it('the owner can turn it on', async () => {
    const res = await PATCH(
      new NextRequest('http://x/api/workspace/ship-settings', {
        method: 'PATCH',
        body: JSON.stringify({ workspaceId: 'ws-1', directShip: true }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).directShip).toBe(true);
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ws-1', ownerId: 'u1', metadata: expect.objectContaining({ directShip: true }) })
    );
  });

  it("someone else's workspace is refused and not written", async () => {
    h.project = { id: 'ws-1', name: 'r', ownerId: 'other', metadata: {} };
    const res = await PATCH(
      new NextRequest('http://x/api/workspace/ship-settings', {
        method: 'PATCH',
        body: JSON.stringify({ workspaceId: 'ws-1', directShip: true }),
      })
    );
    expect(res.status).toBe(404);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean value', async () => {
    const res = await PATCH(
      new NextRequest('http://x/api/workspace/ship-settings', {
        method: 'PATCH',
        body: JSON.stringify({ workspaceId: 'ws-1', directShip: 'yes' }),
      })
    );
    expect(res.status).toBe(400);
  });
});
