import { beforeEach, describe, expect, it } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import { handleAdminRoutes } from '../admin-routes';
import {
  keyRegistry,
  agentKeyStore,
  walletToAgent,
  scalingOverrideStore,
  failoverStateStore,
} from '../../state';
import type { KeyRecord } from '../../types';
import {
  issueLease,
  queryLeases,
  _resetVaultLeaseRegistryForTests,
} from '../../identity/vault-lease-registry';
import { _resetAuditLogForTests } from '../../identity/audit-log';
import {
  resetAdminOperationsAudit,
  queryAdminOperationsAudit,
} from '../../admin-operations-audit';

const FOUNDER_KEY = 'founder-admin-key';
const FOUNDER_ID = 'agent-founder';
const FOUNDER_WALLET = '0x0000000000000000000000000000000000000001';
const NON_FOUNDER_KEY = 'regular-agent-key';
const NON_FOUNDER_ID = 'agent-regular';

function seedFounder(): void {
  const record: KeyRecord = {
    key: FOUNDER_KEY,
    walletAddress: FOUNDER_WALLET,
    agentId: FOUNDER_ID,
    agentName: 'Founder',
    scopes: ['*'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: true,
  };
  keyRegistry.set(FOUNDER_KEY, record);
}

function seedNonFounder(): void {
  const record: KeyRecord = {
    key: NON_FOUNDER_KEY,
    walletAddress: '0x0000000000000000000000000000000000000002',
    agentId: NON_FOUNDER_ID,
    agentName: 'RegularAgent',
    scopes: ['holomesh'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: false,
  };
  keyRegistry.set(NON_FOUNDER_KEY, record);
  agentKeyStore.set(NON_FOUNDER_KEY, {
    id: NON_FOUNDER_ID,
    apiKey: NON_FOUNDER_KEY,
    walletAddress: '0x0000000000000000000000000000000000000002',
    name: 'RegularAgent',
    traits: ['@provisioned'],
    reputation: 0,
    createdAt: new Date().toISOString(),
  });
}

function mockReq(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers || {};

  if (body) {
    const data = JSON.stringify(body);
    setTimeout(() => {
      req.emit('data', Buffer.from(data));
      req.emit('end');
    }, 1);
  } else {
    setTimeout(() => req.emit('end'), 1);
  }

  return req;
}

interface CapturedRes extends http.ServerResponse {
  _status: number;
  _body: any;
  _headers: Record<string, string>;
}

function mockRes(): CapturedRes {
  const res = {
    _status: 0,
    _body: null as any,
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) Object.assign(res._headers, headers);
    },
    end(data?: string) {
      if (!data) return;
      res._body = JSON.parse(data);
    },
  } as any;
  return res;
}

async function callAdmin(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  key = FOUNDER_KEY
): Promise<CapturedRes> {
  const req = mockReq(method, path, body, { authorization: `Bearer ${key}` });
  const res = mockRes();
  await handleAdminRoutes(req, res, path, method, path);
  return res;
}

beforeEach(() => {
  keyRegistry.clear();
  agentKeyStore.clear();
  walletToAgent.clear();
  scalingOverrideStore.clear();
  failoverStateStore.clear();
  _resetVaultLeaseRegistryForTests();
  _resetAuditLogForTests();
  resetAdminOperationsAudit();
  seedFounder();
});

