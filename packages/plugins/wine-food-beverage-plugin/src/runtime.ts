import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const WINE_FOOD_BEVERAGE_PLUGIN_ID = 'wine-food-beverage' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerWineFoodBeverageTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, WINE_FOOD_BEVERAGE_PLUGIN_ID, traitHandlers);
}
