/**
 * @holoscript/core Trigger Trait
 *
 * Enables collision detection without physical response.
 * Used for detecting when objects enter/exit zones.
 *
 * @example
 * ```hsplus
 * object "DamageZone" {
 *   @trigger {
 *     shape: "box",
 *     size: { x: 5, y: 2, z: 5 },
 *     layerMask: ["player", "enemy"],
 *     onEnter: { damage: 10 },
 *     onStay: { damagePerSecond: 5 }
 *   }
 * }
 * ```
 */

/**
 * 3D Vector
 */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Trigger shape types
 */
export type TriggerShape = 'box' | 'sphere' | 'capsule' | 'cylinder' | 'mesh';

/**
 * Trigger event types
 */
export type TriggerEventType = 'enter' | 'stay' | 'exit';

/**
 * Trigger event data
 */
export interface TriggerEvent {
  /** Event type */
  type: TriggerEventType;

  /** ID of the other object */
  other: string;

  /** Contact point (if available) */
  contactPoint?: Vector3;

  /** Direction from trigger center to object */
  direction?: Vector3;

  /** Distance from trigger center */
  distance?: number;

  /** Time spent inside trigger (for stay events) */
  stayDuration?: number;

  /** Timestamp */
  timestamp: number;

  /** Custom tags on the other object */
  otherTags?: string[];
}

/**
 * Action to execute on trigger
 */
export interface TriggerAction {
  /** Type of action */
  type: 'emit' | 'call' | 'set' | 'spawn' | 'destroy' | 'custom';

  /** Event name to emit */
  event?: string;

  /** Function to call */
  function?: string;

  /** Alias for event/function for backward compatibility/tests */
  handler?: string;

  /** Property to set */
  property?: string;

  /** Value to set */
  value?: unknown;

  /** Object to spawn */
  spawnTemplate?: string;

  /** Custom action data */
  data?: Record<string, unknown>;

  /** Delay before executing (ms) */
  delay?: number;

  /** Only execute once */
  once?: boolean;
}

/**
 * Trigger configuration
 */
export interface TriggerConfig {
  /** Trigger shape */
  shape?: TriggerShape;

  /** Size (for box) */
  size?: Vector3;

  /** Radius (for sphere, capsule) */
  radius?: number;

  /** Height (for capsule, cylinder) */
  height?: number;

  /** Center offset from object position */
  center?: Vector3;

  /** Collision layer */
  layer?: number;

  /** Layer mask - which layers to detect */
  layerMask?: number;

  /** Tags to filter by */
  filterTags?: string[];

  /** Include or exclude filtered tags */
  filterMode?: 'include' | 'exclude';

  /** Actions on enter */
  onEnter?: TriggerAction[];

  /** Actions on stay */
  onStay?: TriggerAction[];

  /** Actions on exit */
  onExit?: TriggerAction[];

  /** Cooldown between events (ms) */
  cooldown?: number;

  /** Maximum occupants */
  maxOccupants?: number;

  /** Is enabled */
  enabled?: boolean;
}

/**
 * Trigger state
 */
export interface TriggerState {
  /** Currently inside the trigger */
  occupants: Set<string>;

  /** Time each occupant entered */
  entryTimes: Map<string, number>;

  /** Last event time per occupant (for cooldown) */
  lastEventTime: Map<string, number>;

  /** One-time actions already executed */
  executedOnce: Set<string>;
}

/**
 * Event listener callback
 */
type EventCallback = (event: TriggerEvent) => void;

/**
 * Trigger Trait - Collision detection without physics response
 */
export class TriggerTrait {
  private config: TriggerConfig;
  private state: TriggerState;
  private eventListeners: Map<TriggerEventType, EventCallback[]> = new Map();
  private enabled: boolean = true;

