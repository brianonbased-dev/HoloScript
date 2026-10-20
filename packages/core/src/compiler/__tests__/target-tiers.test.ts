/**
 * target-tiers — every export target's label must be exactly what its evidence on disk earns.
 *
 * The first test runs the audit against the real repository, so a deleted device proof, a golden
 * test that lands on the known-failures list, or a test that stops naming its compiler turns this
 * red. The planted-fault tests prove the audit can go red at all: each feeds it one false label.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TARGET_TIERS,
  TIER_MEANING,
  auditTargetTiers,
  describeTargetLimits,
  earnedTier,
  targetTier,
  type TargetTierEntry,
  type TierAuditIO,
} from '../target-tiers';
import { SOVEREIGN_TARGETS, BRIDGE_TARGETS, NATIVE_COMPILE_MODES } from '../sovereign-targets';

const repoRoot = resolve(__dirname, '../../../../..');

function knownFailingTests(): Set<string> {
  const baseline = JSON.parse(
    readFileSync(resolve(repoRoot, 'packages/core/test-baseline.json'), 'utf8')
  ) as { stableFailures?: { tests?: string[] } };
  const files = new Set<string>();
  for (const entry of baseline.stableFailures?.tests ?? []) {
    // Entries look like "src/compiler/__tests__/x.test.ts > suite > case" or "... [ file ]".
    const file = entry.split(/ > | \[ /)[0].trim();
    files.add(`packages/core/${file}`);
  }
  return files;
}

const realIO: TierAuditIO = {
  exists: (p) => existsSync(resolve(repoRoot, p)),
  read: (p) => readFileSync(resolve(repoRoot, p), 'utf8'),
  knownFailingTests: knownFailingTests(),
};

const ANDROID = TARGET_TIERS.android as TargetTierEntry;

describe('target tiers', () => {
  it('every label in the repo is exactly what its evidence earns', () => {
    expect(auditTargetTiers(realIO)).toEqual([]);
  });

  it('labels every export target the sovereignty registry knows', () => {
    const all = [...SOVEREIGN_TARGETS, ...BRIDGE_TARGETS, ...NATIVE_COMPILE_MODES].sort();
    expect(Object.keys(TARGET_TIERS).sort()).toEqual(all);
  });

  it('only Android is proven on a device today', () => {
    const reference = Object.entries(TARGET_TIERS)
      .filter(([, e]) => e.tier === 'reference')
      .map(([t]) => t)
      .sort();
    expect(reference).toEqual(['android']);
  });

  it('gives every tier and every target a plain-language sentence', () => {
    for (const meaning of Object.values(TIER_MEANING)) expect(meaning.length).toBeGreaterThan(20);
    for (const target of Object.keys(TARGET_TIERS)) {
      expect(describeTargetLimits(target).length).toBeGreaterThan(10);
    }
    expect(targetTier('not-a-target')).toBeUndefined();
    expect(describeTargetLimits('not-a-target')).toMatch(/Not labelled/);
  });

  describe('planted faults go red', () => {
    const audit = (entry: TargetTierEntry) => auditTargetTiers(realIO, { planted: entry });

    it('production claimed with no golden test or proof', () => {
      const out = audit({
        ...ANDROID,
        tier: 'production',
        golden: undefined,
        runtimeProof: undefined,
        referenceApp: undefined,
      });
      expect(out.join('\n')).toMatch(
        /labelled production but its evidence earns preview \(overclaim\)/
      );
    });

    it('a test that never imports the compiler', () => {
      const out = audit({
        ...ANDROID,
        tests: ['packages/core/src/compiler/__tests__/sovereign-targets.test.ts'],
      });
      expect(out.join('\n')).toMatch(/never imports AndroidCompiler/);
    });

    it('a test that only mocks the compiler', () => {
      const out = audit({
        ...(TARGET_TIERS.usdz as TargetTierEntry),
        tests: ['packages/core/src/compiler/__tests__/ExportManager.test.ts'],
      });
      expect(out.join('\n')).toMatch(/never imports USDZExportCompiler/);
    });

    it('a reference app named only as a prefix of the compared folder', () => {
      const QUEST = TARGET_TIERS.quest as TargetTierEntry;
      for (const app of [
        'apps/quest-universal-qr-scanner',
        'apps/quest-universal-qr-scanner/andr',
      ]) {
        const out = audit({ ...QUEST, referenceApp: app });
        expect(out.join('\n'), app).toMatch(/does not compare against/);
      }
    });

    it('a device proof whose quote was edited away', () => {
      const out = audit({
        ...ANDROID,
        runtimeProof: { ...ANDROID.runtimeProof!, quote: 'this sentence is not in the README' },
      });
      expect(out.join('\n')).toMatch(/no longer says/);
    });

    it('a golden test on the known-failures list is flagged', () => {
      const io: TierAuditIO = {
        ...realIO,
        knownFailingTests: new Set([ANDROID.golden!]),
      };
      const out = auditTargetTiers(io, { planted: ANDROID });
      expect(out.join('\n')).toMatch(/known-failures list, so it pins nothing/);
    });

    it('a stale label below its evidence', () => {
      const out = audit({ ...ANDROID, tier: 'preview' });
      expect(out.join('\n')).toMatch(/stale label/);
    });

    it('format-only with no test', () => {
      const out = audit({ ...ANDROID, tier: 'format-only', tests: [] });
      expect(out.join('\n')).toMatch(/format-only but no test checks it/);
    });

    it('a missing compiler file', () => {
      const out = audit({ ...ANDROID, compiler: 'packages/core/src/compiler/NoSuchCompiler.ts' });
      expect(out.join('\n')).toMatch(/compiler file .* does not exist/);
    });
  });

  it('the compiler docs table states every target exactly as the data does', () => {
    const doc = readFileSync(resolve(repoRoot, 'docs/compilers/index.md'), 'utf8');
    const start = doc.indexOf('<!-- target-tiers:start');
    const end = doc.indexOf('<!-- target-tiers:end -->');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const rows = new Map<string, [string, string]>();
    for (const line of doc.slice(start, end).split('\n')) {
      const m = /^\| `([^`]+)` \| ([a-z-]+) \| (.*) \|$/.exec(line);
      if (m) rows.set(m[1], [m[2], m[3]]);
    }
    for (const [target, entry] of Object.entries(TARGET_TIERS)) {
      expect(rows.get(target), `docs row for ${target}`).toEqual([
        entry.tier,
        describeTargetLimits(target),
      ]);
    }
    expect(rows.size).toBe(Object.keys(TARGET_TIERS).length);
  });

  it('earnedTier needs a device run, not just a build, for reference', () => {
    expect(
      earnedTier({ ...ANDROID, runtimeProof: { ...ANDROID.runtimeProof!, onDevice: false } })
    ).toBe('production');
  });
});
