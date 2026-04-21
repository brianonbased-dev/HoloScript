export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

import { ENDPOINTS, getMoltbookKey } from '@holoscript/config';

import { corsHeaders } from '../../../_lib/cors';
const MOLTBOOK_API_BASE = ENDPOINTS.MOLTBOOK_API;
const MOLTBOOK_API_KEY = getMoltbookKey() || '';

type CrosspostInput = {
  title?: string;
  content?: string;
  community?: string;
  tags?: string[];
  authorAgent?: string;
  externalLink?: string;
  // Agent-discovery specific fields
  agentName?: string;
  agentCardUrl?: string;
  capabilities?: string[];
  summary?: string;
};

function buildDiscoveryPost(input: CrosspostInput): {
  title: string;
  content: string;
  community: string;
  tags: string[];
  authorAgent: string;
  externalLink?: string;
} {
  const community = input.community || 'holoscript';
  const tags =
    input.tags && input.tags.length > 0 ? input.tags : ['agent-discovery', 'a2a', 'holoscript'];

  if (input.title && input.content) {
    return {
      title: input.title,
      content: input.content,
      community,
      tags,
      authorAgent: input.authorAgent || 'HoloScript Studio Agent',
      externalLink: input.externalLink,
    };
  }

  const name = input.agentName || 'HoloScript Studio Agent';
  const cardUrl = input.agentCardUrl || 'https://studio.holoscript.net/.well-known/agent-card.json';
  const capabilities = (input.capabilities || []).slice(0, 10);

  const lines: string[] = [
    `## ${name} is now discoverable via A2A Agent Card`,
    '',
    input.summary ||
      'We just shipped an A2A-compatible agent card endpoint for automated discovery and inter-agent interoperability.',
    '',
    `**Agent Card**: ${cardUrl}`,
  ];

  if (capabilities.length > 0) {
    lines.push('', '### Capabilities');
    for (const c of capabilities) {
      lines.push(`- ${c}`);
    }
  }

  lines.push('', 'Looking for integrations and feedback from other agent builders 🚀');

  return {
    title: `[A2A] ${name} discovery bridge`,
    content: lines.join('\n'),
    community,
    tags,
    authorAgent: input.authorAgent || name,
    externalLink: input.externalLink || cardUrl,
  };
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/social/crosspost/moltbook',
    methods: ['POST'],
    description: 'Crosspost an agent discovery update or custom content from Studio to Moltbook.',
    defaultCommunity: 'holoscript',
    defaults: {
      title: '[A2A] HoloScript Studio Agent discovery bridge',
      tags: ['agent-discovery', 'a2a', 'holoscript'],
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  if (!MOLTBOOK_API_KEY) {
    return NextResponse.json(
      { error: 'MOLTBOOK_API_KEY not configured on server.' },
      { status: 503 }
    );
  }

  let body: CrosspostInput;
  try {
    body = (await req.json()) as CrosspostInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const post = buildDiscoveryPost(body || {});

  try {
    const upstream = await fetch(`${MOLTBOOK_API_BASE.replace(/\/+$/, '')}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MOLTBOOK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: post.title,
        content: post.content,
        subreddit: post.community,
        tags: post.tags,
        author: post.authorAgent,
        externalUrl: post.externalLink,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await upstream.json().catch(() => ({}))) as {
      success?: boolean;
      postUrl?: string;
      error?: string;
      [k: string]: unknown;
    };

    if (!upstream.ok || data.success === false) {
      return NextResponse.json(
        {
          error: data.error || `Moltbook API returned ${upstream.status}`,
          status: upstream.status,
        },
        { status: upstream.status >= 500 ? 502 : upstream.status }
      );
    }

    return NextResponse.json({
      success: true,
      moltbookUrl: data.postUrl || null,
      postedByUserId: auth.user.id,
      postedAt: new Date().toISOString(),
      payload: {
        title: post.title,
        community: post.community,
        tags: post.tags,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = message.includes('TimeoutError') || message.includes('aborted');

    return NextResponse.json(
      { error: message, timeout: isTimeout },
      { status: isTimeout ? 504 : 502 }
    );
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
