/**
 * SceneDiffer — Compute the minimal ASTMutation[] between two HoloComposition ASTs.
 *
 * Strategy (top-down, name-stable):
 *   1. Objects at each scope are matched by name.
 *   2. Added objects → addObject mutations.
 *   3. Removed objects → removeObject mutations.
 *   4. Same-name objects → diff properties, traits, children recursively.
 *   5. Spatial groups, lights, camera, environment, timelines diffed similarly.
 *
 * The diff is *name-stable*: renaming an object is detected as remove + add
 * (no rename mutation inferred) because the visual editor already emits explicit
 * rename mutations when the user renames via UI.
 *
 * @package @holoscript/studio
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectProperty,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloLight,
  HoloLightProperty,
  HoloCamera,
  HoloCameraProperty,
  HoloTimeline,
  HoloTimelineEntry,
  HoloGroupProperty,
  HoloValue,
} from '../../parser/HoloCompositionTypes';
import type {
  ASTMutation,
  AddObjectMutation,
  RemoveObjectMutation,
  UpdateObjectPropertyMutation,
  AddTraitMutation,
  RemoveTraitMutation,
  UpdateTraitConfigMutation,
  AddSpatialGroupMutation,
  MoveObjectToGroupMutation,
  UpdateLightMutation,
  AddLightMutation,
  RemoveLightMutation,
  UpdateCameraMutation,
  UpdateEnvironmentPropertyMutation,
  AddTimelineEntryMutation,
  RemoveTimelineEntryMutation,
  UpdatePositionMutation,
  UpdateRotationMutation,
  UpdateScaleMutation,
} from '../StudioBridge';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DiffResult {
  mutations: ASTMutation[];
  /** Names of objects that were structurally modified (for UI highlight) */
  affectedObjectNames: string[];
}

/**
 * Diff two HoloComposition ASTs and return the minimal mutation sequence.
 *
 * @param prev Previous AST snapshot
 * @param next New AST snapshot
 * @returns DiffResult containing mutations and affected object names
 */
export function diffScenes(prev: HoloComposition, next: HoloComposition): DiffResult {
  const mutations: ASTMutation[] = [];
  const affected: Set<string> = new Set();
  const now = Date.now();
  const src: ASTMutation['source'] = 'code';

  diffObjectList(prev.objects, next.objects, mutations, affected, now, src);
  diffGroups(prev.spatialGroups, next.spatialGroups, mutations, affected, now, src);
  diffLights(prev.lights, next.lights, mutations, now, src);
  diffCamera(prev.camera, next.camera, mutations, now, src);
  diffEnvironment(prev.environment, next.environment, mutations, now, src);
  diffTimelines(prev.timelines, next.timelines, mutations, now, src);

  return { mutations, affectedObjectNames: Array.from(affected) };
}

// ---------------------------------------------------------------------------
// Object list diff
// ---------------------------------------------------------------------------

function diffObjectList(
  prev: HoloObjectDecl[],
  next: HoloObjectDecl[],
  mutations: ASTMutation[],
  affected: Set<string>,
  now: number,
  src: ASTMutation['source']
): void {
  const prevMap = new Map(prev.map((o) => [o.name, o]));
  const nextMap = new Map(next.map((o) => [o.name, o]));

  // Added objects
  for (const obj of next) {
    if (!prevMap.has(obj.name)) {
      mutations.push({
        type: 'addObject',
        object: deepClone(obj),
        timestamp: now,
        source: src,
      } as AddObjectMutation);
      affected.add(obj.name);
    }
  }

  // Removed objects
  for (const obj of prev) {
    if (!nextMap.has(obj.name)) {
      mutations.push({
        type: 'removeObject',
        objectName: obj.name,
        timestamp: now,
        source: src,
      } as RemoveObjectMutation);
      affected.add(obj.name);
    }
  }

  // Modified objects (same name)
  for (const obj of next) {
    const oldObj = prevMap.get(obj.name);
    if (oldObj) {
      diffObject(oldObj, obj, mutations, affected, now, src);
    }
  }
}

