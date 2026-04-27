/**
 * AICompanionTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { aiCompanionHandler } from '../AICompanionTrait';

const makeNode = (id = 'node-1') => ({
  id,
  traits: new Set<string>(),
  emit: vi.fn(),
  __aiCompanionState: undefined as unknown,
});

const defaultConfig = {
  personality: 'friendly',
  interaction_range: 10,
  response_latency: 0.5,
  memory_capacity: 100,
  use_rag: true,
  use_snn: true,
  idle_behavior: 'wander' as const,
  emotion_decay: 0.01,
};

const makeContext = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('AICompanionTrait — metadata', () => {
  it('has name "ai_companion"', () => {
    expect(aiCompanionHandler.name).toBe('ai_companion');
  });

  it('defaultConfig has expected keys', () => {
    const cfg = aiCompanionHandler.defaultConfig!;
    expect(cfg.personality).toBe('friendly');
    expect(cfg.interaction_range).toBe(10);
    expect(cfg.response_latency).toBe(0.5);
    expect(cfg.memory_capacity).toBe(100);
    expect(cfg.use_rag).toBe(true);
    expect(cfg.use_snn).toBe(true);
    expect(cfg.idle_behavior).toBe('wander');
    expect(cfg.emotion_decay).toBe(0.01);
  });
});

describe('AICompanionTrait — onAttach', () => {
  it('initializes __aiCompanionState', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    const state = node.__aiCompanionState as Record<string, unknown>;
    expect(state).toBeDefined();
    expect(state.active).toBe(true);
    expect(state.currentAction).toBe('idle');
    expect(state.interactingWith).toBeNull();
    expect(state.memoryCount).toBe(0);
  });

  it('emits ai_companion_create with config info', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    expect(node.emit).toHaveBeenCalledWith('ai_companion_create', expect.objectContaining({
      personality: 'friendly',
      interactionRange: 10,
      idleBehavior: 'wander',
    }));
  });

  it('initial emotions are half-neutral', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    const state = node.__aiCompanionState as { emotion: Record<string, number> };
    expect(state.emotion.happiness).toBe(0.5);
    expect(state.emotion.curiosity).toBe(0.5);
    expect(state.emotion.fear).toBe(0);
    expect(state.emotion.trust).toBe(0.5);
  });
});

describe('AICompanionTrait — onDetach', () => {
  it('removes __aiCompanionState and emits destroy', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    node.emit.mockClear();
    aiCompanionHandler.onDetach!(node as never, defaultConfig, makeContext(node) as never);
    expect(node.__aiCompanionState).toBeUndefined();
    expect(node.emit).toHaveBeenCalledWith('ai_companion_destroy', { nodeId: 'node-1' });
  });

  it('is safe to call twice (no-op second time)', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    aiCompanionHandler.onDetach!(node as never, defaultConfig, makeContext(node) as never);
    node.emit.mockClear();
    aiCompanionHandler.onDetach!(node as never, defaultConfig, makeContext(node) as never);
    expect(node.emit).not.toHaveBeenCalled();
  });
});

describe('AICompanionTrait — onUpdate', () => {
  it('emits ai_companion_update', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    node.emit.mockClear();
    aiCompanionHandler.onUpdate!(node as never, defaultConfig, makeContext(node) as never, 0.016);
    expect(node.emit).toHaveBeenCalledWith('ai_companion_update', expect.objectContaining({
      deltaTime: 0.016,
      currentAction: 'idle',
    }));
  });

  it('decays emotions toward neutral', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, emotion_decay: 0.5 };
    aiCompanionHandler.onAttach!(node as never, cfg, makeContext(node) as never);
    const state = node.__aiCompanionState as { emotion: { fear: number } };
    // Force fear high
    aiCompanionHandler.onEvent!(node as never, cfg, makeContext(node) as never, { type: 'ai_companion_emotion_stimulus', fear: 1 } as never);
    const fearBefore = state.emotion.fear;
    aiCompanionHandler.onUpdate!(node as never, cfg, makeContext(node) as never, 0.1);
    expect(state.emotion.fear).toBeLessThan(fearBefore);
  });
});

describe('AICompanionTrait — onEvent', () => {
  it('ai_companion_interact sets interacting state', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    node.emit.mockClear();
    aiCompanionHandler.onEvent!(node as never, defaultConfig, makeContext(node) as never, {
      type: 'ai_companion_interact', playerId: 'player-1', message: 'Hello',
    } as never);
    const state = node.__aiCompanionState as { interactingWith: string; currentAction: string };
    expect(state.interactingWith).toBe('player-1');
    expect(state.currentAction).toBe('interacting');
    expect(node.emit).toHaveBeenCalledWith('ai_companion_response_start', expect.objectContaining({
      playerId: 'player-1',
      latency: 0.5,
    }));
  });

  it('ai_companion_response increments memoryCount and emits speak', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    const state = node.__aiCompanionState as { memoryCount: number };
    aiCompanionHandler.onEvent!(node as never, defaultConfig, makeContext(node) as never, {
      type: 'ai_companion_response', text: 'Hi there!',
    } as never);
    expect(state.memoryCount).toBe(1);
    expect(node.emit).toHaveBeenCalledWith('on_ai_companion_speak', expect.objectContaining({
      text: 'Hi there!',
    }));
  });

  it('memory is capped at memory_capacity', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, memory_capacity: 2 };
    aiCompanionHandler.onAttach!(node as never, cfg, makeContext(node) as never);
    const state = node.__aiCompanionState as { memoryCount: number };
    for (let i = 0; i < 5; i++) {
      aiCompanionHandler.onEvent!(node as never, cfg, makeContext(node) as never, {
        type: 'ai_companion_response', text: `msg${i}`,
      } as never);
    }
    expect(state.memoryCount).toBe(2);
  });

  it('ai_companion_emotion_stimulus adjusts emotions', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    const state = node.__aiCompanionState as { emotion: { happiness: number; fear: number; trust: number } };
    aiCompanionHandler.onEvent!(node as never, defaultConfig, makeContext(node) as never, {
      type: 'ai_companion_emotion_stimulus', happiness: 0.3, fear: 0.5, trust: -0.2,
    } as never);
    expect(state.emotion.happiness).toBeCloseTo(0.8, 5);
    expect(state.emotion.fear).toBeCloseTo(0.5, 5);
    expect(state.emotion.trust).toBeCloseTo(0.3, 5);
  });

  it('emotions are clamped to [0, 1]', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    const state = node.__aiCompanionState as { emotion: { happiness: number; fear: number } };
    aiCompanionHandler.onEvent!(node as never, defaultConfig, makeContext(node) as never, {
      type: 'ai_companion_emotion_stimulus', happiness: 5, fear: -5,
    } as never);
    expect(state.emotion.happiness).toBe(1);
    expect(state.emotion.fear).toBe(0);
  });

  it('ai_companion_set_action updates currentAction', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    aiCompanionHandler.onEvent!(node as never, defaultConfig, makeContext(node) as never, {
      type: 'ai_companion_set_action', action: 'patrol',
    } as never);
    const state = node.__aiCompanionState as { currentAction: string };
    expect(state.currentAction).toBe('patrol');
  });

  it('ai_companion_end_interaction clears interactingWith and sets idle_behavior', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, idle_behavior: 'patrol' as const };
    aiCompanionHandler.onAttach!(node as never, cfg, makeContext(node) as never);
    aiCompanionHandler.onEvent!(node as never, cfg, makeContext(node) as never, {
      type: 'ai_companion_interact', playerId: 'p1',
    } as never);
    aiCompanionHandler.onEvent!(node as never, cfg, makeContext(node) as never, {
      type: 'ai_companion_end_interaction',
    } as never);
    const state = node.__aiCompanionState as { interactingWith: null; currentAction: string };
    expect(state.interactingWith).toBeNull();
    expect(state.currentAction).toBe('patrol');
  });

  it('ai_companion_end_interaction with stationary idle_behavior sets idle', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, idle_behavior: 'stationary' as const };
    aiCompanionHandler.onAttach!(node as never, cfg, makeContext(node) as never);
    aiCompanionHandler.onEvent!(node as never, cfg, makeContext(node) as never, {
      type: 'ai_companion_end_interaction',
    } as never);
    const state = node.__aiCompanionState as { currentAction: string };
    expect(state.currentAction).toBe('idle');
  });

  it('unknown event is ignored', () => {
    const node = makeNode();
    aiCompanionHandler.onAttach!(node as never, defaultConfig, makeContext(node) as never);
    node.emit.mockClear();
    expect(() =>
      aiCompanionHandler.onEvent!(node as never, defaultConfig, makeContext(node) as never, {
        type: 'something_random',
      } as never)
    ).not.toThrow();
    expect(node.emit).not.toHaveBeenCalled();
  });
});
