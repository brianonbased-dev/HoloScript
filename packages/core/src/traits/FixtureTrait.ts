/**
 * FixtureTrait — v5.1
 * Test fixture / data setup with lifecycle hooks.
 */
import type { TraitHandler } from './TraitTypes';

export interface FixtureConfig { auto_teardown: boolean; }

export const fixtureHandler: TraitHandler<FixtureConfig> = {
  name: 'fixture' as any,
  defaultConfig: { auto_teardown: true },
  onAttach(node: any): void { node.__fixtureState = { fixtures: new Map<string, { data: unknown; active: boolean }>() }; },
  onDetach(node: any): void { delete node.__fixtureState; },
  onUpdate(): void {},
  onEvent(node: any, _config: FixtureConfig, context: any, event: any): void {
    const state = node.__fixtureState as { fixtures: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'fixture:setup':
        state.fixtures.set(event.name as string, { data: event.data ?? {}, active: true });
        context.emit?.('fixture:ready', { name: event.name });
        break;
      case 'fixture:teardown':
        state.fixtures.delete(event.name as string);
        context.emit?.('fixture:torn_down', { name: event.name });
        break;
    }
  },
};
export default fixtureHandler;
