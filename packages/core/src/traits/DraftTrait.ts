/**
 * @draft Trait — Draft-to-Mesh-to-Simulation Pipeline
 *
 * Marks an entity as a draft-stage blockout primitive. Draft entities:
 * 1. Render as geometric primitives ("fat pixels") — cheap to draw
 * 2. Double as physics collision proxies — no separate collision mesh needed
 * 3. Support instant physics testing from day one
 *
 * The pipeline is CIRCULAR, not linear:
 *   draft shapes → mesh import → collision reuses draft shapes
 *
 * This eliminates redundant collision mesh creation and enables physics
 * testing from day one of scene composition.
 *
 * Usage in HoloScript:
 *   template "Building" {
 *     @draft { shape: "box"; collision: true }
 *   }
 *
 * @see W.080 — Geometric primitives are both draft AND collision proxy
 * @see P.080 — Draft-Mesh-Sim Circular Pipeline Pattern
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Asset maturity stages */
export type AssetMaturity = 'draft' | 'mesh' | 'final';

/** The primitive shape used for draft rendering and collision */
export type DraftShape =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'capsule'
  | 'plane'
  | 'torus';

/** Draft trait configuration */
export interface DraftConfig {
  /** Primitive shape for draft rendering (default: 'box') */
  shape: DraftShape;
  /** Whether to use this shape as a collision proxy (default: true — the key insight) */
  collision: boolean;
  /** Color override for draft rendering (default: '#88aaff' — blockout blue) */
  color: string;
  /** Opacity for draft wireframe (default: 1.0; set <1 for ghost mode) */
  opacity: number;
  /** Show wireframe overlay on draft shapes (default: false) */
  wireframe: boolean;
  /** Scale multiplier for collision proxy relative to visual (default: 1.0) */
  collisionScale: number;
  /** Target maturity — what this draft should eventually become */
  targetMaturity: AssetMaturity;
}

/** Default config */
export const DRAFT_DEFAULTS: DraftConfig = {
  shape: 'box',
  collision: true,
  color: '#88aaff',
  opacity: 1.0,
  wireframe: false,
  collisionScale: 1.0,
  targetMaturity: 'mesh',
};

// ── Trait Definition ─────────────────────────────────────────────────────────

export const DRAFT_TRAIT = {
  name: '@draft',
  version: '1.0.0',
  description:
    'Marks an entity as a draft-stage blockout primitive. Draft shapes serve as both visual content during composition AND physics collision proxies during simulation.',
  category: 'pipeline',
  properties: {
    shape: { type: 'string', default: 'box', enum: ['box', 'sphere', 'cylinder', 'cone', 'capsule', 'plane', 'torus'] },
    collision: { type: 'boolean', default: true },
    color: { type: 'string', default: '#88aaff' },
    opacity: { type: 'number', default: 1.0, min: 0, max: 1 },
    wireframe: { type: 'boolean', default: false },
    collisionScale: { type: 'number', default: 1.0, min: 0.1, max: 10 },
    targetMaturity: { type: 'string', default: 'mesh', enum: ['draft', 'mesh', 'final'] },
  },
} as const;

// ── DraftManager ─────────────────────────────────────────────────────────────

/**
 * Manages draft state for entities in a scene. Tracks which entities are
 * in draft mode and provides maturity promotion/demotion.
 */
export class DraftManager {
  private drafts = new Map<string, DraftConfig>();

  /** Register an entity as a draft */
  setDraft(entityId: string, config: Partial<DraftConfig> = {}): DraftConfig {
    const merged: DraftConfig = { ...DRAFT_DEFAULTS, ...config };
    this.drafts.set(entityId, merged);
    return merged;
  }

  /** Get draft config for an entity (null if not in draft mode) */
  getDraft(entityId: string): DraftConfig | null {
    return this.drafts.get(entityId) ?? null;
  }

  /** Check if an entity is in draft mode */
  isDraft(entityId: string): boolean {
    return this.drafts.has(entityId);
  }

  /** Promote an entity from draft to mesh */
  promote(entityId: string): AssetMaturity {
    const config = this.drafts.get(entityId);
    if (!config) return 'mesh';

    if (config.targetMaturity === 'mesh' || config.targetMaturity === 'final') {
      this.drafts.delete(entityId);
      return config.targetMaturity;
    }
    return 'draft';
  }

  /** Demote an entity back to draft (e.g., VR perf regression) */
  demote(entityId: string, config: Partial<DraftConfig> = {}): DraftConfig {
    return this.setDraft(entityId, config);
  }

  /** Get all draft entity IDs */
  getDraftIds(): string[] {
    return [...this.drafts.keys()];
  }

  /** Get count of draft entities */
  get count(): number {
    return this.drafts.size;
  }

  /** Clear all drafts */
  clear(): void {
    this.drafts.clear();
  }

  /** Demote ALL entities to draft (VR emergency regression) */
  demoteAll(entityIds: string[], shape: DraftShape = 'box'): void {
    for (const id of entityIds) {
      this.setDraft(id, { shape });
    }
  }

  /**
   * Get the collision shape for an entity. If the entity is in draft mode
   * AND collision is enabled, returns the draft shape. This is the key
   * circular pipeline insight: draft shapes ARE collision proxies.
   */
  getCollisionShape(entityId: string): DraftShape | null {
    const config = this.drafts.get(entityId);
    if (!config || !config.collision) return null;
    return config.shape;
  }
}

// ── Handler (delegates to DraftManager) ──
import type { TraitHandler } from './TraitTypes';

export const draftHandler = {
  name: 'draft',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new DraftManager();
    node.__draft_instance = instance;
    ctx.emit('draft_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__draft_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('draft_detached', { node });
    delete node.__draft_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__draft_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'draft_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('draft_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__draft_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
