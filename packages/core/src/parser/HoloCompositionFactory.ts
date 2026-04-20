import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloLogic,
  HoloEventHandler,
  HoloAction,
  HoloStatement,
  HoloExpression,
  HoloValue,
  PlatformConstraint,
  SourceRange
} from './HoloCompositionTypes';

export const factory = {
  composition(
    name: string,
    objects: HoloObjectDecl[] = [],
    spatialGroups: HoloSpatialGroup[] = [],
    options: Partial<Omit<HoloComposition, 'type' | 'name' | 'objects' | 'spatialGroups'>> = {}
  ): HoloComposition {
    return {
      type: 'Composition',
      name,
      objects,
      spatialGroups,
      templates: options.templates || [],
      lights: options.lights || [],
      imports: options.imports || [],
      timelines: options.timelines || [],
      audio: options.audio || [],
      zones: options.zones || [],
      transitions: options.transitions || [],
      conditionals: options.conditionals || [],
      iterators: options.iterators || [],
      npcs: options.npcs || [],
      quests: options.quests || [],
      abilities: options.abilities || [],
      dialogues: options.dialogues || [],
      stateMachines: options.stateMachines || [],
      achievements: options.achievements || [],
      talentTrees: options.talentTrees || [],
      shapes: options.shapes || [],
      ...options
    };
  },

  node(
    name: string,
    traits: HoloObjectTrait[] = [],
    options: Partial<Omit<HoloObjectDecl, 'type' | 'name' | 'traits'>> = {}
  ): HoloObjectDecl {
    return {
      type: 'Object',
      name,
      traits,
      properties: options.properties || [],
      ...options
    };
  },

  trait(
    name: string,
    config: Record<string, HoloValue> = {},
    args?: HoloValue[]
  ): HoloObjectTrait {
    return {
      type: 'ObjectTrait',
      name,
      config,
      args
    };
  },

  spatialGroup(
    name: string,
    objects: HoloObjectDecl[] = [],
    options: Partial<Omit<HoloSpatialGroup, 'type' | 'name' | 'objects'>> = {}
  ): HoloSpatialGroup {
    return {
      type: 'SpatialGroup',
      name,
      objects,
      properties: options.properties || [],
      ...options
    };
  },
  
  logic(handlers: HoloEventHandler[] = [], actions: HoloAction[] = []): HoloLogic {
    return {
      type: 'Logic',
      handlers,
      actions
    };
  }
};
