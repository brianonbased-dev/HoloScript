/**
 * @holoscript/core World Definition Schema
 *
 * Comprehensive schema for defining HoloScript worlds that integrate
 * with the Hololand runtime. Supports spatial hierarchies, asset references,
 * networking, and cross-platform deployment.
 */

// ============================================================================
// World Metadata
// ============================================================================

export interface WorldMetadata {
  /** Unique world identifier */
  id: string;

  /** World name */
  name: string;

  /** Display name */
  displayName: string;

  /** World description */
  description?: string;

  /** World version */
  version: string;

  /** Author/creator */
  author?: string;

  /** License */
  license?: string;

  /** Tags for discovery */
  tags: string[];

  /** Thumbnail URL */
  thumbnailUrl?: string;

  /** Preview images */
  previewImages: string[];

  /** Target platforms */
  platforms: WorldPlatform[];

  /** Age rating */
  ageRating?: 'everyone' | 'teen' | 'mature';

  /** World category */
  category: WorldCategory;

  /** Creation timestamp */
  createdAt: string;

  /** Last modified timestamp */
  modifiedAt: string;

  /** Publication status */
  status: 'draft' | 'published' | 'archived';

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

export type WorldPlatform =
  | 'web'
  | 'mobile'
  | 'quest'
  | 'visionos'
  | 'androidxr'
  | 'steamvr'
  | 'desktop';

export type WorldCategory =
  | 'game'
  | 'social'
  | 'education'
  | 'entertainment'
  | 'productivity'
  | 'art'
  | 'experience'
  | 'simulation'
  | 'utility';

// ============================================================================
// World Configuration
// ============================================================================

export interface WorldConfig {
  /** Maximum concurrent users */
  maxUsers: number;

  /** World bounds (spatial limits) */
  bounds: WorldBounds;

  /** Physics configuration */
  physics: PhysicsConfig;

  /** Rendering configuration */
  rendering: RenderingConfig;

  /** Audio configuration */
  audio: AudioConfig;

  /** Networking configuration */
  networking: NetworkingConfig;

  /** Performance budgets */
  performance: PerformanceBudgets;

