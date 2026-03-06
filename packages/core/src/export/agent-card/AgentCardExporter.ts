/**
 * A2A Agent Card Export Target
 *
 * Maps HoloScript VR trait definitions to Google A2A (Agent-to-Agent) Protocol
 * Agent Card schema. Each HoloScript composition becomes a discoverable agent
 * skill with structured input/output schemas.
 *
 * A2A Agent Card Spec:
 *   - id, name, description, url
 *   - skills[] with inputModes, outputModes
 *   - capabilities (streaming, pushNotifications)
 *   - authentication schemes
 *
 * Top 20 traits mapped as proof-of-concept:
 *   grabbable, throwable, collidable, physics, audio, spatial_audio,
 *   networked, visible, draggable, hoverable, scalable, pointable,
 *   climbable, rideable, equippable, inventory, health, damage,
 *   respawnable, teleportable
 *
 * @module export/agent-card
 * @version 1.0.0
 * @see https://google.github.io/A2A/
 */

import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

// =============================================================================
// A2A AGENT CARD SCHEMA TYPES
// =============================================================================

/**
 * A2A Agent Card - top-level manifest describing an agent's capabilities
 */
export interface AgentCard {
  /** Unique agent identifier (derived from composition name) */
  id: string;

  /** Human-readable agent name */
  name: string;

  /** Agent description */
  description: string;

  /** Agent endpoint URL (configurable) */
  url: string;

  /** Agent provider metadata */
  provider?: AgentProvider;

  /** Protocol version */
  version: string;

  /** Skills exposed by this agent */
  skills: AgentSkill[];

  /** Agent capabilities */
  capabilities: AgentCapabilities;

  /** Authentication requirements */
  authentication?: AgentAuthentication;

  /** Default input modes */
  defaultInputModes: ContentMode[];

  /** Default output modes */
  defaultOutputModes: ContentMode[];

  /** HoloScript-specific metadata extension */
  'x-holoscript': HoloScriptExtension;
}

/**
 * Agent provider information
 */
export interface AgentProvider {
  organization: string;
  url?: string;
  contactEmail?: string;
}

/**
 * A2A Skill - a discrete capability of the agent
 */
export interface AgentSkill {
  /** Skill identifier */
  id: string;

  /** Human-readable skill name */
  name: string;

  /** Skill description */
  description: string;

  /** Tags for discovery */
  tags: string[];

  /** Examples of how to invoke this skill */
  examples?: SkillExample[];

  /** Input schema (JSON Schema) */
  inputSchema?: JsonSchema;

  /** Output schema (JSON Schema) */
  outputSchema?: JsonSchema;

  /** Input content modes */
  inputModes?: ContentMode[];

  /** Output content modes */
  outputModes?: ContentMode[];
}

/**
 * Skill invocation example
 */
export interface SkillExample {
  /** Example name */
  name: string;

  /** Example description */
  description?: string;

  /** Example input */
  input: Record<string, unknown>;

  /** Expected output */
  output?: Record<string, unknown>;
}

/**
 * Simplified JSON Schema for skill I/O
 */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  description?: string;
  enum?: string[];
  default?: unknown;
}

/**
 * Content mode (MIME type based)
 */
export type ContentMode = 'text' | 'image' | 'audio' | 'video' | 'application/json' | 'application/holoscript';

/**
 * Agent capabilities
 */
export interface AgentCapabilities {
  /** Supports streaming responses */
  streaming: boolean;

  /** Supports push notifications */
  pushNotifications: boolean;

  /** Supports state management */
  stateTransitionHistory: boolean;
}

/**
 * Authentication configuration
 */
export interface AgentAuthentication {
  schemes: AuthScheme[];
}

export interface AuthScheme {
  scheme: 'bearer' | 'apiKey' | 'oauth2' | 'holoscript-rbac';
  description?: string;
}

/**
 * HoloScript-specific extension fields
 */
export interface HoloScriptExtension {
  /** Source composition name */
  compositionName: string;

  /** HoloScript version used */
  holoscriptVersion: string;

  /** Trait names mapped in this agent card */
  mappedTraits: string[];

  /** Export timestamp */
  exportedAt: string;

  /** Number of scene objects */
  objectCount: number;

  /** Trait composition expressions */
  compositions: string[];
}

// =============================================================================
// TRAIT-TO-SKILL MAPPING (TOP 20)
// =============================================================================

/**
 * Trait skill mapping definition
 */
