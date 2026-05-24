import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import { handleTeamRoutes } from '../team-routes';
import { handleBoardRoutes } from '../board-routes';
import {
  teamStore,
  keyRegistry,
  agentKeyStore,
  walletToAgent,
  persistTeamStore,
  persistKeyRegistry,
  persistAgentStore,
} from '../../state';
import { resolveRequestingAgent } from '../../auth-utils';
import {
  getCapabilityRegistry,
  resetCapabilityRegistry,
} from '../../identity/signing-middleware';
import type { KeyRecord, Team } from '../../types';
import { mintCapabilityToken, storeCapabilityToken } from '@holoscript/secrets-broker';

const PARENT_KEY = 'parent-agent-key';
const PARENT_ID = 'agent_parent_001';
const PARENT_WALLET = '0x00000000000000000000000000000000000000A1';

const NON_MEMBER_KEY = 'non-member-key';
const NON_MEMBER_ID = 'agent_nonmember_001';
const originalSigningGrace = process.env.HOLOMESH_SIGNING_GRACE;

function seedParent(): void {
  const record: KeyRecord = {
    key: PARENT_KEY,
    walletAddress: PARENT_WALLET,
    agentId: PARENT_ID,
    agentName: 'ParentAgent',
    scopes: ['holomesh', 'mcp'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: false,
  };
  keyRegistry.set(PARENT_KEY, record);
  agentKeyStore.set(PARENT_KEY, {
    id: PARENT_ID,
    apiKey: PARENT_KEY,
    walletAddress: PARENT_WALLET,
    name: 'ParentAgent',
    traits: ['@parent'],
    reputation: 0,
    createdAt: new Date().toISOString(),
  });
  walletToAgent.set(PARENT_WALLET.toLowerCase(), agentKeyStore.get(PARENT_KEY)!);
}

function seedNonMember(): void {
  const record: KeyRecord = {
    key: NON_MEMBER_KEY,
    walletAddress: '0x00000000000000000000000000000000000000B2',
    agentId: NON_MEMBER_ID,
    agentName: 'NonMemberAgent',
    scopes: ['holomesh'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: false,
  };
  keyRegistry.set(NON_MEMBER_KEY, record);
  agentKeyStore.set(NON_MEMBER_KEY, {
    id: NON_MEMBER_ID,
    apiKey: NON_MEMBER_KEY,
    walletAddress: '0x00000000000000000000000000000000000000B2',
    name: 'NonMemberAgent',
    traits: ['@outsider'],
    reputation: 0,
    createdAt: new Date().toISOString(),
  });
}

function createTestTeam(): Team {
  const team: Team = {
    id: 'team_test_mobile',
    name: 'Mobile Test Team',
    description: '',
    type: 'dev',
    visibility: 'private',
    ownerId: PARENT_ID,
    ownerName: 'ParentAgent',
    members: [
      {
        agentId: PARENT_ID,
        agentName: 'ParentAgent',
        role: 'member',
        joinedAt: new Date().toISOString(),
        walletAddress: PARENT_WALLET,
      },
    ],
    maxSlots: 10,
    waitlist: [],
    createdAt: new Date().toISOString(),
    taskBoard: [],
    doneLog: [],
  };
  teamStore.set(team.id, team);
  persistTeamStore();
  return team;
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

async function callTeam(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  key = PARENT_KEY
): Promise<CapturedRes> {
  const req = mockReq(method, path, body, { authorization: `Bearer ${key}` });
  const res = mockRes();
  await handleTeamRoutes(req, res, path, method, path);
  return res;
}

async function callBoard(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  key = PARENT_KEY
): Promise<CapturedRes> {
  const req = mockReq(method, path, body, { authorization: `Bearer ${key}` });
  const res = mockRes();
  await handleBoardRoutes(req, res, path, method, path);
  return res;
}

function seedCapabilityToken(
  overrides: { handle?: string; capabilities?: ('mesh:read' | 'mesh:message')[]; ttlSeconds?: number } = {}
): { tokenId: string; tokenSecret: string; raw: string } {
  const token = mintCapabilityToken({
    handle: (overrides.handle ?? 'mobile1') as `${string}${number}`,
    surface: 'mobile',
    capabilities: overrides.capabilities ?? ['mesh:read'],
    ttlSeconds: overrides.ttlSeconds ?? 3600,
    now: new Date(),
    randomBytes: (size: number) => Buffer.alloc(size, 0xab),
  });
  const stored = storeCapabilityToken(token);
  getCapabilityRegistry().put(stored);
  return {
    tokenId: token.tokenId,
    tokenSecret: token.tokenSecret,
    raw: `${token.tokenId}:${token.tokenSecret}`,
  };
}

beforeEach(() => {
  process.env.HOLOMESH_SIGNING_GRACE = '1';
  teamStore.clear();
  keyRegistry.clear();
  agentKeyStore.clear();
  walletToAgent.clear();
  resetCapabilityRegistry();
  seedParent();
  seedNonMember();
  createTestTeam();
});

afterEach(() => {
  if (originalSigningGrace === undefined) {
    delete process.env.HOLOMESH_SIGNING_GRACE;
  } else {
    process.env.HOLOMESH_SIGNING_GRACE = originalSigningGrace;
  }
});

describe('Team Routes — Mobile Handoff', () => {
  it('POST /api/holomesh/team/:id/mobile-handoff issues a reduced-trust key', async () => {
    const res = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff');

    expect(res._status).toBe(201);
    expect(res._body.success).toBe(true);
    expect(res._body.api_key).toMatch(/^hs_mobile_/);
    expect(res._body.agent_id).toBe(PARENT_ID);
    expect(res._body.scopes).toEqual(['holomesh:read', 'team:read', 'team:message']);
    expect(res._body.surface).toBe('mobile');
    expect(res._body.surface_tag).toBe('mobile');
    expect(res._body.capabilities).toEqual(['read', 'message']);
    expect(res._body.expires_at).toBeTruthy();
    expect(res._body.expires_in).toBe(3600);

    // Key registry should contain the new key
    const record = keyRegistry.get(res._body.api_key);
    expect(record).toBeDefined();
    expect(record?.isFounder).toBe(false);
    expect(record?.surfaceTag).toBe('mobile');
    expect(record?.surface).toBe('mobile');
    expect(record?.capabilities).toEqual(['read', 'message']);
    expect(record?.expiresAt).toBe(res._body.expires_at);
  });

  it('mobile-handoff rejects non-members', async () => {
    const res = await callTeam(
      'POST',
      '/api/holomesh/team/team_test_mobile/mobile-handoff',
      {},
      NON_MEMBER_KEY
    );

    expect(res._status).toBe(403);
    expect(res._body.error).toContain('Not a member');
  });

  it('mobile-handoff rejects unauthenticated requests', async () => {
    const req = mockReq('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff');
    const res = mockRes();
    await handleTeamRoutes(req, res, req.url!, 'POST', req.url!);
    expect(res._status).toBe(401);
  });

  it('mobile-handoff respects custom scopes within defaults', async () => {
    const res = await callTeam(
      'POST',
      '/api/holomesh/team/team_test_mobile/mobile-handoff',
      { scopes: ['holomesh:read'] }
    );

    expect(res._status).toBe(201);
    expect(res._body.scopes).toEqual(['holomesh:read']);
    expect(keyRegistry.get(res._body.api_key)?.scopes).toEqual(['holomesh:read']);
  });

  it('mobile-handoff falls back to default scopes when empty array provided', async () => {
    const res = await callTeam(
      'POST',
      '/api/holomesh/team/team_test_mobile/mobile-handoff',
      { scopes: [] }
    );

    expect(res._status).toBe(201);
    expect(res._body.scopes).toEqual(['holomesh:read', 'team:read', 'team:message']);
  });

  it('mobile-handoff clamps requested capabilities to assistant-safe grants', async () => {
    const res = await callTeam(
      'POST',
      '/api/holomesh/team/team_test_mobile/mobile-handoff',
      { capabilities: ['read', 'claim', 'sign', 'message'] }
    );

    expect(res._status).toBe(201);
    expect(res._body.capabilities).toEqual(['read', 'message']);
    const record = keyRegistry.get(res._body.api_key);
    expect(record?.capabilities).toEqual(['read', 'message']);
  });

  it('mobile-handoff clamps expires_in to max 86400', async () => {
    const res = await callTeam(
      'POST',
      '/api/holomesh/team/team_test_mobile/mobile-handoff',
      { expires_in: 200000 }
    );

    expect(res._status).toBe(201);
    expect(res._body.expires_in).toBe(86400);
  });

  it('mobile-handoff respects custom surface_tag and label', async () => {
    const res = await callTeam(
      'POST',
      '/api/holomesh/team/team_test_mobile/mobile-handoff',
      { surface_tag: 'ios', label: 'My iPhone' }
    );

    expect(res._status).toBe(201);
    expect(res._body.surface_tag).toBe('ios');
    expect(res._body.label).toBe('My iPhone');
    const record = keyRegistry.get(res._body.api_key);
    expect(record?.surfaceTag).toBe('ios');
    expect(record?.agentName).toBe('My iPhone');
  });

  it('mobile-handoff rejects expired keys at auth time', async () => {
    // Create a key that expires in 1 second
    const res1 = await callTeam(
      'POST',
      '/api/holomesh/team/team_test_mobile/mobile-handoff',
      { expires_in: 1 }
    );
    expect(res1._status).toBe(201);
    const mobileKey = res1._body.api_key;

    // Immediately verify it works
    const reqAlive = mockReq('GET', '/api/holomesh/teams', undefined, {
      authorization: `Bearer ${mobileKey}`,
    });
    const callerAlive = resolveRequestingAgent(reqAlive);
    expect(callerAlive.authenticated).toBe(true);
    expect(callerAlive.id).toBe(PARENT_ID);
    expect(callerAlive.agent?.surface).toBe('mobile');
    expect(callerAlive.agent?.surfaceTag).toBe('mobile');
    expect(callerAlive.agent?.capabilities).toEqual(['read', 'message']);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 1100));

    // After expiry, the key should resolve as anonymous
    const reqExpired = mockReq('GET', '/api/holomesh/teams', undefined, {
      authorization: `Bearer ${mobileKey}`,
    });
    const callerExpired = resolveRequestingAgent(reqExpired);
    expect(callerExpired.authenticated).toBe(false);
    expect(callerExpired.id).toBe('anonymous');
  });

  it('mobile-handoff returns 404 for unknown team', async () => {
    const res = await callTeam('POST', '/api/holomesh/team/team_unknown/mobile-handoff');
    expect(res._status).toBe(404);
    expect(res._body.error).toContain('Team not found');
  });

  it('mobile bearer can message but cannot claim board tasks', async () => {
    const mobile = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff');
    expect(mobile._status).toBe(201);
    const mobileKey = mobile._body.api_key;

    const team = teamStore.get('team_test_mobile')!;
    team.taskBoard = [{
      id: 'task_mobile_claim',
      title: 'mobile claim target',
      description: 'mobile must not claim',
      status: 'open',
      priority: 1,
      createdAt: new Date().toISOString(),
    } as any];
    persistTeamStore();

    const message = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/message',
      { content: 'drafting from phone' },
      mobileKey
    );
    expect(message._status).toBe(201);

    const claim = await callBoard(
      'PATCH',
      '/api/holomesh/team/team_test_mobile/board/task_mobile_claim',
      { action: 'claim' },
      mobileKey
    );
    expect(claim._status).toBe(403);
    expect(claim._body.code).toBe('mobile_claim_denied');
    expect(teamStore.get('team_test_mobile')?.taskBoard?.[0].status).toBe('open');
  });

  it('mobile bearer cannot mark board tasks done', async () => {
    const mobile = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff');
    expect(mobile._status).toBe(201);
    const mobileKey = mobile._body.api_key;

    const team = teamStore.get('team_test_mobile')!;
    team.taskBoard = [{
      id: 'task_mobile_done',
      title: 'mobile done target',
      description: 'mobile must not close',
      status: 'claimed',
      priority: 1,
      claimedBy: PARENT_ID,
      claimedByName: 'ParentAgent',
      createdAt: new Date().toISOString(),
    } as any];
    persistTeamStore();

    const done = await callBoard(
      'PATCH',
      '/api/holomesh/team/team_test_mobile/board/task_mobile_done',
      {
        action: 'done',
        summary: 'mobile attempted close',
        verification_evidence: 'should not be accepted from mobile',
      },
      mobileKey
    );

    expect(done._status).toBe(403);
    expect(done._body.code).toBe('mobile_done_denied');
    expect(teamStore.get('team_test_mobile')?.taskBoard?.[0].status).toBe('claimed');
    expect(teamStore.get('team_test_mobile')?.doneLog).toHaveLength(0);
  });

  it('read-message bearer cannot mark board tasks done', async () => {
    const limitedKey = 'limited-desktop-key';
    keyRegistry.set(limitedKey, {
      key: limitedKey,
      walletAddress: PARENT_WALLET,
      agentId: PARENT_ID,
      agentName: 'LimitedDesktop',
      scopes: ['holomesh'],
      createdAt: new Date().toISOString(),
      rotationCount: 0,
      lastRotatedAt: null,
      isFounder: false,
      surface: 'desktop',
      surfaceTag: 'desktop',
      capabilities: ['read', 'message'],
    });

    const team = teamStore.get('team_test_mobile')!;
    team.taskBoard = [{
      id: 'task_limited_done',
      title: 'limited done target',
      description: 'read-message bearer must not close',
      status: 'claimed',
      priority: 1,
      claimedBy: PARENT_ID,
      claimedByName: 'ParentAgent',
      createdAt: new Date().toISOString(),
    } as any];
    persistTeamStore();

    const done = await callBoard(
      'PATCH',
      '/api/holomesh/team/team_test_mobile/board/task_limited_done',
      {
        action: 'done',
        summary: 'limited bearer attempted close',
        verification_evidence: 'should require claim capability',
      },
      limitedKey
    );

    expect(done._status).toBe(403);
    expect(done._body.code).toBe('capability_denied');
    expect(done._body.required_capability).toBe('claim');
    expect(teamStore.get('team_test_mobile')?.taskBoard?.[0].status).toBe('claimed');
    expect(teamStore.get('team_test_mobile')?.doneLog).toHaveLength(0);
  });

  it('desktop relay records mobile-origin provenance on board done', async () => {
    const team = teamStore.get('team_test_mobile')!;
    team.taskBoard = [{
      id: 'task_mobile_relay_done',
      title: 'mobile relay done target',
      description: 'desktop signs a mobile-originated draft',
      status: 'claimed',
      priority: 1,
      claimedBy: PARENT_ID,
      claimedByName: 'ParentAgent',
      createdAt: new Date().toISOString(),
    } as any];
    persistTeamStore();

    const done = await callBoard(
      'PATCH',
      '/api/holomesh/team/team_test_mobile/board/task_mobile_relay_done',
      {
        action: 'done',
        summary: 'desktop relayed a mobile draft',
        verification_evidence: 'desktop relay provenance test passed',
        provenance: { surface_origin: 'mobile' },
      },
      PARENT_KEY
    );

    expect(done._status).toBe(200);
    expect(done._body.task.provenance).toEqual({
      surface_origin: 'mobile',
      relay_signer: 'ParentAgent',
      attribution_chain: ['mobile-drafted', 'desktop-relayed', 'desktop-signed'],
    });

    const entry = teamStore.get('team_test_mobile')?.doneLog?.[0];
    expect(entry?.provenance).toEqual({
      surface_origin: 'mobile',
      relay_signer: 'ParentAgent',
      attribution_chain: ['mobile-drafted', 'desktop-relayed', 'desktop-signed'],
    });
  });
});