  /** Accessibility settings */
  accessibility: AccessibilityConfig;
}

export interface WorldBounds {
  /** Minimum X coordinate */
  minX: number;
  /** Maximum X coordinate */
  maxX: number;
  /** Minimum Y coordinate */
  minY: number;
  /** Maximum Y coordinate */
  maxY: number;
  /** Minimum Z coordinate */
  minZ: number;
  /** Maximum Z coordinate */
  maxZ: number;
  /** Wrap-around at boundaries? */
  wrap: boolean;
  /** Out-of-bounds behavior */
  outOfBoundsAction: 'teleport' | 'block' | 'push' | 'kill';
}

export interface PhysicsConfig {
  /** Physics engine */
  engine: 'rapier' | 'cannon' | 'physx' | 'custom';
  /** Gravity vector */
  gravity: { x: number; y: number; z: number };
  /** Fixed timestep (seconds) */
  fixedTimestep: number;
  /** Max substeps per frame */
  maxSubsteps: number;
  /** Collision detection mode */
  collisionDetection: 'discrete' | 'continuous' | 'ccd';
  /** Sleep threshold */
  sleepThreshold: number;
}

export interface RenderingConfig {
  /** Target frame rate */
  targetFPS: number;
  /** Enable shadows */
  shadows: boolean;
  /** Shadow quality */
  shadowQuality: 'off' | 'low' | 'medium' | 'high' | 'ultra';
  /** Anti-aliasing */
  antiAliasing: 'none' | 'fxaa' | 'smaa' | 'msaa';
  /** MSAA samples (if using MSAA) */
  msaaSamples: number;
  /** Enable bloom */
  bloom: boolean;
  /** Enable ambient occlusion */
  ambientOcclusion: boolean;
  /** AO quality */
  aoQuality: 'off' | 'low' | 'medium' | 'high';
  /** Tone mapping */
  toneMapping: 'linear' | 'reinhard' | 'aces' | 'filmic';
  /** Exposure */
  exposure: number;
  /** Enable fog */
  fog: boolean;
  /** Fog settings */
  fogSettings?: {
    type: 'linear' | 'exponential' | 'exponential2';
    color: string;
    near: number;
    far: number;
    density: number;
  };
}

export interface AudioConfig {
  /** Master volume (0-1) */
  masterVolume: number;
  /** Enable spatial audio */
  spatialAudio: boolean;
  /** HRTF profile */
  hrtfProfile: 'default' | 'small' | 'medium' | 'large';
  /** Reverb preset */
  reverbPreset: 'none' | 'room' | 'hall' | 'cave' | 'outdoor';
  /** Max audio sources */
  maxSources: number;
  /** Distance model */
  distanceModel: 'linear' | 'inverse' | 'exponential';
  /** Rolloff factor */
  rolloffFactor: number;
}

export interface NetworkingConfig {
  /** Server region */
  region: string;
  /** Tick rate (updates per second) */
  tickRate: number;
  /** Interpolation delay (ms) */
  interpolationDelay: number;
  /** Enable prediction */
  prediction: boolean;
  /** Network protocol */
  protocol: 'websocket' | 'webrtc' | 'webtransport';
  /** Compression */
  compression: 'none' | 'gzip' | 'lz4' | 'zstd';
  /** State sync strategy */
  syncStrategy: 'full' | 'delta' | 'interest';
  /** Interest management radius */
  interestRadius: number;
}

export interface PerformanceBudgets {
  /** Max draw calls per frame */
  maxDrawCalls: number;
  /** Max triangles per frame */
  maxTriangles: number;
  /** Max texture memory (MB) */
  maxTextureMemory: number;
  /** Max audio sources */
  maxAudioSources: number;
  /** Max physics bodies */
  maxPhysicsBodies: number;
  /** Max networked entities */
  maxNetworkedEntities: number;
  /** CPU frame budget (ms) */
  cpuBudgetMs: number;
}

export interface AccessibilityConfig {
  /** Enable subtitles */
  subtitles: boolean;
  /** Enable audio descriptions */
  audioDescriptions: boolean;
  /** Colorblind mode */
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  /** Reduce motion */
  reduceMotion: boolean;
  /** High contrast mode */
  highContrast: boolean;
  /** Screen reader support */
  screenReader: boolean;
  /** Haptic feedback intensity */
  hapticIntensity: number;
}

// ============================================================================
// World Environment
// ============================================================================

export interface WorldEnvironment {
  /** Skybox configuration */
  skybox: SkyboxConfig;

  /** Ambient lighting */
  ambientLight: AmbientLightConfig;

  /** Directional lights (sun, moon) */
  directionalLights: DirectionalLightConfig[];

  /** Environment map for reflections */
  environmentMap?: string;

  /** Time of day system */
  timeOfDay?: TimeOfDayConfig;

  /** Weather system */
  weather?: WeatherConfig;

