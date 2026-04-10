import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getDbMock, getSessionMock, loggerErrorMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  getSessionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDb: getDbMock }));
vi.mock('@/db/schema', () => ({
  users: { id: 'id', name: 'name', image: 'image', createdAt: 'createdAt' },
  projects: {
    id: 'id',
    ownerId: 'ownerId',
    visibility: 'visibility',
    name: 'name',
    slug: 'slug',
    description: 'description',
    createdAt: 'createdAt',
  },
  marketplaceListings: {
    id: 'id',
    sellerId: 'sellerId',
    status: 'status',
    title: 'title',
    description: 'description',
    priceCents: 'priceCents',
    currency: 'currency',
    createdAt: 'createdAt',
  },
  creatorProfiles: { userId: 'userId', displayName: 'displayName', bio: 'bio', website: 'website' },
}));
vi.mock('@/lib/api-auth', () => ({ getSession: getSessionMock }));
vi.mock('@/lib/logger', () => ({ logger: { error: loggerErrorMock } }));
vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ op: 'eq', args }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (arg: unknown) => ({ op: 'desc', arg }),
}));

import { GET, PUT } from './route';

describe('/api/users/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 gracefully when GET database query throws', async () => {
    getDbMock.mockReturnValue({
      select: vi.fn(() => {
        throw new Error('DB exploded');
      }),
    });

    const res = await GET(new NextRequest('http://localhost/api/users/u1'), {
      params: Promise.resolve({ id: 'u1' }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to load user profile/);
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it('returns 500 gracefully when PUT database query throws', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'u1' } });
    getDbMock.mockReturnValue({
      select: vi.fn(() => {
        throw new Error('DB exploded');
      }),
    });

    const res = await PUT(
      new NextRequest('http://localhost/api/users/u1', {
        method: 'PUT',
        body: JSON.stringify({ displayName: 'New Name' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'u1' }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to update user profile/);
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
