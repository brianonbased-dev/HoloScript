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
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

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
import { oracleMcpTools, handleOracleMcpTool } from './oracle-mcp-tools';
import { selfImproveTools, handleSelfImproveTool } from './self-improve-tools';
import { grpoTools, handleGrpoTool } from './grpo-tools';
import { gltfImportTools, handleGltfTool } from './gltf-import-tools';
import { holotestTools, handleHolotestTool } from './holotest-tools';
import { wisdomGotchaTools, handleWisdomGotchaTool } from './wisdom-gotcha-tools';
import { receiptQueryTools, handleReceiptQueryTool } from './receipt-query-tools';
import { refactorCodegenTools, handleRefactorCodegenTool } from './refactor-codegen-tools';
import { traitTools, handleTraitTool } from './trait-tools';
import { alphafoldTools, handleFetchStructure } from './alphafold-tools';
import { hologramToolDefinitions, handleHologramTool } from './hologram-mcp-tools';
import { holotwinToolDefinitions, handleHoloTwinTool } from './holotwin-mcp-tools';
import { spatialMcpToolDefinitions } from './spatial-mcp-tools';
import {
  hologramContentToolDefinitions,
  handleHologramContentTool,
} from './hologram-content-tools';
import {
  negotiationToolDefinitions,
  handleNegotiationTool,
} from './negotiation-mcp-tools';
import { handleBatchToolCall } from './tooling-discovery-tools';
import { listSkillResources, readSkillResource } from './skill-resources';
import {
  isHologramMcpResponse,
  wrapHologramMcpEnvelope,
} from '@holoscript/core';
import type { SigningContext } from './holomesh/identity/signing-middleware';

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
      resources: {},
    },
  }
);

// tools.ts is the single source of truth for all tool definitions.
// Compiler, networking, snapshot, monitoring, holotest, refactor-codegen are now in tools.ts.
// Only add synthetic meta-tools here (discover + batch).
const ALL_AVAILABLE_TOOLS: Tool[] = [
  ...tools,
  ...grpoTools,
  ...alphafoldTools,
  ...hologramToolDefinitions,
  ...holotwinToolDefinitions,
  ...spatialMcpToolDefinitions,
  ...hologramContentToolDefinitions,
  ...negotiationToolDefinitions,
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
  let mappedTools = [...ALL_AVAILABLE_TOOLS, ...PluginManager.getTools()].map(t => {
    // Dynamic Appender: Ensure ALL tools explicitly state what they return per Gap 3 Requirements
    const desc = t.description || '';
    if (!desc.includes('Returns:') && !desc.includes('Output:')) {
      return {
        ...t,
        description: desc + '\n\nReturns: JSON object with execution results. Specific schema omitted, see tool implementation.'
      };
    }
    return t;
  });

  const limit = parseInt(process.env.HOLOSCRIPT_MAX_TOOLS || '99', 10);
  if (limit > 0 && mappedTools.length > limit) {
    const metaTools = mappedTools.filter(t => t.name === 'holoscript_discover_tools' || t.name === 'holoscript_batch_execute');
    const rest = mappedTools.filter(t => t.name !== 'holoscript_discover_tools' && t.name !== 'holoscript_batch_execute');
    mappedTools = [...metaTools, ...rest].slice(0, limit);
  }

  return { tools: mappedTools };
});

// List available skill resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = listSkillResources();
  return { resources };
});

// Read a specific skill resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const result = readSkillResource(uri);
  if (!result) {
    throw new Error(`Resource not found: ${uri}`);
  }
  return {
    contents: [
      {
        uri,
        mimeType: result.mimeType,
        text: result.text,
      },
    ],
  };
});

