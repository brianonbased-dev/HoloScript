import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const EDUCATION_LMS_PLUGIN_ID = 'education-lms' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerEducationLmsTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, EDUCATION_LMS_PLUGIN_ID, traitHandlers);
}
