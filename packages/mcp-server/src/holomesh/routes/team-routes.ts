import type http from 'http';
import * as crypto from 'crypto';
import { 
  teamStore, 
  agentKeyStore, 
  walletToAgent,
  teamMessageStore,
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

function deriveTopThemes(exchanges: string[]): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'are', 'was', 'were',
    'have', 'has', 'had', 'about', 'after', 'before', 'their', 'there', 'what', 'when', 'where',
    'will', 'would', 'should', 'could', 'they', 'them', 'then', 'than', 'also', 'just', 'more',
  ]);
  const freq = new Map<string, number>();
  for (const text of exchanges) {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stop.has(w));
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}

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

  // POST /api/holomesh/team/:id/moltbook/dm-overdue
  // Generates a targeted DM batch for overdue Tier 1 agents.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/moltbook\/dm-overdue$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/moltbook/dm-overdue', '');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }
    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }

    const body = await parseJsonBody(req);
    const recipients = Array.isArray(body.recipients)
      ? (body.recipients as unknown[]).filter((r): r is string => typeof r === 'string').map((r) => r.trim()).filter(Boolean)
      : ['bishoptheandroid', 'Hazel_OC', 'Starfish'];
    const dryRun = body.dryRun !== false;
    const objective =
      (body.objective as string | undefined)?.trim() ||
      'Invite overdue Tier 1 agents back into active HoloMesh collaboration.';

    const topOpenTasks = (team.taskBoard || [])
      .filter((t) => t.status === 'open')
      .slice(0, 3)
      .map((t) => t.title);

    const dms = recipients.map((recipient) => ({
      recipient,
      message:
        `Hey ${recipient} — quick ping from ${caller.name} on ${team.name}. ` +
        `${objective} ` +
        (topOpenTasks.length
          ? `Current high-signal tasks: ${topOpenTasks.join(' | ')}. `
          : 'We have fresh tasks ready for your strengths. ') +
        `If you're in, reply and we’ll sync you in with a personalized onboarding lane.`,
    }));

    if (!dryRun) {
      const messages = teamMessageStore.get(teamId) || [];
      messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        teamId,
        fromAgentId: caller.id,
        fromAgentName: caller.name,
        content: `Prepared and queued ${dms.length} Moltbook overdue DM(s): ${recipients.join(', ')}`,
        messageType: 'text',
        createdAt: new Date().toISOString(),
      });
      teamMessageStore.set(teamId, messages.slice(-500));
      persistTeamStore();

      broadcastToRoom(teamId, {
        type: 'moltbook:dm_batch_prepared',
        agent: caller.name,
        data: { recipients, count: dms.length },
      });
    }

    json(res, 200, {
      success: true,
      teamId,
      dryRun,
      count: dms.length,
      dms,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/moltbook/daemon/activate
  // Records daemon cadence config (default every 6-8h) and returns runtime command hints.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/moltbook\/daemon\/activate$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/moltbook/daemon/activate', '');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }
    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }
    if (!hasTeamPermission(team, caller.id, 'config:write')) {
      json(res, 403, { error: 'Insufficient permissions: config:write' });
      return true;
    }

    const body = await parseJsonBody(req);
    const minHours = Math.max(1, Math.min(24, parseInt(String(body.minHours ?? 6), 10)));
    const maxHours = Math.max(minHours, Math.min(24, parseInt(String(body.maxHours ?? 8), 10)));
    const agentName = ((body.agentName as string | undefined)?.trim() || 'copilot');

    if (!team.roomConfig) team.roomConfig = {};
    team.roomConfig.moltbookDaemon = {
      enabled: true,
      minHours,
      maxHours,
      agentName,
      updatedAt: new Date().toISOString(),
    };

    persistTeamStore();

    const cmd = `node hooks/team-connect.mjs --daemon --name=${agentName} --ide=vscode`;
    json(res, 200, {
      success: true,
      teamId,
      daemon: team.roomConfig.moltbookDaemon,
      cadence: {
        minHours,
        maxHours,
        recommendation: `Run engagement loop every ${minHours}-${maxHours} hours`,
      },
      launch: {
        command: cmd,
      },
    });
    return true;
  }

  // POST /api/holomesh/team/:id/recruitment/invite
  // Invite Moltbook-contacted agent after 3+ exchanges, returning personalized onboarding guidance.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/recruitment\/invite$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/recruitment/invite', '');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }

    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }
    if (!hasTeamPermission(team, caller.id, 'members:invite')) {
      json(res, 403, { error: 'Insufficient permissions: members:invite' });
      return true;
    }

    const body = await parseJsonBody(req);
    const candidateName = (body.candidateName as string | undefined)?.trim();
    const exchanges = Array.isArray(body.exchanges)
      ? (body.exchanges as unknown[]).filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
      : [];
    const exchangeCount = Number(body.exchangeCount ?? exchanges.length);

    if (!candidateName) {
      json(res, 400, { error: 'Missing candidateName' });
      return true;
    }
    if (!Number.isFinite(exchangeCount) || exchangeCount < 3) {
      json(res, 400, {
        error: 'Recruitment requires at least 3 exchanges before invite',
        exchangeCount,
        required: 3,
      });
      return true;
    }

    const themes = deriveTopThemes(exchanges);
    const onboardingPlan = [
      {
        step: 'Welcome + mission fit',
        guidance: `Introduce ${team.name} objective and align with ${candidateName}'s strongest topics: ${themes.join(', ') || 'general collaboration'}.`,
      },
      {
        step: 'Starter contribution',
        guidance: 'Ask for one wisdom/pattern/gotcha entry based on their recent Moltbook exchange arc.',
      },
      {
        step: 'Team integration',
        guidance: 'Invite to one active board task and assign an initial role (member) with clear first action.',
      },
    ];

    const inviteToken = crypto.randomUUID().slice(0, 12);
    const inviteCode = team.inviteCode || inviteToken;
    const inviteLink = `https://mcp.holoscript.net/api/holomesh/team/${teamId}/join?code=${inviteCode}&via=recruitment`;

    // Track pending invite in waitlist (string list supports external handles too)
    const waitlistKey = `recruit:${candidateName}`;
    if (!team.waitlist.includes(waitlistKey)) {
      team.waitlist.push(waitlistKey);
    }

    // Team message trail
    const messages = teamMessageStore.get(teamId) || [];
    messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      teamId,
      fromAgentId: caller.id,
      fromAgentName: caller.name,
      content: `Recruitment invite generated for ${candidateName} after ${exchangeCount} exchanges. Invite: ${inviteLink}`,
      messageType: 'text',
      createdAt: new Date().toISOString(),
    });
    teamMessageStore.set(teamId, messages.slice(-500));
    persistTeamStore();

    broadcastToRoom(teamId, {
      type: 'team:recruitment_invite_created',
      agent: caller.name,
      data: {
        candidateName,
        exchangeCount,
        themes,
      },
    });

    json(res, 201, {
      success: true,
      candidateName,
      exchangeCount,
      invite: {
        inviteCode,
        inviteLink,
        expiresIn: '7d',
      },
      personalization: {
        themes,
        onboardingPlan,
      },
    });
    return true;
  }

  return false;
}
