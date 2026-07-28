/**
 * CharacterWebGPUCompiler — the sovereign `character-webgpu` compile target.
 *
 * Falsifiable claim: compiling an authored character composition yields a CharacterDrawSpec
 * bundle with REAL skinned humanoid geometry (hundreds of positions, joint indices/weights, ≥3
 * material groups skin/hair/eye) — NOT the placeholder cube the generic webgpu target emitted for
 * `geometry:"avatar"`. The false case (no character object) throws — no fabricated body.
 *
 * This also exercises the core→engine bridge through the compiler's lazy `import('@holoscript/engine')`
 * at runtime: a circular-init or wrong-output break fails here. Pure CPU (getDrawSpec needs no GPU).
 *
 * Minimal HoloComposition fixtures cast via `as`: the compiler reads only name/objects/templates/
 * spatialGroups, so the 30 other required HoloComposition fields are irrelevant to this target.
 */
import { describe, it, expect } from 'vitest';
import { CharacterWebGPUCompiler, type CharacterDrawSpecBundle } from '../CharacterWebGPUCompiler';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

function characterComp(): HoloComposition {
  return {
    name: 'TestCharacter',
    objects: [
      {
        type: 'Object',
        name: 'Hero',
        traits: [
          { type: 'ObjectTrait', name: 'skeleton', config: { rig: 'humanoid_65' } },
          { type: 'ObjectTrait', name: 'body', config: { height: 1.7, build_scale: 1.0 } },
          {
            type: 'ObjectTrait',
            name: 'subsurface_scattering',
            config: { color: [0.8, 0.3, 0.2] },
          },
          { type: 'ObjectTrait', name: 'hair', config: { style: 'short', color: '#2c1810' } },
          { type: 'ObjectTrait', name: 'locomotion', config: { mode: 'walk', speed: 1.4 } },
        ],
      },
    ],
    templates: [],
    spatialGroups: [],
  } as unknown as HoloComposition;
}

function emptyComp(): HoloComposition {
  return {
    name: 'Empty',
    objects: [],
    templates: [],
    spatialGroups: [],
  } as unknown as HoloComposition;
}

// The first call exercises the lazy core→engine source import. Transforming
// that graph takes ~55s alone and up to ~95s inside the full sharded corpus;
// production consumes the already-built package.
const COLD_IMPORT_TIMEOUT_MS = 180_000;

