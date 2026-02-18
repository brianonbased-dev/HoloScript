import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuntimeBridge } from '../RuntimeBridge';

describe('RuntimeBridge', () => {
  let bridge: RuntimeBridge;

  beforeEach(() => {
    bridge = new RuntimeBridge();
  });

  // ---- Construction ----

  it('constructs with default config', () => {
    expect(bridge.world).toBeDefined();
    expect(bridge.eventBus).toBeDefined();
    expect(bridge.themeEngine).toBeDefined();
    expect(bridge.systemScheduler).toBeDefined();
    expect(bridge.traitBinder).toBeDefined();
    expect(bridge.sceneRunner).toBeDefined();
  });

  it('starts in stopped state', () => {
    expect(bridge.isRunning()).toBe(false);
    expect(bridge.getTotalTime()).toBe(0);
  });

  // ---- Start / Stop ----

  it('start sets running to true', () => {
    bridge.start();
    expect(bridge.isRunning()).toBe(true);
  });

  it('stop sets running to false', () => {
    bridge.start();
    bridge.stop();
    expect(bridge.isRunning()).toBe(false);
  });

  // ---- Update ----

  it('update accumulates time when running', () => {
    bridge.start();
    bridge.update(0.016);
    bridge.update(0.016);
    expect(bridge.getTotalTime()).toBeCloseTo(0.032, 3);
  });

  it('update does nothing when stopped', () => {
    bridge.update(1.0);
    expect(bridge.getTotalTime()).toBe(0);
  });

  // ---- Load Scene ----

  it('loadScene creates entities from AST', () => {
    const root = {
      type: 'document',
      name: 'root',
      id: 'root',
      properties: {},
      directives: [],
      children: [
        { type: 'mesh', name: 'cube', id: 'cube', properties: {}, directives: [], children: [] },
      ],
    };
    const entity = bridge.loadScene(root as any);
    expect(entity).toBeDefined();
  });

  // ---- Events ----

  it('start emits runtime:start', () => {
    const handler = vi.fn();
    bridge.eventBus.on('runtime:start', handler);
    bridge.start();
    expect(handler).toHaveBeenCalled();
  });

  it('stop emits runtime:stop', () => {
    const handler = vi.fn();
    bridge.eventBus.on('runtime:stop', handler);
    bridge.start();
    bridge.stop();
    expect(handler).toHaveBeenCalled();
  });

  it('update emits frame event', () => {
    const handler = vi.fn();
    bridge.eventBus.on('frame', handler);
    bridge.start();
    bridge.update(0.016);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ delta: 0.016 }));
  });

  // ---- Reset ----

  it('reset stops and clears time', () => {
    bridge.start();
    bridge.update(1.0);
    bridge.reset();
    expect(bridge.isRunning()).toBe(false);
    expect(bridge.getTotalTime()).toBe(0);
  });

  // ---- Custom Systems ----

  it('accepts custom systems in config', () => {
    const executeFn = vi.fn();
    const b = new RuntimeBridge({
      systems: [{ name: 'custom', execute: executeFn, priority: 0 }],
    });
    b.start();
    b.update(0.016);
    // System should have been called
    expect(executeFn).toHaveBeenCalled();
  });
});