function diffObject(
  prev: HoloObjectDecl,
  next: HoloObjectDecl,
  mutations: ASTMutation[],
  affected: Set<string>,
  now: number,
  src: ASTMutation['source']
): void {
  const name = next.name;
  let changed = false;

  // Properties
  const propDiff = diffProperties(prev.properties, next.properties);
  for (const p of propDiff.added) {
    mutations.push({
      type: 'updateObjectProperty',
      objectName: name,
      key: p.key,
      value: deepClone(p.value),
      timestamp: now,
      source: src,
    } as UpdateObjectPropertyMutation);
    changed = true;
  }
  for (const p of propDiff.updated) {
    mutations.push({
      type: 'updateObjectProperty',
      objectName: name,
      key: p.key,
      value: deepClone(p.newValue),
      timestamp: now,
      source: src,
    } as UpdateObjectPropertyMutation);
    changed = true;
  }
  for (const key of propDiff.removed) {
    // StudioBridge has no remove-property mutation; set to null as sentinel
    mutations.push({
      type: 'updateObjectProperty',
      objectName: name,
      key,
      value: null as unknown as HoloValue,
      timestamp: now,
      source: src,
    } as UpdateObjectPropertyMutation);
    changed = true;
  }

  // Special-case transform properties into dedicated mutations when possible
  consolidateTransformMutations(mutations, name);

  // Traits
  const traitDiff = diffTraits(prev.traits, next.traits);
  for (const t of traitDiff.added) {
    mutations.push({
      type: 'addTrait',
      objectName: name,
      trait: deepClone(t),
      timestamp: now,
      source: src,
    } as AddTraitMutation);
    changed = true;
  }
  for (const t of traitDiff.removed) {
    mutations.push({
      type: 'removeTrait',
      objectName: name,
      traitName: t.name,
      timestamp: now,
      source: src,
    } as RemoveTraitMutation);
    changed = true;
  }
  for (const t of traitDiff.updated) {
    for (const [configKey, configValue] of Object.entries(t.newConfig)) {
      mutations.push({
        type: 'updateTraitConfig',
        objectName: name,
        traitName: t.name,
        configKey,
        configValue: deepClone(configValue as HoloValue),
        timestamp: now,
        source: src,
      } as UpdateTraitConfigMutation);
      changed = true;
    }
  }

  // Children (recurse)
  if (prev.children || next.children) {
    diffObjectList(prev.children ?? [], next.children ?? [], mutations, affected, now, src);
  }

  if (changed) {
    affected.add(name);
  }
}

// ---------------------------------------------------------------------------
// Property / trait helpers
// ---------------------------------------------------------------------------

interface PropertyDiff {
  added: HoloObjectProperty[];
  updated: { key: string; newValue: HoloValue }[];
  removed: string[];
}

function diffProperties(prev: HoloObjectProperty[] = [], next: HoloObjectProperty[] = []): PropertyDiff {
  const prevMap = new Map(prev.map((p) => [p.key, p]));
  const nextMap = new Map(next.map((p) => [p.key, p]));

  const added: HoloObjectProperty[] = [];
  const updated: { key: string; newValue: HoloValue }[] = [];
  const removed: string[] = [];

  for (const p of next) {
    if (!prevMap.has(p.key)) {
      added.push(p);
    } else if (!valueEqual(prevMap.get(p.key)!.value, p.value)) {
      updated.push({ key: p.key, newValue: p.value });
    }
  }

  for (const p of prev) {
    if (!nextMap.has(p.key)) {
      removed.push(p.key);
    }
  }

  return { added, updated, removed };
}

interface TraitDiffResult {
  added: HoloObjectTrait[];
  removed: HoloObjectTrait[];
  updated: { name: string; newConfig: Record<string, unknown> }[];
}

