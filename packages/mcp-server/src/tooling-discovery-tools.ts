import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Tool health probe: status values
// ---------------------------------------------------------------------------

/** Wiring status for a single tool category returned by get_tool_health. */
export type ToolWiringStatus = 'live' | 'scaffold' | 'stub';

export interface ToolHealthEntry {
  /** Canonical tool name as registered in the MCP schema. */
  tool: string;
  /** Category inferred from tool name. */
  category: string;
  /**
   * live   — handler path is reachable and a minimal no-network canary probe
   *          returned a non-null result with the expected shape.
   * scaffold — handler is reachable but the underlying implementation is a
   *            stub (returns a fixed/empty payload, throws "not implemented",
   *            or canary check returned null).
   * stub   — handler case exists in dispatch but throws unconditionally, or
   *          the tool name is not wired in the handler at all (dispatch returns
   *          null for every call).
   */
  status: ToolWiringStatus;
  /** ISO timestamp of the probe. */
  last_checked: string;
  /** Human-readable reason for the assigned status. */
  reason: string;
}

export interface ToolHealthReport {
  checked_at: string;
  total: number;
  live: number;
  scaffold: number;
  stub: number;
  tools: ToolHealthEntry[];
}

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
          description:
            'If true, stop executing remaining calls after first error. Defaults to false.',
        },
      },
      required: ['calls'],
    },
  },
  {
    name: 'get_tool_health',
    description:
      'Probe each MCP tool category and return a per-tool wiring status: ' +
      '"live" (handler reachable + canary probe passed), "scaffold" (handler reachable but ' +
      'returns a stub/empty payload), or "stub" (handler not wired / unconditionally throws). ' +
      'Use this before relying on any tool to avoid overclaiming that a scaffold path is ' +
      'production-ready. Root cause of the W.122 fictional-route pattern — always call this ' +
      "first when uncertain about a tool's backing implementation.",
    inputSchema: {
      type: 'object',
      properties: {
        tools: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of specific tool names to probe. If omitted, probes a representative ' +
            'set covering all major categories.',
        },
        includeStubs: {
          type: 'boolean',
          description:
            'If true, include stub-status tools in the response (default: true). Set false to ' +
            'return only live and scaffold tools.',
        },
      },
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
      noToolExplanation: { type: 'string' },
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
  get_tool_health: {
    type: 'object',
    required: ['checked_at', 'total', 'live', 'scaffold', 'stub', 'tools'],
    properties: {
      checked_at: { type: 'string' },
      total: { type: 'number' },
      live: { type: 'number' },
      scaffold: { type: 'number' },
      stub: { type: 'number' },
      tools: { type: 'array' },
    },
    additionalProperties: true,
  },
};

function inferCategory(name: string): string {
  if (name.startsWith('compile_')) return 'compiler';
  if (name.startsWith('holo_')) return 'graph/codebase';
  if (name.startsWith('hs_ai_')) return 'ai-assistant';
  if (name.startsWith('hs_')) return 'ide';
  if (name.startsWith('holotune_')) return 'holotune';
  if (name.startsWith('holomesh_')) return 'holomesh';
  if (name.startsWith('browser_')) return 'browser';
  if (name.includes('trace') || name.includes('metrics') || name.includes('health'))
    return 'observability';
  if (name.includes('plugin')) return 'plugins';
  if (name.includes('budget') || name.includes('earnings') || name.includes('usage'))
    return 'economy';
  if (name.includes('simulation') || name.startsWith('solve_') || name.includes('cael'))
    return 'simulation';
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

  for (const t of [
    'parse',
    'validate',
    'compile',
    'render',
    'share',
    'graph',
    'ide',
    'ai',
    'simulation',
    'cael',
    'plugin',
    'economy',
    'observability',
    'mcp',
    'rest',
    'a2a',
    'cli',
    'control',
    'discovery',
    'health',
    'canary',
  ]) {
    if (desc.includes(t) || n.includes(t)) tags.add(t);
  }

  return Array.from(tags);
}

