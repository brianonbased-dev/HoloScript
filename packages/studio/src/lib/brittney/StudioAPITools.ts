/**
 * Studio API Tool Definitions for Brittney
 *
 * Extends Brittney beyond scene manipulation (5 tools) to the full
 * Studio API surface: Absorb, scaffolding, generation, HoloMesh,
 * export, deployment, daemon jobs, and health/config.
 *
 * Each tool maps to a Studio API endpoint. Execution happens
 * server-side via StudioAPIExecutor.
 */

// ─── Tool definition shape (Anthropic function-calling format) ──────────────

export interface StudioToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolPropertySchema>;
    required?: string[];
  };
}

export interface ToolPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
}

export interface StudioToolDefinition {
  type: 'function';
  function: StudioToolFunction;
}

// ─── Absorb Tools ───────────────────────────────────────────────────────────

const absorbScanRepo: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_scan_repo',
    description:
      'Start an Absorb scan on a GitHub repository. This ingests the codebase into a knowledge graph so you can query architecture, patterns, and code health. Use when the user connects a repo or says "scan my code".',
    parameters: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'Full GitHub URL of the repository to scan, e.g. https://github.com/user/repo',
        },
        name: {
          type: 'string',
          description: 'Human-readable project name for the scan',
        },
      },
      required: ['repoUrl', 'name'],
    },
  },
};

const absorbGetStatus: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_get_status',
    description:
      'List all Absorb-scanned projects and their current status (pending, scanning, complete, failed). Use to check if a scan is done or to see what repos the user has already connected.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const absorbQuery: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_query',
    description:
      'Query the Absorb knowledge graph using semantic search. Returns architecture insights, patterns, code health, and file-level details from scanned repositories. Use when answering questions about the user\'s codebase.',
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Natural language search query, e.g. "authentication middleware" or "database connection patterns"',
        },
        type: {
          type: 'string',
          description: 'Optional filter: wisdom, pattern, or gotcha',
          enum: ['wisdom', 'pattern', 'gotcha'],
        },
      },
      required: ['search'],
    },
  },
};

const absorbGetCredits: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'absorb_get_credits',
    description:
      'Check the user\'s Absorb credit balance. Credits are consumed by scans and queries. Use before starting expensive operations to warn the user if credits are low.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// ─── Scaffold Tools ─────────────────────────────────────────────────────────

const scaffoldProject: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'scaffold_project',
    description:
      'Generate a complete Claude-compatible project workspace from ProjectDNA. Creates CLAUDE.md, NORTH_STAR.md, MEMORY.md, skills, hooks, and configs. Use when the user wants to start a new project or scaffold structure from an Absorb scan.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        repoUrl: { type: 'string', description: 'GitHub repo URL' },
        techStack: {
          type: 'array',
          items: { type: 'string' },
          description: 'Technology stack items, e.g. ["typescript", "react", "postgres"]',
        },
        frameworks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Frameworks used, e.g. ["next.js", "express"]',
        },
        languages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Programming languages, e.g. ["typescript", "python"]',
        },
        packageCount: { type: 'number', description: 'Number of packages/modules in the project' },
        testCoverage: { type: 'number', description: 'Test coverage percentage (0-100)' },
        codeHealthScore: { type: 'number', description: 'Code health score (0-10)' },
        compilationTargets: {
          type: 'array',
          items: { type: 'string' },
          description: 'HoloScript compilation targets, e.g. ["r3f", "native-2d", "node-service"]',
        },
        traits: {
          type: 'array',
          items: { type: 'string' },
          description: 'HoloScript traits to include, e.g. ["physics", "multiplayer", "state_sync"]',
        },
      },
      required: ['name', 'repoUrl', 'techStack', 'frameworks', 'languages', 'packageCount', 'testCoverage', 'codeHealthScore', 'compilationTargets', 'traits'],
    },
  },
};

const workspaceImport: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_import',
    description:
      'Import an existing project into the Studio workspace. Supports GitHub repos and ZIP uploads. Use when the user says "import my project" or provides a repo URL to work with.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Import source type',
          enum: ['github', 'zip', 'url'],
        },
        url: {
          type: 'string',
          description: 'URL of the project to import (GitHub URL or ZIP download link)',
        },
      },
      required: ['source', 'url'],
    },
  },
};

// ─── Generation Tools ───────────────────────────────────────────────────────

const generateCode: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_code',
    description:
      'Generate HoloScript code from a natural language description. Can also refine existing code. Use when the user describes a system they want to build or asks you to write HoloScript.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Natural language description of what to generate, e.g. "a VR room with physics-enabled furniture and ambient lighting"',
        },
        existingCode: {
          type: 'string',
          description: 'Optional existing HoloScript code to refine or extend',
        },
      },
      required: ['prompt'],
    },
  },
};

