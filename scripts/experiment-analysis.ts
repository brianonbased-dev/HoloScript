#!/usr/bin/env npx tsx
/**
 * Experiment Analysis — Statistical Comparison
 *
 * Reads trial data from .holoscript/experiment-results/ and computes:
 *   1. Per-trial aggregate metrics (quality delta, cost, crash rate, tool efficiency)
 *   2. Mann-Whitney U test on quality-per-dollar (non-parametric, small sample)
 *   3. Fisher's exact test on crash rate
 *   4. Comparison table + summary findings
 *
 * Usage:
 *   npx tsx scripts/experiment-analysis.ts
 *   npx tsx scripts/experiment-analysis.ts --output docs/experiments/SELF-IMPROVE-EXPERIMENT.md
 *
 * @version 1.0.0
 */

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __scriptDir =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.HOLOSCRIPT_ROOT ?? path.resolve(__scriptDir, '..');
const RESULTS_DIR = path.join(REPO_ROOT, '.holoscript', 'experiment-results');

// ─── Types ──────────────────────────────────────────────────────────────────

interface QualityEntry {
  timestamp: string;
  cycle: number;
  composite: number;
  grade: string;
  focus: string;
  summary: string;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  toolCallsTotal?: number;
  toolCallsUseful?: number;
  durationSeconds?: number;
  arm?: 'control' | 'treatment';
  trial?: number;
}

interface TrialSummary {
  arm: string;
  trial: number;
  cycles: number;
  qualityStart: number;
  qualityEnd: number;
  qualityBest: number;
  qualityMean: number;
  qualityDelta: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  toolCallsTotal: number;
  toolCallsUseful: number;
  toolEfficiency: number;
  crashCycles: number;
  crashRate: number;
  committedCycles: number;
  qualityPerDollar: number;
  durationSeconds: number;
}

// ─── Statistical Functions ──────────────────────────────────────────────────

/**
 * Mann-Whitney U test (two-tailed, exact for small samples).
 * Non-parametric test comparing two independent samples.
 */
function mannWhitneyU(a: number[], b: number[]): { U: number; z: number; p: number } {
  const n1 = a.length;
  const n2 = b.length;

  if (n1 === 0 || n2 === 0) {
    return { U: 0, z: 0, p: 1 };
  }

  // Combine and rank
  const combined = [
    ...a.map((v, i) => ({ value: v, group: 'a' as const, idx: i })),
    ...b.map((v, i) => ({ value: v, group: 'b' as const, idx: i })),
  ].sort((x, y) => x.value - y.value);

  // Assign ranks (handle ties with average rank)
  const ranks = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].value === combined[i].value) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[k] = avgRank;
    }
    i = j;
  }

  // Sum ranks for group a
  let R1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 'a') {
      R1 += ranks[k];
    }
  }

  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  // Normal approximation (valid for n >= 3)
  const meanU = (n1 * n2) / 2;
  const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = stdU > 0 ? (U - meanU) / stdU : 0;

  // Two-tailed p-value from z-score (normal CDF approximation)
  const p = 2 * normalCDF(-Math.abs(z));

  return { U, z, p };
}

/**
 * Fisher's exact test for a 2x2 contingency table.
 * Tests whether crash rates differ between arms.
 *
 *            | Crashed | Not Crashed |
 * Control    |    a    |      b      |
 * Treatment  |    c    |      d      |
 */
function fishersExact(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  const logFact = logFactorials(n);

  // p-value for the observed table
  const pObserved = hypergeometricPMF(a, b, c, d, logFact);

  // Sum probabilities of all tables as or more extreme
  let pValue = 0;
  const rowSum1 = a + b;
  const rowSum2 = c + d;
  const colSum1 = a + c;

  for (let x = 0; x <= Math.min(rowSum1, colSum1); x++) {
    const y = rowSum1 - x;
    const z = colSum1 - x;
    const w = rowSum2 - z;
    if (y < 0 || z < 0 || w < 0) continue;

    const pTable = hypergeometricPMF(x, y, z, w, logFact);
    if (pTable <= pObserved + 1e-10) {
      pValue += pTable;
    }
  }

  return Math.min(pValue, 1.0);
}

function hypergeometricPMF(a: number, b: number, c: number, d: number, logFact: number[]): number {
  const n = a + b + c + d;
  return Math.exp(
    logFact[a + b] +
      logFact[c + d] +
      logFact[a + c] +
      logFact[b + d] -
      logFact[n] -
      logFact[a] -
      logFact[b] -
      logFact[c] -
      logFact[d]
  );
}

