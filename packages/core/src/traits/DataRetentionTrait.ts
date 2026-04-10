/**
 * DataRetentionTrait — v5.1
 * Data retention policy enforcement.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface DataRetentionConfig {
  default_ttl_days: number;
}
export const dataRetentionHandler: TraitHandler<DataRetentionConfig> = {
  name: 'data_retention',
  defaultConfig: { default_ttl_days: 90 },
  onAttach(node: HSPlusNode): void {
    node.__retentionState = { policies: new Map<string, { ttl: number; created: number }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__retentionState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: DataRetentionConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__retentionState as { policies: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'retention:set':
        state.policies.set(event.dataType as string, {
          ttl: (event.ttl_days as number) ?? config.default_ttl_days,
          created: Date.now(),
        });
        context.emit?.('retention:policy_set', { dataType: event.dataType });
        break;
      case 'retention:purge': {
        const purged: string[] = [];
        for (const [k] of state.policies) purged.push(k);
        context.emit?.('retention:purged', { purged });
        break;
      }
    }
  },
};
export default dataRetentionHandler;
