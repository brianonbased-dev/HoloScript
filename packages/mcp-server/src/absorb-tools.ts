/**
 * MCP Absorb Service Tools for HoloScript
 *
 * Exposes the Absorb paid service through MCP, enabling AI agents to manage
 * projects, run credit-gated operations (absorb, improve, query, render, diff,
 * pipeline), and check credit balances.
 *
 * All operations proxy to the Studio API at HOLOSCRIPT_STUDIO_URL.
 * Authentication is forwarded via the ABSORB_API_KEY env var or per-call apiKey arg.
 *
 * Tools:
 * - absorb_list_projects:  List user's absorb projects
 * - absorb_create_project: Create a new absorb project
 * - absorb_delete_project: Delete a project
 * - absorb_check_credits:  Check credit balance and tier
 * - absorb_run_absorb:     Run codebase absorption (credit-gated)
 * - absorb_run_improve:    Run daemon improvement (credit-gated)
 * - absorb_run_query:      Run GraphRAG query (credit-gated)
 * - absorb_run_render:     Screenshot/PDF export (credit-gated)
 * - absorb_run_diff:       Semantic diff (credit-gated)
 * - absorb_run_pipeline:   Run recursive pipeline (credit-gated)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

function getStudioUrl(): string {
  return (
    process.env.HOLOSCRIPT_STUDIO_URL ||
    process.env.STUDIO_URL ||
    'https://studio.holoscript.net'
  );
}

function getDefaultApiKey(): string {
  return process.env.ABSORB_API_KEY || '';
}

/**
 * Make an authenticated request to the Studio absorb API.
 */
async function studioFetch(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  apiKey?: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${getStudioUrl()}${path}`;
  const key = apiKey || getDefaultApiKey();

  if (!key) {
    return {
      ok: false,
      status: 401,
      data: {
        error: 'No API key provided. Set ABSORB_API_KEY env var or pass apiKey argument.',
      },
    };
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { error: `Failed to reach Studio API: ${(err as Error).message}` },
    };
  }
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const absorbServiceTools: Tool[] = [
  // ── Project Management ───────────────────────────────────────────────────
  {
    name: 'absorb_list_projects',
    description:
      'List all absorb projects for the authenticated user. Returns project names, statuses, source types, and usage stats.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: {
          type: 'string',
          description:
            'Absorb API key for authentication. Falls back to ABSORB_API_KEY env var.',
        },
      },
    },
  },
  {
    name: 'absorb_create_project',
    description:
      'Create a new absorb project. Projects track any codebase (GitHub URL, local path, or uploaded source) for continuous daemon improvement.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name (e.g., "my-api-server")',
        },
        sourceType: {
          type: 'string',
          enum: ['github', 'local', 'upload'],
          description: 'Source type: github (URL), local (filesystem path), or upload',
        },
        sourceUrl: {
          type: 'string',
          description: 'GitHub repository URL (for sourceType "github")',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['name', 'sourceType'],
    },
  },
  {
    name: 'absorb_delete_project',
    description: 'Delete an absorb project by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to delete',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId'],
    },
  },

  // ── Credits ──────────────────────────────────────────────────────────────
  {
    name: 'absorb_check_credits',
    description:
      'Check credit balance and account tier. 1 credit = $0.01. Returns balance, tier (free/starter/pro/team), and usage history.',
    inputSchema: {
      type: 'object',
      properties: {
        includeHistory: {
          type: 'boolean',
          description: 'Include recent transaction history (default: false)',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
    },
  },

  // ── Operations ───────────────────────────────────────────────────────────
  {
    name: 'absorb_run_absorb',
    description:
      'Run codebase absorption on an absorb project. Scans, builds knowledge graph, and enables semantic queries. Costs 10-50 credits depending on depth.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to absorb',
        },
        depth: {
          type: 'string',
          enum: ['shallow', 'deep'],
          description: 'Scan depth: shallow (faster, 10 credits) or deep (thorough, 50 credits). Default: shallow.',
        },
        tier: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'ultra'],
          description: 'Quality tier for rendering (free preference, no extra cost). Default: medium.',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'absorb_run_improve',
    description:
      'Run HoloDaemon improvement cycle on an absorb project. The daemon analyzes code, finds issues, and generates fixes. Costs 25-150 credits depending on profile.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to improve',
        },
        profile: {
          type: 'string',
          enum: ['quick', 'balanced', 'deep'],
          description:
            'Improvement profile: quick (1 cycle, 25 credits), balanced (3 cycles, 75 credits), or deep (5 cycles, 150 credits). Default: quick.',
        },
        tier: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'ultra'],
          description: 'Quality tier (free preference). Default: medium.',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'absorb_run_query',
    description:
      'Run a GraphRAG semantic query on an absorbed project. Basic search costs 5 credits. AI-powered synthesis with LLM costs ~15+ credits (metered).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to query',
        },
        query: {
          type: 'string',
          description:
            'Natural language query (e.g., "How does authentication work?", "What calls UserService?")',
        },
        withLLM: {
          type: 'boolean',
          description:
            'Use AI synthesis for a coherent answer (15+ credits) vs raw search results (5 credits). Default: false.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results for basic search (default: 10, max: 50)',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId', 'query'],
    },
  },
  {
    name: 'absorb_run_render',
    description:
      'Render a screenshot or PDF export of an absorbed project visualization. Images cost 3 credits, PDF costs 5 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to render',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp', 'pdf'],
          description: 'Output format. Default: png.',
        },
        width: {
          type: 'number',
          description: 'Viewport width in pixels (320-3840). Default: 1280.',
        },
        height: {
          type: 'number',
          description: 'Viewport height in pixels (240-2160). Default: 720.',
        },
        quality: {
          type: 'number',
          description: 'JPEG/WebP quality 1-100 (default: 90)',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'absorb_run_diff',
    description:
      'Run semantic diff between two source versions of a project. Detects renames, moves, and structural changes. Costs 2 credits.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID',
        },
        sourceA: {
          type: 'string',
          description: 'First source version (code string or commit ref)',
        },
        sourceB: {
          type: 'string',
          description: 'Second source version (code string or commit ref)',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId', 'sourceA', 'sourceB'],
    },
  },
  {
    name: 'absorb_run_pipeline',
    description:
      'Run the recursive self-improvement pipeline on an absorb project. L0 fixes code, L1 optimizes strategy, L2 generates skills. Costs vary by layer.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID',
        },
        layer: {
          type: 'string',
          enum: ['l0', 'l1', 'l2'],
          description:
            'Pipeline layer: l0 (code fixer), l1 (strategy optimizer), l2 (meta-strategist). Default: l0.',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleAbsorbServiceTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'absorb_list_projects':
      return handleListProjects(args);
    case 'absorb_create_project':
      return handleCreateProject(args);
    case 'absorb_delete_project':
      return handleDeleteProject(args);
    case 'absorb_check_credits':
      return handleCheckCredits(args);
    case 'absorb_run_absorb':
      return handleRunAbsorb(args);
    case 'absorb_run_improve':
      return handleRunImprove(args);
    case 'absorb_run_query':
      return handleRunQuery(args);
    case 'absorb_run_render':
      return handleRunRender(args);
    case 'absorb_run_diff':
      return handleRunDiff(args);
    case 'absorb_run_pipeline':
      return handleRunPipeline(args);
    default:
      return null;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleListProjects(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const { ok, data } = await studioFetch('/api/absorb/projects', 'GET', apiKey);
  if (!ok) return { error: data.error || 'Failed to list projects' };
  return data;
}

async function handleCreateProject(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const name = args.name as string;
  const sourceType = args.sourceType as string;
  const sourceUrl = args.sourceUrl as string | undefined;

  const { ok, data } = await studioFetch('/api/absorb/projects', 'POST', apiKey, {
    name,
    sourceType,
    sourceUrl,
  });
  if (!ok) return { error: data.error || 'Failed to create project' };
  return data;
}

async function handleDeleteProject(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}`,
    'DELETE',
    apiKey
  );
  if (!ok) return { error: data.error || 'Failed to delete project' };
  return { success: true, projectId };
}

