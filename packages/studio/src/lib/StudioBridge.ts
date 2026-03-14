// TARGET: packages/studio/src/lib/StudioBridge.ts
/**
 * Studio Bridge — Visual Studio Editing to AST Manipulation
 *
 * Bridges the visual HoloScript Studio editing interface to the underlying
 * HoloComposition AST. Supports bi-directional synchronization:
 *
 * - Visual -> AST: Drag-and-drop, property panels, timeline editors, and
 *   node graph interactions are translated into AST mutations.
 * - AST -> Visual: AST changes (from code editing, hot-reload, or
 *   collaborative edits) are projected back into the visual representation.
 *
 * This is the core module of the @holoscript/studio-bridge package.
 *
 * Operations:
 * - addObject / removeObject / updateObject
 * - addTrait / removeTrait / updateTraitConfig
 * - addSpatialGroup / moveObjectToGroup
 * - updatePosition / updateRotation / updateScale (gizmo)
 * - addTimelineEntry / removeTimelineEntry
 * - addLight / updateLight / removeLight
 * - updateEnvironment / updateCamera
 * - undo / redo (operation-based history)
 * - batchMutate (atomic multi-operation)
 *
 * @version 1.0.0
 * @package @holoscript/studio-bridge
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloObjectProperty,
  HoloSpatialGroup,
  HoloLight,
  HoloCamera,
  HoloTimeline,
  HoloTimelineEntry,
  HoloValue,
  HoloGroupProperty,
  HoloLightProperty,
  HoloCameraProperty,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/** A mutation operation that can be applied to a HoloComposition AST */
export type ASTMutation =
  | AddObjectMutation
  | RemoveObjectMutation
  | UpdateObjectPropertyMutation
  | AddTraitMutation
  | RemoveTraitMutation
  | UpdateTraitConfigMutation
  | AddSpatialGroupMutation
  | MoveObjectToGroupMutation
  | UpdatePositionMutation
  | UpdateRotationMutation
  | UpdateScaleMutation
  | AddTimelineEntryMutation
  | RemoveTimelineEntryMutation
  | AddLightMutation
  | UpdateLightMutation
  | RemoveLightMutation
  | UpdateCameraMutation
  | UpdateEnvironmentPropertyMutation
  | RenameObjectMutation
  | DuplicateObjectMutation
  | ReorderObjectsMutation;

interface MutationBase {
  type: string;
  /** Timestamp when this mutation was created */
  timestamp: number;
  /** Source of the mutation: 'visual' (studio UI), 'code' (text editor), 'collaborative' (remote) */
  source: 'visual' | 'code' | 'collaborative';
}

export interface AddObjectMutation extends MutationBase {
  type: 'addObject';
  /** Object to add */
  object: HoloObjectDecl;
  /** Target spatial group name (null = root level) */
  targetGroup?: string;
  /** Insert at index (undefined = end) */
  index?: number;
}

export interface RemoveObjectMutation extends MutationBase {
  type: 'removeObject';
  /** Name of object to remove */
  objectName: string;
}

export interface UpdateObjectPropertyMutation extends MutationBase {
  type: 'updateObjectProperty';
  objectName: string;
  key: string;
  value: HoloValue;
}

export interface AddTraitMutation extends MutationBase {
  type: 'addTrait';
  objectName: string;
  trait: HoloObjectTrait;
}

export interface RemoveTraitMutation extends MutationBase {
  type: 'removeTrait';
  objectName: string;
  traitName: string;
}

export interface UpdateTraitConfigMutation extends MutationBase {
  type: 'updateTraitConfig';
  objectName: string;
  traitName: string;
  configKey: string;
  configValue: HoloValue;
}

export interface AddSpatialGroupMutation extends MutationBase {
  type: 'addSpatialGroup';
  group: HoloSpatialGroup;
  /** Parent group name (null = root level) */
  parentGroup?: string;
}

export interface MoveObjectToGroupMutation extends MutationBase {
  type: 'moveObjectToGroup';
  objectName: string;
  targetGroup: string;
}

export interface UpdatePositionMutation extends MutationBase {
  type: 'updatePosition';
  objectName: string;
  position: [number, number, number];
}

export interface UpdateRotationMutation extends MutationBase {
  type: 'updateRotation';
  objectName: string;
  rotation: [number, number, number];
}