interface TraitSkillMapping {
  traitName: string;
  skillId: string;
  skillName: string;
  description: string;
  tags: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  examples: SkillExample[];
}

/**
 * Top 20 VR trait-to-skill mappings
 */
const TRAIT_SKILL_MAPPINGS: TraitSkillMapping[] = [
  {
    traitName: 'grabbable',
    skillId: 'vr-grab',
    skillName: 'VR Object Grab',
    description: 'Enable hand-based grabbing of 3D objects in VR space with configurable grab points and physics response.',
    tags: ['vr', 'interaction', 'hand-tracking', 'grab'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string', description: 'Target object identifier' },
        hand: { type: 'string', enum: ['left', 'right'], description: 'Which hand to grab with' },
        snapToHand: { type: 'boolean', default: true, description: 'Snap object to hand position' },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        grabbed: { type: 'boolean', description: 'Whether grab succeeded' },
        objectId: { type: 'string' },
        grabPoint: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
      },
    },
    examples: [{
      name: 'Grab a cube',
      input: { objectId: 'cube_1', hand: 'right', snapToHand: true },
      output: { grabbed: true, objectId: 'cube_1', grabPoint: { x: 0, y: 1.2, z: -0.3 } },
    }],
  },
  {
    traitName: 'throwable',
    skillId: 'vr-throw',
    skillName: 'VR Object Throw',
    description: 'Release grabbed objects with physics-based throwing using hand velocity tracking.',
    tags: ['vr', 'interaction', 'physics', 'throw'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string', description: 'Object to throw' },
        velocityMultiplier: { type: 'number', default: 1.0, description: 'Throw force multiplier' },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        thrown: { type: 'boolean' },
        velocity: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
      },
    },
    examples: [{
      name: 'Throw a ball',
      input: { objectId: 'ball_1', velocityMultiplier: 1.5 },
      output: { thrown: true, velocity: { x: 2.1, y: 3.0, z: -1.5 } },
    }],
  },
  {
    traitName: 'collidable',
    skillId: 'collision-detect',
    skillName: 'Collision Detection',
    description: 'Configure collision boundaries and respond to collision events between scene objects.',
    tags: ['physics', 'collision', 'boundaries'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        colliderType: { type: 'string', enum: ['box', 'sphere', 'mesh', 'capsule'] },
        isTrigger: { type: 'boolean', default: false },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        configured: { type: 'boolean' },
        colliderBounds: { type: 'object' },
      },
    },
    examples: [{
      name: 'Add box collider',
      input: { objectId: 'wall_1', colliderType: 'box', isTrigger: false },
    }],
  },
  {
    traitName: 'physics',
    skillId: 'physics-sim',
    skillName: 'Physics Simulation',
    description: 'Apply rigid body physics simulation with gravity, mass, and force interactions.',
    tags: ['physics', 'simulation', 'rigidbody', 'gravity'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        mass: { type: 'number', default: 1.0 },
        useGravity: { type: 'boolean', default: true },
        isKinematic: { type: 'boolean', default: false },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        applied: { type: 'boolean' },
        bodyId: { type: 'string' },
      },
    },
    examples: [{
      name: 'Add physics to crate',
      input: { objectId: 'crate_1', mass: 5.0, useGravity: true },
    }],
  },
  {
    traitName: 'audio',
    skillId: 'audio-playback',
    skillName: 'Audio Playback',
    description: 'Attach audio sources to scene objects with playback controls.',
    tags: ['audio', 'sound', 'media'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        source: { type: 'string', description: 'Audio file path or URL' },
        volume: { type: 'number', default: 1.0 },
        loop: { type: 'boolean', default: false },
      },
      required: ['objectId', 'source'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        playing: { type: 'boolean' },
        duration: { type: 'number' },
      },
    },
    examples: [{
      name: 'Play ambient sound',
      input: { objectId: 'speaker_1', source: 'ambient_forest.ogg', volume: 0.7, loop: true },
    }],
  },
  {
    traitName: 'spatial_audio',
    skillId: 'spatial-audio',
    skillName: 'Spatial Audio',
    description: 'Enable 3D positional audio with HRTF, occlusion, and reverb for immersive soundscapes.',
    tags: ['audio', 'spatial', 'hrtf', '3d-sound'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        source: { type: 'string' },
        maxDistance: { type: 'number', default: 50 },
        rolloffFactor: { type: 'number', default: 1.0 },
        hrtfEnabled: { type: 'boolean', default: true },
      },
      required: ['objectId', 'source'],
    },
    outputSchema: {
      type: 'object',
      properties: { configured: { type: 'boolean' }, sourceId: { type: 'string' } },
    },
    examples: [{
      name: 'Spatial bird sounds',
      input: { objectId: 'bird_nest', source: 'birds.ogg', maxDistance: 20, hrtfEnabled: true },
    }],
  },
  {
    traitName: 'networked',
    skillId: 'network-sync',
    skillName: 'Network Synchronization',
    description: 'Synchronize object state across networked multiplayer sessions.',
    tags: ['network', 'multiplayer', 'sync'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        syncTransform: { type: 'boolean', default: true },
        syncInterval: { type: 'number', default: 50, description: 'Sync interval in ms' },
        ownership: { type: 'string', enum: ['host', 'local', 'shared'] },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { synced: { type: 'boolean' }, networkId: { type: 'string' } },
    },
    examples: [{
      name: 'Network a shared whiteboard',
      input: { objectId: 'whiteboard_1', syncTransform: true, ownership: 'shared' },
    }],
  },
  {
    traitName: 'visible',
    skillId: 'visibility-control',
    skillName: 'Visibility Control',
    description: 'Control object visibility with fade transitions and LOD support.',
    tags: ['visual', 'visibility', 'rendering'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        visible: { type: 'boolean', default: true },
        fadeTime: { type: 'number', default: 0, description: 'Fade duration in seconds' },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { visible: { type: 'boolean' } },
    },
    examples: [{
      name: 'Fade out door',
      input: { objectId: 'door_1', visible: false, fadeTime: 0.5 },
    }],
  },
  {
    traitName: 'draggable',
    skillId: 'drag-interact',
    skillName: 'Drag Interaction',
    description: 'Enable drag-to-move interaction with optional axis constraints.',
    tags: ['interaction', 'drag', 'move'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        axes: { type: 'string', enum: ['xyz', 'xy', 'xz', 'yz', 'x', 'y', 'z'], default: 'xyz' },
        bounds: { type: 'object', description: 'Min/max position bounds' },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { dragging: { type: 'boolean' }, position: { type: 'object' } },
    },
    examples: [{
      name: 'Drag slider on X axis',
      input: { objectId: 'slider_handle', axes: 'x' },
    }],
  },
  {
    traitName: 'hoverable',
    skillId: 'hover-feedback',
    skillName: 'Hover Feedback',
    description: 'Provide visual/haptic feedback when user gaze or pointer hovers over an object.',
    tags: ['interaction', 'hover', 'feedback', 'gaze'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        highlightColor: { type: 'string', default: '#ffff00' },
        scaleOnHover: { type: 'number', default: 1.05 },
        hapticPulse: { type: 'boolean', default: true },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { hovering: { type: 'boolean' } },
    },
    examples: [{
      name: 'Highlight button on hover',
      input: { objectId: 'btn_start', highlightColor: '#00ff00', scaleOnHover: 1.1 },
    }],
  },
  {
    traitName: 'scalable',
    skillId: 'scale-transform',
    skillName: 'Scale Transform',
    description: 'Enable pinch-to-scale or programmatic scaling of scene objects.',
    tags: ['interaction', 'scale', 'transform', 'pinch'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        minScale: { type: 'number', default: 0.1 },
        maxScale: { type: 'number', default: 10.0 },
        uniformScale: { type: 'boolean', default: true },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { scale: { type: 'object' } },
    },
    examples: [{
      name: 'Scalable 3D model',
      input: { objectId: 'model_house', minScale: 0.5, maxScale: 3.0 },
    }],
  },
  {
    traitName: 'pointable',
    skillId: 'point-interact',
    skillName: 'Point Interaction',
    description: 'Enable ray-based pointing interaction for distant object selection.',
    tags: ['interaction', 'point', 'ray', 'selection'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        maxDistance: { type: 'number', default: 100 },
        showRay: { type: 'boolean', default: true },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { pointed: { type: 'boolean' }, hitPoint: { type: 'object' } },
    },
    examples: [{
      name: 'Point at distant target',
      input: { objectId: 'target_board', maxDistance: 50, showRay: true },
    }],
  },
  {
    traitName: 'climbable',
    skillId: 'climb-surface',
    skillName: 'Climbable Surface',
    description: 'Designate surfaces that support hand-over-hand climbing locomotion.',
    tags: ['locomotion', 'climbing', 'surface'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        gripStrength: { type: 'number', default: 0.5 },
        climbSpeed: { type: 'number', default: 1.0 },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { climbing: { type: 'boolean' }, height: { type: 'number' } },
    },
    examples: [{
      name: 'Climbable wall',
      input: { objectId: 'rock_wall', gripStrength: 0.8, climbSpeed: 0.7 },
    }],
  },
  {
    traitName: 'rideable',
    skillId: 'ride-mount',
    skillName: 'Rideable Mount',
    description: 'Enable mounting and riding of vehicles or creatures with seat positioning.',
    tags: ['locomotion', 'vehicle', 'mount'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        seatOffset: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
        speed: { type: 'number', default: 5.0 },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { mounted: { type: 'boolean' } },
    },
    examples: [{
      name: 'Mount a horse',
      input: { objectId: 'horse_1', seatOffset: { x: 0, y: 1.5, z: 0 }, speed: 8.0 },
    }],
  },
  {
    traitName: 'equippable',
    skillId: 'equip-item',
    skillName: 'Equippable Item',
    description: 'Allow objects to be equipped to avatar attachment points (hands, back, belt).',
    tags: ['inventory', 'equipment', 'avatar'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        slot: { type: 'string', enum: ['left_hand', 'right_hand', 'back', 'belt', 'head'] },
        attachOffset: { type: 'object' },
      },
      required: ['objectId', 'slot'],
    },
    outputSchema: {
      type: 'object',
      properties: { equipped: { type: 'boolean' }, slot: { type: 'string' } },
    },
    examples: [{
      name: 'Equip sword to hand',
      input: { objectId: 'sword_1', slot: 'right_hand' },
    }],
  },
  {
    traitName: 'inventory',
    skillId: 'inventory-manage',
    skillName: 'Inventory Management',
    description: 'Manage collections of items with capacity limits, categories, and stacking.',
    tags: ['inventory', 'items', 'collection'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string', description: 'Container or player ID' },
        action: { type: 'string', enum: ['add', 'remove', 'move', 'list'] },
        itemId: { type: 'string' },
        quantity: { type: 'number', default: 1 },
      },
      required: ['objectId', 'action'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        items: { type: 'array', items: { type: 'object' } },
        capacity: { type: 'object', properties: { used: { type: 'number' }, max: { type: 'number' } } },
      },
    },
    examples: [{
      name: 'Add potion to inventory',
      input: { objectId: 'player_1', action: 'add', itemId: 'health_potion', quantity: 3 },
    }],
  },
  {
    traitName: 'health',
    skillId: 'health-system',
    skillName: 'Health System',
    description: 'Attach health points with damage, healing, and death/respawn lifecycle.',
    tags: ['game', 'health', 'combat', 'lifecycle'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        maxHealth: { type: 'number', default: 100 },
        currentHealth: { type: 'number' },
        armor: { type: 'number', default: 0 },
        invincibilityTime: { type: 'number', default: 0 },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        health: { type: 'number' },
        maxHealth: { type: 'number' },
        alive: { type: 'boolean' },
      },
    },
    examples: [{
      name: 'Set up boss health',
      input: { objectId: 'boss_dragon', maxHealth: 5000, armor: 50 },
    }],
  },
  {
    traitName: 'damage',
    skillId: 'damage-deal',
    skillName: 'Damage Dealer',
    description: 'Configure objects to deal damage on contact or interaction with damage types.',
    tags: ['game', 'combat', 'damage'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        baseDamage: { type: 'number', default: 10 },
        damageType: { type: 'string', enum: ['physical', 'fire', 'ice', 'electric', 'poison'] },
        cooldown: { type: 'number', default: 0 },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: { damageDealt: { type: 'number' }, targetId: { type: 'string' } },
    },
    examples: [{
      name: 'Fire sword damage',
      input: { objectId: 'fire_sword', baseDamage: 25, damageType: 'fire' },
    }],
  },
  {
    traitName: 'respawnable',
    skillId: 'respawn-config',
    skillName: 'Respawn Configuration',
    description: 'Configure respawn behavior for objects or players after destruction/death.',
    tags: ['game', 'respawn', 'lifecycle'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        respawnDelay: { type: 'number', default: 5.0, description: 'Delay in seconds' },
        respawnPoint: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
        maxRespawns: { type: 'number', default: -1, description: '-1 for unlimited' },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        respawnCount: { type: 'number' },
        nextRespawnAt: { type: 'number' },
      },
    },
    examples: [{
      name: 'Player respawn',
      input: { objectId: 'player_1', respawnDelay: 3.0, respawnPoint: { x: 0, y: 1, z: 0 } },
    }],
  },
  {
    traitName: 'teleportable',
    skillId: 'teleport-locomotion',
    skillName: 'Teleport Locomotion',
    description: 'Enable point-and-teleport locomotion with arc trajectory visualization.',
    tags: ['locomotion', 'teleport', 'movement', 'vr'],
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        maxDistance: { type: 'number', default: 20 },
        showArc: { type: 'boolean', default: true },
        fadeTime: { type: 'number', default: 0.2, description: 'Transition fade time in seconds' },
        validSurfaces: { type: 'array', items: { type: 'string' }, description: 'Surface tags that allow teleport' },
      },
      required: ['objectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        teleported: { type: 'boolean' },
        destination: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
      },
    },
    examples: [{
      name: 'Teleport to platform',
      input: { objectId: 'player_1', maxDistance: 15, showArc: true, validSurfaces: ['floor', 'platform'] },
    }],
  },
];

