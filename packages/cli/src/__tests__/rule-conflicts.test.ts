/**
 * Rule-conflict check on the back-translation fixtures (board task_1791419247017_rsth).
 *
 * The founder's heat-pump rules 6 and 7 (checklist lines 14 and 15) both apply
 * below the outdoor cut-off when the room is only 2 degrees cold, and they say
 * different things. Nobody noticed reading them one at a time; a Grok rebuild
 * diverged exactly there. These tests prove the check finds that pair from the
 * program alone, with a moment (witness) that the real headless runtime confirms,
 * and stays quiet where the order of rules has been decided.
 *
 *   corepack pnpm --filter @holoscript/cli exec vitest run src/__tests__/rule-conflicts.test.ts
 *
 * Fixtures: fixtures/rule-conflicts/ (rules-form heat pump, the same with the
 * founder's ruling, the car park with one planted rule) and the existing
 * back-translation originals and rebuilds (read only).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRuleConflicts, validateCanonicalSource, type RuleConflict } from '@holoscript/core';
import {
  createDeterministicHsplusActionRuntime,
  parseHeadlessExperimentPlan,
} from '@holoscript/engine/runtime';
import {
  generateGenericSituation,
  genericPlanRecords,
  type BehaviourSpec,
  type GenericSituation,
} from './backtranslation/generic';

const FIX = path.join(__dirname, 'fixtures');
const BT = path.join(FIX, 'backtranslation');
const read = (...parts: string[]) => readFileSync(path.join(...parts), 'utf8');
const spec = (dir: string) => JSON.parse(read(dir, 'behaviour.json')) as BehaviourSpec;

const heatPumpDir = path.join(BT, 'hvac', 'heat-pump');
const heatPumpSpec = spec(heatPumpDir);
const heatPumpOriginal = read(heatPumpDir, 'original.hsplus');
const heatPumpRules = read(FIX, 'rule-conflicts', 'heat-pump-rules.hsplus');
const heatPumpRuled = read(FIX, 'rule-conflicts', 'heat-pump-rules-founder-ruling.hsplus');
const carParkDir = path.join(BT, 'slice3', 'car-park-barrier');
const carParkSpec = spec(carParkDir);
const carParkPlanted = read(FIX, 'rule-conflicts', 'car-park-planted.hsplus');

// ---------------------------------------------------------------------------
// helpers: run one action in the real headless runtime from a chosen state
// ---------------------------------------------------------------------------

/** The source with its `state { }` values replaced (the witness's starting state). */
function withState(source: string, state: Record<string, unknown>): string {
  const start = source.indexOf('state {');
  const end = source.indexOf('}', start);
  const block = source
    .slice(start, end)
    .replace(/^(\s*)(\w+):\s*(.*)$/gm, (line, indent: string, key: string) =>
      Object.prototype.hasOwnProperty.call(state, key)
        ? `${indent}${key}: ${JSON.stringify(state[key])}`
        : line
    );
  return source.slice(0, start) + block + source.slice(end);
}

/** The source without one line (used to drop the later rule's write). */
function withoutLine(source: string, line: number): string {
  const lines = source.split('\n');
  lines.splice(line - 1, 1);
  return lines.join('\n');
}

function invokeOnce(
  source: string,
  behaviour: BehaviourSpec,
  entrypoint: string,
  args: Record<string, unknown>
): { value: Record<string, unknown>; state: Record<string, unknown> } {
  const situation: GenericSituation = {
    behaviourId: behaviour.id,
    iteration: 0,
    edge: false,
    steps: [
      { entrypoint, kind: 'action', args: args as Record<string, string | number | boolean> },
    ],
  };
  const placeholder = Object.fromEntries(behaviour.publicStateKeys.map((k) => [k, null]));
  const plan = parseHeadlessExperimentPlan(genericPlanRecords(behaviour, situation, placeholder));
  const runtime = createDeterministicHsplusActionRuntime(source);
  const result = runtime.invoke(plan.schedule[0]);
  return {
    value: result.value as Record<string, unknown>,
    state: result.state as Record<string, unknown>,
  };
}

