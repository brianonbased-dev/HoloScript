export const maxDuration = 300;

import { NextResponse } from 'next/server';

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
        description: 'Create and edit 3D scenes using HoloScript DSL or visual node graph',
        tools: [
          'parse_hs',
          'parse_holo',
          'validate_holoscript',
          'generate_object',
          'generate_scene',
        ],
      },
      compilation: {
        description: 'Compile HoloScript to 17 backend targets',
        targets: [
          'three',
          'r3f',
          'gltf',
          'usd',
          'vrm',
          'vrchat',
          'aframe',
          'babylon',
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
          '2000+ composable traits for physics, materials, animation, economic, spatial behaviors',
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
      mcp: 'POST /api/mcp/call — proxy to 158+ MCP tools (verify via mcp.holoscript.net/health)',
      rest: '143 REST API endpoints at /api/*',
      websocket: 'Collaboration rooms via /api/rooms',
      quickstart: 'POST /api/studio/quickstart — one-request onboarding',
      mcp_config: 'GET /api/studio/mcp-config?format=claude|cursor|generic',
    },

    pages: 43,
    api_routes: 143,
    mcp_tools: 158,
    absorb_tools: 20,
    traits:
      '617 trait files (composable behaviors for physics, materials, animation, economics, spatial)',
    compilation_targets: 17,
    compilers: 47,
    components: 316,
    hooks: 148,
  });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
