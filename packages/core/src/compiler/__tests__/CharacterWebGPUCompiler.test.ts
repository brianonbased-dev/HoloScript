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
          { type: 'ObjectTrait', name: 'subsurface_scattering', config: { color: [0.8, 0.3, 0.2] } },
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
  return { name: 'Empty', objects: [], templates: [], spatialGroups: [] } as unknown as HoloComposition;
}

describe('CharacterWebGPUCompiler', () => {
  it('compiles a character .holo to a CharacterDrawSpec bundle with real skinned geometry', async () => {
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
  });

  it('honours an entityId override option', async () => {
    const out = await new CharacterWebGPUCompiler({ entityId: 'brittney' }).compile(characterComp());
    expect((JSON.parse(out) as CharacterDrawSpecBundle).entityId).toBe('brittney');
  });

  it('throws on a composition with no character object (no fabricated body — false case)', async () => {
    await expect(new CharacterWebGPUCompiler().compile(emptyComp())).rejects.toThrow(/no character object/);
  });
});
