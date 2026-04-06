/**
 * Schema Diff Engine for Hot-Reload
 *
 * Compares old and new template state blocks to detect structural changes.
 * Used by the HotReloader to determine which migrations are needed.
 *
 * 5 field change types:
 * 1. Field added → apply default value from new schema
 * 2. Field removed → drop silently (warn in dev mode)
 * 3. Field type changed → require explicit migrate from(N) handler
 * 4. Field renamed → no auto-detect; migration function must handle
 * 5. Field default changed → apply new default to instances still holding old default
 */

import type {
  HoloState,
  HoloStateProperty,
  HoloValue,
  HoloTemplate,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

export type FieldChangeKind =
  | 'added'
  | 'removed'
  | 'type_changed'
  | 'default_changed'
  | 'reactive_changed';

export interface FieldChange {
  kind: FieldChangeKind;
  key: string;
  oldValue?: HoloValue;
  newValue?: HoloValue;
  oldType?: string;
  newType?: string;
  requiresMigration: boolean;
}

export interface SchemaDiffResult {
  hasChanges: boolean;
  changes: FieldChange[];
  added: FieldChange[];
  removed: FieldChange[];
  typeChanged: FieldChange[];
  defaultChanged: FieldChange[];
  reactiveChanged: FieldChange[];
  requiresMigration: boolean;
  summary: string;
}

export interface MigrationChain {
  fromVersion: number;
  toVersion: number;
  steps: MigrationStep[];
}

export interface MigrationStep {
  fromVersion: number;
  body: unknown; // Statement list or raw code string
}

// =============================================================================
// VALUE TYPE DETECTION
// =============================================================================

function getValueType(value: HoloValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && '__bind' in value) return 'bind';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

function valuesEqual(a: HoloValue, b: HoloValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => valuesEqual(v, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, HoloValue>;
    const bObj = b as Record<string, HoloValue>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => bKeys.includes(k) && valuesEqual(aObj[k], bObj[k]));
  }

  return false;
}

// =============================================================================
// SCHEMA DIFF
// =============================================================================

/**
 * Compare two state blocks and return a diff describing all field-level changes.
 */
export function diffState(
  oldState: HoloState | undefined,
  newState: HoloState | undefined
): SchemaDiffResult {
  const oldProps = stateToMap(oldState);
  const newProps = stateToMap(newState);

  const changes: FieldChange[] = [];

  // Check all old fields
  for (const [key, oldProp] of oldProps) {
    const newProp = newProps.get(key);

    if (!newProp) {
      // Field removed
      changes.push({
        kind: 'removed',
        key,
        oldValue: oldProp.value,
        oldType: getValueType(oldProp.value),
        requiresMigration: false, // silently dropped
      });
    } else {
      const oldType = getValueType(oldProp.value);
      const newType = getValueType(newProp.value);

      if (oldType !== newType) {
        // Type changed — requires migration
        changes.push({
          kind: 'type_changed',
          key,
          oldValue: oldProp.value,
          newValue: newProp.value,
          oldType,
          newType,
          requiresMigration: true,
        });
      } else if (!valuesEqual(oldProp.value, newProp.value)) {
        // Default value changed
        changes.push({
          kind: 'default_changed',
          key,
          oldValue: oldProp.value,
          newValue: newProp.value,
          requiresMigration: false,
        });
      }

      if (oldProp.reactive !== newProp.reactive) {
        changes.push({
          kind: 'reactive_changed',
          key,
          oldValue: oldProp.value,
          newValue: newProp.value,
          requiresMigration: false,
        });
      }
    }
  }

  // Check for new fields
  for (const [key, newProp] of newProps) {
    if (!oldProps.has(key)) {
      changes.push({
        kind: 'added',
        key,
        newValue: newProp.value,
        newType: getValueType(newProp.value),
        requiresMigration: false,
      });
    }
  }

  const added = changes.filter((c) => c.kind === 'added');
  const removed = changes.filter((c) => c.kind === 'removed');
  const typeChanged = changes.filter((c) => c.kind === 'type_changed');
  const defaultChanged = changes.filter((c) => c.kind === 'default_changed');
  const reactiveChanged = changes.filter((c) => c.kind === 'reactive_changed');
  const requiresMigration = typeChanged.length > 0;
  const hasChanges = changes.length > 0;

  const parts: string[] = [];
  if (added.length) parts.push(`+${added.length} added`);
  if (removed.length) parts.push(`-${removed.length} removed`);
  if (typeChanged.length) parts.push(`~${typeChanged.length} type changed`);
  if (defaultChanged.length) parts.push(`=${defaultChanged.length} default changed`);
  if (reactiveChanged.length) parts.push(`r${reactiveChanged.length} reactive changed`);

  return {
    hasChanges,
    changes,
    added,
    removed,
    typeChanged,
    defaultChanged,
    reactiveChanged,
    requiresMigration,
    summary: hasChanges ? parts.join(', ') : 'no changes',
  };
}

