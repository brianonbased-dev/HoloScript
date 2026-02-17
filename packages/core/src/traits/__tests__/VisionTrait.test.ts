import { describe, it, expect, beforeEach } from 'vitest';
import { visionHandler } from '../VisionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('VisionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    scan_interval: 1000,
    fov: 90,
    max_distance: 10,
    auto_scan: false,
  };

  beforeEach(() => {
    node = createMockNode('vis');
    ctx = createMockContext();
    attachTrait(visionHandler, node, cfg, ctx);
  });

  it('emits vision_system_online on attach', () => {
    expect(getEventCount(ctx, 'vision_system_online')).toBe(1);
    expect((node as any).__visionState.isScanning).toBe(false);
  });

  it('auto_scan starts scanning', () => {
    const n = createMockNode('vis2');
    const c = createMockContext();
    attachTrait(visionHandler, n, { ...cfg, auto_scan: true }, c);
    expect((n as any).__visionState.isScanning).toBe(true);
  });

  it('vision_scan_request triggers scan', () => {
    sendEvent(visionHandler, node, cfg, ctx, { type: 'vision_scan_request' });
    expect(getEventCount(ctx, 'vision_scan_complete')).toBe(1);
    expect(getEventCount(ctx, 'vision_object_detected')).toBe(2); // Mock returns 2 objects
  });

  it('auto scan triggers on update after interval', () => {
    const autoCfg = { ...cfg, auto_scan: true, scan_interval: 500 };
    const n = createMockNode('vis3');
    const c = createMockContext();
    attachTrait(visionHandler, n, autoCfg, c);
    // delta*1000 must exceed 500
    updateTrait(visionHandler, n, autoCfg, c, 0.6);
    expect(getEventCount(c, 'vision_scan_complete')).toBe(1);
  });

  it('auto scan does not trigger before interval', () => {
    const autoCfg = { ...cfg, auto_scan: true, scan_interval: 1000 };
    const n = createMockNode('vis4');
    const c = createMockContext();
    attachTrait(visionHandler, n, autoCfg, c);
    updateTrait(visionHandler, n, autoCfg, c, 0.5);
    expect(getEventCount(c, 'vision_scan_complete')).toBe(0);
  });

  it('non-scanning update does nothing', () => {
    updateTrait(visionHandler, node, cfg, ctx, 2.0);
    expect(getEventCount(ctx, 'vision_scan_complete')).toBe(0);
  });

  it('detach cleans up', () => {
    visionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__visionState).toBeUndefined();
  });
});
