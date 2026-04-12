/**
 * @holoscript/mcp-server
 *
 * Model Context Protocol server for HoloScript language tooling.
 * Enables AI agents (Grok, Claude, Copilot, etc.) to parse, validate,
 * generate, and COMPILE HoloScript code to 25+ platforms.
 *
 * 82+ tools across 15 categories:
 * - Core (15): Parse, validate, generate, render, share, explain, analyze
 * - Graph (13): Parse-to-graph, visualize, design, diff, connections, node query
 * - IDE (9): Scan, diagnostics, autocomplete, refactor, docs, hover
 * - Brittney-Lite AI (4): Explain errors, fix code, review, scaffold
 * - Codebase (5): Absorb repo, query, impact analysis, change detection
 * - Graph RAG (2): Semantic search, natural language Q&A
 * - Self-Improve (2): Diagnose, validate quality
 * - GLTF (2): Import glTF/GLB to .holo, compile .holo to glTF/GLB
 * - EditHolo (1): In-place .holo file editing for agents
 * - Compiler (8): Compile to Unity, Unreal, URDF, WebGPU, R3F, etc.
 * - Networking (2): Multiplayer RPC layer
 * - Snapshot (3): Temporal scene snapshots
 * - Monitoring (1): Telemetry and health
 * - HoloTest (1): Spatial scene testing
 * - Absorb Service (10): Project mgmt, credits, absorb, improve, query, render, diff, pipeline
 * - Browser control (3), Training data (1) [included in Core tools above]
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools';
import { handleTool } from './handlers';
import { PluginManager } from './PluginManager';
import { networkingTools, handleNetworkingTool } from './networking-tools';
import { snapshotTools, handleSnapshotTool } from './snapshot-tools';
import { monitoringTools, handleMonitoringTool } from './monitoring-tools';
import { compilerTools, handleCompilerTool } from './compiler-tools';
import {
  handleCodebaseTool,
  handleGraphRagTool,
  handleAbsorbServiceTool,
} from '@holoscript/absorb-service/mcp';

// Oracle handler inlined to avoid cross-package import issues in Docker build
async function handleOracleConsult(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const question = String(args.question || '').toLowerCase();
  const context = String(args.context || '');
  const results: string[] = [];

  const TREES: Record<string, string> = {
    package:
      'Add to the closest relevant existing package. Only create a new package if standalone service or shared by 3+ packages.',
    commit:
      'Commit after coherent unit. 10+ files: MUST split into sectioned commits by topic. NEVER git add -A.',
    test: 'Fix if yours, skip if pre-existing (VRChatCompiler = known). Can fix in <15 min? Fix. Complex? Note and continue.',
    mcp: 'Use MCP if reachable (richer). CLI as fallback.',
    cache:
      '<12h fresh. 12-24h OK. 24-48h stale. >48h force refresh. NEVER force:true unless corrupt.',
    todo: '1.Security 2.FIXME 3.Blocking 4.Performance 5.Tech-debt 6.Nice-to-have. Max 3/cycle.',
    version: "Breaking=MAJOR. New feature=MINOR. Bug fix=PATCH. Don't bump unless releasing.",
    doc: 'New public API=always. Internal refactor=no. Bug fix=only if documented behavior affected.',
    cost: '<$1 auto. $1-5 proceed+mention. $5-20 ASK. >$20 ALWAYS ASK.',
    conflict:
      'User > project CLAUDE.md > AGENTS.md > global CLAUDE.md > NORTH_STAR.md > memory > research > README.',
    repo: 'Default: HoloScript. Unless explicitly told otherwise.',
    embedding: 'ALWAYS OpenAI. BM25 deprecated. Ensure OPENAI_API_KEY in env.',
    git: 'ALWAYS explicit file paths. NEVER git add -A or git add .',
  };

  const dtMatches: string[] = [];
  for (const [key, answer] of Object.entries(TREES)) {
    if (question.includes(key)) dtMatches.push(`**[${key}]**: ${answer}`);
  }
  if (dtMatches.length > 0) results.push('## Decision Tree Matches\n' + dtMatches.join('\n\n'));

  // Query knowledge store
  const apiKey = process.env.MCP_API_KEY || process.env.ABSORB_API_KEY;
  if (apiKey) {
    try {
      const url =
        process.env.MCP_ORCHESTRATOR_PUBLIC_URL ||
        'https://mcp-orchestrator-production-45f9.up.railway.app';
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${url}/knowledge/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': apiKey },
        body: JSON.stringify({
          search: `${question} ${context}`.trim(),
          limit: 5,
          workspace_id: 'ai-ecosystem',
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        interface KnowledgeEntry {
          id?: string;
          type?: string;
          content?: string;
        }
        const data = (await res.json()) as {
          results?: KnowledgeEntry[];
          entries?: KnowledgeEntry[];
        };
        const entries = data.results || data.entries || [];
        if (entries.length > 0) {
          results.push(
            '## Knowledge Store\n' +
              entries
                .map(
                  (e: KnowledgeEntry) =>
                    `- **[${e.id || e.type}]** ${String(e.content || '').substring(0, 200)}`
                )
                .join('\n')
          );
        }
      }
    } catch {
      /* timeout or network — continue without knowledge */
    }
  }

  if (results.length === 0) {
    results.push(
      '## No Oracle Match\nMake the conservative choice (easier to undo) and note what you decided.'
    );
  } else {
    results.push('\n---\n*Oracle answered. Proceed without asking the user.*');
  }
  return { content: [{ type: 'text', text: results.join('\n\n') }] };
}
import { selfImproveTools, handleSelfImproveTool } from './self-improve-tools';
import { gltfImportTools, handleGltfTool } from './gltf-import-tools';
import { holotestTools, handleHolotestTool } from './holotest-tools';
import { handleWisdomGotchaTool } from './wisdom-gotcha-tools';
import { refactorCodegenTools, handleRefactorCodegenTool } from './refactor-codegen-tools';
import { handleBatchToolCall } from './tooling-discovery-tools';

