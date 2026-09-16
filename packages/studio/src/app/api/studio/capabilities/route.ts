export const maxDuration = 300;

import { NextResponse } from 'next/server';

import { corsHeaders } from '../../_lib/cors';
import { AGENT_AUTH, GATEWAY_TOOL_CALL_STATUS, MESH_KEY_HEADER } from '../gatewayStatus';
// ─── GET /api/studio/capabilities ───────────────────────────────────────────
// Returns structured capabilities for agent discovery.
// JSON-only endpoint optimized for programmatic consumption.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    name: 'HoloScript Studio',
    version: '0.1.0',
    description: 'Universal semantic platform for 3D scene creation, compilation, and deployment',

    domains: {
      scene_authoring: {
        description: 'Create and edit 3D scenes using HoloScript source or a visual node graph',
        tools: [
          'parse_hs',
          'parse_holo',
          'validate_holoscript',
          'generate_object',
          'generate_scene',
        ],
      },
      compilation: {
        description: 'Compile HoloScript to web, XR, asset, robotics, and engine targets',
        targets: [
          'gltf',
          'usd',
          'vrm',
          'vrchat',
          'unity',
          'unreal',
          'godot',
          'bevy',
          'html',
          'css',
          'svg',
          'ascii',
          'json',
        ],
        tools: ['compile_holoscript'],
      },
      traits: {
        description:
          'Composable traits for physics, materials, animation, economic, spatial behaviors',
        tools: ['list_traits', 'explain_trait', 'suggest_traits'],
      },
      codebase_intelligence: {
        description: 'Semantic GraphRAG search, impact analysis, and recursive improvement',
        tools: ['holo_absorb_repo', 'holo_query_codebase', 'holo_graph_status'],
      },
      export: {
        description: 'Export scenes to GLTF, USD, VRM, standalone HTML, embeddable widgets',
        endpoints: ['POST /api/export', 'POST /api/export/gltf', 'POST /api/export/v2'],
      },
      collaboration: {
        description: 'Real-time CRDT-based collaborative editing with WebSocket support',
        endpoints: ['POST /api/rooms'],
      },
      social: {
        description: 'Follow users, comment on scenes, view feed',
        endpoints: [
          'GET /api/social/feed',
          'POST /api/social/follows',
          'POST /api/social/comments',
        ],
      },
      oracle_boost: {
        description:
          'Hardware-aware oracle consultation with telemetry. Always active for enterprise tier.',
        always_on_tiers: ['enterprise'],
        endpoints: [
          'POST /api/studio/oracle-boost/status — validate prerequisites (enterprise: always oracle_ready)',
          'POST /api/studio/oracle-boost/setup — provision policy files',
          'GET /api/studio/oracle-boost/telemetry — aggregated usage + outcome data',
        ],
      },
    },

    hosting: {
      description: 'One-click deploy: HoloScript → self-contained HTML → S3/CDN → live URL',
      endpoints: [
        'POST /api/deploy — compile + upload, returns live URL',
        'GET /api/deploy — list deployments (status, URLs)',
        'GET /api/hosting/worlds — browse all published worlds',
      ],
    },

    embed: {
      description:
        'Standalone embeddable components — no Next.js, no Zustand, no Tailwind required',
      components: ['SceneViewer', 'StudioWidget', 'WebXRViewer'],
      import_path: '@holoscript/studio/embed',
    },

    connectors: {
      description: 'Bridge to external services for deployment and integration',
      services: ['github', 'railway', 'vscode', 'appstore', 'upstash', 'docker'],
      endpoints: [
        'POST /api/connectors/connect — establish connection',
        'POST /api/connectors/oauth — OAuth flow',
        'GET /api/connectors/activity — monitor activity',
      ],
    },

    access: {
      // This line used to read "proxy to HoloScript MCP tools; verify live via
      // mcp.holoscript.net/health", which was wrong twice over and both halves
      // cost an agent real time. It named no credential, so an agent wired
      // itself up exactly as told, sent nothing, and met a refusal it could not
      // diagnose. And it offered a health check on a DIFFERENT service: this
      // gateway forwards to ENDPOINTS.MCP_ORCHESTRATOR, while mcp.holoscript.net
      // is the mesh tools server (ENDPOINTS.HOLOSCRIPT_MCP). That host can be
      // green while this gateway is not answering — which is the state today —
      // so the check an agent was sent to run could only mislead it.
      mcp: `POST /api/mcp/call — Studio's gateway to the mesh tools. Send your own key as "${MESH_KEY_HEADER}: <your key>" and you run as yourself. See "authentication" and "known_issues" below; its health is NOT the health of mcp.holoscript.net, which is a different service.`,
      rest: 'Studio REST API endpoints at /api/*',
      websocket: 'Collaboration rooms via /api/rooms',
      quickstart:
        'POST /api/studio/quickstart — one-request onboarding. Needs a signed-in Studio session; the capability and config documents are readable without one.',
      mcp_config: 'GET /api/studio/mcp-config?format=claude|cursor|generic',
    },

    /**
     * Named for the same reason mcp-config and quickstart name it: an endpoint
     * that hands out a URL and no credential manufactures a caller who believes
     * it authenticated and is treated upstream as anonymous.
     */
    authentication: AGENT_AUTH,

    // The gateway advertised above is not answering today. Saying so beside the
    // URL is the other half of "no legitimate caller is refused in silence".
    known_issues: [GATEWAY_TOOL_CALL_STATUS],

    metrics_policy: {
      source: 'docs/NUMBERS.md',
      live_mcp_health: 'GET https://mcp.holoscript.net/health',
      note: 'Counts are intentionally not hardcoded here because production MCP tools, routes, compilers, traits, and tests change between deploys.',
    },
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