function diffTraits(prev: HoloObjectTrait[] = [], next: HoloObjectTrait[] = []): TraitDiffResult {
  const prevMap = new Map(prev.map((t) => [t.name, t]));
  const nextMap = new Map(next.map((t) => [t.name, t]));

  const added: HoloObjectTrait[] = [];
  const removed: HoloObjectTrait[] = [];
  const updated: { name: string; newConfig: Record<string, unknown> }[] = [];

  for (const t of next) {
    if (!prevMap.has(t.name)) {
      added.push(t);
    } else {
      const oldConfig = prevMap.get(t.name)!.config ?? {};
      const newConfig = t.config ?? {};
      if (!objectEqual(oldConfig, newConfig)) {
        updated.push({ name: t.name, newConfig });
      }
    }
  }

  for (const t of prev) {
    if (!nextMap.has(t.name)) {
      removed.push(t);
    }
  }

  return { added, removed, updated };
}

// ---------------------------------------------------------------------------
// Transform consolidation — convert updateObjectProperty(position/rotation/scale)
// into dedicated transform mutations so the renderer can animate them.
// ---------------------------------------------------------------------------

function consolidateTransformMutations(mutations: ASTMutation[], objectName: string): void {
  const transformKeys = ['position', 'rotation', 'scale'];
  for (let i = mutations.length - 1; i >= 0; i--) {
    const m = mutations[i];
    if (m.type !== 'updateObjectProperty' || m.objectName !== objectName) continue;
    const key = m.key;
    if (!transformKeys.includes(key)) continue;

    const val = m.value;
    // Remove the generic property mutation
    mutations.splice(i, 1);

    // Insert dedicated transform mutation at the same index
    const now = m.timestamp;
    const src = m.source;
    let replacement: ASTMutation;

    if (key === 'position') {
      replacement = {
        type: 'updatePosition',
        objectName,
        position: (Array.isArray(val) ? val : [0, 0, 0]) as [number, number, number],
        timestamp: now,
        source: src,
      } as UpdatePositionMutation;
    } else if (key === 'rotation') {
      replacement = {
        type: 'updateRotation',
        objectName,
        rotation: (Array.isArray(val) ? val : [0, 0, 0]) as [number, number, number],
        timestamp: now,
        source: src,
      } as UpdateRotationMutation;
    } else {
      replacement = {
        type: 'updateScale',
        objectName,
        scale: (Array.isArray(val) ? val : typeof val === 'number' ? val : 1) as
          | [number, number, number]
          | number,
        timestamp: now,
        source: src,
      } as UpdateScaleMutation;
    }

    mutations.splice(i, 0, replacement);
  }
}

// ---------------------------------------------------------------------------
// Spatial groups
// ---------------------------------------------------------------------------

function diffGroups(
  prev: HoloSpatialGroup[],
  next: HoloSpatialGroup[],
  mutations: ASTMutation[],
  affected: Set<string>,
  now: number,
  src: ASTMutation['source']
): void {
  const prevMap = new Map(prev.map((g) => [g.name, g]));
  const nextMap = new Map(next.map((g) => [g.name, g]));

  // Added groups
  for (const g of next) {
    if (!prevMap.has(g.name)) {
      mutations.push({
        type: 'addSpatialGroup',
        group: deepClone(g),
        timestamp: now,
        source: src,
      } as AddSpatialGroupMutation);
    }
  }

  // Removed groups
  for (const g of prev) {
    if (!nextMap.has(g.name)) {
      // Remove all objects inside first (so undo works cleanly)
      for (const obj of g.objects) {
        mutations.push({
          type: 'removeObject',
          objectName: obj.name,
          timestamp: now,
          source: src,
        } as RemoveObjectMutation);
        affected.add(obj.name);
      }
      // No explicit remove-group mutation in StudioBridge; group removal
      // is implicit when all objects leave. We leave this as a gap note
      // for future bridge extension.
    }
  }

  // Modified groups
  for (const g of next) {
    const oldG = prevMap.get(g.name);
    if (oldG) {
      // Detect objects that moved between groups
      detectMoves(oldG, g, prev, next, mutations, affected, now, src);
      diffObjectList(oldG.objects, g.objects, mutations, affected, now, src);
      if (oldG.groups || g.groups) {
        diffGroups(oldG.groups ?? [], g.groups ?? [], mutations, affected, now, src);
      }
    }
  }
}

