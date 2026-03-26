import { NextResponse } from 'next/server';
import { forwardAuthHeaders } from '@/lib/api-auth';

// ─── /api/mcp/call — HoloScript MCP Tool Proxy (Decoupled) ───────────────────
//
// This route acts purely as an API Gateway to forward requests from the React
// Studio frontend to the standalone external MCP Orchestrator and Absorb Service.
// It DOES NOT natively bundle the heavy `@holoscript/core` or `tree-sitter` AST parsers.
// ─────────────────────────────────────────────────────────────────────────────

const MCP_EXTERNAL_URL = process.env.MCP_ORCHESTRATOR_PUBLIC_URL || process.env.MCP_ORCHESTRATOR_URL || 'http://localhost:3001';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body?.tool) {
      return NextResponse.json({ error: 'Missing required field: tool' }, { status: 400 });
    }

    // Proxy the tool call over the mesh network to the orchestrator layer
    // The orchestrator handles dispatching to absorb-service, mcp-server, uaa2-service, etc.
    const res = await fetch(`${MCP_EXTERNAL_URL}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardAuthHeaders(request) },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Mesh Orchestrator Error [${res.status}]: ${errText}`, offline: res.status >= 500 },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isOffline = message.includes('ECONNREFUSED') || message.includes('fetch');
    return NextResponse.json(
      { error: `Failed to contact external MCP service: ${message}`, ...(isOffline && { offline: true }) },
      { status: isOffline ? 503 : 500 }
    );
  }
}

export async function GET() {
  try {
    const res = await fetch(`${MCP_EXTERNAL_URL}/servers`);
    if (!res.ok) {
      return NextResponse.json({ error: `Mesh Orchestrator Error: ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({
      service: 'HoloScript MCP API Gateway',
      environment: 'Decoupled',
      orchestrator_status: 'online',
      mesh_servers: data
    });
  } catch (error) {
    return NextResponse.json({
      service: 'HoloScript MCP API Gateway',
      environment: 'Decoupled',
      orchestrator_status: 'offline',
      error: String(error)
    });
  }
}
