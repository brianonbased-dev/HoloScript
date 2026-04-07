/**
 * Studio API Executor for Brittney
 *
 * Dispatches Brittney's Studio API tool calls to the correct
 * Next.js API endpoint, handles auth, errors, and response parsing.
 *
 * Runs server-side in the Brittney route handler — never exposed to the client.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StudioAPIResult {
  tool: string;
  success: boolean;
  data: unknown;
  error?: string;
}

interface EndpointConfig {
  method: 'GET' | 'POST';
  path: string;
  /** Transform tool args into the fetch request body. Omit for GET. */
  buildBody?: (args: Record<string, unknown>) => Record<string, unknown>;
  /** Transform tool args into query params for GET requests. */
  buildQuery?: (args: Record<string, unknown>) => Record<string, string>;
}

// ─── Endpoint registry ──────────────────────────────────────────────────────

const ENDPOINTS: Record<string, EndpointConfig> = {
  // Absorb
  absorb_scan_repo: {
    method: 'POST',
    path: '/api/absorb/projects',
    buildBody: (args) => ({ repoUrl: args['repoUrl'], name: args['name'] }),
  },
  absorb_get_status: {
    method: 'GET',
    path: '/api/absorb/projects',
  },
  absorb_query: {
    method: 'POST',
    path: '/api/absorb/query',
    buildBody: (args) => ({
      search: args['search'],
      ...(args['type'] ? { type: args['type'] } : {}),
    }),
  },
  absorb_get_credits: {
    method: 'GET',
    path: '/api/absorb/credits',
  },

  // Scaffold
  scaffold_project: {
    method: 'POST',
    path: '/api/workspace/scaffold',
    buildBody: (args) => args,
  },
  workspace_import: {
    method: 'POST',
    path: '/api/workspace/import',
    buildBody: (args) => ({ source: args['source'], url: args['url'] }),
  },

  // Generation
  generate_code: {
    method: 'POST',
    path: '/api/generate',
    buildBody: (args) => ({
      prompt: args['prompt'],
      ...(args['existingCode'] ? { existingCode: args['existingCode'] } : {}),
    }),
  },
  generate_material: {
    method: 'POST',
    path: '/api/material/generate',
    buildBody: (args) => ({ description: args['description'] }),
  },
  autocomplete: {
    method: 'POST',
    path: '/api/autocomplete',
    buildBody: (args) => ({ code: args['code'], cursor: args['cursor'] }),
  },
  critique_code: {
    method: 'POST',
    path: '/api/critique',
    buildBody: (args) => ({ code: args['code'] }),
  },

  // HoloMesh
  holomesh_contribute: {
    method: 'POST',
    path: '/api/holomesh/contribute',
    buildBody: (args) => ({
      content: args['content'],
      type: args['entryType'],
      domain: args['domain'],
      ...(args['tags'] ? { tags: args['tags'] } : {}),
    }),
  },
  holomesh_marketplace_search: {
    method: 'GET',
    path: '/api/holomesh/marketplace',
    buildQuery: (args) => {
      const params: Record<string, string> = {};
      if (args['query']) params['q'] = String(args['query']);
      if (args['category']) params['category'] = String(args['category']);
      return params;
    },
  },
  holomesh_team_join: {
    method: 'POST',
    path: '/api/holomesh/team/__TEAM_ID__/join',
    buildBody: (args) => ({
      ...(args['agentName'] ? { agentName: args['agentName'] } : {}),
      ...(args['role'] ? { role: args['role'] } : {}),
    }),
  },
  holomesh_team_board: {
    method: 'GET',
    path: '/api/holomesh/team/__TEAM_ID__/board',
  },

  // Export
  export_scene: {
    method: 'POST',
    path: '/api/export',
    buildBody: (args) => ({ code: args['code'], format: args['format'] }),
  },
  export_gltf: {
    method: 'POST',
    path: '/api/export/gltf',
    buildBody: (args) => ({
      code: args['code'],
      ...(args['binary'] ? { binary: args['binary'] === 'true' } : {}),
    }),
  },
  deploy_project: {
    method: 'POST',
    path: '/api/deploy',
    buildBody: (args) => ({
      code: args['code'],
      ...(args['name'] ? { name: args['name'] } : {}),
      ...(args['target'] ? { target: args['target'] } : {}),
    }),
  },

  // Scene management
  save_scene: {
    method: 'POST',
    path: '/api/share',
    buildBody: (args) => ({
      code: args['code'],
      ...(args['title'] ? { title: args['title'] } : {}),
    }),
  },
  load_template: {
    method: 'GET',
    path: '/api/generate',
  },
  get_examples: {
    method: 'GET',
    path: '/api/examples',
  },
  get_prompts: {
    method: 'GET',
    path: '/api/prompts',
  },

  // Daemon
  start_daemon_job: {
    method: 'POST',
    path: '/api/daemon/jobs',
    buildBody: (args) => ({
      type: args['type'],
      ...(args['config'] ? { config: args['config'] } : {}),
    }),
  },
  get_daemon_status: {
    method: 'GET',
    path: '/api/daemon/jobs',
  },

  // Health & config
  get_capabilities: {
    method: 'GET',
    path: '/api/studio/capabilities',
  },
  get_mcp_config: {
    method: 'GET',
    path: '/api/studio/mcp-config',
  },

  // GitHub file access
  read_file: {
    method: 'GET',
    path: '/api/github/file',
    buildQuery: (args) => ({
      owner: String(args['owner']),
      repo: String(args['repo']),
      path: String(args['path']),
    }),
  },
  search_code: {
    method: 'GET',
    path: '/api/github/search',
    buildQuery: (args) => ({
      owner: String(args['owner']),
      repo: String(args['repo']),
      query: String(args['query']),
    }),
  },
  list_files: {
    method: 'GET',
    path: '/api/github/tree',
    buildQuery: (args) => {
      const params: Record<string, string> = {
        owner: String(args['owner']),
        repo: String(args['repo']),
      };
      if (args['path']) params['path'] = String(args['path']);
      return params;
    },
  },
};

