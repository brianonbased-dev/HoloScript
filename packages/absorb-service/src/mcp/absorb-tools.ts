/**
 * MCP Absorb Service Tools for HoloScript
 *
 * Two tiers:
 *
 * FREE (no API key, no credits — runs locally on the MCP server):
 * - absorb_query:           Semantic codebase search (local GraphRAG)
 * - absorb_diff:            Semantic diff between two sources (local AST)
 * - absorb_list_projects:   List projects
 * - absorb_create_project:  Create a project
 * - absorb_delete_project:  Delete a project
 * - absorb_check_credits:   Check balance
 *
 * PAID (requires API key + credits, proxies to Studio):
 * - absorb_run_absorb:      Full codebase absorption (10-50 credits)
 * - absorb_run_improve:     HoloDaemon improvement (25-150 credits)
 * - absorb_run_query_ai:    AI-synthesized answer with LLM (15+ credits)
 * - absorb_run_render:      Screenshot/PDF export (3-5 credits)
 * - absorb_run_pipeline:    Recursive self-improvement (varies)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

function getStudioUrl(): string {
  return (
    process.env.HOLOSCRIPT_STUDIO_URL || process.env.STUDIO_URL || 'https://studio.holoscript.net'
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
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${getStudioUrl()}${path}`;
  const key = apiKey || getDefaultApiKey();

  if (!key) {
    return {
      ok: false,
      status: 401,
      data: {
        error:
          'No API key provided. Set ABSORB_API_KEY env var or pass apiKey argument. Get a free key at https://studio.holoscript.net/absorb',
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
  // ═══════════════════════════════════════════════════════════════════════════
  // FREE TOOLS — no API key, no credits, runs locally
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'absorb_query',
    description:
      '[FREE] Semantic search over any absorbed codebase. Uses local GraphRAG — no API key or credits needed. Returns ranked symbols with file, line, score. Call holo_absorb_repo first to load a codebase.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language query (e.g., "authentication handler", "database connection", "error recovery")',
        },
        maxResults: {
          type: 'number',
          description: 'Max results to return (default: 10, max: 50)',
        },
        language: {
          type: 'string',
          description: 'Filter to language (e.g., "typescript", "python")',
        },
        type: {
          type: 'string',
          description: 'Filter to symbol type (e.g., "class", "function", "interface")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'absorb_diff',
    description:
      '[FREE] Semantic diff between two code snippets. Detects renames, moves, and structural changes using AST comparison. No API key or credits needed.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceA: {
          type: 'string',
          description: 'First source code version',
        },
        sourceB: {
          type: 'string',
          description: 'Second source code version',
        },
      },
      required: ['sourceA', 'sourceB'],
    },
  },
  {
    name: 'absorb_list_projects',
    description:
      '[FREE] List all absorb projects for the authenticated user. Returns project names, statuses, source types, and usage stats.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: {
          type: 'string',
          description: 'Absorb API key. Falls back to ABSORB_API_KEY env var.',
        },
      },
    },
  },
  {
    name: 'absorb_create_project',
    description:
      '[FREE] Create a new absorb project. Projects track any codebase (GitHub URL, local path, or uploaded source) for continuous improvement.',
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
    description: '[FREE] Delete an absorb project by ID.',
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
  {
    name: 'absorb_check_credits',
    description:
      '[FREE] Check credit balance and account tier. 1 credit = $0.01. Returns balance, tier, and usage history.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PAID TOOLS — requires API key + credits, proxies to Studio
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: 'absorb_run_absorb',
    description:
      '[PAID: 10-50 credits] Run full codebase absorption on a project. Scans all files, builds knowledge graph, enables semantic queries. Shallow=10 credits, Deep=50 credits.',
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
          description: 'Scan depth. Default: shallow.',
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
    name: 'absorb_run_improve',
    description:
      '[PAID: 25-150 credits] Run HoloDaemon improvement cycle. Analyzes code, finds issues, generates fixes. Quick=25, Balanced=75, Deep=150 credits.',
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
          description: 'Improvement profile. Default: quick.',
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
    name: 'absorb_run_query_ai',
    description:
      '[PAID: 15+ credits] AI-powered codebase Q&A with LLM synthesis. Returns a coherent natural language answer with citations. For free search, use absorb_query instead.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to query',
        },
        question: {
          type: 'string',
          description:
            'Natural language question (e.g., "How does authentication work?", "Explain the data flow")',
        },
        maxResults: {
          type: 'number',
          description: 'Context window size (default: 20)',
        },
        apiKey: {
          type: 'string',
          description: 'Absorb API key for authentication',
        },
      },
      required: ['projectId', 'question'],
    },
  },
  {
    name: 'absorb_run_render',
    description:
      '[PAID: 3-5 credits] Render screenshot or PDF of a project visualization. PNG/JPEG/WebP=3 credits, PDF=5 credits.',
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
          description: 'Viewport width (320-3840). Default: 1280.',
        },
        height: {
          type: 'number',
          description: 'Viewport height (240-2160). Default: 720.',
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
    name: 'absorb_run_pipeline',
    description:
      '[PAID: varies] Run recursive self-improvement pipeline. L0 fixes code, L1 optimizes strategy, L2 generates skills. Requires credits.',
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
    // Free tools (local)
    case 'absorb_query':
      return handleFreeQuery(args);
    case 'absorb_diff':
      return handleFreeDiff(args);
    case 'absorb_list_projects':
      return handleListProjects(args);
    case 'absorb_create_project':
      return handleCreateProject(args);
    case 'absorb_delete_project':
      return handleDeleteProject(args);
    case 'absorb_check_credits':
      return handleCheckCredits(args);
    // Paid tools (Studio proxy)
    case 'absorb_run_absorb':
      return handleRunAbsorb(args);
    case 'absorb_run_improve':
      return handleRunImprove(args);
    case 'absorb_run_query_ai':
      return handleRunQueryAI(args);
    case 'absorb_run_render':
      return handleRunRender(args);
    case 'absorb_run_pipeline':
      return handleRunPipeline(args);
    default:
      return null;
  }
}

// =============================================================================
// FREE HANDLERS — run locally, no credits
// =============================================================================

/**
 * Free semantic search — delegates to the local GraphRAG engine
 * (same as holo_semantic_search but branded under absorb_).
 */
