import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Tool health probe: status values
// ---------------------------------------------------------------------------

/** Wiring status for a single tool category returned by get_tool_health. */
export type ToolWiringStatus = 'live' | 'scaffold' | 'stub' | 'unprobed';

/**
 * The dispatcher get_tool_health should ask.
 *
 * There are two in this server: the registry built in index.ts, which is what
 * actually serves customers, and handlers.ts's own switch, which is narrower.
 * The health probe was wired to the switch, so every tool registered through
 * `registerCategory` — the entire compiler category among them — answered
 * "Unknown tool" to the probe while working perfectly for customers. On
 * 2026-08-16 that reported 61 of 65 compiler tools as absent; compile_to_r3f and
 * compile_to_unity were both marked "not routed" and both worked when called.
 *
 * A tool whose job is telling customers what is real must read the same map the
 * customers do. index.ts installs the registry-backed dispatcher here at startup;
 * without it the probe falls back to whatever caller passes in.
 */
export type ToolDispatch = (name: string, args: Record<string, unknown>) => Promise<unknown>;

let installedDispatch: ToolDispatch | null = null;

/** Called once at startup by index.ts, where the customer-facing registry lives. */
export function setToolHealthDispatcher(dispatch: ToolDispatch | null): void {
  installedDispatch = dispatch;
}

export function getToolHealthDispatcher(): ToolDispatch | null {
  return installedDispatch;
}

/** Tools per page when a caller scopes but does not set a limit. ~60 entries keeps
 *  a response near 21 kB, comfortably inside the 60 kB a customer can consume. */
const DEFAULT_MANIFEST_PAGE = 60;

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
  /** Reachable, but this probe had no arguments it could honestly supply. Not a defect claim. */
  unprobed: number;
  tools: ToolHealthEntry[];
}

export const toolingDiscoveryTools: Tool[] = [
  {
    name: 'get_tool_manifest',
    description:
      'Browse the tool surface. Called with no arguments it returns the CATEGORY INDEX ' +
      '(counts per category, a few hundred bytes) rather than every tool — the full listing ' +
      'is ~151 kB across 429 tools, more than most callers can hold. Scope it with `category` ' +
      'or `pattern` to get tool entries, paged. Nothing is dropped silently: a truncated page ' +
      'reports how many were withheld and the offset to continue from.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'Return tools in this category only (e.g. "compiler", "graph/codebase"). Call with no arguments first to see the available categories and their counts.',
        },
        pattern: {
          type: 'string',
          description:
            'Return tools whose name, description or tags contain this text. Combines with `category`.',
        },
        limit: {
          type: 'number',
          description: `Maximum tool entries to return per page. Defaults to ${DEFAULT_MANIFEST_PAGE}, which keeps a response inside a typical context budget.`,
        },
        offset: {
          type: 'number',
          description:
            'Skip this many matching tools before the page. Use the `nextOffset` value from a truncated response.',
        },
        all: {
          type: 'boolean',
          description:
            'Return every matching tool with no paging. Use deliberately — unscoped this is ~151 kB.',
        },
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
  /**
   * The Holo* brand this tool belongs to (e.g. "HoloKey", "HoloTunnel"), when
   * known. Derived from the holon-registry.v1 contract via the
   * HOLON_TOOL_PREFIXES table below — see inferHolon() for the matching rule.
   * Before this field existed, an agent calling get_tool_manifest /
   * suggest_tools_for_goal had no way to learn that e.g.
   * holo_secrets_grant/_resolve/_revoke are the
   * HoloKey holon, or that holo_tunnel_create/_status/_close are HoloTunnel —
   * the brand-to-tool mapping lived ONLY in the ecosystem glossary, invisible
   * from the tool manifest itself. Absent when no mapping is known; this is
   * NOT the same claim as the registry's own `advertised_surfaces.mcp_tools`
   * flag (which measures whether the brand string ALREADY appears in a tool's
   * own name/description before this field existed).
   */
  holon?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: OutputSchemaEntry;
  examples?: Array<{ args: Record<string, unknown> }>;
}

