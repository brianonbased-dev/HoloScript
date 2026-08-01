/**
 * CharacterHostFromComposition tests — the authored-composition → renderable-host bridge.
 *
 * Pure data, no GPU, no parser dependency: feeds hand-built AST views (matching the
 * HoloComposition shape) and asserts the trait mapping + the honest mapped/stubbed report,
 * including the false case (G.GOLD.013): an empty composition yields ok:false, no body.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCharacterHostFromComposition,
  type ParsedComposition,
} from '../CharacterHostFromComposition';
import {
  getSovereignMantleCatalogEntry,
  listSovereignMantleStyles,
} from '../AgentAvatarMantleCatalog';
import { BONE_ORDER } from '../AgentAvatarMesh';
import { deriveCharacterMaterialPlateReceipt, packCharacterMaterial } from '../character-render';

describe('buildCharacterHostFromComposition', () => {
  it('maps @body/@subsurface_scattering/@locomotion from a template-using object', () => {
    const comp: ParsedComposition = {
      name: 'Warrior Avatar',
      templates: [
        {
          name: 'Rig',
          traits: [
            { name: 'skeleton', config: { rig: 'humanoid_65' } },
            { name: 'body', config: { height: 1.85, build_scale: 1.3 } },
            { name: 'subsurface_scattering', config: { color: [0.78, 0.55, 0.4] } },
            { name: 'locomotion', config: { default_mode: 'smooth', smooth_speed: 1.6 } },
            {
              name: 'morph',
              config: {
                targets: { blink: 0.5, mouthSmile: 0.75, bodyHeight: 0.2 },
              },
            },
            { name: 'hair', config: { style: 'long' } },
          ],
        },
      ],
      objects: [{ name: 'Warrior', template: 'Rig', position: { x: 1, y: 0, z: 0 } }],
    };

    const r = buildCharacterHostFromComposition(comp);
    expect(r.ok).toBe(true);
    expect(r.host).toBeDefined();
    expect(r.report.resolvedVia).toBe('body-trait-heuristic');

    // @body height 1.85m → scale 1.057; @subsurface_scattering color packed; @locomotion smooth→walk.
    expect(r.report.mapped).toContain('@body');
    expect(r.report.mapped).toContain('@subsurface_scattering');
    expect(r.report.mapped).toContain('@locomotion');
    expect(r.materialColor).toBe((199 << 16) | (140 << 8) | 102); // round([.78,.55,.4]*255)
    expect(r.gait?.mode).toBe('walk'); // smooth → walk (with a downgrade warning)
    expect(r.gait?.speed).toBeCloseTo(1.6);
    expect(r.report.warnings.some((w) => w.includes("'smooth'"))).toBe(true);

    // The supported native morph/style subset is operative; unsupported body morph stays honest.
    const stubbed = r.report.stubbed.map((s) => s.trait);
    expect(stubbed).toContain('@morph(target=bodyHeight)');
    expect(r.report.mapped).toContain('@hair(style=long)');
    expect(r.report.mapped.some((m) => m.startsWith('@morph(targets='))).toBe(true);
    expect(r.morph?.changedVertexCount).toBeGreaterThan(0);
    expect(r.morph?.appliedTargets.map(({ target }) => target)).toEqual([
      'blink_left',
      'blink_right',
      'smile',
    ]);
    expect(r.report.mapped.some((m) => m.startsWith('@skeleton'))).toBe(true);
  });

  it('@hair(color) is operative — authored colour drives the rendered Marschner melanin (D.104)', () => {
    const make = (hex: string) =>
      buildCharacterHostFromComposition({
        objects: [
          {
            name: 'A',
            traits: [
              { name: 'body', config: {} },
              { name: 'hair', config: { style: 'short', color: hex } },
            ],
          },
        ],
      });
    const dark = make('#1a0e08');
    const blonde = make('#e8d088');
    expect(dark.report.mapped).toContain('@hair(color)');
    expect(dark.report.mapped).toContain('@hair(style=short)');

    const materialOf = (r: ReturnType<typeof make>) => {
      const g = r.host
        ?.getDrawSpec()
        .materialGroups?.find((x) => x.material.shadingModel === 'marschner-hair');
      return g && g.material.shadingModel === 'marschner-hair' ? g.material : undefined;
    };
    // Darker authored hair → more eumelanin: the .holo colour reaches the draw spec, not a constant.
    expect(materialOf(dark)?.melanin).toBeGreaterThan(materialOf(blonde)?.melanin ?? 0);
    expect(materialOf(dark)?.color).toBe(0x1a0e08);
    expect(materialOf(blonde)?.color).toBe(0xe8d088);
    expect(materialOf(dark)?.sourceColorWeight).toBe(0.55);
    expect(materialOf(dark)?.color).not.toBe(materialOf(blonde)?.color);
    const packed = packCharacterMaterial(materialOf(dark)!);
    [0x1a / 255, 0x0e / 255, 0x08 / 255].forEach((channel, index) =>
      expect(packed[index]).toBeCloseTo(channel)
    );
    expect(packed[13]).toBeCloseTo(0.55);
    expect(dark.host?.getHairMaterialReceipt()).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-hair-material.v2',
      sourceColor: 0x1a0e08,
      sourceColorWeight: 0.55,
    });
    expect(dark.report.warnings.some((w) => w.includes('style'))).toBe(false);
  });

  it('@hair(groom_profile) maps source controls into derived native geometry evidence', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'ScalpFlow',
          traits: [
            { name: 'body', config: { height: 1.78 } },
            { name: 'face', config: { topology: 'neutral_anatomical_v2' } },
            {
              name: 'hair',
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
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain(
      '@hair(groom_profile=scalp-flow-v1,card_width=0.006,root_lift=0.002,' +
        'tip_taper=0.1,hairline_bias=0.16)'
    );
    expect(result.report.mapped).toContain(
      '@hair(coverage_profile=alpha-to-coverage-v1,strand_coverage=0.74,' +
        'edge_softness=0.16,anisotropy_strength=0.86,longitudinal_shift=0.08)'
    );
    expect(result.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v1',
      profile: 'scalp-flow-v1',
      scalpSurface: 'neutral-anatomical-ellipsoid',
      rootLift: 0.002,
      tipTaper: 0.1,
      hairlineBias: 0.16,
      material: {
        schemaVersion: 'holoscript.agent-avatar-hair-material.v2',
        sourceColor: 0x39251c,
        sourceColorWeight: 0.55,
        coverageProfile: 'alpha-to-coverage-v1',
        strandCoverage: 0.74,
        edgeSoftness: 0.16,
        anisotropyStrength: 0.86,
        longitudinalShift: 0.08,
        tangentAttribute: 'strand-flow',
        cardUvAttribute: 'card-width',
        alphaToCoverageRequested: true,
      },
    });
    expect(result.host?.getGroomGeometryReceipt()).toEqual(result.groom);
    expect(result.groom!.rootTangentRadialDotP95).toBeLessThan(0.01);
  });

  it('keeps unknown hair styles explicit instead of accepting the default as authored', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'UnknownStyle',
          traits: [
            { name: 'body', config: {} },
            { name: 'hair', config: { style: 'impossible_cloud' } },
          ],
        },
      ],
    });
    expect(result.report.mapped.some((entry) => entry.startsWith('@hair(style='))).toBe(false);
    expect(result.report.stubbed).toContainEqual({
      trait: '@hair(style)',
      reason: "style 'impossible_cloud' has no native procedural geometry profile",
    });
  });

  it('keeps unknown groom profiles and orphan controls explicit', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'UnsupportedGroom',
          traits: [
            { name: 'body', config: {} },
            {
              name: 'hair',
              config: {
                style: 'short',
                groom_profile: 'billboard_wig_v9',
                card_width: 0.003,
                coverage_profile: 'painted_fuzz_v9',
                edge_softness: 0.2,
              },
            },
          ],
        },
      ],
    });
    expect(result.report.mapped.some((entry) => entry.includes('groom_profile='))).toBe(false);
    expect(result.report.stubbed).toContainEqual({
      trait: '@hair(groom_profile)',
      reason: "groom profile 'billboard_wig_v9' has no native geometry implementation",
    });
    expect(result.report.stubbed).toContainEqual({
      trait: '@hair(groom_controls)',
      reason: 'groom controls require a supported @hair(groom_profile)',
    });
    expect(result.report.stubbed).toContainEqual({
      trait: '@hair(coverage_profile)',
      reason: "coverage profile 'painted_fuzz_v9' has no native material implementation",
    });
    expect(result.report.stubbed).toContainEqual({
      trait: '@hair(material_controls)',
      reason: 'material controls require a supported @hair(coverage_profile)',
    });
    expect(result.groom?.profile).toBe('radial-cards-v1');
    expect(result.groom?.tipTaper).toBe(1);
  });

  it('@subsurface_scattering(scatter_color) keeps non-human bodies out of the fixed human preset', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'Stormglass',
          traits: [
            { name: 'body', config: {} },
            {
              name: 'subsurface_scattering',
              config: { color: '#9ab3be', scatter_color: '#6f9fb3' },
            },
          ],
        },
      ],
    });
    const skin = result.host
      ?.getDrawSpec()
      .materialGroups?.find((group) => group.material.shadingModel === 'skin-sss');
    expect(result.report.mapped).toContain('@subsurface_scattering(scatter_color)');
    expect(skin?.material.shadingModel).toBe('skin-sss');
    if (skin?.material.shadingModel === 'skin-sss') {
      expect(skin.material.scatterColor).toEqual([0x6f / 255, 0x9f / 255, 0xb3 / 255]);
    }
  });

  it('maps bounded anatomy, crown-flow, and analytic skin microdetail into exact native receipts', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'H3IResident',
          traits: [
            {
              name: 'body',
              config: {
                height: 1.82,
                build_scale: 1.02,
                shoulder_scale: 1.12,
                torso_scale: 0.94,
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                face_width: 0.95,
                face_length: 1.07,
                jaw_taper: 0.3,
              },
            },
            {
              name: 'subsurface_scattering',
              config: {
                color: '#b9785f',
                scatter_color: '#b85f4c',
                microdetail_profile: 'analytic_pore_v1',
                microdetail_scale: 96,
                microdetail_strength: 0.09,
              },
            },
            {
              name: 'hair',
              config: {
                style: 'cropped_coils',
                groom_profile: 'scalp_flow_v1',
                crown_whorl: 0.42,
              },
            },
          ],
        },
      ],
    });
    const skinGroup = result.host
      ?.getDrawSpec()
      .materialGroups?.find((group) => group.material.shadingModel === 'skin-sss');

    expect(result.report.stubbed).toEqual([]);
    expect(result.anatomy).toEqual({
      schemaVersion: 'holoscript.agent-avatar-anatomy.v1',
      faceWidth: 0.95,
      faceLength: 1.07,
      jawTaper: 0.3,
      shoulderScale: 1.12,
      torsoScale: 0.94,
    });
    expect(result.skin).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-skin-material.v2',
      calibrationProfile: 'legacy-v1',
      shadingModel: 'skin-sss',
      microdetailProfile: 'analytic-pore-v1',
      microdetailScale: 96,
      microdetailStrength: 0.09,
      roughness: 0.45,
    });
    expect(result.groom?.crownWhorl).toBe(0.42);
    expect(result.face).toMatchObject({
      faceWidth: 0.95,
      faceLength: 1.07,
      jawTaper: 0.3,
    });
    expect(result.report.mapped).toContain('@body(shoulder_scale=1.12,torso_scale=0.94)');
    expect(result.report.mapped).toContain('@face(face_width=0.95,face_length=1.07,jaw_taper=0.3)');
    expect(result.report.mapped).toContain('@hair(crown_whorl=0.42)');
    expect(result.report.mapped).toContain(
      '@subsurface_scattering(microdetail_profile=analytic-pore-v1,' +
        'microdetail_scale=96,microdetail_strength=0.09)'
    );
    expect(skinGroup?.material.shadingModel).toBe('skin-sss');
    if (skinGroup?.material.shadingModel === 'skin-sss') {
      expect(skinGroup.material.microdetailProfile).toBe('analytic-pore-v1');
      const packed = packCharacterMaterial(skinGroup.material);
      expect(packed[11]).toBeCloseTo(0.09);
      expect(packed[19]).toBe(96);
    }
  });

  it('maps decoupled albedo, roughness, and fine-normal skin response into the native ABI', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'H3TResident',
          traits: [
            { name: 'body', config: { skin_tone: '#B9826F' } },
            {
              name: 'subsurface_scattering',
              config: {
                color: '#B9826F',
                material_calibration_profile: 'fixed_light_human_v1',
                microdetail_profile: 'analytic_pore_v1',
                microdetail_scale: 104,
                microdetail_strength: 0.09,
                surface_response_profile: 'calibrated_skin_surface_v1',
                albedo_variation_strength: 0.024,
                roughness_variation_strength: 0.072,
                normal_microdetail_strength: 0.14,
              },
            },
          ],
        },
      ],
    });
    const skinGroup = result.host
      ?.getDrawSpec()
      .materialGroups?.find((group) => group.material.shadingModel === 'skin-sss');

    expect(result.report.stubbed).toEqual([]);
    expect(result.skin).toEqual({
      schemaVersion: 'holoscript.agent-avatar-skin-material.v3',
      calibrationProfile: 'fixed-light-human-v1',
      shadingModel: 'skin-sss',
      color: 0xb9826f,
      scatterColor: [0.8, 0.25, 0.13],
      scatterRadii: [3.67, 1.37, 0.68],
      specularF0: 0.028,
      thickness: 0.24,
      transmitStrength: 0.32,
      ambient: 0.09,
      microdetailProfile: 'analytic-pore-v1',
      microdetailScale: 104,
      microdetailStrength: 0.09,
      roughness: 0.5,
      surfaceResponseProfile: 'calibrated-skin-surface-v1',
      albedoVariationStrength: 0.024,
      roughnessVariationStrength: 0.072,
      normalMicrodetailStrength: 0.14,
    });
    expect(result.report.mapped).toContain(
      '@subsurface_scattering(surface_response_profile=calibrated-skin-surface-v1,' +
        'albedo_variation_strength=0.024,roughness_variation_strength=0.072,' +
        'normal_microdetail_strength=0.14)'
    );
    expect(skinGroup?.material.shadingModel).toBe('skin-sss');
    if (skinGroup?.material.shadingModel === 'skin-sss') {
      expect(skinGroup.material.surfaceResponseProfile).toBe('calibrated-skin-surface-v1');
      const packed = packCharacterMaterial(skinGroup.material);
      expect(packed[16]).toBeCloseTo(0.024);
      expect(packed[17]).toBeCloseTo(0.072);
      expect(packed[18]).toBeCloseTo(0.14);
      expect(packed[19]).toBe(104);
    }
  });

  it('fails closed when anatomy, groom, or microdetail controls lack their native profiles', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'UnsupportedH3IControls',
          traits: [
            { name: 'body', config: {} },
            { name: 'face', config: { topology: 'procedural_head_v1', jaw_taper: 0.3 } },
            { name: 'hair', config: { crown_whorl: 0.5 } },
            { name: 'subsurface_scattering', config: { microdetail_strength: 0.1 } },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toContainEqual({
      trait: '@face(proportions)',
      reason: 'face proportion controls require topology neutral_anatomical_v2',
    });
    expect(result.report.stubbed).toContainEqual({
      trait: '@hair(groom_controls)',
      reason: 'groom controls require a supported @hair(groom_profile)',
    });
    expect(result.report.stubbed).toContainEqual({
      trait: '@subsurface_scattering(microdetail_controls)',
      reason: 'microdetail controls require a supported microdetail_profile',
    });
    expect(result.anatomy).toBeUndefined();
    expect(result.skin).toBeUndefined();
  });

  it('fails closed when decoupled skin controls lack their operative profiles', () => {
    const missingSurfaceProfile = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'MissingSurfaceProfile',
          traits: [
            { name: 'body', config: {} },
            {
              name: 'subsurface_scattering',
              config: {
                microdetail_profile: 'analytic_pore_v1',
                normal_microdetail_strength: 0.14,
              },
            },
          ],
        },
      ],
    });
    const missingMicrodetailProfile = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'MissingMicrodetailProfile',
          traits: [
            { name: 'body', config: {} },
            {
              name: 'subsurface_scattering',
              config: {
                surface_response_profile: 'calibrated_skin_surface_v1',
                normal_microdetail_strength: 0.14,
              },
            },
          ],
        },
      ],
    });

    expect(missingSurfaceProfile.report.stubbed).toContainEqual({
      trait: '@subsurface_scattering(surface_response_controls)',
      reason: 'decoupled surface controls require calibrated-skin-surface-v1',
    });
    expect(missingSurfaceProfile.skin?.schemaVersion).toBe(
      'holoscript.agent-avatar-skin-material.v2'
    );
    expect(missingMicrodetailProfile.report.stubbed).toContainEqual({
      trait: '@subsurface_scattering(surface_response_profile)',
      reason: 'calibrated-skin-surface-v1 requires analytic-pore-v1 microdetail',
    });
    expect(missingMicrodetailProfile.skin).toBeUndefined();
  });

  it('maps the coherent upper-body profile into the emitted native topology receipt', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'H3KResident',
          traits: [
            {
              name: 'body',
              config: {
                shoulder_scale: 1.1,
                torso_scale: 0.95,
                upper_body_profile: 'coherent_shoulder_neck_torso_v1',
                upper_body_radial_segments: 18,
              },
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain(
      '@body(upper_body_profile=coherent-shoulder-neck-torso-v1,' + 'upper_body_radial_segments=18)'
    );
    expect(result.anatomy?.upperBody).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-upper-body-geometry.v1',
      profile: 'coherent-shoulder-neck-torso-v1',
      radialSegments: 18,
      ringCount: 10,
      shoulderHalfWidth: 0.264,
      waistHalfWidth: 0.152,
      neckRadius: 0.054,
    });
    expect(result.host?.getAnatomyReceipt()).toEqual(result.anatomy);
  });

  it('maps the anatomical limb profile into native deltoid and digit receipts', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'H3MResident',
          traits: [
            {
              name: 'body',
              config: {
                shoulder_scale: 1.1,
                torso_scale: 0.96,
                upper_body_profile: 'coherent_anatomical_limbs_v2',
                upper_body_radial_segments: 24,
              },
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain(
      '@body(upper_body_profile=coherent-anatomical-limbs-v2,' + 'upper_body_radial_segments=24)'
    );
    expect(result.anatomy?.upperBody).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-upper-body-geometry.v1',
      profile: 'anatomical-shoulder-neck-torso-v2',
      radialSegments: 24,
      ringCount: 12,
    });
    expect(result.anatomy?.upperBody?.upperLimbs).toHaveLength(2);
    for (const limb of result.anatomy?.upperBody?.upperLimbs ?? []) {
      expect(limb).toMatchObject({
        schemaVersion: 'holoscript.agent-avatar-upper-limb-geometry.v1',
        profile: 'anatomical-deltoid-hand-v2',
        radialSegments: 24,
        ringCount: 9,
        deltoidBlendRingCount: 3,
        connectedSurfaceCount: 6,
      });
      expect(limb.digits?.map((digit) => digit.digit)).toEqual([
        'thumb',
        'index',
        'middle',
        'ring',
        'pinky',
      ]);
    }
    expect(
      result.anatomy?.upperBody?.upperLimbs.reduce(
        (count, limb) => count + (limb.digits?.length ?? 0),
        0
      )
    ).toBe(10);
    expect(result.host?.getAnatomyReceipt()).toEqual(result.anatomy);
  });

  it('maps v3 hand landmarks and isolates authored keratin nail material ranges', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'H3NResident',
          traits: [
            {
              name: 'body',
              config: {
                skin_tone: '#B9826F',
                shoulder_scale: 1.1,
                torso_scale: 0.96,
                upper_body_profile: 'coherent_hand_landmarks_v3',
                upper_body_radial_segments: 24,
                nail_tone: '#F0CABC',
                nail_roughness: 0.23,
              },
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain(
      '@body(upper_body_profile=coherent-hand-landmarks-v3,' + 'upper_body_radial_segments=24)'
    );
    expect(result.report.mapped).toContain('@body(nail_tone=15780540,nail_roughness=0.23)');
    expect(result.anatomy?.upperBody).toMatchObject({
      profile: 'anatomical-hand-landmarks-v3',
      radialSegments: 24,
      ringCount: 12,
    });
    const landmarkRanges = (result.anatomy?.upperBody?.upperLimbs ?? []).flatMap((limb) => {
      expect(limb.profile).toBe('anatomical-landmark-hand-v3');
      expect(limb.connectedSurfaceCount).toBe(24);
      expect(limb.handLandmarks).toHaveLength(18);
      return (
        limb.handLandmarks
          ?.filter((landmark) => landmark.materialRole === 'keratin-nail')
          .map((landmark) => landmark.indexRange) ?? []
      );
    });
    expect(landmarkRanges).toHaveLength(10);

    const groups = result.host?.getDrawSpec().materialGroups ?? [];
    const nailGroups = groups.filter(
      (group) =>
        group.material.shadingModel === 'skin-sss' &&
        group.material.color === 0xf0cabc &&
        group.material.roughness === 0.23
    );
    expect(nailGroups.map(({ indexStart, indexCount }) => ({ indexStart, indexCount }))).toEqual(
      landmarkRanges
    );
    const skinGroups = groups.filter(
      (group) => group.material.shadingModel === 'skin-sss' && group.material.color === 0xb9826f
    );
    expect(skinGroups).toHaveLength(3);
    for (const nail of nailGroups) {
      for (const skin of skinGroups) {
        expect(
          nail.indexStart + nail.indexCount <= skin.indexStart ||
            skin.indexStart + skin.indexCount <= nail.indexStart
        ).toBe(true);
      }
    }
  });

  it('maps fixed-light skin, keratin, and nail-bed calibration into the native draw schedule', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'H3QResident',
          traits: [
            {
              name: 'body',
              config: {
                skin_tone: '#B9826F',
                upper_body_profile: 'coherent_deforming_hands_v4',
                upper_body_radial_segments: 24,
                nail_tone: '#E6BEB2',
                nail_roughness: 0.24,
                nail_bed_tone: '#C9827C',
                nail_bed_roughness: 0.36,
              },
            },
            {
              name: 'subsurface_scattering',
              config: {
                color: '#B9826F',
                scatter_color: '#A65D50',
                material_calibration_profile: 'fixed_light_human_v1',
                microdetail_profile: 'analytic_pore_v1',
                microdetail_scale: 94,
                microdetail_strength: 0.074,
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain(
      '@subsurface_scattering(material_calibration_profile=fixed-light-human-v1)'
    );
    expect(result.report.mapped).toContain('@body(nail_bed_tone=13206140,nail_bed_roughness=0.36)');
    expect(result.anatomy?.upperBody?.profile).toBe('anatomical-deforming-hands-v4');
    expect(result.anatomy?.upperBody?.upperLimbs.map((limb) => limb.palmProfile)).toEqual([
      'arched-thenar-palm-v1',
      'arched-thenar-palm-v1',
    ]);
    expect(result.host?.getSkinMaterialReceipt()).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-skin-material.v2',
      calibrationProfile: 'fixed-light-human-v1',
      color: 0xb9826f,
      roughness: 0.5,
      thickness: 0.24,
      transmitStrength: 0.32,
      microdetailProfile: 'analytic-pore-v1',
      microdetailScale: 94,
      microdetailStrength: 0.074,
    });

    const receipt = deriveCharacterMaterialPlateReceipt(result.host!.getDrawSpec());
    expect(receipt).toMatchObject({
      schemaVersion: 'holoscript.character-material-plate.v2',
      roleCounts: {
        'keratin-nail': 20,
        'nail-bed': 10,
      },
      keratinIndexCount: 2160,
      nailBedIndexCount: 720,
      nailSurfaceIndexCount: 2880,
      skinNailOverlapIndexCount: 0,
      skinNailBedOverlapIndexCount: 0,
      nailBedKeratinOverlapIndexCount: 0,
      nailSeparatedFromSkin: true,
      nailBedSeparatedFromKeratin: true,
      calibratedNailSurface: true,
    });
  });

  it('scales the fixed-light nail partition for V5 cuticle-contoured plates', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'H3SResident',
          traits: [
            {
              name: 'body',
              config: {
                skin_tone: '#B9826F',
                upper_body_profile: 'coherent_hand_surface_v5',
                upper_body_radial_segments: 24,
                nail_tone: '#E6BEB2',
                nail_roughness: 0.24,
                nail_bed_tone: '#C9827C',
                nail_bed_roughness: 0.36,
              },
            },
            {
              name: 'subsurface_scattering',
              config: {
                color: '#B9826F',
                scatter_color: '#A65D50',
                material_calibration_profile: 'fixed_light_human_v1',
                microdetail_profile: 'analytic_pore_v1',
                microdetail_scale: 94,
                microdetail_strength: 0.074,
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.report.stubbed).toEqual([]);
    expect(result.handSurface).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-hand-surface.v1',
      profile: 'tapered-digit-commissure-cuticle-wrist-v1',
    });

    const receipt = deriveCharacterMaterialPlateReceipt(result.host!.getDrawSpec());
    expect(receipt).toMatchObject({
      schemaVersion: 'holoscript.character-material-plate.v2',
      roleCounts: {
        'keratin-nail': 20,
        'nail-bed': 10,
      },
      keratinIndexCount: 4320,
      nailBedIndexCount: 1440,
      nailSurfaceIndexCount: 5760,
      skinNailOverlapIndexCount: 0,
      skinNailBedOverlapIndexCount: 0,
      nailBedKeratinOverlapIndexCount: 0,
      nailSeparatedFromSkin: true,
      nailBedSeparatedFromKeratin: true,
      calibratedNailSurface: true,
    });
  });

  it('maps V6 portrait anatomy, facial silhouette, calibrated skin, and an arms-down pose', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'OpenAIResident',
          traits: [
            {
              name: 'body',
              config: {
                skin_tone: '#B9826F',
                upper_body_profile: 'coherent_portrait_anatomy_v6',
                upper_body_radial_segments: 24,
                shoulder_scale: 1.1,
                torso_scale: 0.96,
                nail_tone: '#E6BEB2',
                nail_roughness: 0.24,
                nail_bed_tone: '#C9827C',
                nail_bed_roughness: 0.36,
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                radial_segments: 28,
                vertical_segments: 20,
                facial_detail_profile: 'portrait_silhouette_v2',
                cheekbone_scale: 1.14,
                chin_projection: 1.12,
                temple_width: 0.94,
              },
            },
            {
              name: 'subsurface_scattering',
              config: {
                color: '#B9826F',
                scatter_color: '#A65D50',
                material_calibration_profile: 'fixed_light_human_v1',
                microdetail_profile: 'analytic_pore_v1',
                microdetail_scale: 94,
                microdetail_strength: 0.074,
              },
            },
            {
              name: 'pose',
              config: {
                name: 'portrait-arms-down',
                bones: {
                  left_upper_arm: [0, 0, -0.564642, 0.825336],
                  right_upper_arm: [0, 0, 0.564642, 0.825336],
                },
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.report.stubbed).toEqual([]);
    expect(result.anatomy?.upperBody?.profile).toBe('portrait-anatomy-v6');
    expect(result.anatomy?.upperBody?.upperLimbs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profile: 'portrait-deltoid-hand-surface-v6',
          shoulderBlendRingCount: 6,
          minimumShoulderRadiusRatio: 0.7,
        }),
      ])
    );
    expect(result.facialLandmarks).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-facial-landmarks.v2',
      profile: 'portrait-silhouette-v2',
      cheekboneScale: 1.14,
      chinProjection: 1.12,
      templeWidth: 0.94,
    });
    expect(result.face).toMatchObject({
      facialDetailProfile: 'portrait-silhouette-v2',
      cheekboneScale: 1.14,
      chinProjection: 1.12,
      templeWidth: 0.94,
    });
    expect(result.jointDeformation).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-joint-deformation.v2',
      profile: 'portrait-shoulder-volume-v2',
      regionVertexCounts: { shoulder: 288 },
      shoulderVolume: {
        blendRingCount: 6,
        minimumAuthoredRadiusRatio: 0.7,
      },
    });
    expect(result.handSurface?.upperBodyProfile).toBe('coherent-portrait-anatomy-v6');
    expect(result.pose).toMatchObject({
      name: 'portrait-arms-down',
      boneCount: 2,
      boneNames: ['left_upper_arm', 'right_upper_arm'],
    });
    expect(result.host!.getDrawSpec().mesh.secondaryJointIndices).toHaveLength(
      result.host!.getDrawSpec().mesh.vertexCount
    );
    expect(result.host!.getSkinMaterialReceipt()).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-skin-material.v2',
      calibrationProfile: 'fixed-light-human-v1',
      microdetailProfile: 'analytic-pore-v1',
    });
    expect(
      result.report.mapped.some((entry) =>
        entry.includes('@body(upper_body_profile=coherent-portrait-anatomy-v6')
      )
    ).toBe(true);
    expect(
      result.report.mapped.some((entry) =>
        entry.includes('@face(facial_detail_profile=portrait-silhouette-v2')
      )
    ).toBe(true);
  });

  it('does not silently accept portrait silhouette controls on a civic face profile', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'CivicResident',
          traits: [
            { name: 'body', config: {} },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                facial_detail_profile: 'civic_landmarks_v1',
                cheekbone_scale: 1.14,
              },
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toContainEqual({
      trait: '@face(portrait_silhouette_controls)',
      reason: 'cheekbone_scale, chin_projection, and temple_width require portrait_silhouette_v2',
    });
    expect(result.face?.cheekboneScale).toBeUndefined();
  });

  it('applies a validated source-authored operative pose and rejects unknown joint claims', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'OpenAIResident',
          traits: [
            {
              name: 'body',
              config: {
                upper_body_profile: 'coherent_deforming_hands_v4',
                upper_body_radial_segments: 24,
              },
            },
            {
              name: 'pose',
              config: {
                name: 'attentive-open-palm',
                bones: {
                  left_shoulder: [0, 0, 1, 1],
                  provider_magic_joint: [0, 0, 0, 1],
                  left_index_proximal: [0, 0, 0, 0],
                },
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.pose).toEqual({
      schemaVersion: 'holoscript.character-source-pose.v1',
      name: 'attentive-open-palm',
      space: 'local-bone',
      quaternionOrder: 'xyzw',
      boneCount: 1,
      boneNames: ['left_shoulder'],
      normalizedQuaternionCount: 1,
    });
    expect(result.jointDeformation).toEqual({
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
    expect(result.host!.getDrawSpec().mesh.secondaryJointIndices).toHaveLength(
      result.host!.getDrawSpec().mesh.vertexCount
    );
    expect(result.host!.getDrawSpec().mesh.secondaryJointWeights).toHaveLength(
      result.host!.getDrawSpec().mesh.vertexCount
    );
    expect(result.report.mapped).toContain('@pose(name=attentive-open-palm,bones=left_shoulder)');
    expect(result.report.stubbed).toContainEqual({
      trait: '@pose(bone=provider_magic_joint)',
      reason: 'bone is not part of the operative humanoid_65 palette',
    });
    expect(result.report.stubbed).toContainEqual({
      trait: '@pose(bone=left_index_proximal)',
      reason: 'rotation must be a finite non-zero local quaternion in xyzw order',
    });

    const shoulderMatrixStart = BONE_ORDER.indexOf('left_shoulder') * 16;
    const shoulderMatrix = Array.from(
      result.host!.getDrawSpec().jointMatrices.slice(shoulderMatrixStart, shoulderMatrixStart + 16)
    );
    expect(shoulderMatrix).not.toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('does not silently enable nail-bed controls without the fixed-light calibration profile', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'LegacyResident',
          traits: [
            {
              name: 'body',
              config: {
                upper_body_profile: 'coherent_hand_landmarks_v3',
                nail_bed_tone: '#C9827C',
              },
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toContainEqual({
      trait: '@body(nail_bed_material_controls)',
      reason: 'nail-bed controls require fixed-light-human-v1 material calibration',
    });
    const receipt = deriveCharacterMaterialPlateReceipt(result.host!.getDrawSpec());
    expect(receipt.schemaVersion).toBe('holoscript.character-material-plate.v1');
    expect(receipt.roleCounts['nail-bed']).toBeUndefined();
    expect(receipt.calibratedNailSurface).toBe(false);
  });

  it('fails closed on unsupported upper-body profiles and orphan topology controls', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'UnsupportedH3KBody',
          traits: [
            {
              name: 'body',
              config: {
                upper_body_profile: 'provider_mesh_magic_v9',
                upper_body_radial_segments: 20,
              },
            },
          ],
        },
      ],
    });

    expect(result.report.mapped.some((entry) => entry.includes('upper_body_profile='))).toBe(false);
    expect(result.report.stubbed).toContainEqual({
      trait: '@body(upper_body_profile)',
      reason: "profile 'provider-mesh-magic-v9' has no native upper-body geometry implementation",
    });
    expect(result.report.stubbed).toContainEqual({
      trait: '@body(upper_body_topology_controls)',
      reason: 'upper-body topology controls require a supported upper_body_profile',
    });
    expect(result.anatomy).toBeUndefined();
  });

  it('@face selects the neutral anatomical topology and receipts it through morph output', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'NeutralFace',
          traits: [
            { name: 'body', config: { height: 1.8, build_scale: 1.02 } },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                radial_segments: 22,
                vertical_segments: 16,
                tearline: true,
              },
            },
            { name: 'morph', config: { targets: { smile: 0.4 } } },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain('@face(topology=neutral-anatomical-v2)');
    expect(result.face).toEqual({
      topology: 'neutral-anatomical-v2',
      radialSegments: 22,
      verticalSegments: 16,
      tearline: true,
    });
    expect(result.morph?.topology).toBe('neutral-anatomical-v2');
    expect(result.morph?.changedVertexCount).toBeGreaterThan(20);
  });

  it('@face maps a layered ocular profile into native geometry and serialized material roles', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'LayeredEyes',
          traits: [
            { name: 'body', config: { height: 1.76 } },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                ocular_profile: 'layered_ocular_v1',
                iris_color: '#4f7f9c',
                sclera_color: '#eee9df',
                iris_scale: 0.5,
                pupil_scale: 0.38,
                cornea_ior: 1.376,
              },
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain('@face(ocular_profile=layered-ocular-v1)');
    expect(result.face).toMatchObject({
      ocularProfile: 'layered-ocular-v1',
      irisColor: 0x4f7f9c,
      scleraColor: 0xeee9df,
      irisScale: 0.5,
      pupilScale: 0.38,
      corneaIor: 1.376,
    });
    const eyeGroups = result.host
      ?.getDrawSpec()
      .materialGroups?.filter((group) => group.material.shadingModel === 'refractive-eye');
    expect(eyeGroups).toHaveLength(8);
    expect(
      eyeGroups?.map((group) =>
        group.material.shadingModel === 'refractive-eye' ? group.material.eyeRegion : undefined
      )
    ).toEqual(['sclera', 'sclera', 'iris', 'iris', 'pupil', 'pupil', 'cornea', 'cornea']);
  });

  it('@face maps a recessed-lids orbital profile into operative native geometry', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'FittedEyes',
          traits: [
            { name: 'body', config: { height: 1.8, build_scale: 1.02 } },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                tearline: true,
                orbital_profile: 'recessed_lids_v1',
                eye_recess: 0.3,
                lid_opening: 0.54,
                canthal_tilt: 0.14,
                ocular_profile: 'layered_ocular_v1',
              },
            },
          ],
        },
      ],
    });

    expect(result.report.stubbed).toEqual([]);
    expect(result.report.mapped).toContain('@face(orbital_profile=recessed-lids-v1)');
    expect(result.face).toMatchObject({
      topology: 'neutral-anatomical-v2',
      tearline: true,
      orbitalProfile: 'recessed-lids-v1',
      eyeRecess: 0.3,
      lidOpening: 0.54,
      canthalTilt: 0.14,
      ocularProfile: 'layered-ocular-v1',
    });
  });

  it('@face rejects unimplemented topology names instead of relabeling the legacy cap', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'UnsupportedFace',
          traits: [
            { name: 'body', config: {} },
            { name: 'face', config: { topology: 'production_scan_v9' } },
          ],
        },
      ],
    });

    expect(result.face).toBeUndefined();
    expect(result.report.stubbed).toContainEqual({
      trait: '@face',
      reason: "topology 'production-scan-v9' has no native facial geometry channel",
    });
  });

  it('@clothing and @lod produce faceless woven garment geometry with authored topology', () => {
    const make = (lodLevel: number) =>
      buildCharacterHostFromComposition(
        {
          objects: [
            {
              name: 'Stormglass',
              traits: [
                { name: 'body', config: { height: 2.05, build_scale: 1.15 } },
                {
                  name: 'clothing',
                  config: {
                    style: 'stormglass_hooded_tunic',
                    color: '#557789',
                  },
                },
                {
                  name: 'lod',
                  config: {
                    levels: [
                      { level: 0, distance: 0, garment_segments: 24 },
                      { level: 1, distance: 12, garment_segments: 14 },
                      { level: 2, distance: 28, garment_segments: 8 },
                    ],
                  },
                },
              ],
            },
          ],
        },
        { lodLevel }
      );

    const lod0 = make(0);
    const lod2 = make(2);
    const groups = lod0.host?.getDrawSpec().materialGroups ?? [];
    expect(lod0.report.mapped).toContain('@clothing(style=stormglass_hooded_tunic)');
    expect(lod0.report.mapped).toContain('@lod(level=0)');
    expect(lod0.lod).toEqual({ level: 0, distance: 0, garmentSegments: 24 });
    expect(groups.map((group) => group.material.shadingModel)).toEqual([
      'skin-sss',
      'woven-cloth',
      'lambert',
    ]);
    expect(lod0.host!.getDrawSpec().mesh.vertexCount).toBeGreaterThan(
      lod2.host!.getDrawSpec().mesh.vertexCount
    );
  });

  it('maps H3J open civic clothing, facial landmarks, and groom clusters as causal geometry', () => {
    const make = ({
      detail = true,
      clusters = true,
      garment = true,
    }: {
      detail?: boolean;
      clusters?: boolean;
      garment?: boolean;
    }) =>
      buildCharacterHostFromComposition({
        objects: [
          {
            name: 'CivicResident',
            traits: [
              { name: 'body', config: { height: 1.82, build_scale: 1.04 } },
              {
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
                name: 'hair',
                config: {
                  style: 'cropped_coils',
                  groom_profile: 'scalp_flow_v1',
                  ...(clusters ? { cluster_count: 12, cluster_spread: 0.44 } : {}),
                },
              },
              ...(garment
                ? [
                    {
                      name: 'clothing',
                      config: {
                        style: 'stormglass_open_civic_tunic',
                        color: '#315964',
                      },
                    },
                  ]
                : []),
              {
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
              },
            ],
          },
        ],
      });

    const authored = make({});
    const legacyLandmarks = make({ detail: false });
    const unclustered = make({ clusters: false });
    const unclothed = make({ garment: false });
    const spec = authored.host!.getDrawSpec();

    expect(authored.report.stubbed).toEqual([]);
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
    expect(authored.groom).toMatchObject({
      clusterCount: 12,
      clusterSpread: 0.44,
    });
    expect(authored.garment).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v1',
      style: 'stormglass_open_civic_tunic',
      radialSegments: 24,
      faceCoverage: 'open-v-collar',
      visorVertexCount: 0,
      visorTriangleCount: 0,
    });
    expect(authored.garment!.clothVertexCount).toBeGreaterThan(0);
    expect(authored.face).toMatchObject({
      facialDetailProfile: 'civic-landmarks-v1',
      eyeScale: 0.84,
      browHeight: 1.18,
      browThickness: 0.2,
      earScale: 1.06,
      mouthDepth: 0.88,
    });
    expect(
      spec.materialGroups?.filter((group) => group.material.shadingModel === 'refractive-eye')
    ).toHaveLength(8);
    expect(
      spec.materialGroups?.some((group) => group.material.shadingModel === 'marschner-hair')
    ).toBe(true);
    expect(
      spec.materialGroups?.some((group) => group.material.shadingModel === 'woven-cloth')
    ).toBe(true);
    expect(spec.mesh.vertexCount).toBeGreaterThan(
      legacyLandmarks.host!.getDrawSpec().mesh.vertexCount
    );
    expect(Array.from(spec.mesh.positions)).not.toEqual(
      Array.from(unclustered.host!.getDrawSpec().mesh.positions)
    );
    expect(spec.mesh.vertexCount).toBeGreaterThan(unclothed.host!.getDrawSpec().mesh.vertexCount);
    expect(legacyLandmarks.facialLandmarks).toBeUndefined();
    expect(unclustered.groom?.clusterCount).toBeUndefined();
    expect(unclothed.garment).toBeUndefined();
  });

  it('@lod carries source-authored native hair topology budgets without a second selector', () => {
    const make = (lodLevel: number) =>
      buildCharacterHostFromComposition(
        {
          objects: [
            {
              name: 'HearthKeeper',
              traits: [
                { name: 'body', config: { height: 1.82, build_scale: 1.02 } },
                { name: 'hair', config: { style: 'cropped_coils', color: '#2d201c' } },
                {
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
                        hair_guides: 168,
                        hair_cards_per_guide: 2,
                        hair_segments: 7,
                      },
                      {
                        level: 1,
                        distance: 8,
                        garment_segments: 14,
                        hair_guides: 92,
                        hair_cards_per_guide: 1,
                        hair_segments: 5,
                      },
                      {
                        level: 2,
                        distance: 20,
                        garment_segments: 8,
                        hair_guides: 48,
                        hair_cards_per_guide: 1,
                        hair_segments: 3,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        { lodLevel }
      );

    const lod0 = make(0);
    const lod1 = make(1);
    const lod2 = make(2);
    expect(lod0.lod).toEqual({
      level: 0,
      distance: 0,
      garmentSegments: 24,
      hairGuides: 168,
      hairCardsPerGuide: 2,
      hairSegments: 7,
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
      hairGuides: 48,
      hairCardsPerGuide: 1,
      hairSegments: 3,
      transition: {
        schemaVersion: 'holoscript.character-lod-transition.v1',
        selectionMode: 'distance',
        mode: 'dither',
        durationSeconds: 0.26,
        hysteresisBand: 0.65,
      },
    });
    expect(lod0.report.mapped).toContain(
      '@lod(hair_guides=168,hair_cards_per_guide=2,hair_segments=7)'
    );
    expect(lod0.report.mapped).toContain(
      '@lod(transition=dither,duration_s=0.26,hysteresis=0.65,selection=distance)'
    );
    expect(lod0.host!.getDrawSpec().mesh.vertexCount).toBeGreaterThan(
      lod1.host!.getDrawSpec().mesh.vertexCount
    );
    expect(lod1.host!.getDrawSpec().mesh.vertexCount).toBeGreaterThan(
      lod2.host!.getDrawSpec().mesh.vertexCount
    );
  });

  it('@lod fails closed instead of deriving unsupported character transition semantics', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'UnsupportedTransition',
          traits: [
            { name: 'body', config: {} },
            {
              name: 'lod',
              config: {
                mode: 'neural_guess',
                fade_mode: 'magic_blur',
                levels: [{ level: 0, distance: 0, garment_segments: 24 }],
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.lod?.transition).toBeUndefined();
    expect(result.report.stubbed).toContainEqual({
      trait: '@lod(transition)',
      reason:
        "unsupported mode 'neural-guess' or fade_mode 'magic-blur'; " +
        'native character transition receipt omitted',
    });
  });

  it('maps deterministic cloth plus a detachable UV-mapped OpenAI mantle', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'OpenAI',
          traits: [
            { name: 'body', config: { height: 2.05, build_scale: 1.15 } },
            {
              name: 'clothing',
              config: {
                style: 'stormglass_hooded_tunic',
                mantle_style: 'openai_recursive_interlock',
                mantle_color: '#d6d1c7',
                mantle_detachable: true,
                mantle_albedo_map: 'assets/openai-albedo.texture.json',
                mantle_normal_map: 'assets/openai-normal.texture.json',
                mantle_roughness_map: 'assets/openai-roughness.texture.json',
              },
            },
            {
              name: 'cloth_simulation',
              config: {
                solver: 'xpbd',
                fixed_step_hz: 120,
                iterations: 5,
                wind: [0.3, 0.02, 0.18],
                max_displacement: 0.18,
              },
            },
          ],
        },
      ],
    });

    expect(result.report.mapped).toContain('@clothing(mantle_style=openai_recursive_interlock)');
    expect(result.report.mapped).toContain('@cloth_simulation(solver=xpbd)');
    expect(result.mantle).toEqual({
      style: 'openai_recursive_interlock',
      detachable: true,
      albedoMap: 'assets/openai-albedo.texture.json',
      normalMap: 'assets/openai-normal.texture.json',
      roughnessMap: 'assets/openai-roughness.texture.json',
    });
    expect(result.cloth?.fixedStepHz).toBe(120);
    const spec = result.host!.getDrawSpec();
    expect(spec.mesh.uvs?.length).toBe(spec.mesh.vertexCount * 2);
    expect(spec.materialGroups?.map((group) => group.material.shadingModel)).toEqual([
      'skin-sss',
      'woven-cloth',
      'lambert',
      'woven-cloth',
    ]);

    const first = result.host!.sampleClothSimulation(0.5);
    const firstPositions = Array.from(result.host!.getDrawSpec().mesh.positions);
    const replay = result.host!.sampleClothSimulation(0.5);
    expect(first?.dynamicVertexCount).toBeGreaterThan(0);
    expect(first?.maxDisplacement).toBeGreaterThan(0.001);
    expect(replay?.positionDigest).toBe(first?.positionDigest);
    expect(Array.from(result.host!.getDrawSpec().mesh.positions)).toEqual(firstPositions);
    expect(result.host!.getMorphReceipt()).toBeNull();
  });

  it('maps the typed six-family catalog while preserving one neutral body and garment', () => {
    const build = (mantleStyle?: string) =>
      buildCharacterHostFromComposition({
        objects: [
          {
            name: mantleStyle ?? 'Neutral',
            traits: [
              { name: 'skeleton', config: { rig: 'humanoid_65' } },
              { name: 'body', config: { height: 2.05, build_scale: 1.15 } },
              {
                name: 'clothing',
                config: {
                  style: 'stormglass_hooded_tunic',
                  color: '#557f91',
                  ...(mantleStyle ? { mantle_style: mantleStyle } : {}),
                },
              },
            ],
          },
        ],
      });

    const neutral = build();
    const neutralSpec = neutral.host!.getDrawSpec();
    const mantlePositionDigests = new Set<string>();
    const styles = listSovereignMantleStyles();

    expect(styles).toHaveLength(6);
    for (const style of styles) {
      const result = build(style);
      const entry = getSovereignMantleCatalogEntry(style);
      const spec = result.host!.getDrawSpec();
      const neutralPositionLength = neutralSpec.mesh.positions.length;
      const neutralIndexLength = neutralSpec.mesh.indices.length;

      expect(result.report.stubbed).toEqual([]);
      expect(result.report.mapped).toContain(`@clothing(mantle_style=${style})`);
      expect(result.mantle).toEqual({ style, detachable: true });
      expect(Array.from(spec.mesh.positions.slice(0, neutralPositionLength))).toEqual(
        Array.from(neutralSpec.mesh.positions)
      );
      expect(Array.from(spec.mesh.indices.slice(0, neutralIndexLength))).toEqual(
        Array.from(neutralSpec.mesh.indices)
      );
      expect(spec.mesh.vertexCount - neutralSpec.mesh.vertexCount).toBeGreaterThan(0);
      expect(spec.mesh.vertexCount).toBe(
        build('openai_recursive_interlock').host!.getDrawSpec().mesh.vertexCount
      );
      expect(spec.materialGroups?.at(-1)?.material.color).toBe(entry.accentColor);
      mantlePositionDigests.add(
        Array.from(spec.mesh.positions.slice(neutralPositionLength))
          .map((value) => value.toFixed(5))
          .join(',')
      );
    }
    expect(mantlePositionDigests.size).toBe(6);
  });

  it('@skeleton(rig) is validated: matching rig → mapped, unsupported rig → stubbed', () => {
    const ok = buildCharacterHostFromComposition({
      objects: [{ name: 'A', traits: [{ name: 'skeleton', config: { rig: 'humanoid_65' } }] }],
    });
    expect(ok.report.mapped.some((m) => m.startsWith('@skeleton'))).toBe(true);

    const bad = buildCharacterHostFromComposition({
      objects: [{ name: 'B', traits: [{ name: 'skeleton', config: { rig: 'quadruped_32' } }] }],
    });
    expect(bad.report.stubbed.some((s) => s.trait === '@skeleton')).toBe(true);
  });

  it('non-bipedal locomotion (fly) degrades to idle and is recorded as stubbed', () => {
    const comp: ParsedComposition = {
      objects: [
        {
          name: 'Drone',
          traits: [
            { name: 'body', config: {} },
            { name: 'locomotion', config: { mode: 'fly' } },
          ],
        },
      ],
    };
    const r = buildCharacterHostFromComposition(comp);
    expect(r.ok).toBe(true);
    expect(r.gait?.mode).toBe('idle');
    expect(r.report.stubbed.some((s) => s.trait === '@locomotion')).toBe(true);
  });

  it('empty / bodyless composition → ok:false, no fabricated body (the false case)', () => {
    expect(buildCharacterHostFromComposition({}).ok).toBe(false);
    expect(buildCharacterHostFromComposition({ objects: [] }).ok).toBe(false);
  });

  it('respects an explicit objectId selection', () => {
    const comp: ParsedComposition = {
      objects: [
        { name: 'Prop', traits: [] },
        {
          id: 'hero',
          name: 'Hero',
          traits: [{ name: 'skeleton', config: { rig: 'humanoid_65' } }],
        },
      ],
    };
    const r = buildCharacterHostFromComposition(comp, { objectId: 'hero' });
    expect(r.ok).toBe(true);
    expect(r.report.resolvedVia).toBe('objectId');
    expect(r.report.objectId).toBe('hero');
  });

  it('maps V7 scapular asymmetry, @expression, and analytic environment light end to end', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          id: 'claude',
          traits: [
            {
              name: 'body',
              config: {
                upper_body_profile: 'coherent_expressive_anatomy_v7',
                upper_body_radial_segments: 24,
                left_scapular_elevation: 0.65,
                right_scapular_elevation: -0.25,
                left_scapular_protraction: 0.4,
                right_scapular_protraction: -0.3,
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                orbital_profile: 'recessed_lids_v1',
                facial_detail_profile: 'portrait_silhouette_v2',
              },
            },
            {
              name: 'expression',
              config: {
                blink_left: 0.72,
                blink_right: 0.18,
                brow_raise_right: 0.44,
                smile: 0.26,
                jaw_open: 0.08,
              },
            },
            {
              name: 'environment_light',
              config: {
                profile: 'analytic_three_point_v1',
                key_direction: [0.42, 0.74, 0.52],
                key_color: [1, 0.82, 0.68],
                key_intensity: 1.25,
                fill_direction: [-0.62, 0.18, 0.76],
                fill_color: [0.48, 0.64, 1],
                fill_intensity: 0.34,
                rim_direction: [0.68, 0.4, -0.62],
                rim_color: [1, 0.48, 0.28],
                rim_intensity: 0.58,
                exposure: 1.08,
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.jointDeformation).toMatchObject({
      profile: 'expressive-neck-scapular-volume-v3',
      regionVertexCounts: { neck: 96 },
      expressiveAsymmetry: {
        scapularElevation: { left: 0.65, right: -0.25 },
        scapularProtraction: { left: 0.4, right: -0.3 },
      },
    });
    expect(result.expression).toMatchObject({
      schemaVersion: 'holoscript.native-facial-morph.v2',
      appliedTargets: [
        { target: 'blink_left', weight: 0.72 },
        { target: 'blink_right', weight: 0.18 },
        { target: 'brow_raise_right', weight: 0.44 },
        { target: 'smile', weight: 0.26 },
        { target: 'jaw_open', weight: 0.08 },
      ],
    });
    expect(result.environmentLight?.receipt).toMatchObject({
      schemaVersion: 'holoscript.character-environment-light.v1',
      profile: 'analytic-three-point-v1',
      key: { color: [1, 0.82, 0.68], intensity: 1.25 },
      fill: { color: [0.48, 0.64, 1], intensity: 0.34 },
      rim: { color: [1, 0.48, 0.28], intensity: 0.58 },
      exposure: 1.08,
    });
    expect(result.report.mapped).toContain('@environment_light(profile=analytic-three-point-v1)');
    expect(result.report.mapped.some((entry) => entry.startsWith('@expression('))).toBe(true);
    expect(result.report.stubbed).toEqual([]);
  });

  it('maps H3X close-up face LODs, cranial continuity, and expression normals', () => {
    const composition: ParsedComposition = {
      objects: [
        {
          id: 'openai',
          traits: [
            {
              name: 'lod',
              config: {
                levels: [
                  {
                    level: 0,
                    distance: 0,
                    garment_segments: 24,
                    face_radial_segments: 44,
                    face_vertical_segments: 30,
                  },
                  {
                    level: 2,
                    distance: 16,
                    garment_segments: 12,
                    face_radial_segments: 24,
                    face_vertical_segments: 16,
                  },
                ],
              },
            },
            {
              name: 'body',
              config: {
                upper_body_profile: 'coherent_expressive_anatomy_v7',
                upper_body_radial_segments: 24,
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                radial_segments: 28,
                vertical_segments: 20,
                orbital_profile: 'recessed_lids_v1',
                facial_detail_profile: 'portrait_cranial_v3',
                expression_normal_policy: 'recompute_affected_v1',
              },
            },
            {
              name: 'expression',
              config: {
                blink_left: 0.2,
                brow_raise_right: 0.35,
                smile: 0.42,
                jaw_open: 0.1,
              },
            },
          ],
        },
      ],
    };

    const closeup = buildCharacterHostFromComposition(composition, { lodLevel: 0 });
    const distance = buildCharacterHostFromComposition(composition, { lodLevel: 2 });

    expect(closeup.ok).toBe(true);
    expect(closeup.lod).toMatchObject({
      level: 0,
      faceRadialSegments: 44,
      faceVerticalSegments: 30,
    });
    expect(distance.lod).toMatchObject({
      level: 2,
      faceRadialSegments: 24,
      faceVerticalSegments: 16,
    });
    expect(closeup.face).toMatchObject({
      topology: 'neutral-anatomical-v2',
      radialSegments: 44,
      verticalSegments: 30,
      facialDetailProfile: 'portrait-cranial-v3',
      expressionNormalPolicy: 'recompute-affected-v1',
    });
    expect(closeup.anatomy?.cranialNeck).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-cranial-neck.v1',
      profile: 'indexed-neck-cranium-stitch-v1',
    });
    expect(closeup.expression).toMatchObject({
      schemaVersion: 'holoscript.native-facial-morph.v3',
      normalsRecomputed: true,
      normalPolicy: 'recompute-affected-v1',
    });
    expect(closeup.host!.getDrawSpec().mesh.vertexCount).toBeGreaterThan(
      distance.host!.getDrawSpec().mesh.vertexCount
    );
    expect(closeup.report.mapped).toContain('@lod(face_segments=44x30)');
    expect(closeup.report.mapped).toContain(
      '@face(expression_normal_policy=recompute-affected-v1)'
    );
    expect(closeup.report.stubbed).toEqual([]);
  });

  it('maps H3Y constructed clothing, soft tissue, groom containment, and probe response', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          id: 'gemini',
          traits: [
            {
              name: 'lod',
              config: {
                levels: [
                  {
                    level: 0,
                    distance: 0,
                    garment_segments: 24,
                    hair_guides: 72,
                    hair_cards_per_guide: 2,
                    hair_segments: 6,
                    face_radial_segments: 44,
                    face_vertical_segments: 30,
                  },
                ],
              },
            },
            {
              name: 'body',
              config: {
                upper_body_profile: 'coherent_expressive_anatomy_v7',
                upper_body_radial_segments: 24,
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                orbital_profile: 'anatomical_lid_fold_v2',
                facial_detail_profile: 'portrait_soft_tissue_v4',
                expression_normal_policy: 'recompute_affected_v1',
                mouth_depth: 0.68,
              },
            },
            {
              name: 'hair',
              config: {
                style: 'medium_wavy',
                groom_profile: 'scalp_flow_containment_v2',
                card_width: 0.014,
                root_lift: 0.001,
                tip_taper: 0.08,
                hairline_bias: 0.18,
              },
            },
            {
              name: 'clothing',
              config: {
                style: 'stormglass_tailored_fieldcoat',
                color: '#28445e',
              },
            },
            {
              name: 'environment_light',
              config: {
                profile: 'directional_reflection_probe_v1',
                key_direction: [0.42, 0.74, 0.52],
                key_color: [1, 0.78, 0.62],
                key_intensity: 1.18,
                fill_direction: [-0.62, 0.18, 0.76],
                fill_color: [0.42, 0.64, 1],
                fill_intensity: 0.42,
                rim_direction: [0.68, 0.4, -0.62],
                rim_color: [1, 0.42, 0.24],
                rim_intensity: 0.62,
                exposure: 1.04,
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.face).toMatchObject({
      orbitalProfile: 'anatomical-lid-fold-v2',
      facialDetailProfile: 'portrait-soft-tissue-v4',
      expressionNormalPolicy: 'recompute-affected-v1',
    });
    expect(result.facialLandmarks).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-facial-landmarks.v4',
      lipTopology: 'connected-cupid-bow-ribbon-v1',
    });
    expect(result.garment).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v2',
      constructionProfile: 'four-panel-fieldcoat-v1',
      constructedPanelCount: 4,
    });
    expect(result.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v2',
      profile: 'scalp-flow-containment-v2',
      containmentProfile: 'ellipsoidal-scalp-exterior-v1',
      scalpPenetrationVertexCount: 0,
    });
    expect(result.environmentLight?.receipt).toMatchObject({
      schemaVersion: 'holoscript.character-environment-light.v2',
      profile: 'directional-reflection-probe-v1',
      responseProfile: 'three-lobe-diffuse-specular-probe-v1',
    });
    expect(result.report.mapped).toContain(
      '@environment_light(profile=directional-reflection-probe-v1)'
    );
    expect(result.report.stubbed).toEqual([]);
  });

  it('maps H3Z material depth, groom breakup, ocular wetline, and room response', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          id: 'openai',
          traits: [
            {
              name: 'lod',
              config: {
                levels: [
                  {
                    level: 0,
                    distance: 0,
                    garment_segments: 24,
                    hair_guides: 72,
                    hair_cards_per_guide: 2,
                    hair_segments: 6,
                  },
                ],
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                tearline: true,
                orbital_profile: 'anatomical_lid_blend_v3',
                ocular_profile: 'layered_ocular_tearfilm_v2',
              },
            },
            {
              name: 'hair',
              config: {
                style: 'medium_wavy',
                groom_profile: 'scalp_flow_breakup_v3',
                card_width: 0.014,
                root_lift: 0.001,
              },
            },
            {
              name: 'clothing',
              config: {
                style: 'stormglass_structured_fieldcoat',
                color: '#28445e',
              },
            },
            {
              name: 'environment_light',
              config: {
                profile: 'stormglass_room_basis_v2',
                key_direction: [0.42, 0.74, 0.52],
                fill_direction: [-0.62, 0.18, 0.76],
                rim_direction: [0.68, 0.4, -0.62],
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.face).toMatchObject({
      orbitalProfile: 'anatomical-lid-blend-v3',
      ocularProfile: 'layered-ocular-tearfilm-v2',
    });
    expect(result.garment).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v3',
      constructionProfile: 'structured-fieldcoat-shell-v2',
      closureCount: 5,
      cuffBandCount: 2,
      fabricSurfaceProfile: 'stormglass-crossweave-normal-v1',
    });
    expect(result.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v3',
      profile: 'scalp-flow-breakup-v3',
      breakupProfile: 'contained-flyaway-breakup-v1',
      scalpPenetrationVertexCount: 0,
    });
    expect(result.ocular).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-ocular-geometry.v2',
      profile: 'layered-ocular-tearfilm-v2',
      tearMeniscusProfile: 'lower-cornea-meniscus-v1',
    });
    expect(result.environmentLight?.receipt).toMatchObject({
      schemaVersion: 'holoscript.character-environment-light.v3',
      profile: 'stormglass-room-basis-v2',
      responseProfile: 'source-authored-room-basis-v2',
      photographicHdri: false,
    });
    expect(result.report.stubbed).toEqual([]);
  });

  it('maps the H4A facial-volume, portrait groom, calibrated ocular, and full-coat stack', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          id: 'h4a-portrait',
          traits: [
            {
              name: 'body',
              config: {
                upper_body_profile: 'coherent_expressive_anatomy_v7',
                upper_body_radial_segments: 24,
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                facial_detail_profile: 'portrait_facial_volume_v5',
                orbital_profile: 'anatomical_lid_blend_v3',
                ocular_profile: 'layered_ocular_calibrated_v3',
                cheekbone_scale: 1.14,
                chin_projection: 1.08,
                jaw_taper: 0.2,
                lid_opening: 0.52,
                iris_scale: 0.46,
                pupil_scale: 0.36,
              },
            },
            {
              name: 'hair',
              config: {
                style: 'medium_wavy',
                groom_profile: 'scalp_flow_portrait_v4',
              },
            },
            {
              name: 'clothing',
              config: {
                style: 'stormglass_portrait_fieldcoat',
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.facialLandmarks).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-facial-landmarks.v5',
      facialVolumeProfile: 'nasal-malar-mandibular-volume-v1',
      malarVolumeScale: 1.14,
      mandibularTaper: 0.2,
    });
    expect(result.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v4',
      facialFramingProfile: 'portrait-brow-lash-ribbons-v1',
      browCardCount: 2,
      lashCardCount: 4,
    });
    expect(result.ocular).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-ocular-geometry.v3',
      calibrationProfile: 'portrait-ocular-balance-v1',
      lidOpening: 0.52,
    });
    expect(result.garment).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-garment-geometry.v4',
      constructionProfile: 'portrait-full-fieldcoat-v3',
      closureCount: 7,
      cuffBandCount: 2,
    });
    expect(result.report.stubbed).toEqual([]);
  });

  it('fails closed when H3X cranial continuity or expression-normal prerequisites are absent', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          id: 'unsupported-h3x',
          traits: [
            {
              name: 'body',
              config: {
                upper_body_profile: 'coherent_portrait_anatomy_v6',
                upper_body_radial_segments: 24,
              },
            },
            {
              name: 'face',
              config: {
                topology: 'neutral_anatomical_v2',
                facial_detail_profile: 'portrait_cranial_v3',
                expression_normal_policy: 'recompute_affected_v1',
              },
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.face).toMatchObject({
      topology: 'neutral-anatomical-v2',
      radialSegments: 20,
      verticalSegments: 14,
    });
    expect(result.face?.facialDetailProfile).toBeUndefined();
    expect(result.face?.expressionNormalPolicy).toBeUndefined();
    expect(result.anatomy?.cranialNeck).toBeUndefined();
    expect(result.report.stubbed).toEqual([
      {
        trait: '@face(facial_detail_profile)',
        reason:
          'portrait-cranial-v3 requires coherent-expressive-anatomy-v7 for indexed neck-cranium continuity',
      },
      {
        trait: '@face(expression_normal_policy)',
        reason: 'recompute-affected-v1 requires a portrait cranial profile',
      },
    ]);
  });

  it('maps @micro_motion to native blink, ocular gaze, and upper-chest breathing', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          id: 'openai',
          traits: [
            { name: 'body', config: {} },
            {
              name: 'face',
              config: { topology: 'neutral_anatomical_v2' },
            },
            {
              name: 'micro_motion',
              config: {
                profile: 'human_presence_v1',
                seed: 'openai',
                source_time_seconds: 7.25,
                blink_interval_seconds: 3.9,
                saccade_yaw_degrees: 2.2,
                breath_rate_hz: 0.24,
                cloth_rate: 0.85,
              },
            },
          ],
        },
      ],
    });

    expect(result.microMotion).toMatchObject({
      sourceTimeSeconds: 7.25,
      config: {
        schemaVersion: 'holoscript.character-micro-motion-config.v1',
        profile: 'human-presence-v1',
        seed: 'openai',
        blinkIntervalSeconds: 3.9,
        breathRateHz: 0.24,
        clothRate: 0.85,
      },
      sample: {
        schemaVersion: 'holoscript.character-micro-motion-sample.v1',
        absoluteTime: true,
        gaze: { nativeTransformApplied: false },
        breath: { nativeTransformApplied: false },
        cloth: { nativeSimulationApplied: false },
      },
      application: {
        schemaVersion: 'holoscript.character-micro-motion-application.v2',
        nativeBlinkApplied: true,
        nativeGazeApplied: true,
        nativeBreathApplied: true,
      },
      bindings: {
        blink: 'native-procedural-head-morph',
        gaze: 'native-ocular-globe-rotation',
        breath: 'native-upper-chest-deformation',
        cloth: 'sampled-channel-only',
      },
    });
    expect(result.microMotion?.sample.sampleDigest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(result.microMotion?.application.gazeChangedVertexCount).toBeGreaterThan(0);
    expect(result.microMotion?.application.breathChangedVertexCount).toBeGreaterThan(0);
    expect(result.microMotion?.application.positionDigest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(result.microMotion?.application.normalDigest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(result.report.mapped).toContain(
      '@micro_motion(profile=human-presence-v1,blink=native,gaze=native-ocular,breath=native-chest,cloth=channel)'
    );
    expect(result.report.stubbed).toEqual([]);
  });

  it('fails closed on an unsupported @micro_motion profile', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          id: 'unsupported-motion',
          traits: [
            { name: 'body', config: {} },
            { name: 'micro_motion', config: { profile: 'cinematic_ai_guess_v9' } },
          ],
        },
      ],
    });

    expect(result.microMotion).toBeUndefined();
    expect(result.report.stubbed).toContainEqual({
      trait: '@micro_motion',
      reason: "profile 'cinematic-ai-guess-v9' unsupported; no timing channels fabricated",
    });
  });
});
