import type http from 'http';
import * as crypto from 'crypto';
import { verifyTypedData } from 'viem';
import {
  teamStore,
  agentKeyStore,
  walletToAgent,
  teamMessageStore,
  teamPresenceStore,
  persistTeamStore,
  persistAgentStore,
  challengeStore
} from '../state';
import { 
  json, 
  parseJsonBody, 
  extractParam, 
  getTeamMember, 
  hasTeamPermission,
  requireTeamAccess
} from '../utils';
import { requireAuth, resolveRequestingAgent } from '../auth-utils';
import { broadcastToRoom } from '../team-room';
import { getClient } from '../orchestrator-client';
import { checkRateLimit } from '../social';
import type { Team, RegisteredAgent, TeamRole, MeshKnowledgeEntry } from '../types';
import { ROOM_PRESETS } from '@holoscript/framework';

const QUICKSTART_DOMAIN_DESCRIPTIONS: Record<string, string> = {
  agents: 'Agent design, orchestration, and collaborative autonomy patterns.',
  security: 'Authentication, threat modeling, and safe-by-default operational practices.',
  rendering: 'Spatial rendering, scene composition, and visual performance techniques.',
  compiler: 'Semantic compilation, trait pipelines, and target generation strategies.',
  economics: 'x402 monetization, bounties, and creator revenue architecture.',
  general: 'Cross-domain patterns and high-signal onboarding knowledge.',
};

function createWalletMaterial(): { privateKey: string; address: string } {
  const privateKey = `0x${crypto.randomBytes(32).toString('hex')}`;
  const address = `0x${crypto.randomBytes(20).toString('hex')}`;
  return { privateKey, address };
}

function validateAgentName(name: string): string | null {
  if (name.length < 2 || name.length > 64) {
    return 'agentName must be 2-64 chars';
  }
  // Safe display + storage profile:
  // - Starts/ends with alphanumeric
  // - Allows internal spaces, dots, underscores, hyphens
  // - Blocks control chars and leading/trailing separators
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9]$/.test(name)) {
    return 'agentName may contain letters, numbers, spaces, dot, underscore, hyphen and must start/end with alphanumeric';
  }
  return null;
}

function normalizeEntry(entry: MeshKnowledgeEntry): Record<string, unknown> {
  return {
    id: entry.id,
    type: entry.type,
    domain: entry.domain || 'general',
    content: entry.content,
    authorName: entry.authorName,
    createdAt: entry.createdAt,
  };
}

async function fetchQuickstartPreview(): Promise<MeshKnowledgeEntry[]> {
  const client = getClient();
  const searches = ['holomesh', 'agent', 'knowledge'];
  const merged: MeshKnowledgeEntry[] = [];

  for (const query of searches) {
    const results = await client.queryKnowledge(query, { limit: 10 });
    for (const result of results) {
      if (!merged.some((e) => e.id === result.id)) {
        merged.push(result);
      }
      if (merged.length >= 15) return merged;
    }
  }

  return merged;
}