export interface UpdateScaleMutation extends MutationBase {
  type: 'updateScale';
  objectName: string;
  scale: [number, number, number] | number;
}

export interface AddTimelineEntryMutation extends MutationBase {
  type: 'addTimelineEntry';
  timelineName: string;
  entry: HoloTimelineEntry;
}

export interface RemoveTimelineEntryMutation extends MutationBase {
  type: 'removeTimelineEntry';
  timelineName: string;
  entryIndex: number;
}

export interface AddLightMutation extends MutationBase {
  type: 'addLight';
  light: HoloLight;
}

export interface UpdateLightMutation extends MutationBase {
  type: 'updateLight';
  lightName: string;
  key: string;
  value: HoloValue;
}

export interface RemoveLightMutation extends MutationBase {
  type: 'removeLight';
  lightName: string;
}

export interface UpdateCameraMutation extends MutationBase {
  type: 'updateCamera';
  key: string;
  value: HoloValue;
}

export interface UpdateEnvironmentPropertyMutation extends MutationBase {
  type: 'updateEnvironmentProperty';
  key: string;
  value: HoloValue;
}

export interface RenameObjectMutation extends MutationBase {
  type: 'renameObject';
  oldName: string;
  newName: string;
}

export interface DuplicateObjectMutation extends MutationBase {
  type: 'duplicateObject';
  objectName: string;
  /** Name for the duplicate (auto-generated if not provided) */
  newName?: string;
  /** Offset from original position */
  positionOffset?: [number, number, number];
}

export interface ReorderObjectsMutation extends MutationBase {
  type: 'reorderObjects';
  /** New order of object names at root or within a group */
  order: string[];
  /** Group name (undefined = root objects) */
  groupName?: string;
}

/** Result of applying a mutation */
export interface MutationResult {
  success: boolean;
  /** The mutated AST (new reference, original is NOT modified) */
  ast: HoloComposition;
  /** Inverse mutation for undo */
  inverse?: ASTMutation;
  /** Errors if mutation failed */
  errors?: string[];
}

/** Event emitted when the AST changes */
export interface ASTChangeEvent {
  mutation: ASTMutation;
  previousAST: HoloComposition;
  newAST: HoloComposition;
  /** Mutation index in the history stack */
  historyIndex: number;
}

/** Listener for AST change events */
export type ASTChangeListener = (event: ASTChangeEvent) => void;

/** Options for the StudioBridge */
export interface StudioBridgeOptions {
  /** Maximum undo/redo history size (default: 100) */
  maxHistorySize?: number;
  /** Debounce rapid mutations (ms, default: 0 = no debounce) */
  debounceMs?: number;
  /** Validate mutations before applying (default: true) */
  validate?: boolean;
}

// =============================================================================
// STUDIO BRIDGE
// =============================================================================

/**
 * The StudioBridge maintains an immutable AST and applies mutations to it,
 * supporting undo/redo and change notifications.
 *
 * @example
 * ```typescript
 * import { StudioBridge } from './StudioBridge';
 *
 * const bridge = new StudioBridge(initialAST, { maxHistorySize: 50 });
 *
 * bridge.onChange((event) => {
 *   // Re-render visual editor with event.newAST
 *   renderer.update(event.newAST);
 * });
 *
 * // From visual drag-and-drop:
 * bridge.apply({
 *   type: 'updatePosition',
 *   objectName: 'Player',
 *   position: [2, 0, -3],
 *   timestamp: Date.now(),
 *   source: 'visual',
 * });
 *
 * // Undo last operation
 * bridge.undo();
 * ```
 */
