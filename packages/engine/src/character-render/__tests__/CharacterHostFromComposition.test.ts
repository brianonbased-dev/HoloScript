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
            { name: 'morph', config: {} },
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

    // @morph stubbed (no channel); @skeleton(humanoid_65) validated → mapped; @hair(style-only) noted.
    const stubbed = r.report.stubbed.map((s) => s.trait);
    expect(stubbed).toContain('@morph');
    expect(r.report.mapped.some((m) => m.startsWith('@skeleton'))).toBe(true);
    expect(r.report.warnings.some((w) => w.includes('@hair'))).toBe(true);
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

    const melaninOf = (r: ReturnType<typeof make>): number => {
      const g = r.host
        ?.getDrawSpec()
        .materialGroups?.find((x) => x.material.shadingModel === 'marschner-hair');
      return g && g.material.shadingModel === 'marschner-hair' ? g.material.melanin : NaN;
    };
    // Darker authored hair → more eumelanin: the .holo colour reaches the draw spec, not a constant.
    expect(melaninOf(dark)).toBeGreaterThan(melaninOf(blonde));
    expect(dark.report.warnings.some((w) => w.includes('style'))).toBe(true); // style noted, not faked
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
