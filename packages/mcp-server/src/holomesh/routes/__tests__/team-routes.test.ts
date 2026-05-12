import { beforeEach, describe, expect, it } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import { handleTeamRoutes } from '../team-routes';
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
import type { KeyRecord, Team } from '../../types';

const PARENT_KEY = 'parent-agent-key';
const PARENT_ID = 'agent_parent_001';
const PARENT_WALLET = '0x00000000000000000000000000000000000000A1';

const NON_MEMBER_KEY = 'non-member-key';
const NON_MEMBER_ID = 'agent_nonmember_001';

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

beforeEach(() => {
  teamStore.clear();
  keyRegistry.clear();
  agentKeyStore.clear();
  walletToAgent.clear();
  seedParent();
  seedNonMember();
  createTestTeam();
});

describe('Team Routes — Mobile Handoff', () => {
  it('POST /api/holomesh/team/:id/mobile-handoff issues a reduced-trust key', async () => {
    const res = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff');

    expect(res._status).toBe(201);
    expect(res._body.success).toBe(true);
    expect(res._body.api_key).toMatch(/^hs_mobile_/);
    expect(res._body.agent_id).toBe(PARENT_ID);
    expect(res._body.scopes).toEqual(['holomesh:read', 'team:read']);
    expect(res._body.surface_tag).toBe('mobile');
    expect(res._body.expires_at).toBeTruthy();
    expect(res._body.expires_in).toBe(3600);

    // Key registry should contain the new key
    const record = keyRegistry.get(res._body.api_key);
    expect(record).toBeDefined();
    expect(record?.isFounder).toBe(false);
    expect(record?.surfaceTag).toBe('mobile');
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
    expect(res._body.scopes).toEqual(['holomesh:read', 'team:read']);
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
});