function inferExamples(name: string): Array<{ args: Record<string, unknown> }> {
  if (name === 'parse_hs') return [{ args: { code: 'object Cube { geometry: "cube" }' } }];
  if (name === 'validate_holoscript')
    return [{ args: { code: 'composition "S" { object "C" { geometry: "cube" } }' } }];
  if (name === 'compile_holoscript')
    return [
      { args: { code: 'composition "S" { object "C" { geometry: "cube" } }', target: 'webgpu' } },
    ];
  return [];
}

export function buildToolManifest(
  allTools: Tool[],
  opts: {
    includeInputSchema?: boolean;
    includeOutputSchema?: boolean;
    includeExamples?: boolean;
  } = {}
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

function getWordTokens(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function suggestToolsForGoal(
  goal: string,
  manifest: ToolManifestEntry[],
  maxSuggestions = 8
): {
  goal: string;
  suggestions: Array<{ name: string; score: number; reason: string }>;
  suggestedBundles: Array<{ name: string; tools: string[]; reason: string }>;
  noToolExplanation?: string;
} {
  const q = goal.toLowerCase();
  const queryTokens = new Set(q.split(/[^a-z0-9_]+/).filter(Boolean));

  const scored = manifest
    .map((tool) => {
      const haystack =
        `${tool.name} ${tool.description || ''} ${tool.tags.join(' ')}`.toLowerCase();
      const haystackWords = getWordTokens(haystack);
      let score = 0;
      for (const token of queryTokens) {
        if (token.length < 2) continue;
        if (haystackWords.some((w) => w === token || w.startsWith(token))) score += 2;
      }

      if (q.includes('compile') && tool.name.startsWith('compile_')) score += 3;
      if ((q.includes('validate') || q.includes('lint')) && tool.name.includes('validate'))
        score += 3;
      if ((q.includes('parse') || q.includes('ast')) && tool.name.startsWith('parse_')) score += 3;
      if (q.includes('graph') && tool.name.startsWith('holo_')) score += 2;
      if (
        q.includes('simulate') &&
        (tool.tags.includes('simulation') || tool.name.startsWith('solve_'))
      )
        score += 3;

      // MCP, REST, A2A, CLI, control-plane, discovery, health, canary
      if (
        (q.includes('mcp') || q.includes('tool manifest')) &&
        (tool.name === 'get_tool_manifest' ||
          tool.name === 'suggest_tools_for_goal' ||
          tool.name === 'batch_tool_call' ||
          tool.name === 'get_tool_health' ||
          tool.name === 'holoscript_discover_tools' ||
          tool.name === 'compile_to_mcp_config')
      )
        score += 4;
      if (
        (q.includes('rest') || q.includes('api') || q.includes('control') || q.includes('rcp')) &&
        (tool.name === 'get_api_reference' ||
          tool.name === 'get_circuit_breaker_status' ||
          tool.name === 'fetch_authoritative_state' ||
          tool.name === 'get_dev_dashboard_state' ||
          tool.name === 'holo_service_scaffold')
      )
        score += 4;
      if (
        q.includes('a2a') &&
        (tool.name === 'compile_to_a2a_agent_card' ||
          tool.name === 'discover_agents' ||
          tool.name === 'discover_plugins')
      )
        score += 4;
      if (
        (q.includes('cli') || q.includes('command line')) &&
        (tool.name === 'holoscript_batch_execute' ||
          tool.name === 'execute_holotest' ||
          tool.name === 'holo_run_tests_targeted' ||
          tool.name === 'holo_run_related_tests')
      )
        score += 4;
      if (
        q.includes('discovery') &&
        (tool.name.startsWith('discover_') ||
          tool.name === 'holoscript_discover_tools' ||
          tool.name === 'holo_oracle_discover')
      )
        score += 4;
      if (
        (q.includes('health') || q.includes('diagnostic')) &&
        (tool.name === 'get_agent_health' ||
          tool.name === 'holoscript_code_health' ||
          tool.name === 'holo_self_diagnose' ||
          tool.name === 'get_telemetry_metrics' ||
          tool.name === 'get_metrics_prometheus')
      )
        score += 4;
      if (
        (q.includes('canary') ||
          q.includes('gap') ||
          q.includes('wired') ||
          q.includes('scaffold') ||
          q.includes('stub')) &&
        (tool.name === 'get_tool_health' ||
          tool.name === 'execute_holotest' ||
          tool.name === 'execute_eval' ||
          tool.name === 'holo_run_tests_targeted' ||
          tool.name === 'holo_run_related_tests' ||
          tool.name === 'holoscript_code_health' ||
          tool.name === 'holo_self_diagnose' ||
          tool.name === 'get_circuit_breaker_status')
      )
        score += 4;

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

  if (
    q.includes('mcp') ||
    q.includes('rest') ||
    q.includes('a2a') ||
    q.includes('cli') ||
    q.includes('control') ||
    q.includes('discovery') ||
    q.includes('health') ||
    q.includes('canary')
  ) {
    suggestedBundles.push({
      name: 'control-plane-and-surface-audit',
      tools: [
        'get_tool_health',
        'get_tool_manifest',
        'get_api_reference',
        'get_circuit_breaker_status',
        'get_agent_health',
        'holoscript_code_health',
        'discover_agents',
        'execute_holotest',
        'execute_eval',
      ],
      reason:
        'Audit MCP, REST, A2A, and CLI surfaces: tool wiring health, manifest discovery, API docs, circuit breakers, health checks, and canary tests.',
    });
  }

  const noToolExplanation =
    scored.length === 0
      ? `No tools matched for goal: "${goal}". Analyzed tokens: ${Array.from(queryTokens)
          .filter((t) => t.length >= 2)
          .join(', ')}. Try rephrasing or use get_tool_manifest for a full listing.`
      : undefined;

  return {
    goal,
    suggestions: scored,
    suggestedBundles,
    noToolExplanation,
  };
}

// ---------------------------------------------------------------------------
// Tool health probe implementation
// ---------------------------------------------------------------------------

/**
 * Categorised list of representative tool names.
 * Each entry is the canonical registered MCP tool name. The probe attempts a
 * minimal call via `dispatch` and classifies the result.
 *
 * We do NOT exhaustively probe every tool — that would be slow and some tools
 * have mandatory side-effects. Instead we probe one representative per
 * category, which is enough to surface scaffold vs live status for that whole
 * surface area.
 */
const REPRESENTATIVE_TOOLS: Record<string, string[]> = {
  parsing: ['parse_hs', 'parse_holo', 'parse_hs', 'parse_pipeline'],
  validation: ['validate_holoscript'],
  compiler: ['compile_holoscript', 'compile_to_webgpu'],
  'graph/codebase': ['holo_graph_status'],
  'ai-assistant': ['hs_ai_explain_error'],
  ide: ['hs_diagnostics'],
  holomesh: ['holomesh_status'],
  browser: ['browser_screenshot'],
  observability: ['get_agent_health', 'holoscript_code_health'],
  plugins: ['list_plugins'],
  economy: ['get_creator_earnings', 'settle_creator_payout'],
  simulation: ['verify_cael_trace'],
  holotune: ['holotune_status', 'holotune_launch'],
  discovery: ['get_tool_manifest', 'suggest_tools_for_goal'],
  tooling: ['batch_tool_call', 'get_tool_health'],
};

/**
 * Minimal "canary" argument sets for each tool: the smallest valid input that
 * should not touch external services or mutate state.
 */
const CANARY_ARGS: Record<string, Record<string, unknown>> = {
  parse_hs: { code: 'object Cube { geometry: "cube" }' },
  parse_holo: { code: 'composition "S" { object "C" { geometry: "cube" } }' },
  parse_pipeline: { source: 'step "a" { tool: "parse_hs" }' },
  validate_holoscript: { code: 'composition "S" { object "C" { geometry: "cube" } }' },
  compile_holoscript: {
    code: 'composition "S" { object "C" { geometry: "cube" } }',
    target: 'webgpu',
  },
  holo_graph_status: {},
  hs_ai_explain_error: { code: 'object Cube { geometry: "cube" }', errors: [] },
  hs_diagnostics: { code: 'object Cube { geometry: "cube" }' },
  holomesh_status: {},
  browser_screenshot: {}, // will stub — no real browser in probe
  get_agent_health: {},
  holoscript_code_health: { code: 'object Cube { geometry: "cube" }' },
  list_plugins: {},
  get_creator_earnings: {},
  settle_creator_payout: {},
  verify_cael_trace: { trace: [] },
  holotune_status: {},
  holotune_curate: {
    identity: 'canary',
    traceRows: [{ user: 'say hello', target: '<tool_call>{"name":"noop"}</tool_call>' }],
  },
  holotune_launch: { identity: 'canary', dryRun: true, corpusHash: 'sha256:canary' },
  holotune_eval: {
    identity: 'canary',
    baselineMetrics: { pass_rate: 0.5 },
    tunedMetrics: { pass_rate: 0.6 },
    requiredBenchmarks: ['pass_rate'],
  },
  holotune_promote: {
    identity: 'canary',
    dryRun: true,
    adapterUri: 'file:///tmp/canary-adapter',
    ggufUri: 'file:///tmp/canary.gguf',
  },
  holotune_serve: {
    identity: 'canary',
    adapterUri: 'file:///tmp/canary-adapter',
    ggufUri: 'file:///tmp/canary.gguf',
  },
  holotune_download: {
    identity: 'canary',
    ggufUri: 'file:///tmp/canary.gguf',
  },
  get_tool_manifest: { includeInputSchema: false, includeOutputSchema: false },
  suggest_tools_for_goal: { goal: 'parse holoscript', maxSuggestions: 2 },
  batch_tool_call: { calls: [] },
  get_tool_health: { tools: ['get_tool_manifest'], includeStubs: false },
};

/**
 * Classify a dispatch result for a tool as live / scaffold / stub.
 *
 * Rules:
 * - If dispatch throws with "not implemented", "not wired", "unsupported", or
 *   returns null → stub
 * - If dispatch throws any other error → scaffold (handler is reachable but
 *   the underlying path is incomplete)
 * - If dispatch returns a non-null result:
 *   - If result has `success: false` and an `error` field → scaffold
 *   - Otherwise → live
 */
async function probeOneTool(
  toolName: string,
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<ToolHealthEntry> {
  const category = inferCategory(toolName);
  const now = new Date().toISOString();
  const args = CANARY_ARGS[toolName] ?? {};

  let status: ToolWiringStatus;
  let reason: string;

  try {
    const result = await dispatch(toolName, args);

    if (result === null || result === undefined) {
      status = 'stub';
      reason = 'dispatch returned null — tool name not wired in handler switch';
    } else {
      const r = result as Record<string, unknown>;
      if (r['success'] === false && typeof r['error'] === 'string') {
        status = 'scaffold';
        reason = `handler reachable but returned success:false — ${String(r['error']).slice(0, 120)}`;
      } else {
        status = 'live';
        reason = 'canary probe returned non-null result with expected shape';
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (
      lower.includes('not implemented') ||
      lower.includes('not wired') ||
      lower.includes('unsupported tool') ||
      lower.includes('unknown tool') ||
      lower.includes('unrecognized')
    ) {
      status = 'stub';
      reason = `handler throws "not implemented" — ${msg.slice(0, 120)}`;
    } else {
      // Threw for another reason: missing required arg, parser error, etc.
      // The handler IS reachable; the underlying path is incomplete.
      status = 'scaffold';
      reason = `handler reachable but threw: ${msg.slice(0, 120)}`;
    }
  }

  return { tool: toolName, category, status, last_checked: now, reason };
}

/**
 * Build a full tool health report.
 *
 * @param requestedTools  If non-empty, probe only these tool names.
 *                        If empty, probe the representative set.
 * @param allRegistered   Full list of registered MCP tool names (for
 *                        marking any requested tool as stub when it is not
 *                        in the registry at all).
 * @param dispatch        MCP tool dispatch function.
 * @param includeStubs    Whether to include stub entries in the output.
 */
export async function buildToolHealthReport(
  requestedTools: string[],
  allRegistered: string[],
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  includeStubs = true
): Promise<ToolHealthReport> {
  const checkedAt = new Date().toISOString();

  // Determine the set of tool names to probe.
  let toProbe: string[];
  if (requestedTools.length > 0) {
    toProbe = requestedTools;
  } else {
    // Unique representative tools flattened from the category map.
    const seen = new Set<string>();
    toProbe = [];
    for (const names of Object.values(REPRESENTATIVE_TOOLS)) {
      for (const n of names) {
        if (!seen.has(n)) {
          seen.add(n);
          toProbe.push(n);
        }
      }
    }
  }

  const registeredSet = new Set(allRegistered);

  // Probe in parallel (bounded; representative set is ~20 tools max).
  const entries: ToolHealthEntry[] = await Promise.all(
    toProbe.map(async (toolName): Promise<ToolHealthEntry> => {
      // If the tool is not even registered, mark it stub immediately.
      if (!registeredSet.has(toolName)) {
        return {
          tool: toolName,
          category: inferCategory(toolName),
          status: 'stub',
          last_checked: checkedAt,
          reason: 'tool name not found in MCP tool registry',
        };
      }
      return probeOneTool(toolName, dispatch);
    })
  );

  const visible = includeStubs ? entries : entries.filter((e) => e.status !== 'stub');

  const live = visible.filter((e) => e.status === 'live').length;
  const scaffold = visible.filter((e) => e.status === 'scaffold').length;
  const stub = visible.filter((e) => e.status === 'stub').length;

  return {
    checked_at: checkedAt,
    total: visible.length,
    live,
    scaffold,
    stub,
    tools: visible,
  };
}

export async function handleToolingDiscoveryTool(
  name: string,
  args: Record<string, unknown>,
  allTools: Tool[],
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<
  | {
      count: number;
      categories: Record<string, number>;
      tools: ToolManifestEntry[];
    }
  | {
      goal: string;
      suggestions: Array<{ name: string; score: number; reason: string }>;
      suggestedBundles: Array<{ name: string; tools: string[]; reason: string }>;
      noToolExplanation?: string;
    }
  | {
      results: Array<{
        index: number;
        name: string;
        ok: boolean;
        result?: unknown;
        error?: string;
      }>;
      summary: { total: number; succeeded: number; failed: number; stoppedEarly: boolean };
    }
  | ToolHealthReport
  | null
> {
  if (name === 'get_tool_manifest') {
    const includeInputSchema = args.includeInputSchema !== false;
    const includeOutputSchema = args.includeOutputSchema !== false;
    const includeExamples = args.includeExamples === true;

    const manifest = buildToolManifest(allTools, {
      includeInputSchema,
      includeOutputSchema,
      includeExamples,
    });

    const categories: Record<string, number> = {};
    for (const item of manifest) categories[item.category] = (categories[item.category] || 0) + 1;

    return {
      count: manifest.length,
      categories,
      tools: manifest,
    };
  }

  if (name === 'suggest_tools_for_goal') {
    const goal = String(args.goal || '').trim();
    if (!goal) throw new Error('goal is required');

    const maxSuggestions =
      typeof args.maxSuggestions === 'number' && args.maxSuggestions > 0
        ? Math.floor(args.maxSuggestions)
        : 8;

    const manifest = buildToolManifest(allTools, {
      includeInputSchema: false,
      includeOutputSchema: false,
      includeExamples: false,
    });

    return suggestToolsForGoal(goal, manifest, maxSuggestions);
  }

  if (name === 'batch_tool_call') {
    return handleBatchToolCall(args, dispatch);
  }

  if (name === 'get_tool_health') {
    const requestedTools = Array.isArray(args.tools)
      ? (args.tools as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const includeStubs = args.includeStubs !== false;
    const allRegistered = allTools.map((t) => t.name);
    return buildToolHealthReport(requestedTools, allRegistered, dispatch, includeStubs);
  }

  return null;
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

  const results: Array<{
    index: number;
    name: string;
    ok: boolean;
    result?: unknown;
    error?: string;
  }> = [];
  let stoppedEarly = false;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i] as { name?: string; args?: Record<string, unknown> };
    const name = call?.name;

    if (!name || typeof name !== 'string') {
      results.push({
        index: i,
        name: '(invalid)',
        ok: false,
        error: 'Missing or invalid call.name',
      });
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
