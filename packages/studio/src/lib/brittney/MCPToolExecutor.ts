/**
 * MCP Tool Executor for Brittney
 *
 * Routes Brittney's MCP tool calls to the correct endpoint:
 * - Orchestrator tools → MCP Orchestrator REST API
 * - HoloScript tools → mcp.holoscript.net JSON-RPC
 * - Absorb tools → absorb.holoscript.net JSON-RPC
 *
 * Runs server-side in the Brittney route handler — never exposed to the client.
 */

import { MCP_TOOL_NAMES } from './MCPTools';
import {
  DEFAULT_STUDIO_WORKSPACE_ID,
  FOUNDER_WORKSPACE_ID,
  sanitizeWorkspaceId,
} from '@/lib/workspace/workspaceIdentity';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MCPToolResult {
  tool: string;
  success: boolean;
  data: unknown;
  error?: string;
}

interface OrchestratorRouteConfig {
  method: 'GET' | 'POST';
  path: string;
  buildBody?: (
    args: Record<string, unknown>,
    context: MCPToolExecutionContext
  ) => Record<string, unknown>;
  buildQuery?: (args: Record<string, unknown>) => Record<string, string>;
}

interface DirectMCPConfig {
  /** Base URL of the MCP server */
  baseUrl: string;
  /** JSON-RPC method name on the MCP server */
  method: string;
  /** Transform Brittney tool args → MCP tool args */
  buildArgs: (args: Record<string, unknown>) => Record<string, unknown>;
}

export interface MCPToolExecutionContext {
  workspaceId?: string;
  allowFounderWorkspace?: boolean;
  /** The signed-in user's GitHub access token — used to read private ecosystem canon. */
  githubToken?: string;
}

// ─── Environment ────────────────────────────────────────────────────────────

function getOrchestratorUrl(): string {
  return (
    process.env['NEXT_PUBLIC_MCP_ORCHESTRATOR_URL'] ??
    'https://mcp-orchestrator-production-45f9.up.railway.app'
  );
}

function getHoloScriptMCPUrl(): string {
  return process.env['HOLOSCRIPT_MCP'] ?? 'https://mcp.holoscript.net';
}

function getAbsorbMCPUrl(): string {
  return process.env['ABSORB_MCP'] ?? 'https://absorb.holoscript.net';
}

function getAPIKey(): string {
  return process.env['HOLOSCRIPT_API_KEY'] ?? process.env['MCP_API_KEY'] ?? '';
}

/** The founder ecosystem team — board + suggestion tools always target it. */
function getEcosystemTeamId(): string {
  return process.env['HOLOMESH_TEAM_ID'] ?? 'team_1777834718247_unr35n';
}

