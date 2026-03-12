/**
 * @holoscript/mcp-server
 *
 * Model Context Protocol server for HoloScript language tooling.
 * Enables AI agents (Grok, Claude, Copilot, etc.) to parse, validate,
 * generate, and COMPILE HoloScript code to 25+ platforms.
 *
 * 72+ tools across 14 categories:
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
 * - Browser control (3), Training data (1) [included in Core tools above]
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools';
import { handleTool } from './handlers';
import { PluginManager } from './PluginManager';
import { networkingTools, handleNetworkingTool } from './networking-tools';
import { snapshotTools, handleSnapshotTool } from './snapshot-tools';
import { monitoringTools, handleMonitoringTool } from './monitoring-tools';
import { compilerTools, handleCompilerTool } from './compiler-tools';
import { handleCodebaseTool } from './codebase-tools';
import { handleGraphRagTool } from './graph-rag-tools';
import { selfImproveTools, handleSelfImproveTool } from './self-improve-tools';
import { gltfImportTools, handleGltfTool } from './gltf-import-tools';
import { holotestTools, handleHolotestTool } from './holotest-tools';

// Create MCP server
const server = new Server(
  {
    name: 'holoscript-mcp',
    version: '5.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...tools,           // All core/graph/IDE/AI/codebase/graphRAG/selfImprove/plugins (from tools.ts)
      ...compilerTools,   // 8 compiler tools (Unity, Unreal, URDF, WebGPU, R3F, etc.)
      ...networkingTools, // 2 networking RPC tools
      ...snapshotTools,   // 3 temporal snapshot tools
      ...monitoringTools, // 1 telemetry tool
      ...holotestTools,   // 1 spatial testing tool (execute_holotest)
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('HoloScript MCP Server running on stdio');
}

main().catch(console.error);

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