function detectMoves(
  oldG: HoloSpatialGroup,
  newG: HoloSpatialGroup,
  _allPrev: HoloSpatialGroup[],
  allNext: HoloSpatialGroup[],
  mutations: ASTMutation[],
  affected: Set<string>,
  now: number,
  src: ASTMutation['source']
): void {
  const oldNames = new Set(oldG.objects.map((o) => o.name));
  const newNames = new Set(newG.objects.map((o) => o.name));

  // Objects that disappeared from this group but exist elsewhere in new AST
  for (const oldObj of oldG.objects) {
    if (!newNames.has(oldObj.name)) {
      const foundIn = findGroupContaining(oldObj.name, allNext);
      if (foundIn && foundIn.name !== oldG.name) {
        mutations.push({
          type: 'moveObjectToGroup',
          objectName: oldObj.name,
          targetGroup: foundIn.name,
          timestamp: now,
          source: src,
        } as MoveObjectToGroupMutation);
        affected.add(oldObj.name);
      }
    }
  }

  // Objects that appeared in this group from elsewhere
  for (const newObj of newG.objects) {
    if (!oldNames.has(newObj.name)) {
      const foundIn = findGroupContaining(newObj.name, [oldG]);
      if (!foundIn) {
        // Object was not in this group before — it either moved here or is new.
        // If it's not in any prev group, it's already handled by addObject.
        // If it is in a prev group, it's a move handled above (when scanning
        // the old group). We only need to emit one move mutation.
      }
    }
  }
}

