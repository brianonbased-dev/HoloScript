/**
 * HoloDoor — team policy + telemetry ingest (HoloMesh HTTP).
 */

import type http from 'http';
import { json, parseJsonBody, requireTeamAccess } from '../utils';
import { holoDoorPolicyByTeam, holoDoorEventsByTeam, persistHoloDoorStore } from '../state';

const MAX_EVENTS_PER_TEAM = 5000;

function defaultPolicy(): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    mcpServers: { allowlist: [], blocklist: [], matchBy: 'id' },
    tools: { allowlist: [], blocklist: [], blockedCommandPatterns: [] },
    guardrails: [],
    repoRules: { pathGlobs: [] },
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
    const access = requireTeamAccess(req, res, url, 'config:write');
    if (!access) return true;
    const { teamId } = access;
    const body = await parseJsonBody(req);
    const next = body?.policy;
    if (!next || typeof next !== 'object') {
      json(res, 400, { error: 'Expected { policy: object }' });
      return true;
    }
    holoDoorPolicyByTeam.set(teamId, next as Record<string, unknown>);
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