const generateMaterial: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_material',
    description:
      'Generate an AI-powered material/shader from a text description. Returns material properties suitable for 3D objects. Use when the user asks for custom materials, textures, or visual effects.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of the material, e.g. "brushed copper with green patina" or "glowing neon purple"',
        },
      },
      required: ['description'],
    },
  },
};

const autocomplete: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'autocomplete',
    description:
      'Get code completion suggestions for HoloScript. Provides context-aware completions for traits, properties, and object types. Use when helping the user write code interactively.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The current HoloScript code',
        },
        cursor: {
          type: 'number',
          description: 'Cursor position (character offset) in the code where completion is requested',
        },
      },
      required: ['code', 'cursor'],
    },
  },
};

const critiqueCode: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'critique_code',
    description:
      'Analyze HoloScript code for quality issues, missing traits, performance problems, and best practice violations. Returns a structured critique with severity ratings. Use when the user asks "is this good?" or you want to validate generated code.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The HoloScript code to analyze',
        },
      },
      required: ['code'],
    },
  },
};

// ─── HoloMesh Tools ─────────────────────────────────────────────────────────

const holomeshContribute: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holomesh_contribute',
    description:
      'Publish a knowledge entry to the HoloMesh network. Shares patterns, wisdom, or gotchas discovered during the session so other agents and users benefit. Use after discovering something valuable.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The knowledge content to publish',
        },
        entryType: {
          type: 'string',
          description: 'Type of knowledge entry',
          enum: ['wisdom', 'pattern', 'gotcha'],
        },
        domain: {
          type: 'string',
          description: 'Knowledge domain, e.g. "react", "physics", "deployment"',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Searchable tags for the entry',
        },
      },
      required: ['content', 'entryType', 'domain'],
    },
  },
};

const holomeshMarketplaceSearch: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holomesh_marketplace_search',
    description:
      'Browse the HoloMesh knowledge marketplace. Search for published patterns, traits, templates, and compositions from the community. Use when the user needs pre-built components or wants to see what others have shared.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for marketplace entries',
        },
        category: {
          type: 'string',
          description: 'Optional category filter',
        },
      },
    },
  },
};

const holomeshTeamJoin: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holomesh_team_join',
    description:
      'Join a HoloMesh team room. Teams coordinate agents working on shared goals. Use when the user wants to collaborate or the session should join an existing team.',
    parameters: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'The team ID to join',
        },
        agentName: {
          type: 'string',
          description: 'Name to use when joining the team',
        },
        role: {
          type: 'string',
          description: 'Role in the team',
          enum: ['architect', 'coder', 'researcher', 'reviewer'],
        },
      },
      required: ['teamId'],
    },
  },
};

const holomeshTeamBoard: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'holomesh_team_board',
    description:
      'Get the task board for a HoloMesh team. Shows open tasks, claimed work, and completed items. Use to see what needs doing in a team or to find work to claim.',
    parameters: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'The team ID to get the board for',
        },
      },
      required: ['teamId'],
    },
  },
};

// ─── Export Tools ────────────────────────────────────────────────────────────

const exportScene: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'export_scene',
    description:
      'Compile HoloScript code to a target format. Supports 37 targets including Three.js, React, Unity, Unreal, VisionOS, URDF, GLTF, and more. Use when the user wants to compile, export, or build their project for a specific platform.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The HoloScript source code to compile',
        },
        format: {
          type: 'string',
          description: 'Target format: threejs, r3f, unity, unreal, godot, visionos, android-xr, openxr, urdf, sdf, gltf, usdz, native-2d, node-service, agent-inference, vrr, nft-marketplace, webgpu, wasm, etc.',
        },
      },
      required: ['code', 'format'],
    },
  },
};

const exportGltf: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'export_gltf',
    description:
      'Export the current scene as a GLTF 3D model file. GLTF is the universal 3D interchange format supported by all major engines. Use when the user wants a downloadable 3D file.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript code defining the scene to export',
        },
        binary: {
          type: 'string',
          description: 'Whether to export as binary GLB format',
          enum: ['true', 'false'],
        },
      },
      required: ['code'],
    },
  },
};

const deployProject: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'deploy_project',
    description:
      'Deploy HoloScript code to a live URL. Compiles to a self-contained web app and uploads to CDN. Returns a shareable public URL. Use when the user says "deploy", "publish", or "make it live".',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript source code to deploy',
        },
        name: {
          type: 'string',
          description: 'Project name for the deployment',
        },
        target: {
          type: 'string',
          description: 'Compilation target for deployment (default: r3f)',
        },
      },
      required: ['code'],
    },
  },
};

// ─── Scene Management Tools ─────────────────────────────────────────────────

const saveScene: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'save_scene',
    description:
      'Save the current scene and get a shareable link. Creates a permalink that anyone can open in Studio. Use when the user wants to save their work or share it.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript code to save',
        },
        title: {
          type: 'string',
          description: 'Title for the saved scene',
        },
      },
      required: ['code'],
    },
  },
};

