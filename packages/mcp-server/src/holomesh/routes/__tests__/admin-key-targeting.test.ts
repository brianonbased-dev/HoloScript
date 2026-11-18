/**
 * Admin key operations act on ONE record.
 *
 * An agent can hold several keys (a provisioned key plus mobile keys minted for
 * the same agent id), so revoke and rotate target a record by key_id. Revoke
 * refuses the configured founder key, provisioning cannot mint a founder once
 * enforcement is on, and tenant keys can be revoked by id.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMP_DIR = mkdtempSync(join(tmpdir(), 'holomesh-admin-key-targeting-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DIR;

const { revokeTenantKeyById } = vi.hoisted(() => ({ revokeTenantKeyById: vi.fn() }));
vi.mock('../../../security/tenant-auth', () => ({
  revokeTenantKeyById: (id: number) => revokeTenantKeyById(id),
}));

const { handleAdminRoutes } = await import('../admin-routes');
const state = await import('../../state');
const { keyRegistry, agentKeyStore, walletToAgent, keyIdOf, isKeyRevoked } = state;
const { resetAdminOperationsAudit, queryAdminOperationsAudit } =
  await import('../../admin-operations-audit');
import type { KeyRecord } from '../../types';

const FOUNDER_KEY = 'targeting-founder-value';
const NON_FOUNDER_KEY = 'targeting-regular-value';

function rec(key: string, agentId: string, isFounder = false): KeyRecord {
  return {
    key,
    walletAddress: '0x00000000000000000000000000000000000000aa',
    agentId,
    agentName: agentId,
    scopes: ['holomesh'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder,
  };
}

function mockReq(method: string, url: string, body: unknown, key: string): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${key}` };
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 1);
  return req;
}

async function call(path: string, body?: unknown, key = FOUNDER_KEY, method = 'POST') {
  const res = {
    _status: 0,
    _body: null as any,
    writeHead(status: number) {
      res._status = status;
    },
    end(data?: string) {
      if (data) res._body = JSON.parse(data);
    },
  } as any;
  await handleAdminRoutes(mockReq(method, path, body, key), res, path, method, path);
  return res as { _status: number; _body: any };
}

beforeEach(() => {
  keyRegistry.clear();
  agentKeyStore.clear();
  walletToAgent.clear();
  state._resetKeyRevocationsForTests();
  resetAdminOperationsAudit();
  revokeTenantKeyById.mockReset();
  delete process.env.HOLOMESH_DEFOUNDER_DRY_RUN;
  process.env.HOLOMESH_FOUNDER_KEY = FOUNDER_KEY;
  keyRegistry.set(FOUNDER_KEY, rec(FOUNDER_KEY, 'agent_targeting_founder', true));
  keyRegistry.set(NON_FOUNDER_KEY, rec(NON_FOUNDER_KEY, 'agent_targeting_regular'));
});

afterAll(() => {
  delete process.env.HOLOMESH_FOUNDER_KEY;
  delete process.env.HOLOMESH_DEFOUNDER_DRY_RUN;
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

/** One agent holding two keys, as a provisioned key plus a minted mobile key. */
function seedTwoKeys(): [string, string] {
  keyRegistry.set('two-keys-first', rec('two-keys-first', 'agent_two_keys'));
  keyRegistry.set('two-keys-second', rec('two-keys-second', 'agent_two_keys'));
  return [
    keyIdOf(keyRegistry.get('two-keys-first')!),
    keyIdOf(keyRegistry.get('two-keys-second')!),
  ];
}

describe('admin/revoke targets one key', () => {
  it('revokes only the record named by key_id', async () => {
    const [firstId] = seedTwoKeys();

    const res = await call('/api/holomesh/admin/revoke', { key_id: firstId });

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      revoked_keys: 1,
      key_id: firstId,
      agent_id: 'agent_two_keys',
    });
    expect(keyRegistry.has('two-keys-first')).toBe(false);
    expect(keyRegistry.has('two-keys-second')).toBe(true);
    expect(isKeyRevoked('two-keys-first')).toBe(true);
    expect(JSON.stringify(res._body)).not.toContain('two-keys-first');
  });

  it('does not accept agent_id alone', async () => {
    seedTwoKeys();
    const res = await call('/api/holomesh/admin/revoke', { agent_id: 'agent_two_keys' });
    expect(res._status).toBe(400);
    expect(keyRegistry.has('two-keys-first')).toBe(true);
    expect(keyRegistry.has('two-keys-second')).toBe(true);
  });

  it('returns 404 for an unknown key_id', async () => {
    const res = await call('/api/holomesh/admin/revoke', { key_id: 'key_does_not_exist' });
    expect(res._status).toBe(404);
  });

  it('refuses to revoke the configured founder key', async () => {
    const founderId = keyIdOf(keyRegistry.get(FOUNDER_KEY)!);
    const res = await call('/api/holomesh/admin/revoke', { key_id: founderId });
    expect(res._status).toBe(403);
    expect(keyRegistry.has(FOUNDER_KEY)).toBe(true);
  });

  it('rejects non-founders', async () => {
    const [firstId] = seedTwoKeys();
    const res = await call('/api/holomesh/admin/revoke', { key_id: firstId }, NON_FOUNDER_KEY);
    expect(res._status).toBe(403);
    expect(keyRegistry.has('two-keys-first')).toBe(true);
  });

  it('lists key ids per agent so a single key can be targeted', async () => {
    const ids = seedTwoKeys();
    const res = await call('/api/holomesh/admin/agents', undefined, FOUNDER_KEY, 'GET');
    const row = res._body.agents.find((a: any) => a.agent_id === 'agent_two_keys');
    expect(row.key_ids.sort()).toEqual([...ids].sort());
    expect(JSON.stringify(res._body)).not.toContain('two-keys-first');
  });
});

