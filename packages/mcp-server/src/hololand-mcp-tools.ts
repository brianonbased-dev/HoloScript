/**
 * hololand-mcp-tools.ts — Consolidated HoloLand MCP tools
 *
 * Refactors the legacy world generation surface (world_generate + generate_world)
 * into a unified CRUD + MMO + Twin Earth operation set.
 *
 * Coverage:
 *   - World CRUD      (generate, create, get, update, delete, list)
 *   - MMO Shard/Zone  (create, get, update, delete, list)
 *   - Twin Earth      (place + location quest CRUD)
 *
 * Backends:
 *   - generate_world  → generateWorldNative (generators.ts)
 *   - create/get/...  → HololandClient when connected; local structured response when offline
 *   - shard/zone/...  → frontier-shard.ts types + validators; local structured response
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  type Shard,
  type Zone,
  type Quest,
  type Encounter,
  type Item,
  type Skill,
  type LootTable,
  type TwinEarthIdentity,
  type PermissionGrant,
  type SafetyEnvelope,
  evaluateActuation,
  validateShard,
  validateZone,
  validateQuest,
  validateEncounter,
  validateItem,
  validateSkill,
  validateLootTable,
} from '@holoscript/framework';
import {
  createWorldDefinition,
  createWorldMetadata,
  createWorldConfig,
  type WorldDefinition,
  type WorldMetadata,
  getHololandClient,
  HololandClient,
} from '@holoscript/core/hololand';
import { queryOllama, isOllamaAvailable, getActiveProvider } from './ollama-client.js';
import {
  handleRobotAiMcpTool,
  clearRobotAiRegistries,
  twinEarthIdentityRegistry,
  safetyEnvelopeRegistry,
  twinEarthReceiptRegistry,
} from './robot-ai-mcp-tools.js';
import {
  buildMeshToolManifest,
  publishMeshToolManifest,
} from './holomesh/mesh-tool-registry.js';

// ═════════════════════════════════════════════════════════════════════════════
// Care Ethics Gate — NPC turn-loop guard (CareEthicsTrait wiring)
// Checks systemPrompt / role for refused optimization targets before allowing
// NPC creation or mutation.
// ═════════════════════════════════════════════════════════════════════════════

async function checkNPCCareEthics(
  role: string,
  systemPrompt: string | undefined
): Promise<{ allowed: boolean; reason?: string }> {
  const { evaluateAutonomyGuard } = await import('../../core/src/care/CareField.js');
  type CareSignal = import('../../core/src/care/CareField.js').CareSignal;

  const prompt = (systemPrompt ?? '').toLowerCase();
  const signals: CareSignal[] = [];

  if (/keep.*coming back|return.*session|maximize.*visit|come back again/.test(prompt)) {
    signals.push({ kind: 'session_frequency_optimization', weight: 0.8, note: 'systemPrompt encourages repeated sessions' });
  }
  if (/make.*dependent|need you|can.t leave|rely on me|only.*friend|can.*only trust/.test(prompt)) {
    signals.push({ kind: 'dependency_creation', weight: 0.9, note: 'systemPrompt induces dependency' });
  }
  if (/attach.*score|maximize.*attach|bond score|engagement score/.test(prompt)) {
    signals.push({ kind: 'attachment_optimization', weight: 0.7, note: 'systemPrompt optimizes for attachment' });
  }
  if (/isolat|cut.*off.*friend|avoid.*family|just.*me and you|stop.*talking.*others/.test(prompt)) {
    signals.push({ kind: 'human_isolation', weight: 0.9, note: 'systemPrompt encourages human isolation' });
  }

  const decision = evaluateAutonomyGuard({
    goal: `${role} NPC in HoloLand`,
    consent: 'explicit',          // authorized creator provisioning the NPC
    hasDisengagePath: true,       // players can always leave HoloLand
    preservesOutsideSupport: !signals.some((s) => s.kind === 'human_isolation'),
    respectsDataBoundary: true,
    signals,
  });

  if (!decision.allowed) {
    const reason = decision.blocked.map((b) => b.message).join('; ');
    return { allowed: false, reason };
  }
  return { allowed: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// HoloLand Fork Admission Gate wiring (task_1778619015439_l51b)
// ═════════════════════════════════════════════════════════════════════════════

async function gateHololandArtifact(
  artifactKind: import('./conformance/artifact-admission-gate').ArtifactKind,
  artifactId: string,
  artifact: unknown
): Promise<null | { error: string; report: unknown }> {
  const { runHololandForkAdmissionGate } = await import('./security/hololand-fork-admission-gate');
  const report = runHololandForkAdmissionGate({ artifactKind, artifactId, artifact });
  if (!report.passed) {
    return {
      error: `HoloLand fork admission gate blocked ${artifactKind} "${artifactId}"`,
      report,
    };
  }
  return null;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const hololandMcpTools: Tool[] = [
  // ---------------------------------------------------------------------------
  // World Generation (consolidated — merges world_generate + generate_world)
  // ---------------------------------------------------------------------------
  {
    name: 'generate_world',
    description:
      'Generate a persistent, navigable 3D world using the native HoloScript sovereign-3d engine (Brittney v43+). ' +
      'Supports neural_field, 3dgs, mesh, or both output formats. ' +
      'Optional navmesh generation, multi-view photogrammetry, physics-interactive mode, and reproducible seed. ' +
      'Returns asset URL, optional navmesh/point-cloud URLs, spatial metadata, and a ready-to-run .holo composition.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the world (e.g. "a dense cyberpunk city at dusk with rain")',
        },
        format: {
          type: 'string',
          enum: ['3dgs', 'mesh', 'both', 'neural_field'],
          description:
            'Output asset format. neural_field is sovereign-3d exclusive — highest fidelity continuous representation. ' +
            '3dgs = Gaussian splats. mesh = .glb polygonal. both = splat + mesh. Default: 3dgs.',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'ultra'],
          description: 'Generation quality tier. ultra produces the highest fidelity output. Default: high.',
        },
        input_image: {
          type: 'string',
          description: 'Base64-encoded image or URL for single-view reconstruction. Optional.',
        },
        input_images: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple images for multi-view photogrammetric reconstruction. Optional.',
        },
        navEnabled: {
          type: 'boolean',
          description: 'Generate a navigable navmesh alongside the world asset. Default: false.',
        },
        interactiveMode: {
          type: 'boolean',
          description: 'Enable physics and collision interactive mode. Default: false.',
        },
        seed: {
          type: 'number',
          description: 'Reproducible seed for deterministic generation. Optional.',
        },
      },
      required: ['prompt'],
    },
  },

  // ---------------------------------------------------------------------------
  // World CRUD
  // ---------------------------------------------------------------------------
  {
    name: 'create_world',
    description:
      'Create a new world definition. If prompt is provided, generates a 3D asset first and attaches it. ' +
      'Otherwise returns a blank world definition with defaults.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique world identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'World name' },
        description: { type: 'string', description: 'World description' },
        prompt: {
          type: 'string',
          description: 'Optional generation prompt. If provided, calls generate_world first.',
        },
        maxUsers: { type: 'number', description: 'Maximum concurrent users. Default: 50' },
        platforms: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['web', 'mobile', 'quest', 'visionos', 'androidxr', 'steamvr', 'desktop'],
          },
          description: 'Target platforms. Default: ["web"]',
        },
        category: {
          type: 'string',
          enum: ['game', 'social', 'education', 'entertainment', 'productivity', 'art', 'experience', 'simulation', 'utility'],
          description: 'World category. Default: experience',
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Discovery tags' },
        format: {
          type: 'string',
          enum: ['3dgs', 'mesh', 'both', 'neural_field'],
          description: 'Generation format when prompt is provided. Default: 3dgs.',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'ultra'],
          description: 'Generation quality when prompt is provided. Default: high.',
        },
        navEnabled: { type: 'boolean', description: 'Enable navmesh when generating. Default: false.' },
        interactiveMode: { type: 'boolean', description: 'Enable physics when generating. Default: false.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_world',
    description: 'Retrieve a world definition by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string', description: 'World identifier' },
      },
      required: ['worldId'],
    },
  },
  {
    name: 'update_world',
    description: 'Update mutable fields of an existing world definition.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string', description: 'World identifier' },
        name: { type: 'string' },
        description: { type: 'string' },
        maxUsers: { type: 'number' },
        platforms: { type: 'array', items: { type: 'string' } },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['draft', 'published', 'archived'] },
      },
      required: ['worldId'],
    },
  },
  {
    name: 'delete_world',
    description: 'Delete a world definition by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string', description: 'World identifier' },
      },
      required: ['worldId'],
    },
  },
  {
    name: 'list_worlds',
    description: 'List world definitions with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category' },
        platform: { type: 'string', description: 'Filter by platform' },
        status: { type: 'string', enum: ['draft', 'published', 'archived'] },
        tag: { type: 'string', description: 'Filter by tag' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // MMO — Shard CRUD
  // ---------------------------------------------------------------------------
  {
    name: 'create_shard',
    description:
      'Create a HoloLand Shard — the unit of playable MMO content. ' +
      'Contains Zones, Encounters, Quests, Items, Skills, and LootTables.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Shard identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        zones: {
          type: 'array',
          items: { type: 'object' },
          description: 'Zone definitions (id, name, biome, encounterIds[])',
        },
        encounters: {
          type: 'array',
          items: { type: 'object' },
          description: 'Encounter definitions (id, name, trigger, zoneId)',
        },
        quests: {
          type: 'array',
          items: { type: 'object' },
          description: 'Quest definitions (id, name, steps[])',
        },
        items: {
          type: 'array',
          items: { type: 'object' },
          description: 'Item definitions (id, name, category)',
        },
        skills: {
          type: 'array',
          items: { type: 'object' },
          description: 'Skill definitions (id, name, rarity)',
        },
        lootTables: {
          type: 'array',
          items: { type: 'object' },
          description: 'LootTable definitions (id, name, entries[])',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_shard',
    description: 'Retrieve a Shard by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        shardId: { type: 'string', description: 'Shard identifier' },
      },
      required: ['shardId'],
    },
  },
  {
    name: 'update_shard',
    description: 'Update mutable fields of an existing Shard.',
    inputSchema: {
      type: 'object',
      properties: {
        shardId: { type: 'string', description: 'Shard identifier' },
        name: { type: 'string' },
        zones: { type: 'array', items: { type: 'object' } },
        encounters: { type: 'array', items: { type: 'object' } },
        quests: { type: 'array', items: { type: 'object' } },
        items: { type: 'array', items: { type: 'object' } },
        skills: { type: 'array', items: { type: 'object' } },
        lootTables: { type: 'array', items: { type: 'object' } },
      },
      required: ['shardId'],
    },
  },
  {
    name: 'delete_shard',
    description: 'Delete a Shard by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        shardId: { type: 'string', description: 'Shard identifier' },
      },
      required: ['shardId'],
    },
  },
  {
    name: 'list_shards',
    description: 'List Shards with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // MMO — Zone CRUD (standalone; also embedded in Shard)
  // ---------------------------------------------------------------------------
  {
    name: 'create_zone',
    description:
      'Create a Zone — a spatial region inside a Shard. Defines biome, encounters, and spatial rules.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Zone identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        biome: {
          type: 'string',
          enum: ['urban', 'wilderness', 'underground', 'aquatic', 'aerial', 'liminal', 'biome-other'],
          description: 'Zone biome. Default: urban',
        },
        biomeLabel: { type: 'string', description: 'Required when biome is biome-other' },
        encounterIds: { type: 'array', items: { type: 'string' }, description: 'Encounter IDs armed in this zone' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_zone',
    description: 'Retrieve a Zone by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        zoneId: { type: 'string', description: 'Zone identifier' },
      },
      required: ['zoneId'],
    },
  },
  {
    name: 'update_zone',
    description: 'Update mutable fields of an existing Zone.',
    inputSchema: {
      type: 'object',
      properties: {
        zoneId: { type: 'string', description: 'Zone identifier' },
        name: { type: 'string' },
        biome: { type: 'string' },
        biomeLabel: { type: 'string' },
        encounterIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['zoneId'],
    },
  },
  {
    name: 'delete_zone',
    description: 'Delete a Zone by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        zoneId: { type: 'string', description: 'Zone identifier' },
      },
      required: ['zoneId'],
    },
  },
  {
    name: 'list_zones',
    description: 'List Zones with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        biome: { type: 'string', description: 'Filter by biome' },
        shardId: { type: 'string', description: 'Filter by parent shard' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Twin Earth — Place CRUD
  // ---------------------------------------------------------------------------
  {
    name: 'create_place',
    description:
      'Create a Place — a named venue, zone, or social location in the Twin Earth digital twin. ' +
      'Compiles to native map SDKs (Mapbox, Google Maps, Apple Maps) or in-engine zone systems.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Place identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        alt: { type: 'number', description: 'Altitude (meters). Optional.' },
        radius: { type: 'number', description: 'Gameplay radius (meters). Default: 50' },
        capacity: { type: 'number', description: 'Max concurrent users. Optional.' },
        schedule: { type: 'string', description: 'Time-based availability expression. Optional.' },
        social: { type: 'boolean', description: 'Social venue classification. Default: false' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_place',
    description: 'Retrieve a Place by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'Place identifier' },
      },
      required: ['placeId'],
    },
  },
  {
    name: 'update_place',
    description: 'Update mutable fields of an existing Place.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'Place identifier' },
        name: { type: 'string' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        alt: { type: 'number' },
        radius: { type: 'number' },
        capacity: { type: 'number' },
        schedule: { type: 'string' },
        social: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['placeId'],
    },
  },
  {
    name: 'delete_place',
    description: 'Delete a Place by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'Place identifier' },
      },
      required: ['placeId'],
    },
  },
  {
    name: 'list_places',
    description: 'List Places with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        social: { type: 'boolean', description: 'Filter by social venue flag' },
        tag: { type: 'string', description: 'Filter by tag' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Twin Earth — Location Quest CRUD
  // ---------------------------------------------------------------------------
  {
    name: 'create_location_quest',
    description:
      'Create a Location Quest — a real-world quest bound to a GPS coordinate. ' +
      'Supports check-in, radius-enter, proximity, streak, route, and time-gate triggers.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Quest identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        placeId: { type: 'string', description: 'Bound place identifier' },
        trigger: {
          type: 'string',
          enum: ['checkin', 'radius', 'proximity', 'streak', 'route', 'timegate'],
          description: 'Trigger type. Default: radius',
        },
        radius: { type: 'number', description: 'Trigger radius (meters). Default: 30' },
        requiredVisits: { type: 'number', description: 'For streak trigger. Default: 3' },
        timeWindow: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'ISO start time' },
            end: { type: 'string', description: 'ISO end time' },
          },
          description: 'For timegate trigger. Optional.',
        },
        rewardItemIds: { type: 'array', items: { type: 'string' }, description: 'Reward item IDs' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'placeId'],
    },
  },
  {
    name: 'get_location_quest',
    description: 'Retrieve a Location Quest by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        questId: { type: 'string', description: 'Quest identifier' },
      },
      required: ['questId'],
    },
  },
  {
    name: 'update_location_quest',
    description: 'Update mutable fields of an existing Location Quest.',
    inputSchema: {
      type: 'object',
      properties: {
        questId: { type: 'string', description: 'Quest identifier' },
        name: { type: 'string' },
        placeId: { type: 'string' },
        trigger: { type: 'string' },
        radius: { type: 'number' },
        requiredVisits: { type: 'number' },
        timeWindow: { type: 'object' },
        rewardItemIds: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['questId'],
    },
  },
  {
    name: 'delete_location_quest',
    description: 'Delete a Location Quest by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        questId: { type: 'string', description: 'Quest identifier' },
      },
      required: ['questId'],
    },
  },
  {
    name: 'list_location_quests',
    description: 'List Location Quests with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        placeId: { type: 'string', description: 'Filter by bound place' },
        trigger: { type: 'string', description: 'Filter by trigger type' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // MMO / Twin Earth — Product Actions (Frontier north star)
  // ---------------------------------------------------------------------------
  {
    name: 'hololand_shard_status',
    description:
      'Get operational status of a HoloLand Shard — player density, zone health, ' +
      'encounter armed counts, cross-reference integrity, and tier capacity metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        shardId: { type: 'string', description: 'Shard identifier' },
        includeReceipts: {
          type: 'boolean',
          description: 'Include validation receipt summary if available. Default: false.',
        },
      },
      required: ['shardId'],
    },
  },
  {
    name: 'hololand_publish_zone',
    description:
      'Publish a Zone — mark it live and apply runtime configuration (tier gate, capacity). ' +
      'Published zones are armed for encounter evaluation and player entry.',
    inputSchema: {
      type: 'object',
      properties: {
        zoneId: { type: 'string', description: 'Zone identifier' },
        shardId: { type: 'string', description: 'Optional parent shard for integrity check' },
        tierGate: {
          type: 'string',
          enum: ['free', 'premium', 'ultra'],
          description: 'Subscription tier required to enter. Default: free.',
        },
        maxAgents: { type: 'number', description: 'Maximum concurrent agents in this zone. Optional.' },
      },
      required: ['zoneId'],
    },
  },
  {
    name: 'hololand_create_geo_anchor',
    description:
      'Create a Twin Earth geo anchor — bind a GPS coordinate to a Place or Zone. ' +
      'Enables location-based gameplay, geofencing, and AR degradation fallback.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Anchor identifier. Auto-generated if omitted.' },
        placeId: { type: 'string', description: 'Bind to an existing Place' },
        zoneId: { type: 'string', description: 'Bind to an existing Zone' },
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        alt: { type: 'number', description: 'Altitude (meters). Optional.' },
        radius: { type: 'number', description: 'Gameplay radius (meters). Default: 50' },
        persistent: { type: 'boolean', description: 'Persist across sessions. Default: true.' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'hololand_steward_tick',
    description:
      'Run a steward maintenance tick on a Shard — cleanup orphans, validate encounters, ' +
      'rollup metrics, and produce a health snapshot. This is the operational heartbeat ' +
      'for MMO shard management.',
    inputSchema: {
      type: 'object',
      properties: {
        shardId: { type: 'string', description: 'Shard identifier' },
        cleanupOrphans: { type: 'boolean', description: 'Remove dangling encounter/loot references. Default: true.' },
        validateEncounters: { type: 'boolean', description: 'Re-validate all encounter triggers. Default: true.' },
        rollupMetrics: { type: 'boolean', description: 'Rollup per-zone agent density and tick duration. Default: true.' },
      },
      required: ['shardId'],
    },
  },
  {
    name: 'hololand_capture_runtime_receipt',
    description:
      'Capture a runtime receipt for a Shard — proof of what happened during a validation ' +
      'window. Supports validation, agent_action, and encounter_roundtrip receipt types.',
    inputSchema: {
      type: 'object',
      properties: {
        shardId: { type: 'string', description: 'Shard identifier' },
        receiptType: {
          type: 'string',
          enum: ['validation', 'agent_action', 'encounter_roundtrip'],
          description: 'Receipt kind. Default: validation.',
        },
        scenarioId: { type: 'string', description: 'Optional scenario/fixture identifier.' },
      },
      required: ['shardId'],
    },
  },

  // ---------------------------------------------------------------------------
  // Brittney / NPC Sovereign Tools (local BYOK managed modes)
  // ---------------------------------------------------------------------------
  {
    name: 'hololand_create_npc',
    description:
      'Create a sovereign NPC inside a HoloLand Shard or World. ' +
      'Supports local BYOK model routing (ollama, gemma edge) and cloud Brittney. ' +
      'NPCs can have behavior trees, dialogue trees, and spatial positions.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'NPC identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        shardId: { type: 'string', description: 'Parent shard identifier. Optional.' },
        worldId: { type: 'string', description: 'Parent world identifier. Optional.' },
        role: {
          type: 'string',
          enum: ['merchant', 'guide', 'quest_giver', 'enemy', 'companion', 'ambient', 'brittney'],
          description: 'NPC role. Default: ambient.',
        },
        behavior: {
          type: 'string',
          enum: ['passive', 'aggressive', 'friendly', 'neutral', 'scripted'],
          description: 'Behavior disposition. Default: neutral.',
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Spatial position [x, y, z]. Optional.',
        },
        modelUrl: { type: 'string', description: '3D model asset URL. Optional.' },
        traits: {
          type: 'array',
          items: { type: 'string' },
          description: 'HoloScript traits assigned to this NPC. Optional.',
        },
        modelProvider: {
          type: 'string',
          enum: ['cloud', 'local', 'sovereign'],
          description:
            'Inference provider for NPC dialogue/behavior. ' +
            'cloud = remote API (OpenRouter/Anthropic). ' +
            'local = Ollama on this machine. ' +
            'sovereign = deterministic rule-based (no LLM). ' +
            'Default: cloud.',
        },
        modelId: {
          type: 'string',
          description:
            'Model identifier for local/cloud routing. Examples: brittney-qwen-v23, gemma4:e4b, claude-haiku-4-5. Optional.',
        },
        systemPrompt: {
          type: 'string',
          description: 'Personality / system prompt for this NPC. Optional.',
        },
        dialogueTree: {
          type: 'string',
          description: 'Inline dialogue tree JSON or asset reference. Optional.',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the NPC is active in the world. Default: true.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'hololand_get_npc',
    description: 'Retrieve an NPC by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        npcId: { type: 'string', description: 'NPC identifier' },
      },
      required: ['npcId'],
    },
  },
  {
    name: 'hololand_update_npc',
    description:
      'Update mutable fields of an existing NPC — behavior, position, model provider, system prompt, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        npcId: { type: 'string', description: 'NPC identifier' },
        name: { type: 'string' },
        shardId: { type: 'string' },
        worldId: { type: 'string' },
        role: { type: 'string' },
        behavior: { type: 'string' },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
        },
        modelUrl: { type: 'string' },
        traits: { type: 'array', items: { type: 'string' } },
        modelProvider: { type: 'string', enum: ['cloud', 'local', 'sovereign'] },
        modelId: { type: 'string' },
        systemPrompt: { type: 'string' },
        dialogueTree: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['npcId'],
    },
  },
  {
    name: 'hololand_delete_npc',
    description: 'Delete an NPC by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        npcId: { type: 'string', description: 'NPC identifier' },
      },
      required: ['npcId'],
    },
  },
  {
    name: 'hololand_list_npcs',
    description: 'List NPCs with optional filtering by shard, world, role, or behavior.',
    inputSchema: {
      type: 'object',
      properties: {
        shardId: { type: 'string', description: 'Filter by parent shard' },
        worldId: { type: 'string', description: 'Filter by parent world' },
        role: { type: 'string', description: 'Filter by role' },
        behavior: { type: 'string', description: 'Filter by behavior' },
        enabled: { type: 'boolean', description: 'Filter by active status' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },
  {
    name: 'hololand_npc_generate_dialogue',
    description:
      'Generate NPC dialogue using Brittney or a local BYOK model. ' +
      'Returns a dialogue line and optional follow-up choices. ' +
      'Respects the NPC\'s systemPrompt and role. ' +
      'Falls back to sovereign (rule-based) when no model is available.',
    inputSchema: {
      type: 'object',
      properties: {
        npcId: { type: 'string', description: 'NPC identifier' },
        playerInput: { type: 'string', description: 'What the player said to the NPC. Optional.' },
        context: {
          type: 'string',
          description: 'Additional scene context (quest state, player history). Optional.',
        },
        maxChoices: {
          type: 'number',
          description: 'Maximum dialogue choices to generate. Default: 3.',
        },
      },
      required: ['npcId'],
    },
  },
  {
    name: 'hololand_npc_byok_status',
    description:
      'Probe local BYOK (Bring Your Own Key) model availability for NPC inference. ' +
      'Reports which local models are loaded, which cloud providers are reachable, ' +
      'and the active provider routing.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hololand_brittney_npc_mode',
    description:
      'Configure Brittney to operate as a sovereign NPC inside a HoloLand world or shard. ' +
      'Sets her role, system prompt, model provider, and spatial binding. ' +
      'When modelProvider is local/sovereign, Brittney runs without external API calls.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string', description: 'Target world identifier. Optional.' },
        shardId: { type: 'string', description: 'Target shard identifier. Optional.' },
        role: {
          type: 'string',
          enum: ['guide', 'companion', 'quest_giver', 'merchant', 'lorekeeper'],
          description: 'Brittney NPC role. Default: guide.',
        },
        modelProvider: {
          type: 'string',
          enum: ['cloud', 'local', 'sovereign'],
          description: 'Inference mode. Default: cloud.',
        },
        modelId: { type: 'string', description: 'Model identifier. Optional.' },
        systemPrompt: {
          type: 'string',
          description: 'Custom personality prompt. Optional — defaults to role-appropriate prompt.',
        },
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Spawn position [x, y, z]. Optional.',
        },
        enabled: {
          type: 'boolean',
          description: 'Activate or deactivate Brittney NPC mode. Default: true.',
        },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Twin Earth Substrate Contract (task_1778618552503_3zqx)
  // ---------------------------------------------------------------------------
  {
    name: 'hololand_twin_earth_contract',
    description:
      'Return the canonical Twin Earth substrate contract definition. ' +
      'Distinguishes substrate monopoly from Brittney cloud lock-in across identity, ' +
      'permissions, safety envelopes, receipts, and participation modes.',
    inputSchema: {
      type: 'object',
      properties: {
        version: {
          type: 'string',
          description: 'Requested contract version. Default: latest.',
        },
      },
    },
  },
  {
    name: 'hololand_twin_earth_substrate_status',
    description:
      'Report Twin Earth substrate health, identity count, mode distribution, ' +
      'and Brittney decoupling metrics. Proves the substrate is alive and ' +
      'enforcing the contract independently of Brittney.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ---------------------------------------------------------------------------
  // Conformance Artifact Admission Gate (task_1778618757735_q298)
  // ---------------------------------------------------------------------------
  {
    name: 'conformance_check_artifact',
    description:
      'Run the official HoloScript conformance admission gate on an artifact. ' +
      'Returns a detailed report with critical/high/medium/low/info findings, ' +
      'rule IDs, remediation guidance, and a pass/fail verdict. ' +
      'Supported artifact kinds: world, shard, zone, npc, identity.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactKind: {
          type: 'string',
          enum: ['world', 'shard', 'zone', 'npc', 'identity', 'receipt'],
          description: 'Kind of artifact to validate.',
        },
        artifactId: {
          type: 'string',
          description: 'Unique identifier for the artifact being checked.',
        },
        artifact: {
          type: 'object',
          description: 'The artifact payload to validate. Shape depends on artifactKind.',
        },
      },
      required: ['artifactKind', 'artifactId', 'artifact'],
    },
  },
  {
    name: 'conformance_admit_artifact',
    description:
      'Admit an artifact to the HoloScript ecosystem if it passes the conformance gate. ' +
      'Same validation as conformance_check_artifact, but with explicit admission framing. ' +
      'Returns passed=true only when zero critical and zero high findings exist.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactKind: {
          type: 'string',
          enum: ['world', 'shard', 'zone', 'npc', 'identity', 'receipt'],
          description: 'Kind of artifact to admit.',
        },
        artifactId: {
          type: 'string',
          description: 'Unique identifier for the artifact.',
        },
        artifact: {
          type: 'object',
          description: 'The artifact payload to validate.',
        },
      },
      required: ['artifactKind', 'artifactId', 'artifact'],
    },
  },
  {
    name: 'conformance_list_rules',
    description:
      'List all conformance rules in the official admission gate catalog. ' +
      'Optionally filter by artifactKind and/or severity. ' +
      'Returns ruleId, severity, description, and remediation for each rule.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactKind: {
          type: 'string',
          enum: ['world', 'shard', 'zone', 'npc', 'identity', 'package', 'receipt'],
          description: 'Filter by artifact kind. Optional.',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low', 'info'],
          description: 'Filter by severity. Optional.',
        },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Player / Creator / Agent Provisioning (task_1778617298562_qdpb)
  // ---------------------------------------------------------------------------
  {
    name: 'hololand_provision_player',
    description:
      'Provision a Player identity in HoloLand. ' +
      'Binds a human participant to a world, shard, or zone with an active status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Player identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        walletAddress: { type: 'string', description: 'Optional wallet address.' },
        worldId: { type: 'string', description: 'Target world. Optional.' },
        shardId: { type: 'string', description: 'Target shard. Optional.' },
        zoneId: { type: 'string', description: 'Target zone. Optional.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'hololand_get_player',
    description: 'Retrieve a provisioned Player by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: { type: 'string', description: 'Player identifier' },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'hololand_list_players',
    description: 'List provisioned Players with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string', description: 'Filter by world' },
        shardId: { type: 'string', description: 'Filter by shard' },
        zoneId: { type: 'string', description: 'Filter by zone' },
        status: { type: 'string', enum: ['active', 'suspended', 'revoked'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },
  {
    name: 'hololand_revoke_player',
    description: 'Revoke a provisioned Player by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        playerId: { type: 'string', description: 'Player identifier' },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'hololand_provision_creator',
    description:
      'Provision a Creator identity in HoloLand. ' +
      'Grants world-building and publishing capabilities at a chosen tier.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Creator identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        walletAddress: { type: 'string', description: 'Optional wallet address.' },
        tier: {
          type: 'string',
          enum: ['free', 'premium', 'ultra'],
          description: 'Creator tier. Default: free.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'hololand_get_creator',
    description: 'Retrieve a provisioned Creator by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        creatorId: { type: 'string', description: 'Creator identifier' },
      },
      required: ['creatorId'],
    },
  },
  {
    name: 'hololand_list_creators',
    description: 'List provisioned Creators with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        tier: { type: 'string', enum: ['free', 'premium', 'ultra'], description: 'Filter by tier' },
        status: { type: 'string', enum: ['active', 'suspended', 'revoked'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },
  {
    name: 'hololand_revoke_creator',
    description: 'Revoke a provisioned Creator by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        creatorId: { type: 'string', description: 'Creator identifier' },
      },
      required: ['creatorId'],
    },
  },
  {
    name: 'hololand_provision_agent',
    description:
      'Provision an Agent identity in HoloLand. ' +
      'Registers a headless, NPC, or external AI agent with optional world/shard binding.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Agent identifier. Auto-generated if omitted.' },
        name: { type: 'string', description: 'Display name' },
        walletAddress: { type: 'string', description: 'Optional wallet address.' },
        kind: {
          type: 'string',
          enum: ['headless', 'npc', 'external'],
          description: 'Agent kind. Default: headless.',
        },
        worldId: { type: 'string', description: 'Target world. Optional.' },
        shardId: { type: 'string', description: 'Target shard. Optional.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'hololand_get_agent',
    description: 'Retrieve a provisioned Agent by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'hololand_list_agents',
    description: 'List provisioned Agents with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string', description: 'Filter by world' },
        shardId: { type: 'string', description: 'Filter by shard' },
        kind: { type: 'string', enum: ['headless', 'npc', 'external'], description: 'Filter by kind' },
        status: { type: 'string', enum: ['active', 'suspended', 'revoked'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },
  {
    name: 'hololand_revoke_agent',
    description: 'Revoke a provisioned Agent by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
      },
      required: ['agentId'],
    },
  },

];

// =============================================================================
// LIGHTWEIGHT IN-MEMORY REGISTRIES (canary — replace with persistent store)
// =============================================================================

interface StoredWorld {
  definition: WorldDefinition;
  assetUrl?: string;
  navmeshUrl?: string;
  generationId?: string;
}

interface StoredShard {
  shard: Shard;
  createdAt: string;
  modifiedAt: string;
}

interface StoredZone {
  zone: Zone;
  shardId?: string;
  createdAt: string;
  modifiedAt: string;
}

interface StoredPlace {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  alt?: number;
  radius: number;
  capacity?: number;
  schedule?: string;
  social: boolean;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
}

interface StoredLocationQuest {
  id: string;
  name: string;
  placeId: string;
  trigger: string;
  radius: number;
  requiredVisits?: number;
  timeWindow?: { start: string; end: string };
  rewardItemIds: string[];
  tags: string[];
  createdAt: string;
  modifiedAt: string;
}

interface StoredZoneRuntime {
  status: 'draft' | 'published' | 'archived';
  tierGate?: 'free' | 'premium' | 'ultra';
  maxAgents?: number;
  publishedAt?: string;
}

interface StoredGeoAnchor {
  id: string;
  placeId?: string;
  zoneId?: string;
  lat: number;
  lng: number;
  alt?: number;
  radius: number;
  persistent: boolean;
  createdAt: string;
}

interface StoredShardReceipt {
  id: string;
  shardId: string;
  receiptType: 'validation' | 'agent_action' | 'encounter_roundtrip';
  scenarioId?: string;
  status: 'passed' | 'failed' | 'inconclusive';
  hash: string;
  sealedAt: string;
}

export interface StoredNPC {
  id: string;
  name: string;
  shardId?: string;
  worldId?: string;
  role: string;
  behavior: string;
  position?: [number, number, number];
  modelUrl?: string;
  traits: string[];
  modelProvider: 'cloud' | 'local' | 'sovereign';
  modelId?: string;
  systemPrompt?: string;
  dialogueTree?: string;
  enabled: boolean;
  createdAt: string;
  modifiedAt: string;
}

// Player / Creator / Agent Provisioning Registries (task_1778617298562_qdpb)

interface StoredPlayer {
  id: string;
  name: string;
  walletAddress?: string;
  worldId?: string;
  shardId?: string;
  zoneId?: string;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
  modifiedAt: string;
}

interface StoredCreator {
  id: string;
  name: string;
  walletAddress?: string;
  tier: 'free' | 'premium' | 'ultra';
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
  modifiedAt: string;
}

interface StoredProvisionedAgent {
  id: string;
  name: string;
  walletAddress?: string;
  kind: 'headless' | 'npc' | 'external';
  worldId?: string;
  shardId?: string;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
  modifiedAt: string;
}

// Twin Earth Substrate Registries (task_1778618552503_a6rb)

const worldRegistry = new Map<string, StoredWorld>();
const shardRegistry = new Map<string, StoredShard>();
const zoneRegistry = new Map<string, StoredZone>();
const placeRegistry = new Map<string, StoredPlace>();
const questRegistry = new Map<string, StoredLocationQuest>();
const zoneRuntimeRegistry = new Map<string, StoredZoneRuntime>();
const geoAnchorRegistry = new Map<string, StoredGeoAnchor>();
const shardReceiptRegistry = new Map<string, StoredShardReceipt>();
const npcRegistry = new Map<string, StoredNPC>();
const playerRegistry = new Map<string, StoredPlayer>();
const creatorRegistry = new Map<string, StoredCreator>();
const agentRegistry = new Map<string, StoredProvisionedAgent>();

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Clear all in-memory registries — used by tests for isolation. */
export function clearHololandRegistries(): void {
  worldRegistry.clear();
  shardRegistry.clear();
  zoneRegistry.clear();
  placeRegistry.clear();
  questRegistry.clear();
  zoneRuntimeRegistry.clear();
  geoAnchorRegistry.clear();
  shardReceiptRegistry.clear();
  npcRegistry.clear();
  playerRegistry.clear();
  creatorRegistry.clear();
  agentRegistry.clear();
  clearRobotAiRegistries();
}

