/**
 * Core Types Module â€” CANONICAL type definitions for HoloScript.
 *
 * This is the authoritative source of truth for all HoloScript types.
 * A lightweight, zero-dependency mirror exists at `@holoscript/core-types`
 * for consumers that need types without the full core runtime. When adding
 * or changing types here, mirror the change in `packages/core-types/` if
 * external consumers need it.
 *
 * @module types
 */

// Re-export type systems - AdvancedTypeSystem takes precedence for duplicate types
export * from './AdvancedTypeSystem';

// Re-export non-conflicting types from HoloScriptPlus
// Note: HSPlusAST, LifecycleHook, StateDeclaration are already exported from AdvancedTypeSystem
export {
  // Types that don't conflict
  type Vector3,
  type Color,
  type Vector3Tuple,
  type Transform,
  type VRHand,
  type HSPlusRuntime,
  type MediaLifecycleHook,
  type AnalyticsLifecycleHook,
  type SocialLifecycleHook,
  type EffectsLifecycleHook,
  type AudioLifecycleHook,
  type AILifecycleHook,
  type TimelineLifecycleHook,
  type EnvironmentLifecycleHook,
  type InputModalityLifecycleHook,
} from './HoloScriptPlus';

// =============================================================================
// Trait System Types
// =============================================================================

/**
 * Base interface for trait behaviors
 */
export interface TraitBehavior {
  /** Unique trait identifier */
  readonly traitId: string;
  /** Trait name */
  readonly name: string;
  /** Whether this trait is active */
  enabled: boolean;
  /** Initialize the trait */
  initialize?(): void | Promise<void>;
  /** Update the trait (called per frame) */
  update?(deltaTime: number): void;
  /** Cleanup the trait */
  dispose?(): void | Promise<void>;
}

/**
 * Trait configuration options
 */
export interface TraitConfig {
  /** Trait identifier */
  id: string;
  /** Initial enabled state */
  enabled?: boolean;
  /** Priority for update ordering */
  priority?: number;
  /** Custom properties */
  properties?: Record<string, unknown>;
}

/**
 * Trait registry entry
 */
export interface TraitRegistryEntry {
  /** Trait name */
  name: string;
  /** Trait factory function */
  factory: (config: TraitConfig) => TraitBehavior;
  /** Trait category */
  category: string;
  /** Description */
  description?: string;
  /** Required dependencies */
  dependencies?: string[];
}

// =============================================================================
// Entity Types
// =============================================================================

/**
 * Base entity interface
 */
export interface IEntity {
  /** Unique entity identifier */
  readonly id: string;
  /** Entity name */
  name: string;
  /** Entity type */
  readonly type: string;
  /** Whether entity is active */
  active: boolean;
  /** Parent entity ID */
  parent?: string;
  /** Child entity IDs */
  children: string[];
  /** Attached traits */
  traits: Map<string, TraitBehavior>;
}

/**
 * Entity creation options
 */
export interface EntityCreateOptions {
  /** Entity name */
  name?: string;
  /** Initial traits to attach */
  traits?: string[];
  /** Parent entity ID */
  parent?: string;
  /** Initial properties */
  properties?: Record<string, unknown>;
}

// =============================================================================
// Component Types
// =============================================================================

/**
 * Base component interface
 */
export interface IComponent {
  /** Component type identifier */
  readonly componentType: string;
  /** Owner entity ID */
  readonly entityId: string;
  /** Whether component is enabled */
  enabled: boolean;
}

/**
 * Transform component
 */
export interface ITransformComponent extends IComponent {
  componentType: 'transform';
  position: [number, number, number];
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

/**
 * Render component
 */
export interface IRenderComponent extends IComponent {
  componentType: 'render';
  visible: boolean;
  geometry?: string;
  material?: string;
  color?: string;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Core event types
 */
export type CoreEventType =
  | 'entity:created'
  | 'entity:destroyed'
  | 'entity:activated'
  | 'entity:deactivated'
  | 'trait:attached'
  | 'trait:detached'
  | 'component:added'
  | 'component:removed'
  | 'property:changed';

/**
 * Core event interface
 */
export interface ICoreEvent {
  type: CoreEventType;
  entityId?: string;
  traitId?: string;
  componentType?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * Event handler type
 */
export type CoreEventHandler = (event: ICoreEvent) => void;