/**
 * Run the witness in the headless runtime twice: as written (the later rule's
 * value must stand) and with the later rule's write removed (the earlier rule's
 * value must stand). Two different answers at the same moment is the conflict.
 */
function runBothRules(source: string, behaviour: BehaviourSpec, c: RuleConflict) {
  const key = c.target.replace(/^state\./, '');
  const start = withState(source, c.witness.state);
  const asWritten = invokeOnce(start, behaviour, c.action, c.witness.args);
  const laterDropped = invokeOnce(
    withoutLine(start, c.second.writeLine),
    behaviour,
    c.action,
    c.witness.args
  );
  return { key, asWritten, laterDropped };
}

/** Step-by-step results of a situation (every action's answer and state). */
function trace(source: string, behaviour: BehaviourSpec, situation: GenericSituation): string {
  const placeholder = Object.fromEntries(behaviour.publicStateKeys.map((k) => [k, null]));
  const plan = parseHeadlessExperimentPlan(genericPlanRecords(behaviour, situation, placeholder));
  const runtime = createDeterministicHsplusActionRuntime(source);
  return JSON.stringify(
    plan.schedule.map((entry) => runtime.invoke(entry)).map((r) => [r.value, r.state])
  );
}

function sameBehaviour(a: string, b: string, behaviour: BehaviourSpec, situations: number): number {
  let compared = 0;
  for (let i = 0; i < situations; i++) {
    const situation = generateGenericSituation(behaviour, 0x5eed2, i);
    expect(trace(a, behaviour, situation), `situation ${i}`).toBe(trace(b, behaviour, situation));
    compared++;
  }
  return compared;
}

/** Rules form with rule 14 moved after rule 15 (so rule 14 wins as written). */
function rule14Later(source: string): string {
  const a = source.indexOf('      // rule 14:');
  const b = source.indexOf('      // rule 15:');
  const end = source.indexOf('      // rules 10 and 13:');
  return source.slice(0, a) + source.slice(b, end) + source.slice(a, b) + source.slice(end);
}

/** Rules form resolved by structure: rule 15 first, rule 14 only in its else. */
function elseChainResolution(source: string): string {
  const rule14 = `      if (state.heatCall) {
        state.backupHeating = state.backup == "on" && room <= state.setPoint - 3
      } else {
        state.backupHeating = false
      }
`;
  const rule15Close = `        state.backupHeating = state.backup == "on"
      }
`;
  expect(source).toContain(rule14);
  expect(source).toContain(rule15Close);
  return source.replace(rule14, '').replace(
    rule15Close,
    `        state.backupHeating = state.backup == "on"
      } else if (state.heatCall) {
        state.backupHeating = state.backup == "on" && room <= state.setPoint - 3
      } else {
        state.backupHeating = false
      }
`
  );
}

// ---------------------------------------------------------------------------