/**
 * Tool-name-prefix -> holon brand mapping, curated from
 * holon-registry.v1 entries' own `code_root`/`notes` evidence (each row below
 * is backed by an exact tool-name citation in that operator-owned registry).
 * Deliberately NOT exhaustive across all registered holons — only prefixes
 * with clear, already-documented tool-name
 * evidence are listed; extend as more mappings are curated. Exact-name rows
 * (no shared prefix with a sibling tool) are listed as a full tool name.
 */
const HOLON_TOOL_PREFIXES: ReadonlyArray<{ prefix: string; holon: string; exact?: boolean }> = [
  { prefix: 'holo_secrets_', holon: 'HoloKey' },
  { prefix: 'holo_tunnel_', holon: 'HoloTunnel' },
  { prefix: 'holotune_', holon: 'HoloTune' },
  { prefix: 'holo_hologram_', holon: 'HoloGram' },
  { prefix: 'hololand_', holon: 'HoloLand' },
  { prefix: 'holo_holotwin_', holon: 'HoloTwin' },
  { prefix: 'holo_reconstruct_', holon: 'HoloMap' },
  { prefix: 'holo_map_', holon: 'HoloMap' },
  { prefix: 'holo_daemon_', holon: 'HoloDaemon' },
  { prefix: 'holoshell_download_recovery_', holon: 'HoloShell' },
  { prefix: 'holo_graph_', holon: 'HoloGraph' },
  { prefix: 'holo_ci_dispatch', holon: 'HoloCI', exact: true },
  { prefix: 'compile_to_holob', holon: 'HoloVM', exact: true },
  // HoloAbsorb ships most of its tools from @holoscript/absorb-service and is
  // registered by provenance at startup (see registerHolonTools). These two prefixes
  // are the stragglers that live in this package instead, so the brand holds even if
  // the service is not loaded.
  { prefix: 'absorb_', holon: 'HoloAbsorb' },
  { prefix: 'holo_absorb_', holon: 'HoloAbsorb' },
  { prefix: 'holo_cancel_absorb', holon: 'HoloAbsorb', exact: true },
  { prefix: 'holo_get_absorb_status', holon: 'HoloAbsorb', exact: true },
];

/** Look up a tool's holon by exact name or prefix match. Returns undefined when unknown. */
/**
 * Brand-by-provenance: which holon a tool belongs to because of the package it
 * actually ships in, registered at startup by whoever imports that package.
 *
 * Stronger evidence than the prefix table below, which infers a brand from a name
 * pattern. HoloAbsorb is the case that forced it: the registry lists it as an
 * active holon whose `advertised_surfaces.mcp_tools` is true, its own entry says
 * "legacy references to Absorb or Codebase Intelligence refer to this same
 * product" — and no tool in the manifest carried the name. Its tools also do not
 * share one prefix: `absorb_*`, `holo_absorb_*`, `holo_query_codebase`,
 * `holo_semantic_search`, `holo_ask_codebase`, `holo_graph_status`. What they do
 * share is that they all come out of @holoscript/absorb-service, so that is what
 * gets asked.
 */
const EXPLICIT_HOLON_BY_TOOL = new Map<string, string>();

/** Called at startup by the module that imports a holon's tool arrays. */
export function registerHolonTools(holon: string, toolNames: readonly string[]): void {
  for (const name of toolNames) {
    if (name) EXPLICIT_HOLON_BY_TOOL.set(name, holon);
  }
}

export function holonOf(name: string): string | undefined {
  return inferHolon(name);
}