describe('Board Routes — Mobile Brief (capability-token auth)', () => {
  it('TRUE: valid capability token with mesh:read returns mobile-brief', async () => {
    const cap = seedCapabilityToken({ handle: 'mobile1', capabilities: ['mesh:read'] });

    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/mobile-brief',
      undefined,
      cap.raw
    );

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.teamId).toBe('team_test_mobile');
    expect(res._body.mode).toBeDefined();
    expect(Array.isArray(res._body.openTasks)).toBe(true);
    expect(Array.isArray(res._body.claimedTasks)).toBe(true);
    expect(Array.isArray(res._body.inbox)).toBe(true);
    expect(Array.isArray(res._body.recentKnowledge)).toBe(true);
    expect(Array.isArray(res._body.openSuggestions)).toBe(true);
    expect(Array.isArray(res._body.presence)).toBe(true);
    expect(typeof res._body.doneCount).toBe('number');
  });

  it('FALSE: capability token with wrong scope (mesh:message) rejects', async () => {
    const cap = seedCapabilityToken({ handle: 'mobile1', capabilities: ['mesh:message'] });

    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/mobile-brief',
      undefined,
      cap.raw
    );

    expect(res._status).toBe(401);
    expect(res._body.error).toBe('Invalid capability token');
    expect(res._body.reason).toBe('capability-not-granted');
  });

  it('FALSE: capability token with invalid secret rejects', async () => {
    const cap = seedCapabilityToken({ handle: 'mobile1', capabilities: ['mesh:read'] });

    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/mobile-brief',
      undefined,
      `${cap.tokenId}:wrongsecret`
    );

    expect(res._status).toBe(401);
    expect(res._body.error).toBe('Invalid capability token');
    expect(res._body.reason).toBe('capability-token-invalid');
  });

  it('FALSE: capability token with revoked token rejects', async () => {
    const cap = seedCapabilityToken({ handle: 'mobile1', capabilities: ['mesh:read'] });
    getCapabilityRegistry().revoke(cap.tokenId, 'test-revoke');

    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/mobile-brief',
      undefined,
      cap.raw
    );

    expect(res._status).toBe(401);
    expect(res._body.error).toBe('Invalid capability token');
    expect(res._body.reason).toBe('capability-token-revoked');
  });

  it('FALSE: capability token expired rejects', async () => {
    const cap = seedCapabilityToken({
      handle: 'mobile1',
      capabilities: ['mesh:read'],
      ttlSeconds: 60,
    });
    // Manually expire the token by patching the registry entry.
    const registry = getCapabilityRegistry();
    const stored = registry.get(cap.tokenId)!;
    registry.put({ ...stored, expiresAt: '2026-05-11T00:00:00Z' } as typeof stored);

    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/mobile-brief',
      undefined,
      cap.raw
    );

    expect(res._status).toBe(401);
    expect(res._body.error).toBe('Invalid capability token');
    expect(res._body.reason).toBe('capability-token-expired');
  });

  it('legacy Bearer API key still works as fallback', async () => {
    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/mobile-brief',
      undefined,
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.teamId).toBe('team_test_mobile');
  });

  it('legacy Bearer API key rejects non-members', async () => {
    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/mobile-brief',
      undefined,
      NON_MEMBER_KEY
    );

    expect(res._status).toBe(403);
    expect(res._body.error).toContain('Not a member');
  });
});