describe('heat pump: the founder rule 6/7 conflict (checklist lines 14 and 15)', () => {
  const report = findRuleConflicts(heatPumpRules);
  const [c] = report.conflicts;

  it('reports exactly one conflict, rules 14 and 15 on the backup strips, as a plain question', () => {
    expect(report.skipped).toEqual([]);
    expect(report.unconfirmed).toBe(0);
    expect(report.conflicts).toHaveLength(1);
    expect(c.kind).toBe('conflict');
    expect(c.action).toBe('reading');
    expect(c.target).toBe('state.backupHeating');
    expect([c.first.label, c.second.label]).toEqual(['14', '15']);
    expect(c.message).toBe(
      'Rule 14 and rule 15 both apply when reading is given room 69 and outdoor 24, while heat call is yes, ' +
        'backup is on, set point is 70 and cutoff is 25. They say different things: rule 14 turns backup ' +
        'heating off, but rule 15 turns it on. Which should win? As written, rule 15 wins only because it comes later.'
    );
  });

  it('the witness is the moment the founder described: below the cut-off, less than 3 degrees cold, strips on', () => {
    const { state, args } = c.witness;
    expect(args.outdoor as number).toBeLessThan(state.cutoff as number);
    expect((state.setPoint as number) - (args.room as number)).toBeLessThan(3);
    expect(state.backup).toBe('on');
    expect(['heat', 'auto']).toContain(state.mode);
  });

  it('the headless runtime confirms the witness: each rule, run alone at that moment, gives a different answer', () => {
    const { key, asWritten, laterDropped } = runBothRules(heatPumpRules, heatPumpSpec, c);
    expect(asWritten.state[key]).toBe(c.second.value);
    expect(laterDropped.state[key]).toBe(c.first.value);
    expect(asWritten.state[key]).not.toBe(laterDropped.state[key]);
    // and the answer the heat pump gives changes with the order of the two rules
    const start = withState(heatPumpRules, c.witness.state);
    expect(asWritten.value.outcome).toBe('backup_heating');
    const swapped = invokeOnce(rule14Later(start), heatPumpSpec, 'reading', c.witness.args);
    expect(swapped.value.outcome).toBe('idle');
    expect(swapped.state.backupHeating).toBe(false);
  });

  it('with rule 14 placed later the check still reports, now saying rule 14 wins by order', () => {
    const swapped = findRuleConflicts(rule14Later(heatPumpRules)).conflicts;
    expect(swapped).toHaveLength(1);
    expect([swapped[0].first.label, swapped[0].second.label]).toEqual(['15', '14']);
    expect(swapped[0].message).toContain('As written, rule 14 wins only because it comes later.');
  });

  it('the rules-form program is a faithful translation: same behaviour as the original in 200 situations', () => {
    expect(sameBehaviour(heatPumpRules, heatPumpOriginal, heatPumpSpec, 200)).toBe(200);
  });

  it('validate surfaces it as a RULE-CONFLICT warning on the later rule, and the file stays valid', () => {
    const result = validateCanonicalSource({
      source: heatPumpRules,
      fileName: 'heat-pump-rules.hsplus',
    });
    expect(result.valid).toBe(true);
    const warnings = result.warnings.filter((w) => w.code === 'RULE-CONFLICT');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(c.second.line);
    expect(heatPumpRules.split('\n')[c.second.line - 1].trim()).toBe(
      'if (state.heatCall && outdoor < state.cutoff) {'
    );
  });
});

describe('heat pump: resolved copies stay quiet', () => {
  const ruling = JSON.parse(read(FIX, 'rule-conflicts', 'founder-ruling.json')) as Record<
    string,
    string
  >;

  it('the founder ruling ("strips run, I believe") written as "rule 15 wins over rule 14": no report', () => {
    expect(ruling.foundersWords).toBe('strips run, I believe');
    expect(heatPumpRuled).toContain('// rule 15 wins over rule 14.');
    const report = findRuleConflicts(heatPumpRuled);
    expect(report.conflicts).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.checkedActions).toContain('reading');
  });

  it('the ruled copy behaves like the original (rule 15 wins below the cut-off) in 200 situations', () => {
    expect(sameBehaviour(heatPumpRuled, heatPumpOriginal, heatPumpSpec, 200)).toBe(200);
  });

  it('a ruling the program contradicts is reported as a mismatch', () => {
    const flipped = heatPumpRuled.replace(
      '// rule 15 wins over rule 14.',
      '// rule 14 wins over rule 15.'
    );
    const [c] = findRuleConflicts(flipped).conflicts;
    expect(c.kind).toBe('priority-mismatch');
    expect(c.message).toMatch(
      /^You said rule 14 wins over rule 15, but as written rule 15 wins when reading is given/
    );
    const result = validateCanonicalSource({ source: flipped, fileName: 'flipped.hsplus' });
    expect(result.warnings.map((w) => w.code)).toContain('RULE-PRIORITY-MISMATCH');
  });

  it('resolved by structure (rule 14 only in the else of rule 15): no report, same behaviour as the original', () => {
    const resolved = elseChainResolution(heatPumpRules);
    expect(findRuleConflicts(resolved).conflicts).toEqual([]);
    expect(sameBehaviour(resolved, heatPumpOriginal, heatPumpSpec, 100)).toBe(100);
  });

  it('the original program reports nothing: its nesting already decided (the translator chose, silently)', () => {
    const report = findRuleConflicts(heatPumpOriginal);
    expect(report.conflicts).toEqual([]);
    expect(report.skipped).toEqual([]);
  });
});

