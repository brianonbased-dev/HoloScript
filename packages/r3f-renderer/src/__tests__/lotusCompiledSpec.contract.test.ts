/**
 * lotusCompiledSpec.contract — the .holo → render-consumer contract (I.007 closure).
 *
 * The locked boundary of the assembly: a spec emitted by CORE's pure mapper
 * (`buildLotusPetalMaterialSpec`, from the trait's own render profile) must construct
 * a real MeshPhysicalMaterial through the RENDERER's `buildCompiledMaterial`, with
 * every closure primitive intact — physical PBR (pillar 4), shader chunks (pillar 2),
 * and procedural maps (pillar 3) resolved via the REAL core generators.
 *
 * This is what makes step 1 verifiable headlessly: it proves the compiled material
 * spec is satisfiable from real lotus data end-to-end, with NO browser and NO
 * hand-authored spec — closing the gap that compiledMaterial.test.ts left open
 * (that test hand-writes its specs; this one drives the production core mapper).
 *
 * @cites I.007, plan §0.7, task_1780604509863_w7i9 (assembly)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  createBotanicalLotusRenderProfile,
  buildLotusPetalMaterialSpec,
  LOTUS_PETAL_UNIFORM_BINDINGS,
  generateBotanicalNormalMap,
  generateBotanicalRoughnessMap,
} from '../../../core/src/traits/BotanicalLotusTrait';
import {
  registerProceduralTexture,
  clearProceduralTextures,
  type ProceduralPixelData,
} from '../runtime/proceduralTextures';
import { buildCompiledMaterial, type CompiledMaterialSpec } from '../runtime/compiledMaterial';

beforeEach(() => clearProceduralTextures());

/** Register the REAL botanical generators under the keys the core mapper emits. */
function registerBotanicalGenerators(): void {
  registerProceduralTexture('botanical_normal', (p) =>
    generateBotanicalNormalMap(p as Parameters<typeof generateBotanicalNormalMap>[0]) as ProceduralPixelData
  );
  registerProceduralTexture('botanical_roughness', (p) =>
    generateBotanicalRoughnessMap(p as Parameters<typeof generateBotanicalRoughnessMap>[0]) as ProceduralPixelData
  );
}

describe('lotus compiled-material spec — core → renderer contract', () => {
  it('a core-emitted spec is structurally assignable to the renderer CompiledMaterialSpec', () => {
    const profile = createBotanicalLotusRenderProfile();
    // Type-level proof the contract holds: assignment compiles iff shapes match.
    const spec: CompiledMaterialSpec = buildLotusPetalMaterialSpec(profile);
    expect(spec.physical).toBeDefined();
    expect(spec.shaderChunks?.chunks.length).toBeGreaterThan(0);
    expect(spec.proceduralMaps?.normalMap?.generator).toBe('botanical_normal');
  });

  it('builds a MeshPhysicalMaterial carrying the profile PBR props', () => {
    const profile = createBotanicalLotusRenderProfile();
    const spec = buildLotusPetalMaterialSpec(profile);
    const { material } = buildCompiledMaterial(spec);

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.transmission).toBeCloseTo(profile.pbr_uniforms.transmission);
    expect(material.thickness).toBeCloseTo(profile.pbr_uniforms.thickness);
    expect(material.roughness).toBeCloseTo(profile.pbr_uniforms.roughness);
    expect(material.ior).toBeCloseTo(profile.pbr_uniforms.ior);
    expect(material.sheen).toBeCloseTo(profile.pbr_uniforms.sheen);
    expect(material.sheenRoughness).toBeCloseTo(profile.pbr_uniforms.sheen_roughness);
    expect(material.transparent).toBe(true);
    expect(material.metalness).toBeCloseTo(0);
  });

  it('attaches the real lotus shader chunks and splices them into the PBR shader', () => {
    const profile = createBotanicalLotusRenderProfile();
    const spec = buildLotusPetalMaterialSpec(profile);
    const { material, chunkHandle } = buildCompiledMaterial(spec);
    expect(chunkHandle).toBeDefined();

    // Drive onBeforeCompile against a mock shader carrying the real splice points.
    const shader = {
      vertexShader: '#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>\nvoid main(){}',
      fragmentShader:
        '#include <common>\n#include <normal_fragment_maps>\n#include <color_fragment>\n#include <emissivemap_fragment>\nvoid main(){}',
      uniforms: {} as Record<string, { value: unknown }>,
    };
    (material as unknown as { onBeforeCompile: (s: typeof shader) => void }).onBeforeCompile(shader);

    // A real petal fragment injection landed (vein field function is unmistakable).
    expect(shader.fragmentShader).toContain('lotusVeinField');
    // The vertex curl-bend chunk landed.
    expect(shader.vertexShader).toContain('lotusBend');
    // Palette + dynamic uniforms registered onto the program.
    expect(shader.uniforms.uLotusBaseColor).toBeDefined();
    expect(shader.uniforms.uLotusGrowth).toBeDefined();
  });

  it('resolves the procedural normal + roughness maps via the REAL core generators', () => {
    registerBotanicalGenerators();
    const profile = createBotanicalLotusRenderProfile();
    const spec = buildLotusPetalMaterialSpec(profile, { detailMapSize: 32 });
    const { material } = buildCompiledMaterial(spec);

    expect(material.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(material.normalMap!.image.width).toBe(32);
    expect(material.roughnessMap).toBeInstanceOf(THREE.DataTexture);
    expect(material.roughnessMap!.image.width).toBe(32);
  });

  it('every uniform-binding target exists in the emitted uniform set (pillar 1↔2 bridge)', () => {
    const profile = createBotanicalLotusRenderProfile();
    const spec = buildLotusPetalMaterialSpec(profile);
    const uniforms = spec.shaderChunks!.uniforms!;
    for (const uniformName of Object.keys(LOTUS_PETAL_UNIFORM_BINDINGS)) {
      expect(uniforms[uniformName], `binding target ${uniformName} must be emitted`).toBeDefined();
    }
  });

  it('honors dynamic uniform overrides (bud pose), leaving static PBR untouched', () => {
    const profile = createBotanicalLotusRenderProfile();
    const open = buildLotusPetalMaterialSpec(profile);
    const bud = buildLotusPetalMaterialSpec(profile, { dynamic: { devTime: 0, growth: 0, bloom: 0 } });

    expect(open.shaderChunks!.uniforms!.uPetalDevTime).toEqual({ value: 1 });
    expect(bud.shaderChunks!.uniforms!.uPetalDevTime).toEqual({ value: 0 });
    expect(bud.shaderChunks!.uniforms!.uLotusGrowth).toEqual({ value: 0 });
    // Static palette/PBR identical regardless of dynamic pose.
    expect(bud.physical).toEqual(open.physical);
    expect(bud.shaderChunks!.uniforms!.uLotusBaseColor).toEqual(
      open.shaderChunks!.uniforms!.uLotusBaseColor
    );
  });
});
