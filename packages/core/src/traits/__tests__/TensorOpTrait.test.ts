/**
 * TensorOpTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { tensorOpHandler } from '../TensorOpTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __tensorState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_dimensions: 4 };

describe('TensorOpTrait', () => {
  it('has name "tensor_op"', () => {
    expect(tensorOpHandler.name).toBe('tensor_op');
  });

  it('tensor:create emits tensor:created', () => {
    const node = makeNode();
    tensorOpHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    tensorOpHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'tensor:create', tensorId: 't1', shape: [3, 3],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('tensor:created', { tensorId: 't1', shape: [3, 3] });
  });
});
