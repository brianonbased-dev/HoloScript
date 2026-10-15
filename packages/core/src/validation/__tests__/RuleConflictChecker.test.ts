import { describe, expect, it } from 'vitest';
import { findRuleConflicts, ruleConflictDiagnostics } from '../RuleConflictChecker';
import { validateCanonicalSource } from '../CanonicalSourceValidator';

/** A one-action composition around `body`, with optional extra actions. */
function program(state: string, body: string, params = 'level', extra = ''): string {
  return `composition "Rules" {
  state {
${state}
  }
  logic {
    action tick(${params}) {
${body}
    }
${extra}
  }
}
`;
}

const STATE = `    level: 0
    alarm: false
    mode: "off"`;

describe('rule-conflict check: what it reports', () => {
  it('reports two sibling rules that overlap and disagree, with a witness that satisfies both', () => {
    const src = program(
      STATE,
      `      if (level > 5) {
        state.alarm = true
      }
      if (level < 8) {
        state.alarm = false
      }`
    );
    const report = findRuleConflicts(src);
    expect(report.conflicts).toHaveLength(1);
    const c = report.conflicts[0];
    expect(c.kind).toBe('conflict');
    expect(c.target).toBe('state.alarm');
    const level = c.witness.args.level as number;
    expect(level).toBeGreaterThan(5);
    expect(level).toBeLessThan(8);
    expect(c.first.value).toBe(true);
    expect(c.second.value).toBe(false);
    expect(c.message).toBe(
      `Two rules in tick (lines 9 and 12) both apply when tick is given level ${level}. ` +
        'They say different things: the rule at line 9 turns alarm on, but the rule at line 12 turns it off. ' +
        'Which should win? As written, the rule at line 12 wins only because it comes later.'
    );
  });

  it('names rules from "// rule N" comments', () => {
    const src = program(
      STATE,
      `      // rule 1: too high sounds the alarm
      if (level > 5) {
        state.alarm = true
      }
      // rule 2: quiet below 8
      if (level < 8) {
        state.alarm = false
      }`
    );
    const [c] = findRuleConflicts(src).conflicts;
    expect(c.first.label).toBe('1');
    expect(c.second.label).toBe('2');
    expect(c.message).toMatch(/^Rule 1 and rule 2 both apply when tick is given level \d+\. /);
    expect(c.message).toContain('rule 1 turns alarm on, but rule 2 turns it off');
    expect(c.suggestion).toContain('"// rule 2 wins over rule 1"');
  });

  it('handles string modes and inputs given as text', () => {
    const src = program(
      STATE,
      `      if (state.mode == "heat") {
        state.level = 1
      }
      if (state.mode != "cool") {
        state.level = 2
      }`,
      'x',
      `    action setMode(m) {
      if (m != "heat" && m != "cool" && m != "off") {
        return { allowed: false }
      }
      state.mode = m
      return { allowed: true }
    }`
    );
    const [c] = findRuleConflicts(src).conflicts;
    expect(c.witness.state.mode).toBe('heat');
    expect(c.message).toContain('both apply when mode is heat.');
  });

  it('splits ?: into cases (car-park price shape)', () => {
    const src = program(
      `    minutes: 0
    paid: 0`,
      `      if (coins >= 10) {
        state.paid = 10
      }
      if (coins >= (state.minutes <= 30 ? 0 : state.minutes <= 120 ? 3 : 6) - state.paid) {
        state.paid = state.minutes <= 30 ? 0 : state.minutes <= 120 ? 3 : 6
      }`,
      'coins',
      `    action wait(m) {
      if (m < 1) {
        return { allowed: false }
      }
      state.minutes += m
      return { allowed: true }
    }`
    );
    const [c] = findRuleConflicts(src).conflicts;
    expect(c.first.value).toBe(10);
    expect(c.second.value).not.toBe(10);
    expect(c.witness.args.coins).toBeGreaterThanOrEqual(10);
  });

  it('reports a declared priority that the program contradicts', () => {
    const src = program(
      STATE,
      `      // rule 1 wins over rule 2
      // rule 1
      if (level > 5) {
        state.alarm = true
      }
      // rule 2
      if (level < 8) {
        state.alarm = false
      }`
    );
    const [c] = findRuleConflicts(src).conflicts;
    expect(c.kind).toBe('priority-mismatch');
    expect(c.declared).toEqual({ winner: '1', loser: '2', line: 9 });
    expect(c.message).toMatch(
      /^You said rule 1 wins over rule 2, but as written rule 2 wins when /
    );
  });
});

