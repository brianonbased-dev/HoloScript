import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const WISDOM_GOTCHA_PLUGIN_ID = 'wisdom-gotcha' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerWisdomGotchaTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, WISDOM_GOTCHA_PLUGIN_ID, traitHandlers);
}
