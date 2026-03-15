/**
 * ApiKeyTrait — v5.1
 *
 * API key generation, validation, and rotation.
 */

import type { TraitHandler } from './TraitTypes';

export interface ApiKeyConfig { prefix: string; max_keys: number; }

export const apiKeyHandler: TraitHandler<ApiKeyConfig> = {
  name: 'api_key',
  defaultConfig: { prefix: 'sk_', max_keys: 50 },

  onAttach(node: any): void { node.__apiKeyState = { keys: new Map<string, { name: string; created: number }>() }; },
  onDetach(node: any): void { delete node.__apiKeyState; },
  onUpdate(): void {},

  onEvent(node: any, config: ApiKeyConfig, context: any, event: any): void {
    const state = node.__apiKeyState as { keys: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'apikey:generate': {
        if (state.keys.size >= config.max_keys) break;
        const key = `${config.prefix}${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        state.keys.set(key, { name: event.name ?? 'default', created: Date.now() });
        context.emit?.('apikey:generated', { key, name: event.name });
        break;
      }
      case 'apikey:validate': {
        const found = state.keys.has(event.key as string);
        context.emit?.('apikey:validated', { key: event.key, valid: found });
        break;
      }
      case 'apikey:revoke':
        state.keys.delete(event.key as string);
        context.emit?.('apikey:revoked', { key: event.key });
        break;
    }
  },
};

export default apiKeyHandler;