function inferHolon(name: string): string | undefined {
  // Provenance wins over pattern.
  const registered = EXPLICIT_HOLON_BY_TOOL.get(name);
  if (registered) return registered;

  for (const { prefix, holon, exact } of HOLON_TOOL_PREFIXES) {
    if (exact ? name === prefix : name.startsWith(prefix)) return holon;
  }
  return undefined;
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

  return allTools.map((tool) => {
    const holon = inferHolon(tool.name);
    return {
      name: tool.name,
      description: tool.description,
      category: inferCategory(tool.name),
      tags: inferTags(tool.name, tool.description),
      ...(holon ? { holon } : {}),
      ...(includeInputSchema ? { inputSchema: tool.inputSchema as Record<string, unknown> } : {}),
      ...(includeOutputSchema ? { outputSchema: inferOutputSchema(tool.name) } : {}),
      ...(includeExamples ? { examples: inferExamples(tool.name) } : {}),
    };
  });
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
/**
 * Tools that cannot be honestly probed, and why.
 *
 * Naming the reason is the point. `browser_screenshot: {}` used to sit in the
 * canary table with the comment "will stub — no real browser in probe": the author
 * knew it would fail and filed it anyway, so a known-unprobeable tool was counted
 * as a defect on every run. A health report that includes failures its own author
 * expected is teaching readers to discount it.
 */
const UNPROBEABLE: Record<string, string> = {
  browser_screenshot:
    'needs a live browser session id, which this probe cannot create — not a defect claim',
  compile_to_rom_twin:
    'needs a real model or a known modelId; nothing meaningful can be invented — not a defect claim',

  // Need a prior job, session or download that only a real workflow produces. Asking
  // them about an invented id gets a correct "not found", which is an answer about the
  // id, not about the tool.
  get_compilation_status: 'needs the id of a real compile job — an invented one correctly 404s',
  sim_fleet_status: 'needs the id of a real simulation job — an invented one correctly 404s',
  holo_reconstruct_step: 'needs a live reconstruction session and real frame data',
  holo_reconstruct_anchor: 'needs a live reconstruction session',
  holo_reconstruct_export: 'needs a live reconstruction session',
  holoshell_download_recovery_forensic_export: 'needs a real interrupted download to report on',
  holo_detect_changes: 'needs a previously captured graph to diff against',

  // Need real media bytes. A made-up base64 payload tests the decoder, not the tool.
  holo_hologram_from_media: 'needs real image or video bytes',
  holo_hologram_compile_quilt: 'needs real image or video bytes',
  holo_hologram_compile_mvhevc: 'needs real image or video bytes',
  holo_hologram_render: 'needs real image or video bytes',
  holo_hologram_get_asset: 'needs the hash of an asset that already exists',

  // Need domain-shaped input this probe should not invent. Each states exactly what,
  // taken from the tool's own refusal — a curated fixture from whoever owns the domain
  // would make these probeable, and that is a better answer than a guessed one.
  compile_to_sdk: 'needs HoloScript declaring at least one service endpoint block',
  compile_to_nft_marketplace: 'needs HoloScript declaring marketplace contracts',
  explain_fairness_receipt: 'needs a real FairnessReceipt, not an empty object',
  fairness_sweep: 'needs a cohort of { group, label, score, features } rows and a real model',
  solve_structural: 'needs a TET10 mesh — elements of exactly 10 node indices',
};

const CANARY_ARGS: Record<string, Record<string, unknown>> = {
  parse_hs: { code: 'object Cube { geometry: "cube" }' },
  parse_holo: { code: 'composition "S" { object "C" { geometry: "cube" } }' },
  // Was `{ source: 'step "a" { ... }' }` — the wrong argument name AND the wrong
  // shape, so parse_pipeline failed its own canary and was reported broken while
  // working. A curated canary is the thing this probe convicts on; it has to be right.
  parse_pipeline: {
    code: [
      'pipeline "Canary" {',
      '  source A { type: "filesystem" path: "in.csv" }',
      '  sink B { type: "filesystem" path: "out.json" }',
      '}',
    ].join('\n'),
  },
  validate_holoscript: { code: 'composition "S" { object "C" { geometry: "cube" } }' },
  compile_holoscript: {
    code: 'composition "S" { object "C" { geometry: "cube" } }',
    target: 'webgpu',
  },
  holo_graph_status: {},
  hs_ai_explain_error: { code: 'object Cube { geometry: "cube" }', errors: [] },
  hs_diagnostics: { code: 'object Cube { geometry: "cube" }' },
  holomesh_status: {},
  get_agent_health: {},
  holoscript_code_health: { code: 'object Cube { geometry: "cube" }' },
  list_plugins: {},
  // `verify_cael_trace: { trace: [] }` — wrong argument name. The tool takes
  // `traceJSONL` or `traceId`; `trace` was ignored, so it refused for lack of input
  // and the refusal was filed as a defect. Same class of error as parse_pipeline's
  // canary passing `source` to a tool that wants `code`.
  verify_cael_trace: { traceJSONL: '{"event":"start","span":"canary"}' },
  holotune_status: {},

  // These five compile a domain block. `properties` is the direct path — verified
  // 2026-08-16 against the live anchor, all five returned success with a compiled
  // block. They were reported broken only because they were called with nothing,
  // and their schemas declare `required: []` while actually needing code OR
  // properties, so nothing could be derived either.
  holoscript_compile_robotics: { properties: { name: 'Canary' } },
  holoscript_compile_iot: { properties: { name: 'Canary' } },
  holoscript_compile_music: { properties: { name: 'Canary' } },
  holoscript_compile_education: { properties: { name: 'Canary' } },
  holoscript_compile_healthcare: { properties: { name: 'Canary' } },
  holoscript_map_schema: { name: 'Canary', fields: [{ name: 'id', type: 'string' }] },
  holo_protocol_lookup: { contentHash: 'canary' },

  // Verified against the live anchor 2026-08-16 before being written down. Each of
  // these was previously refusing arguments the probe had invented; these are inputs
  // the tool actually accepts, so the probe now exercises the real path.
  //   solve_logic          → {success:true, result:3, verified:true} with a cael trace
  //   solve_thermal        → a 3×3×3 temperature grid
  //   conformance_check…   → {success:true, report:{…}}
  //   holo_task_kolmogorov → {score:0, mdlBytes:35, baselineBytes:35, ratio:1}
  solve_logic: { code: 'function add(a, b) { return a + b; }', functionName: 'add', args: [1, 2] },
  solve_thermal: { config: {} },
  conformance_check_artifact: { artifactKind: 'world', artifactId: 'canary', artifact: {} },
  holo_task_kolmogorov_score: { taskDescription: 'add two numbers', agentContext: {} },
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
/**
 * Invent a minimal, plausible argument set from a tool's own declared schema.
 *
 * Only 34 of 429 tools had curated canary arguments; the rest were probed with
 * `{}`. A tool that correctly rejects a call with no arguments then threw
 * "Missing required string argument: code" and was recorded as broken — so the
 * probe was rewarding tools that skip input validation and punishing the ones
 * that do it. parse_pipeline was marked "scaffold" on the same day it was
 * verified working end to end.
 *
 * Returns null when the required arguments cannot be honestly guessed (an object
 * or array the tool will interpret), so the caller can say "not probed" instead
 * of inventing a failure. Blindness declared beats a confident wrong verdict.
 */
/**
 * Would calling this tool with invented arguments change something?
 *
 * Deriving arguments from a schema made the probe able to actually EXECUTE tools
 * it previously only failed to call — including `holo_write_file`, whose required
 * fields are two plain strings the synthesizer fills in happily. Nothing was
 * written when this was caught on 2026-08-16, but that was luck: a health check
 * must not be able to write a file, delete a record, send a message or spend
 * money. Diagnostics that mutate are worse than no diagnostics.
 *
 * Errs toward refusing: an unprobed tool costs a gap in a report, a wrongly
 * probed one costs whatever it did. Curated canary arguments are exempt because a
 * human chose them for a specific tool and vouched for the consequence.
 */
export function mayMutate(toolName: string, description?: string): boolean {
  // Product prefixes are brand names, not operations. Strip them first, or the
  // brand gets read as a verb: `absorb_query`, `absorb_diff` and
  // `absorb_list_projects` are all READS, and all three were blocked because
  // "absorb" appears in the mutating-verb list for `absorb_run_absorb`'s sake.
  // Seventeen tools were locked out by a product name.
  const PRODUCT_PREFIXES = [
    'holoshell_download_recovery_', 'holoshell_', 'hololand_', 'holomesh_',
    'holotune_', 'twin_earth_', 'holoscript_', 'absorb_', 'holo_', 'hs_', 'sim_',
  ];
  let name = toolName.toLowerCase();
  for (const prefix of PRODUCT_PREFIXES) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }

  const segments = new Set(name.split(/[^a-z]+/).filter(Boolean));

  // Verbs that act on the world.
  const MUTATING = [
    'write', 'edit', 'create', 'update', 'delete', 'remove', 'revoke', 'grant',
    'publish', 'send', 'post', 'commit', 'push', 'deploy', 'restart', 'launch',
    'install', 'uninstall', 'set', 'assign', 'claim', 'complete', 'add',
    'settle', 'payout', 'purchase', 'buy', 'mint', 'transfer', 'spend',
    'provision', 'register', 'promote', 'graduate', 'train', 'absorb',
    'run', 'execute', 'invoke', 'apply', 'store', 'save', 'upload',
    'import', 'ingest', 'move', 'reset', 'clear', 'stop', 'cancel', 'kill',
    'actuate', 'quarantine', 'tick', 'steward', 'scaffold', 'delegate',
    // Found 2026-08-16 while auditing what was still unprobed: `holomesh_team_form`
    // FORMS a team and `conformance_admit_artifact` ADMITS one. Both change state,
    // neither verb was listed, and both were sitting in the probeable pile. Reviewing
    // the leftovers found guard gaps, not just coverage gaps.
    'form', 'admit', 'resume',
  ];
  if (MUTATING.some((verb) => segments.has(verb))) return true;

  // Verbs that only ever look. When the operation is plainly a read, a description
  // mentioning "creates" is describing what the tool REPORTS ON, not what it does —
  // that is how `holo_get_node_connections`, which parses code and walks a graph,
  // ended up classed as state-changing.
  const READ_ONLY = [
    'get', 'list', 'query', 'read', 'find', 'search', 'explain', 'describe',
    'inspect', 'parse', 'validate', 'check', 'status', 'diff', 'suggest',
    'verify', 'analyze', 'estimate', 'discover', 'recall', 'lookup', 'health',
  ];
  if (READ_ONLY.some((verb) => segments.has(verb))) return false;

  const text = String(description ?? '').toLowerCase();
  return /\b(writes?|creates?|deletes?|modifies|mutates?|persists?|sends?|charges?)\b/.test(text);
}

/**
 * Does calling this tool cost real money?
 *
 * Distinct from mutation and worth its own answer. `generate_object` and its
 * thirteen siblings change nothing — they compute and return — but they reach an
 * inference provider, and a health check that sweeps 429 tools would bill for every
 * one of them on every run. Blocked for a different reason, and the report says
 * which, because "we don't probe this because it costs money" and "we don't probe
 * this because it could delete something" are different facts about a tool.
 */
export function mayCost(toolName: string, description?: string): boolean {
  const name = toolName.toLowerCase();
  const segments = new Set(name.split(/[^a-z]+/).filter(Boolean));
  // `holo_critic` returned {verdict:"NOT_READY","No LLM providers are configured"} on
  // the anchor — it looks free only because this node has no provider wired. On a node
  // that does, sweeping it bills. Judge by what the tool needs, not by what this
  // particular machine happens to lack.
  if (segments.has('paid') || segments.has('generate') || segments.has('critic')) return true;
  if (name.includes('_ai_')) return true;
  const text = String(description ?? '').toLowerCase();
  return /\b(llm|inference|credits?|billed|costs? (real )?money|token budget)\b/.test(text);
}

/**
 * Is this message a permission refusal rather than a fault?
 *
 * "ForkSandboxGate denied tool X: Capability missing" means the gate did its job on
 * a caller without the capability. The tool is fine and probably works for someone
 * who is allowed to run it — which is a different report from "this is broken", and
 * the only one that is true.
 */
export function isDenial(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /\bdenied\b/.test(m) ||
    /\bcapability (missing|required|not)\b/.test(m) ||
    /\b(unauthori[sz]ed|forbidden|not permitted|permission denied)\b/.test(m) ||
    /\binsufficient (scope|permission|capability)\b/.test(m)
  );
}

