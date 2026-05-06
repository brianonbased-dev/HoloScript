/**
 * LotusPetalTrait — visual-mapping + reserved-petal pinning + event tests
 */

import { describe, it, expect } from 'vitest';
import {
  lotusPetalHandler,
  deriveLotusPetalVisual,
  isReservedPaperId,
} from '../LotusPetalTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('LotusPetalTrait — isReservedPaperId', () => {
  it('detects exact "reserved" string', () => {
    expect(isReservedPaperId('reserved')).toBe(true);
  });

  it('detects "[reserved — Paper 17]" descriptor form from garden.seedable.holo', () => {
    expect(isReservedPaperId('[reserved — Paper 17]')).toBe(true);
  });

  it('detects "reserved capacity" prefix form', () => {
    expect(isReservedPaperId('reserved capacity slot 12')).toBe(true);
  });

  it('treats empty string as reserved', () => {
    expect(isReservedPaperId('')).toBe(true);
  });

  it('treats tbd as reserved', () => {
    expect(isReservedPaperId('tbd')).toBe(true);
  });

  it('does NOT mark real paper ids as reserved', () => {
    expect(isReservedPaperId('trust-by-construction')).toBe(false);
    expect(isReservedPaperId('snn-neurips')).toBe(false);
    expect(isReservedPaperId('cael-aamas')).toBe(false);
  });

  it('case-insensitive', () => {
    expect(isReservedPaperId('RESERVED')).toBe(true);
    expect(isReservedPaperId('Reserved')).toBe(true);
  });
});

describe('LotusPetalTrait — deriveLotusPetalVisual (pure)', () => {
  const realPaper = 'trust-by-construction';
  const reservedSlot = 'reserved';

  it('sealed visual uses dark purple #220033 and low opacity', () => {
    const v = deriveLotusPetalVisual('sealed', realPaper);
    expect(v.opacity).toBeCloseTo(0.1, 10);
    expect(v.glow_colour).toBe('#220033');
    expect(v.pulse_enabled).toBe(false);
  });

  it('full visual uses bright purple #cc66ff with pulse', () => {
    const v = deriveLotusPetalVisual('full', realPaper);
    expect(v.opacity).toBeCloseTo(1.0, 10);
    expect(v.glow_intensity).toBeCloseTo(1.2, 10);
    expect(v.glow_colour).toBe('#cc66ff');
    expect(v.pulse_enabled).toBe(true);
    expect(v.pulse_speed).toBeCloseTo(1.0, 10);
  });

  it('blooming uses mid-purple #9966cc with slow pulse', () => {
    const v = deriveLotusPetalVisual('blooming', realPaper);
    expect(v.glow_colour).toBe('#9966cc');
    expect(v.pulse_enabled).toBe(true);
    expect(v.pulse_speed).toBeCloseTo(0.5, 10);
  });

  it('wilted uses desaturated grey #666666 with no glow', () => {
    const v = deriveLotusPetalVisual('wilted', realPaper);
    expect(v.glow_colour).toBe('#666666');
    expect(v.glow_intensity).toBe(0);
  });

  it('reserved petal is PINNED to sealed visual regardless of upstream state', () => {
    const v1 = deriveLotusPetalVisual('full', reservedSlot);
    const v2 = deriveLotusPetalVisual('blooming', reservedSlot);
    const v3 = deriveLotusPetalVisual('sealed', reservedSlot);
    expect(v1.opacity).toBeCloseTo(0.1, 10);
    expect(v1.glow_colour).toBe('#220033');
    expect(v2.opacity).toBeCloseTo(0.1, 10);
    expect(v3.opacity).toBeCloseTo(0.1, 10);
    // All three identical
    expect(v1).toEqual(v2);
    expect(v2).toEqual(v3);
  });

  it('opacity monotonically increases sealed → budding → blooming → full', () => {
    const states = ['sealed', 'budding', 'blooming', 'full'] as const;
    const opacities = states.map((s) => deriveLotusPetalVisual(s, realPaper).opacity);
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeGreaterThan(opacities[i - 1]);
    }
  });

  it('is deterministic — same inputs identical outputs', () => {
    const a = deriveLotusPetalVisual('blooming', realPaper);
    const b = deriveLotusPetalVisual('blooming', realPaper);
    expect(a).toEqual(b);
  });
});

