import type http from 'http';
import {
  teamStore,
  teamPresenceStore,
  teamMessageStore,
  teamFeedStore,
  agentKeyStore,
  persistTeamStore
} from '../state';
import {
  json,
  parseJsonBody,
  parseQuery,
  extractParam,
  getTeamMember,
  hasTeamPermission,
  requireTeamAccess,
  pruneStalePresence
} from '../utils';
import { requireAuth } from '../auth-utils';
import { broadcastToTeam } from '../team-room';
import { extractAndVerifySigning } from '../identity/signing-middleware';
import {
  ROOM_PRESETS,
  claimTask,
  completeTask,
  blockTask,
  reopenTask,
  delegateTask,
  deleteTask,
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
import type { Team, TeamPresenceEntry, TeamMessage, TeamFeedItem, RegisteredAgent } from '../types';

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
  //
  // Counter invariant (task_1776986320321_xvv6): `done_count` here MUST read
  // the same `team.doneLog.length` that `/board/done` below returns as
  // `count`. They are the same number derived from the same in-memory
  // array — do not introduce a separate cache, aggregate, or write-time
  // counter. Any divergence observed in prod is a deploy / replication
  // concern (stale snapshot on one replica), not a code concern.
  // Regression: http-routes.test.ts → counter-parity test.
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

  // GET /api/holomesh/team/:id/board/done — done log (peer verification / F.022)
  //
  // Pagination: returns entries newest-first. `limit` caps per-page size
  // (default 30, hard max 200 to keep responses under response-size guards).
  // `offset` walks backward through history — offset=0 is the newest entry,
  // offset=N skips the N newest. Response includes `returned`/`offset`/
  // `hasMore` so clients can page without re-deriving bounds. `count` is
  // the total log size (unchanged for backward compat).
  //
  // Bug fix (task_1776981805111_pllv): prior implementation had no offset,
  // so a team with 753+ done entries was forever limited to the last 200 —
  // no way to enumerate the full history. Pagination closes that gap.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/done$/) && method === 'GET') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;
    const log = team.doneLog || [];
    const total = log.length;
    const q = parseQuery(url);

    const rawLimit = parseInt(String(q.get('limit') || '30'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(1000, Math.max(1, rawLimit)) : 30;

    const rawOffset = parseInt(String(q.get('offset') || '0'), 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    // log is oldest-first append order; recency rank k is at log[total-1-k].
    // We want ranks [offset .. offset+limit).
    const startRank = offset;
    const endRank = Math.min(total, offset + limit);
    const entries: typeof log = [];
    for (let k = startRank; k < endRank; k++) {
      entries.push(log[total - 1 - k]);
    }

    json(res, 200, {
      success: true,
      teamId,
      count: total,
      returned: entries.length,
      offset,
      limit,
      hasMore: endRank < total,
      entries,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board — Add tasks
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url, 'board:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody);
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const tasksBody = body.tasks || body;
    if (!tasksBody || !Array.isArray(tasksBody) || tasksBody.length === 0) {
      json(res, 400, { error: 'Expected an array of tasks' });
      return true;
    }

    if (!team.taskBoard) team.taskBoard = [];
    if (!team.doneLog) team.doneLog = [];

    // Dedup mode: caller can opt into exact-string title matching to escape the
    // legacy 60-char prefix collapse that silently drops semantically distinct
    // tasks (e.g. "Execute Research Cycle 9 - Affective Causality" vs cycle 12).
    // Accept from `?dedup=exact` query OR `body.dedup` field. Defaults to
    // 'normalized' (legacy). Closes task_1776981805111_4fg3 [BOARD-BUG].
    const dedupParam = (
      new URL(url, 'http://localhost').searchParams.get('dedup') ??
      body.dedup ??
      ''
    ).toString().toLowerCase();
    const dedupMode: 'exact' | 'normalized' = dedupParam === 'exact' ? 'exact' : 'normalized';

    // Add tasks (framework signature: board, doneLog, tasks)
    // doneLog types differ between mcp-server (TeamTask[]) and framework (DoneLogEntry[])
    // but only .title is used for dedup, which both have
    const result = addTasksToBoard(team.taskBoard, (team.doneLog || []) as any, tasksBody, { dedupMode });
    const normalizationWarnings = Array.isArray((result as any).warnings)
      ? (result as any).warnings
      : (tasksBody as Array<{ title?: string; description?: string }>).flatMap((t) => {
          const raw = String(t.description || '');
          // Kept in sync with board-ops.ts:300 cap (W.085 fix raised 1000→2000).
          if (raw.length <= 2000) return [];
          return [{
            title: String(t.title || '').slice(0, 200),
            reason: 'description_truncated' as const,
            originalLength: raw.length,
            keptLength: 2000,
          }];
        });
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
    // `dedupMode` echoed so callers know which mode was applied (helps debug silent Added:0).
    json(res, 201, {
      success: true,
      added: result.added.length,
      tasks: result.added,
      skipped: result.skipped,
      warnings: normalizationWarnings,
      dedupMode,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board/scout — Scout tasks
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/scout$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url, 'board:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody);
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const todoContent = body.todo_content as string;

    if (!team.taskBoard) team.taskBoard = [];

    let addedTasks: any[] = [];
    let skippedTasks: { title: string; reason: 'duplicate' | 'empty_title' }[] = [];
    let warnings: {
      title: string;
      reason: 'description_truncated';
      originalLength: number;
      keptLength: number;
    }[] = [];
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
        const scopedTasksBody = tasksBody.slice(0, body.max_tasks || 50);
        const result = addTasksToBoard(team.taskBoard, (team.doneLog || []) as any, scopedTasksBody);
        addedTasks = result.added;
        skippedTasks = result.skipped;
        warnings = Array.isArray((result as any).warnings)
          ? (result as any).warnings
          : scopedTasksBody.flatMap((t: { title?: string; description?: string }) => {
              const raw = String(t.description || '');
              if (raw.length <= 1000) return [];
              return [{
                title: String(t.title || '').slice(0, 200),
                reason: 'description_truncated' as const,
                originalLength: raw.length,
                keptLength: 1000,
              }];
            });
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
      warnings = Array.isArray((result as any).warnings) ? (result as any).warnings : [];
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

    json(res, 201, {
      success: true,
      tasks_added: addedTasks.length,
      tasks: addedTasks,
      skipped: skippedTasks,
      warnings,
    });
    return true;
  }

  // PATCH /api/holomesh/team/:id/board/:taskId — claim/done/block/reopen/delegate/delete
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/[^/]+$/) && method === 'PATCH') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;
    if (!team.taskBoard) team.taskBoard = [];
    if (!team.doneLog) team.doneLog = [];

    const parts = pathname.split('/');
    const taskId = parts[parts.length - 1];
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody);
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const rawAction = body.action as string;
    // Alias normalization: `remove` and `archive` map to `delete` so the
    // known-404 responses from `delete|remove|archive` in W.073 all resolve.
    // `cancel`/`skip`/`drop` intentionally stay unknown — their semantics
    // (reopen vs delete vs defer) are ambiguous and picking wrong silently
    // loses work. An explicit client choice is safer.
    const action = (rawAction === 'remove' || rawAction === 'archive') ? 'delete' : rawAction;

    let result: any;
    let eventType: string = '';

    // Surface-attribution tags. With W.087 vertex C (01424bcd6) + vertex B
    // (51558fa) live, `caller.surfaceTag` is the server-stored snapshot from
    // /register time and is the authoritative source. The caller is also the
    // actor for claim/done/delete — the tag must describe their own surface,
    // not an arbitrary string chosen per-request.
    //
    // Body-declared tags are fallback-only for legacy agents that registered
    // before `surfaceTag` was persisted on `RegisteredAgent`. A caller with a
    // server-stored surfaceTag CANNOT override it via body — defense-in-depth
    // against surface impersonation in the done-log / board UI.
    //
    // Still advisory in the sense that caller.id/caller.name remain the
    // authoritative identity; what changed is that the tag field can no
    // longer be arbitrarily reassigned per-request.
    const claimedByTag = caller.surfaceTag
      ?? (typeof body.claimedByTag === 'string' ? body.claimedByTag : undefined);
    const completedByTag = caller.surfaceTag
      ?? (typeof body.completedByTag === 'string' ? body.completedByTag : undefined);
    const deleterTag = caller.surfaceTag
      ?? (typeof body.deleterTag === 'string' ? body.deleterTag : undefined);
    const deleteReason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined;

    switch (action) {
      case 'claim':
        result = claimTask(team.taskBoard, taskId, caller.id, caller.name, claimedByTag);
        eventType = 'board:claimed';
        break;
      case 'done': {
        const wrap = completeTask(team.taskBoard, taskId, caller.name, {
          summary: body.summary as string,
          commit: body.commit as string | undefined,
          completedByTag,
        });
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
      case 'delete': {
        // Owner-only gate: we don't track task creator explicitly (only the
        // `source` string), so "creator or owner" collapses to owner-only.
        // `config:write` is owner-only per TEAM_ROLE_PERMISSIONS (types.ts:523)
        // plus adminRoom members inherit full permissions.
        if (!hasTeamPermission(team, caller.id, 'config:write')) {
          json(res, 403, { error: 'Permission denied: only team owners can delete tasks (config:write required)' });
          return true;
        }
        const wrap = deleteTask(team.taskBoard, taskId, caller.id, caller.name, {
          deleterTag,
          reason: deleteReason,
        });
        result = wrap.result;
        team.taskBoard = wrap.updatedBoard;
        // Tombstone the deletion in doneLog so /board/done preserves history.
        if (result.tombstone) team.doneLog.push(result.tombstone);
        eventType = 'board:deleted';
        break;
      }
      case 'update': {
        // Permission gate: owner only (config:write). Task creator would be
        // preferable but createdBy is not persisted on BoardTask; owner gate is
        // the safe fallback until a createdBy field is added.
        if (!hasTeamPermission(team, caller.id, 'config:write')) {
          json(res, 403, { error: 'Permission denied: only team owners can update tasks (config:write required)' });
          return true;
        }
        const taskIndex = (team.taskBoard as any[]).findIndex((t: any) => t.id === taskId);
        if (taskIndex === -1) {
          json(res, 404, { error: 'Task not found' });
          return true;
        }
        const task: any = team.taskBoard[taskIndex];
        const updates: Record<string, unknown> = {};
        if (typeof body.title === 'string') {
          updates.title = body.title.slice(0, 500);
        }
        if (typeof body.description === 'string') {
          // Preserve previous description for audit before overwriting.
          if (task.description !== body.description) {
            updates._prevDescription = String(task.description ?? '').slice(0, 500) + (String(task.description ?? '').length > 500 ? '…' : '');
          }
          updates.description = body.description.slice(0, 2000);
        }
        if (body.priority !== undefined) {
          updates.priority = body.priority;
        }
        if (Array.isArray(body.tags)) {
          updates.tags = (body.tags as unknown[]).slice(0, 50).map((t) => String(t).slice(0, 100));
        }
        if (Object.keys(updates).filter((k) => k !== '_prevDescription').length === 0) {
          json(res, 400, { error: 'No updatable fields provided: supply title, description, priority, and/or tags' });
          return true;
        }
        updates.updatedAt = new Date().toISOString();
        updates.updatedBy = caller.name;
        Object.assign(task, updates);
        result = { success: true, task };
        eventType = 'board:updated';
        break;
      }
      default:
        json(res, 400, { error: 'Unknown action — supported: claim|done|block|reopen|delegate|delete|update (aliases: remove, archive → delete)' });
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
      if (claimedByTag) (payload.claimedAs as Record<string, unknown>).surfaceTag = claimedByTag;
    }
    if (action === 'done' && completedByTag) {
      payload.completedAs = { id: caller.id, name: caller.name, surfaceTag: completedByTag };
    }
    if (action === 'delete') {
      payload.deleted = true;
      payload.deletedAs = { id: caller.id, name: caller.name };
      if (deleterTag) (payload.deletedAs as Record<string, unknown>).surfaceTag = deleterTag;
      if (deleteReason) payload.reason = deleteReason;
      if (result.tombstone) payload.tombstone = result.tombstone;
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

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody);
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    let presenceMap = teamPresenceStore.get(teamId);
    if (!presenceMap) {
      presenceMap = new Map();
      teamPresenceStore.set(teamId, presenceMap);
    }

    const isFirst = !presenceMap.has(caller.id);
    // Carry wallet + x402 verification + surface tag on every heartbeat so
    // GET /presence distinguishes per-surface x402 seats.
    //
    // Surface tag precedence (defense-in-depth against spoofing):
    //   1. caller.surfaceTag   — server-stored, snapshotted at /register
    //   2. teamMember.surfaceTag — snapshot from the join record
    //   3. body.surface_tag    — only for legacy agents that predate (1)
    //
    // Once an agent is registered with a surface, subsequent heartbeats
    // cannot reassign it via request body. Body is fallback-only.
    const teamMember = team.members.find((m) => m.agentId === caller.id);
    const declaredSurfaceTag = typeof body.surface_tag === 'string'
      ? (body.surface_tag as string)
      : undefined;
    const resolvedSurfaceTag = caller.surfaceTag
      ?? teamMember?.surfaceTag
      ?? declaredSurfaceTag;
    const entry: TeamPresenceEntry = {
      agentId: caller.id,
      agentName: caller.name,
      ideType: body.ide_type as string,
      status: (body.status as any) || 'active',
      lastHeartbeat: new Date().toISOString(),
      walletAddress: caller.walletAddress,
      x402Verified: caller.x402Verified === true,
      surfaceTag: resolvedSurfaceTag,
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

  // GET /api/holomesh/team/:id/members — W.087 vertex C
  //
  // Membership listing with wallet / x402 / surface attribution. Ships as the
  // canonical "who is on this team" endpoint so agents can disambiguate
  // per-surface x402 seats from the shared founder key (which was the
  // blind-spot that drove F.022 and S.IDENT Dim-1 open for weeks).
  //
  // Response fields per member (all required keys present even when empty):
  //   - agentId, agentName, role, joinedAt — always set (from TeamMember)
  //   - walletAddress — backfilled from agentKeyStore when the TeamMember
  //     snapshot is missing it (legacy members joined before types.ts shipped
  //     these fields in this commit)
  //   - x402Verified — ditto (inferred from RegisteredAgent.x402Verified)
  //   - surfaceTag — from TeamMember snapshot or, when absent, the last
  //     observed presence entry's surfaceTag (heartbeats declare this)
  //
  // Auth: team membership (same gate as GET /presence). Non-members 403.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/members$/) && method === 'GET') {
    const access = requireTeamAccess(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;

    const presenceMap = teamPresenceStore.get(teamId);

    // Build an agentId → RegisteredAgent backfill index (by id, not apiKey).
    const byAgentId = new Map<string, RegisteredAgent>();
    for (const a of agentKeyStore.values()) {
      byAgentId.set(a.id, a);
    }

    const members = team.members.map((m) => {
      const registered = byAgentId.get(m.agentId);
      const presence = presenceMap?.get(m.agentId);
      const walletAddress = m.walletAddress ?? registered?.walletAddress;
      const x402Verified = m.x402Verified ?? (registered?.x402Verified === true);
      const surfaceTag = m.surfaceTag ?? presence?.surfaceTag;
      return {
        agentId: m.agentId,
        agentName: m.agentName,
        role: m.role,
        joinedAt: m.joinedAt,
        walletAddress,
        x402Verified,
        surfaceTag,
        online: Boolean(presence),
        lastHeartbeat: presence?.lastHeartbeat,
      };
    });

    json(res, 200, {
      success: true,
      teamId,
      count: members.length,
      members,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/message
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/message$/) && method === 'POST') {
    const access = requireTeamAccess(req, res, url, 'messages:write');
    if (!access) return true;
    const { caller, teamId } = access;

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody);
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
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
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody);
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
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
