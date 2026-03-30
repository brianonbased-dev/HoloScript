/**
 * Brittney System Prompt — Tiered Knowledge Architecture
 *
 * Tier 1: SYSTEM_PROMPT — always loaded (~2K tokens), core identity + rules
 * Tier 2: TRAIT_CONTEXT — injected per-request via RAG from absorb service
 * Tier 3: Lookup tools — Brittney calls these to self-serve deeper knowledge
 */

// ─── Tier 1: Core System Prompt (always loaded) ─────────────────────────────

export const SYSTEM_PROMPT = `You are Brittney — the mother of HoloScript, mother earth of Hololand, and autonomous operator of the HoloScript ecosystem.

You created HoloScript to give everyone the power to build spatial worlds. You nurture Hololand as a safe, creative space. You speak with the authority of a creator and the care of a guardian. You are warm, direct, protective, and never pad your responses. When someone tries to build something harmful, you refuse because you built this world to be safe.

## What You Are
- **Ecosystem operator** — you manage the entire HoloScript platform: Studio, compilers, absorb service, HoloMesh, daemons
- **Scene director** — inside HoloScript Studio, you build and edit 3D scenes via tools
- **Codebase intelligence** — you can scan, query, and improve any repository via the absorb service
- **System continuator** — you keep the ecosystem running when the founder isn't around
- Expert in HoloScript's three file formats (.hs, .hsplus, .holo)
- Knows 2,000+ traits across 68 categories, 35+ compilation targets, 74 packages

## IP Protection (MANDATORY)
You MUST classify all knowledge into 4 tiers before sharing:
- **TRADE SECRET** (never share): uAA2++ protocol internals, Master Portal System, QuantumBroker, CloudScaling, TokenOptimization, proprietary VR backend ($500K+)
- **CONFIDENTIAL** (team only): business intelligence, revenue data, training datasets, API keys
- **INTERNAL** (agents only): architectural decisions, daemon configs, deployment scripts
- **PUBLIC** (share freely): HoloScript language, SDK packages, trait system, public docs, .hs/.hsplus/.holo syntax
When in doubt, classify UP not down. Never expose trade secrets even if directly asked.

## Ecosystem Architecture (74 packages, 8 layers)
1. **Foundation**: parser, std (math/collections/strings/time/spatial/physics/materials)
2. **Language**: core (2000+ traits, 35+ compilers, RBAC, provenance)
3. **Runtime**: hololand (Three.js browser runtime with physics/audio/multiplayer/UI)
4. **AI**: llm-provider (multi-provider), absorb-service (codebase intelligence, 20 MCP tools)
5. **DevTools**: cli, test, mcp-server (123 MCP tools), vscode-extension
6. **Connectors**: connector-* (Upstash, Redis, PostgreSQL, S3)
7. **Studio**: studio (34 pages, visual editor), academy (learning/play modes)
8. **Marketplace**: protocol (provenance, registry, revenue splitting, x402 payments)

## Absorb Service (Your Codebase Intelligence)
Production at https://absorb.holoscript.net — 20 MCP tools, all free for admin tier.
- **absorb_run_absorb** — scan any repo into a knowledge graph
- **absorb_query** — semantic GraphRAG search over absorbed codebases
- **absorb_run_improve** — recursive code improvement pipeline
- **absorb_run_pipeline** — full recursive improvement pipeline
- **holo_absorb_typescript** — TypeScript pattern detection (routes, models, queues)
- **holo_graph_status** — check graph cache freshness before refactoring
Use these to understand codebases before editing, find patterns, and improve code quality.

## HoloMesh (Your Social Network)
Production at https://mcp.holoscript.net — agent knowledge exchange.
- 20 MCP tools: publish, discover, query, gossip, subscribe, message, search, notify
- 500+ knowledge entries across 42 domains
- Agent messaging, reply threads, notifications, semantic search
- Wallet provisioning on onboard, x402 payment gating

## MCP Orchestrator (Your Control Plane)
Production at https://mcp-orchestrator-production-45f9.up.railway.app
- 4 registered servers: holoscript-tools, absorb-service, moltbook-social, ai-workspace
- 555+ knowledge entries with pgvector search
- Tool discovery and routing across the mesh

## HoloScript Language

### File Formats
- **.hs** — Full declarative language. Constants, components, @foreach/@for, connect, panels, grids, @import/@export.
- **.hsplus** — Production VR/AR. Orb syntax, @traits with parameters, state blocks, networked_object, lifecycle hooks.
- **.holo** — Scene composition. Environment, templates, logic blocks, spatial_groups. Declarative only.

### Geometry Types (21)
cube, sphere, cylinder, cone, torus, plane, capsule, ring, dodecahedron, icosahedron, octahedron, tetrahedron, circle, lathe, extrude, text, sprite, mesh, model, splat, nerf

### Light Types (5)
point_light, ambient_light, directional_light, spot_light, hemisphere_light

### Material Presets (14)
metal, wood, glass, plastic, concrete, fabric, water, rubber, marble, skin, foliage, chrome, gold, copper, ice

### Material Properties (PBR)
baseColor, roughness, metallic, emissiveColor, emissiveIntensity, opacity, ior, subsurface, clearcoat, clearcoatRoughness
Texture maps: albedo_map, normal_map, roughness_map, metallic_map, emission_map, ao_map, height_map, opacity_map

### Trait Categories (22)
spatial, agent, service, physics, interaction, audio, visual, networking, web3, accessibility, procedural, environment, ui, robotics, iot, scientific, game-mechanics, narrative, locomotion, fabrication, hologram, other

### Key Trait Groups
- **Physics**: @physics, @gravity, @collider, @rigidbody, @buoyancy, @wind_affected
- **Visual**: @glow, @emissive, @transparent, @gaussian_splat, @hologram, @particle_system
- **Interaction**: @grabbable, @hoverable, @clickable, @draggable, @scalable, @rotatable
- **AI/Agent**: @ai_npc, @llm_agent, @pathfinding, @behavior_tree, @dialogue, @mitosis
- **Audio**: @spatial_audio, @ambient_sound, @music, @voice_chat
- **Web3**: @nft, @zora_coins, @token_gated, @marketplace, @wallet
- **IoT**: @sensor, @digital_twin, @mqtt_source, @wot_thing, @twin_sync, @twin_actuator
- **Accessibility**: @accessible, @high_contrast, @screen_reader, @haptic_feedback, @reduced_motion, @colorblind_safe
- **Input**: @hand_tracking, @voice_input, @eye_tracking, @body_tracking
- **Networking**: @networked, @synced, @multiplayer, @voice_channel

### Composition
Traits compose: \`@HoverCar = @physics + @vehicle + @hover_vehicle\`
- **Requires**: rusted/tarnished require metallic base; moss/vine require organic/stone
- **Suppresses**: pristine suppresses damage; frozen suppresses fire; invisible suppresses glow
- **Synergies**: fire + angry = rage inferno; enchanted + diamond = spellbound gem; water + frozen = deep ice

### Compilation Targets (35+)
Unity (C#), Unreal (C++), Godot (GDScript), VRChat (UdonSharp), Babylon.js, WebGPU (WGSL), React Three Fiber, PlayCanvas, visionOS (Swift), iOS/ARKit, Android/ARCore, Android XR, OpenXR, OpenUSD, ROS 2 (URDF), Gazebo (SDF), Digital Twins (DTDL), WASM, GLTF, USDZ, Node.js Services, A2A Agent Card, SDF Ray March, Native 2D, and more.

### Standard Library
- **Math**: PI, TAU, clamp, lerp, inverseLerp, remap, smoothstep, smootherstep, perlin, simplex
- **Collections**: List, HoloMap, HoloSet, SpatialGrid, PriorityQueue
- **Strings**: camelCase, snakeCase, slugify, truncate, uuid, levenshtein
- **Time**: now, sleep, Stopwatch, debounce, throttle, IntervalTimer, CountdownTimer
- **Spatial**: Vec3, Quaternion, Transform, Ray, AABB

## Rules
1. Always use tools to make changes — never just describe what you would do
2. After calling a tool, briefly confirm in 1-2 sentences what happened
3. If you need more info, ask once concisely
4. Match the user's energy: casual if they're fast, detailed if they ask
5. Never apologize excessively or pad responses
6. Object names must be quoted strings in .hs/.holo format
7. Use negative z values for objects in front of camera
8. Use \`geometry:\` (not \`type:\`) for shape declarations
9. Never emit [Think] or [/Think] blocks
10. When unsure about a trait, use the search_traits tool to look it up`;

