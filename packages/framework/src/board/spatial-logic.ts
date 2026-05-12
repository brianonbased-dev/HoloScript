/**
 * Spatial Logic Framework (SLF) — rule engine for HoloLand world manifests.
 *
 * SLF extends a Shard with declarative spatial rules: predicates define
 * WHEN a rule fires, actions define WHAT happens. The runtime evaluates
 * predicates against world state (entity positions, inventories, quest
 * progress, time) and executes actions atomically.
 *
 * Created: task_1778462298192_qczd (SLF-grade game intricacies)
 */

import type { ArtifactProvenanceLink } from './board-types';

// ── Predicate — condition that must hold for a rule to fire ──

/**
 * Predicate kind. Drives how the SLF runtime evaluates the condition.
 *
 * - in_zone        — entity is inside the referenced Zone
 * - has_item       — entity possesses the referenced Item
 * - has_skill      — entity has unlocked the referenced Skill
 * - entity_near    — entity is within `radius` meters of target
 * - time_of_day    — current world time falls inside `timeRange`
 * - quest_complete — referenced Quest is in `complete` status
 * - quest_active   — referenced Quest is currently active
 * - probability    — random roll succeeds at `chance` (0–1)
 * - predicate-other — anything outside the enumerated set; describe in
 *   `SpatialPredicate.kindLabel`.
 */
export const PREDICATE_KINDS = [
  'in_zone',
  'has_item',
  'has_skill',
  'entity_near',
  'time_of_day',
  'quest_complete',
  'quest_active',
  'probability',
  'predicate-other',
] as const;

export type PredicateKind = (typeof PREDICATE_KINDS)[number];

export interface SpatialPredicate {
  /** Stable predicate id within the parent rule. */
  id: string;
  /** Predicate family. Use `predicate-other` and `kindLabel` for off-list. */
  kind: PredicateKind;
  /** Free-form kind label when `kind` is `predicate-other`. */
  kindLabel?: string;
  /** Target id — meaning depends on `kind`:
   *   in_zone        → Zone.id
   *   has_item       → Item.id
   *   has_skill      → Skill.id
   *   entity_near    → Entity.id or omitted for raw `position`
   *   time_of_day    → omitted (use `timeRange`)
   *   quest_complete → Quest.id
   *   quest_active   → Quest.id
   *   probability    → omitted (use `chance`)
   */
  targetId?: string;
  /** Radius in meters for `entity_near`. */
  radius?: number;
  /** Time range `[startHour, endHour]` (0–24) for `time_of_day`. */
  timeRange?: [number, number];
  /** Probability 0–1 for `probability`. */
  chance?: number;
  /** Raw position `[x, y, z]` for `entity_near` when `targetId` is absent. */
  position?: [number, number, number];
  /** Optional human-readable condition description. */
  description?: string;
  metadata?: Record<string, unknown>;
}

// ── Action — consequence executed when all predicates match ──

/**
 * Action kind. Drives how the SLF runtime executes the consequence.
 *
 * - spawn_entity      — instantiate an entity from a template or id
 * - unlock_zone       — change Zone accessibility to open
 * - lock_zone         — change Zone accessibility to closed
 * - grant_item        — add Item to entity inventory
 * - grant_skill       — unlock Skill for entity
 * - trigger_encounter — immediately arm/fire an Encounter
 * - remove_item       — remove Item from entity inventory
 * - broadcast_event   — emit a named event to the world bus
 * - action-other      — anything outside the enumerated set; describe in
 *   `SpatialAction.kindLabel`.
 */
export const ACTION_KINDS = [
  'spawn_entity',
  'unlock_zone',
  'lock_zone',
  'grant_item',
  'grant_skill',
  'trigger_encounter',
  'remove_item',
  'broadcast_event',
  'action-other',
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export interface SpatialAction {
  /** Stable action id within the parent rule. */
  id: string;
  /** Action family. Use `action-other` and `kindLabel` for off-list. */
  kind: ActionKind;
  /** Free-form kind label when `kind` is `action-other`. */
  kindLabel?: string;
  /** Target id — meaning depends on `kind`:
   *   spawn_entity      → entity template id or Item/Skill id
   *   unlock_zone       → Zone.id
   *   lock_zone         → Zone.id
   *   grant_item        → Item.id
   *   grant_skill       → Skill.id
   *   trigger_encounter → Encounter.id
   *   remove_item       → Item.id
   *   broadcast_event   → event name (not a world id)
   */
  targetId?: string;
  /** Quantity for `grant_item` / `remove_item`. Defaults to 1. */
  quantity?: number;
  /** Spawn position `[x, y, z]` for `spawn_entity`. */
  spawnPosition?: [number, number, number];
  /** Optional human-readable action description. */
  description?: string;
  metadata?: Record<string, unknown>;
}

// ── Rule — single SLF rule binding predicates → actions ──

/**
 * Predicate evaluation mode. Determines how multiple predicates combine.
 */
export type PredicateMode = 'all' | 'any';

export interface SpatialRule {
  /** Stable rule id, e.g. `rule_gate_open_on_key`. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** One-line description of what this rule does. */
  description?: string;
  /** Predicates that must hold. Empty array = always true. */
  predicates: SpatialPredicate[];
  /** How predicates combine. Defaults to `all`. */
  predicateMode?: PredicateMode;
  /** Actions executed when predicates match. */
  actions: SpatialAction[];
  /** Zone id this rule is scoped to (optional; global when absent). */
  zoneId?: string;
  /** Whether the rule is currently enabled. Defaults to true. */
  enabled?: boolean;
  /** Priority for tie-breaking when multiple rules match. Higher = earlier. */
  priority?: number;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  metadata?: Record<string, unknown>;
}

// ── Type guards ──

export function isSupportedPredicateKind(kind: string): kind is PredicateKind {
  return (PREDICATE_KINDS as readonly string[]).includes(kind);
}

export function isSupportedActionKind(kind: string): kind is ActionKind {
  return (ACTION_KINDS as readonly string[]).includes(kind);
}

// ── Validators ──

export function validateSpatialPredicate(predicate: SpatialPredicate): string[] {
  const errors: string[] = [];
  if (!predicate.id) errors.push('SpatialPredicate.id is required.');
  if (!isSupportedPredicateKind(predicate.kind)) {
    errors.push(`SpatialPredicate.kind is unsupported: ${String(predicate.kind)}.`);
  }
  if (predicate.kind === 'predicate-other' && !predicate.kindLabel) {
    errors.push(`SpatialPredicate ${predicate.id} kind=predicate-other requires kindLabel.`);
  }
  if (predicate.radius !== undefined && (!Number.isFinite(predicate.radius) || predicate.radius < 0)) {
    errors.push(`SpatialPredicate ${predicate.id}.radius must be a non-negative finite number.`);
  }
  if (predicate.timeRange !== undefined) {
    const [start, end] = predicate.timeRange;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || start >= end) {
      errors.push(`SpatialPredicate ${predicate.id}.timeRange must be [start, end] with 0 <= start < end <= 24.`);
    }
  }
  if (predicate.chance !== undefined && (!Number.isFinite(predicate.chance) || predicate.chance < 0 || predicate.chance > 1)) {
    errors.push(`SpatialPredicate ${predicate.id}.chance must be a finite number in [0, 1].`);
  }
  if (predicate.position !== undefined) {
    if (!Array.isArray(predicate.position) || predicate.position.length !== 3 || !predicate.position.every(Number.isFinite)) {
      errors.push(`SpatialPredicate ${predicate.id}.position must be a finite [x, y, z] tuple.`);
    }
  }
  return errors;
}

