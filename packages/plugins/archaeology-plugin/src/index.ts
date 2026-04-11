export { ExcavationLayerTrait } from './traits/ExcavationLayerTrait';
export { ArtifactCatalogTrait } from './traits/ArtifactCatalogTrait';
export { StratigraphyTrait } from './traits/StratigraphyTrait';
export type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './traits/types';

import type { TraitHandler } from './traits/types';
import { ExcavationLayerTrait } from './traits/ExcavationLayerTrait';
import { ArtifactCatalogTrait } from './traits/ArtifactCatalogTrait';
import { StratigraphyTrait } from './traits/StratigraphyTrait';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLUGIN_TRAITS: TraitHandler<any>[] = [
  ExcavationLayerTrait,
  ArtifactCatalogTrait,
  StratigraphyTrait,
];

export function registerArchaeologyPlugin(runtime: {
  registerTrait: (handler: TraitHandler<unknown>) => void;
}): void {
  for (const trait of PLUGIN_TRAITS) {
    runtime.registerTrait(trait);
  }
}

export const TRAIT_KEYWORDS: Record<string, string> = {
  excavation_layer: 'Archaeological excavation layer with depth, period, and material tracking',
  artifact_catalog: 'Digital catalog of discovered artifacts with condition management',
  stratigraphy: 'Stratigraphic layer analysis for site chronology reconstruction',
};

export const VERSION = '1.0.0';
