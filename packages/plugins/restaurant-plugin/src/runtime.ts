import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const RESTAURANT_PLUGIN_ID = 'restaurant' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerRestaurantTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, RESTAURANT_PLUGIN_ID, traitHandlers);
}