describe('LotusPetalTrait — handler lifecycle', () => {
  it('onAttach emits lotus_petal_attached with paper metadata', () => {
    const ctx = createMockContext();
    const node = createMockNode('petal-test');
    attachTrait(
      lotusPetalHandler,
      node,
      {
        paper_id: 'trust-by-construction',
        venue: 'IEEE TVCG 2026',
        program: 1,
        layer: 1,
        spiral_index: 0,
      },
      ctx
    );
    const evt = getLastEvent(ctx, 'lotus_petal_attached') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.paperId).toBe('trust-by-construction');
    expect(evt?.program).toBe(1);
    expect(evt?.layer).toBe(1);
    expect(evt?.spiralIndex).toBe(0);
  });

  it('lotus_petal_state_changed event recomputes visual and emits visual_changed', () => {
    const ctx = createMockContext();
    const node = createMockNode('petal-test');
    const cfg = {
      paper_id: 'trust-by-construction',
      venue: 'TVCG',
      program: 1 as const,
      layer: 1 as const,
      spiral_index: 0,
    };
    attachTrait(lotusPetalHandler, node, cfg, ctx);
    ctx.clearEvents();

    sendEvent(lotusPetalHandler, node, cfg, ctx, {
      type: 'lotus_petal_state_changed',
      paperId: 'trust-by-construction',
      bloomState: 'full',
    });

    const evt = getLastEvent(ctx, 'lotus_petal_visual_changed') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.bloomState).toBe('full');
    const visual = evt?.visual as { opacity: number; glow_colour: string };
    expect(visual.opacity).toBeCloseTo(1.0, 10);
    expect(visual.glow_colour).toBe('#cc66ff');
  });

  it('lotus_petal_state_changed for OTHER paper_id is ignored', () => {
    const ctx = createMockContext();
    const node = createMockNode('petal-test');
    const cfg = {
      paper_id: 'trust-by-construction',
      venue: 'TVCG',
      program: 1 as const,
      layer: 1 as const,
      spiral_index: 0,
    };
    attachTrait(lotusPetalHandler, node, cfg, ctx);
    ctx.clearEvents();

    sendEvent(lotusPetalHandler, node, cfg, ctx, {
      type: 'lotus_petal_state_changed',
      paperId: 'cael-aamas', // different paper
      bloomState: 'full',
    });

    expect(getEventCount(ctx, 'lotus_petal_visual_changed')).toBe(0);
  });

  it('reserved-slot petal pins visual even when state-changed event arrives', () => {
    const ctx = createMockContext();
    const node = createMockNode('petal-reserved');
    const cfg = {
      paper_id: 'reserved',
      venue: '',
      program: 3 as const,
      layer: 3 as const,
      spiral_index: 30,
    };
    attachTrait(lotusPetalHandler, node, cfg, ctx);
    ctx.clearEvents();

    sendEvent(lotusPetalHandler, node, cfg, ctx, {
      type: 'lotus_petal_state_changed',
      paperId: 'reserved',
      bloomState: 'full', // upstream tries to bloom a reserved slot
    });

    const evt = getLastEvent(ctx, 'lotus_petal_visual_changed') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    const visual = evt?.visual as { opacity: number; glow_colour: string };
    // Reserved slot must stay sealed-dark even though state was 'full'
    expect(visual.opacity).toBeCloseTo(0.1, 10);
    expect(visual.glow_colour).toBe('#220033');
  });

  it('lotus_petal_query returns current state via response event', () => {
    const ctx = createMockContext();
    const node = createMockNode('petal-test');
    const cfg = {
      paper_id: 'snn-neurips',
      venue: 'NeurIPS',
      program: 1 as const,
      layer: 1 as const,
      spiral_index: 3,
    };
    attachTrait(lotusPetalHandler, node, cfg, ctx);
    ctx.clearEvents();

    sendEvent(lotusPetalHandler, node, cfg, ctx, {
      type: 'lotus_petal_query',
      paperId: 'snn-neurips',
      queryId: 'q-3',
    });

    const evt = getLastEvent(ctx, 'lotus_petal_response') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.queryId).toBe('q-3');
    expect(evt?.paperId).toBe('snn-neurips');
  });

  it('onDetach emits lotus_petal_detached', () => {
    const ctx = createMockContext();
    const node = createMockNode('petal-test');
    attachTrait(
      lotusPetalHandler,
      node,
      { paper_id: 'trust-by-construction', venue: '', program: 1, layer: 1, spiral_index: 0 },
      ctx
    );
    ctx.clearEvents();
    lotusPetalHandler.onDetach?.(node as never, lotusPetalHandler.defaultConfig as never, ctx as never);
    expect(getEventCount(ctx, 'lotus_petal_detached')).toBe(1);
  });

  it('onUpdate is a no-op', () => {
    const ctx = createMockContext();
    const node = createMockNode('petal-test');
    attachTrait(
      lotusPetalHandler,
      node,
      { paper_id: 'trust-by-construction', venue: '', program: 1, layer: 1, spiral_index: 0 },
      ctx
    );
    ctx.clearEvents();
    for (let i = 0; i < 100; i++) {
      lotusPetalHandler.onUpdate?.(node as never, lotusPetalHandler.defaultConfig as never, ctx as never, 0.016);
    }
    expect(ctx.emittedEvents.length).toBe(0);
  });
});
