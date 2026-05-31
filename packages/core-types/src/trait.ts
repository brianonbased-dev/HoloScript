/**
 * Trait & skill type mirrors.
 *
 * Pure type-only mirrors of the canonical runtime types in
 * `@holoscript/core` (`types/base.ts`, `types.ts`). Downstream packages (e.g.
 * `@holoscript/mesh`) consume these as types so they do NOT need
 * `@holoscript/core` as a runtime dependency — keeping the L0 base cycle-free.
 *
 * `TraitBehavior` fields are intentionally OPTIONAL: the `@holoscript/core`
 * barrel that consumers historically imported treats them permissively (e.g.
 * mesh's MessagingTrait literal sets only `traitId`/`name`/`enabled`). Keeping
 * them optional preserves that compile behavior. Nested skill category/step
 * types are loosened (`string`/`unknown[]`) to keep this file zero-import.
 */

/** Permissive mirror of @holoscript/core TraitBehavior (barrel shape). */
export interface TraitBehavior {
  /** Unique identifier for this trait instance */
  id?: string;
  /** The trait type name (e.g., 'grabbable', 'physics') */
  traitName?: string;
  /** Current state of the trait */
  state?: Record<string, unknown>;
  /** Configuration options for the trait */
  config?: Record<string, unknown>;
  /** Whether the trait is currently active */
  enabled?: boolean;
  /** Lifecycle hook: called when trait is attached to an entity */
  onAttach?: (entity: unknown) => void;
  /** Lifecycle hook: called when trait is detached from an entity */
  onDetach?: (entity: unknown) => void;
  /** Lifecycle hook: called every frame/tick */
  onUpdate?: (entity: unknown, deltaTime: number) => void;
  /** Lifecycle hook: called when trait state changes */
  onStateChange?: (oldState: unknown, newState: unknown) => void;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Legacy/compat aliases used by some existing trait literals. */
  traitId?: string;
  name?: string;
}

/**
 * Mirror of @holoscript/core ProceduralSkill (types.ts). `category` and `steps`
 * are loosened (string / unknown[]) so this file pulls in no nested core types;
 * a core ProceduralSkill remains structurally assignable to this.
 */
export interface ProceduralSkill {
  id: string;
  name: string;
  description: string;
  /** Skill category (core: SkillCategory string-literal union) */
  category: string;
  /** Steps that make up this skill (core: SkillStep[]) */
  steps: unknown[];
  /** Prerequisites - skills that should be learned first */
  prerequisites: string[];
  /** Tags for searchability */
  tags: string[];
  /** Difficulty level 0-1 */
  difficulty: number;
  /** Success rate from past executions (0-1) */
  successRate: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}
