import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';

const mockResolveGitHubToken = vi.fn();
vi.mock('./github-identity.js', () => ({
  resolveGitHubToken: (...args: any[]) => mockResolveGitHubToken(...args),
}));
const mockGetOrCreateAccount = vi.fn();
vi.mock('@holoscript/absorb-service/credits', () => ({
  getOrCreateAccount: (...args: any[]) => mockGetOrCreateAccount(...args),
}));
vi.mock('../db/client.js', () => ({ getDb: () => null }));

import { authMiddleware, verifyOrchestratorSig, type AuthenticatedRequest } from './auth.js';

const SECRET = 'orch-secret-test';
const USER = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const OTHER = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

function sign(key: string, tier: string, user: string | null, at = Date.now()): string {
  const w = Math.floor(at / 30_000);
  const msg = user === null ? `${key}:${tier}:${w}` : `${key}:${tier}:${user}:${w}`;
  return createHmac('sha256', SECRET).update(msg).digest('hex');
}

function req(headers: Record<string, string>): AuthenticatedRequest {
  return {
    path: '/api/absorb/scan',
    method: 'POST',
    headers: { authorization: 'Bearer not-a-github-token', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
}

function res(): Response & { statusCode: number; _json: any } {
  const r: any = {
    statusCode: 200,
    _json: null,
    headersSent: false,
    status(c: number) { r.statusCode = c; return r; },
    json(d: any) { r._json = d; return r; },
    setHeader() { return r; },
  };
  return r;
}

describe('orchestrator attestation carries the signed end-user account UUID', () => {
  let next: NextFunction;
  const prevSecret = process.env.ORCHESTRATOR_SECRET;

  beforeEach(() => {
    next = vi.fn();
    process.env.ORCHESTRATOR_SECRET = SECRET;
    delete process.env.ABSORB_API_KEY;
    mockResolveGitHubToken.mockReset();
    mockGetOrCreateAccount.mockReset();
    mockGetOrCreateAccount.mockResolvedValue({ tier: 'pro' });
  });
  afterEach(() => {
    if (prevSecret === undefined) delete process.env.ORCHESTRATOR_SECRET;
    else process.env.ORCHESTRATOR_SECRET = prevSecret;
  });

  it('a valid signed UUID runs as that account: userId is the UUID, no billing skip', async () => {
    const r = req({
      'x-mcpme-orchestrator-key': 'key-1',
      'x-mcpme-orchestrator-tier': 'agent',
      'x-mcpme-orchestrator-user': USER,
      'x-mcpme-orchestrator-sig': sign('key-1', 'agent', USER),
    });
    await authMiddleware(r, res(), next);
    expect(next).toHaveBeenCalled();
    expect(r.userId).toBe(USER);
    expect(r.orchestratorGated).toBeUndefined();
    expect(r.tier).toBe('pro');
    expect(mockGetOrCreateAccount).toHaveBeenCalledWith(USER);
    expect(mockResolveGitHubToken).not.toHaveBeenCalled();
  });

  it('the old attestation without a UUID is refused with 401', async () => {
    const out = res();
    const r = req({
      'x-mcpme-orchestrator-key': 'key-1',
      'x-mcpme-orchestrator-tier': 'agent',
      'x-mcpme-orchestrator-sig': sign('key-1', 'agent', null),
    });
    await authMiddleware(r, out, next);
    expect(out.statusCode).toBe(401);
    expect(out._json).toMatchObject({ reason: 'orchestrator_attestation_no_user' });
    expect(next).not.toHaveBeenCalled();
    expect(r.userId).toBeUndefined();
  });

  it('a UUID swapped after signing is refused with 401 (the UUID is inside the signature)', async () => {
    const out = res();
    await authMiddleware(
      req({
        'x-mcpme-orchestrator-key': 'key-1',
        'x-mcpme-orchestrator-tier': 'agent',
        'x-mcpme-orchestrator-user': OTHER,
        'x-mcpme-orchestrator-sig': sign('key-1', 'agent', USER),
      }),
      out,
      next
    );
    expect(out.statusCode).toBe(401);
    expect(out._json).toMatchObject({ reason: 'orchestrator_attestation_invalid' });
    expect(next).not.toHaveBeenCalled();
  });

  it('a non-UUID user (e.g. orchestrator:<key>) is refused with 401', async () => {
    const out = res();
    await authMiddleware(
      req({
        'x-mcpme-orchestrator-key': 'key-1',
        'x-mcpme-orchestrator-tier': 'agent',
        'x-mcpme-orchestrator-user': 'orchestrator:key-1',
        'x-mcpme-orchestrator-sig': sign('key-1', 'agent', 'orchestrator:key-1'),
      }),
      out,
      next
    );
    expect(out.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('verifyOrchestratorSig accepts the current and previous window only', () => {
    const now = 1_800_000_000_000;
    expect(verifyOrchestratorSig('k', 'agent', USER, sign('k', 'agent', USER, now), now)).toBe(true);
    expect(verifyOrchestratorSig('k', 'agent', USER, sign('k', 'agent', USER, now - 30_000), now)).toBe(true);
    expect(verifyOrchestratorSig('k', 'agent', USER, sign('k', 'agent', USER, now - 60_000), now)).toBe(false);
  });
});
