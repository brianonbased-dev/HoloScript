import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type http from 'node:http';

const mockState = vi.hoisted(() => ({
  agentKeyStore: new Map(),
  keyRegistry: new Map(),
  walletToAgent: new Map(),
  teamStore: new Map(),
  teamPresenceStore: new Map(),
  teamMessageStore: new Map(),
  reloadTeam: vi.fn(async () => undefined),
}));

vi.mock('../../state', () => mockState);

import {
  handleComputeJobRoutes,
  type ComputeJobUserService,
  type ComputeJobUserServiceResponse,
} from '../compute-job-routes';
import {
  TEAM_ROLE_PERMISSIONS,
  type KeyRecord,
  type RegisteredAgent,
  type Team,
} from '../../types';

const TEAM_ID = 'team_compute_routes';
const JOB_ID = `sha256:${'a'.repeat(64)}`;
const RECEIPT_ID = `sha256:${'b'.repeat(64)}`;
const DEFAULT_WALLET = '0x0000000000000000000000000000000000000001';

interface CapturedResponse extends http.ServerResponse {
  statusCodeSeen: number;
  rawBody: string;
  parsedBody: unknown;
  headersSeen: Record<string, string>;
}

function makeRequest(
  method: string,
  url: string,
  token: string,
  body?: Record<string, unknown>
): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${token}` };
  setTimeout(() => {
    if (body) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 1);
  return req;
}

function makeResponse(): CapturedResponse {
  const response = {
    statusCodeSeen: 0,
    rawBody: '',
    parsedBody: null as unknown,
    headersSeen: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      response.statusCodeSeen = status;
      if (headers) Object.assign(response.headersSeen, headers);
      return response;
    },
    end(body?: string) {
      response.rawBody = body ?? '';
      response.parsedBody = body ? (JSON.parse(body) as unknown) : null;
      return response;
    },
  };
  return response as unknown as CapturedResponse;
}

function createTeam(): Team {
  return {
    id: TEAM_ID,
    name: 'Compute Route Team',
    description: '',
    type: 'dev',
    visibility: 'private',
    ownerId: 'agent_owner',
    ownerName: 'Owner',
    members: [],
    maxSlots: 10,
    waitlist: [],
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

function seedCaller(options: {
  token: string;
  agentId: string;
  role?: 'owner' | 'lead' | 'member' | 'guest';
  walletAddress?: string;
  capabilities?: KeyRecord['capabilities'];
  legacyAgentOnly?: boolean;
}): RegisteredAgent {
  const walletAddress = options.walletAddress;
  const agent: RegisteredAgent = {
    id: options.agentId,
    apiKey: options.token,
    ...(walletAddress ? { walletAddress } : {}),
    name: options.agentId,
    traits: [],
    reputation: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
  };
  mockState.agentKeyStore.set(options.token, agent);

  if (!options.legacyAgentOnly) {
    const record: KeyRecord = {
      key: options.token,
      walletAddress: walletAddress ?? DEFAULT_WALLET,
      agentId: options.agentId,
      agentName: options.agentId,
      scopes: ['holomesh'],
      createdAt: '2026-08-01T00:00:00.000Z',
      rotationCount: 0,
      lastRotatedAt: null,
      isFounder: false,
      ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    };
    mockState.keyRegistry.set(options.token, record);
  }

  if (options.agentId !== 'system' && options.role) {
    const team = mockState.teamStore.get(TEAM_ID) as Team;
    team.members.push({
      agentId: options.agentId,
      agentName: options.agentId,
      role: options.role,
      joinedAt: '2026-08-01T00:00:00.000Z',
      ...(walletAddress ? { walletAddress } : {}),
    });
  }
  return agent;
}

function makeService(): {
  service: ComputeJobUserService;
  submit: ReturnType<typeof vi.fn<ComputeJobUserService['submit']>>;
  status: ReturnType<typeof vi.fn<ComputeJobUserService['status']>>;
  cancel: ReturnType<typeof vi.fn<ComputeJobUserService['cancel']>>;
} {
  const submit = vi.fn<ComputeJobUserService['submit']>();
  const status = vi.fn<ComputeJobUserService['status']>();
  const cancel = vi.fn<ComputeJobUserService['cancel']>();
  submit.mockResolvedValue({ status: 201, publicJson: '{"state":"preflighted"}' });
  status.mockResolvedValue({ status: 200, publicJson: '{"state":"queued"}' });
  cancel.mockResolvedValue({ status: 200, publicJson: '{"state":"cancelled"}' });
  return { service: { submit, status, cancel }, submit, status, cancel };
}

async function callRoute(options: {
  method: 'GET' | 'POST';
  path: string;
  token: string;
  service: ComputeJobUserService | null;
  body?: Record<string, unknown>;
}): Promise<{ handled: boolean; response: CapturedResponse }> {
  const request = makeRequest(options.method, options.path, options.token, options.body);
  const response = makeResponse();
  const pathname = new URL(options.path, 'http://localhost').pathname;
  const handled = await handleComputeJobRoutes(
    request,
    response,
    pathname,
    options.method,
    options.path,
    options.service
  );
  return { handled, response };
}

beforeEach(() => {
  mockState.agentKeyStore.clear();
  mockState.keyRegistry.clear();
  mockState.walletToAgent.clear();
  mockState.teamStore.clear();
  mockState.teamStore.set(TEAM_ID, createTeam());
  mockState.reloadTeam.mockClear();
});

describe('compute team permissions', () => {
  it('grants operate only to owner and lead, while guest receives no compute access', () => {
    for (const role of ['owner', 'lead'] as const) {
      expect(TEAM_ROLE_PERMISSIONS[role]).toEqual(
        expect.arrayContaining(['compute:read', 'compute:submit', 'compute:operate'])
      );
    }
    expect(TEAM_ROLE_PERMISSIONS.member).toEqual(
      expect.arrayContaining(['compute:read', 'compute:submit'])
    );
    expect(TEAM_ROLE_PERMISSIONS.member).not.toContain('compute:operate');
    expect(TEAM_ROLE_PERMISSIONS.guest).not.toContain('compute:read');
    expect(TEAM_ROLE_PERMISSIONS.guest).not.toContain('compute:submit');
    expect(TEAM_ROLE_PERMISSIONS.guest).not.toContain('compute:operate');
  });
});

describe('POST compute jobs', () => {
  it('passes only server-derived identity and authored HoloScript to the service', async () => {
    seedCaller({
      token: 'member-token',
      agentId: 'agent_member',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read', 'sign'],
    });
    const fake = makeService();
    const publicJson = '{  "state" : "preflighted", "jobId" : "public"  }\n';
    fake.submit.mockResolvedValue({ status: 201, publicJson });

    const { handled, response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs`,
      token: 'member-token',
      service: fake.service,
      body: {
        source_text: 'composition gpu_job { @compute }',
        idempotency_key: ' submit-1 ',
      },
    });

    expect(handled).toBe(true);
    expect(response.statusCodeSeen).toBe(201);
    expect(response.rawBody).toBe(publicJson);
    expect(fake.submit).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      principal: { agentId: 'agent_member', walletAddress: DEFAULT_WALLET },
      sourceText: 'composition gpu_job { @compute }',
      idempotencyKey: 'submit-1',
    });
  });

  it('rejects caller-crafted principal, admission, evidence, and workunit fields', async () => {
    seedCaller({
      token: 'member-token',
      agentId: 'agent_member',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['sign'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs`,
      token: 'member-token',
      service: fake.service,
      body: {
        source_text: 'composition gpu_job {}',
        idempotency_key: 'submit-2',
        principal_digest: `sha256:${'c'.repeat(64)}`,
        admission: {},
        evidence: {},
        workunit: {},
      },
    });

    expect(response.statusCodeSeen).toBe(400);
    expect(response.parsedBody).toEqual({ error: 'invalid_compute_submit_body' });
    expect(fake.submit).not.toHaveBeenCalled();
  });

  it('requires sign on explicitly capability-scoped bearers', async () => {
    seedCaller({
      token: 'read-token',
      agentId: 'agent_read',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs`,
      token: 'read-token',
      service: fake.service,
      body: { source_text: 'composition gpu_job {}', idempotency_key: 'submit-3' },
    });

    expect(response.statusCodeSeen).toBe(403);
    expect(response.parsedBody).toEqual({
      error: 'capability_denied',
      required_capability: 'sign',
    });
    expect(fake.submit).not.toHaveBeenCalled();
  });

  it('keeps legacy capability-less bearer identities accepted', async () => {
    seedCaller({
      token: 'legacy-token',
      agentId: 'agent_legacy',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs`,
      token: 'legacy-token',
      service: fake.service,
      body: { source_text: 'composition gpu_job {}', idempotency_key: 'submit-legacy' },
    });

    expect(response.statusCodeSeen).toBe(201);
    expect(fake.submit).toHaveBeenCalledOnce();
  });

  it.each([
    { token: 'system-token', agentId: 'system', legacyAgentOnly: true },
    { token: 'walletless-token', agentId: 'agent_walletless', legacyAgentOnly: true },
  ])('rejects mutation identity without user wallet custody: $agentId', async (identity) => {
    seedCaller({
      ...identity,
      role: 'member',
      capabilities: ['sign'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs`,
      token: identity.token,
      service: fake.service,
      body: { source_text: 'composition gpu_job {}', idempotency_key: 'submit-identity' },
    });

    expect(response.statusCodeSeen).toBe(403);
    expect(response.parsedBody).toEqual({ error: 'durable_wallet_identity_required' });
    expect(fake.submit).not.toHaveBeenCalled();
  });

  it('denies guests before calling the service', async () => {
    seedCaller({
      token: 'guest-token',
      agentId: 'agent_guest',
      role: 'guest',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['sign'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs`,
      token: 'guest-token',
      service: fake.service,
      body: { source_text: 'composition gpu_job {}', idempotency_key: 'submit-guest' },
    });

    expect(response.statusCodeSeen).toBe(403);
    expect(response.parsedBody).toEqual({ error: 'Permission denied: compute:submit' });
    expect(fake.submit).not.toHaveBeenCalled();
  });

  it('does not let the admin-room shortcut grant compute permission to a guest', async () => {
    const team = mockState.teamStore.get(TEAM_ID) as Team;
    team.adminRoom = true;
    seedCaller({
      token: 'admin-room-guest-token',
      agentId: 'agent_admin_room_guest',
      role: 'guest',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['sign'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs`,
      token: 'admin-room-guest-token',
      service: fake.service,
      body: { source_text: 'composition gpu_job {}', idempotency_key: 'submit-admin-guest' },
    });

    expect(response.statusCodeSeen).toBe(403);
    expect(response.parsedBody).toEqual({ error: 'Permission denied: compute:submit' });
    expect(fake.submit).not.toHaveBeenCalled();
  });
});