describe('rule-conflict check: what counts as decided (no report)', () => {
  const quiet = (body: string, extra = '') =>
    expect(findRuleConflicts(program(STATE, body, 'level', extra)).conflicts).toEqual([]);

  it('else chain', () =>
    quiet(`      if (level > 5) {
        state.alarm = true
      } else if (level < 8) {
        state.alarm = false
      }`));

  it('a guard that excludes the other rule', () =>
    quiet(`      if (level > 5) {
        state.alarm = true
      }
      if (level < 8 && level <= 5) {
        state.alarm = false
      }`));

  it('early return (first match wins)', () =>
    quiet(`      if (level > 5) {
        state.alarm = true
        return { outcome: "high" }
      }
      if (level < 8) {
        state.alarm = false
      }`));

  it('an unconditional default that a rule overrides', () =>
    quiet(`      state.alarm = false
      if (level > 5) {
        state.alarm = true
      }`));

  it('a rule nested inside another', () =>
    quiet(`      if (level > 5) {
        state.alarm = true
        if (level < 8) {
          state.alarm = false
        }
      }`));

  it('a later rule that builds on the earlier value', () =>
    quiet(`      if (level > 5) {
        state.level = 1
      }
      if (level < 8) {
        state.level += 2
      }`));

  it('two rules that agree', () =>
    quiet(`      if (level > 5) {
        state.alarm = true
      }
      if (level < 8) {
        state.alarm = true
      }`));

  it('rules that never overlap', () =>
    quiet(`      if (level > 8) {
        state.alarm = true
      }
      if (level < 5) {
        state.alarm = false
      }`));

  it('a declared priority that matches the program', () =>
    quiet(`      // rule 2 wins over rule 1
      // rule 1
      if (level > 5) {
        state.alarm = true
      }
      // rule 2
      if (level < 8) {
        state.alarm = false
      }`));
});

describe('rule-conflict check: state ranges come from every action', () => {
  const swingProgram = (low: number) =>
    program(
      `    room: 70
    setPoint: 70
    swing: 1
    call: false`,
      `      if (room <= state.setPoint - state.swing) {
        state.call = true
      }
      if (room >= state.setPoint) {
        state.call = false
      }`,
      'room',
      `    action setSwing(d) {
      if (d < ${low} || d > 3) {
        return { allowed: false }
      }
      state.swing = d
      return { allowed: true }
    }`
    );

  it('stays quiet when no call can make swing 0 or less', () => {
    expect(findRuleConflicts(swingProgram(1)).conflicts).toEqual([]);
  });

  it('reports when swing can be 0, with swing 0 in the witness', () => {
    const [c] = findRuleConflicts(swingProgram(0)).conflicts;
    expect(c).toBeDefined();
    expect(c.witness.state.swing).toBeLessThanOrEqual(0);
  });
});

describe('rule-conflict check: yes/no state only takes values some call can give it', () => {
  const flagProgram = (extra: string) =>
    program(
      `    armed: false
    alarm: false`,
      `      if (state.armed && level > 5) {
        state.alarm = true
      }
      if (level < 8) {
        state.alarm = false
      }`,
      'level',
      extra
    );

  it('stays quiet when nothing ever arms it', () => {
    expect(findRuleConflicts(flagProgram('')).conflicts).toEqual([]);
  });

  it('reports once an action can arm it', () => {
    const extra = `    action arm() {
      state.armed = true
      return { allowed: true }
    }`;
    const [c] = findRuleConflicts(flagProgram(extra)).conflicts;
    expect(c.witness.state.armed).toBe(true);
  });
});

describe('rule-conflict check: abstains instead of guessing', () => {
  it('skips an action with statements outside the checked subset', () => {
    const src = program(
      STATE,
      `      for item in state.items {
        state.level = 1
      }
      if (level > 5) {
        state.alarm = true
      }
      if (level < 8) {
        state.alarm = false
      }`
    );
    const report = findRuleConflicts(src);
    expect(report.conflicts).toEqual([]);
    expect(report.skipped.map((s) => s.action)).toContain('tick');
  });

  it('gives an empty report for sources that are not compositions with logic', () => {
    expect(findRuleConflicts('object "Cube" { geometry: "cube" }').conflicts).toEqual([]);
  });

  it('never throws from the diagnostics entry point', () => {
    expect(ruleConflictDiagnostics({ source: 'composition { logic { action' })).toEqual([]);
  });
});

describe('rule-conflict check in the canonical validator', () => {
  const conflicting = program(
    STATE,
    `      if (level > 5) {
        state.alarm = true
      }
      if (level < 8) {
        state.alarm = false
      }`
  );

  it('adds a RULE-CONFLICT warning for .hsplus and keeps the source valid', () => {
    const result = validateCanonicalSource({ source: conflicting, fileName: 'rules.hsplus' });
    expect(result.valid).toBe(true);
    const warning = result.warnings.find((w) => w.code === 'RULE-CONFLICT');
    expect(warning).toBeDefined();
    expect(warning?.line).toBe(12);
    expect(warning?.message).toContain('Which should win?');
  });

  it('adds the same warning for .holo', () => {
    const result = validateCanonicalSource({ source: conflicting, fileName: 'rules.holo' });
    expect(result.warnings.some((w) => w.code === 'RULE-CONFLICT')).toBe(true);
  });
});
