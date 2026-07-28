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

    const melaninOf = (r: ReturnType<typeof make>): number => {
      const g = r.host
        ?.getDrawSpec()
        .materialGroups?.find((x) => x.material.shadingModel === 'marschner-hair');
      return g && g.material.shadingModel === 'marschner-hair' ? g.material.melanin : NaN;
    };
    // Darker authored hair → more eumelanin: the .holo colour reaches the draw spec, not a constant.
    expect(melaninOf(dark)).toBeGreaterThan(melaninOf(blonde));
    expect(dark.report.warnings.some((w) => w.includes('style'))).toBe(false);
  });

  it('@hair(groom_profile) maps source controls into derived native geometry evidence', () => {
    const result = buildCharacterHostFromComposition({
      objects: [
        {
          name: 'ScalpFlow',
          traits: [
            { name: 'body', config: { height: 1.78 } },
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
    expect(result.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v1',
      profile: 'scalp-flow-v1',
      rootLift: 0.002,
      tipTaper: 0.1,
      hairlineBias: 0.16,
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
    });
    expect(lod2.lod).toEqual({
      level: 2,
      distance: 20,
      garmentSegments: 8,
      hairGuides: 48,
      hairCardsPerGuide: 1,
      hairSegments: 3,
    });
    expect(lod0.report.mapped).toContain(
      '@lod(hair_guides=168,hair_cards_per_guide=2,hair_segments=7)'
    );
    expect(lod0.host!.getDrawSpec().mesh.vertexCount).toBeGreaterThan(
      lod1.host!.getDrawSpec().mesh.vertexCount
    );
    expect(lod1.host!.getDrawSpec().mesh.vertexCount).toBeGreaterThan(
      lod2.host!.getDrawSpec().mesh.vertexCount
    );
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
});
