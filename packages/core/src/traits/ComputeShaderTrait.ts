/**
 * ComputeShaderTrait — v5.1
 * Custom GPU compute shader dispatch.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface ComputeShaderConfig {
  max_workgroups: number;
}
export const computeShaderHandler: TraitHandler<ComputeShaderConfig> = {
  name: 'compute_shader',
  defaultConfig: { max_workgroups: 256 },
  onAttach(node: HSPlusNode): void {
    node.__csState = { dispatches: 0, shaders: new Map<string, { workgroups: number[] }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__csState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: ComputeShaderConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__csState as { dispatches: number; shaders: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'cs:compile':
        state.shaders.set(event.shaderId as string, {
          workgroups: (event.workgroups as number[]) ?? [64, 1, 1],
        });
        context.emit?.('cs:compiled', { shaderId: event.shaderId });
        break;
      case 'cs:dispatch':
        state.dispatches++;
        context.emit?.('cs:dispatched', { shaderId: event.shaderId, dispatches: state.dispatches });
        break;
    }
  },
};
export default computeShaderHandler;
