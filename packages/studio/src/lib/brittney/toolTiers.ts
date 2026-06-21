/**
 * Tool-registry tiering — the "tool diet" for small sovereign models
 * (board task task_1781123525299_4uhh; founder arc 2026-06-10).
 *
 * Evidence: fable5 benchmark run 20260610T203030 — local qwen3.5:4b scored
 * 0/10 with ZERO tool executions under the full ~90-definition registry,
 * while reasoning correctly in prose (72° layout math, torque formula) and
 * even claiming it "lacks tool access". The same model tool-calls natively
 * and reliably with a small tool list (proven on /v1 and /api/chat).
 * Capacity, not capability: small pickers drown in big registries.
 *
 * Tiers:
 *   full — every registered tool (frontier BYOK backends: anthropic/xai/openai)
 *   core — the bounded catalog available to small-model retrieval/fallback.
 * The default exposed surface is stricter: a mode-scoped list of <=11 direct
 * tools plus the find_tools retriever that the route appends separately.
 * BRITTNEY_TOOL_TIER=full|core overrides for experiments (and the fable5
 * before/after comparison this change must be validated with).
 */

export type ToolTier = 'full' | 'core';
export type ToolDietMode = 'scene' | 'workspace' | 'ecosystem' | 'data';

export const TOOL_DIET_MAX_DEFAULT_TOOLS = 12;
const FIND_TOOLS_SLOT_COUNT = 1;
export const TOOL_DIET_DIRECT_TOOL_BUDGET = TOOL_DIET_MAX_DEFAULT_TOOLS - FIND_TOOLS_SLOT_COUNT;

/**
 * Default scene diet: high-signal scene CRUD, trait edits, and apply_code.
 * The route appends find_tools separately, so this list must stay <= 11.
 */
export const CORE_TOOL_NAMES: readonly string[] = [
  'create_object',
  'delete_object',
  'move_object',
  'rotate_object',
  'scale_object',
  'list_objects',
  'get_object',
  'add_trait',
  'set_trait_property',
  'apply_code',
  'holo_suggest_traits',
];

const MODE_TOOL_NAMES: Record<ToolDietMode, readonly string[]> = {
  scene: CORE_TOOL_NAMES,
  workspace: [
    'workspace_list_files',
    'workspace_read_file',
    'workspace_write_file',
    'workspace_move_file',
    'workspace_build',
    'workspace_git_status',
    'workspace_git_commit',
    'read_file',
    'search_code',
    'absorb_query_graph',
    'suggest_ecosystem_gap',
  ],
  ecosystem: [
    'board_add_task',
    'board_list_tasks',
    'suggest_ecosystem_gap',
    'knowledge_query',
    'read_ecosystem_canon',
    'list_packages',
    'get_capabilities',
    'mcp_discover_tools',
    'mcp_list_servers',
    'holomesh_team_board',
  ],
  data: [
    'map_csv',
    'map_data',
    'select_modality',
    'list_targets',
    'convert_format',
    'holo_compile',
    'holo_generate_scene',
    'holo_suggest_traits',
    'get_capabilities',
    'suggest_ecosystem_gap',
    'mcp_discover_tools',
  ],
};

const RETRIEVABLE_SCENE_EXTRAS = [
  'remove_trait',
  'compose_traits',
  'rename_object',
  'duplicate_object',
  'holo_list_traits',
  'holo_explain_trait',
] as const;

export const CORE_RETRIEVABLE_TOOL_NAMES: readonly string[] = [
  ...new Set([...Object.values(MODE_TOOL_NAMES).flat(), ...RETRIEVABLE_SCENE_EXTRAS]),
];

export function toolDietModeForPrompt(prompt: string | undefined): ToolDietMode {
  const text = prompt ?? '';
  if (
    /\b(csv|tabular|schema|sensor|data|mapping|map\s+\w+\s+data|modality|format|compile target|target list)\b/i.test(
      text
    )
  ) {
    return 'data';
  }
  if (/\b(board|task|todo|ticket|issue|room|holomesh|team queue|file this)\b/i.test(text)) {
    return 'ecosystem';
  }
  if (
    /\b(workspace|repo|repository|file|files|codebase|pull request|branch)\b/i.test(text) ||
    /\b(workspace|repo|repository)\s+(build|test|lint)\b/i.test(text) ||
    /\b(fix|edit|commit)\s+(the\s+)?(repo|repository|file|code|workspace)\b/i.test(text)
  ) {
    return 'workspace';
  }
  return 'scene';
}

export function coreToolNamesForPrompt(prompt: string | undefined): readonly string[] {
  const mode = toolDietModeForPrompt(prompt);
  return MODE_TOOL_NAMES[mode].slice(0, TOOL_DIET_DIRECT_TOOL_BUDGET);
}

export function tierForProvider(providerName: string | undefined): ToolTier {
  const override = process.env.BRITTNEY_TOOL_TIER;
  if (override === 'full' || override === 'core') return override;
  switch (providerName) {
    case 'ollama':
    case 'fleet':
    case 'cloud':
      return 'core';
    default:
      return 'full';
  }
}

export function filterToolsToTier<T extends { function: { name: string } }>(
  defs: T[],
  tier: ToolTier
): T[] {
  if (tier === 'full') return defs;
  const keep = new Set(CORE_RETRIEVABLE_TOOL_NAMES);
  return defs.filter((d) => keep.has(d.function.name));
}
