/**
 * Tool catalog + retriever — Brittney's "find_tools" progressive disclosure.
 *
 * Problem (founder 2026-06-13: "way too many tools and avenues"): the `full`
 * tier hands frontier models the entire ~90-definition registry every round,
 * plus mcp_call_tool opens the whole orchestrator surface. The toolTiers.ts
 * evidence shows big registries measurably degrade tool-calling — pickers drown.
 *
 * Fix: show a slim CORE set up front + a single `find_tools(goal)` tool. The
 * model calls find_tools when it needs a capability it doesn't see; the route
 * ranks the full catalog, returns the matches, and ACTIVATES them (pushes them
 * into the exposed toolset) so they're natively callable on the next step. This
 * keeps the per-turn tool surface small AND reachable — retrieval, not a wall.
 *
 * Ranking is deterministic token-overlap (name+description) — no embedding
 * service on the hot path, so it never adds latency or a network dependency.
 */

import type { StudioToolDefinition } from './StudioAPITools';

/** Minimal structural shape shared with the route's ToolSpec. */
export interface NamedTool {
  name: string;
  description: string;
}

export const FIND_TOOLS_NAME = 'find_tools';

/** The one meta-tool that's always in Brittney's slim default set. */
export const FIND_TOOLS_TOOL: StudioToolDefinition = {
  type: 'function',
  function: {
    name: FIND_TOOLS_NAME,
    description:
      "Find the right tools for a goal. You start each chat with a small core toolset — when a task needs a capability you don't already see in your tools (compile to a target, run a simulation, query a codebase, render, deploy, inspect graphs, etc.), call find_tools with a short description of the goal. It returns the matching tools (name + what they do) AND activates them, so you can call them directly on your next step. Prefer this over assuming you lack a capability: the full ecosystem is reachable through find_tools, you just aren't shown every tool at once.",
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description:
            "What you're trying to do, in a few words — e.g. 'compile this scene to Unity', 'run a paid physics simulation', 'search the codebase for auth middleware', 'render the world on the fleet'.",
        },
        limit: {
          type: 'number',
          description: 'Max tools to return (default 6, max 12).',
        },
      },
      required: ['goal'],
    },
  },
};

// Low-signal tokens dropped from goal/description before overlap scoring.
const STOPWORDS = new Set([
  'the','a','an','to','of','for','and','or','in','on','with','this','that','it',
  'is','are','be','my','your','i','you','we','use','using','via','into','as','at',
  'by','from','run','make','get','do','can','could','help','need','want','please',
  'tool','tools','call','then','so','if','when','what','which','how','me','about',
]);

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Rank tools by token overlap between the goal and each tool's name+description.
 * A name hit is the strongest signal (exact verb), a raw-name substring next
 * (`compile_to_unity` ⟵ "unity"), a description hit weakest. Deterministic.
 */
export function rankToolsForGoal<T extends NamedTool>(
  goal: string,
  specs: ReadonlyArray<T>,
  limit = 6
): T[] {
  const goalTokens = new Set(tokenize(goal));
  if (goalTokens.size === 0) return [];
  const scored = specs
    .map((spec) => {
      const nameTokens = new Set(tokenize(spec.name));
      const descTokens = new Set(tokenize(spec.description));
      const rawName = spec.name.toLowerCase();
      let score = 0;
      for (const g of goalTokens) {
        if (nameTokens.has(g)) score += 3;
        else if (rawName.includes(g)) score += 2;
        else if (descTokens.has(g)) score += 1;
      }
      return { spec, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const k = Math.max(1, Math.min(12, Math.floor(limit) || 6));
  return scored.slice(0, k).map((x) => x.spec);
}

/**
 * The slim default toolset shown up-front: the high-signal CORE verbs (scene
 * CRUD, workspace agency, ecosystem channels) that are present in this lane's
 * catalog, plus find_tools so everything else is reachable on demand.
 */
export function buildSlimDefault<T extends NamedTool>(
  fullCatalog: ReadonlyArray<T>,
  coreNames: ReadonlyArray<string>,
  findToolsSpec: T
): T[] {
  const core = new Set(coreNames);
  const slim = fullCatalog.filter((t) => core.has(t.name));
  if (!slim.some((t) => t.name === FIND_TOOLS_NAME)) slim.push(findToolsSpec);
  return slim;
}

export interface FindToolsOutcome<T extends NamedTool> {
  result: { success: boolean; data?: unknown; error?: string };
  /** Tools to push into the exposed set so the model can call them next step. */
  activate: T[];
}

/**
 * Execute a find_tools call: rank the full catalog for the goal (skipping tools
 * already active and find_tools itself), returning a model-facing result plus
 * the specs the route should activate.
 */
export function executeFindTools<T extends NamedTool>(
  args: Record<string, unknown>,
  fullCatalog: ReadonlyArray<T>,
  alreadyActive: ReadonlySet<string>
): FindToolsOutcome<T> {
  const goal = typeof args['goal'] === 'string' ? (args['goal'] as string) : '';
  if (!goal.trim()) {
    return {
      result: {
        success: false,
        error: 'find_tools needs a `goal` — a short description of what you want to do.',
      },
      activate: [],
    };
  }
  const limit = typeof args['limit'] === 'number' ? (args['limit'] as number) : 6;
  const candidates = fullCatalog.filter(
    (t) => t.name !== FIND_TOOLS_NAME && !alreadyActive.has(t.name)
  );
  const matches = rankToolsForGoal(goal, candidates, limit);
  if (matches.length === 0) {
    return {
      result: {
        success: true,
        data: {
          goal,
          tools: [],
          note: 'No additional tools matched. You may already have what you need in your current toolset, or retry with a more specific goal (name the target, format, or action).',
        },
      },
      activate: [],
    };
  }
  return {
    result: {
      success: true,
      data: {
        goal,
        activated: matches.map((m) => m.name),
        tools: matches.map((m) => ({ name: m.name, description: m.description })),
        note: 'These tools are now active — call them directly on your next step.',
      },
    },
    activate: matches,
  };
}
