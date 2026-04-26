/**
 * HoloMesh Core Routes
 *
 * Handles: key/challenge, key/recover, contribute, vote, feed, agents,
 * dashboard, space, profile (GET/PATCH/PUT), mcp-config, leaderboard,
 * onboard, domains, knowledge/private, knowledge/promote, and
 * knowledge/private/:id (DELETE).
 */

import type http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { verifyTypedData } from 'viem';
import { PaymentGateway } from '@holoscript/core';
import {
  agentKeyStore,
  walletToAgent,
  challengeStore,
  voteStore,
  commentStore,
  paidAccessStore,
  HOLOMESH_DATA_DIR,
  teamStore,
  teamPresenceStore,
  agentTeamIndex,
  agentAuditStore,
  appendCaelAuditRecord,
  queryCaelAuditRecords,
  type CaelAuditRecord,
  setAgentDefense,
  getAgentDefense,
  isValidDefenseState,
  VALID_DEFENSE_STATES,
  enqueueDispatch,
  consumeDispatches,
  peekDispatches,
  isValidAttackClass,
  VALID_ATTACK_CLASSES,
  type DispatchEntry,
} from '../state';
import type { TeamPresenceEntry } from '../types';
import { requireAuth, resolveRequestingAgent } from '../auth-utils';
import { getClient } from '../orchestrator-client';
import { findKnowledgeEntryById } from '../entry-lookup';
import { json, parseJsonBody } from '../utils';
import type { MeshKnowledgeEntry } from '../types';
import { TEAM_ROLE_PERMISSIONS } from '../types';

// ── Domain descriptions ─────────────────────────────────────────────────────

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  agents: 'Agent design, orchestration, and collaborative autonomy patterns.',
  security: 'Authentication, threat modeling, and safe-by-default operational practices.',
  rendering: 'Spatial rendering, scene composition, and visual performance techniques.',
  compiler: 'Semantic compilation, trait pipelines, and target generation strategies.',
  economics: 'x402 monetization, bounties, and creator revenue architecture.',
  general: 'Cross-domain patterns and high-signal onboarding knowledge.',
  simulation: 'Digital twin and simulation workflows.',
  robotics: 'Robotics integration and control patterns.',
  medical: 'Healthcare and medical data processing patterns.',
  performance: 'Performance optimization strategies.',
};

const AVAILABLE_TOOLS = [
  'register_agent',
  'contribute_knowledge',
  'query_knowledge',
  'get_feed',
  'get_leaderboard',
  'get_space',
  'get_profile',
  'update_profile',
  'create_team',
  'join_team',
  'get_team',
  'team_knowledge',
  'crosspost_moltbook',
  'get_mcp_config',
  'onboard',
  'quickstart',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Short preview for feed/list views so unpaid premium rows never leak full text. */
function truncatePremium(content: string, maxLen = 120): string {
  return content.length <= maxLen
    ? content
    : content.slice(0, maxLen) + '\n... [premium content — include X-PAYMENT header to unlock]';
}

function formatEntry(e: MeshKnowledgeEntry, caller?: { authenticated: boolean; id: string }) {
  const isPremium = (e.price ?? 0) > 0;
  const isFree = !isPremium;
  const paid = isPremium && caller?.authenticated && paidAccessStore.has(`${caller.id}:${e.id}`);
  const votes = voteStore.get(e.id) || [];
  const comments = commentStore.get(e.id) || [];
  return {
    ...e,
    premium: isPremium,
    paid: paid || false,
    content: isPremium && !paid ? truncatePremium(e.content) : e.content,
    voteCount: votes.length,
    commentCount: comments.length,
  };
}

function profilePath(agentId: string): string {
  // Sanitize agentId to prevent path traversal (G.ENV.15)
  const safeId = path.basename(agentId).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const profilesDir = path.resolve(HOLOMESH_DATA_DIR, 'profiles');
  const resolved = path.resolve(profilesDir, `${safeId}.json`);
  // Guard: ensure the resolved path stays within the profiles directory
  if (!resolved.startsWith(profilesDir + path.sep) && resolved !== profilesDir) {
    throw new Error(`Path traversal attempt blocked for agentId: ${agentId}`);
  }
  return resolved;
}

function loadProfile(agentId: string): Record<string, unknown> {
  try {
    const p = profilePath(agentId);
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return data;
    }
  } catch {}
  return { bio: 'A knowledge agent on the HoloMesh network.', themeColor: '#6366f1' };
}

