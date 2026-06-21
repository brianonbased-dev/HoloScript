/**
 * HoloScript -> Snapchat Lens Studio Compiler
 *
 * A BRIDGE export target that emits Lens Studio JavaScript + JSON descriptor
 * for Snapchat AR lenses (Lens Studio API 5.0).
 *
 * Output format: JSON string containing
 * { lensManifest, sceneScript, assetManifest, droppedStatementCount, droppedStatements }
 *
 * Compilation rules:
 * - HoloObjectDecl type 'mesh'/'box'/'sphere' → SceneObject with MeshVisual component
 * - HoloObjectDecl type 'text'              → SceneObject with Text component
 * - HoloObjectDecl type 'image'             → SceneObject with Image component
 * - HoloObjectDecl type 'particle'          → SceneObject with VFXAsset component
 * - HoloObjectTrait @face_track             → HeadBinding component (attaches to face)
 * - HoloObjectTrait @hand_track             → HandTracking component
 * - HoloObjectTrait @world_anchor           → WorldObjectController component
 * - HoloObjectTrait @color                  → baseColor on material
 * - HoloObjectTrait @opacity                → alpha on material
 * - HoloLogic on_event blocks               → Lens Studio Script event callbacks
 * - HoloSpatialGroup                        → parent SceneObject hierarchy
 *
 * Default behaviour when no AR traits present: full-face overlay
 * with a SceneObject positioned at (0, 0, -50).
 *
 * @version 1.0.0 — Lens Studio API 5.0
 */

import { CompilerBase } from './CompilerBase';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloEventHandler,
  HoloAction,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface LensStudioCompilerOptions {
  /**
   * Lens display name shown in Snapchat.
   * Defaults to the composition name.
   */
  lensName?: string;

  /**
   * Stable lens UUID. Generated deterministically from composition name
   * when omitted.
   */
  lensId?: string;

  /**
   * Lens Studio API version string.
   * @default "5.0"
   */
  apiVersion?: string;

  /**
   * Target platforms for the lens manifest.
   * @default ["snapchat"]
   */
  targetPlatforms?: string[];

  /**
   * Indentation string for generated JavaScript.
   * @default "  " (two spaces)
   */
  indent?: string;
}

/**
 * Compiled Lens Studio output.
 *
 * Serialised as a single JSON string so MCP tool callers receive one payload
 * they can write directly to a `.json` file for Lens Studio import.
 */
export interface LensStudioCompileResult {
  /**
   * JSON string containing Lens Studio import data plus drop metadata.
   * Write to `lens-output.json` and import via Lens Studio File menu.
   */
  output: string;

  /** Parsed manifest (convenience accessor — same data as output) */
  lensManifest: LensManifest;

  /** Parsed scene script (convenience accessor) */
  sceneScript: string;

  /** Parsed asset manifest (convenience accessor) */
  assetManifest: AssetEntry[];

  /** Number of handler/action body statements that could not be transpiled. */
  droppedStatementCount: number;

  /** Structured records for dropped handler/action body statements. */
  droppedStatements: LensStudioDroppedStatement[];
}

export type LensStudioDroppedStatementContext =
  | 'logic-handler'
  | 'logic-action'
  | 'composition-event';

export interface LensStudioDroppedStatement {
  index: number;
  type: string;
  name?: string;
  context: LensStudioDroppedStatementContext;
  owner: string;
  reason: string;
}

export interface LensManifest {
  id: string;
  name: string;
  apiVersion: string;
  targetPlatforms: string[];
}

export interface AssetEntry {
  name: string;
  type: 'mesh' | 'texture' | 'material' | 'vfx' | 'audio' | 'unknown';
  src?: string;
}

// =============================================================================
// COMPILER
// =============================================================================

export class LensStudioCompiler extends CompilerBase {
  protected readonly compilerName = 'LensStudioCompiler';

  private opts: Required<LensStudioCompilerOptions>;

  /** Accumulated JavaScript lines for sceneScript */
  private lines: string[] = [];

  /** Accumulated asset entries */
  private assets: AssetEntry[] = [];

  /** Track which objects have been referenced as // @input annotations */
  private inputAnnotations: string[] = [];

  /** Handler/action body statements the bridge cannot transpile yet. */
  private droppedStatements: LensStudioDroppedStatement[] = [];

