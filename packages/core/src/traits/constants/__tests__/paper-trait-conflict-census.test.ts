import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { VR_TRAITS } from '../index';
import { ConfabulationValidator } from '../../../compiler/identity/ConfabulationValidator';
import { ProvenanceSemiring } from '../../../compiler/traits/ProvenanceSemiring';

type PairMode =
  | 'strict_error_bidirectional'
  | 'strict_error_unidirectional'
  | 'domain_override'
  | 'authority_weighted';

interface PairCount {
  mode: PairMode;
  count: number;
}

function normalizeTraitName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

describe('Paper 11 Benchmark: trait conflict census', () => {
  it('enumerates all trait pairs and classifies conflict-resolution mode with JSON export', () => {
    const uniqueTraits = Array.from(new Set(VR_TRAITS.map(normalizeTraitName))).sort();
    const n = uniqueTraits.length;
    const totalPairs = (n * (n - 1)) / 2;

    const validator = new ConfabulationValidator({
      validateConflicts: true,
      validatePrerequisites: false,
      validateRanges: false,
      strict: false,
    });

    const knownTraits = new Set(validator.getRegisteredTraits());

    const conflictMap = new Map<string, Set<string>>();
    for (const trait of uniqueTraits) {
      const schema = validator.getTraitSchema(trait);
      const conflicts = new Set<string>();
      for (const c of schema?.conflictsWith ?? []) {
        conflicts.add(normalizeTraitName(c));
      }
      conflictMap.set(trait, conflicts);
    }

    const domainOverrideSources = new Set(['kinematic', 'physics', 'collidable', 'static']);

    const counts = new Map<PairMode, number>([
      ['strict_error_bidirectional', 0],
      ['strict_error_unidirectional', 0],
      ['domain_override', 0],
      ['authority_weighted', 0],
    ]);

    const samplePairByMode = new Map<PairMode, [string, string]>();

    for (let i = 0; i < uniqueTraits.length; i++) {
      const a = uniqueTraits[i];
      const aConflicts = conflictMap.get(a) ?? new Set<string>();

      for (let j = i + 1; j < uniqueTraits.length; j++) {
        const b = uniqueTraits[j];
        const bConflicts = conflictMap.get(b) ?? new Set<string>();

        const aConflictsB = aConflicts.has(b);
        const bConflictsA = bConflicts.has(a);

        let mode: PairMode;
        if (aConflictsB && bConflictsA) {
          mode = 'strict_error_bidirectional';
        } else if (aConflictsB || bConflictsA) {
          mode = 'strict_error_unidirectional';
        } else if (domainOverrideSources.has(a) || domainOverrideSources.has(b)) {
          mode = 'domain_override';
        } else {
          mode = 'authority_weighted';
        }

        counts.set(mode, (counts.get(mode) ?? 0) + 1);
        if (!samplePairByMode.has(mode)) {
          samplePairByMode.set(mode, [a, b]);
        }
      }
    }

    // Sanity-check semiring behavior for each observed mode via representative samples.
    const semiring = new ProvenanceSemiring();
    const semiringChecks: Array<{
      mode: PairMode;
      pair: [string, string];
      conflicts: number;
      errors: number;
    }> = [];

    for (const mode of counts.keys()) {
      const pair = samplePairByMode.get(mode);
      if (!pair) continue;

      const [a, b] = pair;
      const result = semiring.add([
        {
          name: a,
          config: {
            mass: 1,
            type: 'left',
          },
          context: { authorityLevel: 25 },
        },
        {
          name: b,
          config: {
            mass: 2,
            type: 'right',
          },
          context: { authorityLevel: 100 },
        },
      ]);

      semiringChecks.push({
        mode,
        pair,
        conflicts: result.conflicts.length,
        errors: result.errors.length,
      });
    }

    const modeCounts: PairCount[] = Array.from(counts.entries()).map(([mode, count]) => ({
      mode,
      count,
    }));

    const strictConflictPairs =
      (counts.get('strict_error_bidirectional') ?? 0) +
      (counts.get('strict_error_unidirectional') ?? 0);

    const payload = {
      generatedAt: new Date().toISOString(),
      source:
        'packages/core/src/traits/constants/__tests__/paper-trait-conflict-census.test.ts',
      traitUniverseCount: n,
      knownSchemaTraitCount: uniqueTraits.filter((t) => knownTraits.has(t)).length,
      unknownSchemaTraitCount: uniqueTraits.filter((t) => !knownTraits.has(t)).length,
      totalPairs,
      modeCounts,
      strictConflictPairs,
      strictConflictRate: totalPairs > 0 ? strictConflictPairs / totalPairs : 0,
      samplePairByMode: Object.fromEntries(samplePairByMode.entries()),
      semiringChecks,
      verificationCommand:
        'pnpm --filter @holoscript/core exec vitest run src/traits/constants/__tests__/paper-trait-conflict-census.test.ts',
    };

    const repoRoot = path.resolve(__dirname, '../../../../../../');
    const outFile =
      process.env.PAPER_TRAIT_CONFLICT_CENSUS_OUT ??
      path.join(repoRoot, '.bench-logs', 'paper-trait-conflict-census.json');

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');

    console.log('[paper-trait-conflict-census] trait universe:', payload.traitUniverseCount);
    console.log('[paper-trait-conflict-census] total pairs:', payload.totalPairs);
    console.log(
      '[paper-trait-conflict-census] strict conflict pairs:',
      payload.strictConflictPairs,
      `(${(payload.strictConflictRate * 100).toFixed(3)}%)`
    );
    for (const row of payload.modeCounts) {
      console.log(`[paper-trait-conflict-census] ${row.mode}: ${row.count}`);
    }
    console.log('[paper-trait-conflict-census] JSON artifact:', outFile);

    expect(payload.traitUniverseCount).toBeGreaterThan(0);
    expect(payload.totalPairs).toBeGreaterThan(0);
    expect(payload.modeCounts.reduce((s, r) => s + r.count, 0)).toBe(payload.totalPairs);
    expect(fs.existsSync(outFile)).toBe(true);
  });
});
