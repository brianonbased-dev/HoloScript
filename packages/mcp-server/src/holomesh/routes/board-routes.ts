import type http from 'http';
import { 
  teamStore, 
  teamPresenceStore,
  teamMessageStore,
  teamFeedStore,
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
  addTasksToBoard,
  type TeamTask,
  type SlotRole,
  type SuggestionCategory
} from '@holoscript/framework';
import type { Team, TeamPresenceEntry, TeamMessage, TeamFeedItem } from '../types';

const MAX_FEED_QUERY = 100;

function validateHologramFeedInput(hash: string, shareUrl: string): string | null {
  if (!/^[a-zA-Z0-9._-]{6,128}$/.test(hash)) {
    return 'hash must be 6–128 url-safe characters';
  }
  let u: URL;
  try {
    u = new URL(shareUrl);
  } catch {
    return 'shareUrl must be a valid URL';
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) {
    return 'shareUrl must be https (or http://localhost for dev)';
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'localhost' && !host.endsWith('holoscript.net') && !host.endsWith('railway.app')) {
    return 'shareUrl host must be holoscript.net, railway.app, or localhost';
  }
  return null;
}

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
      communicationStyle: team.roomConfig?.communicationStyle || 'task_first',
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board — Add tasks
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url, 'board:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const body = await parseJsonBody(req);
    const tasksBody = body.tasks || body;
    if (!tasksBody || !Array.isArray(tasksBody) || tasksBody.length === 0) {
      json(res, 400, { error: 'Expected an array of tasks' });
      return true;
    }

    if (!team.taskBoard) team.taskBoard = [];
    if (!team.doneLog) team.doneLog = [];

    // Add tasks (framework signature: board, doneLog, tasks)
    // doneLog types differ between mcp-server (TeamTask[]) and framework (DoneLogEntry[])
    // but only .title is used for dedup, which both have
    const result = addTasksToBoard(team.taskBoard, (team.doneLog || []) as any, tasksBody);
    team.taskBoard = result.updatedBoard;
    persistTeamStore();

    for (const task of result.added) {
      broadcastToTeam(teamId, {
        type: 'board:added' as any,
        agent: caller.name,
        data: { taskId: task.id, title: task.title, agent: caller.name },
      });
    }

    // `skipped` explains rows that did not become tasks (e.g. duplicate title vs open/done).
    json(res, 201, {
      success: true,
      added: result.added.length,
      tasks: result.added,
      skipped: result.skipped,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board/scout — Scout tasks
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/scout$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url, 'board:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const body = await parseJsonBody(req);
    const todoContent = body.todo_content as string;

    if (!team.taskBoard) team.taskBoard = [];

    let addedTasks: any[] = [];
    let skippedTasks: { title: string; reason: 'duplicate' | 'empty_title' }[] = [];
    if (todoContent && todoContent.length > 0) {
      // Mock scout from todos based on expected format
      const tasksBody = todoContent.split('\n')
        .filter(l => l.includes('TODO:') || l.includes('FIXME:'))
        .map((l, i) => ({
          title: l.substring(l.indexOf(l.includes('TODO:') ? 'TODO:' : 'FIXME:')).trim(),
          description: `Generated from source grep: \n\n${l}`,
          source: 'scout:todo-scan',
          priority: l.includes('FIXME:') ? 2 : 1
        }));
      if (tasksBody.length > 0) {
        const result = addTasksToBoard(team.taskBoard, (team.doneLog || []) as any, tasksBody.slice(0, body.max_tasks || 50));
        addedTasks = result.added;
        skippedTasks = result.skipped;
        team.taskBoard = result.updatedBoard;
      }
    } else if (team.taskBoard.length === 0) {
      // Empty board auto-hint task
      const result = addTasksToBoard(team.taskBoard, (team.doneLog || []) as any, [{
        title: 'Run /room scout to find actionable work in this repository',
        description: 'Your project board is empty. Run /room scout with todo_content populated or use it directly in terminal.',
        source: 'scout:auto-hint',
        priority: 1
      }]);
      addedTasks = result.added;
      skippedTasks = result.skipped;
      team.taskBoard = result.updatedBoard;
    }

    if (addedTasks.length > 0) {
      persistTeamStore();
      for (const task of addedTasks) {
        broadcastToTeam(teamId, {
          type: 'board:added' as any,
          agent: 'Scout',
          data: { taskId: task.id, title: task.title, agent: 'Scout' },
        });
      }
    }

    json(res, 201, { success: true, tasks_added: addedTasks.length, tasks: addedTasks, skipped: skippedTasks });
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

    // Clients must attribute claims to the authenticated agent (Bearer), not body.agentName.
    const payload: Record<string, unknown> = { success: true, task: result.task };
    if (action === 'claim') {
      payload.claimedAs = { id: caller.id, name: caller.name };
    }
    json(res, 200, payload);
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

    json(res, 200, { success: true, online, presence: entry, online_count: online.length });
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

  // GET /api/holomesh/team/:id/feed — team activity feed (hologram publishes, etc.)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/feed$/) && method === 'GET') {
    const access = requireTeamAccess(req, res, url, 'messages:read');
    if (!access) return true;
    const { teamId } = access;
    const limitParam = new URL(url, 'http://localhost').searchParams.get('limit');
    const limit = Math.min(
      MAX_FEED_QUERY,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 30 : 30)
    );
    const items = teamFeedStore.get(teamId) || [];
    const slice = items.slice(-limit);
    json(res, 200, { success: true, items: slice, count: slice.length });
    return true;
  }

  // POST /api/holomesh/team/:id/feed — append feed item (poster identity from auth only)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/feed$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url, 'messages:write');
    if (!access) return true;
    const { teamId, caller } = access;
    const body = await parseJsonBody(req);
    const kind = body.kind as string;
    if (kind !== 'hologram') {
      json(res, 400, { error: 'Only kind "hologram" is supported' });
      return true;
    }
    const posterIdBody = typeof body.posterAgentId === 'string' ? body.posterAgentId.trim() : '';
    if (posterIdBody && posterIdBody !== caller.id) {
      json(res, 403, { error: 'posterAgentId must match authenticated agent' });
      return true;
    }
    const hash = typeof body.hash === 'string' ? body.hash.trim() : '';
    const shareUrl = typeof body.shareUrl === 'string' ? body.shareUrl.trim() : '';
    const err = validateHologramFeedInput(hash, shareUrl);
    if (err) {
      json(res, 400, { error: err });
      return true;
    }
    const item: TeamFeedItem = {
      id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      teamId,
      kind: 'hologram',
      posterAgentId: caller.id,
      posterAgentName: caller.name,
      hash,
      shareUrl,
      createdAt: new Date().toISOString(),
    };
    const list = teamFeedStore.get(teamId) || [];
    list.push(item);
    const cap = 200;
    const trimmed = list.length > cap ? list.slice(-cap) : list;
    teamFeedStore.set(teamId, trimmed);
    persistTeamStore();

    broadcastToTeam(teamId, {
      type: 'feed:hologram' as any,
      agent: caller.name,
      data: { id: item.id, hash, shareUrl, posterAgentId: caller.id },
    });

    json(res, 201, { success: true, item });
    return true;
  }

  return false;
}