describe('GET compute job status', () => {
  it('requires read and forwards a service 404 byte-for-byte', async () => {
    seedCaller({
      token: 'read-token',
      agentId: 'agent_reader',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read'],
    });
    const fake = makeService();
    const publicJson = '{"error":"compute_job_not_found"}\n';
    fake.status.mockResolvedValue({ status: 404, publicJson });
    const { response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}?attempt=1`,
      token: 'read-token',
      service: fake.service,
    });

    expect(response.statusCodeSeen).toBe(404);
    expect(response.rawBody).toBe(publicJson);
    expect(fake.status).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      principal: { agentId: 'agent_reader', walletAddress: DEFAULT_WALLET },
      canOperateAnyJob: false,
      jobId: JOB_ID,
      attempt: 1,
    });
  });

  it('derives cross-principal read authority only from compute:operate', async () => {
    seedCaller({
      token: 'lead-read-token',
      agentId: 'agent_lead_reader',
      role: 'lead',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}?attempt=1`,
      token: 'lead-read-token',
      service: fake.service,
    });

    expect(response.statusCodeSeen).toBe(200);
    expect(fake.status).toHaveBeenCalledWith(expect.objectContaining({ canOperateAnyJob: true }));
  });

  it('requires a durable wallet identity for status reads', async () => {
    seedCaller({
      token: 'walletless-read-token',
      agentId: 'agent_walletless_reader',
      role: 'member',
      capabilities: ['read'],
      legacyAgentOnly: true,
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}?attempt=1`,
      token: 'walletless-read-token',
      service: fake.service,
    });

    expect(response.statusCodeSeen).toBe(403);
    expect(response.parsedBody).toEqual({ error: 'durable_wallet_identity_required' });
    expect(fake.status).not.toHaveBeenCalled();
  });

  it('rejects missing, duplicate, non-integer, and extra query fields', async () => {
    seedCaller({
      token: 'read-token',
      agentId: 'agent_reader',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read'],
    });
    const fake = makeService();
    const suffixes = [
      '',
      '?attempt=0',
      '?attempt=1.5',
      '?attempt=1&attempt=2',
      '?attempt=1&principal=x',
    ];
    for (const suffix of suffixes) {
      const { response } = await callRoute({
        method: 'GET',
        path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}${suffix}`,
        token: 'read-token',
        service: fake.service,
      });
      expect(response.statusCodeSeen).toBe(400);
    }
    expect(fake.status).not.toHaveBeenCalled();
  });

  it('rejects an explicitly sign-only bearer', async () => {
    seedCaller({
      token: 'sign-token',
      agentId: 'agent_signer',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['sign'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}?attempt=1`,
      token: 'sign-token',
      service: fake.service,
    });

    expect(response.statusCodeSeen).toBe(403);
    expect(response.parsedBody).toEqual({
      error: 'capability_denied',
      required_capability: 'read',
    });
    expect(fake.status).not.toHaveBeenCalled();
  });
});

describe('POST compute job cancellation', () => {
  it.each([
    { role: 'member' as const, canOperateAnyJob: false },
    { role: 'lead' as const, canOperateAnyJob: true },
  ])(
    'passes ownership override=$canOperateAnyJob for $role',
    async ({ role, canOperateAnyJob }) => {
      seedCaller({
        token: `${role}-token`,
        agentId: `agent_${role}`,
        role,
        walletAddress: DEFAULT_WALLET,
        capabilities: ['sign'],
      });
      const fake = makeService();
      const { response } = await callRoute({
        method: 'POST',
        path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}/cancel`,
        token: `${role}-token`,
        service: fake.service,
        body: {
          attempt: 1,
          expected_job_receipt_id: RECEIPT_ID,
          reason_code: 'user_cancelled',
          idempotency_key: 'cancel-1',
        },
      });

      expect(response.statusCodeSeen).toBe(200);
      expect(fake.cancel).toHaveBeenCalledWith({
        teamId: TEAM_ID,
        principal: { agentId: `agent_${role}`, walletAddress: DEFAULT_WALLET },
        canOperateAnyJob,
        jobId: JOB_ID,
        attempt: 1,
        expectedJobReceiptId: RECEIPT_ID,
        reasonCode: 'user_cancelled',
        idempotencyKey: 'cancel-1',
      });
    }
  );

  it('rejects any reason other than user_cancelled and any authority payload', async () => {
    seedCaller({
      token: 'member-token',
      agentId: 'agent_member',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['sign'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}/cancel`,
      token: 'member-token',
      service: fake.service,
      body: {
        attempt: 1,
        expected_job_receipt_id: RECEIPT_ID,
        reason_code: 'operator_override',
        idempotency_key: 'cancel-2',
        admission: {},
      },
    });

    expect(response.statusCodeSeen).toBe(400);
    expect(response.parsedBody).toEqual({ error: 'invalid_compute_cancel_request' });
    expect(fake.cancel).not.toHaveBeenCalled();
  });

  it('does not promote an admin-room member to cross-principal operator', async () => {
    const team = mockState.teamStore.get(TEAM_ID) as Team;
    team.adminRoom = true;
    seedCaller({
      token: 'admin-room-member-token',
      agentId: 'agent_admin_room_member',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['sign'],
    });
    const fake = makeService();
    const { response } = await callRoute({
      method: 'POST',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}/cancel`,
      token: 'admin-room-member-token',
      service: fake.service,
      body: {
        attempt: 1,
        expected_job_receipt_id: RECEIPT_ID,
        reason_code: 'user_cancelled',
        idempotency_key: 'cancel-admin-member',
      },
    });

    expect(response.statusCodeSeen).toBe(200);
    expect(fake.cancel).toHaveBeenCalledWith(expect.objectContaining({ canOperateAnyJob: false }));
  });
});