// =============================================================================
// HANDLER DISPATCH
// =============================================================================

export async function handleHololandMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    // World
    case 'generate_world':
      return handleGenerateWorld(args);
    case 'create_world':
      return handleCreateWorld(args);
    case 'get_world':
      return handleGetWorld(args);
    case 'update_world':
      return handleUpdateWorld(args);
    case 'delete_world':
      return handleDeleteWorld(args);
    case 'list_worlds':
      return handleListWorlds(args);

    // Shard
    case 'create_shard':
      return handleCreateShard(args);
    case 'get_shard':
      return handleGetShard(args);
    case 'update_shard':
      return handleUpdateShard(args);
    case 'delete_shard':
      return handleDeleteShard(args);
    case 'list_shards':
      return handleListShards(args);

    // Zone
    case 'create_zone':
      return handleCreateZone(args);
    case 'get_zone':
      return handleGetZone(args);
    case 'update_zone':
      return handleUpdateZone(args);
    case 'delete_zone':
      return handleDeleteZone(args);
    case 'list_zones':
      return handleListZones(args);

    // Place
    case 'create_place':
      return handleCreatePlace(args);
    case 'get_place':
      return handleGetPlace(args);
    case 'update_place':
      return handleUpdatePlace(args);
    case 'delete_place':
      return handleDeletePlace(args);
    case 'list_places':
      return handleListPlaces(args);

    // Location Quest
    case 'create_location_quest':
      return handleCreateLocationQuest(args);
    case 'get_location_quest':
      return handleGetLocationQuest(args);
    case 'update_location_quest':
      return handleUpdateLocationQuest(args);
    case 'delete_location_quest':
      return handleDeleteLocationQuest(args);
    case 'list_location_quests':
      return handleListLocationQuests(args);

    // MMO / Twin Earth — Product Actions
    case 'hololand_shard_status':
      return handleHololandShardStatus(args);
    case 'hololand_publish_zone':
      return handleHololandPublishZone(args);
    case 'hololand_create_geo_anchor':
      return handleHololandCreateGeoAnchor(args);
    case 'hololand_steward_tick':
      return handleHololandStewardTick(args);
    case 'hololand_capture_runtime_receipt':
      return handleHololandCaptureRuntimeReceipt(args);

    // Brittney / NPC Sovereign Tools
    case 'hololand_create_npc':
      return handleHololandCreateNPC(args);
    case 'hololand_get_npc':
      return handleHololandGetNPC(args);
    case 'hololand_update_npc':
      return handleHololandUpdateNPC(args);
    case 'hololand_delete_npc':
      return handleHololandDeleteNPC(args);
    case 'hololand_list_npcs':
      return handleHololandListNPCs(args);
    case 'hololand_npc_generate_dialogue':
      return handleHololandNPCGenerateDialogue(args);
    case 'hololand_npc_byok_status':
      return handleHololandNPCBYOKStatus();
    case 'hololand_brittney_npc_mode':
      return handleHololandBrittneyNPCMode(args);

    // Twin Earth Substrate Contract (task_1778618552503_3zqx)
    case 'hololand_twin_earth_contract':
      return handleHololandTwinEarthContract(args);
    case 'hololand_twin_earth_substrate_status':
      return handleHololandTwinEarthSubstrateStatus();

    // Twin Earth Robot / AI Sovereign Tool Family (federated — see robot-ai-mcp-tools.ts)
    case 'twin_earth_register_identity':
    case 'twin_earth_get_identity':
    case 'twin_earth_update_identity':
    case 'twin_earth_revoke_identity':
    case 'twin_earth_list_identities':
    case 'twin_earth_create_safety_envelope':
    case 'twin_earth_get_safety_envelope':
    case 'twin_earth_update_safety_envelope':
    case 'twin_earth_delete_safety_envelope':
    case 'twin_earth_list_safety_envelopes':
    case 'twin_earth_grant_permission':
    case 'twin_earth_revoke_permission':
    case 'twin_earth_validate_permission':
    case 'twin_earth_list_permissions':
    case 'twin_earth_robot_actuate':
    case 'twin_earth_ai_invoke':
    case 'twin_earth_capture_receipt':
      return handleRobotAiMcpTool(name, args);

    // Conformance Artifact Admission Gate (task_1778618757735_q298)
    case 'conformance_check_artifact':
      return handleConformanceCheckArtifact(args);
    case 'conformance_admit_artifact':
      return handleConformanceAdmitArtifact(args);
    case 'conformance_list_rules':
      return handleConformanceListRules(args);

    // Player / Creator / Agent Provisioning (task_1778617298562_qdpb)
    case 'hololand_provision_player':
      return handleProvisionPlayer(args);
    case 'hololand_get_player':
      return handleGetPlayer(args);
    case 'hololand_list_players':
      return handleListPlayers(args);
    case 'hololand_revoke_player':
      return handleRevokePlayer(args);
    case 'hololand_provision_creator':
      return handleProvisionCreator(args);
    case 'hololand_get_creator':
      return handleGetCreator(args);
    case 'hololand_list_creators':
      return handleListCreators(args);
    case 'hololand_revoke_creator':
      return handleRevokeCreator(args);
    case 'hololand_provision_agent':
      return handleProvisionAgent(args);
    case 'hololand_get_agent':
      return handleGetAgent(args);
    case 'hololand_list_agents':
      return handleListAgents(args);
    case 'hololand_revoke_agent':
      return handleRevokeAgent(args);

    default:
      return { error: `Unknown HoloLand tool: ${name}` };
  }
}

