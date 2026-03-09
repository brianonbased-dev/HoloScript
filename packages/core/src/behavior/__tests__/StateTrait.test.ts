import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stateTraitHandler, getNodeStateMachine } from '../StateTrait';

vi.mock('../StateMachine', () => ({
  StateMachine: class MockStateMachine {
    private state: string;
    constructor(config: any) {
      this.state = config.initialState || 'idle';
    }
    getCurrentState() {
      return this.state;
    }
    update(_dt: number) {}
  },
}));

describe('StateTrait', () => {
  const cfg = {
    machine: {
      initialState: 'idle',
      states: [{ name: 'idle' }, { name: 'walking' }],
      transitions: [],
    },
  };
  let node: any;

  beforeEach(() => {
    node = { id: 'node1', properties: {} };
  });

  it('has name "state"', () => {
    expect(stateTraitHandler.name).toBe('state');
  });

  it('creates a StateMachine on attach', () => {
    stateTraitHandler.onAttach!(node, cfg, {});
    const sm = getNodeStateMachine('node1');
    expect(sm).toBeDefined();
  });

  it('surfaces state on node properties', () => {
    stateTraitHandler.onAttach!(node, cfg, {});
    expect(node.properties._state).toBe('idle');
  });

  it('updates state on onUpdate', () => {
    stateTraitHandler.onAttach!(node, cfg, {});
    stateTraitHandler.onUpdate!(node, cfg, {}, 0.016);
    expect(node.properties._state).toBe('idle');
  });

  it('removes StateMachine on detach', () => {
    stateTraitHandler.onAttach!(node, cfg, {});
    stateTraitHandler.onDetach!(node, cfg, {});
    expect(getNodeStateMachine('node1')).toBeUndefined();
  });

  it('getNodeStateMachine returns undefined for unknown id', () => {
    expect(getNodeStateMachine('unknown')).toBeUndefined();
  });

  it('has default config', () => {
    expect(stateTraitHandler.defaultConfig).toBeDefined();
    expect(stateTraitHandler.defaultConfig.machine.initialState).toBe('idle');
  });
});
