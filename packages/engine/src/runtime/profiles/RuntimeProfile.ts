/**
 * Runtime Profile Configuration
 *
 * Defines different runtime profiles for various deployment scenarios:
 * - headless: Server-side execution without rendering (IoT, edge, testing)
 * - minimal: Lightweight runtime with basic rendering
 * - standard: Full runtime with all features
 * - vr: Extended runtime with VR/XR support
 *
 * @version 1.0.0
 */

// =============================================================================
// PROFILE TYPES
// =============================================================================

export type RuntimeProfileName = 'headless' | 'minimal' | 'standard' | 'vr';

export interface RenderingConfig {
  /** Enable visual rendering */
  enabled: boolean;
  /** Max FPS (0 = unlimited) */
  maxFps?: number;
  /** Enable shadows */
  shadows?: boolean;
  /** Enable post-processing */
  postProcessing?: boolean;
  /** Renderer type */
  renderer?: 'webgl' | 'webgpu' | 'canvas2d' | 'none';
}

export interface PhysicsConfig {
  /** Enable physics simulation */
  enabled: boolean;
  /** Physics engine to use */
  engine?: 'simple' | 'rapier' | 'cannon' | 'none';
  /** Physics tick rate in Hz */
  tickRate?: number;
  /** Gravity vector [x, y, z] */
  gravity?: [number, number, number];
}

export interface AudioConfig {
  /** Enable audio system */
  enabled: boolean;
  /** Enable spatial audio */
  spatial?: boolean;
  /** Max simultaneous sounds */
  maxSounds?: number;
}

export interface NetworkConfig {
  /** Enable networking */
  enabled: boolean;
  /** Enable state sync */
  stateSync?: boolean;
  /** Sync interval in ms */
  syncInterval?: number;
  /** Enable WebRTC for P2P */
  webrtc?: boolean;
}

export interface InputConfig {
  /** Enable input handling */
  enabled: boolean;
  /** Enable keyboard input */
  keyboard?: boolean;
  /** Enable mouse input */
  mouse?: boolean;
  /** Enable touch input */
  touch?: boolean;
  /** Enable gamepad input */
  gamepad?: boolean;
  /** Enable VR controller input */
  vrControllers?: boolean;
}

export interface ProtocolConfig {
  /** Enable MQTT protocol */
  mqtt?: boolean;
  /** Enable WebSocket protocol */
  websocket?: boolean;
  /** Enable HTTP REST protocol */
  http?: boolean;
  /** Enable CoAP protocol (IoT) */
  coap?: boolean;
}

export interface RuntimeProfile {
  /** Profile name */
  name: RuntimeProfileName;
  /** Profile description */
  description: string;
  /** Rendering configuration */
  rendering: RenderingConfig;
  /** Physics configuration */
  physics: PhysicsConfig;
  /** Audio configuration */
  audio: AudioConfig;
  /** Network configuration */
  network: NetworkConfig;
  /** Input configuration */
  input: InputConfig;
  /** Protocol bindings configuration */
  protocols: ProtocolConfig;
  /** Enable lifecycle hooks */
  lifecycleHooks: boolean;
  /** Enable state management */
  stateManagement: boolean;
  /** Enable event system */
  events: boolean;
  /** Enable trait system */
  traits: boolean;
  /** Target memory budget in MB (0 = unlimited) */
  memoryBudget: number;
  /** Startup timeout in ms */
  startupTimeout: number;
}

// =============================================================================
// PREDEFINED PROFILES
// =============================================================================

/**
 * Headless profile for server-side execution
 * - No rendering, audio, or input
 * - State management, events, traits enabled
 * - IoT protocols enabled
 * - Memory budget: 50MB
 * - Startup time: <500ms
 */
export const HEADLESS_PROFILE: RuntimeProfile = {
  name: 'headless',
  description:
    'Server-side execution without rendering. Ideal for IoT, edge computing, and testing.',
  rendering: {
    enabled: false,
    renderer: 'none',
  },
  physics: {
    enabled: false,
    engine: 'none',
  },
  audio: {
    enabled: false,
  },
  network: {
    enabled: true,
    stateSync: true,
    syncInterval: 100,
    webrtc: false,
  },
  input: {
    enabled: false,
  },
  protocols: {
    mqtt: true,
    websocket: true,
    http: true,
    coap: true,
  },
  lifecycleHooks: true,
  stateManagement: true,
  events: true,
  traits: true,
  memoryBudget: 50,
  startupTimeout: 500,
};

/**
 * Minimal profile for lightweight browser execution
 * - Basic 2D rendering
 * - Simple physics
 * - Limited audio
 */