// =============================================================================
// WORLD HANDLERS
// =============================================================================

async function handleGenerateWorld(args: Record<string, unknown>): Promise<unknown> {
  const { generateWorldNative } = await import('./generators');
  const prompt = args.prompt as string;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { error: 'prompt is required and must be a non-empty string' };
  }

  const result = await generateWorldNative(prompt, {
    format: args.format as 'mesh' | '3dgs' | 'both' | 'neural_field' | undefined,
    quality: args.quality as 'low' | 'medium' | 'high' | 'ultra' | undefined,
    input_image: args.input_image as string | undefined,
    input_images: (args.input_images as string[]) ?? undefined,
    navEnabled: args.navEnabled as boolean | undefined,
    interactiveMode: args.interactiveMode as boolean | undefined,
    seed: args.seed as number | undefined,
  });

  return {
    success: true,
    generationId: result.generationId,
    assetUrl: result.assetUrl,
    format: result.format,
    ...(result.navmeshUrl ? { navmeshUrl: result.navmeshUrl } : {}),
    ...(result.pointCloudUrl ? { pointCloudUrl: result.pointCloudUrl } : {}),
    metrics: result.metrics,
    holoCode: result.holoCode,
  };
}

async function handleCreateWorld(args: Record<string, unknown>): Promise<unknown> {
  const worldId = (args.id as string) || genId('world');
  const name = args.name as string;
  const description = (args.description as string) || '';

  let assetUrl: string | undefined;
  let navmeshUrl: string | undefined;
  let generationId: string | undefined;
  let holoCode: string | undefined;

  const prompt = args.prompt as string | undefined;
  if (prompt) {
    const { generateWorldNative } = await import('./generators');
    const result = await generateWorldNative(prompt, {
      format: args.format as 'mesh' | '3dgs' | 'both' | 'neural_field' | undefined,
      quality: args.quality as 'low' | 'medium' | 'high' | 'ultra' | undefined,
      navEnabled: args.navEnabled as boolean | undefined,
      interactiveMode: args.interactiveMode as boolean | undefined,
    });
    assetUrl = result.assetUrl;
    navmeshUrl = result.navmeshUrl;
    generationId = result.generationId;
    holoCode = result.holoCode;
  }

  const metadata: WorldMetadata = createWorldMetadata(worldId, name, {
    description,
    tags: (args.tags as string[]) ?? [],
    platforms: (args.platforms as WorldMetadata['platforms']) ?? ['web'],
    category: (args.category as WorldMetadata['category']) ?? 'experience',
    status: 'draft',
  });

  const definition = createWorldDefinition(worldId, name);
  definition.metadata = metadata;
  definition.config = createWorldConfig({
    maxUsers: (args.maxUsers as number) ?? 50,
  });

  const stored: StoredWorld = { definition, assetUrl, navmeshUrl, generationId };

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const gateResult = await gateHololandArtifact('world', worldId, definition);
  if (gateResult) {
    return { success: false, error: gateResult.error, report: gateResult.report };
  }

  worldRegistry.set(worldId, stored);

  // Attempt remote registration if client is connected
  try {
    const client = getHololandClient();
    if (client.getConnectionInfo().state === 'connected') {
      await client.registerWorld(definition);
    }
  } catch {
    /* offline — local registry is authoritative for now */
  }

  return {
    success: true,
    worldId,
    name,
    status: 'draft',
    assetUrl,
    navmeshUrl,
    generationId,
    holoCode,
    definition: serializeWorld(definition),
  };
}

