/**
 * Slice-5 compile surface: the two runtime-backed companionship traits are
 * RECOGNIZED by the SceneIR compiler (structured props, no unrecognized
 * flag), while the five registration-only companionship traits are honestly
 * tracked in __unrecognizedTraits until their runtime slices land.
 */
import { describe, expect, it } from 'vitest';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';
import { SceneIRCompiler, type R3FNode } from '../SceneIRCompiler';

function minimalComposition(overrides: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'DaimonEmbodimentTest',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    worlds: [],
    domainBlocks: [],
    ...overrides,
  } as HoloComposition;
}

function companionObject(): HoloObjectDecl {
  const traits = [
    'companion_presence',
    'affect_state',
    'rapport',
    'relational_memory',
    'voice_loop',
    'copresence',
    'flourishing_guard',
  ].map((name) => ({ type: 'ObjectTrait' as const, name, config: {} }));
  return {
    type: 'Object',
    name: 'Companion',
    properties: [],
    traits,
  } as unknown as HoloObjectDecl;
}

function collectProps(root: R3FNode): Record<string, unknown> | undefined {
  const stack: R3FNode[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    const props = n.props as Record<string, unknown> | undefined;
    if (
      props &&
      ('companionPresence' in props ||
        'affectState' in props ||
        '__unrecognizedTraits' in props)
    ) {
      return props;
    }
    for (const c of n.children ?? []) stack.push(c);
  }
  return undefined;
}

describe('SceneIRCompiler — companionship trait recognition (slice 5)', () => {
  const compiler = new SceneIRCompiler({});

  it('recognizes companion_presence and affect_state as structured props', () => {
    const root = compiler.compileComposition(
      minimalComposition({ objects: [companionObject()] })
    );
    const props = collectProps(root);
    expect(props).toBeDefined();
    expect(props!.companionPresence).toBeTruthy();
    expect(props!.affectState).toBeTruthy();
    expect(props!.expressionChannel).toBe(true);
    const unrecognized = (props!.__unrecognizedTraits as string[] | undefined) ?? [];
    expect(unrecognized).not.toContain('companion_presence');
    expect(unrecognized).not.toContain('affect_state');
  });

  it('honestly flags the five registration-only companionship traits', () => {
    const root = compiler.compileComposition(
      minimalComposition({ objects: [companionObject()] })
    );
    const props = collectProps(root);
    const unrecognized = (props!.__unrecognizedTraits as string[] | undefined) ?? [];
    for (const owed of [
      'rapport',
      'relational_memory',
      'voice_loop',
      'copresence',
      'flourishing_guard',
    ]) {
      expect(unrecognized).toContain(owed);
    }
  });
});