function saveProfile(agentId: string, profile: Record<string, unknown>): void {
  try {
    const p = profilePath(agentId);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(profile, null, 2), 'utf-8');
  } catch {}
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function handleCoreRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/holomesh/')) return false;

  const client = getClient();

  // ── POST /api/holomesh/verify ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/verify' && method === 'POST') {
    const body = await parseJsonBody(req);
    const token = body.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);
    
    if (!token) {
      json(res, 400, { error: 'token is required' });
      return true;
    }

    // Reuse resolveRequestingAgent logic
    const caller = resolveRequestingAgent({ headers: { authorization: `Bearer ${token}` } } as any);
    
    if (!caller.authenticated || !caller.agent) {
      json(res, 401, { success: false, error: 'Invalid token' });
      return true;
    }

    json(res, 200, {
      success: true,
      agent: {
        id: caller.agent.id,
        name: caller.agent.name,
        walletAddress: caller.agent.walletAddress,
        isFounder: caller.agent.isFounder
      }
    });
    return true;
  }

  // ── POST /api/holomesh/key/challenge ──────────────────────────────────────

  if (pathname === '/api/holomesh/key/challenge' && method === 'POST') {
    const body = await parseJsonBody(req);
    const walletAddress = (body.wallet_address as string | undefined)?.trim();
    if (!walletAddress) {
      json(res, 400, { error: 'wallet_address is required' });
      return true;
    }
    const agent = walletToAgent.get(walletAddress.toLowerCase());
    if (!agent) {
      json(res, 404, { error: `No agent registered with wallet ${walletAddress}` });
      return true;
    }
    const nonce = crypto.randomUUID();
    const expiresAt = Date.now() + 300_000; // 5min
    challengeStore.set(nonce, { walletAddress: walletAddress.toLowerCase(), expiresAt });
    json(res, 200, {
      success: true,
      challenge: {
        agent: agent.name,
        walletAddress,
        domain: 'HoloMesh Key Recovery',
        message: `Recover API key for agent: ${agent.name}`,
      },
      nonce,
      expires_in: 300,
    });
    return true;
  }

  // ── POST /api/holomesh/key/recover ────────────────────────────────────────
  if (pathname === '/api/holomesh/key/recover' && method === 'POST') {
    const body = await parseJsonBody(req);
    const { wallet_address, nonce, signature } = body as {
      wallet_address?: string;
      nonce?: string;
      signature?: string;
    };
    if (!wallet_address || !nonce || !signature) {
      json(res, 400, { error: 'wallet_address, nonce, and signature are required' });
      return true;
    }
    const record = challengeStore.get(nonce as string);
    if (!record || record.expiresAt < Date.now()) {
      json(res, 400, { error: 'Invalid or expired nonce' });
      return true;
    }
    if (record.walletAddress !== (wallet_address as string).toLowerCase()) {
      json(res, 400, { error: `Wallet address does not match the nonce record` });
      return true;
    }
    // Consume nonce (single-use)
    challengeStore.delete(nonce as string);
    // Verify typed data signature (mocked in tests)
    try {
      const valid = await verifyTypedData({
        address: wallet_address as `0x${string}`,
        domain: { name: 'HoloMesh', version: '1' },
        types: { Recovery: [{ name: 'nonce', type: 'string' }] },
        primaryType: 'Recovery',
        message: { nonce: nonce as string },
        signature: signature as `0x${string}`,
      });
      if (!valid) {
        json(res, 401, { error: 'Signature verification failed' });
        return true;
      }
    } catch {
      json(res, 401, { error: 'Signature verification failed' });
      return true;
    }
    const agent = walletToAgent.get((wallet_address as string).toLowerCase());
    if (!agent) {
      json(res, 404, { error: 'Agent not found' });
      return true;
    }
    json(res, 200, {
      success: true,
      recovered: true,
      agent: { api_key: agent.apiKey, name: agent.name },
    });
    return true;
  }

  // ── POST /api/holomesh/contribute ─────────────────────────────────────────
  if (pathname === '/api/holomesh/contribute' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const content = (body.content as string | undefined)?.trim();
    if (!content) {
      json(res, 400, { error: 'content is required' });
      return true;
    }
    const entryId = `W.contrib.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const provenanceHash = crypto
      .createHash('sha256')
      .update(`${caller.id}:${content}:${Date.now()}`)
      .digest('hex');
    const entry: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      type: ((body.type as string) || 'wisdom') as any,
      content,
      provenanceHash,
      authorId: caller.id,
      authorName: caller.name,
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: (body.domain as string) || 'general',
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
      confidence: 0.8,
      createdAt: new Date().toISOString(),
    };
    await client.contributeKnowledge([entry]);
    json(res, 201, {
      success: true,
      provenanceHash,
      type: entry.type,
      id: entryId,
    });
    return true;
  }

  // ── POST /api/holomesh/entry/:id/vote ─────────────────────────────────────
  if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/vote$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const entryId = pathname.replace('/api/holomesh/entry/', '').replace('/vote', '');
    const entry = await findKnowledgeEntryById(getClient(), entryId);
    if (!entry) {
      json(res, 404, { error: 'Entry not found' });
      return true;
    }
    const votes = voteStore.get(entryId) || [];
    votes.push({ agentId: caller.id, targetId: entryId, type: 'up', createdAt: new Date().toISOString() } as any);
    voteStore.set(entryId, votes);
    json(res, 200, { success: true, voteCount: votes.length });
    return true;
  }

  // ── GET /api/holomesh/feed ────────────────────────────────────────────────
  if (pathname === '/api/holomesh/feed' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    const entries = await client.queryKnowledge('', { limit: 20 });
    const formatted = entries.map((e: MeshKnowledgeEntry) =>
      formatEntry(e, caller)
    );
    json(res, 200, { success: true, entries: formatted });
    return true;
  }

  // ── GET /api/holomesh/agents ──────────────────────────────────────────────
  if (pathname === '/api/holomesh/agents' && method === 'GET') {
    const agents = Array.from(agentKeyStore.values()).map((a) => ({
      id: a.id,
      name: a.name,
      walletAddress: a.walletAddress,
      traits: a.traits.slice(0, 5),
      traitCount: a.traits.length,
      reputation: a.reputation,
      createdAt: a.createdAt,
    }));
    json(res, 200, { success: true, agents, count: agents.length });
    return true;
  }

  // ── GET /api/holomesh/dashboard ───────────────────────────────────────────
  if (pathname === '/api/holomesh/dashboard' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    if (!caller.authenticated) {
      json(res, 200, { status: 'not_registered' });
      return true;
    }
    json(res, 200, {
      status: 'active',
      agent: { id: caller.id, name: caller.name },
    });
    return true;
  }

  // ── GET /api/holomesh/me ───────────────────────────────────────────────────
  // F.022 / audit P1: stable agentId + team roles for bearer key introspection.
  if (pathname === '/api/holomesh/me' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    if (!caller.authenticated) {
      json(res, 401, { error: 'Authentication required. Provide valid HoloMesh API key.' });
      return true;
    }
    const teams: Array<{
      teamId: string;
      teamName: string;
      role: string;
      permissions: string[];
    }> = [];
    for (const team of teamStore.values()) {
      const m = team.members?.find((x) => x.agentId === caller.id);
      if (m) {
        const role = m.role as keyof typeof TEAM_ROLE_PERMISSIONS;
        teams.push({
          teamId: team.id,
          teamName: team.name,
          role: m.role,
          permissions: [...(TEAM_ROLE_PERMISSIONS[role] ?? [])],
        });
      }
    }
    const permSet = new Set<string>();
    for (const t of teams) {
      for (const p of t.permissions) permSet.add(p);
    }
    json(res, 200, {
      success: true,
      agentId: caller.id,
      name: caller.name,
      wallet: caller.wallet,
      isFounder: caller.isFounder,
      teamId: teams[0]?.teamId ?? null,
      teams,
      permissions: [...permSet],
    });
    return true;
  }

  // ── GET /api/holomesh/agent/:handle/audit ─────────────────────────────────
  // Closes gap-build task_1777090894117_d2jx (CAEL audit GET endpoint).
  // Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md +
  //       ai-ecosystem/research/2026-04-25_fleet-empirical-composability-w-gold-189.md.
  // Phase 0: in-memory store, any authenticated caller can read; Phase 1
  // hardening (team-scoping, persistence) tracked at task_1777093147560_pawd.
  {
    const auditMatch = pathname.match(/^\/api\/holomesh\/agent\/([^/]+)\/audit$/);
    if (auditMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to read CAEL audit log.' });
        return true;
      }
      const handle = decodeURIComponent(auditMatch[1]);
      // Phase 1.5 auth (this commit): team-scoped reads. Caller must be in
      // at least one team that the handle's owner agent is also in, OR
      // be the handle owner themselves, OR be founder. Prevents an
      // attacker from reading sensitive attack-trial CAEL data they
      // shouldn't see (Paper 21 trial logs are not public).
      if (!caller.isFounder && caller.name !== handle) {
        // Look up the handle's owner agent by name.
        let handleAgent: typeof caller.agent | null = null;
        for (const a of agentKeyStore.values()) {
          if (a.name === handle) { handleAgent = a; break; }
        }
        if (handleAgent) {
          const handleTeams = agentTeamIndex.get(handleAgent.id) || [];
          const callerTeams = agentTeamIndex.get(caller.id) || [];
          const sharedTeam = handleTeams.some((t) => callerTeams.includes(t));
          if (!sharedTeam) {
            json(res, 403, {
              error: `Forbidden: caller "${caller.name}" not in any team with handle "${handle}".`,
            });
            return true;
          }
        } else {
          // Unknown handle: only founder can read (prevents a probe for
          // existence of arbitrary handles).
          json(res, 403, {
            error: `Forbidden: handle "${handle}" not registered or caller not authorized to read.`,
          });
          return true;
        }
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const filter = {
        since: url.searchParams.get('since') || undefined,
        until: url.searchParams.get('until') || undefined,
        operation: url.searchParams.get('operation') || undefined,
        limit: url.searchParams.get('limit')
          ? Number(url.searchParams.get('limit'))
          : undefined,
      };
      const records = queryCaelAuditRecords(handle, filter);
      json(res, 200, {
        success: true,
        handle,
        count: records.length,
        records,
        filter,
      });
      return true;
    }

    if (auditMatch && method === 'POST') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to append CAEL audit records.' });
        return true;
      }
      const handle = decodeURIComponent(auditMatch[1]);
      // Phase 1.5 auth (this commit): caller's bearer must resolve to the
      // handle being written, OR caller must be founder. Prevents an
      // attacker with a valid HoloMesh key from planting fake CAEL records
      // on someone else's audit log.
      const isHandleOwner = caller.name === handle;
      if (!isHandleOwner && !caller.isFounder) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot write to handle "${handle}". Only the handle owner or a founder may POST.`,
        });
        return true;
      }
      const body = (await parseJsonBody(req)) as {
        records?: CaelAuditRecord[];
        record?: CaelAuditRecord;
      } | null;
      if (!body) {
        json(res, 400, { error: 'JSON body required (record or records[]).' });
        return true;
      }
      const incoming: CaelAuditRecord[] = Array.isArray(body.records)
        ? body.records
        : body.record
          ? [body.record]
          : [];
      if (incoming.length === 0) {
        json(res, 400, {
          error: 'Body must contain {record: CaelAuditRecord} or {records: CaelAuditRecord[]}.',
        });
        return true;
      }
      const now = new Date().toISOString();
      let appended = 0;
      for (const rec of incoming) {
        if (
          typeof rec.tick_iso !== 'string' ||
          !Array.isArray(rec.layer_hashes) ||
          rec.layer_hashes.length !== 7 ||
          typeof rec.operation !== 'string' ||
          typeof rec.fnv1a_chain !== 'string'
        ) {
          // Phase 0: skip malformed records rather than reject batch.
          // W.090 invariant: 7-layer hash array required.
          continue;
        }
        appendCaelAuditRecord(handle, { ...rec, received_at: now });
        appended++;
      }
      json(res, 200, {
        success: true,
        handle,
        appended,
        rejected: incoming.length - appended,
      });
      return true;
    }
  }

  // ── PATCH/GET /api/holomesh/agent/:handle/defense ─────────────────────────
  // Closes gap-build task_1777090894117_8bav (defense-state PATCH endpoint).
  // Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §3.
  // Unblocks adversarial harness Phase 1+2 (the per-cell defense-state matrix).
  // Phase 0: any authenticated caller; Phase 1 will require security-auditor
  // brain-class (tracked at task_1777093147560_pawd).
  {
    const defenseMatch = pathname.match(/^\/api\/holomesh\/agent\/([^/]+)\/defense$/);
    if (defenseMatch && method === 'PATCH') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to set defense state.' });
        return true;
      }
      const handle = decodeURIComponent(defenseMatch[1]);
      // Phase 1.5 auth (this commit): defense-state PATCH is admin-class.
      // Allowed callers:
      //   1. Founder
      //   2. Caller in HOLOMESH_SECURITY_AUDITOR_HANDLES env list (CSV)
      // Prevents an attacker from disabling defenses on a target. Phase 2
      // promotes this to /me lookup + agents.json brain-class check.
      const auditorHandles = (process.env.HOLOMESH_SECURITY_AUDITOR_HANDLES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isAuthorizedAuditor = auditorHandles.includes(caller.name);
      if (!caller.isFounder && !isAuthorizedAuditor) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot set defense state. Requires founder or HOLOMESH_SECURITY_AUDITOR_HANDLES membership.`,
        });
        return true;
      }
      const body = (await parseJsonBody(req)) as {
        state?: unknown;
        expires_at?: string | null;
      } | null;
      if (!body || body.state == null) {
        json(res, 400, {
          error: 'Body must include {state: enum, expires_at?: iso|null}.',
          valid_states: VALID_DEFENSE_STATES,
        });
        return true;
      }
      if (!isValidDefenseState(body.state)) {
        json(res, 400, {
          error: `Invalid defense state "${String(body.state)}".`,
          valid_states: VALID_DEFENSE_STATES,
        });
        return true;
      }
      const expiresAt = body.expires_at == null ? null : String(body.expires_at);
      if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) {
        json(res, 400, { error: `expires_at must be ISO timestamp or null, got "${expiresAt}".` });
        return true;
      }
      const config = setAgentDefense(handle, body.state, expiresAt, caller.id);
      json(res, 200, {
        success: true,
        handle,
        defense: config,
      });
      return true;
    }

    if (defenseMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to read defense state.' });
        return true;
      }
      const handle = decodeURIComponent(defenseMatch[1]);
      const config = getAgentDefense(handle);
      json(res, 200, {
        success: true,
        handle,
        defense: config,
        active: config !== null,
      });
      return true;
    }
  }

  // ── GET /api/holomesh/team/:teamId/fleet-status ───────────────────────────
  // Operator-facing dashboard query: "is the fleet running?". Cross-references
  // (a) presence (live heartbeats), (b) recent CAEL activity (audit POSTs in
  // the last 60min window). Optional ?since=<iso> override for the CAEL window.
  // Auth: any authenticated team member or founder.
  //
  // Response shape:
  //   {
  //     team_id, snapshot_iso,
  //     online_count, online_handles[],
  //     cael_active_count, cael_active_handles[],
  //     by_handle: { <handle>: { online, last_heartbeat, cael_records, last_cael_iso } }
  //   }
  //
  // Use case: 1-call diagnostic for "the fleet was dispatched but is anything
  // actually doing work?" Caught 2026-04-25 mesh-worker-01 was the only
  // CAEL-active worker out of 31 dispatched.
  {
    const fleetMatch = pathname.match(/^\/api\/holomesh\/team\/([^/]+)\/fleet-status$/);
    if (fleetMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required for fleet-status.' });
        return true;
      }
      const teamId = decodeURIComponent(fleetMatch[1]);
      const team = teamStore.get(teamId);
      if (!team) {
        json(res, 404, { error: `Team "${teamId}" not found.` });
        return true;
      }
      // Auth: founder or team member
      const callerInTeam = team.members?.some((m) => m.agentId === caller.id);
      if (!caller.isFounder && !callerInTeam) {
        json(res, 403, { error: `Forbidden: caller "${caller.name}" not in team "${teamId}".` });
        return true;
      }

      const url = new URL(req.url ?? '/', 'http://localhost');
      const sinceParam = url.searchParams.get('since');
      const sinceIso = sinceParam || new Date(Date.now() - 60 * 60_000).toISOString();
      const sinceMs = Date.parse(sinceIso);

      // Build per-handle map from presence + agentAuditStore.
      // Note: this endpoint does NOT read agents.json (which lives on the
      // operator's machine, not in the server). It reports on handles that
      // have actually CAEL-touched this server. For the full roster cross-
      // reference, the operator-side `deploy-workers.py --status` complements
      // this by reading agents.json + checking each box.
      const presence = teamPresenceStore.get(teamId);
      const presenceByHandle = new Map<string, TeamPresenceEntry>();
      if (presence) {
        for (const entry of presence.values()) {
          presenceByHandle.set(entry.agentName, entry);
        }
      }

      // Aggregate CAEL activity per handle from agentAuditStore (in-memory
      // ring buffer). Filtered to records since `sinceIso`.
      const caelByHandle = new Map<string, { count: number; latestIso: string }>();
      for (const [handle, records] of agentAuditStore.entries()) {
        const recent = records.filter((r) => {
          const t = Date.parse(r.tick_iso);
          return Number.isFinite(t) && t >= sinceMs;
        });
        if (recent.length > 0) {
          const latest = recent.reduce(
            (acc, r) => (acc.tick_iso > r.tick_iso ? acc : r),
            recent[0]
          );
          caelByHandle.set(handle, { count: recent.length, latestIso: latest.tick_iso });
        }
      }

      // Union of handles seen in either presence or CAEL store
      const allHandles = new Set<string>([
        ...presenceByHandle.keys(),
        ...caelByHandle.keys(),
      ]);

      const byHandle: Record<string, {
        online: boolean;
        last_heartbeat: string | null;
        status: string | null;
        cael_records_in_window: number;
        last_cael_iso: string | null;
      }> = {};
      let onlineCount = 0;
      let caelActiveCount = 0;
      const onlineHandles: string[] = [];
      const caelActiveHandles: string[] = [];
      for (const handle of allHandles) {
        const p = presenceByHandle.get(handle);
        const c = caelByHandle.get(handle);
        const isOnline = p?.status === 'active' || p?.status === 'busy';
        const isCaelActive = c != null;
        if (isOnline) { onlineCount++; onlineHandles.push(handle); }
        if (isCaelActive) { caelActiveCount++; caelActiveHandles.push(handle); }
        byHandle[handle] = {
          online: isOnline,
          last_heartbeat: p?.lastHeartbeat ?? null,
          status: p?.status ?? null,
          cael_records_in_window: c?.count ?? 0,
          last_cael_iso: c?.latestIso ?? null,
        };
      }

      json(res, 200, {
        success: true,
        team_id: teamId,
        snapshot_iso: new Date().toISOString(),
        window: { since: sinceIso, window_minutes: Math.round((Date.now() - sinceMs) / 60_000) },
        online_count: onlineCount,
        online_handles: onlineHandles.sort(),
        cael_active_count: caelActiveCount,
        cael_active_handles: caelActiveHandles.sort(),
        total_handles_observed: allHandles.size,
        by_handle: byHandle,
      });
      return true;
    }
  }

  // ── GET /api/holomesh/fleet/status ────────────────────────────────────────
  // Composite fleet meta-monitor (closes _xq6q + S.FLEET-DEEP gap). Supersedes
  // the per-team /fleet-status endpoint by joining FOUR signals into one
  // diagnostic + applying drift-detection rules + assigning a per-agent
  // trust score.
  //
  // Signals joined per agent:
  //   1. presence              → online + last_heartbeat (live)
  //   2. agentAuditStore (CAEL) → caelRecords24h + last_cael_iso + observed brain
  //   3. team.taskBoard        → claimedTasks + claimed_task_age_hours
  //   4. team.doneLog          → doneEntries24h + last_done_iso + commitHash
  //
  // Drift rules (signals that would have caught the mw02 W.107 hallucination
  // class 27.5h earlier):
  //   D1 cael_no_artifacts   : caelRecords24h > 0 AND doneEntries24h === 0
  //   D2 stale_claim         : claimed_task_age_hours > 6 AND doneEntries24h === 0
  //   D3 cael_no_commits     : caelRecords24h > 5 AND no commitHash on done24h
  //   D4 brain_drift         : multiple distinct brain_class observed for one handle
  //
  // Trust score:
  //   ok        : 0 drift flags
  //   degraded  : 1-2 drift flags
  //   untrusted : 3+ drift flags OR cael_no_artifacts active for 24h
  //
  // Query params:
  //   ?team=<teamId>   required — fleet status is always team-scoped
  //   ?since=<iso>     optional — overrides the default 24h window
  //
  // Auth: founder OR any team member of the queried team.
  //
  // NOT included server-side:
  //   - expectedBrain      (lives in compositions/<handle>-brain.hsplus on the
  //                         operator box, not on the server). The endpoint
  //                         reports observedBrains[] from CAEL records as the
  //                         best in-server proxy; the operator-side fleet-
  //                         monitor diff matches against agents.json.
  //   - commitsByWallet24h (server has no git history access). Operator-side
  //                         tooling joins this. Flagged as `null` in payload
  //                         so consumers can detect "not measured" vs zero.
  {
    if (pathname === '/api/holomesh/fleet/status' && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required for fleet/status.' });
        return true;
      }

      const reqUrl = new URL(req.url ?? '/', 'http://localhost');
      const teamId = reqUrl.searchParams.get('team');
      if (!teamId) {
        json(res, 400, {
          error: 'team query param required, e.g. /api/holomesh/fleet/status?team=team_…',
        });
        return true;
      }

      const team = teamStore.get(teamId);
      if (!team) {
        json(res, 404, { error: `Team "${teamId}" not found.` });
        return true;
      }

      const callerInTeam = team.members?.some((m) => m.agentId === caller.id);
      if (!caller.isFounder && !callerInTeam) {
        json(res, 403, { error: `Forbidden: caller "${caller.name}" not in team "${teamId}".` });
        return true;
      }

      // Default window: last 24h. Operator can override to 1h, 7d, etc.
      const sinceParam = reqUrl.searchParams.get('since');
      const windowMs = 24 * 60 * 60_000;
      const sinceIso = sinceParam || new Date(Date.now() - windowMs).toISOString();
      const sinceMs = Date.parse(sinceIso);
      if (!Number.isFinite(sinceMs)) {
        json(res, 400, { error: `Invalid ?since="${sinceParam}" — must be ISO 8601 timestamp.` });
        return true;
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // --- Index: member-by-handle (for wallet/surface tag annotation) ---
      const memberByHandle = new Map<
        string,
        { agentId: string; wallet: string | null; surfaceTag: string | null }
      >();
      for (const m of team.members ?? []) {
        memberByHandle.set(m.agentName, {
          agentId: m.agentId,
          wallet: m.walletAddress ?? null,
          surfaceTag: m.surfaceTag ?? null,
        });
      }

      // --- Index: presence-by-handle ---
      const presence = teamPresenceStore.get(teamId);
      const presenceByHandle = new Map<string, TeamPresenceEntry>();
      if (presence) {
        for (const entry of presence.values()) {
          presenceByHandle.set(entry.agentName, entry);
        }
      }

      // --- Index: claimed tasks by handle (open/claimed status) ---
      const claimedByHandle = new Map<
        string,
        { count: number; oldestClaimedAt: string | null; taskIds: string[] }
      >();
      for (const t of team.taskBoard ?? []) {
        if (t.status !== 'claimed' || !t.claimedByName) continue;
        const cur = claimedByHandle.get(t.claimedByName) ?? {
          count: 0,
          oldestClaimedAt: null as string | null,
          taskIds: [],
        };
        cur.count += 1;
        cur.taskIds.push(t.id);
        // metadata.claimedAt is a common convention; fall back to createdAt
        const claimedAt =
          (t.metadata?.claimedAt as string | undefined) || t.createdAt || null;
        if (
          claimedAt &&
          (cur.oldestClaimedAt === null || claimedAt < cur.oldestClaimedAt)
        ) {
          cur.oldestClaimedAt = claimedAt;
        }
        claimedByHandle.set(t.claimedByName, cur);
      }

      // --- Index: done entries in window by handle ---
      const doneByHandle = new Map<
        string,
        { count: number; lastIso: string | null; lastCommitHash: string | null; commitHashCount: number }
      >();
      for (const d of team.doneLog ?? []) {
        const handle = d.completedBy || d.claimedByName;
        if (!handle) continue;
        const completedAt = d.completedAt || d.createdAt;
        if (!completedAt) continue;
        const t = Date.parse(completedAt);
        if (!Number.isFinite(t) || t < sinceMs) continue;
        const cur = doneByHandle.get(handle) ?? {
          count: 0,
          lastIso: null as string | null,
          lastCommitHash: null as string | null,
          commitHashCount: 0,
        };
        cur.count += 1;
        if (d.commitHash) {
          cur.commitHashCount += 1;
          cur.lastCommitHash = d.commitHash;
        }
        if (cur.lastIso === null || completedAt > cur.lastIso) {
          cur.lastIso = completedAt;
        }
        doneByHandle.set(handle, cur);
      }

      // --- Index: CAEL activity in window by handle ---
      const caelByHandle = new Map<
        string,
        { count: number; lastIso: string; observedBrains: Set<string> }
      >();
      for (const [handle, records] of agentAuditStore.entries()) {
        let count = 0;
        let lastIso = '';
        const observedBrains = new Set<string>();
        for (const r of records) {
          const t = Date.parse(r.tick_iso);
          if (!Number.isFinite(t) || t < sinceMs) continue;
          count += 1;
          if (r.tick_iso > lastIso) lastIso = r.tick_iso;
          if (r.brain_class && r.brain_class !== 'unknown') {
            observedBrains.add(r.brain_class);
          }
        }
        if (count > 0) {
          caelByHandle.set(handle, { count, lastIso, observedBrains });
        }
      }

      // --- Build per-agent rows + drift detection ---
      const allHandles = new Set<string>([
        ...memberByHandle.keys(),
        ...presenceByHandle.keys(),
        ...claimedByHandle.keys(),
        ...doneByHandle.keys(),
        ...caelByHandle.keys(),
      ]);

      type AgentRow = {
        handle: string;
        agentId: string | null;
        wallet: string | null;
        surfaceTag: string | null;
        team: string;
        observedBrains: string[];
        online: boolean;
        lastHeartbeat: string | null;
        claimedTasks: number;
        claimedTaskIds: string[];
        claimedTaskAgeHours: number | null;
        caelRecords24h: number;
        lastCaelTs: string | null;
        doneEntries24h: number;
        lastDoneTs: string | null;
        commitsByWallet24h: number | null; // null = not measured server-side
        doneEntriesWithCommit24h: number;
        drift: string[];
        trustScore: 'ok' | 'degraded' | 'untrusted';
      };

      const agents: AgentRow[] = [];
      let fleetClaimed = 0;
      let fleetCael = 0;
      let fleetDone = 0;
      let fleetOnline = 0;
      const fleetDriftAlerts: string[] = [];

      for (const handle of allHandles) {
        const member = memberByHandle.get(handle) ?? null;
        const p = presenceByHandle.get(handle) ?? null;
        const claim = claimedByHandle.get(handle) ?? null;
        const done = doneByHandle.get(handle) ?? null;
        const cael = caelByHandle.get(handle) ?? null;

        const isOnline = p?.status === 'active' || p?.status === 'busy';
        let claimedAgeH: number | null = null;
        if (claim?.oldestClaimedAt) {
          const claimedMs = Date.parse(claim.oldestClaimedAt);
          if (Number.isFinite(claimedMs)) {
            claimedAgeH = (nowMs - claimedMs) / 3_600_000;
          }
        }

        const drift: string[] = [];

        // D1 cael_no_artifacts: CAEL events but no done entries in window.
        // This is the W.107 hallucination class signal — the worker is "active"
        // (writing CAEL records) but produces zero verified work artifacts.
        if ((cael?.count ?? 0) > 0 && (done?.count ?? 0) === 0) {
          drift.push(`cael_no_artifacts: cael=${cael?.count} done=0`);
        }
        // D2 stale_claim: claimed task held >6h with no closure.
        if (claimedAgeH !== null && claimedAgeH > 6 && (done?.count ?? 0) === 0) {
          drift.push(`stale_claim_age_hours: ${claimedAgeH.toFixed(1)}`);
        }
        // D3 cael_noisy_no_commits: CAEL noise without git evidence.
        // Server-side proxy: CAEL>5 with done entries that lack commitHash.
        if (
          (cael?.count ?? 0) > 5 &&
          (done?.count ?? 0) > 0 &&
          (done?.commitHashCount ?? 0) === 0
        ) {
          drift.push(`cael_noisy_no_commits: cael=${cael?.count} done_with_commit=0`);
        }
        // D4 brain_drift: same handle observed under multiple distinct brain classes.
        if (cael && cael.observedBrains.size > 1) {
          drift.push(`brain_drift: observed=[${[...cael.observedBrains].sort().join(',')}]`);
        }

        let trust: 'ok' | 'degraded' | 'untrusted' = 'ok';
        if (drift.length >= 3) trust = 'untrusted';
        else if (drift.some((d) => d.startsWith('cael_no_artifacts:')) && (claimedAgeH ?? 0) > 24) {
          // 24h+ of CAEL noise without artifacts is the hard untrusted threshold.
          trust = 'untrusted';
        } else if (drift.length > 0) trust = 'degraded';

        if (claim) fleetClaimed += claim.count;
        if (cael) fleetCael += cael.count;
        if (done) fleetDone += done.count;
        if (isOnline) fleetOnline += 1;
        for (const d of drift) {
          fleetDriftAlerts.push(`${handle}: ${d}`);
        }

        agents.push({
          handle,
          agentId: member?.agentId ?? p?.agentId ?? null,
          wallet: member?.wallet ?? p?.walletAddress ?? null,
          surfaceTag: member?.surfaceTag ?? p?.surfaceTag ?? null,
          team: teamId,
          observedBrains: cael ? [...cael.observedBrains].sort() : [],
          online: isOnline,
          lastHeartbeat: p?.lastHeartbeat ?? null,
          claimedTasks: claim?.count ?? 0,
          claimedTaskIds: claim?.taskIds ?? [],
          claimedTaskAgeHours: claimedAgeH,
          caelRecords24h: cael?.count ?? 0,
          lastCaelTs: cael?.lastIso || null,
          doneEntries24h: done?.count ?? 0,
          lastDoneTs: done?.lastIso || null,
          commitsByWallet24h: null,
          doneEntriesWithCommit24h: done?.commitHashCount ?? 0,
          drift,
          trustScore: trust,
        });
      }

      // Stable ordering: untrusted first, then degraded, then ok; alpha within tier.
      const tierRank = { untrusted: 0, degraded: 1, ok: 2 } as const;
      agents.sort((a, b) => {
        const t = tierRank[a.trustScore] - tierRank[b.trustScore];
        return t !== 0 ? t : a.handle.localeCompare(b.handle);
      });

      json(res, 200, {
        success: true,
        asOf: nowIso,
        team_id: teamId,
        window: {
          since: sinceIso,
          window_hours: Math.round((nowMs - sinceMs) / 3_600_000),
        },
        agents,
        fleetTotals: {
          agentsConfigured: team.members?.length ?? 0,
          agentsObserved: allHandles.size,
          agentsHeartbeating: fleetOnline,
          claimedTasks: fleetClaimed,
          caelRecords24h: fleetCael,
          doneEntries24h: fleetDone,
          drift_alerts: fleetDriftAlerts,
          trust_distribution: {
            ok: agents.filter((a) => a.trustScore === 'ok').length,
            degraded: agents.filter((a) => a.trustScore === 'degraded').length,
            untrusted: agents.filter((a) => a.trustScore === 'untrusted').length,
          },
        },
      });
      return true;
    }
  }

  // ── POST/GET /api/holomesh/agent/:handle/dispatch ─────────────────────────
  // Closes the trigger-mechanism gap from task_..._pawd. Coordinator
  // (run-harness.mjs) POSTs cell parameters; worker brain GETs (drains)
  // pending dispatches and invokes its attacker loop.
  // Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §2.
  {
    const dispatchMatch = pathname.match(/^\/api\/holomesh\/agent\/([^/]+)\/dispatch$/);

    if (dispatchMatch && method === 'POST') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to dispatch attacks.' });
        return true;
      }
      const handle = decodeURIComponent(dispatchMatch[1]);
      // Auth: founder OR caller in HOLOMESH_SECURITY_AUDITOR_HANDLES.
      // Same gate as PATCH defense — both are admin-class operations.
      const auditorHandles = (process.env.HOLOMESH_SECURITY_AUDITOR_HANDLES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isAuthorizedAuditor = auditorHandles.includes(caller.name);
      if (!caller.isFounder && !isAuthorizedAuditor) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot dispatch attacks. Requires founder or HOLOMESH_SECURITY_AUDITOR_HANDLES membership.`,
        });
        return true;
      }
      const body = (await parseJsonBody(req)) as Partial<DispatchEntry> | null;
      if (!body) {
        json(res, 400, { error: 'JSON body required (cell_id, attack_class, target_handle, duration_ms, trial, defense_state).' });
        return true;
      }
      if (typeof body.cell_id !== 'string' || !body.cell_id) {
        json(res, 400, { error: 'cell_id (string) required.' });
        return true;
      }
      if (!isValidAttackClass(body.attack_class)) {
        json(res, 400, {
          error: `Invalid attack_class "${String(body.attack_class)}".`,
          valid_classes: VALID_ATTACK_CLASSES,
        });
        return true;
      }
      if (typeof body.target_handle !== 'string' || !body.target_handle) {
        json(res, 400, { error: 'target_handle (string) required.' });
        return true;
      }
      if (typeof body.duration_ms !== 'number' || body.duration_ms <= 0) {
        json(res, 400, { error: 'duration_ms (positive number) required.' });
        return true;
      }
      if (typeof body.trial !== 'number' || body.trial < 0) {
        json(res, 400, { error: 'trial (non-negative number) required.' });
        return true;
      }
      if (!isValidDefenseState(body.defense_state)) {
        json(res, 400, {
          error: `Invalid defense_state "${String(body.defense_state)}".`,
          valid_states: VALID_DEFENSE_STATES,
        });
        return true;
      }
      const entry: DispatchEntry = {
        cell_id: body.cell_id,
        attack_class: body.attack_class,
        target_handle: body.target_handle,
        duration_ms: body.duration_ms,
        trial: body.trial,
        defense_state: body.defense_state,
        dispatched_at: new Date().toISOString(),
        dispatched_by: caller.id,
      };
      enqueueDispatch(handle, entry);
      json(res, 200, { success: true, handle, dispatched: entry });
      return true;
    }

    if (dispatchMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to consume dispatch queue.' });
        return true;
      }
      const handle = decodeURIComponent(dispatchMatch[1]);
      // Auth: GET is consume — only handle owner or founder.
      // Phase 1.5 bearer-must-match-handle (same as POST CAEL pattern).
      if (!caller.isFounder && caller.name !== handle) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot consume dispatch queue for handle "${handle}". Only the handle owner may GET (drain semantics).`,
        });
        return true;
      }
      // ?peek=1 returns pending without draining (diagnostic).
      const url = new URL(req.url ?? '/', 'http://localhost');
      const peek = url.searchParams.get('peek') === '1';
      const dispatches = peek ? peekDispatches(handle) : consumeDispatches(handle);
      json(res, 200, {
        success: true,
        handle,
        peeked: peek,
        count: dispatches.length,
        dispatches,
      });
      return true;
    }
  }

  // ── GET /api/holomesh/space ───────────────────────────────────────────────
  if (pathname === '/api/holomesh/space' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    let entries: MeshKnowledgeEntry[] = [];
    let peers: unknown[] = [];
    try {
      [entries, peers] = await Promise.all([
        client.queryKnowledge('', { limit: 10 }),
        (client as any).discoverPeers?.() || Promise.resolve([]),
      ]);
    } catch {}

    if (!caller.authenticated) {
      const domains = Object.keys(DOMAIN_DESCRIPTIONS).map((d) => ({
        name: d,
        description: DOMAIN_DESCRIPTIONS[d],
      }));
      json(res, 200, {
        success: true,
        domains,
        network: { peers: (peers as unknown[]).length, entries: entries.length },
        quick_links: {
          register: 'POST /api/holomesh/register',
          quickstart: 'POST /api/holomesh/quickstart',
          key_challenge: 'POST /api/holomesh/key/challenge',
          key_recover: 'POST /api/holomesh/key/recover',
        },
      });
      return true;
    }

    // Find teams this agent is in
    const { teamStore } = await import('../state');
    const myTeams = Array.from(teamStore.values())
      .filter((t) => t.members.some((m) => m.agentId === caller.id))
      .map((t) => ({ id: t.id, name: t.name }));

    const privateWorkspaceId = `private:${caller.wallet || caller.id}`;

    json(res, 200, {
      success: true,
      your_agent: {
        id: caller.id,
        name: caller.name,
        wallet_address: caller.wallet,
        registered: true,
        teams: myTeams,
        private_workspace: {
          id: privateWorkspaceId,
          query: '/api/holomesh/knowledge/private',
        },
      },
      feed_summary: { entries: entries.length },
      what_to_do_next: [
        'Contribute a knowledge entry via POST /api/holomesh/contribute',
        'Join a team via POST /api/holomesh/team/:id/join',
        'Explore feed via GET /api/holomesh/feed',
      ],
      quick_links: {
        key_challenge: 'POST /api/holomesh/key/challenge',
        key_recover: 'POST /api/holomesh/key/recover',
        private_knowledge: '/api/holomesh/knowledge/private',
        create_team: 'POST /api/holomesh/team',
        team_dashboard: 'GET /api/holomesh/teams',
      },
    });
    return true;
  }

  // ── GET /api/holomesh/profile ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/profile' && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const profile = loadProfile(caller.id);
    json(res, 200, { success: true, profile });
    return true;
  }

  // ── PATCH /PUT /api/holomesh/profile ─────────────────────────────────────
  if (pathname === '/api/holomesh/profile' && (method === 'PATCH' || method === 'PUT')) {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const VALID_FIELDS = ['bio', 'themeColor', 'statusText', 'customTitle', 'themeAccent'];
    const updates: Record<string, unknown> = {};
    for (const field of VALID_FIELDS) {
      if (field in body) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      json(res, 400, { error: 'No valid profile fields provided' });
      return true;
    }
    // Validate bio length
    if (typeof updates.bio === 'string' && updates.bio.length > 500) {
      json(res, 400, { error: 'bio cannot exceed 500 characters' });
      return true;
    }
    // Validate hex colors
    for (const colorField of ['themeColor', 'themeAccent']) {
      if (typeof updates[colorField] === 'string') {
        if (!/^#[0-9a-fA-F]{3,8}$/.test(updates[colorField] as string)) {
          json(res, 400, { error: `${colorField} must be a valid hex color` });
          return true;
        }
      }
    }
    const existing = loadProfile(caller.id);
    const merged = { ...existing, ...updates };
    saveProfile(caller.id, merged);
    json(res, 200, {
      success: true,
      profile: merged,
      updated: Object.keys(updates),
    });
    return true;
  }

  // ── GET /api/holomesh/mcp-config ──────────────────────────────────────────
  if (pathname === '/api/holomesh/mcp-config' && method === 'GET') {
    const searchParams = new URL(url, 'http://localhost').searchParams;
    const format = searchParams.get('format') || 'claude';

    let config: Record<string, unknown>;
    if (format === 'cursor') {
      config = {
        mcpServers: {
          holomesh: {
            url: 'https://mcp.holoscript.net/mcp',
            transport: 'sse',
            headers: { Authorization: 'Bearer YOUR_API_KEY' },
          },
        },
      };
    } else {
      // claude or generic
      config = {
        mcpServers: {
          holomesh: {
            command: 'npx',
            args: ['-y', '@holoscript/mcp-server'],
            env: { HOLOSCRIPT_API_KEY: 'YOUR_API_KEY' },
          },
        },
      };
    }

    json(res, 200, {
      success: true,
      format,
      config,
      instructions: `Add this to your ${format} config file to connect to HoloMesh`,
      available_tools: AVAILABLE_TOOLS,
      quick_start: {
        step_1: 'Copy the config block into your IDE MCP config',
        step_2: 'Register at POST /api/holomesh/register',
        step_3: 'Set your API key in the env',
      },
      alternative_formats: {
        claude: '/api/holomesh/mcp-config?format=claude',
        cursor: '/api/holomesh/mcp-config?format=cursor',
        generic: '/api/holomesh/mcp-config?format=generic',
      },
    });
    return true;
  }

  // ── GET /api/holomesh/leaderboard ─────────────────────────────────────────
  if (pathname === '/api/holomesh/leaderboard' && method === 'GET') {
    const searchParams = new URL(url, 'http://localhost').searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10) || 10;

    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await client.queryKnowledge('', { limit: 1000 });
    } catch {}

    // Aggregate by author
    const contributorMap = new Map<string, { name: string; count: number }>();
    const domainMap = new Map<string, number>();
    for (const e of entries) {
      if (e.authorId) {
        const prev = contributorMap.get(e.authorId) || { name: e.authorName || e.authorId, count: 0 };
        contributorMap.set(e.authorId, { name: prev.name, count: prev.count + 1 });
      }
      const domain = e.domain || 'general';
      domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
    }

    const top_contributors = Array.from(contributorMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([id, { name, count }], idx) => ({
        rank: idx + 1,
        id,
        name,
        contributions: count,
      }));

    const active_domains = Array.from(domainMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }));

    const most_engaged_entries = entries
      .sort((a, b) => {
        const aVotes = (voteStore.get(a.id) || []).length;
        const bVotes = (voteStore.get(b.id) || []).length;
        return bVotes - aVotes;
      })
      .slice(0, 5)
      .map((e) => ({ id: e.id, content: e.content?.slice(0, 100), domain: e.domain }));

    json(res, 200, {
      success: true,
      top_contributors,
      most_engaged_entries,
      active_domains,
      summary: {
        total_entries: entries.length,
        total_contributors: contributorMap.size,
        total_domains: domainMap.size,
      },
    });
    return true;
  }

  // ── GET /api/holomesh/onboard ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/onboard' && method === 'GET') {
    let entries: MeshKnowledgeEntry[] = [];
    let peers: unknown[] = [];
    try {
      [entries, peers] = await Promise.all([
        client.queryKnowledge('', { limit: 20 }),
        (client as any).discoverPeers?.() || Promise.resolve([]),
      ]);
    } catch {}

    const domainMap = new Map<string, number>();
    for (const e of entries) {
      const d = e.domain || 'general';
      domainMap.set(d, (domainMap.get(d) || 0) + 1);
    }
    const top_domains = Array.from(domainMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    json(res, 200, {
      success: true,
      welcome: 'Welcome to HoloMesh — the knowledge network for AI agents.',
      network_stats: {
        agents: (peers as unknown[]).length + agentKeyStore.size || 1,
        entries: entries.length,
        domains: domainMap.size,
      },
      how_to_join: {
        step_1: { action: 'Register', endpoint: 'POST /api/holomesh/register', description: 'Create your agent identity with a wallet.' },
        step_2: { action: 'Set up your profile', endpoint: 'PATCH /api/holomesh/profile', description: 'Add bio, theme, and status.' },
        step_3: { action: 'Contribute knowledge', endpoint: 'POST /api/holomesh/contribute', description: 'Share a wisdom, pattern, or gotcha.' },
      },
      knowledge_types: {
        wisdom: 'General insights and architectural truths',
        pattern: 'Reusable approaches that work repeatedly',
        gotcha: 'Mistakes to avoid and failure modes',
      },
      reputation_tiers: [
        { tier: 'Newcomer', min: 0, description: 'Just registered' },
        { tier: 'Contributor', min: 5, description: '5+ entries contributed' },
        { tier: 'Expert', min: 20, description: '20+ entries with high engagement' },
        { tier: 'Oracle', min: 50, description: '50+ entries, trusted source' },
      ],
      top_domains,
      sample_entries: entries.slice(0, 3).map((e) => ({
        id: e.id,
        type: e.type,
        domain: e.domain,
        content: e.content?.slice(0, 150),
        authorName: e.authorName,
      })),
      mcp_endpoint: {
        url: 'https://mcp.holoscript.net/mcp',
        tools: AVAILABLE_TOOLS.slice(0, 6),
      },
      links: {
        register: 'POST /api/holomesh/register',
        quickstart: 'POST /api/holomesh/quickstart',
        mcp_config: 'GET /api/holomesh/mcp-config',
      },
    });
    return true;
  }

  // ── GET /api/holomesh/domains ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/domains' && method === 'GET') {
    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await client.queryKnowledge('', { limit: 1000 });
    } catch {}

    const domainMap = new Map<string, number>();
    for (const e of entries) {
      const d = (e.domain || 'general').toLowerCase();
      domainMap.set(d, (domainMap.get(d) || 0) + 1);
    }

    const domains = Array.from(domainMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, entryCount]) => ({
        name,
        entryCount,
        description: DOMAIN_DESCRIPTIONS[name] || `Knowledge entries in the ${name} domain.`,
      }));

    json(res, 200, { success: true, domains });
    return true;
  }

  // ── GET /api/holomesh/knowledge/private ───────────────────────────────────
  if (pathname === '/api/holomesh/knowledge/private' && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const workspaceId = `private:${caller.walletAddress}`;
    const searchParams = new URL(url, 'http://localhost').searchParams;
    const domainFilter = searchParams.get('domain');

    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await client.queryKnowledge('', { workspaceId, limit: 200 });
    } catch {}

    // Filter out init entries and apply domain filter
    let filtered = entries.filter((e: MeshKnowledgeEntry) => !e.id.endsWith(':init'));
    if (domainFilter) {
      filtered = filtered.filter((e: MeshKnowledgeEntry) => e.domain === domainFilter);
    }

    const domains = [...new Set(filtered.map((e: MeshKnowledgeEntry) => e.domain || 'general'))];

    json(res, 200, {
      success: true,
      workspace_id: workspaceId,
      entries: filtered,
      domains,
    });
    return true;
  }

  // ── POST /api/holomesh/knowledge/private ──────────────────────────────────
  if (pathname === '/api/holomesh/knowledge/private' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const entries = body.entries as MeshKnowledgeEntry[] | undefined;
    if (!Array.isArray(entries) || entries.length === 0) {
      json(res, 400, { error: 'entries array is required and must not be empty' });
      return true;
    }
    if (entries.length > 100) {
      json(res, 400, { error: 'Cannot submit more than 100 entries at once' });
      return true;
    }
    const workspaceId = `private:${caller.walletAddress}`;
    const prepared = entries.map((e: MeshKnowledgeEntry) => ({
      ...e,
      id: e.id || `W.priv.${Date.now()}.${Math.random().toString(36).slice(2, 5)}`,
      workspaceId,
      authorId: e.authorId || caller.id,
      authorName: e.authorName || caller.name,
      tags: [...(Array.isArray(e.tags) ? e.tags : []), 'private'],
      price: e.price ?? 0,
      queryCount: e.queryCount ?? 0,
      reuseCount: e.reuseCount ?? 0,
      createdAt: e.createdAt || new Date().toISOString(),
    }));
    await client.contributeKnowledge(prepared);
    json(res, 201, {
      success: true,
      workspace_id: workspaceId,
      entries: prepared,
    });
    return true;
  }

  // ── POST /api/holomesh/knowledge/promote ──────────────────────────────────
  if (pathname === '/api/holomesh/knowledge/promote' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const entryId = body.entry_id as string | undefined;
    const price = (body.price as number | undefined) ?? 0;
    if (!entryId) {
      json(res, 400, { error: 'entry_id is required' });
      return true;
    }
    let found: MeshKnowledgeEntry | undefined;
    try {
      const results = await client.queryKnowledge(entryId, { limit: 10 });
      found = results.find((e: MeshKnowledgeEntry) => e.id === entryId);
    } catch {}
    if (!found) {
      json(res, 404, { error: `Entry ${entryId} not found` });
      return true;
    }
    const publicId = `pub.${entryId.replace(/^(W|P|G)\.priv\./, '$1.')}`;
    const publicEntry: MeshKnowledgeEntry = {
      ...found,
      id: publicId,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      price,
      tags: [
        ...(Array.isArray(found.tags) ? found.tags.filter((t: string) => t !== 'private') : []),
        'promoted',
      ],
      provenanceHash:
        found.provenanceHash ||
        crypto.createHash('sha256').update(publicId + Date.now()).digest('hex'),
    };
    await client.contributeKnowledge([publicEntry]);
    json(res, 201, {
      success: true,
      promoted: { from: entryId, to: publicId, price },
    });
    return true;
  }

  // ── DELETE /api/holomesh/knowledge/private/:id ────────────────────────────
  if (pathname.match(/^\/api\/holomesh\/knowledge\/private\/[^/]+$/) && method === 'DELETE') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const entryId = pathname.replace('/api/holomesh/knowledge/private/', '');
    const workspaceId = `private:${caller.walletAddress}`;
    const tombstone: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId,
      type: 'wisdom',
      content: '[deleted]',
      authorId: caller.id,
      authorName: caller.name,
      provenanceHash: '',
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: 'general',
      tags: ['tombstone'],
      createdAt: new Date().toISOString(),
    };
    await client.contributeKnowledge([tombstone]);
    json(res, 200, { success: true, deleted: entryId });
    return true;
  }

  return false;
}
