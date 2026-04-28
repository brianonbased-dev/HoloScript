/**
 * Runtime Type Definitions
 *
 * Strongly-typed interfaces that replace `any` across HoloScriptPlusRuntime
 * and HoloScriptRuntime. Uses WeakMap pattern for node state where appropriate.
 *
 * @version 1.0.0
 */
import type { HoloScriptValue } from '@holoscript/core';
import type { Vector3, VRHand } from '@holoscript/core';
import type { SpatialPosition, HologramProperties, HologramShape } from '@holoscript/core';

// =============================================================================
// NODE PROPERTIES
// =============================================================================

/**
 * Properties attached to scene-graph nodes. Replaces `Record<string, any>`
 * for node.properties throughout both runtimes.
 */
export interface NodeProperties {
  position?: Vector3 | number[];
  rotation?: { x: number; y: number; z: number; w?: number } | number[];
  scale?: Vector3 | number | number[];
  color?: string;
  size?: number;
  shape?: string;
  glow?: boolean;
  interactive?: boolean;
  geometry?: string;
  material?: string;
  opacity?: number;
  visible?: boolean;
  __templateRef?: string;
  [key: string]: unknown;
}

// =============================================================================
// ORB DATA
// =============================================================================

/**
 * Runtime representation of an orb instance in HoloScriptRuntime.
 * Replaces `Record<string, any>` for orb objects with `__type: 'orb'`.
 */
export interface OrbData {
  __type: 'orb';
  id: string;
  name: string;
  created: number;
  position: SpatialPosition;
  hologram?: HologramProperties;
  properties: Record<string, HoloScriptValue>;
  directives: Array<OrbDirective>;
  _templateRef?: unknown;
  state?: Record<string, HoloScriptValue>;
  /** Dynamically-bound methods from agent directives */
  [key: string]: unknown;
  // Bound convenience methods
  show?: () => HoloScriptValue | Promise<HoloScriptValue>;
  hide?: () => HoloScriptValue | Promise<HoloScriptValue>;
  pulse?: (opts?: Record<string, HoloScriptValue>) => HoloScriptValue | Promise<HoloScriptValue>;
}

/**
 * Directive data attached to an orb. Replaces `Record<string, any>` for
 * directive objects accessed on orb.directives.
 */
export interface OrbDirective {
  type: string;
  name?: string;
  config?: Record<string, HoloScriptValue>;
  body?: string | Record<string, HoloScriptValue>;
  hook?: string;
  /** Additional directive-specific fields */
  [key: string]: unknown;
}

// =============================================================================
// RENDERER CONTEXT (HoloScriptPlusRuntime)
// =============================================================================

/**
 * Extended renderer interface for renderers that expose a WebGPU/WebGL context.
 * Used in enterVR() and XR session management.
 */
export interface ContextualRenderer {
  createElement(type: string, properties: NodeProperties): unknown;
  updateElement(element: unknown, properties: NodeProperties): void;
  appendChild(parent: unknown, child: unknown): void;
  removeChild(parent: unknown, child: unknown): void;
  destroy(element: unknown): void;
  setXRSession?(
    session: XRSession | null,
    glBinding: unknown | null,
    projectionLayer: unknown | null
  ): void;
  /** WebGPU/WebGL context accessor */
  getContext?(): unknown;
  /** Direct context property (fallback) */
  context?: unknown;
}

/**
 * WebXR manager interface extracted from the runtime's duck-typed usage.
 */
export interface WebXRManagerLike {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(): Promise<void>;
  endSession(): Promise<void>;
  getBinding(): unknown;
  getProjectionLayer(): unknown;
  setAnimationLoop(callback: (time: number, frame: unknown) => void): void;
  getReferenceSpace(): unknown;
}

// =============================================================================
// NETWORK STATE
// =============================================================================

/**
 * Interpolated state received from the network predictor.
 * Used in onNetworkStateUpdate and applyNetworkState.
 */
export interface InterpolatedState {
  position?: Vector3;
  rotation?: Vector3;
  [key: string]: unknown;
}

// =============================================================================
// COPILOT INTERFACE
// =============================================================================

/**
 * AI Copilot integration interface for the generate directive.
 */
export interface CopilotInterface {
  isReady(): boolean;
  generateFromPrompt(prompt: string, options: Record<string, HoloScriptValue>): Promise<unknown>;
}

