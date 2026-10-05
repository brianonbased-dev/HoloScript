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
  BehaviourChecklist,
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
  receipt: BackTranslationReceipt | BackTranslationReceiptV2
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
