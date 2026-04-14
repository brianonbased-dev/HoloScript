import { describe, it, expect, beforeEach } from 'vitest';
import { vpsHandler } from '../VPSTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
} from './traitTestHelpers';

describe('VPSTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    provider: 'arcore' as const,
    coverage_check: true,
    localization_timeout: 30000,
    continuous_tracking: true,
    quality_threshold: 0.7,
    auto_localize: true,
    max_attempts: 3,
    retry_interval: 3000,
  };

  beforeEach(() => {
    node = createMockNode('vps');
    ctx = createMockContext();
    attachTrait(vpsHandler, node, cfg, ctx);
  });

  it('init and coverage check on attach', () => {
    expect(getEventCount(ctx, 'vps_init')).toBe(1);
    expect(getEventCount(ctx, 'vps_check_coverage')).toBe(1);
    expect((node as any).__vpsState.state).toBe('checking_coverage');
  });

  it('skips coverage and auto-localizes when coverage_check disabled', () => {
    const n = createMockNode('v2');
    const c = createMockContext();
    attachTrait(vpsHandler, n, { ...cfg, coverage_check: false }, c);
    expect(getEventCount(c, 'vps_check_coverage')).toBe(0);
    expect(getEventCount(c, 'vps_localize')).toBe(1);
  });

  it('coverage available triggers localization', () => {
    sendEvent(vpsHandler, node, cfg, ctx, { type: 'vps_coverage_result', hasCoverage: true });
    expect((node as any).__vpsState.state).toBe('localizing');
    expect(getEventCount(ctx, 'on_vps_coverage_available')).toBe(1);
  });

  it('no coverage sets unavailable', () => {
    sendEvent(vpsHandler, node, cfg, ctx, { type: 'vps_coverage_result', hasCoverage: false });
    expect((node as any).__vpsState.state).toBe('unavailable');
    expect(getEventCount(ctx, 'on_vps_unavailable')).toBe(1);
  });

  it('localized with sufficient confidence starts tracking', () => {
    sendEvent(vpsHandler, node, cfg, ctx, {
      type: 'vps_localized',
      confidence: 0.9,
      accuracy: 0.5,
      locationId: 'loc1',
      pose: { position: [1, 2, 3], rotation: [0, 0, 0, 1 ] },
    });
    expect((node as any).__vpsState.state).toBe('tracking');
    expect(getEventCount(ctx, 'on_vps_localized')).toBe(1);
    expect(getEventCount(ctx, 'vps_start_tracking')).toBe(1);
  });

  it('localized with low confidence sets limited', () => {
    sendEvent(vpsHandler, node, cfg, ctx, {
      type: 'vps_localized',
      confidence: 0.3,
      accuracy: 2.0,
      pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1 ] },
    });
    expect((node as any).__vpsState.state).toBe('limited');
    expect(getEventCount(ctx, 'on_vps_limited')).toBe(1);
  });

  it('localization failure exhausts max attempts', () => {
    for (let i = 0; i < 3; i++) {
      sendEvent(vpsHandler, node, cfg, ctx, { type: 'vps_localization_failed', reason: 'timeout' });
    }
    expect((node as any).__vpsState.state).toBe('unavailable');
    expect(getEventCount(ctx, 'on_vps_failed')).toBe(1);
  });

  it('stop sets idle', () => {
    sendEvent(vpsHandler, node, cfg, ctx, { type: 'vps_stop' });
    expect((node as any).__vpsState.state).toBe('idle');
    expect(getEventCount(ctx, 'vps_stop_tracking')).toBe(1);
  });

  it('query emits info', () => {
    sendEvent(vpsHandler, node, cfg, ctx, { type: 'vps_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'vps_info')).toBe(1);
  });

  it('detach shuts down', () => {
    vpsHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'vps_shutdown')).toBe(1);
    expect((node as any).__vpsState).toBeUndefined();
  });
});