declare const __SERVICE_VERSION__: string;

// Create MCP server
const server = new Server(
  {
    name: 'holoscript-mcp',
    version: typeof __SERVICE_VERSION__ !== 'undefined' ? __SERVICE_VERSION__ : '0.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Unified list of all tools
const ALL_AVAILABLE_TOOLS: Tool[] = [
  ...tools, // All core/graph/IDE/AI/codebase/graphRAG/selfImprove/plugins (from tools.ts)
  ...compilerTools, // 8 compiler tools (Unity, Unreal, URDF, WebGPU, R3F, etc.)
  ...networkingTools, // 2 networking RPC tools
  ...snapshotTools, // 3 temporal snapshot tools
  ...monitoringTools, // 1 telemetry tool
  ...holotestTools, // 1 spatial testing tool (execute_holotest)
  ...refactorCodegenTools, // 2 refactor/codegen tools (Phase 10)
];

ALL_AVAILABLE_TOOLS.push(
  {
    name: 'holoscript_discover_tools',
    description: 'Search for available MCP tools by intent or keyword. Returns tool names, descriptions, and schemas. Use this when you are unsure which tool to use.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'What you are trying to do (e.g. "parse HoloScript code", "search codebase", "compile").' },
        limit: { type: 'number', description: 'Max number of results to return (default 5).' }
      },
      required: ['intent']
    }
  },
  {
    name: 'holoscript_batch_execute',
    description: 'Execute multiple MCP tools sequentially in a single turn. Useful for chaining actions without waiting for multiple conversational turns.',
    inputSchema: {
      type: 'object',
      properties: {
        requests: {
          type: 'array',
          description: 'A list of tool requests to execute in order.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name of the tool to execute' },
              arguments: { type: 'object', description: 'Arguments for the tool' }
            },
            required: ['name', 'arguments']
          }
        }
      },
      required: ['requests']
    }
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_AVAILABLE_TOOLS.map(t => {
      // Dynamic Appender: Ensure ALL tools explicitly state what they return per Gap 3 Requirements
      if (!t.description.includes('Returns:') && !t.description.includes('Output:')) {
        return {
          ...t,
          description: t.description + '\n\nReturns: JSON object with execution results. Specific schema omitted, see tool implementation.'
        };
      }
      return t;
    })
  };
});

