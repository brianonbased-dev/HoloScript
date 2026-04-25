/**
 * HoloMap decorator fixture round-trip — Sprint-3 Foundations Phase 3.
 *
 * Closes board task task_1777110746373_ghw9 (follow-up to _xn9o decorator
 * slice). This is the end-to-end gold-standard fixture proving that the
 * Sprint-3 decorator->trait pipeline survives the full
 *   parser  ->  trait resolver  ->  generator  ->  parser
 * round-trip.
 *
 * Why a separate test from the constants/__tests__ slice:
 *   - The Sprint-3 _xn9o test (`packages/core/src/traits/constants/__tests__/
 *     holomap-reconstruction.test.ts`) verifies the decorator->trait MAPPING in
 *     isolation (pure function on a string array).
 *   - This test verifies the COMPOSITION CONTRACT: that real `.holo` source
 *     parses, that the decorators land on the AST in a form the resolver can
 *     consume, and that the generator can emit them back so the file
 *     re-parses to an equivalent decorator set.
 *
 * Fixture lives at `benchmarks/scenarios/05-holomap-reconstruction/
 * holomap-reconstruction.holo` (sibling of the existing 01-04 benchmark
 * scenarios). Path-resolved from this file's directory so renaming the
 * package layout will surface as a clear test failure rather than silent
 * fixture drift.
 *
 * Related:
 *   - `packages/core/src/traits/constants/holomap-reconstruction.ts`
 *   - `packages/core/src/parser/HoloCompositionParser.ts` (parseHolo)
 *   - `packages/core/src/parser/HoloCompositionGenerator.ts` (generateHoloSource)
 *   - `packages/core/src/reconstruction/RFC-HoloMap.md`
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseHolo } from '../../parser/HoloCompositionParser';
import { generateHoloSource } from '../../parser/HoloCompositionGenerator';
import {
  HOLOMAP_RECONSTRUCTION_TRAITS,
  HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES,
  getReconstructionTraitsFromDecorators,
} from '../../traits/constants/holomap-reconstruction';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve to the repo-root benchmarks/scenarios/05-holomap-reconstruction
// fixture. Walk up from packages/core/src/reconstruction/__tests__:
//   ../   reconstruction
//   ../   src
//   ../   core
//   ../   packages
//   ../   <repo root>
const FIXTURE_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'benchmarks',
  'scenarios',
  '05-holomap-reconstruction',
  'holomap-reconstruction.holo',
);

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

/**
 * Strip the `@` prefix that the lexer/parser may keep on a HoloObjectTrait
 * name (the AST is allowed to carry either form; downstream consumers should
 * always be tolerant per `isReconstructionDecorator`).
 */
