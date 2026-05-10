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
  const apiKey = getAPIKey();

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