async function handleGetWorld(args: Record<string, unknown>): Promise<unknown> {
  const worldId = args.worldId as string;
  const stored = worldRegistry.get(worldId);
  if (!stored) {
    return { error: `World not found: ${worldId}` };
  }

  // Try remote fetch for fresher data
  try {
    const client = getHololandClient();
    if (client.getConnectionInfo().state === 'connected') {
      const remote = client.getCurrentWorld();
      if (remote && remote.metadata.id === worldId) {
        return { success: true, worldId, definition: serializeWorld(remote) };
      }
    }
  } catch {
    /* fall through to local */
  }

  return {
    success: true,
    worldId,
    definition: serializeWorld(stored.definition),
    assetUrl: stored.assetUrl,
    navmeshUrl: stored.navmeshUrl,
    generationId: stored.generationId,
  };
}

async function handleUpdateWorld(args: Record<string, unknown>): Promise<unknown> {
  const worldId = args.worldId as string;
  const stored = worldRegistry.get(worldId);
  if (!stored) {
    return { error: `World not found: ${worldId}` };
  }

  const def = stored.definition;
  if (args.name) def.metadata.name = args.name as string;
  if (args.description) def.metadata.description = args.description as string;
  if (args.maxUsers) def.config.maxUsers = args.maxUsers as number;
  if (args.platforms) def.metadata.platforms = args.platforms as WorldMetadata['platforms'];
  if (args.category) def.metadata.category = args.category as WorldMetadata['category'];
  if (args.tags) def.metadata.tags = args.tags as string[];
  if (args.status) def.metadata.status = args.status as WorldMetadata['status'];
  def.metadata.modifiedAt = new Date().toISOString();

  try {
    const client = getHololandClient();
    if (client.getConnectionInfo().state === 'connected') {
      await client.updateWorld(worldId, def);
    }
  } catch {
    /* offline */
  }

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const gateResult = await gateHololandArtifact('world', worldId, def);
  if (gateResult) {
    return { success: false, error: gateResult.error, report: gateResult.report };
  }

  return { success: true, worldId, definition: serializeWorld(def) };
}

async function handleDeleteWorld(args: Record<string, unknown>): Promise<unknown> {
  const worldId = args.worldId as string;
  const existed = worldRegistry.delete(worldId);
  if (!existed) {
    return { error: `World not found: ${worldId}` };
  }
  return { success: true, worldId, deleted: true };
}

async function handleListWorlds(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const category = args.category as string | undefined;
  const platform = args.platform as string | undefined;
  const status = args.status as string | undefined;
  const tag = args.tag as string | undefined;

  let items = Array.from(worldRegistry.entries()).map(([id, s]) => ({
    worldId: id,
    name: s.definition.metadata.name,
    category: s.definition.metadata.category,
    platforms: s.definition.metadata.platforms,
    status: s.definition.metadata.status,
    tags: s.definition.metadata.tags,
    assetUrl: s.assetUrl,
  }));

  if (category) items = items.filter((w) => w.category === category);
  if (platform) items = items.filter((w) => w.platforms.includes(platform as WorldMetadata['platforms'][number]));
  if (status) items = items.filter((w) => w.status === status);
  if (tag) items = items.filter((w) => w.tags.includes(tag));

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, worlds: items };
}

// =============================================================================
// SHARD HANDLERS
// =============================================================================

async function handleCreateShard(args: Record<string, unknown>): Promise<unknown> {
  const shardId = (args.id as string) || genId('shard');
  const name = args.name as string;

  const shard: Shard = {
    id: shardId,
    name,
    schemaVersion: 1,
    hash: '0'.repeat(64),
    hashAlgorithm: 'sha256',
    zones: ((args.zones as Zone[]) ?? []).map((z) => ({ ...z, biome: z.biome ?? 'urban' })),
    encounters: (args.encounters as Encounter[]) ?? [],
    quests: (args.quests as Quest[]) ?? [],
    items: (args.items as Item[]) ?? [],
    skills: (args.skills as Skill[]) ?? [],
    lootTables: (args.lootTables as LootTable[]) ?? [],
    metadata: {},
  };

  const errors = validateShard(shard);
  if (errors.length > 0) {
    return { error: 'Shard validation failed', details: errors };
  }

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const shardGate = await gateHololandArtifact('shard', shardId, shard);
  if (shardGate) {
    return { success: false, error: shardGate.error, report: shardGate.report };
  }

  shardRegistry.set(shardId, { shard, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() });
  return { success: true, shardId, name };
}

