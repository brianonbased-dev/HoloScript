import { NextRequest, NextResponse } from 'next/server';

function normalizeUrl(value?: string): string {
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

function toSkillObjects(raw: string): Array<{ id: string; name: string; description?: string }> {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
    }));
}

export async function GET(req: NextRequest) {
  const origin = normalizeUrl(process.env.NEXT_PUBLIC_STUDIO_URL) || req.nextUrl.origin;
  const apiBase = normalizeUrl(process.env.NEXT_PUBLIC_API_BASE_URL) || `${origin}/api`;

  const capabilityList = (
    process.env.A2A_AGENT_CAPABILITIES ||
    'compile_holoscript,parse_holo,validate_holoscript,generate_scene,generate_object,submit_task,status'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const skillObjects = toSkillObjects(
    process.env.A2A_AGENT_SKILLS ||
      'Scene generation,Pipeline compilation,Trait suggestion,Task orchestration'
  );

  const card = {
    protocol: 'a2a',
    schemaVersion: '1.0',
    id: process.env.A2A_AGENT_ID || 'holoscript-studio',
    name: process.env.A2A_AGENT_NAME || 'HoloScript Studio Agent',
    version: process.env.A2A_AGENT_VERSION || '6.0.2',
    description:
      process.env.A2A_AGENT_DESCRIPTION ||
      'A2A-capable HoloScript agent for composition generation, parsing, validation, and task orchestration.',
    url: origin,
    documentationUrl: `${origin}/docs`,
    iconUrl: `${origin}/icon-192.png`,
    status: 'online',
    capabilities: capabilityList,
    skills: skillObjects,
    endpoints: {
      tasks: `${apiBase}/a2a/tasks`,
      submit: `${apiBase}/a2a/submit`,
      status: `${apiBase}/a2a/status`,
      health: `${apiBase}/health`,
    },
    formats: {
      request: ['application/json'],
      response: ['application/json'],
    },
    security: {
      auth: process.env.A2A_AGENT_AUTH_MODE || 'bearer-or-session',
      notes: 'Use GitHub session token, bearer token, or trusted server-side credentials.',
    },
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(card, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
