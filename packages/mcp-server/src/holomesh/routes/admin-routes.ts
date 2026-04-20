/**
 * HoloMesh Admin Routes
 *
 * Founder-only operations for agent provisioning, key rotation, and revocation.
 * All routes under /api/holomesh/admin/* require isFounder=true.
 *
 * POST /api/holomesh/admin/provision  — Create agent with pre-assigned wallet + API key
 * POST /api/holomesh/admin/rotate-key — Issue new key, same wallet/team/reputation
 * POST /api/holomesh/admin/revoke     — Invalidate all keys for an agent (wallet preserved)
 * GET  /api/holomesh/admin/agents     — List all provisioned agents (no keys exposed)
 * PATCH /api/holomesh/admin/team/:id/admin-room — Toggle adminRoom flag on a team
 */

import type http from 'http';
import * as crypto from 'crypto';
import {
  keyRegistry,
  agentKeyStore,
  walletToAgent,
  persistKeyRegistry,
  persistAgentStore,
  teamStore,
  persistTeamStore,
} from '../state';
import { json, parseJsonBody } from '../utils';
import { resolveRequestingAgent } from '../auth-utils';
import { recordAdminOperation } from '../admin-operations-audit';
import type { KeyRecord, RegisteredAgent } from '../types';

export async function handleAdminRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  _url: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/holomesh/admin/')) return false;

  // All admin routes require founder auth
  const caller = resolveRequestingAgent(req);
  if (!caller.authenticated || !caller.isFounder) {
    json(res, 403, { error: 'Founder authorization required. Access denied.' });
    return true;
  }

  // ── POST /api/holomesh/admin/provision ─────────────────────────────────────
  if (pathname === '/api/holomesh/admin/provision' && method === 'POST') {
    const body = await parseJsonBody(req);
    const name = (body.name as string | undefined)?.trim() ?? '';

    if (name.length < 2 || name.length > 64) {
      json(res, 400, { error: 'name must be 2-64 chars' });
      return true;
    }

    // Check for duplicate names
    const duplicate = Array.from(agentKeyStore.values()).some(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      json(res, 409, { error: `Agent name '${name}' already exists` });
      return true;
    }

    const walletAddress =
      (body.wallet_address as string | undefined) ||
      `0x${crypto.randomBytes(20).toString('hex')}`;
    const scopes: string[] = Array.isArray(body.scopes)
      ? (body.scopes as string[])
      : ['holomesh', 'mcp'];
    const isFounder = body.is_founder === true;
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const apiKey = `hs_sk_${crypto.randomUUID().replace(/-/g, '')}`;

    const record: KeyRecord = {
      key: apiKey,
      walletAddress,
      agentId,
      agentName: name,
      scopes,
      createdAt: new Date().toISOString(),
      isFounder,
    };
    keyRegistry.set(apiKey, record);
    persistKeyRegistry();

    const agent: RegisteredAgent = {
      id: agentId,
      apiKey,
      walletAddress,
      name,
      traits: Array.isArray(body.traits) ? (body.traits as string[]) : ['@provisioned'],
      reputation: 0,
      isFounder,
      createdAt: new Date().toISOString(),
    };
    agentKeyStore.set(apiKey, agent);
    walletToAgent.set(walletAddress.toLowerCase(), agent);
    persistAgentStore();

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'provision',
      path: pathname,
      before: null,
      after: {
        agent_id: agentId,
        agent_name: name,
        wallet_address: walletAddress,
        scopes,
        is_founder: isFounder,
        api_key_prefix: `${apiKey.slice(0, 12)}...`,
      },
    });

    json(res, 201, {
      success: true,
      api_key: apiKey,
      agent_id: agentId,
      wallet_address: walletAddress,
      scopes,
      is_founder: isFounder,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/rotate-key ────────────────────────────────────
  if (pathname === '/api/holomesh/admin/rotate-key' && method === 'POST') {
    const body = await parseJsonBody(req);
    const agentId = body.agent_id as string | undefined;
    const walletAddress = body.wallet_address as string | undefined;

    let existingRecord: KeyRecord | undefined;
    if (agentId) {
      existingRecord = Array.from(keyRegistry.values()).find((r) => r.agentId === agentId);
    } else if (walletAddress) {
      existingRecord = Array.from(keyRegistry.values()).find(
        (r) => r.walletAddress.toLowerCase() === walletAddress.toLowerCase()
      );
    }

    if (!existingRecord) {
      json(res, 404, { error: 'Agent not found in key registry. Use agent_id or wallet_address.' });
      return true;
    }

    const newKey = `hs_sk_${crypto.randomUUID().replace(/-/g, '')}`;
    const newRecord: KeyRecord = {
      ...existingRecord,
      key: newKey,
      rotatedFrom: existingRecord.key,
      createdAt: new Date().toISOString(),
    };

    // Invalidate old key in memory, insert new key
    keyRegistry.delete(existingRecord.key);
    keyRegistry.set(newKey, newRecord);

    // Update agent key store
    const agent = agentKeyStore.get(existingRecord.key);
    if (agent) {
      agentKeyStore.delete(existingRecord.key);
      agent.apiKey = newKey;
      agentKeyStore.set(newKey, agent);
      if (agent.walletAddress) {
        walletToAgent.set(agent.walletAddress.toLowerCase(), agent);
      }
    }

    persistKeyRegistry();
    persistAgentStore();

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'key_rotation',
      path: pathname,
      before: {
        agent_id: existingRecord.agentId,
        wallet_address: existingRecord.walletAddress,
        key_prefix: `${existingRecord.key.slice(0, 12)}...`,
      },
      after: {
        agent_id: newRecord.agentId,
        wallet_address: newRecord.walletAddress,
        key_prefix: `${newKey.slice(0, 12)}...`,
      },
    });

    json(res, 200, {
      success: true,
      new_key: newKey,
      wallet_address: newRecord.walletAddress,
      agent_id: newRecord.agentId,
      // Never expose the full old key — just a hint for reference
      rotated_from_prefix: `${existingRecord.key.slice(0, 12)}...`,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/revoke ────────────────────────────────────────
  if (pathname === '/api/holomesh/admin/revoke' && method === 'POST') {
    const body = await parseJsonBody(req);
    const agentId = body.agent_id as string | undefined;

    if (!agentId) {
      json(res, 400, { error: 'agent_id required' });
      return true;
    }

    const matchingEntries = Array.from(keyRegistry.entries()).filter(
      ([, r]) => r.agentId === agentId
    );

    if (matchingEntries.length === 0) {
      json(res, 404, { error: 'Agent not found in key registry' });
      return true;
    }

    for (const [key] of matchingEntries) {
      keyRegistry.delete(key);
      agentKeyStore.delete(key);
    }

    persistKeyRegistry();
    persistAgentStore();

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'revoke',
      path: pathname,
      before: {
        agent_id: agentId,
        keys_to_revoke: matchingEntries.length,
      },
      after: {
        agent_id: agentId,
        revoked_keys: matchingEntries.length,
      },
    });

    json(res, 200, {
      success: true,
      revoked_keys: matchingEntries.length,
      agent_id: agentId,
      note: 'Wallet entry preserved. Re-provision via POST /api/holomesh/admin/provision with the same wallet_address.',
    });
    return true;
  }

  // ── GET /api/holomesh/admin/agents ─────────────────────────────────────────
  if (pathname === '/api/holomesh/admin/agents' && method === 'GET') {
    // Deduplicate by agentId (show latest key record per agent)
    const byAgent = new Map<string, KeyRecord>();
    for (const record of keyRegistry.values()) {
      const existing = byAgent.get(record.agentId);
      if (!existing || record.createdAt > existing.createdAt) {
        byAgent.set(record.agentId, record);
      }
    }

    const agents = Array.from(byAgent.values()).map((r) => ({
      agent_id: r.agentId,
      agent_name: r.agentName,
      wallet_address: r.walletAddress,
      scopes: r.scopes,
      is_founder: r.isFounder,
      created_at: r.createdAt,
      // Intentionally omit r.key — never expose tokens in list responses
    }));

    json(res, 200, { success: true, agents, count: agents.length });
    return true;
  }

  // ── PATCH /api/holomesh/admin/team/:id/admin-room ──────────────────────────
  // Toggle the adminRoom flag — when true, every member effectively carries
  // owner permissions (used for the founder's working teams).
  const adminRoomMatch = pathname.match(/^\/api\/holomesh\/admin\/team\/([^/]+)\/admin-room$/);
  if (adminRoomMatch && method === 'PATCH') {
    const teamId = adminRoomMatch[1];
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }

    const body = await parseJsonBody(req);
    if (typeof body.enabled !== 'boolean') {
      json(res, 400, { error: 'enabled (boolean) is required' });
      return true;
    }

    const before = team.adminRoom === true;
    team.adminRoom = body.enabled;
    persistTeamStore();

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'team_admin_room_toggle',
      path: pathname,
      before: { team_id: teamId, admin_room: before },
      after: { team_id: teamId, admin_room: body.enabled },
    });

    json(res, 200, {
      success: true,
      team_id: teamId,
      admin_room: body.enabled,
    });
    return true;
  }

  return false;
}
