/**
 * MCP Tool Definitions for Brittney
 *
 * Extends Brittney to call any tool in the HoloScript ecosystem via:
 * 1. MCP Orchestrator — cross-server tool discovery, routing, knowledge store
 * 2. HoloScript MCP Server — parsing, compilation, trait catalog
 * 3. Absorb MCP Server — codebase intelligence, knowledge graphs
 *
 * Each tool maps to an external MCP endpoint. Execution happens
 * server-side via MCPToolExecutor.
 */

import type { StudioToolDefinition } from './StudioAPITools';

// ─── Orchestrator Tools ────────────────────────────────────────────────────

const mcpDiscoverTools: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'mcp_discover_tools',
    description:
      'List all available MCP tools across every registered server in the ecosystem. Returns tool names, descriptions, and which server hosts them. Use to find the right tool before calling mcp_call_tool.',
    parameters: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description:
            'Optional server name filter. If provided, only lists tools from that server.',
        },
      },
    },
  },
};

const mcpCallTool: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'mcp_call_tool',
    description:
      'Call any MCP tool on any registered server via the orchestrator. The orchestrator routes the call to the correct server. Use mcp_discover_tools first to find available tools and their argument schemas.',
    parameters: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description:
            'Name of the MCP server hosting the tool, e.g. "holoscript-tools", "absorb-service"',
        },
        tool: {
          type: 'string',
          description: 'Name of the tool to call, e.g. "parse_hs", "absorb_run_absorb"',
        },
        args: {
          type: 'object',
          description: 'Arguments to pass to the tool (schema depends on the specific tool)',
        },
      },
      required: ['server', 'tool'],
    },
  },
};

const mcpListServers: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'mcp_list_servers',
    description:
      'List all registered MCP servers in the ecosystem. Returns server names, URLs, health status, and tool counts. Use to see what services are available.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const knowledgeQuery: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'knowledge_query',
    description:
      'Search the ecosystem knowledge store (wisdom, patterns, gotchas). Uses pgvector semantic search across all synced entries. Use when you need to look up architectural decisions, known issues, or best practices.',
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'Natural language search query, e.g. "RBAC compiler pattern" or "railway deployment gotchas"',
        },
        type: {
          type: 'string',
          description: 'Optional filter by knowledge type',
          enum: ['wisdom', 'pattern', 'gotcha'],
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 5, max: 50)',
        },
      },
      required: ['search'],
    },
  },
};

const knowledgeSync: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'knowledge_sync',
    description:
      'Publish knowledge entries to the ecosystem knowledge store. Use after discovering valuable patterns, wisdom, or gotchas that should be shared across agents and sessions.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique entry ID, e.g. "W.MY.001"' },
              type: {
                type: 'string',
                description: 'Entry type',
                enum: ['wisdom', 'pattern', 'gotcha'],
              },
              content: { type: 'string', description: 'The knowledge content' },
              metadata: {
                type: 'object',
                description: 'Optional metadata (domain, tags, confidence)',
              },
            },
            required: ['id', 'type', 'content'],
          } as Record<string, unknown>,
          description: 'Array of knowledge entries to sync',
        },
      },
      required: ['entries'],
    },
  },
};

// ─── HoloScript MCP Tools (direct on mcp.holoscript.net) ───────────────────

const holoParse: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holo_parse',
    description:
      'Parse HoloScript source code into an AST. Returns the abstract syntax tree with all objects, traits, and properties. Use for code analysis, validation, or transformation.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript source code to parse',
        },
      },
      required: ['code'],
    },
  },
};

const holoCompile: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holo_compile',
    description:
      'Compile HoloScript code to any supported target (37 targets including Three.js, React, Unity, Unreal, GLTF, URDF, VisionOS, WebGPU, etc.). Returns compiled output code for the target platform.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript source code to compile',
        },
        target: {
          type: 'string',
          description:
            'Compilation target, e.g. "r3f", "threejs", "unity", "unreal", "godot", "visionos", "gltf", "urdf", "webgpu", "node-service"',
        },
      },
      required: ['code', 'target'],
    },
  },
};

