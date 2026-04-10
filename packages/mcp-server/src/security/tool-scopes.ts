/**
 * Tool Scope Mapping — Gate 2 Authorization
 *
 * Maps every MCP tool to the OAuth 2.1 scopes required to invoke it.
 * Gate 2 (LLM->MCP tool authorization) checks that the authenticated
 * token's scopes include the required scope for each tool call.
 *
 * Scope hierarchy:
 *   admin:*        → grants everything
 *   tools:read     → parse, validate, list, explain, analyze, documentation
 *   tools:write    → generate, compile, render, share, edit, convert
 *   tools:codebase → absorb, query, impact, detect changes, graph RAG
 *   tools:browser  → browser_launch, browser_execute, browser_screenshot
 *   tools:admin    → self-improve, diagnostics, training data
 *   a2a:tasks      → A2A task lifecycle
 *   scenes:read    → read scene data
 *   scenes:write   → store scenes
 */

import type { OAuthScope } from './oauth21';

// ── Tool-to-Scope Mapping ────────────────────────────────────────────────────

const TOOL_SCOPE_MAP: Record<string, OAuthScope[]> = {
  // === Read-only language tools ===
  parse_hs: ['tools:read'],
  parse_holo: ['tools:read'],
  parse_pipeline: ['tools:read'],
  validate_holoscript: ['tools:read'],
  list_traits: ['tools:read'],
  explain_trait: ['tools:read'],
  get_syntax_reference: ['tools:read'],
  get_examples: ['tools:read'],
  explain_code: ['tools:read'],
  analyze_code: ['tools:read'],

  // === Write / generative tools ===
  suggest_traits: ['tools:write'],
  suggest_2d_traits: ['tools:write'],
  generate_object: ['tools:write'],
  generate_scene: ['tools:write'],
  generate_semantic_ui: ['tools:write'],
  render_preview: ['tools:write'],
  create_share_link: ['tools:write'],
  convert_format: ['tools:write'],
  edit_holo: ['tools:write'],
  generate_3d_object: ['tools:write'],

  // === Graph understanding (read-only analysis) ===
  holo_parse_to_graph: ['tools:read'],
  holo_visualize_flow: ['tools:read'],
  holo_get_node_connections: ['tools:read'],
  holo_design_graph: ['tools:write'],
  holo_diff_graphs: ['tools:read'],
  holo_suggest_connections: ['tools:read'],

  // === IDE tools (read-heavy, some write) ===
  hs_scan_project: ['tools:read'],
  hs_diagnostics: ['tools:read'],
  hs_autocomplete: ['tools:read'],
  hs_refactor: ['tools:write'],
  hs_docs: ['tools:read'],
  hs_code_action: ['tools:write'],
  hs_hover: ['tools:read'],
  hs_go_to_definition: ['tools:read'],
  hs_find_references: ['tools:read'],

  // === Brittney-Lite AI ===
  hs_ai_explain_error: ['tools:read'],
  hs_ai_fix_code: ['tools:write'],
  hs_ai_review: ['tools:read'],
  hs_ai_scaffold: ['tools:write'],

  // === Codebase intelligence ===
  holo_graph_status: ['tools:codebase'],
  holo_absorb_repo: ['tools:codebase'],
  holo_query_codebase: ['tools:codebase'],
  holo_impact_analysis: ['tools:codebase'],
  holo_detect_changes: ['tools:codebase'],

  // === Graph RAG ===
  holo_semantic_search: ['tools:codebase'],
  holo_ask_codebase: ['tools:codebase'],

  // === Self-improve (admin) ===
  holo_self_diagnose: ['tools:admin'],
  holo_validate_quality: ['tools:admin'],

  // === Compiler tools ===
  compile_holoscript: ['tools:write'],
  compile_pipeline: ['tools:write'],
  compile_to_unity: ['tools:write'],
  compile_to_unreal: ['tools:write'],
  compile_to_urdf: ['tools:write'],
  compile_to_webgpu: ['tools:write'],
  compile_to_r3f: ['tools:write'],
  compile_to_godot: ['tools:write'],
  compile_to_openxr: ['tools:write'],
  get_compilation_status: ['tools:read'],

  // === Browser control ===
  browser_launch: ['tools:browser'],
  browser_execute: ['tools:browser'],
  browser_screenshot: ['tools:browser'],

  // === GLTF Import/Export ===
  import_gltf: ['tools:write'],
  compile_to_gltf: ['tools:write'],

  // === Networking ===
  push_state_delta: ['tools:write'],
  fetch_authoritative_state: ['tools:read'],

  // === Temporal Snapshots ===
  create_temporal_snapshot: ['tools:write'],
  load_temporal_snapshot: ['tools:read'],
  rewind_world_state: ['tools:write'],

  // === Monitoring ===
  get_telemetry_metrics: ['tools:read'],

  // === HoloTest ===
  execute_holotest: ['tools:admin'],

  // === Wisdom/Gotcha ===
  holo_query_wisdom: ['tools:read'],
  holo_list_gotchas: ['tools:read'],
  holo_check_gotchas: ['tools:read'],
  holo_add_wisdom: ['tools:admin'],
  holo_add_gotcha: ['tools:admin'],

  // === Training data generation (admin) ===
  generate_hololand_training: ['tools:admin'],

  // === Refactor/Codegen ===
  holo_refactor_plan: ['tools:write'],
  holo_scaffold: ['tools:write'],

  // === Absorb Service ===
  absorb_create_project: ['tools:codebase'],
  absorb_get_credits: ['tools:codebase'],
  absorb_run_absorb: ['tools:codebase'],
  absorb_run_improve: ['tools:codebase'],
  absorb_query: ['tools:codebase'],
  absorb_render: ['tools:write'],
  absorb_diff: ['tools:codebase'],
  absorb_get_pipeline: ['tools:codebase'],
  absorb_run_pipeline: ['tools:codebase'],
  absorb_get_project: ['tools:codebase'],

  // === HoloMesh (spatial mesh, A2A discovery) ===
  holomesh_status: ['tools:read'],
  holomesh_discover: ['tools:read'],
  holomesh_gossip: ['tools:write', 'tools:admin'],
  holomesh_contribute: ['tools:write'],
  holomesh_query: ['tools:read'],
  holomesh_subscribe: ['tools:read'],
  holomesh_collect: ['tools:write'],

  // === HoloMesh Board / Slots / Mode ===
  holomesh_board_list: ['tools:read'],
  holomesh_board_add: ['tools:write'],
  holomesh_board_claim: ['tools:write'],
  holomesh_board_complete: ['tools:write'],
  holomesh_slot_assign: ['tools:write', 'tools:admin'],
  holomesh_mode_set: ['tools:write', 'tools:admin'],

  // === Railway Deployment (registered dynamically via connector) ===
  railway_project_create: ['tools:admin'],
  railway_service_create: ['tools:admin'],
  railway_deploy: ['tools:admin'],
  railway_variable_set: ['tools:admin'],
  railway_domain_add: ['tools:admin'],
  railway_deployment_status: ['tools:read'],
};