  /** Post-processing effects */
  postProcessing: PostProcessingConfig;
}

export interface SkyboxConfig {
  /** Skybox type */
  type: 'color' | 'cubemap' | 'hdri' | 'procedural';
  /** Background color (for 'color' type) */
  color?: string;
  /** Texture path (for cubemap/hdri) */
  texture?: string;
  /** Procedural sky settings */
  procedural?: {
    turbidity: number;
    rayleigh: number;
    mieCoefficient: number;
    mieDirectionalG: number;
    sunPosition: { x: number; y: number; z: number };
  };
}

export interface AmbientLightConfig {
  /** Light color */
  color: string;
  /** Intensity (0-1) */
  intensity: number;
  /** Ground color (for hemisphere lighting) */
  groundColor?: string;
}

export interface DirectionalLightConfig {
  /** Light identifier */
  id: string;
  /** Light color */
  color: string;
  /** Intensity */
  intensity: number;
  /** Direction vector */
  direction: { x: number; y: number; z: number };
  /** Cast shadows? */
  castShadow: boolean;
  /** Shadow map size */
  shadowMapSize: number;
  /** Shadow bias */
  shadowBias: number;
}

export interface TimeOfDayConfig {
  /** Enable time progression */
  enabled: boolean;
  /** Current time (0-24 hours) */
  currentTime: number;
  /** Time scale (1 = real-time) */
  timeScale: number;
  /** Sunrise hour */
  sunriseHour: number;
  /** Sunset hour */
  sunsetHour: number;
}

export interface WeatherConfig {
  /** Current weather type */
  type: 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm';
  /** Weather intensity (0-1) */
  intensity: number;
  /** Wind direction */
  windDirection: { x: number; y: number; z: number };
  /** Wind speed */
  windSpeed: number;
  /** Enable weather transitions */
  transitions: boolean;
}

export interface PostProcessingConfig {
  /** Enable post-processing */
  enabled: boolean;
  /** Effects chain */
  effects: PostProcessingEffect[];
}

export interface PostProcessingEffect {
  /** Effect type */
  type: 'bloom' | 'dof' | 'motionBlur' | 'vignette' | 'chromaticAberration' | 'colorGrading';
  /** Effect enabled */
  enabled: boolean;
  /** Effect parameters */
  params: Record<string, unknown>;
}

// ============================================================================
// World Zones
// ============================================================================

export interface WorldZone {
  /** Zone identifier */
  id: string;

  /** Zone name */
  name: string;

  /** Zone bounds */
  bounds: {
    type: 'box' | 'sphere' | 'cylinder' | 'polygon';
    center: { x: number; y: number; z: number };
    size?: { x: number; y: number; z: number };
    radius?: number;
    height?: number;
    points?: { x: number; z: number }[];
  };

  /** Zone priority (for overlapping zones) */
  priority: number;

  /** Environment overrides */
  environment?: Partial<WorldEnvironment>;

  /** Audio overrides */
  audio?: {
    backgroundMusic?: string;
    ambientSounds?: string[];
    reverbPreset?: string;
  };

  /** Physics overrides */
  physics?: Partial<PhysicsConfig>;

  /** Zone triggers */
  triggers: ZoneTrigger[];

  /** Zone tags */
  tags: string[];
}

export interface ZoneTrigger {
  /** Trigger type */
  type: 'enter' | 'exit' | 'stay';
  /** Action to perform */
  action: string;
  /** Action parameters */
  params: Record<string, unknown>;
  /** Cooldown (seconds) */
  cooldown: number;
  /** Filter (e.g., 'player', 'npc', 'all') */
  filter: string;
}

// ============================================================================
// World Spawn Points
// ============================================================================

export interface SpawnPoint {
  /** Spawn point identifier */
  id: string;

  /** Spawn point name */
  name: string;

  /** Position */
  position: { x: number; y: number; z: number };

  /** Rotation (euler angles) */
  rotation: { x: number; y: number; z: number };

  /** Spawn point type */
  type: 'default' | 'respawn' | 'portal' | 'event';

  /** Priority (for default spawns) */
  priority: number;

  /** Maximum capacity */
  capacity: number;

  /** Current occupancy (runtime) */
  occupancy?: number;

  /** Spawn conditions */
  conditions?: {
    platform?: WorldPlatform[];
    timeRange?: { start: number; end: number };
    permission?: string;
  };

  /** Tags */
  tags: string[];
}

// ============================================================================
// World Definition
// ============================================================================

export interface WorldDefinition {
  /** Schema version */
  schemaVersion: string;

  /** World metadata */
  metadata: WorldMetadata;

  /** World configuration */
  config: WorldConfig;