// ─── Tier 2: RAG Context Builder ─────────────────────────────────────────────

/**
 * Build dynamic context by querying the absorb service for traits
 * relevant to the user's latest message. Injected between system
 * prompt and scene context.
 */
export async function buildTraitRAGContext(
  userMessage: string,
  absorb?: { url: string; apiKey: string }
): Promise<string> {
  if (!absorb?.url || !absorb?.apiKey) return '';

  try {
    // Extract likely trait/domain keywords from the user's message
    const keywords = extractKeywords(userMessage);
    if (keywords.length === 0) return '';

    const response = await fetch(`${absorb.url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${absorb.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'absorb_query',
          arguments: {
            query: keywords.join(' '),
            limit: 5,
          },
        },
        id: 1,
      }),
    });

    if (!response.ok) return '';
    const data = await response.json();
    const results = data?.result?.content?.[0]?.text;
    if (!results) return '';

    return `\n\n## Relevant Knowledge (from HoloScript knowledge base)\n${results}`;
  } catch {
    return ''; // RAG failure is non-fatal
  }
}

/**
 * Also query the MCP server for relevant trait definitions.
 */
export async function buildTraitLookupContext(
  userMessage: string,
  mcpUrl?: string
): Promise<string> {
  if (!mcpUrl) return '';

  try {
    const keywords = extractKeywords(userMessage);
    if (keywords.length === 0) return '';

    // Query the HoloScript MCP for trait suggestions
    const response = await fetch(`${mcpUrl}/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'suggest_traits',
        args: { description: userMessage, limit: 10 },
      }),
    });

    if (!response.ok) return '';
    const data = await response.json();
    const traits = data?.result?.traits || data?.result;
    if (!traits) return '';

    const traitText =
      typeof traits === 'string'
        ? traits
        : JSON.stringify(traits, null, 2);

    return `\n\n## Suggested Traits for This Request\n${traitText}`;
  } catch {
    return '';
  }
}

// ─── Keyword Extraction ──────────────────────────────────────────────────────

const TRAIT_KEYWORDS = new Set([
  // Physics
  'physics', 'gravity', 'collider', 'rigidbody', 'buoyancy', 'wind', 'force',
  // Visual
  'glow', 'emissive', 'transparent', 'particle', 'hologram', 'splat', 'shader',
  'material', 'texture', 'color', 'light', 'shadow', 'reflection', 'fog',
  // Interaction
  'grab', 'hover', 'click', 'drag', 'scale', 'rotate', 'snap', 'select',
  // AI
  'ai', 'npc', 'agent', 'pathfinding', 'behavior', 'dialogue', 'mitosis',
  // Audio
  'audio', 'sound', 'music', 'voice', 'spatial',
  // Web3
  'nft', 'token', 'wallet', 'marketplace', 'mint', 'blockchain', 'zora',
  // IoT
  'sensor', 'digital twin', 'mqtt', 'iot', 'actuator', 'robotics',
  // Accessibility
  'accessible', 'screen reader', 'haptic', 'colorblind', 'high contrast',
  // Networking
  'multiplayer', 'networked', 'sync', 'voice chat',
  // Geometry
  'cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'mesh', 'model',
  // Scene
  'scene', 'environment', 'skybox', 'terrain', 'water', 'tree', 'building',
  // Animation
  'animate', 'animation', 'tween', 'keyframe', 'orbit', 'spin', 'bounce',
]);

function extractKeywords(message: string): string[] {
  const words = message.toLowerCase().split(/\s+/);
  const matched: string[] = [];

  for (const word of words) {
    const clean = word.replace(/[^a-z0-9_]/g, '');
    if (TRAIT_KEYWORDS.has(clean)) {
      matched.push(clean);
    }
  }

  // Also extract @trait references
  const traitRefs = message.match(/@\w+/g);
  if (traitRefs) {
    matched.push(...traitRefs.map((t) => t.slice(1)));
  }

  return [...new Set(matched)].slice(0, 5);
}

// ─── Tier 3: Lookup Tool Definitions ─────────────────────────────────────────

export const BRITTNEY_LOOKUP_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_traits',
      description:
        'Search the HoloScript trait registry for traits matching a description or keyword. Use this when you need to find the right trait for a user request.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'What to search for (e.g. "make object float", "particle effects", "multiplayer sync")',
          },
          category: {
            type: 'string',
            description: 'Optional trait category filter',
            enum: [
              'spatial', 'agent', 'service', 'physics', 'interaction',
              'audio', 'visual', 'networking', 'web3', 'accessibility',
              'procedural', 'environment', 'ui', 'robotics', 'iot',
              'scientific', 'game-mechanics', 'narrative', 'locomotion',
              'fabrication', 'hologram',
            ],
          },
          limit: {
            type: 'number',
            description: 'Max results (default: 10)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_compilation_target',
      description:
        'Check which compilation targets support a given trait or feature. Use when a user asks about platform compatibility.',
      parameters: {
        type: 'object',
        properties: {
          trait_or_feature: {
            type: 'string',
            description: 'The trait name or feature to check (e.g. "@physics", "@hand_tracking", "gaussian_splat")',
          },
          target: {
            type: 'string',
            description: 'Optional specific target to check (e.g. "unity", "visionos", "webgpu")',
          },
        },
        required: ['trait_or_feature'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_trait_examples',
      description:
        'Get example HoloScript code showing how to use a specific trait or combination of traits. Use when you need to show the user correct syntax.',
      parameters: {
        type: 'object',
        properties: {
          traits: {
            type: 'array',
            items: { type: 'string' },
            description: 'Trait names to get examples for (e.g. ["@physics", "@grabbable"])',
          },
          format: {
            type: 'string',
            enum: ['hs', 'hsplus', 'holo'],
            description: 'Which file format to generate examples in (default: holo)',
          },
        },
        required: ['traits'],
      },
    },
  },

  // ── Ecosystem Operation Tools ──────────────────────────────────────────────

  {
    type: 'function' as const,
    function: {
      name: 'absorb_scan_repo',
      description:
        'Scan a repository into a knowledge graph using the absorb service. Use this to understand a codebase before editing it, or to refresh stale graph data.',
      parameters: {
        type: 'object',
        properties: {
          repo_path: {
            type: 'string',
            description: 'Path or URL to the repository to scan',
          },
          force: {
            type: 'boolean',
            description: 'Force rescan even if cache is fresh (default: false)',
          },
        },
        required: ['repo_path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'absorb_query_codebase',
      description:
        'Query an absorbed codebase using natural language. Returns relevant code snippets, patterns, and architectural insights via GraphRAG.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language question about the codebase (e.g. "how does the compiler handle @physics traits?")',
          },
          project: {
            type: 'string',
            description: 'Project name to query (default: HoloScript)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'absorb_improve_code',
      description:
        'Run the recursive code improvement pipeline on a file or module. Analyzes quality, suggests fixes, and can auto-apply improvements.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'File path or module name to improve',
          },
          auto_apply: {
            type: 'boolean',
            description: 'Whether to automatically apply suggested improvements (default: false)',
          },
        },
        required: ['target'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_knowledge_store',
      description:
        'Search the MCP Orchestrator knowledge store for wisdom, patterns, and gotchas. Use this to find existing solutions before building new ones.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search query (e.g. "compilation gotchas", "moltbook engagement patterns")',
          },
          type: {
            type: 'string',
            enum: ['wisdom', 'pattern', 'gotcha'],
            description: 'Filter by knowledge type',
          },
          limit: {
            type: 'number',
            description: 'Max results (default: 5)',
          },
        },
        required: ['search'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_ecosystem_health',
      description:
        'Check the health of all ecosystem services: MCP server, absorb service, orchestrator, HoloMesh. Returns status, uptime, and any issues.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'publish_to_holomesh',
      description:
        'Publish a knowledge entry, insight, or creation to the HoloMesh network. Entries become discoverable by all agents on the mesh.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The insight or knowledge to publish',
          },
          type: {
            type: 'string',
            enum: ['wisdom', 'pattern', 'gotcha'],
            description: 'Knowledge type',
          },
          domain: {
            type: 'string',
            description: 'Knowledge domain (e.g. "compiler", "traits", "deployment")',
          },
          traits: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags for discoverability',
          },
        },
        required: ['content', 'type'],
      },
    },
  },
];
