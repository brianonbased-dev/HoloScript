import { describe, expect, it } from 'vitest';
import { enumerateMutants, lexSpans, selectDecisionMutants, selectMutants } from '../mutator';
import { extractFencedSource, renderChecklist } from '../receipt';

const SAMPLE = `composition "Lamp" {
  state {
    level: 2
    label: "a + b // not code"
  }
  logic {
    // brightness rises by 1 + step
    action raise(step) {
      state.level = state.level + step
      emit("raised", { step: step })
      if (state.level >= 10) {
        return { allowed: true, outcome: "max" }
      }
      return { allowed: true, outcome: "raised" }
    }
  }
}
`;

describe('back-translation mutator', () => {
  it('lexes strings and comments out of code spans', () => {
    const spans = lexSpans(SAMPLE);
    const strings = spans.filter((s) => s.kind === 'string').map((s) => SAMPLE.slice(s.start, s.end));
    expect(strings).toContain('"a + b // not code"');
    const comments = spans.filter((s) => s.kind === 'comment').map((s) => SAMPLE.slice(s.start, s.end));
    expect(comments).toEqual(['// brightness rises by 1 + step']);
  });

  it('never mutates inside strings or comments', () => {
    for (const m of enumerateMutants(SAMPLE)) {
      expect(m.source).toContain('"a + b // not code"');
      expect(m.source).toContain('// brightness rises by 1 + step');
    }
  });

  it('produces one mutant per operator with sites, deterministically', () => {
    const a = selectMutants(SAMPLE, 6);
    const b = selectMutants(SAMPLE, 6);
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
    expect(a.map((m) => m.operator)).toEqual([
      'arith-flip',
      'comparison-flip',
      'constant-change',
      'boolean-flip',
      'drop-statement',
      'event-rename',
    ]);
    const byOp = Object.fromEntries(a.map((m) => [m.operator, m]));
    expect(byOp['arith-flip'].source).toContain('state.level = state.level - step');
    expect(byOp['comparison-flip'].source).toContain('state.level < 10');
    expect(byOp['constant-change'].source).toContain('level: 3');
    expect(byOp['boolean-flip'].source).toContain('return { allowed: false, outcome: "max" }');
    expect(byOp['drop-statement'].source).not.toContain('state.level = state.level + step');
    expect(byOp['event-rename'].source).toContain('emit("raised_renamed"');
    for (const m of a) expect(m.source).not.toBe(SAMPLE);
  });

  it('does not treat state declarations as droppable statements', () => {
    const drops = enumerateMutants(SAMPLE).filter((m) => m.operator === 'drop-statement');
    expect(drops.map((m) => m.before.trim())).toEqual([
      'state.level = state.level + step',
      'emit("raised", { step: step })',
    ]);
  });

  it('drops refusal guards and prefers decision faults', () => {
    const guarded = `composition "Gate" {
  state {
    tries: 0
  }
  logic {
    action open(code) {
      if (state.tries >= 3) {
        return { allowed: false, outcome: "locked_out" }
      }
      if (code == 42) {
        return { allowed: true, outcome: "opened" }
      } else {
        return { allowed: false, outcome: "kept_shut_with_else" }
      }
    }
  }
}
`;
    const refusals = enumerateMutants(guarded).filter((m) => m.operator === 'drop-refusal');
    // Only the plain guard; the if/else pair is not a removable guard.
    expect(refusals).toHaveLength(1);
    expect(refusals[0].source).not.toContain('locked_out');
    expect(refusals[0].source).toContain('kept_shut_with_else');
    expect(refusals[0].inDecision).toBe(true);

    const picked = selectDecisionMutants(guarded, 4);
    expect(picked.map((m) => m.id)).toEqual(selectDecisionMutants(guarded, 4).map((m) => m.id));
    expect(picked.map((m) => m.operator)).toEqual([
      'comparison-flip',
      'constant-change',
      'drop-refusal',
      'boolean-flip',
    ]);
    expect(picked[0].source).toContain('state.tries < 3');
    expect(picked[1].inDecision).toBe(true);
    expect(picked[1].source).toContain('state.tries >= 4');
  });

  it('renders checklists and extracts fenced model output', () => {
    expect(
      renderChecklist({
        behaviourId: 'x',
        sourcePath: 'x',
        author: 'a',
        lines: [
          { n: 1, text: 'One.' },
          { n: 2, text: 'Two.' },
        ],
      })
    ).toBe('1. One.\n2. Two.');
    expect(extractFencedSource('Here:\n```hsplus\ncomposition "X" {}\n```\nDone')).toBe(
      'composition "X" {}\n'
    );
  });
});