  /** Environment settings */
  environment: WorldEnvironment;

  /** World zones */
  zones: WorldZone[];

  /** Spawn points */
  spawnPoints: SpawnPoint[];

  /** Asset manifest reference */
  assetManifest: string;

  /** Entity prefabs */
  prefabs: string[];

  /** Scene hierarchy (entity tree) */
  sceneGraph: SceneNode;

  /** World scripts */
  scripts: WorldScript[];

  /** Event definitions */
  events: WorldEvent[];

  /** LOD configuration */
  lod: WorldLODConfig;
}

export interface SceneNode {
  /** Node identifier */
  id: string;

  /** Node name */
  name: string;

  /** Node type */
  type: 'entity' | 'group' | 'light' | 'camera' | 'trigger' | 'audio';

  /** Transform */
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };

  /** Entity/prefab reference (for 'entity' type) */
  entityRef?: string;

  /** Components */
  components: Record<string, unknown>[];

  /** Child nodes */
  children: SceneNode[];

  /** Is node active? */
  active: boolean;

  /** Tags */
  tags: string[];

  /** Visibility layers */
  layers: number;
}

export interface WorldScript {
  /** Script identifier */
  id: string;

  /** Script path */
  path: string;

  /** Script type */
  type: 'holoscript' | 'typescript' | 'wasm';

  /** Entry point */
  entryPoint: string;

  /** Script priority */
  priority: number;

  /** Execution context */
  context: 'server' | 'client' | 'shared';
}

export interface WorldEvent {
  /** Event identifier */
  id: string;

  /** Event name */
  name: string;

  /** Event type */
  type: 'scheduled' | 'triggered' | 'periodic';

  /** Event configuration */
  config: Record<string, unknown>;

  /** Event actions */
  actions: WorldEventAction[];
}

export interface WorldEventAction {
  /** Action type */
  type: 'spawn' | 'despawn' | 'transform' | 'script' | 'audio' | 'vfx';

  /** Target entity/zone */
  target: string;

  /** Action parameters */
  params: Record<string, unknown>;

  /** Delay (seconds) */
  delay: number;
}

export interface WorldLODConfig {
  /** Enable world LOD */
  enabled: boolean;

  /** LOD distances */
  distances: number[];

  /** Streaming chunk size (meters) */
  chunkSize: number;

  /** Max loaded chunks */
  maxLoadedChunks: number;

