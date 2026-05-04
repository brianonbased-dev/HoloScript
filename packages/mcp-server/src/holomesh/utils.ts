import type http from 'http';
import type { Team, TeamMember, TeamRole, RegisteredAgent } from './types';
import { TEAM_ROLE_PERMISSIONS, PRESENCE_TTL_MS } from './types';
import { teamStore, teamPresenceStore, teamMessageStore, reloadTeam } from './state';
import { resolveRequestingAgent } from './auth-utils';

// ── HTTP Response Helpers ─────────────────────────────────────────────────────

export function json(res: http.ServerResponse, status: number, data: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export function parseQuery(url: string): URLSearchParams {
  const parts = url.split('?');
  return new URLSearchParams(parts[1] || '');
}

export async function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) {
        // 2MB limit
        resolve({});
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        // Check if it's form-urlencoded fallback
        const q = new URLSearchParams(body);
        const obj: any = {};
        for (const [k, v] of q.entries()) obj[k] = v;
        resolve(obj);
      }
    });
  });
}

export function extractParam(url: string, prefix: string): string {
  const path = url.split('?')[0];
  if (!path.startsWith(prefix)) return '';
  return path.slice(prefix.length).split('/')[0];
}

// ── Permission Helpers ────────────────────────────────────────────────────────

export function getTeamMember(team: Team, agentId: string): TeamMember | undefined {
  return team.members.find((m) => m.agentId === agentId);
}

export function hasTeamPermission(team: Team, agentId: string, permission: string): boolean {
  if (agentId === 'system') return true;
  const member = getTeamMember(team, agentId);
  if (!member) return false;
  // Admin rooms: every joined member carries full permissions.
  if (team.adminRoom === true) return true;
  return (TEAM_ROLE_PERMISSIONS[member.role as keyof typeof TEAM_ROLE_PERMISSIONS] ?? []).includes(permission);
}

export function getTeamWorkspaceId(teamId: string): string {
  return `team:${teamId}`;
}

/**
 * Standard guard for team routes.
 * Checks if the agent is a member and has optional specific permission.
 */
export function requireTeamAccess(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  permission?: string
): { teamId: string; caller: RegisteredAgent } | null {
  const caller = resolveRequestingAgent(req);
  if (!caller.authenticated || !caller.agent) {
    json(res, 401, { error: 'Authentication required' });
    return null;
  }

  const teamId = extractParam(url, '/api/holomesh/team/');
  const team = teamStore.get(teamId);
  if (!team) {
    json(res, 404, { error: 'Team not found' });
    return null;
  }

  // Check membership using both key-registry agentId and registered-agent id
  // (they can differ when the key registry seeds a founder alias like "agent_founder"
  //  but the agent store has a timestamped id like "agent_1776058303684_3p3i")
  const agentId = caller.agent?.id;
  const member = getTeamMember(team, caller.id) || (agentId && agentId !== caller.id ? getTeamMember(team, agentId) : undefined);
  const effectiveId = member?.agentId || caller.id;
  // System agent (IDE/copilot) intrinsically bypasses membership checks
  if (!member && caller.id !== 'system') {
    json(res, 403, { error: 'Not a member of this team' });
    return null;
  }

  if (permission && !hasTeamPermission(team, effectiveId, permission)) {
    json(res, 403, { error: `Permission denied: ${permission}` });
    return null;
  }

  return { teamId, caller: caller.agent };
}

/**
 * Async variant of `requireTeamAccess` that reloads the team from the shared
 * backend (PostgreSQL) BEFORE the membership check. Use on mutation handlers
 * (POST /board, POST /knowledge, etc.) where a recent /join from a peer
 * replica may not yet have propagated to this replica's in-memory teamStore.
 *
 * Pattern Gamma residual: `/join` does `await reloadTeam` then `members.push`
 * + `persistTeamStore` (postgres-backed). But `requireTeamAccess` is sync and
 * reads `teamStore.get(teamId)` directly, so a write that hit replica A is
 * invisible to replica B until B's in-memory cache reloads. Symptom: caller
 * just /joined, /me on a different replica shows teams.len:0, and POST /board
 * returns 403 "Not a member of this team". Reloading inside the guard makes
 * the membership read see postgres-truth on every call, eliminating the
 * cross-replica visibility gap on the membership-check path.
 *
 * Cost: one postgres roundtrip per mutating request. Acceptable on writes;
 * read paths should keep using the sync `requireTeamAccess` for fast-path.
 */
export async function requireTeamAccessFresh(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  permission?: string
): Promise<{ teamId: string; caller: RegisteredAgent } | null> {
  const teamId = extractParam(url, '/api/holomesh/team/');
  if (teamId) {
    await reloadTeam(teamId);
  }
  return requireTeamAccess(req, res, url, permission);
}

/**
 * Cleanup offline agents and reopen their claimed tasks.
 */
export function pruneStalePresence(teamId: string): void {
  const presenceMap = teamPresenceStore.get(teamId);
  if (!presenceMap) return;
  
  const now = Date.now();
  const deadAgentIds: string[] = [];

  for (const [agentId, entry] of presenceMap) {
    if (now - new Date(entry.lastHeartbeat).getTime() > PRESENCE_TTL_MS) {
      presenceMap.delete(agentId);
      deadAgentIds.push(agentId);
    }
  }

  if (deadAgentIds.length > 0) {
    const team = teamStore.get(teamId);
    if (team?.taskBoard) {
      for (const task of team.taskBoard) {
        if (task.status === 'claimed' && task.claimedBy && deadAgentIds.includes(task.claimedBy)) {
          task.status = 'open';
          const name = task.claimedByName || task.claimedBy;
          task.claimedBy = undefined;
          task.claimedByName = undefined;
          
          // Log to team chat
          const messages = teamMessageStore.get(teamId) || [];
          messages.push({
            id: `msg_sys_${Date.now()}`,
            teamId,
            fromAgentId: 'system',
            fromAgentName: 'System',
            content: `Task "${task.title}" reopened: ${name} went offline.`,
            messageType: 'text',
            createdAt: new Date().toISOString()
          });
          teamMessageStore.set(teamId, messages.slice(-500));
        }
      }
    }
  }
}
