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
        tools: ['parse_hs', 'parse_holo', 'validate_holoscript', 'generate_object', 'generate_scene'],
      },
      compilation: {
        description: 'Compile HoloScript to 17 backend targets',
        targets: ['three', 'r3f', 'gltf', 'usd', 'vrm', 'vrchat', 'aframe', 'babylon', 'unity', 'unreal', 'godot', 'bevy', 'html', 'css', 'svg', 'ascii', 'json'],
        tools: ['compile_holoscript'],
      },
      traits: {
        description: '2000+ composable traits for physics, materials, animation, economic, spatial behaviors',
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
        endpoints: ['GET /api/social/feed', 'POST /api/social/follows', 'POST /api/social/comments'],
      },
    },

    access: {
      mcp: 'POST /api/mcp/call — proxy to 122+ MCP tools',
      rest: '70 REST API endpoints at /api/*',
      websocket: 'Collaboration rooms via /api/rooms',
      quickstart: 'POST /api/studio/quickstart — one-request onboarding',
      mcp_config: 'GET /api/studio/mcp-config?format=claude|cursor|generic',
    },

    pages: 34,
    api_routes: 70,
    mcp_tools: 122,
    absorb_tools: 20,
    traits: '2000+',
    compilation_targets: 17,
  });
}
