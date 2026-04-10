/**
 * OnnxRuntimeTrait — v5.1
 * ONNX model execution runtime.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface OnnxRuntimeConfig {
  execution_provider: string;
}
export const onnxRuntimeHandler: TraitHandler<OnnxRuntimeConfig> = {
  name: 'onnx_runtime',
  defaultConfig: { execution_provider: 'cpu' },
  onAttach(node: HSPlusNode): void {
    node.__onnxState = { models: new Map<string, { loaded: boolean }>(), inferences: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__onnxState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: OnnxRuntimeConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__onnxState as { models: Map<string, any>; inferences: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'onnx:load':
        state.models.set(event.modelId as string, { loaded: true });
        context.emit?.('onnx:loaded', {
          modelId: event.modelId,
          provider: config.execution_provider,
        });
        break;
      case 'onnx:run':
        state.inferences++;
        context.emit?.('onnx:output', { modelId: event.modelId, inferences: state.inferences });
        break;
    }
  },
};
export default onnxRuntimeHandler;
