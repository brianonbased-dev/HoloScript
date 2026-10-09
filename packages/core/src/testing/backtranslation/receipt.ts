/**
 * Back-translation proof — receipt helpers.
 *
 * Pure functions: callers decide where the receipt lands. The plain summary is
 * written for a reader who does not read code (founder test): what was
 * checked, what was caught, what raised a false alarm.
 */
import type {
  BackTranslationReceipt,
  BackTranslationReceiptV2,
  BackTranslationReceiptV3,
  BehaviourChecklist,
  FalseAlarmTolerance,
  RecordingMeasurement,
  SpreadStat,
} from './types';

/** Render a checklist as numbered plain lines (the exact text agent B sees). */
export function renderChecklist(checklist: BehaviourChecklist): string {
  return checklist.lines.map((line) => `${line.n}. ${line.text}`).join('\n');
}

/** Pull the first fenced code block out of a model response; else the whole text. */
export function extractFencedSource(response: string): string {
  const fence = /```[a-zA-Z+]*\s*\n([\s\S]*?)```/.exec(response);
  return (fence ? fence[1] : response).trim() + '\n';
}

/** Stable JSON (sorted keys) so receipts diff cleanly across runs. */
export function stableReceiptJson(
  receipt: BackTranslationReceipt | BackTranslationReceiptV2 | BackTranslationReceiptV3
): string {
  return (
    JSON.stringify(
      receipt,
      (_key, value) => {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value as Record<string, unknown>).sort()) {
          sorted[k] = (value as Record<string, unknown>)[k];
        }
        return sorted;
      },
      2
    ) + '\n'
  );
}

export function renderPlainSummary(receipt: BackTranslationReceipt): string {
  const r = receipt;
  const lines: string[] = [];
  lines.push(`# Back-translation proof: ${r.behaviourId}`);
  lines.push('');
  lines.push('## What was checked');
  lines.push('');
  lines.push(
    `One agent (${r.checklist.author}) wrote down, in plain words, what this behaviour does. ` +
      `A second agent from a different company (${r.rebuild.provider}, ${r.rebuild.model}) ` +
      `rebuilt the behaviour from that list alone. It never saw the original.`
  );
  lines.push('');
  lines.push('The list it worked from:');
  lines.push('');
  for (const line of r.checklist.lines) lines.push(`${line.n}. ${line.text}`);
  lines.push('');
  lines.push(
    `The rebuild ${r.rebuild.validated ? 'passed' : 'did NOT pass'} the language checker` +
      ` after ${r.rebuild.rounds} ${r.rebuild.rounds === 1 ? 'try' : 'tries'}.`
  );
  lines.push('');
  lines.push('## Did the rebuild act the same?');
  lines.push('');
  lines.push(
    `Both versions were run in ${r.twin.situations} made-up village situations ` +
      `(different residents, different amounts of water, refusals mixed in).`
  );
  if (r.originalVsRebuild.passed) {
    lines.push(`They acted the same in every one.`);
  } else {
    lines.push(
      `They acted differently in ${r.originalVsRebuild.divergentSituations} of them. ` +
        `False alarms (difference caused by an unclear list, not a real fault): ` +
        `${r.originalVsRebuild.falseAlarms}.`
    );
    for (const d of r.originalVsRebuild.divergences) {
      lines.push(`- Situation ${d.iteration}: ${d.difference} — ${d.classification}. ${d.rationale}`);
    }
  }
  lines.push('');
  lines.push(
    `Sanity check: the original run against itself ${r.originalVsSelf.passed ? 'never differed' : 'DIFFERED — the test is not trustworthy'}.`
  );
  lines.push('');
  lines.push('## Can the test catch a real mistake?');
  lines.push('');
  lines.push(
    `${r.faults.planted} small mistakes were planted in copies of the original. ` +
      `The test caught ${r.faults.caught} of ${r.faults.planted}.`
  );
  lines.push('');
  for (const m of r.faults.mutants) {
    lines.push(
      `- ${m.caught ? 'CAUGHT' : 'MISSED'}: ${m.description} (${m.divergentSituations} of ${m.situations} situations showed it)`
    );
  }
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(r.verdict);
  lines.push('');
  lines.push(`Weakest link: ${r.weakestLink}`);
  lines.push('');
  return lines.join('\n');
}

