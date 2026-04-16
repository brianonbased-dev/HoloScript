import { beforeEach, describe, expect, it } from 'vitest';
import { useSceneStore } from '../sceneStore';

describe('sceneStore execution controls', () => {
  beforeEach(() => {
    useSceneStore.getState().reset();
  });

  it('defaults executionState to running', () => {
    expect(useSceneStore.getState().executionState).toBe('running');
  });

  it('allows transitions running -> paused -> stopped -> running', () => {
    const store = useSceneStore.getState();

    store.setExecutionState('paused');
    expect(useSceneStore.getState().executionState).toBe('paused');

    store.setExecutionState('stopped');
    expect(useSceneStore.getState().executionState).toBe('stopped');

    store.setExecutionState('running');
    expect(useSceneStore.getState().executionState).toBe('running');
  });

  it('reset restores executionState to running', () => {
    const store = useSceneStore.getState();
    store.setExecutionState('stopped');
    expect(useSceneStore.getState().executionState).toBe('stopped');

    store.reset();
    expect(useSceneStore.getState().executionState).toBe('running');
  });
});
