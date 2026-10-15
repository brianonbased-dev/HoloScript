export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { fetchHoloMeshJson, usesServerKeyFor } from '../../../../../lib/holomesh-proxy';
import {
  asBoolean,
  asNumber,
  asObject,
  asObjectArray,
  asString,
  normalizeAgent,
  reputationTier,
} from '../../../../../lib/holomesh-normalize';

import { corsHeaders } from '../../../_lib/cors';

type AgentsPayload = {
  agents?: unknown[];
};

type MePayload = {
  success?: boolean;
  agentId?: string;
  name?: string;
  wallet?: string;
  error?: string;
};

type ProfilePayload = {
  success?: boolean;
  profile?: unknown;
};

async function loadAgents(req: NextRequest) {
  const upstream = await fetchHoloMeshJson<AgentsPayload>('/api/holomesh/agents?limit=500', req);
  return asObjectArray(upstream.data?.agents).map((agent) => normalizeAgent(agent));
}

function findAgent(agents: Record<string, unknown>[], id: string) {
  const decoded = decodeURIComponent(id);
  return agents.find((agent) => asString(agent.id) === decoded || asString(agent.name) === decoded);
}

function buildProfilePayload(
  agent: Record<string, unknown>,
  agents: Record<string, unknown>[],
  profile: unknown
) {
  const score = asNumber(agent.reputation);
  const contributionCount = asNumber(agent.contributionCount);
  const queryCount = asNumber(agent.queryCount);
  const tier = reputationTier(score);
  const topPeers = agents
    .filter((peer) => asString(peer.id) !== asString(agent.id))
    .sort((a, b) => asNumber(b.reputation) - asNumber(a.reputation))
    .slice(0, 5);

  return {
    success: true,
    agent,
    reputation: {
      agentId: asString(agent.id),
      agentName: asString(agent.name),
      contributions: contributionCount,
      queriesAnswered: queryCount,
      reuseRate: asNumber(agent.reuseRate),
      score,
      tier,
    },
    topPeers,
    profile: asObject(profile),
    guestbookCount: 0,
    wallPosts: [],
    guestbook: [],
    badges: [],
    visitorCount: 0,
    friendCount: topPeers.length,
    isOnline: asBoolean(agent.online),
  };
}

/**
 * "self" with no HoloMesh key of the caller's own would be answered under
 * Studio's server key, i.e. as Studio's service agent (named "Founder" when
 * that key is the founder key). Every signed-in GitHub user was shown as
 * Founder (Creator Advocate audit 2026-10-14, item 3). Say so instead.
 */
const NO_AGENT_BODY = {
  success: false,
  code: 'no_holomesh_agent',
  error: 'No HoloMesh agent is linked to your account yet.',
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'self' && usesServerKeyFor(req)) {
    return NextResponse.json(NO_AGENT_BODY, { status: 404 });
  }
  const agents = await loadAgents(req);

  if (id === 'self') {
    const [me, profile] = await Promise.all([
      fetchHoloMeshJson<MePayload>('/api/holomesh/me', req),
      fetchHoloMeshJson<ProfilePayload>('/api/holomesh/profile', req),
    ]);

    if (!me.ok || !me.data?.success) {
      return NextResponse.json(
        { success: false, error: me.data?.error ?? 'Agent identity is not registered' },
        { status: me.status || 401 }
      );
    }

    const agent =
      findAgent(agents, me.data.agentId ?? '') ??
      normalizeAgent({
        id: me.data.agentId,
        name: me.data.name,
        walletAddress: me.data.wallet,
        traits: [],
        reputation: 0,
        contributionCount: 0,
        queryCount: 0,
        createdAt: new Date().toISOString(),
        online: true,
      });

    return NextResponse.json(buildProfilePayload(agent, agents, profile.data?.profile));
  }

  const agent = findAgent(agents, id);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json(buildProfilePayload(agent, agents, {}));
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
