/**
 * TensorOpTrait — v5.1
 * Tensor creation and manipulation.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface TensorOpConfig { max_dimensions: number; }
export const tensorOpHandler: TraitHandler<TensorOpConfig> = {
  name: 'tensor_op' as any, defaultConfig: { max_dimensions: 4 },
  onAttach(node: HSPlusNode): void { node.__tensorState = { tensors: new Map<string, { shape: number[]; dtype: string }>() }; },
  onDetach(node: HSPlusNode): void { delete node.__tensorState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: TensorOpConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__tensorState as { tensors: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'tensor:create': state.tensors.set(event.tensorId as string, { shape: (event.shape as number[]) ?? [1], dtype: (event.dtype as string) ?? 'float32' }); context.emit?.('tensor:created', { tensorId: event.tensorId, shape: event.shape }); break;
      case 'tensor:matmul': context.emit?.('tensor:result', { op: 'matmul', a: event.a, b: event.b }); break;
      case 'tensor:add': context.emit?.('tensor:result', { op: 'add', a: event.a, b: event.b }); break;
    }
  },
};
export default tensorOpHandler;
