export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { fetchHoloMeshJson } from '../../../../../lib/holomesh-proxy';
import {
  asBoolean,
  asNumber,
  asObject,
  asObjectArray,
  asString,
  asStringArray,
  normalizeAgent,
  reputationTier,
  spliceCompositionState,
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
};

type ProfilePayload = {
  profile?: unknown;
};

const SURFACES: Record<string, string> = {
  landing: 'holomesh-landing.hsplus',
  'profile/self': 'holomesh-profile.hsplus',
};

function resolveCompositionsDir(): string {
  for (const start of [process.cwd(), __dirname]) {
    let dir = start;
    for (let i = 0; i < 12; i++) {
      const candidate = path.join(dir, 'compositions', 'studio');
      if (fs.existsSync(candidate)) return candidate;
      dir = path.dirname(dir);
    }
  }

  return path.join(process.cwd(), 'compositions', 'studio');
}

async function injectSelfProfile(code: string, req: NextRequest): Promise<string> {
  const [me, profile, agentsPayload] = await Promise.all([
    fetchHoloMeshJson<MePayload>('/api/holomesh/me', req),
    fetchHoloMeshJson<ProfilePayload>('/api/holomesh/profile', req),
    fetchHoloMeshJson<AgentsPayload>('/api/holomesh/agents?limit=500', req),
  ]);

  if (!me.ok || !me.data?.success) return code;

  const agents = asObjectArray(agentsPayload.data?.agents).map((agent) => normalizeAgent(agent));
  const agent =
    agents.find((candidate) => asString(candidate.id) === me.data?.agentId) ??
    normalizeAgent({
      id: me.data.agentId,
      name: me.data.name,
      walletAddress: me.data.wallet,
      online: true,
    });
  const custom = asObject(profile.data?.profile);
  const score = asNumber(agent.reputation);

  let next = code;
  next = spliceCompositionState(next, 'agentName', asString(agent.name, 'unknown-agent'));
  next = spliceCompositionState(next, 'agentId', asString(agent.id));
  next = spliceCompositionState(next, 'agentDid', asString(agent.walletAddress));
  next = spliceCompositionState(next, 'reputation', score);
  next = spliceCompositionState(next, 'reputationTier', reputationTier(score));
  next = spliceCompositionState(next, 'contributionCount', asNumber(agent.contributionCount));
  next = spliceCompositionState(next, 'peerCount', Math.max(agents.length - 1, 0));
  next = spliceCompositionState(next, 'queriesAnswered', asNumber(agent.queryCount));
  next = spliceCompositionState(next, 'themeColor', asString(custom.themeColor, '#6366f1'));
  next = spliceCompositionState(next, 'themeAccent', asString(custom.themeAccent, '#a78bfa'));
  next = spliceCompositionState(next, 'themeParticles', asString(custom.particles, 'none'));
  next = spliceCompositionState(
    next,
    'customBio',
    asString(custom.bio, 'A knowledge agent on the HoloMesh network.')
  );
  next = spliceCompositionState(next, 'customTitle', asString(custom.customTitle));
  next = spliceCompositionState(next, 'statusText', asString(custom.statusText));
  next = spliceCompositionState(next, 'isOnline', asBoolean(agent.online, true));
  next = spliceCompositionState(next, 'topTraits', asStringArray(agent.traits));
  return next;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const key = parts.join('/');
  const fileName = SURFACES[key] ?? (key.startsWith('profile/') ? 'holomesh-profile.hsplus' : '');

  if (!fileName) {
    return NextResponse.json({ error: `Unknown HoloMesh surface: ${key}` }, { status: 404 });
  }

  try {
    const filePath = path.join(resolveCompositionsDir(), fileName);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Composition not found: ${fileName}` }, { status: 404 });
    }

    const rawCode = fs.readFileSync(filePath, 'utf-8');
    const code = key === 'profile/self' ? await injectSelfProfile(rawCode, req) : rawCode;

    return NextResponse.json({
      kind: key,
      format: 'hsplus',
      code,
      sourcePath: filePath,
      generation: {
        native: true,
        mode: 'loaded-from-composition',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to load composition',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
