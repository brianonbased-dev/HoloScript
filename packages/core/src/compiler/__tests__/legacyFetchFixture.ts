import type { HoloComposition, HoloObjectDecl, HoloObjectTrait } from '../../parser/HoloCompositionTypes';

const trait = (name: string, config: HoloObjectTrait['config']): HoloObjectTrait => ({ type: 'ObjectTrait', name, config });
const obj = (name: string, traits: HoloObjectTrait[], children: HoloObjectDecl[] = []): HoloObjectDecl => ({
  type: 'Object', name, properties: [], traits, children,
});

/** A pre-r3 panel: two plain @fetch traits (no `status`), one with extra legacy-ignored keys. */
export function legacyFetchComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'LegacyFetchProbe',
    objects: [
      obj('Root', [trait('fetch', { into: 'items', endpoint: '/api/x' })], [
        obj('Row', [trait('each', { state: 'items', as: 'it' })], [
          obj('Label', [trait('text', { variant: 'caption' }), trait('bind', { state: 'it', path: 'name' })]),
        ]),
        obj('Poster', [trait('fetch', { into: 'posted', endpoint: '/api/y', method: 'POST' })]),
      ]),
    ],
    templates: [], spatialGroups: [], lights: [], imports: [], timelines: [], audio: [], zones: [],
    transitions: [], conditionals: [], iterators: [], npcs: [], quests: [], abilities: [], dialogues: [],
    stateMachines: [], achievements: [], talentTrees: [], shapes: [],
  } as HoloComposition;
}