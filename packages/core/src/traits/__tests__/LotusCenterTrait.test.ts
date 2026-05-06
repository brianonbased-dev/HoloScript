/**
 * LotusCenterTrait — phase-machine + once-fired SDF readiness tests
 */

import { describe, it, expect } from 'vitest';
import {
  lotusCenterHandler,
  deriveLotusCenterPhase,
} from '../LotusCenterTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('LotusCenterTrait — deriveLotusCenterPhase (pure)', () => {
  const baseCfg = { placeholder_intensity: 0.3, mature_intensity: 1.5 };

  it('!genesis_fired → pre_genesis (any bloom state)', () => {
    expect(deriveLotusCenterPhase('sealed', false, baseCfg).phase).toBe('pre_genesis');
    expect(deriveLotusCenterPhase('budding', false, baseCfg).phase).toBe('pre_genesis');
    expect(deriveLotusCenterPhase('blooming', false, baseCfg).phase).toBe('pre_genesis');
    expect(deriveLotusCenterPhase('full', false, baseCfg).phase).toBe('pre_genesis');
    expect(deriveLotusCenterPhase('wilted', false, baseCfg).phase).toBe('pre_genesis');
  });

  it('genesis_fired but bloom != full → genesis_fired_pending (defensive)', () => {
    expect(deriveLotusCenterPhase('sealed', true, baseCfg).phase).toBe('genesis_fired_pending');
    expect(deriveLotusCenterPhase('blooming', true, baseCfg).phase).toBe('genesis_fired_pending');
    expect(deriveLotusCenterPhase('wilted', true, baseCfg).phase).toBe('genesis_fired_pending');
  });

  it('genesis_fired AND bloom == full → sdf_ready', () => {
    const out = deriveLotusCenterPhase('full', true, baseCfg);
    expect(out.phase).toBe('sdf_ready');
    expect(out.intensity).toBeCloseTo(1.5, 10);
  });

  it('pre_genesis intensity equals placeholder_intensity', () => {
    const out = deriveLotusCenterPhase('sealed', false, baseCfg);
    expect(out.intensity).toBeCloseTo(0.3, 10);
  });

  it('genesis_fired_pending uses placeholder_intensity (NOT mature)', () => {
    const out = deriveLotusCenterPhase('blooming', true, baseCfg);
    expect(out.intensity).toBeCloseTo(0.3, 10);
  });

  it('is deterministic', () => {
    const a = deriveLotusCenterPhase('blooming', true, baseCfg);
    const b = deriveLotusCenterPhase('blooming', true, baseCfg);
    expect(a).toEqual(b);
  });
});

describe('LotusCenterTrait — handler lifecycle', () => {
  it('onAttach starts in pre_genesis with default state', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, {}, ctx);
    const evt = getLastEvent(ctx, 'lotus_center_attached') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.phase).toBe('pre_genesis');
    expect(evt?.bloomState).toBe('sealed');
    expect(evt?.genesisFired).toBe(false);
  });

  it('lotus_genesis_fired event without full state → genesis_fired_pending (no SDF event)', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(lotusCenterHandler, node, {}, ctx, { type: 'lotus_genesis_fired' });

    expect(getEventCount(ctx, 'lotus_center_phase_changed')).toBe(1);
    expect(getEventCount(ctx, 'center_ready_for_sdf_body')).toBe(0);
    const evt = getLastEvent(ctx, 'lotus_center_phase_changed') as Record<string, unknown> | undefined;
    expect(evt?.phase).toBe('genesis_fired_pending');
  });

  it('lotus_bloom_state_changed → full WITHOUT genesis fired keeps pre_genesis', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(lotusCenterHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });

    // bloom flipped but genesis not fired — phase didn't change (still pre_genesis)
    expect(getEventCount(ctx, 'lotus_center_phase_changed')).toBe(0);
    expect(getEventCount(ctx, 'center_ready_for_sdf_body')).toBe(0);
  });

  it('genesis_fired + bloom=full triggers center_ready_for_sdf_body EXACTLY ONCE', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(lotusCenterHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });
    sendEvent(lotusCenterHandler, node, {}, ctx, { type: 'lotus_genesis_fired' });

    expect(getEventCount(ctx, 'center_ready_for_sdf_body')).toBe(1);

    // Send the events again — must not fire SDF event again
    sendEvent(lotusCenterHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });
    sendEvent(lotusCenterHandler, node, {}, ctx, { type: 'lotus_genesis_fired' });

    expect(getEventCount(ctx, 'center_ready_for_sdf_body')).toBe(1);
  });

  it('once sdf_ready, intensity is mature_intensity', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, { mature_intensity: 1.5 }, ctx);
    ctx.clearEvents();

    sendEvent(lotusCenterHandler, node, { mature_intensity: 1.5 }, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });
    sendEvent(lotusCenterHandler, node, { mature_intensity: 1.5 }, ctx, {
      type: 'lotus_genesis_fired',
    });

    const evt = getLastEvent(ctx, 'center_ready_for_sdf_body') as Record<string, unknown> | undefined;
    expect(evt?.intensity).toBeCloseTo(1.5, 10);
  });

  it('lotus_center_query returns full state', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(lotusCenterHandler, node, {}, ctx, {
      type: 'lotus_center_query',
      queryId: 'q-c',
    });

    const evt = getLastEvent(ctx, 'lotus_center_response') as Record<string, unknown> | undefined;
    expect(evt).toBeDefined();
    expect(evt?.queryId).toBe('q-c');
    expect(evt?.phase).toBe('pre_genesis');
    expect(evt?.sdfReadyEmitted).toBe(false);
  });

  it('onDetach emits lotus_center_detached', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, {}, ctx);
    ctx.clearEvents();
    lotusCenterHandler.onDetach?.(node as never, lotusCenterHandler.defaultConfig as never, ctx as never);
    expect(getEventCount(ctx, 'lotus_center_detached')).toBe(1);
  });

  it('onUpdate is a no-op', () => {
    const ctx = createMockContext();
    const node = createMockNode('center-test');
    attachTrait(lotusCenterHandler, node, {}, ctx);
    ctx.clearEvents();
    for (let i = 0; i < 100; i++) {
      lotusCenterHandler.onUpdate?.(node as never, lotusCenterHandler.defaultConfig as never, ctx as never, 0.016);
    }
    expect(ctx.emittedEvents.length).toBe(0);
  });
});
