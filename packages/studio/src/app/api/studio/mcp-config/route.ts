export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

import { corsHeaders } from '../../_lib/cors';
// ─── GET /api/studio/mcp-config ─────────────────────────────────────────────
// Returns capability-based MCP configuration with branded aliases for
// existing surfaces. New agent forms should consume `format=capabilities`
// or `format=generic` rather than relying on client-brand presets.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL || 'https://holoscript.studio';
const MCP_URL = process.env.MCP_HOLOSCRIPT_URL || 'https://mcp.holoscript.net';
const ABSORB_URL = process.env.ABSORB_URL || 'https://absorb.holoscript.net';

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'capabilities';

  const mcpServers: Record<
    string,
    { command?: string; url?: string; args?: string[]; env?: Record<string, string> }
  > = {
    'holoscript-studio': {
      url: `${STUDIO_URL}/api/mcp/call`,
    },
    'holoscript-tools': {
      url: `${MCP_URL}/mcp`,
    },
    'holoscript-absorb': {
      url: `${ABSORB_URL}/mcp`,
    },
  };

  const capabilityConfig = {
    format: 'capabilities',
    servers: Object.entries(mcpServers).map(([name, config]) => ({
      name,
      url: config.url,
      protocol: 'mcp',
      transport: 'streamable-http',
      capabilities: ['tools', 'remote'],
    })),
    profiles: {
      streamable_http: {
        transport: 'streamable-http',
        protocol: 'mcp',
      },
      sse_legacy: {
        transport: 'sse',
        protocol: 'mcp',
      },
    },
    aliases: {
      claude: 'streamable_http',
      cursor: 'sse_legacy',
      generic: 'streamable_http',
    },
    documentation: `${STUDIO_URL}/docs/mcp`,
  };

  if (format === 'claude') {
    return NextResponse.json({
      format: 'claude',
      instructions:
        'Add this to your Claude Code MCP settings (~/.claude/settings.json under mcpServers)',
      mcpServers,
    });
  }

  if (format === 'cursor') {
    return NextResponse.json({
      format: 'cursor',
      instructions: 'Add this to .cursor/mcp.json in your project root',
      mcpServers: Object.fromEntries(
        Object.entries(mcpServers).map(([name, config]) => [
          name,
          { url: config.url, transport: 'sse' },
        ])
      ),
    });
  }

  if (format === 'capabilities') {
    return NextResponse.json(capabilityConfig);
  }

  // Generic format
  return NextResponse.json({
    ...capabilityConfig,
    format: 'generic',
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
