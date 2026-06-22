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

    // @morph / @skeleton stubbed (no seam yet); @hair noted as default-rendered.
    const stubbed = r.report.stubbed.map((s) => s.trait);
    expect(stubbed).toContain('@morph');
    expect(stubbed).toContain('@skeleton');
  });

  it('non-bipedal locomotion (fly) degrades to idle and is recorded as stubbed', () => {
    const comp: ParsedComposition = {
      objects: [{ name: 'Drone', traits: [{ name: 'body', config: {} }, { name: 'locomotion', config: { mode: 'fly' } }] }],
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
        { id: 'hero', name: 'Hero', traits: [{ name: 'skeleton', config: { rig: 'humanoid_65' } }] },
      ],
    };
    const r = buildCharacterHostFromComposition(comp, { objectId: 'hero' });
    expect(r.ok).toBe(true);
    expect(r.report.resolvedVia).toBe('objectId');
    expect(r.report.objectId).toBe('hero');
  });
});