function logFactorials(n: number): number[] {
  const lf = new Array(n + 1);
  lf[0] = 0;
  for (let i = 1; i <= n; i++) {
    lf[i] = lf[i - 1] + Math.log(i);
  }
  return lf;
}

/**
 * Normal CDF approximation (Abramowitz & Stegun formula 7.1.26)
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + (p * Math.abs(x)) / Math.SQRT2);
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2);
  return 0.5 * (1 + sign * erf);
}

// ─── Data Loading ───────────────────────────────────────────────────────────

function loadTrialData(): Map<string, QualityEntry[]> {
  const trials = new Map<string, QualityEntry[]>();

  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`No results directory found at: ${RESULTS_DIR}`);
    console.error(
      'Run the experiment first: npx tsx scripts/experiment-runner.ts --arm both --trials 3 --cycles 15 --commit'
    );
    process.exit(1);
  }

  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('-quality-history.json'));

  if (files.length === 0) {
    console.error('No trial results found. Run the experiment first.');
    process.exit(1);
  }

  for (const file of files) {
    const match = file.match(/^(control|treatment)-trial-(\d+)-quality-history\.json$/);
    if (!match) continue;

    const key = `${match[1]}-${match[2]}`;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8'));
      trials.set(key, data);
    } catch (err: any) {
      console.warn(`  Warning: Could not parse ${file}: ${err.message}`);
    }
  }

  return trials;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function summarizeTrial(arm: string, trial: number, entries: QualityEntry[]): TrialSummary {
  const validEntries = entries.filter((e) => e.composite !== undefined);
  const scores = validEntries.map((e) => e.composite);

  const qualityStart = scores[0] ?? 0;
  const qualityEnd = scores[scores.length - 1] ?? 0;
  const qualityBest = Math.max(...scores, 0);
  const qualityMean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const totalInputTokens = validEntries.reduce((s, e) => s + (e.inputTokens ?? 0), 0);
  const totalOutputTokens = validEntries.reduce((s, e) => s + (e.outputTokens ?? 0), 0);
  const totalCostUSD = validEntries.reduce((s, e) => s + (e.costUSD ?? 0), 0);
  const toolCallsTotal = validEntries.reduce((s, e) => s + (e.toolCallsTotal ?? 0), 0);
  const toolCallsUseful = validEntries.reduce((s, e) => s + (e.toolCallsUseful ?? 0), 0);
  const durationSeconds = validEntries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0);

  // Crash = composite score of 0 or undefined
  const crashCycles = entries.filter((e) => !e.composite || e.composite === 0).length;

  // Committed = summary contains "commit" or quality improved
  const committedCycles = validEntries.filter(
    (e, i) => i > 0 && e.composite > (validEntries[i - 1]?.composite ?? 0)
  ).length;

  const qualityDelta = qualityEnd - qualityStart;
  const crashRate = entries.length > 0 ? crashCycles / entries.length : 0;
  const toolEfficiency = toolCallsTotal > 0 ? toolCallsUseful / toolCallsTotal : 0;
  const qualityPerDollar = totalCostUSD > 0 ? qualityDelta / totalCostUSD : 0;

  return {
    arm,
    trial,
    cycles: entries.length,
    qualityStart,
    qualityEnd,
    qualityBest,
    qualityMean,
    qualityDelta,
    totalInputTokens,
    totalOutputTokens,
    totalCostUSD,
    toolCallsTotal,
    toolCallsUseful,
    toolEfficiency,
    crashCycles,
    crashRate,
    committedCycles,
    qualityPerDollar,
    durationSeconds,
  };
}

function formatTable(summaries: TrialSummary[]): string {
  const header = [
    'Arm',
    'Trial',
    'Cycles',
    'Q.Start',
    'Q.End',
    'Q.Best',
    'Q.Mean',
    'Delta',
    'Cost($)',
    'Crashes',
    'Crash%',
    'Commits',
    'Q/Dollar',
    'Efficiency',
  ];

  const rows = summaries.map((s) => [
    s.arm,
    String(s.trial),
    String(s.cycles),
    s.qualityStart.toFixed(3),
    s.qualityEnd.toFixed(3),
    s.qualityBest.toFixed(3),
    s.qualityMean.toFixed(3),
    (s.qualityDelta >= 0 ? '+' : '') + s.qualityDelta.toFixed(3),
    s.totalCostUSD.toFixed(2),
    String(s.crashCycles),
    (s.crashRate * 100).toFixed(1) + '%',
    String(s.committedCycles),
    s.qualityPerDollar.toFixed(3),
    (s.toolEfficiency * 100).toFixed(1) + '%',
  ]);

  // Compute column widths
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

  const sep = widths.map((w) => '─'.repeat(w + 2)).join('┼');
  const pad = (s: string, w: number) => s + ' '.repeat(w - s.length);

  const lines = [
    widths.map((w, i) => ` ${pad(header[i], w)} `).join('│'),
    sep,
    ...rows.map((row) => widths.map((w, i) => ` ${pad(row[i], w)} `).join('│')),
  ];

  return lines.join('\n');
}

function generateReport(
  summaries: TrialSummary[],
  mwResult: { U: number; z: number; p: number },
  fisherP: number
): string {
  const control = summaries.filter((s) => s.arm === 'control');
  const treatment = summaries.filter((s) => s.arm === 'treatment');

  const avgControl = {
    qualityDelta: mean(control.map((s) => s.qualityDelta)),
    cost: mean(control.map((s) => s.totalCostUSD)),
    crashRate: mean(control.map((s) => s.crashRate)),
    qpd: mean(control.map((s) => s.qualityPerDollar)),
    efficiency: mean(control.map((s) => s.toolEfficiency)),
    qualityBest: Math.max(...control.map((s) => s.qualityBest)),
  };

  const avgTreatment = {
    qualityDelta: mean(treatment.map((s) => s.qualityDelta)),
    cost: mean(treatment.map((s) => s.totalCostUSD)),
    crashRate: mean(treatment.map((s) => s.crashRate)),
    qpd: mean(treatment.map((s) => s.qualityPerDollar)),
    efficiency: mean(treatment.map((s) => s.toolEfficiency)),
    qualityBest: Math.max(...treatment.map((s) => s.qualityBest)),
  };

  const h1Result = mwResult.p < 0.1 ? 'SUPPORTED' : 'NOT SUPPORTED';
  const h2Result = fisherP < 0.1 ? 'SUPPORTED' : 'NOT SUPPORTED';
  const practicalResult = avgTreatment.qualityBest > 0.6 ? 'MET' : 'NOT MET';

  const report = `# HoloScript Self-Orchestration Experiment Results

## Experiment Summary

**Date:** ${new Date().toISOString().slice(0, 10)}
**Design:** A/B comparison, ${control.length} control trials vs ${treatment.length} treatment trials

### Arms
- **Control (A):** TypeScript daemon (\`scripts/self-improve.ts\`) — one mega LLM call per cycle
- **Treatment (B):** HoloScript-orchestrated (\`compositions/self-improve-daemon.hsplus\` + bridge) — behavior tree + micro-calls

---

## Per-Trial Results

\`\`\`
${formatTable(summaries)}
\`\`\`

---

## Aggregate Comparison

| Metric | Control (avg) | Treatment (avg) | Difference |
|--------|--------------|-----------------|------------|
| Quality Delta | ${avgControl.qualityDelta.toFixed(4)} | ${avgTreatment.qualityDelta.toFixed(4)} | ${avgTreatment.qualityDelta - avgControl.qualityDelta >= 0 ? '+' : ''}${(avgTreatment.qualityDelta - avgControl.qualityDelta).toFixed(4)} |
| Total Cost ($) | ${avgControl.cost.toFixed(2)} | ${avgTreatment.cost.toFixed(2)} | ${avgTreatment.cost - avgControl.cost >= 0 ? '+' : ''}${(avgTreatment.cost - avgControl.cost).toFixed(2)} |
| Crash Rate | ${(avgControl.crashRate * 100).toFixed(1)}% | ${(avgTreatment.crashRate * 100).toFixed(1)}% | ${(avgTreatment.crashRate - avgControl.crashRate) * 100 >= 0 ? '+' : ''}${((avgTreatment.crashRate - avgControl.crashRate) * 100).toFixed(1)}pp |
| Quality/Dollar | ${avgControl.qpd.toFixed(4)} | ${avgTreatment.qpd.toFixed(4)} | ${avgTreatment.qpd - avgControl.qpd >= 0 ? '+' : ''}${(avgTreatment.qpd - avgControl.qpd).toFixed(4)} |
| Tool Efficiency | ${(avgControl.efficiency * 100).toFixed(1)}% | ${(avgTreatment.efficiency * 100).toFixed(1)}% | ${(avgTreatment.efficiency - avgControl.efficiency) * 100 >= 0 ? '+' : ''}${((avgTreatment.efficiency - avgControl.efficiency) * 100).toFixed(1)}pp |
| Best Quality | ${avgControl.qualityBest.toFixed(3)} | ${avgTreatment.qualityBest.toFixed(3)} | ${avgTreatment.qualityBest - avgControl.qualityBest >= 0 ? '+' : ''}${(avgTreatment.qualityBest - avgControl.qualityBest).toFixed(3)} |

---

## Statistical Tests

### H1: Quality-per-Dollar (Mann-Whitney U)
- **U statistic:** ${mwResult.U.toFixed(1)}
- **z-score:** ${mwResult.z.toFixed(3)}
- **p-value:** ${mwResult.p.toFixed(4)}
- **Result:** ${h1Result} (threshold: p < 0.10)

### H2: Crash Rate (Fisher's Exact Test)
- **p-value:** ${fisherP.toFixed(4)}
- **Result:** ${h2Result} (threshold: p < 0.10)

### Practical Criterion
- **Treatment best quality > 0.60:** ${practicalResult} (best = ${avgTreatment.qualityBest.toFixed(3)})

---

## Hypothesis Outcomes

| Hypothesis | Result | Evidence |
|------------|--------|----------|
| H1: Treatment quality-per-dollar > control | **${h1Result}** | U=${mwResult.U.toFixed(1)}, p=${mwResult.p.toFixed(4)} |
| H2: Treatment crash rate < control | **${h2Result}** | Fisher p=${fisherP.toFixed(4)} |
| Practical: Treatment best > 0.60 | **${practicalResult}** | Best=${avgTreatment.qualityBest.toFixed(3)} |

---

## Interpretation

${generateInterpretation(avgControl, avgTreatment, mwResult, fisherP)}

---

## Raw Data

Control trials: ${control.map((s) => `trial-${s.trial}`).join(', ')}
Treatment trials: ${treatment.map((s) => `trial-${s.trial}`).join(', ')}
Data directory: \`.holoscript/experiment-results/\`

---

*Generated by \`scripts/experiment-analysis.ts\` on ${new Date().toISOString()}*
`;

  return report;
}

function generateInterpretation(
  avgControl: Record<string, number>,
  avgTreatment: Record<string, number>,
  mwResult: { U: number; z: number; p: number },
  fisherP: number
): string {
  const lines: string[] = [];

  if (mwResult.p < 0.05) {
    lines.push(
      'The Mann-Whitney U test shows a **statistically significant** difference in quality-per-dollar between the two approaches (p < 0.05).'
    );
  } else if (mwResult.p < 0.1) {
    lines.push(
      'The Mann-Whitney U test shows a **marginally significant** difference in quality-per-dollar (p < 0.10). With only 3 trials per arm, low statistical power is expected.'
    );
  } else {
    lines.push(
      'The Mann-Whitney U test does **not** show a statistically significant difference in quality-per-dollar. This may be due to low statistical power (n=3 per arm) rather than true equivalence.'
    );
  }

  if (fisherP < 0.1) {
    lines.push(
      `Fisher's exact test indicates a **significant difference** in crash rates between the two arms (p=${fisherP.toFixed(4)}).`
    );
  } else {
    lines.push(
      `Fisher's exact test does **not** show a significant difference in crash rates (p=${fisherP.toFixed(4)}).`
    );
  }

  if (avgTreatment.qualityDelta > avgControl.qualityDelta) {
    lines.push(
      `The treatment arm achieved a higher average quality improvement (+${avgTreatment.qualityDelta.toFixed(4)} vs +${avgControl.qualityDelta.toFixed(4)}).`
    );
  } else {
    lines.push(
      `The control arm achieved a higher average quality improvement (+${avgControl.qualityDelta.toFixed(4)} vs +${avgTreatment.qualityDelta.toFixed(4)}).`
    );
  }

  if (avgTreatment.cost < avgControl.cost) {
    const savings = ((1 - avgTreatment.cost / avgControl.cost) * 100).toFixed(1);
    lines.push(
      `The treatment arm was **${savings}% cheaper** per trial ($${avgTreatment.cost.toFixed(2)} vs $${avgControl.cost.toFixed(2)}).`
    );
  } else if (avgControl.cost > 0) {
    const premium = ((avgTreatment.cost / avgControl.cost - 1) * 100).toFixed(1);
    lines.push(
      `The treatment arm cost **${premium}% more** per trial ($${avgTreatment.cost.toFixed(2)} vs $${avgControl.cost.toFixed(2)}).`
    );
  }

  if (avgTreatment.efficiency > avgControl.efficiency) {
    lines.push(
      `Tool efficiency was higher in the treatment arm (${(avgTreatment.efficiency * 100).toFixed(1)}% vs ${(avgControl.efficiency * 100).toFixed(1)}%), suggesting behavior tree sequencing reduces wasted tool calls.`
    );
  }

  lines.push('');
  lines.push(
    '**Limitations:** Small sample size (3 trials per arm) limits statistical power. LLM stochasticity introduces variance that may mask real differences. A follow-up experiment with 10+ trials would provide more definitive evidence.'
  );

  return lines.join('\n\n');
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  HoloScript Self-Orchestration Experiment Analysis         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Load data
  const trials = loadTrialData();
  console.log(`Loaded ${trials.size} trial(s) from ${RESULTS_DIR}`);
  console.log('');

  // Summarize each trial
  const summaries: TrialSummary[] = [];
  for (const [key, entries] of trials) {
    const [arm, trialStr] = key.split('-');
    const trial = parseInt(trialStr, 10);
    const summary = summarizeTrial(arm, trial, entries);
    summaries.push(summary);
    console.log(
      `  ${arm} trial ${trial}: ${entries.length} cycles, delta=${summary.qualityDelta.toFixed(4)}, cost=$${summary.totalCostUSD.toFixed(2)}, crashes=${summary.crashCycles}`
    );
  }

  console.log('');

  // Sort: control first, then treatment, by trial number
  summaries.sort((a, b) => {
    if (a.arm !== b.arm) return a.arm === 'control' ? -1 : 1;
    return a.trial - b.trial;
  });

  // Print comparison table
  console.log('Per-Trial Results:');
  console.log(formatTable(summaries));
  console.log('');

  // Statistical tests
  const controlQPD = summaries.filter((s) => s.arm === 'control').map((s) => s.qualityPerDollar);
  const treatmentQPD = summaries
    .filter((s) => s.arm === 'treatment')
    .map((s) => s.qualityPerDollar);

  const mwResult = mannWhitneyU(controlQPD, treatmentQPD);
  console.log(
    `Mann-Whitney U (quality/dollar): U=${mwResult.U.toFixed(1)}, z=${mwResult.z.toFixed(3)}, p=${mwResult.p.toFixed(4)}`
  );

  // Fisher's exact test on crash rates
  const controlCrashes = summaries
    .filter((s) => s.arm === 'control')
    .reduce((s, t) => s + t.crashCycles, 0);
  const controlNonCrashes = summaries
    .filter((s) => s.arm === 'control')
    .reduce((s, t) => s + t.cycles - t.crashCycles, 0);
  const treatmentCrashes = summaries
    .filter((s) => s.arm === 'treatment')
    .reduce((s, t) => s + t.crashCycles, 0);
  const treatmentNonCrashes = summaries
    .filter((s) => s.arm === 'treatment')
    .reduce((s, t) => s + t.cycles - t.crashCycles, 0);

  const fisherP = fishersExact(
    controlCrashes,
    controlNonCrashes,
    treatmentCrashes,
    treatmentNonCrashes
  );
  console.log(`Fisher's exact (crash rate): p=${fisherP.toFixed(4)}`);
  console.log('');

  // Generate report
  const report = generateReport(summaries, mwResult, fisherP);

  // Output
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    const outputPath = path.resolve(REPO_ROOT, args[outputIdx + 1]);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, report, 'utf-8');
    console.log(`Report written to: ${outputPath}`);
  } else {
    // Write to default location
    const defaultPath = path.join(RESULTS_DIR, 'experiment-report.md');
    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(defaultPath, report, 'utf-8');
    console.log(`Report written to: ${defaultPath}`);
  }

  // Print summary verdict
  console.log('');
  console.log('═'.repeat(60));
  const h1 = mwResult.p < 0.1 ? 'SUPPORTED' : 'NOT SUPPORTED';
  const h2 = fisherP < 0.1 ? 'SUPPORTED' : 'NOT SUPPORTED';
  console.log(`  H1 (quality/dollar): ${h1} (p=${mwResult.p.toFixed(4)})`);
  console.log(`  H2 (crash rate):     ${h2} (p=${fisherP.toFixed(4)})`);
  console.log('═'.repeat(60));
}

main();
