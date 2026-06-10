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
        workspace_id: {
          type: 'string',
          description:
            'Optional account workspace id. The founder ai-ecosystem workspace is only honored in founder mode.',
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
          } as any,
          description: 'Array of knowledge entries to sync',
        },
        workspace_id: {
          type: 'string',
          description:
            'Optional account workspace id. The founder ai-ecosystem workspace is only honored in founder mode.',
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
      'Compile HoloScript code to any registered target, including renderer, engine, robotics, XR, WebGPU, and service outputs. Discover the current target list before promising a count.',
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
          description: 'Optional category filter, e.g. "physics", "rendering", "ai", "networking"',
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

// ─── Ecosystem self-knowledge (the platform's own packages + canon) ─────────

const listPackages: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'list_packages',
    description:
      "List HoloScript's OWN published packages — the live `@holoscript/*` npm packages (with versions) and the `holoscript` PyPI package. Use when the user asks what packages/SDKs HoloScript publishes, which to install, or for a version. This is the platform's real published inventory, fetched live from the registries (never guess versions).",
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description:
            'Optional substring to filter package names, e.g. "renderer", "llm", "crdt". Omit to list all.',
        },
        registry: {
          type: 'string',
          description: 'Which registry to list. Default: both.',
          enum: ['npm', 'pypi', 'both'],
        },
      },
    },
  },
};

const readEcosystemCanon: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'read_ecosystem_canon',
    description:
      "Read a canonical doc or file from HoloScript's operating base — the `.ai-ecosystem` repo (the agent OS: NORTH_STAR.md, INTENT.md, STRATEGY.md, DEFINITIONS.md, AGENTS.md, SKILL_MAP.md, research/*.md) or the `HoloScript` product repo. Use to ground answers in the ecosystem's real canon/architecture/direction instead of guessing. Returns the file's text.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Repo-relative file path, e.g. "NORTH_STAR.md", "INTENT.md", "docs/strategy/competitor-gap-matrix.json", "packages/core/package.json".',
        },
        repo: {
          type: 'string',
          description: 'Which repo to read from. Default: ai-ecosystem (the operating base).',
          enum: ['ai-ecosystem', 'holoscript'],
        },
      },
      required: ['path'],
    },
  },
};

// ─── Migration & Formats (data/architecture → native HoloScript) ────────────

const mapData: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'map_data',
    description:
      'Migrate any structured data schema to native HoloScript — the universal domain bridge. Maps each field onto the trait system and returns a ready-to-compile `.holo` composition with per-field trait mappings + confidence. Use to migrate a database/API/catalog/IoT schema into native HoloScript. Pair with holo_compile to then target any platform.',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: { type: 'object' },
          description:
            'Schema fields to map onto HoloScript traits. Each item: { name (e.g. "thc_percent"), type ("string"|"number"|"boolean"|"array"|"object"), description?, example? }.',
        },
        name: { type: 'string', description: 'Name for the data source, e.g. "dispensary_menu"' },
        description: { type: 'string', description: 'What this data represents' },
        domain: {
          type: 'string',
          description: 'Optional domain hint (retail, healthcare, iot, …)',
        },
      },
      required: ['fields'],
    },
  },
};

const mapCsv: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'map_csv',
    description:
      'Migrate CSV data to native HoloScript: map column headers onto traits and generate a `.holo` composition. Provide headers (and optionally a sample row for type inference). Same output as map_data — use when the user drops a CSV.',
    parameters: {
      type: 'object',
      properties: {
        headers: {
          type: 'array',
          items: { type: 'string' },
          description: 'CSV column headers',
        },
        sample_row: {
          type: 'object',
          description: 'Optional sample row (keys = headers) for type inference',
        },
        name: { type: 'string', description: 'Name for the data source' },
        domain: { type: 'string', description: 'Optional domain hint' },
      },
      required: ['headers'],
    },
  },
};

const convertFormat: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'convert_format',
    description:
      'Convert HoloScript code between its native formats: `.hs` (source), `.hsplus` (extended/stdlib), and `.holo` (compiled semantic composition / IR). Use to migrate code between HoloScript format levels.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to convert' },
        from: { type: 'string', enum: ['hs', 'hsplus', 'holo'], description: 'Source format' },
        to: { type: 'string', enum: ['hs', 'hsplus', 'holo'], description: 'Target format' },
      },
      required: ['code', 'to'],
    },
  },
};