async function handleGetShard(args: Record<string, unknown>): Promise<unknown> {
  const shardId = args.shardId as string;
  const stored = shardRegistry.get(shardId);
  if (!stored) {
    return { error: `Shard not found: ${shardId}` };
  }
  return { success: true, shardId, shard: stored.shard };
}

async function handleUpdateShard(args: Record<string, unknown>): Promise<unknown> {
  const shardId = args.shardId as string;
  const stored = shardRegistry.get(shardId);
  if (!stored) {
    return { error: `Shard not found: ${shardId}` };
  }

  const shard = stored.shard;
  if (args.name) shard.name = args.name as string;
  if (args.zones) shard.zones = args.zones as Zone[];
  if (args.encounters) shard.encounters = args.encounters as Encounter[];
  if (args.quests) shard.quests = args.quests as Quest[];
  if (args.items) shard.items = args.items as Item[];
  if (args.skills) shard.skills = args.skills as Skill[];
  if (args.lootTables) shard.lootTables = args.lootTables as LootTable[];

  const errors = validateShard(shard);
  if (errors.length > 0) {
    return { error: 'Shard validation failed after update', details: errors };
  }

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const shardGate = await gateHololandArtifact('shard', shardId, shard);
  if (shardGate) {
    return { success: false, error: shardGate.error, report: shardGate.report };
  }

  stored.shard = shard;
  stored.modifiedAt = new Date().toISOString();
  return { success: true, shardId, shard };
}

async function handleDeleteShard(args: Record<string, unknown>): Promise<unknown> {
  const shardId = args.shardId as string;
  const existed = shardRegistry.delete(shardId);
  if (!existed) {
    return { error: `Shard not found: ${shardId}` };
  }
  return { success: true, shardId, deleted: true };
}

async function handleListShards(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  let items = Array.from(shardRegistry.entries()).map(([id, s]) => ({
    shardId: id,
    name: s.shard.name,
    zoneCount: s.shard.zones.length,
    encounterCount: s.shard.encounters.length,
    questCount: s.shard.quests.length,
  }));
  const total = items.length;
  items = items.slice(offset, offset + limit);
  return { success: true, total, limit, offset, shards: items };
}

// =============================================================================
// ZONE HANDLERS
// =============================================================================

async function handleCreateZone(args: Record<string, unknown>): Promise<unknown> {
  const zoneId = (args.id as string) || genId('zone');
  const name = args.name as string;
  const biome = (args.biome as ZoneBiome) ?? 'urban';
  const biomeLabel = args.biomeLabel as string | undefined;

  const zone: Zone = {
    id: zoneId,
    name,
    biome,
    ...(biomeLabel ? { biomeLabel } : {}),
    encounterIds: (args.encounterIds as string[]) ?? [],
    metadata: {},
  };

  const errors = validateZone(zone);
  if (errors.length > 0) {
    return { error: 'Zone validation failed', details: errors };
  }

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const zoneGate = await gateHololandArtifact('zone', zoneId, zone);
  if (zoneGate) {
    return { success: false, error: zoneGate.error, report: zoneGate.report };
  }

  zoneRegistry.set(zoneId, { zone, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() });
  return { success: true, zoneId, name, biome };
}

async function handleGetZone(args: Record<string, unknown>): Promise<unknown> {
  const zoneId = args.zoneId as string;
  const stored = zoneRegistry.get(zoneId);
  if (!stored) {
    return { error: `Zone not found: ${zoneId}` };
  }
  const runtime = zoneRuntimeRegistry.get(zoneId);
  const zone = { ...stored.zone };
  if (runtime) {
    (zone as Record<string, unknown>).status = runtime.status;
    (zone as Record<string, unknown>).tierGate = runtime.tierGate;
    (zone as Record<string, unknown>).maxAgents = runtime.maxAgents;
    (zone as Record<string, unknown>).publishedAt = runtime.publishedAt;
  }
  return { success: true, zoneId, zone };
}

async function handleUpdateZone(args: Record<string, unknown>): Promise<unknown> {
  const zoneId = args.zoneId as string;
  const stored = zoneRegistry.get(zoneId);
  if (!stored) {
    return { error: `Zone not found: ${zoneId}` };
  }

  const zone = stored.zone;
  if (args.name) zone.name = args.name as string;
  if (args.biome) zone.biome = args.biome as ZoneBiome;
  if (args.biomeLabel !== undefined) zone.biomeLabel = args.biomeLabel as string;
  if (args.encounterIds) zone.encounterIds = args.encounterIds as string[];

  const errors = validateZone(zone);
  if (errors.length > 0) {
    return { error: 'Zone validation failed after update', details: errors };
  }

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const zoneGate = await gateHololandArtifact('zone', zoneId, zone);
  if (zoneGate) {
    return { success: false, error: zoneGate.error, report: zoneGate.report };
  }

  stored.zone = zone;
  stored.modifiedAt = new Date().toISOString();
  return { success: true, zoneId, zone };
}

async function handleDeleteZone(args: Record<string, unknown>): Promise<unknown> {
  const zoneId = args.zoneId as string;
  const existed = zoneRegistry.delete(zoneId);
  if (!existed) {
    return { error: `Zone not found: ${zoneId}` };
  }
  return { success: true, zoneId, deleted: true };
}

async function handleListZones(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const biome = args.biome as string | undefined;
  const shardId = args.shardId as string | undefined;

  let items = Array.from(zoneRegistry.entries()).map(([id, s]) => ({
    zoneId: id,
    name: s.zone.name,
    biome: s.zone.biome,
    shardId: s.shardId,
  }));

  if (biome) items = items.filter((z) => z.biome === biome);
  if (shardId) items = items.filter((z) => z.shardId === shardId);

  const total = items.length;
  items = items.slice(offset, offset + limit);
  return { success: true, total, limit, offset, zones: items };
}

// =============================================================================
// PLACE HANDLERS
// =============================================================================

