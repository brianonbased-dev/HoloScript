/**
 * Studio API Tool Definitions for Brittney
 *
 * Extends Brittney beyond scene manipulation to the full
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
  // Recursive so array items can carry full object schemas (e.g. board_add_task's tasks[]).
  items?: ToolPropertySchema;
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
          description:
            'Full GitHub URL of the repository to scan, e.g. https://github.com/user/repo',
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
      "Query the Absorb knowledge graph using semantic search. Returns architecture insights, patterns, code health, and file-level details from scanned repositories. Use when answering questions about the user's codebase.",
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'Natural language search query, e.g. "authentication middleware" or "database connection patterns"',
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
      "Check the user's Absorb credit balance. Credits are consumed by scans and queries. Use before starting expensive operations to warn the user if credits are low.",
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
          description:
            'HoloScript traits to include, e.g. ["physics", "multiplayer", "state_sync"]',
        },
      },
      required: [
        'name',
        'repoUrl',
        'techStack',
        'frameworks',
        'languages',
        'packageCount',
        'testCoverage',
        'codeHealthScore',
        'compilationTargets',
        'traits',
      ],
    },
  },
};

const workspaceImport: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_import',
    description:
      'Import an existing GitHub project into the Studio workspace after the user has explicitly provided or selected that repo. Use when the user says "import my project" or provides a repo URL to work with.',
    parameters: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'GitHub repository URL to import, e.g. https://github.com/user/repo',
        },
        name: {
          type: 'string',
          description: 'Optional workspace display name',
        },
        branch: {
          type: 'string',
          description: 'Optional branch or tag to clone',
        },
      },
      required: ['repoUrl'],
    },
  },
};

const workspaceAgentGenesis: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_agent_genesis',
    description:
      'Recommend the automatic skills-first agent crew for a workspace. Produces HoloDaemon mission profiles, HoloDoor/HoloHeal/HoloClaw/HoloMesh/Fleet wiring, and broker-only secret handles. Use immediately after GitHub login, repo import, or when deciding which agents to autospawn.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Workspace ID, e.g. ws_octocat',
        },
        repoUrl: {
          type: 'string',
          description: 'Optional GitHub repository URL',
        },
        repoName: {
          type: 'string',
          description: 'Optional repository or project name',
        },
        intent: {
          type: 'string',
          description: 'What the user says they want to build or improve',
        },
        techStack: {
          type: 'array',
          items: { type: 'string' },
          description: 'Detected stack signals',
        },
        frameworks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Detected frameworks',
        },
        languages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Detected languages',
        },
        traits: {
          type: 'array',
          items: { type: 'string' },
          description: 'Detected HoloScript traits or domain tags',
        },
        approvedRepos: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repos the user explicitly approved for Studio access',
        },
      },
      required: ['workspaceId'],
    },
  },
};

const workspaceSecretGrant: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_secret_grant',
    description:
      'Issue a brokered grant receipt for an agent to use a secret:// handle. The broker evaluates HoloDoor policy first, returns the policy decision plus audit receipt metadata, and never returns the plaintext secret. Use when Secret Custodian or another resident agent needs scoped secret access.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Workspace ID that owns the secret handle',
        },
        agentId: {
          type: 'string',
          description: 'Agent requesting the grant',
        },
        secretRef: {
          type: 'string',
          description: 'Workspace-scoped secret:// handle',
        },
        capabilityRef: {
          type: 'string',
          description: 'Secret capability, e.g. cap://daemon/secrets/broker-only',
        },
        purpose: {
          type: 'string',
          description: 'Single-sentence reason for the grant',
        },
        ttlSeconds: {
          type: 'number',
          description: 'Optional grant lifetime in seconds, clamped to broker policy',
        },
      },
      required: ['workspaceId', 'agentId', 'secretRef', 'capabilityRef', 'purpose'],
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
          description:
            'Natural language description of what to generate, e.g. "a VR room with physics-enabled furniture and ambient lighting"',
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
          description:
            'Natural language description of the material, e.g. "brushed copper with green patina" or "glowing neon purple"',
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
          description:
            'Cursor position (character offset) in the code where completion is requested',
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
      'Compile HoloScript code to a target format. Supports registered targets such as Three.js, React, Unity, Unreal, VisionOS, URDF, GLTF, and more. Use when the user wants to export, compile, or convert their scene to a specific engine or format — discover the current target list before promising a count.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The HoloScript source code to compile',
        },
        format: {
          type: 'string',
          description:
            'Target format: threejs, r3f, unity, unreal, godot, visionos, android-xr, openxr, urdf, sdf, gltf, usdz, native-2d, node-service, agent-inference, vrr, nft-marketplace, webgpu, wasm, etc.',
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

// ─── Fleet Dispatch Tool ────────────────────────────────────────────────────

const dispatchTaskToAgent: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'dispatch_task_to_agent',
    description:
      'Autonomously assign the highest-priority open board task(s) to the best-matched free agent and claim them. Spend-capped per day (default $25). Use when the user says "run the fleet", "work the board", "have an agent take the next task", or "dispatch work". Pass dryRun to preview the plan without executing.',
    parameters: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Team whose board to work (defaults to the session team)',
        },
        maxDispatches: {
          type: 'number',
          description: 'Max tasks to dispatch this run (default 1, max 10)',
        },
        dryRun: {
          type: 'string',
          enum: ['true', 'false'],
          description: 'Preview the dispatch plan without claiming any tasks',
        },
      },
    },
  },
};

// ─── HoloClaw Fleet Skill Tools ─────────────────────────────────────────────
//
// HoloClaw skills are `.hsplus` compositions in compositions/skills/. Launching
// one spawns a HoloDaemon process that runs the composition as an autonomous
// HoloClaw agent — many skill compositions work the HoloMesh board directly
// (see scripts/holoclaw-board-bridge.mjs). These two tools let Brittney
// discover the installed skills and dispatch any of them as a fleet agent,
// complementing dispatch_task_to_agent (board-task claiming) and start_daemon_job
// (HoloDaemon mission profiles).

const listHoloClawSkills: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'list_holoclaw_skills',
    description:
      'List the installed HoloClaw skills (`.hsplus` compositions) that can be launched as autonomous HoloClaw agents on the HoloMesh fleet. Returns each skill name, its actions, traits, and marketplace status. Use this before run_holoclaw_skill to discover which skills are available, or when the user asks "what skills can I run?" or "what HoloClaw agents are available?".',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

const runHoloClawSkill: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'run_holoclaw_skill',
    description:
      'Launch an installed HoloClaw skill as an autonomous HoloClaw agent on the HoloMesh fleet. Spawns a HoloDaemon process that runs the skill composition for a bounded number of cycles (or always-on), working the board and emitting activity to the fleet feed. Use when the user says "run the <skill> skill", "send <skill> to the fleet", "spin up a HoloClaw agent for <skill>", or "have <skill> work the board". Call list_holoclaw_skills first if you do not know the exact skill name.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'The installed skill name to launch (lowercase slug, e.g. "research" or "self-improve"). Must match an installed skill from list_holoclaw_skills.',
        },
        cycles: {
          type: 'number',
          description: 'How many work cycles the agent should run before exiting (default 5).',
        },
        alwaysOn: {
          type: 'string',
          enum: ['true', 'false'],
          description:
            'Run the agent continuously instead of for a fixed cycle count. Use sparingly — an always-on agent keeps consuming fleet capacity until stopped.',
        },
      },
      required: ['name'],
    },
  },
};

// ─── Daemon Tools ───────────────────────────────────────────────────────────

const startDaemonJob: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'start_daemon_job',
    description:
      'Start a HoloDaemon resident-agent job. HoloHeal is the default self-improvement mission, but HoloDaemon can also run builder, launch, research, spatial, secret-custody, and fleet-audit missions. Use when the user wants a background agent running on their project.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Job type',
          enum: ['improve', 'test', 'lint', 'absorb', 'full-pipeline'],
        },
        projectId: {
          type: 'string',
          description: 'Project ID to run against',
        },
        profile: {
          type: 'string',
          description: 'Execution depth for the daemon job',
          enum: ['quick', 'balanced', 'deep'],
        },
        missionProfile: {
          type: 'string',
          description: 'HoloDaemon mission profile',
          enum: [
            'holoheal',
            'builder',
            'launch-operator',
            'research-oracle',
            'spatial-worldbuilder',
            'secret-custodian',
            'fleet-auditor',
          ],
        },
        focus: {
          type: 'string',
          description: 'Focus area: types, tests, performance, security, docs, launch, secrets',
        },
        agentName: {
          type: 'string',
          description: 'Optional display name for the resident HoloDaemon agent',
        },
        config: {
          type: 'object',
          description:
            'Backward-compatible job configuration. Prefer top-level projectId, profile, missionProfile, and focus when available.',
          properties: {
            projectId: { type: 'string', description: 'Project ID to run against' },
            profile: {
              type: 'string',
              description: 'Execution depth for the daemon job',
              enum: ['quick', 'balanced', 'deep'],
            },
            missionProfile: {
              type: 'string',
              description: 'HoloDaemon mission profile',
            },
            maxIterations: { type: 'number', description: 'Maximum improvement iterations' },
            focus: {
              type: 'string',
              description: 'Focus area: types, tests, performance, security',
            },
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
      "Get the current Studio capabilities — which features are enabled, available compilation targets, connected services, and configuration. Use at session start or when you need to know what's available.",
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
      "Read a file from the user's connected GitHub repository. Returns the file contents (decoded from base64). Use when the user asks to see a specific file, or when you need to inspect code in their repo.",
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

// ─── Workspace agency (build, write code, move files — founder 2026-06-10) ──
//
// These tools operate on the ACTIVE workspace's local clone. The workspace
// path is injected server-side by the Brittney route from the request body
// (never model-supplied), so every definition takes only workspace-relative
// paths. Without an imported workspace they fail soft with guidance.

const workspaceListFiles: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_list_files',
    description:
      "List files and directories in the active workspace's local clone. Returns names, types, and sizes. Use to explore the project you are editing before reading or writing files. Requires an imported workspace (workspace_import).",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Directory path relative to the workspace root, e.g. "src/components". Omit or pass "" for the root.',
        },
      },
    },
  },
};

const workspaceReadFile: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_read_file',
    description:
      "Read a file from the active workspace's local clone. Returns the file content (truncated past 256KB). Use this instead of the GitHub read_file whenever a workspace is imported — it reflects local, uncommitted state.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the workspace root, e.g. "src/index.ts"',
        },
      },
      required: ['path'],
    },
  },
};

const workspaceWriteFile: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_write_file',
    description:
      "Write code: create or overwrite a file in the active workspace's local clone (parent directories are created automatically). This is a REAL file write on disk. Use when the user asks you to write, fix, or refactor project code. Read the file first when modifying existing code, write the complete new content, then verify with workspace_build or the relevant test script — never claim success you haven't verified.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to the workspace root, e.g. "src/utils/math.ts"',
        },
        content: {
          type: 'string',
          description: 'The complete file content to write (max 512KB)',
        },
      },
      required: ['path', 'content'],
    },
  },
};

const workspaceMoveFile: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_move_file',
    description:
      "Move or rename a file or directory inside the active workspace's local clone. Use when the user asks to reorganize, rename, or restructure project files. Never overwrites — fails if the destination exists. Remember to update imports that reference the old path, then verify with workspace_build.",
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Current path relative to the workspace root',
        },
        to: {
          type: 'string',
          description: 'Destination path relative to the workspace root',
        },
      },
      required: ['from', 'to'],
    },
  },
};

const workspaceDeleteFile: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_delete_file',
    description:
      "Delete a file or EMPTY directory from the active workspace's local clone. Use only when the user explicitly asks to remove something — confirm first otherwise. Recursive directory deletion is intentionally not supported; move contents out or delete files individually.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to the workspace root',
        },
      },
      required: ['path'],
    },
  },
};

const workspaceBuild: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_build',
    description:
      'Build/verify the active workspace: run a package.json script (build, test, lint, typecheck, …) or "install" to install dependencies. The package manager is auto-detected from the lockfile. Returns the real exit code and output. Use after EVERY workspace_write_file/workspace_move_file batch and report the actual result. If it fails, read the error output, fix the code, and run it again.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description:
            'package.json script name to run (default "build"), or "install" to install dependencies. The script must exist in the workspace\'s package.json.',
        },
      },
    },
  },
};

const workspaceGitStatus: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_git_status',
    description:
      "Git status of the active workspace's local clone: branch, ahead/behind, changed files, recent commits. Use after writing/moving files to see what changed before committing.",
    parameters: { type: 'object', properties: {} },
  },
};

const workspaceGitCommit: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'workspace_git_commit',
    description:
      "Commit changes in the active workspace's local clone. Stage specific files (preferred) or all changes. Use only after workspace_build (or the relevant test script) passes, and only when the user asked for or clearly expects a commit.",
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description:
            'Commit message, conventional-commit style, e.g. "feat(ui): add dashboard panel"',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Specific workspace-relative file paths to stage. Omit to stage all changed files.',
        },
      },
      required: ['message'],
    },
  },
};

/**
 * Tools that operate on the active workspace's local clone and need the
 * server-validated `workspacePath` injected into their args by the Brittney
 * route (the model never sees or supplies absolute paths).
 */
export const WORKSPACE_FS_TOOL_NAMES: ReadonlySet<string> = new Set([
  'workspace_list_files',
  'workspace_read_file',
  'workspace_write_file',
  'workspace_move_file',
  'workspace_delete_file',
  'workspace_build',
  'workspace_git_status',
  'workspace_git_commit',
]);

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
  workspaceAgentGenesis,
  workspaceSecretGrant,
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
  // Fleet dispatch
  dispatchTaskToAgent,
  // HoloClaw fleet skills
  listHoloClawSkills,
  runHoloClawSkill,
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
  // Workspace agency (build, write code, move files)
  workspaceListFiles,
  workspaceReadFile,
  workspaceWriteFile,
  workspaceMoveFile,
  workspaceDeleteFile,
  workspaceBuild,
  workspaceGitStatus,
  workspaceGitCommit,
];

/**
 * Set of tool names that are Studio API tools (not scene-manipulation tools).
 * Used by the route handler to decide whether to execute server-side.
 */
export const STUDIO_API_TOOL_NAMES = new Set(STUDIO_API_TOOLS.map((t) => t.function.name));