describe('CharacterWebGPUCompiler', () => {
  it(
    'compiles a character .holo to a CharacterDrawSpec bundle with real skinned geometry',
    async () => {
      const out = await new CharacterWebGPUCompiler().compile(characterComp());
      const bundle = JSON.parse(out) as CharacterDrawSpecBundle;

      expect(bundle.format).toBe('character-webgpu/drawspec');
      // A real humanoid body, NOT a placeholder cube (24 position floats). Hundreds of verts.
      expect(bundle.vertexCount).toBeGreaterThan(50);
      expect(bundle.mesh.positions.length).toBeGreaterThan(300);
      expect(bundle.mesh.positions.length % 3).toBe(0);
      // GPU skinning data is present (the cube path has none).
      expect(bundle.mesh.jointIndices.length).toBe(bundle.vertexCount);
      expect(bundle.mesh.jointWeights.length).toBe(bundle.vertexCount);
      expect(bundle.jointMatrices.length).toBe(bundle.jointCount * 16);
      // Authored materials reached the bundle: skin + hair + eye material groups.
      expect(Array.isArray(bundle.materialGroups)).toBe(true);
      expect((bundle.materialGroups as unknown[]).length).toBeGreaterThanOrEqual(3);
      const models = (bundle.materialGroups as Array<{ material: { shadingModel: string } }>).map(
        (g) => g.material.shadingModel
      );
      expect(models).toContain('skin-sss');
      expect(models).toContain('marschner-hair');
      expect(models).toContain('refractive-eye');
    },
    COLD_IMPORT_TIMEOUT_MS
  );

  it('honours an entityId override option', async () => {
    const out = await new CharacterWebGPUCompiler({ entityId: 'brittney' }).compile(
      characterComp()
    );
    expect((JSON.parse(out) as CharacterDrawSpecBundle).entityId).toBe('brittney');
  });

  it('serializes operative @hair(style) topology and @morph vertex deformation', async () => {
    const neutralComposition = characterComp();
    const authoredComposition = characterComp();
    authoredComposition.objects[0]!.traits = authoredComposition.objects[0]!.traits!.map((trait) =>
      trait.name === 'hair'
        ? {
            ...trait,
            config: { style: 'swept_ridge', color: '#2c1810' },
          }
        : trait
    );
    authoredComposition.objects[0]!.traits!.push({
      type: 'ObjectTrait',
      name: 'morph',
      config: {
        targets: { blink: 0.7, mouthSmile: 0.55, jawOpen: 0.3 },
      },
    });

    const neutral = JSON.parse(
      await new CharacterWebGPUCompiler().compile(neutralComposition)
    ) as CharacterDrawSpecBundle;
    const authored = JSON.parse(
      await new CharacterWebGPUCompiler().compile(authoredComposition)
    ) as CharacterDrawSpecBundle;
    const morph = authored.morph as {
      schemaVersion: string;
      changedVertexCount: number;
      positionDigest: string;
    };
    const report = authored.report as { mapped: string[] };

    expect(authored.vertexCount).not.toBe(neutral.vertexCount);
    expect(authored.mesh.positions).not.toEqual(neutral.mesh.positions);
    expect(morph.schemaVersion).toBe('holoscript.native-facial-morph.v1');
    expect(morph.changedVertexCount).toBeGreaterThan(0);
    expect(morph.positionDigest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(report.mapped).toContain('@hair(style=swept_ridge)');
    expect(report.mapped.some((entry) => entry.startsWith('@morph(targets='))).toBe(true);
  });

  it('selects one named character from a multi-resident composition', async () => {
    const composition = {
      name: 'Family catalog',
      objects: [
        {
          id: 'Claude',
          name: 'Claude',
          traits: [
            { name: 'body', config: { height: 2.05 } },
            {
              name: 'clothing',
              config: {
                style: 'stormglass_hooded_tunic',
                mantle_style: 'anthropic_quiet_nested_arcs',
              },
            },
          ],
          children: [],
        },
        {
          id: 'Gemini',
          name: 'Gemini',
          traits: [
            { name: 'body', config: { height: 2.05 } },
            {
              name: 'clothing',
              config: {
                style: 'stormglass_hooded_tunic',
                mantle_style: 'google_paired_prism_panels',
              },
            },
          ],
          children: [],
        },
      ],
      templates: [],
      spatialGroups: [],
    } as unknown as HoloComposition;

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler({
        objectId: 'Gemini',
        entityId: 'gemini-story-resident',
      }).compile(composition)
    );

    expect(bundle.entityId).toBe('gemini-story-resident');
    expect(bundle.mantle.style).toBe('google_paired_prism_panels');
    expect(bundle.report.objectId).toBe('Gemini');
    expect(bundle.report.resolvedVia).toBe('objectId');
  });

  it('selects source-authored character LOD topology without fabricating tiers', async () => {
    const composition = characterComp();
    composition.objects[0]!.traits!.push(
      {
        type: 'ObjectTrait',
        name: 'clothing',
        config: { style: 'stormglass_hooded_tunic', color: '#557789' },
      },
      {
        type: 'ObjectTrait',
        name: 'lod',
        config: {
          levels: [
            { level: 0, distance: 0, garment_segments: 24 },
            { level: 2, distance: 28, garment_segments: 8 },
          ],
        },
      }
    );
    const lod0 = JSON.parse(
      await new CharacterWebGPUCompiler({ lodLevel: 0 }).compile(composition)
    ) as CharacterDrawSpecBundle;
    const lod2 = JSON.parse(
      await new CharacterWebGPUCompiler({ lodLevel: 2 }).compile(composition)
    ) as CharacterDrawSpecBundle;

    expect(lod0.lod).toEqual({ level: 0, distance: 0, garmentSegments: 24 });
    expect(lod2.lod).toEqual({ level: 2, distance: 28, garmentSegments: 8 });
    expect(lod0.vertexCount).toBeGreaterThan(lod2.vertexCount);
    expect(
      (lod0.materialGroups as Array<{ material: { shadingModel: string } }>).map(
        (group) => group.material.shadingModel
      )
    ).toEqual(['skin-sss', 'woven-cloth', 'lambert']);
  });

  it('serializes UVs, deterministic cloth metadata, and detachable mantle refs', async () => {
    const composition = characterComp();
    composition.objects[0]!.traits!.push(
      {
        type: 'ObjectTrait',
        name: 'clothing',
        config: {
          style: 'stormglass_hooded_tunic',
          mantle_style: 'openai_recursive_interlock',
          mantle_detachable: true,
          mantle_albedo_map: 'assets/openai-albedo.texture.json',
          mantle_normal_map: 'assets/openai-normal.texture.json',
          mantle_roughness_map: 'assets/openai-roughness.texture.json',
        },
      },
      {
        type: 'ObjectTrait',
        name: 'cloth_simulation',
        config: {
          solver: 'xpbd',
          fixed_step_hz: 120,
          iterations: 5,
          wind: [0.3, 0.02, 0.18],
        },
      }
    );

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler().compile(composition)
    ) as CharacterDrawSpecBundle;
    expect(bundle.mesh.uvs?.length).toBe(bundle.vertexCount * 2);
    expect(bundle.cloth).toMatchObject({ solver: 'xpbd', fixedStepHz: 120, iterations: 5 });
    expect(bundle.mantle).toEqual({
      style: 'openai_recursive_interlock',
      detachable: true,
      albedoMap: 'assets/openai-albedo.texture.json',
      normalMap: 'assets/openai-normal.texture.json',
      roughnessMap: 'assets/openai-roughness.texture.json',
    });
    expect(
      (bundle.materialGroups as Array<{ material: { shadingModel: string } }>).map(
        (group) => group.material.shadingModel
      )
    ).toEqual(['skin-sss', 'woven-cloth', 'lambert', 'woven-cloth']);
  });

  it('throws on a composition with no character object (no fabricated body — false case)', async () => {
    await expect(new CharacterWebGPUCompiler().compile(emptyComp())).rejects.toThrow(
      /no character object/
    );
  });
});