export function synthesizeCanaryArgs(schema: unknown): Record<string, unknown> | null {
  const root = schema as { properties?: Record<string, unknown>; required?: unknown } | undefined;
  const properties = root?.properties;
  if (!properties || typeof properties !== 'object') return {};

  const required = Array.isArray(root?.required) ? (root.required as string[]) : [];
  if (required.length === 0) return {};

  const args: Record<string, unknown> = {};
  for (const key of required) {
    const spec = properties[key] as
      | { type?: string; enum?: unknown[]; items?: { type?: string } }
      | undefined;
    if (!spec) return null;

    if (Array.isArray(spec.enum) && spec.enum.length > 0) {
      args[key] = spec.enum[0];
      continue;
    }

    switch (spec.type) {
      case 'string':
        args[key] = placeholderForStringArg(key);
        break;
      case 'number':
      case 'integer':
        args[key] = 1;
        break;
      case 'boolean':
        args[key] = false;
        break;
      case 'array':
        // An empty array is a legitimate, inert value for a required list.
        args[key] = [];
        break;
      default:
        // object / unknown: whatever we invent, the tool will try to interpret,
        // and a wrong guess produces a fake failure. Refuse to guess.
        return null;
    }
  }
  return args;
}

/** Name-aware placeholders, so a required `code` gets source and a `path` gets a path. */
function placeholderForStringArg(key: string): string {
  const k = key.toLowerCase();
  if (k === 'code' || k === 'source' || k === 'src') return 'orb Cube { geometry: "cube" }';
  if (k.includes('path') || k.includes('file')) return 'example.holo';
  if (k.includes('query') || k.includes('question')) return 'health canary';
  if (k.includes('goal') || k.includes('prompt') || k.includes('description')) return 'a simple cube';
  if (k.includes('url')) return 'https://example.com';
  if (k.includes('id')) return 'canary';
  return 'canary';
}

