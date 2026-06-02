/**
 * BotanicalLotusTrait — provenance anchors + render profile contract
 */

import { describe, it, expect } from 'vitest';
import {
  botanicalLotusHandler,
  createBotanicalLotusRenderProfile,
  deriveBotanicalLotusAnchorStatus,
  getBotanicalLotusPetalCount,
  validateBotanicalLotusConfig,
  buildLotusSceneFromComposition,
  deriveLotusBloomFromGlow,
  lotusPetalRenderColor,
  LOTUS_PETAL_SHADER_CHUNKS,
  LOTUS_GENESIS_SEED_PLACEHOLDER,
  generateBotanicalNormalMap,
  generateBotanicalRoughnessMap,
  simulateLotusMorphogenesis,
  simulateLotusPhyllotaxis,
  type LotusCompositionObject,
} from '../BotanicalLotusTrait';
import {
  attachTrait,
  createMockContext,
  createMockNode,
  getLastEvent,
  sendEvent,
} from './traitTestHelpers';

const VALID_HASH = `sha256:${'a'.repeat(64)}`;
const VALID_SIGNATURE = 'did:key:z6Mkwalletsignaturelotus';

describe('BotanicalLotusTrait — pure config validation', () => {
  it('accepts the default reference-guided lotus contract', () => {
    const result = validateBotanicalLotusConfig();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(getBotanicalLotusPetalCount()).toBe(42);
  });

  it('rejects impossible material values', () => {
    const result = validateBotanicalLotusConfig({
      material: {
        subsurface_scattering: 1.5,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('material.subsurface_scattering');
  });

  it('requires content hashes once a reference leaves pending_media_ingest', () => {
    const result = validateBotanicalLotusConfig({
      reference_anchors: [
        {
          id: 'lotus-photo-1',
          label: 'lotus photo',
          uri: 'cael://lotus-photo-1',
          role: 'material',
          status: 'hashed',
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('content_hash');
  });

  it('requires wallet signatures for wallet_signed anchors', () => {
    const result = validateBotanicalLotusConfig({
      reference_anchors: [
        {
          id: 'lotus-photo-1',
          label: 'lotus photo',
          uri: 'cael://lotus-photo-1',
          role: 'material',
          status: 'wallet_signed',
          content_hash: VALID_HASH,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('wallet_signature');
  });

  it('derives aggregate anchor status conservatively', () => {
    expect(
      deriveBotanicalLotusAnchorStatus([
        {
          id: 'a',
          label: 'a',
          uri: 'conversation://a',
          role: 'material',
          status: 'pending_media_ingest',
        },
      ])
    ).toBe('pending_media_ingest');

    expect(
      deriveBotanicalLotusAnchorStatus([
        {
          id: 'a',
          label: 'a',
          uri: 'cael://a',
          role: 'material',
          status: 'hashed',
          content_hash: VALID_HASH,
        },
      ])
    ).toBe('hashed');

    expect(
      deriveBotanicalLotusAnchorStatus([
        {
          id: 'a',
          label: 'a',
          uri: 'cael://a',
          role: 'material',
          status: 'wallet_signed',
          content_hash: VALID_HASH,
          wallet_signature: VALID_SIGNATURE,
        },
      ])
    ).toBe('wallet_signed');
  });
});

describe('BotanicalLotusTrait — render profile', () => {
  it('maps the reference-derived material into renderer uniforms', () => {
    const profile = createBotanicalLotusRenderProfile();
    expect(profile.trait).toBe('botanical_lotus');
    expect(profile.anchor_status).toBe('pending_media_ingest');
    expect(profile.wallet_signed).toBe(false);
    expect(profile.petal_count).toBe(42);
    expect(profile.pbr_uniforms.subsurface_scattering).toBeCloseTo(0.74, 10);
    expect(profile.pbr_uniforms.transmission).toBeCloseTo(0.68, 10);
    expect(profile.pbr_uniforms.roughness).toBeCloseTo(0.72, 10);
    expect(profile.colors.petal_mid).toBe('#f47ab7');
    expect(profile.stamen_filament_count).toBe(58);
    expect(profile.renderer_requires).toContain('sss_render');
  });

  it('keeps ring geometry deterministic and broad-petaled', () => {
    const profileA = createBotanicalLotusRenderProfile();
    const profileB = createBotanicalLotusRenderProfile();
    expect(profileA).toEqual(profileB);
    expect(profileA.petal_rings.map((ring) => ring.count)).toEqual([8, 13, 21]);
    const outer = profileA.petal_rings.find((ring) => ring.name === 'outer');
    expect(outer?.width).toBeGreaterThan(0.5);
    expect(outer?.gravity_sag).toBeCloseTo(0.3, 10);
  });
});

describe('BotanicalLotusTrait — handler lifecycle', () => {
  it('onAttach emits botanical_lotus_attached with provenance status', () => {
    const ctx = createMockContext();
    const node = createMockNode('botanical-lotus-test');
    attachTrait(botanicalLotusHandler, node, {}, ctx);

    const evt = getLastEvent(ctx, 'botanical_lotus_attached') as
      | Record<string, unknown>
      | undefined;
    expect(evt).toBeDefined();
    expect(evt?.anchorStatus).toBe('pending_media_ingest');
    expect(evt?.walletSigned).toBe(false);
    expect(evt?.petalCount).toBe(42);
    expect(evt?.referenceAnchorIds).toEqual([
      'lotus-reference-2026-05-06-01',
      'lotus-reference-2026-05-06-02',
      'lotus-reference-2026-05-06-03',
    ]);
  });

  it('botanical_lotus_query returns the normalized config and render profile', () => {
    const ctx = createMockContext();
    const node = createMockNode('botanical-lotus-test');
    attachTrait(botanicalLotusHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(botanicalLotusHandler, node, {}, ctx, {
      type: 'botanical_lotus_query',
      queryId: 'q-lotus',
    });

    const evt = getLastEvent(ctx, 'botanical_lotus_response') as
      | Record<string, unknown>
      | undefined;
    expect(evt).toBeDefined();
    expect(evt?.queryId).toBe('q-lotus');
    const profile = evt?.profile as { petal_count: number; anchor_status: string };
    expect(profile.petal_count).toBe(42);
    expect(profile.anchor_status).toBe('pending_media_ingest');
  });

  it('botanical_lotus_reference_anchored upgrades one anchor to hashed', () => {
    const ctx = createMockContext();
    const node = createMockNode('botanical-lotus-test');
    attachTrait(botanicalLotusHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(botanicalLotusHandler, node, {}, ctx, {
      type: 'botanical_lotus_reference_anchored',
      anchorId: 'lotus-reference-2026-05-06-01',
      contentHash: VALID_HASH,
    });

    const evt = getLastEvent(ctx, 'botanical_lotus_reference_updated') as
      | Record<string, unknown>
      | undefined;
    expect(evt).toBeDefined();
    expect(evt?.anchorId).toBe('lotus-reference-2026-05-06-01');
    expect(evt?.anchorStatus).toBe('pending_media_ingest');
    expect(evt?.walletSigned).toBe(false);
  });

  it('holomap:surface_anchor_placed binds lotus to a surface anchor', () => {
    const ctx = createMockContext();
    const node = createMockNode('botanical-lotus-test');
    attachTrait(botanicalLotusHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(botanicalLotusHandler, node, {}, ctx, {
      type: 'holomap:surface_anchor_placed',
      payload: {
        surfaceAnchorId: 'surface-table-01',
        surfaceNormal: [0, 1, 0],
        worldPosition: [1.2, 0.8, -0.5],
      },
    });

    const evt = getLastEvent(ctx, 'botanical_lotus_surface_bound') as
      | Record<string, unknown>
      | undefined;
    expect(evt).toBeDefined();
    expect(evt?.surfaceAnchorId).toBe('surface-table-01');

    const responseEvt = getLastEvent(ctx, 'botanical_lotus_response') as
      | Record<string, unknown>
      | undefined;
    if (responseEvt) {
      const profile = responseEvt.profile as { surface_anchor_id: string };
      expect(profile.surface_anchor_id).toBe('surface-table-01');
    }
  });

  it('holomap:lighting_update sets lighting reference on lotus', () => {
    const ctx = createMockContext();
    const node = createMockNode('botanical-lotus-test');
    attachTrait(botanicalLotusHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(botanicalLotusHandler, node, {}, ctx, {
      type: 'holomap:lighting_update',
      payload: {
        referenceId: 'lighting-living-room-01',
        estimatedLux: 320,
        colorTemperatureK: 4000,
        dominantDirection: [0.5, -0.8, 0.3],
      },
    });

    const evt = getLastEvent(ctx, 'botanical_lotus_lighting_updated') as
      | Record<string, unknown>
      | undefined;
    expect(evt).toBeDefined();
    expect(evt?.referenceId).toBe('lighting-living-room-01');
    expect(evt?.estimatedLux).toBe(320);
  });

  it('holomap:anchor_state_changed emits drift event when lotus is bound', () => {
    const ctx = createMockContext();
    const node = createMockNode('botanical-lotus-test');
    attachTrait(botanicalLotusHandler, node, {}, ctx);

    // First bind to a surface
    sendEvent(botanicalLotusHandler, node, {}, ctx, {
      type: 'holomap:surface_anchor_placed',
      payload: {
        surfaceAnchorId: 'surface-table-01',
        surfaceNormal: [0, 1, 0],
      },
    });
    ctx.clearEvents();

    // Then receive drift update
    sendEvent(botanicalLotusHandler, node, {}, ctx, {
      type: 'holomap:anchor_state_changed',
      payload: {
        anchorFrameIndex: 120,
      },
    });

    const evt = getLastEvent(ctx, 'botanical_lotus_anchor_drift') as
      | Record<string, unknown>
      | undefined;
    expect(evt).toBeDefined();
    expect(evt?.surfaceAnchorId).toBe('surface-table-01');
    expect(evt?.anchorFrameIndex).toBe(120);
  });

  it('ignores holomap:surface_anchor_placed without surfaceAnchorId', () => {
    const ctx = createMockContext();
    const node = createMockNode('botanical-lotus-test');
    attachTrait(botanicalLotusHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(botanicalLotusHandler, node, {}, ctx, {
      type: 'holomap:surface_anchor_placed',
      payload: {
        surfaceNormal: [0, 1, 0],
      },
    });

    expect(getLastEvent(ctx, 'botanical_lotus_surface_bound')).toBeUndefined();
  });
});

describe('BotanicalLotusTrait — scene compiler (.holo -> LotusScene)', () => {
  // Synthetic composition mirroring garden.seedable.holo's petal objects:
  // 8 + 13 + 21 petals declared in continuous-spiral order, per-paper bloom
  // encoded as @glowing intensity (+ pulse for the featured/full petal).
  function makePetals(): LotusCompositionObject[] {
    const objs: LotusCompositionObject[] = [];
    const rings: Array<[1 | 2 | 3, number]> = [
      [1, 8],
      [2, 13],
      [3, 21],
    ];
    for (const [ring, count] of rings) {
      for (let i = 0; i < count; i += 1) {
        const featured = ring === 1 && i === 0;
        objs.push({
          name: `Petal P${ring}.${i}: paper ${ring}.${i}`,
          properties: [{ key: 'position', value: [0, 5, 0] }],
          traits: [
            {
              name: 'glowing',
              config: featured
                ? { color: '#cc66ff', intensity: 1.2, pulse: true }
                : { color: '#6633aa', intensity: ring === 1 ? 0.4 : 0.1, pulse: false },
            },
          ],
        });
      }
    }
    return objs;
  }

  it('compiles 42 petals on 8/13/21 Fibonacci rings from a composition', () => {
    const scene = buildLotusSceneFromComposition(makePetals());
    expect(scene.petals).toHaveLength(42);
    const perRing = scene.petals.reduce<Record<number, number>>((acc, p) => {
      acc[p.ring] = (acc[p.ring] ?? 0) + 1;
      return acc;
    }, {});
    expect(perRing).toEqual({ 1: 8, 2: 13, 3: 21 });
    expect(scene.seed).toBe(LOTUS_GENESIS_SEED_PLACEHOLDER);
  });

  it('places petals on a continuous golden-angle spiral', () => {
    const scene = buildLotusSceneFromComposition(makePetals());
    const golden = (137.50776 * Math.PI) / 180;
    expect(scene.petals[0].angle).toBeCloseTo(0, 6);
    expect(scene.petals[1].angle).toBeCloseTo(golden, 6);
    expect(scene.petals[5].angle).toBeCloseTo(5 * golden, 6);
  });

  it('derives per-paper bloom from the @glowing encoding', () => {
    const scene = buildLotusSceneFromComposition(makePetals());
    expect(scene.petals[0].bloom).toBe('full'); // root petal
    expect(scene.petals[1].bloom).toBe('budding'); // ring 1, intensity 0.4
    expect(scene.petals.find((p) => p.ring === 3)?.bloom).toBe('sealed'); // intensity 0.1
  });

  it('is deterministic — same composition compiles byte-identical scenes', () => {
    const a = buildLotusSceneFromComposition(makePetals());
    const b = buildLotusSceneFromComposition(makePetals());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sources palette + PBR from the botanical render profile', () => {
    const profile = createBotanicalLotusRenderProfile();
    const scene = buildLotusSceneFromComposition(makePetals(), profile);
    expect(scene.colors).toEqual(profile.colors);
    expect(scene.material).toEqual(profile.pbr_uniforms);
    expect(scene.stamen_filament_count).toBe(profile.stamen_filament_count);
  });

  it('maps glow intensity to bloom state', () => {
    expect(deriveLotusBloomFromGlow(1.2, true)).toBe('full');
    expect(deriveLotusBloomFromGlow(1.2, false)).toBe('blooming');
    expect(deriveLotusBloomFromGlow(0.7, false)).toBe('blooming');
    expect(deriveLotusBloomFromGlow(0.4, false)).toBe('budding');
    expect(deriveLotusBloomFromGlow(0.1, false)).toBe('sealed');
  });

  it('assigns petal render colors by ring from the palette', () => {
    const { colors } = createBotanicalLotusRenderProfile();
    expect(lotusPetalRenderColor(1, true, colors)).toBe(colors.petal_base); // root
    expect(lotusPetalRenderColor(1, false, colors)).toBe(colors.petal_inner);
    expect(lotusPetalRenderColor(2, false, colors)).toBe(colors.petal_mid);
  });

  it('exposes the petal render-kernel GLSL chunks (trait owns the look)', () => {
    expect(LOTUS_PETAL_SHADER_CHUNKS.fragmentHeader).toContain('lotusVeinField');
    expect(LOTUS_PETAL_SHADER_CHUNKS.fragmentEmissiveInjection).toContain('totalEmissiveRadiance');
    expect(LOTUS_PETAL_SHADER_CHUNKS.vertexHeader).toContain('petalUv');
  });
});

describe('BotanicalLotusTrait — procedural texture generation (three-free)', () => {
  it('generates a normal map with correct RGBA8 dimensions', () => {
    const tex = generateBotanicalNormalMap({ pattern: 'petal_veins', size: 64, seed: 0xdead });
    expect(tex.width).toBe(64);
    expect(tex.height).toBe(64);
    expect(tex.data).toBeInstanceOf(Uint8Array);
    expect(tex.data.length).toBe(64 * 64 * 4);
  });

  it('is deterministic — same (pattern, seed) yields byte-identical data', () => {
    const a = generateBotanicalNormalMap({ pattern: 'leaf_radial', size: 32, seed: 7 });
    const b = generateBotanicalNormalMap({ pattern: 'leaf_radial', size: 32, seed: 7 });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('encodes a valid tangent-space normal — blue (z) dominant, alpha opaque', () => {
    const tex = generateBotanicalNormalMap({ pattern: 'stalk_fiber', size: 48, seed: 3, strength: 1.5 });
    let blueGreaterThanHalf = 0;
    for (let i = 0; i < tex.data.length; i += 4) {
      if (tex.data[i + 2] >= 128) blueGreaterThanHalf += 1;
      expect(tex.data[i + 3]).toBe(255);
    }
    // z points out of the surface, so the blue channel should be >=0.5 nearly everywhere.
    expect(blueGreaterThanHalf).toBeGreaterThan((48 * 48) / 2);
  });

  it('different patterns produce different normal maps', () => {
    const petals = generateBotanicalNormalMap({ pattern: 'petal_veins', size: 32, seed: 1 });
    const leaf = generateBotanicalNormalMap({ pattern: 'leaf_radial', size: 32, seed: 1 });
    expect(Array.from(petals.data)).not.toEqual(Array.from(leaf.data));
  });

  it('generates a grayscale roughness map (r==g==b), deterministic', () => {
    const tex = generateBotanicalRoughnessMap({ size: 40, seed: 9, base: 0.6, variance: 0.3 });
    expect(tex.data.length).toBe(40 * 40 * 4);
    for (let i = 0; i < tex.data.length; i += 4) {
      expect(tex.data[i]).toBe(tex.data[i + 1]);
      expect(tex.data[i + 1]).toBe(tex.data[i + 2]);
      expect(tex.data[i + 3]).toBe(255);
    }
    const again = generateBotanicalRoughnessMap({ size: 40, seed: 9, base: 0.6, variance: 0.3 });
    expect(Array.from(again.data)).toEqual(Array.from(tex.data));
  });
});

describe('BotanicalLotusTrait — morphogenesis (emergent phyllotaxis, grown not placed)', () => {
  it('grows the requested number of primordia, advecting outward', () => {
    const res = simulateLotusMorphogenesis({ count: 42, seed: 0xdead });
    expect(res.primordia).toHaveLength(42);
    // Oldest (index 0) has advected farthest; newest sits at the apical ring.
    const oldest = res.primordia[0];
    const newest = res.primordia[41];
    expect(oldest.r).toBeGreaterThan(newest.r);
  });

  it('is deterministic — same params reproduce the simulation exactly', () => {
    const a = simulateLotusMorphogenesis({ count: 60, seed: 0xdead });
    const b = simulateLotusMorphogenesis({ count: 60, seed: 0xdead });
    expect(a.emergentDivergenceDeg).toBe(b.emergentDivergenceDeg);
    expect(a.primordia.map((p) => p.theta)).toEqual(b.primordia.map((p) => p.theta));
  });

  it('divergence is dynamics-dominated, not seed-set (different seeds → nearly the same angle)', () => {
    // The seed only breaks the symmetry of the FIRST primordium. A seed-SET angle
    // would vary across the full ~90deg range; here two very different seeds land
    // within a few degrees, so the inhibitor-field dynamics — not the seed — set the
    // divergence. (Not <1deg: the discrete model keeps weak initial-condition memory.)
    const a = simulateLotusMorphogenesis({ count: 80, seed: 1 });
    const b = simulateLotusMorphogenesis({ count: 80, seed: 9999 });
    expect(Math.abs(a.emergentDivergenceDeg - b.emergentDivergenceDeg)).toBeLessThan(15);
  });

  it('the emergent mean divergence self-organizes into the golden-angle neighbourhood', () => {
    // NOT asserting a clean 137.5 lock (the discrete model is multijugate) — only
    // that the angle EMERGES near the golden angle without any 137.5 constant in
    // the placement loop. This is the falsifiable "grown, not placed" property.
    const res = simulateLotusMorphogenesis({ count: 120, seed: 0xdead });
    expect(res.emergentDivergenceDeg).toBeGreaterThan(120);
    expect(res.emergentDivergenceDeg).toBeLessThan(150);
  });

  it('the plastochron ratio (radial velocity) changes the emergent angle — it is dynamical', () => {
    const slow = simulateLotusMorphogenesis({ count: 120, seed: 0xdead, radialVelocity: 0.08 });
    const fast = simulateLotusMorphogenesis({ count: 120, seed: 0xdead, radialVelocity: 0.2 });
    expect(slow.emergentDivergenceDeg).not.toBe(fast.emergentDivergenceDeg);
  });
});

describe('BotanicalLotusTrait — robust emergent golden angle (the grown proof flower)', () => {
  it('the GOLDEN ANGLE emerges (~137.5deg) from chiral threshold-gated nucleation — no 137.5 constant', () => {
    const res = simulateLotusPhyllotaxis({ count: 90, seed: 0xdead });
    // Emergent — falls out of the dynamics, asserted near the golden angle 137.5.
    expect(res.emergentDivergenceDeg).toBeGreaterThan(135);
    expect(res.emergentDivergenceDeg).toBeLessThan(140);
    // Clean single spiral, not multijugate.
    expect(res.divergenceSpreadDeg).toBeLessThan(6);
  });

  it('is RESOLUTION-INDEPENDENT (parabolic refinement) — same angle at 720/1440/2880 samples', () => {
    const a = simulateLotusPhyllotaxis({ count: 80, seed: 0xdead, angularSamples: 720 });
    const b = simulateLotusPhyllotaxis({ count: 80, seed: 0xdead, angularSamples: 1440 });
    const c = simulateLotusPhyllotaxis({ count: 80, seed: 0xdead, angularSamples: 2880 });
    expect(Math.abs(a.emergentDivergenceDeg - b.emergentDivergenceDeg)).toBeLessThan(1);
    expect(Math.abs(b.emergentDivergenceDeg - c.emergentDivergenceDeg)).toBeLessThan(1);
  });

  it('is seed-independent and deterministic', () => {
    const a = simulateLotusPhyllotaxis({ count: 80, seed: 1 });
    const b = simulateLotusPhyllotaxis({ count: 80, seed: 123456 });
    const a2 = simulateLotusPhyllotaxis({ count: 80, seed: 1 });
    expect(Math.abs(a.emergentDivergenceDeg - b.emergentDivergenceDeg)).toBeLessThan(2);
    expect(a.primordia.map((p) => p.theta)).toEqual(a2.primordia.map((p) => p.theta));
  });

  it('grows the requested primordia on an outward spiral', () => {
    const res = simulateLotusPhyllotaxis({ count: 42, seed: 0x0000dead });
    expect(res.primordia).toHaveLength(42);
    expect(res.primordia[0].r).toBeGreaterThan(res.primordia[41].r); // oldest outermost
  });
});