function getWorkspaceArg(args: Record<string, unknown>): string | null {
  const raw = args['workspace_id'] ?? args['workspaceId'];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function resolveToolWorkspaceId(
  args: Record<string, unknown>,
  context: MCPToolExecutionContext
): string {
  const requested = getWorkspaceArg(args);
  const requestedId = requested ? sanitizeWorkspaceId(requested) : null;
  const fallback =
    context.workspaceId ??
    process.env['HOLOSCRIPT_WORKSPACE_ID'] ??
    process.env['MCP_WORKSPACE_ID'] ??
    DEFAULT_STUDIO_WORKSPACE_ID;

  if (requestedId && requestedId !== FOUNDER_WORKSPACE_ID) {
    return requestedId;
  }

  if (requestedId === FOUNDER_WORKSPACE_ID && context.allowFounderWorkspace === true) {
    return FOUNDER_WORKSPACE_ID;
  }

  return sanitizeWorkspaceId(fallback);
}

// ─── Orchestrator route registry ────────────────────────────────────────────

const ORCHESTRATOR_ROUTES: Record<string, OrchestratorRouteConfig> = {
  mcp_discover_tools: {
    method: 'GET',
    path: '/tools',
    buildQuery: (args) => {
      const params: Record<string, string> = {};
      if (args['server']) params['server'] = String(args['server']);
      return params;
    },
  },
  mcp_call_tool: {
    method: 'POST',
    path: '/tools/call',
    buildBody: (args) => ({
      server: args['server'],
      tool: args['tool'],
      args: (args['args'] as Record<string, unknown>) ?? {},
    }),
  },
  mcp_list_servers: {
    method: 'GET',
    path: '/servers',
  },
  knowledge_query: {
    method: 'POST',
    path: '/knowledge/query',
    buildBody: (args, context) => {
      const workspaceId = resolveToolWorkspaceId(args, context);
      return {
        search: args['search'],
        workspace_id: workspaceId,
        ...(args['type'] ? { type: args['type'] } : {}),
        ...(args['limit'] ? { limit: args['limit'] } : {}),
      };
    },
  },
  knowledge_sync: {
    method: 'POST',
    path: '/knowledge/sync',
    buildBody: (args, context) => {
      const workspaceId = resolveToolWorkspaceId(args, context);
      return {
        workspace_id: workspaceId,
        entries: ((args['entries'] as Array<Record<string, unknown>>) ?? []).map((e) => ({
          ...e,
          workspace_id: workspaceId,
        })),
      };
    },
  },
};

// ─── Direct MCP tool registry ───────────────────────────────────────────────

function getDirectMCPConfigs(): Record<string, DirectMCPConfig> {
  const holoUrl = getHoloScriptMCPUrl();
  const absorbUrl = getAbsorbMCPUrl();

  return {
    // HoloScript MCP
    holo_parse: {
      baseUrl: holoUrl,
      method: 'parse_hs',
      buildArgs: (args) => ({ code: args['code'] }),
    },
    holo_compile: {
      baseUrl: holoUrl,
      method: 'compile_to_target',
      buildArgs: (args) => ({ code: args['code'], target: args['target'] }),
    },
    holo_suggest_traits: {
      baseUrl: holoUrl,
      method: 'holo_suggest_traits',
      buildArgs: (args) => ({ description: args['description'] }),
    },
    holo_generate_scene: {
      baseUrl: holoUrl,
      method: 'holo_generate_scene',
      buildArgs: (args) => ({ description: args['description'] }),
    },
    holo_list_traits: {
      baseUrl: holoUrl,
      method: 'holo_list_traits',
      buildArgs: (args) => (args['category'] ? { category: args['category'] } : {}),
    },
    holo_explain_trait: {
      baseUrl: holoUrl,
      method: 'holo_explain_trait',
      buildArgs: (args) => ({ trait_name: args['trait_name'] }),
    },
    // HoloScript-as-IDE authoring (GOLD->Brittney follow-on, (A)-slim, verified live 2026-06-09).
    hs_diagnostics: {
      baseUrl: holoUrl,
      method: 'hs_diagnostics',
      buildArgs: (args) => ({
        code: args['code'],
        ...(args['severity'] ? { severity: args['severity'] } : {}),
      }),
    },
    hs_refactor: {
      baseUrl: holoUrl,
      method: 'hs_refactor',
      buildArgs: (args) => ({
        code: args['code'],
        operation: args['operation'],
        ...(args['target'] ? { target: args['target'] } : {}),
        ...(args['newName'] ? { newName: args['newName'] } : {}),
      }),
    },
    hs_ai_review: {
      baseUrl: holoUrl,
      method: 'hs_ai_review',
      buildArgs: (args) => ({
        code: args['code'],
        ...(args['focus'] ? { focus: args['focus'] } : {}),
      }),
    },
    hs_ai_fix_code: {
      baseUrl: holoUrl,
      method: 'hs_ai_fix_code',
      buildArgs: (args) => ({
        code: args['code'],
        ...(args['format'] ? { format: args['format'] } : {}),
      }),
    },
    // Migration & formats (data/architecture → native HoloScript)
    map_data: {
      baseUrl: holoUrl,
      method: 'holoscript_map_schema',
      buildArgs: (args) => ({
        fields: args['fields'],
        ...(args['name'] ? { name: args['name'] } : {}),
        ...(args['description'] ? { description: args['description'] } : {}),
        ...(args['domain'] ? { domain: args['domain'] } : {}),
      }),
    },
    map_csv: {
      baseUrl: holoUrl,
      method: 'holoscript_map_csv',
      buildArgs: (args) => ({
        headers: args['headers'],
        ...(args['sample_row'] ? { sample_row: args['sample_row'] } : {}),
        ...(args['name'] ? { name: args['name'] } : {}),
        ...(args['domain'] ? { domain: args['domain'] } : {}),
      }),
    },
    convert_format: {
      baseUrl: holoUrl,
      method: 'convert_format',
      buildArgs: (args) => ({
        code: args['code'],
        to: args['to'],
        ...(args['from'] ? { from: args['from'] } : {}),
      }),
    },
    list_targets: {
      baseUrl: holoUrl,
      method: 'list_export_targets',
      buildArgs: () => ({}),
    },
    select_modality: {
      baseUrl: holoUrl,
      method: 'holoscript_select_modality',
      buildArgs: (args) => ({
        ...(args['platform'] ? { platform: args['platform'] } : {}),
        ...(args['platforms'] ? { platforms: args['platforms'] } : {}),
      }),
    },
    // Ecosystem canary → route a user-edge gap to the founder ecosystem as a team suggestion.
    // team_id is the ecosystem team (always the founder ecosystem, not the user's workspace).
    suggest_ecosystem_gap: {
      baseUrl: holoUrl,
      method: 'holomesh_suggest',
      buildArgs: (args) => ({
        team_id: getEcosystemTeamId(),
        title: `[user gap] ${String(args['title'] ?? 'unspecified gap').slice(0, 180)}`,
        ...(args['description'] ? { description: String(args['description']).slice(0, 2000) } : {}),
        category: (args['category'] as string) ?? 'other',
        evidence: `Surfaced by Brittney from a user session. ${args['evidence'] ?? ''}`.slice(
          0,
          1000
        ),
      }),
    },
    // HoloMesh board (founder sessions only — gated in executeMCPTool)
    board_add_task: {
      baseUrl: holoUrl,
      method: 'holomesh_board_add',
      buildArgs: (args) => ({
        team_id: getEcosystemTeamId(),
        tasks: (Array.isArray(args['tasks']) ? args['tasks'] : [])
          .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
          .slice(0, 10)
          .map((t) => ({
            title: String(t['title'] ?? 'untitled task').slice(0, 200),
            ...(t['description'] ? { description: String(t['description']).slice(0, 2000) } : {}),
            ...(typeof t['priority'] === 'number' ? { priority: t['priority'] } : {}),
            ...(typeof t['role'] === 'string' ? { role: t['role'] } : {}),
            source: 'brittney',
          })),
      }),
    },
    board_list_tasks: {
      baseUrl: holoUrl,
      method: 'holomesh_board_list',
      buildArgs: () => ({ team_id: getEcosystemTeamId() }),
    },
    // Absorb MCP
    absorb_run: {
      baseUrl: absorbUrl,
      method: 'absorb_run_absorb',
      buildArgs: (args) => ({
        repoUrl: args['repoUrl'],
        ...(args['branch'] ? { branch: args['branch'] } : {}),
      }),
    },
    absorb_query_graph: {
      baseUrl: absorbUrl,
      method: 'absorb_query',
      buildArgs: (args) => ({
        search: args['search'],
        ...(args['projectId'] ? { projectId: args['projectId'] } : {}),
      }),
    },
    absorb_code_health: {
      baseUrl: absorbUrl,
      method: 'holoscript_code_health',
      buildArgs: (args) => ({ projectId: args['projectId'] }),
    },
    absorb_suggest: {
      baseUrl: absorbUrl,
      method: 'absorb_run_improve',
      buildArgs: (args) => ({
        projectId: args['projectId'],
        ...(args['focus'] ? { focus: args['focus'] } : {}),
      }),
    },
  };
}

// ─── JSON-RPC ID generation ─────────────────────────────────────────────────

let rpcIdCounter = 0;

function nextRpcId(): number {
  rpcIdCounter += 1;
  return rpcIdCounter;
}

// ─── Orchestrator executor ──────────────────────────────────────────────────

async function executeOrchestratorTool(
  name: string,
  args: Record<string, unknown>,
  config: OrchestratorRouteConfig,
  context: MCPToolExecutionContext
): Promise<MCPToolResult> {
  const baseUrl = getOrchestratorUrl();
  // GOLD->Brittney Part 3 (option a): founder-session knowledge queries carry the
  // dedicated GOLD_FOUNDER_KEY so the orchestrator grants UNMETERED knowledge read
  // (full GOLD, every tier). Non-founder sessions use the regular metered key, so
  // public users only ever see the Diamond public-tier carve-out. Server-side only;
  // scoped to knowledge_query — every other orchestrator route keeps the normal key.
  const goldFounderKey = process.env['GOLD_FOUNDER_KEY'];
  const apiKey =
    name === 'knowledge_query' && context.allowFounderWorkspace === true && goldFounderKey
      ? goldFounderKey
      : getAPIKey();

  let url = `${baseUrl}${config.path}`;

  if (config.method === 'GET' && config.buildQuery) {
    const params = config.buildQuery(args);
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-mcp-api-key': apiKey,
  };

  const fetchOptions: RequestInit = {
    method: config.method,
    headers,
    signal: AbortSignal.timeout(30_000),
  };

  if (config.method === 'POST' && config.buildBody) {
    fetchOptions.body = JSON.stringify(config.buildBody(args, context));
  }

  const response = await fetch(url, fetchOptions);
  const contentType = response.headers.get('content-type') ?? '';

  let data: unknown;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as Record<string, unknown>)['error'])
        : `HTTP ${response.status}`;
    return { tool: name, success: false, data, error: errorMsg };
  }

  return { tool: name, success: true, data };
}

