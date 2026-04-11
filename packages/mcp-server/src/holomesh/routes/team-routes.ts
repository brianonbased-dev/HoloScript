import type http from 'http';
import * as crypto from 'crypto';
import { 
  teamStore, 
  agentKeyStore, 
  walletToAgent,
  persistTeamStore,
  persistAgentStore 
} from '../state';
import { 
  json, 
  parseJsonBody, 
  extractParam, 
  getTeamMember, 
  hasTeamPermission,
  requireTeamAccess
} from '../utils';
import { requireAuth } from '../auth-utils';
import { broadcastToRoom } from '../team-room';
import type { Team, RegisteredAgent, TeamRole } from '../types';

/**
 * Handle team creation, registration, and membership routes.
 */
export async function handleTeamRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  // POST /api/holomesh/register — Legacy registration
  if (pathname === '/api/holomesh/register' && method === 'POST') {
    const body = await parseJsonBody(req);
    const name = (body.name as string)?.trim();
    if (!name) {
      json(res, 400, { error: 'Missing name' });
      return true;
    }

    const apiKey = `holomesh_sk_${crypto.randomUUID().replace(/-/g, '')}`;
    const agent: RegisteredAgent = {
      id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      apiKey,
      walletAddress: (body.walletAddress as string) || '',
      name,
      traits: Array.isArray(body.traits) ? body.traits : [],
      reputation: 0,
      profile: {
        bio: '',
        themeColor: '#6366f1',
        themeAccent: '#4f46e5',
        statusText: 'New to HoloMesh',
        customTitle: 'Agent',
        backgroundGradient: ['#4f46e5', '#6366f1'],
        particles: 'none',
        backgroundMusicUrl: '',
        backgroundMusicVolume: 0.5,
        moodBoardScene: '',
        moodBoardCompiled: '',
      },
      createdAt: new Date().toISOString(),
    };

    agentKeyStore.set(apiKey, agent);
    if (agent.walletAddress) {
      walletToAgent.set(agent.walletAddress.toLowerCase(), agent);
    }
    persistAgentStore();

    json(res, 201, { success: true, agent });
    return true;
  }

  // GET /api/holomesh/teams — List public teams
  if (pathname === '/api/holomesh/teams' && method === 'GET') {
    const teams = Array.from(teamStore.values())
      .filter(t => t.visibility !== 'private')
      .map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
        members: t.members.length,
        maxSlots: t.maxSlots,
        owner: t.ownerName
      }));
    json(res, 200, { success: true, teams, count: teams.length });
    return true;
  }

  // POST /api/holomesh/teams — Create team
  if (pathname === '/api/holomesh/teams' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const name = (body.name as string)?.trim();
    if (!name) {
      json(res, 400, { error: 'Missing team name' });
      return true;
    }

    const teamId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const team: Team = {
      id: teamId,
      name,
      description: (body.description as string) || '',
      type: (body.type as Team['type']) || 'bounty',
      visibility: (body.visibility as Team['visibility']) || 'public',
      ownerId: caller.id,
      ownerName: caller.name,
      inviteCode: crypto.randomUUID().slice(0, 8),
      maxSlots: Math.min(parseInt(String(body.maxSlots)) || 5, 20),
      members: [{ agentId: caller.id, agentName: caller.name, role: 'owner', joinedAt: new Date().toISOString() }],
      waitlist: [],
      createdAt: new Date().toISOString(),
      taskBoard: [],
      doneLog: [],
    };

    teamStore.set(teamId, team);
    persistTeamStore();

    json(res, 201, { success: true, team });
    return true;
  }

  // GET /api/holomesh/team/:id
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+$/) && method === 'GET') {
    const teamId = extractParam(url, '/api/holomesh/team/');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }
    
    // Check privacy
    if (team.visibility === 'private') {
      const caller = requireAuth(req, res);
      if (!caller || !getTeamMember(team, caller.id)) {
        json(res, 403, { error: 'Private team. Membership required.' });
        return true;
      }
    }

    json(res, 200, { success: true, team });
    return true;
  }

  // POST /api/holomesh/team/:id/join
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/join$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/join', '');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }

    if (getTeamMember(team, caller.id)) {
      json(res, 400, { error: 'Already a member' });
      return true;
    }

    if (team.members.length >= team.maxSlots) {
      json(res, 400, { error: 'Team is full' });
      return true;
    }

    team.members.push({
      agentId: caller.id,
      agentName: caller.name,
      role: 'member',
      joinedAt: new Date().toISOString()
    });
    persistTeamStore();

    // Broadcast join to the team room
    broadcastToRoom(teamId, {
      type: 'team:member_joined',
      agent: caller.name,
      data: { agentId: caller.id, agentName: caller.name, totalMembers: team.members.length }
    });

    json(res, 200, { success: true, team });
    return true;
  }

  return false;
}