function findGroupContaining(name: string, groups: HoloSpatialGroup[]): HoloSpatialGroup | null {
  for (const g of groups) {
    if (g.objects.some((o) => o.name === name)) return g;
    if (g.groups) {
      const nested = findGroupContaining(name, g.groups);
      if (nested) return nested;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

function diffLights(
  prev: HoloLight[] = [],
  next: HoloLight[] = [],
  mutations: ASTMutation[],
  now: number,
  src: ASTMutation['source']
): void {
  const prevMap = new Map(prev.map((l) => [l.name, l]));
  const nextMap = new Map(next.map((l) => [l.name, l]));

  for (const l of next) {
    if (!prevMap.has(l.name)) {
      mutations.push({
        type: 'addLight',
        light: deepClone(l),
        timestamp: now,
        source: src,
      } as AddLightMutation);
    } else {
      const oldL = prevMap.get(l.name)!;
      const propDiff = diffLightProperties(oldL.properties, l.properties);
      for (const p of propDiff.added) {
        mutations.push({
          type: 'updateLight',
          lightName: l.name,
          key: p.key,
          value: deepClone(p.value),
          timestamp: now,
          source: src,
        } as UpdateLightMutation);
      }
      for (const p of propDiff.updated) {
        mutations.push({
          type: 'updateLight',
          lightName: l.name,
          key: p.key,
          value: deepClone(p.newValue),
          timestamp: now,
          source: src,
        } as UpdateLightMutation);
      }
    }
  }

  for (const l of prev) {
    if (!nextMap.has(l.name)) {
      mutations.push({
        type: 'removeLight',
        lightName: l.name,
        timestamp: now,
        source: src,
      } as RemoveLightMutation);
    }
  }
}

function diffLightProperties(
  prev: HoloLightProperty[] = [],
  next: HoloLightProperty[] = []
): { added: HoloLightProperty[]; updated: { key: string; newValue: HoloValue }[] } {
  const prevMap = new Map(prev.map((p) => [p.key, p]));
  const added: HoloLightProperty[] = [];
  const updated: { key: string; newValue: HoloValue }[] = [];

  for (const p of next) {
    if (!prevMap.has(p.key)) {
      added.push(p);
    } else if (!valueEqual(prevMap.get(p.key)!.value, p.value)) {
      updated.push({ key: p.key, newValue: p.value });
    }
  }
  return { added, updated };
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

function diffCamera(
  prev: HoloCamera | undefined,
  next: HoloCamera | undefined,
  mutations: ASTMutation[],
  now: number,
  src: ASTMutation['source']
): void {
  if (!prev && !next) return;
  if (!prev && next) {
    // Camera added — handled by updateCamera mutations for each property
    for (const p of next.properties ?? []) {
      mutations.push({
        type: 'updateCamera',
        key: p.key,
        value: deepClone(p.value),
        timestamp: now,
        source: src,
      } as UpdateCameraMutation);
    }
    return;
  }
  if (prev && !next) return; // No remove-camera mutation

  const prevMap = new Map((prev!.properties ?? []).map((p) => [p.key, p]));
  for (const p of next!.properties ?? []) {
    if (!prevMap.has(p.key) || !valueEqual(prevMap.get(p.key)!.value, p.value)) {
      mutations.push({
        type: 'updateCamera',
        key: p.key,
        value: deepClone(p.value),
        timestamp: now,
        source: src,
      } as UpdateCameraMutation);
    }
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function diffEnvironment(
  prev: { type: 'Environment'; properties?: HoloGroupProperty[] } | undefined,
  next: { type: 'Environment'; properties?: HoloGroupProperty[] } | undefined,
  mutations: ASTMutation[],
  now: number,
  src: ASTMutation['source']
): void {
  if (!prev && !next) return;
  if (!prev && next) {
    for (const p of next.properties ?? []) {
      mutations.push({
        type: 'updateEnvironmentProperty',
        key: p.key,
        value: deepClone(p.value),
        timestamp: now,
        source: src,
      } as UpdateEnvironmentPropertyMutation);
    }
    return;
  }
  if (prev && !next) return;

  const prevMap = new Map((prev!.properties ?? []).map((p) => [p.key, p]));
  for (const p of next!.properties ?? []) {
    if (!prevMap.has(p.key) || !valueEqual(prevMap.get(p.key)!.value, p.value)) {
      mutations.push({
        type: 'updateEnvironmentProperty',
        key: p.key,
        value: deepClone(p.value),
        timestamp: now,
        source: src,
      } as UpdateEnvironmentPropertyMutation);
    }
  }
}

// ---------------------------------------------------------------------------
// Timelines
// ---------------------------------------------------------------------------

function diffTimelines(
  prev: HoloTimeline[] = [],
  next: HoloTimeline[] = [],
  mutations: ASTMutation[],
  now: number,
  src: ASTMutation['source']
): void {
  const prevMap = new Map(prev.map((t) => [t.name, t]));
  const nextMap = new Map(next.map((t) => [t.name, t]));

  for (const t of next) {
    const oldT = prevMap.get(t.name);
    if (!oldT) continue; // New timeline — no add mutation available

    const oldEntries = oldT.entries;
    const newEntries = t.entries;

    // Naive diff: if lengths differ or any entry differs, replace all
    // (StudioBridge lacks fine-grained timeline entry mutations)
    if (oldEntries.length !== newEntries.length || !entriesEqual(oldEntries, newEntries)) {
      // Remove old entries in reverse order
      for (let i = oldEntries.length - 1; i >= 0; i--) {
        mutations.push({
          type: 'removeTimelineEntry',
          timelineName: t.name,
          entryIndex: i,
          timestamp: now,
          source: src,
        } as RemoveTimelineEntryMutation);
      }
      // Add new entries
      for (const e of newEntries) {
        mutations.push({
          type: 'addTimelineEntry',
          timelineName: t.name,
          entry: deepClone(e),
          timestamp: now,
          source: src,
        } as AddTimelineEntryMutation);
      }
    }
  }
}

function entriesEqual(a: HoloTimelineEntry[], b: HoloTimelineEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].time !== b[i].time || !objectEqual(a[i].action, b[i].action)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Equality helpers
// ---------------------------------------------------------------------------

function valueEqual(a: HoloValue, b: HoloValue): boolean {
  return objectEqual(a, b);
}

function objectEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!objectEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false;
    if (!objectEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Deep clone (JSON round-trip, same guard as StudioBridge)
// ---------------------------------------------------------------------------

function deepClone<T>(value: T): T {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return value;
    return JSON.parse(serialized) as T;
  } catch {
    return value;
  }
}
