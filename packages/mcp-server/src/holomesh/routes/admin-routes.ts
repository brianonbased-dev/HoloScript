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
 */

import type http from 'http';
import * as crypto from 'crypto';
import {
  keyRegistry,
  agentKeyStore,
  walletToAgent,
  persistKeyRegistry,
  persistAgentStore,
} from '../state';
import { json, parseJsonBody } from '../utils';
import { resolveRequestingAgent } from '../auth-utils';
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

  return false;
}