async function handleCheckCredits(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const includeHistory = (args.includeHistory as boolean) ?? false;

  const { ok, data } = await studioFetch('/api/absorb/credits', 'GET', apiKey);
  if (!ok) return { error: data.error || 'Failed to check credits' };

  const result: Record<string, unknown> = {
    balance: data.balance,
    balanceDollars: `$${((data.balance ?? 0) / 100).toFixed(2)}`,
    tier: data.tier,
  };

  if (includeHistory) {
    const historyRes = await studioFetch(
      '/api/absorb/credits/history?limit=20',
      'GET',
      apiKey
    );
    if (historyRes.ok) {
      result.recentTransactions = historyRes.data.transactions;
    }
  }

  return result;
}

async function handleRunAbsorb(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;
  const depth = (args.depth as string) ?? 'shallow';
  const tier = (args.tier as string) ?? 'medium';

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}/absorb`,
    'POST',
    apiKey,
    { depth, tier }
  );
  if (!ok) return { error: data.error || 'Absorb failed' };
  return data;
}

async function handleRunImprove(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;
  const profile = (args.profile as string) ?? 'quick';
  const tier = (args.tier as string) ?? 'medium';

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}/improve`,
    'POST',
    apiKey,
    { profile, tier }
  );
  if (!ok) return { error: data.error || 'Improvement failed' };
  return data;
}

async function handleRunQuery(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;
  const query = args.query as string;
  const withLLM = (args.withLLM as boolean) ?? false;
  const maxResults = args.maxResults as number | undefined;

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}/query`,
    'POST',
    apiKey,
    { query, withLLM, maxResults }
  );
  if (!ok) return { error: data.error || 'Query failed' };
  return data;
}

async function handleRunRender(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;
  const format = (args.format as string) ?? 'png';
  const width = args.width as number | undefined;
  const height = args.height as number | undefined;
  const quality = args.quality as number | undefined;

  const body: Record<string, unknown> = { format };
  if (width !== undefined) body.width = width;
  if (height !== undefined) body.height = height;
  if (quality !== undefined) body.quality = quality;

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}/render`,
    'POST',
    apiKey,
    body
  );
  if (!ok) return { error: data.error || 'Render failed' };
  return data;
}

async function handleRunDiff(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;
  const sourceA = args.sourceA as string;
  const sourceB = args.sourceB as string;

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}/diff`,
    'POST',
    apiKey,
    { sourceA, sourceB }
  );
  if (!ok) return { error: data.error || 'Diff failed' };
  return data;
}

async function handleRunPipeline(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;
  const layer = (args.layer as string) ?? 'l0';

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}/pipeline`,
    'POST',
    apiKey,
    { layer }
  );
  if (!ok) return { error: data.error || 'Pipeline failed' };
  return data;
}
