/**
 * Outcome kinds on actions (board task_1791419247017_jri7).
 *
 *   action rent(count) accepted(rented) refused(fine_unpaid, over_limit) { ... }
 *
 * Both parsers read the declaration and run the same checker, so a `.hsplus`
 * file and the structured parse the headless runtime uses always agree.
 */
import { describe, expect, it } from 'vitest';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';
import { parseHolo } from '../HoloCompositionParser';
import { checkActionOutcomes, OUTCOME_DIAGNOSTIC_CODES } from '../ActionOutcomes';
import { validateCanonicalSource } from '../../validation/CanonicalSourceValidator';
import { HSPLUS_ERROR_CODES, getErrorCodeDocumentation } from '../RichErrors';

function behaviour(logic: string): string {
  return `composition "Bike Share Account" {
  state {
    bikesOut: 0
    fineOwed: 0
  }

  logic {
${logic}
  }
}
`;
}

const RENT_OK = `    action rent(count) accepted(rented) refused(fine_unpaid, bad_count, over_limit) {
      if (state.fineOwed > 0) {
        return { allowed: false, outcome: "fine_unpaid" }
      }
      if (count < 1) {
        return { allowed: false, outcome: "bad_count" }
      }
      if (state.bikesOut + count > 2) {
        return { allowed: false, outcome: "over_limit" }
      }
      state.bikesOut += count
      emit("bikes_rented", { count: count, now_out: state.bikesOut })
      return { allowed: true, outcome: "rented" }
    }`;

const ACCOUNT = `    action account(viewerId) {
      return { viewer: viewerId, bikes_out: state.bikesOut }
    }`;

/** Codes each parser reports (errors and warnings), and whether each called the source valid. */
function verdicts(source: string) {
  const hsplus = new HoloScriptPlusParser().parse(source);
  const holo = parseHolo(source, { tolerant: true });
  const hsCodes = [...hsplus.errors, ...(hsplus.warnings ?? [])]
    .map((e) => (e as { code?: string }).code)
    .filter((c): c is string => typeof c === 'string' && /^HSP5\d\d$/.test(c));
  const holoCodes = [...holo.errors, ...holo.warnings]
    .map((e) => e.code)
    .filter((c): c is string => typeof c === 'string' && /^HSP5\d\d$/.test(c));
  return {
    hsplusValid: hsplus.errors.length === 0,
    holoValid: holo.success,
    hsCodes,
    holoCodes,
    hsplus,
    holo,
  };
}

