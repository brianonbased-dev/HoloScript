import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const ECONOMIC_PRIMITIVES_PLUGIN_ID = 'economic-primitives' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerEconomicPrimitivesTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, ECONOMIC_PRIMITIVES_PLUGIN_ID, traitHandlers);
}
