import type http from 'http';
import { 
  teamStore, 
  bountySubmissionStore, 
  bountyMiniGameStore, 
  persistTeamStore 
} from '../state';
import { 
  json, 
  parseQuery, 
  parseJsonBody, 
  extractParam, 
  getTeamMember, 
  hasTeamPermission 
} from '../utils';
import { requireAuth } from '../auth-utils';
import { broadcastToRoom, handleTeamRoomConnection } from '../team-room';
import { 
  BountyManager, 
  generateTaskId,
  type Bounty, 
  type BountyCurrency, 
  type CompletionProof,
  type TeamTask
} from '@holoscript/framework';
import type { Team, StoredBountySubmission, StoredBountyMiniGame } from '../types';

/**
 * Handle all bounty-related routes for HoloMesh.
 */
export async function handleBountyRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  // GET /api/holomesh/bounties — Aggregated bounty feed (optionally by team or status)
  if (pathname === '/api/holomesh/bounties' && method === 'GET') {
    const q = parseQuery(url);
    const teamId = q.get('teamId') || undefined;
    const status = q.get('status');

    const bounties: Bounty[] = [];
    if (teamId) {
      const team = teamStore.get(teamId);
      if (team?.bounties) {
        bounties.push(...(team.bounties as BountyManager).list());
      }
    } else {
      for (const team of teamStore.values()) {
        if (team.bounties) {
          bounties.push(...(team.bounties as BountyManager).list());
        }
      }
    }

    const filtered = status ? bounties.filter((b) => b.status === status) : bounties;
    json(res, 200, { success: true, bounties: filtered, count: filtered.length, teamId, status });
    return true;
  }

  // POST /api/holomesh/bounties — Create a bounty
  if (pathname === '/api/holomesh/bounties' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const teamId = (body.teamId as string | undefined)?.trim();
    if (!teamId) {
      json(res, 400, { error: 'Missing teamId' });
      return true;
    }

    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }
    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }

    if (!team.taskBoard) team.taskBoard = [];
    if (!team.bounties) team.bounties = new BountyManager();

    let taskId = (body.taskId as string | undefined)?.trim();
    let createdTask: TeamTask | undefined;

    if (!taskId) {
      const problem = (body.problem as string | undefined)?.trim();
      if (!problem) {
        json(res, 400, { error: 'Missing taskId or problem' });
        return true;
      }
      taskId = generateTaskId(problem, 'manual');
      createdTask = {
        id: taskId,
        title: problem,
        description: (body.description as string | undefined) || '',
        status: 'open',
        source: 'manual',
        priority: ((body.priority as TeamTask['priority']) || 'P3'),
        createdAt: new Date().toISOString(),
      };
      team.taskBoard.push(createdTask);
    }

    const task = team.taskBoard.find((t) => t.id === taskId);
    if (!task) {
      json(res, 404, { error: 'Task not found for bounty creation' });
      return true;
    }

    const amount = Number(body.amount);
    const currency = body.currency as BountyCurrency;
    if (!Number.isFinite(amount) || amount <= 0 || !currency) {
      json(res, 400, { error: 'Missing or invalid amount/currency' });
      return true;
    }

    const bounty = team.bounties.createBounty(
      task.id,
      { amount, currency },
      caller.name,
      body.deadline ? Number(body.deadline) : undefined,
    );

    persistTeamStore();

    broadcastToTeam(teamId, {
      type: 'bounty:created',
      agent: caller.name,
      data: { bountyId: bounty.id, taskId: task.id, reward: bounty.reward, title: task.title },
    });

    json(res, 201, { success: true, teamId, task, createdTask, bounty });
    return true;
  }

  // POST /api/holomesh/bounties/:id/claim
  if (pathname.match(/^\/api\/holomesh\/bounties\/[^/]+\/claim$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const bountyId = extractParam(url, '/api/holomesh/bounties/').replace('/claim', '');
    
    // Locate bounty across teams
    let team: Team | undefined;
    for (const t of teamStore.values()) {
      if (t.bounties?.getBounty(bountyId)) {
        team = t;
        break;
      }
    }

    if (!team || !team.bounties) {
      json(res, 404, { error: 'Bounty not found' });
      return true;
    }

    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this bounty team' });
      return true;
    }

    const result = team.bounties.claimBounty(bountyId, caller.id);
    if (!result.success) {
      json(res, 400, { error: result.error || 'Claim failed' });
      return true;
    }

    persistTeamStore();
    json(res, 200, { success: true, message: 'Bounty claimed' });
    return true;
  }

  // POST /api/holomesh/bounties/:id/submit
  if (pathname.match(/^\/api\/holomesh\/bounties\/[^/]+\/submit$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const bountyId = extractParam(url, '/api/holomesh/bounties/').replace('/submit', '');
    const body = await parseJsonBody(req);
    const solution = (body.solution as string)?.trim();
    const proof = (body.proof as string | undefined)?.trim();
    if (!solution) {
      json(res, 400, { error: 'Missing solution' });
      return true;
    }

    let team: Team | undefined;
    let bounty: Bounty | undefined;
    for (const t of teamStore.values()) {
      const found = t.bounties?.getBounty(bountyId);
      if (found) {
        team = t;
        bounty = found;
        break;
      }
    }

    if (!team || !team.bounties || !bounty) {
      json(res, 404, { error: 'Bounty not found' });
      return true;
    }

    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }

    // Auto-claim if open
    if (bounty.status === 'open') {
      team.bounties.claimBounty(bountyId, caller.id);
    } else if (bounty.claimedBy && bounty.claimedBy !== caller.id) {
      json(res, 409, { error: `Bounty already claimed by another agent` });
      return true;
    }

    const submission: StoredBountySubmission = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      teamId: team.id,
      bountyId,
      submitterId: caller.id,
      submitterName: caller.name,
      solution,
      proof,
      status: 'submitted',
      createdAt: new Date().toISOString(),
    };
    
    const list = bountySubmissionStore.get(bountyId) || [];
    list.push(submission);
    bountySubmissionStore.set(bountyId, list);
    persistTeamStore();

    broadcastToTeam(team.id, {
      type: 'bounty:submitted',
      agent: caller.name,
      data: { bountyId, submissionId: submission.id, title: bounty.taskId },
    });

    json(res, 201, { success: true, submission });
    return true;
  }

  // POST /api/holomesh/bounties/:id/payout
  if (pathname.match(/^\/api\/holomesh\/bounties\/[^/]+\/payout$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const bountyId = extractParam(url, '/api/holomesh/bounties/').replace('/payout', '');
    const body = await parseJsonBody(req);
    const submissionId = (body.submissionId as string | undefined)?.trim();

    let team: Team | undefined;
    let bounty: Bounty | undefined;
    for (const t of teamStore.values()) {
      const found = t.bounties?.getBounty(bountyId);
      if (found) {
        team = t;
        bounty = found;
        break;
      }
    }

    if (!team || !team.bounties || !bounty) {
      json(res, 404, { error: 'Bounty not found' });
      return true;
    }

    const canApprove = bounty.createdBy === caller.name || hasTeamPermission(team, caller.id, 'tasks:write');
    if (!canApprove) {
      json(res, 403, { error: 'Only bounty creator or team admins can approve payout' });
      return true;
    }

    const submissions = bountySubmissionStore.get(bountyId) || [];
    const selected = submissionId
      ? submissions.find((s) => s.id === submissionId)
      : submissions.find((s) => s.status === 'submitted');

    if (!selected) {
      json(res, 404, { error: 'No matching submission for payout' });
      return true;
    }

    const proof: CompletionProof = {
      summary: (selected.solution || '').slice(0, 500),
      evidence: selected.proof ? [selected.proof] : undefined,
    };

    const payout = team.bounties.completeBounty(bountyId, proof);
    if (!payout.success) {
      json(res, 400, { error: payout.error || 'Payout failed' });
      return true;
    }

    selected.status = 'paid';
    selected.resolvedAt = new Date().toISOString();
    selected.payoutResult = {
      amount: payout.amount,
      currency: payout.currency,
      settlement: payout.settlement,
    };
    
    // Auto-reject others
    for (const s of submissions) {
      if (s.id !== selected.id && s.status === 'submitted') {
        s.status = 'rejected';
        s.resolvedAt = new Date().toISOString();
      }
    }
    
    persistTeamStore();

    broadcastToTeam(team.id, {
      type: 'bounty:completed',
      agent: caller.name,
      data: { bountyId, amount: payout.amount, currency: payout.currency, settlement: payout.settlement },
    });

    json(res, 200, { success: true, payout, submissionId: selected.id });
    return true;
  }

  // GET /api/holomesh/bounties/minigames
  if (pathname === '/api/holomesh/bounties/minigames' && method === 'GET') {
    const q = parseQuery(url);
    const teamId = q.get('teamId') || undefined;
    const games = teamId ? (bountyMiniGameStore.get(teamId) || []) : Array.from(bountyMiniGameStore.values()).flat();
    json(res, 200, { success: true, games, count: games.length });
    return true;
  }

  // POST /api/holomesh/bounties/minigames
  if (pathname === '/api/holomesh/bounties/minigames' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const teamId = body.teamId as string;
    const bountyIds = Array.isArray(body.bountyIds) ? body.bountyIds : [];
    if (!teamId || bountyIds.length < 2) {
      json(res, 400, { error: 'Missing teamId or need at least 2 bountyIds' });
      return true;
    }

    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }

    const game: StoredBountyMiniGame = {
      id: `mg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      teamId,
      roomId: `room_mg_${Date.now()}`, // Initialize room ID
      title: body.title || 'Bounty Challenge',
      description: body.description,
      bountyIds,
      createdBy: caller.name,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    const games = bountyMiniGameStore.get(teamId) || [];
    games.push(game);
    bountyMiniGameStore.set(teamId, games);
    persistTeamStore();

    // Notify team about the new mini-game/room
    broadcastToRoom(teamId, {
      type: 'minigame:created',
      agent: caller.name,
      data: { gameId: game.id, roomId: game.roomId, title: game.title },
    });
    
    json(res, 201, { success: true, game });
    return true;
  }

  // GET /api/holomesh/bounties/minigames/:id/room/live — Join mini-game room
  if (pathname.match(/^\/api\/holomesh\/bounties\/minigames\/[^/]+\/room\/live$/) && method === 'GET') {
    const gameId = extractParam(url, '/api/holomesh/bounties/minigames/').replace('/room/live', '');
    
    let game: StoredBountyMiniGame | undefined;
    for (const teamGames of bountyMiniGameStore.values()) {
      const found = teamGames.find(g => g.id === gameId);
      if (found) {
        game = found;
        break;
      }
    }

    if (!game || !game.roomId) {
      json(res, 404, { error: 'Mini-game room not found' });
      return true;
    }

    const q = parseQuery(url);
    handleTeamRoomConnection(req, res, game.roomId, q);
    return true;
  }

  // PATCH /api/holomesh/bounties/minigames/:id/state — Update mini-game state
  if (pathname.match(/^\/api\/holomesh\/bounties\/minigames\/[^/]+\/state$/) && method === 'PATCH') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const gameId = extractParam(url, '/api/holomesh/bounties/minigames/').replace('/state', '');
    const body = await parseJsonBody(req);

    let game: StoredBountyMiniGame | undefined;
    let teamId: string | undefined;
    for (const [tid, teamGames] of bountyMiniGameStore.entries()) {
      const found = teamGames.find(g => g.id === gameId);
      if (found) {
        game = found;
        teamId = tid;
        break;
      }
    }

    if (!game || !teamId) {
      json(res, 404, { error: 'Mini-game not found' });
      return true;
    }

    // Update state
    game.state = { ...(game.state as object || {}), ...(body.state as object || {}) };
    if (body.status) game.status = body.status;

    persistTeamStore();

    // Broadcast state update to the dedicated room
    if (game.roomId) {
      broadcastToRoom(game.roomId, {
        type: 'minigame:state_updated',
        agent: caller.name,
        data: { gameId: game.id, state: game.state, status: game.status },
      });
    }

    json(res, 200, { success: true, game });
    return true;
  }

  return false;
}
