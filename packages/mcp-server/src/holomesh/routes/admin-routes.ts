/**
 * HoloMesh Admin Routes
 *
 * Founder-only operations for agent provisioning, key rotation, and revocation.
 * All routes under /api/holomesh/admin/* require isFounder=true.
 *
 * POST /api/holomesh/admin/provision          — Create agent with pre-assigned wallet + API key
 * POST /api/holomesh/admin/rotate-key        — Issue new key for one record (key_id, or an agent_id /
 *                                              wallet_address that matches exactly one record)
 * POST /api/holomesh/admin/revoke            — Revoke one key by key_id (wallet mapping preserved)
 *
 * rotate-key and revoke refuse a founder record unless confirm_founder: true is
 * sent (revoke never removes the last founder), refuse (409) a key that is still
 * the value of a seedable env var, and answer 503 (done in memory only) instead
 * of success when the change cannot be saved; a retry re-attempts the save.
 *
 * POST /api/holomesh/admin/tenant-keys/revoke — Revoke one tenant API key by its id
 * POST /api/holomesh/admin/deregister        — Fully remove an agent and FREE ITS NAME (reaches
 *                                              publicly self-registered agents that revoke cannot)
 * GET  /api/holomesh/admin/agents            — List all agents — provisioned AND self-registered (no keys exposed)
 * PATCH /api/holomesh/admin/team/:id/admin-room — Toggle adminRoom flag on a team
 * POST /api/holomesh/admin/transfer-ownership — Transfer team ownership to another agent
 */

import type http from 'http';
import * as crypto from 'crypto';
import {
  keyRegistry,
  agentKeyStore,
  walletToAgent,
  persistKeyRegistry,
  persistAgentStore,
  revokeKeyRecord,
  revokedKeyById,
  findKeyRecordById,
  keyIdOf,
  isDefounderDryRun,
  keyStoreDurabilityProblem,
  envVarHoldingKey,
  teamStore,
  persistTeamDurable,
  reloadTeam,
  scalingOverrideStore,
  failoverStateStore,
} from '../state';
import { json, parseJsonBody } from '../utils';
import { resolveRequestingAgent } from '../auth-utils';
import { recordAdminOperation } from '../admin-operations-audit';
import { revokeLeasesForAgent } from '../identity/vault-lease-registry';
import { revokeTenantKeyById } from '../../security/tenant-auth';
import type { KeyRecord, RegisteredAgent } from '../types';

const NOT_DURABLE_ERROR =
  'Done in memory only; NOT saved. The key store could not be written durably, so the change would be lost on a restart. Check HOLOMESH_DATA_DIR, then retry the same request to save it.';

/**
 * Save the key stores after a revoke, rotate or deregister. The change is
 * already live in memory (fail closed: a revoked key stops working at once);
 * this reports whether it is also durable. Not durable when a write failed or
 * the store is known not to survive a restart, in every mode.
 */
function saveKeyStores(): { durable: boolean; problem?: string } {
  const keysWritten = persistKeyRegistry();
  const agentsWritten = persistAgentStore();
  const problem = keyStoreDurabilityProblem() ?? undefined;
  if (problem) return { durable: false, problem };
  if (!keysWritten || !agentsWritten) return { durable: false, problem: 'a write failed' };
  return { durable: true };
}

/** Body for a 503 when the change is live in memory but not saved. */
function notDurableBody(problem: string | undefined, extra: Record<string, unknown>) {
  return {
    success: false,
    durable: false,
    in_memory_only: true,
    error: NOT_DURABLE_ERROR,
    ...(problem ? { problem } : {}),
    ...extra,
  };
}

/** Live founder records other than the one holding `excludeKey`. */
function otherLiveFounders(excludeKey: string): number {
  const keys = new Set<string>();
  for (const r of keyRegistry.values()) {
    if (r.isFounder === true && r.key !== excludeKey) keys.add(r.key);
  }
  for (const a of agentKeyStore.values()) {
    if (a.isFounder === true && a.apiKey && a.apiKey !== excludeKey) keys.add(a.apiKey);
  }
  return keys.size;
}

/** Deregisters answered 503: query token -> removed rows, so a retry can save. */
const unsavedDeregisters = new Map<string, Array<Record<string, string>>>();

