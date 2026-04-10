import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { appendFileMock, mkdirMock, requireAuthMock } = vi.hoisted(() => ({
  appendFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  requireAuthMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  appendFile: appendFileMock,
  mkdir: mkdirMock,
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { POST } from './route';

describe('/api/audit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ user: { id: 'user-1' } });
    mkdirMock.mockResolvedValue(undefined);
    appendFileMock.mockResolvedValue(undefined);
  });

  it('returns 401 and does not write when unauthenticated', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );

    const res = await POST(
      new NextRequest('http://localhost/api/audit', {
        method: 'POST',
        body: JSON.stringify({ message: 'boom' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(res.status).toBe(401);
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(appendFileMock).not.toHaveBeenCalled();
  });

  it('writes audit log asynchronously when authenticated', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/audit', {
        method: 'POST',
        body: JSON.stringify({
          category: 'runtime',
          message: 'Something failed',
          astPath: 'Root.Scene.Node',
          rawStack: 'Error: stack',
          suggestion: 'Check node wiring',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mkdirMock).toHaveBeenCalledOnce();
    expect(appendFileMock).toHaveBeenCalledOnce();
    expect(String(appendFileMock.mock.calls[0]?.[1])).toContain('SYSTEM_CRASH [RUNTIME]');
  });
});
