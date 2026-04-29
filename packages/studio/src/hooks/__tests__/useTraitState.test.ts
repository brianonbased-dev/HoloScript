// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTraitState, emitTraitStateUpdate } from '../useTraitState';

describe('useTraitState', () => {
  beforeEach(() => {
    // Clear the module-level registry between tests by emitting a reset via a
    // unique nodeId; the registry is module-global so we rely on unique IDs.
  });

  it('returns defaultValue when no state has been emitted', () => {
    const { result } = renderHook(() =>
      useTraitState('node-none', 'neural_animation', (s) => s.locomotion, 'default-val')
    );
    expect(result.current).toBe('default-val');
  });

  it('returns undefined (not defaultValue) if defaultValue is omitted', () => {
    const { result } = renderHook(() =>
      useTraitState('node-undef', 'neural_animation', (s) => s.locomotion)
    );
    expect(result.current).toBeUndefined();
  });

  it('updates when emitTraitStateUpdate is called after mount', async () => {
    const nodeId = 'node-a';
    const { result } = renderHook(() =>
      useTraitState<Array<[number, number, number]>>(
        nodeId,
        'neural_animation',
        (s) => s.locomotion?.trajectory as Array<[number, number, number]>
      )
    );

    expect(result.current).toBeUndefined();

    const trajectory: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0.1, 0],
    ];

    act(() => {
      emitTraitStateUpdate(nodeId, 'neural_animation', { locomotion: { trajectory } });
    });

    expect(result.current).toEqual(trajectory);
  });

  it('isolates updates by nodeId — other nodes not affected', async () => {
    const nodeA = 'node-iso-a';
    const nodeB = 'node-iso-b';

    const { result: resA } = renderHook(() =>
      useTraitState(nodeA, 'neural_animation', (s) => s.speed as number)
    );
    const { result: resB } = renderHook(() =>
      useTraitState(nodeB, 'neural_animation', (s) => s.speed as number)
    );

    act(() => {
      emitTraitStateUpdate(nodeA, 'neural_animation', { speed: 3.0 });
    });

    expect(resA.current).toBe(3.0);
    expect(resB.current).toBeUndefined(); // nodeB untouched
  });

  it('returns defaultValue when nodeId is null', () => {
    const { result } = renderHook(() =>
      useTraitState(null, 'neural_animation', (s) => s.x, 42)
    );
    expect(result.current).toBe(42);
  });

  it('fires DOM CustomEvent on emitTraitStateUpdate', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('holoTrait:stateUpdate', handler);

    act(() => {
      emitTraitStateUpdate('node-evt', 'neural_animation', { foo: 1 });
    });

    window.removeEventListener('holoTrait:stateUpdate', handler);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ nodeId: 'node-evt', traitName: 'neural_animation', state: { foo: 1 } });
  });
});
