import { describe, it, expect } from 'vitest';
import { diffState, buildMigrationChain, snapshotState, applyAutoMigration } from '../SchemaDiff';

function makeState(props: Array<{ key: string; value: any; reactive?: boolean }>) {
  return {
    properties: props.map((p) => ({ ...p, type: 'StateProperty', reactive: p.reactive ?? true })),
  };
}

describe('SchemaDiff', () => {
  // diffState
  it('no changes when states are identical', () => {
    const s = makeState([{ key: 'x', value: 10 }]);
    const result = diffState(s, s);
    expect(result.hasChanges).toBe(false);
    expect(result.summary).toBe('no changes');
  });

  it('detects added fields', () => {
    const old = makeState([{ key: 'x', value: 1 }]);
    const next = makeState([
      { key: 'x', value: 1 },
      { key: 'y', value: 2 },
    ]);
    const result = diffState(old, next);
    expect(result.added.length).toBe(1);
    expect(result.added[0].key).toBe('y');
  });

  it('detects removed fields', () => {
    const old = makeState([
      { key: 'x', value: 1 },
      { key: 'y', value: 2 },
    ]);
    const next = makeState([{ key: 'x', value: 1 }]);
    const result = diffState(old, next);
    expect(result.removed.length).toBe(1);
    expect(result.removed[0].key).toBe('y');
  });

  it('detects type changes and marks requiresMigration', () => {
    const old = makeState([{ key: 'x', value: 10 }]);
    const next = makeState([{ key: 'x', value: 'ten' }]);
    const result = diffState(old, next);
    expect(result.typeChanged.length).toBe(1);
    expect(result.requiresMigration).toBe(true);
  });

  it('detects default value changes', () => {
    const old = makeState([{ key: 'x', value: 1 }]);
    const next = makeState([{ key: 'x', value: 5 }]);
    const result = diffState(old, next);
    expect(result.defaultChanged.length).toBe(1);
    expect(result.requiresMigration).toBe(false);
  });

  it('detects reactive flag changes', () => {
    const old = makeState([{ key: 'x', value: 1, reactive: true }]);
    const next = makeState([{ key: 'x', value: 1, reactive: false }]);
    const result = diffState(old, next);
    expect(result.reactiveChanged.length).toBe(1);
  });

  it('handles undefined old state', () => {
    const next = makeState([{ key: 'x', value: 1 }]);
    const result = diffState(undefined, next);
    expect(result.added.length).toBe(1);
  });

  it('handles undefined new state', () => {
    const old = makeState([{ key: 'x', value: 1 }]);
    const result = diffState(old, undefined);
    expect(result.removed.length).toBe(1);
  });

  it('summary includes field counts', () => {
    const old = makeState([{ key: 'a', value: 1 }]);
    const next = makeState([{ key: 'b', value: 2 }]);
    const result = diffState(old, next);
    expect(result.summary).toContain('+1 added');
    expect(result.summary).toContain('-1 removed');
  });

  it('compares arrays by deep equality', () => {
    const old = makeState([{ key: 'pos', value: [1, 2, 3] }]);
    const same = makeState([{ key: 'pos', value: [1, 2, 3] }]);
    const diff = makeState([{ key: 'pos', value: [1, 2, 4] }]);
    expect(diffState(old, same).hasChanges).toBe(false);
    expect(diffState(old, diff).defaultChanged.length).toBe(1);
  });

  it('compares objects by deep equality', () => {
    const old = makeState([{ key: 'cfg', value: { a: 1, b: 'x' } }]);
    const same = makeState([{ key: 'cfg', value: { a: 1, b: 'x' } }]);
    expect(diffState(old, same).hasChanges).toBe(false);
  });

  // buildMigrationChain
  it('builds linear migration chain', () => {
    const template = {
      migrations: [
        { fromVersion: 1, body: 'step1' },
        { fromVersion: 2, body: 'step2' },
      ],
    } as any;
    const chain = buildMigrationChain(template, 1, 3);
    expect(chain).not.toBeNull();
    expect(chain!.steps.length).toBe(2);
    expect(chain!.fromVersion).toBe(1);
    expect(chain!.toVersion).toBe(3);
  });

  it('returns null for gap in migration chain', () => {
    const template = {
      migrations: [{ fromVersion: 1, body: 'step1' }],
    } as any;
    const chain = buildMigrationChain(template, 1, 3);
    expect(chain).toBeNull();
  });

  it('returns null when no migrations exist', () => {
    expect(buildMigrationChain({} as any, 1, 2)).toBeNull();
  });

  // snapshotState
  it('snapshots deep clone values', () => {
    const original = new Map<string, any>([
      ['arr', [1, 2, 3]],
      ['num', 42],
    ]);
    const snap = snapshotState(original);
    expect(snap.get('arr')).toEqual([1, 2, 3]);
    expect(snap.get('num')).toBe(42);
    (original.get('arr') as number[]).push(4);
    expect(snap.get('arr')).toEqual([1, 2, 3]); // not mutated
  });

  // applyAutoMigration
  it('applies added fields', () => {
    const state = new Map<string, any>();
    const diff = diffState(makeState([]), makeState([{ key: 'newField', value: 42 }]));
    applyAutoMigration(state, diff, new Map());
    expect(state.get('newField')).toBe(42);
  });

  it('removes dropped fields', () => {
    const state = new Map<string, any>([['old', 1]]);
    const diff = diffState(makeState([{ key: 'old', value: 1 }]), makeState([]));
    applyAutoMigration(state, diff, new Map());
    expect(state.has('old')).toBe(false);
  });

  it('updates defaults when instance holds old default', () => {
    const state = new Map<string, any>([['x', 1]]);
    const diff = diffState(
      makeState([{ key: 'x', value: 1 }]),
      makeState([{ key: 'x', value: 99 }])
    );
    const oldDefaults = new Map<string, any>([['x', 1]]);
    applyAutoMigration(state, diff, oldDefaults);
    expect(state.get('x')).toBe(99);
  });
});