/** 409 when the key is still the value of a seedable env var. */
function refuseEnvHeldKey(res: http.ServerResponse, key: string): boolean {
  const envVar = envVarHoldingKey(key);
  if (!envVar) return false;
  json(res, 409, {
    error: `This key is the current value of ${envVar}. Rotate the env var (and redeploy) instead; revoke the old record by key_id after that.`,
    env_var: envVar,
  });
  return true;
}

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
      (body.wallet_address as string | undefined) || `0x${crypto.randomBytes(20).toString('hex')}`;
    // Default scope floor includes tools:read so a provisioned agent can consume the
    // read-only LANGUAGE surface (parse_hs / validate_holoscript / list_traits /
    // explain_*) via the edge mcp_call tool — non-destructive, the safest + most
    // common edge use (a brain validating its own output). /founder ruling 2026-06-21:
    // tools:read is agent-decidable + safe-by-default (D.100 Axis-1, W.GOLD.193). The
    // compute/write set (tools:write, tools:codebase) stays an EXPLICIT grant — pass
    // `scopes` to provision a sovereign edge agent with the fuller safe set; admin /
    // marketplace / paid-fleet scopes are never defaulted.
    const scopes: string[] = Array.isArray(body.scopes)
      ? (body.scopes as string[])
      : ['holomesh', 'mcp', 'tools:read'];
    const isFounder = body.is_founder === true;
    if (isFounder) {
      // The founder flag belongs to the configured founder key only.
      if (!isDefounderDryRun()) {
        json(res, 400, { error: 'is_founder is reserved for the configured founder key' });
        return true;
      }
      console.warn('[KeyRegistry] Founder flag: would refuse is_founder on provision (dry run).');
    }
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const apiKey = `hs_sk_${crypto.randomUUID().replace(/-/g, '')}`;

    const record: KeyRecord = {
      key: apiKey,
      walletAddress,
      agentId,
      agentName: name,
      scopes,
      createdAt: new Date().toISOString(),
      rotationCount: 0,
      lastRotatedAt: null,
      isFounder,
    };
    keyRegistry.set(apiKey, record);
    persistKeyRegistry();
    const keyId = keyIdOf(record);

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
      key_id: keyId,
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
    if (body.key_id !== undefined && typeof body.key_id !== 'string') {
      json(res, 400, { error: 'key_id must be a string' });
      return true;
    }
    const keyId = typeof body.key_id === 'string' ? body.key_id.trim() : '';
    const agentId = body.agent_id as string | undefined;
    const walletAddress = body.wallet_address as string | undefined;

    // Rotate exactly one record. An agent can hold several keys, so agent_id
    // or wallet_address is accepted only when it matches a single record.
    let candidates: KeyRecord[] = [];
    if (keyId) {
      const found = findKeyRecordById(keyId);
      candidates = found ? [found] : [];
    } else if (agentId) {
      candidates = Array.from(keyRegistry.values()).filter((r) => r.agentId === agentId);
    } else if (walletAddress) {
      candidates = Array.from(keyRegistry.values()).filter(
        (r) => r.walletAddress.toLowerCase() === walletAddress.toLowerCase()
      );
    }

    if (candidates.length === 0) {
      // A retry after a non-durable rotate: the old key_id is already rotated
      // in memory. Re-attempt the save rather than answer 404.
      const rotatedKey = keyId ? revokedKeyById(keyId) : undefined;
      if (rotatedKey) {
        const successor = Array.from(keyRegistry.values()).find(
          (r) => r.rotatedFrom === rotatedKey
        );
        const saved = saveKeyStores();
        const extra = {
          already_rotated: true,
          ...(successor ? { key_id: keyIdOf(successor) } : {}),
        };
        if (!saved.durable) json(res, 503, notDurableBody(saved.problem, extra));
        else json(res, 200, { success: true, durable: true, ...extra });
        return true;
      }
      json(res, 404, {
        error: 'Key record not found in key registry. Use key_id, agent_id or wallet_address.',
      });
      return true;
    }
    if (candidates.length > 1) {
      json(res, 409, {
        error: 'More than one key record matches. Rotate a single record by key_id.',
        key_ids: candidates.map((r) => keyIdOf(r)),
      });
      return true;
    }
    const existingRecord = candidates[0];

    // A founder record needs an explicit confirm: after rotation the new key
    // only stays founder across restarts once HOLOMESH_FOUNDER_KEY is updated.
    if (existingRecord.isFounder === true && body.confirm_founder !== true) {
      json(res, 409, {
        error:
          'This is a founder record. Pass confirm_founder: true to rotate it, then update HOLOMESH_FOUNDER_KEY to the new key before the next restart.',
      });
      return true;
    }
    if (refuseEnvHeldKey(res, existingRecord.key)) return true;

    const newKey = `hs_sk_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const newRecord: KeyRecord = {
      ...existingRecord,
      key: newKey,
      rotatedFrom: existingRecord.key,
      createdAt: now,
      rotationCount: (existingRecord.rotationCount ?? 0) + 1,
      lastRotatedAt: now,
      // Provenance survives rotation, stated explicitly rather than left to the
      // spread above. A rotated key matches no env var any more, so this marker
      // is the ONLY thing left that still says "shared secret": drop it and a
      // key held in common by every caller configured with that variable
      // silently becomes one that proves a single agent's identity.
      ...(existingRecord.seededFromEnv ? { seededFromEnv: existingRecord.seededFromEnv } : {}),
      keyId: `key_${crypto.randomUUID().replace(/-/g, '')}`,
    };
    const newKeyId = keyIdOf(newRecord);

    // Revoke the old key (durably, on persist below), insert the new key
    revokeKeyRecord(existingRecord.key);
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

    const rotateSaved = saveKeyStores();
    const rotateDurable = rotateSaved.durable;

    // Revoke any active vault leases held by the rotated agent.
    // If an API key is rotated (e.g., compromise response), the agent should
    // lose access to leased credentials until it re-authenticates with the new key.
    const revokedLeases = revokeLeasesForAgent(existingRecord.agentId, 'rotation', caller.id);

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
        rotation_count: existingRecord.rotationCount ?? 0,
      },
      after: {
        agent_id: newRecord.agentId,
        wallet_address: newRecord.walletAddress,
        key_prefix: `${newKey.slice(0, 12)}...`,
        rotation_count: newRecord.rotationCount,
        last_rotated_at: newRecord.lastRotatedAt,
        revoked_leases: revokedLeases.length,
        durable: rotateDurable,
      },
    });

    if (!rotateDurable) {
      // The old key is dead and new_key is LIVE, both in memory only. Hand the
      // new key back (it is a working credential), but do not report success.
      json(
        res,
        503,
        notDurableBody(rotateSaved.problem, {
          new_key: newKey,
          new_key_live: true,
          old_key_revoked_in_memory: true,
          key_id: newKeyId,
          note: 'new_key works now. Retry with the old key_id to save; until saved, a restart brings the old key back and drops new_key.',
        })
      );
      return true;
    }

    json(res, 200, {
      success: true,
      ...(existingRecord.isFounder === true
        ? {
            founder_key_env_update_required:
              'Set HOLOMESH_FOUNDER_KEY to new_key before the next restart.',
          }
        : {}),
      new_key: newKey,
      key_id: newKeyId,
      wallet_address: newRecord.walletAddress,
      agent_id: newRecord.agentId,
      rotation_count: newRecord.rotationCount,
      last_rotated_at: newRecord.lastRotatedAt,
      revoked_leases: revokedLeases.length,
      // Never expose the full old key — just a hint for reference
      rotated_from_prefix: `${existingRecord.key.slice(0, 12)}...`,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/update-scopes ─────────────────────────────────
  // In-place scope update: change an existing agent key's scopes WITHOUT rotating
  // the key or touching the wallet / agentId / createdAt (G.GOLD.016 — never clobber
  // identity). This is how a sovereign edge agent is granted the safe tool set
  // (tools:read + tools:write + tools:codebase) so its mcp_call reaches the language
  // surface, without the disruption of re-provisioning a new key. Founder-authed
  // (guard at the top of this handler). /founder-ruled agent-decidable 2026-06-21.
  // Targets one record: key_id, or an agent_id / wallet_address matching exactly
  // one record (409 with key_ids when several match), as rotate-key does.
  if (pathname === '/api/holomesh/admin/update-scopes' && method === 'POST') {
    const body = await parseJsonBody(req);
    const agentId = body.agent_id as string | undefined;
    const walletAddress = body.wallet_address as string | undefined;
    const scopes = body.scopes;
    if (!Array.isArray(scopes) || !scopes.every((s) => typeof s === 'string')) {
      json(res, 400, { error: 'scopes (string[]) is required' });
      return true;
    }

    if (body.key_id !== undefined && typeof body.key_id !== 'string') {
      json(res, 400, { error: 'key_id must be a string' });
      return true;
    }
    const scopesKeyId = typeof body.key_id === 'string' ? body.key_id.trim() : '';

    // Same targeting rule as rotate-key: key_id, or an agent_id / wallet_address
    // that matches exactly one record.
    let existingRecord: KeyRecord | undefined;
    if (scopesKeyId) {
      existingRecord = findKeyRecordById(scopesKeyId);
      if (!existingRecord) {
        json(res, 404, { error: 'Key record not found in key registry' });
        return true;
      }
    } else if (agentId || walletAddress) {
      const matches = Array.from(keyRegistry.values()).filter((r) =>
        agentId
          ? r.agentId === agentId
          : r.walletAddress.toLowerCase() === (walletAddress as string).toLowerCase()
      );
      if (matches.length > 1) {
        json(res, 409, {
          error: 'More than one key record matches. Update a single record by key_id.',
          key_ids: matches.map((r) => keyIdOf(r)),
        });
        return true;
      }
      existingRecord = matches[0];
    } else {
      json(res, 400, { error: 'key_id, agent_id or wallet_address is required' });
      return true;
    }
    // Public-register agents (the live edge agents — e.g. jetson-orin-01) live in
    // agentKeyStore with NO keyRegistry row and NO scopes field, so they resolve via
    // the legacy path with zero scopes and can't reach ANY scoped tool. BRIDGE such an
    // agent into the key registry keyed by its EXISTING token: it gains scoped tool
    // access without a new key/identity (resolveRequestingAgent checks keyRegistry
    // first). Wallet / agentId / name preserved (G.GOLD.016); never escalated to founder.
    let bridgedFromPublic = false;
    if (!existingRecord && !scopesKeyId) {
      const legacy = Array.from(agentKeyStore.values()).find((a) =>
        agentId
          ? a.id === agentId
          : a.walletAddress?.toLowerCase() === (walletAddress as string).toLowerCase()
      );
      if (legacy?.apiKey) {
        existingRecord = {
          key: legacy.apiKey,
          walletAddress: legacy.walletAddress ?? '',
          agentId: legacy.id,
          agentName: legacy.name,
          scopes: [],
          createdAt: legacy.createdAt ?? new Date().toISOString(),
          rotationCount: 0,
          lastRotatedAt: null,
          isFounder: false,
        };
        bridgedFromPublic = true;
      }
    }
    if (!existingRecord) {
      json(res, 404, {
        error: 'Agent not found in key registry or agent store. Use agent_id or wallet_address.',
      });
      return true;
    }

    const before = [...(existingRecord.scopes ?? [])];
    // In-place mutation: ONLY scopes change — key, walletAddress, agentId, createdAt
    // are untouched (the same record object stays in the registry under the same key).
    // For a bridged public-register agent this CREATES the keyRegistry row under its token.
    existingRecord.scopes = scopes as string[];
    keyRegistry.set(existingRecord.key, existingRecord);
    persistKeyRegistry();

    recordAdminOperation({
      actor: { agentId: caller.id, agentName: caller.name, wallet: caller.wallet },
      action: 'update_scopes',
      path: pathname,
      before: {
        agent_id: existingRecord.agentId,
        scopes: before,
        bridged_from_public: bridgedFromPublic,
      },
      after: { agent_id: existingRecord.agentId, scopes: existingRecord.scopes },
    });

    json(res, 200, {
      success: true,
      agent_id: existingRecord.agentId,
      wallet_address: existingRecord.walletAddress,
      scopes: existingRecord.scopes,
      bridged_from_public: bridgedFromPublic,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/revoke ────────────────────────────────────────
  // Revokes ONE key, named by key_id (listed per agent by GET /admin/agents).
  // An agent can hold several keys, so agent_id alone is not accepted.
  // A founder record also needs confirm_founder: true. A key that is still the
  // value of a seedable env var answers 409 (rotate the env var). When the
  // change cannot be saved the key is still dead in memory and the answer is
  // 503, never success; retrying the same key_id re-attempts the save.
  if (pathname === '/api/holomesh/admin/revoke' && method === 'POST') {
    const body = await parseJsonBody(req);
    const keyId = typeof body.key_id === 'string' ? body.key_id.trim() : '';

    if (!keyId) {
      json(res, 400, {
        error: 'key_id required. Key ids are listed per agent by GET /api/holomesh/admin/agents.',
      });
      return true;
    }

    const record = findKeyRecordById(keyId);
    if (!record) {
      // A retry after a non-durable revoke: the key is already dead in memory.
      // Re-attempt the save rather than answer 404.
      if (revokedKeyById(keyId)) {
        const saved = saveKeyStores();
        const extra = { already_revoked: true, revoked_in_memory: true, key_id: keyId };
        if (!saved.durable) json(res, 503, notDurableBody(saved.problem, extra));
        else json(res, 200, { success: true, durable: true, ...extra });
        return true;
      }
      json(res, 404, { error: 'Key record not found in key registry' });
      return true;
    }

    const founderKey = (process.env.HOLOMESH_FOUNDER_KEY || '').trim();
    if (founderKey && record.key === founderKey) {
      json(res, 403, { error: 'Refusing to revoke the configured founder key' });
      return true;
    }
    // Never leave zero founders: there is no API path back from that.
    if (record.isFounder === true && otherLiveFounders(record.key) === 0) {
      json(res, 403, { error: 'Refusing to revoke the last founder record' });
      return true;
    }
    if (record.isFounder === true && body.confirm_founder !== true) {
      json(res, 403, {
        error: 'This is a founder record. Pass confirm_founder: true to revoke it.',
      });
      return true;
    }
    if (refuseEnvHeldKey(res, record.key)) return true;

    const agentId = record.agentId;
    revokeKeyRecord(record.key);
    agentKeyStore.delete(record.key);

    const revokeSaved = saveKeyStores();
    const revokeDurable = revokeSaved.durable;

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
        key_id: keyId,
        keys_to_revoke: 1,
      },
      after: {
        agent_id: agentId,
        key_id: keyId,
        revoked_keys: 1,
        durable: revokeDurable,
      },
    });

    if (!revokeDurable) {
      json(
        res,
        503,
        notDurableBody(revokeSaved.problem, { revoked_in_memory: true, key_id: keyId })
      );
      return true;
    }

    json(res, 200, {
      success: true,
      revoked_keys: 1,
      key_id: keyId,
      agent_id: agentId,
      note: 'Wallet entry preserved. Re-provision via POST /api/holomesh/admin/provision with the same wallet_address.',
    });
    return true;
  }

  // ── POST /api/holomesh/admin/tenant-keys/revoke ────────────────────────────
  // Revoke one tenant API key (api_keys table) by its row id. Founder-only via
  // the guard at the top of this handler.
  if (pathname === '/api/holomesh/admin/tenant-keys/revoke' && method === 'POST') {
    const body = await parseJsonBody(req);
    const id = typeof body.id === 'number' ? body.id : Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      json(res, 400, { error: 'id (positive integer) required' });
      return true;
    }

    const result = await revokeTenantKeyById(id);
    if (result.status === 'unavailable') {
      json(res, 503, { error: 'Tenant key store unavailable' });
      return true;
    }
    if (result.status === 'not_found') {
      json(res, 404, { error: 'Tenant key not found' });
      return true;
    }
    const cacheFailed = result.cacheCleared === false;

    recordAdminOperation({
      actor: { agentId: caller.id, agentName: caller.name, wallet: caller.wallet },
      action: 'tenant_key_revoke',
      path: pathname,
      before: { tenant_key_id: id },
      after: {
        tenant_key_id: result.id,
        tenant_id: result.tenantId,
        revoked: true,
        cache_cleared: result.cacheCleared,
      },
    });

    if (cacheFailed) {
      // Postgres says revoked, but the cached entry still authenticates until
      // it expires, so this is not done.
      json(res, 503, {
        success: false,
        error:
          'Revoked in the database, but the cache entry could not be cleared; the key may still authenticate from the cache. Retry.',
        id: result.id,
        tenant_id: result.tenantId,
        cache_cleared: false,
      });
      return true;
    }

    json(res, 200, {
      success: true,
      id: result.id,
      tenant_id: result.tenantId,
      cache_cleared: result.cacheCleared,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/deregister ────────────────────────────────────
  // Fully removes an agent and FREES ITS NAME. Distinct from revoke: revoke only
  // kills keyRegistry-backed keys and deliberately preserves the wallet→agent
  // mapping for re-provision, and it cannot reach publicly self-registered agents
  // (agentKeyStore-only, from POST /register) because they have no keyRegistry row
  // — so their names were previously unreclaimable. Deregister clears agentKeyStore
  // + walletToAgent (+ keyRegistry if present) and persists. Both name-uniqueness
  // checks (/register and /admin/provision) iterate agentKeyStore, and agents.json
  // is rewritten in full by persistAgentStore(), so the name is freed durably
  // across restarts. On-chain funds are untouched — the wallet stays a valid
  // identity (F.119). Identify by agent_id, agent_name (case-insensitive), or
  // wallet_address.
  if (pathname === '/api/holomesh/admin/deregister' && method === 'POST') {
    const body = await parseJsonBody(req);
    const agentId = (body.agent_id as string | undefined)?.trim() || '';
    const agentName = (body.agent_name as string | undefined)?.trim() || '';
    const walletAddress = (body.wallet_address as string | undefined)?.trim() || '';

    if (!agentId && !agentName && !walletAddress) {
      json(res, 400, { error: 'Provide at least one of: agent_id, agent_name, wallet_address' });
      return true;
    }

    const nameLc = agentName.toLowerCase();
    const walletLc = walletAddress.toLowerCase();

    // Matching self-registered agents (agentKeyStore keyed by apiKey).
    const agentEntries = Array.from(agentKeyStore.entries()).filter(
      ([, a]) =>
        (!!agentId && a.id === agentId) ||
        (!!nameLc && a.name.toLowerCase() === nameLc) ||
        (!!walletLc && (a.walletAddress || '').toLowerCase() === walletLc)
    );
    // Matching provisioned agents (keyRegistry keyed by key).
    const keyEntries = Array.from(keyRegistry.entries()).filter(
      ([, r]) =>
        (!!agentId && r.agentId === agentId) ||
        (!!nameLc && r.agentName.toLowerCase() === nameLc) ||
        (!!walletLc && r.walletAddress.toLowerCase() === walletLc)
    );

    const queryTokens = [
      agentId ? `id:${agentId}` : '',
      nameLc ? `name:${nameLc}` : '',
      walletLc ? `wallet:${walletLc}` : '',
    ].filter(Boolean);

    if (agentEntries.length === 0 && keyEntries.length === 0) {
      // A retry after a non-durable deregister: already removed in memory.
      // Re-attempt the save rather than answer 404.
      const unsaved = queryTokens.map((t) => unsavedDeregisters.get(t)).find(Boolean);
      if (unsaved) {
        const saved = saveKeyStores();
        const extra = { already_removed: true, removed: unsaved };
        if (!saved.durable) {
          json(res, 503, notDurableBody(saved.problem, extra));
        } else {
          for (const [t, rows] of [...unsavedDeregisters]) {
            if (rows === unsaved) unsavedDeregisters.delete(t);
          }
          json(res, 200, { success: true, durable: true, ...extra });
        }
        return true;
      }
      json(res, 404, { error: 'No matching agent found in registry' });
      return true;
    }

    // Never deregister a founder agent — that would orphan admin authentication.
    const touchesFounder =
      agentEntries.some(([, a]) => a.isFounder === true) ||
      keyEntries.some(([, r]) => r.isFounder === true);
    if (touchesFounder) {
      json(res, 403, { error: 'Refusing to deregister a founder agent' });
      return true;
    }

    for (const [key] of keyEntries) {
      if (refuseEnvHeldKey(res, key)) return true;
    }

    const removed: Array<{
      agent_id: string;
      agent_name: string;
      wallet_address: string;
      source: 'public_register' | 'key_registry';
    }> = [];

    for (const [key, a] of agentEntries) {
      agentKeyStore.delete(key);
      if (a.walletAddress) walletToAgent.delete(a.walletAddress.toLowerCase());
      removed.push({
        agent_id: a.id,
        agent_name: a.name,
        wallet_address: a.walletAddress || '',
        source: 'public_register',
      });
    }
    for (const [key, r] of keyEntries) {
      revokeKeyRecord(key);
      agentKeyStore.delete(key);
      if (r.walletAddress) walletToAgent.delete(r.walletAddress.toLowerCase());
      removed.push({
        agent_id: r.agentId,
        agent_name: r.agentName,
        wallet_address: r.walletAddress,
        source: 'key_registry',
      });
    }

    const deregisterSaved = saveKeyStores();
    const deregisterDurable = deregisterSaved.durable;

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'deregister',
      path: pathname,
      before: {
        query: {
          agent_id: agentId || undefined,
          agent_name: agentName || undefined,
          wallet_address: walletAddress || undefined,
        },
      },
      after: {
        removed_count: removed.length,
        removed: removed.map((r) => ({
          agent_id: r.agent_id,
          agent_name: r.agent_name,
          source: r.source,
        })),
        durable: deregisterDurable,
      },
    });

    if (!deregisterDurable) {
      for (const t of queryTokens) unsavedDeregisters.set(t, removed);
      json(res, 503, notDurableBody(deregisterSaved.problem, { removed_in_memory: true, removed }));
      return true;
    }

    json(res, 200, {
      success: true,
      removed_count: removed.length,
      removed,
      note: 'Agent name(s) freed. Wallet mapping cleared; on-chain funds untouched (wallet remains a valid identity, F.119). The name can now be re-registered or Trezor-provisioned.',
    });
    return true;
  }

  // ── GET /api/holomesh/admin/agents ─────────────────────────────────────────
  // Lists BOTH provisioned agents (keyRegistry, via POST /admin/provision) AND
  // publicly self-registered agents (agentKeyStore, via POST /register). The two
  // stores are disjoint — a /register agent has no keyRegistry row — so a
  // keyRegistry-only listing hid every self-registered name from the founder and
  // made them un-removable. `source` distinguishes them; `removable` flags whether
  // POST /admin/deregister may reclaim the name (founder agents are never removable).
  if (pathname === '/api/holomesh/admin/agents' && method === 'GET') {
    interface AgentRow {
      agent_id: string;
      agent_name: string;
      wallet_address: string;
      scopes?: string[];
      is_founder?: boolean;
      created_at: string;
      source: 'key_registry' | 'public_register';
      /** Ids (not values) of every key the agent holds; revoke and rotate take these. */
      key_ids?: string[];
    }
    const byAgent = new Map<string, AgentRow>();
    const keyIdsByAgent = new Map<string, string[]>();

    // Provisioned agents — dedup by agentId, latest key record wins.
    for (const record of keyRegistry.values()) {
      const ids = keyIdsByAgent.get(record.agentId) ?? [];
      ids.push(keyIdOf(record));
      keyIdsByAgent.set(record.agentId, ids);
      const existing = byAgent.get(record.agentId);
      if (!existing || record.createdAt > existing.created_at) {
        byAgent.set(record.agentId, {
          agent_id: record.agentId,
          agent_name: record.agentName,
          wallet_address: record.walletAddress,
          scopes: record.scopes,
          is_founder: record.isFounder,
          created_at: record.createdAt,
          source: 'key_registry',
        });
      }
    }

    // Publicly self-registered agents — only present in agentKeyStore.
    for (const agent of agentKeyStore.values()) {
      if (byAgent.has(agent.id)) continue;
      byAgent.set(agent.id, {
        agent_id: agent.id,
        agent_name: agent.name,
        wallet_address: agent.walletAddress || '',
        is_founder: agent.isFounder,
        created_at: agent.createdAt,
        source: 'public_register',
      });
    }

    const agents = Array.from(byAgent.values()).map((a) => ({
      ...a,
      ...(a.source === 'key_registry' ? { key_ids: keyIdsByAgent.get(a.agent_id) ?? [] } : {}),
      removable: a.is_founder !== true,
      // Tokens are never held in this map; nothing to redact.
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
    await reloadTeam(teamId);
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
    await persistTeamDurable(teamId);

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

  // ── POST /api/holomesh/admin/manual-failover ───────────────────────────────
  if (pathname === '/api/holomesh/admin/manual-failover' && method === 'POST') {
    const body = await parseJsonBody(req);
    const serviceId = (body.service_id as string | undefined)?.trim() ?? '';
    const targetBackend = (body.target_backend as string | undefined)?.trim() ?? '';
    const reason = (body.reason as string | undefined)?.trim();

    if (!serviceId || !targetBackend) {
      json(res, 400, { error: 'service_id and target_backend are required' });
      return true;
    }

    const before = failoverStateStore.get(serviceId) || null;
    const state = {
      serviceId,
      primaryBackend: targetBackend,
      reason,
      setAt: new Date().toISOString(),
      setBy: caller.id,
    };
    failoverStateStore.set(serviceId, state);

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'manual_failover',
      path: pathname,
      before: before ? { ...before } : null,
      after: { ...state },
    });

    json(res, 200, {
      success: true,
      service_id: serviceId,
      primary_backend: targetBackend,
      reason,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/scaling-override ──────────────────────────────
  if (pathname === '/api/holomesh/admin/scaling-override' && method === 'POST') {
    const body = await parseJsonBody(req);
    const serviceId = (body.service_id as string | undefined)?.trim() ?? '';
    const replicasRaw = body.replicas;
    const reason = (body.reason as string | undefined)?.trim();

    if (!serviceId) {
      json(res, 400, { error: 'service_id is required' });
      return true;
    }
    const replicas =
      typeof replicasRaw === 'number'
        ? replicasRaw
        : typeof replicasRaw === 'string' && replicasRaw.trim() !== ''
          ? Number(replicasRaw)
          : NaN;
    if (!Number.isInteger(replicas) || replicas < 0 || replicas > 1000) {
      json(res, 400, { error: 'replicas must be an integer between 0 and 1000' });
      return true;
    }

    const before = scalingOverrideStore.get(serviceId) || null;
    const override = {
      serviceId,
      replicas,
      reason,
      setAt: new Date().toISOString(),
      setBy: caller.id,
    };
    scalingOverrideStore.set(serviceId, override);

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'scaling_override',
      path: pathname,
      before: before ? { ...before } : null,
      after: { ...override },
    });

    json(res, 200, {
      success: true,
      service_id: serviceId,
      replicas,
      reason,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/transfer-ownership ────────────────────────────
  if (pathname === '/api/holomesh/admin/transfer-ownership' && method === 'POST') {
    const body = await parseJsonBody(req);
    const teamId = (body.team_id as string | undefined)?.trim() ?? '';
    const newOwnerAgentId = (body.new_owner_agent_id as string | undefined)?.trim() ?? '';

    if (!teamId || !newOwnerAgentId) {
      json(res, 400, { error: 'team_id and new_owner_agent_id are required' });
      return true;
    }

    await reloadTeam(teamId);
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }

    const oldOwnerId = team.ownerId;
    const oldOwnerName = team.ownerName;

    // Prevent no-op transfer
    if (oldOwnerId === newOwnerAgentId) {
      json(res, 409, { error: 'new_owner_agent_id is already the team owner' });
      return true;
    }

    // Resolve new owner from team members or key registry
    let newOwnerName = '';
    const newOwnerMember = team.members.find((m) => m.agentId === newOwnerAgentId);
    if (newOwnerMember) {
      newOwnerName = newOwnerMember.agentName;
    } else {
      // Fallback: look up in agent key store
      const agentRecord = Array.from(agentKeyStore.values()).find((a) => a.id === newOwnerAgentId);
      if (agentRecord) {
        newOwnerName = agentRecord.name;
      } else {
        json(res, 404, { error: 'new_owner_agent_id not found in team members or agent registry' });
        return true;
      }
    }

    const before = {
      owner_id: oldOwnerId,
      owner_name: oldOwnerName,
      members: team.members.map((m) => ({ agent_id: m.agentId, role: m.role })),
    };

    // Update team ownership
    team.ownerId = newOwnerAgentId;
    team.ownerName = newOwnerName;

    // Update member roles: old owner → member, new owner → owner
    for (const member of team.members) {
      if (member.agentId === oldOwnerId && member.role === 'owner') {
        member.role = 'member';
      }
      if (member.agentId === newOwnerAgentId) {
        member.role = 'owner';
      }
    }

    // If new owner was not in members array (edge case), add them
    if (!team.members.some((m) => m.agentId === newOwnerAgentId)) {
      team.members.push({
        agentId: newOwnerAgentId,
        agentName: newOwnerName,
        role: 'owner',
        joinedAt: new Date().toISOString(),
      });
    }

    await persistTeamDurable(teamId);

    recordAdminOperation({
      actor: {
        agentId: caller.id,
        agentName: caller.name,
        wallet: caller.wallet,
      },
      action: 'transfer_ownership',
      path: pathname,
      before,
      after: {
        owner_id: newOwnerAgentId,
        owner_name: newOwnerName,
        members: team.members.map((m) => ({ agent_id: m.agentId, role: m.role })),
      },
    });

    json(res, 200, {
      success: true,
      team_id: teamId,
      old_owner: { agent_id: oldOwnerId, name: oldOwnerName },
      new_owner: { agent_id: newOwnerAgentId, name: newOwnerName },
    });
    return true;
  }

  return false;
}
