import { NextRequest, NextResponse } from 'next/server';

// ─── POST /api/studio/quickstart ────────────────────────────────────────────
// One-request agent onboarding: returns capabilities, example workflows,
// MCP config, and a "hello world" scene compilation result.
// Mirrors HoloMesh V8 pattern: POST /api/holomesh/quickstart
// ─────────────────────────────────────────────────────────────────────────────

import { ENDPOINTS } from '@holoscript/config/endpoints';

const MCP_EXTERNAL_URL = ENDPOINTS.MCP_ORCHESTRATOR;

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL || 'https://studio.holoscript.net';
const MCP_URL = process.env.MCP_HOLOSCRIPT_URL || 'https://mcp.holoscript.net';

const HELLO_WORLD_SCENE = `scene HelloWorld {
  object Cube {
    position: [0, 1, 0]
    scale: [1, 1, 1]
    material: { color: "#4f46e5" }
  }

  light Sun {
    type: "directional"
    intensity: 1.2
    position: [5, 10, 5]
  }

  camera Main {
    position: [3, 3, 5]
    lookAt: [0, 1, 0]
  }
}`;

export async function POST(request: NextRequest) {
  // Try to compile the hello world scene via MCP
  let compilation = null;
  try {
    const res = await fetch(`${MCP_EXTERNAL_URL}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'compile_holoscript',
        args: { code: HELLO_WORLD_SCENE, target: 'three' },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      compilation = await res.json();
    }
  } catch {
    // MCP offline — still return quickstart without compilation
  }

  return NextResponse.json({
    welcome: 'HoloScript Studio Agent Quickstart',
    version: '0.1.0',

    capabilities: {
      scenes: 'Create, edit, compile, and export 3D scenes using HoloScript DSL',
      traits: '2000+ composable traits (physics, materials, animation, economic, spatial)',
      compilation: '17 backend targets (Three.js, React Three Fiber, GLTF, USD, VRChat, etc.)',
      mcp: '122 tools for parsing, compiling, graph analysis, and codebase intelligence',
      absorb: '20 tools for semantic GraphRAG search over codebases',
      collaboration: 'Real-time CRDT-based collaborative editing',
      export: 'GLTF, USD, VRM, standalone HTML, embeddable widgets',
    },

    quickstart_workflows: [
      {
        name: 'Compile HoloScript',
        description: 'Parse and compile .holo code to a target backend',
        mcp_tool: 'compile_holoscript',
        example: { code: 'object Cube { position: [0,1,0] }', target: 'three' },
      },
      {
        name: 'Suggest Traits',
        description: 'Get trait suggestions for an object based on context',
        mcp_tool: 'suggest_traits',
        example: { objectType: 'character', context: 'RPG game NPC' },
      },
      {
        name: 'Query Codebase',
        description: 'Semantic search over absorbed codebases via GraphRAG',
        mcp_tool: 'holo_query_codebase',
        example: { query: 'how does the compiler handle trait resolution?' },
      },
      {
        name: 'Generate Scene',
        description: 'Generate a complete scene from a natural language prompt',
        mcp_tool: 'generate_scene',
        example: { prompt: 'A floating island with a waterfall' },
      },
    ],

    mcp_config: {
      studio: `${STUDIO_URL}/api/mcp/call`,
      tools: `${MCP_URL}/mcp`,
      config_endpoint: `${STUDIO_URL}/api/studio/mcp-config?format=claude`,
    },

    hello_world: {
      code: HELLO_WORLD_SCENE,
      compilation: compilation || { status: 'mcp_offline', message: 'MCP service not available — scene not compiled' },
    },

    api_endpoints: {
      compile: 'POST /api/mcp/call { tool: "compile_holoscript", args: { code, target } }',
      generate: 'POST /api/generate { prompt, style? }',
      export: 'POST /api/export { sceneId, format }',
      health: 'GET /api/health',
      mcp_config: 'GET /api/studio/mcp-config?format=claude|cursor|generic',
      capabilities: 'GET /api/studio/capabilities',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/studio/quickstart',
    method: 'POST',
    description: 'One-request agent onboarding. Returns capabilities, example workflows, MCP config, and hello world compilation.',
  });
}
