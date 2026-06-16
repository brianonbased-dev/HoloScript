import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const CULTURE_KEYWORD_PLUGIN_ID = 'culture-keyword' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerCultureKeywordTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, CULTURE_KEYWORD_PLUGIN_ID, traitHandlers);
}