describe('admin/rotate-key targets one record', () => {
  it('refuses an ambiguous agent_id with 409 and rotates nothing', async () => {
    const ids = seedTwoKeys();
    const res = await call('/api/holomesh/admin/rotate-key', { agent_id: 'agent_two_keys' });
    expect(res._status).toBe(409);
    expect(res._body.success).toBeUndefined();
    expect(res._body.key_ids.sort()).toEqual([...ids].sort());
    expect(keyRegistry.has('two-keys-first')).toBe(true);
    expect(keyRegistry.has('two-keys-second')).toBe(true);
  });

  it('rotates the record named by key_id and revokes its old value', async () => {
    const [, secondId] = seedTwoKeys();
    const res = await call('/api/holomesh/admin/rotate-key', { key_id: secondId });
    expect(res._status).toBe(200);
    expect(keyRegistry.has('two-keys-second')).toBe(false);
    expect(keyRegistry.has('two-keys-first')).toBe(true);
    expect(isKeyRevoked('two-keys-second')).toBe(true);
    expect(res._body.key_id).not.toBe(secondId);
    expect(keyRegistry.get(res._body.new_key)?.keyId).toBe(res._body.key_id);
  });

  it('returns 404 for an unknown key_id', async () => {
    const res = await call('/api/holomesh/admin/rotate-key', { key_id: 'key_does_not_exist' });
    expect(res._status).toBe(404);
    expect(res._body.success).toBeUndefined();
  });
});

describe('provision and the founder flag', () => {
  it('in dry run (the default) still provisions, so nothing changes yet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await call('/api/holomesh/admin/provision', {
      name: 'DryRunFlagged',
      is_founder: true,
    });
    expect(res._status).toBe(201);
    expect(res._body.key_id).toMatch(/^key_/);
  });

  it('when enforced, refuses is_founder', async () => {
    process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
    const res = await call('/api/holomesh/admin/provision', {
      name: 'EnforcedFlagged',
      is_founder: true,
    });
    expect(res._status).toBe(400);
    expect([...keyRegistry.values()].some((r) => r.agentName === 'EnforcedFlagged')).toBe(false);
  });
});

describe('admin/tenant-keys/revoke', () => {
  const path = '/api/holomesh/admin/tenant-keys/revoke';

  it('rejects non-founders before touching the store', async () => {
    const res = await call(path, { id: 7 }, NON_FOUNDER_KEY);
    expect(res._status).toBe(403);
    expect(revokeTenantKeyById).not.toHaveBeenCalled();
  });

  it('rejects anonymous callers', async () => {
    const res = await call(path, { id: 7 }, 'not-a-registered-value');
    expect(res._status).toBe(403);
    expect(revokeTenantKeyById).not.toHaveBeenCalled();
  });

  it('requires a positive integer id', async () => {
    for (const id of [undefined, 0, -1, 1.5, 'abc']) {
      const res = await call(path, { id });
      expect(res._status).toBe(400);
    }
    expect(revokeTenantKeyById).not.toHaveBeenCalled();
  });

  it('revokes by id and records an audit entry', async () => {
    revokeTenantKeyById.mockResolvedValue({
      status: 'revoked',
      id: 7,
      tenantId: 'tenant_seven',
      cacheCleared: null,
    });
    const res = await call(path, { id: 7 });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      success: true,
      id: 7,
      tenant_id: 'tenant_seven',
      cache_cleared: null,
    });
    expect(revokeTenantKeyById).toHaveBeenCalledWith(7);
    const audit = queryAdminOperationsAudit(10);
    expect(JSON.stringify(audit)).toContain('tenant_key_revoke');
  });

  it('maps not_found to 404 and unavailable to 503', async () => {
    revokeTenantKeyById.mockResolvedValueOnce({ status: 'not_found' });
    expect((await call(path, { id: 8 }))._status).toBe(404);
    revokeTenantKeyById.mockResolvedValueOnce({ status: 'unavailable' });
    expect((await call(path, { id: 8 }))._status).toBe(503);
  });
});