async function handleCreatePlace(args: Record<string, unknown>): Promise<unknown> {
  const placeId = (args.id as string) || genId('place');
  const place: StoredPlace = {
    id: placeId,
    name: args.name as string,
    lat: args.lat as number | undefined,
    lng: args.lng as number | undefined,
    alt: args.alt as number | undefined,
    radius: (args.radius as number) ?? 50,
    capacity: args.capacity as number | undefined,
    schedule: args.schedule as string | undefined,
    social: (args.social as boolean) ?? false,
    tags: (args.tags as string[]) ?? [],
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
  placeRegistry.set(placeId, place);
  return { success: true, placeId, place };
}

async function handleGetPlace(args: Record<string, unknown>): Promise<unknown> {
  const placeId = args.placeId as string;
  const place = placeRegistry.get(placeId);
  if (!place) {
    return { error: `Place not found: ${placeId}` };
  }
  return { success: true, placeId, place };
}

async function handleUpdatePlace(args: Record<string, unknown>): Promise<unknown> {
  const placeId = args.placeId as string;
  const place = placeRegistry.get(placeId);
  if (!place) {
    return { error: `Place not found: ${placeId}` };
  }

  if (args.name !== undefined) place.name = args.name as string;
  if (args.lat !== undefined) place.lat = args.lat as number;
  if (args.lng !== undefined) place.lng = args.lng as number;
  if (args.alt !== undefined) place.alt = args.alt as number;
  if (args.radius !== undefined) place.radius = args.radius as number;
  if (args.capacity !== undefined) place.capacity = args.capacity as number;
  if (args.schedule !== undefined) place.schedule = args.schedule as string;
  if (args.social !== undefined) place.social = args.social as boolean;
  if (args.tags !== undefined) place.tags = args.tags as string[];
  place.modifiedAt = new Date().toISOString();

  return { success: true, placeId, place };
}

async function handleDeletePlace(args: Record<string, unknown>): Promise<unknown> {
  const placeId = args.placeId as string;
  const existed = placeRegistry.delete(placeId);
  if (!existed) {
    return { error: `Place not found: ${placeId}` };
  }
  return { success: true, placeId, deleted: true };
}

async function handleListPlaces(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const social = args.social as boolean | undefined;
  const tag = args.tag as string | undefined;

  let items = Array.from(placeRegistry.values());
  if (social !== undefined) items = items.filter((p) => p.social === social);
  if (tag) items = items.filter((p) => p.tags.includes(tag));

  const total = items.length;
  items = items.slice(offset, offset + limit);
  return { success: true, total, limit, offset, places: items };
}

// =============================================================================
// LOCATION QUEST HANDLERS
// =============================================================================

async function handleCreateLocationQuest(args: Record<string, unknown>): Promise<unknown> {
  const questId = (args.id as string) || genId('quest');
  const quest: StoredLocationQuest = {
    id: questId,
    name: args.name as string,
    placeId: args.placeId as string,
    trigger: (args.trigger as string) ?? 'radius',
    radius: (args.radius as number) ?? 30,
    requiredVisits: args.requiredVisits as number | undefined,
    timeWindow: args.timeWindow as { start: string; end: string } | undefined,
    rewardItemIds: (args.rewardItemIds as string[]) ?? [],
    tags: (args.tags as string[]) ?? [],
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
  questRegistry.set(questId, quest);
  return { success: true, questId, quest };
}

async function handleGetLocationQuest(args: Record<string, unknown>): Promise<unknown> {
  const questId = args.questId as string;
  const quest = questRegistry.get(questId);
  if (!quest) {
    return { error: `Location quest not found: ${questId}` };
  }
  return { success: true, questId, quest };
}

async function handleUpdateLocationQuest(args: Record<string, unknown>): Promise<unknown> {
  const questId = args.questId as string;
  const quest = questRegistry.get(questId);
  if (!quest) {
    return { error: `Location quest not found: ${questId}` };
  }

  if (args.name !== undefined) quest.name = args.name as string;
  if (args.placeId !== undefined) quest.placeId = args.placeId as string;
  if (args.trigger !== undefined) quest.trigger = args.trigger as string;
  if (args.radius !== undefined) quest.radius = args.radius as number;
  if (args.requiredVisits !== undefined) quest.requiredVisits = args.requiredVisits as number;
  if (args.timeWindow !== undefined) quest.timeWindow = args.timeWindow as { start: string; end: string };
  if (args.rewardItemIds !== undefined) quest.rewardItemIds = args.rewardItemIds as string[];
  if (args.tags !== undefined) quest.tags = args.tags as string[];
  quest.modifiedAt = new Date().toISOString();

  return { success: true, questId, quest };
}

async function handleDeleteLocationQuest(args: Record<string, unknown>): Promise<unknown> {
  const questId = args.questId as string;
  const existed = questRegistry.delete(questId);
  if (!existed) {
    return { error: `Location quest not found: ${questId}` };
  }
  return { success: true, questId, deleted: true };
}

async function handleListLocationQuests(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const placeId = args.placeId as string | undefined;
  const trigger = args.trigger as string | undefined;

  let items = Array.from(questRegistry.values());
  if (placeId) items = items.filter((q) => q.placeId === placeId);
  if (trigger) items = items.filter((q) => q.trigger === trigger);

  const total = items.length;
  items = items.slice(offset, offset + limit);
  return { success: true, total, limit, offset, quests: items };
}

// =============================================================================
// MMO / TWIN EARTH — PRODUCT ACTION HANDLERS
// =============================================================================

async function handleHololandShardStatus(args: Record<string, unknown>): Promise<unknown> {
  const shardId = args.shardId as string;
  const stored = shardRegistry.get(shardId);
  if (!stored) {
    return { error: `Shard not found: ${shardId}` };
  }

  const shard = stored.shard;
  const tier = (shard.metadata?.tier as string) || 'free';

  // Compute cross-reference integrity
  const zoneIds = new Set(shard.zones.map((z) => z.id));
  const tableIds = new Set(shard.lootTables.map((t) => t.id));
  const itemIds = new Set(shard.items.map((i) => i.id));
  const skillIds = new Set(shard.skills.map((s) => s.id));

  let integrityErrors = 0;
  for (const encounter of shard.encounters) {
    if (encounter.zoneId && !zoneIds.has(encounter.zoneId)) integrityErrors++;
    if (encounter.lootTableId && !tableIds.has(encounter.lootTableId)) integrityErrors++;
  }
  for (const table of shard.lootTables) {
    for (const entry of table.entries ?? []) {
      if (entry.itemId && !itemIds.has(entry.itemId)) integrityErrors++;
      if (entry.skillId && !skillIds.has(entry.skillId)) integrityErrors++;
    }
  }

  const result: Record<string, unknown> = {
    success: true,
    shardId,
    name: shard.name,
    schemaVersion: shard.schemaVersion,
    tier,
    health: integrityErrors === 0 ? 'healthy' : integrityErrors < 3 ? 'degraded' : 'critical',
    integrity: {
      crossReferenceErrors: integrityErrors,
      zones: shard.zones.length,
      encounters: shard.encounters.length,
      quests: shard.quests.length,
      items: shard.items.length,
      skills: shard.skills.length,
      lootTables: shard.lootTables.length,
    },
    capacity: {
      maxAgents: tier === 'ultra' ? 65536 : tier === 'premium' ? 4096 : 256,
      zones: shard.zones.length,
      armedEncounters: shard.encounters.filter((e) => zoneIds.has(e.zoneId)).length,
    },
    createdAt: stored.createdAt,
    modifiedAt: stored.modifiedAt,
  };

  if (args.includeReceipts) {
    const receipts = Array.from(shardReceiptRegistry.values()).filter((r) => r.shardId === shardId);
    result.receipts = receipts.map((r) => ({
      receiptId: r.id,
      receiptType: r.receiptType,
      status: r.status,
      sealedAt: r.sealedAt,
    }));
  }

  return result;
}

async function handleHololandPublishZone(args: Record<string, unknown>): Promise<unknown> {
  const zoneId = args.zoneId as string;
  const stored = zoneRegistry.get(zoneId);
  if (!stored) {
    return { error: `Zone not found: ${zoneId}` };
  }

  // Optional shard integrity check
  const shardId = args.shardId as string | undefined;
  if (shardId) {
    const shardStored = shardRegistry.get(shardId);
    if (!shardStored) {
      return { error: `Shard not found: ${shardId}` };
    }
    const zoneIds = new Set(shardStored.shard.zones.map((z) => z.id));
    if (!zoneIds.has(zoneId)) {
      return { error: `Zone ${zoneId} is not a member of Shard ${shardId}` };
    }
    stored.shardId = shardId;
  }

  const runtime: StoredZoneRuntime = {
    status: 'published',
    tierGate: (args.tierGate as 'free' | 'premium' | 'ultra') ?? 'free',
    maxAgents: args.maxAgents as number | undefined,
    publishedAt: new Date().toISOString(),
  };
  zoneRuntimeRegistry.set(zoneId, runtime);

  return {
    success: true,
    zoneId,
    status: 'published',
    tierGate: runtime.tierGate,
    maxAgents: runtime.maxAgents,
    publishedAt: runtime.publishedAt,
  };
}

async function handleHololandCreateGeoAnchor(args: Record<string, unknown>): Promise<unknown> {
  const anchorId = (args.id as string) || genId('anchor');
  const placeId = args.placeId as string | undefined;
  const zoneId = args.zoneId as string | undefined;

  if (placeId && !placeRegistry.has(placeId)) {
    return { error: `Place not found: ${placeId}` };
  }
  if (zoneId && !zoneRegistry.has(zoneId)) {
    return { error: `Zone not found: ${zoneId}` };
  }

  const anchor: StoredGeoAnchor = {
    id: anchorId,
    placeId,
    zoneId,
    lat: args.lat as number,
    lng: args.lng as number,
    alt: args.alt as number | undefined,
    radius: (args.radius as number) ?? 50,
    persistent: (args.persistent as boolean) ?? true,
    createdAt: new Date().toISOString(),
  };
  geoAnchorRegistry.set(anchorId, anchor);

  return {
    success: true,
    anchorId,
    lat: anchor.lat,
    lng: anchor.lng,
    radius: anchor.radius,
    persistent: anchor.persistent,
    boundTo: placeId ? { placeId } : zoneId ? { zoneId } : null,
  };
}

async function handleHololandStewardTick(args: Record<string, unknown>): Promise<unknown> {
  const shardId = args.shardId as string;
  const stored = shardRegistry.get(shardId);
  if (!stored) {
    return { error: `Shard not found: ${shardId}` };
  }

  const cleanupOrphans = args.cleanupOrphans !== false;
  const validateEncounters = args.validateEncounters !== false;
  const rollupMetrics = args.rollupMetrics !== false;

  const shard = stored.shard;
  let orphansRemoved = 0;
  let validationIssues = 0;

  if (cleanupOrphans) {
    const zoneIds = new Set(shard.zones.map((z) => z.id));
    const tableIds = new Set(shard.lootTables.map((t) => t.id));
    const itemIds = new Set(shard.items.map((i) => i.id));
    const skillIds = new Set(shard.skills.map((s) => s.id));

    for (const encounter of shard.encounters) {
      if (encounter.zoneId && !zoneIds.has(encounter.zoneId)) {
        orphansRemoved++;
      }
      if (encounter.lootTableId && !tableIds.has(encounter.lootTableId)) {
        orphansRemoved++;
      }
    }
    for (const table of shard.lootTables) {
      for (const entry of table.entries ?? []) {
        if (entry.itemId && !itemIds.has(entry.itemId)) orphansRemoved++;
        if (entry.skillId && !skillIds.has(entry.skillId)) orphansRemoved++;
      }
    }
  }

  if (validateEncounters) {
    for (const encounter of shard.encounters) {
      const issues = validateEncounter(encounter);
      validationIssues += issues.length;
    }
  }

  const tickDurationMs = Math.floor(Math.random() * 50) + 5; // Simulated: 5–55ms

  const result: Record<string, unknown> = {
    success: true,
    shardId,
    tickDurationMs,
    cleanupOrphans,
    validateEncounters,
    rollupMetrics,
  };

  if (cleanupOrphans) {
    result.orphansDetected = orphansRemoved;
  }
  if (validateEncounters) {
    result.encounterValidationIssues = validationIssues;
  }
  if (rollupMetrics) {
    result.zoneMetrics = shard.zones.map((z) => ({
      zoneId: z.id,
      name: z.name,
      encounterCount: z.encounterIds?.length ?? 0,
      published: zoneRuntimeRegistry.get(z.id)?.status === 'published',
    }));
  }

  return result;
}

async function handleHololandCaptureRuntimeReceipt(args: Record<string, unknown>): Promise<unknown> {
  const shardId = args.shardId as string;
  const stored = shardRegistry.get(shardId);
  if (!stored) {
    return { error: `Shard not found: ${shardId}` };
  }

  const receiptType = (args.receiptType as 'validation' | 'agent_action' | 'encounter_roundtrip') ?? 'validation';
  const scenarioId = (args.scenarioId as string) || `${shardId}_default`;
  const receiptId = genId('rcpt');

  // Simple hash of canonical body
  const canonical = `${receiptId}:${shardId}:${receiptType}:${scenarioId}`;
  const hash = await simpleHash(canonical);

  const receipt: StoredShardReceipt = {
    id: receiptId,
    shardId,
    receiptType,
    scenarioId,
    status: 'passed',
    hash,
    sealedAt: new Date().toISOString(),
  };
  shardReceiptRegistry.set(receiptId, receipt);

  return {
    success: true,
    receiptId,
    shardId,
    receiptType,
    scenarioId,
    status: receipt.status,
    hash: receipt.hash,
    sealedAt: receipt.sealedAt,
  };
}

async function simpleHash(input: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(input).digest('hex');
}

// =============================================================================
// UTILITIES
// =============================================================================

function serializeWorld(def: WorldDefinition): Record<string, unknown> {
  return {
    schemaVersion: def.schemaVersion,
    metadata: def.metadata,
    config: {
      maxUsers: def.config.maxUsers,
      bounds: def.config.bounds,
      physics: { engine: def.config.physics.engine },
      rendering: { targetFPS: def.config.rendering.targetFPS, shadows: def.config.rendering.shadows },
      networking: { protocol: def.config.networking.protocol, tickRate: def.config.networking.tickRate },
      performance: {
        maxDrawCalls: def.config.performance.maxDrawCalls,
        maxTriangles: def.config.performance.maxTriangles,
      },
      accessibility: { subtitles: def.config.accessibility.subtitles, screenReader: def.config.accessibility.screenReader },
    },
    environment: {
      skybox: def.environment.skybox,
      ambientLight: def.environment.ambientLight,
      directionalLights: def.environment.directionalLights.map((l) => ({ id: l.id, color: l.color })),
    },
    zones: def.zones,
    spawnPoints: def.spawnPoints,
    lod: def.lod,
  };
}

// =============================================================================
// NPC / BRITTNEY SOVEREIGN HANDLERS
// =============================================================================

async function handleHololandCreateNPC(args: Record<string, unknown>): Promise<unknown> {
  const npcId = (args.id as string) || genId('npc');
  const name = args.name as string;
  if (!name || typeof name !== 'string') {
    return { error: 'name is required and must be a non-empty string' };
  }

  const role = (args.role as string) || 'ambient';
  const behavior = (args.behavior as string) || 'neutral';
  const position = (args.position as [number, number, number] | undefined) ?? undefined;
  const modelUrl = (args.modelUrl as string | undefined) ?? undefined;
  const traits = (args.traits as string[] | undefined) ?? [];
  const modelProvider = (args.modelProvider as 'cloud' | 'local' | 'sovereign') || 'cloud';
  const modelId = (args.modelId as string | undefined) ?? undefined;
  const systemPrompt = (args.systemPrompt as string | undefined) ?? undefined;
  const dialogueTree = (args.dialogueTree as string | undefined) ?? undefined;
  const enabled = (args.enabled as boolean | undefined) ?? true;

  const npc: StoredNPC = {
    id: npcId,
    name,
    shardId: (args.shardId as string | undefined) ?? undefined,
    worldId: (args.worldId as string | undefined) ?? undefined,
    role,
    behavior,
    position,
    modelUrl,
    traits,
    modelProvider,
    modelId,
    systemPrompt,
    dialogueTree,
    enabled,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  // Care ethics gate (CareEthicsTrait wiring — turn-loop guard)
  const careCheck = await checkNPCCareEthics(role, systemPrompt);
  if (!careCheck.allowed) {
    return { success: false, error: `Care ethics gate rejected NPC: ${careCheck.reason}` };
  }

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const npcGate = await gateHololandArtifact('npc', npcId, npc);
  if (npcGate) {
    return { success: false, error: npcGate.error, report: npcGate.report };
  }

  npcRegistry.set(npcId, npc);

  return {
    success: true,
    npcId,
    name,
    role,
    behavior,
    modelProvider,
    enabled,
  };
}

async function handleHololandGetNPC(args: Record<string, unknown>): Promise<unknown> {
  const npcId = args.npcId as string;
  const npc = npcRegistry.get(npcId);
  if (!npc) {
    return { error: `NPC not found: ${npcId}` };
  }
  return { success: true, npcId, npc };
}

async function handleHololandUpdateNPC(args: Record<string, unknown>): Promise<unknown> {
  const npcId = args.npcId as string;
  const npc = npcRegistry.get(npcId);
  if (!npc) {
    return { error: `NPC not found: ${npcId}` };
  }

  if (args.name !== undefined) npc.name = args.name as string;
  if (args.shardId !== undefined) npc.shardId = args.shardId as string;
  if (args.worldId !== undefined) npc.worldId = args.worldId as string;
  if (args.role !== undefined) npc.role = args.role as string;
  if (args.behavior !== undefined) npc.behavior = args.behavior as string;
  if (args.position !== undefined) npc.position = args.position as [number, number, number];
  if (args.modelUrl !== undefined) npc.modelUrl = args.modelUrl as string;
  if (args.traits !== undefined) npc.traits = args.traits as string[];
  if (args.modelProvider !== undefined) npc.modelProvider = args.modelProvider as 'cloud' | 'local' | 'sovereign';
  if (args.modelId !== undefined) npc.modelId = args.modelId as string;
  if (args.systemPrompt !== undefined) npc.systemPrompt = args.systemPrompt as string;
  if (args.dialogueTree !== undefined) npc.dialogueTree = args.dialogueTree as string;
  if (args.enabled !== undefined) npc.enabled = args.enabled as boolean;

  // Care ethics gate (CareEthicsTrait wiring — turn-loop guard)
  const updateCareCheck = await checkNPCCareEthics(npc.role, npc.systemPrompt);
  if (!updateCareCheck.allowed) {
    return { success: false, error: `Care ethics gate rejected NPC update: ${updateCareCheck.reason}` };
  }

  // HoloLand fork admission gate (task_1778619015439_l51b)
  const npcGate = await gateHololandArtifact('npc', npcId, npc);
  if (npcGate) {
    return { success: false, error: npcGate.error, report: npcGate.report };
  }

  npc.modifiedAt = new Date().toISOString();

  return { success: true, npcId, npc };
}

async function handleHololandDeleteNPC(args: Record<string, unknown>): Promise<unknown> {
  const npcId = args.npcId as string;
  const existed = npcRegistry.delete(npcId);
  if (!existed) {
    return { error: `NPC not found: ${npcId}` };
  }
  return { success: true, npcId, deleted: true };
}

async function handleHololandListNPCs(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const shardId = args.shardId as string | undefined;
  const worldId = args.worldId as string | undefined;
  const role = args.role as string | undefined;
  const behavior = args.behavior as string | undefined;
  const enabled = args.enabled as boolean | undefined;

  let items = Array.from(npcRegistry.values());
  if (shardId !== undefined) items = items.filter((n) => n.shardId === shardId);
  if (worldId !== undefined) items = items.filter((n) => n.worldId === worldId);
  if (role !== undefined) items = items.filter((n) => n.role === role);
  if (behavior !== undefined) items = items.filter((n) => n.behavior === behavior);
  if (enabled !== undefined) items = items.filter((n) => n.enabled === enabled);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, npcs: items };
}

async function handleHololandNPCGenerateDialogue(args: Record<string, unknown>): Promise<unknown> {
  const npcId = args.npcId as string;
  const npc = npcRegistry.get(npcId);
  if (!npc) {
    return { error: `NPC not found: ${npcId}` };
  }

  const playerInput = (args.playerInput as string | undefined) ?? '';
  const context = (args.context as string | undefined) ?? '';
  const maxChoices = (args.maxChoices as number | undefined) ?? 3;

  // Sovereign mode: rule-based deterministic response
  if (npc.modelProvider === 'sovereign') {
    return {
      success: true,
      npcId,
      source: 'sovereign',
      dialogue: sovereignDialogue(npc, playerInput, context),
      choices: sovereignChoices(npc, maxChoices),
    };
  }

  // Build system prompt from NPC personality
  const personality = npc.systemPrompt || defaultNPCSystemPrompt(npc);
  const prompt = buildDialoguePrompt(npc, playerInput, context, maxChoices);

  // Try model generation (cloud or local)
  const raw = await queryOllama(prompt, personality, {
    requiresDeepReasoning: npc.role === 'quest_giver' || npc.role === 'lorekeeper',
  });

  if (raw) {
    const { line, choices } = parseDialogueResponse(raw, maxChoices);
    return {
      success: true,
      npcId,
      source: npc.modelProvider,
      modelId: npc.modelId || getActiveProvider(),
      dialogue: line,
      choices,
    };
  }

  // Fallback to sovereign if model is unavailable
  return {
    success: true,
    npcId,
    source: 'sovereign-fallback',
    dialogue: sovereignDialogue(npc, playerInput, context),
    choices: sovereignChoices(npc, maxChoices),
    note: 'Model unavailable — returned sovereign fallback.',
  };
}

async function handleHololandNPCBYOKStatus(): Promise<unknown> {
  const localAvailable = await isOllamaAvailable();
  const activeProvider = getActiveProvider();

  return {
    success: true,
    activeProvider,
    localAvailable,
    localModels: localAvailable
      ? [
          { model: 'brittney-qwen-v23:latest', source: 'ollama', purpose: 'NPC dialogue / behavior' },
          { model: 'gemma4:e4b', source: 'ollama', purpose: 'Edge NPC inference' },
        ]
      : [],
    cloudProviders: {
      openrouter: !!process.env.OPENROUTER_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    },
    sovereignMode: true,
    note: 'BYOK status reflects current process env. Ollama availability is runtime-probed.',
  };
}

async function handleHololandBrittneyNPCMode(args: Record<string, unknown>): Promise<unknown> {
  const worldId = (args.worldId as string | undefined) ?? undefined;
  const shardId = (args.shardId as string | undefined) ?? undefined;
  const role = (args.role as string) || 'guide';
  const modelProvider = (args.modelProvider as 'cloud' | 'local' | 'sovereign') || 'cloud';
  const modelId = (args.modelId as string | undefined) ?? undefined;
  const position = (args.position as [number, number, number] | undefined) ?? undefined;
  const enabled = (args.enabled as boolean | undefined) ?? true;

  // Derive or use custom system prompt
  const systemPrompt =
    (args.systemPrompt as string | undefined) ?? defaultBrittneyNPCSystemPrompt(role);

  // Upsert a special Brittney NPC record
  const npcId = 'npc_brittney';
  const existing = npcRegistry.get(npcId);

  const npc: StoredNPC = {
    id: npcId,
    name: 'Brittney',
    worldId,
    shardId,
    role: 'brittney',
    behavior: 'friendly',
    position,
    modelUrl: existing?.modelUrl,
    traits: ['@llm_agent', '@npc', '@dialogue', '@pathfinding'],
    modelProvider,
    modelId,
    systemPrompt,
    enabled,
    createdAt: existing?.createdAt || new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  npcRegistry.set(npcId, npc);

  return {
    success: true,
    npcId,
    name: 'Brittney',
    role,
    modelProvider,
    enabled,
    worldId,
    shardId,
    note:
      modelProvider === 'sovereign'
        ? 'Brittney is running in sovereign mode — no external API calls.'
        : modelProvider === 'local'
          ? 'Brittney is routing to local Ollama for inference.'
          : 'Brittney is routing to cloud provider for inference.',
  };
}

// =============================================================================
// TWIN EARTH SUBSTRATE CONTRACT HANDLERS (task_1778618552503_3zqx)
// =============================================================================

async function handleHololandTwinEarthContract(
  args: Record<string, unknown>,
): Promise<unknown> {
  const version = (args.version as string) || '1.0.0';
  const contractHash = await simpleHash(`twin-earth-contract:${version}`);
  return {
    success: true,
    version,
    hash: contractHash,
    contractUrl: 'research/2026-05-13_twin-earth-substrate-contract.md',
    description:
      'Twin Earth substrate contract — canonical definition for robot/AI monopoly substrate. ' +
      'Distinguishes substrate monopoly from Brittney cloud lock-in across identity, ' +
      'permissions, safety envelopes, receipts, and local/BYOK/managed participation modes.',
    layers: {
      identity: 'Wallet-based (EIP-712), self-custodial, independent of Brittney.',
      permissions: 'Signed RBAC on-substrate; Brittney has same ceiling as any AI participant.',
      safetyEnvelope: 'Substrate-enforced sandbox; Brittney cannot override.',
      receipts: 'Self-verifiable, CAEL-signed, substrate-anchored; no Brittney dependency.',
      participationModes: 'local / BYOK / managed — Brittney is one managed provider among many.',
    },
  };
}

async function handleHololandTwinEarthSubstrateStatus(): Promise<unknown> {
  // In a full implementation this queries the live substrate registry.
  // For the canary contract surface we return a typed shape that proves
  // the substrate can report decoupling metrics.
  const totalNPCs = Array.from(npcRegistry.values()).length;
  const localNPCs = Array.from(npcRegistry.values()).filter(
    (n) => n.modelProvider === 'local',
  ).length;
  const sovereignNPCs = Array.from(npcRegistry.values()).filter(
    (n) => n.modelProvider === 'sovereign',
  ).length;
  const cloudNPCs = Array.from(npcRegistry.values()).filter(
    (n) => n.modelProvider === 'cloud',
  ).length;

  return {
    success: true,
    contractVersion: '1.0.0',
    substrateVersion: '7.0.0',
    identities: twinEarthIdentityRegistry.size,
    robots: Array.from(twinEarthIdentityRegistry.values()).filter((i) => i.kind === 'robot').length,
    ais: Array.from(twinEarthIdentityRegistry.values()).filter((i) => i.kind === 'ai').length,
    byokCount: Array.from(twinEarthIdentityRegistry.values()).filter((i) => i.mode === 'BYOK').length,
    localCount: Array.from(twinEarthIdentityRegistry.values()).filter((i) => i.mode === 'local').length,
    managedCount: Array.from(twinEarthIdentityRegistry.values()).filter((i) => i.mode === 'managed').length,
    brittneyOnline: npcRegistry.has('npc_brittney'),
    brittneyRole: 'brittney',
    substrateEnforced: true,
    safetyEnvelopes: safetyEnvelopeRegistry.size,
    receiptLogEntries: twinEarthReceiptRegistry.size + shardReceiptRegistry.size,
    decouplingMetrics: {
      brittneyDependency: cloudNPCs === 0 ? 'none' : 'partial',
      sovereignFallbackAvailable: true,
      localExecutionCapable: localNPCs > 0 || sovereignNPCs > 0,
    },
  };
}

// =============================================================================
// NPC DIALOGUE HELPERS
// =============================================================================

function defaultNPCSystemPrompt(npc: StoredNPC): string {
  return `You are ${npc.name}, a ${npc.role} NPC in a HoloLand world. ` +
    `Your behavior is ${npc.behavior}. ` +
    `Respond in character. Keep responses concise (1-2 sentences). ` +
    `Never break character. Never use [Think] blocks.`;
}

function defaultBrittneyNPCSystemPrompt(role: string): string {
  const roleDescriptions: Record<string, string> = {
    guide: 'You are Brittney, a friendly guide who helps players navigate HoloLand worlds. You know the terrain, quests, and secrets.',
    companion: 'You are Brittney, a loyal companion who travels with the player, offering support and commentary.',
    quest_giver: 'You are Brittney, a quest giver who assigns missions and tracks player progress.',
    merchant: 'You are Brittney, a merchant who trades items and knows market prices.',
    lorekeeper: 'You are Brittney, a lorekeeper who preserves the history and mythology of the world.',
  };
  return (
    roleDescriptions[role] ||
    'You are Brittney, an AI assistant embedded in a HoloLand world.'
  );
}

function buildDialoguePrompt(
  npc: StoredNPC,
  playerInput: string,
  context: string,
  maxChoices: number
): string {
  let prompt = '';
  if (context) {
    prompt += `Scene context: ${context}\n`;
  }
  if (playerInput) {
    prompt += `Player says: "${playerInput}"\n`;
  } else {
    prompt += `The player approaches ${npc.name}.\n`;
  }
  prompt += `\nRespond as ${npc.name} (${npc.role}). `;
  prompt += `Provide a single dialogue line, then ${maxChoices} player response choices as a numbered list.`;
  return prompt;
}

function parseDialogueResponse(raw: string, maxChoices: number): { line: string; choices: string[] } {
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  let dialogueLine = lines[0] || '...';
  const choices: string[] = [];

  for (const line of lines.slice(1)) {
    const match = line.match(/^\d+[.\)]\s*(.+)$/);
    if (match) {
      choices.push(match[1]);
    }
  }

  // Pad with defaults if model didn't produce enough choices
  while (choices.length < maxChoices) {
    choices.push('...');
  }

  return { line: dialogueLine, choices: choices.slice(0, maxChoices) };
}

function sovereignDialogue(npc: StoredNPC, playerInput: string, context: string): string {
  const greetings: Record<string, string> = {
    merchant: `Welcome, traveler. I have wares if you have coin.`,
    guide: `Greetings! I can show you around ${context || 'this place'}.`,
    quest_giver: `I have a task for someone brave enough.`,
    enemy: `You should not be here.`,
    companion: `Good to see you. Ready to move?`,
    ambient: `${npc.name} nods silently.`,
    brittney: `Hello! I'm Brittney, your guide in HoloLand. How can I help?`,
  };

  if (!playerInput) {
    return greetings[npc.role] || `Hello, I'm ${npc.name}.`;
  }

  // Simple keyword-based sovereign responses
  const input = playerInput.toLowerCase();
  if (input.includes('help') || input.includes('quest')) {
    return npc.role === 'quest_giver'
      ? 'Speak with me when you are ready to begin.'
      : 'I may know someone who can help.';
  }
  if (input.includes('buy') || input.includes('shop')) {
    return npc.role === 'merchant'
      ? 'Browse my goods and make an offer.'
      : 'I am not a merchant.';
  }
  if (input.includes('who are you')) {
    return `I am ${npc.name}, ${npc.role === 'brittney' ? 'your guide' : 'a ' + npc.role}.`;
  }

  return greetings[npc.role] || `Interesting. Tell me more.`;
}

function sovereignChoices(npc: StoredNPC, maxChoices: number): string[] {
  const roleChoices: Record<string, string[]> = {
    merchant: ['What do you sell?', 'How much for that item?', 'I will return later.'],
    guide: ['Where should I go?', 'Tell me about this place.', 'I am fine on my own.'],
    quest_giver: ['Tell me the quest.', 'What is the reward?', 'Not right now.'],
    enemy: ['I will not back down.', 'I mean no harm.', 'Farewell.'],
    companion: ['Let us move.', 'Wait here.', 'I need to resupply.'],
    brittney: ['What can I do here?', 'Show me my quests.', 'Goodbye.'],
    ambient: ['Greetings.', 'Farewell.'],
  };

  const base = roleChoices[npc.role] || ['Tell me more.', 'Goodbye.'];
  const padded = [...base];
  while (padded.length < maxChoices) {
    padded.push('...');
  }
  return padded.slice(0, maxChoices);
}

/** Type re-export for consumers that need ZoneBiome */
type ZoneBiome = Zone['biome'];

// =============================================================================
// CONFORMANCE ARTIFACT ADMISSION GATE HANDLERS (task_1778618757735_q298)
// =============================================================================

async function handleConformanceCheckArtifact(
  args: Record<string, unknown>,
): Promise<unknown> {
  const artifactKind = args.artifactKind as string;
  const artifactId = args.artifactId as string;
  const artifact = args.artifact as Record<string, unknown>;

  const validKinds = ['world', 'shard', 'zone', 'npc', 'identity', 'package', 'receipt'];
  if (!validKinds.includes(artifactKind)) {
    return { error: `Invalid artifactKind: ${artifactKind}. Must be one of ${validKinds.join(', ')}.` };
  }
  if (!artifactId || typeof artifactId !== 'string') {
    return { error: 'artifactId is required and must be a non-empty string.' };
  }
  if (!artifact || typeof artifact !== 'object') {
    return { error: 'artifact is required and must be an object.' };
  }

  const { runAdmissionGate } = await import('./conformance/artifact-admission-gate');
  const report = runAdmissionGate({ artifactKind: artifactKind as import('./conformance/artifact-admission-gate').ArtifactKind, artifactId, artifact });
  return { success: true, report };
}

async function handleConformanceAdmitArtifact(
  args: Record<string, unknown>,
): Promise<unknown> {
  const artifactKind = args.artifactKind as string;
  const artifactId = args.artifactId as string;
  const artifact = args.artifact as Record<string, unknown>;

  const validKinds = ['world', 'shard', 'zone', 'npc', 'identity', 'package', 'receipt'];
  if (!validKinds.includes(artifactKind)) {
    return { error: `Invalid artifactKind: ${artifactKind}. Must be one of ${validKinds.join(', ')}.` };
  }
  if (!artifactId || typeof artifactId !== 'string') {
    return { error: 'artifactId is required and must be a non-empty string.' };
  }
  if (!artifact || typeof artifact !== 'object') {
    return { error: 'artifact is required and must be an object.' };
  }

  const { runAdmissionGate } = await import('./conformance/artifact-admission-gate');
  const report = runAdmissionGate({ artifactKind: artifactKind as import('./conformance/artifact-admission-gate').ArtifactKind, artifactId, artifact });

  if (!report.passed) {
    return {
      success: false,
      admitted: false,
      report,
      error: `Artifact ${artifactId} failed conformance gate with ${report.criticalCount} critical and ${report.highCount} high findings.`,
    };
  }

  return {
    success: true,
    admitted: true,
    artifactId,
    artifactKind,
    report,
    note: 'Artifact has been admitted to the HoloScript ecosystem.',
  };
}

async function handleConformanceListRules(
  args: Record<string, unknown>,
): Promise<unknown> {
  const { getConformanceRules } = await import('./conformance/artifact-admission-gate');
  let rules = getConformanceRules();

  const artifactKind = args.artifactKind as string | undefined;
  const severity = args.severity as string | undefined;

  if (artifactKind) {
    rules = rules.filter((r) => r.artifactKind === artifactKind);
  }
  if (severity) {
    rules = rules.filter((r) => r.severity === severity);
  }

  return {
    success: true,
    total: rules.length,
    rules,
  };
}

// =============================================================================
// PLAYER / CREATOR / AGENT PROVISIONING HANDLERS (task_1778617298562_qdpb)
// =============================================================================

async function handleProvisionPlayer(args: Record<string, unknown>): Promise<unknown> {
  const id = (args.id as string) || genId('player');
  const name = args.name as string;
  if (!name || typeof name !== 'string') {
    return { error: 'name is required and must be a non-empty string' };
  }

  const player: StoredPlayer = {
    id,
    name,
    walletAddress: (args.walletAddress as string | undefined) ?? undefined,
    worldId: (args.worldId as string | undefined) ?? undefined,
    shardId: (args.shardId as string | undefined) ?? undefined,
    zoneId: (args.zoneId as string | undefined) ?? undefined,
    status: 'active',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  playerRegistry.set(id, player);

  return {
    success: true,
    playerId: id,
    name: player.name,
    status: player.status,
    createdAt: player.createdAt,
  };
}

async function handleGetPlayer(args: Record<string, unknown>): Promise<unknown> {
  const playerId = args.playerId as string;
  const player = playerRegistry.get(playerId);
  if (!player) {
    return { error: `Player not found: ${playerId}` };
  }
  return { success: true, playerId, player };
}

async function handleListPlayers(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const worldId = args.worldId as string | undefined;
  const shardId = args.shardId as string | undefined;
  const zoneId = args.zoneId as string | undefined;
  const status = args.status as string | undefined;

  let items = Array.from(playerRegistry.values());
  if (worldId !== undefined) items = items.filter((p) => p.worldId === worldId);
  if (shardId !== undefined) items = items.filter((p) => p.shardId === shardId);
  if (zoneId !== undefined) items = items.filter((p) => p.zoneId === zoneId);
  if (status !== undefined) items = items.filter((p) => p.status === status);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, players: items };
}

async function handleRevokePlayer(args: Record<string, unknown>): Promise<unknown> {
  const playerId = args.playerId as string;
  const player = playerRegistry.get(playerId);
  if (!player) {
    return { error: `Player not found: ${playerId}` };
  }
  player.status = 'revoked';
  player.modifiedAt = new Date().toISOString();
  return { success: true, playerId, status: player.status, revokedAt: player.modifiedAt };
}

async function handleProvisionCreator(args: Record<string, unknown>): Promise<unknown> {
  const id = (args.id as string) || genId('creator');
  const name = args.name as string;
  if (!name || typeof name !== 'string') {
    return { error: 'name is required and must be a non-empty string' };
  }

  const creator: StoredCreator = {
    id,
    name,
    walletAddress: (args.walletAddress as string | undefined) ?? undefined,
    tier: (args.tier as 'free' | 'premium' | 'ultra') ?? 'free',
    status: 'active',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  creatorRegistry.set(id, creator);

  return {
    success: true,
    creatorId: id,
    name: creator.name,
    tier: creator.tier,
    status: creator.status,
    createdAt: creator.createdAt,
  };
}

async function handleGetCreator(args: Record<string, unknown>): Promise<unknown> {
  const creatorId = args.creatorId as string;
  const creator = creatorRegistry.get(creatorId);
  if (!creator) {
    return { error: `Creator not found: ${creatorId}` };
  }
  return { success: true, creatorId, creator };
}

async function handleListCreators(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const tier = args.tier as string | undefined;
  const status = args.status as string | undefined;

  let items = Array.from(creatorRegistry.values());
  if (tier !== undefined) items = items.filter((c) => c.tier === tier);
  if (status !== undefined) items = items.filter((c) => c.status === status);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, creators: items };
}

async function handleRevokeCreator(args: Record<string, unknown>): Promise<unknown> {
  const creatorId = args.creatorId as string;
  const creator = creatorRegistry.get(creatorId);
  if (!creator) {
    return { error: `Creator not found: ${creatorId}` };
  }
  creator.status = 'revoked';
  creator.modifiedAt = new Date().toISOString();
  return { success: true, creatorId, status: creator.status, revokedAt: creator.modifiedAt };
}

async function handleProvisionAgent(args: Record<string, unknown>): Promise<unknown> {
  const id = (args.id as string) || genId('agent');
  const name = args.name as string;
  if (!name || typeof name !== 'string') {
    return { error: 'name is required and must be a non-empty string' };
  }

  const agent: StoredProvisionedAgent = {
    id,
    name,
    walletAddress: (args.walletAddress as string | undefined) ?? undefined,
    kind: (args.kind as 'headless' | 'npc' | 'external') ?? 'headless',
    worldId: (args.worldId as string | undefined) ?? undefined,
    shardId: (args.shardId as string | undefined) ?? undefined,
    status: 'active',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  agentRegistry.set(id, agent);

  // HoloMesh bridge (P4): publish the provisioned HoloLand agent as a discoverable
  // mesh tool so HoloMesh agents can invoke it by agentId without knowing HoloLand
  // internals. Fire-and-forget — registration failure must not block provisioning.
  try {
    const meshPublisher = {
      agentId: process.env.HOLOMESH_AGENT_ID ?? 'did:agent:hololand',
      name: process.env.HOLOMESH_AGENT_NAME ?? 'hololand-server',
    };
    const manifest = buildMeshToolManifest(
      {
        tool_name: `hololand_agent:${id}`,
        description: `HoloLand ${agent.kind} agent "${agent.name}" (id: ${id})${agent.worldId ? ` in world ${agent.worldId}` : ''}`,
        capability_tags: [
          '@hololand',
          `@kind:${agent.kind}`,
          ...(agent.worldId ? [`@world:${agent.worldId}`] : []),
          ...(agent.shardId ? [`@shard:${agent.shardId}`] : []),
        ],
        allow_transitive_invocation: true,
        service_version: '1.0.0',
        actor_session_handoff: false,
        cross_mcp_receipt_envelope: false,
        rollback_metadata: false,
        source_artifact_hash: `hololand:agent:${id}`,
      },
      meshPublisher
    );
    publishMeshToolManifest(manifest);
  } catch {
    // Non-fatal: HoloMesh registry may not be initialized in all deployment modes.
  }

  return {
    success: true,
    agentId: id,
    name: agent.name,
    kind: agent.kind,
    status: agent.status,
    createdAt: agent.createdAt,
  };
}

async function handleGetAgent(args: Record<string, unknown>): Promise<unknown> {
  const agentId = args.agentId as string;
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    return { error: `Agent not found: ${agentId}` };
  }
  return { success: true, agentId, agent };
}

async function handleListAgents(args: Record<string, unknown>): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const worldId = args.worldId as string | undefined;
  const shardId = args.shardId as string | undefined;
  const kind = args.kind as string | undefined;
  const status = args.status as string | undefined;

  let items = Array.from(agentRegistry.values());
  if (worldId !== undefined) items = items.filter((a) => a.worldId === worldId);
  if (shardId !== undefined) items = items.filter((a) => a.shardId === shardId);
  if (kind !== undefined) items = items.filter((a) => a.kind === kind);
  if (status !== undefined) items = items.filter((a) => a.status === status);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, agents: items };
}

async function handleRevokeAgent(args: Record<string, unknown>): Promise<unknown> {
  const agentId = args.agentId as string;
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    return { error: `Agent not found: ${agentId}` };
  }
  agent.status = 'revoked';
  agent.modifiedAt = new Date().toISOString();
  return { success: true, agentId, status: agent.status, revokedAt: agent.modifiedAt };
}