export const MINIMAL_PROFILE: RuntimeProfile = {
  name: 'minimal',
  description: 'Lightweight runtime for basic 2D/3D applications.',
  rendering: {
    enabled: true,
    maxFps: 30,
    shadows: false,
    postProcessing: false,
    renderer: 'canvas2d',
  },
  physics: {
    enabled: true,
    engine: 'simple',
    tickRate: 30,
    gravity: [0, -9.81, 0],
  },
  audio: {
    enabled: true,
    spatial: false,
    maxSounds: 4,
  },
  network: {
    enabled: true,
    stateSync: false,
  },
  input: {
    enabled: true,
    keyboard: true,
    mouse: true,
    touch: true,
    gamepad: false,
    vrControllers: false,
  },
  protocols: {
    mqtt: false,
    websocket: true,
    http: true,
  },
  lifecycleHooks: true,
  stateManagement: true,
  events: true,
  traits: true,
  memoryBudget: 100,
  startupTimeout: 2000,
};

/**
 * Standard profile for full browser execution
 * - Full WebGL rendering
 * - Full physics
 * - Spatial audio
 */
export const STANDARD_PROFILE: RuntimeProfile = {
  name: 'standard',
  description: 'Full-featured runtime for rich 3D applications.',
  rendering: {
    enabled: true,
    maxFps: 60,
    shadows: true,
    postProcessing: true,
    renderer: 'webgl',
  },
  physics: {
    enabled: true,
    engine: 'rapier',
    tickRate: 60,
    gravity: [0, -9.81, 0],
  },
  audio: {
    enabled: true,
    spatial: true,
    maxSounds: 32,
  },
  network: {
    enabled: true,
    stateSync: true,
    syncInterval: 50,
    webrtc: true,
  },
  input: {
    enabled: true,
    keyboard: true,
    mouse: true,
    touch: true,
    gamepad: true,
    vrControllers: false,
  },
  protocols: {
    mqtt: true,
    websocket: true,
    http: true,
  },
  lifecycleHooks: true,
  stateManagement: true,
  events: true,
  traits: true,
  memoryBudget: 512,
  startupTimeout: 5000,
};

/**
 * VR profile for immersive XR applications
 * - High-performance WebGL/WebGPU rendering
 * - Full physics with haptics
 * - Spatial audio
 * - VR input support
 */
export const VR_PROFILE: RuntimeProfile = {
  name: 'vr',
  description: 'Extended runtime for VR/XR immersive applications.',
  rendering: {
    enabled: true,
    maxFps: 90,
    shadows: true,
    postProcessing: true,
    renderer: 'webgpu',
  },
  physics: {
    enabled: true,
    engine: 'rapier',
    tickRate: 90,
    gravity: [0, -9.81, 0],
  },
  audio: {
    enabled: true,
    spatial: true,
    maxSounds: 64,
  },
  network: {
    enabled: true,
    stateSync: true,
    syncInterval: 33,
    webrtc: true,
  },
  input: {
    enabled: true,
    keyboard: false,
    mouse: false,
    touch: false,
    gamepad: true,
    vrControllers: true,
  },
  protocols: {
    mqtt: true,
    websocket: true,
    http: true,
  },
  lifecycleHooks: true,
  stateManagement: true,
  events: true,
  traits: true,
  memoryBudget: 1024,
  startupTimeout: 10000,
};

// =============================================================================
// PROFILE REGISTRY
// =============================================================================

const profileRegistry = new Map<RuntimeProfileName, RuntimeProfile>([
  ['headless', HEADLESS_PROFILE],
  ['minimal', MINIMAL_PROFILE],
  ['standard', STANDARD_PROFILE],
  ['vr', VR_PROFILE],
]);

/**
 * Get a profile by name
 */
export function getProfile(name: RuntimeProfileName): RuntimeProfile {
  const profile = profileRegistry.get(name);
  if (!profile) {
    throw new Error(`Unknown runtime profile: ${name}`);
  }
  return profile;
}

/**
 * Register a custom profile
 */
export function registerProfile(name: string, profile: RuntimeProfile): void {
  profileRegistry.set(name as RuntimeProfileName, profile);
}

/**
 * Get all available profile names
 */
export function getAvailableProfiles(): RuntimeProfileName[] {
  return Array.from(profileRegistry.keys());
}

/**
 * Create a custom profile by merging with a base profile
 */
export function createCustomProfile(
  base: RuntimeProfileName,
  overrides: Partial<RuntimeProfile>
): RuntimeProfile {
  const baseProfile = getProfile(base);
  return {
    ...baseProfile,
    ...overrides,
    rendering: { ...baseProfile.rendering, ...overrides.rendering },
    physics: { ...baseProfile.physics, ...overrides.physics },
    audio: { ...baseProfile.audio, ...overrides.audio },
    network: { ...baseProfile.network, ...overrides.network },
    input: { ...baseProfile.input, ...overrides.input },
    protocols: { ...baseProfile.protocols, ...overrides.protocols },
  } as RuntimeProfile;
}

export default {
  HEADLESS_PROFILE,
  MINIMAL_PROFILE,
  STANDARD_PROFILE,
  VR_PROFILE,
  getProfile,
  registerProfile,
  getAvailableProfiles,
  createCustomProfile,
};