  constructor(config: Partial<TriggerConfig> = {}) {
    this.config = {
      shape: config.shape ?? 'box',
      size: config.size ?? { x: 1, y: 1, z: 1 },
      radius: config.radius ?? 0.5,
      height: config.height ?? 1,
      center: config.center ?? { x: 0, y: 0, z: 0 },
      layer: config.layer ?? 0,
      layerMask: config.layerMask ?? -1, // All layers
      filterTags: config.filterTags ?? [],
      filterMode: config.filterMode ?? 'include',
      onEnter: config.onEnter ?? [],
      onStay: config.onStay ?? [],
      onExit: config.onExit ?? [],
      cooldown: config.cooldown ?? 0,
      maxOccupants: config.maxOccupants,
      enabled: config.enabled ?? true,
    };

    this.state = {
      occupants: new Set(),
      entryTimes: new Map(),
      lastEventTime: new Map(),
      executedOnce: new Set(),
    };

    this.enabled = this.config.enabled ?? true;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): TriggerConfig {
    return { ...this.config };
  }

  /**
   * Get state
   */
  public getState(): { occupantCount: number; occupants: string[] } {
    return {
      occupantCount: this.state.occupants.size,
      occupants: Array.from(this.state.occupants),
    };
  }

  /**
   * Set shape
   */
  public setShape(
    shape: TriggerShape,
    params?: { size?: Vector3; radius?: number; height?: number }
  ): void {
    this.config.shape = shape;
    if (params?.size) this.config.size = params.size;
    if (params?.radius) this.config.radius = params.radius;
    if (params?.height) this.config.height = params.height;
  }

  /**
   * Set size
   */
  public setSize(size: Vector3): void {
    this.config.size = { ...size };
  }

  /**
   * Set radius
   */
  public setRadius(radius: number): void {
    this.config.radius = Math.max(0, radius);
  }

  /**
   * Set center offset
   */
  public setCenter(center: Vector3): void {
    this.config.center = { ...center };
  }

  /**
   * Set layer mask
   */
  public setLayerMask(layerMask: number): void {
    this.config.layerMask = layerMask;
  }

  /**
   * Set filter tags
   */
  public setFilterTags(tags: string[], mode: 'include' | 'exclude' = 'include'): void {
    this.config.filterTags = [...tags];
    this.config.filterMode = mode;
  }

