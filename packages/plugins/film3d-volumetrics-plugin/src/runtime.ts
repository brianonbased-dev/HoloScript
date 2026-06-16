import { registerPluginTraits } from '@holoscript/core/runtime';
import { traitHandlers } from './index';

export const FILM3D_VOLUMETRICS_PLUGIN_ID = 'film3d-volumetrics' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerFilm3dVolumetricsTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, FILM3D_VOLUMETRICS_PLUGIN_ID, traitHandlers);
}
