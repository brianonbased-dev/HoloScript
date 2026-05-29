/**
 * ComputeShaderTrait — v5.1
 * GPU compute shader dispatch. OVERCLAIMED: onUpdate is empty (no per-frame logic),
 * 'compile' is Map.set (no shader compilation). Dispatch counter only increments on cs:dispatch events.
 * No real GPU workgroup scheduling, no shader validation, no WebGPU compute pipeline integration.
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
  onUpdate(): void { /* RATCHET: empty — no per-frame shader execution or workgroup scheduling */ },
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