describe('car park: a planted overlapping rule is found', () => {
  const report = findRuleConflicts(carParkPlanted);

  it('reports the planted rule 15 against rule 9, and nothing else', () => {
    expect(report.skipped).toEqual([]);
    expect(report.conflicts).toHaveLength(1);
    const [c] = report.conflicts;
    expect(c.action).toBe('pay');
    expect(c.target).toBe('state.paid');
    expect([c.first.label, c.second.label]).toEqual(['15', '9']);
    expect(c.message).toBe(
      'Rule 15 and rule 9 both apply when pay is given coins 10, while minutes is 31 and paid is 0. ' +
        'They say different things: rule 15 sets paid to 10, but rule 9 sets it to 3. ' +
        'Which should win? As written, rule 9 wins only because it comes later.'
    );
  });

  it('the headless runtime confirms the witness', () => {
    const [c] = report.conflicts;
    const { key, asWritten, laterDropped } = runBothRules(carParkPlanted, carParkSpec, c);
    expect(asWritten.state[key]).toBe(3);
    expect(laterDropped.state[key]).toBe(10);
  });
});

describe('no false reports on the back-translation originals', () => {
  const originals = [
    'hvac/heat-pump',
    'hvac/furnace-air-conditioner',
    'slice3/bike-share-account',
    'slice3/car-park-barrier',
    'slice3/deli-counter-queue',
    'keypad-door', // slice3/door-before-after reuses this original
    'corner-shop',
    'greenhouse-thermostat',
  ];
  it.each(originals)('%s: checked to the end, nothing reported', (id) => {
    const report = findRuleConflicts(read(BT, id, 'original.hsplus'));
    expect(report.conflicts).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.checkedActions.length).toBeGreaterThan(0);
  });

  it('model village behaviour: nothing reported', () => {
    expect(findRuleConflicts(read(FIX, 'model-village', 'behavior.hsplus')).conflicts).toEqual([]);
  });
});

describe('the rebuilds: overlaps found exactly where the receipts recorded a timer reset too many', () => {
  // Receipts (divergence-classification.json) record a "timer bookkeeping" b-error where a
  // rebuild resets the compressor wait at a second place. That is two rules writing the same
  // value at once; the check should find it there and nowhere else in the hvac rebuilds.
  const rebuilds = ['furnace-air-conditioner', 'heat-pump'].flatMap((id) =>
    ['r1', 'r2', 'r3'].map((r) => ({
      id: `${id}/${r}`,
      dir: path.join(BT, 'hvac', id, 'recordings', r),
    }))
  );
  it('flags furnace r2 and heat pump r1, r2, r3 — all on the compressor wait — and nothing in the others', () => {
    const flagged: string[] = [];
    for (const r of rebuilds) {
      const report = findRuleConflicts(read(r.dir, 'rebuilt.hsplus'));
      expect(report.skipped, r.id).toEqual([]);
      if (report.conflicts.length === 0) continue;
      flagged.push(r.id);
      for (const c of report.conflicts)
        expect(c.target).toBe('state.minutesSinceCompressorStopped');
      const receipts = read(r.dir, 'divergence-classification.json');
      expect(receipts, r.id).toMatch(
        /Timer bookkeeping: the rebuild sets the time since the compressor stopped back to 0 (when the compressor STARTS|whenever the room reaches the setting)/
      );
    }
    expect(flagged).toEqual([
      'furnace-air-conditioner/r2',
      'heat-pump/r1',
      'heat-pump/r2',
      'heat-pump/r3',
    ]);
  });
});
