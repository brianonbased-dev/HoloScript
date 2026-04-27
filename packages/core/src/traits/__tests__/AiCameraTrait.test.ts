/**
 * AiCameraTrait — comprehensive tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiCameraHandler } from '../AiCameraTrait';

function makeNode(): Record<string, unknown> {
  return {};
}

function makeContext() {
  return { emit: vi.fn() };
}

function makeConfig(overrides: Partial<{ tracking_speed: number }> = {}) {
  return { tracking_speed: 1.0, ...overrides };
}

describe('aiCameraHandler — metadata', () => {
  it('has name "ai_camera"', () => {
    expect(aiCameraHandler.name).toBe('ai_camera');
  });

  it('has defaultConfig tracking_speed 1.0', () => {
    expect(aiCameraHandler.defaultConfig?.tracking_speed).toBe(1.0);
  });
});

describe('aiCameraHandler — onAttach', () => {
  it('initializes __camState with static mode, no target, 0 shots', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const state = node.__camState as { mode: string; target: string | null; shots: number };
    expect(state.mode).toBe('static');
    expect(state.target).toBeNull();
    expect(state.shots).toBe(0);
  });
});

describe('aiCameraHandler — onDetach', () => {
  it('removes __camState', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    aiCameraHandler.onDetach!(node as never);
    expect(node.__camState).toBeUndefined();
  });
});

describe('aiCameraHandler — onUpdate', () => {
  it('is a no-op', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    expect(() => aiCameraHandler.onUpdate!(node as never, makeConfig(), makeContext() as never)).not.toThrow();
  });
});

describe('aiCameraHandler — cam:track', () => {
  it('sets mode to tracking, stores target, emits cam:tracking', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const ctx = makeContext();
    aiCameraHandler.onEvent!(node as never, makeConfig({ tracking_speed: 2.5 }), ctx as never, {
      type: 'cam:track',
      targetId: 'player1',
    } as never);
    const state = node.__camState as { mode: string; target: string };
    expect(state.mode).toBe('tracking');
    expect(state.target).toBe('player1');
    expect(ctx.emit).toHaveBeenCalledWith('cam:tracking', { target: 'player1', speed: 2.5 });
  });

  it('uses tracking_speed from config', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const ctx = makeContext();
    aiCameraHandler.onEvent!(node as never, makeConfig({ tracking_speed: 5 }), ctx as never, {
      type: 'cam:track',
      targetId: 'enemy',
    } as never);
    expect(ctx.emit).toHaveBeenCalledWith('cam:tracking', { target: 'enemy', speed: 5 });
  });
});

describe('aiCameraHandler — cam:frame', () => {
  it('increments shots counter and emits cam:framed', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const ctx = makeContext();
    aiCameraHandler.onEvent!(node as never, makeConfig(), ctx as never, {
      type: 'cam:frame',
      composition: 'rule-of-thirds',
    } as never);
    const state = node.__camState as { shots: number };
    expect(state.shots).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('cam:framed', { composition: 'rule-of-thirds', shotCount: 1 });
  });

  it('accumulates shot count across multiple frames', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const ctx = makeContext();
    for (let i = 0; i < 5; i++) {
      aiCameraHandler.onEvent!(node as never, makeConfig(), ctx as never, {
        type: 'cam:frame', composition: 'centered',
      } as never);
    }
    const state = node.__camState as { shots: number };
    expect(state.shots).toBe(5);
  });
});

describe('aiCameraHandler — cam:auto', () => {
  it('sets mode to auto and emits cam:auto_mode', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const ctx = makeContext();
    aiCameraHandler.onEvent!(node as never, makeConfig(), ctx as never, { type: 'cam:auto' } as never);
    const state = node.__camState as { mode: string };
    expect(state.mode).toBe('auto');
    expect(ctx.emit).toHaveBeenCalledWith('cam:auto_mode', { mode: 'auto' });
  });
});

describe('aiCameraHandler — edge cases', () => {
  it('ignores unknown event types', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const ctx = makeContext();
    expect(() =>
      aiCameraHandler.onEvent!(node as never, makeConfig(), ctx as never, { type: 'cam:zoom' } as never)
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-ops when __camState is missing', () => {
    const node = makeNode();
    const ctx = makeContext();
    expect(() =>
      aiCameraHandler.onEvent!(node as never, makeConfig(), ctx as never, {
        type: 'cam:track', targetId: 'x',
      } as never)
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('handles string event type via event.type path', () => {
    const node = makeNode();
    aiCameraHandler.onAttach!(node as never);
    const ctx = makeContext();
    expect(() =>
      aiCameraHandler.onEvent!(node as never, makeConfig(), ctx as never, 'cam:auto' as never)
    ).not.toThrow();
  });
});
