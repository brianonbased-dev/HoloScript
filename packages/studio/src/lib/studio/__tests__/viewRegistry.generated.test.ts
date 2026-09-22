import { describe, it, expect } from 'vitest';
import {
  GENERATED_VIEW_IDS,
  GENERATED_VIEW_REGISTRY,
  GENERATED_VIEW_SLOTS,
} from '../viewRegistry.generated';
import { VIEW_COMPONENTS } from '../viewRegistry.components';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const;

function resolveAliasImport(importPath: string): string {
  expect(importPath.startsWith('@/'), `slot.import '${importPath}' uses @ alias`).toBe(true);
  const base = join(process.cwd(), 'src', importPath.slice(2));
  for (const ext of EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not resolve ${importPath}`);
}

function hasNamedExport(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    new RegExp(`export\\s+(function|const|class)\\s+${escaped}\\b`).test(source) ||
    new RegExp(`export\\s+\\{[^}]*\\b${escaped}\\b`).test(source)
  );
}

/**
 * INVARIANTS OF THE GENERATED REGISTRY.
 *
 * This file used to pin the generated output against the hand-maintained
 * STUDIO_VIEW_REGISTRY, and said "if a .holo drifts from the hand-TS source,
 * this fails". That was true until the hand-TS maps were deleted -- the very
 * migration this test was written to license. `STUDIO_VIEW_REGISTRY` is now
 * literally `GENERATED_VIEW_REGISTRY` (viewRegistry.ts), and `getStudioView()`
 * indexes a map built from that same array, so four of the six assertions here
 * were comparing one array to itself.
 *
 * Measured 2026-09-22: a wrong regeneration (one view's title changed to
 * 'ZZ WRONG TITLE') left all four of them GREEN. That matters for this branch
 * specifically, because a wrong regeneration is exactly what happened in it --
 * written by 1c618045d and corrected by 2b4f8e31a -- and this was the test that
 * was supposed to notice.
 *
 * Byte-level agreement between the generator and its committed output is not
 * this file's job: `viewreg:check` does that, and pre-push now runs it. What a
 * unit test can add is the set of PROPERTIES the generator is supposed to
 * guarantee, each of which can go red on its own.
 */
describe('viewRegistry.generated — invariants of the generated registry', () => {
  it('the id list and the registry agree, in order', () => {
    // Two SEPARATE exports of the same generator. Nothing else compares them, and
    // the StudioViewId literal union is derived from GENERATED_VIEW_IDS while
    // every lookup goes through GENERATED_VIEW_REGISTRY -- so a generator that
    // emitted them inconsistently would produce ids that type-check and resolve
    // to nothing.
    expect(GENERATED_VIEW_REGISTRY.length).toBeGreaterThan(0);
    expect([...GENERATED_VIEW_IDS]).toEqual(GENERATED_VIEW_REGISTRY.map((v) => v.id));
  });

  it('every view id is unique', () => {
    const ids = GENERATED_VIEW_REGISTRY.map((v) => v.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)], `duplicate view ids: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
  });

  it('exclusiveWith is symmetric and every id it names exists', () => {
    // Generalises the hardcoded timeline/shaderEditor pair below into the rule it
    // is an instance of. A one-sided exclusion means one view can evict another
    // that will happily re-open on top of it.
    const byId = new Map(GENERATED_VIEW_REGISTRY.map((v) => [v.id, v]));
    const asymmetric: string[] = [];
    const dangling: string[] = [];
    for (const v of GENERATED_VIEW_REGISTRY) {
      for (const other of v.exclusiveWith ?? []) {
        const target = byId.get(other);
        if (!target) {
          dangling.push(`${v.id} -> ${other}`);
          continue;
        }
        if (!(target.exclusiveWith ?? []).includes(v.id)) asymmetric.push(`${v.id} -> ${other}`);
      }
    }
    expect(dangling, `exclusiveWith names a view that does not exist: ${dangling.join(', ')}`).toEqual([]);
    expect(asymmetric, `exclusiveWith is one-sided: ${asymmetric.join(', ')}`).toEqual([]);
  });

  it('no two views answer to the same activation command', () => {
    // I wrote this test as a check on a numeric `order` field first. There is no
    // such field on StudioViewDefinition -- the curated order is array position,
    // and `order` appears only in the generator's console output. Every `v.order`
    // was `undefined`, so the assertion could never fire: a check that cannot
    // fail, written inside the commit that exists to remove them. Caught by
    // trying to plant a fault and finding there was nothing to plant.
    //
    // This is the real invariant in the same spirit. Two views sharing an
    // activationCommand means one keystroke resolves to whichever the lookup
    // happens to reach first.
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const v of GENERATED_VIEW_REGISTRY) {
      const cmd = v.activationCommand;
      if (!cmd) continue;
      const first = seen.get(cmd);
      if (first) collisions.push(`${cmd} (${first} and ${v.id})`);
      else seen.set(cmd, v.id);
    }
    expect(collisions, `two views share an activation command: ${collisions.join(', ')}`).toEqual([]);
  });

  it('round-trips the relational exclusiveWith field (the premortem ceiling test)', () => {
    const timeline = GENERATED_VIEW_REGISTRY.find((v) => v.id === 'timeline');
    const shaderEditor = GENERATED_VIEW_REGISTRY.find((v) => v.id === 'shaderEditor');
    expect(timeline?.exclusiveWith).toEqual(['shaderEditor']);
    expect(shaderEditor?.exclusiveWith).toEqual(['timeline']);
  });

  it('declares one component mount for every generated view', () => {
    expect(Object.keys(GENERATED_VIEW_SLOTS).sort()).toEqual([...GENERATED_VIEW_IDS].sort());

    for (const id of GENERATED_VIEW_IDS) {
      const slot = GENERATED_VIEW_SLOTS[id];
      expect(slot, `slot for '${id}'`).toBeTruthy();
      expect(slot.component, `slot.component for '${id}'`).toBeTruthy();
      expect(slot.import.startsWith('@/'), `slot.import for '${id}'`).toBe(true);
      expect(VIEW_COMPONENTS[id], `VIEW_COMPONENTS['${id}']`).toBeTruthy();

      const source = readFileSync(resolveAliasImport(slot.import), 'utf8');
      expect(
        hasNamedExport(source, slot.component),
        `${slot.import} exports ${slot.component}`
      ).toBe(true);
    }
  });
});