// =============================================================================
// EXTERNAL API DIRECTIVE
// =============================================================================

/**
 * Shape of a parsed @external_api directive.
 */
export interface ExternalApiDirective {
  type: string;
  url: string;
  method?: string;
  interval?: string;
  prompt?: string;
  context?: string;
  [key: string]: unknown;
}

// =============================================================================
// HOLOSCRIPT+ TEMPLATE DATA
// =============================================================================

/**
 * Minimal template registration shape for the HotReloader.
 */
export interface TemplateRegistration {
  type: string;
  name: string;
  version: number;
  migrations: unknown[];
  state?: { properties: unknown[] };
}

/**
 * Instance registration shape for the HotReloader.
 */
export interface InstanceRegistration {
  __holo_id: string;
  templateName: string;
  version: number;
  state: unknown;
}

// =============================================================================
// COMMAND RESULT
// =============================================================================

/**
 * Result of a generic voice/text command execution.
 * Replaces `Record<string, any>` return types in execute*Command methods.
 */
export interface CommandResult {
  showed?: string;
  hidden?: string;
  created?: string;
  animating?: string;
  pulsing?: string;
  moved?: string;
  deleted?: string;
  error?: string;
  executed?: boolean;
  message?: string;
  hologram?: HologramProperties;
  position?: SpatialPosition;
  shape?: string;
  animation?: unknown;
  duration?: number;
  [key: string]: unknown;
}

// =============================================================================
// MEMORY STATE
// =============================================================================

/**
 * Memory block state for agent memory nodes.
 */
export interface MemoryState {
  id: string;
  type: 'agent-memory';
  semantic?: HoloScriptValue;
  episodic?: HoloScriptValue;
  procedural?: HoloScriptValue;
  [key: string]: unknown;
}

// =============================================================================
// MIGRATION
// =============================================================================

/**
 * Migration entry in a template.
 */
export interface MigrationEntry {
  type?: string;
  fromVersion: number | string;
  body: string;
}

// =============================================================================
// VISUALIZER ORB
// =============================================================================

/**
 * Orb shape sent over WebSocket to visualizer clients.
 */
export interface VisualizerOrb {
  id: string;
  name: string;
  position: SpatialPosition;
  properties: Record<string, HoloScriptValue>;
  hologram: {
    color: string;
    size: number;
    shape: HologramShape | string;
    glow: boolean;
  };
  traits: unknown[];
}

// =============================================================================
// POSITION UPDATE PAYLOAD
// =============================================================================

/**
 * Payload emitted from trait onUpdate for position changes.
 */
export interface PositionUpdatePayload {
  position: [number, number, number];
  [key: string]: unknown;
}

// =============================================================================
// RUNTIME CONTEXT (legacy getContext)
// =============================================================================

/**
 * Legacy context shape returned by getContext() in HoloScriptPlusRuntime.
 */
export interface LegacyRuntimeContext {
  spatialMemory: Map<string, unknown>;
  hologramState: Map<string, Record<string, unknown>>;
  state: unknown;
  builtins: unknown;
  vr: {
    hands: { left: VRHand | null; right: VRHand | null };
    headset: { position: Vector3; rotation: Vector3 };
    controllers: { left: unknown; right: unknown };
  };
}

/**
 * Hologram state entry shape.
 */
export interface HologramStateEntry {
  shape: string;
  color?: string;
  size?: number;
  glow?: boolean;
  interactive?: boolean;
  [key: string]: HoloScriptValue | undefined;
}

// =============================================================================
// STATEMENT TYPES (for executeStatement in HoloScriptPlusRuntime)
// =============================================================================

/**
 * Statement node shape used in executeStatement.
 * HSPlusStatement = HSPlusNode but we need typed access to specific fields.
 */
export interface RuntimeStatement {
  type: string;
  target?: string;
  value?: unknown;
  method?: string;
  arguments?: unknown[];
  condition?: unknown;
  consequent?: unknown;
  alternate?: unknown;
  event?: string;
  data?: unknown;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Check if a value is an OrbData instance */
export function isOrbData(value: unknown): value is OrbData {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__type === 'orb'
  );
}

/** Check if a value has a __bind property (HoloBindValue) */
export function isBindValue(value: unknown): value is { __bind: true; source: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).__bind === true
  );
}