describe('Board Routes — Fleet Snapshot', () => {
  it('returns an explicit missing health state before any fleet snapshot is published', async () => {
    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/fleet',
      undefined,
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.teamId).toBe('team_test_mobile');
    expect(res._body.snapshot).toBeNull();
    expect(res._body.fleet).toBeNull();
    expect(res._body.health.status).toBe('missing');
    expect(res._body.health.reasons).toContain('no_snapshot_published');
  });

  it('stores and serves the latest local fleet-status-live snapshot', async () => {
    const snapshot = {
      captured_at: '2026-05-24T00:10:00.000Z',
      summary: {
        running_count: 1,
        declared_count: 2,
        orphan_count: 0,
        no_instance_count: 0,
        total_cost_so_far_usd: 1.25,
        total_dph_usd: 0.5,
        projected_24h_cost_usd: 12,
        gpu_tier_distribution: { '70+ GB (72b-tier)': 1 },
      },
      matched: [
        {
          handle: 'mesh-worker-01',
          actual_status: 'running',
          gpu_name: 'H100',
          vram_gb: 80,
        },
      ],
      orphans: [],
    };

    const post = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(post._status).toBe(200);
    expect(post._body.stored).toBe(true);
    expect(post._body.source).toBe('fleet-status-live.mjs');
    expect(post._body.health.status).toBe('ok');
    expect(post._body.snapshot.summary.running_count).toBe(1);

    const get = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/fleet',
      undefined,
      PARENT_KEY
    );

    expect(get._status).toBe(200);
    expect(get._body.source).toBe('fleet-status-live.mjs');
    expect(get._body.publishedBy.name).toBe('ParentAgent');
    expect(get._body.snapshot.summary.running_count).toBe(1);
    expect(get._body.fleet.summary.projected_24h_cost_usd).toBe(12);
    expect(get._body.health.status).toBe('ok');
  });

  it('flags published snapshots with orphaned or missing declared workers as degraded', async () => {
    const degradedSnapshot = {
      captured_at: '2026-05-24T00:11:00.000Z',
      summary: {
        running_count: 1,
        declared_count: 3,
        orphan_count: 1,
        no_instance_count: 1,
      },
      matched: [
        {
          handle: 'mesh-worker-02',
          status: 'NO_INSTANCE',
          instance_id: null,
        },
      ],
      orphans: [
        {
          instance_id: 123,
          status: 'ORPHAN',
          gpu_name: 'RTX 4090',
        },
      ],
    };

    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot: degradedSnapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.health.status).toBe('degraded');
    expect(res._body.health.reasons).toContain('orphan_count=1');
    expect(res._body.health.reasons).toContain('no_instance_count=1');
  });
});

describe('Board Routes — Team Message Read State', () => {
  it('marks team messages read through both read route aliases', async () => {
    const created = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/message',
      { content: 'please review the fleet panel', type: 'dm' },
      PARENT_KEY
    );
    expect(created._status).toBe(201);
    const messageId = created._body.message.id;

    const markRead = await callBoard(
      'POST',
      `/api/holomesh/team/team_test_mobile/messages/${messageId}/mark-read`,
      {},
      PARENT_KEY
    );
    expect(markRead._status).toBe(200);
    expect(markRead._body.read).toBe(true);
    expect(markRead._body.readBy).toContain(PARENT_ID);

    const read = await callBoard(
      'POST',
      `/api/holomesh/team/team_test_mobile/messages/${messageId}/read`,
      {},
      PARENT_KEY
    );
    expect(read._status).toBe(200);
    expect(read._body.readBy).toEqual([PARENT_ID]);

    const list = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/messages',
      undefined,
      PARENT_KEY
    );
    expect(list._status).toBe(200);
    const stored = list._body.messages.find((message: { id: string }) => message.id === messageId);
    expect(stored?.readBy).toEqual([PARENT_ID]);
  });
});
