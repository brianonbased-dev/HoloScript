/**
 * LotusRootTrait — visual-mapping + event-driven update tests
 *
 * The trait is a pure marker that maps aggregate bloom_state to
 * (intensity, pulse_speed) for sub-emissive layer driving. These tests pin
 * the visual contract so future changes can't silently shift the lotus's
 * "infrastructure-alive" reading at the substrate tier.
 */

import { describe, it, expect } from 'vitest';
import {
  lotusRootHandler,
  deriveLotusRootEmissive,
  type LotusAggregateBloomState,
} from '../LotusRootTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('LotusRootTrait — deriveLotusRootEmissive (pure)', () => {
  const baseCfg = {
    substrate: 'parser' as const,
    early_pulse_intensity: 0.8,
    mature_intensity: 0.4,
    early_pulse_speed: 0.5,
  };

  it('sealed state uses early_pulse_intensity at non-provenance substrate', () => {
    const out = deriveLotusRootEmissive('sealed', baseCfg);
    expect(out.intensity).toBeCloseTo(0.8, 10);
    expect(out.pulse_speed).toBeCloseTo(0.5, 10);
  });

  it('provenance_semiring substrate gets the 1.25 boost in early life', () => {
    const out = deriveLotusRootEmissive('sealed', { ...baseCfg, substrate: 'provenance_semiring' });
    expect(out.intensity).toBeCloseTo(1.0, 10); // 0.8 * 1.25
    expect(out.pulse_speed).toBeCloseTo(0.5, 10);
  });

  it('full state uses mature_intensity and zero pulse', () => {
    const out = deriveLotusRootEmissive('full', baseCfg);
    expect(out.intensity).toBeCloseTo(0.4, 10);
    expect(out.pulse_speed).toBe(0);
  });

  it('full state at provenance substrate is brighter than at parser substrate', () => {
    const parserFull = deriveLotusRootEmissive('full', baseCfg);
    const provFull = deriveLotusRootEmissive('full', { ...baseCfg, substrate: 'provenance_semiring' });
    expect(provFull.intensity).toBeGreaterThan(parserFull.intensity);
  });

  it('budding < sealed in intensity (early life dimming progression)', () => {
    const sealed = deriveLotusRootEmissive('sealed', baseCfg);
    const budding = deriveLotusRootEmissive('budding', baseCfg);
    expect(budding.intensity).toBeLessThan(sealed.intensity);
  });

  it('blooming < budding < sealed (monotonic dim across early stages)', () => {
    const sealed = deriveLotusRootEmissive('sealed', baseCfg);
    const budding = deriveLotusRootEmissive('budding', baseCfg);
    const blooming = deriveLotusRootEmissive('blooming', baseCfg);
    expect(blooming.intensity).toBeLessThan(budding.intensity);
    expect(budding.intensity).toBeLessThan(sealed.intensity);
  });

  it('wilted state has very low intensity and zero pulse', () => {
    const out = deriveLotusRootEmissive('wilted', baseCfg);
    expect(out.intensity).toBeCloseTo(0.16, 10); // 0.8 * 0.2
    expect(out.pulse_speed).toBe(0);
  });

  it('is deterministic — same inputs produce identical outputs', () => {
    const a = deriveLotusRootEmissive('blooming', baseCfg);
    const b = deriveLotusRootEmissive('blooming', baseCfg);
    expect(a.intensity).toBe(b.intensity);
    expect(a.pulse_speed).toBe(b.pulse_speed);
  });

  it('handles all five canonical bloom states without throwing', () => {
    const states: LotusAggregateBloomState[] = ['sealed', 'budding', 'blooming', 'full', 'wilted'];
    for (const s of states) {
      const out = deriveLotusRootEmissive(s, baseCfg);
      expect(out.intensity).toBeGreaterThanOrEqual(0);
      expect(out.pulse_speed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('LotusRootTrait — handler lifecycle', () => {
  it('onAttach emits lotus_root_attached with derived emissive', () => {
    const ctx = createMockContext();
    const node = createMockNode('root-test');
    attachTrait(lotusRootHandler, node, { substrate: 'parser' }, ctx);
    const evt = getLastEvent(ctx, 'lotus_root_attached') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.substrate).toBe('parser');
    expect(evt?.bloomState).toBe('sealed');
    expect(typeof evt?.intensity).toBe('number');
  });

  it('onAttach respects emit_attach_event=false', () => {
    const ctx = createMockContext();
    const node = createMockNode('root-test');
    attachTrait(lotusRootHandler, node, { substrate: 'parser', emit_attach_event: false }, ctx);
    expect(getEventCount(ctx, 'lotus_root_attached')).toBe(0);
  });

  it('lotus_bloom_state_changed event triggers emissive recompute and emits event', () => {
    const ctx = createMockContext();
    const node = createMockNode('root-test');
    attachTrait(lotusRootHandler, node, { substrate: 'provenance_semiring' }, ctx);
    ctx.clearEvents();

    sendEvent(lotusRootHandler, node, { substrate: 'provenance_semiring' }, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });

    const evt = getLastEvent(ctx, 'lotus_root_emissive_changed') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.bloomState).toBe('full');
    expect(evt?.pulseSpeed).toBe(0);
  });

  it('lotus_root_query returns current state via response event', () => {
    const ctx = createMockContext();
    const node = createMockNode('root-test');
    attachTrait(lotusRootHandler, node, { substrate: 'multi_target_compiler' }, ctx);
    ctx.clearEvents();

    sendEvent(lotusRootHandler, node, { substrate: 'multi_target_compiler' }, ctx, {
      type: 'lotus_root_query',
      queryId: 'q-1',
    });

    const evt = getLastEvent(ctx, 'lotus_root_response') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.queryId).toBe('q-1');
    expect(evt?.substrate).toBe('multi_target_compiler');
    expect(evt?.observedState).toBe('sealed');
  });

  it('onDetach emits lotus_root_detached', () => {
    const ctx = createMockContext();
    const node = createMockNode('root-test');
    attachTrait(lotusRootHandler, node, { substrate: 'parser' }, ctx);
    ctx.clearEvents();
    lotusRootHandler.onDetach?.(node as never, lotusRootHandler.defaultConfig as never, ctx as never);
    expect(getEventCount(ctx, 'lotus_root_detached')).toBe(1);
  });

  it('onUpdate is a no-op (no per-frame work)', () => {
    const ctx = createMockContext();
    const node = createMockNode('root-test');
    attachTrait(lotusRootHandler, node, { substrate: 'parser' }, ctx);
    ctx.clearEvents();
    for (let i = 0; i < 100; i++) {
      lotusRootHandler.onUpdate?.(node as never, lotusRootHandler.defaultConfig as never, ctx as never, 0.016);
    }
    expect(ctx.emittedEvents.length).toBe(0);
  });
});
