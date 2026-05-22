/**
 * HoloDoor — team policy + telemetry ingest (HoloMesh HTTP).
 */

import type http from 'http';
import { json, parseJsonBody, requireTeamAccess, requireTeamAccessFresh } from '../utils';
import { holoDoorPolicyByTeam, holoDoorEventsByTeam, persistHoloDoorStore } from '../state';

const MAX_EVENTS_PER_TEAM = 5000;

function defaultPolicy(): Record<string, unknown> {
  return {
    schemaVersion: '1.1.0',
    mcpServers: { allowlist: [], blocklist: [], matchBy: 'id' },
    tools: { allowlist: [], blocklist: [], blockedCommandPatterns: [] },
    guardrails: [],
    repoRules: { pathGlobs: [] },
    // Spatial admission scopes for entities entering a HoloGate portal
    // (HoloDoor is the policy axis of HoloGate; HoloPortal consults this at
    // the threshold). Default-deny: an entrant gets read-only and no mutable
    // zones until the team policy grants more. Scope ladder is read-only <
    // mutate-zone < drive-avatar. push_state_delta intents are validated
    // against the entrant's granted scope (closes the W.204 injection surface).
    spatial: {
      defaultScope: 'read-only', // 'read-only' | 'mutate-zone' | 'drive-avatar'
      allowedScopes: ['read-only'], // scopes a portal may grant to entrants
      mutableZoneGlobs: [], // zone-id globs an entrant may mutate under 'mutate-zone'
      driveAvatar: { allow: false, maxEntities: 0 }, // 'drive-avatar' lane gate
      enforcement: { onScopeViolation: 'reject' }, // 'reject' | 'warn'
    },
    telemetry: { mode: 'local', redact: 'strict' },
    enforcement: { onViolation: 'warn', postSessionAlertOnBlock: false },
  };
}

/**
 * @returns true if handled
 */
export async function handleHoloDoorRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  // GET /api/holomesh/team/:id/holodoor/policy
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/holodoor\/policy$/) && method === 'GET') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const stored = holoDoorPolicyByTeam.get(teamId);
    const policy = stored ? { ...defaultPolicy(), ...stored } : defaultPolicy();
    json(res, 200, { success: true, teamId, policy });
    return true;
  }

  // PATCH /api/holomesh/team/:id/holodoor/policy
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/holodoor\/policy$/) && method === 'PATCH') {
    // Pattern Gamma residual fix — fresh variant reloads from postgres before
    // membership check so cross-replica writes are visible.
    const access = await requireTeamAccessFresh(req, res, url, 'config:write');
    if (!access) return true;
    const { teamId } = access;
    const body = await parseJsonBody(req);
    const next = body?.policy;
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      json(res, 400, { error: 'Expected { policy: object }' });
      return true;
    }
    // Prototype pollution guard: strip dangerous keys before storage.
    const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next)) {
      if (dangerousKeys.has(key)) continue;
      sanitized[key] = value;
    }
    holoDoorPolicyByTeam.set(teamId, sanitized);
    persistHoloDoorStore();
    json(res, 200, { success: true, teamId });
    return true;
  }

  // POST /api/holomesh/team/:id/holodoor/events
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/holodoor\/events$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const body = await parseJsonBody(req);
    const events = body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      json(res, 400, { error: 'Expected { events: [...] }' });
      return true;
    }
    const existing = holoDoorEventsByTeam.get(teamId) || [];
    const merged = existing.concat(events as Record<string, unknown>[]);
    const tail = merged.slice(-MAX_EVENTS_PER_TEAM);
    holoDoorEventsByTeam.set(teamId, tail);
    persistHoloDoorStore();
    json(res, 200, { success: true, teamId, accepted: events.length, total: tail.length });
    return true;
  }

  return false;
}
