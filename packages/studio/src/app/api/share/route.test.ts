import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';

// Mock next-auth so getSession() (via getServerSession) is controllable.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock the JWT fallback path used by getSession() so an unmocked cookie store
// never throws; the getServerSession mock above is the primary control.
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn().mockResolvedValue(null),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

// Mock the db client. Default: no DB → in-memory fallback exercised.
vi.mock('../../../db/client', () => ({
  getDb: vi.fn(() => null),
}));

import { getServerSession } from 'next-auth';
import { getDb } from '../../../db/client';

const mockSession = (id: string | null) =>
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(id ? { user: { id } } : null);

function postReq(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Parameters<typeof POST>[0];
}

function getReq(url: string) {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

describe('POST /api/share (in-memory fallback)', () => {
  it('stamps ownerId from the authenticated session', async () => {
    mockSession('user-1');
    const res = await POST(postReq({ name: 'Mine', code: 'box {}' }));
    expect(res.status).toBe(201);

    // The new share should appear in this user's "my shares" list.
    mockSession('user-1');
    const mineRes = await GET(getReq('http://localhost/api/share?mine=1'));
    const { scenes } = await mineRes.json();
    expect(scenes).toHaveLength(1);
    expect(scenes[0].ownerId).toBe('user-1');
    expect(scenes[0].name).toBe('Mine');
  });

  it('allows anonymous shares with ownerId null', async () => {
    mockSession(null);
    const res = await POST(postReq({ name: 'Anon', code: 'box {}' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeTruthy();
  });

  it('rejects a share with no code', async () => {
    mockSession('user-1');
    const res = await POST(postReq({ name: 'NoCode' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/share?mine=1 (in-memory fallback)', () => {
  it('returns 401 when unauthenticated', async () => {
    mockSession(null);
    const res = await GET(getReq('http://localhost/api/share?mine=1'));
    expect(res.status).toBe(401);
  });

  it('scopes the listing to the session owner', async () => {
    // user-1 creates one share, user-2 creates another.
    mockSession('user-1');
    await POST(postReq({ name: 'U1 scene', code: 'a {}' }));
    mockSession('user-2');
    await POST(postReq({ name: 'U2 scene', code: 'b {}' }));

    mockSession('user-1');
    const res = await GET(getReq('http://localhost/api/share?mine=1'));
    const { scenes } = await res.json();
    expect(scenes.every((s: { ownerId: string }) => s.ownerId === 'user-1')).toBe(true);
    expect(scenes.some((s: { name: string }) => s.name === 'U2 scene')).toBe(false);
  });

  it('public gallery (no mine) does not require auth', async () => {
    mockSession(null);
    const res = await GET(getReq('http://localhost/api/share'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/share (DB path stamps ownerId)', () => {
  it('passes ownerId into the insert values', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'abcdef0123456789' }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ insert });

    mockSession('user-42');
    const res = await POST(postReq({ name: 'DB scene', code: 'box {}' }));
    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-42', code: 'box {}' })
    );
  });

  it('inserts ownerId null for anonymous DB shares', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'abcdef0123456789' }]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ insert });

    mockSession(null);
    const res = await POST(postReq({ name: 'Anon DB', code: 'box {}' }));
    expect(res.status).toBe(201);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null }));
  });
});
