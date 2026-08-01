import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const requireAuthMock = vi.hoisted(() => vi.fn());
const resolveUserSecretMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn<typeof fetch>());
vi.hoisted(() => {
  process.env.HOLOMESH_API_KEY = 'shared_studio_key_must_not_be_used';
  process.env.HOLOMESH_KEY = 'shared_studio_key_must_not_be_used';
});

vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));
vi.mock('@/lib/secrets/userSecretStore', () => ({
  resolveUserSecret: resolveUserSecretMock,
}));
vi.mock('@holoscript/config', () => ({
  ENDPOINTS: { HOLOSCRIPT_MCP: 'https://mcp.test/' },
}));

import { POST as submitJob } from './jobs/route';
import { GET as getJob } from './jobs/[jobId]/route';
import { POST as cancelJob } from './jobs/[jobId]/cancel/route';

const TEAM_ID = 'team_user-a';
const JOB_ID = `sha256:${'a'.repeat(64)}`;
const JOB_RECEIPT_ID = `sha256:${'b'.repeat(64)}`;
const USER_API_KEY = 'holomesh_user_a_vault_key';
const SHARED_API_KEY = 'shared_studio_key_must_not_be_used';
const jobParams = { params: Promise.resolve({ jobId: JOB_ID }) };

function jsonRequest(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuthMock.mockReset();
  resolveUserSecretMock.mockReset();
  requireAuthMock.mockResolvedValue({ user: { id: 'user-a' } });
  resolveUserSecretMock.mockResolvedValue(USER_API_KEY);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.HOLOMESH_API_KEY = SHARED_API_KEY;
  process.env.HOLOMESH_KEY = SHARED_API_KEY;
});

afterEach(() => {
  delete process.env.HOLOMESH_API_KEY;
  delete process.env.HOLOMESH_KEY;
  vi.unstubAllGlobals();
});