  /** Chunk unload delay (seconds) */
  unloadDelay: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create default world metadata
 */
export function createWorldMetadata(
  id: string,
  name: string,
  options: Partial<Omit<WorldMetadata, 'id' | 'name'>> = {}
): WorldMetadata {
  return {
    id,
    name,
    displayName: options.displayName ?? name,
    description: options.description,
    version: options.version ?? '1.0.0',
    author: options.author,
    license: options.license,
    tags: options.tags ?? [],
    thumbnailUrl: options.thumbnailUrl,
    previewImages: options.previewImages ?? [],
    platforms: options.platforms ?? ['web'],
    ageRating: options.ageRating ?? 'everyone',
    category: options.category ?? 'experience',
    createdAt: options.createdAt ?? new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    status: options.status ?? 'draft',
    metadata: options.metadata ?? {},
  };
}

/**
 * Create default world configuration
 */
export function createWorldConfig(options: Partial<WorldConfig> = {}): WorldConfig {
  return {
    maxUsers: options.maxUsers ?? 50,
    bounds: options.bounds ?? {
      minX: -1000,
      maxX: 1000,
      minY: -100,
      maxY: 500,
      minZ: -1000,
      maxZ: 1000,
      wrap: false,
      outOfBoundsAction: 'teleport',
    },
    physics: options.physics ?? {
      engine: 'rapier',
      gravity: { x: 0, y: -9.81, z: 0 },
      fixedTimestep: 1 / 60,
      maxSubsteps: 4,
      collisionDetection: 'continuous',
      sleepThreshold: 0.01,
    },
    rendering: options.rendering ?? {
      targetFPS: 72,
      shadows: true,
      shadowQuality: 'medium',
      antiAliasing: 'fxaa',
      msaaSamples: 4,
      bloom: true,
      ambientOcclusion: true,
      aoQuality: 'medium',
      toneMapping: 'aces',
      exposure: 1.0,
      fog: false,
    },
    audio: options.audio ?? {
      masterVolume: 1.0,
      spatialAudio: true,
      hrtfProfile: 'default',
      reverbPreset: 'room',
      maxSources: 32,
      distanceModel: 'inverse',
      rolloffFactor: 1.0,
    },
    networking: options.networking ?? {
      region: 'auto',
      tickRate: 20,
      interpolationDelay: 100,
      prediction: true,
      protocol: 'websocket',
      compression: 'lz4',
      syncStrategy: 'delta',
      interestRadius: 100,
    },
    performance: options.performance ?? {
      maxDrawCalls: 1000,
      maxTriangles: 2000000,
      maxTextureMemory: 512,
      maxAudioSources: 32,
      maxPhysicsBodies: 1000,
      maxNetworkedEntities: 500,
      cpuBudgetMs: 11,
    },
    accessibility: options.accessibility ?? {
      subtitles: true,
      audioDescriptions: false,
      colorblindMode: 'none',
      reduceMotion: false,
      highContrast: false,
      screenReader: true,
      hapticIntensity: 1.0,
    },
  };
}

/**
 * Create default environment
 */
export function createWorldEnvironment(options: Partial<WorldEnvironment> = {}): WorldEnvironment {
  return {
    skybox: options.skybox ?? {
      type: 'procedural',
      procedural: {
        turbidity: 10,
        rayleigh: 2,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.8,
        sunPosition: { x: 0, y: 1, z: 0 },
      },
    },
    ambientLight: options.ambientLight ?? {
      color: '#ffffff',
      intensity: 0.4,
      groundColor: '#444444',
    },
    directionalLights: options.directionalLights ?? [
      {
        id: 'sun',
        color: '#fffaf0',
        intensity: 1.0,
        direction: { x: -0.5, y: -1, z: -0.5 },
        castShadow: true,
        shadowMapSize: 2048,
        shadowBias: -0.0001,
      },
    ],
    environmentMap: options.environmentMap,
    timeOfDay: options.timeOfDay,
    weather: options.weather,
    postProcessing: options.postProcessing ?? {
      enabled: true,
      effects: [],
    },
  };
}

/**
 * Create an empty world definition
 */
export function createWorldDefinition(
  id: string,
  name: string,
  options: Partial<
    Omit<WorldDefinition, 'schemaVersion' | 'metadata' | 'config' | 'environment'>
  > = {}
): WorldDefinition {
  return {
    schemaVersion: '1.0.0',
    metadata: createWorldMetadata(id, name),
    config: createWorldConfig(),
    environment: createWorldEnvironment(),
    zones: options.zones ?? [],
    spawnPoints: options.spawnPoints ?? [
      {
        id: 'default-spawn',
        name: 'Default Spawn',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        type: 'default',
        priority: 10,
        capacity: 100,
        tags: ['default'],
      },
    ],
    assetManifest: options.assetManifest ?? '',
    prefabs: options.prefabs ?? [],
    sceneGraph: options.sceneGraph ?? {
      id: 'root',
      name: 'Root',
      type: 'group',
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      components: [],
      children: [],
      active: true,
      tags: [],
      layers: 1,
    },
    scripts: options.scripts ?? [],
    events: options.events ?? [],
    lod: options.lod ?? {
      enabled: true,
      distances: [25, 50, 100, 200],
      chunkSize: 64,
      maxLoadedChunks: 9,
      unloadDelay: 5,
    },
  };
}