describe('outcome declarations — syntax and meaning', () => {
  it('both parsers read accepted(...) and refused(...) into the action, in the order written', () => {
    const v = verdicts(behaviour(`${RENT_OK}\n\n${ACCOUNT}`));
    expect(v.hsplusValid).toBe(true);
    expect(v.holoValid).toBe(true);
    expect(v.hsCodes).toEqual([]);
    expect(v.holoCodes).toEqual([]);

    const expected = [
      { name: 'rented', kind: 'accepted' },
      { name: 'fine_unpaid', kind: 'refused' },
      { name: 'bad_count', kind: 'refused' },
      { name: 'over_limit', kind: 'refused' },
    ];
    const rent = v.holo.ast!.logic!.actions.find((a) => a.name === 'rent')!;
    expect(rent.outcomes?.map(({ name, kind }) => ({ name, kind }))).toEqual(expected);
    expect(rent.body.length).toBeGreaterThan(0);
    expect(v.holo.ast!.logic!.actions.find((a) => a.name === 'account')!.outcomes).toBeUndefined();

    const logic =
      (
        v.hsplus.ast.root as { children?: Array<{ type: string; body?: { actions?: unknown[] } }> }
      ).children?.find((c) => c.type === 'logic') ??
      (v.hsplus.ast.root as unknown as { type: string; body?: { actions?: unknown[] } });
    const hsRent = (
      logic.body!.actions as Array<{
        name: string;
        outcomes?: Array<{ name: string; kind: string }>;
        body: string;
      }>
    ).find((a) => a.name === 'rent')!;
    expect(hsRent.outcomes?.map(({ name, kind }) => ({ name, kind }))).toEqual(expected);
    expect(hsRent.body).toContain('state.bikesOut += count');
  });

  it('allows the lists on their own lines and in either order', () => {
    const source = behaviour(`    action payFine(amount)
      refused(nothing_owed, not_enough)
      accepted(fine_paid) {
      if (state.fineOwed == 0) {
        return { allowed: false, outcome: "nothing_owed" }
      }
      if (amount < state.fineOwed) {
        return { allowed: false, outcome: "not_enough" }
      }
      state.fineOwed = 0
      return { allowed: true, outcome: "fine_paid" }
    }`);
    const v = verdicts(source);
    expect(v.hsplusValid).toBe(true);
    expect(v.holoValid).toBe(true);
    const action = v.holo.ast!.logic!.actions[0];
    expect(action.outcomes!.map((o) => `${o.name}:${o.kind}`)).toEqual([
      'nothing_owed:refused',
      'not_enough:refused',
      'fine_paid:accepted',
    ]);
  });

  it('leaves actions without declarations exactly as before (no new diagnostics)', () => {
    const legacy = behaviour(`    action rent(count) {
      state.bikesOut += count
      return { allowed: false, outcome: "whatever" }
    }`);
    const v = verdicts(legacy);
    expect(v.hsCodes).toEqual([]);
    expect(v.holoCodes).toEqual([]);
    expect(v.hsplusValid).toBe(true);
    expect(v.holoValid).toBe(true);
  });

  it('registers HSP500-HSP506 in the rich error table with the checker wording', () => {
    for (const [code, text] of Object.entries(OUTCOME_DIAGNOSTIC_CODES)) {
      expect(HSPLUS_ERROR_CODES[code as keyof typeof HSPLUS_ERROR_CODES]).toBe(text);
    }
    const outcomeDocs = getErrorCodeDocumentation().filter((d) => d.category === 'Outcomes');
    expect(outcomeDocs.map((d) => d.code)).toEqual(Object.keys(OUTCOME_DIAGNOSTIC_CODES));
  });
});

