/**
 * RolloutTrait — v5.1
 * Gradual percentage-based rollout.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface RolloutConfig {
  default_percentage: number;
}
export const rolloutHandler: TraitHandler<RolloutConfig> = {
  name: 'rollout',
  defaultConfig: { default_percentage: 0 },
  onAttach(node: HSPlusNode): void {
    node.__rolloutState = {
      features: new Map<string, { percentage: number; enabled: Set<string> }>(),
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__rolloutState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: RolloutConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__rolloutState as
      | { features: Map<string, { percentage: number; enabled: Set<string> }> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'rollout:set':
        state.features.set(event.feature as string, {
          percentage: (event.percentage as number) ?? 0,
          enabled: new Set(),
        });
        context.emit?.('rollout:configured', {
          feature: event.feature,
          percentage: event.percentage,
        });
        break;
      case 'rollout:check': {
        const r = state.features.get(event.feature as string);
        const hash =
          Math.abs(
            ((event.userId as string) ?? '')
              .split('')
              .reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
          ) % 100;
        const enabled = r ? hash < r.percentage : false;
        context.emit?.('rollout:result', { feature: event.feature, userId: event.userId, enabled });
        break;
      }
    }
  },
};
export default rolloutHandler;