describe('compute user-service boundary', () => {
  it('returns a generic 503 when no service is configured', async () => {
    seedCaller({
      token: 'read-token',
      agentId: 'agent_reader',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read'],
    });
    const { response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}?attempt=1`,
      token: 'read-token',
      service: null,
    });

    expect(response.statusCodeSeen).toBe(503);
    expect(response.parsedBody).toEqual({ error: 'compute_service_unavailable' });
  });

  it('does not disclose thrown service errors', async () => {
    seedCaller({
      token: 'read-token',
      agentId: 'agent_reader',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read'],
    });
    const fake = makeService();
    fake.status.mockRejectedValue(new Error('DATABASE_URL=postgres://secret'));
    const { response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}?attempt=1`,
      token: 'read-token',
      service: fake.service,
    });

    expect(response.statusCodeSeen).toBe(503);
    expect(response.rawBody).toBe('{"error":"compute_service_unavailable"}');
    expect(response.rawBody).not.toContain('secret');
  });

  it.each([
    { status: 200, publicJson: 'not-json' },
    { status: 200, publicJson: '[]' },
    { status: 500, publicJson: '{"error":"internal detail"}' },
  ])('fails closed on invalid service response %#', async (invalidResponse) => {
    seedCaller({
      token: 'read-token',
      agentId: 'agent_reader',
      role: 'member',
      walletAddress: DEFAULT_WALLET,
      capabilities: ['read'],
    });
    const fake = makeService();
    fake.status.mockResolvedValue(invalidResponse as ComputeJobUserServiceResponse);
    const { response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/compute/jobs/${JOB_ID}?attempt=1`,
      token: 'read-token',
      service: fake.service,
    });

    expect(response.statusCodeSeen).toBe(503);
    expect(response.parsedBody).toEqual({ error: 'compute_service_unavailable' });
  });
});

describe('route matching', () => {
  it('returns false for unrelated paths without touching auth or service', async () => {
    const fake = makeService();
    const { handled, response } = await callRoute({
      method: 'GET',
      path: `/api/holomesh/team/${TEAM_ID}/fleet`,
      token: 'missing-token',
      service: fake.service,
    });
    expect(handled).toBe(false);
    expect(response.statusCodeSeen).toBe(0);
    expect(mockState.reloadTeam).not.toHaveBeenCalled();
    expect(fake.status).not.toHaveBeenCalled();
  });
});
