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
  codebaseTools,
  graphRagTools,
  absorbServiceTools,
  handleCodebaseTool,
  handleGraphRagTool,
  handleAbsorbServiceTool,
} from '@holoscript/absorb-service/mcp';
import { handleOracleConsult } from './oracle-handler';
import { selfImproveTools, handleSelfImproveTool } from './self-improve-tools';
import { gltfImportTools, handleGltfTool } from './gltf-import-tools';
import { holotestTools, handleHolotestTool } from './holotest-tools';
import { wisdomGotchaTools, handleWisdomGotchaTool } from './wisdom-gotcha-tools';
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

// tools.ts is the single source of truth for all tool definitions.
// Compiler, networking, snapshot, monitoring, holotest, refactor-codegen are now in tools.ts.
// Only add synthetic meta-tools here (discover + batch).
const ALL_AVAILABLE_TOOLS: Tool[] = [
  ...tools,
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
  },
];

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

// === O(1) TOOL DISPATCH REGISTRY ===
type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<any> | any;
const TOOL_DISPATCH_REGISTRY = new Map<string, ToolHandler>();

function registerCategory(toolArray: Tool[], handler: ToolHandler) {
  for (const t of toolArray) {
    if (t.name) TOOL_DISPATCH_REGISTRY.set(t.name, handler);
  }
}

// 1. Explicitly mapped domains
registerCategory(compilerTools, (name, args) => handleCompilerTool(name, args));
registerCategory(networkingTools, (name, args) => handleNetworkingTool(name, args));
registerCategory(snapshotTools, (name, args) => handleSnapshotTool(name, args));
registerCategory(monitoringTools, (name, args) => handleMonitoringTool(name, args));
registerCategory(holotestTools, (name, args) => handleHolotestTool(name, args));
registerCategory(refactorCodegenTools, (name, args) => handleRefactorCodegenTool(name, args));
registerCategory(absorbServiceTools, (name, args) => handleAbsorbServiceTool(name, args));
registerCategory(codebaseTools, (name, args) => handleCodebaseTool(name, args));
registerCategory(graphRagTools, (name, args) => handleGraphRagTool(name, args));
registerCategory(selfImproveTools, (name, args) => handleSelfImproveTool(name, args));
registerCategory(gltfImportTools, (name, args) => handleGltfTool(name, args));
registerCategory(wisdomGotchaTools, (name, args) => handleWisdomGotchaTool(name, args));

// 2. Core fallback (anything else exported in `tools.ts` array)
for (const t of tools) {
  if (t.name && !TOOL_DISPATCH_REGISTRY.has(t.name)) {
    TOOL_DISPATCH_REGISTRY.set(t.name, (name, args) => handleTool(name, args));
  }
}

// Implementation of executeSingleTool logic previously bound above
export async function _handleSingleToolLogic(name: string, args: Record<string, unknown>) {
  try {
    // 1. Plugin namespace isolation (Enforce strict O(1) boundary for proprietary tool shadowing prevention)
    if (name.startsWith('uaa2_') || name.startsWith('hs_plugin_')) {
      const pluginResult = await PluginManager.handleTool(name, args || {});
      if (pluginResult !== null) {
        return {
          content: [{ type: 'text', text: JSON.stringify(pluginResult, null, 2) }],
        };
      }
      throw new Error(`Plugin tool '${name}' not found or failed.`);
    }

    // 2. Fast O(1) Dispatch
    const handler = TOOL_DISPATCH_REGISTRY.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await handler(name, args || {});
    
    // Tools that returned null failed to match inside their specialized handler (should be rare with Map)
    if (result === null) {
      throw new Error(`Handler for '${name}' returned null (tool not processed).`);
    }

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
