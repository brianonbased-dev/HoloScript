import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const TRAIT_AUDIT_PLUGIN_ID = 'trait-audit' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerTraitAuditTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, TRAIT_AUDIT_PLUGIN_ID, traitHandlers);
}
