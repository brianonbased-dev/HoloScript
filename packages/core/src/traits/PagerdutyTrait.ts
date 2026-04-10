/**
 * PagerdutyTrait — v5.1
 * PagerDuty incident alerting.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface PagerdutyConfig {
  severity: string;
}
export const pagerdutyHandler: TraitHandler<PagerdutyConfig> = {
  name: 'pagerduty',
  defaultConfig: { severity: 'critical' },
  onAttach(node: HSPlusNode): void {
    node.__pdState = { incidents: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__pdState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: PagerdutyConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__pdState as { incidents: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'pagerduty:trigger':
        state.incidents++;
        context.emit?.('pagerduty:triggered', {
          incidentId: `PD-${state.incidents}`,
          severity: (event.severity as string) ?? config.severity,
          summary: event.summary,
        });
        break;
      case 'pagerduty:resolve':
        context.emit?.('pagerduty:resolved', { incidentId: event.incidentId });
        break;
    }
  },
};
export default pagerdutyHandler;