// ── Scope Classification ─────────────────────────────────────────────────────

/** Risk levels for tool operations */
export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

const TOOL_RISK_MAP: Record<string, ToolRiskLevel> = {
  // Low risk: read-only, no side effects
  parse_hs: 'low',
  parse_holo: 'low',
  parse_pipeline: 'low',
  validate_holoscript: 'low',
  list_traits: 'low',
  explain_trait: 'low',
  get_syntax_reference: 'low',
  get_examples: 'low',
  explain_code: 'low',
  analyze_code: 'low',
  hs_hover: 'low',
  hs_docs: 'low',

  // Medium risk: generates content but no side effects
  suggest_traits: 'medium',
  suggest_2d_traits: 'medium',
  generate_object: 'medium',
  generate_scene: 'medium',
  generate_semantic_ui: 'medium',
  convert_format: 'medium',
  compile_holoscript: 'medium',
  compile_pipeline: 'medium',

  // High risk: external side effects, file I/O, browser control
  render_preview: 'high',
  create_share_link: 'high',
  edit_holo: 'high',
  browser_launch: 'high',
  browser_execute: 'high',
  browser_screenshot: 'high',
  holo_absorb_repo: 'high',

  // Critical: admin operations, self-modification
  holo_self_diagnose: 'critical',
  holo_validate_quality: 'critical',
  execute_holotest: 'critical',
  generate_hololand_training: 'critical',
  holo_add_wisdom: 'critical',
  holo_add_gotcha: 'critical',

  // HoloMesh: spatial networking
  holomesh_status: 'low',
  holomesh_discover: 'low',
  holomesh_query: 'low',
  holomesh_subscribe: 'low',
  holomesh_contribute: 'medium',
  holomesh_collect: 'medium',
  holomesh_gossip: 'high',

  // HoloMesh Board / Slots / Mode
  holomesh_board_list: 'low',
  holomesh_board_add: 'medium',
  holomesh_board_claim: 'medium',
  holomesh_board_complete: 'medium',
  holomesh_slot_assign: 'high',
  holomesh_mode_set: 'high',

  // Railway Deployment
  railway_project_create: 'critical',
  railway_service_create: 'critical',
  railway_deploy: 'critical',
  railway_variable_set: 'critical',
  railway_domain_add: 'high',
  railway_deployment_status: 'low',
};