  constructor(options: LensStudioCompilerOptions = {}) {
    super();
    this.opts = {
      lensName: options.lensName ?? '',
      lensId: options.lensId ?? '',
      apiVersion: options.apiVersion ?? '5.0',
      targetPlatforms: options.targetPlatforms ?? ['snapchat'],
      indent: options.indent ?? '  ',
    };
  }

  // ---------------------------------------------------------------------------
  // ICompiler implementation
  // ---------------------------------------------------------------------------

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): LensStudioCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);

    // Reset per-compile state
    this.lines = [];
    this.assets = [];
    this.inputAnnotations = [];
    this.droppedStatements = [];

    const lensName = this.opts.lensName || (composition.name as string) || 'HoloLens';
    const lensId = this.opts.lensId || this.deriveId(lensName);

    const lensManifest: LensManifest = {
      id: lensId,
      name: lensName,
      apiVersion: this.opts.apiVersion,
      targetPlatforms: this.opts.targetPlatforms,
    };

    const sceneScript = this.buildSceneScript(composition, lensName);
    const assetManifest = [...this.assets];
    const droppedStatements = [...this.droppedStatements];
    const droppedStatementCount = droppedStatements.length;

    const output = JSON.stringify(
      {
        lensManifest,
        sceneScript,
        assetManifest,
        droppedStatementCount,
        droppedStatements,
      },
      null,
      2
    );

    return {
      output,
      lensManifest,
      sceneScript,
      assetManifest,
      droppedStatementCount,
      droppedStatements,
    };
  }

  // ---------------------------------------------------------------------------
  // Scene script builder
  // ---------------------------------------------------------------------------

  private buildSceneScript(composition: HoloComposition, lensName: string): string {
    this.emit('// Auto-generated by HoloScript LensStudioCompiler');
    this.emit(`// Composition: ${this.escape(lensName)}`);
    this.emit('// Target: Snapchat Lens Studio API 5.0');
    this.emit('// Do not edit manually — regenerate from .holo source');
    this.emit('');

    // Emit // @input annotations first (Lens Studio inspector bindings)
    this.collectInputAnnotations(composition);
    for (const annotation of this.inputAnnotations) {
      this.emit(annotation);
    }
    if (this.inputAnnotations.length > 0) {
      this.emit('');
    }

    // script.createEvent wrapper (standard Lens Studio entry point)
    this.emit('// ----- Initialization -----');
    this.emit('var initEvent = script.createEvent("OnStartEvent");');
    this.emit('initEvent.bind(function () {');

    // Top-level objects
    for (const obj of composition.objects ?? []) {
      this.emitObject(obj, 1, null);
    }

    // Spatial groups (each group becomes a parent SceneObject)
    for (const group of composition.spatialGroups ?? []) {
      this.emitSpatialGroup(group, 1);
    }

    // Default face overlay when no AR tracking traits found
    if (!this.hasARTraits(composition)) {
      this.emitDefaultFaceOverlay(lensName, 1);
    }

    this.emit('});');
    this.emit('');

    // Event callbacks from HoloLogic
    if (composition.logic) {
      this.emitLogicHandlers(composition.logic.handlers, composition.logic.actions);
    }

    // Composition-level event handlers
    if (composition.eventHandlers?.length) {
      this.emitEventHandlers(composition.eventHandlers);
    }

    return this.lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Object emission
  // ---------------------------------------------------------------------------

  private emitObject(obj: HoloObjectDecl, depth: number, parentVar: string | null): void {
    const varName = this.toVarName(obj.name);
    const objType = this.resolveObjectType(obj);
    const pad = this.pad(depth);

    this.emit(`${pad}// Object: "${this.escape(obj.name as string)}" (type: ${objType})`);
    this.emit(
      `${pad}var ${varName} = scene.createSceneObject("${this.escape(obj.name as string)}");`
    );

    // Parent assignment
    if (parentVar) {
      this.emit(`${pad}${varName}.setParent(${parentVar});`);
    }

    // Add component based on resolved type
    switch (objType) {
      case 'mesh':
      case 'box':
      case 'sphere':
        this.emitMeshVisual(varName, obj, depth);
        break;
      case 'text':
        this.emitTextComponent(varName, obj, depth);
        break;
      case 'image':
        this.emitImageComponent(varName, obj, depth);
        break;
      case 'particle':
        this.emitVFXComponent(varName, obj, depth);
        break;
      default:
        // Generic scene object — add a MeshVisual as a fallback
        this.emit(
          `${pad}var ${varName}Visual = ${varName}.createComponent("Component.MeshVisual");`
        );
    }

    // Apply traits
    for (const trait of obj.traits ?? []) {
      this.emitTrait(varName, trait, depth);
    }

    // Position / rotation / scale from composition properties
    this.emitTransform(varName, obj, depth);

    // Children
    for (const child of obj.children ?? []) {
      this.emitObject(child, depth, varName);
    }

    this.emit('');
  }

  // ---------------------------------------------------------------------------
  // Component emitters
  // ---------------------------------------------------------------------------

  private emitMeshVisual(varName: string, obj: HoloObjectDecl, depth: number): void {
    const pad = this.pad(depth);
    const meshSrc = this.findProp(obj, 'mesh') ?? this.findProp(obj, 'src');
    const color = this.findProp(obj, 'color');
    const opacity = this.findProp(obj, 'opacity');

    this.emit(`${pad}var ${varName}Mesh = ${varName}.createComponent("Component.MeshVisual");`);
    this.emit(
      `${pad}${varName}Mesh.mainMaterial = script.createMaterial("Materials/FlatMaterial");`
    );

    if (color) {
      const lsColor = this.toVec4Color(color as string);
      this.emit(`${pad}${varName}Mesh.mainMaterial.mainPass.baseColor = ${lsColor};`);
    }

    if (opacity !== undefined && opacity !== null) {
      this.emit(`${pad}${varName}Mesh.mainMaterial.mainPass.alpha = ${Number(opacity)};`);
    }

    if (meshSrc) {
      const assetName = `${varName}_mesh`;
      this.emit(`${pad}// @input Asset.RenderMesh ${assetName}`);
      this.emit(`${pad}if (script.${assetName}) { ${varName}Mesh.mesh = script.${assetName}; }`);
      this.registerAsset(String(meshSrc), 'mesh');
    }
  }

  private emitTextComponent(varName: string, obj: HoloObjectDecl, depth: number): void {
    const pad = this.pad(depth);
    const text = this.findProp(obj, 'text') ?? this.findProp(obj, 'content') ?? '';
    const color = this.findProp(obj, 'color');
    const opacity = this.findProp(obj, 'opacity');

    this.emit(`${pad}var ${varName}Text = ${varName}.createComponent("Component.Text");`);
    this.emit(`${pad}${varName}Text.text = "${this.escape(String(text))}";`);

    if (color) {
      this.emit(`${pad}${varName}Text.textFill.color = ${this.toVec4Color(color as string)};`);
    }

    if (opacity !== undefined && opacity !== null) {
      this.emit(`${pad}${varName}Text.alpha = ${Number(opacity)};`);
    }
  }

  private emitImageComponent(varName: string, obj: HoloObjectDecl, depth: number): void {
    const pad = this.pad(depth);
    const src = this.findProp(obj, 'src') ?? this.findProp(obj, 'texture');
    const opacity = this.findProp(obj, 'opacity');

    this.emit(`${pad}var ${varName}Image = ${varName}.createComponent("Component.Image");`);

    if (src) {
      const assetName = `${varName}_texture`;
      this.emit(`${pad}// @input Asset.Texture ${assetName}`);
      this.emit(
        `${pad}if (script.${assetName}) { ${varName}Image.mainMaterial.mainPass.baseTex = script.${assetName}; }`
      );
      this.registerAsset(String(src), 'texture');
    }

    if (opacity !== undefined && opacity !== null) {
      this.emit(`${pad}${varName}Image.mainMaterial.mainPass.alpha = ${Number(opacity)};`);
    }
  }

  private emitVFXComponent(varName: string, obj: HoloObjectDecl, depth: number): void {
    const pad = this.pad(depth);
    const src = this.findProp(obj, 'src') ?? this.findProp(obj, 'effect');

    this.emit(`${pad}var ${varName}VFX = ${varName}.createComponent("Component.VFXAsset");`);

    if (src) {
      const assetName = `${varName}_vfx`;
      this.emit(`${pad}// @input Asset.VFX ${assetName}`);
      this.emit(`${pad}if (script.${assetName}) { ${varName}VFX.asset = script.${assetName}; }`);
      this.registerAsset(String(src), 'vfx');
    }
  }

  // ---------------------------------------------------------------------------
  // Trait emitters
  // ---------------------------------------------------------------------------

  private emitTrait(varName: string, trait: HoloObjectTrait, depth: number): void {
    const pad = this.pad(depth);
    const name = trait.name;
    const config = trait.config ?? {};

    switch (name) {
      case 'face_track': {
        // Attach HeadBinding — positions the scene object relative to a detected face
        this.emit(`${pad}// Trait @face_track → HeadBinding (attaches to face)`);
        this.emit(
          `${pad}var ${varName}HeadBind = ${varName}.createComponent("Component.HeadBinding");`
        );
        const bindMode = (config['mode'] as string | undefined) ?? 'AttachToFace';
        this.emit(`${pad}${varName}HeadBind.bindingType = HeadBinding.BindingType.${bindMode};`);
        break;
      }

      case 'hand_track': {
        // Attach HandTracking component
        const hand = (config['hand'] as string | undefined) ?? 'right';
        this.emit(`${pad}// Trait @hand_track → HandTracking (${hand} hand)`);
        this.emit(
          `${pad}var ${varName}HandTrack = ${varName}.createComponent("Component.HandTracking");`
        );
        const lsHand = hand === 'left' ? 'HandType.Left' : 'HandType.Right';
        this.emit(`${pad}${varName}HandTrack.handType = HandTracking.${lsHand};`);
        break;
      }

      case 'world_anchor': {
        // Attach WorldObjectController for world-locked AR placement
        this.emit(`${pad}// Trait @world_anchor → WorldObjectController`);
        this.emit(
          `${pad}var ${varName}WorldCtrl = ${varName}.createComponent("Component.WorldObjectController");`
        );
        const enableSurface = config['surface'] !== false;
        this.emit(`${pad}${varName}WorldCtrl.enableSurface = ${enableSurface};`);
        break;
      }

      case 'color': {
        // Set baseColor on existing material — find the component name heuristically
        const colorVal =
          (config['value'] as string | undefined) ??
          (trait.args?.[0] as string | undefined) ??
          '#ffffff';
        this.emit(`${pad}// Trait @color → baseColor on material`);
        this.emit(`${pad}if (${varName}.getComponent("Component.MeshVisual")) {`);
        this.emit(
          `${pad}${this.opts.indent}${varName}.getComponent("Component.MeshVisual").mainMaterial.mainPass.baseColor = ${this.toVec4Color(colorVal)};`
        );
        this.emit(`${pad}}`);
        break;
      }

      case 'opacity': {
        const alphaVal =
          config['value'] !== undefined
            ? Number(config['value'])
            : trait.args?.[0] !== undefined
              ? Number(trait.args[0])
              : 1.0;
        this.emit(`${pad}// Trait @opacity → alpha`);
        this.emit(`${pad}if (${varName}.getComponent("Component.MeshVisual")) {`);
        this.emit(
          `${pad}${this.opts.indent}${varName}.getComponent("Component.MeshVisual").mainMaterial.mainPass.alpha = ${alphaVal};`
        );
        this.emit(`${pad}}`);
        break;
      }

      default:
        // Unknown trait — emit as a comment for manual wiring
        this.emit(`${pad}// Trait @${name} — no Lens Studio mapping; wire manually`);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Transform
  // ---------------------------------------------------------------------------

  private emitTransform(varName: string, obj: HoloObjectDecl, depth: number): void {
    const pad = this.pad(depth);
    const hasPos = obj.position != null;
    const hasRot = obj.rotation != null;
    const hasScale = obj.scale != null;

    // Also check .properties for position/rotation/scale arrays
    const posArr = this.findPropArray(obj, 'position');
    const rotArr = this.findPropArray(obj, 'rotation');
    const scaleArr = this.findPropArray(obj, 'scale');

    const px = obj.position?.x ?? posArr?.[0] ?? 0;
    const py = obj.position?.y ?? posArr?.[1] ?? 0;
    const pz = obj.position?.z ?? posArr?.[2] ?? 0;

    if (hasPos || posArr) {
      this.emit(`${pad}${varName}.getTransform().setWorldPosition(new vec3(${px}, ${py}, ${pz}));`);
    }

    if (hasRot || rotArr) {
      const rx = obj.rotation?.x ?? rotArr?.[0] ?? 0;
      const ry = obj.rotation?.y ?? rotArr?.[1] ?? 0;
      const rz = obj.rotation?.z ?? rotArr?.[2] ?? 0;
      this.emit(
        `${pad}${varName}.getTransform().setWorldRotation(quat.fromEulerAngles(${rx}, ${ry}, ${rz}));`
      );
    }

    if (hasScale || scaleArr) {
      const sx = obj.scale?.x ?? scaleArr?.[0] ?? 1;
      const sy = obj.scale?.y ?? scaleArr?.[1] ?? 1;
      const sz = obj.scale?.z ?? scaleArr?.[2] ?? 1;
      this.emit(`${pad}${varName}.getTransform().setWorldScale(new vec3(${sx}, ${sy}, ${sz}));`);
    }
  }

  // ---------------------------------------------------------------------------
  // Spatial group
  // ---------------------------------------------------------------------------

  private emitSpatialGroup(group: HoloSpatialGroup, depth: number): void {
    const varName = this.toVarName(group.name);
    const pad = this.pad(depth);

    this.emit(`${pad}// SpatialGroup: "${this.escape(group.name as string)}"`);
    this.emit(
      `${pad}var ${varName} = scene.createSceneObject("${this.escape(group.name as string)}");`
    );

    // Position from group properties
    const posArr = this.findGroupPropArray(group, 'position');
    if (posArr) {
      this.emit(
        `${pad}${varName}.getTransform().setWorldPosition(new vec3(${posArr[0]}, ${posArr[1]}, ${posArr[2]}));`
      );
    }

    // Child objects parented to the group SceneObject
    for (const child of group.objects ?? []) {
      this.emitObject(child, depth, varName);
    }

    // Nested groups
    for (const nested of group.groups ?? []) {
      this.emitSpatialGroup(nested, depth);
    }

    this.emit('');
  }

  // ---------------------------------------------------------------------------
  // Default face overlay (fallback when no AR traits found)
  // ---------------------------------------------------------------------------

  private emitDefaultFaceOverlay(lensName: string, depth: number): void {
    const pad = this.pad(depth);
    const varName = this.toVarName(lensName + '_overlay');

    this.emit(`${pad}// Default: full-face overlay (no AR tracking traits found in composition)`);
    this.emit(
      `${pad}var ${varName} = scene.createSceneObject("${this.escape(lensName)}_overlay");`
    );
    this.emit(`${pad}${varName}.getTransform().setWorldPosition(new vec3(0, 0, -50));`);
    this.emit(
      `${pad}var ${varName}HeadBind = ${varName}.createComponent("Component.HeadBinding");`
    );
    this.emit(`${pad}${varName}HeadBind.bindingType = HeadBinding.BindingType.AttachToFace;`);
    this.emit('');
  }

  // ---------------------------------------------------------------------------
  // Logic / event handlers
  // ---------------------------------------------------------------------------

  private emitLogicHandlers(handlers: HoloEventHandler[], actions: HoloAction[]): void {
    if (handlers.length === 0 && actions.length === 0) return;

    this.emit('// ----- Logic Event Callbacks -----');

    for (const handler of handlers) {
      const lsEvent = this.toLensStudioEvent(handler.event);
      const cbName = `on_${this.toVarName(handler.event)}`;

      this.emit(`var ${cbName}Event = script.createEvent("${lsEvent}");`);
      this.emit(`${cbName}Event.bind(function (eventData) {`);
      this.emit(`${this.opts.indent}// HoloScript handler: ${handler.event}`);

      // Emit body statements as explicit drop banners until transpilation exists.
      for (const stmt of handler.body ?? []) {
        this.emitStatementStub(stmt, 1, 'logic-handler', handler.event);
      }

      this.emit('});');
      this.emit('');
    }

    // Actions become named functions
    for (const action of actions) {
      const fnName = this.toVarName(action.name);
      const params = (action.parameters ?? []).map((p) => p.name).join(', ');

      this.emit(`function ${fnName}(${params}) {`);
      this.emit(`${this.opts.indent}// HoloScript action: ${action.name}`);

      for (const stmt of action.body ?? []) {
        this.emitStatementStub(stmt, 1, 'logic-action', action.name);
      }

      this.emit('}');
      this.emit('');
    }
  }

  private emitEventHandlers(handlers: HoloEventHandler[]): void {
    if (handlers.length === 0) return;

    this.emit('// ----- Composition-level Event Handlers -----');

    for (const handler of handlers) {
      const lsEvent = this.toLensStudioEvent(handler.event);
      const cbName = `comp_${this.toVarName(handler.event)}`;

      this.emit(`var ${cbName}Event = script.createEvent("${lsEvent}");`);
      this.emit(`${cbName}Event.bind(function (eventData) {`);
      this.emit(`${this.opts.indent}// HoloScript event: ${handler.event}`);

      for (const stmt of handler.body ?? []) {
        this.emitStatementStub(stmt, 1, 'composition-event', handler.event);
      }

      this.emit('});');
      this.emit('');
    }
  }

  /**
   * Emit an explicit drop banner for a HoloScript statement node.
   * Full statement transpilation is out of scope for this bridge target —
   * Complex logic should be hand-authored in Lens Studio until translated.
   */
  private emitStatementStub(
    stmt: unknown,
    depth: number,
    context: LensStudioDroppedStatementContext,
    owner: string
  ): void {
    const pad = this.pad(depth);
    const { type, name } = this.describeStatement(stmt);
    const dropped: LensStudioDroppedStatement = {
      index: this.droppedStatements.length + 1,
      type,
      ...(name ? { name } : {}),
      context,
      owner,
      reason:
        'LensStudioCompiler does not transpile HoloScript handler/action body statements yet.',
    };
    this.droppedStatements.push(dropped);
    const label = `${type}${name ? ': ' + name : ''}`;
    this.emit(`${pad}// DROPPED_STATEMENT ${dropped.index}: ${context}:${owner} -> ${label}`);
    this.emit(`${pad}// Reason: ${dropped.reason}`);
  }

  private describeStatement(stmt: unknown): { type: string; name?: string } {
    if (stmt && typeof stmt === 'object') {
      const s = stmt as Record<string, unknown>;
      const rawType = s['type'];
      const rawName = s['name'] ?? s['target'];
      const type = typeof rawType === 'string' && rawType.length > 0 ? rawType : 'statement';
      const name = typeof rawName === 'string' && rawName.length > 0 ? rawName : undefined;
      return name ? { type, name } : { type };
    }
    return { type: 'statement' };
  }

  // ---------------------------------------------------------------------------
  // // @input annotation collection (inspector-configurable bindings)
  // ---------------------------------------------------------------------------

  private collectInputAnnotations(composition: HoloComposition): void {
    for (const obj of composition.objects ?? []) {
      this.collectObjectInputAnnotations(obj);
    }
    for (const group of composition.spatialGroups ?? []) {
      for (const obj of group.objects ?? []) {
        this.collectObjectInputAnnotations(obj);
      }
    }
  }

  private collectObjectInputAnnotations(obj: HoloObjectDecl): void {
    const varName = this.toVarName(obj.name);
    // Each top-level SceneObject gets an inspector binding
    this.inputAnnotations.push(`// @input SceneObject ${varName}`);

    for (const child of obj.children ?? []) {
      this.collectObjectInputAnnotations(child);
    }
  }

  // ---------------------------------------------------------------------------
  // AR trait detection
  // ---------------------------------------------------------------------------

  private hasARTraits(composition: HoloComposition): boolean {
    const arTraits = new Set(['face_track', 'hand_track', 'world_anchor']);

    const objectHasARTrait = (obj: HoloObjectDecl): boolean => {
      if (obj.traits?.some((t) => arTraits.has(t.name))) return true;
      return (obj.children ?? []).some(objectHasARTrait);
    };

    if ((composition.objects ?? []).some(objectHasARTrait)) return true;

    for (const group of composition.spatialGroups ?? []) {
      if ((group.objects ?? []).some(objectHasARTrait)) return true;
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveObjectType(obj: HoloObjectDecl): string {
    // Check the 'type' property first, then 'mesh' property
    const typeProp = this.findProp(obj, 'type') as string | undefined;
    if (typeProp) return typeProp;

    const meshProp = this.findProp(obj, 'mesh') as string | undefined;
    if (meshProp) return meshProp;

    // Infer from trait names
    if (obj.traits?.some((t) => t.name === 'text_render')) return 'text';
    if (obj.traits?.some((t) => t.name === 'image_render')) return 'image';
    if (obj.traits?.some((t) => t.name === 'particle_emitter')) return 'particle';

    return 'mesh';
  }

  private findProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return obj.properties?.find((p) => p.key === key)?.value;
  }

  private findPropArray(obj: HoloObjectDecl, key: string): number[] | null {
    const val = this.findProp(obj, key);
    if (Array.isArray(val) && val.every((v) => typeof v === 'number')) {
      return val as number[];
    }
    return null;
  }

  private findGroupPropArray(group: HoloSpatialGroup, key: string): number[] | null {
    const val = group.properties?.find((p) => p.key === key)?.value;
    if (Array.isArray(val) && val.every((v) => typeof v === 'number')) {
      return val as number[];
    }
    return null;
  }

  private registerAsset(src: string, type: AssetEntry['type']): void {
    if (!this.assets.some((a) => a.src === src)) {
      this.assets.push({ name: src.split('/').pop() ?? src, type, src });
    }
  }

  /**
   * Convert a HoloScript event name to the equivalent Lens Studio event class name.
   * Unknown events fall back to TapEvent.
   */
  private toLensStudioEvent(event: string): string {
    const eventMap: Record<string, string> = {
      on_start: 'OnStartEvent',
      on_update: 'UpdateEvent',
      on_tap: 'TapEvent',
      on_touch_start: 'TouchStartEvent',
      on_touch_end: 'TouchEndEvent',
      on_touch_move: 'TouchMoveEvent',
      on_face_found: 'FaceFoundEvent',
      on_face_lost: 'FaceLostEvent',
      on_hand_found: 'HandFoundEvent',
      on_hand_lost: 'HandLostEvent',
      on_camera_front: 'CameraFrontEvent',
      on_camera_back: 'CameraBackEvent',
      on_lens_turned_on: 'LensTurnedOnEvent',
      on_lens_turned_off: 'LensTurnedOffEvent',
      on_enter: 'OnStartEvent',
      on_exit: 'LensTurnedOffEvent',
    };
    return eventMap[event] ?? 'TapEvent';
  }

  /**
   * Convert a hex colour string (#RRGGBB or #RRGGBBAA) to a Lens Studio
   * `new vec4(r, g, b, a)` literal. Returns white on parse failure.
   */
  private toVec4Color(hex: string): string {
    if (typeof hex === 'string' && hex.startsWith('#')) {
      const raw = hex.slice(1);
      const parseChannel = (s: string) => parseInt(s, 16) / 255;

      if (raw.length === 6) {
        const r = parseChannel(raw.slice(0, 2));
        const g = parseChannel(raw.slice(2, 4));
        const b = parseChannel(raw.slice(4, 6));
        return `new vec4(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}, 1.0)`;
      }

      if (raw.length === 8) {
        const r = parseChannel(raw.slice(0, 2));
        const g = parseChannel(raw.slice(2, 4));
        const b = parseChannel(raw.slice(4, 6));
        const a = parseChannel(raw.slice(6, 8));
        return `new vec4(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}, ${a.toFixed(4)})`;
      }
    }
    return 'new vec4(1.0, 1.0, 1.0, 1.0)';
  }

  /**
   * Deterministic UUID-style ID derived from the lens name (not cryptographically
   * secure — used only as a stable placeholder for development workflows).
   */
  private deriveId(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (Math.imul(31, hash) + name.charCodeAt(i)) >>> 0;
    }
    const hex = hash.toString(16).padStart(8, '0');
    return `hs-lens-${hex}-0000-0000-0000-000000000000`;
  }

  /** Convert an arbitrary name to a safe JavaScript variable identifier. */
  private toVarName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^([0-9])/, '_$1');
  }

  /** Escape a string for JavaScript string literal embedding. */
  private escape(value: string): string {
    return this.escapeStringValue(value, 'TypeScript');
  }

  /** Return indent padding for the given nesting depth. */
  private pad(depth: number): string {
    return this.opts.indent.repeat(depth);
  }

  private emit(line: string): void {
    this.lines.push(line);
  }
}
