/**
 * RenderPipelineTrait — v5.1
 * Custom rendering pipeline stages.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface RenderPipelineConfig { max_passes: number; }
export const renderPipelineHandler: TraitHandler<RenderPipelineConfig> = {
  name: 'render_pipeline' as any, defaultConfig: { max_passes: 8 },
  onAttach(node: HSPlusNode): void { node.__rpState = { passes: [] as string[], active: false }; },
  onDetach(node: HSPlusNode): void { delete node.__rpState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: RenderPipelineConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__rpState as { passes: string[]; active: boolean } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'rp:add_pass': if (state.passes.length < config.max_passes) { state.passes.push(event.passName as string); context.emit?.('rp:pass_added', { passName: event.passName, total: state.passes.length }); } break;
      case 'rp:execute': state.active = true; context.emit?.('rp:executed', { passes: state.passes.length }); break;
    }
  },
};
export default renderPipelineHandler;
