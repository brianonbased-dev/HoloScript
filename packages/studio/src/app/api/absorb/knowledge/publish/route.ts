export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

import { corsHeaders } from '../../../_lib/cors';
import { publishKnowledgeEntries } from '@/lib/knowledgePublication';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const HOLOMESH_KEY = process.env.HOLOMESH_API_KEY;

if (!HOLOMESH_KEY) {
  console.error(
    'FATAL: HOLOMESH_API_KEY environment variable is not set. Knowledge publish endpoint will reject requests.'
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entries = body.entries;
    const workspaceId = body.workspace_id;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing entries' }, { status: 400 });
    }

    if (!workspaceId) {
      return NextResponse.json({ success: false, error: 'Missing workspace_id' }, { status: 400 });
    }

    if (!HOLOMESH_KEY) {
      return NextResponse.json(
        { success: false, error: 'HOLOMESH_API_KEY environment variable is not set' },
        { status: 500 }
      );
    }

    const result = await publishKnowledgeEntries({
      entries,
      workspaceId,
      defaultPremium: body.default_premium === true,
      holomeshKey: HOLOMESH_KEY,
      mcpServerUrl: MCP_SERVER_URL,
    });

    return NextResponse.json({
      success: true,
      publishedCount: result.publishedCount,
      premium_count: result.premium_count,
      free_count: result.free_count,
      errors: result.errors,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