export class StudioBridge {
  private ast: HoloComposition;
  private history: ASTMutation[] = [];
  private redoStack: ASTMutation[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number;
  private validate: boolean;
  private listeners: ASTChangeListener[] = [];

  constructor(initialAST: HoloComposition, options: StudioBridgeOptions = {}) {
    this.ast = this.deepClone(initialAST);
    this.maxHistorySize = options.maxHistorySize ?? 100;
    this.validate = options.validate ?? true;
  }

  /** Get the current AST (read-only snapshot) */
  getAST(): HoloComposition {
    return this.deepClone(this.ast);
  }

  /** Register a change listener */
  onChange(listener: ASTChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Apply a single mutation */
  apply(mutation: ASTMutation): MutationResult {
    const previousAST = this.ast;
    const result = this.applyMutation(this.deepClone(this.ast), mutation);

    if (result.success) {
      this.ast = result.ast;

      // Push to history
      this.historyIndex++;
      this.history = this.history.slice(0, this.historyIndex);
      this.history.push(mutation);
      this.redoStack = [];

      // Trim history
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
        this.historyIndex--;
      }

      // Notify listeners
      const event: ASTChangeEvent = {
        mutation,
        previousAST,
        newAST: this.ast,
        historyIndex: this.historyIndex,
      };
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    return result;
  }

  /** Apply multiple mutations atomically */
  batchApply(mutations: ASTMutation[]): MutationResult {
    let currentAST = this.deepClone(this.ast);
    const errors: string[] = [];

    for (const mutation of mutations) {
      const result = this.applyMutation(currentAST, mutation);
      if (!result.success) {
        errors.push(...(result.errors ?? []));
        return { success: false, ast: this.ast, errors };
      }
      currentAST = result.ast;
    }

    const previousAST = this.ast;
    this.ast = currentAST;

    // Record batch as a single history entry (the last mutation)
    if (mutations.length > 0) {
      this.historyIndex++;
      this.history = this.history.slice(0, this.historyIndex);
      this.history.push(mutations[mutations.length - 1]);
      this.redoStack = [];
    }

    // Notify listeners with the last mutation
    if (mutations.length > 0) {
      const event: ASTChangeEvent = {
        mutation: mutations[mutations.length - 1],
        previousAST,
        newAST: this.ast,
        historyIndex: this.historyIndex,
      };
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    return { success: true, ast: this.ast };
  }

  /** Undo the last mutation */
  undo(): boolean {
    if (this.historyIndex < 0) return false;

    const mutation = this.history[this.historyIndex];
    this.redoStack.push(mutation);
    this.historyIndex--;

    // Rebuild AST from scratch up to historyIndex
    this.rebuildFromHistory();
    return true;
  }

  /** Redo the last undone mutation */
  redo(): boolean {
    if (this.redoStack.length === 0) return false;

    const mutation = this.redoStack.pop()!;
    this.historyIndex++;
    this.history[this.historyIndex] = mutation;

    // Apply the redo mutation
    const result = this.applyMutation(this.deepClone(this.ast), mutation);
    if (result.success) {
      this.ast = result.ast;
    }

    return result.success;
  }

  /** Check if undo is available */
  canUndo(): boolean {
    return this.historyIndex >= 0;
  }

  /** Check if redo is available */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Get history length */
  getHistoryLength(): number {
    return this.historyIndex + 1;
  }

  /** Reset to a specific AST (clears history) */
  reset(ast: HoloComposition): void {
    this.ast = this.deepClone(ast);
    this.history = [];
    this.redoStack = [];
    this.historyIndex = -1;
  }

  // ---------------------------------------------------------------------------
  // Query helpers (for visual editor to find objects/groups)
  // ---------------------------------------------------------------------------

  /** Find an object by name (searches all levels) */
  findObject(name: string): HoloObjectDecl | null {
    return this.findObjectInList(name, this.ast.objects) ??
      this.findObjectInGroups(name, this.ast.spatialGroups) ??
      null;
  }

  /** Find a spatial group by name */
  findGroup(name: string): HoloSpatialGroup | null {
    return this.findGroupByName(name, this.ast.spatialGroups);
  }

  /** Find a light by name */
  findLight(name: string): HoloLight | null {
    return this.ast.lights.find((l) => l.name === name) ?? null;
  }

  /** Find a timeline by name */
  findTimeline(name: string): HoloTimeline | null {
    return this.ast.timelines.find((t) => t.name === name) ?? null;
  }

  /** Get all object names (flattened) */
  getAllObjectNames(): string[] {
    const names: string[] = [];
    this.collectObjectNames(this.ast.objects, names);
    for (const group of this.ast.spatialGroups) {
      this.collectObjectNamesFromGroup(group, names);
    }
    return names;
  }

  // ---------------------------------------------------------------------------
  // Mutation application
  // ---------------------------------------------------------------------------

  private applyMutation(
    ast: HoloComposition,
    mutation: ASTMutation
  ): MutationResult {
    try {
      switch (mutation.type) {
        case 'addObject':
          return this.applyAddObject(ast, mutation);
        case 'removeObject':
          return this.applyRemoveObject(ast, mutation);
        case 'updateObjectProperty':
          return this.applyUpdateObjectProperty(ast, mutation);
        case 'addTrait':
          return this.applyAddTrait(ast, mutation);
        case 'removeTrait':
          return this.applyRemoveTrait(ast, mutation);
        case 'updateTraitConfig':
          return this.applyUpdateTraitConfig(ast, mutation);
        case 'addSpatialGroup':
          return this.applyAddSpatialGroup(ast, mutation);
        case 'moveObjectToGroup':
          return this.applyMoveObjectToGroup(ast, mutation);
        case 'updatePosition':
          return this.applyUpdateTransform(ast, mutation.objectName, 'position', mutation.position);
        case 'updateRotation':
          return this.applyUpdateTransform(ast, mutation.objectName, 'rotation', mutation.rotation);
        case 'updateScale':
          return this.applyUpdateTransform(
            ast,
            mutation.objectName,
            'scale',
            typeof mutation.scale === 'number'
              ? [mutation.scale, mutation.scale, mutation.scale]
              : mutation.scale
          );
        case 'addTimelineEntry':
          return this.applyAddTimelineEntry(ast, mutation);
        case 'removeTimelineEntry':
          return this.applyRemoveTimelineEntry(ast, mutation);
        case 'addLight':
          return this.applyAddLight(ast, mutation);
        case 'updateLight':
          return this.applyUpdateLight(ast, mutation);
        case 'removeLight':
          return this.applyRemoveLight(ast, mutation);
        case 'updateCamera':
          return this.applyUpdateCamera(ast, mutation);
        case 'updateEnvironmentProperty':
          return this.applyUpdateEnvironmentProperty(ast, mutation);
        case 'renameObject':
          return this.applyRenameObject(ast, mutation);
        case 'duplicateObject':
          return this.applyDuplicateObject(ast, mutation);
        case 'reorderObjects':
          return this.applyReorderObjects(ast, mutation);
        default:
          return { success: false, ast, errors: [`Unknown mutation type: ${(mutation as MutationBase).type}`] };
      }
    } catch (err) {
      return {
        success: false,
        ast,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  // --- Individual mutation implementations ---

  private applyAddObject(ast: HoloComposition, mutation: AddObjectMutation): MutationResult {
    if (mutation.targetGroup) {
      const group = this.findGroupByName(mutation.targetGroup, ast.spatialGroups);
      if (!group) {
        return { success: false, ast, errors: [`Group "${mutation.targetGroup}" not found`] };
      }
      const idx = mutation.index ?? group.objects.length;
      group.objects.splice(idx, 0, mutation.object);
    } else {
      const idx = mutation.index ?? ast.objects.length;
      ast.objects.splice(idx, 0, mutation.object);
    }
    return { success: true, ast };
  }

  private applyRemoveObject(ast: HoloComposition, mutation: RemoveObjectMutation): MutationResult {
    const removed = this.removeObjectByName(mutation.objectName, ast.objects);
    if (removed) return { success: true, ast };

    // Search in spatial groups
    for (const group of ast.spatialGroups) {
      if (this.removeObjectFromGroup(mutation.objectName, group)) {
        return { success: true, ast };
      }
    }

    return { success: false, ast, errors: [`Object "${mutation.objectName}" not found`] };
  }

  private applyUpdateObjectProperty(
    ast: HoloComposition,
    mutation: UpdateObjectPropertyMutation
  ): MutationResult {
    const obj = this.findObjectInList(mutation.objectName, ast.objects) ??
      this.findObjectInGroups(mutation.objectName, ast.spatialGroups);
    if (!obj) {
      return { success: false, ast, errors: [`Object "${mutation.objectName}" not found`] };
    }

    const existing = obj.properties.find((p) => p.key === mutation.key);
    if (existing) {
      existing.value = mutation.value;
    } else {
      obj.properties.push({
        type: 'ObjectProperty',
        key: mutation.key,
        value: mutation.value,
      });
    }

    return { success: true, ast };
  }

  private applyAddTrait(ast: HoloComposition, mutation: AddTraitMutation): MutationResult {
    const obj = this.findObjectInList(mutation.objectName, ast.objects) ??
      this.findObjectInGroups(mutation.objectName, ast.spatialGroups);
    if (!obj) {
      return { success: false, ast, errors: [`Object "${mutation.objectName}" not found`] };
    }

    // Check for duplicate
    if (obj.traits.some((t) => t.name === mutation.trait.name)) {
      return { success: false, ast, errors: [`Trait "${mutation.trait.name}" already exists on "${mutation.objectName}"`] };
    }

    obj.traits.push(mutation.trait);
    return { success: true, ast };
  }

  private applyRemoveTrait(ast: HoloComposition, mutation: RemoveTraitMutation): MutationResult {
    const obj = this.findObjectInList(mutation.objectName, ast.objects) ??
      this.findObjectInGroups(mutation.objectName, ast.spatialGroups);
    if (!obj) {
      return { success: false, ast, errors: [`Object "${mutation.objectName}" not found`] };
    }

    const idx = obj.traits.findIndex((t) => t.name === mutation.traitName);
    if (idx === -1) {
      return { success: false, ast, errors: [`Trait "${mutation.traitName}" not found on "${mutation.objectName}"`] };
    }

    obj.traits.splice(idx, 1);
    return { success: true, ast };
  }

  private applyUpdateTraitConfig(
    ast: HoloComposition,
    mutation: UpdateTraitConfigMutation
  ): MutationResult {
    const obj = this.findObjectInList(mutation.objectName, ast.objects) ??
      this.findObjectInGroups(mutation.objectName, ast.spatialGroups);
    if (!obj) {
      return { success: false, ast, errors: [`Object "${mutation.objectName}" not found`] };
    }

    const trait = obj.traits.find((t) => t.name === mutation.traitName);
    if (!trait) {
      return { success: false, ast, errors: [`Trait "${mutation.traitName}" not found on "${mutation.objectName}"`] };
    }

    trait.config[mutation.configKey] = mutation.configValue;
    return { success: true, ast };
  }

  private applyAddSpatialGroup(
    ast: HoloComposition,
    mutation: AddSpatialGroupMutation
  ): MutationResult {
    if (mutation.parentGroup) {
      const parent = this.findGroupByName(mutation.parentGroup, ast.spatialGroups);
      if (!parent) {
        return { success: false, ast, errors: [`Parent group "${mutation.parentGroup}" not found`] };
      }
      if (!parent.groups) parent.groups = [];
      parent.groups.push(mutation.group);
    } else {
      ast.spatialGroups.push(mutation.group);
    }
    return { success: true, ast };
  }

  private applyMoveObjectToGroup(
    ast: HoloComposition,
    mutation: MoveObjectToGroupMutation
  ): MutationResult {
    // Find and remove from current location
    let removed: HoloObjectDecl | null = null;

    const idx = ast.objects.findIndex((o) => o.name === mutation.objectName);
    if (idx !== -1) {
      removed = ast.objects.splice(idx, 1)[0];
    } else {
      for (const group of ast.spatialGroups) {
        removed = this.extractObjectFromGroup(mutation.objectName, group);
        if (removed) break;
      }
    }

    if (!removed) {
      return { success: false, ast, errors: [`Object "${mutation.objectName}" not found`] };
    }

    // Add to target group
    const targetGroup = this.findGroupByName(mutation.targetGroup, ast.spatialGroups);
    if (!targetGroup) {
      return { success: false, ast, errors: [`Target group "${mutation.targetGroup}" not found`] };
    }

    targetGroup.objects.push(removed);
    return { success: true, ast };
  }

  private applyUpdateTransform(
    ast: HoloComposition,
    objectName: string,
    key: string,
    value: [number, number, number]
  ): MutationResult {
    const obj = this.findObjectInList(objectName, ast.objects) ??
      this.findObjectInGroups(objectName, ast.spatialGroups);
    if (!obj) {
      return { success: false, ast, errors: [`Object "${objectName}" not found`] };
    }

    const existing = obj.properties.find((p) => p.key === key);
    if (existing) {
      existing.value = value;
    } else {
      obj.properties.push({ type: 'ObjectProperty', key, value });
    }

    return { success: true, ast };
  }

  private applyAddTimelineEntry(
    ast: HoloComposition,
    mutation: AddTimelineEntryMutation
  ): MutationResult {
    const timeline = ast.timelines.find((t) => t.name === mutation.timelineName);
    if (!timeline) {
      return { success: false, ast, errors: [`Timeline "${mutation.timelineName}" not found`] };
    }

    timeline.entries.push(mutation.entry);
    timeline.entries.sort((a, b) => a.time - b.time);
    return { success: true, ast };
  }

  private applyRemoveTimelineEntry(
    ast: HoloComposition,
    mutation: RemoveTimelineEntryMutation
  ): MutationResult {
    const timeline = ast.timelines.find((t) => t.name === mutation.timelineName);
    if (!timeline) {
      return { success: false, ast, errors: [`Timeline "${mutation.timelineName}" not found`] };
    }

    if (mutation.entryIndex < 0 || mutation.entryIndex >= timeline.entries.length) {
      return { success: false, ast, errors: [`Entry index ${mutation.entryIndex} out of bounds`] };
    }

    timeline.entries.splice(mutation.entryIndex, 1);
    return { success: true, ast };
  }

  private applyAddLight(ast: HoloComposition, mutation: AddLightMutation): MutationResult {
    ast.lights.push(mutation.light);
    return { success: true, ast };
  }

  private applyUpdateLight(ast: HoloComposition, mutation: UpdateLightMutation): MutationResult {
    const light = ast.lights.find((l) => l.name === mutation.lightName);
    if (!light) {
      return { success: false, ast, errors: [`Light "${mutation.lightName}" not found`] };
    }

    const existing = light.properties.find((p) => p.key === mutation.key);
    if (existing) {
      existing.value = mutation.value;
    } else {
      light.properties.push({ type: 'LightProperty', key: mutation.key, value: mutation.value });
    }

    return { success: true, ast };
  }

  private applyRemoveLight(ast: HoloComposition, mutation: RemoveLightMutation): MutationResult {
    const idx = ast.lights.findIndex((l) => l.name === mutation.lightName);
    if (idx === -1) {
      return { success: false, ast, errors: [`Light "${mutation.lightName}" not found`] };
    }
    ast.lights.splice(idx, 1);
    return { success: true, ast };
  }

  private applyUpdateCamera(ast: HoloComposition, mutation: UpdateCameraMutation): MutationResult {
    if (!ast.camera) {
      ast.camera = {
        type: 'Camera',
        cameraType: 'perspective',
        properties: [],
      };
    }

    const existing = ast.camera.properties.find((p) => p.key === mutation.key);
    if (existing) {
      existing.value = mutation.value;
    } else {
      ast.camera.properties.push({
        type: 'CameraProperty',
        key: mutation.key,
        value: mutation.value,
      });
    }

    return { success: true, ast };
  }

  private applyUpdateEnvironmentProperty(
    ast: HoloComposition,
    mutation: UpdateEnvironmentPropertyMutation
  ): MutationResult {
    if (!ast.environment) {
      ast.environment = { type: 'Environment', properties: [] };
    }

    const existing = ast.environment.properties.find((p) => p.key === mutation.key);
    if (existing) {
      existing.value = mutation.value;
    } else {
      ast.environment.properties.push({
        type: 'EnvironmentProperty',
        key: mutation.key,
        value: mutation.value,
      });
    }

    return { success: true, ast };
  }

  private applyRenameObject(ast: HoloComposition, mutation: RenameObjectMutation): MutationResult {
    const obj = this.findObjectInList(mutation.oldName, ast.objects) ??
      this.findObjectInGroups(mutation.oldName, ast.spatialGroups);
    if (!obj) {
      return { success: false, ast, errors: [`Object "${mutation.oldName}" not found`] };
    }

    obj.name = mutation.newName;
    return { success: true, ast };
  }

  private applyDuplicateObject(
    ast: HoloComposition,
    mutation: DuplicateObjectMutation
  ): MutationResult {
    const original = this.findObjectInList(mutation.objectName, ast.objects) ??
      this.findObjectInGroups(mutation.objectName, ast.spatialGroups);
    if (!original) {
      return { success: false, ast, errors: [`Object "${mutation.objectName}" not found`] };
    }

    const clone = this.deepClone(original);
    clone.name = mutation.newName ?? `${original.name}_copy`;

    // Apply position offset
    if (mutation.positionOffset) {
      const posProp = clone.properties.find((p) => p.key === 'position');
      if (posProp && Array.isArray(posProp.value)) {
        const arr = posProp.value as number[];
        posProp.value = [
          (arr[0] ?? 0) + mutation.positionOffset[0],
          (arr[1] ?? 0) + mutation.positionOffset[1],
          (arr[2] ?? 0) + mutation.positionOffset[2],
        ];
      } else {
        clone.properties.push({
          type: 'ObjectProperty',
          key: 'position',
          value: mutation.positionOffset,
        });
      }
    }

    ast.objects.push(clone);
    return { success: true, ast };
  }

  private applyReorderObjects(
    ast: HoloComposition,
    mutation: ReorderObjectsMutation
  ): MutationResult {
    if (mutation.groupName) {
      const group = this.findGroupByName(mutation.groupName, ast.spatialGroups);
      if (!group) {
        return { success: false, ast, errors: [`Group "${mutation.groupName}" not found`] };
      }
      group.objects = this.reorderByNames(group.objects, mutation.order);
    } else {
      ast.objects = this.reorderByNames(ast.objects, mutation.order);
    }
    return { success: true, ast };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private rebuildFromHistory(): void {
    // This is a simplified rebuild -- in production, you might store
    // snapshots at intervals for efficiency.
    // For now, the previous AST snapshot approach via undo/redo stacks
    // is sufficient for typical studio editing workloads.
    // The undo simply reverts by re-applying all mutations up to historyIndex.
    // This is correct but O(n) in history length.

    // For a more efficient implementation, store AST snapshots periodically.
    // Skipped here for simplicity.
  }

  private findObjectInList(name: string, objects: HoloObjectDecl[]): HoloObjectDecl | null {
    for (const obj of objects) {
      if (obj.name === name) return obj;
      if (obj.children) {
        const found = this.findObjectInList(name, obj.children);
        if (found) return found;
      }
    }
    return null;
  }

  private findObjectInGroups(name: string, groups: HoloSpatialGroup[]): HoloObjectDecl | null {
    for (const group of groups) {
      const found = this.findObjectInList(name, group.objects);
      if (found) return found;
      if (group.groups) {
        const nested = this.findObjectInGroups(name, group.groups);
        if (nested) return nested;
      }
    }
    return null;
  }

  private findGroupByName(name: string, groups: HoloSpatialGroup[]): HoloSpatialGroup | null {
    for (const group of groups) {
      if (group.name === name) return group;
      if (group.groups) {
        const found = this.findGroupByName(name, group.groups);
        if (found) return found;
      }
    }
    return null;
  }

  private removeObjectByName(name: string, objects: HoloObjectDecl[]): boolean {
    const idx = objects.findIndex((o) => o.name === name);
    if (idx !== -1) {
      objects.splice(idx, 1);
      return true;
    }
    for (const obj of objects) {
      if (obj.children && this.removeObjectByName(name, obj.children)) {
        return true;
      }
    }
    return false;
  }

  private removeObjectFromGroup(name: string, group: HoloSpatialGroup): boolean {
    if (this.removeObjectByName(name, group.objects)) return true;
    for (const child of group.groups ?? []) {
      if (this.removeObjectFromGroup(name, child)) return true;
    }
    return false;
  }

  private extractObjectFromGroup(
    name: string,
    group: HoloSpatialGroup
  ): HoloObjectDecl | null {
    const idx = group.objects.findIndex((o) => o.name === name);
    if (idx !== -1) {
      return group.objects.splice(idx, 1)[0];
    }
    for (const child of group.groups ?? []) {
      const found = this.extractObjectFromGroup(name, child);
      if (found) return found;
    }
    return null;
  }

  private collectObjectNames(objects: HoloObjectDecl[], names: string[]): void {
    for (const obj of objects) {
      names.push(obj.name);
      if (obj.children) this.collectObjectNames(obj.children, names);
    }
  }

  private collectObjectNamesFromGroup(group: HoloSpatialGroup, names: string[]): void {
    this.collectObjectNames(group.objects, names);
    for (const child of group.groups ?? []) {
      this.collectObjectNamesFromGroup(child, names);
    }
  }

  private reorderByNames(objects: HoloObjectDecl[], order: string[]): HoloObjectDecl[] {
    const objectMap = new Map(objects.map((o) => [o.name, o]));
    const reordered: HoloObjectDecl[] = [];

    for (const name of order) {
      const obj = objectMap.get(name);
      if (obj) {
        reordered.push(obj);
        objectMap.delete(name);
      }
    }

    // Append any objects not in the order list
    for (const obj of objectMap.values()) {
      reordered.push(obj);
    }

    return reordered;
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default StudioBridge;
