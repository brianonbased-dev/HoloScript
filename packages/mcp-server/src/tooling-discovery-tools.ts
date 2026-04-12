import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const toolingDiscoveryTools: Tool[] = [
  {
    name: 'get_tool_manifest',
    description:
      'Return a machine-readable manifest of all available tools including categories, tags, input schemas, and output schemas.',
    inputSchema: {
      type: 'object',
      properties: {
        includeInputSchema: {
          type: 'boolean',
          description: 'Include each tool input schema in the manifest response. Defaults to true.',
        },
        includeOutputSchema: {
          type: 'boolean',
          description: 'Include inferred output schema for each tool. Defaults to true.',
        },
        includeExamples: {
          type: 'boolean',
          description: 'Include minimal usage examples for selected tools. Defaults to false.',
        },
      },
    },
  },
  {
    name: 'suggest_tools_for_goal',
    description:
      'Given a natural language goal, suggest an ordered tool plan with rationale and optional bundles (parse+validate+compile, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Natural language goal (e.g., "compile this scene and verify it").',
        },
        maxSuggestions: {
          type: 'number',
          description: 'Maximum number of suggested tools to return. Defaults to 8.',
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'batch_tool_call',
    description:
      'Execute multiple tool calls in one request and return a structured array of per-tool results (success/error).',
    inputSchema: {
      type: 'object',
      properties: {
        calls: {
          type: 'array',
          description: 'Ordered list of tool calls to execute.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Tool name to invoke.' },
              args: { type: 'object', description: 'Arguments for that tool.' },
            },
            required: ['name'],
          },
        },
        stopOnError: {
          type: 'boolean',
          description: 'If true, stop executing remaining calls after first error. Defaults to false.',
        },
      },
      required: ['calls'],
    },
  },
];

interface OutputSchemaEntry {
  type: 'object';
  required?: string[];
  properties: Record<string, unknown>;
  additionalProperties?: boolean;
}

export interface ToolManifestEntry {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: OutputSchemaEntry;
  examples?: Array<{ args: Record<string, unknown> }>;
}

const EXPLICIT_OUTPUT_SCHEMAS: Record<string, OutputSchemaEntry> = {
  parse_hs: {
    type: 'object',
    required: ['success'],
    properties: {
      success: { type: 'boolean' },
      ast: { type: 'object' },
      errors: { type: 'array' },
      warnings: { type: 'array' },
      sourceMap: { type: 'object' },
      error: { type: 'string' },
    },
    additionalProperties: true,
  },
  parse_holo: {
    type: 'object',
    required: ['success'],
    properties: {
      success: { type: 'boolean' },
      composition: { type: 'object' },
      errors: { type: 'array' },
      error: { type: 'string' },
    },
    additionalProperties: true,
  },
  validate_holoscript: {
    type: 'object',
    required: ['valid'],
    properties: {
      valid: { type: 'boolean' },
      format: { type: 'string' },
      errors: { type: 'array' },
      warnings: { type: 'array' },
      summary: { type: 'string' },
      error: { type: 'string' },
    },
    additionalProperties: true,
  },
  compile_holoscript: {
    type: 'object',
    required: ['success'],
    properties: {
      success: { type: 'boolean' },
      target: { type: 'string' },
      output: { type: 'string' },
      warnings: { type: 'array' },
      error: { type: 'string' },
    },
    additionalProperties: true,
  },
  get_tool_manifest: {
    type: 'object',
    required: ['count', 'tools'],
    properties: {
      count: { type: 'number' },
      tools: { type: 'array' },
      categories: { type: 'object' },
    },
    additionalProperties: true,
  },
  suggest_tools_for_goal: {
    type: 'object',
    required: ['goal', 'suggestions'],
    properties: {
      goal: { type: 'string' },
      suggestions: { type: 'array' },
      suggestedBundles: { type: 'array' },
    },
    additionalProperties: true,
  },
  batch_tool_call: {
    type: 'object',
    required: ['results'],
    properties: {
      results: { type: 'array' },
      summary: { type: 'object' },
    },
    additionalProperties: true,
  },
};

function inferCategory(name: string): string {
  if (name.startsWith('compile_')) return 'compiler';
  if (name.startsWith('holo_')) return 'graph/codebase';
  if (name.startsWith('hs_ai_')) return 'ai-assistant';
  if (name.startsWith('hs_')) return 'ide';
  if (name.startsWith('holomesh_')) return 'holomesh';
  if (name.startsWith('browser_')) return 'browser';
  if (name.includes('trace') || name.includes('metrics') || name.includes('health')) return 'observability';
  if (name.includes('plugin')) return 'plugins';
  if (name.includes('budget') || name.includes('earnings') || name.includes('usage')) return 'economy';
  if (name.includes('simulation') || name.startsWith('solve_') || name.includes('cael')) return 'simulation';
  return 'core';
}

function inferOutputSchema(name: string): OutputSchemaEntry {
  const explicit = EXPLICIT_OUTPUT_SCHEMAS[name];
  if (explicit) return explicit;

  if (name.startsWith('compile_')) {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        target: { type: 'string' },
        output: { type: ['string', 'object'] },
        warnings: { type: 'array' },
        error: { type: 'string' },
      },
      additionalProperties: true,
    };
  }

  if (name.startsWith('holo_') || name.startsWith('hs_') || name.startsWith('holomesh_')) {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: ['object', 'array', 'string', 'number', 'boolean'] },
        error: { type: 'string' },
      },
      additionalProperties: true,
    };
  }

  return {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      result: { type: ['object', 'array', 'string', 'number', 'boolean'] },
      error: { type: 'string' },
    },
    additionalProperties: true,
  };
}