async function probeOneTool(
  toolName: string,
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  schema?: unknown,
  describedAs?: string
): Promise<ToolHealthEntry> {
  const category = inferCategory(toolName);
  const now = new Date().toISOString();

  // The state-change guard is ABSOLUTE — a curated entry does not buy an exemption.
  // `settle_creator_payout: {}` sat in the canary table for months, so every health
  // check called a payout function and only a capability gate stood in the way.
  // Nobody curates their way past that. holotune_launch and holotune_promote were
  // in the same position; between them the cost of this rule is three tools of
  // coverage, all three of which a diagnostic has no business calling.
  if (mayMutate(toolName, describedAs)) {
    return {
      tool: toolName,
      category,
      status: 'unprobed',
      last_checked: now,
      reason:
        'not probed: this tool can change state, and a health check must never do that. ' +
        'Its health has to be established somewhere that can undo the consequence.',
    };
  }
  if (mayCost(toolName, describedAs)) {
    return {
      tool: toolName,
      category,
      status: 'unprobed',
      last_checked: now,
      reason:
        'not probed: reaching an inference provider costs money, and a sweep of the whole ' +
        'surface would bill for it on every run. Changes nothing — just not free to ask.',
    };
  }

  // Some tools cannot be probed without something the probe has no way to conjure —
  // a live browser session, a trained model. Naming them is honest; calling them with
  // invented arguments and recording the refusal as a defect is not.
  const unprobeable = UNPROBEABLE[toolName];
  if (unprobeable) {
    return { tool: toolName, category, status: 'unprobed', last_checked: now, reason: unprobeable };
  }

  const curated = CANARY_ARGS[toolName];
  const args = curated ?? synthesizeCanaryArgs(schema);

  if (args === null) {
    return {
      tool: toolName,
      category,
      status: 'unprobed',
      last_checked: now,
      reason:
        'requires an object or array argument this probe cannot honestly invent — ' +
        'not probed, so no claim is made either way',
    };
  }
  const argSource = curated ? 'curated' : Object.keys(args).length ? 'schema-derived' : 'no-args';

  let status: ToolWiringStatus;
  let reason: string;

  try {
    const result = await dispatch(toolName, args);

    if (result === null || result === undefined) {
      status = 'stub';
      reason = 'dispatch returned null — tool name not wired in handler switch';
    } else {
      const r = result as Record<string, unknown>;
      if (r['success'] === false && typeof r['error'] === 'string' && isDenial(String(r['error']))) {
        // A gate refusing an uncapable caller is the gate WORKING. Filing it as a
        // broken tool both slanders the tool and buries the fact that four of the
        // twelve "broken" tools on 2026-08-16 were simply not permitted to this probe.
        status = 'unprobed';
        reason = `reachable; this caller is not permitted to run it — ${String(r['error']).slice(0, 100)}`;
      } else if (r['success'] === false && typeof r['error'] === 'string') {
        // A rejection of OUR invented arguments is a fact about the arguments, not
        // about the tool. A tool called correctly — curated canary, or one that
        // needs no arguments — returning success:false is a real finding.
        if (argSource === 'schema-derived') {
          status = 'unprobed';
          reason = `reachable; rejected this probe's invented arguments — ${String(r['error']).slice(0, 100)}`;
        } else {
          status = 'scaffold';
          reason = `handler reachable but returned success:false — ${String(r['error']).slice(0, 120)}`;
        }
      } else {
        status = 'live';
        reason = `answered a ${argSource} probe with a usable result`;
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    // Match the SHAPE of an unroutable-tool error, not one exact phrasing.
    // These were literal substrings, and the real message is "Unknown graph tool:
    // holo_write_file" — the word "graph" sits between "unknown" and "tool", so
    // `includes('unknown tool')` missed it and an absent tool was reported as
    // "scaffold". By this file's own definitions that is the wrong verdict: stub is
    // "handler not wired / unconditionally throws", scaffold is "returns a stub/
    // empty payload". A customer reads scaffold as partially-built rather than
    // absent — which is the fictional-route problem this tool exists to expose,
    // mislabelled by the tool that found it.
    const unroutable =
      /\bunknown\b[\w\s-]*\btools?\b/.test(lower) ||
      /\bunsupported\b[\w\s-]*\btools?\b/.test(lower) ||
      /\bno such tool\b/.test(lower) ||
      /\bnot (implemented|wired|registered|routed|recognized)\b/.test(lower) ||
      lower.includes('unrecognized');

    if (unroutable) {
      status = 'stub';
      reason = `handler does not route this tool — ${msg.slice(0, 120)}`;
    } else if (isDenial(msg)) {
      // Same as the success:false branch: a gate refusing this caller is not a fault.
      status = 'unprobed';
      reason = `reachable; this caller is not permitted to run it — ${msg.slice(0, 100)}`;
    } else if (argSource === 'schema-derived') {
      // It threw on arguments this probe invented. That is not evidence the tool is
      // broken — rejecting bad input is what a correct tool does. Say we do not know.
      // NOTE this deliberately does NOT cover the no-args case: a tool that declares
      // no required arguments WAS called correctly, so a throw there is a real finding.
      status = 'unprobed';
      reason = `reachable; threw on this probe's invented arguments — ${msg.slice(0, 100)}`;
    } else {
      // Called correctly — either a curated canary or a tool needing no arguments —
      // and it still threw. The handler is reachable and the path behind it is broken.
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
  includeStubs = true,
  /** Full tool definitions, so each probe can derive arguments from the tool's own schema. */
  schemas: ReadonlyArray<Pick<Tool, 'name' | 'inputSchema' | 'description'>> = []
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
  const schemaOf = new Map(schemas.map((t) => [t.name, t.inputSchema as unknown]));
  const descriptionOf = new Map(
    schemas.map((t) => [t.name, (t as { description?: string }).description])
  );

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
      return probeOneTool(toolName, dispatch, schemaOf.get(toolName), descriptionOf.get(toolName));
    })
  );

  const visible = includeStubs ? entries : entries.filter((e) => e.status !== 'stub');

  const live = visible.filter((e) => e.status === 'live').length;
  const scaffold = visible.filter((e) => e.status === 'scaffold').length;
  const stub = visible.filter((e) => e.status === 'stub').length;
  const unprobed = visible.filter((e) => e.status === 'unprobed').length;

  return {
    checked_at: checkedAt,
    total: visible.length,
    live,
    scaffold,
    stub,
    unprobed,
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
      /** Present whenever entries were withheld — says what and how to get them. */
      note?: string;
      /** Offset to pass back for the next page; absent when nothing is left. */
      nextOffset?: number;
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

    // 429 tools is 151 kB even with every schema and example switched off — more
    // than the LLM that is this tool's primary consumer can hold. Returning all of
    // it was not "complete", it was unusable.
    //
    // So the default is now the CATEGORY INDEX (about 200 bytes): enough to navigate,
    // small enough to read. Tool entries arrive when the caller scopes the request.
    // Nothing is ever silently dropped — a truncated page says so and says how to
    // get the rest, because silent truncation reads as "that is everything".
    const category = typeof args.category === 'string' ? args.category.trim() : '';
    const pattern = typeof args.pattern === 'string' ? args.pattern.trim().toLowerCase() : '';
    const offset = typeof args.offset === 'number' && args.offset > 0 ? Math.floor(args.offset) : 0;
    const limit =
      typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : DEFAULT_MANIFEST_PAGE;

    if (!category && !pattern && args.all !== true) {
      return {
        count: manifest.length,
        categories,
        tools: [],
        note:
          `${manifest.length} tools across ${Object.keys(categories).length} categories. The full listing is ~151 kB, ` +
          `which is more than most callers can consume, so it is not returned by default. ` +
          `Scope it: {"category":"compiler"} or {"pattern":"parse"}. Pass {"all":true} only if you genuinely want every entry.`,
      };
    }

    let scoped = manifest;
    if (category) scoped = scoped.filter((t) => t.category === category);
    if (pattern) {
      scoped = scoped.filter(
        (t) =>
          t.name.toLowerCase().includes(pattern) ||
          String(t.description ?? '').toLowerCase().includes(pattern) ||
          t.tags.some((tag) => tag.toLowerCase().includes(pattern))
      );
    }

    // A scope that matches nothing must say WHY, not just return an empty list. An
    // empty array reads as "that category is empty" when the real answer is usually
    // "that category does not exist" — and the category index is right there in the
    // same response to correct it with.
    if (scoped.length === 0) {
      const knownCategory = !category || Object.prototype.hasOwnProperty.call(categories, category);
      return {
        count: 0,
        categories,
        tools: [],
        note: knownCategory
          ? `No tool matched${category ? ` category "${category}"` : ''}${pattern ? ` pattern "${pattern}"` : ''}. The categories that do have tools are listed above.`
          : `There is no category "${category}". The available categories are listed above.`,
      };
    }

    if (args.all === true) {
      return { count: scoped.length, categories, tools: scoped };
    }

    const page = scoped.slice(offset, offset + limit);
    const shown = offset + page.length;
    const truncated = shown < scoped.length;

    return {
      count: scoped.length,
      categories,
      tools: page,
      ...(truncated
        ? {
            note:
              `Showing ${offset + 1}-${shown} of ${scoped.length} matching tools. ` +
              `${scoped.length - shown} not shown — request them with {"offset":${shown}}.`,
            nextOffset: shown,
          }
        : {}),
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
    return buildToolHealthReport(requestedTools, allRegistered, dispatch, includeStubs, allTools);
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
