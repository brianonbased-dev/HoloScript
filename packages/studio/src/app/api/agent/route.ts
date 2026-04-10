import { NextRequest, NextResponse } from 'next/server';

// ─── /api/agent — Agent-optimized JSON endpoints ────────────────────────────
// Clean JSON interface for common agent workflows.
// Avoids HTML-oriented responses; returns structured data only.
// ─────────────────────────────────────────────────────────────────────────────

import { ENDPOINTS } from '@holoscript/config/endpoints';

let MCP_EXTERNAL_URL = ENDPOINTS.MCP_ORCHESTRATOR;

if (MCP_EXTERNAL_URL && !MCP_EXTERNAL_URL.startsWith('http')) {
  MCP_EXTERNAL_URL = `https://${MCP_EXTERNAL_URL}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json(
        {
          error: 'Missing required field: action',
          available_actions: [
            'compile',
            'parse',
            'validate',
            'suggest_traits',
            'generate',
            'query',
            'list_traits',
            'explain_trait',
            'install_plugin',
            'discover_plugins',
          ],
        },
        { status: 400 }
      );
    }

    const toolMap: Record<string, string> = {
      compile: 'compile_holoscript',
      parse: 'parse_hs',
      validate: 'validate_holoscript',
      suggest_traits: 'suggest_traits',
      generate: 'generate_scene',
      query: 'holo_query_codebase',
      list_traits: 'list_traits',
      explain_trait: 'explain_trait',
      install_plugin: 'install_domain_plugin',
      discover_plugins: 'discover_plugins',
    };

    const tool = toolMap[action];
    if (!tool) {
      return NextResponse.json(
        { error: `Unknown action: ${action}`, available_actions: Object.keys(toolMap) },
        { status: 400 }
      );
    }

    const res = await fetch(`${MCP_EXTERNAL_URL}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args: params }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `MCP error [${res.status}]: ${errText}`, action, tool },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ action, tool, result: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('TimeoutError') || message.includes('aborted');
    const isOffline = message.includes('ECONNREFUSED');
    return NextResponse.json(
      { error: message, offline: isOffline, timeout: isTimeout },
      { status: isOffline ? 503 : isTimeout ? 504 : 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agent',
    method: 'POST',
    description: 'Agent-optimized JSON endpoint. Maps friendly action names to MCP tools.',
    body: '{ action: string, ...params }',
    actions: {
      compile: { tool: 'compile_holoscript', params: 'code, target' },
      parse: { tool: 'parse_hs', params: 'code' },
      validate: { tool: 'validate_holoscript', params: 'code' },
      suggest_traits: { tool: 'suggest_traits', params: 'objectType, context' },
      generate: { tool: 'generate_scene', params: 'prompt' },
      query: { tool: 'holo_query_codebase', params: 'query' },
      list_traits: { tool: 'list_traits', params: 'category?, search?' },
      explain_trait: { tool: 'explain_trait', params: 'name' },
      install_plugin: { tool: 'install_domain_plugin', params: 'plugin_name' },
      discover_plugins: { tool: 'discover_plugins', params: 'query, category?' },
    },
    example:
      '{ "action": "compile", "code": "object Cube { position: [0,1,0] }", "target": "three" }',
  });
}