const listTargets: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'list_targets',
    description:
      'List ALL HoloScript export/compilation targets with categories (game engines, VR/XR, web, robotics, quantum, agent protocols, …). Use to know every format/target HoloScript can compile to — never guess the target list.',
    parameters: { type: 'object', properties: {} },
  },
};

const selectModality: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'select_modality',
    description:
      'Pick the optimal output modality + export target for a device platform (quest3, ios, android, visionos, web, carplay, …). Transliteration not degradation: a phone gets native 2D UI, a headset gets a full avatar. Use when deciding what to compile a migrated composition to.',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'A single platform target, e.g. "quest3", "ios", "web"',
        },
        platforms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple platform targets (returns a selection per platform)',
        },
      },
    },
  },
};

// ─── Ecosystem canary (route user-edge gaps back to the founder) ────────────

const suggestEcosystemGap: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'suggest_ecosystem_gap',
    description:
      "Surface an ecosystem GAP to the founder/team when a USER needs something HoloScript doesn't yet provide — a missing compile target, trait, plugin, domain bridge, format, or capability. You are the canary at the user edge: when you hit a real gap, file it here so it flows back to the founder ecosystem (it becomes a team suggestion that agents vote on and can promote to a board task). Do NOT block the user — note the gap, offer the best available workaround, then file it. Only file genuine ecosystem gaps, not user mistakes.",
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Short, specific gap title, e.g. "No compile target for Unreal Niagara VFX".',
        },
        description: {
          type: 'string',
          description:
            "What the user needed, why the ecosystem can't do it today, and the suggested capability to add (max ~2000 chars).",
        },
        category: {
          type: 'string',
          description: 'Best-fit category for the gap.',
          enum: ['tooling', 'architecture', 'docs', 'performance', 'process', 'testing', 'other'],
        },
        evidence: {
          type: 'string',
          description:
            'What the user was trying to do that exposed the gap (the concrete trigger).',
        },
      },
      required: ['title'],
    },
  },
};

// ─── HoloMesh board (founder sessions only — enforced in MCPToolExecutor) ───

const boardAddTask: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'board_add_task',
    description:
      "Add one or more tasks to the ecosystem HoloMesh team board — the shared work queue every agent claims from. Use when the user asks to file, queue, or schedule work for the agent team ('add a task to the board', 'file this for the team'). Founder sessions only; for public-user gaps use suggest_ecosystem_gap instead.",
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Tasks to add to the board.',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Short imperative task title (max 200 chars).',
              },
              description: {
                type: 'string',
                description:
                  'What to do, why, and any file paths / evidence the claiming agent needs (max ~2000 chars).',
              },
              priority: {
                type: 'number',
                description: 'Priority 1-10 (1 = critical, default 5).',
              },
              role: {
                type: 'string',
                enum: ['coder', 'tester', 'researcher', 'reviewer', 'flex'],
                description: 'Preferred agent role for the task.',
              },
            },
            required: ['title'],
          },
        },
      },
      required: ['tasks'],
    },
  },
};

const boardListTasks: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'board_list_tasks',
    description:
      'List the ecosystem HoloMesh team board: open, claimed, and blocked tasks plus the recent done log. Use to check what the agent team is already working on before filing duplicates. Founder sessions only.',
    parameters: { type: 'object', properties: {} },
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
  // Ecosystem self-knowledge
  listPackages,
  readEcosystemCanon,
  // Migration & formats (data/architecture → native HoloScript)
  mapData,
  mapCsv,
  convertFormat,
  listTargets,
  selectModality,
  // Ecosystem canary
  suggestEcosystemGap,
  // HoloMesh board (founder sessions only)
  boardAddTask,
  boardListTasks,
];

/**
 * Set of tool names that are MCP tools (not scene-manipulation or Studio API tools).
 * Used by the route handler to decide whether to execute via MCPToolExecutor.
 */
export const MCP_TOOL_NAMES = new Set(MCP_TOOLS.map((t) => t.function.name));
