/**
 * ChaosTestTrait — v5.1
 * Chaos engineering fault injection.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface ChaosTestConfig {
  failure_rate: number;
}

export const chaosTestHandler: TraitHandler<ChaosTestConfig> = {
  name: 'chaos_test',
  defaultConfig: { failure_rate: 0.1 },
  onAttach(node: HSPlusNode): void {
    node.__chaosState = { injected: 0, types: [] as string[] };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__chaosState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: ChaosTestConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__chaosState as { injected: number; types: string[] } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'chaos:inject': {
        state.injected++;
        const fault = (event.fault as string) ?? 'latency';
        state.types.push(fault);
        context.emit?.('chaos:injected', {
          fault,
          count: state.injected,
          rate: config.failure_rate,
        });
        break;
      }
      case 'chaos:report':
        context.emit?.('chaos:report', { injected: state.injected, types: [...state.types] });
        break;
    }
  },
};
export default chaosTestHandler;
