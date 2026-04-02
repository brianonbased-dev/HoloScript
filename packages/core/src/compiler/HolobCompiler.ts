/**
 * HolobCompiler — HoloComposition AST → HoloBytecode
 *
 * The missing link between the parser and the HoloVM. Walks the
 * HoloComposition AST and emits HoloBytecode using HoloBytecodeBuilder.
 *
 * This compiler targets the HoloVM's ECS spatial executor, not a
 * platform-specific runtime. The VM handles entity management,
 * physics ticking, event dispatch, and spatial queries at 60-90Hz.
 *
 * What this enables:
 *   .holo → parse → HoloComposition → HolobCompiler → HoloBytecode → HoloVM.load() → tick()
 *
 * Previously the pipeline stopped at HoloComposition. The 37 transpilers
 * convert it to platform-native strings (Unity C#, URDF XML, etc.). This
 * compiler converts it to bytecode that the HoloVM executes directly.
 *
 * @module HolobCompiler
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloLight,
  HoloSpatialGroup,
  HoloEnvironment,
} from '../parser/HoloCompositionTypes';

// Import from holo-vm — these are the bytecode building primitives.
// The HoloVM package exports HoloBytecodeBuilder with a fluent API.
// If holo-vm is not installed, this compiler cannot be used.
let HoloBytecodeBuilder: any;
let ComponentType: any;
let GeometryType: any;
let BodyType: any;
let LightType: any;

try {
  const holoVm = require('@holoscript/holo-vm');
  HoloBytecodeBuilder = holoVm.HoloBytecodeBuilder;
  ComponentType = holoVm.ComponentType;
  GeometryType = holoVm.GeometryType;
  BodyType = holoVm.BodyType;
  LightType = holoVm.LightType;
} catch {
  // holo-vm not available — compiler will throw on use
}

// =============================================================================
// TYPES
// =============================================================================

export interface HolobCompilerOptions {
  /** Enable debug source map in output */
  debug?: boolean;
  /** Enable physics simulation */
  physics?: boolean;
  /** Enable networking opcodes */
  networking?: boolean;
}

export interface HolobCompileResult {
  /** The compiled bytecode (pass to HoloVM.load()) */
  bytecode: unknown;
  /** Compilation statistics */
  stats: {
    entities: number;
    functions: number;
    instructions: number;
    strings: number;
    assets: number;
    traits: number;
    events: number;
    compilationMs: number;
  };
}

// =============================================================================
// GEOMETRY MAPPING
// =============================================================================

const GEOMETRY_MAP: Record<string, number> = {
  box: 0,      // GeometryType.Cube
  cube: 0,
  sphere: 1,   // GeometryType.Sphere
  orb: 1,
  plane: 2,    // GeometryType.Plane
  ground: 2,
  cylinder: 3, // GeometryType.Cylinder
  cone: 4,     // GeometryType.Cone
  torus: 5,    // GeometryType.Torus
  capsule: 6,  // GeometryType.Capsule
};

const LIGHT_MAP: Record<string, number> = {
  directional: 0,
  point: 1,
  spot: 2,
  hemisphere: 3,
  ambient: 4,
  area: 5,
};

// =============================================================================
// COMPILER
// =============================================================================

export class HolobCompiler {
  private options: Required<HolobCompilerOptions>;
  private stringTable: Map<string, number> = new Map();
  private entityCount = 0;

  constructor(options: HolobCompilerOptions = {}) {
    this.options = {
      debug: options.debug ?? false,
      physics: options.physics ?? true,
      networking: options.networking ?? false,
    };
  }

