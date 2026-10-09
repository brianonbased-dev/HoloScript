/**
 * Outcome kinds (board task_1791419247017_jri7): `holoscript validate` and the
 * deterministic headless runtime must reach the same verdict on the same source.
 * Slice 1 of the back-translation proof found validate admitting code the
 * runner refused; this corpus pins agreement for every outcome rule.
 *
 *   fixtures/outcome-kinds/manifest.json   expected verdict + codes per file
 *
 * validateCanonicalSource is the exact function `holoscript validate` calls
 * (packages/cli/src/cli.ts); the runtime's verdict is whether it can be
 * constructed (admission happens before any action runs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateCanonicalSource } from '@holoscript/core';
import type { HeadlessExperimentScheduleEntry } from '../HeadlessExecutionLedger';
import {
  assertAnswerMatchesDeclaration,
  createDeterministicHsplusActionRuntime,
} from '../DeterministicHsplusActionRuntime';

interface CorpusCase {
  valid: boolean;
  codes: string[];
  why: string;
  invocations?: Array<{
    entrypoint: string;
    kind?: 'action' | 'observation';
    args: Record<string, string | number | boolean>;
    expect?: { allowed: boolean; outcome: string };
  }>;
}

const corpusDir = path.join(__dirname, 'fixtures', 'outcome-kinds');
const manifest = JSON.parse(readFileSync(path.join(corpusDir, 'manifest.json'), 'utf8')) as {
  cases: Record<string, CorpusCase>;
};
const ALL_CODES = ['HSP500', 'HSP501', 'HSP502', 'HSP503', 'HSP504', 'HSP505', 'HSP506'];

function outcomeCodes(result: ReturnType<typeof validateCanonicalSource>): string[] {
  return [
    ...new Set(
      [...result.errors, ...result.warnings]
        .map((d) => d.code)
        .filter((code): code is string => typeof code === 'string' && /^HSP5\d\d$/.test(code))
    ),
  ].sort();
}

function admission(source: string): { admitted: boolean; error: string } {
  try {
    createDeterministicHsplusActionRuntime(source);
    return { admitted: true, error: '' };
  } catch (error) {
    return { admitted: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function entry(
  index: number,
  invocation: NonNullable<CorpusCase['invocations']>[number]
): HeadlessExperimentScheduleEntry {
  return {
    kind: invocation.kind ?? 'action',
    scheduleEntryId: `outcome-kinds-${index}-${invocation.entrypoint}`,
    order: index,
    tick: index,
    phase: 'test',
    entrypoint: invocation.entrypoint,
    args: invocation.args,
    ...(invocation.expect ? { expect: invocation.expect } : {}),
  };
}

describe('outcome kinds — holoscript validate and the headless runtime agree on a shared corpus', () => {
  for (const [file, c] of Object.entries(manifest.cases)) {
    it(`${file}: ${c.why}`, () => {
      const source = readFileSync(path.join(corpusDir, file), 'utf8');
      const hsplus = validateCanonicalSource({ source, fileName: file });
      const holo = validateCanonicalSource({
        source,
        fileName: file.replace(/\.hsplus$/, '.holo'),
      });
      const runtime = admission(source);

      expect(hsplus.valid, 'validate (.hsplus) verdict').toBe(c.valid);
      expect(holo.valid, 'validate (.holo) verdict').toBe(c.valid);
      expect(runtime.admitted, `runtime admission verdict: ${runtime.error}`).toBe(c.valid);

      expect(outcomeCodes(hsplus)).toEqual([...c.codes].sort());
      expect(outcomeCodes(holo)).toEqual([...c.codes].sort());

      if (!c.valid) {
        // The runtime names the same rule the checker does.
        const errorCodes = [...new Set(hsplus.errors.map((d) => d.code).filter(Boolean))];
        for (const code of errorCodes) expect(runtime.error).toContain(code as string);
        return;
      }

      // Admitted programs never trip the per-invocation outcome check.
      const behaviour = createDeterministicHsplusActionRuntime(source);
      (c.invocations ?? []).forEach((invocation, index) => {
        const result = behaviour.invoke(entry(index, invocation));
        if (invocation.expect) {
          expect(result.value).toMatchObject(invocation.expect);
        }
      });
    });
  }

  it('the corpus exercises every outcome diagnostic and both verdicts', () => {
    const seen = new Set(Object.values(manifest.cases).flatMap((c) => c.codes));
    expect([...seen].sort()).toEqual(ALL_CODES);
    const verdicts = new Set(Object.values(manifest.cases).map((c) => c.valid));
    expect([...verdicts].sort()).toEqual([false, true]);
  });
});

describe('outcome kinds — the per-invocation check', () => {
  const declared = new Map<string, 'accepted' | 'refused'>([
    ['rented', 'accepted'],
    ['over_limit', 'refused'],
  ]);

  it('refuses an answer the action does not declare', () => {
    expect(() => assertAnswerMatchesDeclaration('rent', 'too_many', false, declared)).toThrow(
      'action "rent" answered with outcome "too_many", which it does not declare (declared: rented (accepted), over_limit (refused))'
    );
  });

  it('refuses an answer whose allowed contradicts the declared kind, either way', () => {
    expect(() => assertAnswerMatchesDeclaration('rent', 'over_limit', true, declared)).toThrow(
      'is declared refused'
    );
    expect(() => assertAnswerMatchesDeclaration('rent', 'rented', false, declared)).toThrow(
      'is declared accepted'
    );
  });

  it('lets a matching answer through', () => {
    expect(() => assertAnswerMatchesDeclaration('rent', 'rented', true, declared)).not.toThrow();
    expect(() =>
      assertAnswerMatchesDeclaration('rent', 'over_limit', false, declared)
    ).not.toThrow();
  });

  it('exposes the declaration the runtime enforces, in the order written', () => {
    const source = readFileSync(path.join(corpusDir, 'v02-lists-on-own-lines.hsplus'), 'utf8');
    const behaviour = createDeterministicHsplusActionRuntime(source);
    expect(behaviour.declaredOutcomesOf('giveBack')).toEqual([
      { name: 'nothing_out', kind: 'refused' },
      { name: 'bad_hours', kind: 'refused' },
      { name: 'returned', kind: 'accepted' },
      { name: 'returned_late', kind: 'accepted' },
    ]);
    const legacy = createDeterministicHsplusActionRuntime(
      readFileSync(path.join(corpusDir, 'v05-no-declarations.hsplus'), 'utf8')
    );
    expect(legacy.declaredOutcomesOf('borrow')).toBeUndefined();
  });
});