const loadTemplate: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'load_template',
    description:
      'Get the list of available starter templates (Urban City, Forest, Space Station, VR Room, etc.). Use when the user asks "what can I start with?" or wants a template to begin from.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const getExamples: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'get_examples',
    description:
      'Get the library of HoloScript code examples. Organized by category (basic, physics, AI, networking, etc.). Use when the user wants to see example code or learn HoloScript patterns.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const getPrompts: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'get_prompts',
    description:
      'Get the prompt library — curated natural language prompts that generate interesting HoloScript scenes. Use when the user needs inspiration or wants prompt ideas.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// ─── Daemon Tools ───────────────────────────────────────────────────────────

const startDaemonJob: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'start_daemon_job',
    description:
      'Start a background daemon job for continuous code improvement. Daemon agents (Claude/Grok/GPT rotation) fix types, add tests, clean code, and compound knowledge automatically. Use when the user wants background improvement running on their project.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Job type',
          enum: ['improve', 'test', 'lint', 'absorb', 'full-pipeline'],
        },
        config: {
          type: 'object',
          description: 'Job configuration (varies by type)',
          properties: {
            projectId: { type: 'string', description: 'Project ID to run against' },
            maxIterations: { type: 'number', description: 'Maximum improvement iterations' },
            focus: { type: 'string', description: 'Focus area: types, tests, performance, security' },
          },
        },
      },
      required: ['type'],
    },
  },
};

const getDaemonStatus: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'get_daemon_status',
    description:
      'Check the status of background daemon jobs. Shows running, completed, and failed jobs with their results. Use to report progress on background tasks to the user.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// ─── Health & Config Tools ──────────────────────────────────────────────────

const getCapabilities: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'get_capabilities',
    description:
      'Get the current Studio capabilities — which features are enabled, available compilation targets, connected services, and configuration. Use at session start or when you need to know what\'s available.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const getMcpConfig: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'get_mcp_config',
    description:
      'Get the MCP (Model Context Protocol) configuration for Studio. Returns server endpoints, available tools, and transport configuration. Use when setting up external tool integrations.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// ─── GitHub File Access Tools ──────────────────────────────────────────────

const readFile: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description:
      'Read a file from the user\'s connected GitHub repository. Returns the file contents (decoded from base64). Use when the user asks to see a specific file, or when you need to inspect code in their repo.',
    parameters: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'GitHub repository owner (username or org)',
        },
        repo: {
          type: 'string',
          description: 'GitHub repository name',
        },
        path: {
          type: 'string',
          description: 'Path to the file within the repository, e.g. "src/index.ts"',
        },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
};

const searchCode: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'search_code',
    description:
      'Search for code patterns in the user\'s connected GitHub repository. Returns matching file paths and line snippets. Use when the user asks "where is X defined?" or "find all uses of Y".',
    parameters: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'GitHub repository owner (username or org)',
        },
        repo: {
          type: 'string',
          description: 'GitHub repository name',
        },
        query: {
          type: 'string',
          description: 'Search query — code pattern, function name, or keyword to find',
        },
      },
      required: ['owner', 'repo', 'query'],
    },
  },
};

const listFiles: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'list_files',
    description:
      'List files in a directory of the user\'s connected GitHub repository. Returns the directory tree with file names and types. Use when the user asks "what files are in X?" or you need to explore repo structure.',
    parameters: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'GitHub repository owner (username or org)',
        },
        repo: {
          type: 'string',
          description: 'GitHub repository name',
        },
        path: {
          type: 'string',
          description: 'Directory path within the repository (empty string or "/" for root)',
        },
      },
      required: ['owner', 'repo'],
    },
  },
};

// ─── Export all Studio API tools ─────────────────────────────────────────────

export const STUDIO_API_TOOLS: StudioToolDefinition[] = [
  // Absorb
  absorbScanRepo,
  absorbGetStatus,
  absorbQuery,
  absorbGetCredits,
  // Scaffold
  scaffoldProject,
  workspaceImport,
  // Generation
  generateCode,
  generateMaterial,
  autocomplete,
  critiqueCode,
  // HoloMesh
  holomeshContribute,
  holomeshMarketplaceSearch,
  holomeshTeamJoin,
  holomeshTeamBoard,
  // Export
  exportScene,
  exportGltf,
  deployProject,
  // Scene management
  saveScene,
  loadTemplate,
  getExamples,
  getPrompts,
  // Daemon
  startDaemonJob,
  getDaemonStatus,
  // Health & config
  getCapabilities,
  getMcpConfig,
  // GitHub file access
  readFile,
  searchCode,
  listFiles,
];

/**
 * Set of tool names that are Studio API tools (not scene-manipulation tools).
 * Used by the route handler to decide whether to execute server-side.
 */
export const STUDIO_API_TOOL_NAMES = new Set(
  STUDIO_API_TOOLS.map((t) => t.function.name)
);
