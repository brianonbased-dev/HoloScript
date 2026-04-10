import { NextRequest, NextResponse } from 'next/server';

// ─── GET /api/studio/mcp-config ─────────────────────────────────────────────
// Returns copy-paste MCP configuration for IDE agents (Claude, Cursor, etc.)
// Mirrors HoloMesh V8 pattern: GET /api/holomesh/mcp-config?format=claude|cursor|generic
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL || 'https://studio.holoscript.net';
const MCP_URL = process.env.MCP_HOLOSCRIPT_URL || 'https://mcp.holoscript.net';
const ABSORB_URL = process.env.ABSORB_URL || 'https://absorb.holoscript.net';

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'claude';

  const mcpServers: Record<string, { command?: string; url?: string; args?: string[]; env?: Record<string, string> }> = {
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

  if (format === 'claude') {
    return NextResponse.json({
      format: 'claude',
      instructions: 'Add this to your Claude Code MCP settings (~/.claude/settings.json under mcpServers)',
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

  // Generic format
  return NextResponse.json({
    format: 'generic',
    servers: Object.entries(mcpServers).map(([name, config]) => ({
      name,
      url: config.url,
      protocol: 'mcp',
      transport: 'streamable-http',
    })),
    documentation: `${STUDIO_URL}/docs/mcp`,
  });
}
