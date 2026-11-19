/**
 * Admin key operations act on ONE record.
 *
 * An agent can hold several keys (a provisioned key plus mobile keys minted for
 * the same agent id), so revoke, rotate and update-scopes target a record by
 * key_id. Founder records need confirm_founder and the last one is never
 * revoked, a key still held by a seedable env var answers 409, a change that
 * cannot be saved is done in memory and answers 503, provisioning
 * cannot mint a founder once enforcement is on, and tenant keys can be revoked
 * by id.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  delete process.env.HOLOMESH_API_KEY;
  process.env.HOLOMESH_DATA_DIR = TEMP_DIR;
  rmSync(join(TEMP_DIR, 'revoked-keys.json'), { recursive: true, force: true });
  process.env.HOLOMESH_FOUNDER_KEY = FOUNDER_KEY;
  keyRegistry.set(FOUNDER_KEY, rec(FOUNDER_KEY, 'agent_targeting_founder', true));
  keyRegistry.set(NON_FOUNDER_KEY, rec(NON_FOUNDER_KEY, 'agent_targeting_regular'));
});

afterAll(() => {
  delete process.env.HOLOMESH_API_KEY;
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

  it('answers 503, not success, when the cache entry could not be cleared', async () => {
    revokeTenantKeyById.mockResolvedValue({
      status: 'revoked',
      id: 9,
      tenantId: 'tenant_nine',
      cacheCleared: false,
    });
    const res = await call(path, { id: 9 });
    expect(res._status).toBe(503);
    expect(res._body.success).toBe(false);
    expect(res._body.cache_cleared).toBe(false);
  });

  it('maps not_found to 404 and unavailable to 503', async () => {
    revokeTenantKeyById.mockResolvedValueOnce({ status: 'not_found' });
    expect((await call(path, { id: 8 }))._status).toBe(404);
    revokeTenantKeyById.mockResolvedValueOnce({ status: 'unavailable' });
    expect((await call(path, { id: 8 }))._status).toBe(503);
  });
});

describe('founder records need an explicit confirm', () => {
  const OTHER_FOUNDER = 'targeting-other-founder-value';

  it('revoke refuses a founder record that is not the configured key', async () => {
    keyRegistry.set(OTHER_FOUNDER, rec(OTHER_FOUNDER, 'agent_other_founder', true));
    const id = keyIdOf(keyRegistry.get(OTHER_FOUNDER)!);
    const res = await call('/api/holomesh/admin/revoke', { key_id: id });
    expect(res._status).toBe(403);
    expect(keyRegistry.has(OTHER_FOUNDER)).toBe(true);
    expect(isKeyRevoked(OTHER_FOUNDER)).toBe(false);
  });

  it('revoke refuses the only founder when HOLOMESH_FOUNDER_KEY is unset', async () => {
    delete process.env.HOLOMESH_FOUNDER_KEY;
    const id = keyIdOf(keyRegistry.get(FOUNDER_KEY)!);
    const res = await call('/api/holomesh/admin/revoke', { key_id: id });
    expect(res._status).toBe(403);
    expect(keyRegistry.has(FOUNDER_KEY)).toBe(true);
  });

  it('revoke goes ahead with confirm_founder: true', async () => {
    keyRegistry.set(OTHER_FOUNDER, rec(OTHER_FOUNDER, 'agent_other_founder', true));
    const id = keyIdOf(keyRegistry.get(OTHER_FOUNDER)!);
    const res = await call('/api/holomesh/admin/revoke', { key_id: id, confirm_founder: true });
    expect(res._status).toBe(200);
    expect(isKeyRevoked(OTHER_FOUNDER)).toBe(true);
  });

  it('revoke refuses the last founder record even with confirm and the env var unset', async () => {
    delete process.env.HOLOMESH_FOUNDER_KEY;
    const id = keyIdOf(keyRegistry.get(FOUNDER_KEY)!);
    const res = await call('/api/holomesh/admin/revoke', { key_id: id, confirm_founder: true });
    expect(res._status).toBe(403);
    expect(res._body.error).toMatch(/last founder/);
    expect(keyRegistry.has(FOUNDER_KEY)).toBe(true);
    expect(isKeyRevoked(FOUNDER_KEY)).toBe(false);
  });

  it('revoke still refuses the configured founder key even with confirm', async () => {
    const id = keyIdOf(keyRegistry.get(FOUNDER_KEY)!);
    const res = await call('/api/holomesh/admin/revoke', { key_id: id, confirm_founder: true });
    expect(res._status).toBe(403);
    expect(keyRegistry.has(FOUNDER_KEY)).toBe(true);
  });

  it('rotate refuses a founder record without confirm, and says what to do with it', async () => {
    const id = keyIdOf(keyRegistry.get(FOUNDER_KEY)!);
    const res = await call('/api/holomesh/admin/rotate-key', { key_id: id });
    expect(res._status).toBe(409);
    expect(keyRegistry.has(FOUNDER_KEY)).toBe(true);
    expect(isKeyRevoked(FOUNDER_KEY)).toBe(false);

    const confirmed = await call('/api/holomesh/admin/rotate-key', {
      key_id: id,
      confirm_founder: true,
    });
    expect(confirmed._status).toBe(200);
    expect(confirmed._body.founder_key_env_update_required).toMatch(/HOLOMESH_FOUNDER_KEY/);
    expect(keyRegistry.get(confirmed._body.new_key)?.isFounder).toBe(true);
  });
});

describe('a key still held by a seedable env var', () => {
  it('cannot be revoked or rotated through the API (409)', async () => {
    process.env.HOLOMESH_API_KEY = NON_FOUNDER_KEY;
    const id = keyIdOf(keyRegistry.get(NON_FOUNDER_KEY)!);

    const revoke = await call('/api/holomesh/admin/revoke', { key_id: id });
    expect(revoke._status).toBe(409);
    expect(revoke._body.env_var).toBe('HOLOMESH_API_KEY');

    const rotate = await call('/api/holomesh/admin/rotate-key', { key_id: id });
    expect(rotate._status).toBe(409);

    expect(keyRegistry.has(NON_FOUNDER_KEY)).toBe(true);
    expect(isKeyRevoked(NON_FOUNDER_KEY)).toBe(false);
    expect(JSON.stringify([revoke._body, rotate._body])).not.toContain(NON_FOUNDER_KEY);
  });
});

describe('a change that cannot be saved fails closed, in every mode', () => {
  const BLOCKER = () => join(TEMP_DIR, 'revoked-keys.json', 'blocker');

  it('revoke: key dead in memory, 503 not durable; a retry re-attempts the save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A directory where the file should be: the write fails even for root.
    mkdirSync(BLOCKER(), { recursive: true });
    const [firstId] = seedTwoKeys();

    const res = await call('/api/holomesh/admin/revoke', { key_id: firstId });

    expect(res._status).toBe(503);
    expect(res._body).toMatchObject({
      success: false,
      durable: false,
      in_memory_only: true,
      revoked_in_memory: true,
    });
    expect(keyRegistry.has('two-keys-first')).toBe(false);
    expect(isKeyRevoked('two-keys-first')).toBe(true);
    expect(JSON.stringify(queryAdminOperationsAudit(10))).toContain('"durable":false');

    // Retry while still broken: no 404, still not durable.
    const retry = await call('/api/holomesh/admin/revoke', { key_id: firstId });
    expect(retry._status).toBe(503);
    expect(retry._body.already_revoked).toBe(true);

    // Fix the store, retry: saved.
    rmSync(join(TEMP_DIR, 'revoked-keys.json'), { recursive: true, force: true });
    const saved = await call('/api/holomesh/admin/revoke', { key_id: firstId });
    expect(saved._status).toBe(200);
    expect(saved._body).toMatchObject({ success: true, durable: true, already_revoked: true });
  });

  for (const mode of ['dry run', 'enforced']) {
    it(`revoke with HOLOMESH_DATA_DIR unset answers 503 (${mode}), key dead in memory`, async () => {
      if (mode === 'enforced') process.env.HOLOMESH_DEFOUNDER_DRY_RUN = '0';
      delete process.env.HOLOMESH_DATA_DIR;
      const [firstId] = seedTwoKeys();

      const res = await call('/api/holomesh/admin/revoke', { key_id: firstId });

      expect(res._status).toBe(503);
      expect(res._body.problem).toMatch(/HOLOMESH_DATA_DIR/);
      expect(keyRegistry.has('two-keys-first')).toBe(false);
      expect(isKeyRevoked('two-keys-first')).toBe(true);
    });
  }

  it('rotate: 503 says new_key is live; a retry by the old key_id re-attempts the save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mkdirSync(BLOCKER(), { recursive: true });
    const [, secondId] = seedTwoKeys();

    const res = await call('/api/holomesh/admin/rotate-key', { key_id: secondId });

    expect(res._status).toBe(503);
    expect(res._body).toMatchObject({
      durable: false,
      in_memory_only: true,
      new_key_live: true,
      old_key_revoked_in_memory: true,
    });
    expect(keyRegistry.has(res._body.new_key)).toBe(true);
    expect(isKeyRevoked('two-keys-second')).toBe(true);

    rmSync(join(TEMP_DIR, 'revoked-keys.json'), { recursive: true, force: true });
    const retry = await call('/api/holomesh/admin/rotate-key', { key_id: secondId });
    expect(retry._status).toBe(200);
    expect(retry._body).toMatchObject({
      durable: true,
      already_rotated: true,
      key_id: res._body.key_id,
    });
    expect(retry._body.new_key).toBeUndefined();
  });

  it('deregister: 503 removed in memory; a retry re-attempts the save', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mkdirSync(BLOCKER(), { recursive: true });
    seedTwoKeys();

    const res = await call('/api/holomesh/admin/deregister', { agent_id: 'agent_two_keys' });

    expect(res._status).toBe(503);
    expect(res._body).toMatchObject({ durable: false, removed_in_memory: true });
    expect(isKeyRevoked('two-keys-first')).toBe(true);
    expect(isKeyRevoked('two-keys-second')).toBe(true);

    rmSync(join(TEMP_DIR, 'revoked-keys.json'), { recursive: true, force: true });
    const retry = await call('/api/holomesh/admin/deregister', { agent_id: 'agent_two_keys' });
    expect(retry._status).toBe(200);
    expect(retry._body).toMatchObject({ durable: true, already_removed: true });

    // Once saved, the retry entry is gone: a further retry is an honest 404.
    const again = await call('/api/holomesh/admin/deregister', { agent_id: 'agent_two_keys' });
    expect(again._status).toBe(404);
  });
});

describe('admin/update-scopes targets one record', () => {
  it('refuses an ambiguous agent_id with 409', async () => {
    const ids = seedTwoKeys();
    const res = await call('/api/holomesh/admin/update-scopes', {
      agent_id: 'agent_two_keys',
      scopes: ['tools:read'],
    });
    expect(res._status).toBe(409);
    expect(res._body.key_ids.sort()).toEqual([...ids].sort());
    expect(keyRegistry.get('two-keys-first')?.scopes).toEqual(['holomesh']);
    expect(keyRegistry.get('two-keys-second')?.scopes).toEqual(['holomesh']);
  });

  it('updates only the record named by key_id', async () => {
    const [, secondId] = seedTwoKeys();
    const res = await call('/api/holomesh/admin/update-scopes', {
      key_id: secondId,
      scopes: ['tools:read'],
    });
    expect(res._status).toBe(200);
    expect(keyRegistry.get('two-keys-second')?.scopes).toEqual(['tools:read']);
    expect(keyRegistry.get('two-keys-first')?.scopes).toEqual(['holomesh']);
  });

  it('returns 404 for an unknown key_id', async () => {
    const res = await call('/api/holomesh/admin/update-scopes', {
      key_id: 'key_does_not_exist',
      scopes: ['tools:read'],
    });
    expect(res._status).toBe(404);
  });
});

describe('boot volume check in production', () => {
  it('a revoke answers 503 once boot flags the data dir as not on a volume', async () => {
    const mountinfo = join(TEMP_DIR, 'mountinfo-root-only');
    writeFileSync(mountinfo, '22 1 0:21 / / rw,relatime - overlay overlay rw\n');
    const savedNodeEnv = process.env.NODE_ENV;
    const savedDatabaseUrl = process.env.DATABASE_URL;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    state._setMountinfoPathForTests(mountinfo);
    try {
      await state.initStores();
      expect(state.keyStoreDurabilityProblem()).toMatch(/not on a mounted volume/);
      expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/ERROR: HOLOMESH_DATA_DIR is not/);

      keyRegistry.set(FOUNDER_KEY, rec(FOUNDER_KEY, 'agent_targeting_founder', true));
      keyRegistry.set(NON_FOUNDER_KEY, rec(NON_FOUNDER_KEY, 'agent_targeting_regular'));
      const keyId = keyIdOf(keyRegistry.get(NON_FOUNDER_KEY)!);
      const res = await call('/api/holomesh/admin/revoke', { key_id: keyId });

      expect(res._status).toBe(503);
      expect(res._body).toMatchObject({
        success: false,
        durable: false,
        in_memory_only: true,
        revoked_in_memory: true,
        key_id: keyId,
      });
      expect(res._body.problem).toMatch(/not on a mounted volume/);
      expect(isKeyRevoked(NON_FOUNDER_KEY)).toBe(true);
    } finally {
      state._setMountinfoPathForTests(null);
      errorSpy.mockRestore();
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
      if (savedDatabaseUrl !== undefined) process.env.DATABASE_URL = savedDatabaseUrl;
    }
    expect(state.keyStoreDurabilityProblem()).toBeNull();
  });
});
