/**
 * TensorOpTrait — tests
 * Hardened 2026-05-24 (deep-ratchet): asserts COMPUTED values, not the echoed
 * operands. The prior test only checked the `op` label and passed against the
 * echo-stub; these assertions fail unless real tensor math runs.
 */
import { describe, it, expect, vi } from 'vitest';
import { tensorOpHandler } from '../TensorOpTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __tensorState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_dimensions: 4 };

const fire = (node: ReturnType<typeof makeNode>, event: Record<string, unknown>) =>
  tensorOpHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, event as never);

const lastEmit = (node: ReturnType<typeof makeNode>, type: string) => {
  const calls = node.emit.mock.calls.filter((c: unknown[]) => c[0] === type);
  return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined;
};

describe('TensorOpTrait', () => {
  it('has name "tensor_op"', () => {
    expect(tensorOpHandler.name).toBe('tensor_op');
  });

  it('tensor:create emits tensor:created with normalized shape', () => {
    const node = makeNode();
    tensorOpHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'tensor:create', tensorId: 't1', shape: [3, 3] });
    expect(node.emit).toHaveBeenCalledWith('tensor:created', { tensorId: 't1', shape: [3, 3] });
  });

  it('tensor:matmul emits the REAL computed product, not the operands', () => {
    const node = makeNode();
    tensorOpHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'tensor:create', tensorId: 'a', shape: [2, 2], data: [1, 2, 3, 4] });
    fire(node, { type: 'tensor:create', tensorId: 'b', shape: [2, 2], data: [5, 6, 7, 8] });
    fire(node, { type: 'tensor:matmul', a: 'a', b: 'b', out: 'c' });
    const result = lastEmit(node, 'tensor:result');
    expect(result?.op).toBe('matmul');
    expect(result?.shape).toEqual([2, 2]);
    // [[1,2],[3,4]] x [[5,6],[7,8]] = [[19,22],[43,50]]
    expect(result?.data).toEqual([19, 22, 43, 50]);
  });

  it('tensor:add emits the REAL elementwise sum', () => {
    const node = makeNode();
    tensorOpHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'tensor:create', tensorId: 'a', shape: [3], data: [1, 2, 3] });
    fire(node, { type: 'tensor:create', tensorId: 'b', shape: [3], data: [4, 5, 6] });
    fire(node, { type: 'tensor:add', a: 'a', b: 'b' });
    expect(lastEmit(node, 'tensor:result')?.data).toEqual([5, 7, 9]);
  });

  it('emits tensor:error on shape mismatch (negative control)', () => {
    const node = makeNode();
    tensorOpHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'tensor:create', tensorId: 'a', shape: [2, 3], data: [1, 2, 3, 4, 5, 6] });
    fire(node, { type: 'tensor:create', tensorId: 'b', shape: [2, 2], data: [1, 2, 3, 4] });
    fire(node, { type: 'tensor:matmul', a: 'a', b: 'b' });
    expect(node.emit).toHaveBeenCalledWith('tensor:error', expect.objectContaining({ op: 'matmul' }));
    expect(lastEmit(node, 'tensor:result')).toBeUndefined();
  });

  it('emits tensor:error on unknown tensor id', () => {
    const node = makeNode();
    tensorOpHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'tensor:add', a: 'nope', b: 'nada' });
    expect(node.emit).toHaveBeenCalledWith('tensor:error', expect.objectContaining({ reason: 'unknown tensor id' }));
  });
});
