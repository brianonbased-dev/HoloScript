/**
 * CharacterWebGPUCompiler — sovereign `character-webgpu` compile target.
 *
 * Turns an authored `.holo` CHARACTER composition into a runnable native-WebGPU artifact: a
 * serialized `CharacterDrawSpec` (skinned mesh + per-frame joint-matrix palette + material
 * groups) that the engine's `renderCharacter` (the sovereign WebGPU character renderer, already
 * GPU-verified) executes. Before this, `compile_to_webgpu` on a character composition fell
 * through to a placeholder cube — the rich `@body/@skeleton/@subsurface_scattering/@hair/
 * @locomotion` authoring was invisible to the compiler layer. This makes the character `.holo`
 * a first-class sovereign target (D.006), reusing the existing, tested
 * `buildCharacterHostFromComposition` bridge (D.101: compilers/targets are language work).
 *
 * Cycle safety: `@holoscript/engine` is loaded via a LAZY `import()` inside `compile()`, never at
 * module top-level. core⇄engine already have a bidirectional workspace dep; an eager runtime
 * import here could trip ESM circular-init. The dynamic import keeps this file's top-level imports
 * pure-core (zero eager cross-package edge) while still being fully typed.
 *
 * @module compiler/CharacterWebGPUCompiler
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../parser/HoloCompositionTypes';

/** The serialized bundle this target emits (JSON; `renderCharacter` reconstructs the DrawSpec). */
export interface CharacterDrawSpecBundle {
  format: 'character-webgpu/drawspec';
  version: 1;
  entityId: string;
  jointCount: number;
  vertexCount: number;
  mesh: {
    positions: number[];
    normals: number[];
    tangents: number[];
    indices: number[];
    jointIndices: number[];
    jointWeights: number[];
  };
  /** jointCount × 16 column-major floats (skin = worldPose · inverseBind). */
  jointMatrices: number[];
  material: {
    color: number;
    metalness: number;
    roughness: number;
    emissive: number;
    opacity: number;
  };
  /** Column-major 4×4 root placement matrix (16 floats). */
  modelMatrix: number[];
  /** Per-region materials (skin / hair / eye), or null for a single-material body. */
  materialGroups: unknown[] | null;
  /** Present when the source authors @lod and this compile selects one declared tier. */
  lod?: { level: number; distance: number; garmentSegments: number };
  /** Honest mapped/stubbed report from the authoring bridge. */
  report: unknown;
}

const num = (a: ArrayLike<number>): number[] => Array.from(a);

/** Project the parser's HoloObjectDecl onto the bridge's structural CompObject (subset it reads). */
function mapObject(o: HoloObjectDecl): {
  id?: string;
  name?: string;
  position?: { x?: number; y?: number; z?: number };
  template?: string;
  traits?: Array<{ name: string; config?: Record<string, unknown> }>;
  children?: ReturnType<typeof mapObject>[];
} {
  return {
    id: o.id,
    name: o.name,
    position: o.position ? { x: o.position.x, y: o.position.y, z: o.position.z } : undefined,
    template: o.template,
    traits: (o.traits ?? []).map((t: HoloObjectTrait) => ({ name: t.name, config: t.config })),
    children: (o.children ?? []).map(mapObject),
  };
}

export class CharacterWebGPUCompiler {
  // Options are accepted for parity with the other compilers in the factory; none are required.
  constructor(private readonly options: Record<string, unknown> = {}) {}

  /**
   * Compile a character composition to a `CharacterDrawSpec` JSON bundle. Throws if the
   * composition has no character object (no fabricated body — the bridge's honest false case).
   */
  async compile(composition: HoloComposition): Promise<string> {
    // Lazy load — see "Cycle safety" in the module header. Typed via the dynamic-import inference.
    const { CharacterRender } = await import('@holoscript/engine');

    const parsed = {
      name: composition.name,
      objects: (composition.objects ?? []).map(mapObject),
      templates: (composition.templates ?? []).map((t) => ({
        name: t.name,
        traits: (t.traits ?? []).map((tr) => ({ name: tr.name, config: tr.config })),
      })),
      spatialGroups: (composition.spatialGroups ?? []).map((g) => ({
        objects: (g.objects ?? []).map(mapObject),
      })),
    };

    const entityIdOverride =
      typeof this.options.entityId === 'string' ? (this.options.entityId as string) : undefined;
    const lodLevel =
      typeof this.options.lodLevel === 'number' ? (this.options.lodLevel as number) : undefined;
    const result = CharacterRender.buildCharacterHostFromComposition(parsed, {
      entityId: entityIdOverride,
      lodLevel,
    });
    if (!result.ok || !result.host) {
      throw new Error(
        `character-webgpu: no character object in composition "${composition.name}" ` +
          `(resolvedVia=${result.report.resolvedVia}); nothing to compile.`
      );
    }

    const spec = result.host.getDrawSpec();
    const bundle: CharacterDrawSpecBundle = {
      format: 'character-webgpu/drawspec',
      version: 1,
      entityId: spec.entityId,
      jointCount: spec.jointCount,
      vertexCount: spec.mesh.vertexCount,
      mesh: {
        positions: num(spec.mesh.positions),
        normals: num(spec.mesh.normals),
        tangents: num(spec.mesh.tangents),
        indices: num(spec.mesh.indices),
        jointIndices: num(spec.mesh.jointIndices),
        jointWeights: num(spec.mesh.jointWeights),
      },
      jointMatrices: num(spec.jointMatrices),
      material: spec.material,
      modelMatrix: num(spec.modelMatrix),
      materialGroups: spec.materialGroups ?? null,
      ...(result.lod ? { lod: result.lod } : {}),
      report: result.report,
    };
    return JSON.stringify(bundle);
  }
}
