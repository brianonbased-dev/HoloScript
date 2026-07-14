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
import { getCapabilityRegistry, resetCapabilityRegistry } from '../../identity/signing-middleware';
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

function freshCapturedAt(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function validV2FleetSnapshot(capturedAt = freshCapturedAt()) {
  return {
    schema_version: 'holomesh.fleet-snapshot/v2',
    captured_at: capturedAt,
    summary: {
      captured_at: capturedAt,
      running_count: 0,
      declared_count: 1,
      orphan_count: 0,
      orphaned_capacity_count: 0,
      no_instance_count: 0,
      total_cost_so_far_usd: 0,
      total_dph_usd: 0.01,
      projected_24h_cost_usd: 0.24,
    },
    matched: [],
    orphans: [],
    resource_flow: {
      schema_version: 'holomesh.vast-resource-flow/v1',
      provider: 'vast.ai',
      captured_at: capturedAt,
      spend_accounting: {
        schema_version: 'holomesh.vast-spend-accounting/v1',
        provider: 'vast.ai',
        status: 'ok',
        observed_at_utc: capturedAt,
        freshness_status: 'fresh',
        age_ms: 0,
        max_age_ms: 900_000,
        rail: 'purchased_compute',
        reset_window: 'utc_day',
        vendor_total_usd: 0.076,
        observed_purchased_compute_usd: 0.076,
        monetary_complete: true,
        monetary_gap_reasons: [],
        provenance_complete: true,
        provenance_gap_reasons: [],
        intentional_gap_captured: false,
        cap_applicable: true,
        cap_usd: 100,
        observed_admission_verdict: 'under-cap',
        trusted_admission_verdict: 'under-cap',
        trusted_headroom_usd: 99.924,
        no_paid_actions: true,
      },
      utilized: {
        instance_count: 1,
        active_compute_count: 0,
        retained_storage_count: 1,
        manifest_bound_instance_count: 1,
        unbound_instance_count: 0,
        capacity_binding_count: 1,
        effective_dph_usd: 0.01,
        projected_24h_usd: 0.24,
        resources: [
          {
            instance_id: 44496858,
            market_cheapest_dph_usd: null,
            listed_compute_dph_usd: null,
            listed_total_dph_usd: 0.01,
          },
        ],
        capacity_bindings: [{ instance_id: 44496858, lane_id: 'lane-1' }],
      },
      produced: {
        output_aware_lane_count: 1,
        active_manifest_count: 1,
        output_contract_count: 1,
        bound_manifest_count: 1,
        unbound_manifest_count: 0,
        evidence_backed_output_count: 0,
        verified_product_count: 0,
        verified_artifact_count: 0,
        verified_receipt_count: 0,
        verified_current_binding_count: 0,
        declared_only_output_count: 1,
        unverified_evidence_output_count: 0,
        claimed_or_unverified_output_count: 1,
        productive_count: 0,
        work_in_progress_count: 0,
        inference_output_tokens: 0,
        provider_attributed_contract_count: 1,
        provider_unattributed_contract_count: 0,
        catalog_active_manifest_count: 1,
        catalog_output_contract_count: 1,
        catalog_verified_product_count: 0,
        catalog_verified_artifact_count: 0,
        catalog_verified_receipt_count: 0,
        catalog_declared_only_output_count: 1,
        catalog_unverified_evidence_output_count: 0,
        active_manifests: [
          {
            lane_id: 'lane-1',
            binding_state: 'bound_current_capacity',
            bound_instance_count: 1,
          },
        ],
        output_contracts: [{ lane_id: 'lane-1', evidence_backed: false }],
        declared_output_locations: ['manifest://lane-1'],
        claimed_or_declared_outputs: [{ lane_id: 'lane-1' }],
        artifacts: [],
        receipts: [],
        provider_attributed: {
          provider: 'vast.ai',
          active_manifest_count: 1,
          output_contract_count: 1,
          verified_product_count: 0,
          verified_artifact_count: 0,
          verified_receipt_count: 0,
          active_manifests: [{ lane_id: 'lane-1' }],
          output_contracts: [{ lane_id: 'lane-1', evidence_backed: false }],
          claimed_or_declared_outputs: [{ lane_id: 'lane-1' }],
          verified_artifacts: [],
          verified_receipts: [],
        },
        fleet_catalog: {
          active_manifest_count: 1,
          output_contract_count: 1,
          verified_product_count: 0,
          verified_artifact_count: 0,
          verified_receipt_count: 0,
          provider_unattributed_contract_count: 0,
          active_manifests: [{ lane_id: 'lane-1' }],
          output_contracts: [{ lane_id: 'lane-1', evidence_backed: false }],
          declared_output_locations: ['manifest://lane-1'],
          claimed_or_declared_outputs: [{ lane_id: 'lane-1' }],
          verified_artifacts: [],
          verified_receipts: [],
        },
        product_verification_policy:
          'artifact_and_receipt_sha256_match;vast_endpoint_receipt_binding_match',
      },
      stored: {
        instance_volume_count: 1,
        total_capacity_gb: 40,
        total_used_gb: 1,
        projected_storage_24h_usd: 0.24,
        volumes: [
          {
            instance_id: 44496858,
            storage_dph_usd: null,
            projected_storage_24h_usd: null,
          },
        ],
        locally_present_output_location_count: 0,
        verified_artifact_location_count: 0,
        verified_receipt_location_count: 0,
        evidence_backed_output_location_count: 0,
        artifact_locations: [],
        receipt_locations: [],
        catalog_verified_artifact_location_count: 0,
        catalog_verified_receipt_location_count: 0,
        catalog_evidence_backed_output_location_count: 0,
        catalog_artifact_locations: [],
        catalog_receipt_locations: [],
        fleet_catalog: {
          verified_artifact_location_count: 0,
          verified_receipt_location_count: 0,
          evidence_backed_output_location_count: 0,
          artifact_locations: [],
          receipt_locations: [],
        },
      },
      consumed: {
        consumer_count: 1,
        manifest_attributed_count: 1,
        current_physical_consumer_count: 1,
        declared_or_historical_manifest_consumer_count: 1,
        bound_manifest_consumer_count: 1,
        unbound_manifest_consumer_count: 0,
        runtime_requests: 0,
        compute_bearing_requests: 0,
        runtime_metrics_age_ms: null,
        runtime_providers: [],
        runtime_endpoints: [],
        consumers: [{ lane_id: 'lane-1', attribution_state: 'manifest' }],
        current_physical_consumers: [{ lane_id: 'lane-1' }],
        declared_or_historical_manifest_consumers: [
          { lane_id: 'lane-1', binding_state: 'bound_current_capacity' },
        ],
        catalog_declared_or_historical_manifest_consumer_count: 1,
        catalog_bound_manifest_consumer_count: 1,
        catalog_unbound_manifest_consumer_count: 0,
        catalog_declared_or_historical_manifest_consumers: [
          { lane_id: 'lane-1', binding_state: 'bound_current_capacity' },
        ],
      },
      visibility: {
        complete: true,
        gap_count: 0,
        gaps: [],
        duplicate_endpoint_bindings: [],
        invalid_manifest_count: 0,
        invalid_manifests: [],
        evidence_sources: ['vastai show instances --raw'],
      },
    },
  };
}

function seedCapabilityToken(
  overrides: {
    handle?: string;
    capabilities?: ('mesh:read' | 'mesh:message')[];
    ttlSeconds?: number;
  } = {}
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
  it('POST /api/holomesh/team waits for durable Postgres write before returning 201', async () => {
    let persistedTeamId: string | null = null;
    let durableWriteCompleted = false;
    Object.defineProperty(teamStore, 'usesPostgres', {
      configurable: true,
      get: () => true,
    });
    const persistSpy = vi.spyOn(teamStore, 'persist').mockImplementation(async (teamId: string) => {
      persistedTeamId = teamId;
      await new Promise((resolve) => setTimeout(resolve, 5));
      durableWriteCompleted = true;
    });

    try {
      const res = await callTeam('POST', '/api/holomesh/team', {
        name: `Durable Create ${Date.now()}`,
        type: 'dev',
        visibility: 'private',
        max_slots: 4,
      });

      expect(res._status).toBe(201);
      expect(durableWriteCompleted).toBe(true);
      expect(persistedTeamId).toBe(res._body.team.id);
      expect(persistSpy).toHaveBeenCalledWith(res._body.team.id);
    } finally {
      persistSpy.mockRestore();
      delete (teamStore as unknown as { usesPostgres?: boolean }).usesPostgres;
    }
  });

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
    const res = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff', {
      scopes: ['holomesh:read'],
    });

    expect(res._status).toBe(201);
    expect(res._body.scopes).toEqual(['holomesh:read']);
    expect(keyRegistry.get(res._body.api_key)?.scopes).toEqual(['holomesh:read']);
  });

  it('mobile-handoff falls back to default scopes when empty array provided', async () => {
    const res = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff', {
      scopes: [],
    });

    expect(res._status).toBe(201);
    expect(res._body.scopes).toEqual(['holomesh:read', 'team:read', 'team:message']);
  });

  it('mobile-handoff clamps requested capabilities to assistant-safe grants', async () => {
    const res = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff', {
      capabilities: ['read', 'claim', 'sign', 'message'],
    });

    expect(res._status).toBe(201);
    expect(res._body.capabilities).toEqual(['read', 'message']);
    const record = keyRegistry.get(res._body.api_key);
    expect(record?.capabilities).toEqual(['read', 'message']);
  });

  it('mobile-handoff clamps expires_in to max 86400', async () => {
    const res = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff', {
      expires_in: 200000,
    });

    expect(res._status).toBe(201);
    expect(res._body.expires_in).toBe(86400);
  });

  it('mobile-handoff respects custom surface_tag and label', async () => {
    const res = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff', {
      surface_tag: 'ios',
      label: 'My iPhone',
    });

    expect(res._status).toBe(201);
    expect(res._body.surface_tag).toBe('ios');
    expect(res._body.label).toBe('My iPhone');
    const record = keyRegistry.get(res._body.api_key);
    expect(record?.surfaceTag).toBe('ios');
    expect(record?.agentName).toBe('My iPhone');
  });

  it('mobile-handoff rejects expired keys at auth time', async () => {
    // Create a key that expires in 1 second
    const res1 = await callTeam('POST', '/api/holomesh/team/team_test_mobile/mobile-handoff', {
      expires_in: 1,
    });
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
    team.taskBoard = [
      {
        id: 'task_mobile_claim',
        title: 'mobile claim target',
        description: 'mobile must not claim',
        status: 'open',
        priority: 1,
        createdAt: new Date().toISOString(),
      } as any,
    ];
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
    team.taskBoard = [
      {
        id: 'task_mobile_done',
        title: 'mobile done target',
        description: 'mobile must not close',
        status: 'claimed',
        priority: 1,
        claimedBy: PARENT_ID,
        claimedByName: 'ParentAgent',
        createdAt: new Date().toISOString(),
      } as any,
    ];
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
    team.taskBoard = [
      {
        id: 'task_limited_done',
        title: 'limited done target',
        description: 'read-message bearer must not close',
        status: 'claimed',
        priority: 1,
        claimedBy: PARENT_ID,
        claimedByName: 'ParentAgent',
        createdAt: new Date().toISOString(),
      } as any,
    ];
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
    team.taskBoard = [
      {
        id: 'task_mobile_relay_done',
        title: 'mobile relay done target',
        description: 'desktop signs a mobile-originated draft',
        status: 'claimed',
        priority: 1,
        claimedBy: PARENT_ID,
        claimedByName: 'ParentAgent',
        createdAt: new Date().toISOString(),
      } as any,
    ];
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

describe('Board Routes - Slots', () => {
  it('GET /api/holomesh/team/:id/slots returns member-gated slot capacity', async () => {
    const res = await callBoard('GET', '/api/holomesh/team/team_test_mobile/slots');

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.teamId).toBe('team_test_mobile');
    expect(res._body.maxSlots).toBe(10);
    expect(res._body.memberCount).toBe(1);
    expect(res._body.openSlots).toBe(9);
    expect(res._body.slots).toHaveLength(10);
    expect(res._body.slots[0]).toMatchObject({
      index: 0,
      role: 'flex',
      occupied: true,
      agentId: PARENT_ID,
      agentName: 'ParentAgent',
      memberRole: 'member',
    });
    expect(res._body.slots[1]).toMatchObject({
      index: 1,
      role: 'flex',
      occupied: false,
      agentId: null,
      agentName: null,
    });
  });

  it('GET /api/holomesh/team/:id/slots rejects non-members', async () => {
    const res = await callBoard(
      'GET',
      '/api/holomesh/team/team_test_mobile/slots',
      {},
      NON_MEMBER_KEY
    );

    expect(res._status).toBe(403);
    expect(res._body.error).toContain('Not a member');
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
      captured_at: freshCapturedAt(),
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
      captured_at: freshCapturedAt(),
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

  it('does not degrade managed orphan rows when canonical orphaned capacity is zero', async () => {
    const managedSnapshot = {
      captured_at: freshCapturedAt(),
      summary: {
        running_count: 0,
        declared_count: 0,
        orphan_count: 3,
        orphaned_capacity_count: 0,
        endpoint_managed_count: 1,
        autoscaler_managed_count: 1,
        fleet_job_managed_count: 1,
        no_instance_count: 0,
      },
      matched: [],
      orphans: [
        { instance_id: 201, capacity_class: 'endpoint_managed' },
        { instance_id: 202, capacity_class: 'autoscaler_managed' },
        { instance_id: 203, capacity_class: 'fleet_job_managed' },
      ],
    };

    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot: managedSnapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.health.status).toBe('ok');
    expect(res._body.health.reasons).not.toContain('orphan_count=3');
  });

  it('reports canonical orphaned capacity instead of the larger raw orphan inventory', async () => {
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      {
        source: 'fleet-status-live.mjs',
        snapshot: {
          captured_at: freshCapturedAt(),
          summary: {
            orphan_count: 4,
            orphaned_capacity_count: 1,
            no_instance_count: 0,
          },
          matched: [],
          orphans: [],
        },
      },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.health.status).toBe('degraded');
    expect(res._body.health.reasons).toContain('orphaned_capacity_count=1');
    expect(res._body.health.reasons).not.toContain('orphan_count=4');
  });

  it('flags a negative canonical orphan count and falls back to legacy health', async () => {
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      {
        source: 'fleet-status-live.mjs',
        snapshot: {
          captured_at: freshCapturedAt(),
          summary: {
            orphan_count: 2,
            orphaned_capacity_count: -1,
            no_instance_count: 0,
          },
          matched: [],
          orphans: [],
        },
      },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.health.status).toBe('degraded');
    expect(res._body.health.reasons).toContain('invalid_orphaned_capacity_count');
    expect(res._body.health.reasons).toContain('orphan_count=2');
  });

  it('accepts a complete canonical Vast v2 resource flow', async () => {
    const snapshot = validV2FleetSnapshot();
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.health.status).toBe('ok');
    expect(res._body.snapshot.resource_flow.provider).toBe('vast.ai');
    expect(res._body.snapshot.resource_flow.spend_accounting).toMatchObject({
      schema_version: 'holomesh.vast-spend-accounting/v1',
      vendor_total_usd: 0.076,
      trusted_headroom_usd: 99.924,
      trusted_admission_verdict: 'under-cap',
    });
    expect(res._body.snapshot.resource_flow.produced.verified_receipt_count).toBe(0);
    expect(res._body.snapshot.resource_flow.produced.verified_current_binding_count).toBe(0);
    expect(res._body.snapshot.resource_flow.produced.product_verification_policy).toContain(
      'artifact_and_receipt_sha256_match'
    );
    expect(res._body.snapshot.resource_flow.stored.verified_receipt_location_count).toBe(0);
    expect(res._body.health.ageMs).toBeGreaterThanOrEqual(0);
    expect(res._body.health.ageMs).toBeLessThan(5_000);
  });

  it.each([
    [
      'omitted accounting',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow as unknown as { spend_accounting?: unknown })
          .spend_accounting = undefined;
      },
    ],
    [
      'unknown receipt identity field',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow.spend_accounting as unknown as Record<string, unknown>)
          .receipt_id = `sha256:${'a'.repeat(64)}`;
      },
    ],
    [
      'negative vendor total',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.spend_accounting.vendor_total_usd = -1;
      },
    ],
    [
      'incoherent trusted headroom',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.spend_accounting.trusted_headroom_usd = 999;
      },
    ],
    [
      'purchased-compute total below the Vast vendor total',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.spend_accounting.vendor_total_usd = 1;
        snapshot.resource_flow.spend_accounting.observed_purchased_compute_usd = 0.5;
        snapshot.resource_flow.spend_accounting.trusted_headroom_usd = 99.5;
      },
    ],
    [
      'future observation clamped to fresh age zero',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.spend_accounting.observed_at_utc = new Date(
          Date.parse(snapshot.captured_at) + 60 * 1000,
        ).toISOString();
        snapshot.resource_flow.spend_accounting.age_ms = 0;
      },
    ],
    [
      'stale accounting without its visibility gap',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        const accounting = snapshot.resource_flow.spend_accounting as unknown as Record<string, unknown>;
        accounting.observed_at_utc = new Date(
          Date.parse(snapshot.captured_at) - 16 * 60 * 1000,
        ).toISOString();
        accounting.age_ms = 16 * 60 * 1000;
        accounting.freshness_status = 'stale';
        accounting.trusted_admission_verdict = null;
        accounting.trusted_headroom_usd = null;
      },
    ],
    [
      'monetary-incomplete accounting that retains trusted admission',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.spend_accounting.monetary_complete = false;
        snapshot.resource_flow.spend_accounting.monetary_gap_reasons = [
          'strict_ledger_parse_failed',
        ];
      },
    ],
    [
      'missing sentinel that retains trusted monetary values',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        const accounting = snapshot.resource_flow.spend_accounting as unknown as Record<string, unknown>;
        accounting.status = 'missing';
        accounting.freshness_status = 'missing';
        accounting.observed_at_utc = null;
        accounting.age_ms = null;
      },
    ],
    [
      'non-object accounting',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow as unknown as { spend_accounting: unknown })
          .spend_accounting = 'invalid';
      },
    ],
  ])('rejects invalid Vast spend accounting: %s', async (_case, mutate) => {
    const snapshot = validV2FleetSnapshot();
    mutate(snapshot);
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(400);
  });

  it('keeps provider-attributed and fleet-catalog projections additive', async () => {
    const snapshot = validV2FleetSnapshot();
    const produced = snapshot.resource_flow.produced as unknown as Record<string, unknown>;
    const stored = snapshot.resource_flow.stored as unknown as Record<string, unknown>;
    const consumed = snapshot.resource_flow.consumed as unknown as Record<string, unknown>;
    for (const field of [
      'provider_attributed_contract_count',
      'provider_unattributed_contract_count',
      'catalog_active_manifest_count',
      'catalog_output_contract_count',
      'catalog_verified_product_count',
      'catalog_verified_artifact_count',
      'catalog_verified_receipt_count',
      'catalog_declared_only_output_count',
      'catalog_unverified_evidence_output_count',
      'provider_attributed',
      'fleet_catalog',
    ]) {
      delete produced[field];
    }
    for (const field of [
      'catalog_verified_artifact_location_count',
      'catalog_verified_receipt_location_count',
      'catalog_evidence_backed_output_location_count',
      'catalog_artifact_locations',
      'catalog_receipt_locations',
      'fleet_catalog',
    ]) {
      delete stored[field];
    }
    for (const field of [
      'catalog_declared_or_historical_manifest_consumer_count',
      'catalog_bound_manifest_consumer_count',
      'catalog_unbound_manifest_consumer_count',
      'catalog_declared_or_historical_manifest_consumers',
    ]) {
      delete consumed[field];
    }

    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
  });

  it('accepts unknown optional nested resource and volume costs', async () => {
    const snapshot = validV2FleetSnapshot();
    snapshot.resource_flow.utilized.resources = [
      {
        instance_id: 44496858,
        market_cheapest_dph_usd: null,
        listed_compute_dph_usd: null,
        listed_total_dph_usd: null,
      },
    ];
    snapshot.resource_flow.stored.volumes = [
      {
        instance_id: 44496858,
        storage_dph_usd: null,
        projected_storage_24h_usd: null,
      },
    ];

    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(
      res._body.snapshot.resource_flow.utilized.resources[0].market_cheapest_dph_usd
    ).toBeNull();
    expect(res._body.snapshot.resource_flow.stored.volumes[0].storage_dph_usd).toBeNull();
  });

  it('rejects a v2 flow that omits the canonical verified-receipt evidence fields', async () => {
    const snapshot = validV2FleetSnapshot();
    (
      snapshot.resource_flow.produced as unknown as { verified_receipt_count?: unknown }
    ).verified_receipt_count = undefined;

    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(400);
  });

  it('preserves an explicit v1 snapshot without a resource flow', async () => {
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      {
        source: 'fleet-status-live.mjs',
        snapshot: {
          schema_version: 'holomesh.fleet-snapshot/v1',
          captured_at: freshCapturedAt(),
          summary: { orphan_count: 0, no_instance_count: 0 },
        },
      },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.health.status).toBe('ok');
    expect(res._body.snapshot.resource_flow).toBeUndefined();
  });

  it.each([
    [
      'summary',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot as unknown as { summary?: unknown }).summary = undefined;
      },
    ],
    [
      'resource_flow',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot as unknown as { resource_flow?: unknown }).resource_flow = undefined;
      },
    ],
  ])('rejects v2 snapshots missing required %s', async (_field, mutate) => {
    const snapshot = validV2FleetSnapshot();
    mutate(snapshot);
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(400);
  });

  it.each([
    [
      'wrong provider',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.provider = 'not-vast';
      },
    ],
    [
      'missing utilized object',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow as unknown as { utilized: unknown }).utilized = null;
      },
    ],
    [
      'missing produced object',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow as unknown as { produced: unknown }).produced = null;
      },
    ],
    [
      'missing stored object',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow as unknown as { stored: unknown }).stored = null;
      },
    ],
    [
      'missing consumed object',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow as unknown as { consumed: unknown }).consumed = null;
      },
    ],
    [
      'missing visibility object',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.resource_flow as unknown as { visibility: unknown }).visibility = null;
      },
    ],
  ])('fails closed for an invalid Vast flow: %s', async (_case, mutate) => {
    const snapshot = validV2FleetSnapshot();
    mutate(snapshot);
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(400);
  });

  it.each([
    [
      'negative utilized count',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.utilized.instance_count = -1;
      },
    ],
    [
      'fractional produced count',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.verified_product_count = 0.5;
      },
    ],
    [
      'negative stored capacity',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.total_capacity_gb = -1;
      },
    ],
    [
      'negative consumed request count',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.consumed.runtime_requests = -1;
      },
    ],
    [
      'negative effective cost',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.utilized.effective_dph_usd = -0.01;
      },
    ],
    [
      'unknown required aggregate cost',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (
          snapshot.resource_flow.utilized as unknown as { effective_dph_usd: unknown }
        ).effective_dph_usd = null;
      },
    ],
    [
      'negative storage cost',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.projected_storage_24h_usd = -0.01;
      },
    ],
    [
      'negative nested resource cost',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.utilized.resources[0].listed_total_dph_usd = -0.01;
      },
    ],
    [
      'negative nested volume cost',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.volumes[0].storage_dph_usd = -0.01;
      },
    ],
    [
      'negative nested manifest count',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.active_manifests[0].bound_instance_count = -1;
      },
    ],
    [
      'negative summary count',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.summary.orphaned_capacity_count = -1;
      },
    ],
    [
      'missing canonical summary cost',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        (snapshot.summary as unknown as { total_dph_usd?: unknown }).total_dph_usd = undefined;
      },
    ],
  ])('rejects invalid canonical v2 telemetry: %s', async (_case, mutate) => {
    const snapshot = validV2FleetSnapshot();
    mutate(snapshot);
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(400);
  });

  it.each([
    [
      'instance count does not match resources',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.utilized.instance_count = 2;
      },
    ],
    [
      'capacity-binding count does not match bindings',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.utilized.capacity_binding_count = 0;
      },
    ],
    [
      'active and retained capacity overlap beyond the instance inventory',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.utilized.active_compute_count = 1;
      },
    ],
    [
      'bound and unbound instances do not partition the inventory',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.utilized.manifest_bound_instance_count = 0;
      },
    ],
    [
      'active-manifest count does not match manifests',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.active_manifest_count = 0;
      },
    ],
    [
      'output-contract count does not match contracts',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.output_contract_count = 2;
      },
    ],
    [
      'bound and unbound manifests do not partition active manifests',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.bound_manifest_count = 0;
      },
    ],
    [
      'verified-product count lacks an evidence-backed contract',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.verified_product_count = 1;
        snapshot.resource_flow.produced.evidence_backed_output_count = 1;
        snapshot.resource_flow.produced.declared_only_output_count = 0;
        snapshot.resource_flow.produced.claimed_or_unverified_output_count = 0;
      },
    ],
    [
      'artifact count does not match artifacts',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.verified_artifact_count = 1;
      },
    ],
    [
      'receipt count does not match receipts',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.verified_receipt_count = 1;
      },
    ],
    [
      'volume count does not match volumes',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.instance_volume_count = 0;
      },
    ],
    [
      'artifact-location count does not match locations',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.verified_artifact_location_count = 1;
        snapshot.resource_flow.stored.locally_present_output_location_count = 1;
      },
    ],
    [
      'evidence locations do not partition into artifacts and receipts',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.evidence_backed_output_location_count = 1;
      },
    ],
    [
      'consumer count does not match consumers',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.consumed.consumer_count = 0;
        snapshot.resource_flow.consumed.current_physical_consumer_count = 0;
        snapshot.resource_flow.consumed.manifest_attributed_count = 0;
      },
    ],
    [
      'current-physical count does not match consumers',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.consumed.current_physical_consumer_count = 0;
      },
    ],
    [
      'manifest-consumer count does not match consumers',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.consumed.declared_or_historical_manifest_consumer_count = 0;
        snapshot.resource_flow.consumed.bound_manifest_consumer_count = 0;
      },
    ],
    [
      'bound and unbound consumers do not partition manifest consumers',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.consumed.bound_manifest_consumer_count = 0;
      },
    ],
  ])('rejects incoherent canonical Vast telemetry: %s', async (_case, mutate) => {
    const snapshot = validV2FleetSnapshot();
    mutate(snapshot);
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(400);
  });

  it.each([
    [
      'provider-attributed contract count disagrees with its array',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.provider_attributed.output_contract_count = 0;
      },
    ],
    [
      'provider compatibility count disagrees with provider attribution',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.provider_attributed_contract_count = 0;
      },
    ],
    [
      'fleet-catalog manifest count disagrees with its array',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.fleet_catalog.active_manifest_count = 0;
      },
    ],
    [
      'catalog compatibility count disagrees with the fleet catalog',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.catalog_output_contract_count = 2;
      },
    ],
    [
      'provider and unattributed contracts do not partition the catalog',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.provider_unattributed_contract_count = 1;
        snapshot.resource_flow.produced.fleet_catalog.provider_unattributed_contract_count = 1;
      },
    ],
    [
      'catalog verified product lacks an evidence-backed contract',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.produced.catalog_verified_product_count = 1;
        snapshot.resource_flow.produced.catalog_declared_only_output_count = 0;
        snapshot.resource_flow.produced.fleet_catalog.verified_product_count = 1;
      },
    ],
    [
      'stored catalog location count disagrees with its array',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.fleet_catalog.verified_artifact_location_count = 1;
      },
    ],
    [
      'stored compatibility count disagrees with the catalog',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.stored.catalog_verified_receipt_location_count = 1;
      },
    ],
    [
      'catalog manifest-consumer count disagrees with its array',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.consumed.catalog_declared_or_historical_manifest_consumer_count = 0;
        snapshot.resource_flow.consumed.catalog_bound_manifest_consumer_count = 0;
      },
    ],
    [
      'catalog bound and unbound consumers do not partition manifest consumers',
      (snapshot: ReturnType<typeof validV2FleetSnapshot>) => {
        snapshot.resource_flow.consumed.catalog_bound_manifest_consumer_count = 0;
      },
    ],
  ])('rejects incoherent additive resource-flow telemetry: %s', async (_case, mutate) => {
    const snapshot = validV2FleetSnapshot();
    mutate(snapshot);
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      { source: 'fleet-status-live.mjs', snapshot },
      PARENT_KEY
    );

    expect(res._status).toBe(400);
  });

  it.each([
    ['gap count mismatch', false, 2, ['missing_receipt']],
    ['complete with a gap', true, 1, ['missing_receipt']],
    ['incomplete without gaps', false, 0, []],
    ['duplicate gaps', false, 2, ['missing_receipt', 'missing_receipt']],
    ['empty gap', false, 1, ['']],
    ['whitespace gap', false, 1, [' missing_receipt']],
    ['oversized gap', false, 1, ['x'.repeat(161)]],
  ])(
    'rejects inconsistent resource-flow visibility: %s',
    async (_case, complete, gapCount, gaps) => {
      const snapshot = validV2FleetSnapshot();
      snapshot.resource_flow.visibility.complete = complete;
      snapshot.resource_flow.visibility.gap_count = gapCount;
      snapshot.resource_flow.visibility.gaps = gaps;
      const res = await callBoard(
        'POST',
        '/api/holomesh/team/team_test_mobile/fleet',
        { source: 'fleet-status-live.mjs', snapshot },
        PARENT_KEY
      );

      expect(res._status).toBe(400);
    }
  );

  it('rejects invalid, future-skewed, and mismatched capture timestamps', async () => {
    const invalid = validV2FleetSnapshot();
    invalid.captured_at = 'not-a-time';

    const impossible = validV2FleetSnapshot();
    impossible.captured_at = '2026-02-30T00:00:00.000Z';

    const future = validV2FleetSnapshot(freshCapturedAt(5 * 60 * 1000));

    const mismatched = validV2FleetSnapshot();
    mismatched.resource_flow.captured_at = freshCapturedAt(10_000);

    for (const snapshot of [invalid, impossible, future, mismatched]) {
      const res = await callBoard(
        'POST',
        '/api/holomesh/team/team_test_mobile/fleet',
        { source: 'fleet-status-live.mjs', snapshot },
        PARENT_KEY
      );
      expect(res._status).toBe(400);
    }
  });

  it('marks a freshly published stale capture as stale using capture age', async () => {
    const priorThreshold = process.env.HOLOMESH_FLEET_STALE_THRESHOLD_MS;
    process.env.HOLOMESH_FLEET_STALE_THRESHOLD_MS = '1000';
    try {
      const snapshot = validV2FleetSnapshot(freshCapturedAt(-5_000));
      const post = await callBoard(
        'POST',
        '/api/holomesh/team/team_test_mobile/fleet',
        { source: 'fleet-status-live.mjs', snapshot },
        PARENT_KEY
      );

      expect(post._status).toBe(200);
      expect(post._body.health.status).toBe('stale');
      expect(post._body.health.ageMs).toBeGreaterThanOrEqual(5_000);
      expect(post._body.health.reasons).toContain('snapshot_capture_age_ms>1000');
      expect(Date.parse(post._body.publishedAt)).toBeGreaterThan(Date.parse(snapshot.captured_at));

      const get = await callBoard(
        'GET',
        '/api/holomesh/team/team_test_mobile/fleet',
        undefined,
        PARENT_KEY
      );
      expect(get._body.health.status).toBe('stale');
      expect(get._body.health.ageMs).toBeGreaterThanOrEqual(post._body.health.ageMs);
    } finally {
      if (priorThreshold === undefined) delete process.env.HOLOMESH_FLEET_STALE_THRESHOLD_MS;
      else process.env.HOLOMESH_FLEET_STALE_THRESHOLD_MS = priorThreshold;
    }
  });

  it('degrades operational health when resource-flow visibility is incomplete', async () => {
    const snapshot = validV2FleetSnapshot();
    snapshot.resource_flow.visibility = {
      ...snapshot.resource_flow.visibility,
      complete: false,
      gap_count: 3,
      gaps: ['missing_receipt', 'unbound_manifest', 'stale_metrics'],
    };
    const res = await callBoard(
      'POST',
      '/api/holomesh/team/team_test_mobile/fleet',
      {
        source: 'fleet-status-live.mjs',
        snapshot,
      },
      PARENT_KEY
    );

    expect(res._status).toBe(200);
    expect(res._body.health.status).toBe('degraded');
    expect(res._body.health.reasons).toContain('resource_flow_visibility_gap_count=3');
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

describe('Board Routes — Founder Approval (N3 signed-write path)', () => {
  const TEAM = 'team_test_mobile';
  const APPROVAL_URL = `/api/holomesh/team/${TEAM}/founder-approval`;

  function seedTask(id: string, title: string): void {
    const team = teamStore.get(TEAM)!;
    team.taskBoard = [
      ...(team.taskBoard || []),
      {
        id,
        title,
        description: title,
        status: 'open',
        priority: 1,
        createdAt: new Date().toISOString(),
      } as any,
    ];
    persistTeamStore();
  }

  it('records a reversible approval and round-trips it Bearer-authed', async () => {
    seedTask('task_rev_1', 'Add a unit test for the holoscript parser');

    const post = await callBoard('POST', APPROVAL_URL, { taskId: 'task_rev_1' }, PARENT_KEY);
    expect(post._status).toBe(201);
    expect(post._body.success).toBe(true);
    expect(post._body.approval.status).toBe('approved');
    expect(post._body.approval.actionType).toBe('code');
    expect(post._body.approval.taskId).toBe('task_rev_1');
    expect(post._body.approval.approvedByAgentId).toBe(PARENT_ID);

    // Round-trip: the consume-loop poll sees it. (No query string here — the
    // shared callBoard helper passes the raw path as `pathname`, and the route
    // regex is anchored; production strips the query via new URL().pathname
    // before dispatch, so the ?status= filter is exercised live, not in-harness.)
    const get = await callBoard('GET', APPROVAL_URL, undefined, PARENT_KEY);
    expect(get._status).toBe(200);
    expect(get._body.count).toBe(1);
    expect(get._body.approvals[0].id).toBe(post._body.approval.id);
    expect(get._body.approvals[0].status).toBe('approved');

    // Persisted on the team object (rides taskBoard's persistence path).
    expect(teamStore.get(TEAM)?.founderApprovals?.[0].id).toBe(post._body.approval.id);
  });

  it('403s an irreversible (deploy) intent — stays on explicit review', async () => {
    seedTask('task_irrev_1', 'Deploy studio to production and merge to main');

    const post = await callBoard('POST', APPROVAL_URL, { taskId: 'task_irrev_1' }, PARENT_KEY);
    expect(post._status).toBe(403);
    expect(post._body.requiresExplicitReview).toBe(true);
    expect(post._body.error).toMatch(/not one-tap/i);

    // Nothing recorded.
    expect(teamStore.get(TEAM)?.founderApprovals ?? []).toHaveLength(0);
  });

  it('403s a service_rental intent (spend gate, D.044)', async () => {
    seedTask('task_rent_1', 'Provision a GPU fleet on vast.ai for the benchmark');

    const post = await callBoard('POST', APPROVAL_URL, { taskId: 'task_rent_1' }, PARENT_KEY);
    expect(post._status).toBe(403);
    expect(post._body.actionType).toBe('service_rental');
    expect(post._body.requiresExplicitReview).toBe(true);
  });

  it('rejects a missing taskId with 400', async () => {
    const post = await callBoard('POST', APPROVAL_URL, {}, PARENT_KEY);
    expect(post._status).toBe(400);
  });

  it('lets a signing agent PATCH the lifecycle approved → executing → executed', async () => {
    seedTask('task_rev_2', 'Refactor the trait composition helper');
    const post = await callBoard('POST', APPROVAL_URL, { taskId: 'task_rev_2' }, PARENT_KEY);
    expect(post._status).toBe(201);
    const approvalId = post._body.approval.id;

    const exec = await callBoard(
      'PATCH',
      `${APPROVAL_URL}/${approvalId}`,
      { status: 'executing' },
      PARENT_KEY
    );
    expect(exec._status).toBe(200);
    expect(exec._body.approval.status).toBe('executing');
    expect(exec._body.approval.claimedByAgentId).toBe(PARENT_ID);

    const done = await callBoard(
      'PATCH',
      `${APPROVAL_URL}/${approvalId}`,
      { status: 'executed', resultRef: 'feed_abc123' },
      PARENT_KEY
    );
    expect(done._status).toBe(200);
    expect(done._body.approval.status).toBe('executed');
    expect(done._body.approval.resultRef).toBe('feed_abc123');
    expect(done._body.approval.executedAt).toBeTruthy();
  });

  it('PATCH 404s an unknown approval id', async () => {
    const res = await callBoard(
      'PATCH',
      `${APPROVAL_URL}/approval_nope`,
      { status: 'executed' },
      PARENT_KEY
    );
    expect(res._status).toBe(404);
  });
});
