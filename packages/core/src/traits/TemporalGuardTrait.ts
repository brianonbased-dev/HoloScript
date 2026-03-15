/**
 * TemporalGuardTrait — v5.1
 * Temporal logic guard.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface TemporalGuardConfig { default_timeout_ms: number; }
export const temporalGuardHandler: TraitHandler<TemporalGuardConfig> = {
  name: 'temporal_guard', defaultConfig: { default_timeout_ms: 5000 },
  onAttach(node: HSPlusNode): void { node.__tempState = { guards: new Map<string, { deadline: number; property: string }>(), violations: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__tempState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: TemporalGuardConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__tempState as { guards: Map<string, any>; violations: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'tg:assert': state.guards.set(event.guardId as string, { deadline: Date.now() + ((event.timeout_ms as number) ?? config.default_timeout_ms), property: (event.property as string) ?? '' }); context.emit?.('tg:asserted', { guardId: event.guardId }); break;
      case 'tg:satisfy': state.guards.delete(event.guardId as string); context.emit?.('tg:satisfied', { guardId: event.guardId }); break;
      case 'tg:check': { const now = Date.now(); for (const [id, g] of state.guards) { if (now > g.deadline) { state.violations++; state.guards.delete(id); context.emit?.('tg:violation', { guardId: id, property: g.property, violations: state.violations }); } } break; }
    }
  },
};
export default temporalGuardHandler;
