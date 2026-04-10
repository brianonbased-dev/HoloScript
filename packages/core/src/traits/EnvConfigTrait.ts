/**
 * EnvConfigTrait — v5.1
 *
 * Environment variable management with override layers.
 *
 * Events:
 *  envconfig:set      { key, value, layer }
 *  envconfig:get      { key }
 *  envconfig:result   { key, value, source }
 *  envconfig:list     (command)
 *  envconfig:entries  { entries[] }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface EnvConfigConfig {
  layers: string[];
}

export const envConfigHandler: TraitHandler<EnvConfigConfig> = {
  name: 'env_config',
  defaultConfig: { layers: ['default', 'env', 'override'] },

  onAttach(node: HSPlusNode): void {
    node.__envConfigState = { values: new Map<string, { value: unknown; layer: string }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__envConfigState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    _config: EnvConfigConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__envConfigState as
      | { values: Map<string, { value: unknown; layer: string }> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'envconfig:set':
        state.values.set(event.key as string, {
          value: event.value,
          layer: (event.layer as string) ?? 'override',
        });
        break;
      case 'envconfig:get': {
        const entry = state.values.get(event.key as string);
        context.emit?.('envconfig:result', {
          key: event.key,
          value: entry?.value ?? null,
          source: entry?.layer ?? 'missing',
        });
        break;
      }
      case 'envconfig:list': {
        const entries = [...state.values.entries()].map(([k, v]) => ({
          key: k,
          value: v.value,
          layer: v.layer,
        }));
        context.emit?.('envconfig:entries', { entries, count: entries.length });
        break;
      }
    }
  },
};

export default envConfigHandler;
