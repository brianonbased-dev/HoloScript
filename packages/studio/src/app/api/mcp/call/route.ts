export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';

// ─── /api/mcp/call — HoloScript MCP Tool Proxy (Decoupled) ───────────────────
//
// This route acts purely as an API Gateway to forward requests from the React
// Studio frontend to the standalone external MCP Orchestrator and Absorb Service.
// It DOES NOT natively bundle the heavy `@holoscript/core` or `tree-sitter` AST parsers.
// ─────────────────────────────────────────────────────────────────────────────

import { ENDPOINTS } from '@holoscript/config/endpoints';

import { corsHeaders } from '../../_lib/cors';
let MCP_EXTERNAL_URL = ENDPOINTS.MCP_ORCHESTRATOR;
if (MCP_EXTERNAL_URL && !MCP_EXTERNAL_URL.startsWith('http')) {
  MCP_EXTERNAL_URL = `https://${MCP_EXTERNAL_URL}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body?.tool) {
      return NextResponse.json({ error: 'Missing required field: tool' }, { status: 400 });
    }

    // Proxy the tool call over the mesh network to the orchestrator layer
    // The orchestrator handles dispatching to absorb-service, mcp-server, uaa2-service, etc.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...forwardAuthHeaders(request),
    };

    const apiKey = process.env.HOLOSCRIPT_API_KEY || process.env.NEXT_PUBLIC_MCP_API_KEY;
    if (apiKey && !headers['x-mcp-api-key']) {
      headers['x-mcp-api-key'] = apiKey;
    }

    const res = await fetch(`${MCP_EXTERNAL_URL}/call`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        {
          error: `Mesh Orchestrator Error [${res.status}]: ${errText}`,
          offline: res.status >= 500,
        },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('TimeoutError') || message.includes('aborted');
    const isOffline = message.includes('ECONNREFUSED') || message.includes('fetch');
    return NextResponse.json(
      {
        error: `Failed to contact external MCP service: ${message}`,
        offline: isOffline,
        timeout: isTimeout,
      },
      { status: isOffline ? 503 : isTimeout ? 504 : 500 }
    );
  }
}

export async function GET() {
  try {
    const res = await fetch(`${MCP_EXTERNAL_URL}/servers`);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Mesh Orchestrator Error: ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json({
      service: 'HoloScript MCP API Gateway',
      environment: 'Decoupled',
      orchestrator_status: 'online',
      mesh_servers: data,
    });
  } catch (error) {
    return NextResponse.json({
      service: 'HoloScript MCP API Gateway',
      environment: 'Decoupled',
      orchestrator_status: 'offline',
      error: String(error),
    });
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