// ─── Direct MCP JSON-RPC executor ───────────────────────────────────────────

async function executeDirectMCPTool(
  name: string,
  args: Record<string, unknown>,
  config: DirectMCPConfig
): Promise<MCPToolResult> {
  // All direct-MCP tools route to mcp.holoscript.net or absorb.holoscript.net.
  // Both accept HOLOSCRIPT_API_KEY (the mcp_key_* token) via `Authorization: Bearer`.
  // holomesh_* method names are RPC method names on the HoloScript MCP server —
  // NOT a separate HoloMesh server — so HOLOSCRIPT_API_KEY is always correct here.
  const apiKey = getAPIKey();
  const url = `${config.baseUrl}/mcp`;

  const rpcBody = {
    jsonrpc: '2.0' as const,
    id: nextRpcId(),
    method: 'tools/call',
    params: {
      name: config.method,
      arguments: config.buildArgs(args),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(rpcBody),
    signal: AbortSignal.timeout(60_000), // longer timeout for absorb scans
  });

  const contentType = response.headers.get('content-type') ?? '';
  let rawData: unknown;
  if (contentType.includes('application/json')) {
    rawData = await response.json();
  } else {
    rawData = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      typeof rawData === 'object' && rawData !== null && 'error' in rawData
        ? String((rawData as Record<string, unknown>)['error'])
        : `HTTP ${response.status}`;
    return { tool: name, success: false, data: rawData, error: errorMsg };
  }

  // Parse JSON-RPC response
  const rpcResponse = rawData as Record<string, unknown>;
  if (rpcResponse['error']) {
    const rpcError = rpcResponse['error'] as Record<string, unknown>;
    return {
      tool: name,
      success: false,
      data: rpcError,
      error: String(rpcError['message'] ?? 'JSON-RPC error'),
    };
  }

  return { tool: name, success: true, data: rpcResponse['result'] };
}

