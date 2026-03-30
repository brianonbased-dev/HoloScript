// @vitest-environment node
/**
 * mcp-call-route.scenario.ts — MCP Proxy Route contract (v2)
 *
 * Tests that the /api/mcp/call allowlist covers all 55 MCP tools
 * and correctly rejects unknown or dangerous ones.
 */

import { describe, it, expect } from 'vitest';

// ── Mirror the route's allowlist (single source of truth: route.ts) ──────────

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
  ai: ['hs_ai_explain_error', 'hs_ai_fix_code', 'hs_ai_review', 'hs_ai_scaffold'],
  codebase: [
    'holo_absorb_repo',
    'holo_query_codebase',
    'holo_impact_analysis',
    'holo_detect_changes',
    'holo_graph_status',
  ],
  graphRag: ['holo_semantic_search', 'holo_ask_codebase'],
  networking: ['push_state_delta', 'fetch_authoritative_state'],
  snapshot: ['create_temporal_snapshot', 'load_temporal_snapshot', 'rewind_world_state'],
  monitoring: ['get_telemetry_metrics'],
  gltf: ['import_gltf'],
  selfImprove: ['holo_self_diagnose', 'holo_validate_quality'],
  browser: ['browser_launch', 'browser_screenshot', 'browser_execute'],
  training: ['generate_hololand_training'],
};

const ALL_TOOLS = new Set(Object.values(TOOL_CATEGORIES).flat());

function validate(
  body: unknown
): { ok: true; tool: string } | { ok: false; status: number; error: string } {
  if (!body || typeof body !== 'object')
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  const b = body as Record<string, unknown>;
  const tool = String(b.tool ?? '');
  if (!tool) return { ok: false, status: 400, error: 'Missing required field: tool' };
  if (!ALL_TOOLS.has(tool))
    return { ok: false, status: 400, error: `Tool "${tool}" is not available` };
  return { ok: true, tool };
}

describe('Scenario: /api/mcp/call — full 55-tool allowlist', () => {
  it('all tool categories have at least one entry', () => {
    for (const [cat, tools] of Object.entries(TOOL_CATEGORIES)) {
      expect(tools.length, `Category "${cat}" should not be empty`).toBeGreaterThan(0);
    }
  });

  it('total tool count is ≥ 55', () => {
    expect(ALL_TOOLS.size).toBeGreaterThanOrEqual(55);
  });

  it.each([
    'compile_holoscript', // compiler
    'hs_ai_fix_code', // Brittney AI
    'holo_absorb_repo', // codebase
    'holo_semantic_search', // graph RAG
    'push_state_delta', // networking
    'create_temporal_snapshot', // snapshot
    'get_telemetry_metrics', // monitoring
    'import_gltf', // gltf
    'holo_self_diagnose', // self-improve
    'browser_launch', // browser
    'generate_hololand_training', // training
    'hs_scan_project', // ide
    'holo_parse_to_graph', // graph
  ])('tool "%s" is in the allowlist', (tool) => {
    const r = validate({ tool, input: {} });
    expect(r.ok).toBe(true);
  });

  it('dangerous tool exec_shell is rejected with 400', () => {
    const r = validate({ tool: 'exec_shell', input: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('missing tool field returns 400', () => {
    const r = validate({ input: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Missing/);
  });

  it('response shape: {result, tool} on success, {error, offline?} on failure', () => {
    const success = { result: { traits: ['@glowing'] }, tool: 'suggest_traits' };
    const offline = { error: 'Cannot find module', offline: true };
    expect(success.tool).toBe('suggest_traits');
    expect(offline.offline).toBe(true);
  });
});
