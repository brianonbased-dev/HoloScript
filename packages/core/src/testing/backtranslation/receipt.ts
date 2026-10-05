/**
 * Back-translation proof — receipt helpers.
 *
 * Pure functions: callers decide where the receipt lands. The plain summary is
 * written for a reader who does not read code (founder test): what was
 * checked, what was caught, what raised a false alarm.
 */
import type { BackTranslationReceipt, BehaviourChecklist } from './types';

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
export function stableReceiptJson(receipt: BackTranslationReceipt): string {
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
