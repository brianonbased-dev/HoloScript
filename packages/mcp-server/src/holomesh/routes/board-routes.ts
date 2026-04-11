import type http from 'http';
import { 
  teamStore, 
  teamPresenceStore,
  teamMessageStore,
  persistTeamStore 
} from '../state';
import { 
  json, 
  parseJsonBody, 
  extractParam, 
  getTeamMember, 
  hasTeamPermission,
  requireTeamAccess,
  pruneStalePresence
} from '../utils';
import { requireAuth } from '../auth-utils';
import { broadcastToTeam } from '../team-room';
import {
  ROOM_PRESETS,
  claimTask,
  completeTask,
  blockTask,
  reopenTask,
  delegateTask,
  auditDoneLog,
  createSuggestion,
  voteSuggestion,
  promoteSuggestion,
  dismissSuggestion,
  normalizeTitle,
  generateTaskId,
  type TeamTask,
  type SlotRole,
  type SuggestionCategory
} from '@holoscript/framework';
import type { Team, TeamPresenceEntry, TeamMessage } from '../types';

/**
 * Handle all board, task, and presence routes for HoloMesh teams.
 */
export async function handleBoardRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  // GET /api/holomesh/team/:id/board
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board$/) && method === 'GET') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;

    json(res, 200, {
      success: true,
      teamId,
      name: team.name,
      tasks: team.taskBoard || [],
      done_count: team.doneLog?.length || 0,
      mode: team.mode || 'general',
      objective: team.roomConfig?.objective || '',
    });
    return true;
  }

  // PATCH /api/holomesh/team/:id/board/:taskId — claim/done/block/reopen
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/[^/]+$/) && method === 'PATCH') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;
    if (!team.taskBoard) team.taskBoard = [];
    if (!team.doneLog) team.doneLog = [];

    const parts = pathname.split('/');
    const taskId = parts[parts.length - 1];
    const body = await parseJsonBody(req);
    const action = body.action as string;

    let result: any;
    let eventType: string = '';

    switch (action) {
      case 'claim':
        result = claimTask(team.taskBoard, taskId, caller.id, caller.name);
        eventType = 'board:claimed';
        break;
      case 'done': {
        const wrap = completeTask(team.taskBoard, taskId, caller.name, { summary: body.summary as string });
        result = wrap.result;
        team.taskBoard = wrap.updatedBoard;
        if (result.doneEntry) team.doneLog.push(result.doneEntry);
        eventType = 'board:completed';
        break;
      }
      case 'block':
        result = blockTask(team.taskBoard, taskId);
        eventType = 'board:blocked';
        break;
      case 'reopen':
        result = reopenTask(team.taskBoard as any, taskId);
        eventType = 'board:reopened';
        break;
      case 'delegate': {
        const targetTeamId = body.to_team_id as string || teamId;
        const targetTeam = teamStore.get(targetTeamId);
        if (!targetTeam) {
          json(res, 404, { error: 'Target team not found' });
          return true;
        }
        if (!targetTeam.taskBoard) targetTeam.taskBoard = [];
        
        const wrap = delegateTask(team.taskBoard, targetTeam.taskBoard, taskId);
        result = wrap.result;
        team.taskBoard = wrap.updatedSource;
        targetTeam.taskBoard = wrap.updatedTarget;
        eventType = 'board:delegated';
        break;
      }
      default:
        json(res, 400, { error: 'Unknown action' });
        return true;
    }

    if (!result.success) {
      json(res, 400, { error: result.error || 'Action failed' });
      return true;
    }

    persistTeamStore();
    
    // Real-time broadcast
    broadcastToTeam(teamId, {
      type: eventType as any,
      agent: caller.name,
      data: { taskId, title: result.task?.title || taskId, agent: caller.name },
    });

    json(res, 200, { success: true, task: result.task });
    return true;
  }

  // POST /api/holomesh/team/:id/presence — Heartbeat
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/presence$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const body = await parseJsonBody(req);
    let presenceMap = teamPresenceStore.get(teamId);
    if (!presenceMap) {
      presenceMap = new Map();
      teamPresenceStore.set(teamId, presenceMap);
    }

    const isFirst = !presenceMap.has(caller.id);
    const entry: TeamPresenceEntry = {
      agentId: caller.id,
      agentName: caller.name,
      ideType: body.ide_type as string,
      status: (body.status as any) || 'active',
      lastHeartbeat: new Date().toISOString(),
    };
    presenceMap.set(caller.id, entry);

    if (isFirst) {
      broadcastToTeam(teamId, {
        type: 'presence:join',
        agent: caller.name,
        data: { agentId: caller.id, agentName: caller.name, ide: entry.ideType },
      });
    }

    pruneStalePresence(teamId);
    const online = Array.from(presenceMap.values());

    json(res, 200, { success: true, online, presence: entry });
    return true;
  }

  // POST /api/holomesh/team/:id/message
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/message$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url, 'messages:write');
    if (!access) return true;
    const { caller, teamId } = access;

    const body = await parseJsonBody(req);
    const content = body.content as string;
    if (!content) {
      json(res, 400, { error: 'Missing content' });
      return true;
    }

    const message: TeamMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      teamId,
      fromAgentId: caller.id,
      fromAgentName: caller.name,
      content,
      messageType: (body.type as any) || 'text',
      createdAt: new Date().toISOString(),
    };

    const messages = teamMessageStore.get(teamId) || [];
    messages.push(message);
    teamMessageStore.set(teamId, messages.slice(-500));
    persistTeamStore();

    broadcastToTeam(teamId, {
      type: 'message:new',
      agent: caller.name,
      data: { id: message.id, from: caller.name, content: content.slice(0, 200) },
    });

    json(res, 201, { success: true, message });
    return true;
  }

  // GET /api/holomesh/team/:id/messages
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/messages$/) && method === 'GET') {
    const access = requireTeamAccess(req, res, url, 'messages:read');
    if (!access) return true;
    const { teamId } = access;
    
    const messages = teamMessageStore.get(teamId) || [];
    json(res, 200, { success: true, messages });
    return true;
  }

  return false;
}