/**
 * Lookup map for quick trait-to-skill resolution
 */
const TRAIT_SKILL_MAP = new Map<string, TraitSkillMapping>(
  TRAIT_SKILL_MAPPINGS.map(m => [m.traitName, m])
);

// =============================================================================
// AGENT CARD EXPORTER
// =============================================================================

/**
 * Export options for Agent Card generation
 */
export interface AgentCardExportOptions {
  /** Base URL for the agent endpoint */
  baseUrl?: string;

  /** Agent provider info */
  provider?: AgentProvider;

  /** Include authentication configuration */
  authentication?: AgentAuthentication;

  /** Include only specified traits (default: all detected) */
  traitFilter?: string[];

  /** Enable streaming capability */
  streaming?: boolean;

  /** Enable push notifications capability */
  pushNotifications?: boolean;

  /** Pretty-print JSON output */
  prettyPrint?: boolean;

  /** HoloScript version */
  holoscriptVersion?: string;
}

/**
 * Export result
 */
export interface AgentCardExportResult {
  /** Agent Card JSON string */
  json: string;

  /** Parsed Agent Card object */
  card: AgentCard;

  /** Export statistics */
  stats: {
    totalTraitsDetected: number;
    totalSkillsMapped: number;
    unmappedTraits: string[];
    objectCount: number;
    exportTime: number;
  };
}

