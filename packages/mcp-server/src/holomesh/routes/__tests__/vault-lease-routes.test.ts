import { beforeEach, describe, expect, it } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import { handleVaultLeaseRoutes } from '../vault-lease-routes';
import { keyRegistry } from '../../state';
import type { KeyRecord } from '../../types';
import {
  issueLease,
  queryLeases,
  _resetVaultLeaseRegistryForTests,
} from '../../identity/vault-lease-registry';
import {
  _resetAuditLogForTests,
} from '../../identity/audit-log';

const AGENT_KEY = 'vault-agent-key';
const FOUNDER_KEY = 'vault-founder-key';
const AGENT_ID = 'agent-vault';
const FOUNDER_ID = 'agent-founder';

function seedKey(key: string, agentId: string, isFounder = false): void {
  const record: KeyRecord = {
    key,
    walletAddress: isFounder
      ? '0x0000000000000000000000000000000000000001'
      : '0x0000000000000000000000000000000000000002',
    agentId,
    agentName: isFounder ? 'Founder' : 'VaultAgent',
    scopes: ['*'],
    createdAt: new Date().toISOString(),
    isFounder,
  };
  keyRegistry.set(key, record);
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

async function callRoute(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  key = AGENT_KEY
): Promise<CapturedRes> {
  const req = mockReq(method, path, body, { authorization: `Bearer ${key}` });
  const res = mockRes();
  await handleVaultLeaseRoutes(req, res, path, method, path);
  return res;
}

beforeEach(() => {
  keyRegistry.clear();
  _resetVaultLeaseRegistryForTests();
  _resetAuditLogForTests();
  seedKey(AGENT_KEY, AGENT_ID);
  seedKey(FOUNDER_KEY, FOUNDER_ID, true);
});

describe('handleVaultLeaseRoutes', () => {
  it('returns false for non-vault paths', async () => {
    const req = mockReq('GET', '/api/identity/unknown');
    const res = mockRes();
    const handled = await handleVaultLeaseRoutes(
      req,
      res,
      '/api/identity/unknown',
      'GET',
      '/api/identity/unknown'
    );
    expect(handled).toBe(false);
  });

  it('issues and resolves a lease without exposing secret material', async () => {
    const issued = await callRoute('POST', '/api/identity/vault/lease', {
      taskId: 'task-vault-1',
      scope: ['env:HOLOSCRIPT_API_KEY'],
      durationMs: 60_000,
    });

    expect(issued._status).toBe(201);
    expect(issued._body.lease.agentId).toBe(AGENT_ID);
    const leaseId = issued._body.lease.leaseId;

    const resolved = await callRoute(
      'POST',
      `/api/identity/vault/lease/${leaseId}/resolve`,
      { secretRef: 'env:HOLOSCRIPT_API_KEY' }
    );
    expect(resolved._status).toBe(200);
    expect(resolved._body).toMatchObject({
      ok: true,
      resolved: true,
      secretRef: 'env:HOLOSCRIPT_API_KEY',
      agentId: AGENT_ID,
    });
    expect(resolved._body.value).toBeUndefined();
  });

  it('rejects scope violations and non-founder delegated issuance', async () => {
    const deniedIssue = await callRoute('POST', '/api/identity/vault/lease', {
      taskId: 'task-vault-2',
      agentId: 'agent-other',
      scope: ['env:KEY_A'],
    });
    expect(deniedIssue._status).toBe(403);
    expect(queryLeases({ agentId: 'agent-other' })).toHaveLength(0);

    const issued = await callRoute('POST', '/api/identity/vault/lease', {
      taskId: 'task-vault-3',
      scope: ['env:KEY_A'],
    });
    const leaseId = issued._body.lease.leaseId;
    const deniedResolve = await callRoute(
      'POST',
      `/api/identity/vault/lease/${leaseId}/resolve`,
      { secretRef: 'env:KEY_B' }
    );
    expect(deniedResolve._status).toBe(403);
    expect(deniedResolve._body.error).toBe('lease_scope_violation');
  });

  it('keeps lease sweeping founder-only', async () => {
    const issued = issueLease({
      taskId: 'task-expired',
      agentId: AGENT_ID,
      scope: ['env:KEY_A'],
      durationMs: 1000,
      now: Date.now() - 5000,
    });
    expect(issued.ok).toBe(true);

    const denied = await callRoute('POST', '/api/identity/vault/sweep', {});
    expect(denied._status).toBe(403);

    const swept = await callRoute('POST', '/api/identity/vault/sweep', {}, FOUNDER_KEY);
    expect(swept._status).toBe(200);
    expect(swept._body.sweptCount).toBe(1);
  });
});
