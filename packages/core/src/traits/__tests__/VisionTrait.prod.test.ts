/**
 * VisionTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { visionHandler } from '../VisionTrait';

function makeNode() { return { id: 'vision_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...visionHandler.defaultConfig!, ...cfg };
  visionHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

describe('visionHandler.defaultConfig', () => {
  const d = visionHandler.defaultConfig!;
  it('scan_interval=1000', () => expect(d.scan_interval).toBe(1000));
  it('fov=90', () => expect(d.fov).toBe(90));
  it('max_distance=10', () => expect(d.max_distance).toBe(10));
  it('auto_scan=false', () => expect(d.auto_scan).toBe(false));
});

describe('visionHandler.onAttach', () => {
  it('creates __visionState', () => expect(attach().node.__visionState).toBeDefined());
  it('isScanning=false when auto_scan=false', () => expect(attach({ auto_scan: false }).node.__visionState.isScanning).toBe(false));
  it('isScanning=true when auto_scan=true', () => expect(attach({ auto_scan: true }).node.__visionState.isScanning).toBe(true));
  it('lastScan=0', () => expect(attach().node.__visionState.lastScan).toBe(0));
  it('emits vision_system_online', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('vision_system_online', expect.anything());
  });
});

describe('visionHandler.onDetach', () => {
  it('removes __visionState', () => {
    const { node, config, ctx } = attach();
    visionHandler.onDetach!(node, config, ctx);
    expect(node.__visionState).toBeUndefined();
  });
});

describe('visionHandler.onUpdate — not scanning', () => {
  it('no emit when isScanning=false', () => {
    const { node, config, ctx } = attach({ auto_scan: false, scan_interval: 100 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.5);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('visionHandler.onUpdate — scanning', () => {
  it('accumulates lastScan', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 10000 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.1);
    expect(node.__visionState.lastScan).toBeCloseTo(100);
  });
  it('no scan when interval not reached', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 1000 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.5);
    expect(ctx.emit).not.toHaveBeenCalledWith('vision_scan_complete', expect.anything());
  });
  it('fires scan when interval reached, resets lastScan', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 500 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.6);
    expect(ctx.emit).toHaveBeenCalledWith('vision_scan_complete', expect.anything());
    expect(node.__visionState.lastScan).toBe(0);
  });
  it('scan_complete has detected array', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 100 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.2);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'vision_scan_complete')!;
    expect(Array.isArray(call[1].detected)).toBe(true);
  });
  it('scan_complete has timestamp', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 100 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.2);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'vision_scan_complete')!;
    expect(call[1].timestamp).toBeGreaterThan(0);
  });
  it('emits vision_object_detected for each detection', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 100 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.2);
    const detections = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'vision_object_detected');
    expect(detections.length).toBeGreaterThan(0);
  });
  it('detected objects have required fields', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 100 });
    ctx.emit.mockClear();
    visionHandler.onUpdate!(node, config, ctx, 0.2);
    const detection = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'vision_object_detected')![1];
    expect(detection.object).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      confidence: expect.any(Number),
      bbox: expect.any(Array),
      distance: expect.any(Number),
    });
  });
  it('mock scan detects chair and table', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 100 });
    visionHandler.onUpdate!(node, config, ctx, 0.2);
    const scan = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'vision_scan_complete')![1];
    const labels = scan.detected.map((d: any) => d.label);
    expect(labels).toContain('chair');
    expect(labels).toContain('table');
  });
  it('confidence values 0-1', () => {
    const { node, config, ctx } = attach({ auto_scan: true, scan_interval: 100 });
    visionHandler.onUpdate!(node, config, ctx, 0.2);
    const scan = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'vision_scan_complete')![1];
    scan.detected.forEach((d: any) => expect(d.confidence).toBeGreaterThan(0) && expect(d.confidence).toBeLessThanOrEqual(1));
  });
});

describe('visionHandler.onEvent', () => {
  it('vision_scan_request triggers performScan', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    visionHandler.onEvent!(node, config, ctx, { type: 'vision_scan_request' });
    expect(ctx.emit).toHaveBeenCalledWith('vision_scan_complete', expect.anything());
  });
  it('vision_scan_request also emits vision_object_detected', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    visionHandler.onEvent!(node, config, ctx, { type: 'vision_scan_request' });
    expect(ctx.emit).toHaveBeenCalledWith('vision_object_detected', expect.anything());
  });
  it('unknown event ignores silently', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    expect(() => visionHandler.onEvent!(node, config, ctx, { type: 'noop' })).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalledWith('vision_scan_complete', expect.anything());
  });
});
