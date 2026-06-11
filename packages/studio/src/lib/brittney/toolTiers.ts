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
 *   core — the 12 scene verbs + the 2 ecosystem channels (sovereign backends:
 *          ollama / fleet / cloud, which serve <=8B models today)
 * BRITTNEY_TOOL_TIER=full|core overrides for experiments (and the fable5
 * before/after comparison this change must be validated with).
 */

export type ToolTier = 'full' | 'core';

/**
 * The diet: scene CRUD + traits + code + the two ecosystem channels + the
 * workspace agency verbs (founder 2026-06-10: build / write code / move
 * files must work on sovereign backends too — still ~19 tools, far under
 * the ~90-definition registry that drowned the 4B picker).
 */
export const CORE_TOOL_NAMES: readonly string[] = [
  'create_object',
  'delete_object',
  'move_object',
  'rotate_object',
  'scale_object',
  'rename_object',
  'duplicate_object',
  'list_objects',
  'get_object',
  'add_trait',
  'set_trait_property',
  'apply_code',
  'board_add_task',
  'suggest_ecosystem_gap',
  'workspace_list_files',
  'workspace_read_file',
  'workspace_write_file',
  'workspace_move_file',
  'workspace_build',
];

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
  const keep = new Set(CORE_TOOL_NAMES);
  return defs.filter((d) => keep.has(d.function.name));
}