// ── Gate 2: Tool Authorization ───────────────────────────────────────────────

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  requiredScopes?: OAuthScope[];
  grantedScopes?: OAuthScope[];
  riskLevel?: ToolRiskLevel;
}

/**
 * Gate 2: Authorize a tool invocation against the authenticated token's scopes.
 *
 * @param toolName - The MCP tool being invoked
 * @param tokenScopes - Scopes granted to the authenticated token
 * @returns Authorization result with reason if denied
 */
export function authorizeToolCall(
  toolName: string,
  tokenScopes: OAuthScope[]
): AuthorizationResult {
  // admin:* grants everything
  if (tokenScopes.includes('admin:*')) {
    return {
      authorized: true,
      riskLevel: getToolRiskLevel(toolName),
      grantedScopes: tokenScopes,
      requiredScopes: TOOL_SCOPE_MAP[toolName] || ['tools:read'],
    };
  }

  const requiredScopes = TOOL_SCOPE_MAP[toolName];

  // Unknown tools default to tools:read (fail-open for new tools,
  // but they still need at least read scope)
  if (!requiredScopes) {
    if (tokenScopes.length > 0) {
      return {
        authorized: true,
        riskLevel: 'medium',
        grantedScopes: tokenScopes,
        requiredScopes: ['tools:read'],
      };
    }
    return {
      authorized: false,
      reason: `No scopes granted and tool "${toolName}" is not in the scope map`,
      requiredScopes: ['tools:read'],
      grantedScopes: tokenScopes,
    };
  }

  // Check if token has ANY of the required scopes
  const hasScope = requiredScopes.some((required) => tokenScopes.includes(required));

  if (!hasScope) {
    return {
      authorized: false,
      reason: `Insufficient scope. Required one of: [${requiredScopes.join(', ')}]. Granted: [${tokenScopes.join(', ')}]`,
      requiredScopes,
      grantedScopes: tokenScopes,
      riskLevel: getToolRiskLevel(toolName),
    };
  }

  return {
    authorized: true,
    requiredScopes,
    grantedScopes: tokenScopes,
    riskLevel: getToolRiskLevel(toolName),
  };
}

/**
 * Get the risk level for a tool.
 */
export function getToolRiskLevel(toolName: string): ToolRiskLevel {
  return TOOL_RISK_MAP[toolName] || 'medium';
}

/**
 * Get the required scopes for a tool.
 */
export function getToolScopes(toolName: string): OAuthScope[] {
  return TOOL_SCOPE_MAP[toolName] || ['tools:read'];
}

/**
 * List all tools in a given scope.
 */
export function getToolsForScope(scope: OAuthScope): string[] {
  return Object.entries(TOOL_SCOPE_MAP)
    .filter(([, scopes]) => scopes.includes(scope))
    .map(([name]) => name);
}
