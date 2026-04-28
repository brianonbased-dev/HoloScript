/**
 * @holoscript/runtime
 *
 * Browser runtime for HoloScript applications.
 * Provides event bus, storage, device detection, timing, math, and navigation.
 *
 * @example
 * ```typescript
 * import { runtime, emit, storage, device } from '@holoscript/runtime';
 *
 * // Use individual modules
 * emit('player:move', { x: 10, y: 0, z: 5 });
 * await storage.set('user:settings', { volume: 0.8 });
 *
 * // Or access via runtime object
 * runtime.emit('game:start');
 * ```
 */

// Event Bus
export {
  EventBus,
  eventBus,
  emit,
  on,
  once,
  off,
  onWindowEvent,
  type EventCallback,
  type UnsubscribeFn,
} from './events.js';

// Storage
export {
  storage,
  get,
  set,
  remove,
  clear,
  keys,
  has,
  createLocalStorage,
  createMemoryStorage,
  createIndexedDBStorage,
  type StorageAdapter,
} from './storage.js';

// Device Detection
export {
  device,
  isMobile,
  isTablet,
  isDesktop,
  isTouchDevice,
  isVRCapable,
  prefersReducedMotion,
  prefersDarkMode,
  type DeviceCapabilities,
} from './device.js';

// Timing Utilities
export {
  after,
  every,
  debounce,
  throttle,
  wait,
  nextFrame,
  createLoop,
  onIdle,
  tween,
  easing,
  type TimerId,
  type CancelFn,
} from './timing.js';

// Math Utilities
export {
  lerp,
  clamp,
  inverseLerp,
  remap,
  smoothStep,
  smootherStep,
  degToRad,
  radToDeg,
  random,
  randomInt,
  randomItem,
  shuffle,
  distance2D,
  distance3D,
  normalize,
  wrap,
  pingPong,
  angle2D,
  approximately,
  roundTo,
  noise1D,
  fbm,
  vec2,
  vec3,
  type Vec2,
  type Vec3,
} from './math.js';

// Navigation
export {
  navigate,
  goBack,
  goForward,
  getCurrentPath,
  canGoBack,
  canGoForward,
  getHistory,
  clearHistory,
  parseParams,
  matchRoute,
  parseQuery,
  buildQuery,
  onNavigate,
  setNavigateCallback,
  initBrowserHistory,
  type NavigateCallback,
} from './navigation.js';

// Pattern E consumer-bus infrastructures
export {
  AssetLoadCoordinator,
  createAssetLoadCoordinator,
  type AssetRecord,
  type AssetLoadedEvent,
  type AssetErrorEvent,
  type AssetType,
  type AssetLoadCoordinatorOptions,
} from './AssetLoadCoordinator.js';

export {
  SecurityEventBus,
  createSecurityEventBus,
  type SecurityEventBusOptions,
  type RbacEvent,
  type SsoEvent,
  type QuotaEvent,
  type TenantEvent,
  type AuditEvent,
  type ForgetPolicyEvent,
  type AuditRecord,
} from './SecurityEventBus.js';

export {
  SessionPresenceCoordinator,
  createSessionPresenceCoordinator,
  type SharePlayEvent,
  type SpatialVoiceEvent,
  type HeartbeatEvent,
  type MessagingEvent,
  type SessionRecord,
  type PeerRecord,
  type HeartbeatStatus,
  type PeerHandler,
  type MessageHandler,
  type HeartbeatHandler,
  type SessionPresenceCoordinatorOptions,
} from './SessionPresenceCoordinator.js';

// DOM 2D Renderer - for rendering HoloScript to HTML
export {
  DOM2DRenderer,
  createDOM2DRenderer,
  transformASTToHSNode,
  type HSNode,
  type RenderedElement,
  type DOM2DRendererOptions,
} from './browser/DOM2DRenderer.js';

// Import modules for runtime object
import { eventBus, emit, on, once, off } from './events.js';
import { storage, get, set, remove } from './storage.js';
import { device } from './device.js';
import { after, every, debounce, throttle, wait, createLoop, tween, easing } from './timing.js';
import {
  lerp,
  clamp,
  random,
  randomInt,
  distance2D,
  distance3D,
  degToRad,
  radToDeg,
  vec2,
  vec3,
} from './math.js';
import { navigate, goBack, goForward, getCurrentPath, initBrowserHistory } from './navigation.js';

/**
 * Unified runtime object for HoloScript
 *
 * Available as built-in in HoloScript via `runtime.*`
 */
export const runtime = {
  // Version
  version: '3.0.0',

  // Events
  emit,
  on,
  once,
  off,
  eventBus,

  // Storage
  storage: {
    get,
    set,
    remove,
    clear: storage.clear.bind(storage),
    keys: storage.keys.bind(storage),
    has: storage.has.bind(storage),
  },

  // Device
  device,

  // Timing
  after,
  every,
  debounce,
  throttle,
  wait,
  createLoop,
  tween,
  easing,

  // Math
  lerp,
  clamp,
  random,
  randomInt,
  distance2D,
  distance3D,
  degToRad,
  radToDeg,
  vec2,
  vec3,

  // Navigation
  navigate,
  goBack,
  goForward,
  getCurrentPath,
  initBrowserHistory,
};

// Browser Runtime (scene loading and rendering)
export {
  createRuntime,
  BrowserRuntime,
  type RuntimeConfig,
  type HoloScriptRuntime,
} from './browser/BrowserRuntime.js';

// Physics and Traits
export {
  PhysicsWorld,
  type CollisionEvent,
  type RigidbodyConfig,
  type CollisionCallback,
  type PhysicsOptions,
} from './physics/PhysicsWorld.js';
export { TraitSystem, type TraitHandler, type TraitContext } from './traits/TraitSystem.js';
export {
  GrabbableTrait,
  ThrowableTrait,
  CollidableTrait,
  PhysicsTrait,
  GravityTrait,
  TriggerTrait,
  PointableTrait,
  HoverableTrait,
  ClickableTrait,
  DraggableTrait,
  ScalableTrait,
  calculateThrowVelocity,
} from './traits/InteractionTraits.js';

/**
 * Initialize the runtime and register globals
 */
export function initRuntime(): void {
  // Register on globalThis for HoloScript access
  if (typeof globalThis !== 'undefined') {
    (globalThis as Record<string, unknown>).HoloScriptRuntime = runtime;
    (globalThis as Record<string, unknown>).emit = emit;
    (globalThis as Record<string, unknown>).on = on;
    (globalThis as Record<string, unknown>).storage = runtime.storage;
    (globalThis as Record<string, unknown>).device = device;
    (globalThis as Record<string, unknown>).after = after;
    (globalThis as Record<string, unknown>).every = every;
    (globalThis as Record<string, unknown>).debounce = debounce;
    (globalThis as Record<string, unknown>).lerp = lerp;
    (globalThis as Record<string, unknown>).clamp = clamp;
    (globalThis as Record<string, unknown>).navigate = navigate;
  }

  // Initialize browser history if in browser
  if (typeof window !== 'undefined') {
    initBrowserHistory();
  }
}

// Auto-initialize when imported in browser
if (typeof window !== 'undefined') {
  initRuntime();
}

// VRR Runtime
export {
  VRRRuntime,
  QuestHubHandle,
  type VRRRuntimeOptions,
  type WeatherData,
  type InventoryData,
  type PlayerData,
  type EventData,
} from './VRRRuntime.js';

// AR Runtime
export { ARRuntime, type ARRuntimeOptions, type ARTrackingState } from './ARRuntime.js';

export default runtime;