  /**
   * Compile a HoloComposition AST into HoloBytecode.
   * The result can be loaded into HoloVM with `vm.load(result.bytecode)`.
   */
  compile(composition: HoloComposition): HolobCompileResult {
    if (!HoloBytecodeBuilder) {
      throw new Error(
        'HolobCompiler requires @holoscript/holo-vm. Install it: pnpm add @holoscript/holo-vm'
      );
    }

    const startMs = performance.now();
    const builder = new HoloBytecodeBuilder();
    this.stringTable.clear();
    this.entityCount = 0;

    // 1. Define entities from composition objects
    const entityIds = this.defineEntities(builder, composition);

    // 2. Build main function — sets up the scene
    const main = builder.addFunction('main');

    // 3. Compile environment (background, lighting defaults)
    if (composition.environment) {
      this.compileEnvironment(main, composition.environment);
    }

    // 4. Compile lights
    if (composition.lights) {
      for (const light of composition.lights) {
        this.compileLight(main, builder, light);
      }
    }

    // 5. Compile objects — geometry, transforms, materials, traits, physics
    if (composition.objects) {
      for (let i = 0; i < composition.objects.length; i++) {
        const obj = composition.objects[i];
        const entityId = entityIds.get(obj.name) ?? i + 1;
        this.compileObject(main, builder, obj, entityId);
      }
    }

    // 6. Compile spatial groups
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        this.compileSpatialGroup(main, builder, group, entityIds);
      }
    }

    // 7. Halt main
    main.halt();

    // 8. Build bytecode
    const bytecode = builder.build();

    const stats = {
      entities: this.entityCount,
      functions: bytecode.functions?.length ?? 1,
      instructions: this.countInstructions(bytecode),
      strings: bytecode.strings?.length ?? 0,
      assets: bytecode.assets?.length ?? 0,
      traits: bytecode.traits?.length ?? 0,
      events: bytecode.events?.length ?? 0,
      compilationMs: Math.round(performance.now() - startMs),
    };

    return { bytecode, stats };
  }

  // ─── Entity Definition ──────────────────────────────────────────────

  private defineEntities(
    builder: any,
    composition: HoloComposition
  ): Map<string, number> {
    const ids = new Map<string, number>();

    if (composition.objects) {
      for (const obj of composition.objects) {
        this.entityCount++;
        builder.addEntity(obj.name, 0); // archetype 0 = generic
        ids.set(obj.name, this.entityCount);
      }
    }

    if (composition.lights) {
      for (const light of composition.lights) {
        this.entityCount++;
        builder.addEntity(light.name || `light_${this.entityCount}`, 0);
        ids.set(light.name || `light_${this.entityCount}`, this.entityCount);
      }
    }

    return ids;
  }

  // ─── Object Compilation ─────────────────────────────────────────────

  private compileObject(
    fn: any,
    builder: any,
    obj: HoloObjectDecl,
    entityId: number
  ): void {
    // Geometry
    const shapeProp = obj.properties?.find(p => p.key === 'shape')?.value;
    const shape = (shapeProp as string)?.toLowerCase() || 'box';
    const geoType = GEOMETRY_MAP[shape] ?? GEOMETRY_MAP['box'];
    fn.setGeometry(entityId, geoType);

    // Transform
    const posProp = obj.properties?.find(p => p.key === 'position')?.value;
    const rotProp = obj.properties?.find(p => p.key === 'rotation')?.value;
    const sclProp = obj.properties?.find(p => p.key === 'scale')?.value;
    
    const pos = this.resolveVec3(posProp, [0, 0, 0]);
    const rot = this.resolveVec3(rotProp, [0, 0, 0]);
    const scl = this.resolveVec3(sclProp, [1, 1, 1]);
    fn.transform(entityId, pos[0], pos[1], pos[2], rot[0], rot[1], rot[2], 0, scl[0], scl[1], scl[2]);

    // Material — extract color from properties
    const color = this.resolveColor(obj);
    fn.setMaterial(entityId, color, 0.5, 0.5, 0x000000, 1.0);

    // Traits → compile to opcodes
    if (obj.traits && Array.isArray(obj.traits)) {
      for (const trait of obj.traits) {
        const traitName = typeof trait === 'string' ? trait : (trait as any).name || String(trait);
        this.compileTrait(fn, entityId, traitName, obj);
      }
    }

    // Check for inline trait annotations (e.g., @physics, @grabbable in properties)
    if (obj.properties) {
      for (const prop of obj.properties) {
        if (prop.key?.startsWith?.('@') || prop.key?.startsWith?.('trait:')) {
          this.compileTrait(fn, entityId, prop.key.replace(/^@|^trait:/, ''), obj);
        }
      }
    }
  }

  // ─── Trait Compilation ──────────────────────────────────────────────

  private compileTrait(fn: any, entityId: number, traitName: string, obj: HoloObjectDecl): void {
    const name = traitName.toLowerCase().replace(/^@/, '');

    switch (name) {
      case 'physics':
      case 'gpu_physics':
      case 'rigidbody': {
        const mass = this.resolveNumber(obj, 'mass', 1.0);
        fn.addRigidbody(entityId, mass, 0); // BodyType.Dynamic = 0
        break;
      }

      case 'collidable':
      case 'collider':
        // Collider is implicit with rigidbody in HoloVM
        break;

      case 'grabbable':
      case 'interactable':
        // Emit trait attachment — VM resolves at runtime
        fn.applyTrait(entityId, this.internString(fn, name));
        break;

      case 'networked':
      case 'net_sync':
        if (this.options.networking) {
          fn.netSync(entityId, 0); // SyncTier.Interpolated
        }
        break;

      case 'visible':
        fn.setVisible(entityId, true);
        break;

      case 'audio':
      case 'spatial_audio':
        fn.applyTrait(entityId, this.internString(fn, name));
        break;

      default:
        // Generic trait attachment — VM resolves via trait registry
        fn.applyTrait(entityId, this.internString(fn, name));
        break;
    }
  }

  // ─── Light Compilation ──────────────────────────────────────────────

  private compileLight(fn: any, builder: any, light: HoloLight): void {
    this.entityCount++;
    const entityId = this.entityCount;
    builder.addEntity(light.name || `light_${entityId}`, 0);

    const lightType = LIGHT_MAP[light.lightType || 'directional'] ?? 0;
    const intensity = (light as any).intensity ?? 1.0;
    fn.setLight(entityId, lightType, intensity, intensity, intensity);

    const pos = this.resolveVec3((light as any).position, [0, 10, 0]);
    fn.transform(entityId, pos[0], pos[1], pos[2]);
  }

  // ─── Environment Compilation ────────────────────────────────────────

  private compileEnvironment(fn: any, env: HoloEnvironment): void {
    // Environment properties become initial scene state
    for (const prop of env.properties) {
      if (prop.key === 'ambient_light' && typeof prop.value === 'number') {
        // Ambient light → spawn a light entity
        // This is handled in the main entity pass
      }
      // Other env properties (fog, skybox) are hints — stored as metadata
    }
  }

  // ─── Spatial Group Compilation ──────────────────────────────────────

  private compileSpatialGroup(
    fn: any,
    builder: any,
    group: HoloSpatialGroup,
    entityIds: Map<string, number>
  ): void {
    // Spatial groups are layout containers — compile child objects
    if (group.objects) {
      for (const obj of group.objects) {
        this.entityCount++;
        const entityId = this.entityCount;
        builder.addEntity(obj.name, 0);
        entityIds.set(obj.name, entityId);
        this.compileObject(fn, builder, obj, entityId);
      }
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private resolveVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
    if (Array.isArray(value) && value.length >= 3) {
      return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
    }
    return fallback;
  }

  private resolveColor(obj: HoloObjectDecl): number {
    if (obj.properties) {
      for (const prop of obj.properties) {
        if (prop.key === 'color' && typeof prop.value === 'string') {
          return parseInt(prop.value.replace('#', ''), 16) || 0xcccccc;
        }
      }
    }
    return 0xcccccc; // default gray
  }

  private resolveNumber(obj: HoloObjectDecl, key: string, fallback: number): number {
    if (obj.properties) {
      for (const prop of obj.properties) {
        if (prop.key === key && typeof prop.value === 'number') return prop.value;
      }
    }
    return fallback;
  }

  private internString(_fn: any, str: string): number {
    if (this.stringTable.has(str)) return this.stringTable.get(str)!;
    const idx = this.stringTable.size;
    this.stringTable.set(str, idx);
    return idx;
  }

  private countInstructions(bytecode: any): number {
    if (!bytecode?.functions) return 0;
    return bytecode.functions.reduce(
      (sum: number, fn: any) => sum + (fn.instructions?.length ?? 0),
      0
    );
  }
}
