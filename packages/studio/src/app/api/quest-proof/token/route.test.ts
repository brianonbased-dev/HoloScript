/**
 * /api/quest-proof/token mints a per-run capture token: founder-only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({ requireFounder: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireFounder: h.requireFounder }));

import { GET } from './route';
import { verifyQuestProofToken } from '@/lib/questProofCapture';

const get = () => new NextRequest('https://studio.test/api/quest-proof/token?runId=run-1');

afterEach(() => {
  h.requireFounder.mockReset();
  vi.unstubAllEnvs();
});

describe('quest-proof/token', () => {
  it('anonymous 401 and non-founder 403 get no token', async () => {
    vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', 'test-capture-secret');
    h.requireFounder.mockResolvedValueOnce(NextResponse.json({}, { status: 401 }));
    expect((await GET(get())).status).toBe(401);
    h.requireFounder.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    const res = await GET(get());
    expect(res.status).toBe(403);
    expect((await res.json()).proofToken).toBeUndefined();
  });

  it('founder gets a token valid for that run only', async () => {
    vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', 'test-capture-secret');
    h.requireFounder.mockResolvedValue({ user: { id: 'founder' } });
    const body = await (await GET(get())).json();
    expect(verifyQuestProofToken('run-1', body.proofToken)).toBe(true);
    expect(verifyQuestProofToken('run-2', body.proofToken)).toBe(false);
  });

  it('503 when no capture secret is configured', async () => {
    vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    h.requireFounder.mockResolvedValue({ user: { id: 'founder' } });
    expect((await GET(get())).status).toBe(503);
  });
});