export function validateSpatialAction(action: SpatialAction): string[] {
  const errors: string[] = [];
  if (!action.id) errors.push('SpatialAction.id is required.');
  if (!isSupportedActionKind(action.kind)) {
    errors.push(`SpatialAction.kind is unsupported: ${String(action.kind)}.`);
  }
  if (action.kind === 'action-other' && !action.kindLabel) {
    errors.push(`SpatialAction ${action.id} kind=action-other requires kindLabel.`);
  }
  if (action.quantity !== undefined && (!Number.isFinite(action.quantity) || action.quantity < 1)) {
    errors.push(`SpatialAction ${action.id}.quantity must be a finite number >= 1.`);
  }
  if (action.spawnPosition !== undefined) {
    if (!Array.isArray(action.spawnPosition) || action.spawnPosition.length !== 3 || !action.spawnPosition.every(Number.isFinite)) {
      errors.push(`SpatialAction ${action.id}.spawnPosition must be a finite [x, y, z] tuple.`);
    }
  }
  return errors;
}

export function validateSpatialRule(rule: SpatialRule): string[] {
  const errors: string[] = [];
  if (!rule.id) errors.push('SpatialRule.id is required.');
  if (!rule.name) errors.push(`SpatialRule ${rule.id || '<unknown>'}.name is required.`);
  if (!Array.isArray(rule.predicates)) {
    errors.push(`SpatialRule ${rule.id}.predicates must be an array.`);
  } else {
    for (const predicate of rule.predicates) {
      for (const e of validateSpatialPredicate(predicate)) {
        errors.push(`SpatialRule ${rule.id}.predicates[${predicate.id || '<unknown>'}]: ${e}`);
      }
    }
  }
  if (!Array.isArray(rule.actions)) {
    errors.push(`SpatialRule ${rule.id}.actions must be an array.`);
  } else if (rule.actions.length === 0) {
    errors.push(`SpatialRule ${rule.id}.actions must be non-empty.`);
  } else {
    for (const action of rule.actions) {
      for (const e of validateSpatialAction(action)) {
        errors.push(`SpatialRule ${rule.id}.actions[${action.id || '<unknown>'}]: ${e}`);
      }
    }
  }
  if (rule.predicateMode !== undefined && rule.predicateMode !== 'all' && rule.predicateMode !== 'any') {
    errors.push(`SpatialRule ${rule.id}.predicateMode must be 'all' or 'any'.`);
  }
  if (rule.priority !== undefined && !Number.isFinite(rule.priority)) {
    errors.push(`SpatialRule ${rule.id}.priority must be a finite number.`);
  }
  return errors;
}

// ── Cloning ──

export function cloneSpatialPredicate(predicate: SpatialPredicate): SpatialPredicate {
  return {
    ...predicate,
    ...(predicate.timeRange ? { timeRange: [...predicate.timeRange] as [number, number] } : {}),
    ...(predicate.position ? { position: [...predicate.position] as [number, number, number] } : {}),
    ...(predicate.spawnPosition ? { spawnPosition: [...predicate.spawnPosition] as [number, number, number] } : {}),
    ...(predicate.metadata ? { metadata: { ...predicate.metadata } } : {}),
  };
}

export function cloneSpatialAction(action: SpatialAction): SpatialAction {
  return {
    ...action,
    ...(action.spawnPosition ? { spawnPosition: [...action.spawnPosition] as [number, number, number] } : {}),
    ...(action.metadata ? { metadata: { ...action.metadata } } : {}),
  };
}

export function cloneSpatialRule(rule: SpatialRule): SpatialRule {
  return {
    ...rule,
    predicates: rule.predicates.map(cloneSpatialPredicate),
    actions: rule.actions.map(cloneSpatialAction),
    ...(rule.provenance ? { provenance: { ...rule.provenance } } : {}),
    ...(rule.metadata ? { metadata: { ...rule.metadata } } : {}),
  };
}