// Single tool executor allowing internal recursive calls
export async function executeSingleTool(name: string, args: Record<string, unknown>) {
  try {
    if (name === 'holoscript_discover_tools') {
      const intent = String(args?.intent || '').toLowerCase();
      const limit = Number(args?.limit || 5);

      const words = intent.split(/\W+/).filter((w) => w.length > 2);
      const scoredTools = ALL_AVAILABLE_TOOLS.map((t) => {
        const textToSearch = `${t.name} ${t.description}`.toLowerCase();
        let score = 0;
        if (t.name.toLowerCase().includes(intent)) score += 10;
        if (t.description.toLowerCase().includes(intent)) score += 5;
        for (const word of words) {
          if (textToSearch.includes(word)) score += 1;
        }
        return { tool: t, score };
      })
        .filter((t) => t.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return {
        content: [{ type: 'text', text: JSON.stringify(scoredTools.map((s) => s.tool), null, 2) }],
      };
    }

    if (name === 'holoscript_batch_execute') {
      const requests = ((args?.requests as unknown[]) || []) as Array<{
        name?: string;
        arguments?: Record<string, unknown>;
      }>;
      const results: unknown[] = [];
      for (const req of requests) {
        const res = await executeSingleTool(String(req.name || ''), req.arguments || {});
        results.push({
          name: req.name,
          status: (res as { isError?: boolean }).isError ? 'error' : 'success',
          result: (res as { content?: unknown }).content,
        });
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      };
    }

    if (name === 'batch_tool_call') {
      const batchResult = await handleBatchToolCall(args || {}, async (toolName, toolArgs) => {
        const res = await executeSingleTool(toolName, toolArgs || {});

        if ((res as { isError?: boolean }).isError) {
          const errorText = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text;
          throw new Error(errorText || `Tool ${toolName} failed`);
        }

        const text = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text;
        if (!text) return null;

        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(batchResult, null, 2) }],
      };
    }

    return await _handleSingleToolLogic(name, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await executeSingleTool(name, args || {});
});

// Implementation of executeSingleTool logic previously bound above
export async function _handleSingleToolLogic(name: string, args: Record<string, unknown>) {
  try {
    // Check plugins first (for proprietary tools like uaa2_)
    const pluginResult = await PluginManager.handleTool(name, args || {});
    if (pluginResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(pluginResult, null, 2) }],
      };
    }

    // Check compiler tools (compile_holoscript, compile_to_*, get_compilation_status, etc.)
    const compilerResult = await handleCompilerTool(name, args || {});
    if (compilerResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(compilerResult, null, 2) }],
      };
    }

    // Check custom Networking RPC Layer
    const networkingResult = await handleNetworkingTool(name, args || {});
    if (networkingResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(networkingResult, null, 2) }],
      };
    }

    // Check custom Temporal Snapshot Layer
    const snapshotResult = await handleSnapshotTool(name, args || {});
    if (snapshotResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(snapshotResult, null, 2) }],
      };
    }

    // Check custom Monitoring Layer
    const monitoringResult = await handleMonitoringTool(name, args || {});
    if (monitoringResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(monitoringResult, null, 2) }],
      };
    }

    // Check Oracle tools FIRST (before other holo_* handlers catch the prefix)
    if (name === 'holo_oracle_consult') {
      return await handleOracleConsult(args || ({} as Record<string, unknown>));
    }

    // Check Codebase Absorption tools
    const codebaseResult = await handleCodebaseTool(name, args || {});
    if (codebaseResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(codebaseResult, null, 2) }],
      };
    }

    // Check Graph RAG tools (semantic search, ask codebase)
    const graphRagResult = await handleGraphRagTool(name, args || {});
    if (graphRagResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(graphRagResult, null, 2) }],
      };
    }

    // Check Self-Improve tools (diagnose, validate quality)
    const selfImproveResult = await handleSelfImproveTool(name, args || {});
    if (selfImproveResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(selfImproveResult, null, 2) }],
      };
    }

    // Check Wisdom/Gotcha tools (query_wisdom, list_gotchas, check_gotchas)
    const wisdomGotchaResult = await handleWisdomGotchaTool(name, args || {});
    if (wisdomGotchaResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(wisdomGotchaResult, null, 2) }],
      };
    }

    // Check GLTF Import/Export tools (import_gltf, compile_to_gltf)
    const gltfResult = await handleGltfTool(name, args || {});
    if (gltfResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(gltfResult, null, 2) }],
      };
    }

    // Check HoloTest spatial testing tool (execute_holotest)
    const holotestResult = await handleHolotestTool(name, args || {});
    if (holotestResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(holotestResult, null, 2) }],
      };
    }

    // Check Refactor/CodeGen tools (Phase 10: refactor plan, scaffold)
    const refactorResult = await handleRefactorCodegenTool(name, args || {});
    if (refactorResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(refactorResult, null, 2) }],
      };
    }

    // Check Absorb Service tools (project management, credit-gated operations)
    const absorbServiceResult = await handleAbsorbServiceTool(name, args || {});
    if (absorbServiceResult !== null) {
      return {
        content: [{ type: 'text', text: JSON.stringify(absorbServiceResult, null, 2) }],
      };
    }

    const result = await handleTool(name, args || {});
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

// Start server
import { requireConfig, REQUIRED_VARS } from '@holoscript/config';

async function main() {
  requireConfig((REQUIRED_VARS.MCP_SERVER as unknown as string[]), 'mcp-server');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('HoloScript MCP Server running on stdio');
}

// Only auto-start the Stdio server if executed directly as a standalone process
if (
  process.env.START_MCP_STDIO === 'true' ||
  process.argv.some(
    (arg) => arg.includes('mcp-server') && (arg.endsWith('index.ts') || arg.endsWith('index.js'))
  )
) {
  main().catch(console.error);
}

// Also export for programmatic use
export { server, tools, handleTool };
export * from './tools';
export * from './handlers';
export * from './generators';
export * from './renderer';
export * from './graph-tools';
export * from './ide-tools';
export * from './brittney-lite';
export * from './compiler-tools';
export * from './gltf-import-tools';
export * from './wisdom-gotcha-tools';
export * from '@holoscript/absorb-service/mcp';
export * from './a2a';
export * from './security';
export * from './holomesh/index';
