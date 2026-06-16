import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const INSURANCE_PLUGIN_ID = 'insurance' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerInsuranceTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, INSURANCE_PLUGIN_ID, traitHandlers);
}
