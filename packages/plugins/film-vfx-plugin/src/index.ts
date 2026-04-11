export { shotListHandler, SHOT_LIST_TRAIT } from './traits/ShotListTrait';
export type { ShotListConfig } from './traits/ShotListTrait';

export { colorGradeHandler, COLOR_GRADE_TRAIT } from './traits/ColorGradeTrait';
export type { ColorGradeConfig } from './traits/ColorGradeTrait';

export { dmxLightingHandler, DMX_LIGHTING_TRAIT } from './traits/DMXLightingTrait';
export type { DMXLightingConfig } from './traits/DMXLightingTrait';

export { directorAIHandler, DIRECTOR_AI_TRAIT } from './traits/DirectorAITrait';
export type { DirectorAIConfig } from './traits/DirectorAITrait';

export { virtualProductionHandler, VIRTUAL_PRODUCTION_TRAIT } from './traits/VirtualProductionTrait';
export type { VirtualProductionConfig } from './traits/VirtualProductionTrait';

export type { HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './traits/types';

import { shotListHandler } from './traits/ShotListTrait';
import { colorGradeHandler } from './traits/ColorGradeTrait';
import { dmxLightingHandler } from './traits/DMXLightingTrait';
import { directorAIHandler } from './traits/DirectorAITrait';
import { virtualProductionHandler } from './traits/VirtualProductionTrait';
import type { TraitHandler } from './traits/types';

export const FILM_VFX_TRAITS: TraitHandler<any>[] = [
  shotListHandler,
  colorGradeHandler,
  dmxLightingHandler,
  directorAIHandler,
  virtualProductionHandler,
];

export function registerFilmVFXPlugin(runtime: unknown): void {
  const rt = runtime as { registerTrait?: (handler: TraitHandler<any>) => void };
  if (typeof rt.registerTrait !== 'function') {
    throw new Error('registerFilmVFXPlugin requires runtime.registerTrait(handler)');
  }
  for (const handler of FILM_VFX_TRAITS) rt.registerTrait(handler);
}

export const FILM_VFX_KEYWORDS = [
  { term: 'shot list', traits: ['shot_list'], spatialRole: 'timeline' },
  { term: 'color grade', traits: ['color_grade'], spatialRole: 'postprocess' },
  { term: 'dmx', traits: ['dmx_lighting'], spatialRole: 'lighting' },
  { term: 'director ai', traits: ['director_ai'], spatialRole: 'workflow' },
  { term: 'virtual production', traits: ['virtual_production'], spatialRole: 'stage' },
];

export const VERSION = '1.0.0';