// ── Slice 2 summaries ─────────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function renderPlainSummaryV2(receipt: BackTranslationReceiptV2): string {
  const r = receipt;
  const fa = r.falseAlarms;
  const lines: string[] = [];
  lines.push(`# Back-translation check: ${r.title}`);
  lines.push('');
  lines.push('## What was checked');
  lines.push('');
  lines.push(
    `An author agent (${r.checklist.author}) wrote the program and a list of its rules in plain words. ` +
      `A second agent from a different company (${r.rebuild.provider}, ${r.rebuild.model}) rebuilt the program ` +
      `from the rules and a list of names only. It never saw the program.`
  );
  lines.push('');
  lines.push('The rules it worked from:');
  lines.push('');
  for (const line of r.checklist.lines) lines.push(`${line.n}. ${line.text}`);
  lines.push('');
  lines.push(
    r.rebuild.validated
      ? `The rebuild passed the checker after ${r.rebuild.rounds} ${r.rebuild.rounds === 1 ? 'try' : 'tries'}.`
      : `The rebuild NEVER passed the checker (${r.rebuild.rounds} tries).`
  );
  if (r.rebuild.note) lines.push(r.rebuild.note);
  lines.push('');
  lines.push('## Would a mistake in the program be shown?');
  lines.push('');
  lines.push(
    `${r.catch.planted} small mistakes were planted in copies of the correct program. ` +
      `A mistake counts as shown when the rebuild and the faulty program act differently in a situation ` +
      `where the rebuild and the correct program agree. Shown: ${r.catch.caught} of ${r.catch.planted} (${pct(r.catch.catchRate)}).`
  );
  lines.push('');
  for (const m of r.catch.mutants) {
    lines.push(
      `- ${m.caught ? 'SHOWN' : 'MISSED'}: ${m.description} ` +
        `(${m.attributableDivergentSituations} of ${m.situations} situations)`
    );
  }
  lines.push('');
  lines.push('## False alarms on the correct program');
  lines.push('');
  if (fa.divergentSituations === 0) {
    lines.push(
      `None. The rebuild and the correct program acted the same in all ${fa.situations} situations.`
    );
  } else {
    lines.push(
      `The rebuild and the correct program acted differently in ${fa.divergentSituations} of ${fa.situations} situations: ` +
        `${fa.byClass['checklist-ambiguity']} from unclear rules, ${fa.byClass['b-error']} from rebuild mistakes, ` +
        `${fa.byClass['real-fault']} from a real fault in the program.`
    );
    const seen = new Set<string>();
    for (const d of fa.divergences) {
      const key = `${d.classification}|${d.rationale}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- ${d.classification}: ${d.rationale}`);
    }
  }
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(r.verdict);
  lines.push('');
  return lines.join('\n');
}

export function renderCombinedSummary(
  receipts: BackTranslationReceiptV2[],
  bar: { minCatchRate: number; targetCatchRate: number },
  verdict: string
): string {
  const planted = receipts.reduce((s, r) => s + r.catch.planted, 0);
  const caught = receipts.reduce((s, r) => s + r.catch.caught, 0);
  const situations = receipts.reduce((s, r) => s + r.falseAlarms.situations, 0);
  const alarms = receipts.reduce((s, r) => s + r.falseAlarms.divergentSituations, 0);
  const lines: string[] = [];
  lines.push('# Back-translation check: all behaviours');
  lines.push('');
  lines.push(
    '| Behaviour | Rebuild tries | Mistakes shown | False alarms (of situations) | Why the false alarms |'
  );
  lines.push('|---|---|---|---|---|');
  for (const r of receipts) {
    const why =
      r.falseAlarms.divergentSituations === 0
        ? 'none'
        : (Object.entries(r.falseAlarms.byClass) as Array<[string, number]>)
            .filter(([, n]) => n > 0)
            .map(([c, n]) => `${n} ${c}`)
            .join(', ');
    lines.push(
      `| ${r.title} | ${r.rebuild.rounds}${r.rebuild.validated ? '' : ' (never passed)'} | ` +
        `${r.catch.caught}/${r.catch.planted} (${pct(r.catch.catchRate)}) | ` +
        `${r.falseAlarms.divergentSituations}/${r.falseAlarms.situations} | ${why} |`
    );
  }
  lines.push(
    `| **Total** | | **${caught}/${planted} (${pct(planted === 0 ? 0 : caught / planted)})** | ` +
      `**${alarms}/${situations}** (${((alarms / Math.max(1, situations)) * 20).toFixed(1)} per 20 situations) | |`
  );
  lines.push('');
  lines.push(
    `Bar: at least ${pct(bar.minCatchRate)} of mistakes shown (target ${pct(bar.targetCatchRate)}), ` +
      `and a false-alarm rate a person would put up with.`
  );
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(verdict);
  lines.push('');
  return lines.join('\n');
}

// ── Slice 3 summaries ─────────────────────────────────────────────────────

