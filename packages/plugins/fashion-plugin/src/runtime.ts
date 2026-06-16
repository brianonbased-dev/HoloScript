import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const FASHION_PLUGIN_ID = 'fashion' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerFashionTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, FASHION_PLUGIN_ID, traitHandlers);
}
