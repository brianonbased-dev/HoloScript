import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as constants from '../index';
import { VR_TRAITS } from '../index';
import { ConfabulationValidator } from '../../../compiler/identity/ConfabulationValidator';

type PairMode =
  | 'strict_error_bidirectional'
  | 'strict_error_unidirectional'
  | 'domain_override'
  | 'authority_weighted';

interface FamilyPairCount {
  familyA: string;
  familyB: string;
  totalPairs: number;
  strictBidirectional: number;
  strictUnidirectional: number;
  domainOverride: number;
  authorityWeighted: number;
}

function normalizeTraitName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

function normalizeFamilyFromExport(exportName: string): string {
  return exportName
    .replace(/_TRAITS$/, '')
    .toLowerCase();
}

function pairKey(a: string, b: string): string {
  return a <= b ? `${a}__${b}` : `${b}__${a}`;
}

describe('Paper 11 Benchmark: trait conflict family census', () => {
  it('aggregates pairwise resolution modes by trait family and exports JSON', () => {
    const uniqueTraits = Array.from(new Set(VR_TRAITS.map(normalizeTraitName))).sort();

    const traitFamilies = new Map<string, Set<string>>();

    for (const [key, value] of Object.entries(constants)) {
      if (!key.endsWith('_TRAITS') || key === 'VR_TRAITS') continue;
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) continue;

      const family = normalizeFamilyFromExport(key);
      for (const t of value) {
        const trait = normalizeTraitName(t);
        if (!traitFamilies.has(trait)) traitFamilies.set(trait, new Set());
        traitFamilies.get(trait)!.add(family);
      }
    }

    const primaryFamily = (trait: string): string => {
      const families = Array.from(traitFamilies.get(trait) ?? []);
      if (families.length === 0) return 'uncategorized';
      return families.sort()[0];
    };

    const validator = new ConfabulationValidator({
      validateConflicts: true,
      validatePrerequisites: false,
      validateRanges: false,
      strict: false,
    });

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

    const familyCounts = new Map<string, FamilyPairCount>();

    const bump = (familyA: string, familyB: string, mode: PairMode) => {
      const key = pairKey(familyA, familyB);
      if (!familyCounts.has(key)) {
        const [a, b] = familyA <= familyB ? [familyA, familyB] : [familyB, familyA];
        familyCounts.set(key, {
          familyA: a,
          familyB: b,
          totalPairs: 0,
          strictBidirectional: 0,
          strictUnidirectional: 0,
          domainOverride: 0,
          authorityWeighted: 0,
        });
      }

      const row = familyCounts.get(key)!;
      row.totalPairs += 1;
      switch (mode) {
        case 'strict_error_bidirectional':
          row.strictBidirectional += 1;
          break;
        case 'strict_error_unidirectional':
          row.strictUnidirectional += 1;
          break;
        case 'domain_override':
          row.domainOverride += 1;
          break;
        case 'authority_weighted':
          row.authorityWeighted += 1;
          break;
      }
    };

    for (let i = 0; i < uniqueTraits.length; i++) {
      const a = uniqueTraits[i];
      const aConflicts = conflictMap.get(a) ?? new Set<string>();
      const fa = primaryFamily(a);

      for (let j = i + 1; j < uniqueTraits.length; j++) {
        const b = uniqueTraits[j];
        const bConflicts = conflictMap.get(b) ?? new Set<string>();
        const fb = primaryFamily(b);

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

        bump(fa, fb, mode);
      }
    }

    const rows = Array.from(familyCounts.values());
    const topByStrict = [...rows]
      .sort((x, y) => {
        const sx = x.strictBidirectional + x.strictUnidirectional;
        const sy = y.strictBidirectional + y.strictUnidirectional;
        return sy - sx;
      })
      .slice(0, 25);

    const topByDomainOverride = [...rows]
      .sort((x, y) => y.domainOverride - x.domainOverride)
      .slice(0, 25);

    const payload = {
      generatedAt: new Date().toISOString(),
      source:
        'packages/core/src/traits/constants/__tests__/paper-trait-conflict-families.test.ts',
      traitUniverseCount: uniqueTraits.length,
      familyPairRows: rows.length,
      topByStrict,
      topByDomainOverride,
      verificationCommand:
        'pnpm --filter @holoscript/core exec vitest run src/traits/constants/__tests__/paper-trait-conflict-families.test.ts',
    };

    const repoRoot = path.resolve(__dirname, '../../../../../../');
    const requestedOutFile =
      process.env.PAPER_TRAIT_CONFLICT_FAMILIES_OUT ??
      path.join(repoRoot, '.bench-logs', 'paper-trait-conflict-families.json');

    let writtenOutFile = requestedOutFile;
    try {
      fs.mkdirSync(path.dirname(requestedOutFile), { recursive: true });
      fs.writeFileSync(requestedOutFile, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // Some Windows environments intermittently fail writing into repo-root .bench-logs.
      // Fallback keeps benchmark/test deterministic while still emitting an artifact.
      const fallbackOutFile = path.join(
        process.cwd(),
        '.bench-logs',
        'paper-trait-conflict-families.json'
      );
      fs.mkdirSync(path.dirname(fallbackOutFile), { recursive: true });
      fs.writeFileSync(fallbackOutFile, JSON.stringify(payload, null, 2), 'utf8');
      writtenOutFile = fallbackOutFile;
    }

    console.log('[paper-trait-conflict-families] trait universe:', payload.traitUniverseCount);
    console.log('[paper-trait-conflict-families] family pair rows:', payload.familyPairRows);
    console.log('[paper-trait-conflict-families] top strict rows:', payload.topByStrict.length);
    console.log('[paper-trait-conflict-families] top domain-override rows:', payload.topByDomainOverride.length);
    console.log('[paper-trait-conflict-families] JSON artifact:', writtenOutFile);

    expect(payload.traitUniverseCount).toBeGreaterThan(0);
    expect(payload.familyPairRows).toBeGreaterThan(0);
    expect(fs.existsSync(writtenOutFile)).toBe(true);
  });
});
