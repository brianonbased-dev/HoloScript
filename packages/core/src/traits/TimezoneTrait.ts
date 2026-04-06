/**
 * TimezoneTrait — v5.1
 * Timezone conversion and display.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface TimezoneConfig {
  default_tz: string;
}

export const timezoneHandler: TraitHandler<TimezoneConfig> = {
  name: 'timezone',
  defaultConfig: { default_tz: 'UTC' },
  onAttach(node: HSPlusNode, config: unknown): void {
    node.__tzState = { current: config.default_tz || 'UTC' };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__tzState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: TimezoneConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__tzState as { current: string } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'tz:set':
        state.current = (event.timezone as string) ?? config.default_tz;
        context.emit?.('tz:changed', { timezone: state.current });
        break;
      case 'tz:convert': {
        const from = (event.from as string) ?? state.current;
        const to = (event.to as string) ?? config.default_tz;
        context.emit?.('tz:converted', { from, to, timestamp: event.timestamp });
        break;
      }
    }
  },
};
export default timezoneHandler;
