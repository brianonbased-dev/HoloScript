/**
 * ReactiveStoreTrait — v5.1
 * Reactive state store with subscriptions.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface ReactiveStoreConfig {
  max_keys: number;
}
export const reactiveStoreHandler: TraitHandler<ReactiveStoreConfig> = {
  name: 'reactive_store',
  defaultConfig: { max_keys: 500 },
  onAttach(node: HSPlusNode): void {
    node.__storeState = {
      store: new Map<string, unknown>(),
      subscribers: new Map<string, number>(),
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__storeState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: ReactiveStoreConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__storeState as
      | { store: Map<string, unknown>; subscribers: Map<string, number> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'store:set':
        if (state.store.size < config.max_keys || state.store.has(event.key as string)) {
          const prev = state.store.get(event.key as string);
          state.store.set(event.key as string, event.value);
          context.emit?.('store:changed', { key: event.key, value: event.value, previous: prev });
        }
        break;
      case 'store:get':
        context.emit?.('store:value', {
          key: event.key,
          value: state.store.get(event.key as string),
          exists: state.store.has(event.key as string),
        });
        break;
      case 'store:subscribe':
        state.subscribers.set(
          event.key as string,
          (state.subscribers.get(event.key as string) ?? 0) + 1
        );
        context.emit?.('store:subscribed', {
          key: event.key,
          subscriberCount: state.subscribers.get(event.key as string),
        });
        break;
    }
  },
};
export default reactiveStoreHandler;
