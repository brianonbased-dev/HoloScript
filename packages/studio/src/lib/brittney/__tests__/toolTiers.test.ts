/** Tool-diet tests (task_1781123525299_4uhh). */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CORE_TOOL_NAMES, tierForProvider, filterToolsToTier } from '../toolTiers';
import { BRITTNEY_TOOLS } from '../BrittneyTools';
import { MCP_TOOLS } from '../MCPTools';

afterEach(() => vi.unstubAllEnvs());

describe('tool tiers', () => {
  it('core stays small enough for 4-8B pickers (<=14 names)', () => {
    expect(CORE_TOOL_NAMES.length).toBeLessThanOrEqual(14);
    expect(CORE_TOOL_NAMES).toContain('create_object');
    expect(CORE_TOOL_NAMES).toContain('apply_code');
    expect(CORE_TOOL_NAMES).toContain('board_add_task');
  });

  it('every core name resolves to a REAL registered tool definition', () => {
    const registered = new Set(
      [...BRITTNEY_TOOLS, ...MCP_TOOLS].map((t) => t.function.name)
    );
    for (const name of CORE_TOOL_NAMES) {
      expect(registered.has(name), `core tool ${name} is not registered`).toBe(true);
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

  it('filterToolsToTier keeps only core names in core tier and everything in full', () => {
    const defs = [...BRITTNEY_TOOLS, ...MCP_TOOLS];
    const core = filterToolsToTier(defs, 'core');
    expect(core.length).toBeLessThanOrEqual(CORE_TOOL_NAMES.length);
    expect(core.every((d) => CORE_TOOL_NAMES.includes(d.function.name))).toBe(true);
    expect(filterToolsToTier(defs, 'full').length).toBe(defs.length);
  });
});
