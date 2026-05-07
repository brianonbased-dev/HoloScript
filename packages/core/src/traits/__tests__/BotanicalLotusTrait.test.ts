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
