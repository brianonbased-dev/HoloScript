/**
 * StateMachineTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { stateMachineHandler } from '../StateMachineTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __smState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { initial_state: 'idle' };

describe('StateMachineTrait', () => {
  it('has name "state_machine"', () => {
    expect(stateMachineHandler.name).toBe('state_machine');
  });

  it('onAttach sets current to initial_state', () => {
    const node = makeNode();
    stateMachineHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__smState as { current: string }).current).toBe('idle');
  });

  it('sm:transition emits sm:transitioned', () => {
    const node = makeNode();
    stateMachineHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    stateMachineHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sm:transition', to: 'running',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sm:transitioned', { from: 'idle', to: 'running', transitions: 1 });
  });
});
