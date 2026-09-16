export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

import { corsHeaders } from '../../_lib/cors';
import { GATEWAY_TOOL_CALL_STATUS } from '../gatewayStatus';
// ─── GET /api/studio/mcp-config ─────────────────────────────────────────────
// Returns capability-based MCP configuration with branded aliases for
// existing surfaces. New agent forms should consume `format=capabilities`
// or `format=generic` rather than relying on client-brand presets.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL || 'https://holoscript.studio';
const MCP_URL = process.env.MCP_HOLOSCRIPT_URL || 'https://mcp.holoscript.net';
const ABSORB_URL = process.env.ABSORB_URL || 'https://absorb.holoscript.net';

const MESH_KEY_HEADER = 'x-mcp-api-key';

/**
 * What an outside agent must send, and in which header.
 *
 * Doors audit 2026-09-15: this endpoint handed out the gateway URL with no
 * credential guidance at all, so an agent that wired itself up exactly as told
 * sent nothing and met a refusal it could not diagnose. The mesh services read
 * the key from `x-mcp-api-key` only, so naming the wrong form would be worse
 * than naming none.
 */
const AGENT_AUTH = {
  header: MESH_KEY_HEADER,
  value: '<your HoloMesh API key>',
  required: true,
  how: `Send your own key on every request as "${MESH_KEY_HEADER}: <your key>". You then run as yourself, and Studio's own key is never spent on your behalf.`,
  without_a_key:
    "Without a key, only a signed-in Studio browser session can reach the small set of tools Studio's own UI uses. Every other call is refused.",
  bearer: `The Studio gateway also accepts "Authorization: Bearer <key>" and forwards it as ${MESH_KEY_HEADER}; the mesh services themselves read only ${MESH_KEY_HEADER}.`,
};

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'capabilities';

  const mcpServers: Record<
    string,
    {
      command?: string;
      url?: string;
      args?: string[];
      env?: Record<string, string>;
      headers?: Record<string, string>;
      note?: string;
    }
  > = {
    'holoscript-studio': {
      url: `${STUDIO_URL}/api/mcp/call`,
      headers: { [MESH_KEY_HEADER]: AGENT_AUTH.value },
      // The block an agent is told to paste is the right place to say this
      // entry is not answering yet — the agent reads it before it calls.
      note: GATEWAY_TOOL_CALL_STATUS.what_happens,
    },
    'holoscript-tools': {
      url: `${MCP_URL}/mcp`,
      headers: { [MESH_KEY_HEADER]: AGENT_AUTH.value },
    },
    'holoscript-absorb': {
      url: `${ABSORB_URL}/mcp`,
      headers: { [MESH_KEY_HEADER]: AGENT_AUTH.value },
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
      auth: { header: MESH_KEY_HEADER, required: true },
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
    authentication: AGENT_AUTH,
    known_issues: [GATEWAY_TOOL_CALL_STATUS],
  };

  if (format === 'claude') {
    return NextResponse.json({
      format: 'claude',
      instructions: `Add this to your Claude Code MCP settings (~/.claude/settings.json under mcpServers). Replace ${AGENT_AUTH.value} with your own key — ${AGENT_AUTH.how}`,
      mcpServers,
      authentication: AGENT_AUTH,
    });
  }

  if (format === 'cursor') {
    return NextResponse.json({
      format: 'cursor',
      instructions: `Add this to .cursor/mcp.json in your project root. Replace ${AGENT_AUTH.value} with your own key — ${AGENT_AUTH.how}`,
      mcpServers: Object.fromEntries(
        Object.entries(mcpServers).map(([name, config]) => [
          name,
          // `note` rides along: this preset rebuilds the entry by hand, so
          // anything not named here is silently dropped from the block the
          // agent pastes — which is exactly where the warning has to survive.
          { url: config.url, transport: 'sse', headers: config.headers, note: config.note },
        ])
      ),
      authentication: AGENT_AUTH,
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