async function handleFreeQuery(args: Record<string, unknown>): Promise<unknown> {
  const { handleGraphRagTool, isGraphRAGReady } = await import('./graph-rag-tools');

  if (!isGraphRAGReady()) {
    return {
      error:
        'No codebase loaded. Call holo_absorb_repo first to scan a codebase (free, runs locally).',
      hint: 'Example: holo_absorb_repo with rootDir pointing to your project directory.',
    };
  }

  const result = await handleGraphRagTool('holo_semantic_search', {
    query: args.query,
    topK: args.maxResults ?? 10,
    language: args.language,
    type: args.type,
  });

  return {
    ...(result as Record<string, unknown>),
    free: true,
    hint: 'This search is free. For AI-synthesized answers, use absorb_run_query_ai (paid).',
  };
}

/**
 * Free semantic diff — runs locally using @holoscript/core's SemanticDiffEngine.
 */
async function handleFreeDiff(args: Record<string, unknown>): Promise<unknown> {
  const sourceA = args.sourceA as string;
  const sourceB = args.sourceB as string;

  if (!sourceA || !sourceB) {
    return { error: 'Both sourceA and sourceB are required.' };
  }

  // Cap input size to prevent abuse (100KB each)
  if (sourceA.length > 102400 || sourceB.length > 102400) {
    return { error: 'Source inputs must be under 100KB each.' };
  }

  try {
    const pkg = '@holoscript/core';
    const mod = await import(/* webpackIgnore: true */ pkg);

    // Try the semantic diff engine
    if (mod.SemanticDiffEngine || mod.semanticDiff) {
      const diffFn =
        mod.semanticDiff ||
        ((a: string, b: string) => {
          const engine = new mod.SemanticDiffEngine();
          // Parse both sources, then diff the ASTs
          const parser = new (mod.HoloScriptPlusParser || mod.HoloScriptParser)();
          const astA = parser.parse(a);
          const astB = parser.parse(b);
          return engine.diff(astA, astB);
        });

      const result = diffFn(sourceA, sourceB);
      return {
        diff: result,
        free: true,
      };
    }

    // Fallback: basic text diff
    const linesA = sourceA.split('\n');
    const linesB = sourceB.split('\n');
    return {
      diff: {
        linesA: linesA.length,
        linesB: linesB.length,
        identical: sourceA === sourceB,
      },
      free: true,
      hint: 'SemanticDiffEngine not available in this build. Showing basic comparison.',
    };
  } catch (err) {
    return {
      error: `Diff failed: ${(err as Error).message}`,
      free: true,
    };
  }
}

// =============================================================================
// FREE HANDLERS — project management (Studio proxy, no credits deducted)
// =============================================================================

async function handleListProjects(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const { ok, data } = await studioFetch('/api/absorb/projects', 'GET', apiKey);
  // @ts-ignore - Automatic remediation for TS18046
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
  // @ts-ignore - Automatic remediation for TS18046
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
  // @ts-ignore - Automatic remediation for TS18046
  if (!ok) return { error: data.error || 'Failed to delete project' };
  return { success: true, projectId };
}

async function handleCheckCredits(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const includeHistory = (args.includeHistory as boolean) ?? false;

  const { ok, data } = await studioFetch('/api/absorb/credits', 'GET', apiKey);
  // @ts-ignore - Automatic remediation for TS18046
  if (!ok) return { error: data.error || 'Failed to check credits' };

  const result: Record<string, unknown> = {
    // @ts-ignore - Automatic remediation for TS18046
    balance: data.balance,
    // @ts-ignore - Automatic remediation for TS18046
    balanceDollars: `$${((data.balance ?? 0) / 100).toFixed(2)}`,
    // @ts-ignore - Automatic remediation for TS18046
    tier: data.tier,
  };

  if (includeHistory) {
    const historyRes = await studioFetch('/api/absorb/credits/history?limit=20', 'GET', apiKey);
    if (historyRes.ok) {
      // @ts-ignore - Automatic remediation for TS18046
      result.recentTransactions = historyRes.data.transactions;
    }
  }

  return result;
}

// =============================================================================
// PAID HANDLERS — Studio proxy, credits deducted
// =============================================================================

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
  // @ts-ignore - Automatic remediation for TS18046
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
  // @ts-ignore - Automatic remediation for TS18046
  if (!ok) return { error: data.error || 'Improvement failed' };
  return data;
}

async function handleRunQueryAI(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args.apiKey as string | undefined;
  const projectId = args.projectId as string;
  const question = args.question as string;
  const maxResults = args.maxResults as number | undefined;

  const { ok, data } = await studioFetch(
    `/api/absorb/projects/${encodeURIComponent(projectId)}/query`,
    'POST',
    apiKey,
    { query: question, withLLM: true, maxResults }
  );
  // @ts-ignore - Automatic remediation for TS18046
  if (!ok) return { error: data.error || 'AI query failed' };
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
  // @ts-ignore - Automatic remediation for TS18046
  if (!ok) return { error: data.error || 'Render failed' };
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
  // @ts-ignore - Automatic remediation for TS18046
  if (!ok) return { error: data.error || 'Pipeline failed' };
  return data;
}