const holoSuggestTraits: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holo_suggest_traits',
    description:
      'Suggest HoloScript traits for a natural language object description. Returns relevant traits with explanations. Use when helping users figure out which traits to apply.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'Natural language description of the object, e.g. "a glowing bouncing ball with sound effects"',
        },
      },
      required: ['description'],
    },
  },
};

const holoGenerateScene: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holo_generate_scene',
    description:
      'Generate a complete HoloScript scene from a natural language description. Returns full .holo source code. Use when the user describes a scene they want to build.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'Natural language description of the scene, e.g. "a cyberpunk city with flying cars and neon signs"',
        },
      },
      required: ['description'],
    },
  },
};

const holoListTraits: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holo_list_traits',
    description:
      'List all available HoloScript traits in the catalog. Returns trait names, categories, and brief descriptions. Use when the user asks "what traits are available?"',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'Optional category filter, e.g. "physics", "rendering", "ai", "networking"',
        },
      },
    },
  },
};

const holoExplainTrait: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holo_explain_trait',
    description:
      'Get a detailed explanation of what a specific HoloScript trait does, its properties, defaults, and usage examples. Use when the user asks "what does @physics do?"',
    parameters: {
      type: 'object',
      properties: {
        trait_name: {
          type: 'string',
          description: 'Name of the trait to explain (without @ prefix), e.g. "physics", "glow"',
        },
      },
      required: ['trait_name'],
    },
  },
};

// ─── Absorb MCP Tools (direct on absorb.holoscript.net) ────────────────────

const absorbRun: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_run',
    description:
      'Scan a codebase into the Absorb knowledge graph. Analyzes code structure, patterns, dependencies, and architecture. Long-running operation — use absorb_query_graph to check results after scanning.',
    parameters: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'GitHub repository URL to scan, e.g. "https://github.com/user/repo"',
        },
        branch: {
          type: 'string',
          description: 'Git branch to scan (default: main)',
        },
      },
      required: ['repoUrl'],
    },
  },
};

const absorbQueryGraph: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_query_graph',
    description:
      'Semantic search over an absorbed codebase knowledge graph. Uses GraphRAG to find architecture patterns, file relationships, and code insights. Use after absorb_run has completed.',
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'Natural language query about the codebase, e.g. "how does authentication work?" or "find all API routes"',
        },
        projectId: {
          type: 'string',
          description: 'Optional project ID to scope the search',
        },
      },
      required: ['search'],
    },
  },
};

const absorbCodeHealth: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_code_health',
    description:
      'Get a code health score (0-10) for an absorbed codebase. Evaluates complexity, test coverage, type safety, documentation, and maintainability. Use to assess code quality.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to check health for',
        },
      },
      required: ['projectId'],
    },
  },
};

const absorbSuggest: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_suggest',
    description:
      'Get AI-powered improvement suggestions for an absorbed codebase. Suggests refactoring, test additions, type safety improvements, and architectural changes. Use when the user asks "how can I improve my code?"',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to get suggestions for',
        },
        focus: {
          type: 'string',
          description: 'Optional focus area',
          enum: ['types', 'tests', 'performance', 'security', 'architecture'],
        },
      },
      required: ['projectId'],
    },
  },
};

// ─── Export all MCP tools ──────────────────────────────────────────────────

export const MCP_TOOLS: StudioToolDefinition[] = [
  // Orchestrator
  mcpDiscoverTools,
  mcpCallTool,
  mcpListServers,
  knowledgeQuery,
  knowledgeSync,
  // HoloScript MCP
  holoParse,
  holoCompile,
  holoSuggestTraits,
  holoGenerateScene,
  holoListTraits,
  holoExplainTrait,
  // Absorb MCP
  absorbRun,
  absorbQueryGraph,
  absorbCodeHealth,
  absorbSuggest,
];

/**
 * Set of tool names that are MCP tools (not scene-manipulation or Studio API tools).
 * Used by the route handler to decide whether to execute via MCPToolExecutor.
 */
export const MCP_TOOL_NAMES = new Set(MCP_TOOLS.map((t) => t.function.name));
