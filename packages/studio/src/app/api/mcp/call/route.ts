import { NextResponse } from 'next/server';

// ─── /api/mcp/call — HoloScript MCP Tool Proxy ───────────────────────────────
//
// Exposes all 55 HoloScript MCP tools to the browser via a Next.js API route.
// Acts as a same-origin proxy so the studio can call MCP tools without CORS
// or child-process concerns. Categorised to match index.ts tool groups.
//
// Categories (13):
//   Core (16)       — parse, validate, generate, render, share
//   Compiler (10)   — compile to Unity/Unreal/R3F/WebGPU/URDF/glTF/WASM
//   IDE (9)         — diagnostics, autocomplete, refactor, docs, definitions
//   Graph (6)       — parse-to-graph, visualize, diff, design, connections
//   Brittney AI (4) — explain errors, fix code, review, scaffold
//   Codebase (5)    — absorb, query, impact analysis, change detection
//   Graph RAG (2)   — semantic search, natural language Q&A
//   Networking (2)  — RPC state delta, authoritative state fetch
//   Snapshot (3)    — temporal snapshots, world rewind
//   Monitoring (1)  — telemetry metrics
//   GLTF (2)        — import glTF/GLB, compile to glTF/GLB
//   Self-Improve (2) — diagnose quality, validate improvements
//   Browser (3)     — launch, screenshot, execute (server-side headless)
//   Training (1)    — generate Hololand training data
//
// Request:  POST { tool: string, input: Record<string, unknown> }
// Response: { result: unknown } | { error: string, offline?: boolean }
// GET:      tool manifest { service, categories, tools[], count }
// ─────────────────────────────────────────────────────────────────────────────

// ── Tool allowlist ────────────────────────────────────────────────────────────

const TOOL_CATEGORIES: Record<string, string[]> = {
  core: [
    'parse_hs',
    'parse_holo',
    'validate_holoscript',
    'suggest_traits',
    'list_traits',
    'explain_trait',
    'generate_object',
    'generate_scene',
    'generate_3d_object',
    'convert_format',
    'render_preview',
    'get_examples',
    'get_syntax_reference',
    'analyze_code',
    'explain_code',
    'create_share_link',
  ],
  compiler: [
    'compile_holoscript',
    'compile_to_r3f',
    'compile_to_unity',
    'compile_to_unreal',
    'compile_to_urdf',
    'compile_to_webgpu',
    'compile_to_gltf',
    'get_compilation_status',
    'get_circuit_breaker_status',
    'list_export_targets',
  ],
  ide: [
    'hs_scan_project',
    'hs_diagnostics',
    'hs_autocomplete',
    'hs_refactor',
    'hs_docs',
    'hs_code_action',
    'hs_hover',
    'hs_go_to_definition',
    'hs_find_references',
  ],
  graph: [
    'holo_parse_to_graph',
    'holo_visualize_flow',
    'holo_get_node_connections',
    'holo_design_graph',
    'holo_diff_graphs',
    'holo_suggest_connections',
  ],
  ai: [
    'hs_ai_explain_error',
    'hs_ai_fix_code',
    'hs_ai_review',
    'hs_ai_scaffold',
  ],
  codebase: [
    'holo_absorb_repo',
    'holo_query_codebase',
    'holo_impact_analysis',
    'holo_detect_changes',
    'holo_graph_status',
  ],
  graphRag: [
    'holo_semantic_search',
    'holo_ask_codebase',
  ],
  networking: [
    'push_state_delta',
    'fetch_authoritative_state',
  ],
  snapshot: [
    'create_temporal_snapshot',
    'load_temporal_snapshot',
    'rewind_world_state',
  ],
  monitoring: [
    'get_telemetry_metrics',
  ],
  gltf: [
    'import_gltf',
    // compile_to_gltf already in compiler category — included once there
  ],
  selfImprove: [
    'holo_self_diagnose',
    'holo_validate_quality',
  ],
  browser: [
    'browser_launch',
    'browser_screenshot',
    'browser_execute',
  ],
  training: [
    'generate_hololand_training',
  ],
};

const ALL_TOOLS = new Set(Object.values(TOOL_CATEGORIES).flat());
const TOOL_COUNT = ALL_TOOLS.size;

const TOOL_TIMEOUT_MS = 60_000; // 60s for heavier compiler/codebase tools

// ── Route handlers ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Parse body
  let tool: string;
  let input: Record<string, unknown>;
  try {
    const body = await request.json();
    tool = String(body?.tool ?? '');
    input = (body?.input ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!tool) {
    return NextResponse.json({ error: 'Missing required field: tool' }, { status: 400 });
  }

  if (!ALL_TOOLS.has(tool)) {
    return NextResponse.json(
      {
        error: `Tool "${tool}" is not available through this proxy.`,
        hint: 'GET /api/mcp/call for the full tool manifest.',
      },
      { status: 400 }
    );
  }

  // Call the MCP handler in-process (no child spawn)
  try {
    const [
      { handleTool },
      { handleCompilerTool },
      { handleNetworkingTool },
      { handleSnapshotTool },
      { handleMonitoringTool },
      { handleCodebaseTool },
      { handleGraphRagTool },
      { handleSelfImproveTool },
      { handleGltfTool },
    ] = await Promise.all([
      import('@holoscript/mcp-server'),
      import('@holoscript/mcp-server/compiler-tools'),
      import('@holoscript/mcp-server/networking-tools'),
      import('@holoscript/mcp-server/snapshot-tools'),
      import('@holoscript/mcp-server/monitoring-tools'),
      import('@holoscript/mcp-server/codebase-tools'),
      import('@holoscript/mcp-server/graph-rag-tools'),
      import('@holoscript/mcp-server/self-improve-tools'),
      import('@holoscript/mcp-server/gltf-import-tools'),
    ]);

    // Dispatch through the same handler chain as the MCP server
    const dispatch = async () => {
      return (
        (await handleCompilerTool(tool, input)) ??
        (await handleNetworkingTool(tool, input)) ??
        (await handleSnapshotTool(tool, input)) ??
        (await handleMonitoringTool(tool, input)) ??
        (await handleCodebaseTool(tool, input)) ??
        (await handleGraphRagTool(tool, input)) ??
        (await handleSelfImproveTool(tool, input)) ??
        (await handleGltfTool(tool, input)) ??
        (await handleTool(tool, input))
      );
    };

    const result = await Promise.race([
      dispatch(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool "${tool}" timed out after ${TOOL_TIMEOUT_MS / 1000}s`)),
          TOOL_TIMEOUT_MS
        )
      ),
    ]);

    return NextResponse.json({ result, tool });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isOffline = message.includes('Cannot find module') || message.includes('timed out');
    return NextResponse.json(
      { error: message, ...(isOffline && { offline: true }) },
      { status: isOffline ? 503 : 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'HoloScript MCP Proxy',
    version: '2.0.0',
    count: TOOL_COUNT,
    categories: Object.fromEntries(
      Object.entries(TOOL_CATEGORIES).map(([k, v]) => [k, v.length])
    ),
    tools: Object.fromEntries(
      Object.entries(TOOL_CATEGORIES).map(([k, v]) => [k, v])
    ),
  });
}