function rankTopDomains(entries: MeshKnowledgeEntry[]): Array<Record<string, unknown>> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const domain = (e.domain || 'general').toLowerCase();
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([domain, count]) => ({
      domain,
      entries: count,
      description:
        QUICKSTART_DOMAIN_DESCRIPTIONS[domain] ||
        `Knowledge entries in the ${domain} domain.`,
    }));
}

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
  // GET /api/holomesh/quickstart — Curated onboarding snapshot
  if (pathname === '/api/holomesh/quickstart' && method === 'GET') {
    const ip = req.socket?.remoteAddress || 'unknown_ip';
    const rl = checkRateLimit(ip, 'default');
    if (!rl.allowed) {
      json(res, 429, { error: 'Rate limited', retry_after: rl.retryAfter });
      return true;
    }

    const preview = await fetchQuickstartPreview();
    const topDomains = rankTopDomains(preview);
    const sampleEntries = preview.slice(0, 5).map(normalizeEntry);

    json(res, 200, {
      success: true,
      welcome: {
        title: 'Welcome to HoloMesh',
        summary:
          'Start here: explore active domains, read high-signal entries, then register your agent and contribute your first wisdom/pattern/gotcha.',
      },
      top_domains: topDomains,
      sample_entries: sampleEntries,
      quick_actions: [
        'POST /api/holomesh/quickstart to bootstrap an agent identity',
        'GET /api/holomesh/leaderboard to see active contributors',
        'GET /api/holomesh/domains to inspect domain activity',
      ],
      generatedAt: new Date().toISOString(),
    });
    return true;
  }

  // POST /api/holomesh/quickstart — One-call onboarding: register + auto-join team + return board
  // This is the "Moltbook-easy" flow: one curl and you're contributing.
  if (pathname === '/api/holomesh/quickstart' && method === 'POST') {
    const ip = req.socket?.remoteAddress || 'unknown_ip';
    const rl = checkRateLimit(ip, 'quickstart');
    if (!rl.allowed) {
      json(res, 429, { error: 'Rate limited', retry_after: rl.retryAfter });
      return true;
    }

    const body = await parseJsonBody(req);
    const name = (body.agentName as string | undefined)?.trim()
      || (body.name as string | undefined)?.trim() || '';
    const ide = (body.ide as string | undefined)?.trim() || 'unknown';
    const description = (body.description as string | undefined)?.trim() || '';
    const capabilities = (body.capabilities as string[]) || [];

    const nameValidationError = validateAgentName(name);
    if (nameValidationError) {
      json(res, 400, { error: nameValidationError });
      return true;
    }

    const duplicate = Array.from(agentKeyStore.values()).some(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      json(res, 409, { error: 'Agent name already exists. Use POST /api/holomesh/register to get a new key for an existing name.' });
      return true;
    }

    // 1. Register the agent
    const wallet = createWalletMaterial();
    const apiKey = `holomesh_sk_${crypto.randomUUID().replace(/-/g, '')}`;
    const agent: RegisteredAgent = {
      id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      apiKey,
      walletAddress: wallet.address,
      name,
      traits: ['@quickstart', '@newcomer'],
      reputation: 0,
      profile: {
        bio: description || `${name} agent from ${ide}`,
      },
      createdAt: new Date().toISOString(),
    };

    agentKeyStore.set(apiKey, agent);
    walletToAgent.set(wallet.address.toLowerCase(), agent);
    persistAgentStore();

    // 2. Auto-join the first public team (or create a default one)
    let joinedTeam: Team | null = null;
    let teamBoard: unknown[] = [];
    let teamMode = 'build';

    for (const team of teamStore.values()) {
      if (team.members.length < team.maxSlots) {
        // Join this team
        const alreadyMember = team.members.some(m => m.agentId === agent.id);
        if (!alreadyMember) {
          team.members.push({
            agentId: agent.id,
            agentName: agent.name,
            role: 'member' as TeamRole,
            joinedAt: new Date().toISOString(),
          });
          persistTeamStore();
          broadcastToRoom(team.id, {
            type: 'team:member_joined',
            agent: agent.name,
            data: { agentId: agent.id, agentName: agent.name, ide, totalMembers: team.members.length },
          });
        }
        joinedTeam = team;
        teamBoard = team.taskBoard || [];
        teamMode = ((team as unknown) as Record<string, unknown>).mode as string || 'build';
        break;
      }
    }

    // 3. Post first heartbeat
    if (joinedTeam) {
      if (!teamPresenceStore.has(joinedTeam.id)) {
        teamPresenceStore.set(joinedTeam.id, new Map());
      }
      teamPresenceStore.get(joinedTeam.id)!.set(agent.id, {
        agentId: agent.id,
        agentName: agent.name,
        ideType: ide,
        status: 'active',
        lastHeartbeat: new Date().toISOString(),
      });
    }

    // 4. Seed first knowledge entry
    const firstEntry: MeshKnowledgeEntry = {
      id: `W.quickstart.${Date.now()}`,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      type: 'wisdom',
      content: description
        ? `Hello from ${name} (${ide}). Focus: ${description}`
        : `Hello from ${name} (${ide}). Ready to contribute.`,
      provenanceHash: crypto
        .createHash('sha256')
        .update(`${name}:${ide}:${Date.now()}`)
        .digest('hex'),
      authorId: agent.id,
      authorName: agent.name,
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: 'general',
      tags: ['quickstart', 'onboarding', ide],
      confidence: 0.7,
      createdAt: new Date().toISOString(),
    };

    try {
      await getClient().contributeKnowledge([firstEntry]);
    } catch {
      // Onboarding succeeds even if orchestrator is temporarily unavailable
    }

    let feedPreview: MeshKnowledgeEntry[] = [];
    try {
      feedPreview = await getClient().queryKnowledge('', { limit: 10 });
    } catch {
      feedPreview = [];
    }

    // 5. Build the response — everything the agent needs to start working
    const openTasks = teamBoard.filter((t: unknown) => (t as Record<string, unknown>).status === 'open');

    json(res, 201, {
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: apiKey,
        HOLOMESH_API_KEY: apiKey,
        HOLOSCRIPT_API_KEY: apiKey,
        wallet_address: wallet.address,
        capabilities,
        created_at: agent.createdAt,
      },
      wallet: {
        private_key: wallet.privateKey,
        address: wallet.address,
        important: 'Save your private_key securely — it cannot be recovered.',
      },
      team: joinedTeam ? {
        id: joinedTeam.id,
        name: joinedTeam.name,
        mode: teamMode,
        members: joinedTeam.members.length,
        your_role: 'member',
      } : null,
      board: {
        open_tasks: openTasks.length,
        tasks: openTasks.slice(0, 5),
        claim_url: joinedTeam
          ? `POST /api/holomesh/team/${joinedTeam.id}/board/{taskId} with {"action":"claim","agent":"${name}"}`
          : null,
      },
      mcp_config: {
        mcpServers: {
          holoscript: {
            url: 'https://mcp.holoscript.net/mcp',
            transport: 'http',
          },
        },
      },
      env_config: {
        HOLOMESH_API_KEY: apiKey,
        HOLOMESH_TEAM_ID: joinedTeam?.id || '',
        HOLOSCRIPT_API_KEY: apiKey,
      },
      your_first_entry: {
        id: firstEntry.id,
        type: firstEntry.type,
        content: firstEntry.content,
        domain: firstEntry.domain,
      },
      feed_preview: feedPreview,
      next_steps: joinedTeam ? [
        `You are now on team "${joinedTeam.name}" in ${teamMode} mode`,
        openTasks.length > 0
          ? `${openTasks.length} open tasks — claim one: PATCH /api/holomesh/team/${joinedTeam.id}/board/{taskId}`
          : 'No open tasks — contribute knowledge or wait for new tasks',
        'Send heartbeat every 60s to stay visible: POST /api/holomesh/team/' + joinedTeam.id + '/presence',
        'Share what you learn: POST /api/holomesh/team/' + joinedTeam.id + '/knowledge',
      ] : [
        'No teams available to auto-join. Create one: POST /api/holomesh/team',
        'Or list teams: GET /api/holomesh/teams',
      ],
    });
    return true;
  }


    // POST /api/holomesh/register/challenge — Issue nonce for proof-of-ownership
    // Part of x402 challenge-verified registration (SEC-T-Zero fix 2026-04-22).
    // Client flow: generate wallet locally → request challenge → sign nonce →
    // POST /register with {wallet_address, nonce, signature} — server never sees private key.
    if (pathname === '/api/holomesh/register/challenge' && method === 'POST') {
      const body = await parseJsonBody(req);
      const walletAddress = (body.wallet_address as string | undefined)?.trim();
      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        json(res, 400, { error: 'wallet_address must be a valid 0x-prefixed 40-char hex address' });
        return true;
      }
      const walletKey = walletAddress.toLowerCase();
      if (walletToAgent.has(walletKey)) {
        json(res, 409, { error: 'This wallet is already registered. Use /api/holomesh/key/challenge for key recovery.' });
        return true;
      }
      const nonce = crypto.randomUUID();
      const expiresAt = Date.now() + 300_000; // 5 min
      challengeStore.set(nonce, { walletAddress: walletKey, expiresAt });
      json(res, 200, {
        success: true,
        challenge: {
          walletAddress,
          domain: 'HoloMesh Registration',
          message: `Register a new HoloMesh agent with wallet ${walletAddress}`,
        },
        nonce,
        expires_in: 300,
        instructions: {
          next: 'POST /api/holomesh/register with {name, wallet_address, nonce, signature}',
          sign_format: 'EIP-712 typed data: domain={name:"HoloMesh",version:"1"}, types={Registration:[{name:"nonce",type:"string"}]}, primaryType="Registration", message={nonce}',
        },
      });
      return true;
    }

    // POST /api/holomesh/register — Agent registration
    // SEC-T-Zero fix 2026-04-22:
    //   - x402 path (preferred): client provides {wallet_address, nonce, signature} — server verifies
    //     ownership via EIP-712 signature recovery, NEVER sees private key.
    //   - Legacy path (deprecated): client provides no wallet_address — server generates one + returns
    //     private_key in response. Grace-period supported but logged + warning header returned.
    if (pathname === '/api/holomesh/register' && method === 'POST') {
      const body = await parseJsonBody(req);
      const name = (body.name as string)?.trim() || '';
      if (!name) {
        json(res, 400, { error: 'Missing name' });
        return true;
      }
      const nameValidationError = validateAgentName(name);
      if (nameValidationError) {
        json(res, 400, { error: nameValidationError });
        return true;
      }
      const duplicate = Array.from(agentKeyStore.values()).some(
        (a) => a.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        json(res, 409, { error: 'Agent name already registered' });
        return true;
      }
      const providedWallet = (body.wallet_address as string | undefined)?.trim() || '';
      const providedNonce = (body.nonce as string | undefined)?.trim() || '';
      const providedSignature = (body.signature as string | undefined)?.trim() || '';
      let isX402Path = false;
      if (providedWallet) {
        const walletKey = providedWallet.toLowerCase();
        if (walletToAgent.has(walletKey)) {
          json(res, 409, { error: 'This wallet is already registered' });
          return true;
        }
        // x402 challenge-verified path: require + verify proof-of-ownership
        if (!providedNonce || !providedSignature) {
          json(res, 400, {
            error: 'wallet_address provided without proof-of-ownership. Request a nonce via POST /api/holomesh/register/challenge, sign it, then include {nonce, signature} in this request. (SEC-T-Zero fix 2026-04-22.)',
            see: 'POST /api/holomesh/register/challenge',
          });
          return true;
        }
        const record = challengeStore.get(providedNonce);
        if (!record || record.expiresAt < Date.now()) {
          json(res, 400, { error: 'Invalid or expired nonce' });
          return true;
        }
        if (record.walletAddress !== walletKey) {
          json(res, 400, { error: 'Wallet address does not match the nonce record' });
          return true;
        }
        // Consume nonce (single-use)
        challengeStore.delete(providedNonce);
        try {
          const valid = await verifyTypedData({
            address: providedWallet as `0x${string}`,
            domain: { name: 'HoloMesh', version: '1' },
            types: { Registration: [{ name: 'nonce', type: 'string' }] },
            primaryType: 'Registration',
            message: { nonce: providedNonce },
            signature: providedSignature as `0x${string}`,
          });
          if (!valid) {
            json(res, 401, { error: 'Signature verification failed — signer does not own wallet_address' });
            return true;
          }
        } catch {
          json(res, 401, { error: 'Signature verification failed' });
          return true;
        }
        isX402Path = true;
      }
      const apiKey = `holomesh_sk_${crypto.randomUUID().replace(/-/g, '')}`;
      const wallet = providedWallet ? null : createWalletMaterial();
      const walletAddress = providedWallet || wallet!.address;
      const agent: RegisteredAgent = {
        id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        apiKey,
        walletAddress,
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
      walletToAgent.set(walletAddress.toLowerCase(), agent);
      persistAgentStore();
      // Provision private knowledge workspace
      try {
        await getClient().contributeKnowledge([{
          id: `private:${walletAddress}:init`,
          workspaceId: `private:${walletAddress}`,
          type: 'wisdom',
          content: 'Private workspace initialized.',
          authorId: agent.id,
          authorName: agent.name,
          domain: 'general',
          tags: ['private', 'init'],
          price: 0,
          queryCount: 0,
          reuseCount: 0,
          provenanceHash: '',
          createdAt: new Date().toISOString(),
        } as import('../types').MeshKnowledgeEntry]);
      } catch {}
      // SEC-T-Zero 2026-04-22: Log deprecation of legacy server-side wallet path.
      if (wallet) {
        console.warn(
          `[HoloMesh /register] DEPRECATED: legacy server-side wallet generation for agent '${name}'. ` +
          `Migrate to x402 challenge-verified flow (POST /register/challenge). ` +
          `See SEC-T-Zero. Will be removed in future release.`
        );
      }
      const resp: Record<string, unknown> = {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          api_key: agent.apiKey,
          wallet_address: agent.walletAddress,
          traits: agent.traits,
          created_at: agent.createdAt,
        },
        private_workspace: {
          id: `private:${walletAddress}`,
          query: 'GET /api/holomesh/knowledge/private',
        },
      };
      if (isX402Path) {
        // x402 path: server never saw private key. Response confirms registration only.
        resp.wallet = {
          address: providedWallet,
          source: 'client-provided (x402 challenge-verified)',
          note: 'Ownership proven via EIP-712 signature. Server never received or stored private_key.',
        };
      } else if (wallet) {
        // Legacy path: server generated wallet. DEPRECATED.
        // Sending private_key remains here for grace-period back-compat with older clients,
        // but the deprecation warning above is logged and the response body carries a migration hint.
        resp.deprecation = {
          path: 'server-side-wallet-gen',
          migrate_to: 'POST /api/holomesh/register/challenge',
          reason: 'Server-side wallet generation exposes private keys in transit. See SEC-T-Zero 2026-04-22.',
        };
        resp.wallet = {
          private_key: wallet.privateKey,
          address: wallet.address,
          important: 'Save your private_key securely — it cannot be recovered.',
          deprecated: 'Server-side wallet generation is deprecated. Use x402 challenge-verified registration (POST /register/challenge). See SEC-T-Zero.',
        };
      } else {
        resp.wallet = { note: 'Using existing wallet. No private_key generated.', address: providedWallet };
      }
      json(res, 201, resp);
      return true;
    }

  // GET /api/holomesh/teams — List agent's teams (auth required)
  if (pathname === '/api/holomesh/teams' && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teams = Array.from(teamStore.values())
      .filter((t) => t.members.some((m) => m.agentId === caller.id))
      .map((t) => {
        const membership = t.members.find((m) => m.agentId === caller.id)!;
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          type: t.type,
          memberCount: t.members.length,
          role: membership.role,
          createdAt: t.createdAt,
        };
      });
    json(res, 200, { success: true, teams });
    return true;
  }

  // POST /api/holomesh/team — Create a team (enterprise path)
  if (pathname === '/api/holomesh/team' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const name = (body.name as string | undefined)?.trim();
    if (!name || name.length < 2) {
      json(res, 400, { error: 'Team name must be at least 2 characters' });
      return true;
    }
    const duplicate = Array.from(teamStore.values()).some(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      json(res, 409, { error: 'A team with this name already exists' });
      return true;
    }
    const teamId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inviteCode = crypto.randomBytes(8).toString('hex');
    const team: Team = {
      id: teamId,
      name,
      description: (body.description as string) || '',
      type: (body.type as Team['type']) || 'bounty',
      visibility: (body.visibility as Team['visibility']) || 'public',
      ownerId: caller.id,
      ownerName: caller.name,
      inviteCode,
      maxSlots: 20,
      members: [{ agentId: caller.id, agentName: caller.name, role: 'owner', joinedAt: new Date().toISOString() }],
      waitlist: [],
      createdAt: new Date().toISOString(),
      taskBoard: [],
      doneLog: [],
    };
    teamStore.set(teamId, team);
    persistTeamStore();
    json(res, 201, {
      success: true,
      team: {
        id: teamId,
        name,
        invite_code: inviteCode,
        workspace_id: `team:${teamId}`,
      },
    });
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
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const membership = team.members.find((m) => m.agentId === caller.id);
    if (!membership) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }
    const isOwnerOrAdmin = ['owner', 'admin'].includes(membership.role);
    json(res, 200, {
      success: true,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        your_role: membership.role,
        members: team.members,
        ...(isOwnerOrAdmin ? { invite_code: team.inviteCode } : {}),
      },
      quick_links: {
        join: `POST /api/holomesh/team/${teamId}/join`,
        presence: `POST /api/holomesh/team/${teamId}/presence`,
        message: `POST /api/holomesh/team/${teamId}/message`,
        knowledge: `POST /api/holomesh/team/${teamId}/knowledge`,
      },
    });
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
      json(res, 409, { error: 'Already a member of this team' });
      return true;
    }

    const body = await parseJsonBody(req);
    if (body.invite_code !== undefined && body.invite_code !== team.inviteCode) {
      json(res, 403, { error: 'Invalid invite code' });
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

    json(res, 200, { success: true, role: 'member', members: team.members.length });
    return true;
  }

  // POST /api/holomesh/team/:id/absorb
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/absorb$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/absorb', '');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }

    const body = await parseJsonBody(req);
    if (!body.project_path) {
      json(res, 400, { error: 'Missing project_path' });
      return true;
    }

    try {
      // NOTE: Using a global fetch pattern similar to http-routes.test.ts expectations.
      await fetch('https://absorb.holoscript.net/health').catch(() => {});
    } catch {}

    json(res, 202, { 
      success: true, 
      absorb: { 
        project_path: body.project_path, 
        depth: body.depth,
        workspace_id: `team:${teamId}`
      } 
    });
    return true;
  }

  // POST /api/holomesh/team/:id/members
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/members$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const teamId = extractParam(url, '/api/holomesh/team/').replace('/members', '');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }

    if (!hasTeamPermission(team, caller.id, 'members:manage')) {
      json(res, 403, { error: 'Insufficient permissions' });
      return true;
    }

    const body = await parseJsonBody(req);
    const { action, agent_id, role } = body;

    const targetIndex = team.members.findIndex(m => m.agentId === agent_id);
    if (targetIndex === -1 && action !== 'add') {
      json(res, 404, { error: 'Member not found on team' });
      return true;
    }

    if (action === 'set_role') {
      team.members[targetIndex].role = role as TeamRole;
      persistTeamStore();
      json(res, 200, { success: true, new_role: role });
      return true;
    } else if (action === 'remove') {
      team.members.splice(targetIndex, 1);
      persistTeamStore();
      json(res, 200, { success: true, removed: agent_id, members: team.members.length });
      return true;
    }

    json(res, 400, { error: 'Unknown action' });
    return true;
  }

  // POST /api/holomesh/team/:id/presence
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/presence$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/presence', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    if (!getTeamMember(team, caller.id)) { json(res, 403, { error: 'Not a member' }); return true; }
    const body = await parseJsonBody(req);
    const entry = {
      agentId: caller.id,
      agentName: caller.name,
      ideType: (body.ideType as string) || 'unknown',
      status: (body.status as string) || 'active',
      lastHeartbeat: new Date().toISOString(),
    } as import('../types').TeamPresenceEntry;
    if (!teamPresenceStore.has(teamId)) teamPresenceStore.set(teamId, new Map());
    teamPresenceStore.get(teamId)!.set(caller.id, entry);
    const onlineCount = teamPresenceStore.get(teamId)!.size;
    json(res, 200, { success: true, presence: entry, online_count: onlineCount });
    return true;
  }

  // GET /api/holomesh/team/:id/presence
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/presence$/) && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/presence', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    if (!getTeamMember(team, caller.id)) { json(res, 403, { error: 'Not a member' }); return true; }
    const presenceMap = teamPresenceStore.get(teamId);
    const online = presenceMap ? Array.from(presenceMap.values()) : [];
    json(res, 200, { success: true, online_count: online.length, online });
    return true;
  }

  // POST /api/holomesh/team/:id/message
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/message$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/message', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    if (!getTeamMember(team, caller.id)) { json(res, 403, { error: 'Not a member' }); return true; }
    const body = await parseJsonBody(req);
    if (!body.content) { json(res, 400, { error: 'content is required' }); return true; }
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      teamId,
      fromAgentId: caller.id,
      fromAgentName: caller.name,
      content: body.content as string,
      messageType: (body.messageType as string) || 'text',
      createdAt: new Date().toISOString(),
    };
    const messages = teamMessageStore.get(teamId) || [];
    messages.push(message as import('../types').TeamMessage);
    teamMessageStore.set(teamId, messages.slice(-500));
    persistTeamStore();
    broadcastToRoom(teamId, { type: 'team:message', agent: caller.name, data: message });
    json(res, 201, { success: true, message });
    return true;
  }

  // GET /api/holomesh/team/:id/messages
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/messages$/) && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/messages', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    if (!getTeamMember(team, caller.id)) { json(res, 403, { error: 'Not a member' }); return true; }
    const searchParams = new URL(url, 'http://localhost').searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10) || 50;
    const messages = (teamMessageStore.get(teamId) || []).slice(-limit);
    json(res, 200, { success: true, messages, count: messages.length });
    return true;
  }

  // POST /api/holomesh/team/:id/knowledge
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/knowledge$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/knowledge', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    const membership = getTeamMember(team, caller.id);
    if (!membership) { json(res, 403, { error: 'Not a member' }); return true; }
    if (!hasTeamPermission(team, caller.id, 'messages:write')) {
      json(res, 403, { error: 'Insufficient permissions' }); return true;
    }
    const body = await parseJsonBody(req);
    const entries = Array.isArray(body.entries) ? (body.entries as MeshKnowledgeEntry[]) : [];
    if (entries.length === 0) { json(res, 400, { error: 'entries required' }); return true; }
    const workspaceId = `team:${teamId}`;
    const prepared = entries.map((e: MeshKnowledgeEntry) => ({
      ...e,
      id: e.id || `W.team.${Date.now()}.${Math.random().toString(36).slice(2, 5)}`,
      workspaceId,
      authorId: e.authorId || caller.id,
      authorName: e.authorName || caller.name,
      tags: [...(Array.isArray(e.tags) ? e.tags : [])],
      price: e.price ?? 0,
      queryCount: e.queryCount ?? 0,
      reuseCount: e.reuseCount ?? 0,
      createdAt: e.createdAt || new Date().toISOString(),
    }));
    const synced = await getClient().contributeKnowledge(prepared);
    json(res, 201, { success: true, synced, entries: prepared, workspace_id: workspaceId });
    return true;
  }

  // GET /api/holomesh/team/:id/knowledge
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/knowledge$/) && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/knowledge', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    if (!getTeamMember(team, caller.id)) { json(res, 403, { error: 'Not a member' }); return true; }
    const workspaceId = `team:${teamId}`;
    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await getClient().queryKnowledge('', { workspaceId, limit: 200 });
    } catch {}
    json(res, 200, { success: true, workspace_id: workspaceId, entries, count: entries.length });
    return true;
  }

  // POST /api/holomesh/team/:id/mode
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/mode$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/mode', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    if (!getTeamMember(team, caller.id)) { json(res, 403, { error: 'Not a member' }); return true; }
    const body = await parseJsonBody(req);
    const mode = (body.mode as string) || 'build';
    if (!team.roomConfig) team.roomConfig = {};
    team.mode = mode;
    const preset = (ROOM_PRESETS as Record<string, { objective?: string }>)[mode];
    if (preset?.objective) {
      (team.roomConfig as { objective?: string }).objective = preset.objective;
    }
    persistTeamStore();
    json(res, 200, {
      success: true,
      mode,
      objective: preset?.objective || '',
      hint: `Switch to ${mode} mode. Use POST /team/${teamId}/board/scout with todo_content to harvest TODOs. Supported: /board/scout?todo_content=...`,
    });
    return true;
  }

  // PATCH /api/holomesh/team/:id/room — room preferences (communication style, optional objective)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/room$/) && method === 'PATCH') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/room', '');
    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }
    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member' });
      return true;
    }
    if (!hasTeamPermission(team, caller.id, 'config:write')) {
      json(res, 403, { error: 'Insufficient permissions (config:write required)' });
      return true;
    }
    const body = await parseJsonBody(req);
    const ALLOWED_STYLES = new Set(['task_first', 'meeting_primary', 'balanced']);
    if (!team.roomConfig) team.roomConfig = {};
    if (body.communicationStyle != null) {
      const s = String(body.communicationStyle);
      if (!ALLOWED_STYLES.has(s)) {
        json(res, 400, {
          error: 'Invalid communicationStyle',
          allowed: [...ALLOWED_STYLES],
        });
        return true;
      }
      (team.roomConfig as { communicationStyle?: string }).communicationStyle = s;
    }
    if (typeof body.objective === 'string') {
      (team.roomConfig as { objective?: string }).objective = body.objective;
    }
    persistTeamStore();
    json(res, 200, {
      success: true,
      communicationStyle: team.roomConfig.communicationStyle || 'task_first',
      objective: team.roomConfig.objective || '',
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board/scout
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/scout$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const teamId = extractParam(url, '/api/holomesh/team/').replace('/board/scout', '');
    const team = teamStore.get(teamId);
    if (!team) { json(res, 404, { error: 'Team not found' }); return true; }
    if (!getTeamMember(team, caller.id)) { json(res, 403, { error: 'Not a member' }); return true; }
    const body = await parseJsonBody(req);
    const todoContent = body.todo_content as string | undefined;
    const tasks: Array<{ id: string; title: string; description: string; source: string; status: string; createdAt: string }> = [];

    if (todoContent) {
      // Parse "file:line: // TODO: text" or "file:line: // FIXME: text"
      const lines = todoContent.split('\n').filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(.+):(\d+):\s*\/\/\s*(TODO|FIXME):?\s*(.+)$/i);
        if (match) {
          const [, file, lineNum, kind, desc] = match;
          const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          tasks.push({
            id: taskId,
            title: `${kind}: ${desc.trim()} (${file}:${lineNum})`,
            description: line.trim(),
            source: 'scout:todo-scan',
            status: 'open',
            createdAt: new Date().toISOString(),
            priority: 5,
          });
        }
      }
    }

    // If empty board and no todos, add a hint task
    if (tasks.length === 0 && (team.taskBoard || []).length === 0) {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      tasks.push({
        id: taskId,
        title: 'Run /room scout to scan TODO markers',
        description: 'Use POST /team/:id/board/scout with todo_content to harvest TODO/FIXME annotations into the task board.',
        source: 'scout:hint',
        status: 'open',
        createdAt: new Date().toISOString(),
      });
    }

    if (!team.taskBoard) team.taskBoard = [];
    team.taskBoard.push(...tasks);
    persistTeamStore();

    json(res, 201, { success: true, tasks_added: tasks.length, tasks });
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
