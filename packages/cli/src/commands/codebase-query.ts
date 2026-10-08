import path from 'node:path';
import type { CLIOptions } from '../args';

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export interface CodebaseQueryHandlers {
  handleCodebaseTool: ToolHandler;
  handleGraphRagTool: ToolHandler;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The Absorb handlers judge a graph against the workspace root, which is
 * process.cwd() unless HOLOSCRIPT_WORKSPACE_ROOT pins it. A --dir below the cwd
 * would be absorbed and then refused by the semantic tools as a nested slice of the
 * cwd (cache_root_mismatch), so a query with --dir pins the root to it while the
 * handlers run, and restores the previous value afterwards.
 */
async function withWorkspaceRoot<T>(
  rootDir: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  if (!rootDir) return run();
  const previous = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
  process.env.HOLOSCRIPT_WORKSPACE_ROOT = rootDir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
    else process.env.HOLOSCRIPT_WORKSPACE_ROOT = previous;
  }
}

export async function defaultHandlers(): Promise<CodebaseQueryHandlers> {
  const mcp = await import('@holoscript/absorb-service/mcp');
  // The CLI runs as the local user on their own checkout, so it may read code
  // (the library default is "no" for hosts that serve other callers).
  mcp.setCodeReadDefault(true);
  return {
    handleCodebaseTool: mcp.handleCodebaseTool,
    handleGraphRagTool: mcp.handleGraphRagTool,
  };
}

/**
 * Run the CLI fallback through the same Absorb handlers and workspace cache as
 * MCP. This path remains usable when an agent host has a closed MCP transport;
 * it deliberately does not maintain a second scanner/index/cache stack.
 */
export async function executeCanonicalCodebaseQuery(
  options: Pick<
    CLIOptions,
    | 'input'
    | 'force'
    | 'queryDir'
    | 'queryLlm'
    | 'queryLlmKey'
    | 'queryModel'
    | 'queryTopK'
    | 'queryWithLlm'
  >,
  injectedHandlers?: CodebaseQueryHandlers
): Promise<Record<string, unknown>> {
  if (!options.input) {
    return { error: 'No question specified.' };
  }

  const rootDir = options.queryDir ? path.resolve(options.queryDir) : process.cwd();
  const pinnedRoot = options.queryDir ? rootDir : undefined;
  const handlers = injectedHandlers ?? (await defaultHandlers());
  const absorb = asRecord(
    await withWorkspaceRoot(pinnedRoot, () =>
      handlers.handleCodebaseTool('holo_absorb_repo', {
        rootDir,
        force: options.force === true,
        outputFormat: 'graph',
        includeBuildArtifacts: false,
        interactive: false,
      })
    )
  );
  if (absorb.error) {
    return {
      ...absorb,
      queryProvenance: {
        schema: 'holoscript.cli-codebase-query.v1',
        mode: 'direct-canonical-handler',
        rootDir,
        stage: 'absorb',
      },
    };
  }

  const topK = options.queryTopK ?? 10;
  const toolName = options.queryWithLlm ? 'holo_ask_codebase' : 'holo_semantic_search';
  const toolArgs = options.queryWithLlm
    ? {
        question: options.input,
        topK,
        ...(options.queryLlm ? { llmProvider: options.queryLlm } : {}),
        ...(options.queryLlmKey ? { llmApiKey: options.queryLlmKey } : {}),
        ...(options.queryModel ? { llmModel: options.queryModel } : {}),
      }
    : {
        query: options.input,
        topK,
        useCachedAbsorbIndex: true,
      };
  const result = asRecord(
    await withWorkspaceRoot(pinnedRoot, () => handlers.handleGraphRagTool(toolName, toolArgs))
  );

  return {
    ...result,
    queryProvenance: {
      schema: 'holoscript.cli-codebase-query.v1',
      mode: 'direct-canonical-handler',
      rootDir,
      cacheAuthority: 'absorb-workspace-v1',
      graphTool: toolName,
      transportIndependent: true,
      absorb: {
        cacheHit: absorb.cacheHit ?? null,
        incremental: absorb.incremental ?? null,
        graphRagReady: absorb.graphRagReady ?? null,
      },
    },
  };
}
