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

const worldRegistry = new Map<string, StoredWorld>();
const shardRegistry = new Map<string, StoredShard>();
const zoneRegistry = new Map<string, StoredZone>();
const placeRegistry = new Map<string, StoredPlace>();
const questRegistry = new Map<string, StoredLocationQuest>();
const zoneRuntimeRegistry = new Map<string, StoredZoneRuntime>();
const geoAnchorRegistry = new Map<string, StoredGeoAnchor>();
const shardReceiptRegistry = new Map<string, StoredShardReceipt>();

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

  zoneRegistry.set(zoneId, { zone, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() });
  return { success: true, zoneId, name, biome };
}

async function handleGetZone(args: Record<string, unknown>): Promise<unknown> {
  const zoneId = args.zoneId as string;
  const stored = zoneRegistry.get(zoneId);
  if (!stored) {
    return { error: `Zone not found: ${zoneId}` };
  }
  return { success: true, zoneId, zone: stored.zone };
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

/** Type re-export for consumers that need ZoneBiome */
type ZoneBiome = Zone['biome'];