function stripDecoratorPrefix(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

describe('HoloMap decorator fixture — parser/runtime/export round-trip', () => {
  it('fixture file parses without error', () => {
    const source = loadFixture();
    const result = parseHolo(source);

    expect(result.errors ?? []).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.ast?.type).toBe('Composition');
    expect(result.ast?.name).toBe('HoloMapReconstructionFixture');
  });

  it('fixture declares the two expected nodes', () => {
    const result = parseHolo(loadFixture());
    expect(result.success).toBe(true);

    const objects = result.ast!.objects;
    const names = objects.map((o) => o.name).sort();
    expect(names).toEqual(['DriftOnlyNode', 'ReconstructionSession']);
  });

  it('ReconstructionSession carries the full decorator trio on the AST', () => {
    const result = parseHolo(loadFixture());
    const session = result.ast!.objects.find((o) => o.name === 'ReconstructionSession');

    expect(session).toBeDefined();
    expect(session!.traits.length).toBeGreaterThanOrEqual(3);

    const traitNames = session!.traits.map((t) => stripDecoratorPrefix(t.name));
    expect(traitNames).toContain('reconstruction_source');
    expect(traitNames).toContain('acceptance_video');
    expect(traitNames).toContain('drift_corrected');
  });

  it('DriftOnlyNode carries only the drift_corrected decorator', () => {
    const result = parseHolo(loadFixture());
    const drift = result.ast!.objects.find((o) => o.name === 'DriftOnlyNode');

    expect(drift).toBeDefined();
    const traitNames = drift!.traits.map((t) => stripDecoratorPrefix(t.name));
    expect(traitNames).toEqual(['drift_corrected']);
  });

  it('full-trio resolution covers all 5 underlying HoloMap traits', () => {
    const result = parseHolo(loadFixture());
    const session = result.ast!.objects.find((o) => o.name === 'ReconstructionSession')!;

    const decoratorNames = session.traits.map((t) => stripDecoratorPrefix(t.name));
    const resolvedTraits = getReconstructionTraitsFromDecorators(decoratorNames);

    // Order matters per `getReconstructionTraitsFromDecorators` contract:
    // first-seen order across decorators with dedupe.
    expect(resolvedTraits).toEqual([
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
      'holomap_splat_output',
      'holomap_drift_correction',
    ]);

    // Set-equivalence check against the canonical underlying-trait list — if a
    // future trait gets added to `HOLOMAP_RECONSTRUCTION_TRAITS` without a
    // corresponding decorator update, this assertion forces a re-think rather
    // than silently passing with a missing trait.
    expect(new Set(resolvedTraits)).toEqual(new Set(HOLOMAP_RECONSTRUCTION_TRAITS));
    expect(resolvedTraits).toHaveLength(HOLOMAP_RECONSTRUCTION_TRAITS.length);
  });

  it('drift-only resolution returns just the single drift-correction trait', () => {
    const result = parseHolo(loadFixture());
    const drift = result.ast!.objects.find((o) => o.name === 'DriftOnlyNode')!;

    const decoratorNames = drift.traits.map((t) => stripDecoratorPrefix(t.name));
    const resolvedTraits = getReconstructionTraitsFromDecorators(decoratorNames);
    expect(resolvedTraits).toEqual(['holomap_drift_correction']);
  });

  it('round-trips parse -> generate -> parse with decorator set preserved', () => {
    const original = parseHolo(loadFixture());
    expect(original.success).toBe(true);

    const regenerated = generateHoloSource(original.ast!);
    expect(typeof regenerated).toBe('string');
    expect(regenerated.length).toBeGreaterThan(0);

    const second = parseHolo(regenerated);
    expect(second.errors ?? []).toEqual([]);
    expect(second.success).toBe(true);
    expect(second.ast?.name).toBe('HoloMapReconstructionFixture');

    // Match the decorator set per node by name (order across nodes is not
    // guaranteed because the generator emits objects in array order — but we
    // wrote the fixture with two stable names, so match by name).
    const originalByName = new Map(
      original.ast!.objects.map((o) => [
        o.name,
        new Set(o.traits.map((t) => stripDecoratorPrefix(t.name))),
      ]),
    );
    const secondByName = new Map(
      second.ast!.objects.map((o) => [
        o.name,
        new Set(o.traits.map((t) => stripDecoratorPrefix(t.name))),
      ]),
    );

    expect([...secondByName.keys()].sort()).toEqual([...originalByName.keys()].sort());
    for (const [name, originalDecorators] of originalByName) {
      const roundTrippedDecorators = secondByName.get(name);
      expect(roundTrippedDecorators).toBeDefined();
      // Subset check both ways — full equality is strict but the decorator
      // emission path is meant to be lossless for HoloMap decorators (no
      // arguments to drop). If a future generator change adds extra
      // synthetic traits, this check still surfaces the missing originals.
      for (const decorator of originalDecorators) {
        expect(roundTrippedDecorators!.has(decorator)).toBe(true);
      }
      for (const decorator of roundTrippedDecorators!) {
        expect(originalDecorators.has(decorator)).toBe(true);
      }
    }
  });

  it('round-trip preserves resolved trait set on the multi-decorator node', () => {
    const original = parseHolo(loadFixture());
    const regenerated = generateHoloSource(original.ast!);
    const second = parseHolo(regenerated);

    const session = second.ast!.objects.find((o) => o.name === 'ReconstructionSession')!;
    const decoratorNames = session.traits.map((t) => stripDecoratorPrefix(t.name));
    const resolvedTraits = getReconstructionTraitsFromDecorators(decoratorNames);

    expect(new Set(resolvedTraits)).toEqual(new Set(HOLOMAP_RECONSTRUCTION_TRAITS));
  });

  it('every decorator in the fixture is one of the canonical Sprint-3 names', () => {
    // Belt-and-suspenders: if an agent adds a typo'd decorator to the fixture
    // (e.g. `@reconstruction_sources`), the parser will accept it as an
    // unknown trait and the resolver will silently skip it. This test fails
    // FAST in that case rather than letting the resolution test pass with a
    // surprising result.
    const result = parseHolo(loadFixture());
    const allDecoratorsInFixture = new Set<string>();
    for (const obj of result.ast!.objects) {
      for (const trait of obj.traits) {
        allDecoratorsInFixture.add(stripDecoratorPrefix(trait.name));
      }
    }

    const canonicalSet = new Set<string>(HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES);
    for (const used of allDecoratorsInFixture) {
      expect(canonicalSet.has(used)).toBe(true);
    }
  });
});
