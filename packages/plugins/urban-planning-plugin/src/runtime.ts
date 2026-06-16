import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const URBAN_PLANNING_PLUGIN_ID = 'urban-planning' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerUrbanPlanningTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, URBAN_PLANNING_PLUGIN_ID, traitHandlers);
}
