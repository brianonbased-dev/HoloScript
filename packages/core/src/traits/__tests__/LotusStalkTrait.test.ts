/**
 * LotusStalkTrait — posture-mapping + event-driven update tests
 */

import { describe, it, expect } from 'vitest';
import {
  lotusStalkHandler,
  deriveLotusStalkPosture,
  type LotusStalkFormat,
} from '../LotusStalkTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('LotusStalkTrait — deriveLotusStalkPosture (pure)', () => {
  const baseCfg = {
    format: 'holo' as const,
    base_sway_amplitude_rad: 0.15,
    max_stiffness: 4.0,
    wilt_droop_m: 0.5,
  };

  it('sealed state uses full sway and baseline stiffness', () => {
    const out = deriveLotusStalkPosture('sealed', baseCfg);
    expect(out.sway_amplitude).toBeCloseTo(0.15, 10);
    expect(out.stiffness).toBeCloseTo(1.0, 10);
    expect(out.y_droop).toBe(0);
  });

  it('full state uses zero sway and max stiffness', () => {
    const out = deriveLotusStalkPosture('full', baseCfg);
    expect(out.sway_amplitude).toBe(0);
    expect(out.stiffness).toBeCloseTo(4.0, 10);
    expect(out.y_droop).toBe(0);
  });

  it('wilted state activates y_droop and reduces stiffness', () => {
    const out = deriveLotusStalkPosture('wilted', baseCfg);
    expect(out.y_droop).toBeCloseTo(0.5, 10);
    expect(out.stiffness).toBeLessThan(1.0);
  });

  it('format hs is stiffest baseline (lowest sway multiplier)', () => {
    const hsStalk = deriveLotusStalkPosture('sealed', { ...baseCfg, format: 'hs' });
    const holoStalk = deriveLotusStalkPosture('sealed', { ...baseCfg, format: 'holo' });
    const docStalk = deriveLotusStalkPosture('sealed', { ...baseCfg, format: 'hs_md' });
    expect(hsStalk.sway_amplitude).toBeLessThan(holoStalk.sway_amplitude);
    expect(holoStalk.sway_amplitude).toBeLessThan(docStalk.sway_amplitude);
  });

  it('sway monotonically decreases sealed → budding → blooming → full', () => {
    const states = ['sealed', 'budding', 'blooming', 'full'] as const;
    const sways = states.map((s) => deriveLotusStalkPosture(s, baseCfg).sway_amplitude);
    for (let i = 1; i < sways.length; i++) {
      expect(sways[i]).toBeLessThanOrEqual(sways[i - 1]);
    }
  });

  it('stiffness monotonically increases sealed → budding → blooming → full', () => {
    const states = ['sealed', 'budding', 'blooming', 'full'] as const;
    const stiffs = states.map((s) => deriveLotusStalkPosture(s, baseCfg).stiffness);
    for (let i = 1; i < stiffs.length; i++) {
      expect(stiffs[i]).toBeGreaterThanOrEqual(stiffs[i - 1]);
    }
  });

  it('is deterministic — same inputs identical outputs', () => {
    const a = deriveLotusStalkPosture('blooming', baseCfg);
    const b = deriveLotusStalkPosture('blooming', baseCfg);
    expect(a.sway_amplitude).toBe(b.sway_amplitude);
    expect(a.stiffness).toBe(b.stiffness);
    expect(a.y_droop).toBe(b.y_droop);
  });

  it('budding stiffness equals 1 + 0.25 * (max - 1) at the canonical config', () => {
    // Pin the formula so future tweaks must justify themselves
    const out = deriveLotusStalkPosture('budding', baseCfg);
    expect(out.stiffness).toBeCloseTo(1.0 + (4.0 - 1.0) * 0.25, 10);
  });

  it('blooming stiffness equals 1 + 0.65 * (max - 1) at the canonical config', () => {
    const out = deriveLotusStalkPosture('blooming', baseCfg);
    expect(out.stiffness).toBeCloseTo(1.0 + (4.0 - 1.0) * 0.65, 10);
  });
});

describe('LotusStalkTrait — handler lifecycle', () => {
  it('onAttach emits lotus_stalk_attached with derived posture', () => {
    const ctx = createMockContext();
    const node = createMockNode('stalk-test');
    attachTrait(lotusStalkHandler, node, { format: 'hs' }, ctx);
    const evt = getLastEvent(ctx, 'lotus_stalk_attached') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.format).toBe('hs');
    expect(evt?.bloomState).toBe('sealed');
  });

  it('lotus_bloom_state_changed event emits stalk_sway_modulated', () => {
    const ctx = createMockContext();
    const node = createMockNode('stalk-test');
    attachTrait(lotusStalkHandler, node, { format: 'hsplus' }, ctx);
    ctx.clearEvents();

    sendEvent(lotusStalkHandler, node, { format: 'hsplus' }, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });

    const evt = getLastEvent(ctx, 'stalk_sway_modulated') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.bloomState).toBe('full');
    expect(evt?.swayAmplitude).toBe(0);
  });

  it('lotus_stalk_query returns current posture via response event', () => {
    const ctx = createMockContext();
    const node = createMockNode('stalk-test');
    attachTrait(lotusStalkHandler, node, { format: 'holo' }, ctx);
    ctx.clearEvents();

    sendEvent(lotusStalkHandler, node, { format: 'holo' }, ctx, {
      type: 'lotus_stalk_query',
      queryId: 'q-2',
    });

    const evt = getLastEvent(ctx, 'lotus_stalk_response') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.queryId).toBe('q-2');
    expect(evt?.format).toBe('holo');
  });

  it('onDetach emits lotus_stalk_detached', () => {
    const ctx = createMockContext();
    const node = createMockNode('stalk-test');
    attachTrait(lotusStalkHandler, node, { format: 'hs' }, ctx);
    ctx.clearEvents();
    lotusStalkHandler.onDetach?.(node as never, lotusStalkHandler.defaultConfig as never, ctx as never);
    expect(getEventCount(ctx, 'lotus_stalk_detached')).toBe(1);
  });

  it('onUpdate is a no-op', () => {
    const ctx = createMockContext();
    const node = createMockNode('stalk-test');
    attachTrait(lotusStalkHandler, node, { format: 'hs' }, ctx);
    ctx.clearEvents();
    for (let i = 0; i < 100; i++) {
      lotusStalkHandler.onUpdate?.(node as never, lotusStalkHandler.defaultConfig as never, ctx as never, 0.016);
    }
    expect(ctx.emittedEvents.length).toBe(0);
  });

  it('handles all canonical formats without throwing', () => {
    const ctx = createMockContext();
    const formats: LotusStalkFormat[] = ['hs', 'hsplus', 'holo', 'hs_md'];
    for (const format of formats) {
      const node = createMockNode(`stalk-${format}`);
      attachTrait(lotusStalkHandler, node, { format }, ctx);
    }
    expect(getEventCount(ctx, 'lotus_stalk_attached')).toBe(formats.length);
  });
});
