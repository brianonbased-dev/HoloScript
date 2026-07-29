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
      expect(bundle.mesh.uvs?.length).toBe(bundle.vertexCount * 2);
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

  it('samples the authored locomotion gait into the emitted joint palette', async () => {
    const authored = JSON.parse(
      await new CharacterWebGPUCompiler().compile(characterComp())
    ) as CharacterDrawSpecBundle;
    const bindComposition = characterComp();
    bindComposition.objects[0].traits = bindComposition.objects[0].traits?.filter(
      (trait) => trait.name !== 'locomotion'
    );
    const bind = JSON.parse(
      await new CharacterWebGPUCompiler().compile(bindComposition)
    ) as CharacterDrawSpecBundle;

    expect(authored.jointMatrices).not.toEqual(bind.jointMatrices);
    expect(authored.report.mapped).toContain('@locomotion');
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

  it('serializes derived evidence for a source-authored sovereign groom', async () => {
    const composition = characterComp();
    composition.objects[0]!.traits = composition.objects[0]!.traits!.map((trait) =>
      trait.name === 'hair'
        ? {
            ...trait,
            config: {
              style: 'medium_wavy',
              color: '#39251c',
              groom_profile: 'scalp_flow_v1',
              card_width: 0.006,
              root_lift: 0.002,
              tip_taper: 0.1,
              hairline_bias: 0.16,
              coverage_profile: 'alpha_to_coverage_v1',
              strand_coverage: 0.74,
              edge_softness: 0.16,
              anisotropy_strength: 0.86,
              longitudinal_shift: 0.08,
            },
          }
        : trait
    );

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler().compile(composition)
    ) as CharacterDrawSpecBundle;
    const groom = bundle.groom as {
      schemaVersion: string;
      profile: string;
      rootTangentRadialDotP95: number;
      frontalOcclusionVertexCount: number;
      vertexCount: number;
      triangleCount: number;
      material: {
        schemaVersion: string;
        coverageProfile: string;
        strandCoverage: number;
        edgeSoftness: number;
        anisotropyStrength: number;
        longitudinalShift: number;
        alphaToCoverageRequested: boolean;
      };
    };
    const report = bundle.report as { mapped: string[]; stubbed: unknown[] };

    expect(groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v1',
      profile: 'scalp-flow-v1',
      scalpSurface: 'legacy-sphere',
      material: {
        schemaVersion: 'holoscript.agent-avatar-hair-material.v1',
        coverageProfile: 'alpha-to-coverage-v1',
        strandCoverage: 0.74,
        edgeSoftness: 0.16,
        anisotropyStrength: 0.86,
        longitudinalShift: 0.08,
        alphaToCoverageRequested: true,
      },
    });
    expect(groom.rootTangentRadialDotP95).toBeLessThan(0.01);
    expect(groom.vertexCount).toBeGreaterThan(0);
    expect(groom.triangleCount).toBeGreaterThan(0);
    expect(groom.frontalOcclusionVertexCount).toBeGreaterThanOrEqual(0);
    expect(report.mapped.some((entry) => entry.includes('groom_profile=scalp-flow-v1'))).toBe(true);
    expect(report.stubbed).toEqual([]);
  });

  it('serializes operative anatomy, crown-flow, and analytic skin receipts', async () => {
    const baseline = JSON.parse(
      await new CharacterWebGPUCompiler().compile(characterComp())
    ) as CharacterDrawSpecBundle;
    const composition = characterComp();
    composition.objects[0]!.traits = composition.objects[0]!.traits!.map((trait) => {
      if (trait.name === 'body') {
        return {
          ...trait,
          config: {
            ...trait.config,
            shoulder_scale: 1.12,
            torso_scale: 0.94,
          },
        };
      }
      if (trait.name === 'subsurface_scattering') {
        return {
          ...trait,
          config: {
            ...trait.config,
            microdetail_profile: 'analytic_pore_v1',
            microdetail_scale: 96,
            microdetail_strength: 0.09,
          },
        };
      }
      if (trait.name === 'hair') {
        return {
          ...trait,
          config: {
            ...trait.config,
            style: 'cropped_coils',
            groom_profile: 'scalp_flow_v1',
            crown_whorl: 0.42,
          },
        };
      }
      return trait;
    });
    composition.objects[0]!.traits!.push({
      type: 'ObjectTrait',
      name: 'face',
      config: {
        topology: 'neutral_anatomical_v2',
        face_width: 0.95,
        face_length: 1.07,
        jaw_taper: 0.3,
      },
    });

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler().compile(composition)
    ) as CharacterDrawSpecBundle;
    const report = bundle.report as { mapped: string[]; stubbed: unknown[] };
    const skinGroup = (
      bundle.materialGroups as Array<{
        material: { shadingModel: string; microdetailProfile?: string };
      }>
    ).find((group) => group.material.shadingModel === 'skin-sss');

    expect(bundle.mesh.positions).not.toEqual(baseline.mesh.positions);
    expect(bundle.anatomy).toEqual({
      schemaVersion: 'holoscript.agent-avatar-anatomy.v1',
      faceWidth: 0.95,
      faceLength: 1.07,
      jawTaper: 0.3,
      shoulderScale: 1.12,
      torsoScale: 0.94,
    });
    expect(bundle.skin).toEqual({
      schemaVersion: 'holoscript.agent-avatar-skin-material.v2',
      calibrationProfile: 'legacy-v1',
      shadingModel: 'skin-sss',
      color: 0xcc4d33,
      scatterColor: [0.8, 0.25, 0.13],
      scatterRadii: [3.67, 1.37, 0.68],
      specularF0: 0.028,
      thickness: 0.3,
      transmitStrength: 0.4,
      ambient: 0.12,
      microdetailProfile: 'analytic-pore-v1',
      microdetailScale: 96,
      microdetailStrength: 0.09,
      roughness: 0.45,
    });
    expect((bundle.groom as { crownWhorl: number }).crownWhorl).toBe(0.42);
    expect(skinGroup?.material.microdetailProfile).toBe('analytic-pore-v1');
    expect(report.mapped).toContain('@hair(crown_whorl=0.42)');
    expect(report.stubbed).toEqual([]);
  });

  it('serializes the decoupled calibrated skin-surface response', async () => {
    const composition = characterComp();
    const skinTrait = composition.objects[0]!.traits!.find(
      (trait) => trait.name === 'subsurface_scattering'
    )!;
    skinTrait.config = {
      color: '#B9826F',
      material_calibration_profile: 'fixed_light_human_v1',
      microdetail_profile: 'analytic_pore_v1',
      microdetail_scale: 104,
      microdetail_strength: 0.09,
      surface_response_profile: 'calibrated_skin_surface_v1',
      albedo_variation_strength: 0.024,
      roughness_variation_strength: 0.072,
      normal_microdetail_strength: 0.14,
    };

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler().compile(composition)
    ) as CharacterDrawSpecBundle;
    const skinGroup = (
      bundle.materialGroups as Array<{
        material: {
          shadingModel: string;
          surfaceResponseProfile?: string;
          albedoVariationStrength?: number;
          roughnessVariationStrength?: number;
          normalMicrodetailStrength?: number;
        };
      }>
    ).find((group) => group.material.shadingModel === 'skin-sss');

    expect(bundle.skin).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-skin-material.v3',
      calibrationProfile: 'fixed-light-human-v1',
      surfaceResponseProfile: 'calibrated-skin-surface-v1',
      albedoVariationStrength: 0.024,
      roughnessVariationStrength: 0.072,
      normalMicrodetailStrength: 0.14,
    });
    expect(skinGroup?.material).toMatchObject({
      surfaceResponseProfile: 'calibrated-skin-surface-v1',
      albedoVariationStrength: 0.024,
      roughnessVariationStrength: 0.072,
      normalMicrodetailStrength: 0.14,
    });
  });

  it('serializes source-authored neutral anatomical facial topology', async () => {
    const composition = characterComp();
    composition.objects[0]!.traits!.push(
      {
        type: 'ObjectTrait',
        name: 'face',
        config: {
          topology: 'neutral_anatomical_v2',
          radial_segments: 20,
          vertical_segments: 14,
          tearline: true,
        },
      },
      {
        type: 'ObjectTrait',
        name: 'morph',
        config: { targets: { smile: 0.4 } },
      }
    );

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler().compile(composition)
    ) as CharacterDrawSpecBundle;
    const report = bundle.report as { mapped: string[]; stubbed: unknown[] };
    const morph = bundle.morph as { topology: string; changedVertexCount: number };

    expect(bundle.face).toEqual({
      topology: 'neutral-anatomical-v2',
      radialSegments: 20,
      verticalSegments: 14,
      tearline: true,
    });
    expect(morph.topology).toBe('neutral-anatomical-v2');
    expect(morph.changedVertexCount).toBeGreaterThan(20);
    expect(report.mapped).toContain('@face(topology=neutral-anatomical-v2)');
    expect(report.stubbed).toEqual([]);
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

  it('serializes source-authored native hair topology budgets per LOD tier', async () => {
    const composition = characterComp();
    composition.objects[0]!.traits!.push({
      type: 'ObjectTrait',
      name: 'lod',
      config: {
        mode: 'distance',
        hysteresis: 0.65,
        fade_mode: 'dither',
        fade_duration_ms: 260,
        levels: [
          {
            level: 0,
            distance: 0,
            garment_segments: 24,
            hair_guides: 112,
            hair_cards_per_guide: 2,
            hair_segments: 4,
          },
          {
            level: 2,
            distance: 20,
            garment_segments: 8,
            hair_guides: 36,
            hair_cards_per_guide: 1,
            hair_segments: 2,
          },
        ],
      },
    });
    const lod0 = JSON.parse(
      await new CharacterWebGPUCompiler({ lodLevel: 0 }).compile(composition)
    ) as CharacterDrawSpecBundle;
    const lod2 = JSON.parse(
      await new CharacterWebGPUCompiler({ lodLevel: 2 }).compile(composition)
    ) as CharacterDrawSpecBundle;

    expect(lod0.lod).toEqual({
      level: 0,
      distance: 0,
      garmentSegments: 24,
      hairGuides: 112,
      hairCardsPerGuide: 2,
      hairSegments: 4,
      transition: {
        schemaVersion: 'holoscript.character-lod-transition.v1',
        selectionMode: 'distance',
        mode: 'dither',
        durationSeconds: 0.26,
        hysteresisBand: 0.65,
      },
    });
    expect(lod2.lod).toEqual({
      level: 2,
      distance: 20,
      garmentSegments: 8,
      hairGuides: 36,
      hairCardsPerGuide: 1,
      hairSegments: 2,
      transition: {
        schemaVersion: 'holoscript.character-lod-transition.v1',
        selectionMode: 'distance',
        mode: 'dither',
        durationSeconds: 0.26,
        hysteresisBand: 0.65,
      },
    });
    expect(lod0.vertexCount).toBeGreaterThan(lod2.vertexCount);
    expect(
      (lod0.materialGroups as Array<{ material: { shadingModel: string } }>).map(
        (group) => group.material.shadingModel
      )
    ).toEqual(['skin-sss', 'marschner-hair', 'refractive-eye']);
  });

  it('serializes H3J civic landmarks, groom clusters, and open garment receipts', async () => {
    const make = ({
      detail = true,
      clusters = true,
      garment = true,
    }: {
      detail?: boolean;
      clusters?: boolean;
      garment?: boolean;
    }) => {
      const composition = characterComp();
      composition.objects[0]!.traits = composition.objects[0]!.traits!.map((trait) =>
        trait.name === 'hair'
          ? {
              ...trait,
              config: {
                ...trait.config,
                style: 'cropped_coils',
                groom_profile: 'scalp_flow_v1',
                ...(clusters ? { cluster_count: 12, cluster_spread: 0.44 } : {}),
              },
            }
          : trait
      );
      composition.objects[0]!.traits!.push(
        {
          type: 'ObjectTrait',
          name: 'face',
          config: {
            topology: 'neutral_anatomical_v2',
            radial_segments: 28,
            vertical_segments: 20,
            tearline: true,
            orbital_profile: 'recessed_lids_v1',
            eye_recess: 0.34,
            lid_opening: 0.46,
            canthal_tilt: 0.14,
            ocular_profile: 'layered_ocular_v1',
            ...(detail
              ? {
                  facial_detail_profile: 'civic_landmarks_v1',
                  eye_scale: 0.84,
                  brow_height: 1.18,
                  brow_thickness: 0.2,
                  ear_scale: 1.06,
                  mouth_depth: 0.88,
                }
              : {}),
          },
        },
        {
          type: 'ObjectTrait',
          name: 'lod',
          config: {
            levels: [
              {
                level: 0,
                distance: 0,
                garment_segments: 24,
                hair_guides: 168,
                hair_cards_per_guide: 2,
                hair_segments: 7,
              },
            ],
          },
        }
      );
      if (garment) {
        composition.objects[0]!.traits!.push({
          type: 'ObjectTrait',
          name: 'clothing',
          config: {
            style: 'stormglass_open_civic_tunic',
            color: '#315964',
          },
        });
      }
      return composition;
    };

    const compiler = new CharacterWebGPUCompiler({ lodLevel: 0 });
    const authored = JSON.parse(await compiler.compile(make({}))) as CharacterDrawSpecBundle;
    const legacyLandmarks = JSON.parse(
      await compiler.compile(make({ detail: false }))
    ) as CharacterDrawSpecBundle;
    const unclustered = JSON.parse(
      await compiler.compile(make({ clusters: false }))
    ) as CharacterDrawSpecBundle;
    const unclothed = JSON.parse(
      await compiler.compile(make({ garment: false }))
    ) as CharacterDrawSpecBundle;

    expect(authored.facialLandmarks).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-facial-landmarks.v1',
      profile: 'civic-landmarks-v1',
      radialSegments: 28,
      verticalSegments: 20,
      eyeScale: 0.84,
      browHeight: 1.18,
      browThickness: 0.2,
      earScale: 1.06,
      mouthDepth: 0.88,
    });
    expect(authored.groom).toMatchObject({ clusterCount: 12, clusterSpread: 0.44 });
    expect(authored.garment).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v1',
      style: 'stormglass_open_civic_tunic',
      radialSegments: 24,
      faceCoverage: 'open-v-collar',
      visorVertexCount: 0,
      visorTriangleCount: 0,
    });
    expect(authored.report.stubbed).toEqual([]);
    expect(authored.vertexCount).toBeGreaterThan(legacyLandmarks.vertexCount);
    expect(authored.mesh.positions).not.toEqual(unclustered.mesh.positions);
    expect(authored.vertexCount).toBeGreaterThan(unclothed.vertexCount);
    expect(legacyLandmarks.facialLandmarks).toBeUndefined();
    expect(unclustered.groom?.clusterCount).toBeUndefined();
    expect(unclothed.garment).toBeUndefined();
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

  it('serializes V4 dual influences and the operative source pose receipt', async () => {
    const composition = characterComp();
    composition.objects[0]!.traits = composition.objects[0]!.traits!.map((trait) =>
      trait.name === 'body'
        ? {
            ...trait,
            config: {
              ...trait.config,
              upper_body_profile: 'coherent_deforming_hands_v4',
              upper_body_radial_segments: 24,
            },
          }
        : trait
    );
    composition.objects[0]!.traits!.push({
      type: 'ObjectTrait',
      name: 'pose',
      config: {
        name: 'compiler-operative-open-palm',
        bones: {
          left_shoulder: [0, 0, 0.173648, 0.984808],
          left_hand: [0, 0, -0.258819, 0.965926],
          left_index_proximal: [0, 0, 0.130526, 0.991445],
        },
      },
    });

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler().compile(composition)
    ) as CharacterDrawSpecBundle;
    const secondaryIndices = bundle.mesh.secondaryJointIndices!;
    const secondaryWeights = bundle.mesh.secondaryJointWeights!;

    expect(secondaryIndices).toHaveLength(bundle.vertexCount);
    expect(secondaryWeights).toHaveLength(bundle.vertexCount);
    expect(secondaryWeights.filter((weight) => weight > 0)).toHaveLength(1008);
    for (let vertex = 0; vertex < bundle.vertexCount; vertex++) {
      expect(bundle.mesh.jointWeights[vertex] + secondaryWeights[vertex]).toBeCloseTo(1, 6);
    }
    expect(bundle.pose).toEqual({
      schemaVersion: 'holoscript.character-source-pose.v1',
      name: 'compiler-operative-open-palm',
      space: 'local-bone',
      quaternionOrder: 'xyzw',
      boneCount: 3,
      boneNames: ['left_hand', 'left_index_proximal', 'left_shoulder'],
      normalizedQuaternionCount: 0,
    });
    expect(bundle.jointDeformation).toEqual({
      schemaVersion: 'holoscript.agent-avatar-joint-deformation.v1',
      profile: 'dual-influence-upper-limb-v1',
      influencedVertexCount: 1008,
      jointPairCount: 38,
      maxSecondaryWeight: 0.55,
      maxWeightSumError: 0,
      regionVertexCounts: {
        shoulder: 96,
        elbow: 96,
        wrist: 96,
        digitRoot: 240,
        fingerJoint: 480,
      },
    });
    expect(
      (bundle.report as { mapped: string[] }).mapped.some((entry) =>
        entry.startsWith('@pose(name=compiler-operative-open-palm')
      )
    ).toBe(true);
  });

  it('throws on a composition with no character object (no fabricated body — false case)', async () => {
    await expect(new CharacterWebGPUCompiler().compile(emptyComp())).rejects.toThrow(
      /no character object/
    );
  });

  it('serializes the sovereign V5 hand-surface receipt from the authored body profile', async () => {
    const composition = characterComp();
    composition.objects[0]!.traits = composition.objects[0]!.traits!.map((trait) =>
      trait.name === 'body'
        ? {
            ...trait,
            config: {
              ...trait.config,
              upper_body_profile: 'coherent_hand_surface_v5',
              upper_body_radial_segments: 24,
            },
          }
        : trait
    );

    const bundle = JSON.parse(
      await new CharacterWebGPUCompiler().compile(composition)
    ) as CharacterDrawSpecBundle;
    expect(bundle.anatomy).toMatchObject({
      upperBody: {
        profile: 'anatomical-hand-surface-v5',
        upperLimbs: [
          { profile: 'tapered-hand-surface-v5', ringCount: 13 },
          { profile: 'tapered-hand-surface-v5', ringCount: 13 },
        ],
      },
    });
    expect(bundle.handSurface).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-hand-surface.v1',
      profile: 'tapered-digit-commissure-cuticle-wrist-v1',
      upperBodyProfile: 'coherent-hand-surface-v5',
      regionVertexCounts: {
        wristTransition: 288,
        digitSections: 1690,
        metacarpalKnuckles: 260,
        interdigitalCommissures: 560,
        nailCuticles: 980,
      },
      regionIndexCounts: {
        wristTransition: 1728,
        digitSections: 9720,
        metacarpalKnuckles: 1440,
        interdigitalCommissures: 3264,
        nailCuticles: 5760,
      },
    });
    expect(bundle.mesh.secondaryJointWeights?.filter((weight) => weight > 0)).toHaveLength(1008);
    expect(bundle.jointDeformation).toMatchObject({
      profile: 'dual-influence-upper-limb-v1',
      influencedVertexCount: 1008,
      jointPairCount: 38,
    });
    expect(
      (bundle.report as { mapped: string[] }).mapped.some((entry) =>
        entry.includes('upper_body_profile=coherent-hand-surface-v5')
      )
    ).toBe(true);
  });
});