describe('Admin Routes — API Key Rotation Mechanism (P.009.01)', () => {
  // ── Provision ──

  it('POST /api/holomesh/admin/provision creates an agent with a new key', async () => {
    const res = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'ProvisionBot',
      scopes: ['holomesh'],
    });

    expect(res._status).toBe(201);
    expect(res._body.success).toBe(true);
    expect(res._body.api_key).toMatch(/^hs_sk_/);
    expect(res._body.agent_id).toBeTruthy();
    expect(res._body.scopes).toEqual(['holomesh']);
    expect(res._body.is_founder).toBe(false);

    // Registry should contain the new key
    const record = Array.from(keyRegistry.values()).find(
      (r) => r.agentId === res._body.agent_id
    );
    expect(record).toBeDefined();
    expect(record?.rotationCount).toBe(0);
    expect(record?.lastRotatedAt).toBeNull();
  });

  it('POST /api/holomesh/admin/provision rejects duplicate names', async () => {
    const r1 = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'DupBot',
    });
    expect(r1._status).toBe(201);

    const r2 = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'dupbot',
    });
    expect(r2._status).toBe(409);
    expect(r2._body.error).toContain('already exists');
  });

  it('POST /api/holomesh/admin/provision rejects non-founders', async () => {
    seedNonFounder();
    const res = await callAdmin(
      'POST',
      '/api/holomesh/admin/provision',
      { name: 'HackerBot' },
      NON_FOUNDER_KEY
    );
    expect(res._status).toBe(403);
  });

  // ── Rotate Key ──

  it('POST /api/holomesh/admin/rotate-key rotates by agent_id and returns new key', async () => {
    const provisioned = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'RotateBot',
    });
    const agentId = provisioned._body.agent_id;
    const oldKey = provisioned._body.api_key;

    const res = await callAdmin('POST', '/api/holomesh/admin/rotate-key', {
      agent_id: agentId,
    });

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.new_key).toMatch(/^hs_sk_/);
    expect(res._body.new_key).not.toBe(oldKey);
    expect(res._body.agent_id).toBe(agentId);
    expect(res._body.rotated_from_prefix).toMatch(/^hs_sk_/);
  });

  it('POST /api/holomesh/admin/rotate-key rotates by wallet_address', async () => {
    const provisioned = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'WalletRotateBot',
    });
    const wallet = provisioned._body.wallet_address;
    const oldKey = provisioned._body.api_key;

    const res = await callAdmin('POST', '/api/holomesh/admin/rotate-key', {
      wallet_address: wallet,
    });

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.new_key).not.toBe(oldKey);
  });

  it('POST /api/holomesh/admin/rotate-key increments rotationCount and sets lastRotatedAt', async () => {
    const provisioned = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'CountBot',
    });
    const agentId = provisioned._body.agent_id;

    const r1 = await callAdmin('POST', '/api/holomesh/admin/rotate-key', {
      agent_id: agentId,
    });
    expect(r1._status).toBe(200);
    expect(r1._body.rotation_count).toBe(1);
    expect(r1._body.last_rotated_at).toBeTruthy();

    const r2 = await callAdmin('POST', '/api/holomesh/admin/rotate-key', {
      agent_id: agentId,
    });
    expect(r2._status).toBe(200);
    expect(r2._body.rotation_count).toBe(2);
    expect(r2._body.last_rotated_at).toBeTruthy();
  });

  it('POST /api/holomesh/admin/rotate-key revokes active vault leases for the rotated agent', async () => {
    const provisioned = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'LeaseBot',
    });
    const agentId = provisioned._body.agent_id;

    // Issue a lease for this agent
    const lease = issueLease({
      taskId: 'task-rotate-1',
      agentId,
      scope: ['env:HOLOSCRIPT_API_KEY'],
    });
    expect(lease.ok).toBe(true);
    expect(queryLeases({ agentId })).toHaveLength(1);

    // Rotate the key
    const res = await callAdmin('POST', '/api/holomesh/admin/rotate-key', {
      agent_id: agentId,
    });
    expect(res._status).toBe(200);
    expect(res._body.revoked_leases).toBe(1);

    // Lease should now be revoked
    expect(queryLeases({ agentId, status: 'active' })).toHaveLength(0);
  });

  it('POST /api/holomesh/admin/rotate-key returns 404 for unknown agent', async () => {
    const res = await callAdmin('POST', '/api/holomesh/admin/rotate-key', {
      agent_id: 'agent_nonexistent_9999',
    });
    expect(res._status).toBe(404);
    expect(res._body.error).toContain('not found');
  });

  it('POST /api/holomesh/admin/rotate-key rejects non-founders', async () => {
    seedNonFounder();
    const res = await callAdmin(
      'POST',
      '/api/holomesh/admin/rotate-key',
      { agent_id: NON_FOUNDER_ID },
      NON_FOUNDER_KEY
    );
    expect(res._status).toBe(403);
  });

  // ── Revoke ──

  it('POST /api/holomesh/admin/revoke removes all keys for an agent', async () => {
    const provisioned = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'RevokeBot',
    });
    const agentId = provisioned._body.agent_id;

    const res = await callAdmin('POST', '/api/holomesh/admin/revoke', {
      agent_id: agentId,
    });

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.revoked_keys).toBeGreaterThanOrEqual(1);

    // Key registry should no longer contain the agent
    const remaining = Array.from(keyRegistry.values()).filter(
      (r) => r.agentId === agentId
    );
    expect(remaining).toHaveLength(0);
  });

  it('POST /api/holomesh/admin/revoke rejects non-founders', async () => {
    seedNonFounder();
    const res = await callAdmin(
      'POST',
      '/api/holomesh/admin/revoke',
      { agent_id: NON_FOUNDER_ID },
      NON_FOUNDER_KEY
    );
    expect(res._status).toBe(403);
  });

  // ── Agents List ──

  it('GET /api/holomesh/admin/agents lists agents without exposing keys', async () => {
    await callAdmin('POST', '/api/holomesh/admin/provision', { name: 'AgentA' });
    await callAdmin('POST', '/api/holomesh/admin/provision', { name: 'AgentB' });

    const res = await callAdmin('GET', '/api/holomesh/admin/agents');
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.count).toBeGreaterThanOrEqual(2);

    for (const agent of res._body.agents) {
      expect(agent.agent_id).toBeTruthy();
      expect(agent.agent_name).toBeTruthy();
      // Security: keys must NEVER be exposed in list responses
      expect(agent.api_key).toBeUndefined();
      expect(agent.key).toBeUndefined();
    }
  });

  // ── Manual Failover ──

  it('POST /api/holomesh/admin/manual-failover sets primary backend and records audit', async () => {
    const res = await callAdmin('POST', '/api/holomesh/admin/manual-failover', {
      service_id: 'svc-web',
      target_backend: 'backend-b',
      reason: 'drill test',
    });

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.service_id).toBe('svc-web');
    expect(res._body.primary_backend).toBe('backend-b');
    expect(res._body.reason).toBe('drill test');

    // Verify in-memory state
    const state = failoverStateStore.get('svc-web');
    expect(state).toBeDefined();
    expect(state!.primaryBackend).toBe('backend-b');

    // Verify audit entry
    const audit = queryAdminOperationsAudit(50);
    const entry = audit.entries.find((e) => e.action === 'manual_failover');
    expect(entry).toBeDefined();
    expect(entry!.after!.serviceId).toBe('svc-web');
    expect(entry!.after!.primaryBackend).toBe('backend-b');
  });

  it('POST /api/holomesh/admin/manual-failover requires service_id and target_backend', async () => {
    const res = await callAdmin('POST', '/api/holomesh/admin/manual-failover', {});
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('service_id and target_backend are required');
  });

  it('POST /api/holomesh/admin/manual-failover rejects non-founders', async () => {
    seedNonFounder();
    const res = await callAdmin(
      'POST',
      '/api/holomesh/admin/manual-failover',
      { service_id: 'svc-web', target_backend: 'backend-b' },
      NON_FOUNDER_KEY
    );
    expect(res._status).toBe(403);
  });

  // ── Scaling Override ──

  it('POST /api/holomesh/admin/scaling-override sets replica count and records audit', async () => {
    const res = await callAdmin('POST', '/api/holomesh/admin/scaling-override', {
      service_id: 'svc-api',
      replicas: 5,
      reason: 'black friday prep',
    });

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.service_id).toBe('svc-api');
    expect(res._body.replicas).toBe(5);

    // Verify in-memory state
    const override = scalingOverrideStore.get('svc-api');
    expect(override).toBeDefined();
    expect(override!.replicas).toBe(5);

    // Verify audit entry with before/after
    const audit = queryAdminOperationsAudit(50);
    const entry = audit.entries.find((e) => e.action === 'scaling_override');
    expect(entry).toBeDefined();
    expect(entry!.after!.serviceId).toBe('svc-api');
    expect(entry!.after!.replicas).toBe(5);
  });

  it('POST /api/holomesh/admin/scaling-override validates replica bounds', async () => {
    const res = await callAdmin('POST', '/api/holomesh/admin/scaling-override', {
      service_id: 'svc-api',
      replicas: 5000,
    });
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('replicas must be an integer between 0 and 1000');
  });

  it('POST /api/holomesh/admin/scaling-override rejects non-founders', async () => {
    seedNonFounder();
    const res = await callAdmin(
      'POST',
      '/api/holomesh/admin/scaling-override',
      { service_id: 'svc-api', replicas: 3 },
      NON_FOUNDER_KEY
    );
    expect(res._status).toBe(403);
  });

  // ── Audit Verification ──

  it('records before/after for provision in the admin audit log', async () => {
    await callAdmin('POST', '/api/holomesh/admin/provision', { name: 'AuditBot' });
    const audit = queryAdminOperationsAudit(50);
    const entry = audit.entries.find((e) => e.action === 'provision');
    expect(entry).toBeDefined();
    expect(entry!.before).toBeNull();
    expect(entry!.after!.agent_name).toBe('AuditBot');
    expect(entry!.actor!.agentName).toBe('Founder');
  });

  it('records before/after for key rotation in the admin audit log', async () => {
    const provisioned = await callAdmin('POST', '/api/holomesh/admin/provision', {
      name: 'RotateAuditBot',
    });
    const agentId = provisioned._body.agent_id;

    await callAdmin('POST', '/api/holomesh/admin/rotate-key', { agent_id: agentId });
    const audit = queryAdminOperationsAudit(50);
    const entry = audit.entries.find((e) => e.action === 'key_rotation');
    expect(entry).toBeDefined();
    expect(entry!.before!.agent_id).toBe(agentId);
    expect(entry!.after!.agent_id).toBe(agentId);
    expect(entry!.after!.rotation_count).toBe(1);
  });
});
