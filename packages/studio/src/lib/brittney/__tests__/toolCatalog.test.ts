/**
 * Tests for the find_tools progressive-disclosure catalog/retriever.
 */
import { describe, it, expect } from 'vitest';
import {
  FIND_TOOLS_TOOL,
  FIND_TOOLS_NAME,
  rankToolsForGoal,
  buildSlimDefault,
  executeFindTools,
  type NamedTool,
} from '../toolCatalog';

const CATALOG: Array<NamedTool & { input_schema: unknown }> = [
  { name: 'create_object', description: 'Create a 3D object in the scene', input_schema: {} },
  { name: 'add_trait', description: 'Add a trait to an object', input_schema: {} },
  {
    name: 'compile_to_unity',
    description: 'Compile the composition to a Unity project',
    input_schema: {},
  },
  { name: 'compile_to_unreal', description: 'Compile to Unreal Engine', input_schema: {} },
  {
    name: 'sim_run_paid',
    description: 'Run a paid physics simulation on the GPU fleet',
    input_schema: {},
  },
  {
    name: 'holo_query_codebase',
    description: 'Query the codebase graph for callers and symbols',
    input_schema: {},
  },
  {
    name: 'render_world_on_fleet',
    description: 'Render the world on the GPU fleet',
    input_schema: {},
  },
];

describe('FIND_TOOLS_TOOL definition', () => {
  it('is named find_tools and requires a goal', () => {
    expect(FIND_TOOLS_TOOL.function.name).toBe(FIND_TOOLS_NAME);
    expect(FIND_TOOLS_NAME).toBe('find_tools');
    expect(FIND_TOOLS_TOOL.function.parameters.required).toContain('goal');
  });
});

describe('rankToolsForGoal', () => {
  it('ranks the exact-target tool first', () => {
    const ranked = rankToolsForGoal('compile this scene to unity', CATALOG);
    expect(ranked[0]?.name).toBe('compile_to_unity');
  });

  it('discriminates between sibling tools by the goal keyword', () => {
    const unreal = rankToolsForGoal('compile to unreal engine', CATALOG);
    expect(unreal[0]?.name).toBe('compile_to_unreal');
  });

  it('matches on description tokens too', () => {
    const ranked = rankToolsForGoal('run a physics simulation', CATALOG);
    expect(ranked[0]?.name).toBe('sim_run_paid');
  });

  it('returns [] for an empty or stopword-only goal', () => {
    expect(rankToolsForGoal('', CATALOG)).toEqual([]);
    expect(rankToolsForGoal('the a to of', CATALOG)).toEqual([]);
  });

  it('returns [] when nothing overlaps', () => {
    expect(rankToolsForGoal('xyzzy plugh frobnicate', CATALOG)).toEqual([]);
  });

  it('respects the limit', () => {
    const ranked = rankToolsForGoal('compile render simulation codebase', CATALOG, 2);
    expect(ranked.length).toBeLessThanOrEqual(2);
  });
});

describe('buildSlimDefault', () => {
  it('keeps only core tools present in the catalog, plus find_tools', () => {
    const findSpec = {
      name: FIND_TOOLS_NAME,
      description: FIND_TOOLS_TOOL.function.description,
      input_schema: {},
    };
    const slim = buildSlimDefault(
      CATALOG,
      ['create_object', 'add_trait', 'not_in_catalog'],
      findSpec
    );
    const names = slim.map((t) => t.name).sort();
    expect(names).toEqual(['add_trait', 'create_object', 'find_tools']);
    // The heavy tools must NOT be in the slim default.
    expect(names).not.toContain('compile_to_unity');
    expect(names).not.toContain('sim_run_paid');
  });

  it('does not duplicate find_tools if it is already core', () => {
    const findSpec = { name: FIND_TOOLS_NAME, description: 'x', input_schema: {} };
    const cat = [...CATALOG, findSpec];
    const slim = buildSlimDefault(cat, ['create_object', FIND_TOOLS_NAME], findSpec);
    expect(slim.filter((t) => t.name === FIND_TOOLS_NAME)).toHaveLength(1);
  });
});

describe('executeFindTools', () => {
  it('fails closed without a goal', () => {
    const out = executeFindTools({}, CATALOG, new Set());
    expect(out.result.success).toBe(false);
    expect(out.activate).toEqual([]);
  });

  it('returns + activates the matching tools for a goal', () => {
    const out = executeFindTools({ goal: 'compile to unity' }, CATALOG, new Set(['create_object']));
    expect(out.result.success).toBe(true);
    const activatedNames = out.activate.map((t) => t.name);
    expect(activatedNames).toContain('compile_to_unity');
    const data = out.result.data as { activated: string[] };
    expect(data.activated).toContain('compile_to_unity');
  });

  it('never re-surfaces already-active tools', () => {
    const active = new Set(['compile_to_unity', 'compile_to_unreal']);
    const out = executeFindTools({ goal: 'compile to unity or unreal' }, CATALOG, active);
    for (const t of out.activate) {
      expect(active.has(t.name)).toBe(false);
    }
  });

  it('never surfaces find_tools itself', () => {
    const findSpec = {
      name: FIND_TOOLS_NAME,
      description: 'find the right tools',
      input_schema: {},
    };
    const out = executeFindTools({ goal: 'find tools' }, [...CATALOG, findSpec], new Set());
    expect(out.activate.map((t) => t.name)).not.toContain(FIND_TOOLS_NAME);
  });

  it('returns an honest empty result when nothing matches', () => {
    const out = executeFindTools({ goal: 'xyzzy plugh' }, CATALOG, new Set());
    expect(out.result.success).toBe(true);
    expect(out.activate).toEqual([]);
    const data = out.result.data as { tools: unknown[] };
    expect(data.tools).toEqual([]);
  });

  it('respects the limit arg', () => {
    const out = executeFindTools(
      { goal: 'compile render simulation codebase', limit: 2 },
      CATALOG,
      new Set()
    );
    expect(out.activate.length).toBeLessThanOrEqual(2);
  });
});
