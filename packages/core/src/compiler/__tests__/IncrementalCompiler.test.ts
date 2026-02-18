import { describe, it, expect, beforeEach } from 'vitest';
import { IncrementalCompiler } from '../IncrementalCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

/**
 * Build a minimal HoloComposition.
 */
function makeComposition(
  name: string,
  objects: HoloObjectDecl[] = []
): HoloComposition {
  return {
    type: 'Composition',
    name,
    templates: [],
    objects,
    spatialGroups: [],
    lights: [],
    animations: [],
    triggers: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  } as HoloComposition;
}

function makeObject(
  name: string,
  props: Array<{ key: string; value: unknown }> = [],
  traits: Array<string | { name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: props.map(p => ({ type: 'ObjectProperty', ...p })),
    traits,
    children: [],
  } as unknown as HoloObjectDecl;
}

/** Simple compileObject stub that returns a string representation. */
function compileObject(obj: HoloObjectDecl): string {
  return `compiled:${obj.name}`;
}

describe('IncrementalCompiler', () => {
  let compiler: IncrementalCompiler;

  beforeEach(() => {
    compiler = new IncrementalCompiler();
  });

  // =========== diff ===========

  it('diff returns no changes for identical ASTs', () => {
    const comp = makeComposition('Scene', [makeObject('Cube')]);
    const diff = compiler.diff(comp, comp);
    expect(diff.hasChanges).toBe(false);
    expect(diff.changes).toHaveLength(0);
  });

  it('diff detects added objects', () => {
    const oldComp = makeComposition('Scene', [makeObject('A')]);
    const newComp = makeComposition('Scene', [makeObject('A'), makeObject('B')]);
    const diff = compiler.diff(oldComp, newComp);
    expect(diff.hasChanges).toBe(true);
    expect(diff.addedObjects).toContain('B');
  });

  it('diff detects removed objects', () => {
    const oldComp = makeComposition('Scene', [makeObject('A'), makeObject('B')]);
    const newComp = makeComposition('Scene', [makeObject('A')]);
    const diff = compiler.diff(oldComp, newComp);
    expect(diff.hasChanges).toBe(true);
    expect(diff.removedObjects).toContain('B');
  });

  it('diff detects modified object properties', () => {
    const oldComp = makeComposition('Scene', [
      makeObject('Cube', [{ key: 'color', value: 'red' }]),
    ]);
    const newComp = makeComposition('Scene', [
      makeObject('Cube', [{ key: 'color', value: 'blue' }]),
    ]);
    const diff = compiler.diff(oldComp, newComp);
    expect(diff.hasChanges).toBe(true);
    expect(diff.modifiedObjects).toContain('Cube');
  });

  it('diff detects unchanged objects', () => {
    const oldComp = makeComposition('Scene', [
      makeObject('Cube', [{ key: 'color', value: 'red' }]),
      makeObject('Sphere'),
    ]);
    const newComp = makeComposition('Scene', [
      makeObject('Cube', [{ key: 'color', value: 'blue' }]),
      makeObject('Sphere'),
    ]);
    const diff = compiler.diff(oldComp, newComp);
    expect(diff.unchangedObjects).toContain('Sphere');
  });

  it('diff from null is full recompile', () => {
    const newComp = makeComposition('Scene', [makeObject('A')]);
    const diff = compiler.diff(null, newComp);
    expect(diff.hasChanges).toBe(true);
    expect(diff.addedObjects).toContain('A');
  });

  // =========== compile (incremental) ===========

  it('compile results in full recompile on first call', () => {
    const comp = makeComposition('Scene', [makeObject('Box')]);
    const result = compiler.compile(comp, compileObject);
    expect(result.fullRecompile).toBe(true);
    expect(result.recompiledObjects).toContain('Box');
    expect(typeof result.compiledCode).toBe('string');
    expect(result.compiledCode).toContain('compiled:Box');
  });

  it('incremental compile detects cached objects', () => {
    const comp1 = makeComposition('Scene', [
      makeObject('Box', [{ key: 'size', value: 1 }]),
      makeObject('Sphere'),
    ]);
    compiler.compile(comp1, compileObject);

    // Second compile with only Box changed
    const comp2 = makeComposition('Scene', [
      makeObject('Box', [{ key: 'size', value: 2 }]),
      makeObject('Sphere'),
    ]);
    const result = compiler.compile(comp2, compileObject);
    expect(result.fullRecompile).toBe(false);
    expect(result.cachedObjects).toContain('Sphere');
    expect(result.recompiledObjects).toContain('Box');
  });

  // =========== extractTraitUsages ===========

  it('extracts trait usages from string traits', () => {
    const result = (compiler as any).extractTraitUsages(['physics', 'collidable']);
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('physics');
    expect(result[1].name).toBe('collidable');
  });

  it('extracts trait usages from object traits', () => {
    const result = (compiler as any).extractTraitUsages([
      { name: 'physics', config: { mass: 5 } },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('physics');
    expect(result[0].configHash).toBeDefined();
  });

  // =========== serialization ===========

  it('serialize/deserialize roundtrip', () => {
    const comp = makeComposition('Scene', [makeObject('A'), makeObject('B')]);
    compiler.compile(comp, compileObject);

    const json = compiler.serialize();
    expect(typeof json).toBe('string');

    const restored = IncrementalCompiler.deserialize(json);
    expect(restored).toBeInstanceOf(IncrementalCompiler);
  });

  // =========== collectObjectNames ===========

  it('collects all object names from composition', () => {
    const comp = makeComposition('S', [makeObject('X'), makeObject('Y'), makeObject('Z')]);
    const names = (compiler as any).collectObjectNames(comp);
    expect(names).toContain('X');
    expect(names).toContain('Y');
    expect(names).toContain('Z');
    expect(names.length).toBe(3);
  });

  // =========== forceRecompile option ===========

  it('force recompile bypasses cache', () => {
    const comp = makeComposition('Scene', [makeObject('A')]);
    compiler.compile(comp, compileObject);

    const result = compiler.compile(comp, compileObject, { forceRecompile: ['A'] });
    expect(result.recompiledObjects).toContain('A');
  });
});