// ─── Local handlers (custom logic — registries + ecosystem canon) ───────────

const ECO_REPOS: Record<string, string> = {
  'ai-ecosystem': 'brianonbased-dev/ai-ecosystem',
  holoscript: 'brianonbased-dev/HoloScript',
};

/** Live @holoscript/* npm inventory + the holoscript PyPI package. Public registries, no auth. */
async function handleListPackages(args: Record<string, unknown>): Promise<MCPToolResult> {
  const filter = typeof args['filter'] === 'string' ? (args['filter'] as string).toLowerCase() : '';
  const registry = (args['registry'] as string) || 'both';
  const out: {
    npm?: Array<{ name: string; version: string; description?: string }>;
    pypi?: Array<{ name: string; version: string }>;
  } = {};

  if (registry === 'npm' || registry === 'both') {
    const r = await fetch('https://registry.npmjs.org/-/v1/search?text=%40holoscript&size=250', {
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = (await r.json()) as {
        objects?: Array<{ package?: { name?: string; version?: string; description?: string } }>;
      };
      out.npm = (d.objects ?? [])
        .map((o) => o.package)
        .filter((p): p is { name: string; version: string; description?: string } =>
          Boolean(p?.name && p.name.startsWith('@holoscript/'))
        )
        .map((p) => ({ name: p.name, version: p.version, description: p.description }))
        .filter((p) => !filter || p.name.toLowerCase().includes(filter))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  if (registry === 'pypi' || registry === 'both') {
    const r = await fetch('https://pypi.org/pypi/holoscript/json', {
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = (await r.json()) as { info?: { name?: string; version?: string } };
      out.pypi = [{ name: d.info?.name ?? 'holoscript', version: d.info?.version ?? '' }];
    }
  }
  return { tool: 'list_packages', success: true, data: out };
}

/** Read a canonical file from .ai-ecosystem (the operating base) or HoloScript via GitHub. */
async function handleReadEcosystemCanon(
  args: Record<string, unknown>,
  context: MCPToolExecutionContext
): Promise<MCPToolResult> {
  const repoKey = (args['repo'] as string) || 'ai-ecosystem';
  const repo = ECO_REPOS[repoKey] ?? ECO_REPOS['ai-ecosystem'];
  const path = String(args['path'] ?? '').replace(/^\/+/, '');
  if (!path) {
    return { tool: 'read_ecosystem_canon', success: false, data: null, error: 'path is required' };
  }
  const token = context.githubToken;
  if (!token) {
    return {
      tool: 'read_ecosystem_canon',
      success: false,
      data: null,
      error:
        'No GitHub token on this session — sign in with GitHub to read the private ecosystem canon.',
    };
  }
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 404) {
    return {
      tool: 'read_ecosystem_canon',
      success: false,
      data: null,
      error: `Not found: ${repo}/${path}`,
    };
  }
  if (!r.ok) {
    return {
      tool: 'read_ecosystem_canon',
      success: false,
      data: null,
      error: `GitHub HTTP ${r.status}`,
    };
  }
  const text = await r.text();
  const capped = text.length > 24000 ? `${text.slice(0, 24000)}\n…[truncated]` : text;
  return { tool: 'read_ecosystem_canon', success: true, data: { repo, path, content: capped } };
}

const LOCAL_HANDLERS: Record<
  string,
  (args: Record<string, unknown>, context: MCPToolExecutionContext) => Promise<MCPToolResult>
> = {
  list_packages: handleListPackages,
  read_ecosystem_canon: handleReadEcosystemCanon,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Execute an MCP tool call by routing to the correct endpoint.
 *
 * @param name - Tool name (must be in MCP_TOOL_NAMES)
 * @param args - Tool arguments from Claude's function call
 * @returns Structured result for Brittney to relay to the user
 */
export async function executeMCPTool(
  name: string,
  args: Record<string, unknown>,
  context: MCPToolExecutionContext = {}
): Promise<MCPToolResult> {
  try {
    // HoloMesh board access is founder-session-only: the board is the agent
    // team's work queue, and public Studio sessions must not enqueue or read
    // team work. The public-facing channel stays suggest_ecosystem_gap.
    if (
      (name === 'board_add_task' || name === 'board_list_tasks') &&
      context.allowFounderWorkspace !== true
    ) {
      return {
        tool: name,
        success: false,
        data: null,
        error:
          'The HoloMesh board is founder-session-only. Use suggest_ecosystem_gap to surface this to the team instead.',
      };
    }

    // Local handlers (custom logic — package registries, ecosystem canon) first
    const localHandler = LOCAL_HANDLERS[name];
    if (localHandler) {
      return await localHandler(args, context);
    }

    // Check orchestrator routes first
    const orchConfig = ORCHESTRATOR_ROUTES[name];
    if (orchConfig) {
      return await executeOrchestratorTool(name, args, orchConfig, context);
    }

    // Check direct MCP routes
    const directConfigs = getDirectMCPConfigs();
    const directConfig = directConfigs[name];
    if (directConfig) {
      return await executeDirectMCPTool(name, args, directConfig);
    }

    return {
      tool: name,
      success: false,
      data: null,
      error: `Unknown MCP tool: ${name}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      tool: name,
      success: false,
      data: null,
      error: `MCP call failed: ${message}`,
    };
  }
}

/**
 * Check if a tool name is an MCP tool (vs scene-manipulation or Studio API tool).
 */
export function isMCPTool(name: string): boolean {
  return MCP_TOOL_NAMES.has(name);
}