function inferTags(name: string, description?: string): string[] {
  const tags = new Set<string>([inferCategory(name)]);
  const desc = (description || '').toLowerCase();
  const n = name.toLowerCase();

  for (const t of ['parse', 'validate', 'compile', 'render', 'share', 'graph', 'ide', 'ai', 'simulation', 'cael', 'plugin', 'economy', 'observability']) {
    if (desc.includes(t) || n.includes(t)) tags.add(t);
  }

  return Array.from(tags);
}

function inferExamples(name: string): Array<{ args: Record<string, unknown> }> {
  if (name === 'parse_hs') return [{ args: { code: 'object Cube { geometry: "cube" }' } }];
  if (name === 'validate_holoscript') return [{ args: { code: 'composition "S" { object "C" { geometry: "cube" } }' } }];
  if (name === 'compile_holoscript') return [{ args: { code: 'composition "S" { object "C" { geometry: "cube" } }', target: 'r3f' } }];
  return [];
}

export function buildToolManifest(
  allTools: Tool[],
  opts: { includeInputSchema?: boolean; includeOutputSchema?: boolean; includeExamples?: boolean } = {}
): ToolManifestEntry[] {
  const includeInputSchema = opts.includeInputSchema !== false;
  const includeOutputSchema = opts.includeOutputSchema !== false;
  const includeExamples = opts.includeExamples === true;

  return allTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    category: inferCategory(tool.name),
    tags: inferTags(tool.name, tool.description),
    ...(includeInputSchema ? { inputSchema: tool.inputSchema as Record<string, unknown> } : {}),
    ...(includeOutputSchema ? { outputSchema: inferOutputSchema(tool.name) } : {}),
    ...(includeExamples ? { examples: inferExamples(tool.name) } : {}),
  }));
}

export function suggestToolsForGoal(
  goal: string,
  manifest: ToolManifestEntry[],
  maxSuggestions = 8
): {
  goal: string;
  suggestions: Array<{ name: string; score: number; reason: string }>;
  suggestedBundles: Array<{ name: string; tools: string[]; reason: string }>;
} {
  const q = goal.toLowerCase();
  const queryTokens = new Set(q.split(/[^a-z0-9_]+/).filter(Boolean));

  const scored = manifest
    .map((tool) => {
      const haystack = `${tool.name} ${tool.description || ''} ${tool.tags.join(' ')}`.toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (token.length < 2) continue;
        if (haystack.includes(token)) score += 2;
      }

      if (q.includes('compile') && tool.name.startsWith('compile_')) score += 3;
      if ((q.includes('validate') || q.includes('lint')) && tool.name.includes('validate')) score += 3;
      if ((q.includes('parse') || q.includes('ast')) && tool.name.startsWith('parse_')) score += 3;
      if (q.includes('graph') && tool.name.startsWith('holo_')) score += 2;
      if (q.includes('simulate') && (tool.tags.includes('simulation') || tool.name.startsWith('solve_'))) score += 3;

      return {
        name: tool.name,
        score,
        reason: `Matched by tokens/tags in: ${tool.name}`,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions);

  const suggestedBundles: Array<{ name: string; tools: string[]; reason: string }> = [];

  if (q.includes('parse') || q.includes('validate') || q.includes('compile')) {
    suggestedBundles.push({
      name: 'parse-validate-compile',
      tools: ['parse_hs', 'validate_holoscript', 'compile_holoscript'],
      reason: 'Common code pipeline for syntax, safety, and target output generation.',
    });
  }

  if (q.includes('simulation') || q.includes('cael')) {
    suggestedBundles.push({
      name: 'simulate-and-verify-trace',
      tools: ['solve_structural', 'verify_cael_trace'],
      reason: 'Run physics solver then verify CAEL hash-chain integrity.',
    });
  }

  return {
    goal,
    suggestions: scored,
    suggestedBundles,
  };
}

export async function handleBatchToolCall(
  args: Record<string, unknown>,
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<{
  results: Array<{ index: number; name: string; ok: boolean; result?: unknown; error?: string }>;
  summary: { total: number; succeeded: number; failed: number; stoppedEarly: boolean };
}> {
  const calls = Array.isArray(args.calls) ? args.calls : [];
  const stopOnError = args.stopOnError === true;

  const results: Array<{ index: number; name: string; ok: boolean; result?: unknown; error?: string }> = [];
  let stoppedEarly = false;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i] as { name?: string; args?: Record<string, unknown> };
    const name = call?.name;

    if (!name || typeof name !== 'string') {
      results.push({ index: i, name: '(invalid)', ok: false, error: 'Missing or invalid call.name' });
      if (stopOnError) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    if (name === 'batch_tool_call') {
      results.push({ index: i, name, ok: false, error: 'Nested batch_tool_call is not allowed' });
      if (stopOnError) {
        stoppedEarly = true;
        break;
      }
      continue;
    }

    try {
      const result = await dispatch(name, call.args || {});
      results.push({ index: i, name, ok: true, result });
    } catch (error) {
      results.push({
        index: i,
        name,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      if (stopOnError) {
        stoppedEarly = true;
        break;
      }
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return {
    results,
    summary: {
      total: calls.length,
      succeeded,
      failed,
      stoppedEarly,
    },
  };
}