describe('outcome declarations — the checker', () => {
  it('rejects a refused outcome answered after a state change (planted kind mismatch), in both parsers', () => {
    const source = behaviour(`    action giveBack(hoursLate) accepted(returned) refused(bad_hours) {
      state.bikesOut -= 1
      if (hoursLate < 0) {
        return { allowed: false, outcome: "bad_hours" }
      }
      return { allowed: true, outcome: "returned" }
    }`);
    const v = verdicts(source);
    expect(v.hsplusValid).toBe(false);
    expect(v.holoValid).toBe(false);
    expect(v.hsCodes).toEqual(['HSP503']);
    expect(v.holoCodes).toEqual(['HSP503']);
    const message = v.holo.errors.find((e) => e.code === 'HSP503')!.message;
    expect(message).toContain('refused outcome "bad_hours"');
    expect(message).toContain('changes state.bikesOut');
    expect(message).toContain('on line 11');
    expect(message).toContain('(line 9)');
  });

  it('rejects a refused outcome answered after an announcement', () => {
    const v = verdicts(
      behaviour(`    action ping(x) accepted(sent) refused(blocked) {
      emit("pinged", { x: x })
      if (x < 0) {
        return { allowed: false, outcome: "blocked" }
      }
      return { allowed: true, outcome: "sent" }
    }`)
    );
    expect(v.holoCodes).toEqual(['HSP503']);
    expect(v.hsCodes).toEqual(['HSP503']);
    expect(v.holo.errors[0].message).toContain('announces "pinged"');
  });

  it('accepts a change on a branch that always answers accepted before the refusal', () => {
    const v = verdicts(
      behaviour(`    action decide(x) accepted(done) refused(no) {
      if (x > 0) {
        state.bikesOut = x
        return { allowed: true, outcome: "done" }
      }
      return { allowed: false, outcome: "no" }
    }`)
    );
    expect(v.holoCodes).toEqual([]);
    expect(v.hsCodes).toEqual([]);
  });

  it('rejects a refusal reached after a branch that may have changed state', () => {
    const v = verdicts(
      behaviour(`    action decide(x) accepted(done) refused(no) {
      if (x > 0) {
        state.bikesOut = x
      }
      if (x > 5) {
        return { allowed: false, outcome: "no" }
      }
      return { allowed: true, outcome: "done" }
    }`)
    );
    expect(v.holoCodes).toEqual(['HSP503']);
    expect(v.hsCodes).toEqual(['HSP503']);
  });

  it('rejects an answer whose outcome is not declared', () => {
    const v = verdicts(
      behaviour(`    action rent(count) accepted(rented) refused(over_limit) {
      if (count > 2) {
        return { allowed: false, outcome: "too_many" }
      }
      if (count > 9) {
        return { allowed: false, outcome: "over_limit" }
      }
      state.bikesOut += count
      return { allowed: true, outcome: "rented" }
    }`)
    );
    expect(v.holoCodes).toEqual(['HSP501']);
    expect(v.hsCodes).toEqual(['HSP501']);
    expect(v.holo.errors[0].message).toContain('"too_many"');
    expect(v.holo.errors[0].message).toContain('rented (accepted), over_limit (refused)');
  });

  it('rejects an answer whose allowed contradicts the declared kind', () => {
    const v = verdicts(
      behaviour(`    action rent(count) accepted(rented) refused(fine_unpaid) {
      if (state.fineOwed > 0) {
        return { allowed: true, outcome: "fine_unpaid" }
      }
      state.bikesOut += count
      return { allowed: true, outcome: "rented" }
    }`)
    );
    expect(v.holoCodes).toEqual(['HSP502']);
    expect(v.hsCodes).toEqual(['HSP502']);
    expect(v.holo.errors[0].message).toContain('declared refused');
  });

  it('rejects answers it cannot check: an outcome taken from a value, and a value that is not an object written in place', () => {
    const v = verdicts(
      behaviour(`    action rent(count, label) accepted(rented) refused(over_limit) {
      if (count > 2) {
        return { allowed: false, outcome: label }
      }
      if (count > 1) {
        return count
      }
      return { allowed: true, outcome: "rented" }
    }`)
    );
    expect(v.holoCodes).toEqual(['HSP504', 'HSP504', 'HSP506']);
    expect(v.hsCodes).toEqual(['HSP504', 'HSP504', 'HSP506']);
  });

  it('reads a choice between quoted names as every name it can be', () => {
    const ok = verdicts(
      behaviour(`    action reading(degrees) accepted(heating, idle) {
      state.bikesOut = degrees
      return { allowed: true, outcome: degrees < 18 ? "heating" : "idle" }
    }`)
    );
    expect(ok.holoCodes).toEqual([]);
    expect(ok.hsCodes).toEqual([]);
    expect(ok.holoValid).toBe(true);

    // A choice that mixes kinds cannot carry one allowed value.
    const mixed = verdicts(
      behaviour(`    action reading(degrees) accepted(heating) refused(too_cold) {
      return { allowed: true, outcome: degrees < 0 ? "too_cold" : "heating" }
    }`)
    );
    expect(mixed.holoCodes).toEqual(['HSP502']);
    expect(mixed.hsCodes).toEqual(['HSP502']);

    // A choice that names an undeclared outcome is caught for that name.
    const undeclared = verdicts(
      behaviour(`    action reading(degrees) accepted(heating, idle) {
      return { allowed: true, outcome: degrees < 0 ? "frozen" : "idle" }
    }`)
    );
    expect(undeclared.holoCodes).toEqual(['HSP501', 'HSP506']);
    expect(undeclared.hsCodes).toEqual(['HSP501', 'HSP506']);
  });

  it('asks every decision action to declare once one action in the logic block does', () => {
    const v = verdicts(
      behaviour(`${RENT_OK}

    action payFine(amount) {
      state.fineOwed = 0
      return { allowed: true, outcome: "fine_paid" }
    }

${ACCOUNT}`)
    );
    expect(v.holoCodes).toEqual(['HSP505']);
    expect(v.hsCodes).toEqual(['HSP505']);
    expect(v.holo.errors[0].message).toContain('action "payFine"');
  });

  it('rejects malformed declarations: a name twice, both kinds, an empty list, a list written twice', () => {
    const twice = verdicts(
      behaviour(`    action a(x) accepted(ok, ok) {
      return { allowed: true, outcome: "ok" }
    }`)
    );
    expect(twice.holoCodes).toEqual(['HSP500']);
    expect(twice.hsCodes).toEqual(['HSP500']);

    const both = verdicts(
      behaviour(`    action a(x) accepted(ok) refused(ok) {
      return { allowed: true, outcome: "ok" }
    }`)
    );
    expect(both.holoCodes).toEqual(['HSP500']);
    expect(both.hsCodes).toEqual(['HSP500']);

    const empty = verdicts(
      behaviour(`    action a(x) accepted(ok) refused() {
      return { allowed: true, outcome: "ok" }
    }`)
    );
    expect(empty.holoCodes).toEqual(['HSP500']);
    expect(empty.hsCodes).toEqual(['HSP500']);

    const repeated = verdicts(
      behaviour(`    action a(x) accepted(ok) accepted(fine) {
      if (x > 0) {
        return { allowed: true, outcome: "fine" }
      }
      return { allowed: true, outcome: "ok" }
    }`)
    );
    expect(repeated.holoCodes).toEqual(['HSP500']);
    expect(repeated.hsCodes).toEqual(['HSP500']);
  });

  it('warns, without failing, when a declared outcome is never answered', () => {
    const v = verdicts(
      behaviour(`    action a(x) accepted(ok) refused(never) {
      return { allowed: true, outcome: "ok" }
    }`)
    );
    expect(v.hsplusValid).toBe(true);
    expect(v.holoValid).toBe(true);
    expect(v.holoCodes).toEqual(['HSP506']);
    expect(v.hsCodes).toEqual(['HSP506']);
  });

  it('holoscript validate reports the same verdict for .hsplus and .holo', () => {
    const bad = behaviour(`    action giveBack(hoursLate) accepted(returned) refused(bad_hours) {
      state.bikesOut -= 1
      if (hoursLate < 0) {
        return { allowed: false, outcome: "bad_hours" }
      }
      return { allowed: true, outcome: "returned" }
    }`);
    const good = behaviour(`${RENT_OK}\n\n${ACCOUNT}`);
    for (const fileName of ['b.hsplus', 'b.holo']) {
      const rejected = validateCanonicalSource({ source: bad, fileName });
      expect(rejected.valid, fileName).toBe(false);
      expect(rejected.errors.map((e) => e.code)).toContain('HSP503');
      expect(validateCanonicalSource({ source: good, fileName }).valid, fileName).toBe(true);
    }
  });

  it('the checker can be called directly on structured statements', () => {
    const parsed = parseHolo(
      behaviour(
        RENT_OK.replace('accepted(rented) refused(fine_unpaid, bad_count, over_limit) ', '')
      ),
      {
        tolerant: true,
      }
    );
    const rent = parsed.ast!.logic!.actions[0];
    const diagnostics = checkActionOutcomes([
      {
        name: rent.name,
        outcomes: [
          { name: 'rented', kind: 'accepted' },
          { name: 'fine_unpaid', kind: 'accepted' },
          { name: 'bad_count', kind: 'refused' },
          { name: 'over_limit', kind: 'refused' },
        ],
        body: rent.body,
      },
    ]);
    expect(diagnostics.map((d) => d.code)).toEqual(['HSP502']);
  });
});
