/**
 * PostProcessTrait — v5.1
 * Post-processing effect chain.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface PostProcessConfig { max_effects: number; }
export const postProcessHandler: TraitHandler<PostProcessConfig> = {
  name: 'post_process' as any, defaultConfig: { max_effects: 16 },
  onAttach(node: HSPlusNode): void { node.__ppState = { effects: [] as Array<{ name: string; intensity: number }> }; },
  onDetach(node: HSPlusNode): void { delete node.__ppState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: PostProcessConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__ppState as { effects: Array<{ name: string; intensity: number }> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'pp:add': if (state.effects.length < config.max_effects) { state.effects.push({ name: event.effectName as string, intensity: (event.intensity as number) ?? 1.0 }); context.emit?.('pp:added', { effectName: event.effectName, total: state.effects.length }); } break;
      case 'pp:remove': state.effects = state.effects.filter(e => e.name !== (event.effectName as string)); context.emit?.('pp:removed', { effectName: event.effectName }); break;
    }
  },
};
export default postProcessHandler;
