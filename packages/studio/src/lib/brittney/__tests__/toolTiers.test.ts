/** Tool-diet tests (task_1781123525299_4uhh). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  CORE_RETRIEVABLE_TOOL_NAMES,
  CORE_TOOL_NAMES,
  TOOL_DIET_DIRECT_TOOL_BUDGET,
  TOOL_DIET_MAX_DEFAULT_TOOLS,
  coreToolNamesForPrompt,
  filterToolsToTier,
  tierForProvider,
  toolDietModeForPrompt,
} from '../toolTiers';
import { BRITTNEY_TOOLS } from '../BrittneyTools';
import { MCP_TOOLS } from '../MCPTools';
import { STUDIO_API_TOOLS } from '../StudioAPITools';
import { FIND_TOOLS_NAME } from '../toolCatalog';

afterEach(() => vi.unstubAllEnvs());

describe('tool tiers', () => {
  it('scene core plus find_tools stays within the 12-tool small-model budget', () => {
    expect(CORE_TOOL_NAMES.length).toBeLessThanOrEqual(TOOL_DIET_DIRECT_TOOL_BUDGET);
    expect(CORE_TOOL_NAMES.length + 1).toBeLessThanOrEqual(TOOL_DIET_MAX_DEFAULT_TOOLS);
    expect(CORE_TOOL_NAMES).toContain('create_object');
    expect(CORE_TOOL_NAMES).toContain('apply_code');
  });

  it('every core-retrievable name resolves to a real registered tool definition', () => {
    const registered = new Set(
      [...BRITTNEY_TOOLS, ...MCP_TOOLS, ...STUDIO_API_TOOLS].map((t) => t.function.name)
    );
    for (const name of CORE_RETRIEVABLE_TOOL_NAMES) {
      expect(registered.has(name), `core-retrievable tool ${name} is not registered`).toBe(true);
    }
  });

  it('mode-scopes the direct default tools for the latest prompt', () => {
    const scene = coreToolNamesForPrompt('Build a small park with benches and trees');
    expect(toolDietModeForPrompt('Build a small park with benches and trees')).toBe('scene');
    expect(scene).toContain('create_object');
    expect(scene).toContain('apply_code');
    expect(scene).not.toContain('board_add_task');

    const board = coreToolNamesForPrompt('Add a task to the team board');
    expect(toolDietModeForPrompt('Add a task to the team board')).toBe('ecosystem');
    expect(board).toContain('board_add_task');
    expect(board).toContain('suggest_ecosystem_gap');
    expect(board).not.toContain('create_object');

    const workspace = coreToolNamesForPrompt('Fix the repo code and run the workspace build');
    expect(toolDietModeForPrompt('Fix the repo code and run the workspace build')).toBe(
      'workspace'
    );
    expect(workspace).toContain('workspace_write_file');
    expect(workspace).toContain('workspace_build');
    expect(workspace).toContain('absorb_query_graph');

    const data = coreToolNamesForPrompt('Map this CSV of sensor readings into a live scene');
    expect(toolDietModeForPrompt('Map this CSV of sensor readings into a live scene')).toBe('data');
    expect(data).toContain('map_csv');
    expect(data).toContain('map_data');
    expect(data).toContain('select_modality');

    for (const names of [scene, board, workspace, data]) {
      expect(names.length).toBeLessThanOrEqual(TOOL_DIET_DIRECT_TOOL_BUDGET);
      expect([...names, FIND_TOOLS_NAME].length).toBeLessThanOrEqual(TOOL_DIET_MAX_DEFAULT_TOOLS);
    }
  });

  it('sovereign backends get core; frontier BYOK gets full', () => {
    expect(tierForProvider('ollama')).toBe('core');
    expect(tierForProvider('fleet')).toBe('core');
    expect(tierForProvider('cloud')).toBe('core');
    expect(tierForProvider('anthropic')).toBe('full');
    expect(tierForProvider('xai')).toBe('full');
    expect(tierForProvider(undefined)).toBe('full');
  });

  it('BRITTNEY_TOOL_TIER env overrides the provider mapping', () => {
    vi.stubEnv('BRITTNEY_TOOL_TIER', 'full');
    expect(tierForProvider('ollama')).toBe('full');
    vi.stubEnv('BRITTNEY_TOOL_TIER', 'core');
    expect(tierForProvider('anthropic')).toBe('core');
  });

  it('filterToolsToTier keeps only the bounded retrievable set in core tier', () => {
    const defs = [...BRITTNEY_TOOLS, ...MCP_TOOLS, ...STUDIO_API_TOOLS];
    const core = filterToolsToTier(defs, 'core');
    expect(core.length).toBeLessThanOrEqual(CORE_RETRIEVABLE_TOOL_NAMES.length);
    expect(core.every((d) => CORE_RETRIEVABLE_TOOL_NAMES.includes(d.function.name))).toBe(true);
    expect(core.map((d) => d.function.name)).toContain('board_add_task');
    expect(core.map((d) => d.function.name)).toContain('workspace_write_file');
    expect(core.map((d) => d.function.name)).toContain('map_csv');
    expect(filterToolsToTier(defs, 'full').length).toBe(defs.length);
  });
});