describe('Studio HoloMesh compute proxy routes', () => {
  it('binds submit to the authenticated user vault and preserves exact public JSON bytes', async () => {
    const publicJson = '{"schemaVersion":"public.v1", "state":"preflighted"}';
    fetchMock.mockImplementation(async (url, init) => {
      expect(url).toBe(`https://mcp.test/api/holomesh/team/${TEAM_ID}/compute/jobs`);
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe(`Bearer ${USER_API_KEY}`);
      expect(headers.get('authorization')).not.toContain(SHARED_API_KEY);
      expect(JSON.parse(String(init?.body))).toEqual({
        source_text: 'composition ComputeJob {}',
        idempotency_key: 'submit-1',
      });
      return new Response(publicJson, { status: 201 });
    });

    const request = jsonRequest(
      'http://studio.test/api/agents/fleet/compute/jobs',
      {
        teamId: TEAM_ID,
        sourceText: 'composition ComputeJob {}',
        idempotencyKey: 'submit-1',
      },
      { Authorization: 'Bearer incoming_key_must_not_be_forwarded' }
    );
    const response = await submitJob(request);

    expect(requireAuthMock).toHaveBeenCalledWith(request);
    expect(resolveUserSecretMock).toHaveBeenCalledWith({
      ownerId: 'user-a',
      name: 'HOLOMESH_API_KEY',
      purpose: 'studio-holomesh-compute-proxy',
    });
    expect(response.status).toBe(201);
    expect(await response.text()).toBe(publicJson);
  });

  it('fails closed when that user has no vault key even if shared keys exist', async () => {
    resolveUserSecretMock.mockResolvedValue(null);
    const response = await submitJob(
      jsonRequest('http://studio.test/api/agents/fleet/compute/jobs', {
        teamId: TEAM_ID,
        sourceText: 'composition ComputeJob {}',
        idempotencyKey: 'submit-1',
      })
    );

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    const bytes = await response.text();
    expect(bytes).toBe('{"error":"compute_proxy_unavailable"}');
    expect(bytes).not.toContain(SHARED_API_KEY);
  });

  it('forwards strict status and cancellation contracts with only the user vault key', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"state":"running"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"state":"cancelled"}', { status: 202 }));

    const statusResponse = await getJob(
      new Request(
        `http://studio.test/api/agents/fleet/compute/jobs/${JOB_ID}?teamId=${TEAM_ID}&attempt=2`
      ),
      jobParams
    );
    expect(statusResponse.status).toBe(200);

    const cancelResponse = await cancelJob(
      jsonRequest(`http://studio.test/api/agents/fleet/compute/jobs/${JOB_ID}/cancel`, {
        teamId: TEAM_ID,
        attempt: 2,
        expectedJobReceiptId: JOB_RECEIPT_ID,
        idempotencyKey: 'cancel-1',
      }),
      jobParams
    );
    expect(cancelResponse.status).toBe(202);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://mcp.test/api/holomesh/team/${TEAM_ID}/compute/jobs/` +
        `${encodeURIComponent(JOB_ID)}?attempt=2`
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `https://mcp.test/api/holomesh/team/${TEAM_ID}/compute/jobs/` +
        `${encodeURIComponent(JOB_ID)}/cancel`
    );
    for (const call of fetchMock.mock.calls) {
      expect(new Headers(call[1]?.headers).get('authorization')).toBe(`Bearer ${USER_API_KEY}`);
    }
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      attempt: 2,
      expected_job_receipt_id: JOB_RECEIPT_ID,
      reason_code: 'user_cancelled',
      idempotency_key: 'cancel-1',
    });
  });

  it('rejects extra keys, non-canonical attempts, and invalid cancellation before vault access', async () => {
    const submitResponse = await submitJob(
      jsonRequest('http://studio.test/api/agents/fleet/compute/jobs', {
        teamId: TEAM_ID,
        sourceText: 'composition ComputeJob {}',
        idempotencyKey: 'submit-1',
        extra: true,
      })
    );
    const statusResponse = await getJob(
      new Request(
        `http://studio.test/api/agents/fleet/compute/jobs/${JOB_ID}?teamId=${TEAM_ID}&attempt=01`
      ),
      jobParams
    );
    const cancelResponse = await cancelJob(
      jsonRequest(`http://studio.test/api/agents/fleet/compute/jobs/${JOB_ID}/cancel`, {
        teamId: TEAM_ID,
        attempt: 0,
        expectedJobReceiptId: JOB_RECEIPT_ID,
        idempotencyKey: 'cancel-1',
        reasonCode: 'administrator_override',
      }),
      jobParams
    );

    expect([submitResponse.status, statusResponse.status, cancelResponse.status]).toEqual([
      400, 400, 400,
    ]);
    expect(resolveUserSecretMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces the MCP source limit on exact UTF-8 bytes before vault access', async () => {
    const response = await submitJob(
      jsonRequest('http://studio.test/api/agents/fleet/compute/jobs', {
        teamId: TEAM_ID,
        sourceText: 'é'.repeat(131_073),
        idempotencyKey: 'submit-oversized',
      })
    );

    expect(response.status).toBe(400);
    expect(resolveUserSecretMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns only generic errors for malformed, unavailable, or secret-echoing upstreams', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('["not-an-object"]', { status: 200 }))
      .mockRejectedValueOnce(new Error('upstream unavailable'))
      .mockResolvedValueOnce(new Response(`{"debug":"${USER_API_KEY}"}`, { status: 200 }));

    const makeRequest = () =>
      jsonRequest('http://studio.test/api/agents/fleet/compute/jobs', {
        teamId: TEAM_ID,
        sourceText: 'composition ComputeJob {}',
        idempotencyKey: 'submit-1',
      });
    const malformed = await submitJob(makeRequest());
    const unavailable = await submitJob(makeRequest());
    const echoed = await submitJob(makeRequest());

    expect(malformed.status).toBe(502);
    expect(await malformed.text()).toBe('{"error":"compute_upstream_invalid_response"}');
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).toBe('{"error":"compute_proxy_unavailable"}');
    expect(echoed.status).toBe(502);
    expect(await echoed.text()).not.toContain(USER_API_KEY);
  });

  it('returns the NextAuth denial without resolving a vault key', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const response = await getJob(
      new Request(
        `http://studio.test/api/agents/fleet/compute/jobs/${JOB_ID}?teamId=${TEAM_ID}&attempt=1`
      ),
      jobParams
    );

    expect(response.status).toBe(401);
    expect(resolveUserSecretMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
