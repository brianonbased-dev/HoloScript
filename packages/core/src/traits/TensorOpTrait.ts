/**
 * TensorOpTrait — v5.1
 * Tensor creation and real dense Float32 math (elementwise add, 2D matmul).
 * Math lives in ./engines/tensor-ops; this handler is a thin delegator.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import {
  createTensor,
  add as tensorAdd,
  matmul as tensorMatmul,
  type DenseTensor,
} from './engines/tensor-ops';
export interface TensorOpConfig {
  max_dimensions: number;
}
export const tensorOpHandler: TraitHandler<TensorOpConfig> = {
  name: 'tensor_op',
  defaultConfig: { max_dimensions: 4 },
  onAttach(node: HSPlusNode): void {
    node.__tensorState = { tensors: new Map<string, DenseTensor>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__tensorState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: TensorOpConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__tensorState as { tensors: Map<string, DenseTensor> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'tensor:create': {
        const shape = (event.shape as number[]) ?? [1];
        const tensor = createTensor(shape, event.data as ArrayLike<number> | undefined);
        state.tensors.set(event.tensorId as string, tensor);
        context.emit?.('tensor:created', { tensorId: event.tensorId, shape: tensor.shape });
        break;
      }
      case 'tensor:matmul':
        runBinaryOp(state, context, event, 'matmul', tensorMatmul);
        break;
      case 'tensor:add':
        runBinaryOp(state, context, event, 'add', tensorAdd);
        break;
    }
  },
};

function runBinaryOp(
  state: { tensors: Map<string, DenseTensor> },
  context: TraitContext,
  event: Exclude<TraitEvent, string>,
  op: 'matmul' | 'add',
  compute: (a: DenseTensor, b: DenseTensor) => DenseTensor
): void {
  const a = state.tensors.get(event.a as string);
  const b = state.tensors.get(event.b as string);
  if (!a || !b) {
    context.emit?.('tensor:error', { op, reason: 'unknown tensor id', a: event.a, b: event.b });
    return;
  }
  let result: DenseTensor;
  try {
    result = compute(a, b);
  } catch (err) {
    context.emit?.('tensor:error', { op, reason: (err as Error).message, a: event.a, b: event.b });
    return;
  }
  const outId = (event.out as string) ?? 'result';
  state.tensors.set(outId, result);
  context.emit?.('tensor:result', {
    op,
    tensorId: outId,
    shape: result.shape,
    data: Array.from(result.data),
  });
}
export default tensorOpHandler;