/** min / max / mean of a list (all 0 for an empty list). */
export function spreadOf(values: number[]): SpreadStat {
  if (values.length === 0) return { min: 0, max: 0, mean: 0 };
  const sum = values.reduce((s, v) => s + v, 0);
  return { min: Math.min(...values), max: Math.max(...values), mean: sum / values.length };
}

function per20(alarms: number, situations: number): string {
  return ((alarms / Math.max(1, situations)) * 20).toFixed(1);
}

function whyAlarms(m: RecordingMeasurement): string {
  if (m.falseAlarms.divergentSituations === 0) return 'none';
  return (Object.entries(m.falseAlarms.byClass) as Array<[string, number]>)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${n} ${c}`)
    .join(', ');
}

/** True when a recording's false alarms are within the tolerance (scaled to its situation count). */
export function withinFalseAlarmTolerance(
  m: Pick<RecordingMeasurement, 'falseAlarms'>,
  tolerance: FalseAlarmTolerance
): boolean {
  return (
    m.falseAlarms.divergentSituations <=
    tolerance.maxPer20Situations * (m.falseAlarms.situations / 20)
  );
}

export function renderPlainSummaryV3(
  receipt: BackTranslationReceiptV3,
  tolerance: FalseAlarmTolerance
): string {
  const r = receipt;
  const lines: string[] = [];
  lines.push(`# Back-translation check: ${r.title}`);
  lines.push('');
  if (r.role === 'before-after') {
    lines.push(
      '> Before/after check only. This behaviour was already used in slice 2, so it does not count toward the slice-3 score.'
    );
    lines.push('');
  }
  lines.push('## What was checked');
  lines.push('');
  lines.push(
    `An author agent (${r.checklist.author}) wrote the program and a list of its rules in plain words. ` +
      `A second agent from a different company (${r.rebuild.provider}) rebuilt the program ` +
      `from the rules and a card of names only, ${r.recordings.length} separate times with the same inputs. ` +
      'It never saw the program. The card says, for every answer, whether it is accepted (things may change) or refused (nothing changes).'
  );
  lines.push('');
  lines.push('The rules it worked from:');
  lines.push('');
  for (const line of r.checklist.lines) lines.push(`${line.n}. ${line.text}`);
  lines.push('');
  lines.push(
    `Every rebuild was run in the same ${r.twin.situations} made-up situations (${r.twin.edgeSituations} of them pushed to the exact limits). ` +
      `${r.recordings[0]?.catch.planted ?? 0} small mistakes were planted in copies of the correct program. ` +
      'A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. ' +
      'A false alarm is a situation where the rebuild and the correct program act differently.'
  );
  for (const s of r.skippedMutants) {
    lines.push(`Left out: ${s.description}, because it ${s.why}, so no check could ever show it.`);
  }
  lines.push('');
  lines.push(
    '| Rebuild | Checker tries | Mistakes shown | False alarms (of situations) | Why the false alarms |'
  );
  lines.push('|---|---|---|---|---|');
  for (const m of r.recordings) {
    lines.push(
      `| ${m.recording} | ${m.rounds}${m.validated ? '' : ' (never passed)'} | ` +
        `${m.catch.caught}/${m.catch.planted} (${pct(m.catch.catchRate)}) | ` +
        `${m.falseAlarms.divergentSituations}/${m.falseAlarms.situations} | ${whyAlarms(m)} |`
    );
  }
  lines.push('');
  lines.push(
    `Spread across rebuilds: mistakes shown ${pct(r.spread.catchRate.min)} to ${pct(r.spread.catchRate.max)}; ` +
      `false alarms ${r.spread.falseAlarmSituations.min} to ${r.spread.falseAlarmSituations.max} of ${r.twin.situations} situations ` +
      `(tolerance: at most ${tolerance.maxPer20Situations} per 20).`
  );
  lines.push('');
  for (const m of r.recordings) {
    lines.push(`### Rebuild ${m.recording}`);
    lines.push('');
    for (const mu of m.catch.mutants) {
      lines.push(
        `- ${mu.caught ? 'SHOWN' : 'MISSED'}: ${mu.description} ` +
          `(${mu.attributableDivergentSituations} of ${mu.situations} situations)`
      );
    }
    const seen = new Set<string>();
    for (const d of m.falseAlarms.divergences) {
      const key = `${d.classification}|${d.rationale}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const count = m.falseAlarms.divergences.filter(
        (x) => x.classification === d.classification && x.rationale === d.rationale
      ).length;
      lines.push(`- false alarm (${count} situations), ${d.classification}: ${d.rationale}`);
    }
    lines.push('');
  }
  lines.push('## Verdict');
  lines.push('');
  lines.push(r.verdict);
  lines.push('');
  return lines.join('\n');
}

export function renderCombinedSummaryV3(
  receipts: BackTranslationReceiptV3[],
  bar: { minCatchRate: number; targetCatchRate: number },
  tolerance: FalseAlarmTolerance,
  verdict: string
): string {
  const measured = receipts.filter((r) => r.role === 'measured');
  const extra = receipts.filter((r) => r.role !== 'measured');
  const recordingIds = [
    ...new Set(measured.flatMap((r) => r.recordings.map((m) => m.recording))),
  ].sort();
  const lines: string[] = [];
  lines.push('# Back-translation check, slice 3: new behaviours, several rebuilds each');
  lines.push('');
  lines.push(
    'The card of names now marks every answer as accepted (things may change) or refused (nothing changes). ' +
      'Measured on behaviours that were not used to tune anything. Each behaviour was rebuilt several times from the same inputs.'
  );
  lines.push('');
  lines.push(
    '| Behaviour | Rebuild | Mistakes shown | False alarms (of situations) | Why the false alarms |'
  );
  lines.push('|---|---|---|---|---|');
  let planted = 0;
  let caught = 0;
  let situations = 0;
  let alarms = 0;
  for (const r of measured) {
    for (const m of r.recordings) {
      planted += m.catch.planted;
      caught += m.catch.caught;
      situations += m.falseAlarms.situations;
      alarms += m.falseAlarms.divergentSituations;
      lines.push(
        `| ${r.title} | ${m.recording} | ${m.catch.caught}/${m.catch.planted} (${pct(m.catch.catchRate)}) | ` +
          `${m.falseAlarms.divergentSituations}/${m.falseAlarms.situations} | ${whyAlarms(m)} |`
      );
    }
  }
  lines.push(
    `| **Total** | all | **${caught}/${planted} (${pct(planted === 0 ? 0 : caught / planted)})** | ` +
      `**${alarms}/${situations}** (${per20(alarms, situations)} per 20 situations) | |`
  );
  lines.push('');
  lines.push('## Spread across rebuilds');
  lines.push('');
  lines.push('| Rebuild | Mistakes shown (all behaviours) | False alarms per 20 situations |');
  lines.push('|---|---|---|');
  const perRecordingRates: number[] = [];
  const perRecordingAlarms: number[] = [];
  for (const id of recordingIds) {
    const ms = measured.flatMap((r) => r.recordings.filter((m) => m.recording === id));
    const p = ms.reduce((s, m) => s + m.catch.planted, 0);
    const c = ms.reduce((s, m) => s + m.catch.caught, 0);
    const sit = ms.reduce((s, m) => s + m.falseAlarms.situations, 0);
    const al = ms.reduce((s, m) => s + m.falseAlarms.divergentSituations, 0);
    perRecordingRates.push(p === 0 ? 0 : c / p);
    perRecordingAlarms.push((al / Math.max(1, sit)) * 20);
    lines.push(`| ${id} | ${c}/${p} (${pct(p === 0 ? 0 : c / p)}) | ${per20(al, sit)} |`);
  }
  const rateSpread = spreadOf(perRecordingRates);
  const alarmSpread = spreadOf(perRecordingAlarms);
  lines.push('');
  lines.push(
    `Mistakes shown ranged from ${pct(rateSpread.min)} to ${pct(rateSpread.max)} between rebuild rounds; ` +
      `false alarms from ${alarmSpread.min.toFixed(1)} to ${alarmSpread.max.toFixed(1)} per 20 situations.`
  );
  lines.push('');
  const within = measured.flatMap((r) =>
    r.recordings.filter((m) => withinFalseAlarmTolerance(m, tolerance))
  ).length;
  const total = measured.reduce((s, r) => s + r.recordings.length, 0);
  lines.push(
    `Bar: at least ${pct(bar.minCatchRate)} of mistakes shown (target ${pct(bar.targetCatchRate)}). ` +
      `False-alarm tolerance: at most ${tolerance.maxPer20Situations} per 20 situations (${tolerance.why}). ` +
      `${within} of ${total} rebuilds were within it.`
  );
  lines.push('');
  if (extra.length > 0) {
    lines.push('## Separate before/after check (not part of the score above)');
    lines.push('');
    for (const r of extra) {
      for (const m of r.recordings) {
        lines.push(
          `- ${r.title}, rebuild ${m.recording}: mistakes shown ${m.catch.caught}/${m.catch.planted}, ` +
            `false alarms ${m.falseAlarms.divergentSituations}/${m.falseAlarms.situations} (${whyAlarms(m)})`
        );
      }
    }
    lines.push('');
  }
  lines.push('## Verdict');
  lines.push('');
  lines.push(verdict);
  lines.push('');
  return lines.join('\n');
}
