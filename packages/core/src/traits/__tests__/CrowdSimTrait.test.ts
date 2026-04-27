/**
 * CrowdSimTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { crowdSimHandler } from '../CrowdSimTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __crowdSimState: undefined as unknown,
});

const defaultConfig = {
  max_agents: 100,
  speed: 1.5,
  avoidance_radius: 1.0,
  goal_weight: 1.0,
  separation_weight: 1.5,
  alignment_weight: 1.0,
  cohesion_weight: 0.8,
  lod_levels: 3,
  use_gpu: true,
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('CrowdSimTrait — metadata', () => {
  it('has name "crowd_sim"', () => {
    expect(crowdSimHandler.name).toBe('crowd_sim');
  });

  it('defaultConfig max_agents is 1000', () => {
    expect(crowdSimHandler.defaultConfig?.max_agents).toBe(1000);
  });
});

describe('CrowdSimTrait — onAttach / onDetach', () => {
  it('onAttach emits crowd_sim_create with correct params', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('crowd_sim_create', expect.objectContaining({
      maxAgents: 100,
      speed: 1.5,
      useGPU: true,
    }));
  });

  it('onAttach initializes agentCount to 0', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__crowdSimState as { agentCount: number };
    expect(state.agentCount).toBe(0);
  });

  it('onDetach emits crowd_sim_destroy and clears state', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    crowdSimHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('crowd_sim_destroy', { nodeId: 'node-1' });
    expect(node.__crowdSimState).toBeUndefined();
  });
});

describe('CrowdSimTrait — onUpdate', () => {
  it('emits crowd_sim_step with delta and agentCount', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    crowdSimHandler.onUpdate!(node as never, defaultConfig, makeCtx(node) as never, 0.016);
    expect(node.emit).toHaveBeenCalledWith('crowd_sim_step', expect.objectContaining({
      deltaTime: 0.016,
      agentCount: 0,
    }));
  });
});

describe('CrowdSimTrait — onEvent', () => {
  it('crowd_spawn_agents increments agentCount and emits crowd_sim_spawn', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    crowdSimHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'crowd_spawn_agents', count: 10, position: [0, 0, 0],
    } as never);
    const state = node.__crowdSimState as { agentCount: number };
    expect(state.agentCount).toBe(10);
    expect(node.emit).toHaveBeenCalledWith('crowd_sim_spawn', expect.objectContaining({
      count: 10, agentCount: 10,
    }));
  });

  it('crowd_spawn_agents caps at max_agents', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    crowdSimHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'crowd_spawn_agents', count: 200, position: [0, 0, 0],
    } as never);
    const state = node.__crowdSimState as { agentCount: number };
    expect(state.agentCount).toBe(100); // capped at max_agents
  });

  it('crowd_set_goal stores goal and emits crowd_sim_goal', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    crowdSimHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'crowd_set_goal', groupId: 'g1', position: [10, 0, 5],
    } as never);
    const state = node.__crowdSimState as { goals: Map<string, unknown> };
    expect(state.goals.get('g1')).toEqual([10, 0, 5]);
    expect(node.emit).toHaveBeenCalledWith('crowd_sim_goal', expect.objectContaining({
      groupId: 'g1',
    }));
  });

  it('crowd_clear resets agentCount and goals', () => {
    const node = makeNode();
    crowdSimHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    crowdSimHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'crowd_spawn_agents', count: 50, position: [0, 0, 0],
    } as never);
    node.emit.mockClear();
    crowdSimHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'crowd_clear',
    } as never);
    const state = node.__crowdSimState as { agentCount: number; goals: Map<string, unknown> };
    expect(state.agentCount).toBe(0);
    expect(state.goals.size).toBe(0);
    expect(node.emit).toHaveBeenCalledWith('crowd_sim_clear', {});
  });
});