// =============================================================================
// MIGRATION CHAIN BUILDER
// =============================================================================

/**
 * Build an ordered migration chain from oldVersion to newVersion using
 * the template's migration blocks. Returns null if chain is incomplete.
 */
export function buildMigrationChain(
  template: HoloTemplate,
  oldVersion: number,
  newVersion: number
): MigrationChain | null {
  if (!template.migrations || template.migrations.length === 0) {
    return null;
  }

  // Sort migrations by fromVersion ascending
  const sorted = [...template.migrations].sort((a, b) => a.fromVersion - b.fromVersion);

  const steps: MigrationStep[] = [];
  let currentVersion = oldVersion;

  while (currentVersion < newVersion) {
    const migration = sorted.find((m) => m.fromVersion === currentVersion);
    if (!migration) {
      // Gap in migration chain
      return null;
    }
    steps.push({
      fromVersion: migration.fromVersion,
      body: migration.body,
    });
    currentVersion = migration.fromVersion + 1;
  }

  return {
    fromVersion: oldVersion,
    toVersion: newVersion,
    steps,
  };
}

// =============================================================================
// STATE SNAPSHOT
// =============================================================================

/**
 * Deep-clone a state map for copy-on-write snapshots.
 */
export function snapshotState(state: Map<string, HoloValue>): Map<string, HoloValue> {
  const snapshot = new Map<string, HoloValue>();
  for (const [key, value] of state) {
    snapshot.set(key, deepCloneValue(value));
  }
  return snapshot;
}

/**
 * Apply automatic field changes (added/removed/default_changed) to an instance's state.
 * Type changes are NOT applied — they require a migration function.
 */
export function applyAutoMigration(
  instanceState: Map<string, HoloValue>,
  diff: SchemaDiffResult,
  oldDefaults: Map<string, HoloValue>
): void {
  // Add new fields with their default values
  for (const change of diff.added) {
    if (!instanceState.has(change.key) && change.newValue !== undefined) {
      instanceState.set(change.key, deepCloneValue(change.newValue));
    }
  }

  // Remove dropped fields
  for (const change of diff.removed) {
    instanceState.delete(change.key);
  }

  // Update defaults: if instance still holds the old default, apply the new one
  for (const change of diff.defaultChanged) {
    if (change.oldValue !== undefined && change.newValue !== undefined) {
      const current = instanceState.get(change.key);
      const oldDefault = oldDefaults.get(change.key);
      if (oldDefault !== undefined && valuesEqual(current ?? null, oldDefault)) {
        instanceState.set(change.key, deepCloneValue(change.newValue));
      }
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function stateToMap(
  state: HoloState | Record<string, any> | undefined
): Map<string, HoloStateProperty> {
  const map = new Map<string, HoloStateProperty>();
  if (!state) return map;

  const stateRec = state as Record<string, unknown>;
  if ('properties' in state && Array.isArray(stateRec.properties)) {
    // Declarative .holo format
    for (const prop of stateRec.properties as HoloStateProperty[]) {
      map.set(prop.key, prop);
    }
  } else {
    // HoloScript+ format (Record)
    const props =
      'properties' in state
        ? (state.properties as Record<string, any>)
        : (state as Record<string, any>);
    for (const [key, value] of Object.entries(props)) {
      // Skip internal properties
      if (key.startsWith('__')) continue;

      map.set(key, {
        type: 'StateProperty',
        key,
        value,
        reactive: true,
      } as HoloStateProperty);
    }
  }
  return map;
}

function deepCloneValue(value: HoloValue): HoloValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepCloneValue);
  const obj = value as Record<string, HoloValue>;
  const clone: Record<string, HoloValue> = {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepCloneValue(obj[key]);
  }
  return clone;
}
