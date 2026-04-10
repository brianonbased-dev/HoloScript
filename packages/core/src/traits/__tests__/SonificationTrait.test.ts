import { describe, it, expect, beforeEach } from 'vitest';
import { sonificationHandler } from '../SonificationTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('SonificationTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    data_source: 'temperature',
    mapping: 'pitch' as const,
    min_freq: 200,
    max_freq: 2000,
    min_value: 0,
    max_value: 100,
    pan_mode: 'spatial' as const,
    continuous: false,
    instrument: 'sine' as const,
    volume: 0.5,
    attack: 0.01,
    release: 0.1,
    custom_mappings: [],
  };

  beforeEach(() => {
    node = createMockNode('son');
    ctx = createMockContext();
    attachTrait(sonificationHandler, node, cfg, ctx);
  });

  it('initializes inactive', () => {
    expect((node as any).__sonificationState.isActive).toBe(false);
    expect(getEventCount(ctx, 'sonification_create')).toBe(1);
  });

  it('data_update maps pitch via exponential curve', () => {
    sendEvent(sonificationHandler, node, cfg, ctx, {
      type: 'sonification_data_update',
      value: 50,
      property: 'temperature',
    });
    const s = (node as any).__sonificationState;
    expect(s.currentFrequency).toBeGreaterThan(200);
    expect(s.currentFrequency).toBeLessThan(2000);
    expect(getEventCount(ctx, 'sonification_trigger')).toBe(1);
    expect(getEventCount(ctx, 'sonification_value_changed')).toBe(1);
  });

  it('volume mapping normalizes 0-1', () => {
    const volCfg = { ...cfg, mapping: 'volume' as const };
    const n2 = createMockNode('vol');
    const c2 = createMockContext();
    attachTrait(sonificationHandler, n2, volCfg, c2);
    sendEvent(sonificationHandler, n2, volCfg, c2, { type: 'sonification_data_update', value: 50 });
    expect((n2 as any).__sonificationState.currentGain).toBeCloseTo(0.5, 1);
  });

  it('pan mapping ranges -1 to 1', () => {
    const panCfg = { ...cfg, mapping: 'pan' as const };
    const n2 = createMockNode('pan');
    const c2 = createMockContext();
    attachTrait(sonificationHandler, n2, panCfg, c2);
    sendEvent(sonificationHandler, n2, panCfg, c2, { type: 'sonification_data_update', value: 0 });
    expect((n2 as any).__sonificationState.currentPan).toBe(-1);
  });

  it('start/stop events toggle isActive', () => {
    sendEvent(sonificationHandler, node, cfg, ctx, { type: 'sonification_start' });
    expect((node as any).__sonificationState.isActive).toBe(true);
    expect(getEventCount(ctx, 'sonification_play')).toBe(1);
    sendEvent(sonificationHandler, node, cfg, ctx, { type: 'sonification_stop' });
    expect((node as any).__sonificationState.isActive).toBe(false);
  });

  it('continuous mode emits update_params on update', () => {
    const contCfg = { ...cfg, continuous: true };
    const n2 = createMockNode('cont');
    const c2 = createMockContext();
    attachTrait(sonificationHandler, n2, contCfg, c2);
    sendEvent(sonificationHandler, n2, contCfg, c2, { type: 'sonification_start' });
    c2.clearEvents();
    updateTrait(sonificationHandler, n2, contCfg, c2, 0.016);
    expect(getEventCount(c2, 'sonification_update_params')).toBe(1);
  });

  it('set_instrument emits change', () => {
    sendEvent(sonificationHandler, node, cfg, ctx, {
      type: 'sonification_set_instrument',
      instrument: 'square',
    });
    expect(getEventCount(ctx, 'sonification_change_instrument')).toBe(1);
  });

  it('cleans up on detach', () => {
    sonificationHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__sonificationState).toBeUndefined();
    expect(getEventCount(ctx, 'sonification_destroy')).toBe(1);
  });
});