  /**
   * Set cooldown
   */
  public setCooldown(cooldown: number): void {
    this.config.cooldown = Math.max(0, cooldown);
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Add enter action
   */
  public addEnterAction(action: TriggerAction): void {
    if (!this.config.onEnter) this.config.onEnter = [];
    this.config.onEnter.push(action);
  }

  /**
   * Add stay action
   */
  public addStayAction(action: TriggerAction): void {
    if (!this.config.onStay) this.config.onStay = [];
    this.config.onStay.push(action);
  }

  /**
   * Add exit action
   */
  public addExitAction(action: TriggerAction): void {
    if (!this.config.onExit) this.config.onExit = [];
    this.config.onExit.push(action);
  }

  /**
   * Clear actions for event type
   */
  public clearActions(eventType: TriggerEventType): void {
    switch (eventType) {
      case 'enter':
        this.config.onEnter = [];
        break;
      case 'stay':
        this.config.onStay = [];
        break;
      case 'exit':
        this.config.onExit = [];
        break;
    }
  }

  // ============================================================================
  // Detection (called by physics engine)
  // ============================================================================

  /**
   * Handle object entering trigger
   */
  public handleEnter(objectId: string, tags?: string[]): TriggerEvent | null {
    if (!this.enabled) return null;

    // Check max occupants
    if (this.config.maxOccupants && this.state.occupants.size >= this.config.maxOccupants) {
      return null;
    }

    // Check tag filter
    if (!this.passesTagFilter(tags)) {
      return null;
    }

    // Check cooldown
    const now = Date.now();
    const lastEvent = this.state.lastEventTime.get(objectId) || 0;
    if (this.config.cooldown && now - lastEvent < this.config.cooldown) {
      return null;
    }

    // Add to occupants
    this.state.occupants.add(objectId);
    this.state.entryTimes.set(objectId, now);
    this.state.lastEventTime.set(objectId, now);

    const event: TriggerEvent = {
      type: 'enter',
      other: objectId,
      timestamp: now,
      otherTags: tags,
    };

    // Emit to listeners
    this.emit(event);

    return event;
  }

  /**
   * Handle object staying in trigger
   */
  public handleStay(objectId: string, tags?: string[]): TriggerEvent | null {
    if (!this.enabled) return null;

    if (!this.state.occupants.has(objectId)) {
      return null;
    }

    const now = Date.now();
    const entryTime = this.state.entryTimes.get(objectId) || now;

    const event: TriggerEvent = {
      type: 'stay',
      other: objectId,
      stayDuration: now - entryTime,
      timestamp: now,
      otherTags: tags,
    };

    this.emit(event);

    return event;
  }

  /**
   * Handle object exiting trigger
   */
  public handleExit(objectId: string, tags?: string[]): TriggerEvent | null {
    if (!this.enabled) return null;

    if (!this.state.occupants.has(objectId)) {
      return null;
    }

    const now = Date.now();
    const entryTime = this.state.entryTimes.get(objectId) || now;

    // Remove from occupants
    this.state.occupants.delete(objectId);
    this.state.entryTimes.delete(objectId);

    const event: TriggerEvent = {
      type: 'exit',
      other: objectId,
      stayDuration: now - entryTime,
      timestamp: now,
      otherTags: tags,
    };

    this.emit(event);

    return event;
  }

  /**
   * Check if object passes tag filter
   */
  private passesTagFilter(tags?: string[]): boolean {
    if (!this.config.filterTags || this.config.filterTags.length === 0) {
      return true;
    }

    const objectTags = tags || [];
    const hasMatchingTag = this.config.filterTags.some((t) => objectTags.includes(t));

    return this.config.filterMode === 'include' ? hasMatchingTag : !hasMatchingTag;
  }

  // ============================================================================
  // Query
  // ============================================================================

  /**
   * Check if object is inside
   */
  public contains(objectId: string): boolean {
    return this.state.occupants.has(objectId);
  }

  /**
   * Get occupant count
   */
  public getOccupantCount(): number {
    return this.state.occupants.size;
  }

  /**
   * Get all occupants
   */
  public getOccupants(): string[] {
    return Array.from(this.state.occupants);
  }

  /**
   * Get stay duration for an occupant
   */
  public getStayDuration(objectId: string): number | null {
    const entryTime = this.state.entryTimes.get(objectId);
    if (entryTime === undefined) return null;
    return Date.now() - entryTime;
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  /**
   * Enable/disable trigger
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      // Clear all occupants when disabled
      for (const occupant of this.state.occupants) {
        this.handleExit(occupant);
      }
    }
  }

  /**
   * Is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Add event listener
   */
  public on(event: TriggerEventType, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: TriggerEventType, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: TriggerEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /**
   * Reset trigger state
   */
  public reset(): void {
    this.state.occupants.clear();
    this.state.entryTimes.clear();
    this.state.lastEventTime.clear();
    this.state.executedOnce.clear();
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize for physics engine
   */
  public serialize(): Record<string, unknown> {
    return {
      shape: this.config.shape,
      size: this.config.size,
      radius: this.config.radius,
      height: this.config.height,
      center: this.config.center,
      layer: this.config.layer,
      layerMask: this.config.layerMask,
      filterTags: this.config.filterTags,
      filterMode: this.config.filterMode,
      cooldown: this.config.cooldown,
      maxOccupants: this.config.maxOccupants,
      enabled: this.enabled,
      occupantCount: this.state.occupants.size,
    };
  }
}

/**
 * Factory function
 */
export function createTriggerTrait(config: Partial<TriggerConfig> = {}): TriggerTrait {
  return new TriggerTrait(config);
}

// Type aliases for re-export
export type TriggerShapeType = TriggerShape;
export type TriggerEventTypeAlias = TriggerEventType;

// ── Handler (delegates to TriggerTrait) ──
import type { TraitHandler } from './TraitTypes';

export const triggerHandler = {
  name: 'trigger',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new TriggerTrait(config);
    node.__trigger_instance = instance;
    ctx.emit('trigger_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__trigger_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('trigger_detached', { node });
    delete node.__trigger_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__trigger_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'trigger_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('trigger_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__trigger_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