/**
 * Agent Card Exporter
 *
 * Converts HoloScript compositions into A2A Agent Card manifests.
 * Each trait attached to objects in the composition becomes a discoverable
 * agent skill with typed input/output schemas.
 */
export class AgentCardExporter {
  private options: Required<AgentCardExportOptions>;

  constructor(options: AgentCardExportOptions = {}) {
    this.options = {
      baseUrl: options.baseUrl ?? 'https://holoscript.dev/agents',
      provider: options.provider ?? {
        organization: 'HoloScript',
        url: 'https://holoscript.dev',
      },
      authentication: options.authentication ?? {
        schemes: [{ scheme: 'holoscript-rbac', description: 'HoloScript Agent RBAC JWT token' }],
      },
      traitFilter: options.traitFilter ?? [],
      streaming: options.streaming ?? false,
      pushNotifications: options.pushNotifications ?? false,
      prettyPrint: options.prettyPrint ?? true,
      holoscriptVersion: options.holoscriptVersion ?? '4.1.0',
    };
  }

  /**
   * Export a HoloScript composition as an A2A Agent Card
   */
  export(composition: HoloComposition): AgentCardExportResult {
    const startTime = Date.now();

    // Step 1: Detect all traits used in the composition
    const detectedTraits = this.detectTraits(composition);

    // Step 2: Apply trait filter if specified
    const filteredTraits = this.options.traitFilter.length > 0
      ? detectedTraits.filter(t => this.options.traitFilter.includes(t))
      : detectedTraits;

    // Step 3: Map traits to skills
    const skills: AgentSkill[] = [];
    const unmappedTraits: string[] = [];

    for (const traitName of filteredTraits) {
      const mapping = TRAIT_SKILL_MAP.get(traitName);
      if (mapping) {
        skills.push({
          id: mapping.skillId,
          name: mapping.skillName,
          description: mapping.description,
          tags: mapping.tags,
          examples: mapping.examples,
          inputSchema: mapping.inputSchema,
          outputSchema: mapping.outputSchema,
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        });
      } else {
        unmappedTraits.push(traitName);
        // Generate a generic skill entry for unmapped traits
        skills.push(this.generateGenericSkill(traitName));
      }
    }

    // Step 4: Detect composition expressions
    const compositions: string[] = [];
    if (composition.traitDefinitions) {
      for (const td of composition.traitDefinitions) {
        if (td.name) {
          compositions.push(td.name);
        }
      }
    }

    // Step 5: Build the Agent Card
    const compositionName = composition.name || 'untitled';
    const agentId = `holoscript-agent-${compositionName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const objectCount = (composition.objects?.length ?? 0) + (composition.spatialGroups?.length ?? 0);

    const card: AgentCard = {
      id: agentId,
      name: `HoloScript: ${compositionName}`,
      description: `A2A Agent Card for HoloScript composition "${compositionName}" with ${skills.length} discoverable VR/spatial skills.`,
      url: `${this.options.baseUrl}/${agentId}`,
      provider: this.options.provider,
      version: '1.0.0',
      skills,
      capabilities: {
        streaming: this.options.streaming,
        pushNotifications: this.options.pushNotifications,
        stateTransitionHistory: true,
      },
      authentication: this.options.authentication,
      defaultInputModes: ['application/json', 'text'],
      defaultOutputModes: ['application/json'],
      'x-holoscript': {
        compositionName,
        holoscriptVersion: this.options.holoscriptVersion,
        mappedTraits: filteredTraits,
        exportedAt: new Date().toISOString(),
        objectCount,
        compositions,
      },
    };

    const exportTime = Date.now() - startTime;
    const json = JSON.stringify(card, null, this.options.prettyPrint ? 2 : undefined);

    return {
      json,
      card,
      stats: {
        totalTraitsDetected: detectedTraits.length,
        totalSkillsMapped: skills.length,
        unmappedTraits,
        objectCount,
        exportTime,
      },
    };
  }

  /**
   * Get list of supported (mapped) trait names
   */
  getSupportedTraits(): string[] {
    return TRAIT_SKILL_MAPPINGS.map(m => m.traitName);
  }

  /**
   * Check if a specific trait has an A2A skill mapping
   */
  hasMapping(traitName: string): boolean {
    return TRAIT_SKILL_MAP.has(traitName);
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Detect all trait names used in a composition
   */
  private detectTraits(composition: HoloComposition): string[] {
    const traits = new Set<string>();

    // Scan objects for trait usage
    for (const obj of composition.objects ?? []) {
      this.collectObjectTraits(obj, traits);
    }

    // Scan templates for trait definitions
    for (const template of composition.templates ?? []) {
      if (template.traits) {
        for (const trait of template.traits) {
          if (typeof trait === 'string') {
            traits.add(trait.replace(/^@/, ''));
          } else if (trait && typeof trait === 'object' && 'name' in trait) {
            traits.add(String((trait as any).name).replace(/^@/, ''));
          }
        }
      }
    }

    // Scan trait definitions
    if (composition.traitDefinitions) {
      for (const td of composition.traitDefinitions) {
        if (td.name) {
          traits.add(td.name.replace(/^@/, ''));
        }
      }
    }

    return Array.from(traits).sort();
  }

  /**
   * Collect trait names from an object declaration
   */
  private collectObjectTraits(obj: HoloObjectDecl, traits: Set<string>): void {
    if (obj.traits) {
      for (const trait of obj.traits) {
        if (typeof trait === 'string') {
          traits.add(trait.replace(/^@/, ''));
        } else if (trait && typeof trait === 'object' && 'name' in trait) {
          traits.add(String((trait as any).name).replace(/^@/, ''));
        }
      }
    }
  }

  /**
   * Generate a generic skill entry for unmapped traits
   */
  private generateGenericSkill(traitName: string): AgentSkill {
    const displayName = traitName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    return {
      id: `holoscript-${traitName.replace(/_/g, '-')}`,
      name: displayName,
      description: `HoloScript VR trait: @${traitName}. Configure this trait on scene objects.`,
      tags: ['holoscript', 'vr-trait', traitName],
      inputSchema: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'Target object identifier' },
          config: { type: 'object', description: `Configuration for @${traitName} trait` },
        },
        required: ['objectId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          applied: { type: 'boolean' },
          traitName: { type: 'string' },
        },
      },
    };
  }
}