// Single tool executor allowing internal recursive calls
export async function executeSingleTool(
  name: string,
  args: Record<string, unknown>,
  signingCtx?: SigningContext
) {
  try {
    if (name === 'holoscript_discover_tools') {
      const intent = String(args?.intent || '').toLowerCase();
      const limit = Number(args?.limit || 5);

      const words = intent.split(/\W+/).filter((w) => w.length > 2);
      const scoredTools = ALL_AVAILABLE_TOOLS.map((t) => {
        const description = t.description ?? '';
        const textToSearch = `${t.name} ${description}`.toLowerCase();
        let score = 0;
        if (t.name.toLowerCase().includes(intent)) score += 10;
        if (description.toLowerCase().includes(intent)) score += 5;
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
        const res = await executeSingleTool(
          String(req.name || ''),
          req.arguments || {},
          signingCtx
        );
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
        const res = await executeSingleTool(toolName, toolArgs || {}, signingCtx);

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

    return await _handleSingleToolLogic(name, args, signingCtx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
}

// Handle tool calls.
//
// AUTH MODEL — this is the **stdio** MCP transport entry. By transport-layer
// design it has no Authorization headers and no per-request signing envelope,
// so it ALWAYS dispatches with `signingCtx=undefined` (trusted local process,
// no network attacker). Defense-in-depth lives elsewhere:
//
//   • HTTP MCP entry (http-server.ts:661) — OAuth-style auth via
//     TokenIntrospection + TOOL_SCOPE_MAP (tool-scopes.ts). Peer's auth path,
//     gates tools by OAuth scopes (e.g. `tools:admin` for holo_secrets_*).
//
//   • Per-request signing envelopes — SigningContext + capability-token
//     gate (signing-middleware.ts → handleSecretsBrokerTool's
//     SECRETS_BROKER_TOOL_CAPABILITIES). Mine, used by HoloMesh routes
//     where envelopes are first-class.
//
// Bridge gap (F.051 canary task_1778596074561_adcf): http-server.ts:671
// passes `auth: TokenIntrospection` to securedToolExecution but does NOT yet
// also extract a SigningContext from envelope-shaped request bodies and
// thread it into executeSingleTool. Until that bridge lands, the leaf-level
// capability gate at handleSecretsBrokerTool is dormant for HTTP callers
// (the type-system threading at every layer is in place — peer's commit
// 17e564097 and mine 5991f8d2e — only the populate step is missing).
//
// Closure path for an HTTP caller:
//   1. http-server.ts line 671 area: parse request body, if it looks like
//      an envelope (envelope_type in {classical, dual, capability}) call
//      extractAndVerifySigning(body) → SigningContext.
//   2. Pass that signingCtx through securedToolExecution → handleTool.
//   3. The leaf gate at handleSecretsBrokerTool then fires automatically.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await executeSingleTool(name, args || {});
});

// === O(1) TOOL DISPATCH REGISTRY ===
type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
  signingCtx?: SigningContext
) => Promise<any> | any;
const TOOL_DISPATCH_REGISTRY = new Map<string, ToolHandler>();

function registerCategory(toolArray: Tool[], handler: ToolHandler) {
  for (const t of toolArray) {
    if (t.name) TOOL_DISPATCH_REGISTRY.set(t.name, handler);
  }
}

// 1. Explicitly mapped domains
registerCategory(compilerTools, (name, args, _signingCtx) => handleCompilerTool(name, args));
registerCategory(networkingTools, (name, args, _signingCtx) => handleNetworkingTool(name, args));
registerCategory(snapshotTools, (name, args, _signingCtx) => handleSnapshotTool(name, args));
registerCategory(monitoringTools, (name, args, _signingCtx) => handleMonitoringTool(name, args));
registerCategory(holotestTools, (name, args, _signingCtx) => handleHolotestTool(name, args));
registerCategory(refactorCodegenTools, (name, args, _signingCtx) => handleRefactorCodegenTool(name, args));
registerCategory(absorbServiceTools, (name, args, _signingCtx) => handleAbsorbServiceTool(name, args));
registerCategory(codebaseTools, (name, args, _signingCtx) => handleCodebaseTool(name, args));
registerCategory(graphRagTools, (name, args, _signingCtx) => handleGraphRagTool(name, args));
registerCategory(selfImproveTools, (name, args, _signingCtx) => handleSelfImproveTool(name, args));
registerCategory(grpoTools, (name, args, _signingCtx) => handleGrpoTool(name, args));
registerCategory(gltfImportTools, (name, args, _signingCtx) => handleGltfTool(name, args));
registerCategory(wisdomGotchaTools, (name, args, _signingCtx) => handleWisdomGotchaTool(name, args));
registerCategory(receiptQueryTools, (name, args, _signingCtx) => handleReceiptQueryTool(name, args));
registerCategory(oracleMcpTools, (name, args, _signingCtx) => handleOracleMcpTool(name, args));
registerCategory(traitTools, (name, args, _signingCtx) => handleTraitTool(name, args));
registerCategory(alphafoldTools, (name, args, _signingCtx) => handleFetchStructure(args));
registerCategory(hologramToolDefinitions, (name, args, _signingCtx) => handleHologramTool(name, args));
registerCategory(holotwinToolDefinitions, (name, args, _signingCtx) => handleHoloTwinTool(name, args));
registerCategory(hologramContentToolDefinitions, (name, args, _signingCtx) =>
  handleHologramContentTool(name, args),
);
registerCategory(negotiationToolDefinitions, (name, args, _signingCtx) =>
  handleNegotiationTool(name, args),
);

// 2. Core fallback (anything else exported in `tools.ts` array)
for (const t of tools) {
  if (t.name && !TOOL_DISPATCH_REGISTRY.has(t.name)) {
    TOOL_DISPATCH_REGISTRY.set(t.name, (name, args, signingCtx) => handleTool(name, args, signingCtx));
  }
}

async function executeBatchInnerTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  signingCtx?: SigningContext
): Promise<unknown> {
  const res = await _handleSingleToolLogic(toolName, toolArgs || {}, signingCtx);

  if ((res as { isError?: boolean }).isError) {
    const errorText = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text;
    throw new Error(errorText || `Tool ${toolName} failed`);
  }

  const text = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text;
  if (!text) return res;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Implementation of executeSingleTool logic previously bound above
export async function _handleSingleToolLogic(
  name: string,
  args: Record<string, unknown>,
  signingCtx?: SigningContext
) {
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

    if (name === 'batch_tool_call') {
      const result = await handleBatchToolCall(
        args || {},
        (toolName, toolArgs) => executeBatchInnerTool(toolName, toolArgs, signingCtx)
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    // 2. Fast O(1) Dispatch
    const handler = TOOL_DISPATCH_REGISTRY.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await handler(name, args || {}, signingCtx);

    // Tools that returned null failed to match inside their specialized handler (should be rare with Map)
    if (result === null) {
      throw new Error(`Handler for '${name}' returned null (tool not processed).`);
    }

    // Hologram MCP envelope detection (task_1778114362909_zp7u). Tools that
    // return a `HologramMcpResponse` get wrapped in the typed dispatch
    // envelope so hologram-aware clients can detect content_type without
    // re-parsing JSON. Backwards-compatible: chat-only clients still see the
    // text payload at content[0].text.
    if (isHologramMcpResponse(result)) {
      return wrapHologramMcpEnvelope(result) as unknown as Record<string, unknown>;
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
import { loadNativeAgentCompositions } from './holomesh/agent/loader';

async function main() {
  // Load agent definitions from native .hsplus fixtures
  loadNativeAgentCompositions();
  
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
export * from './oracle-mcp-tools';
export * from './trait-tools';
export * from './alphafold-tools';
export * from '@holoscript/absorb-service/mcp';
export * from './a2a';
export * from './security';
export * from './holomesh/index';