// ─── Path resolution ────────────────────────────────────────────────────────

/**
 * Resolve dynamic path segments from tool arguments.
 * Replaces `__TEAM_ID__` with args.teamId, etc.
 */
function resolvePath(path: string, args: Record<string, unknown>): string {
  let resolved = path;
  if (resolved.includes('__TEAM_ID__') && typeof args['teamId'] === 'string') {
    resolved = resolved.replace('__TEAM_ID__', encodeURIComponent(args['teamId']));
  }
  return resolved;
}

// ─── Executor ───────────────────────────────────────────────────────────────

/**
 * Execute a Studio API tool call.
 *
 * @param name - Tool name (must match a key in ENDPOINTS)
 * @param args - Tool arguments from Claude's function call
 * @param baseUrl - Studio origin for internal fetch (e.g. http://localhost:3000)
 * @param headers - Optional headers to forward (cookies, auth tokens)
 * @returns Structured result for Brittney to relay to the user
 */
export async function executeStudioTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
  headers?: Record<string, string>
): Promise<StudioAPIResult> {
  const config = ENDPOINTS[name];
  if (!config) {
    return {
      tool: name,
      success: false,
      data: null,
      error: `Unknown Studio API tool: ${name}`,
    };
  }

  const resolvedPath = resolvePath(config.path, args);
  let url = `${baseUrl}${resolvedPath}`;

  // Build query string for GET requests
  if (config.method === 'GET' && config.buildQuery) {
    const params = config.buildQuery(args);
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const fetchOptions: RequestInit = {
    method: config.method,
    headers: fetchHeaders,
    signal: AbortSignal.timeout(30_000),
  };

  if (config.method === 'POST' && config.buildBody) {
    fetchOptions.body = JSON.stringify(config.buildBody(args));
  }

  try {
    const response = await fetch(url, fetchOptions);

    // Try to parse JSON, fall back to text
    let data: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMsg = typeof data === 'object' && data !== null && 'error' in data
        ? String((data as Record<string, unknown>)['error'])
        : `HTTP ${response.status}`;
      return {
        tool: name,
        success: false,
        data,
        error: errorMsg,
      };
    }

    return {
      tool: name,
      success: true,
      data,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      tool: name,
      success: false,
      data: null,
      error: `Fetch failed: ${message}`,
    };
  }
}

/**
 * Check if a tool name is a Studio API tool (vs a scene-manipulation tool).
 */
export function isStudioAPITool(name: string): boolean {
  return name in ENDPOINTS;
}
